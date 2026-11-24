'use strict';

/**
 * Unit tests for renderer/core/migrations.js – schema version, backup before
 * migrating, quarantine for unreadable values, idempotency.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', 'renderer', 'core');
const sandbox = { window: {}, console };
for (const file of ['storage.js', 'persist.js', 'migrations.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, {
    filename: path.join(root, file),
  });
}

const M = sandbox.window.CMMigrations;
const { STORAGE } = sandbox.window.CMPersist;
assert.ok(M, 'window.CMMigrations fehlt');

/** Minimal localStorage stand-in. */
function memoryStorage(initial = {}, { quota = Infinity } = {}) {
  const map = new Map(Object.entries(initial));
  const used = () => [...map.entries()].reduce((sum, [k, v]) => sum + k.length + v.length, 0);
  return {
    get length() {
      return map.size;
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      const next = String(value);
      const before = map.has(key) ? map.get(key).length + key.length : 0;
      if (used() - before + key.length + next.length > quota) throw new Error('QuotaExceededError');
      map.set(key, next);
    },
    removeItem(key) {
      map.delete(key);
    },
    dump() {
      return Object.fromEntries(map);
    },
  };
}

/** A typical 1.20.1 profile (no schema key yet). */
function profile120() {
  return {
    [STORAGE.settings]: JSON.stringify({ layout: 'simple', autoplay: true }),
    [STORAGE.collection]: JSON.stringify({ favorites: [{ id: 'deezer:1', title: 'Song' }], playlists: [] }),
    [STORAGE.history]: JSON.stringify([{ entry: { id: 'deezer:1' }, plays: 3 }]),
    [STORAGE.seenVersion]: JSON.stringify('1.20.1'),
    [STORAGE.volume]: JSON.stringify(0.7),
    'other.app.key': 'nicht unseres',
  };
}

// Values from the vm sandbox have their own Array prototype.
const plain = (value) => JSON.parse(JSON.stringify(value));

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('every persist key has an expected shape', () => {
  Object.keys(STORAGE).forEach((name) => assert.ok(M.SHAPES[name], `SHAPES.${name} fehlt`));
});

check('fresh profile: schema is recorded, no backup needed', () => {
  const storage = memoryStorage();
  let backups = 0;
  const report = M.run({ storage, backup: () => { backups += 1; return { ok: true }; } });
  assert.equal(report.fresh, true);
  assert.equal(report.to, M.SCHEMA_VERSION);
  assert.equal(backups, 0);
  assert.equal(JSON.parse(storage.getItem(M.SCHEMA_KEY)).version, M.SCHEMA_VERSION);
});

check('1.20.1 profile: one backup with every cleanmusic key, data unchanged', () => {
  const storage = memoryStorage(profile120());
  const before = storage.dump();
  const snaps = [];
  const report = M.run({ storage, appVersion: '2.0.0', backup: (data) => { snaps.push(data); return { ok: true, where: 'test' }; } });
  assert.equal(snaps.length, 1);
  assert.equal(report.backup, 'test');
  assert.deepEqual(plain(report.ran), ['baseline']);
  assert.equal(snaps[0].kind, 'schema-snapshot');
  assert.equal(snaps[0].schemaFrom, 0);
  assert.equal(snaps[0].keys[STORAGE.collection], before[STORAGE.collection]);
  assert.equal(snaps[0].keys['other.app.key'], undefined, 'fremde Schlüssel gehören nicht in die Sicherung');
  const after = storage.dump();
  Object.keys(before).forEach((key) => assert.equal(after[key], before[key], `${key} verändert`));
  const meta = JSON.parse(after[M.SCHEMA_KEY]);
  assert.equal(meta.version, M.SCHEMA_VERSION);
  assert.equal(meta.history[0].app, '2.0.0');
});

check('second run is a no-op (idempotent)', () => {
  const storage = memoryStorage(profile120());
  M.run({ storage, backup: () => ({ ok: true }) });
  const once = storage.dump();
  let backups = 0;
  const report = M.run({ storage, backup: () => { backups += 1; return { ok: true }; } });
  assert.equal(backups, 0);
  assert.deepEqual(plain(report.ran), []);
  assert.deepEqual(storage.dump(), once);
});

