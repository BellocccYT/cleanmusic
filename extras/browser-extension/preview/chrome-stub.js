'use strict';

/**
 * Preview-only Chrome API stub.
 *
 * Never shipped: build.js copies it next to the extension pages inside
 * preview/build/ so the real popup and options page can render with sample
 * data in a normal browser. It answers exactly the calls those two pages make.
 */

(() => {
  const KEY = 'cmx-preview-settings';
  const DEFAULTS = {
    playerButton: true,
    actionButton: true,
    floatButton: true,
    toasts: true,
    badge: true,
    modifierClicks: true
  };
  const VIDEO = {
    id: 'dQw4w9WgXcQ',
    title: 'Never Gonna Give You Up',
    artist: 'Rick Astley',
    playlist: true,
    site: 'watch'
  };

  function read() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || '{}'));
    } catch {
      return Object.assign({}, DEFAULTS);
    }
  }

  window.chrome = {
    runtime: {
      getManifest: () => ({ version: '2.0.0' }),
      getURL: (file) => file,
      sendMessage: () => Promise.resolve({ ok: true }),
      openOptionsPage: () => {},
      lastError: undefined
    },
    tabs: {
      query: () =>
        Promise.resolve([{ id: 1, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }]),
      sendMessage: () => Promise.resolve(Object.assign({}, VIDEO)),
      create: () => {}
    },
    storage: {
      local: {
        get: (key, callback) => {
          const settings = read();
          const result = typeof key === 'string' ? { [key]: settings } : { settings };
          if (callback) callback(result);
          return Promise.resolve(result);
        },
        set: (values, callback) => {
          try {
            localStorage.setItem(KEY, JSON.stringify((values && values.settings) || {}));
          } catch {
            /* private mode */
          }
          if (callback) callback();
          return Promise.resolve();
        }
      },
      onChanged: { addListener: () => {} }
    },
    commands: {
      getAll: () =>
        Promise.resolve([
          { name: '_execute_action', description: 'Popup öffnen', shortcut: 'Alt+Shift+C' },
          { name: 'add-current', description: 'Zur Warteschlange', shortcut: 'Alt+Shift+S' },
          { name: 'play-current', description: 'Abspielen', shortcut: 'Alt+Shift+P' }
        ])
    }
  };
})();
