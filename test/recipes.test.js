'use strict';

/**
 * Unit tests for renderer/core/recipes.js – rules, filters, interleaving,
 * refresh decisions and explanations of smart playlists.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'recipes.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const R = sandbox.window.CMRecipes;
assert.ok(R, 'window.CMRecipes fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 24, 15, 0, 0).getTime();
const entry = (id, extra = {}) => Object.assign({ id, title: `Titel ${id}`, artist: 'A', kind: 'preview' }, extra);
const ctx = (extra = {}) =>
  Object.assign(
    {
      valid: (item) => Boolean(item && item.id && item.title),
      streamSafe: (item) => item.license === 'CC0',
      disliked: (item) => item.id === 'hate',
      lastPlayed: (id) => (id === 'recent' ? NOW - 2 * DAY : 0),
      bpm: (item) => ({ slow: 80, fast: 150 })[item.id] || 0,
      mood: (item) => ({ slow: 'chill', fast: 'workout' })[item.id] || '',
      now: NOW,
    },
    extra
  );

check('normalize: defaults for empty input', () => {
  const rules = plain(R.normalize(null));
  assert.deepEqual(rules.sources, ['favorites', 'local', 'history']);
  assert.equal(rules.limit, 30);
  assert.equal(rules.refresh, 'manual');
  assert.equal(rules.excludeDislikes, true);
  assert.deepEqual(rules.moods, []);
  assert.deepEqual(rules.kinds, []);
  assert.deepEqual(rules.licenses, []);
  assert.equal(rules.bpmMin, 0);
});

check('normalize: drops unknown values, clamps and swaps BPM', () => {
  const rules = plain(
    R.normalize({
      sources: ['favorites', 'hacker', 'favorites'],
      limit: 9999,
      refresh: 'hourly',
      bpmMin: 300,
      bpmMax: 90,
      moods: ['chill', 'unbekannt'],
      kinds: ['radio', 'local'],
      notPlayedDays: 5,
      why: { a: 'favorites', b: 'evil', c: 42 },
    })
  );
  assert.deepEqual(rules.sources, ['favorites']);
  assert.equal(rules.limit, R.LIMIT_MAX);
  assert.equal(rules.refresh, 'manual');
  assert.equal(rules.bpmMin, 90);
  assert.equal(rules.bpmMax, R.BPM_MAX);
  assert.deepEqual(rules.moods, ['chill']);
  assert.deepEqual(rules.kinds, ['local'], 'Radio gehört nie in ein Rezept');
  assert.equal(rules.notPlayedDays, 0);
  assert.deepEqual(rules.why, { a: 'favorites' });
});

check('rejects: every rule has its reason, accepted is empty', () => {
  const base = R.normalize({});
  assert.equal(R.rejects(entry('x'), base, ctx()), '');
  assert.equal(R.rejects(entry('r', { kind: 'radio' }), base, ctx()), 'radio');
  assert.equal(R.rejects({ id: 'kaputt' }, base, ctx()), 'invalid');
  assert.equal(R.rejects(entry('hate'), base, ctx()), 'dislike');
  assert.equal(R.rejects(entry('x'), R.normalize({ kinds: ['local'] }), ctx()), 'kind');
  assert.equal(R.rejects(entry('x'), R.normalize({ streamSafe: true }), ctx()), 'streamSafe');
  assert.equal(R.rejects(entry('x', { license: 'CC0' }), R.normalize({ streamSafe: true }), ctx()), '');
  assert.equal(R.rejects(entry('x'), R.normalize({ withCredit: true }), ctx()), 'credit');
  assert.equal(R.rejects(entry('recent'), R.normalize({ notPlayedDays: 7 }), ctx()), 'played');
  assert.equal(R.rejects(entry('recent'), R.normalize({ notPlayedDays: 0 }), ctx()), '');
});

check('rejects: BPM range needs a known tempo', () => {
  const rules = R.normalize({ bpmMin: 120, bpmMax: 180 });
  assert.equal(R.rejects(entry('fast'), rules, ctx()), '');
  assert.equal(R.rejects(entry('slow'), rules, ctx()), 'bpm');
  assert.equal(R.rejects(entry('unknown'), rules, ctx()), 'bpmUnknown');
  assert.equal(R.rejects(entry('slow'), R.normalize({ bpmMax: 100 }), ctx()), '');
});

check('rejects: mood filter', () => {
  const rules = R.normalize({ moods: ['chill', 'fokus'] });
  assert.equal(R.rejects(entry('slow'), rules, ctx()), '');
  assert.equal(R.rejects(entry('fast'), rules, ctx()), 'mood');
  assert.equal(R.rejects(entry('ohne'), rules, ctx()), 'mood');
});

check('rejects: explicit licence filter', () => {
  const licenseCtx = ctx({ license: (item) => ({ CC0: 'free', 'CC BY 4.0': 'by', NCS: 'ncs' })[item.license] || 'other' });
  assert.equal(R.rejects(entry('x', { license: 'CC0' }), R.normalize({ licenses: ['free'] }), licenseCtx), '');
  assert.equal(R.rejects(entry('x', { license: 'CC BY 4.0' }), R.normalize({ licenses: ['free'] }), licenseCtx), 'license');
  assert.equal(R.rejects(entry('x', { license: 'CC BY 4.0' }), R.normalize({ licenses: ['by', 'ncs'] }), licenseCtx), '');
  assert.equal(R.rejects(entry('x'), R.normalize({ licenses: [] }), licenseCtx), '', 'leer = egal');
  // Unknown licences are dropped from the rules.
  assert.deepEqual(plain(R.normalize({ licenses: ['free', 'quatsch'] }).licenses), ['free']);
});

check('collect: interleaves sources, no duplicates, respects limit, remembers why', () => {
  const groups = [
    { source: 'favorites', list: [entry('a'), entry('b'), entry('c')] },
    { source: 'local', list: [entry('d', { kind: 'local' }), entry('a'), entry('e', { kind: 'local' })] },
  ];
  const result = R.collect(groups, 4, (item) => item.id);
  assert.deepEqual(plain(result.items.map((item) => item.id)), ['a', 'd', 'b', 'e']);
  assert.equal(result.why.a, 'favorites');
  assert.equal(result.why.d, 'local');
  const byKey = R.collect(groups, 10, (item) => (item.id === 'c' ? 'same' : item.id === 'e' ? 'same' : item.id));
  assert.equal(byKey.items.filter((item) => item.id === 'c' || item.id === 'e').length, 1);
  assert.equal(R.collect([], 5).items.length, 0);
});

check('needsRefresh: manual, on open, daily', () => {
  assert.equal(R.needsRefresh(R.normalize({ refresh: 'manual' }), 'open', NOW), false);
  assert.equal(R.needsRefresh(R.normalize({ refresh: 'onOpen' }), 'open', NOW), true);
  assert.equal(R.needsRefresh(R.normalize({ refresh: 'onOpen' }), 'start', NOW), false);
  assert.equal(R.needsRefresh(R.normalize({ refresh: 'daily', updatedAt: NOW - 60 * 1000 }), 'start', NOW), false);
  assert.equal(R.needsRefresh(R.normalize({ refresh: 'daily', updatedAt: NOW - DAY }), 'start', NOW), true);
  assert.equal(R.needsRefresh(R.normalize({ refresh: 'daily' }), 'open', NOW), true, 'nie aktualisiert');
});

check('chips and explanation are readable', () => {
  const rules = R.normalize({
    sources: ['favorites'],
    bpmMin: 120,
    bpmMax: 140,
    moods: ['workout'],
    kinds: ['local'],
    licenses: ['free', 'by'],
    refresh: 'daily',
    why: { x: 'favorites' },
  });
  const chips = plain(R.chips(rules));
  assert.ok(chips.includes('120–140 BPM'));
  assert.ok(chips.includes('Stimmung: Workout'));
  assert.ok(chips.includes('Lokale Dateien'));
  assert.ok(chips.includes('Lizenz: CC0 / Public Domain, CC BY'));
  assert.ok(chips.includes('Täglich neu'));
  const text = R.explain(rules, 'x', { bpm: 128, mood: 'workout' });
  assert.match(text, /aus „Favoriten“/);
  assert.match(text, /128 BPM/);
  assert.match(text, /Stimmung Workout/);
  assert.match(R.explain(rules, 'unbekannt'), /gewählten Quellen/);
});

check('system recipes: every Mix has valid, daily rules', () => {
  assert.deepEqual(plain(R.SYSTEM_IDS), ['daily', 'fresh', 'discover', 'again', 'deep']);
  R.SYSTEM_IDS.forEach((id) => {
    const rules = R.system(id);
    assert.equal(rules.refresh, 'daily', id);
    assert.ok(rules.sources.length >= 2, id);
    assert.deepEqual(plain(R.normalize(rules)), plain(rules), `${id} ist schon normalisiert`);
  });
  assert.equal(R.system('gibtsnicht'), null);
  assert.notEqual(R.system('daily'), R.system('daily'), 'jedes Mal eine eigene Kopie');
});

console.log(`${checks} passed, 0 failed`);
