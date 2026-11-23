'use strict';

/**
 * Unit tests for renderer/audio/queue.js – no Electron, no DOM.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'audio', 'queue.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });

const queue = sandbox.window.CMQueue;
assert.ok(queue, 'window.CMQueue fehlt');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const entry = (id, extra = {}) => Object.assign({ id, title: `Track ${id}` }, extra);

check('queueGroup classifies request, queued, autoplay and context', () => {
  assert.equal(queue.queueGroup(entry('a', { requestedBy: 'viewer' })), 'request');
  assert.equal(queue.queueGroup(entry('a', { queued: true })), 'queued');
  assert.equal(queue.queueGroup(entry('a', { autoplay: true })), 'autoplay');
  assert.equal(queue.queueGroup(entry('a')), 'context');
});

check('shuffleTail keeps the current title and prioritised entries in front', () => {
  const items = [
    entry('current'),
    entry('queued', { queued: true }),
    entry('a'),
    entry('request', { requestedBy: 'viewer' }),
    entry('b'),
    entry('c'),
  ];
  const result = queue.shuffleTail(items, 0, () => 0.5);
  assert.equal(result.items[0].id, 'current');
  assert.equal(result.items[1].id, 'queued');
  assert.equal(result.items[2].id, 'request');
  assert.deepEqual(
    result.items.slice(3).map((row) => row.id).sort(),
    ['a', 'b', 'c']
  );
  assert.equal(result.upcoming, 1);
  assert.equal(new Set(result.items.map((row) => row.id)).size, items.length);
  assert.deepEqual(items.map((row) => row.id), ['current', 'queued', 'a', 'request', 'b', 'c']);
});

check('shuffleTail is deterministic with an injected random source', () => {
  const items = [entry('current'), entry('a'), entry('b'), entry('c'), entry('d')];
  const first = queue.shuffleTail(items, 0, () => 0.25);
  const second = queue.shuffleTail(items, 0, () => 0.25);
  assert.deepEqual(first, second);
});

check('shuffleTail leaves short or invalid queues alone', () => {
  const one = [entry('a')];
  const single = queue.shuffleTail(one, 0);
  assert.equal(single.items.length, 1);
  assert.equal(single.items[0].id, 'a');
  assert.equal(single.upcoming, -1);
  const empty = queue.shuffleTail([], -1);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.upcoming, -1);
});

check('restoreTail restores the base order after a shuffle', () => {
  const base = [entry('current'), entry('a'), entry('b'), entry('c'), entry('d')];
  const mixed = queue.shuffleTail(base, 0, () => 0.8);
  const restored = queue.restoreTail(mixed.items, 0, base);
  assert.deepEqual(restored.items.map((row) => row.id), ['current', 'a', 'b', 'c', 'd']);
  assert.equal(restored.upcoming, 1);
});

check('restoreTail keeps queued entries in front and new entries at the end', () => {
  const current = entry('current');
  const a = entry('a');
  const b = entry('b');
  const base = [current, a, b];
  const mixed = [current, b, a];
  const queued = entry('queued', { queued: true });
  const added = entry('new');
  const restored = queue.restoreTail([...mixed, queued, added], 0, base);
  assert.deepEqual(restored.items.map((row) => row.id), ['current', 'queued', 'a', 'b', 'new']);
});

check('upcomingIndex handles next, repeat all, end and queued priority', () => {
  const items = [entry('a'), entry('b'), entry('c')];
  assert.equal(queue.upcomingIndex(items, 0, 'off'), 1);
  assert.equal(queue.upcomingIndex(items, 2, 'off'), -1);
  assert.equal(queue.upcomingIndex(items, 2, 'all'), 0);
  assert.equal(queue.upcomingIndex([entry('a')], 0, 'all'), -1);
  const queuedNext = [entry('a'), entry('queued', { queued: true }), entry('b')];
  assert.equal(queue.upcomingIndex(queuedNext, 0, 'off'), 1);
});

check('nextIndex follows upcoming and wraps in both directions', () => {
  assert.equal(queue.nextIndex(4, 0, 1, 2), 2);
  assert.equal(queue.nextIndex(4, 3, 1, -1), 0);
  assert.equal(queue.nextIndex(4, 0, -1, -1), 3);
  assert.equal(queue.nextIndex(0, -1, 1, -1), -1);
});

check('pendingQueued returns only queued entries after the current one', () => {
  const items = [
    entry('a'),
    entry('b', { queued: true }),
    entry('c'),
    entry('d', { queued: true }),
  ];
  assert.deepEqual(queue.pendingQueued(items, 0).map((row) => row.id), ['b', 'd']);
  assert.deepEqual(queue.pendingQueued(items, 2).map((row) => row.id), ['d']);
});

console.log(`\n${checks} passed, 0 failed`);
