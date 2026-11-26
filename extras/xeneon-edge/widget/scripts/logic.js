/*
 * CleanMusic Xeneon Edge widget - pure logic.
 *
 * Everything in here is DOM-free and tested in test/xeneon-edge.test.js via
 * vm. The UI script (widget.js) only renders what these functions decide.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CMLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FALLBACK_ACCENT = '#5b8cff';
  var FALLBACK_FROM = '#122036';
  var FALLBACK_TO = '#070a12';

  function clamp(value, min, max, fallback) {
    var n = Number(value);
    if (!Number.isFinite(n)) return fallback === undefined ? min : fallback;
    return Math.max(min, Math.min(max, n));
  }

  function text(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function bool(value) {
    return value === true;
  }

  /* ---------------------------------------------------------------- *
   * Colours
   * ---------------------------------------------------------------- */

  function parseHex(value) {
    var raw = String(value == null ? '' : value).trim();
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
      return {
        r: parseInt(raw[1] + raw[1], 16),
        g: parseInt(raw[2] + raw[2], 16),
        b: parseInt(raw[3] + raw[3], 16),
      };
    }
    if (/^#[0-9a-f]{6}$/i.test(raw)) {
      return {
        r: parseInt(raw.slice(1, 3), 16),
        g: parseInt(raw.slice(3, 5), 16),
        b: parseInt(raw.slice(5, 7), 16),
      };
    }
    return null;
  }

  function toHex(rgb) {
    var part = function (n) {
      return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    };
    return '#' + part(rgb.r) + part(rgb.g) + part(rgb.b);
  }

  function channel(value) {
    var c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }

  function luminance(rgb) {
    if (!rgb) return 0;
    return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
  }

  function contrast(a, b) {
    var la = luminance(a);
    var lb = luminance(b);
    var light = Math.max(la, lb);
    var dark = Math.min(la, lb);
    return (light + 0.05) / (dark + 0.05);
  }

  function mix(a, b, amount) {
    var t = clamp(amount, 0, 1, 0);
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
    };
  }

  function ensureContrast(foreground, background, minimum) {
    var fg = parseHex(foreground);
    var bg = parseHex(background);
    if (!fg) return '#ffffff';
    if (!bg) return toHex(fg);
    var min = Number(minimum) > 0 ? Number(minimum) : 4.5;
    if (contrast(fg, bg) >= min) return toHex(fg);
    var target = luminance(bg) > 0.35 ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };
    var best = target;
    for (var step = 1; step <= 20; step += 1) {
      var candidate = mix(fg, target, step / 20);
      best = candidate;
      if (contrast(candidate, bg) >= min) return toHex(candidate);
    }
    return toHex(best);
  }

  function backgroundStops(colors, customBackground, fallbackAccent) {
    var list = Array.isArray(colors) ? colors : [];
    var first = parseHex(list[0]);
    var second = parseHex(list[1]) || first;
    var accent = parseHex(fallbackAccent) ? String(fallbackAccent) : FALLBACK_ACCENT;
    var base = parseHex(customBackground);

    if (base) {
      return {
        from: toHex(mix(base, { r: 255, g: 255, b: 255 }, 0.09)),
        to: toHex(mix(base, { r: 0, g: 0, b: 0 }, 0.32)),
        accent: first ? toHex(first) : accent,
      };
    }

    if (!first) {
      return { from: FALLBACK_FROM, to: FALLBACK_TO, accent: accent };
    }

    var nearBlack = { r: 5, g: 7, b: 12 };
    return {
      from: toHex(mix(mix(first, second, 0.42), nearBlack, 0.62)),
      to: toHex(mix(second, nearBlack, 0.84)),
      accent: toHex(first),
    };
  }

  /* ---------------------------------------------------------------- *
   * Layout
   * ---------------------------------------------------------------- */

  function layoutFor(width, height, preference) {
    var w = clamp(width, 0, 100000, 0);
    var h = clamp(height, 0, 100000, 0);
    if (w < 2 || h < 2) return 'compact';
    var pref = String(preference || 'auto');
    if (pref === 'compact') return 'compact';
    if (pref === 'large') return h > w * 1.02 ? (h > w * 1.6 ? 'tall' : 'portrait') : w >= 1500 ? 'wide' : 'medium';
    if (h > w * 1.6) return 'tall';
    if (h > w * 1.02) return 'portrait';
    if (w >= 1600) return 'wide';
    if (w >= 900 || (w >= 780 && h >= 620)) return 'medium';
    return 'compact';
  }

  function queueRows(layout) {
    if (layout === 'wide') return 4;
    if (layout === 'medium') return 3;
    return 0;
  }

  /* ---------------------------------------------------------------- *
   * Time and progress
   * ---------------------------------------------------------------- */

  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function fmtTime(seconds) {
    var total = Math.max(0, Math.floor(Number(seconds) || 0));
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var rest = total % 60;
    return hours > 0 ? hours + ':' + pad(minutes) + ':' + pad(rest) : minutes + ':' + pad(rest);
  }

  function projectedPosition(state, now) {
    if (!state || typeof state !== 'object') return 0;
    var position = clamp(state.position, 0, 24 * 3600, 0);
    var duration = clamp(state.duration, 0, 24 * 3600, 0);
    if (bool(state.live)) return 0;
    if (bool(state.playing)) {
      var at = Number(state.at) || 0;
      var clock = Number(now) || 0;
      if (at > 0 && clock > at) position += Math.min(5, (clock - at) / 1000);
    }
    if (duration > 0) position = Math.min(duration, position);
    return Math.max(0, position);
  }

  function progressFraction(position, duration) {
    var d = Number(duration) || 0;
    if (!(d > 0)) return 0;
    return clamp((Number(position) || 0) / d, 0, 1, 0);
  }

  /* ---------------------------------------------------------------- *
   * Gestures
   * ---------------------------------------------------------------- */

  function gestureFor(dx, dy, minimum) {
    var min = Number(minimum) > 0 ? Number(minimum) : 48;
    var x = Number(dx) || 0;
    var y = Number(dy) || 0;
    if (Math.abs(x) >= min && Math.abs(x) > Math.abs(y) * 1.25) {
      return x < 0 ? 'next' : 'previous';
    }
    if (Math.abs(y) >= min && Math.abs(y) > Math.abs(x) * 1.25) {
      return y < 0 ? 'louder' : 'quieter';
    }
    return '';
  }

  function clampVolume(value) {
    return clamp(value, 0, 1.5, 0);
  }

  function volumePercent(value) {
    return Math.round(clampVolume(value) * 100);
  }

  /* ---------------------------------------------------------------- *
   * State from the plugin - only known fields, never paths or URLs
   * ---------------------------------------------------------------- */

  function coverPath(value) {
    var raw = text(value, 120);
    return /^\/api\/cover\?v=[a-f0-9]{20}$/.test(raw) ? raw : '';
  }

  function sanitizeState(raw) {
    var source = raw && typeof raw === 'object' ? raw : {};
    var track = source.track && typeof source.track === 'object' ? source.track : null;
    var caps = source.capabilities && typeof source.capabilities === 'object' ? source.capabilities : {};
    var lyric = source.lyric && typeof source.lyric === 'object' ? source.lyric : null;
    var colors = [];

    if (track && Array.isArray(track.colors)) {
      track.colors.forEach(function (color) {
        var parsed = parseHex(color);
        if (parsed && colors.length < 3) colors.push(toHex(parsed));
      });
    }

    return {
      appVersion: text(source.appVersion, 20),
      at: clamp(source.at, 0, 9000000000000, Date.now()),
      capabilities: {
        seek: bool(caps.seek),
        like: bool(caps.like),
        spectrum: bool(caps.spectrum),
      },
      track: track
        ? {
            title: text(track.title, 200),
            artist: text(track.artist, 200),
            album: text(track.album, 200),
            kind: text(track.kind, 20),
            live: bool(track.live) || track.kind === 'radio',
            colors: colors,
            cover: coverPath(track.cover),
          }
        : null,
      playing: bool(source.playing),
      position: clamp(source.position, 0, 24 * 3600, 0),
      duration: clamp(source.duration, 0, 24 * 3600, 0),
      volume: clampVolume(source.volume),
      muted: bool(source.muted),
      favorite: source.favorite === true ? true : source.favorite === false ? false : null,
      lyricsOn: bool(source.lyricsOn) || Boolean(lyric),
      lyric: lyric
        ? { line: text(lyric.line, 300), next: text(lyric.next, 300) }
        : null,
      upNext: (Array.isArray(source.upNext) ? source.upNext : [])
        .slice(0, 4)
        .map(function (entry) {
          return {
            title: text(entry && entry.title, 200),
            artist: text(entry && entry.artist, 200),
            cover: coverPath(entry && entry.cover),
          };
        }),
    };
  }

  function letterFor(title) {
    var clean = text(title, 80);
    return clean ? clean[0].toUpperCase() : '♪';
  }

  return {
    FALLBACK_ACCENT: FALLBACK_ACCENT,
    clamp: clamp,
    parseHex: parseHex,
    toHex: toHex,
    luminance: luminance,
    contrast: contrast,
    ensureContrast: ensureContrast,
    backgroundStops: backgroundStops,
    layoutFor: layoutFor,
    queueRows: queueRows,
    fmtTime: fmtTime,
    projectedPosition: projectedPosition,
    progressFraction: progressFraction,
    gestureFor: gestureFor,
    clampVolume: clampVolume,
    volumePercent: volumePercent,
    sanitizeState: sanitizeState,
    letterFor: letterFor,
  };
});
