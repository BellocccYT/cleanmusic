'use strict';

/**
 * Listening statistics (2.0, Phase 1) – window.CMStats.
 *
 * Everything that counts listening time and plays lives here: the month and
 * week buckets in `cleanmusic.stats.v1` and the review totals for "Rückblick".
 * app.js only prepares the values (artist name, storable entry) and saves.
 *
 * A "stats" object looks like:
 *   { months: { '2026-11': { secs, plays, hours[24], tracks, artists, sources } },
 *     weeks:  { '2026-W48': { secs, plays, artists } } }
 *
 * Pure apart from filling in a missing bucket (documented per function), loaded
 * before app.js, tested in test/stats.test.js.
 */
(function () {
  const TRACK_KEEP = 600; // month.tracks keeps the 600 longest-played titles
  const TRACK_TRIM = 700; // … once it grows past 700
  const WEEK_KEEP = 50; // week.artists keeps the 50 longest
  const WEEK_TRIM = 60;
  const WEEKS_KEEP = 8;

  function monthKey(date) {
    const at = date instanceof Date ? date : new Date(date == null ? Date.now() : date);
    return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}`;
  }

  function emptyMonth() {
    return { secs: 0, plays: 0, hours: new Array(24).fill(0), tracks: {}, artists: {}, sources: {} };
  }

  function ensure(stats) {
    const target = stats && typeof stats === 'object' ? stats : {};
    if (!target.months || typeof target.months !== 'object') target.months = {};
    if (!target.weeks || typeof target.weeks !== 'object') target.weeks = {};
    return target;
  }

  // Fills in the bucket for `date` if needed and returns it (mutates `stats`).
  function month(stats, date) {
    const target = ensure(stats);
    const key = monthKey(date);
    if (!target.months[key]) target.months[key] = emptyMonth();
    return target.months[key];
  }

  // Same for a week bucket; only the newest 8 weeks are kept (mutates `stats`).
  function week(stats, key) {
    const target = ensure(stats);
    if (key && !target.weeks[key]) {
      target.weeks[key] = { secs: 0, plays: 0, artists: {} };
      Object.keys(target.weeks)
        .sort()
        .slice(0, -WEEKS_KEEP)
        .forEach((old) => delete target.weeks[old]);
    }
    return target.weeks[key];
  }

  function trimTracks(bucket) {
    const ids = Object.keys(bucket.tracks);
    if (ids.length <= TRACK_TRIM) return;
    ids
      .sort((a, b) => (bucket.tracks[a].s || 0) - (bucket.tracks[b].s || 0))
      .slice(0, ids.length - TRACK_KEEP)
      .forEach((id) => delete bucket.tracks[id]);
  }

  function trimWeekArtists(bucket) {
    const names = Object.keys(bucket.artists);
    if (names.length <= WEEK_TRIM) return;
    names
      .sort((a, b) => bucket.artists[a] - bucket.artists[b])
      .slice(0, names.length - WEEK_KEEP)
      .forEach((name) => delete bucket.artists[name]);
  }

  /**
   * Adds listening time for one title.
   * `input` = { secs, entry, id, artist, source, kind, at } – `entry` must be the
   * storable form, `artist` the primary artist. Radio adds time and source only.
   */
  function listen(stats, input) {
    const row = input && typeof input === 'object' ? input : {};
    const secs = Number(row.secs);
    if (!(secs > 0)) return false;
    const at = row.at instanceof Date ? row.at : new Date(row.at == null ? Date.now() : row.at);
    const bucket = month(stats, at);
    bucket.secs += secs;
    bucket.hours[at.getHours()] += secs;

    const weekBucket = week(stats, row.weekKey);
    if (weekBucket) weekBucket.secs += secs;

    const source = String(row.source || (row.kind === 'local' ? 'Lokal' : row.kind) || 'Sonstige');
    bucket.sources[source] = (bucket.sources[source] || 0) + secs;
    if (row.kind === 'radio' || !row.id) return true;

    const track = bucket.tracks[row.id] || (bucket.tracks[row.id] = { s: 0, p: 0, e: row.entry || null });
    track.s += secs;
    if (row.artist) {
      const artistRow = bucket.artists[row.artist] || (bucket.artists[row.artist] = { s: 0, p: 0 });
      artistRow.s += secs;
      if (weekBucket) {
        weekBucket.artists[row.artist] = (weekBucket.artists[row.artist] || 0) + secs;
        trimWeekArtists(weekBucket);
      }
    }
    trimTracks(bucket);
    return true;
  }

  // Counts one play (radio is skipped by the caller as before).
  function play(stats, input) {
    const row = input && typeof input === 'object' ? input : {};
    if (!row.id) return false;
    const at = row.at instanceof Date ? row.at : new Date(row.at == null ? Date.now() : row.at);
    const bucket = month(stats, at);
    bucket.plays += 1;
    const weekBucket = week(stats, row.weekKey);
    if (weekBucket) weekBucket.plays += 1;
    const track = bucket.tracks[row.id] || (bucket.tracks[row.id] = { s: 0, p: 0, e: row.entry || null });
    track.p += 1;
    if (row.artist) {
      const artistRow = bucket.artists[row.artist] || (bucket.artists[row.artist] = { s: 0, p: 0 });
      artistRow.p += 1;
    }
    trimTracks(bucket);
    return true;
  }

  /**
   * Totals for the review view. `period` is 'month' (current month), 'year'
   * (current year) or 'all'. Returns the summed buckets plus the top lists.
   */
  function review(months, options = {}) {
    const all = months && typeof months === 'object' ? months : {};
    const now = options.now instanceof Date ? options.now : new Date();
    const year = String(now.getFullYear());
    const current = monthKey(now);
    const period = options.period === 'year' || options.period === 'all' ? options.period : 'month';
    const keys = Object.keys(all).filter((key) =>
      period === 'month' ? key === current : period === 'year' ? key.startsWith(`${year}-`) : true
    );
    const out = {
      secs: 0,
      plays: 0,
      hours: new Array(24).fill(0),
      months: new Array(12).fill(0),
      tracks: {},
      artists: {},
      sources: {},
    };
    keys.forEach((key) => {
      const bucket = all[key] || {};
      out.secs += bucket.secs || 0;
      out.plays += bucket.plays || 0;
      (Array.isArray(bucket.hours) ? bucket.hours : []).forEach((value, hour) => {
        out.hours[hour] += value || 0;
      });
      if (key.startsWith(`${year}-`)) out.months[Number(key.slice(5)) - 1] += bucket.secs || 0;
      Object.entries(bucket.tracks || {}).forEach(([id, row]) => {
        const target = out.tracks[id] || (out.tracks[id] = { s: 0, p: 0, e: row.e });
        target.s += row.s || 0;
        target.p += row.p || 0;
      });
      Object.entries(bucket.artists || {}).forEach(([name, row]) => {
        const target = out.artists[name] || (out.artists[name] = { s: 0, p: 0 });
        target.s += row.s || 0;
        target.p += row.p || 0;
      });
      Object.entries(bucket.sources || {}).forEach(([name, value]) => {
        out.sources[name] = (out.sources[name] || 0) + (value || 0);
      });
    });
    out.topTracks = Object.values(out.tracks)
      .filter((row) => row.e)
      .sort((a, b) => b.p - a.p || b.s - a.s)
      .slice(0, 10);
    out.topArtists = Object.entries(out.artists)
      .sort((a, b) => b[1].s - a[1].s || b[1].p - a[1].p)
      .slice(0, 10);
    out.topSource = Object.entries(out.sources).sort((a, b) => b[1] - a[1])[0] || null;
    return out;
  }

  // Total listening seconds across all months (Ko-fi hint, checks).
  function totalSeconds(months) {
    return Object.values(months && typeof months === 'object' ? months : {}).reduce(
      (sum, bucket) => sum + (Number(bucket && bucket.secs) || 0),
      0
    );
  }

  window.CMStats = {
    monthKey,
    emptyMonth,
    month,
    week,
    listen,
    play,
    review,
    totalSeconds,
  };
})();
