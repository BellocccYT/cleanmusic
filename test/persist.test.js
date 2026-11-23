'use strict';

/**
 * Unit tests for renderer/core/persist.js – the central localStorage keys.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'renderer', 'core');
const sandbox = { window: {} };
for (const file of ['storage.js', 'persist.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {
    filename: path.join(root, file),
  });
}

const { STORAGE, entries } = sandbox.window.CMPersist;
assert.ok(STORAGE, 'window.CMPersist.STORAGE fehlt');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('every key is unique and lives under cleanmusic.', () => {
  const values = Object.values(STORAGE);
  assert.equal(new Set(values).size, values.length);
  values.forEach((value) => assert.match(value, /^cleanmusic\.[a-z0-9.]+$/));
});

check('the important keys are present', () => {
  for (const key of [
    'settings',
    'library',
    'collection',
    'history',
    'taste',
    'nav',
    'onboardingMusic',
    'cutProjects',
    'autoBackup',
  ]) {
    assert.ok(STORAGE[key], `STORAGE.${key} fehlt`);
  }
});

check('entries() lists every key/value pair', () => {
  const rows = entries();
  assert.equal(rows.length, Object.keys(STORAGE).length);
  assert.ok(rows.some(([key, value]) => key === 'collection' && value === STORAGE.collection));
});

check('readJSON/writeJSON remain available through CMStorage', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, value),
  };
  const { readJSON, writeJSON } = sandbox.window.CMStorage;
  assert.equal(writeJSON(STORAGE.settings, { theme: 'nacht' }, storage), true);
  assert.equal(readJSON(STORAGE.settings, null, storage).theme, 'nacht');
});

console.log(`\n${checks} passed, 0 failed`);
