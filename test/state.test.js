'use strict';

/**
 * Unit tests for renderer/core/state.js – the Store foundation.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'state.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const S = sandbox.window.CMState;
assert.ok(S, 'window.CMState fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('settings defaults cover the known keys', () => {
  assert.equal(S.SETTINGS_DEFAULTS.theme, 'nacht');
  assert.equal(S.SETTINGS_DEFAULTS.layout, 'advanced');
  assert.equal(S.SETTINGS_DEFAULTS.downloads, 'off');
  assert.equal(S.SETTINGS_DEFAULTS.lyricsEffect, 'pop');
  assert.equal(S.normalizeSettings(null).theme, 'nacht');
});

check('normalizeSettings merges stored over defaults and keeps unknown keys', () => {
  const merged = plain(S.normalizeSettings({ theme: 'dracula', customFlag: true, lyrics: true }));
  assert.equal(merged.theme, 'dracula');
  assert.equal(merged.lyrics, true);
  assert.equal(merged.customFlag, true, 'unbekannte Schlüssel bleiben erhalten');
  assert.equal(merged.layout, 'advanced', 'fehlende Schlüssel kommen aus den Defaults');
  assert.equal(plain(S.normalizeSettings('kaputt')).theme, 'nacht');
  assert.equal(plain(S.normalizeSettings([1, 2])).theme, 'nacht');
});

check('store reads and writes the wrapped object by reference', () => {
  const state = { view: 'home', settings: { theme: 'nacht' } };
  const store = S.createStore(state);
  assert.equal(store.state, state);
  assert.equal(store.get('view'), 'home');
  assert.equal(store.get(), state);
  store.set({ view: 'search' });
  assert.equal(state.view, 'search');
  // Silent writes do not notify.
  let calls = 0;
  store.subscribe(() => { calls += 1; });
  store.set({ view: 'local' }, { silent: true });
  assert.equal(calls, 0);
  store.set({ view: 'local' }); // unchanged value → no notification
  assert.equal(calls, 0);
  store.set({ view: 'mixes' });
  assert.equal(calls, 1);
});

check('patch updates one slice and reports it', () => {
  const state = { settings: { theme: 'nacht', lyrics: false } };
  const store = S.createStore(state);
  const changed = [];
  store.subscribe((_state, keys) => changed.push(keys));
  store.patch('settings', { lyrics: true });
  assert.equal(state.settings.lyrics, true);
  assert.deepEqual(plain(changed), [['settings']]);
  store.patch('settings', { lyrics: true }); // unchanged → nothing
  assert.equal(changed.length, 1);
  store.patch('missing', { a: 1 }); // creates the slice
  assert.deepEqual(plain(state.missing), { a: 1 });
});

check('settings slice helper and subscription', () => {
  const state = { settings: { theme: 'nacht' }, view: 'home' };
  const store = S.createStore(state);
  let settingsCalls = 0;
  const off = store.settings.subscribe(() => { settingsCalls += 1; });
  store.settings.set({ theme: 'ozean' });
  assert.equal(state.settings.theme, 'ozean');
  assert.equal(settingsCalls, 1);
  store.set({ view: 'creator' }); // not a settings change → no settings call
  assert.equal(settingsCalls, 1);
  off();
  store.settings.set({ theme: 'nacht' });
  assert.equal(settingsCalls, 1, 'abgemeldet');
});

check('subscriber errors never break the store or other subscribers', () => {
  const state = { n: 0 };
  const store = S.createStore(state);
  let reached = 0;
  store.subscribe(() => { throw new Error('boom'); });
  store.subscribe(() => { reached += 1; });
  store.set({ n: 1 });
  assert.equal(state.n, 1);
  assert.equal(reached, 1);
  assert.equal(store.listenerCount(), 2);
});

check('set/patch return values and empty input are safe', () => {
  const store = S.createStore({ a: { b: 1 } });
  assert.equal(store.set({}), store.state);
  assert.deepEqual(plain(store.patch('a', {})), { b: 1 });
  assert.equal(typeof store.subscribe('nope'), 'function');
  assert.doesNotThrow(() => store.subscribe('nope')());
});

console.log(`${checks} passed, 0 failed`);
