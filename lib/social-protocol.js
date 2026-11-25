'use strict';

/**
 * Social wire protocol (Weg B, docs/PLAN-SOCIAL.md) – the one place where app
 * and Cloudflare Worker agree on endpoints, signed messages, proof-of-work,
 * friend codes and the shared song reference.
 *
 * Pure – no network, no crypto calls (the callers hash and sign). CommonJS
 * module and plain script (window.CMSocialProtocol). Tested in
 * test/social-protocol.test.js.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.CMSocialProtocol = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const VERSION = 'CM-SOCIAL-1';
  const HEADERS = { key: 'cm-key', time: 'cm-time', nonce: 'cm-nonce', sig: 'cm-sig' };
  const MAX_SKEW_MS = 5 * 60 * 1000;
  const BODY_MAX = 4096;

  // Every signed endpoint. Anything else is refused by the app and the server.
  const ENDPOINTS = [
    ['POST', '/v1/account'],
    ['DELETE', '/v1/account'],
    ['POST', '/v1/name'],
    ['POST', '/v1/friend-code'],
    ['POST', '/v1/friend/redeem'],
    ['POST', '/v1/friend/remove'],
    ['GET', '/v1/friends'],
    ['POST', '/v1/activity'],
    ['POST', '/v1/react'],
    ['POST', '/v1/report'],
    ['POST', '/v1/block'],
    // S2: groups (week card + shared playlist)
    ['POST', '/v1/group'],
    ['POST', '/v1/group/code'],
    ['POST', '/v1/group/join'],
    ['POST', '/v1/group/leave'],
    ['POST', '/v1/group/kick'],
    ['GET', '/v1/groups'],
    ['POST', '/v1/week'],
    ['POST', '/v1/group/track'],
    ['POST', '/v1/group/track/remove'],
    // 2.1: friend requests (accept/decline) and the opt-in "online" switch
    ['POST', '/v1/friend/accept'],
    ['POST', '/v1/friend/decline'],
    ['POST', '/v1/presence'],
    // S3: listening rooms ("Gemeinsam hören"). The live part is one signed
    // WebSocket on /v1/room/live – the app never sends it as a plain request.
    ['POST', '/v1/room'],
    ['GET', '/v1/room'],
    ['POST', '/v1/room/join'],
    ['POST', '/v1/room/leave'],
    ['POST', '/v1/room/kick'],
    ['GET', '/v1/room/live'],
  ];

  const ROOM_LIVE = '/v1/room/live';

  const LIMITS = {
    friends: 200,
    activityTtlMs: 10 * 60 * 1000,
    codeTtlMs: 24 * 60 * 60 * 1000,
    reactionTtlMs: 24 * 60 * 60 * 1000,
    openCodes: 5,
    groupsPerAccount: 10,
    groupMembers: 30,
    groupTracks: 200,
    // 2.1: friend requests wait 7 days; at most 20 open per direction.
    requestTtlMs: 7 * 24 * 60 * 60 * 1000,
    openRequests: 20,
    // 2.1: "online" = a signed request in the last 6 minutes (only with the switch on).
    onlineTtlMs: 6 * 60 * 1000,
    roomMembers: 20,
    roomNoHostMs: 30 * 60 * 1000, // a room without its host dies after 30 minutes
    roomAwayMs: 30 * 60 * 1000, // a guest without connection leaves after 30 minutes
    roomMaxMs: 24 * 60 * 60 * 1000,
    roomMessageMax: 1024,
  };

  // Messages a room member may send over the WebSocket (plain "ping" aside).
  const ROOM_MESSAGES = ['state', 'react', 'time'];

  const EMOJIS = ['🔥', '❤️', '😂', '🎧', '👀'];
  const REPORT_REASONS = ['name', 'spam', 'other'];
  const FRIEND_PAGE = 'https://bellocccyt.github.io/cleanmusic/f/';

  // The published Worker (server/social, deployed 25.11.2026). A server entered in
  // the app wins over this value; the smoke test never uses it.
  const DEFAULT_SERVER = 'https://cleanmusic-social.cleanmusic.workers.dev';

  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const FRIEND_CODE_RE = /^F1-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
  const GROUP_CODE_RE = /^G1-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
  const ROOM_CODE_RE = /^R1-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

  function isEndpoint(method, path) {
    return ENDPOINTS.some(([m, p]) => m === method && p === path);
  }

  function toBase64Url(bytes) {
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    const value = String(text || '');
    if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error('base64url erwartet');
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  /** The text that is signed: version, method, path, time, nonce and SHA-256 of the body. */
  function canonical(method, path, time, nonce, bodyHash) {
    return [VERSION, String(method).toUpperCase(), path, String(time), nonce, bodyHash].join('\n');
  }

  function validPublicKey(text) {
    return /^[A-Za-z0-9_-]{87}$/.test(String(text || '')) && String(text).startsWith('B');
  }

  function validNonce(text) {
    return /^[A-Za-z0-9_-]{16,64}$/.test(String(text || ''));
  }

  function validSignature(text) {
    return /^[A-Za-z0-9_-]{86}$/.test(String(text || ''));
  }

  function timeOk(time, now) {
    const value = Number(time);
    return Number.isSafeInteger(value) && Math.abs(now - value) <= MAX_SKEW_MS;
  }

  /** UTC day for the proof-of-work stamp. */
  function powDay(now) {
    return new Date(now).toISOString().slice(0, 10);
  }

  function powInput(id, day, counter) {
    return `CM-POW-1|${id}|${day}|${counter}`;
  }

  function powDayOk(day, now) {
    return day === powDay(now) || day === powDay(now - 24 * 60 * 60 * 1000);
  }

  function leadingZeroBits(bytes) {
    let bits = 0;
    for (let index = 0; index < bytes.length; index += 1) {
      const byte = bytes[index];
      if (byte === 0) {
        bits += 8;
        continue;
      }
      return bits + Math.clz32(byte) - 24;
    }
    return bits;
  }

  function codeFrom(prefix, bytes) {
    let chars = '';
    for (let index = 0; index < 12; index += 1) chars += B32[bytes[index] & 31];
    return `${prefix}-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
  }

  /** Friend code from 12 random 5-bit values (bytes are reduced mod 32). */
  function friendCodeFrom(bytes) {
    return codeFrom('F1', bytes);
  }

  /** Group invite code (S2) – same alphabet, prefix G1. */
  function groupCodeFrom(bytes) {
    return codeFrom('G1', bytes);
  }

  /** Listening-room code (S3) – same alphabet, prefix R1. */
  function roomCodeFrom(bytes) {
    return codeFrom('R1', bytes);
  }

  const CODE_PARTS = /([FGR])1[\s-]*([0-9A-Za-z]{4})[\s-]*([0-9A-Za-z]{4})[\s-]*([0-9A-Za-z]{4})(?![0-9A-Za-z])/gi;

  function parseCode(prefix, pattern, text) {
    const fix = (part) => part.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
    for (const match of decodeSafe(String(text || '')).matchAll(CODE_PARTS)) {
      if (match[1].toUpperCase() !== prefix[0]) continue;
      const code = `${prefix}-${fix(match[2])}-${fix(match[3])}-${fix(match[4])}`;
      return pattern.test(code) ? code : '';
    }
    return '';
  }

  /** Find a friend code in a link or chat text; typos like O/I/L are forgiven. Returns '' if none. */
  function parseFriendCode(text) {
    return parseCode('F1', FRIEND_CODE_RE, text);
  }

  function parseGroupCode(text) {
    return parseCode('G1', GROUP_CODE_RE, text);
  }

  function parseRoomCode(text) {
    return parseCode('R1', ROOM_CODE_RE, text);
  }

  /** ISO week ("2026-W48") of a time, computed in UTC. */
  function isoWeek(ms) {
    const source = new Date(ms);
    const date = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const year = date.getUTCFullYear();
    const week = Math.ceil(((date - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
    return `${year}-W${String(week).padStart(2, '0')}`;
  }

  /** Accept this or last week (± one day for time zones). */
  function weekOk(week, now) {
    const day = 24 * 60 * 60 * 1000;
    return [now - 8 * day, now - day, now, now + day].map(isoWeek).includes(String(week));
  }

  /** A week card for the group ranking: listening time, plays, top 3 artists – nothing else. */
  function cleanWeek(card) {
    if (!card || typeof card !== 'object' || !/^\d{4}-W\d{2}$/.test(String(card.week || ''))) return null;
    const int = (value, max) => Math.max(0, Math.min(max, Math.round(Number(value) || 0)));
    return {
      week: String(card.week),
      secs: int(card.secs, 7 * 24 * 3600),
      plays: int(card.plays, 100000),
      artists: (Array.isArray(card.artists) ? card.artists : []).map((name) => clean(name, 60)).filter(Boolean).slice(0, 3),
    };
  }

  function decodeSafe(text) {
    try {
      return decodeURIComponent(text);
    } catch {
      return text;
    }
  }

  function friendLink(code) {
    return `${FRIEND_PAGE}#${code}`;
  }

  function clean(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  /** A song reference as in CMShare.refOf – never local files or radio. Returns the cleaned ref or null. */
  function cleanRef(ref) {
    if (!ref || typeof ref !== 'object') return null;
    const src = String(ref.src || '');
    const id = String(ref.id == null ? '' : ref.id);
    const out = { src, id, title: clean(ref.title, 80), artist: clean(ref.artist, 80) };
    if (!['deezer', 'apple', 'youtube', 'search'].includes(src)) return null;
    if ((src === 'deezer' || src === 'apple') && !/^\d{1,20}$/.test(id)) return null;
    if (src === 'youtube' && !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    if (src === 'search') out.id = '';
    if (!out.title) return null;
    return out;
  }

  /**
   * What the host of a listening room shares: the song reference, where it is
   * (seconds) at time `at` (server clock), playing or paused, and whether it is
   * a full title (positions only match between full titles or the same preview).
   * Never audio, never local files or radio (ref is null then). The host's
   * `at` is accepted within ±10 s of the server clock, otherwise the server
   * time counts.
   */
  function cleanRoomState(input, now) {
    if (!input || typeof input !== 'object') return null;
    const ref = input.ref == null ? null : cleanRef(input.ref);
    if (input.ref != null && !ref) return null;
    const pos = Number(input.pos);
    const at = Number(input.at);
    return {
      ref,
      pos: Number.isFinite(pos) ? Math.round(Math.max(0, Math.min(86400, pos)) * 1000) / 1000 : 0,
      at: Number.isFinite(at) && Math.abs(at - now) <= 10000 ? Math.round(at) : now,
      playing: Boolean(ref) && input.playing === true,
      full: input.full === true,
    };
  }

  /**
   * Clock offset to the server from time pings: samples of { c: sent, s: server
   * time, r: received } (client clock). The sample with the shortest round trip
   * wins; skew = server − client in ms.
   */
  function skewFromSamples(samples) {
    const usable = (Array.isArray(samples) ? samples : []).filter(
      (sample) => sample && [sample.c, sample.s, sample.r].every(Number.isFinite) && sample.r >= sample.c && sample.r - sample.c < 10000
    );
    if (!usable.length) return null;
    const best = usable.reduce((a, b) => (b.r - b.c < a.r - a.c ? b : a));
    return { skew: Math.round(best.s - (best.c + best.r) / 2), rtt: best.r - best.c };
  }

  /** wss://host/v1/room/live for an https server, ws:// for a local test server. */
  function roomSocketUrl(origin) {
    const base = normalizeServer(origin);
    if (!base) return '';
    return base.replace(/^http/, 'ws') + ROOM_LIVE;
  }

  /** Server base URL: https://host[:port] or http://127.0.0.1|localhost:port for local tests. '' if invalid. */
  function normalizeServer(text) {
    const value = String(text || '').trim();
    if (!value) return '';
    let url;
    try {
      url = new URL(value);
    } catch {
      return '';
    }
    if (url.username || url.password || url.search || url.hash) return '';
    if (url.pathname && url.pathname !== '/') return '';
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (url.protocol === 'http:' && !(local && url.port)) return '';
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (!/^[a-z0-9.-]+$/i.test(url.hostname) || !url.hostname.includes('.') && !local) return '';
    return url.origin;
  }

  return {
    VERSION,
    HEADERS,
    MAX_SKEW_MS,
    BODY_MAX,
    ENDPOINTS,
    LIMITS,
    EMOJIS,
    REPORT_REASONS,
    FRIEND_PAGE,
    DEFAULT_SERVER,
    FRIEND_CODE_RE,
    GROUP_CODE_RE,
    ROOM_CODE_RE,
    ROOM_LIVE,
    ROOM_MESSAGES,
    isEndpoint,
    toBase64Url,
    fromBase64Url,
    canonical,
    validPublicKey,
    validNonce,
    validSignature,
    timeOk,
    powDay,
    powInput,
    powDayOk,
    leadingZeroBits,
    friendCodeFrom,
    groupCodeFrom,
    parseFriendCode,
    parseGroupCode,
    roomCodeFrom,
    parseRoomCode,
    cleanRoomState,
    skewFromSamples,
    roomSocketUrl,
    isoWeek,
    weekOk,
    cleanWeek,
    friendLink,
    cleanRef,
    normalizeServer,
  };
});
