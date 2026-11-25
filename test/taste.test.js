'use strict';

/**
 * Unit tests for renderer/core/taste.js – local taste profile rules.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'renderer', 'core');
const sandbox = { window: {} };
for (const name of ['text.js', 'taste.js']) {
  const file = path.join(dir, name);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}
const T = sandbox.window.CMTaste;
assert.ok(T, 'window.CMTaste fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 25, 12, 0, 0).getTime();
const entry = (id, extra = {}) => Object.assign({ id, title: `Titel ${id}`, artist: 'Artist', kind: 'preview' }, extra);
const freshTaste = () => ({ tracks: {}, artists: {}, skips: [], revision: 0 });

check('keys use the app normalisation', () => {
  assert.equal(T.artistKey('Daft Punk'), 'daft punk');
  assert.equal(T.artistKey('Daft Punk feat. Pharrell'), 'daft punk');
  assert.equal(T.artistKey(''), '');
  assert.equal(T.trackKey(entry('a')), 'artist|titel a');
  assert.equal(T.trackKey(null), '');
});

check('values read the rows, missing is 0', () => {
  const taste = freshTaste();
  taste.tracks[T.trackKey(entry('a'))] = { value: 1 };
  taste.artists[T.artistKey('Artist')] = { value: -1 };
  assert.equal(T.trackValue(taste, entry('a')), 1);
  assert.equal(T.trackValue(taste, entry('b')), 0);
  assert.equal(T.artistValue(taste, entry('b')), -1);
  assert.equal(T.artistValue(null, entry('b')), 0);
});

check('skipPenalty: artist and title, decaying, capped', () => {
  const artistTaste = freshTaste();
  artistTaste.skips = [{ a: T.artistKey('Artist'), t: '', at: NOW }];
  const artistPenalty = T.skipPenalty(artistTaste, entry('c'), NOW);
  assert.ok(Math.abs(artistPenalty - 0.5) < 1e-9, String(artistPenalty));

  const trackTaste = freshTaste();
  trackTaste.skips = [{ a: '', t: T.trackKey(entry('b')), at: NOW }];
  const trackPenalty = T.skipPenalty(trackTaste, entry('b'), NOW);
  assert.ok(Math.abs(trackPenalty - 0.3) < 1e-9, String(trackPenalty));

  assert.equal(T.skipPenalty(artistTaste, entry('x', { artist: 'Niemand' }), NOW), 0);
  assert.equal(T.skipPenalty(freshTaste(), entry('a'), NOW), 0);
  // An old skip is ignored, many fresh ones hit the cap.
  const old = freshTaste();
  old.skips = [{ a: T.artistKey('Artist'), t: '', at: NOW - 60 * DAY }];
  assert.equal(T.skipPenalty(old, entry('a'), NOW), 0);
  const many = freshTaste();
  many.skips = new Array(20).fill(null).map(() => ({ a: T.artistKey('Artist'), t: '', at: NOW }));
  assert.equal(T.skipPenalty(many, entry('a'), NOW), 2.6);
});

check('score combines taste, favourites, plays and skips', () => {
  const taste = freshTaste();
  taste.tracks[T.trackKey(entry('a'))] = { value: 1 };
  taste.artists[T.artistKey('Artist')] = { value: 1 };
  const history = [{ entry: entry('a'), plays: 5, last: NOW }];
  const score = T.score(taste, entry('a'), { favoriteIds: new Set(['a']), history, now: NOW });
  // 3.2 + 2.4 + 1.2 + min(2.2, 2) = 9.0 → capped at 8
  assert.equal(score, 8);
  assert.equal(T.score(taste, entry('a', { kind: 'radio' }), { now: NOW }), 0);
  assert.equal(T.score(null, null), 0);
  // Negative taste goes the other way and is capped too.
  const bad = freshTaste();
  bad.tracks[T.trackKey(entry('a'))] = { value: -1 };
  bad.artists[T.artistKey('Artist')] = { value: -1 };
  assert.ok(T.score(bad, entry('a'), { now: NOW }) < 0);
  assert.ok(T.score(bad, entry('a'), { now: NOW }) >= -8);
});

check('artistScores and artists rank the seeds', () => {
  const taste = freshTaste();
  taste.artists[T.artistKey('Loved')] = { value: 1, n: 'Loved', dz: '7' };
  taste.artists[T.artistKey('Hated')] = { value: -1, n: 'Hated' };
  taste.skips = [{ a: T.artistKey('Skipped'), t: '', n: 'Skipped', at: NOW }];
  const input = {
    taste,
    favorites: [entry('f', { artist: 'Favourite' })],
    playlists: [{ items: [entry('p', { artist: 'Playlisted' })] }],
    history: [{ entry: entry('h', { artist: 'Played' }), plays: 3, last: NOW }],
    now: NOW,
  };
  const scores = T.artistScores(input);
  assert.equal(scores.get('loved').score, 4);
  assert.equal(scores.get('loved').deezerId, '7');
  assert.ok(scores.get('hated').score < 0);
  assert.ok(scores.get('skipped').score < 0);
  assert.ok(scores.get('favourite').score > 0);
  const ranked = T.artists(input, 3).map((artist) => artist.name);
  assert.equal(ranked[0], 'Loved');
  assert.equal(ranked.length, 3);
  assert.ok(!ranked.includes('Hated'));
  assert.deepEqual(plain(T.artists({}, 5)), []);
});

check('trimMap keeps the newest 600 rows', () => {
  const map = {};
  for (let index = 0; index < 610; index += 1) map[`k${index}`] = { at: index };
  T.trimMap(map);
  const keys = Object.keys(map);
  assert.equal(keys.length, 600);
  assert.ok(!map.k0);
  assert.ok(map.k609);
  const small = { a: { at: 1 } };
  assert.equal(T.trimMap(small), small);
});

check('feedback sets, switches and toggles off', () => {
  const taste = freshTaste();
  let result = T.feedback(taste, [entry('a')], 'track', 1, NOW);
  assert.deepEqual(plain(result), { changed: 1, toggledOff: 0 });
  assert.equal(taste.tracks[T.trackKey(entry('a'))].value, 1);
  assert.equal(taste.tracks[T.trackKey(entry('a'))].n, 'Artist');
  result = T.feedback(taste, [entry('a')], 'track', -1, NOW);
  assert.equal(taste.tracks[T.trackKey(entry('a'))].value, -1);
  result = T.feedback(taste, [entry('a')], 'track', -1, NOW);
  assert.deepEqual(plain(result), { changed: 1, toggledOff: 1 });
  assert.equal(taste.tracks[T.trackKey(entry('a'))], undefined);

  T.feedback(taste, [entry('b', { artist: 'Band' })], 'artist', 1, NOW);
  assert.equal(taste.artists[T.artistKey('Band')].value, 1);
  assert.equal(T.feedback(taste, [entry('c', { kind: 'radio' })], 'track', 1, NOW).changed, 0);
  assert.equal(T.feedback(taste, [], 'track', 1, NOW).changed, 0);
});

check('skip records early skips once, capped at 300', () => {
  const taste = freshTaste();
  assert.equal(T.skip(taste, entry('a'), { played: 8, duration: 200, now: NOW }), true);
  assert.equal(taste.skips.length, 1);
  assert.equal(taste.skips[0].a, T.artistKey('Artist'));
  assert.equal(taste.skips[0].t, T.trackKey(entry('a')));
  // Same title within 5 s is ignored.
  assert.equal(T.skip(taste, entry('a'), { played: 9, duration: 200, now: NOW + 1000 }), false);
  assert.equal(T.skip(taste, entry('a'), { played: 9, duration: 200, now: NOW + 6000 }), true);
  // Too early, too late, paused, radio, no artist.
  assert.equal(T.skip(taste, entry('b'), { played: 1, now: NOW }), false);
  assert.equal(T.skip(taste, entry('b'), { played: 30, now: NOW }), false);
  assert.equal(T.skip(taste, entry('b'), { played: 8, paused: true, now: NOW }), false);
  assert.equal(T.skip(taste, entry('b', { kind: 'radio' }), { played: 8, now: NOW }), false);
  // A title without artist is still skipped by its title key.
  assert.equal(T.skip(taste, { id: 'ohne', title: '', artist: '', kind: 'preview' }, { played: 8, now: NOW + 40000 }), true);
  // A short title (55 % limit) counts earlier: 5 s of 12 s is a skip.
  assert.equal(T.skip(taste, entry('c'), { played: 5, duration: 12, now: NOW + 20000 }), true);
  for (let index = 0; index < 400; index += 1) {
    T.skip(taste, entry(`t${index}`), { played: 8, now: NOW + 100000 + index * 6000 });
  }
  assert.equal(taste.skips.length, 300);
});

check('stats counts likes, dislikes, recent skips and top artists', () => {
  const taste = freshTaste();
  taste.tracks.a = { value: 1 };
  taste.tracks.b = { value: -1 };
  taste.artists.c = { value: 1 };
  taste.skips = [{ at: NOW }, { at: NOW - 40 * DAY }];
  const result = T.stats(taste, { now: NOW });
  assert.equal(result.likes, 2);
  assert.equal(result.dislikes, 1);
  assert.equal(result.skips, 1);
  assert.ok(Array.isArray(result.artists));
  const empty = T.stats(null, { now: NOW });
  assert.equal(empty.likes, 0);
  assert.equal(empty.skips, 0);
});

void DAY;
console.log(`\n${checks} passed, 0 failed`);
