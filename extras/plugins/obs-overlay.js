'use strict';

/**
 * CleanMusic plugin: OBS Now-Playing overlay (optional, API v2).
 *
 * Not part of CleanMusic itself and never loaded automatically. To use it,
 * add this file under Einstellungen → Plugins → „Plugin hinzufügen“ and
 * switch it on.
 *
 * - Transparent browser-source page: http://127.0.0.1:4787/overlay
 *   (?style=card | bar | minimal overrides the style from the settings)
 * - Live updates via Server-Sent Events (/events), JSON at /nowplaying.json
 * - Optional text files (nowplaying.txt, title.txt, artist.txt, cover.jpg)
 *   for OBS text/image sources
 *
 * The server listens on 127.0.0.1 only and answers only requests whose Host
 * is 127.0.0.1/localhost, so websites cannot read it (DNS rebinding).
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let ctx = null;
let server = null;
let serverPort = 0;
let serverError = null;
let keepAlive = null;
let broadcastTimer = null;
let player = null;
let lastFiles = '';
let lastCover = '';
const clients = new Set();

function settings() {
  const defaults = { port: 4787, style: 'card', hideOnPause: true, showProgress: true, textFiles: false, folder: '' };
  return Object.assign(defaults, ctx ? ctx.settings.get() : {});
}

function overlayUrl() {
  return `http://127.0.0.1:${serverPort || settings().port}/overlay`;
}

function filesDir() {
  const folder = String(settings().folder || '').trim();
  if (folder && path.isAbsolute(folder)) return folder;
  return path.join(ctx.getPath('documents'), 'CleanMusic OBS');
}

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

function payload() {
  const s = settings();
  const p = player || {};
  const track = p.track || null;
  let position = Number(p.position) || 0;
  if (p.playing && !p.live && p.at) {
    position += (Date.now() - p.at) / 1000;
    if (p.duration) position = Math.min(p.duration, position);
  }
  return {
    track: track
      ? {
          title: track.title || '',
          artist: track.artist || '',
          album: track.album || '',
          source: track.source || '',
          artwork: track.artwork || '',
          license: track.license || '',
          colors: Array.isArray(track.colors) ? track.colors : [],
        }
      : null,
    playing: Boolean(p.playing),
    live: Boolean(p.live),
    position,
    duration: Number(p.duration) || 0,
    style: s.style,
    hideOnPause: Boolean(s.hideOnPause),
    showProgress: Boolean(s.showProgress),
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
  }, 60);
}

/* ------------------------------------------------------------------ *
 * Text files for OBS text / image sources
 * ------------------------------------------------------------------ */

