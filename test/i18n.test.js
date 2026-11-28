'use strict';

/**
 * Unit tests for the interface language: catalogs, lookup, fallback,
 * placeholders, language switch and the static HTML translation.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const renderer = path.join(__dirname, '..', 'renderer');
const sandbox = { window: {}, console };
for (const file of ['i18n/de.js', 'i18n/en.js', 'core/i18n.js']) {
  const full = path.join(renderer, file);
  vm.runInNewContext(fs.readFileSync(full, 'utf8'), sandbox, { filename: full });
}

const I = sandbox.window.CMI18n;
const CATALOGS = sandbox.window.CM_I18N_CATALOGS;
assert.ok(I, 'window.CMI18n fehlt');
assert.ok(CATALOGS, 'window.CM_I18N_CATALOGS fehlt');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('both catalogs are there and share exactly the same keys', () => {
  const de = Object.keys(CATALOGS.de).sort();
  const en = Object.keys(CATALOGS.en).sort();
  assert.ok(de.length > 40, `zu wenige Schlüssel: ${de.length}`);
  assert.deepEqual(en, de);
});

check('every text is a non-empty string', () => {
  Object.entries(CATALOGS).forEach(([lang, catalog]) => {
    Object.entries(catalog).forEach(([key, text]) => {
      assert.equal(typeof text, 'string', `${lang}.${key} ist kein Text`);
      assert.ok(text.trim().length > 0, `${lang}.${key} ist leer`);
      assert.ok(!/\s/.test(key), `Schlüssel mit Leerzeichen: ${key}`);
    });
  });
});

check('German is the default and lookup works', () => {
  assert.equal(I.lang(), 'de');
  assert.equal(I.DEFAULT_LANG, 'de');
  assert.equal(I.t('nav.search'), 'Suche');
  assert.equal(Array.from(I.LANGS).join(','), 'de,en');
});

check('setLang switches the lookup', () => {
  assert.equal(I.setLang('en'), 'en');
  assert.equal(I.lang(), 'en');
  assert.equal(I.t('nav.search'), 'Search');
  assert.equal(I.locale(), 'en');
  assert.equal(I.setLang('de'), 'de');
  assert.equal(I.t('nav.search'), 'Suche');
  assert.equal(I.locale(), 'de');
});

check('language codes are normalized', () => {
  assert.equal(I.normalize('en-US'), 'en');
  assert.equal(I.normalize('EN'), 'en');
  assert.equal(I.normalize('de-AT'), 'de');
  assert.equal(I.normalize('fr'), 'de');
  assert.equal(I.normalize(''), 'de');
  assert.equal(I.normalize(null), 'de');
  assert.equal(I.normalize(undefined), 'de');
});

check('unknown keys fall back to German, then to the key', () => {
  const catalog = CATALOGS.en;
  const backup = catalog['nav.search'];
  delete catalog['nav.search'];
  I.setLang('en');
  assert.equal(I.t('nav.search'), 'Suche', 'Englisch fällt auf Deutsch zurück');
  catalog['nav.search'] = backup;

  I.clearMissing();
  assert.equal(I.t('does.not.exist'), 'does.not.exist');
  assert.equal(I.missingKeys().join(','), 'does.not.exist');
  I.setLang('de');
});

check('placeholders are filled, unknown ones stay', () => {
  assert.equal(I.t('nav.moreServices', { count: 3 }), 'Weitere Dienste (3)');
  I.setLang('en');
  assert.equal(I.t('nav.moreServices', { count: 3 }), 'More services (3)');
  assert.equal(I.t('nav.moreServices'), 'More services ({count})');
  assert.equal(I.t('nav.moreServices', { other: 1 }), 'More services ({count})');
  I.setLang('de');
});

check('has() checks a language without switching to it', () => {
  assert.equal(I.has('nav.home'), true);
  assert.equal(I.has('nav.home', 'en'), true);
  assert.equal(I.has('does.not.exist'), false);
  assert.equal(I.lang(), 'de');
});

check('numbers and dates follow the language', () => {
  assert.equal(typeof I.number(1234.5), 'string');
  assert.ok(I.number(1234.5).replace(/\D/g, '').includes('12345'));
  const stamp = Date.UTC(2026, 10, 28, 12, 0, 0);
  assert.ok(I.date(stamp).length > 0);
  assert.equal(I.date('kein Datum'), '');
});

check('every key used in the UI exists in both catalogs', () => {
  const files = [
    path.join(renderer, 'app.js'),
    path.join(renderer, 'audio', 'playback.js'),
    path.join(renderer, 'index.html'),
  ];
  const namespaces = [
    'lang', 'common', 'topbar', 'nav', 'player', 'playback', 'fs', 'settings',
    'status', 'row', 'recs', 'search', 'fav', 'playlist', 'presets', 'mixes',
    'radio', 'local', 'queue', 'menu', 'artist', 'import', 'dl', 'lyrics', 'share', 'smart',
  ];
  const used = new Set();
  files.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    // t('key') – the usual call
    for (const match of source.matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)) used.add(match[1]);
    // static attributes in the HTML shell
    for (const match of source.matchAll(/data-i18n(?:-title|-placeholder|-aria-label)?="([A-Za-z0-9_.]+)"/g)) {
      used.add(match[1]);
    }
    // keys chosen by a ternary, e.g. t(x ? 'dl.savedExisting' : 'dl.saved')
    for (const match of source.matchAll(/'([a-z]+(?:\.[A-Za-z0-9]+)+)'/g)) {
      if (namespaces.includes(match[1].split('.')[0])) used.add(match[1]);
    }
  });
  // Source names (not UI keys) that look like dotted translation keys.
  const NOT_KEYS = new Set(['lyrics.ovh']);
  const unknown = Array.from(used)
    .filter((key) => !NOT_KEYS.has(key))
    .filter((key) => !CATALOGS.de[key] || !CATALOGS.en[key])
    .sort();
  assert.deepEqual(unknown, [], `unbekannte Schlüssel: ${unknown.slice(0, 10).join(', ')}`);
  assert.ok(used.size > 300, `zu wenige gefundene Schlüssel: ${used.size}`);
});

/** Minimal DOM stand-in: only what applyStatic touches. */
const ATTRIBUTE_TO_DATASET = {
  '[data-i18n]': 'i18n',
  '[data-i18n-title]': 'i18nTitle',
  '[data-i18n-placeholder]': 'i18nPlaceholder',
  '[data-i18n-aria-label]': 'i18nAriaLabel',
  '[data-i18n-html]': 'i18nHtml',
};

