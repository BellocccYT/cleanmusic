/* cleanmusic-plugin
{
  "apiVersion": 3,
  "name": "OBS-Audio-Visualizer",
  "version": "1.3.0",
  "description": "Echtes Live-Spektrum der laufenden Musik als OBS-Browserquelle.",
  "permissions": ["player", "visualizer", "server:local", "clipboard", "external-links", "ui:settings"]
}
*/
'use strict';

/**
 * CleanMusic plugin: audio-reactive OBS visualizer (optional, API v2).
 *
 * Not part of CleanMusic itself and never loaded automatically. To use it,
 * add this file under Einstellungen → Plugins → „Plugin hinzufügen“ and
 * switch it on.
 *
 * - Transparent browser-source page: http://127.0.0.1:4789/visualizer
 *   (?style=bars | steps | mirror | radial | radial-steps | radial-wave |
 *   wave | meter | meter-steps | history overrides the style from settings;
 *   every other setting can be overridden per source the same way, plus a
 *   few URL-only fine-tuning options – see extras/plugins/README.md)
 * - Live spectrum via Server-Sent Events (/events), JSON at /visualizer.json
 * - Uses the real analyser from CleanMusic (plugin flag `visualizer: true`),
 *   so the bars follow the music instead of just the play state.
 * - 1.3.0: display effects in the spirit of the OBS "Waveform" plugin
 *   (stepped bars, level meters, radial arc/rotation, colour modes, inertia,
 *   frequency range, mirrored axis, normalisation, sync delay). Own code,
 *   built only on the 32 spectrum bands CleanMusic hands to plugins.
 *
 * The server listens on 127.0.0.1 only and answers only requests whose Host
 * is 127.0.0.1/localhost, so websites cannot read it (DNS rebinding).
 */

const http = require('node:http');

let ctx = null;
let server = null;
let serverPort = 0;
let serverError = null;
let keepAlive = null;
let broadcastTimer = null;
let player = null;
let visualizer = { spectrum: [], level: 0, at: 0 };
const clients = new Set();
const STYLES = [
  'bars',
  'steps',
  'mirror',
  'radial',
  'radial-steps',
  'radial-wave',
  'wave',
  'meter',
  'meter-steps',
  'history',
];
const COLOR_MODES = ['auto', 'solid', 'gradient', 'line', 'pulse', 'pulse-freq', 'range'];
const SMOOTHING = ['normal', 'fast', 'time', 'time-fast'];
const METER_MODES = ['rms', 'peak'];

const DEFAULTS = {
  port: 4789,
  style: 'bars',
  sensitivity: 1.15,
  bars: 32,
  width: 100,
  gap: 3,
  glow: true,
  background: false,
  showTitle: false,
  hideOnPause: true,
  // 1.3.0 – all defaults keep the look of 1.2.0.
  colorMode: 'auto',
  colors: '',
  smoothing: 'normal',
  inertia: 88,
  range: '30-16000',
  mirrorX: false,
  stepSize: 8,
  stepGap: 4,
  radialArc: 360,
  radialRotation: 0,
  meterMode: 'rms',
  normalize: false,
  hideOnSilence: false,
  delay: 0,
};
// Everything the overlay page needs (the port stays on the server).
const PAGE_KEYS = Object.keys(DEFAULTS).filter((key) => key !== 'port');

function settings() {
  return Object.assign({}, DEFAULTS, ctx ? ctx.settings.get() : {});
}

function visualizerUrl() {
  return `http://127.0.0.1:${serverPort || settings().port}/visualizer`;
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

function payload() {
  const s = settings();
  const p = player || {};
  const track = p.track || null;
  const out = {
    track: track
      ? {
          title: track.title || '',
          artist: track.artist || '',
          artwork: track.artwork || '',
          colors: Array.isArray(track.colors) ? track.colors : [],
        }
      : null,
    playing: Boolean(p.playing),
    live: Boolean(p.live),
    spectrum: Array.isArray(visualizer.spectrum) ? visualizer.spectrum : [],
    level: Number(visualizer.level) || 0,
  };
  PAGE_KEYS.forEach((key) => {
    out[key] = typeof DEFAULTS[key] === 'boolean' ? Boolean(s[key]) : s[key];
  });
  return out;
}

function broadcast() {
  clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    const data = `data: ${JSON.stringify(payload())}\n\n`;
    clients.forEach((res) => {
      try {
        res.write(data);
      } catch {
        clients.delete(res);
      }
    });
  }, 30);
}

/* ------------------------------------------------------------------ *
 * HTTP server
 * ------------------------------------------------------------------ */