async function writeFiles(force = false) {
  if (!ctx || !settings().textFiles) return;
  const s = settings();
  const track = player && player.track;
  const visible = Boolean(track && (player.playing || !s.hideOnPause));
  const title = visible ? track.title || '' : '';
  const artist = visible ? track.artist || '' : '';
  const line = visible ? (artist ? `${artist} – ${title}` : title) : '';
  const dir = filesDir();
  const key = `${dir}|${line}`;
  if (!force && key === lastFiles) return;
  lastFiles = key;

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'nowplaying.txt'), line, 'utf8');
    fs.writeFileSync(path.join(dir, 'title.txt'), title, 'utf8');
    fs.writeFileSync(path.join(dir, 'artist.txt'), artist, 'utf8');
  } catch (error) {
    ctx.log('Textdateien:', error.message);
    return;
  }

  const artwork = visible && track.artwork ? track.artwork : '';
  if (artwork === lastCover && !force) return;
  lastCover = artwork;
  const coverFile = path.join(dir, 'cover.jpg');
  if (!artwork) {
    fs.rmSync(coverFile, { force: true });
    return;
  }
  try {
    const response = await ctx.fetch(artwork);
    const type = response.headers.get('content-type') || '';
    if (!response.ok || !/^image\//i.test(type)) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > 8 * 1024 * 1024) throw new Error('Cover zu groß');
    if (lastCover === artwork) fs.writeFileSync(coverFile, buffer);
  } catch (error) {
    ctx.log('Cover:', error.message);
  }
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
  if (url.pathname === '/' || url.pathname === '/overlay') {
    const style = ['card', 'bar', 'minimal'].includes(url.searchParams.get('style'))
      ? url.searchParams.get('style')
      : '';
    send(res, 200, 'text/html; charset=utf-8', overlayHtml(style));
    return;
  }
  if (url.pathname === '/nowplaying.json') {
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
  const port = Math.round(Number(settings().port)) || 4787;
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

function overlayHtml(forcedStyle) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>CleanMusic · Now Playing</title>
<style>
  html, body { margin: 0; background: transparent; overflow: hidden; }
  body { font-family: "Segoe UI Variable Display", "Segoe UI", system-ui, sans-serif; color: #fff; }
  #np { --a: #5b8cff; --b: #35e0c0; position: absolute; left: 16px; bottom: 16px; display: flex; align-items: center;
        gap: 16px; opacity: 0; transform: translateY(14px); transition: opacity .45s ease, transform .45s ease; }
  #np.show { opacity: 1; transform: none; }
  #np .cover { flex: 0 0 auto; border-radius: 12px; background: linear-gradient(135deg, var(--a), var(--b)) center/cover;
               box-shadow: 0 10px 30px rgba(0,0,0,.45); }
  #np .meta { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  #np .label { font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--b); }
  #np .title { font-size: 22px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #np .artist { font-size: 15px; color: rgba(255,255,255,.78); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #np .bar { height: 4px; border-radius: 4px; background: rgba(255,255,255,.18); overflow: hidden; margin-top: 8px; }
  #np .bar i { display: block; height: 100%; width: 0; border-radius: 4px; background: linear-gradient(90deg, var(--a), var(--b)); }
  #np.no-bar .bar { display: none; }

  /* card */
  #np.card { padding: 14px 22px 14px 14px; width: 520px; box-sizing: border-box; border-radius: 20px;
             background: linear-gradient(135deg, rgba(10,13,20,.86), rgba(10,13,20,.72));
             box-shadow: 0 18px 50px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.08); backdrop-filter: blur(18px); }
  #np.card::before { content: ""; position: absolute; inset: 0; border-radius: 20px; pointer-events: none;
                     background: radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--a) 35%, transparent), transparent 60%); }
  #np.card .cover { width: 92px; height: 92px; }
  #np.card .meta { flex: 1; position: relative; }

  /* bar */
  #np.bar-style { padding: 7px 18px 7px 7px; border-radius: 999px; max-width: 560px;
                  background: rgba(10,13,20,.82); box-shadow: 0 10px 30px rgba(0,0,0,.4), inset 0 0 0 1px rgba(255,255,255,.08); }
  #np.bar-style .cover { width: 38px; height: 38px; border-radius: 50%; }
  #np.bar-style .label, #np.bar-style .bar { display: none; }
  #np.bar-style .meta { flex-direction: row; align-items: baseline; gap: 10px; }
  #np.bar-style .title { font-size: 16px; }
  #np.bar-style .artist { font-size: 14px; }

  /* minimal */
  #np.minimal .cover, #np.minimal .bar, #np.minimal .label { display: none; }
  #np.minimal .title, #np.minimal .artist { text-shadow: 0 2px 10px rgba(0,0,0,.85), 0 0 2px rgba(0,0,0,.9); }
  #np.minimal .title { font-size: 26px; }
  #np.minimal .artist { font-size: 17px; color: #fff; }
</style>
</head>
<body>
<div id="np">
  <div class="cover"></div>
  <div class="meta">
    <div class="label">Now Playing</div>
    <div class="title"></div>
    <div class="artist"></div>
    <div class="bar"><i></i></div>
  </div>
