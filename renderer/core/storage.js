'use strict';

/**
 * Small localStorage helpers.
 *
 * Loaded before app.js and exposed as window.CMStorage. The optional third
 * parameter makes them testable without a browser; app.js uses the default.
 */
(function () {
  function target(storage) {
    if (storage) return storage;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function readJSON(key, fallback, storage) {
    try {
      const box = target(storage);
      if (!box) return fallback;
      const raw = box.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value, storage) {
    try {
      const box = target(storage);
      if (!box) return false;
      box.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  window.CMStorage = { readJSON, writeJSON };
})();
