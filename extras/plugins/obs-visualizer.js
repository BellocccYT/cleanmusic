'use strict';

/**
 * CleanMusic plugin: audio-reactive OBS visualizer (optional, API v2).
 *
 * Not part of CleanMusic itself and never loaded automatically. To use it,
 * add this file under Einstellungen → Plugins → „Plugin hinzufügen“ and
 * switch it on.
 *
 * - Transparent browser-source page: http://127.0.0.1:4789/visualizer
 *   (?style=bars | mirror | radial | wave overrides the style from settings)
 * - Live spectrum via Server-Sent Events (/events), JSON at /visualizer.json
 * - Uses the real analyser from CleanMusic (plugin flag `visualizer: true`),
 *   so the bars follow the music instead of just the play state.
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
const STYLES = ['bars', 'mirror', 'radial', 'wave'];

function settings() {
  const defaults = {
    port: 4789,
    style: 'bars',
    sensitivity: 1.15,
    glow: true,
    background: false,
    showTitle: false,
    hideOnPause: true,
  };
  return Object.assign(defaults, ctx ? ctx.settings.get() : {});
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
  return {
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
    style: s.style,
    sensitivity: s.sensitivity,
    glow: Boolean(s.glow),
    background: Boolean(s.background),
    showTitle: Boolean(s.showTitle),
    hideOnPause: Boolean(s.hideOnPause),
  };
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
  const forced = ${JSON.stringify(forcedStyle || '')};
  const canvas = document.getElementById('viz');
  const title = document.getElementById('title');
  const g = canvas.getContext('2d');
  const BANDS = 32;
  const target = new Float32Array(BANDS);
  const current = new Float32Array(BANDS);
  let data = null;
  let style = 'bars';
  let colorA = [91, 140, 255];
  let colorB = [53, 224, 192];
  let opacity = 1;
  let titleKey = '';
  let dpr = 1;

  function hex(value) {
    const match = /^#([0-9a-f]{6})$/i.exec(String(value || ''));
    if (!match) return null;
    const n = parseInt(match[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  const mix = (a, b, t) => [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];

  function resize() {
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function apply(next) {
    data = next;
    style = forced || next.style || 'bars';
    if (Array.isArray(next.track && next.track.colors) && next.track.colors.length === 2) {
      colorA = hex(next.track.colors[0]) || colorA;
      colorB = hex(next.track.colors[1]) || colorB;
    }
    const values = Array.isArray(next.spectrum) ? next.spectrum : [];
    const gain = Math.max(0.5, Math.min(2, Number(next.sensitivity) || 1));
    for (let i = 0; i < BANDS; i += 1) {
      const value = Math.max(0, Math.min(255, Number(values[i]) || 0)) / 255;
      target[i] = Math.max(0, Math.min(1, value * gain));
    }
    const track = next.track;
    if (next.showTitle && track && track.title) {
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

  function rounded(x, y, w, h, r) {
    const radius = Math.min(r, w / 2, Math.abs(h) / 2);
    g.beginPath();
    g.moveTo(x + radius, y);
    g.arcTo(x + w, y, x + w, y + h, radius);
    g.arcTo(x + w, y + h, x, y + h, radius);
    g.arcTo(x, y + h, x, y, radius);
    g.arcTo(x, y, x + w, y, radius);
    g.closePath();
  }

  function panel(w, h) {
    if (!(data && data.background)) return;
    g.save();
    g.fillStyle = 'rgba(8,10,16,.55)';
    g.strokeStyle = 'rgba(255,255,255,.10)';
    g.lineWidth = 1 * dpr;
    rounded(w * 0.015, h * 0.05, w * 0.97, h * 0.90, 18 * dpr);
    g.fill();
    g.stroke();
    g.restore();
  }

  function drawBars(w, h, levels) {
    const gap = Math.max(2, w * 0.0025);
    const barWidth = Math.max(2, (w - gap * (BANDS - 1)) / BANDS);
    const base = h * 0.90;
    const maxHeight = h * 0.76;
    const gradient = g.createLinearGradient(0, base, 0, base - maxHeight);
    gradient.addColorStop(0, rgba(colorA, 0.95));
    gradient.addColorStop(1, rgba(colorB, 0.98));
    g.fillStyle = gradient;
    for (let i = 0; i < BANDS; i += 1) {
      const value = levels[i];
      const height = Math.max(2 * dpr, value * maxHeight);
      const x = i * (barWidth + gap);
      rounded(x, base - height, barWidth, height, Math.min(barWidth / 2, 6 * dpr));
      g.fill();
    }
  }

  function drawMirror(w, h, levels) {
    const gap = Math.max(2, w * 0.0025);
    const barWidth = Math.max(2, (w - gap * (BANDS - 1)) / BANDS);
    const mid = h / 2;
    const maxHeight = h * 0.36;
    for (let i = 0; i < BANDS; i += 1) {
      const value = levels[i];
      const height = Math.max(1.5 * dpr, value * maxHeight);
      g.fillStyle = rgba(mix(colorA, colorB, i / (BANDS - 1)), 0.95);
      const x = i * (barWidth + gap);
      rounded(x, mid - height, barWidth, height * 2, Math.min(barWidth / 2, 5 * dpr));
      g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.10)';
    g.fillRect(0, mid - 0.5 * dpr, w, 1 * dpr);
  }

  function drawRadial(w, h, levels) {
    const cx = w / 2;
    const cy = h / 2;
    const base = Math.min(w, h) * 0.19;
    const maxHeight = Math.min(w, h) * 0.25;
    const thickness = Math.max(3 * dpr, Math.min(w, h) * 0.018);
    g.lineCap = 'round';
    for (let i = 0; i < BANDS; i += 1) {
      const angle = (i / BANDS) * Math.PI * 2 - Math.PI / 2;
      const value = levels[i];
      const inner = base;
      const outer = base + Math.max(1.5 * dpr, value * maxHeight);
      g.strokeStyle = rgba(mix(colorA, colorB, i / (BANDS - 1)), 0.95);
      g.lineWidth = thickness;
      g.beginPath();
      g.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      g.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,.12)';
    g.lineWidth = 1 * dpr;
    g.beginPath();
    g.arc(cx, cy, base * 0.97, 0, Math.PI * 2);
    g.stroke();
  }

  function drawWave(w, h, levels) {
    const base = h * 0.78;
    const maxHeight = h * 0.58;
    const points = [];
    for (let i = 0; i < BANDS; i += 1) {
      points.push({ x: (i / (BANDS - 1)) * w, y: base - levels[i] * maxHeight });
    }
    const gradient = g.createLinearGradient(0, base - maxHeight, 0, base);
    gradient.addColorStop(0, rgba(colorB, 0.75));
    gradient.addColorStop(1, rgba(colorA, 0.04));
    g.beginPath();
    g.moveTo(0, base);
    g.lineTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const point = points[i];
      const midX = (previous.x + point.x) / 2;
      g.bezierCurveTo(midX, previous.y, midX, point.y, point.x, point.y);
    }
    g.lineTo(w, base);
    g.closePath();
    g.fillStyle = gradient;
    g.fill();
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      const previous = points[i - 1];
      const point = points[i];
      const midX = (previous.x + point.x) / 2;
      g.bezierCurveTo(midX, previous.y, midX, point.y, point.x, point.y);
    }
    g.strokeStyle = rgba(colorB, 0.95);
    g.lineWidth = 2 * dpr;
    g.stroke();
  }

  function frame() {
    resize();
    const w = canvas.width;
    const h = canvas.height;
    g.clearRect(0, 0, w, h);
    const playing = Boolean(data && data.playing);
    const hide = !data || (data.hideOnPause && !playing);
    opacity += ((hide ? 0 : 1) - opacity) * 0.12;
    if (opacity < 0.01) {
      requestAnimationFrame(frame);
      return;
    }
    for (let i = 0; i < BANDS; i += 1) {
      const value = target[i];
      current[i] += (value - current[i]) * (value > current[i] ? 0.42 : 0.12);
    }
    g.save();
    g.globalAlpha = opacity;
    panel(w, h);
    if (data && data.glow) {
      g.shadowColor = rgba(colorA, 0.55);
      g.shadowBlur = 16 * dpr;
    }
    if (style === 'mirror') drawMirror(w, h, current);
    else if (style === 'radial') drawRadial(w, h, current);
    else if (style === 'wave') drawWave(w, h, current);
    else drawBars(w, h, current);
    g.restore();
    requestAnimationFrame(frame);
  }

  function poll() {
    fetch('/visualizer.json').then((r) => r.json()).then(apply).catch(() => {});
  }

  if (window.EventSource) {
    const events = new EventSource('/events');
    events.onmessage = (event) => {
      try {
        apply(JSON.parse(event.data));
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
  version: '1.0.0',
  // Asks CleanMusic for the live spectrum (32 bands) about 25 times/second.
  visualizer: true,
  description:
    'Zeigt einen echten, musikreaktiven Audio-Visualizer als transparentes Overlay in OBS (Browserquelle).',
  help:
    'In OBS: Quelle hinzufügen → Browser → die kopierte URL einfügen. Empfohlene Größe: 800 × 300 für Balken/Spiegel/Welle, ' +
    '420 × 420 für den Kreis. Die Farben kommen aus dem Cover. ' +
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
        { value: 'mirror', label: 'Spiegel (Mitte)' },
        { value: 'radial', label: 'Kreis' },
        { value: 'wave', label: 'Welle' },
      ],
    },
    { id: 'sensitivity', type: 'number', label: 'Empfindlichkeit', default: 1.15, min: 0.5, max: 2, help: '0,5 = zurückhaltend, 2 = sehr stark.' },
    { id: 'glow', type: 'toggle', label: 'Leuchten', default: true },
    { id: 'background', type: 'toggle', label: 'Dunkler Hintergrund', default: false, help: 'Aus = vollständig transparent für OBS.' },
    { id: 'showTitle', type: 'toggle', label: 'Titel und Künstler einblenden', default: false },
    { id: 'hideOnPause', type: 'toggle', label: 'Bei Pause ausblenden', default: true },
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
  _debug: () => ({ port: serverPort, clients: clients.size, error: serverError }),
};
