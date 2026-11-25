'use strict';

/**
 * Smart Mixes (2.0, Phase 1) – window.CMMixes.
 *
 * Five daily mixes ("Dein Mix", "Neu für dich", "Entdecken", "Nochmal",
 * "Tiefe Schnitte") built from what is already on the device. This module holds
 * the definitions, the scoring and the filters; app.js builds the pool and the
 * context (favourites, playlists, history, taste) and renders the cards.
 *
 * Everything is deterministic for one day and one nonce: the same input gives
 * the same order, "Neu mischen" only bumps the nonce.
 *
 * Pure, loaded before app.js, tested in test/mixes.test.js.
 */
(function () {
  const LIMIT = 30;

  const DEFS = [
    {
      id: 'daily',
      title: 'Dein Mix',
      subtitle: 'dein Geschmack, frisch gemischt',
      desc: 'Favoriten, was du oft hörst – und Titel, die genau dazu passen.',
      icon: 'spark',
      tone: 'daily',
    },
    {
      id: 'fresh',
      title: 'Neu für dich',
      subtitle: 'neue Titel deiner Artists',
      desc: 'Frische Vorschläge abseits deiner Favoriten und der letzten Tage.',
      icon: 'star',
      tone: 'fresh',
    },
    {
      id: 'discover',
      title: 'Entdecken',
      subtitle: 'neue Artists, neue Richtungen',
      desc: 'Titel von Artists, die du noch nicht hörst – aber mögen könntest.',
      icon: 'search',
      tone: 'discover',
    },
    {
      id: 'again',
      title: 'Nochmal',
      subtitle: 'was du früher gern gehört hast',
      desc: 'Titel mit vielen Plays, die in den letzten Wochen nicht dran waren.',
      icon: 'refresh',
      tone: 'again',
    },
    {
      id: 'deep',
      title: 'Tiefe Schnitte',
      subtitle: 'Perlen aus deinen Playlists',
      desc: 'Selten gehörte Titel aus deinen Playlists und deiner lokalen Musik.',
      icon: 'list',
      tone: 'deep',
    },
  ];

  function text() {
    return window.CMText || null;
  }

  function def(id) {
    return DEFS.find((entry) => entry.id === id) || null;
  }

  // Small deterministic offset so two mixes never look identical.
  function noise(entry, id, day, nonce) {
    const t = text();
    if (!t || !entry) return 0;
    const value = t.stringSeed(`${day}:${id}:${entry.id}:${nonce}`);
    return ((value % 1000) / 1000 - 0.5) * 1.1;
  }

  /**
   * Score for one title in one mix.
   * `ctx` supplies the lookups: baseScore(entry), days(entry), plays(entry),
   * favoriteIds/favoriteKeys/playlistIds/recIds (Sets), knownArtists (Set of
   * artist keys), artistKey(name).
   */
  function score(entry, id, ctx, seed = '') {
    const base = (ctx.baseScore ? ctx.baseScore(entry) : 0) + noise(entry, id, seed.day, seed.nonce);
    const days = ctx.days ? ctx.days(entry) : 999;
    const recent = days < 1 ? 2.2 : days < 3 ? 1.1 : 0;
    const artistKey = ctx.artistKey ? ctx.artistKey(entry && entry.artist) : '';
    const favorite = Boolean(ctx.favoriteIds && ctx.favoriteIds.has(entry.id));

    if (id === 'daily') {
      const known = favorite ? 0.9 : 0;
      const local = entry.kind === 'local' ? 0.25 : 0;
      const playlist = ctx.playlistIds && ctx.playlistIds.has(entry.id) ? 0.25 : 0;
      return base + known + local + playlist - recent;
    }

    if (id === 'fresh') {
      return (
        base +
        (ctx.recIds && ctx.recIds.has(entry.id) ? 1.6 : 0) +
        (artistKey && ctx.knownArtists && ctx.knownArtists.has(artistKey) ? 0.35 : 0) -
        (days < 7 ? 3 : 0) -
        (favorite ? 2.5 : 0)
      );
    }

    if (id === 'discover') {
      const unknown = artistKey && ctx.knownArtists && !ctx.knownArtists.has(artistKey) ? 2.2 : -0.4;
      return (
        base * 0.85 +
        unknown +
        (ctx.recIds && ctx.recIds.has(entry.id) ? 0.5 : 0) -
        (days < 14 ? 2 : 0) -
        (favorite ? 4 : 0)
      );
    }

    if (id === 'again') {
      return (
        base +
        Math.min(ctx.plays ? ctx.plays(entry) : 0, 8) * 0.45 +
        (favorite ? 0.6 : 0) +
        (days > 45 ? 0.8 : 0) -
        (days < 14 ? 2.5 : 0)
      );
    }

    if (id === 'deep') {
      const plays = ctx.plays ? ctx.plays(entry) : 0;
      return (
        base +
        (plays === 0 ? 1.4 : plays < 3 ? 0.6 : 0) +
        (days > 30 ? 0.9 : 0) +
        (entry.kind === 'local' ? 0.25 : 0) -
        (days < 14 ? 2 : 0)
      );
    }

    return base;
  }

  // Which titles a mix may contain at all (before scoring).
  function accepts(entry, id, ctx) {
    if (ctx.excluded && ctx.excluded(entry)) return false;
    const favorite = Boolean(ctx.favoriteIds && ctx.favoriteIds.has(entry.id));
    const inPlaylist = Boolean(ctx.playlistIds && ctx.playlistIds.has(entry.id));
    const days = ctx.days ? ctx.days(entry) : 999;

    if (id === 'fresh') {
      const key = ctx.favoriteKeys && text() ? ctx.favoriteKeys.has(text().matchKey(entry)) : false;
      return !favorite && !key && !inPlaylist && days > 7;
    }
    if (id === 'discover') {
      const key = ctx.artistKey ? ctx.artistKey(entry.artist) : '';
      return Boolean(key) && ctx.knownArtists && !ctx.knownArtists.has(key) && !favorite && days > 14;
    }
    if (id === 'again') {
      return (favorite || (ctx.plays ? ctx.plays(entry) : 0) > 0) && days > 7;
    }
    if (id === 'deep') {
      return (inPlaylist || entry.kind === 'local') && !favorite;
    }
    return true;
  }

  /**
   * Builds one mix: filter, score, take the best `limit`, then mix them in a
   * stable order for the day. `seed` = { day, nonce }.
   */
  function build(id, pool, ctx, seed = {}, limit = LIMIT) {
    const t = text();
    const day = String(seed.day || '');
    const nonce = Number(seed.nonce) || 0;
    const wanted = Number(limit);
    const max = Math.max(0, Math.trunc(Number.isFinite(wanted) ? wanted : LIMIT));
    const picked = (Array.isArray(pool) ? pool : [])
      .filter((entry) => entry && accepts(entry, id, ctx))
      .map((entry) => ({ entry, score: score(entry, id, ctx, { day, nonce }) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map((row) => row.entry);
    if (!t) return picked;
    return t.seededShuffle(picked, t.stringSeed(`${day}:${id}:${nonce}`));
  }

  // All five mixes at once (same pool and context).
  function buildAll(pool, ctx, seed = {}, limit = LIMIT) {
    const out = {};
    DEFS.forEach((entry) => {
      out[entry.id] = build(entry.id, pool, ctx, seed, limit);
    });
    return out;
  }

  window.CMMixes = {
    LIMIT,
    DEFS,
    def,
    noise,
    score,
    accepts,
    build,
    buildAll,
  };
})();
