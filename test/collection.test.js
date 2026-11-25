'use strict';

/**
 * Unit tests for renderer/core/collection.js – favourites, playlists, history.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'collection.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const C = sandbox.window.CMCollection;
assert.ok(C, 'window.CMCollection fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
const ids = (list) => Array.from(list, (row) => row.id);
const entry = (id, extra = {}) => Object.assign({ id, title: `Titel ${id}` }, extra);

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('favorites: lookup by id', () => {
  const favorites = [entry('a'), entry('b')];
  assert.equal(C.favoriteIndex(favorites, 'b'), 1);
  assert.equal(C.favoriteIndex(favorites, 'z'), -1);
  assert.equal(C.favoriteIndex(favorites, ''), -1);
  assert.equal(C.isFavorite(favorites, 'a'), true);
  assert.equal(C.isFavorite(favorites, 'z'), false);
  assert.equal(C.isFavorite(null, 'a'), false);
});

check('prepend puts the newest first and never duplicates', () => {
  const favorites = [entry('a'), entry('b')];
  const added = C.prepend(favorites, entry('c'));
  assert.deepEqual(ids(added), ['c', 'a', 'b']);
  const again = C.prepend(added, entry('a', { title: 'neu' }));
  assert.deepEqual(ids(again), ['a', 'c', 'b']);
  assert.equal(again[0].title, 'neu');
  assert.deepEqual(ids(favorites), ['a', 'b'], 'Eingabe bleibt unberührt');
  assert.deepEqual(plain(C.prepend(null, entry('x'))), [plain(entry('x'))]);
  assert.deepEqual(plain(C.prepend([entry('a')], null)), [plain(entry('a'))]);
});

check('without removes one title and reports it', () => {
  const favorites = [entry('a'), entry('b')];
  const result = C.without(favorites, 'b');
  assert.deepEqual(ids(result.list), ['a']);
  assert.equal(result.removed.id, 'b');
  const missing = C.without(favorites, 'z');
  assert.equal(missing.removed, null);
  assert.deepEqual(ids(missing.list), ['a', 'b']);
  assert.deepEqual(ids(favorites), ['a', 'b']);
});

check('fresh filters known titles and dedupes the input', () => {
  const existing = [entry('a'), entry('b')];
  const fresh = C.fresh(existing, [entry('b'), entry('c'), entry('c'), null, entry('d')]);
  assert.deepEqual(ids(fresh), ['c', 'd']);
  assert.deepEqual(C.fresh([], [entry('a')]).length, 1);
  assert.deepEqual(plain(C.fresh(null, null)), []);
});

check('withoutAt removes by index and clamps nothing else', () => {
  const rows = [entry('a'), entry('b'), entry('c')];
  const removed = C.withoutAt(rows, 1);
  assert.deepEqual(ids(removed.list), ['a', 'c']);
  assert.equal(removed.removed.id, 'b');
  assert.equal(C.withoutAt(rows, 5).removed, null);
  assert.equal(C.withoutAt(rows, -1).removed, null);
  assert.equal(C.withoutAt(rows, 'x').removed, null);
  assert.deepEqual(ids(rows), ['a', 'b', 'c']);
});

check('moved moves inside the list and reports no-ops', () => {
  const rows = [entry('a'), entry('b'), entry('c')];
  const moved = C.moved(rows, 2, 0);
  assert.equal(moved.moved, true);
  assert.deepEqual(ids(moved.list), ['c', 'a', 'b']);
  assert.equal(C.moved(rows, 1, 1).moved, false);
  assert.equal(C.moved(rows, 3, 0).moved, false);
  assert.equal(C.moved(rows, -1, 0).moved, false);
  // The target is clamped into the list.
  assert.deepEqual(ids(C.moved(rows, 0, 99).list), ['b', 'c', 'a']);
  assert.deepEqual(ids(rows), ['a', 'b', 'c']);
});

check('recordHistory: new titles first, known ones count up and move up', () => {
  const now = 1_700_000_000_000;
  let history = C.recordHistory([], entry('a'), now);
  assert.equal(history.length, 1);
  assert.equal(history[0].plays, 1);
  assert.equal(history[0].first, now);
  history = C.recordHistory(history, entry('b'), now + 1000);
  assert.deepEqual(ids(history.map((row) => row.entry)), ['b', 'a']);
  history = C.recordHistory(history, entry('a'), now + 2000);
  assert.deepEqual(ids(history.map((row) => row.entry)), ['a', 'b'], 'zuletzt gehört zuerst');
  assert.equal(history[0].plays, 2);
  assert.equal(history[0].first, now, 'erster Auftritt bleibt');
  assert.equal(history[0].last, now + 2000);
  // The old rows are not mutated.
  assert.equal(C.recordHistory(history, entry('c'), now + 3000).length, 3);
  assert.equal(history[0].plays, 2);
});

check('recordHistory caps the list and ignores invalid input', () => {
  const now = 1_700_000_000_000;
  let history = [];
  for (let i = 0; i < 6; i += 1) history = C.recordHistory(history, entry(`t${i}`), now + i, 3);
  assert.deepEqual(ids(history.map((row) => row.entry)), ['t5', 't4', 't3']);
  assert.equal(C.recordHistory(history, null, now).length, 3);
  assert.equal(C.recordHistory(history, { title: 'ohne id' }, now).length, 3);
  assert.equal(C.recordHistory(null, entry('x'), now).length, 1);
});

check('lastPlayed builds an id → time map', () => {
  const rows = [
    { entry: entry('a'), last: 5 },
    { entry: entry('b'), last: 9 },
    { entry: null, last: 1 },
  ];
  const map = C.lastPlayed(rows);
  assert.equal(map.get('a'), 5);
  assert.equal(map.get('b'), 9);
  assert.equal(map.size, 2);
  assert.equal(C.lastPlayed(null).size, 0);
});

console.log(`\n${checks} passed, 0 failed`);
