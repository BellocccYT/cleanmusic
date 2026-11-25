'use strict';

/**
 * Unit tests for renderer/audio/queue-slice.js – the queue as a store slice.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const dir = path.join(__dirname, '..', 'renderer', 'audio');
const sandbox = { window: {} };
for (const name of ['queue.js', 'queue-slice.js']) {
  const file = path.join(dir, name);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}
const QS = sandbox.window.CMQueueSlice;
assert.ok(QS, 'window.CMQueueSlice fehlt');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const entry = (id, extra = {}) => Object.assign({ id, title: `Track ${id}` }, extra);
const ids = (list) => list.map((row) => row.id);
const plain = (value) => JSON.parse(JSON.stringify(value));

check('create: works on a plain state object and creates a missing queue', () => {
  const state = {};
  const queue = QS.create(state);
  assert.deepEqual(plain(state.queue), { items: [], index: -1, kind: 'queue', upcoming: -1 });
  assert.equal(queue.length(), 0);
  assert.equal(queue.current(), null);
  // The store variant also works (state lives one level down).
  const store = {
    state: { queue: { items: [entry('a')], index: 0, kind: 'queue', upcoming: -1 } },
    get: () => store.state,
    subscribe: () => () => {},
  };
  const viaStore = QS.create(store);
  assert.equal(viaStore.current().id, 'a');
  assert.equal(store.state.queue, viaStore.get());
});

check('replace: new list replaces the object (autoplay identity) and keeps extras', () => {
  const state = { queue: { items: [entry('old')], index: 0, kind: 'queue', upcoming: 3 } };
  const queue = QS.create(state);
  const before = state.queue;
  const next = queue.replace([entry('a'), entry('b')], 1, 'playlist', { shuffleBase: [entry('a')] });
  assert.notEqual(next, before, 'neues Objekt für Identitätsprüfungen');
  assert.equal(next, state.queue);
  assert.deepEqual(ids(next.items), ['a', 'b']);
  assert.equal(next.index, 1);
  assert.equal(next.kind, 'playlist');
  assert.equal(next.upcoming, -1);
  assert.equal(next.shuffleBase.length, 1);
  // Empty queue with index -1 stays -1.
  assert.equal(queue.replace([], -1, 'local').index, -1);
});

check('insert: next goes right after the current title, end after queued ones', () => {
  const state = {
    queue: { items: [entry('a'), entry('q', { queued: true }), entry('b')], index: 0, kind: 'queue', upcoming: -1 },
  };
  const queue = QS.create(state);
  assert.equal(queue.insert([entry('x')], 'next'), 1);
  assert.deepEqual(ids(state.queue.items), ['a', 'x', 'q', 'b']);
  // 'end' only skips the queued titles that directly follow the current one.
  state.queue = {
    items: [entry('a'), entry('q1', { queued: true }), entry('q2', { queued: true }), entry('b')],
    index: 0,
    kind: 'queue',
    upcoming: -1,
  };
  assert.equal(queue.insert([entry('y')], 'end'), 3);
  assert.deepEqual(ids(state.queue.items), ['a', 'q1', 'q2', 'y', 'b']);
  // No current title → caller has to replace.
  state.queue = { items: [], index: -1, kind: 'queue', upcoming: -1 };
  assert.equal(queue.insert([entry('z')], 'next'), -1);
  assert.equal(queue.insert([], 'next'), -1);
});

check('append adds autoplay suggestions and reports the count', () => {
  const state = { queue: { items: [entry('a')], index: 0, kind: 'queue', upcoming: -1 } };
  const queue = QS.create(state);
  assert.equal(queue.append([entry('b'), entry('c')]), 2);
  assert.deepEqual(ids(state.queue.items), ['a', 'b', 'c']);
  assert.equal(queue.append([]), 0);
  assert.equal(queue.append(null), 0);
});

check('remove and move honour the waiting part only', () => {
  const state = {
    queue: { items: [entry('a'), entry('b'), entry('c'), entry('d')], index: 1, kind: 'queue', upcoming: -1 },
  };
  const queue = QS.create(state);
  assert.equal(queue.remove(2), true);
  assert.deepEqual(ids(state.queue.items), ['a', 'b', 'd']);
  assert.equal(queue.remove(1), false, 'laufender Titel');
  assert.equal(queue.remove(0), false, 'davor');
  assert.equal(queue.move(3, 2), false, 'außerhalb');
  state.queue.items = [entry('a'), entry('b'), entry('c'), entry('d')];
  assert.equal(queue.move(3, 2), true);
  assert.deepEqual(ids(state.queue.items), ['a', 'b', 'd', 'c']);
});

check('clearAdded removes queued and autoplay titles, keeps context', () => {
  const state = {
    queue: {
      items: [entry('a'), entry('b'), entry('q', { queued: true }), entry('c'), entry('auto', { autoplay: true })],
      index: 1,
      kind: 'queue',
      upcoming: -1,
    },
  };
  const queue = QS.create(state);
  assert.equal(queue.clearAdded(), 2);
  assert.deepEqual(ids(state.queue.items), ['a', 'b', 'c']);
});

check('shuffle and restore round-trip through the slice', () => {
  const state = {
    queue: {
      items: [entry('a'), entry('b'), entry('c'), entry('d')],
      index: 0,
      kind: 'queue',
      upcoming: -1,
    },
  };
  const queue = QS.create(state);
  const base = state.queue.items.slice();
  assert.equal(queue.shuffle(true), true);
  assert.equal(state.queue.items[0].id, 'a');
  assert.equal(state.queue.shuffleBase.length, 4);
  assert.equal(queue.restore(), true);
  assert.deepEqual(ids(state.queue.items), ids(base));
  assert.equal(state.queue.shuffleBase, null);
  // Short queues are left alone.
  state.queue.items = [entry('only')];
  assert.equal(queue.shuffle(), false);
  assert.equal(queue.restore(), false);
});

check('seed walks back and pending lists what is still queued', () => {
  const state = {
    queue: {
      items: [entry('good'), entry('current'), entry('q', { queued: true })],
      index: 1,
      kind: 'queue',
      upcoming: -1,
    },
  };
  const queue = QS.create(state);
  assert.equal(queue.seed((row) => row.id === 'good').id, 'good');
  assert.equal(queue.seed(() => false), null);
  assert.deepEqual(ids(queue.pending()), ['q']);
});

console.log(`\n${checks} passed, 0 failed`);