function send(res, status, type, body) {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function handle(req, res) {
  const host = String(req.headers.host || '');
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) {
    send(res, 403, 'text/plain; charset=utf-8', 'Nur lokal erreichbar.');
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, 'text/plain; charset=utf-8', 'Nur GET.');
    return;
  }

  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/' || url.pathname === '/visualizer') {
    const style = STYLES.includes(url.searchParams.get('style')) ? url.searchParams.get('style') : '';
    send(res, 200, 'text/html; charset=utf-8', visualizerHtml(style));
    return;
  }
  if (url.pathname === '/visualizer.json') {
    send(res, 200, 'application/json; charset=utf-8', JSON.stringify(payload()));
    return;
  }
  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    res.write(`retry: 2000\ndata: ${JSON.stringify(payload())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  send(res, 404, 'text/plain; charset=utf-8', 'Nicht gefunden.');
}

function stop() {
  clearInterval(keepAlive);
  keepAlive = null;
  clients.forEach((res) => {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  });
  clients.clear();
  if (server) {
    try {
      server.close();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    } catch {
      /* ignore */
    }
  }
  server = null;
  serverPort = 0;
}

function start() {
  stop();
  serverError = null;
  const port = Math.round(Number(settings().port)) || 4789;
  return new Promise((resolve) => {
    const candidate = http.createServer(handle);
    candidate.on('error', (error) => {
      serverError =
        error.code === 'EADDRINUSE'
          ? `Port ${port} ist schon belegt – wähle in den Einstellungen einen anderen.`
          : error.message;
      server = null;
      resolve(false);
    });
    candidate.listen(port, '127.0.0.1', () => {
      server = candidate;
      serverPort = port;
      keepAlive = setInterval(() => {
        clients.forEach((res) => {
          try {
            res.write(': ping\n\n');
          } catch {
            clients.delete(res);
          }
        });
      }, 20000);
      resolve(true);
    });
  });
}

/* ------------------------------------------------------------------ *
 * Overlay page (OBS browser source, transparent)
 *
 * The page script is plain ES2017 without template strings, so it can live
 * inside this template literal. It draws at most 60 frames per second.
 * ------------------------------------------------------------------ */

function visualizerHtml(forcedStyle) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>CleanMusic · Visualizer</title>
<style>
  html, body { margin: 0; width: 100%; height: 100%; background: transparent; overflow: hidden; }
  body { font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; }
  #viz { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  #title { position: absolute; left: 4%; bottom: 6%; margin: 0; max-width: 92%; color: #fff;
           font-size: 18px; font-weight: 700; letter-spacing: .01em; white-space: nowrap; overflow: hidden;
           text-overflow: ellipsis; text-shadow: 0 2px 10px rgba(0,0,0,.85), 0 0 3px rgba(0,0,0,.9);
           opacity: 0; transition: opacity .35s ease; pointer-events: none; }
  #title.show { opacity: .92; }
</style>
</head>
<body>
<canvas id="viz"></canvas>
<div id="title"></div>
<script>
(() => {
  'use strict';
  const forced = ${JSON.stringify(forcedStyle || '')};
  const STYLES = ${JSON.stringify(STYLES)};
  const canvas = document.getElementById('viz');
  const title = document.getElementById('title');
  const g = canvas.getContext('2d');

  // CleanMusic sends 32 log-spaced bands from 30 Hz to 16 kHz (0-255).
  const BAND_LO = 30;
  const BAND_HI = 16000;
  const LOG_SPAN = Math.log(BAND_HI / BAND_LO);
  const FRAME_MS = 1000 / 60;
  const HISTORY_RATE = 30;
  const RANGE_HOT = [255, 84, 96, 1];

  // Every option can be overridden per browser source (?colorMode=range&radialArc=180).
  // The last block exists only as URL parameters.
  const SPEC = {
    bars: ['num', 8, 64],
    width: ['num', 30, 100],
    gap: ['num', 0, 20],
    sensitivity: ['num', 0.5, 2],
    glow: ['bool'],
    background: ['bool'],
    showTitle: ['bool'],
    hideOnPause: ['bool'],
    colorMode: ['enum', ${JSON.stringify(COLOR_MODES)}],
    colors: ['text'],
    smoothing: ['enum', ${JSON.stringify(SMOOTHING)}],
    inertia: ['num', 0, 98],
    range: ['text'],
    mirrorX: ['bool'],
    stepSize: ['num', 2, 64],
    stepGap: ['num', 0, 32],
    radialArc: ['num', 10, 360],
    radialRotation: ['num', 0, 360],
    meterMode: ['enum', ${JSON.stringify(METER_MODES)}],
    normalize: ['bool'],
    hideOnSilence: ['bool'],
    delay: ['num', 0, 1000],
    minHeight: ['num', 0, 200],
    rounded: ['bool'],
    inner: ['num', 5, 90],
    invert: ['bool'],
    slope: ['num', 0, 10],
    rolloff: ['num', 0, 4],
    blur: ['num', 0, 4],
    interp: ['enum', ['linear', 'nearest', 'cubic']],
    scale: ['enum', ['log', 'linear']],
    ratio: ['num', 0.25, 4],
    floor: ['num', 0, 90],
    ceil: ['num', 10, 100],
    mid: ['num', 5, 95],
    crest: ['num', 6, 100],
    seconds: ['num', 1, 30],
    maxGain: ['num', 1, 8],
  };
  const DEFAULTS = {
    bars: 32, width: 100, gap: 3, sensitivity: 1.15, glow: true, background: false, showTitle: false,
    hideOnPause: true, colorMode: 'auto', colors: '', smoothing: 'normal', inertia: 88, range: '30-16000',
    mirrorX: false, stepSize: 8, stepGap: 4, radialArc: 360, radialRotation: 0, meterMode: 'rms',
    normalize: false, hideOnSilence: false, delay: 0, minHeight: 0, rounded: true, inner: 0, invert: false,
    slope: 0, rolloff: 0, blur: 0, interp: 'linear', scale: 'log', ratio: 1, floor: 0, ceil: 100, mid: 65,
    crest: 85, seconds: 6, maxGain: 4,
  };
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  const query = {};
  try {
    new URLSearchParams(window.location.search).forEach((value, key) => {
      if (own(SPEC, key)) query[key] = value;
    });
  } catch (e) {}

  let BANDS = 32;
  let target = new Float32Array(BANDS);
  let current = new Float32Array(BANDS);
  let points = new Float32Array(BANDS);
  let source = new Float32Array(0);
  let widthPct = 100;
  let gapPx = 3;
  let data = null;
  let opts = null;
  let colorA = [91, 140, 255];
  let colorB = [53, 224, 192];
  let opacity = 1;
  let titleKey = '';
  let dpr = 1;
  let meterTarget = 0;
  let meter = 0;
  let hold = 0;
  let holdAt = 0;
  let pulseTarget = 0;
  let pulse = 0;
  let envelope = 0.6;
  let normGain = 1;
  let silentSince = 0;
  let lastProcess = 0;
  let history = new Float32Array(180);
  let histPos = 0;
  let histAcc = 0;
  let lastTick = 0;
  let prevDraw = 0;
  let frames = 0;
  const queue = [];

  function coerce(key, raw) {
    const spec = SPEC[key];
    const fallback = DEFAULTS[key];
    if (raw == null || raw === '') return fallback;
    if (spec[0] === 'num') {
      const n = Number(raw);
      return Number.isFinite(n) ? Math.max(spec[1], Math.min(spec[2], n)) : fallback;
    }
    if (spec[0] === 'bool') {
      if (typeof raw === 'boolean') return raw;
      return /^(1|true|on|an|ja|yes)$/i.test(String(raw).trim());
    }
    if (spec[0] === 'enum') return spec[1].indexOf(String(raw)) >= 0 ? String(raw) : fallback;
    return String(raw).slice(0, 200);
  }

  const clampHz = (f) => Math.max(BAND_LO, Math.min(BAND_HI, f));
  function parseRange(text) {
    const found = String(text || '').toLowerCase().replace(/,/g, '.').match(/[0-9]+(?:[.][0-9]+)?[ ]*k?/g) || [];
    const values = found.slice(0, 2).map((part) => parseFloat(part) * (part.indexOf('k') >= 0 ? 1000 : 1));
    if (values.length < 2 || !values.every(Number.isFinite)) return [BAND_LO, BAND_HI];
    return [clampHz(Math.min(values[0], values[1])), clampHz(Math.max(values[0], values[1]))];
  }

  function readOptions(next) {
    const o = {};
    Object.keys(SPEC).forEach((key) => {
      o[key] = coerce(key, own(query, key) ? query[key] : next[key]);
    });
    o.style = forced || (STYLES.indexOf(next.style) >= 0 ? next.style : 'bars');
    o.bars = Math.round(o.bars);
    const span = parseRange(o.range);
    o.lo = span[0];
    o.hi = span[1];
    if (o.ceil <= o.floor) o.ceil = Math.min(100, o.floor + 1);
    o.crest = Math.max(o.crest, Math.min(100, o.mid + 1));
    return o;
  }
  opts = readOptions({});

  function hex(value) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(value || ''));
    if (!match) return null;
    const n = parseInt(match[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  let colorKey = null;
  let customColors = [];
  function parseColors(text) {
    if (text === colorKey) return customColors;
    colorKey = text;
    customColors = (String(text || '').match(/#?([0-9a-f]{8}|[0-9a-f]{6})(?![0-9a-z])/gi) || [])
      .slice(0, 3)
      .map((match) => {
        const digits = match.replace('#', '');
        const n = parseInt(digits.slice(0, 6), 16);
        const a = digits.length === 8 ? parseInt(digits.slice(6), 16) / 255 : 1;
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
      });
    return customColors;
  }
  const alphaOf = (c) => (c[3] == null ? 1 : c[3]);
  const rgba = (c, a) =>
    'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.round((a == null ? 1 : a) * alphaOf(c) * 1000) / 1000 + ')';
  const mix = (a, b, t) => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    alphaOf(a) + (alphaOf(b) - alphaOf(a)) * t,
  ];
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const area = (w) => {
    const width = w * (widthPct / 100);
    return { left: (w - width) / 2, width };
  };

  /* --- Spectrum processing ------------------------------------------ */

  // Fractional band index of a frequency (band centres sit at (k + 0.5) / len).
  const centerIndex = (f, len) =>
    Math.max(0, Math.min(len - 1, (Math.log(f / BAND_LO) / LOG_SPAN) * len - 0.5));

  function sampleAt(values, idx, interp) {
    const len = values.length;
    if (!len) return 0;
    if (len === 1) return values[0];
    if (interp === 'nearest') return values[Math.max(0, Math.min(len - 1, Math.round(idx)))];
    const low = Math.max(0, Math.min(len - 1, Math.floor(idx)));
    const high = Math.min(len - 1, low + 1);
    const t = idx - low;
    if (interp === 'cubic') {
      const p0 = values[Math.max(0, low - 1)];
      const p1 = values[low];
      const p2 = values[high];
      const p3 = values[Math.min(len - 1, high + 1)];
      const v =
        0.5 *
        (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
      return clamp01(v);
    }
    return values[low] + (values[high] - values[low]) * t;
  }

  function blurInPlace(values, radius) {
    const reach = Math.ceil(radius * 2.5);
    const copy = Float32Array.from(values);
    const last = values.length - 1;
    for (let i = 0; i <= last; i += 1) {
      let sum = 0;
      let weight = 0;
      for (let k = -reach; k <= reach; k += 1) {
        const w = Math.exp(-(k * k) / (2 * radius * radius));
        sum += copy[Math.max(0, Math.min(last, i + k))] * w;
        weight += w;
      }
      values[i] = sum / weight;
    }
  }

  function process(next, now) {
    const o = readOptions(next);
    opts = o;
    data = next;
    if (o.bars !== BANDS) {
      BANDS = o.bars;
      target = new Float32Array(BANDS);
      current = new Float32Array(BANDS);
    }
    widthPct = o.width;
    gapPx = o.gap;
    if (Array.isArray(next.track && next.track.colors) && next.track.colors.length === 2) {
      colorA = hex(next.track.colors[0]) || colorA;
      colorB = hex(next.track.colors[1]) || colorB;
    }

    const raw = Array.isArray(next.spectrum) ? next.spectrum : [];
    const len = raw.length;
    if (source.length !== len) source = new Float32Array(len);
    const floor = o.floor / 100;
    const ceil = o.ceil / 100;
    for (let k = 0; k < len; k += 1) {
      let v = Math.max(0, Math.min(255, Number(raw[k]) || 0)) / 255;
      if (floor > 0 || ceil < 1) v = clamp01((v - floor) / (ceil - floor));
      source[k] = v;
    }
    const iLo = len ? centerIndex(o.lo, len) : 0;
    const iHi = len ? centerIndex(o.hi, len) : 0;

    // Level and peak of the visible range – estimated from the spectrum.
    let sum = 0;
    let peak = 0;
    let count = 0;
    for (let k = Math.floor(iLo); k <= Math.ceil(iHi) && k < len; k += 1) {
      sum += source[k] * source[k];
      peak = Math.max(peak, source[k]);
      count += 1;
    }
    const rms = count ? Math.sqrt(sum / count) : 0;
    if (peak < 0.03) {
      if (!silentSince) silentSince = now;
    } else {
      silentSince = 0;
    }

    const dt = lastProcess ? Math.min(1, (now - lastProcess) / 1000) : 0.04;
    lastProcess = now;
    if (o.normalize) {
      if (next.playing) {
        envelope = peak > envelope ? envelope + (peak - envelope) * 0.5 : envelope * Math.pow(0.5, dt / 3);
      }
      normGain = Math.max(0.5, Math.min(o.maxGain, 0.85 / Math.max(0.05, envelope)));
    } else {
      normGain = 1;
    }
    const gain = Math.max(0.5, Math.min(2, o.sensitivity)) * normGain;
    meterTarget = clamp01((o.meterMode === 'peak' ? peak : rms) * gain);

    const n = BANDS;
    const half = o.mirrorX ? Math.ceil(n / 2) : n;
    if (points.length !== half) points = new Float32Array(half);
    for (let j = 0; j < half; j += 1) {
      const t = half > 1 ? j / (half - 1) : 0;
      const f = o.scale === 'linear' ? o.lo + (o.hi - o.lo) * t : o.lo * Math.pow(o.hi / o.lo, t);
      const idx = o.scale === 'linear' ? (len ? centerIndex(f, len) : 0) : iLo + (iHi - iLo) * t;
      let v = sampleAt(source, idx, o.interp);
      if (o.slope) v *= 1 + o.slope * 0.1 * t;
      if (o.rolloff) {
        const edge = Math.min(Math.log2(f / o.lo), Math.log2(o.hi / f));
        const x = clamp01(edge / o.rolloff);
        v *= x * x * (3 - 2 * x);
      }
      points[j] = v;
    }
    if (o.blur) blurInPlace(points, o.blur);
    let best = 0;
    let bestAt = 0;
    for (let j = 0; j < half; j += 1) {
      const v = clamp01(points[j] * gain);
      points[j] = v;
      if (v > best) {
        best = v;
        bestAt = half > 1 ? j / (half - 1) : 0;
      }
    }
    for (let i = 0; i < n; i += 1) {
      // Mirrored: bass in the middle, highs at both edges.
      const k = o.mirrorX ? Math.round(Math.abs(i - (n - 1) / 2) - (n % 2 === 0 ? 0.5 : 0)) : i;
      target[i] = points[Math.min(half - 1, k)];
    }
    pulseTarget = o.colorMode === 'pulse-freq' ? bestAt : best;

    const track = next.track;
    if (o.showTitle && track && track.title) {
      const key = track.artist + '|' + track.title;
      if (key !== titleKey) {
        titleKey = key;
        title.textContent = track.artist ? track.artist + ' – ' + track.title : track.title;
      }
      title.classList.add('show');
    } else {
      title.classList.remove('show');
    }
  }

  // Optional delay (audio sync): keep messages until they are due.
  function receive(next) {
    const wait = coerce('delay', own(query, 'delay') ? query.delay : next.delay);
    const now = performance.now();
    if (wait <= 0 && !queue.length) {
      process(next, now);
      return;
    }
    queue.push({ due: now + wait, next });
    if (queue.length > 240) queue.splice(0, queue.length - 240);
  }
  function flush(now) {
    while (queue.length && queue[0].due <= now) process(queue.shift().next, now);
  }

  /* --- Drawing helpers ------------------------------------------------ */

  function resize() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  // Adds a rounded rectangle to the current path (no beginPath, so shapes batch).
  function addRound(x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, w / 2, Math.abs(h) / 2));
    g.moveTo(x + radius, y);
    g.arcTo(x + w, y, x + w, y + h, radius);
    g.arcTo(x + w, y + h, x, y + h, radius);
    g.arcTo(x, y + h, x, y, radius);
    g.arcTo(x, y, x + w, y, radius);
    g.closePath();
  }

  function rounded(x, y, w, h, r) {
    g.beginPath();
    addRound(x, y, w, h, r);
  }

  function panel(w, h) {
    if (!(opts && opts.background)) return;
    g.save();
    g.fillStyle = 'rgba(8,10,16,.55)';
    g.strokeStyle = 'rgba(255,255,255,.10)';
    g.lineWidth = 1 * dpr;
    rounded(w * 0.015, h * 0.05, w * 0.97, h * 0.90, 18 * dpr);
    g.fill();
    g.stroke();
    g.restore();
  }

  // base = quiet/low, crest = loud/high, middle = only for "range".
  function palette(o) {
    const custom = parseColors(o.colors);
    const base = custom[0] || colorA;
    if (o.colorMode === 'range') {
      return {
        base,
        middle: custom[2] || (custom.length >= 2 ? mix(base, custom[1], 0.5) : colorB),
        crest: custom[1] || RANGE_HOT,
      };
    }
    const crest = custom[1] || colorB;
    return { base, middle: custom[2] || mix(base, crest, 0.5), crest };
  }

  const zone = (o, fraction) => (fraction >= o.crest / 100 ? 2 : fraction >= o.mid / 100 ? 1 : 0);

  function stopsFor(o, P) {
    if (o.colorMode === 'range') {
      const m = o.mid / 100;
      const c = o.crest / 100;
      return [[0, P.base], [m, P.base], [m, P.middle], [c, P.middle], [c, P.crest], [1, P.crest]];
    }
    const r = o.ratio;
    return r <= 1
      ? [[0, P.base], [r, P.crest], [1, P.crest]]
      : [[0, P.base], [1, mix(P.base, P.crest, 1 / r)]];
  }

  // kind: '' (0 → 1), 'mirror' (full · silent in the middle · full), 'reverse' (1 → 0)
  function addStops(gradient, stops, kind) {
    if (kind === 'mirror') {
      for (let i = stops.length - 1; i >= 0; i -= 1) gradient.addColorStop(0.5 - stops[i][0] / 2, rgba(stops[i][1]));
      for (let i = 0; i < stops.length; i += 1) gradient.addColorStop(0.5 + stops[i][0] / 2, rgba(stops[i][1]));
    } else if (kind === 'reverse') {
      for (let i = stops.length - 1; i >= 0; i -= 1) gradient.addColorStop(1 - stops[i][0], rgba(stops[i][1]));
    } else {
      stops.forEach((stop) => gradient.addColorStop(stop[0], rgba(stop[1])));
    }
    return gradient;
  }

  // Fill or stroke style along an axis from "silent" to "full".
  function paint(o, P, makeGradient, kind) {
    if (o.colorMode === 'solid') return rgba(P.base);
    if (o.colorMode === 'pulse' || o.colorMode === 'pulse-freq') return rgba(mix(P.base, P.crest, clamp01(pulse)));
    return addStops(makeGradient(), stopsFor(o, P), kind);
  }

  function finish(o, style, lineWidth) {
    if (o.colorMode === 'line') {
      g.strokeStyle = style;
      g.lineWidth = lineWidth || Math.max(1, 1.5 * dpr);
      g.lineJoin = 'round';
      g.stroke();
    } else {
      g.fillStyle = style;
      g.fill();
    }
  }

  function linearGeometry(w, count) {
    const box = area(w);
    const gap = Math.max(1, gapPx * dpr);
    const barWidth = Math.max(1, (box.width - gap * (count - 1)) / count);
    return { box, gap, barWidth };
  }

  function steps(o, length) {
    const size = Math.max(1, o.stepSize * dpr);
    const gap = o.stepGap * dpr;
    const pitch = size + gap;
    return {
      size,
      gap,
      pitch,
      total: Math.max(1, Math.floor((length + gap) / pitch)),
      least: Math.max(1, Math.ceil((o.minHeight * dpr) / pitch)),
    };
  }

  // Draws step rectangles; "range" colours each step by its own height.
  function fillSteps(o, P, rects, radius, makeGradient) {
    if (o.colorMode === 'range') {
      [P.base, P.middle, P.crest].forEach((color, index) => {
        g.beginPath();
        let any = false;
        rects.forEach((rect) => {
          if (rect[4] !== index) return;
          addRound(rect[0], rect[1], rect[2], rect[3], radius);
          any = true;
        });
        if (!any) return;
        g.fillStyle = rgba(color);
        g.fill();
      });
      return;
    }
    g.beginPath();
    rects.forEach((rect) => addRound(rect[0], rect[1], rect[2], rect[3], radius));
    if (o.colorMode === 'auto') {
      const gradient = makeGradient();
      gradient.addColorStop(0, rgba(P.base, 0.95));
      gradient.addColorStop(1, rgba(P.crest, 0.98));
      g.fillStyle = gradient;
      g.fill();
      return;
    }
    finish(o, paint(o, P, makeGradient));
  }

  /* --- Styles ---------------------------------------------------------- */

  function drawBars(w, h, levels, o, P) {
    const geo = linearGeometry(w, levels.length);
    const base = h * 0.90;
    const maxHeight = h * 0.76;
    const minHeight = Math.max(2 * dpr, Math.min(maxHeight, o.minHeight * dpr));
    const radius = o.rounded ? Math.min(geo.barWidth / 2, 6 * dpr) : 0;
    g.beginPath();
    for (let i = 0; i < levels.length; i += 1) {
      const height = Math.max(minHeight, levels[i] * maxHeight);
      addRound(geo.box.left + i * (geo.barWidth + geo.gap), base - height, geo.barWidth, height, radius);
    }
    const makeGradient = () => g.createLinearGradient(0, base, 0, base - maxHeight);
    if (o.colorMode === 'auto') {
      const gradient = makeGradient();
      gradient.addColorStop(0, rgba(P.base, 0.95));
      gradient.addColorStop(1, rgba(P.crest, 0.98));
      g.fillStyle = gradient;
      g.fill();
      return;
    }
    finish(o, paint(o, P, makeGradient));
  }

  function drawSteps(w, h, levels, o, P) {
    const geo = linearGeometry(w, levels.length);
    const base = h * 0.90;
    const maxHeight = h * 0.76;
    const st = steps(o, maxHeight);
    const radius = o.rounded ? Math.min(2 * dpr, st.size / 2, geo.barWidth / 2) : 0;
    const rects = [];
    for (let i = 0; i < levels.length; i += 1) {
      const lit = Math.min(st.total, Math.max(st.least, Math.round(levels[i] * st.total)));
      const x = geo.box.left + i * (geo.barWidth + geo.gap);
      for (let k = 0; k < lit; k += 1) {
        rects.push([x, base - k * st.pitch - st.size, geo.barWidth, st.size, zone(o, (k + 0.5) / st.total)]);
      }
    }
    fillSteps(o, P, rects, radius, () => g.createLinearGradient(0, base, 0, base - maxHeight));
  }

  function drawMirror(w, h, levels, o, P) {
    const geo = linearGeometry(w, levels.length);
    const count = levels.length;
    const mid = h / 2;
    const maxHeight = h * 0.36;
    const minHeight = Math.max(1.5 * dpr, Math.min(maxHeight, (o.minHeight * dpr) / 2));
    const radius = o.rounded ? Math.min(geo.barWidth / 2, 5 * dpr) : 0;
    if (o.colorMode === 'auto') {
      for (let i = 0; i < count; i += 1) {
        const height = Math.max(minHeight, levels[i] * maxHeight);
        g.fillStyle = rgba(mix(P.base, P.crest, i / Math.max(1, count - 1)), 0.95);
        rounded(geo.box.left + i * (geo.barWidth + geo.gap), mid - height, geo.barWidth, height * 2, radius);
        g.fill();
      }
    } else {
      g.beginPath();
      for (let i = 0; i < count; i += 1) {
        const height = Math.max(minHeight, levels[i] * maxHeight);
        addRound(geo.box.left + i * (geo.barWidth + geo.gap), mid - height, geo.barWidth, height * 2, radius);
      }
      finish(o, paint(o, P, () => g.createLinearGradient(0, mid - maxHeight, 0, mid + maxHeight), 'mirror'));
    }
    g.fillStyle = 'rgba(255,255,255,.10)';
    g.fillRect(geo.box.left, mid - 0.5 * dpr, geo.box.width, 1 * dpr);
  }

  // Bounding box of a ring sector (outer radius 1, inner radius "inner").
  function sectorBounds(start, arc, inner) {
    const xs = [];
    const ys = [];
    const add = (angle, r) => {
      xs.push(Math.cos(angle) * r);
      ys.push(Math.sin(angle) * r);
    };
    [start, start + arc].forEach((angle) => {
      add(angle, 1);
      add(angle, inner);
    });
    const quarter = Math.PI / 2;
    for (let k = Math.ceil(start / quarter); k * quarter <= start + arc; k += 1) add(k * quarter, 1);
    return { minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs), minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys) };
  }

  function radialGeometry(w, h, o) {
    const box = area(w);
    const full = o.radialArc >= 360;
    const arc = (o.radialArc * Math.PI) / 180;
    const start = (o.radialRotation * Math.PI) / 180 - Math.PI / 2;
    const innerRatio = o.inner ? o.inner / 100 : 0.19 / 0.44;
    // A partial arc is centred and scaled to fill the source; the full circle
    // keeps the 1.2.0 layout (outer radius = 44 % of the shorter side).
    const bounds = full ? { minX: -1, maxX: 1, minY: -1, maxY: 1 } : sectorBounds(start, arc, innerRatio);
    const spanX = Math.max(0.2, bounds.maxX - bounds.minX);
    const spanY = Math.max(0.2, bounds.maxY - bounds.minY);
    const outer = Math.min(box.width / spanX, h / spanY) * 0.88;
    const base = outer * innerRatio;
    const maxHeight = outer - base;
    return {
      cx: w / 2 - ((bounds.minX + bounds.maxX) / 2) * outer,
      cy: h / 2 - ((bounds.minY + bounds.maxY) / 2) * outer,
      size: outer / 0.44,
      base,
      maxHeight,
      full,
      // silent end of a bar and the direction it grows in
      zero: o.invert ? base + maxHeight : base,
      dir: o.invert ? -1 : 1,
      angle: (i, count) =>
        full ? start + (i / count) * Math.PI * 2 : start + (count > 1 ? i / (count - 1) : 0.5) * arc,
    };
  }

  function radialPaint(o, P, geo) {
    return paint(
      o,
      P,
      () => g.createRadialGradient(geo.cx, geo.cy, geo.base, geo.cx, geo.cy, geo.base + geo.maxHeight),
      o.invert ? 'reverse' : ''
    );
  }

  function radialRing(geo, count) {
    g.strokeStyle = 'rgba(255,255,255,.12)';
    g.lineWidth = 1 * dpr;
    g.beginPath();
    const r = geo.zero * (geo.dir > 0 ? 0.97 : 1.03);
    if (geo.full) g.arc(geo.cx, geo.cy, r, 0, Math.PI * 2);
    else g.arc(geo.cx, geo.cy, r, geo.angle(0, count), geo.angle(count - 1, count));
    g.stroke();
  }

  function drawRadial(w, h, levels, o, P) {
    const geo = radialGeometry(w, h, o);
    const count = levels.length;
    const thickness = Math.max(3 * dpr, geo.size * 0.018);
    const minLength = Math.max(1.5 * dpr, Math.min(geo.maxHeight, o.minHeight * dpr));
    const ray = (i) => {
      const angle = geo.angle(i, count);
      const outer = geo.zero + geo.dir * Math.max(minLength, levels[i] * geo.maxHeight);
      g.moveTo(geo.cx + Math.cos(angle) * geo.zero, geo.cy + Math.sin(angle) * geo.zero);
      g.lineTo(geo.cx + Math.cos(angle) * outer, geo.cy + Math.sin(angle) * outer);
    };
    g.lineCap = o.rounded ? 'round' : 'butt';
    if (o.colorMode === 'auto') {
      g.lineWidth = thickness;
      for (let i = 0; i < count; i += 1) {
        g.strokeStyle = rgba(mix(P.base, P.crest, i / Math.max(1, count - 1)), 0.95);
        g.beginPath();
        ray(i);
        g.stroke();
      }
    } else {
      g.lineWidth = o.colorMode === 'line' ? Math.max(1, 1.5 * dpr) : thickness;
      g.beginPath();
      for (let i = 0; i < count; i += 1) ray(i);
      g.strokeStyle = radialPaint(o, P, geo);
      g.stroke();
    }
    radialRing(geo, count);
  }

  function drawRadialSteps(w, h, levels, o, P) {
    const geo = radialGeometry(w, h, o);
    const count = levels.length;
    const st = steps(o, geo.maxHeight);
    const shared = o.colorMode === 'auto' ? null : radialPaint(o, P, geo);
    g.lineCap = 'butt';
    g.lineWidth = o.colorMode === 'line' ? Math.max(1, 1.5 * dpr) : Math.max(3 * dpr, geo.size * 0.018);
    g.setLineDash([st.size, st.gap]);
    for (let i = 0; i < count; i += 1) {
      const lit = Math.min(st.total, Math.max(st.least, Math.round(levels[i] * st.total)));
      const angle = geo.angle(i, count);
      const outer = geo.zero + geo.dir * (lit * st.pitch - st.gap);
      g.beginPath();
      g.moveTo(geo.cx + Math.cos(angle) * geo.zero, geo.cy + Math.sin(angle) * geo.zero);
      g.lineTo(geo.cx + Math.cos(angle) * outer, geo.cy + Math.sin(angle) * outer);
      g.strokeStyle = shared || rgba(mix(P.base, P.crest, i / Math.max(1, count - 1)), 0.95);
      g.stroke();
    }
    g.setLineDash([]);
    radialRing(geo, count);
  }

  function drawRadialWave(w, h, levels, o, P) {
    const geo = radialGeometry(w, h, o);
    const count = levels.length;
    const pts = [];
    for (let i = 0; i < count; i += 1) {
      const angle = geo.angle(i, count);
      const r = geo.zero + geo.dir * Math.max(1.5 * dpr, levels[i] * geo.maxHeight);
      pts.push([geo.cx + Math.cos(angle) * r, geo.cy + Math.sin(angle) * r]);
    }
    const at = (angle) => [geo.cx + Math.cos(angle) * geo.zero, geo.cy + Math.sin(angle) * geo.zero];
    // Smooth curve through the points (midpoints as anchors).
    const curve = (connect) => {
      if (geo.full) {
        const last = pts[count - 1];
        const startX = (last[0] + pts[0][0]) / 2;
        const startY = (last[1] + pts[0][1]) / 2;
        if (connect) g.lineTo(startX, startY);
        else g.moveTo(startX, startY);
        for (let i = 0; i < count; i += 1) {
          const p = pts[i];
          const q = pts[(i + 1) % count];
          g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
        }
        return;
      }
      if (connect) g.lineTo(pts[0][0], pts[0][1]);
      else g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < count - 1; i += 1) {
        const p = pts[i];
        const q = pts[i + 1];
        g.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      }
      g.lineTo(pts[count - 1][0], pts[count - 1][1]);
    };
    const ring = () => {
      g.beginPath();
      if (geo.full) {
        curve(false);
        g.closePath();
        g.moveTo(geo.cx + geo.zero, geo.cy);
        g.arc(geo.cx, geo.cy, geo.zero, 0, Math.PI * 2);
        return;
      }
      const first = geo.angle(0, count);
      const last = geo.angle(count - 1, count);
      const p = at(first);
      g.moveTo(p[0], p[1]);
      curve(true);
      const q = at(last);
      g.lineTo(q[0], q[1]);
      g.arc(geo.cx, geo.cy, geo.zero, last, first, true);
      g.closePath();
    };
    if (o.colorMode === 'auto') {
      const gradient = g.createRadialGradient(geo.cx, geo.cy, geo.base, geo.cx, geo.cy, geo.base + geo.maxHeight);
      gradient.addColorStop(geo.dir > 0 ? 0 : 1, rgba(P.base, 0.1));
      gradient.addColorStop(geo.dir > 0 ? 1 : 0, rgba(P.crest, 0.75));
      ring();
      g.fillStyle = gradient;
      g.fill('evenodd');
      g.beginPath();
      curve(false);
      if (geo.full) g.closePath();
      g.strokeStyle = rgba(P.crest, 0.95);
      g.lineWidth = 2 * dpr;
      g.stroke();
      return;
    }
    if (o.colorMode === 'line') {
      g.beginPath();
      curve(false);
      if (geo.full) g.closePath();
      g.strokeStyle = radialPaint(o, P, geo);
      g.lineWidth = 2 * dpr;
      g.lineJoin = 'round';
      g.stroke();
      return;
    }
    ring();
    g.fillStyle = radialPaint(o, P, geo);
    g.fill('evenodd');
  }

  function drawWave(w, h, levels, o, P) {
    const box = area(w);
    const count = levels.length;
    const base = h * 0.78;
    const maxHeight = h * 0.58;
    const points = [];
    for (let i = 0; i < count; i += 1) {
      points.push({
        x: box.left + (i / Math.max(1, count - 1)) * box.width,
        y: base - levels[i] * maxHeight,
      });
    }
    const curve = () => {
      for (let i = 1; i < points.length; i += 1) {
        const previous = points[i - 1];
        const point = points[i];
        const midX = (previous.x + point.x) / 2;
        g.bezierCurveTo(midX, previous.y, midX, point.y, point.x, point.y);
      }
    };
    const fillArea = () => {
      g.beginPath();
      g.moveTo(box.left, base);
      g.lineTo(points[0].x, points[0].y);
      curve();
      g.lineTo(box.left + box.width, base);
      g.closePath();
    };
    const makeGradient = () => g.createLinearGradient(0, base, 0, base - maxHeight);
    if (o.colorMode === 'auto') {
      const gradient = g.createLinearGradient(0, base - maxHeight, 0, base);
      gradient.addColorStop(0, rgba(P.crest, 0.75));
      gradient.addColorStop(1, rgba(P.base, 0.04));
      fillArea();
      g.fillStyle = gradient;
      g.fill();
      g.beginPath();
      g.moveTo(points[0].x, points[0].y);
      curve();
      g.strokeStyle = rgba(P.crest, 0.95);
      g.lineWidth = 2 * dpr;
      g.stroke();
      return;
    }
    if (o.colorMode === 'line') {
      g.beginPath();
      g.moveTo(points[0].x, points[0].y);
      curve();
      finish(o, paint(o, P, makeGradient), 2 * dpr);
      return;
    }
    fillArea();
    finish(o, paint(o, P, makeGradient));
  }

  // Level meter: horizontal in wide sources, vertical in tall ones.
  function drawMeter(w, h, o, P, stepped) {
    const box = area(w);
    const horizontal = box.width >= h;
    const length = horizontal ? box.width * 0.96 : h * 0.86;
    const thick = horizontal ? h * 0.42 : box.width * 0.42;
    const x0 = horizontal ? box.left + box.width * 0.02 : w / 2;
    const y0 = horizontal ? h / 2 : h * 0.93;
    const rect = (t0, t1) =>
      horizontal
        ? [x0 + t0 * length, y0 - thick / 2, (t1 - t0) * length, thick]
        : [x0 - thick / 2, y0 - t1 * length, thick, (t1 - t0) * length];
    const makeGradient = () =>
      horizontal ? g.createLinearGradient(x0, 0, x0 + length, 0) : g.createLinearGradient(0, y0, 0, y0 - length);
    const value = clamp01(meter);
    const peak = clamp01(hold);
    const track = () => {
      g.save();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.fill();
      g.restore();
    };

    if (stepped) {
      const st = steps(o, length);
      const radius = o.rounded ? Math.min(2 * dpr, st.size / 2, thick / 2) : 0;
      const lit = Math.min(st.total, Math.round(value * st.total));
      const segment = (k) => rect((k * st.pitch) / length, (k * st.pitch + st.size) / length);
      g.beginPath();
      for (let k = lit; k < st.total; k += 1) {
        const r = segment(k);
        addRound(r[0], r[1], r[2], r[3], radius);
      }
      track();
      const rects = [];
      for (let k = 0; k < lit; k += 1) {
        const r = segment(k);
        rects.push([r[0], r[1], r[2], r[3], zone(o, (k + 0.5) / st.total)]);
      }
      if (rects.length) fillSteps(o, P, rects, radius, makeGradient);
      const top = Math.min(st.total - 1, Math.floor(peak * st.total));
      if (peak > 0.02 && top >= lit) {
        const r = segment(top);
        g.beginPath();
        addRound(r[0], r[1], r[2], r[3], radius);
        g.fillStyle = rgba(P.crest, 0.9);
        g.fill();
      }
      return;
    }

    const radius = o.rounded ? Math.min(thick / 2, 8 * dpr) : 0;
    const full = rect(0, 1);
    g.beginPath();
    addRound(full[0], full[1], full[2], full[3], radius);
    track();
    if (value > 0.002) {
      const r = rect(0, value);
      g.beginPath();
      addRound(r[0], r[1], r[2], r[3], radius);
      if (o.colorMode === 'auto') {
        const gradient = makeGradient();
        gradient.addColorStop(0, rgba(P.base, 0.95));
        gradient.addColorStop(1, rgba(P.crest, 0.98));
        g.fillStyle = gradient;
        g.fill();
      } else {
        finish(o, paint(o, P, makeGradient));
      }
    }
    if (peak > 0.02) {
      const mark = Math.max(2 * dpr, thick * 0.06) / length;
      const r = rect(Math.max(0, peak - mark), Math.max(mark, peak));
      g.fillStyle = rgba(P.crest, 0.95);
      g.fillRect(r[0], r[1], r[2], r[3]);
    }
  }

  // Scrolling level history, mirrored around the middle line. This is the
  // envelope of the level, not a real waveform (no audio samples arrive here).
  function drawHistory(w, h, o, P) {
    const box = area(w);
    const count = history.length;
    if (count < 2) return;
    const mid = h / 2;
    const maxHeight = h * 0.4;
    const minHeight = Math.max(0.75 * dpr, Math.min(maxHeight, (o.minHeight * dpr) / 2));
    const value = (k) => Math.max(minHeight, history[(histPos + k) % count] * maxHeight);
    const x = (k) => box.left + (k / (count - 1)) * box.width;
    g.beginPath();
    g.moveTo(x(0), mid - value(0));
    for (let k = 1; k < count; k += 1) g.lineTo(x(k), mid - value(k));
    for (let k = count - 1; k >= 0; k -= 1) g.lineTo(x(k), mid + value(k));
    g.closePath();
    const makeGradient = () => g.createLinearGradient(0, mid - maxHeight, 0, mid + maxHeight);
    if (o.colorMode === 'auto') {
      const gradient = makeGradient();
      gradient.addColorStop(0, rgba(P.crest, 0.95));
      gradient.addColorStop(0.5, rgba(P.base, 0.9));
      gradient.addColorStop(1, rgba(P.crest, 0.95));
      g.fillStyle = gradient;
      g.fill();
      return;
    }
    finish(o, paint(o, P, makeGradient, 'mirror'));
  }

  /* --- Frame loop ------------------------------------------------------ */

  function factors(o, dt) {
    const inertia = Math.max(0, Math.min(0.98, o.inertia / 100));
    // The default inertia of 88 % gives exactly the 1.2.0 response (0.42 / 0.12).
    let fall = 1 - inertia;
    let rise = 1 - inertia * (0.58 / 0.88);
    if (o.smoothing === 'time' || o.smoothing === 'time-fast') {
      const frameCount = dt * 30; // calibrated to the 30 fps of an OBS browser source
      fall = 1 - Math.pow(1 - fall, frameCount);
      rise = 1 - Math.pow(1 - rise, frameCount);
    }
    if (o.smoothing === 'fast' || o.smoothing === 'time-fast') rise = 1;
    return [rise, fall];
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const elapsed = now - lastTick;
    if (elapsed < FRAME_MS - 1.5) return;
    lastTick = elapsed > FRAME_MS * 1.5 ? now : lastTick + FRAME_MS;
    const dt = prevDraw ? Math.min(0.25, Math.max(0.001, (now - prevDraw) / 1000)) : 1 / 30;
    prevDraw = now;
    frames += 1;
    flush(now);
    resize();
    const w = canvas.width;
    const h = canvas.height;
    g.clearRect(0, 0, w, h);
    const o = opts;
    const playing = Boolean(data && data.playing);
    let hide = !data || (o.hideOnPause && !playing);
    if (!hide && o.hideOnSilence && silentSince && now - silentSince > 1500) hide = true;
    opacity += ((hide ? 0 : 1) - opacity) * 0.12;
    if (opacity < 0.01) return;

    const f = factors(o, dt);
    for (let i = 0; i < BANDS; i += 1) {
      const value = target[i];
      current[i] += (value - current[i]) * (value > current[i] ? f[0] : f[1]);
    }
    meter += (meterTarget - meter) * (meterTarget > meter ? f[0] : f[1]);
    pulse += (pulseTarget - pulse) * 0.25;
    if (meter >= hold) {
      hold = meter;
      holdAt = now;
    } else if (now - holdAt > 900) {
      hold = Math.max(meter, hold - dt * 0.5);
    }
    const historyLength = Math.round(o.seconds * HISTORY_RATE);
    if (history.length !== historyLength) {
      history = new Float32Array(historyLength);
      histPos = 0;
    }
    histAcc = Math.min(1, histAcc + dt);
    while (histAcc >= 1 / HISTORY_RATE) {
      history[histPos] = meter;
      histPos = (histPos + 1) % history.length;
      histAcc -= 1 / HISTORY_RATE;
    }

    const P = palette(o);
    g.save();
    g.globalAlpha = opacity;
    panel(w, h);
    if (o.glow) {
      g.shadowColor = rgba(P.base, 0.55);
      g.shadowBlur = 16 * dpr;
    }
    const style = o.style;
    if (style === 'steps') drawSteps(w, h, current, o, P);
    else if (style === 'mirror') drawMirror(w, h, current, o, P);
    else if (style === 'radial') drawRadial(w, h, current, o, P);
    else if (style === 'radial-steps') drawRadialSteps(w, h, current, o, P);
    else if (style === 'radial-wave') drawRadialWave(w, h, current, o, P);
    else if (style === 'wave') drawWave(w, h, current, o, P);
    else if (style === 'meter') drawMeter(w, h, o, P, false);
    else if (style === 'meter-steps') drawMeter(w, h, o, P, true);
    else if (style === 'history') drawHistory(w, h, o, P);
    else drawBars(w, h, current, o, P);
    g.restore();
  }

  // Read-only hook for tests and the browser console.
  window.__cmVisualizer = {
    snapshot: () => ({
      style: opts.style,
      bands: BANDS,
      options: opts,
      levels: Array.from(current),
      meter,
      hold,
      pulse,
      frames,
      queued: queue.length,
    }),
  };

  function poll() {
    fetch('/visualizer.json').then((r) => r.json()).then(receive).catch(() => {});
  }

  if (window.EventSource) {
    const events = new EventSource('/events');
    events.onmessage = (event) => {
      try {
        receive(JSON.parse(event.data));
      } catch (e) {}
    };
  } else {
    poll();
    setInterval(poll, 200);
  }
  requestAnimationFrame(frame);
})();
</script>
</body>
</html>`;
}

