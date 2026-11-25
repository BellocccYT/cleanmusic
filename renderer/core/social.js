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

  /* --- S2: groups --------------------------------------------------------- */
  const GROUP_CODE_RE = /^G1-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
  const WEEK_GAP = 10 * 60 * 1000; // send the own week card at most every 10 minutes
  const WEEK_STEP = 60; // … and only when at least a minute of listening was added

  function parseGroupCode(text) {
    let value = String(text || '');
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    const fix = (part) => part.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
    for (const match of value.matchAll(/([FG])1[\s-]*([0-9A-Za-z]{4})[\s-]*([0-9A-Za-z]{4})[\s-]*([0-9A-Za-z]{4})(?![0-9A-Za-z])/gi)) {
      if (match[1].toUpperCase() !== 'G') continue;
      const code = `G1-${fix(match[2])}-${fix(match[3])}-${fix(match[4])}`;
      return GROUP_CODE_RE.test(code) ? code : '';
    }
    return '';
  }

  function cleanWeekCard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const int = (value, max) => Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
    return {
      secs: int(raw.secs, 7 * 24 * 3600),
      plays: int(raw.plays, 100000),
      artists: (Array.isArray(raw.artists) ? raw.artists : []).map((name) => clean(name, 60)).filter(Boolean).slice(0, 3),
    };
  }

  /** Clean GET /v1/groups for the UI; `myId` marks own rows and rights. */
  function normalizeGroups(data, myId) {
    const value = data && typeof data === 'object' ? data : {};
    const groups = (Array.isArray(value.groups) ? value.groups : [])
      .slice(0, 10)
      .map((raw) => {
        if (!raw || !ID_RE.test(String(raw.id || ''))) return null;
        const owner = String(raw.owner || '');
        const members = (Array.isArray(raw.members) ? raw.members : [])
          .slice(0, 30)
          .map((member) => {
            const base = person(member);
            if (!base) return null;
            base.week = cleanWeekCard(member.week);
            base.self = base.id === myId;
            base.owner = base.id === owner;
            return base;
          })
          .filter(Boolean);
        const tracks = (Array.isArray(raw.tracks) ? raw.tracks : [])
          .slice(0, 200)
          .map((track) => {
            const ref = track && validRef(track.ref);
            const by = track && person(track.by);
            if (!ref || !by || !Number.isSafeInteger(track.rid)) return null;
            return { rid: track.rid, ref, by, at: Number(track.at) || 0, mine: by.id === myId };
          })
          .filter(Boolean);
        return { id: String(raw.id), name: clean(raw.name, 40) || 'Gruppe', isOwner: owner === myId, members, tracks };
      })
      .filter(Boolean);
    return { week: /^\d{4}-W\d{2}$/.test(String(value.week || '')) ? String(value.week) : '', groups };
  }

  /** Week ranking with shared places; members without a card this week come last. */
  function groupRanking(members) {
    const rows = (Array.isArray(members) ? members : [])
      .map((member) => Object.assign({}, member, { secs: member.week ? member.week.secs : 0 }))
      .sort((a, b) => b.secs - a.secs || String(a.name).localeCompare(String(b.name), 'de'));
    let rank = 0;
    let previous = null;
    rows.forEach((row, index) => {
      if (row.secs !== previous) rank = index + 1;
      previous = row.secs;
      row.rank = rank;
    });
    return rows;
  }

  /** Send the own week card? Only in groups, on a new week or ≥ 1 min more, at most every 10 min. */
  function weekPlan(input) {
    const card = input.card;
    if (!input.inGroups || !card || !/^\d{4}-W\d{2}$/.test(String(card.week || ''))) return false;
    const last = input.last;
    if (!last || last.week !== card.week) return true;
    return input.now - last.at >= WEEK_GAP && card.secs - last.secs >= WEEK_STEP;
  }

  /* --- polling (release 2.0: fewer Cloudflare requests) ------------------ */
  const FRIENDS_OPEN_GAP = 30 * 1000; // friends view open: at most every 30 s
  const FRIENDS_IDLE_GAP = 3 * 60 * 1000; // otherwise: at most every 3 min
  const GROUPS_GAP = 10 * 60 * 1000; // groups: only while in a group or every 10 min

  /**
   * Pure decision for the 30 s poll timer: when to GET /v1/friends and whether
   * to also GET /v1/groups (never with a hidden window). `friendsOpen` is the
   * "Freunde" view; `lastFriends`/`lastGroups` are the last successful fetch
   * timestamps; `groupCount` is the number of groups the user is in.
   */
  function pollPlan(input) {
    const now = Number(input && input.now) || 0;
    if (input && input.hidden) return { friends: false, groups: false };
    const lastFriends = Number(input && input.lastFriends) || 0;
    const friendsOpen = Boolean(input && input.friendsOpen);
    const friends = friendsOpen
      ? now - lastFriends >= FRIENDS_OPEN_GAP
      : now - lastFriends >= FRIENDS_IDLE_GAP;
    if (!friends) return { friends: false, groups: false };
    const lastGroups = Number(input && input.lastGroups) || 0;
    const groupCount = Number(input && input.groupCount) || 0;
    const groups = groupCount > 0 || now - lastGroups >= GROUPS_GAP;
    return { friends: true, groups };
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
    GROUP_CODE_RE,
    parseGroupCode,
    normalizeGroups,
    groupRanking,
    weekPlan,
    FRIENDS_OPEN_GAP,
    FRIENDS_IDLE_GAP,
    GROUPS_GAP,
    pollPlan,
  };
})();
