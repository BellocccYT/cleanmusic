'use strict';

/**
 * Unit tests for renderer/core/mixes.js – scoring, filters and determinism.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'renderer', 'core');
const sandbox = { window: {} };
for (const name of ['text.js', 'mixes.js']) {
  const file = path.join(dir, name);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}
const M = sandbox.window.CMMixes;
const CMText = sandbox.window.CMText;
assert.ok(M, 'window.CMMixes fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
const ids = (list) => Array.from(list, (row) => row.id);
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const entry = (id, extra = {}) => Object.assign({ id, title: `Titel ${id}`, artist: 'Artist', kind: 'preview' }, extra);

// Context helper: per-title days/plays, everything else empty unless given.
function context(extra = {}) {
  const days = extra.days || {};
  const plays = extra.plays || {};
  const rest = Object.assign({}, extra);
  delete rest.days;
  delete rest.plays;
  return Object.assign(
    {
      baseScore: () => 0,
      favoriteIds: new Set(),
      favoriteKeys: new Set(),
      playlistIds: new Set(),
      recIds: new Set(),
      knownArtists: new Set(),
      artistKey: (name) => CMText.normKey(CMText.primaryArtist(name)),
      excluded: () => false,
    },
    rest,
    {
      days: (row) => (days[row.id] == null ? 999 : days[row.id]),
      plays: (row) => plays[row.id] || 0,
    }
  );
}

check('five definitions with stable ids and UI fields', () => {
  assert.deepEqual(plain(M.DEFS).map((def) => def.id), ['daily', 'fresh', 'discover', 'again', 'deep']);
  assert.ok(M.DEFS.every((def) => def.title && def.subtitle && def.desc && def.icon && def.tone));
  assert.equal(M.def('daily').title, 'Dein Mix');
  assert.equal(M.def('nope'), null);
  assert.equal(M.LIMIT, 30);
});

check('noise is deterministic per day and nonce, inside ±0.55', () => {
  const first = M.noise(entry('a'), 'daily', '2026-11-25', 0);
  assert.equal(first, M.noise(entry('a'), 'daily', '2026-11-25', 0));
  assert.ok(first >= -0.55 && first <= 0.55);
  assert.notEqual(M.noise(entry('a'), 'daily', '2026-11-25', 1), first);
});

check('score: daily favours favourites, penalises recent plays', () => {
  const base = { baseScore: () => 1 };
  const ctx = context(Object.assign({}, base, { favoriteIds: new Set(['a']) }));
  const fav = M.score(entry('a'), 'daily', ctx, { day: 'd', nonce: 0 });
  const other = M.score(entry('b'), 'daily', ctx, { day: 'd', nonce: 0 });
  assert.ok(fav > other);
  const recentCtx = context(Object.assign({}, base, { days: { a: 0 } }));
  assert.ok(M.score(entry('a'), 'daily', recentCtx, { day: 'd', nonce: 0 }) < 1);
  // Local titles get a small bonus.
  const localCtx = context(base);
  assert.ok(M.score(entry('a', { kind: 'local' }), 'daily', localCtx, { day: 'd', nonce: 0 }) > 1);
});

check('score: fresh pushes new titles, discover wants unknown artists', () => {
  const ctx = context({ knownArtists: new Set(['artist']), recIds: new Set(['new']) });
  const freshKnown = M.score(entry('x'), 'fresh', ctx, { day: 'd', nonce: 0 });
  const freshRecent = M.score(entry('new'), 'fresh', context({ recIds: new Set(['new']), days: { new: 2 } }), { day: 'd', nonce: 0 });
  assert.ok(freshKnown > freshRecent);

  const unknown = context({ knownArtists: new Set(['artist']) });
  const knownScore = M.score(entry('k'), 'discover', unknown, { day: 'd', nonce: 0 });
  const unknownScore = M.score(entry('u', { artist: 'Fremd' }), 'discover', unknown, { day: 'd', nonce: 0 });
  assert.ok(unknownScore > knownScore);
});

check('score: again and deep use plays and age', () => {
  const ctx = context({ plays: { a: 4 } });
  const often = M.score(entry('a'), 'again', ctx, { day: 'd', nonce: 0 });
  const never = M.score(entry('b'), 'again', ctx, { day: 'd', nonce: 0 });
  assert.ok(often > never);
  const deepCtx = context({ plays: { a: 0 } });
  const unplayed = M.score(entry('a'), 'deep', deepCtx, { day: 'd', nonce: 0 });
  const played = M.score(entry('b'), 'deep', context({ plays: { b: 5 } }), { day: 'd', nonce: 0 });
  assert.ok(unplayed > played);
});

check('accepts: filters per mix', () => {
  const ctx = context({
    favoriteIds: new Set(['fav']),
    favoriteKeys: new Set([CMText.matchKey(entry('fav'))]),
    playlistIds: new Set(['pl']),
    knownArtists: new Set(['artist']),
    days: { old: 30, freshTitle: 2 },
  });
  assert.equal(M.accepts(entry('x'), 'daily', ctx), true);
  assert.equal(M.accepts(entry('fav'), 'fresh', ctx), false);
  assert.equal(M.accepts(entry('pl'), 'fresh', ctx), false);
  assert.equal(M.accepts(entry('freshTitle'), 'fresh', ctx), false, 'zu frisch gehört');
  assert.equal(M.accepts(entry('old'), 'fresh', ctx), true);
  assert.equal(M.accepts(entry('x'), 'discover', ctx), false, 'bekannter Artist');
  assert.equal(M.accepts(entry('y', { artist: 'Fremd' }), 'discover', ctx), true);
  assert.equal(M.accepts(entry('old'), 'again', ctx), false, 'nie gehört');
  assert.equal(M.accepts(entry('fav'), 'again', ctx), true);
  assert.equal(M.accepts(entry('pl'), 'deep', ctx), true);
  assert.equal(M.accepts(entry('x'), 'deep', ctx), false);
  assert.equal(M.accepts(entry('x', { kind: 'local' }), 'deep', ctx), true);
  assert.equal(M.accepts(entry('fav'), 'deep', ctx), false);
  const excluded = context({ excluded: (row) => row.id === 'bad' });
  assert.equal(M.accepts(entry('bad'), 'daily', excluded), false);
});

check('build: limit, sorting and deterministic shuffle', () => {
  const pool = [];
  for (let index = 0; index < 40; index += 1) pool.push(entry(`t${index}`));
  const ctx = context({ plays: Object.fromEntries(pool.map((row, at) => [row.id, 40 - at])) });
  const first = M.build('again', pool, ctx, { day: '2026-11-25', nonce: 0 });
  assert.equal(first.length, M.LIMIT);
  assert.deepEqual(ids(first), ids(M.build('again', pool, ctx, { day: '2026-11-25', nonce: 0 })));
  assert.notDeepEqual(ids(first), ids(M.build('again', pool, ctx, { day: '2026-11-25', nonce: 1 })));
  assert.equal(M.build('again', pool, ctx, { day: 'd' }, 5).length, 5);
  assert.deepEqual(plain(M.build('again', [], ctx)), []);
  assert.deepEqual(plain(M.build('again', pool, ctx, { day: 'd' }, 0)), []);
  // Every returned title is unique.
  assert.equal(new Set(ids(first)).size, first.length);
});

check('buildAll returns all five mixes', () => {
  const pool = [entry('a'), entry('b', { artist: 'Fremd' })];
  const lists = M.buildAll(pool, context({ plays: { a: 2 } }), { day: 'd', nonce: 0 });
  assert.deepEqual(Object.keys(lists).sort(), ['again', 'daily', 'deep', 'discover', 'fresh']);
  Object.values(lists).forEach((list) => assert.ok(Array.isArray(list)));
});

console.log(`\n${checks} passed, 0 failed`);
