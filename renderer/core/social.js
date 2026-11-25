'use strict';

/**
 * Social (Weg B) – client state without network: the local switch state,
 * the cleaned friends list from the server, "Freunde hören gerade", new
 * reactions and when to send the own activity.
 *
 * Loaded before app.js as window.CMSocial; tested in test/social.test.js.
 * The network goes through the main process (window.cm.socialRequest), which
 * signs every request – this file never sees a key.
 */
(function () {
  const EMOJIS = ['🔥', '❤️', '😂', '🎧', '👀'];
  const REPORT_REASONS = [
    { id: 'name', label: 'Anstößiger Name' },
    { id: 'spam', label: 'Spam oder Belästigung' },
    { id: 'other', label: 'Etwas anderes' },
  ];
  const ACTIVITY_TTL = 10 * 60 * 1000;
  const MIN_GAP = 15 * 1000; // server: one activity per 15 s
  const HEARTBEAT = 5 * 60 * 1000; // keep a long song visible (< 10 min TTL)
  const FRIEND_PAGE = 'https://bellocccyt.github.io/cleanmusic/f/';
  const CODE_RE = /^F1-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
  const ID_RE = /^[0-9A-HJKMNP-TV-Z]{24}$/;

  function clean(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  /** Local state in cleanmusic.social.v1 – both switches are off by default. */
  function normalizeState(raw) {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      enabled: value.enabled === true,
      showActivity: value.showActivity === true,
      seenReactions: Number.isFinite(value.seenReactions) ? value.seenReactions : 0,
    };
  }

  function validRef(ref) {
    if (!ref || typeof ref !== 'object') return null;
    const src = String(ref.src || '');
    const id = String(ref.id == null ? '' : ref.id);
    if (!['deezer', 'apple', 'youtube', 'search'].includes(src)) return null;
    if ((src === 'deezer' || src === 'apple') && !/^\d{1,20}$/.test(id)) return null;
    if (src === 'youtube' && !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    const title = clean(ref.title, 80);
    if (!title) return null;
    return { src, id: src === 'search' ? '' : id, title, artist: clean(ref.artist, 80) };
  }

  function person(raw) {
    if (!raw || !ID_RE.test(String(raw.id || ''))) return null;
    const id = String(raw.id);
    return { id, tag: id.slice(0, 4), name: clean(raw.name, 40) || 'Unbekannt' };
  }

  /** Clean the GET /v1/friends payload (the server is trusted, but not blindly). */
  function normalizeFriends(data, now) {
    const value = data && typeof data === 'object' ? data : {};
    const serverNow = Number(value.now) || now;
    const friends = (Array.isArray(value.friends) ? value.friends : [])
      .slice(0, 200)
      .map((raw) => {
        const base = person(raw);
        if (!base) return null;
        const act = raw.activity && typeof raw.activity === 'object' ? raw.activity : null;
        const ref = act ? validRef(act.ref) : null;
        const at = act ? Number(act.at) || 0 : 0;
        base.activity = ref && serverNow - at < ACTIVITY_TTL ? { ref, playing: act.playing !== false, at } : null;
        return base;
      })
      .filter(Boolean);
    const reactions = (Array.isArray(value.reactions) ? value.reactions : [])
      .slice(0, 50)
      .map((raw) => {
        const from = raw && person(raw.from);
        if (!from || !EMOJIS.includes(raw.emoji)) return null;
        return { from, emoji: raw.emoji, title: clean(raw.title, 80), at: Number(raw.at) || 0 };
      })
      .filter(Boolean)
      .sort((a, b) => b.at - a.at);
    const blocked = (Array.isArray(value.blocked) ? value.blocked : []).map(person).filter(Boolean);
    const me = person(value.me);
    if (me) {
      me.random = Boolean(value.me.random);
      me.nameChangeAt = Number(value.me.nameChangeAt) || 0;
    }
    return { me, friends, reactions, blocked, skew: serverNow - now };
  }

  /** Friends with a fresh song, newest first. */
  function listening(friends, now, skew = 0) {
    return (Array.isArray(friends) ? friends : [])
      .filter((friend) => friend.activity && now + skew - friend.activity.at < ACTIVITY_TTL)
      .sort((a, b) => b.activity.at - a.activity.at);
  }

  function newReactions(reactions, since) {
    return (Array.isArray(reactions) ? reactions : []).filter((reaction) => reaction.at > since);
  }

  function refKey(ref) {
    return ref ? `${ref.src}:${ref.id}:${ref.title.toLowerCase()}` : '';
  }

  /**
   * What to send for the own activity. input: { enabled, show, playing, ref,
   * last: { key, at, cleared } | null, now } → { action: 'none'|'post'|'clear', key }.
   * Nothing is sent unless both switches are on; local files and radio have no ref.
   */
  function activityPlan(input) {
    const last = input.last || null;
    const posted = last && !last.cleared && last.key;
    if (!input.enabled || !input.show || !input.ref) {
      return { action: posted ? 'clear' : 'none', key: '' };
    }
    if (!input.playing) return { action: 'none', key: posted ? last.key : '' };
    const key = refKey(input.ref);
    const since = last ? input.now - (last.at || 0) : Infinity;
    if (since < MIN_GAP) return { action: 'none', key };
    if (!posted || last.key !== key || since >= HEARTBEAT) return { action: 'post', key };
    return { action: 'none', key };
  }

  function display(entry) {
    return entry ? `${entry.name} · ${entry.tag}` : '';
  }

  function ago(at, now) {
    const minutes = Math.max(0, Math.round((now - at) / 60000));
    if (minutes < 1) return 'gerade eben';
    if (minutes < 60) return `vor ${minutes} Min.`;
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `vor ${hours} Std.` : `vor ${Math.round(hours / 24)} T.`;
  }

  /** Friend code from a link or chat text (O/I/L typos forgiven), '' if none. */
  function parseFriendCode(text) {
    let value = String(text || '');
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    const match = /F1[\s-]*([0-9A-Za-z]{4})[\s-]*([0-9A-Za-z]{4})[\s-]*([0-9A-Za-z]{4})(?![0-9A-Za-z])/i.exec(value);
    if (!match) return '';
    const fix = (part) => part.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
    const code = `F1-${fix(match[1])}-${fix(match[2])}-${fix(match[3])}`;
    return CODE_RE.test(code) ? code : '';
  }

  function friendLink(code) {
    return `${FRIEND_PAGE}#${code}`;
  }

  window.CMSocial = {
    EMOJIS,
    REPORT_REASONS,
    ACTIVITY_TTL,
    CODE_RE,
    normalizeState,
    normalizeFriends,
    validRef,
    listening,
    newReactions,
    activityPlan,
    refKey,
    display,
    ago,
    parseFriendCode,
    friendLink,
  };
})();
