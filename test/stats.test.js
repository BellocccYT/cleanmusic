'use strict';

/**
 * Unit tests for renderer/core/stats.js – listening time, plays and review.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'stats.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const S = sandbox.window.CMStats;
assert.ok(S, 'window.CMStats fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const AT = new Date(2026, 10, 25, 21, 30, 0); // 25 Nov 2026, 21:30
const entry = (id) => ({ id, title: `Titel ${id}`, artist: 'Artist' });

check('monthKey and emptyMonth', () => {
  assert.equal(S.monthKey(AT), '2026-11');
  assert.equal(S.monthKey(new Date(2026, 0, 2)), '2026-01');
  const empty = plain(S.emptyMonth());
  assert.equal(empty.secs, 0);
  assert.equal(empty.plays, 0);
  assert.equal(empty.hours.length, 24);
  assert.deepEqual(empty.tracks, {});
});

check('month and week create their bucket once and keep state', () => {
  const stats = {};
  const month = S.month(stats, AT);
  month.secs = 10;
  assert.equal(S.month(stats, AT).secs, 10, 'gleicher Monat, gleicher Eimer');
  assert.ok(stats.months['2026-11']);
  const week = S.week(stats, '2026-W48');
  week.secs = 5;
  assert.equal(S.week(stats, '2026-W48').secs, 5);
  assert.deepEqual(plain(stats.weeks).constructor, Object);
  // Missing input is tolerated.
  assert.equal(S.month(null, AT).secs, 0);
});

check('week keeps only the newest 8 weeks', () => {
  const stats = { weeks: {} };
  for (let index = 1; index <= 10; index += 1) S.week(stats, `2026-W${String(index).padStart(2, '0')}`);
  const keys = Object.keys(stats.weeks).sort();
  assert.equal(keys.length, 8);
  assert.equal(keys[0], '2026-W03');
  assert.equal(keys[7], '2026-W10');
});

check('listen adds time, hour, source, track and artist', () => {
  const stats = {};
  const ok = S.listen(stats, {
    secs: 30,
    id: 'a',
    artist: 'Artist',
    kind: 'preview',
    source: 'Deezer',
    entry: entry('a'),
    at: AT,
    weekKey: '2026-W48',
  });
  assert.equal(ok, true);
  const month = stats.months['2026-11'];
  assert.equal(month.secs, 30);
  assert.equal(month.hours[21], 30);
  assert.equal(month.sources.Deezer, 30);
  assert.equal(month.tracks.a.s, 30);
  assert.equal(month.tracks.a.e.title, 'Titel a');
  assert.equal(month.artists.Artist.s, 30);
  assert.equal(stats.weeks['2026-W48'].secs, 30);
  assert.equal(stats.weeks['2026-W48'].artists.Artist, 30);
  // Invalid input changes nothing.
  assert.equal(S.listen(stats, { secs: 0, id: 'a' }), false);
  assert.equal(S.listen(stats, null), false);
  assert.equal(month.secs, 30);
});

check('listen: radio counts time and source, never a track', () => {
  const stats = {};
  S.listen(stats, { secs: 12, id: 'radio:1', kind: 'radio', source: 'Radio', at: AT, weekKey: '2026-W48' });
  const month = stats.months['2026-11'];
  assert.equal(month.secs, 12);
  assert.equal(month.sources.Radio, 12);
  assert.deepEqual(plain(month.tracks), {});
  assert.deepEqual(plain(month.artists), {});
});

check('listen keeps the month small: 700 titles drop to 600', () => {
  const stats = {};
  for (let index = 0; index < 701; index += 1) {
    S.listen(stats, {
      secs: index + 1,
      id: `t${index}`,
      artist: 'Viele',
      kind: 'preview',
      entry: entry(`t${index}`),
      at: AT,
      weekKey: '2026-W48',
    });
  }
  const month = stats.months['2026-11'];
  assert.equal(Object.keys(month.tracks).length, 600);
  assert.ok(!month.tracks.t0, 'kürzester Titel fliegt raus');
  assert.ok(month.tracks.t700);
});

check('play counts plays for month, week, track and artist', () => {
  const stats = {};
  assert.equal(S.play(stats, { id: 'a', artist: 'Artist', entry: entry('a'), at: AT, weekKey: '2026-W48' }), true);
  const month = stats.months['2026-11'];
  assert.equal(month.plays, 1);
  assert.equal(month.tracks.a.p, 1);
  assert.equal(month.tracks.a.s, 0);
  assert.equal(month.artists.Artist.p, 1);
  assert.equal(stats.weeks['2026-W48'].plays, 1);
  assert.equal(S.play(stats, { artist: 'x' }), false);
});

check('review sums the chosen period and builds the top lists', () => {
  const months = {
    '2025-12': { secs: 999, plays: 9, hours: new Array(24).fill(0), tracks: {}, artists: {}, sources: {} },
    '2026-01': { secs: 60, plays: 2, hours: new Array(24).fill(0), tracks: { a: { s: 60, p: 2, e: entry('a') } }, artists: { Artist: { s: 60, p: 2 } }, sources: { Deezer: 60 } },
    '2026-11': { secs: 120, plays: 3, hours: new Array(24).fill(0), tracks: { a: { s: 30, p: 1, e: entry('a') }, b: { s: 90, p: 3, e: entry('b') } }, artists: { Artist: { s: 30, p: 1 }, B: { s: 90, p: 3 } }, sources: { Deezer: 100, Apple: 20 } },
  };
  months['2026-11'].hours[21] = 120;
  const month = S.review(months, { period: 'month', now: AT });
  assert.equal(month.secs, 120);
  assert.equal(month.plays, 3);
  assert.equal(month.hours[21], 120);
  assert.deepEqual(plain(month.months), [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 120, 0]);
  assert.equal(month.topTracks.length, 2);
  assert.equal(month.topTracks[0].e.id, 'b', 'meiste Plays zuerst');
  assert.equal(month.topArtists[0][0], 'B');
  assert.deepEqual(plain(month.topSource), ['Deezer', 100]);

  const year = S.review(months, { period: 'year', now: AT });
  assert.equal(year.secs, 180);
  assert.equal(year.plays, 5);
  assert.equal(year.topTracks[0].p, 3, 'a: 2 + 1, b: 3');
  assert.equal(year.topSource[0], 'Deezer');
  assert.equal(year.topSource[1], 160);

  const all = S.review(months, { period: 'all', now: AT });
  assert.equal(all.secs, 1179);
  assert.equal(S.review(null, { period: 'all' }).secs, 0);
});

check('totalSeconds adds every month', () => {
  assert.equal(S.totalSeconds({ a: { secs: 10 }, b: { secs: 32.5 }, c: {} }), 42.5);
  assert.equal(S.totalSeconds(null), 0);
});

console.log(`\n${checks} passed, 0 failed`);
