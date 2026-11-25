'use strict';

/**
 * Collection helpers (2.0, Phase 1) – window.CMCollection.
 *
 * Favourites, playlists and the listening history are plain lists; the rules
 * for changing them live here so app.js keeps only the UI and persistence.
 * Everything is pure: the functions never touch the lists they are given and
 * return new arrays, which makes them testable without Electron or a DOM
 * (test/collection.test.js).
 *
 * Entries are expected to be "storable" already (ids, no blob URLs) – app.js
 * prepares them before adding.
 */
(function () {
  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function favoriteIndex(favorites, id) {
    if (!id) return -1;
    return list(favorites).findIndex((entry) => entry && entry.id === id);
  }

  function isFavorite(favorites, id) {
    return favoriteIndex(favorites, id) >= 0;
  }

  // Newest first, never twice: an existing title is replaced (and moved up).
  function prepend(favorites, entry) {
    if (!entry || !entry.id) return list(favorites).slice();
    return [entry].concat(list(favorites).filter((item) => item && item.id !== entry.id));
  }

  // Removes one title. `removed` is the entry that left the list or null.
  function without(favorites, id) {
    const rows = list(favorites);
    const at = favoriteIndex(rows, id);
    if (at < 0) return { list: rows.slice(), removed: null };
    const copy = rows.slice();
    const [removed] = copy.splice(at, 1);
    return { list: copy, removed };
  }

  // Titles from `entries` that are not in `existing` yet – also deduped among
  // themselves, so adding the same album twice adds each title once.
  function fresh(existing, entries) {
    const known = new Set(list(existing).map((entry) => entry && entry.id).filter(Boolean));
    const out = [];
    list(entries).forEach((entry) => {
      if (!entry || !entry.id || known.has(entry.id)) return;
      known.add(entry.id);
      out.push(entry);
    });
    return out;
  }

  // Removes the title at `index`. Out-of-range indexes change nothing.
  function withoutAt(rows, index) {
    const copy = list(rows).slice();
    const at = Number(index);
    if (!Number.isInteger(at) || at < 0 || at >= copy.length) return { list: copy, removed: null };
    const [removed] = copy.splice(at, 1);
    return { list: copy, removed: removed || null };
  }

  // Moves one item; the target is clamped into the list. Returns moved: false
  // for a no-op (same position, invalid source), so callers can skip saving.
  function moved(rows, from, to) {
    const copy = list(rows).slice();
    const start = Number(from);
    if (!Number.isInteger(start) || start < 0 || start >= copy.length) return { list: copy, moved: false };
    const target = Math.max(0, Math.min(copy.length - 1, Math.trunc(Number(to)) || 0));
    if (target === start) return { list: copy, moved: false };
    const [item] = copy.splice(start, 1);
    copy.splice(target, 0, item);
    return { list: copy, moved: true };
  }

  // Bumps a title in the listening history: new titles go to the front, known
  // ones count up and move up, the list stays sorted by `last` and capped.
  // Returns the new rows; `entry` is stored as given.
  function recordHistory(rows, entry, now, max = 1200) {
    const copy = list(rows).slice();
    if (!entry || !entry.id) return copy;
    const at = now instanceof Date ? now.getTime() : Number(now) || Date.now();
    const limit = Math.max(1, Math.trunc(Number(max)) || 1200);
    const known = copy.find((row) => row && row.entry && row.entry.id === entry.id);
    if (known) {
      const at2 = copy.indexOf(known);
      copy[at2] = Object.assign({}, known, {
        entry,
        plays: Math.max(1, Number(known.plays) || 1) + 1,
        last: at,
        first: Number(known.first) || at,
      });
    } else {
      copy.unshift({ entry, plays: 1, first: at, last: at });
    }
    copy.sort((a, b) => (Number(b && b.last) || 0) - (Number(a && a.last) || 0));
    return copy.slice(0, limit);
  }

  // id → last played (ms) for quick lookups (recipes, mixes, review).
  function lastPlayed(rows) {
    const map = new Map();
    list(rows).forEach((row) => {
      if (!row || !row.entry || !row.entry.id) return;
      map.set(row.entry.id, Number(row.last) || 0);
    });
    return map;
  }

  window.CMCollection = {
    favoriteIndex,
    isFavorite,
    prepend,
    without,
    fresh,
    withoutAt,
    moved,
    recordHistory,
    lastPlayed,
  };
})();