check('broken JSON moves to quarantine with its raw text', () => {
  const data = profile120();
  data[STORAGE.collection] = '{"favorites": [ kaputt';
  const storage = memoryStorage(data);
  const report = M.run({ storage, backup: () => ({ ok: true }) });
  assert.equal(storage.getItem(STORAGE.collection), null);
  assert.equal(report.quarantined.length, 1);
  assert.equal(report.quarantined[0].name, 'collection');
  assert.equal(report.quarantined[0].label, 'Favoriten und Playlists');
  const box = JSON.parse(storage.getItem(M.QUARANTINE_KEY));
  assert.equal(box.items[0].raw, data[STORAGE.collection]);
  assert.match(box.items[0].reason, /JSON/);
  // everything else is untouched
  assert.equal(storage.getItem(STORAGE.settings), data[STORAGE.settings]);
});

check('wrong type is quarantined, null and scalars are fine', () => {
  const data = profile120();
  data[STORAGE.history] = JSON.stringify({ not: 'an array' });
  data[STORAGE.taste] = 'null';
  const storage = memoryStorage(data);
  const report = M.run({ storage, backup: () => ({ ok: true }) });
  assert.deepEqual(plain(report.quarantined.map((item) => item.name)), ['history']);
  assert.match(report.quarantined[0].reason, /Typ object statt array/);
  assert.equal(storage.getItem(STORAGE.taste), 'null');
  assert.equal(storage.getItem(STORAGE.volume), '0.7');
});

check('failed backup: nothing is migrated, data stays', () => {
  const storage = memoryStorage(profile120());
  const before = storage.dump();
  const report = M.run({ storage, backup: () => ({ ok: false, error: 'Platte voll' }) });
  assert.equal(report.skipped, 'backup-failed');
  assert.deepEqual(plain(report.ran), []);
  assert.equal(storage.getItem(M.SCHEMA_KEY), null);
  assert.deepEqual(storage.dump(), before);
});

check('newer schema (downgrade) is left completely alone', () => {
  const data = profile120();
  data[M.SCHEMA_KEY] = JSON.stringify({ version: M.SCHEMA_VERSION + 4, history: [] });
  data[STORAGE.collection] = 'kaputt, aber von einer neueren Version';
  const storage = memoryStorage(data);
  const report = M.run({ storage, backup: () => { throw new Error('darf nicht laufen'); } });
  assert.equal(report.skipped, 'newer-schema');
  assert.deepEqual(storage.dump(), data);
});

check('quarantine keeps at most 10 entries', () => {
  const storage = memoryStorage();
  M.run({ storage, backup: () => ({ ok: true }) });
  for (let round = 0; round < 12; round += 1) {
    storage.setItem(STORAGE.credits, `kaputt ${round}`);
    M.run({ storage });
  }
  const box = JSON.parse(storage.getItem(M.QUARANTINE_KEY));
  assert.equal(box.items.length, 10);
  assert.equal(box.items[9].raw, 'kaputt 11');
});

check('if the quarantine cannot be written, the value stays', () => {
  const data = { [STORAGE.collection]: 'x'.repeat(50) };
  const storage = memoryStorage(data, { quota: 200 });
  const report = M.run({ storage, backup: () => ({ ok: true }) });
  assert.equal(storage.getItem(STORAGE.collection), data[STORAGE.collection]);
  assert.equal(report.quarantined.length, 0);
  assert.ok(report.errors.some((error) => /Quarantäne/.test(error)));
});

check('snapshot can be restored exactly', () => {
  const original = profile120();
  const storage = memoryStorage(original);
  const snap = M.snapshot(storage, { from: 0, to: 1 });
  const fresh = memoryStorage();
  const written = M.restoreSnapshot(JSON.parse(JSON.stringify(snap)), fresh);
  assert.equal(written, 5);
  assert.equal(fresh.getItem(STORAGE.collection), original[STORAGE.collection]);
  assert.equal(fresh.getItem('other.app.key'), null);
});

check('backups from a newer schema are refused on import', () => {
  assert.equal(M.checkBackup({ schema: M.SCHEMA_VERSION }).ok, true);
  assert.equal(M.checkBackup({}).ok, true, 'alte Sicherungen ohne Schema bleiben importierbar');
  assert.equal(M.checkBackup({ schema: M.SCHEMA_VERSION + 1 }).ok, false);
});

check('migrations are ordered and end at SCHEMA_VERSION', () => {
  const versions = plain(M.MIGRATIONS.map((step) => step.to));
  assert.deepEqual(versions, [...versions].sort((a, b) => a - b));
  assert.equal(versions[versions.length - 1], M.SCHEMA_VERSION);
  assert.equal(new Set(versions).size, versions.length);
});

console.log(`${checks} passed, 0 failed`);
