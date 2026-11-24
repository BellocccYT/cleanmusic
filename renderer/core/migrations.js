'use strict';

/**
 * Schema version and idempotent migrations for everything CleanMusic keeps in
 * localStorage (2.0, Phase 2).
 *
 * Loaded after core/persist.js and before app.js, exposed as
 * window.CMMigrations, and run once synchronously so app.js only ever reads
 * data in the current shape.
 *
 * Rules:
 *  - Nothing is ever thrown away. A value that cannot be read (broken JSON or
 *    the wrong type) moves to the quarantine key with its raw text.
 *  - Before any migration step runs, a full snapshot of all cleanmusic.* keys
 *    goes to a backup hook (desktop: a file via the main process; elsewhere a
 *    local snapshot key). If that backup fails, nothing is migrated.
 *  - Every migration is idempotent: running it twice changes nothing.
 *  - Data from a newer schema (downgrade) is left completely untouched.
 */
(function () {
  const SCHEMA_VERSION = 1;
  const PREFIX = 'cleanmusic.';
  const SCHEMA_KEY = 'cleanmusic.schema.v1';
  const QUARANTINE_KEY = 'cleanmusic.quarantine.v1';
  const SNAPSHOT_KEY = 'cleanmusic.schema.snapshot.v1';
  const QUARANTINE_LIMIT = 10;
  const LOCAL_SNAPSHOT_LIMIT = 2000000; // characters – localStorage quota is small

  // Expected JSON type per storage name from core/persist.js.
  // 'any' = must only parse. A new key in persist.js needs an entry here
  // (test/migrations.test.js checks that).
  const SHAPES = {
    settings: 'object',
    library: 'object',
    volume: 'any',
    level: 'object',
    playback: 'object',
    collection: 'object',
    matches: 'object',
    recs: 'object',
    credits: 'array',
    openverseCache: 'object',
    downloads: 'object',
    creatorDownloads: 'array',
    seenVersion: 'any',
    creatorUsage: 'object',
    localView: 'object',
    localMoods: 'object',
    stats: 'object',
    bpm: 'object',
    history: 'array',
    taste: 'object',
    eq: 'object',
    cutProjects: 'object',
    autoBackup: 'object',
    nav: 'object',
    onboardingMusic: 'any',
    schema: 'object',
    quarantine: 'object',
    schemaSnapshot: 'object',
    group: 'object',
    supporter: 'object',
  };

  // Human-readable names for messages in the UI.
  const LABELS = {
    settings: 'Einstellungen',
    library: 'Lokale Musik',
    collection: 'Favoriten und Playlists',
    history: 'Hör-Verlauf',
    credits: 'Credits',
    taste: 'Geschmacksprofil',
    stats: 'Rückblick',
    playback: 'Wiedergabe-Stand',
    cutProjects: 'Cutter-Projekte',
    eq: 'Equalizer',
    recs: 'Vorschläge',
  };

  /**
   * Migrations, oldest first. `up(ctx)` gets { storage, read, write, remove, keys }
   * and must be idempotent. Version 1 is the baseline: it records the schema for
   * existing 1.x profiles (after the backup) and changes no data.
   */
  const MIGRATIONS = [
    {
      to: 1,
      name: 'baseline',
      up() {
        /* Bestand aus 1.20.x – Form unverändert, ab hier versioniert. */
      },
    },
  ];

  let lastReport = null;

  function defaultStorage() {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function storageKeys(storage) {
    const keys = [];
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (typeof key === 'string' && key.startsWith(PREFIX)) keys.push(key);
      }
    } catch {
      /* storage not iterable */
    }
    return keys.sort();
  }

  function keyNames() {
    const persist = typeof window !== 'undefined' && window.CMPersist ? window.CMPersist.STORAGE : {};
    const names = {};
    Object.entries(persist || {}).forEach(([name, key]) => { names[key] = name; });
    names[SCHEMA_KEY] = 'schema';
    names[QUARANTINE_KEY] = 'quarantine';
    return names;
  }

  function typeOf(value) {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  function readRaw(storage, key) {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function writeRaw(storage, key, raw) {
    try {
      storage.setItem(key, raw);
      return true;
    } catch {
      return false;
    }
  }

  function readMeta(storage) {
    const raw = readRaw(storage, SCHEMA_KEY);
    if (!raw) return { version: 0, history: [] };
    try {
      const meta = JSON.parse(raw);
      const version = Number(meta && meta.version);
      return {
        version: Number.isInteger(version) && version >= 0 ? version : 0,
        history: Array.isArray(meta && meta.history) ? meta.history.slice(-20) : [],
      };
    } catch {
      return { version: 0, history: [] };
    }
  }

  function writeMeta(storage, meta) {
    return writeRaw(storage, SCHEMA_KEY, JSON.stringify({
      version: meta.version,
      history: meta.history.slice(-20),
    }));
  }

  /** Every cleanmusic.* key with its raw text – exactly what is stored. */
  function snapshot(storage, info = {}) {
    const keys = {};
    storageKeys(storage).forEach((key) => {
      if (key === SNAPSHOT_KEY) return;
      const raw = readRaw(storage, key);
      if (raw !== null) keys[key] = raw;
    });
    return {
      app: 'CleanMusic',
      kind: 'schema-snapshot',
      format: 1,
      schemaFrom: Number(info.from) || 0,
      schemaTo: Number(info.to) || SCHEMA_VERSION,
      appVersion: String(info.appVersion || ''),
      createdAt: new Date(info.now || Date.now()).toISOString(),
      keys,
    };
  }

  /** Put a snapshot back (all keys it contains). Returns the number of keys written. */
  function restoreSnapshot(data, storage = defaultStorage()) {
    if (!storage || !data || data.kind !== 'schema-snapshot' || !data.keys || typeof data.keys !== 'object') return 0;
    let written = 0;
    Object.entries(data.keys).forEach(([key, raw]) => {
      if (typeof key === 'string' && key.startsWith(PREFIX) && typeof raw === 'string' && writeRaw(storage, key, raw)) written += 1;
    });
    return written;
  }

  function defaultBackup(data) {
    const text = JSON.stringify(data);
    const bridge = typeof window !== 'undefined' ? window.cm : null;
    if (bridge && typeof bridge.migrationBackupSync === 'function') {
      try {
        const result = bridge.migrationBackupSync(text, { from: data.schemaFrom, to: data.schemaTo });
        if (result && result.ok) return { ok: true, where: String(result.path || 'Datei') };
        return { ok: false, error: (result && result.error) || 'Sicherung fehlgeschlagen' };
      } catch (error) {
        return { ok: false, error: String((error && error.message) || error) };
      }
    }
    // No file access (e.g. the Android app): keep one local snapshot if it fits.
    if (text.length > LOCAL_SNAPSHOT_LIMIT) return { ok: false, error: 'Sicherung zu groß für den lokalen Speicher' };
    const storage = defaultStorage();
    if (storage && writeRaw(storage, SNAPSHOT_KEY, text)) return { ok: true, where: SNAPSHOT_KEY };
    return { ok: false, error: 'Lokaler Speicher voll' };
  }

  /** Move unreadable values aside. Runs on every start; returns the moved keys. */
  function quarantineBroken(storage, now) {
    const names = keyNames();
    const moved = [];
    const box = (() => {
      try {
        const parsed = JSON.parse(readRaw(storage, QUARANTINE_KEY) || 'null');
        return parsed && Array.isArray(parsed.items) ? parsed : { items: [] };
      } catch {
        return { items: [] };
      }
    })();

    storageKeys(storage).forEach((key) => {
      if (key === QUARANTINE_KEY || key === SNAPSHOT_KEY) return;
      const raw = readRaw(storage, key);
      if (raw === null || raw === '') return;
      const name = names[key];
      const expected = name ? SHAPES[name] || 'any' : 'any';
      let reason = '';
      try {
        const value = JSON.parse(raw);
        const actual = typeOf(value);
        if (expected !== 'any' && actual !== 'null' && actual !== expected) reason = `Typ ${actual} statt ${expected}`;
      } catch {
        reason = 'kein gültiges JSON';
      }
      if (!reason) return;
      box.items.push({ key, name: name || '', reason, at: new Date(now).toISOString(), raw });
      moved.push({ key, name: name || '', label: LABELS[name] || name || key, reason });
    });

    if (!moved.length) return { moved, error: null };
    box.items = box.items.slice(-QUARANTINE_LIMIT);
    if (!writeRaw(storage, QUARANTINE_KEY, JSON.stringify(box))) {
      // Could not park the raw text – leave everything where it is.
      return { moved: [], error: 'Quarantäne konnte nicht gespeichert werden' };
    }
    moved.forEach(({ key }) => {
      try {
        storage.removeItem(key);
      } catch {
        /* stays – app.js falls back to defaults */
      }
    });
    return { moved, error: null };
  }

  function run(options = {}) {
    const storage = options.storage || defaultStorage();
    const backup = typeof options.backup === 'function' ? options.backup : defaultBackup;
    const now = Number(options.now) || Date.now();
    const report = {
      schema: SCHEMA_VERSION,
      from: 0,
      to: SCHEMA_VERSION,
      ran: [],
      quarantined: [],
      backup: null,
      fresh: false,
      skipped: null,
      errors: [],
    };
    lastReport = report;
    if (!storage) {
      report.skipped = 'no-storage';
      return report;
    }

    const meta = readMeta(storage);
    report.from = meta.version;
    if (meta.version > SCHEMA_VERSION) {
      // Newer CleanMusic wrote this – do not touch anything.
      report.skipped = 'newer-schema';
      report.to = meta.version;
      return report;
    }

    const pending = MIGRATIONS.filter((step) => step.to > meta.version && step.to <= SCHEMA_VERSION);
    const hasData = storageKeys(storage).some((key) => key !== SCHEMA_KEY && key !== SNAPSHOT_KEY);

    if (pending.length && hasData) {
      const result = backup(snapshot(storage, { from: meta.version, to: SCHEMA_VERSION, appVersion: options.appVersion, now }));
      if (!result || !result.ok) {
        report.skipped = 'backup-failed';
        report.errors.push((result && result.error) || 'Sicherung fehlgeschlagen');
        report.to = meta.version;
        // Still protect against broken values, but migrate nothing.
        const checked = quarantineBroken(storage, now);
        report.quarantined = checked.moved;
        if (checked.error) report.errors.push(checked.error);
        return report;
      }
      report.backup = result.where || 'ok';
    } else if (pending.length) {
      report.fresh = true;
    }

    const checked = quarantineBroken(storage, now);
    report.quarantined = checked.moved;
    if (checked.error) report.errors.push(checked.error);

    const ctx = {
      storage,
      keys: () => storageKeys(storage),
      read: (key, fallback) => {
        try {
          const raw = readRaw(storage, key);
          return raw ? JSON.parse(raw) : fallback;
        } catch {
          return fallback;
        }
      },
      write: (key, value) => writeRaw(storage, key, JSON.stringify(value)),
      remove: (key) => {
        try {
          storage.removeItem(key);
        } catch {
          /* ignore */
        }
      },
    };

    let version = meta.version;
    for (const step of pending) {
      try {
        step.up(ctx);
        version = step.to;
        meta.history.push({ to: step.to, name: step.name, at: new Date(now).toISOString(), app: String(options.appVersion || '') });
        meta.version = version;
        if (!writeMeta(storage, meta)) throw new Error('Schema-Version konnte nicht gespeichert werden');
        report.ran.push(step.name);
      } catch (error) {
        report.errors.push(`${step.name}: ${(error && error.message) || error}`);
        break;
      }
    }
    report.to = version;
    return report;
  }

  /** Backups (JSON export) carry the schema; newer ones are refused on import. */
  function checkBackup(payload) {
    const schema = Number(payload && payload.schema) || 0;
    if (schema > SCHEMA_VERSION) {
      return { ok: false, reason: 'Diese Sicherung stammt aus einer neueren CleanMusic-Version. Bitte erst CleanMusic aktualisieren.' };
    }
    return { ok: true, schema };
  }

  window.CMMigrations = {
    SCHEMA_VERSION,
    SCHEMA_KEY,
    QUARANTINE_KEY,
    SNAPSHOT_KEY,
    SHAPES,
    LABELS,
    MIGRATIONS,
    run,
    snapshot,
    restoreSnapshot,
    checkBackup,
    report: () => lastReport,
  };

  // Run once before app.js reads anything. Tests load the file with a fake
  // window that has no localStorage, so this is a no-op there.
  try {
    if (typeof window !== 'undefined' && window.localStorage && !window.CM_SKIP_MIGRATIONS) {
      run({ appVersion: (window.cm && window.cm.appVersion) || '' });
    }
  } catch (error) {
    lastReport = { schema: SCHEMA_VERSION, skipped: 'error', errors: [String((error && error.message) || error)], ran: [], quarantined: [] };
  }
})();
