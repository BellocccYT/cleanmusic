'use strict';

/**
 * Interface language – window.CMI18n.
 *
 * Loaded after the catalogs (renderer/i18n/de.js and en.js, which fill
 * window.CM_I18N_CATALOGS) and before app.js.
 *
 * German is the source language and always complete; English falls back to
 * German for keys that are not translated yet. A missing key is reported
 * through missingKeys() (the smoke test uses that) and never renders raw.
 *
 * The language only changes on the next start: app.js calls setLang() from the
 * saved setting once, then applyStatic() translates the static HTML shell.
 * Dynamic views call t() while they render.
 *
 * Pure and DOM-optional, tested in test/i18n.test.js.
 */
(function () {
  const LANGS = ['de', 'en'];
  const DEFAULT_LANG = 'de';
  const LOCALES = { de: 'de', en: 'en' };

  let lang = DEFAULT_LANG;
  let missing = new Set();

  function normalize(value) {
    const raw = String(value == null ? '' : value).trim().toLowerCase();
    if (LANGS.includes(raw)) return raw;
    if (raw.startsWith('en')) return 'en';
    if (raw.startsWith('de')) return 'de';
    return DEFAULT_LANG;
  }

  function catalogFor(target) {
    const catalogs = (typeof window !== 'undefined' && window.CM_I18N_CATALOGS) || {};
    return catalogs[normalize(target)] || {};
  }

  /** Is this key translated in the given language (or the current one)? */
  function has(key, target) {
    return typeof catalogFor(target || lang)[key] === 'string';
  }

  /** Replace {name} placeholders; unknown placeholders stay as they are. */
  function fill(template, params) {
    if (!params || typeof params !== 'object') return template;
    return template.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    );
  }

  function t(key, params) {
    if (!key) return '';
    const name = String(key);
    const primary = catalogFor(lang);
    const fallback = catalogFor(DEFAULT_LANG);
    const text =
      typeof primary[name] === 'string' ? primary[name] : typeof fallback[name] === 'string' ? fallback[name] : '';
    if (!text) {
      missing.add(name);
      return name;
    }
    return fill(text, params);
  }

  function setLang(value) {
    lang = normalize(value);
    return lang;
  }

  function locale() {
    return LOCALES[lang] || LOCALES[DEFAULT_LANG];
  }

  function number(value, options) {
    try {
      return new Intl.NumberFormat(locale(), options).format(value);
    } catch {
      return String(value);
    }
  }

  function date(value, options) {
    const stamp = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(stamp.getTime())) return '';
    try {
      return new Intl.DateTimeFormat(locale(), options).format(stamp);
    } catch {
      return stamp.toLocaleDateString(locale());
    }
  }

  /**
   * Translate the static shell in place. Only elements that carry an explicit
   * attribute are touched, so dynamic views keep their own rendering:
   *   data-i18n                → textContent
   *   data-i18n-title          → title
   *   data-i18n-placeholder    → placeholder
   *   data-i18n-aria-label     → aria-label
   * Unknown keys are skipped (the German text stays) and recorded.
   */
  function applyStatic(root) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || typeof scope.querySelectorAll !== 'function') return 0;
    let translated = 0;

    const text = (element, key) => {
      if (!has(key)) {
        missing.add(key);
        return;
      }
      element.textContent = t(key);
      translated += 1;
    };

    const attribute = (element, attributeName, key) => {
      if (!has(key)) {
        missing.add(key);
        return;
      }
      element.setAttribute(attributeName, t(key));
      translated += 1;
    };

    Array.from(scope.querySelectorAll('[data-i18n]')).forEach((element) => text(element, element.dataset.i18n));
    Array.from(scope.querySelectorAll('[data-i18n-title]')).forEach((element) =>
      attribute(element, 'title', element.dataset.i18nTitle)
    );
    Array.from(scope.querySelectorAll('[data-i18n-placeholder]')).forEach((element) =>
      attribute(element, 'placeholder', element.dataset.i18nPlaceholder)
    );
    Array.from(scope.querySelectorAll('[data-i18n-aria-label]')).forEach((element) =>
      attribute(element, 'aria-label', element.dataset.i18nAriaLabel)
    );

    if (typeof document !== 'undefined' && scope === document) {
      document.documentElement.lang = lang;
      document.documentElement.setAttribute('data-lang', lang);
    }
    return translated;
  }

  function missingKeys() {
    return Array.from(missing);
  }

  function clearMissing() {
    missing = new Set();
  }

  window.CMI18n = {
    LANGS,
    DEFAULT_LANG,
    normalize,
    has,
    t,
    setLang,
    lang: () => lang,
    locale,
    number,
    date,
    applyStatic,
    missingKeys,
    clearMissing,
  };
})();