function fakeDocument(nodes) {
  const element = { lang: '', attrs: {}, dataset: {} };
  element.setAttribute = (name, value) => {
    element.attrs[name] = value;
  };
  return {
    documentElement: element,
    querySelectorAll: (selector) => {
      const field = ATTRIBUTE_TO_DATASET[selector];
      if (!field) return [];
      return nodes.filter((node) => Object.prototype.hasOwnProperty.call(node.dataset, field));
    },
  };
}

function node(dataset, text) {
  const element = { dataset, textContent: text || '', attrs: {} };
  element.setAttribute = (name, value) => {
    element.attrs[name] = value;
  };
  return element;
}

check('applyStatic translates text and attributes, skips unknown keys', () => {
  const text = node({ i18n: 'nav.search' }, 'Suche');
  const title = node({ i18nTitle: 'player.next' }, '');
  const placeholder = node({ i18nPlaceholder: 'topbar.searchPlaceholder' }, '');
  const aria = node({ i18nAriaLabel: 'player.queue' }, '');
  const unknown = node({ i18n: 'does.not.exist' }, 'bleibt');
  const document = fakeDocument([text, title, placeholder, aria, unknown]);

  sandbox.document = document;
  try {
    I.setLang('en');
    const count = I.applyStatic(document);
    assert.equal(count, 4);
    assert.equal(text.textContent, 'Search');
    assert.equal(title.attrs.title, 'Next');
    assert.equal(placeholder.attrs.placeholder, 'Search for a song, artist or album …');
    assert.equal(aria.attrs['aria-label'], 'Queue');
    assert.equal(unknown.textContent, 'bleibt');
    assert.equal(document.documentElement.lang, 'en');
    assert.equal(document.documentElement.attrs['data-lang'], 'en');
  } finally {
    delete sandbox.document;
    I.setLang('de');
  }
});

console.log(`${checks} passed, 0 failed`);
