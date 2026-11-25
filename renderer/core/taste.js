'use strict';

/**
 * Taste profile (2.0, Phase 1) – window.CMTaste.
 *
 * The local "more of this / less of this" profile plus the softer signals
 * (favourites, plays, early skips). Everything stays on the device. This module
 * holds the rules; app.js owns the state object, the toasts and the re-renders.
 *
 * A taste object looks like:
 *   { tracks: { [key]: { value, at, n, a, dz } },
 *     artists: { [key]: { value, at, n, dz } },
 *     skips: [{ a, t, n, dz, at }],
 *     revision }
 *
 * Keys use CMText (`matchKey` for titles, `normKey(primaryArtist(...))` for
 * artists), so the same normalisation as search and dedup applies.
 *
 * Loaded before app.js, tested in test/taste.test.js.
 */
(function () {
  const DAY = 24 * 60 * 60 * 1000;
  const SKIP_DAYS = 45;
  const SKIP_DECAY_DAYS = 30;
  const SKIP_MAX = 300;
  const MAP_KEEP = 600;
  const TRACK_WEIGHT = { good: 3.2, bad: -4.4 };
  const ARTIST_WEIGHT = { good: 2.4, bad: -3.4 };

  function text() {
    return window.CMText || null;
  }

  function artistKey(value) {
    const t = text();
    if (!t) return '';
    return t.normKey(t.primaryArtist(value));
  }

  function trackKey(entry) {
    const t = text();
    return entry && t ? t.matchKey(entry) : '';
  }

  function trackValue(taste, entry) {
    const key = trackKey(entry);
    const row = key && taste ? taste.tracks[key] : null;
    return row ? Number(row.value) || 0 : 0;
  }

  function artistValue(taste, entry) {
    const key = artistKey(entry && entry.artist);
    const row = key && taste ? taste.artists[key] : null;
    return row ? Number(row.value) || 0 : 0;
  }

  // Skips fade out: half a point per artist skip, a third per title skip, each
  // decaying over 30 days, capped at 2.6.
  function skipPenalty(taste, entry, now) {
    const at = Number(now) || Date.now();
    const artist = artistKey(entry && entry.artist);
    const track = trackKey(entry);
    if (!artist && !track) return 0;
    let penalty = 0;
    (taste && Array.isArray(taste.skips) ? taste.skips : []).forEach((row) => {
      const age = (at - (Number(row.at) || 0)) / DAY;
      if (age > SKIP_DAYS) return;
      const decay = Math.exp(-age / SKIP_DECAY_DAYS);
      if (artist && row.a === artist) penalty += 0.5 * decay;
      else if (track && row.t === track) penalty += 0.3 * decay;
    });
    return Math.min(2.6, penalty);
  }

  /**
   * How much the profile likes a title, roughly −8 … 8.
   * `options` = { favoriteIds: Set, history: rows, now }.
   */
  function score(taste, entry, options = {}) {
    if (!entry || entry.kind === 'radio') return 0;
    const now = Number(options.now) || Date.now();
    let value = 0;

    const track = trackValue(taste, entry);
    if (track > 0) value += TRACK_WEIGHT.good;
    else if (track < 0) value += TRACK_WEIGHT.bad;

    const artist = artistValue(taste, entry);
    if (artist > 0) value += ARTIST_WEIGHT.good;
    else if (artist < 0) value += ARTIST_WEIGHT.bad;

    if (options.favoriteIds && options.favoriteIds.has(entry.id)) value += 1.2;

    const played = (Array.isArray(options.history) ? options.history : []).find(
      (row) => row && row.entry && row.entry.id === entry.id
    );
    if (played) {
      const age = (now - played.last) / DAY;
      value += Math.min(2.2, (Number(played.plays) || 0) * 0.4) * Math.exp(-age / 120);
    }

    value -= skipPenalty(taste, entry, now);
    return Math.max(-8, Math.min(8, value));
  }

  /**
   * One map of artist seeds for recommendations: explicit taste first, then
   * favourites, plays, playlist titles and skips.
   * `input` = { taste, favorites, playlists, history, now }.
   */
  function artistScores(input = {}) {
    const t = text();
    const scores = new Map();
    if (!t) return scores;
    const taste = input.taste || {};
    const now = Number(input.now) || Date.now();
    const add = (name, weight, deezerId = null) => {
      const clean = t.primaryArtist(name);
      const key = clean ? t.normKey(clean) : '';
      if (!key || clean.length < 2 || !Number.isFinite(weight) || weight === 0) return;
      const seed = scores.get(key) || { name: clean, score: 0, deezerId: null };
      seed.score += weight;
      if (!seed.deezerId && deezerId) seed.deezerId = deezerId;
      scores.set(key, seed);
    };

    Object.values(taste.artists || {}).forEach((row) => add(row.n, row.value > 0 ? 4 : -6.5, row.dz));
    Object.values(taste.tracks || {}).forEach((row) => add(row.n, row.value > 0 ? 2.2 : -3.4, row.dz));

    (Array.isArray(input.favorites) ? input.favorites : []).forEach((entry, index) =>
      add(entry.artist, 1 + Math.max(0, 1 - index / 15), entry.source === 'deezer' ? entry.artistId : null)
    );
    (Array.isArray(input.history) ? input.history : []).forEach((row) => {
      if (!row || !row.entry) return;
      const age = (now - row.last) / DAY;
      add(
        row.entry.artist,
        Math.min(Number(row.plays) || 0, 6) * 0.3 * Math.exp(-age / 30),
        row.entry.source === 'deezer' ? row.entry.artistId : null
      );
    });
    (Array.isArray(input.playlists) ? input.playlists : []).forEach((playlist) =>
      (playlist && Array.isArray(playlist.items) ? playlist.items : []).forEach((entry) => add(entry.artist, 0.35))
    );
    (Array.isArray(taste.skips) ? taste.skips : []).forEach((row) => {
      const age = (now - row.at) / DAY;
      if (age > SKIP_DAYS) return;
      add(row.n, -0.55 * Math.exp(-age / SKIP_DECAY_DAYS), row.dz);
    });

    return scores;
  }

  // The best positive artists as plain seeds ({ name, deezerId }).
  function artists(input, limit = 5) {
    return Array.from(artistScores(input).values())
      .filter((artist) => artist.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(0, Number(limit) || 0))
      .map(({ name, deezerId }) => ({ name, deezerId }));
  }

  // Keeps the newest MAP_KEEP entries of a taste map (oldest `at` first out).
  function trimMap(map) {
    const keys = Object.keys(map || {});
    if (keys.length <= MAP_KEEP) return map;
    keys
      .sort((a, b) => (Number(map[a].at) || 0) - (Number(map[b].at) || 0))
      .slice(0, keys.length - MAP_KEEP)
      .forEach((key) => delete map[key]);
    return map;
  }

  /**
   * Sets "mehr/weniger davon" for titles or one artist. The same value again
   * removes the entry (toggle off). Returns { changed, toggledOff }.
   */
  function feedback(taste, entries, target, value, now) {
    const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
    if (!list.length || !taste) return { changed: 0, toggledOff: 0 };
    const at = Number(now) || Date.now();
    const t = text();
    let changed = 0;
    let toggledOff = 0;

    list.forEach((entry) => {
      if (!entry || entry.kind === 'radio') return;
      if (target === 'artist') {
        const key = artistKey(entry.artist);
        if (!key) return;
        const row = taste.artists[key];
        if (row && row.value === value) {
          delete taste.artists[key];
          toggledOff += 1;
        } else {
          taste.artists[key] = {
            value,
            at,
            n: t ? t.primaryArtist(entry.artist) : String(entry.artist || ''),
            dz: entry.source === 'deezer' ? entry.artistId || null : null,
          };
        }
        changed += 1;
      } else {
        const key = trackKey(entry);
        if (!key) return;
        const row = taste.tracks[key];
        if (row && row.value === value) {
          delete taste.tracks[key];
          toggledOff += 1;
        } else {
          taste.tracks[key] = {
            value,
            at,
            n: t ? t.primaryArtist(entry.artist) : String(entry.artist || ''),
            a: artistKey(entry.artist),
            dz: entry.source === 'deezer' ? entry.artistId || null : null,
          };
        }
        changed += 1;
      }
    });

    return { changed, toggledOff };
  }

  /**
   * Notes an early skip (3 s … 20 s or 55 % of the title). A repeated skip of the
   * same title within 5 s is ignored. Returns true when a skip was recorded.
   */
  function skip(taste, entry, info = {}) {
    if (!taste || !entry || entry.kind === 'radio') return false;
    if (info.paused) return false;
    const played = Number(info.played) || 0;
    const duration = Number(info.duration) || 0;
    const limit = Math.min(20, duration ? duration * 0.55 : 20);
    if (played < 3 || played >= limit) return false;

    const track = trackKey(entry);
    const artist = artistKey(entry.artist);
    if (!track && !artist) return false;

    const at = Number(info.now) || Date.now();
    const skips = Array.isArray(taste.skips) ? taste.skips : (taste.skips = []);
    const last = skips[skips.length - 1];
    if (last && last.t === track && at - (Number(last.at) || 0) < 5000) return false;

    const t = text();
    skips.push({
      a: artist,
      t: track,
      n: t ? t.primaryArtist(entry.artist) : String(entry.artist || ''),
      dz: entry.source === 'deezer' ? entry.artistId || null : null,
      at,
    });
    taste.skips = skips.slice(-SKIP_MAX);
    return true;
  }

  // Counts for the feedback panel: likes, dislikes, recent skips, top artists.
  function stats(taste, input = {}) {
    const source = taste || {};
    const trackRows = Object.values(source.tracks || {});
    const artistRows = Object.values(source.artists || {});
    const cutoff = (Number(input.now) || Date.now()) - 30 * DAY;
    return {
      likes: trackRows.filter((row) => row.value > 0).length + artistRows.filter((row) => row.value > 0).length,
      dislikes:
        trackRows.filter((row) => row.value < 0).length + artistRows.filter((row) => row.value < 0).length,
      skips: (Array.isArray(source.skips) ? source.skips : []).filter((row) => row.at >= cutoff).length,
      artists: artists(
        { taste: source, favorites: input.favorites, playlists: input.playlists, history: input.history, now: input.now },
        Number(input.limit) || 6
      ).map((artist) => artist.name),
    };
  }

  window.CMTaste = {
    DAY,
    SKIP_DAYS,
    SKIP_MAX,
    MAP_KEEP,
    artistKey,
    trackKey,
    trackValue,
    artistValue,
    skipPenalty,
    score,
    artistScores,
    artists,
    trimMap,
    feedback,
    skip,
    stats,
  };
})();
