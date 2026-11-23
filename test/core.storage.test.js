'use strict';

/**
 * Unit tests for renderer/core/storage.js with a fake localStorage.
 *
 * Run with: npm run test:core
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'storage.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });

const storage = sandbox.window.CMStorage;
assert.ok(storage, 'window.CMStorage fehlt');

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
    data,
  };
}

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('readJSON parses stored values', () => {
  const box = fakeStorage({ key: '{"a":1}' });
  assert.equal(JSON.stringify(storage.readJSON('key', null, box)), '{"a":1}');
});

check('readJSON returns the fallback for missing or broken values', () => {
  const box = fakeStorage({ broken: '{nope' });
  assert.equal(storage.readJSON('missing', 'fallback', box), 'fallback');
  assert.equal(storage.readJSON('broken', 'fallback', box), 'fallback');
});

check('writeJSON stores JSON and reports success', () => {
  const box = fakeStorage();
  assert.equal(storage.writeJSON('key', { a: 1 }, box), true);
  assert.equal(box.data.get('key'), '{"a":1}');
  assert.equal(JSON.stringify(storage.readJSON('key', null, box)), '{"a":1}');
});

check('writeJSON survives a full or blocked storage', () => {
  const box = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
  };
  assert.equal(storage.writeJSON('key', { a: 1 }, box), false);
});

check('missing storage falls back without throwing', () => {
  assert.equal(storage.readJSON('key', 'fallback', null), 'fallback');
  assert.equal(storage.writeJSON('key', {}, null), false);
});

console.log(`\n${checks} passed, 0 failed`);
