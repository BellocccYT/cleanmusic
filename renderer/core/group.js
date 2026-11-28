'use strict';

/**
 * Group week cards – "Wer hört diese Woche am meisten?" without a server.
 *
 * Everyone shares a short code with their own week (minutes, titles, top
 * artists) – e.g. in WhatsApp or Discord. Friends paste it into CleanMusic,
 * which ranks the cards locally. No account, no cloud, nothing leaves the
 * device unless the user copies it. The checksum only catches typos; it is
 * not a protection against editing (this is for fun, not a contest).
 *
 * Loaded before app.js as window.CMGroup; tested in test/group.test.js.
 */
(function () {
  // Sorting follows the interface language; German when i18n is absent (tests).
  const sortLocale = () =>
    (typeof window !== 'undefined' && window.CMI18n && window.CMI18n.locale && window.CMI18n.locale()) || 'de';

  const PREFIX = 'CM1';
  const NAME_MAX = 24;
  const ARTIST_MAX = 40;
  const MEMBERS_MAX = 30;
  const CODE_RE = /CM1-[A-Za-z0-9_-]{8,1200}-[0-9a-z]{1,8}(?![A-Za-z0-9_-])/;

  /** ISO week key, e.g. "2026-W48" (weeks start on Monday). */
  function weekKey(date = new Date()) {
    const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const weekday = day.getUTCDay() || 7;
    day.setUTCDate(day.getUTCDate() + 4 - weekday);
    const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((day - yearStart) / 86400000 + 1) / 7);
    return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  function cleanName(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f<>]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function checksum(text) {
    let hash = 5381;
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash * 33) ^ text.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
  }

  function toBase64Url(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new TextDecoder().decode(bytes);
  }

  function count(value, max) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? Math.min(max, number) : 0;
  }

  /** A clean card from loose input. */
  function normalizeCard(input) {
    const raw = input && typeof input === 'object' ? input : {};
    const week = /^\d{4}-W\d{2}$/.test(String(raw.week || '')) ? String(raw.week) : '';
    return {
      name: cleanName(raw.name, NAME_MAX),
      week,
      secs: count(raw.secs, 7 * 24 * 3600),
      plays: count(raw.plays, 100000),
      artists: (Array.isArray(raw.artists) ? raw.artists : [])
        .map((artist) => cleanName(artist, ARTIST_MAX))
        .filter(Boolean)
        .slice(0, 3),
      at: count(raw.at, 8.64e15),
    };
  }

  /** The shareable code for a card. */
  function encode(card) {
    const clean = normalizeCard(card);
    if (!clean.name || !clean.week) throw new Error('Name und Woche fehlen');
    const body = toBase64Url(JSON.stringify({ n: clean.name, w: clean.week, s: clean.secs, p: clean.plays, a: clean.artists, t: clean.at }));
    return `${PREFIX}-${body}-${checksum(body)}`;
  }

  /** Read a code (also when it is embedded in a longer chat message). */
  function decode(text) {
    const match = String(text || '').match(CODE_RE);
    if (!match) return { error: 'Kein CleanMusic-Wochencode gefunden.' };
    // The body is base64url and may contain "-" itself; the checksum never does.
    const code = match[0];
    const cut = code.lastIndexOf('-');
    const body = code.slice(PREFIX.length + 1, cut);
    const sum = code.slice(cut + 1);
    if (checksum(body) !== sum) return { error: 'Der Code ist unvollständig oder vertippt.' };
    try {
      const data = JSON.parse(fromBase64Url(body));
      const card = normalizeCard({ name: data.n, week: data.w, secs: data.s, plays: data.p, artists: data.a, at: data.t });
      if (!card.name || !card.week) return { error: 'Der Code enthält keine gültige Wochenkarte.' };
      return { card };
    } catch {
      return { error: 'Der Code ist beschädigt.' };
    }
  }

  function memberKey(name) {
    return cleanName(name, NAME_MAX).toLocaleLowerCase('de-DE');
  }

  /** Add or update a member card. Newer cards win; at most MEMBERS_MAX people. */
  function addMember(group, card) {
    const out = normalizeGroup(group);
    const clean = normalizeCard(card);
    const key = memberKey(clean.name);
    if (!key || !clean.week) return { group: out, added: false };
    const existing = out.members[key];
    if (existing && (existing.week > clean.week || (existing.week === clean.week && existing.at > clean.at))) {
      return { group: out, added: false, older: true };
    }
    out.members[key] = clean;
    const keys = Object.keys(out.members);
    if (keys.length > MEMBERS_MAX) {
      keys
        .sort((a, b) => (out.members[a].week + out.members[a].at).localeCompare(out.members[b].week + out.members[b].at))
        .slice(0, keys.length - MEMBERS_MAX)
        .forEach((old) => delete out.members[old]);
    }
    return { group: out, added: true, updated: Boolean(existing) };
  }

  function normalizeGroup(raw) {
    const input = raw && typeof raw === 'object' ? raw : {};
    const members = {};
    if (input.members && typeof input.members === 'object') {
      Object.values(input.members).forEach((card) => {
        const clean = normalizeCard(card);
        const key = memberKey(clean.name);
        if (key && clean.week) members[key] = clean;
      });
    }
    return { name: cleanName(input.name, NAME_MAX), members };
  }

  /**
   * Ranking for one week: own card plus members (without the own name twice).
   * Returns rows { rank, name, secs, plays, artists, self }.
   */
  function ranking(group, ownCard, week) {
    const clean = normalizeGroup(group);
    const rows = Object.values(clean.members).filter((card) => card.week === week);
    const own = ownCard ? normalizeCard(ownCard) : null;
    const ownKey = own ? memberKey(own.name) : '';
    const list = rows
      .filter((card) => !ownKey || memberKey(card.name) !== ownKey)
      .map((card) => Object.assign({}, card, { self: false }));
    if (own && own.week === week) list.push(Object.assign({}, own, { self: true }));
    list.sort((a, b) => b.secs - a.secs || b.plays - a.plays || a.name.localeCompare(b.name, sortLocale()));
    let rank = 0;
    let previous = null;
    return list.map((row, index) => {
      if (!previous || previous.secs !== row.secs || previous.plays !== row.plays) rank = index + 1;
      previous = row;
      return Object.assign(row, { rank });
    });
  }

  window.CMGroup = {
    PREFIX,
    NAME_MAX,
    MEMBERS_MAX,
    weekKey,
    normalizeCard,
    normalizeGroup,
    encode,
    decode,
    addMember,
    ranking,
    memberKey,
  };
})();