</div>
<script>
(() => {
  const forced = ${JSON.stringify(forcedStyle || '')};
  const box = document.getElementById('np');
  const cover = box.querySelector('.cover');
  const bar = box.querySelector('.bar i');
  let data = null;
  let base = 0;
  let key = '';

  function apply(next) {
    data = next;
    base = performance.now();
    const t = data.track;
    const style = forced || data.style || 'card';
    box.className = style === 'bar' ? 'bar-style' : style;
    if (!data.showProgress || data.live || !data.duration) box.classList.add('no-bar');
    const visible = Boolean(t) && (data.playing || !data.hideOnPause);
    if (t) {
      const nextKey = t.title + '|' + t.artist;
      if (nextKey !== key) {
        key = nextKey;
        box.querySelector('.title').textContent = t.title;
        box.querySelector('.artist').textContent = t.artist || t.source || '';
        box.querySelector('.label').textContent = data.live ? 'Live Radio' : 'Now Playing';
        cover.style.backgroundImage = t.artwork ? 'url("' + t.artwork.replace(/"/g, '%22') + '")' : '';
      }
      if (t.colors && t.colors.length === 2) {
        box.style.setProperty('--a', t.colors[0]);
        box.style.setProperty('--b', t.colors[1]);
      }
    }
    box.classList.toggle('show', visible);
  }

  function tick() {
    if (data && data.duration && !data.live) {
      let pos = data.position + (data.playing ? (performance.now() - base) / 1000 : 0);
      pos = Math.min(data.duration, Math.max(0, pos));
      bar.style.width = (pos / data.duration) * 100 + '%';
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  function poll() {
    fetch('/nowplaying.json').then((r) => r.json()).then(apply).catch(() => {});
  }

  if (window.EventSource) {
    const events = new EventSource('/events');
    events.onmessage = (event) => { try { apply(JSON.parse(event.data)); } catch (e) {} };
  } else {
    poll();
    setInterval(poll, 2000);
  }
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
  id: 'obs-overlay',
  name: 'OBS Now-Playing',
  version: '1.0.0',
  description:
    'Zeigt den laufenden Titel als transparentes Overlay in OBS (Browserquelle) und schreibt ihn auf Wunsch in Textdateien.',
  help:
    'In OBS: Quelle hinzufügen → Browser → die kopierte URL einfügen, Breite 600 und Höhe 160 eintragen. ' +
    'Der Server läuft nur auf deinem PC (127.0.0.1); andere Geräte im Netzwerk erreichen ihn nicht.',
  settings: [
    { id: 'port', type: 'number', label: 'Port', default: 4787, min: 1024, max: 65535, help: 'Nur ändern, wenn 4787 belegt ist.' },
    {
      id: 'style',
      type: 'select',
      label: 'Stil',
      default: 'card',
      options: [
        { value: 'card', label: 'Karte mit Cover' },
        { value: 'bar', label: 'Schmale Leiste' },
        { value: 'minimal', label: 'Nur Text' },
      ],
    },
    { id: 'hideOnPause', type: 'toggle', label: 'Bei Pause ausblenden', default: true },
    { id: 'showProgress', type: 'toggle', label: 'Fortschrittsbalken anzeigen', default: true },
    {
      id: 'textFiles',
      type: 'toggle',
      label: 'Textdateien schreiben',
      default: false,
      help: 'nowplaying.txt, title.txt, artist.txt und cover.jpg für OBS-Text- und Bildquellen.',
    },
    { id: 'folder', type: 'folder', label: 'Ordner für Textdateien', default: '', placeholder: 'Dokumente\\CleanMusic OBS' },
  ],
  actions: [
    { id: 'copy-url', label: 'Overlay-URL kopieren', when: 'running' },
    { id: 'open', label: 'Vorschau im Browser', when: 'running' },
    { id: 'open-folder', label: 'Textordner öffnen', when: 'files' },
    { id: 'restart', label: 'Server neu starten' },
  ],

  async setup(context) {
    ctx = context;
    player = ctx.player.state();
    await start();
    writeFiles(true);
  },

  dispose() {
    clearTimeout(broadcastTimer);
    stop();
    ctx = null;
  },

  async onSettings() {
    if (!server || serverPort !== Math.round(Number(settings().port))) await start();
    broadcast();
    await writeFiles(true);
  },

  onEvent(type, state) {
    player = state;
    broadcast();
    if (type !== 'volume') writeFiles();
  },

  status() {
    const flags = { running: Boolean(server), files: Boolean(settings().textFiles) };
    if (serverError) return { ready: false, text: 'Server-Fehler', detail: serverError, flags };
    if (!server) return { ready: false, text: 'Gestoppt', detail: '', flags };
    const connected = clients.size;
    return {
      ready: true,
      text: `Läuft · Port ${serverPort}`,
      detail: `${overlayUrl()} · ${connected === 1 ? '1 Quelle verbunden' : `${connected} Quellen verbunden`}`,
      flags,
    };
  },

  async runAction(id) {
    if (id === 'copy-url') {
      ctx.copyText(overlayUrl());
      return { message: 'Overlay-URL kopiert – in OBS als Browserquelle einfügen.' };
    }
    if (id === 'open') {
      ctx.openExternal(overlayUrl());
      return { message: 'Vorschau geöffnet.' };
    }
    if (id === 'open-folder') {
      fs.mkdirSync(filesDir(), { recursive: true });
      await writeFiles(true);
      const error = await ctx.openPath(filesDir());
      return { message: error ? `Ordner konnte nicht geöffnet werden: ${error}` : 'Textordner geöffnet.' };
    }
    if (id === 'restart') {
      const ok = await start();
      return { message: ok ? 'Server neu gestartet.' : serverError };
    }
    return { message: null };
  },

  // For tests.
  _debug: () => ({ port: serverPort, clients: clients.size, error: serverError, dir: ctx ? filesDir() : null }),
};