/* ------------------------------------------------------------------ *
 * Plugin API
 * ------------------------------------------------------------------ */

module.exports = {
  apiVersion: 2,
  id: 'obs-visualizer',
  name: 'OBS Audio-Visualizer',
  version: '1.3.0',
  // Asks CleanMusic for the live spectrum (32 bands) about 25 times/second.
  visualizer: true,
  description:
    'Zeigt einen echten, musikreaktiven Audio-Visualizer als transparentes Overlay in OBS (Browserquelle).',
  help:
    'In OBS: Quelle hinzufügen → Browser → die kopierte URL einfügen. Empfohlene Größe: 800 × 300 für Balken, Spiegel, ' +
    'Welle und Verlauf, 420 × 420 für die Kreis-Stile, 800 × 80 für die Pegelanzeige. Die Farben kommen aus dem Cover ' +
    'oder aus „Eigene Farben“. Jede Einstellung lässt sich pro Quelle an der URL ändern, z. B. ' +
    '?style=radial-wave&radialArc=180 – die Liste steht in extras/plugins/README.md. ' +
    'Der Server läuft nur auf deinem PC (127.0.0.1); andere Geräte im Netzwerk erreichen ihn nicht.',
  settings: [
    { id: 'port', type: 'number', label: 'Port', default: 4789, min: 1024, max: 65535, help: 'Nur ändern, wenn 4789 belegt ist.' },
    {
      id: 'style',
      type: 'select',
      label: 'Stil',
      default: 'bars',
      options: [
        { value: 'bars', label: 'Balken' },
        { value: 'steps', label: 'Gestufte Balken' },
        { value: 'mirror', label: 'Spiegel (Mitte)' },
        { value: 'radial', label: 'Kreis' },
        { value: 'radial-steps', label: 'Kreis, gestuft' },
        { value: 'radial-wave', label: 'Kreis-Kurve' },
        { value: 'wave', label: 'Welle' },
        { value: 'meter', label: 'Pegelanzeige' },
        { value: 'meter-steps', label: 'Pegelanzeige, gestuft' },
        { value: 'history', label: 'Pegel-Verlauf' },
      ],
    },
    {
      id: 'bars',
      type: 'number',
      label: 'Anzahl Balken',
      default: 32,
      min: 8,
      max: 64,
      help: 'Gilt für alle Spektrum-Stile; beim Kreis die Anzahl der Strahlen. Pegelanzeige und Verlauf brauchen den Wert nicht.',
    },
    { id: 'width', type: 'number', label: 'Breite (%)', default: 100, min: 30, max: 100, help: 'Nutzt nur diesen Teil der Browserquelle; der Rest bleibt transparent.' },
    { id: 'gap', type: 'number', label: 'Abstand (px)', default: 3, min: 0, max: 20, help: 'Lücke zwischen Balken. 0 = direkt aneinander.' },
    { id: 'sensitivity', type: 'number', label: 'Empfindlichkeit', default: 1.15, min: 0.5, max: 2, help: '0,5 = zurückhaltend, 2 = sehr stark.' },
    {
      id: 'colorMode',
      type: 'select',
      label: 'Farbmodus',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Automatisch (je Stil)' },
        { value: 'solid', label: 'Einfarbig' },
        { value: 'gradient', label: 'Farbverlauf' },
        { value: 'line', label: 'Nur Linien' },
        { value: 'pulse', label: 'Pulsieren (Lautstärke)' },
        { value: 'pulse-freq', label: 'Pulsieren (Tonhöhe)' },
        { value: 'range', label: 'Dreifarbig (leise/mittel/laut)' },
      ],
      help: 'Pulsieren färbt alles zwischen Grund- und Spitzenfarbe. Dreifarbig wirkt wie eine Aussteuerungsanzeige.',
    },
    {
      id: 'colors',
      type: 'text',
      label: 'Eigene Farben',
      default: '',
      placeholder: '#5b8cff, #35e0c0, #ffd166',
      help: 'Bis zu drei Farben (#RRGGBB oder #RRGGBBAA mit Deckkraft), durch Komma getrennt: Grundfarbe, Spitzenfarbe, Mittelfarbe (nur „Dreifarbig“). Leer = Farben aus dem Cover.',
    },
    {
      id: 'smoothing',
      type: 'select',
      label: 'Glättung',
      default: 'normal',
      options: [
        { value: 'normal', label: 'Normal' },
        { value: 'fast', label: 'Schnelle Spitzen' },
        { value: 'time', label: 'Zeitbasiert' },
        { value: 'time-fast', label: 'Zeitbasiert + schnelle Spitzen' },
      ],
      help: 'Schnelle Spitzen springen sofort hoch und fallen dann langsam. Zeitbasiert sieht bei 30 und 60 fps gleich aus.',
    },
    { id: 'inertia', type: 'number', label: 'Trägheit (%)', default: 88, min: 0, max: 98, help: 'Wie langsam die Balken fallen. 0 = ungeglättet, 98 = sehr träge.' },
    {
      id: 'range',
      type: 'text',
      label: 'Frequenzbereich (Hz)',
      default: '30-16000',
      placeholder: '30-16000',
      help: 'Zeigt nur diesen Bereich, z. B. 30-250 für den Bass oder 200-5k für Stimmen. Möglich: 30 bis 16000 Hz.',
    },
    { id: 'mirrorX', type: 'toggle', label: 'Frequenzen spiegeln', default: false, help: 'Symmetrisch: Bass in der Mitte, Höhen an beiden Rändern.' },
    { id: 'stepSize', type: 'number', label: 'Stufenhöhe (px)', default: 8, min: 2, max: 64, help: 'Für die gestuften Stile.' },
    { id: 'stepGap', type: 'number', label: 'Stufenabstand (px)', default: 4, min: 0, max: 32, help: 'Für die gestuften Stile.' },
    { id: 'radialArc', type: 'number', label: 'Kreis-Bogen (°)', default: 360, min: 10, max: 360, help: 'Für die Kreis-Stile. 180 = Halbkreis.' },
    {
      id: 'radialRotation',
      type: 'number',
      label: 'Kreis-Drehung (°)',
      default: 0,
      min: 0,
      max: 360,
      help: 'Wo der Bogen beginnt: 0 = oben, 90 = rechts, im Uhrzeigersinn. Halbkreis unten: Bogen 180, Drehung 90.',
    },
    {
      id: 'meterMode',
      type: 'select',
      label: 'Pegel',
      default: 'rms',
      options: [
        { value: 'rms', label: 'Durchschnitt (RMS)' },
        { value: 'peak', label: 'Spitze' },
      ],
      help: 'Für Pegelanzeige und Verlauf. Geschätzt aus dem Spektrum – keine Messung in dBFS.',
    },
    { id: 'normalize', type: 'toggle', label: 'Lautstärke angleichen', default: false, help: 'Leise Titel werden größer gezeigt, laute kleiner (höchstens 4-fach).' },
    { id: 'glow', type: 'toggle', label: 'Leuchten', default: true },
    { id: 'background', type: 'toggle', label: 'Dunkler Hintergrund', default: false, help: 'Aus = vollständig transparent für OBS.' },
    { id: 'showTitle', type: 'toggle', label: 'Titel und Künstler einblenden', default: false },
    { id: 'hideOnPause', type: 'toggle', label: 'Bei Pause ausblenden', default: true },
    { id: 'hideOnSilence', type: 'toggle', label: 'Bei Stille ausblenden', default: false, help: 'Blendet aus, wenn etwa 1,5 s nichts zu hören ist – auch während der Wiedergabe.' },
    { id: 'delay', type: 'number', label: 'Verzögerung (ms)', default: 0, min: 0, max: 1000, help: 'Verzögert das Bild, falls der Ton in OBS später ankommt.' },
  ],
  actions: [
    { id: 'copy-url', label: 'Visualizer-URL kopieren', when: 'running' },
    { id: 'open', label: 'Vorschau im Browser', when: 'running' },
    { id: 'restart', label: 'Server neu starten' },
  ],

  async setup(context) {
    ctx = context;
    const state = ctx.player.state();
    player = state;
    if (state && state.visualizer) visualizer = state.visualizer;
    await start();
    broadcast();
  },

  dispose() {
    clearTimeout(broadcastTimer);
    stop();
    ctx = null;
  },

  async onSettings() {
    if (!server || serverPort !== Math.round(Number(settings().port))) await start();
    broadcast();
  },

  onEvent(type, state) {
    player = state;
    if (state && state.visualizer) visualizer = state.visualizer;
    broadcast();
  },

  status() {
    const flags = { running: Boolean(server) };
    if (serverError) return { ready: false, text: 'Server-Fehler', detail: serverError, flags };
    if (!server) return { ready: false, text: 'Gestoppt', detail: '', flags };
    const connected = clients.size;
    return {
      ready: true,
      text: `Läuft · Port ${serverPort}`,
      detail: `${visualizerUrl()} · ${connected === 1 ? '1 Quelle verbunden' : `${connected} Quellen verbunden`}`,
      flags,
    };
  },

  async runAction(id) {
    if (id === 'copy-url') {
      ctx.copyText(visualizerUrl());
      return { message: 'Visualizer-URL kopiert – in OBS als Browserquelle einfügen.' };
    }
    if (id === 'open') {
      ctx.openExternal(visualizerUrl());
      return { message: 'Vorschau geöffnet.' };
    }
    if (id === 'restart') {
      const ok = await start();
      return { message: ok ? 'Server neu gestartet.' : serverError };
    }
    return { message: null };
  },

  // For tests.
  _debug: () => ({ port: serverPort, clients: clients.size, error: serverError, styles: STYLES.slice() }),
};
