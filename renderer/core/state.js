'use strict';

/**
 * Store foundation (2.0, Phase 1) – window.CMState.
 *
 * This is the first step of the "Store" refactor: the settings defaults move
 * out of app.js, and a small store wraps the existing state object BY REFERENCE
 * so the old code keeps reading/writing `state` unchanged while new code gets
 * clear actions, selectors and subscribers. Slices are migrated gradually.
 *
 * Pure and DOM-free, loaded before app.js, tested in test/state.test.js.
 */
(function () {
  // Default settings. Lives here so app.js stays a wiring file and the defaults
  // are testable. When you add a setting, add it here (and to the UI).
  const SETTINGS_DEFAULTS = {
    systemBrowser: false,
    fullTracks: true,
    visualizer: true,
    fsVisualizer: true,
    vizStyle: 'radial',
    miniViz: true,
    performance: 'balanced', // saver | balanced | quality

    normalize: false,
    volumeBoost: false,
    bass: 0, // dB, −6 … +9
    treble: 0, // dB, −6 … +6
    theme: 'nacht',
    coverAccent: false,
    autoplay: true, // suggestions after single titles (search)
    markAi: true, // "KI?" badge on labelled AI songs
    background: 'none',
    bgMotion: true,
    bgPulse: false,
    bgBatteryStop: true,
    fsBackground: 'cover-moving',
    streamSafe: false,
    lyrics: false,
    transition: 'off', // off | gapless | crossfade
    layout: 'advanced', // simple | advanced
    lyricsSize: 'm', // s | m | l | xl
    lyricsAlign: 'left', // left | center
    lyricsOffset: 0, // seconds, + = lines come earlier
    lyricsScroll: true,
    lyricsDim: true,
    lyricsFocus: false, // big lyrics, no cover
    vinyl: false, // cover as a spinning record + tonearm
    lyricsEffect: 'pop', // none | pop | karaoke | kinetic
    crossfadeSecs: 6,
    onboarded: false,
    downloads: 'off', // 'off' | 'cutting' – there is deliberately no "everything"
    downloadDir: '',
  };

  // Merge stored settings over the defaults (stored wins). Unknown keys in the
  // stored object are kept, matching the old Object.assign behaviour.
  function normalizeSettings(stored) {
    const input = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    return Object.assign({}, SETTINGS_DEFAULTS, input);
  }

  /**
   * Wrap an existing state object by reference. All mutations go through the
   * store so subscribers hear about them, but direct reads keep working.
   *
   *   const store = CMState.createStore(state);
   *   store.set({ view: 'home' });            // top-level keys
   *   store.patch('settings', { theme: '…' }); // one slice
   *   const off = store.subscribe((state, changed) => { … });
   */
  function createStore(target) {
    const state = target && typeof target === 'object' ? target : {};
    const listeners = new Set();
    let depth = 0;
    const notify = (changed) => {
      if (depth > 0) return;
      depth += 1;
      try {
        listeners.forEach((fn) => {
          try {
            fn(state, changed);
          } catch {
            /* a subscriber must never break the app */
          }
        });
      } finally {
        depth = 0;
      }
    };
    const store = {
      state,
      get: (key) => (key === undefined ? state : state[key]),
      set: (patch, options = {}) => {
        const changed = [];
        Object.keys(patch || {}).forEach((key) => {
          if (state[key] !== patch[key]) {
            state[key] = patch[key];
            changed.push(key);
          }
        });
        if (!options.silent && changed.length) notify(changed);
        return state;
      },
      patch: (key, patch, options = {}) => {
        if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) state[key] = {};
        const before = Object.assign({}, state[key]);
        Object.assign(state[key], patch || {});
        const sliceChanged = Object.keys(patch || {}).some((field) => before[field] !== state[key][field]);
        if (!options.silent && sliceChanged) notify([key]);
        return state[key];
      },
      subscribe: (fn) => {
        if (typeof fn !== 'function') return () => {};
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      notify: () => notify([]),
      listenerCount: () => listeners.size,
    };
    store.settings = {
      get: () => state.settings,
      set: (patch, options) => store.patch('settings', patch, options),
      subscribe: (fn) =>
        store.subscribe((current, changed) => {
          if (!changed || !changed.length || changed.includes('settings')) fn(current.settings, changed);
        }),
    };
    return store;
  }

  window.CMState = {
    SETTINGS_DEFAULTS,
    normalizeSettings,
    createStore,
  };
})();
