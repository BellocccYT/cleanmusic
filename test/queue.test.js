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

check('insertPosition: after the current title, skipping queued ones at the end', () => {
  const items = [entry('a'), entry('q1', { queued: true }), entry('q2', { queued: true }), entry('b')];
  assert.equal(queue.insertPosition(items, 0, 'next'), 1);
  assert.equal(queue.insertPosition(items, 0, 'end'), 3, 'überspringt die eingereihten Titel');
  assert.equal(queue.insertPosition(items, 1, 'next'), 2);
  assert.equal(queue.insertPosition([], -1, 'end'), -1);
  assert.equal(queue.insertPosition(items, 3, 'end'), 4);
});

check('removeAt and moveAt never touch the running title or earlier ones', () => {
  const items = [entry('a'), entry('b'), entry('c'), entry('d')];
  const removed = queue.removeAt(items, 1, 3);
  assert.equal(removed.changed, true);
  assert.deepEqual(removed.items.map((row) => row.id), ['a', 'b', 'c']);
  assert.equal(queue.removeAt(items, 1, 1).changed, false, 'laufender Titel');
  assert.equal(queue.removeAt(items, 1, 0).changed, false, 'davor');
  assert.equal(queue.removeAt(items, 1, 9).changed, false, 'außerhalb');
  assert.deepEqual(items.map((row) => row.id), ['a', 'b', 'c', 'd'], 'Eingabe bleibt unberührt');

  const moved = queue.moveAt(items, 0, 3, 1);
  assert.equal(moved.changed, true);
  assert.deepEqual(moved.items.map((row) => row.id), ['a', 'd', 'b', 'c']);
  assert.equal(queue.moveAt(items, 1, 1, 2).changed, false, 'laufender Titel');
  assert.equal(queue.moveAt(items, 0, 2, 2).changed, false, 'gleiche Position');
});

check('clearAdded drops queued and autoplay titles after the current one', () => {
  const items = [
    entry('played'),
    entry('current'),
    entry('q', { queued: true }),
    entry('ctx'),
    entry('auto', { autoplay: true }),
  ];
  const result = queue.clearAdded(items, 1);
  assert.deepEqual(result.items.map((row) => row.id), ['played', 'current', 'ctx']);
  assert.equal(result.removed, 2);
  assert.equal(queue.clearAdded(items, -1).removed, 0);
  assert.equal(queue.clearAdded([], 0).removed, 0);
});

check('seedIndex walks back to the last accepted title', () => {
  const items = [entry('radio', { kind: 'radio' }), entry('good'), entry('bad'), entry('current')];
  const accept = (row) => row.kind !== 'radio' && row.id !== 'bad' && row.id !== 'current';
  assert.equal(queue.seedIndex(items, 3, accept), 1);
  assert.equal(queue.seedIndex(items, 1, accept), 1);
  assert.equal(queue.seedIndex(items, 3, () => false), -1);
  assert.equal(queue.seedIndex(items, 3, null), -1);
});

console.log(`\n${checks} passed, 0 failed`);
