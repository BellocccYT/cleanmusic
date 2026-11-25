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
  ];

  const LIMITS = {
    friends: 200,
    activityTtlMs: 10 * 60 * 1000,
    codeTtlMs: 24 * 60 * 60 * 1000,
    reactionTtlMs: 24 * 60 * 60 * 1000,
    openCodes: 5,
  };

  const EMOJIS = ['🔥', '❤️', '😂', '🎧', '👀'];
  const REPORT_REASONS = ['name', 'spam', 'other'];
  const FRIEND_PAGE = 'https://bellocccyt.github.io/cleanmusic/f/';

  // The published Worker (server/social, deployed 25.11.2026). A server entered in
  // the app wins over this value; the smoke test never uses it.
  const DEFAULT_SERVER = 'https://cleanmusic-social.cleanmusic.workers.dev';

  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  const FRIEND_CODE_RE = /^F1-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

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

  /** Friend code from 12 random 5-bit values (bytes are reduced mod 32). */
  function friendCodeFrom(bytes) {
    let chars = '';
    for (let index = 0; index < 12; index += 1) chars += B32[bytes[index] & 31];
    return `F1-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
  }

  /** Find a friend code in a link or chat text; typos like O/I/L are forgiven. Returns '' if none. */
  function parseFriendCode(text) {
    const match = /F1[\s-]*([0-9A-Za-z]{4})[\s-]*([0-9A-Za-z]{4})[\s-]*([0-9A-Za-z]{4})(?![0-9A-Za-z])/i.exec(
      decodeSafe(String(text || ''))
    );
    if (!match) return '';
    const fix = (part) => part.toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
    const code = `F1-${fix(match[1])}-${fix(match[2])}-${fix(match[3])}`;
    return FRIEND_CODE_RE.test(code) ? code : '';
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
    parseFriendCode,
    friendLink,
    cleanRef,
    normalizeServer,
  };
});
