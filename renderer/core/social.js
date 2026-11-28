'use strict';

/**
 * Social (Weg B) – client state without network: the local switch state,
 * the cleaned friends list from the server, "Freunde hören gerade", new
 * reactions and when to send the own activity. 2.1: friend requests,
 * the opt-in online status and when to say "<Name> ist jetzt online".
 *
 * Loaded before app.js as window.CMSocial; tested in test/social.test.js.
 * The network goes through the main process (window.cm.socialRequest), which
 * signs every request – this file never sees a key.
 */
(function () {
  // Sorting follows the interface language; German when i18n is absent (tests).
  const sortLocale = () =>
    (typeof window !== 'undefined' && window.CMI18n && window.CMI18n.locale && window.CMI18n.locale()) || 'de';

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

  /**
   * Local state in cleanmusic.social.v1 – everything that shares something is
   * off by default (Social, activity, "Mir online zeigen"). `onlineToasts`
   * only decides whether *you* get a note when friends come online.
   */
  function normalizeState(raw) {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return {
      enabled: value.enabled === true,
      showActivity: value.showActivity === true,
      showOnline: value.showOnline === true,
      onlineToasts: value.onlineToasts !== false,
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
        base.online = raw.online === true;
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
      // null = the server does not know the online switch yet (before 2.1).
      me.showOnline = typeof value.me.showOnline === 'boolean' ? value.me.showOnline : null;
    }
    const open = (list, key) =>
      (Array.isArray(list) ? list : [])
        .slice(0, 50)
        .map((raw) => {
          const who = raw && person(raw[key]);
          const expires = raw ? Number(raw.expires) || 0 : 0;
          if (!who || (expires && expires <= serverNow)) return null;
          return { [key]: who, at: Number(raw.at) || 0, expires };
        })
        .filter(Boolean)
        .sort((a, b) => b.at - a.at);
    const requests = open(value.requests, 'from');
    const sent = open(value.sent, 'to');
    const features = { requests: Array.isArray(value.requests), presence: Boolean(me && me.showOnline !== null) };
    return { me, friends, reactions, blocked, requests, sent, features, skew: serverNow - now };
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
    for (const match of value.matchAll(/([FGR])1[\s-]*([0-9A-Za-z]{4})[\s-]*([0-9A-Za-z]{4})[\s-]*([0-9A-Za-z]{4})(?![0-9A-Za-z])/gi)) {
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
      .sort((a, b) => b.secs - a.secs || String(a.name).localeCompare(String(b.name), sortLocale()));
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
  const FRIENDS_OPEN_GAP = 10 * 1000; // friends view open: at most every 10 s
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

  /* --- 2.1: friend requests, online status ------------------------------- */
  const ONLINE_NOTICE_GAP = 30 * 60 * 1000; // "ist jetzt online" at most once per friend in 30 min

  function friendStatus(friend, now, skew = 0) {
    if (friend && friend.activity && now + skew - friend.activity.at < ACTIVITY_TTL) return 'listening';
    return friend && friend.online ? 'online' : 'offline';
  }

  /** Listening first, then online, then everyone else – each group by name. */
  function sortFriends(friends, now, skew = 0) {
    const order = { listening: 0, online: 1, offline: 2 };
    return (Array.isArray(friends) ? friends : [])
      .slice()
      .sort((a, b) => order[friendStatus(a, now, skew)] - order[friendStatus(b, now, skew)] || String(a.name).localeCompare(String(b.name), sortLocale()));
  }

  /**
   * Who just came online? Only a change offline → online between two polls
   * counts (never on the first load after the start, never for a friend that
   * was not in the list before), at most once per friend in 30 minutes.
   * input: { prev: { id: bool } | null, friends, now, notified: { id: at } }
   * → { ids, seen, notified }.
   */
  function onlineNotices(input) {
    const now = Number(input && input.now) || 0;
    const prev = input && input.prev && typeof input.prev === 'object' ? input.prev : null;
    const notified = Object.assign({}, (input && input.notified) || {});
    const seen = {};
    const ids = [];
    (Array.isArray(input && input.friends) ? input.friends : []).forEach((friend) => {
      const online = Boolean(friend && friend.online);
      seen[friend.id] = online;
      if (!prev || !online || prev[friend.id] !== false) return;
      if (now - (Number(notified[friend.id]) || 0) < ONLINE_NOTICE_GAP) return;
      notified[friend.id] = now;
      ids.push(friend.id);
    });
    Object.keys(notified).forEach((id) => {
      if (now - notified[id] >= ONLINE_NOTICE_GAP) delete notified[id];
    });
    return { ids, seen, notified };
  }

  function onlineText(friends) {
    const list = Array.isArray(friends) ? friends : [];
    if (!list.length) return '';
    if (list.length === 1) return `${display(list[0])} ist jetzt online`;
    if (list.length === 2) return `${list[0].name} und ${list[1].name} sind jetzt online`;
    return `${list.length} Freunde sind jetzt online`;
  }

  /** Requests that were not there at the last poll (none on the first load). */
  function newRequests(prevIds, requests) {
    if (!Array.isArray(prevIds)) return [];
    return (Array.isArray(requests) ? requests : []).filter((request) => !prevIds.includes(request.from.id));
  }

  /** Sidebar count: open requests win over "hören gerade". */
  function navBadge(requests, listeningCount) {
    const open = Array.isArray(requests) ? requests.length : 0;
    if (open) return { text: String(open), kind: 'requests', title: `${open} offene Freundschaftsanfrage${open === 1 ? '' : 'n'}` };
    const live = Number(listeningCount) || 0;
    if (live) return { text: String(live), kind: 'live', title: `${live} Freund${live === 1 ? '' : 'e'} hören gerade` };
    return { text: '', kind: '', title: '' };
  }

  function expiresIn(expires, now) {
    const hours = Math.max(0, Math.round((expires - now) / 3600000));
    if (hours < 1) return 'läuft gleich ab';
    if (hours < 48) return `noch ${hours} Std.`;
    return `noch ${Math.round(hours / 24)} Tage`;
  }

  /* --- S3: listening rooms ("Gemeinsam hören") ---------------------------- */
  const ROOM_CODE_RE = /^R1-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
  const ROOM_MAX = 20;
  const ROOM_MAX_QUEUE = 50;
  const SEEK_COOLDOWN = 3000; // after a correction, give the player time to settle
  const SEEK_LEAD = 0.25; // a seek costs a moment – land slightly ahead
  const HOST_GAP = 400; // the host sends at most every 0.4 s …
  const HOST_HEARTBEAT = 30 * 1000; // … and while playing at least every 30 s
  const HOST_SEEK = 2; // a jump of more than 2 s is a seek

  function parseRoomCode(text) {
    let value = String(text || '');
    try {
      value = decodeURIComponent(value);
    } catch {
      /* keep raw */
    }
    const fix = (part) => part.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
    for (const match of value.matchAll(/([FGR])1[\s-]*([0-9A-Za-z]{4})[\s-]*([0-9A-Za-z]{4})[\s-]*([0-9A-Za-z]{4})(?![0-9A-Za-z])/gi)) {
      if (match[1].toUpperCase() !== 'R') continue;
      const code = `R1-${fix(match[2])}-${fix(match[3])}-${fix(match[4])}`;
      return ROOM_CODE_RE.test(code) ? code : '';
    }
    return '';
  }

  /** The shared room state { ref, pos, at, playing, full } – or null. */
  function roomState(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const ref = raw.ref == null ? null : validRef(raw.ref);
    if (raw.ref != null && !ref) return null;
    const pos = Number(raw.pos);
    return {
      ref,
      pos: Number.isFinite(pos) ? Math.max(0, Math.min(86400, pos)) : 0,
      at: Number(raw.at) || 0,
      playing: Boolean(ref) && raw.playing === true,
      full: raw.full === true,
    };
  }

  /** A clean Jam queue entry: { rid, ref, by, at } – or null. */
  function normalizeRoomQueue(raw) {
    return (Array.isArray(raw) ? raw : [])
      .slice(0, ROOM_MAX_QUEUE)
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const rid = String(row.rid || '');
        const ref = validRef(row.ref);
        const by = person(row.by);
        if (!/^[A-Za-z0-9_-]{4,24}$/.test(rid) || !ref || !by) return null;
        return { rid, ref, by, at: Number(row.at) || 0 };
      })
      .filter(Boolean);
  }

  /** Clean a room snapshot (GET /v1/room, hello) for the UI. */
  function normalizeRoom(raw, myId) {
    if (!raw || typeof raw !== 'object' || !ID_RE.test(String(raw.id || ''))) return null;
    const host = String(raw.host || '');
    const members = (Array.isArray(raw.members) ? raw.members : [])
      .slice(0, ROOM_MAX)
      .map((member) => {
        const base = person(member);
        if (!base) return null;
        base.host = base.id === host;
        base.online = member.online === true;
        base.self = base.id === myId;
        return base;
      })
      .filter(Boolean);
    return {
      id: String(raw.id),
      host,
      isHost: Boolean(myId) && host === myId,
      members,
      state: roomState(raw.state),
      jam: raw.jam === true,
      queue: normalizeRoomQueue(raw.queue),
      // Older servers send neither field – the Jam panel stays hidden there.
      supportsJam: Array.isArray(raw.queue) && typeof raw.jam === 'boolean',
    };
  }

  function roomMembers(raw, host, myId) {
    return normalizeRoom({ id: 'RRRRRRRRRRRRRRRRRRRRRRRR', host, members: raw }, myId).members;
  }

  /** Where the host is now (seconds), on the server clock `now`. */
  function expectedPosition(state, now) {
    if (!state) return 0;
    return state.playing ? state.pos + Math.max(0, now - state.at) / 1000 : state.pos;
  }

  /** Positions only match between two full titles or two previews. */
  function comparable(state, local) {
    return Boolean(state && local) && Boolean(state.full) === Boolean(local.full);
  }

  function tolerance(local) {
    return local && local.full ? 1 : 2;
  }

  /**
   * Guest: what to do so the own player follows the host. input: { state,
   * now (server clock, ms), clock (local ms), lastSeekAt (local ms), local:
   * { key, position, playing, full, duration, ended, loading } } →
   * { action: 'none'|'load'|'play'|'pause'|'seek', position|null, reason }.
   * Full titles follow to the second; with a preview (or preview vs. full)
   * only the title and play/pause follow.
   */
  function roomSyncPlan(input) {
    const state = input && input.state;
    const local = (input && input.local) || {};
    const none = (reason) => ({ action: 'none', position: null, reason });
    if (!state) return none('kein-zustand');
    if (!state.ref) return local.playing ? { action: 'pause', position: null, reason: 'nicht-teilbar' } : none('nicht-teilbar');
    if (local.loading) return none('laedt');
    const now = Number(input.now) || 0;
    const expected = expectedPosition(state, now);
    if (local.key !== refKey(state.ref)) return { action: 'load', position: expected, reason: 'titel' };
    const same = comparable(state, local);
    const diff = same ? Number(local.position || 0) - expected : 0;
    const off = same && Math.abs(diff) > tolerance(local);
    const settled = (Number(input.clock) || 0) - (Number(input.lastSeekAt) || 0) >= SEEK_COOLDOWN;
    const duration = Number(local.duration) || 0;
    if (!state.playing) {
      if (local.playing) return { action: 'pause', position: off ? expected : null, reason: 'pause' };
      return off && settled ? { action: 'seek', position: expected, reason: 'spulen' } : none('pausiert');
    }
    if (same && duration && expected >= duration - 0.5) return none('ende');
    if (!local.playing) {
      if (local.ended && !same) return none('warten');
      return { action: 'play', position: off ? expected + SEEK_LEAD : null, reason: 'play' };
    }
    if (off && settled) return { action: 'seek', position: expected + SEEK_LEAD, reason: 'spulen' };
    return none('synchron');
  }

  /**
   * Host: send the state now? input: { key, position, playing, full, clock,
   * last: { key, pos, playing, full, at } | null } → { send, reason }.
   * Track change, play/pause, a seek (> 2 s off the prediction) and a heartbeat
   * every 30 s while playing; never more often than every 0.4 s.
   */
  function roomHostPlan(input) {
    const last = input && input.last;
    const clock = Number(input && input.clock) || 0;
    if (!last) return { send: true, reason: 'start' };
    if (clock - (Number(last.at) || 0) < HOST_GAP) return { send: false, reason: 'abstand' };
    if (String(input.key || '') !== String(last.key || '')) return { send: true, reason: 'titel' };
    if (Boolean(input.playing) !== Boolean(last.playing)) return { send: true, reason: input.playing ? 'play' : 'pause' };
    if (Boolean(input.full) !== Boolean(last.full)) return { send: true, reason: 'quelle' };
    const predicted = last.playing ? last.pos + (clock - last.at) / 1000 : last.pos;
    if (Math.abs((Number(input.position) || 0) - predicted) > HOST_SEEK) return { send: true, reason: 'spulen' };
    if (input.playing && clock - last.at >= HOST_HEARTBEAT) return { send: true, reason: 'herzschlag' };
    return { send: false, reason: 'gleich' };
  }

  /**
   * Guest: did the user take over (own pause/play/seek) instead of the sync?
   * event: 'play' | 'pause' | 'seeked'; same input shape as roomSyncPlan.
   */
  function roomDeviation(event, input) {
    const state = input && input.state;
    const local = (input && input.local) || {};
    if (!state || local.loading) return false;
    if (event === 'pause') return state.playing && !local.ended;
    if (event === 'play') return !state.playing;
    if (event === 'seeked') {
      if (!comparable(state, local) || local.key !== refKey(state.ref)) return false;
      return Math.abs(Number(local.position || 0) - expectedPosition(state, Number(input.now) || 0)) > tolerance(local) + 1;
    }
    return false;
  }

  /** Local memory in cleanmusic.room.v1: the code of the room you are in (to share it again). */
  function normalizeRoomLocal(raw) {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const code = ROOM_CODE_RE.test(String(value.code || '')) ? String(value.code) : '';
    const room = ID_RE.test(String(value.room || '')) ? String(value.room) : '';
    return {
      code: code && room ? code : '',
      room: code && room ? room : '',
      at: Number.isFinite(value.at) ? value.at : 0,
      noAuto: value.noAuto === true,
      previewOnly: value.previewOnly === true,
    };
  }

  /* --- 2.1.1: cards with cover, "live" effects --------------------------- */

  /** Only plain https image URLs (no quotes, spaces or angle brackets); Apple's 100 px art → 300 px. */
  function safeImage(url) {
    const value = String(url || '').trim();
    if (value.length > 600 || !/^https:\/\/[^\s"'<>\\]+$/.test(value)) return '';
    return value.replace(/\/100x100bb\./, '/300x300bb.');
  }

  /**
   * Where a cover for a song reference comes from – without asking the social
   * server: Deezer/Apple through the catalog link lookup, YouTube as the
   * public thumbnail of the (validated) video ID, everything else through a
   * catalog search. null when there is nothing to look up.
   */
  function coverSource(ref) {
    const clean = validRef(ref);
    if (!clean) return null;
    if (clean.src === 'deezer') return { type: 'link', url: `https://www.deezer.com/track/${clean.id}` };
    if (clean.src === 'apple') return { type: 'link', url: `https://music.apple.com/song/${clean.id}` };
    if (clean.src === 'youtube') return { type: 'image', url: `https://i.ytimg.com/vi/${clean.id}/mqdefault.jpg` };
    return { type: 'search', query: `${clean.artist} ${clean.title}`.trim() };
  }

  function loose(text) {
    return String(text || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  /** From catalog search results: the artwork of a hit whose title (and artist, if known) really matches – else ''. */
  function pickCover(tracks, ref) {
    const title = loose(ref && ref.title);
    const artist = loose(ref && ref.artist);
    if (!title) return '';
    const hit = (Array.isArray(tracks) ? tracks : []).slice(0, 10).find((track) => {
      if (!track) return false;
      const name = loose(track.title);
      const by = loose(track.artist);
      const titleOk = name === title || name.startsWith(`${title} `) || title.startsWith(`${name} `);
      const artistOk = !artist || !by || by.includes(artist.split(' ')[0]) || artist.includes(by.split(' ')[0]);
      return titleOk && artistOk && safeImage(track.artwork);
    });
    return hit ? safeImage(hit.artwork) : '';
  }

  /** Short, attribute-safe id for a ref (for data-cover). */
  function coverId(ref) {
    const key = refKey(validRef(ref));
    let hash = 5381;
    for (let index = 0; index < key.length; index += 1) hash = ((hash << 5) + hash + key.charCodeAt(index)) >>> 0;
    return `c${hash.toString(36)}`;
  }

  /** A card is "new" for the fade-in when the friend or their song changed. */
  function cardKey(friend) {
    return friend && friend.activity ? `${friend.id}|${refKey(friend.activity.ref)}` : '';
  }

  /** Keys that were not there at the last drawing; null = first drawing (everything is new). */
  function freshKeys(prev, keys) {
    const list = Array.isArray(keys) ? keys : [];
    if (!prev) return list.slice();
    const seen = prev instanceof Set ? prev : new Set(prev);
    return list.filter((key) => !seen.has(key));
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
    ONLINE_NOTICE_GAP,
    friendStatus,
    sortFriends,
    onlineNotices,
    onlineText,
    newRequests,
    navBadge,
    expiresIn,
    ROOM_CODE_RE,
    ROOM_MAX,
    ROOM_MAX_QUEUE,
    parseRoomCode,
    roomState,
    normalizeRoom,
    normalizeRoomQueue,
    roomMembers,
    expectedPosition,
    roomSyncPlan,
    roomHostPlan,
    roomDeviation,
    normalizeRoomLocal,
    safeImage,
    coverSource,
    pickCover,
    coverId,
    cardKey,
    freshKeys,
  };
})();
