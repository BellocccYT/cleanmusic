/* cleanmusic-plugin
{
  "apiVersion": 3,
  "name": "Xeneon Edge",
  "version": "1.0.0",
  "description": "Touch-Player für das CORSAIR XENEON EDGE (iCUE-Widget).",
  "permissions": ["player", "visualizer", "server:local", "ui:settings", "ui:panel", "clipboard",
                  "external-links", "network:dzcdn.net", "network:mzstatic.com", "network:ytimg.com",
                  "network:googleusercontent.com"]
}
*/
'use strict';

/**
 * CleanMusic plugin: local bridge for the CORSAIR XENEON EDGE iCUE widget.
 *
 * Not part of CleanMusic itself and never loaded automatically. Add the file
 * under Einstellungen -> Plugins, switch it on, then open the widget on the
 * Edge and confirm the 4-digit code here.
 *
 * - HTTP + Server-Sent Events on http://localhost:4790 (127.0.0.1 and ::1).
 *   The widget only ever talks to that one address; covers are proxied so the
 *   widget never needs access to Deezer/Apple/YouTube image hosts.
 * - Pairing: the widget asks, this panel shows a 4-digit code, the user clicks
 *   "Xeneon Edge erlauben". Only SHA-256 hashes of the 32-byte tokens are kept
 *   in <userData>/plugin-data/xeneon-edge/devices.json (max. 3 devices).
 * - No telemetry, no data beyond title/artist/album/cover/lyric line/position,
 *   no downloads, no ads. CORS is open because the widget origin is unknown,
 *   but every endpoint except /api/pair* needs the token (header X-CM-Token or
 *   ?k= for <img>/EventSource, which cannot send headers).
 *
 * Inoffiziell - nicht von CORSAIR. Markennamen nur beschreibend.
 */

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Math.max(
  1024,
  Math.min(65535, Math.round(Number(process.env.CLEANMUSIC_XENEON_PORT) || 4790))
);
const HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`]);
const MAX_DEVICES = 3;
const PAIR_TTL = 2 * 60 * 1000;
const MAX_CLIENTS = 4;
const RATE_PER_SECOND = 20;
const MAX_COVER_BYTES = 2 * 1024 * 1024;
const COVER_CACHE = 12;
const COVER_HOSTS = ['dzcdn.net', 'mzstatic.com', 'ytimg.com', 'googleusercontent.com'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const RELEASES_URL = 'https://github.com/BellocccYT/cleanmusic/releases/latest';
const DEFAULTS = { spectrum: true, lyrics: true };

let ctx = null;
let servers = [];
let serverError = '';
let player = null;
let settingsOverride = {};
let devices = [];
let pendingPair = null;
let clients = new Set();
let stateTimer = null;
let heartbeatTimer = null;
let lastSpectrumAt = 0;
const coverUrls = new Map();
const coverCache = new Map();
const rate = new Map();

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

function settings() {
  let stored = {};
  try {
    stored = ctx && ctx.settings ? ctx.settings.get() : {};
  } catch {
    stored = {};
  }
  return Object.assign({}, DEFAULTS, stored, settingsOverride);
}

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function clean(value, max) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function devicesFile() {
  return ctx ? path.join(ctx.dataDir, 'devices.json') : '';
}

function loadDevices() {
  try {
    const file = devicesFile();
    if (!file || !fs.existsSync(file)) return [];
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(data && data.devices) ? data.devices : [];
    return list
      .filter((entry) => entry && /^[a-f0-9]{64}$/.test(String(entry.hash || '')))
      .slice(-MAX_DEVICES)
      .map((entry) => ({
        hash: String(entry.hash),
        name: clean(entry.name, 40) || 'Xeneon Edge',
        at: Number(entry.at) || 0,
      }));
  } catch {
    return [];
  }
}

function saveDevices() {
  try {
    const file = devicesFile();
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(
      tmp,
      JSON.stringify({ version: 1, devices: devices.slice(-MAX_DEVICES) }, null, 2),
      'utf8'
    );
    fs.renameSync(tmp, file);
  } catch {
    /* a broken token file must never break playback */
  }
}

function tokenMatches(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 120) return false;
  if (!devices.length) return false;
  const probe = Buffer.from(hashToken(token), 'hex');
  let ok = false;
  for (const device of devices) {
    const known = Buffer.from(device.hash, 'hex');
    if (known.length === probe.length && crypto.timingSafeEqual(known, probe)) ok = true;
  }
  return ok;
}

function tokenFrom(req, url) {
  const header = req.headers['x-cm-token'];
  if (typeof header === 'string' && header) return header;
  return url.searchParams.get('k') || url.searchParams.get('token') || '';
}

function hostOk(req) {
  const host = String(req.headers.host || '').toLowerCase();
  return HOSTS.has(host);
}

function rateOk(req) {
  const key = String((req.socket && req.socket.remoteAddress) || 'local');
  const now = Date.now();
  const slot = rate.get(key);
  if (!slot || now - slot.at >= 1000) {
    rate.set(key, { at: now, count: 1 });
    return true;
  }
  slot.count += 1;
  if (slot.count > RATE_PER_SECOND) return false;
  return true;
}

function setCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CM-Token, Content-Type');
  res.setHeader('Access-Control-Max-Age', '600');
  // Chromium's Private Network Access preflight for file:// -> localhost.
  if (req.headers.origin) res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
}

function json(res, status, data) {
  const body = JSON.stringify(data);
  try {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  } catch {
    /* client gone */
  }
}

function readBody(req, limit = 4096) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        resolve({ error: 'too-large' });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({ data: {} });
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve({ data: parsed && typeof parsed === 'object' ? parsed : {} });
      } catch {
        resolve({ error: 'json' });
      }
    });
    req.on('error', () => resolve({ error: 'read' }));
  });
}

/* ------------------------------------------------------------------ *
 * State for the widget
 * ------------------------------------------------------------------ */

function projectedPosition(state, now) {
  const source = state || {};
  const position = Math.max(0, Number(source.position) || 0);
  const duration = Math.max(0, Number(source.duration) || 0);
  if (source.live) return 0;
  if (!source.playing) return position;
  const at = Number(source.at) || 0;
  if (!at || now <= at) return position;
  // At most five seconds past the last known point: after a stall or a lost
  // connection the bar must not run away.
  const next = position + Math.min(5, (now - at) / 1000);
  return duration > 0 ? Math.min(duration, next) : next;
}

function allowedCoverHost(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return COVER_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

function dataCover(url) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif|avif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(
    String(url || '')
  );
  if (!match) return null;
  try {
    const body = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
    if (!body.length || body.length > MAX_COVER_BYTES) return null;
    return { type: match[1].toLowerCase(), body };
  } catch {
    return null;
  }
}

function coverIdFor(artwork) {
  const raw = String(artwork || '');
  if (!raw) return null;
  const isData = raw.startsWith('data:image/');
  if (!isData && !allowedCoverHost(raw)) return null;
  const id = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 20);
  if (!coverUrls.has(id)) {
    if (coverUrls.size >= 24) coverUrls.delete(coverUrls.keys().next().value);
    coverUrls.set(id, raw);
  }
  return id;
}

function coverPath(artwork) {
  const id = coverIdFor(artwork);
  return id ? `/api/cover?v=${id}` : null;
}

function publicState() {
  const source = player || {};
  const track = source.track;
  const now = Date.now();
  const caps = {
    seek: Boolean(ctx && ctx.player && typeof ctx.player.seek === 'function'),
    like: Boolean(ctx && ctx.player && typeof ctx.player.toggleFavorite === 'function'),
    spectrum: Boolean(settings().spectrum),
  };
  return {
    appVersion: clean(ctx && ctx.appVersion, 20),
    at: now,
    capabilities: caps,
    track: track
      ? {
          title: clean(track.title, 200),
          artist: clean(track.artist, 200),
          album: clean(track.album, 200),
          kind: clean(track.kind, 20),
          live: Boolean(source.live || track.kind === 'radio'),
          colors: (Array.isArray(track.colors) ? track.colors : [])
            .filter((color) => /^#[0-9a-f]{6}$/i.test(String(color || '')))
            .slice(0, 3),
          cover: coverPath(track.artwork),
        }
      : null,
    playing: Boolean(source.playing),
    position: projectedPosition(source, now),
    duration: Math.max(0, Math.min(24 * 3600, Number(source.duration) || 0)),
    volume: Math.max(0, Math.min(1.5, Number(source.volume) || 0)),
    muted: Boolean(source.muted),
    favorite: typeof source.favorite === 'boolean' ? source.favorite : null,
    lyricsOn: Boolean(source.lyricsOn) || Boolean(source.lyric),
    lyric:
      settings().lyrics && source.lyric && typeof source.lyric === 'object'
        ? {
            line: clean(source.lyric.line, 300),
            next: clean(source.lyric.next, 300),
          }
        : null,
    upNext: (Array.isArray(source.upNext) ? source.upNext : []).slice(0, 4).map((entry) => ({
      title: clean(entry && entry.title, 200),
      artist: clean(entry && entry.artist, 200),
      cover: null,
    })),
    devices: devices.length,
  };
}

/* ------------------------------------------------------------------ *
 * SSE
 * ------------------------------------------------------------------ */

function writeEvent(res, name, data) {
  try {
    res.write(`event: ${name}\ndata: ${data}\n\n`);
  } catch {
    /* removed on close */
  }
}

function broadcastState(force = false) {
  if (!clients.size) return;
  if (stateTimer && !force) return;
  if (force) {
    clearTimeout(stateTimer);
    stateTimer = null;
  }
  if (stateTimer) return;
  stateTimer = setTimeout(() => {
    stateTimer = null;
    if (!clients.size) return;
    const payload = JSON.stringify(publicState());
    for (const client of clients) writeEvent(client.res, 'state', payload);
  }, 40);
}

function maybeSpectrum() {
  if (!settings().spectrum || !clients.size) return;
  let interested = false;
  for (const client of clients) if (client.spectrum) interested = true;
  if (!interested) return;
  const now = Date.now();
  if (now - lastSpectrumAt < 48) return;
  lastSpectrumAt = now;
  const spectrum =
    player && player.visualizer && Array.isArray(player.visualizer.spectrum)
      ? player.visualizer.spectrum
      : [];
  if (!spectrum.length) return;
  const payload = JSON.stringify({
    v: spectrum.slice(0, 32).map((value) => Math.max(0, Math.min(255, Math.round(Number(value) || 0)))),
    level: Math.max(0, Math.min(1, Number(player.visualizer.level) || 0)),
    at: now,
  });
  for (const client of clients) if (client.spectrum) writeEvent(client.res, 'spectrum', payload);
}

function startHeartbeat() {
  clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    for (const client of clients) {
      try {
        client.res.write(`event: ping\ndata: ${Date.now()}\n\n`);
      } catch {
        /* removed on close */
      }
    }
  }, 15000);
}

/* ------------------------------------------------------------------ *
 * Pairing and panel
 * ------------------------------------------------------------------ */

function pendingInfo() {
  if (!pendingPair) return null;
  if (pendingPair.at + PAIR_TTL < Date.now()) {
    pendingPair = null;
    return null;
  }
  return pendingPair;
}

function deviceListHtml() {
  if (!devices.length) return '<span class="muted small">Noch kein Gerät gekoppelt.</span>';
  return `<ul style="margin:6px 0 0 18px;padding:0">${devices
    .map(
      (device) =>
        `<li>${esc(device.name)} <span class="muted small">seit ${esc(
          device.at ? new Date(device.at).toLocaleDateString('de-DE') : '?'
        )}</span></li>`
    )
    .join('')}</ul>`;
}

function panelHtml() {
  const pending = pendingInfo();
  const direct = pending && pending.allowed ? pending.token || '' : '';
  return `
    <div class="xeneon-panel">
      <p style="margin:0 0 6px"><strong>Touch-Player für das CORSAIR XENEON EDGE.</strong>
      Inoffiziell – nicht von CORSAIR. Das Widget spricht nur mit diesem PC
      (localhost:${PORT}).</p>
      <ol style="margin:6px 0 6px 18px;padding:0">
        <li>Widget <code>CleanMusic.icuewidget</code> in iCUE importieren und auf dem Edge öffnen.</li>
        <li>Im Widget <strong>Verbinden</strong> antippen.</li>
        <li>Hier denselben Code prüfen und <strong>Xeneon Edge erlauben</strong> drücken.</li>
      </ol>
      ${
        pending
          ? `<div style="margin:10px 0;padding:10px 14px;border-radius:10px;background:rgba(91,140,255,.14);border:1px solid rgba(91,140,255,.35)">
               <div class="muted small">Code im Widget bestätigen</div>
               <div style="font:700 30px/1.1 ui-monospace,Consolas,monospace;letter-spacing:.22em;margin-top:4px">${esc(
                 pending.code
               )}</div>
               <div class="muted small" style="margin-top:4px">Gültig für 2 Minuten.</div>
             </div>`
          : ''
      }
      ${
        direct
          ? `<div class="muted small" style="margin-top:6px">Kopplungsschlüssel (nur falls „Verbinden“ nicht klappt): <code>${esc(
              direct
            )}</code></div>`
          : ''
      }
      <div style="margin-top:8px" class="muted small">Gekoppelt: ${devices.length} von ${MAX_DEVICES}</div>
      ${deviceListHtml()}
      <p class="muted small" style="margin:8px 0 0">Notlösung ohne Kopplungscode: „Kopplungsschlüssel kopieren“
      und im Widget unter <em>Kopplungsschlüssel</em> einfügen.</p>
    </div>`;
}

function publishPanel() {
  if (!ctx || !ctx.ui || typeof ctx.ui.panel !== 'function') return;
  try {
    ctx.ui.panel({ slot: 'settings', title: 'Xeneon Edge', html: panelHtml() });
  } catch {
    /* permission or plugin gone */
  }
}

function notify(text) {
  try {
    if (ctx && typeof ctx.notify === 'function') ctx.notify(text);
  } catch {
    /* never break playback */
  }
}

function createPairRequest(res) {
  if (devices.length >= MAX_DEVICES) {
    return json(res, 409, { error: 'devices-full' });
  }
  const current = pendingInfo();
  if (current && !current.allowed) {
    return json(res, 200, {
      pairId: current.id,
      code: current.code,
      expires: current.at + PAIR_TTL,
    });
  }
  const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  pendingPair = {
    id: crypto.randomBytes(12).toString('hex'),
    code,
    at: Date.now(),
    allowed: false,
    token: null,
  };
  notify(`Xeneon Edge möchte sich verbinden – Code ${code}. In den Plugins auf „Xeneon Edge erlauben“ klicken.`);
  publishPanel();
  json(res, 200, { pairId: pendingPair.id, code, expires: pendingPair.at + PAIR_TTL });
}

function pairStatus(url, res) {
  const id = decodeURIComponent(url.pathname.slice('/api/pair/'.length));
  const pending = pendingInfo();
  if (!pending || pending.id !== id) {
    return json(res, 410, { status: 'expired' });
  }
  if (!pending.allowed) return json(res, 200, { status: 'pending' });
  if (pending.token) {
    const token = pending.token;
    pending.token = null;
    return json(res, 200, { status: 'paired', token });
  }
  return json(res, 200, { status: 'paired' });
}

function allowPair() {
  const pending = pendingInfo();
  if (!pending || pending.allowed) return { message: 'Keine offene Kopplungsanfrage.' };
  if (devices.length >= MAX_DEVICES) {
    return {
      message: `Es sind schon ${MAX_DEVICES} Geräte gekoppelt. Bitte zuerst „Kopplungen zurücksetzen“.`,
    };
  }
  const token = newToken();
  devices.push({ hash: hashToken(token), name: 'Xeneon Edge', at: Date.now() });
  saveDevices();
  pending.allowed = true;
  pending.token = token;
  publishPanel();
  if (ctx && typeof ctx.refresh === 'function') ctx.refresh();
  notify('Xeneon Edge gekoppelt.');
  return { message: 'Xeneon Edge gekoppelt – das Widget verbindet sich jetzt.' };
}

function resetPairs() {
  devices = [];
  pendingPair = null;
  saveDevices();
  for (const client of clients) {
    try {
      client.res.end();
    } catch {
      /* ignore */
    }
  }
  clients.clear();
  publishPanel();
  if (ctx && typeof ctx.refresh === 'function') ctx.refresh();
  return { message: 'Alle Kopplungen entfernt. Das Widget muss sich neu verbinden.' };
}

function copyKey() {
  if (devices.length >= MAX_DEVICES) {
    return { message: 'Es sind schon 3 Geräte gekoppelt – zuerst „Kopplungen zurücksetzen“.' };
  }
  const token = newToken();
  devices.push({ hash: hashToken(token), name: 'Widget-Schlüssel', at: Date.now() });
  saveDevices();
  try {
    ctx.copyText(token);
  } catch {
    return { message: 'Schlüssel erzeugt, konnte aber nicht kopiert werden.' };
  }
  publishPanel();
  if (ctx && typeof ctx.refresh === 'function') ctx.refresh();
  return {
    message: 'Kopplungsschlüssel kopiert – im Widget unter „Kopplungsschlüssel“ einfügen.',
  };
}

/* ------------------------------------------------------------------ *
 * Cover proxy
 * ------------------------------------------------------------------ */

function coverCacheSet(id, type, body) {
  if (coverCache.size >= COVER_CACHE) coverCache.delete(coverCache.keys().next().value);
  coverCache.set(id, { type, body, at: Date.now() });
}

async function loadCover(id) {
  const cached = coverCache.get(id);
  if (cached) return cached;
  const url = coverUrls.get(id);
  if (!url) return null;

  if (url.startsWith('data:image/')) {
    const decoded = dataCover(url);
    if (!decoded) return null;
    coverCacheSet(id, decoded.type, decoded.body);
    return coverCache.get(id);
  }

  if (!allowedCoverHost(url)) return null;
  let fetched;
  try {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 8000) : null;
    fetched = await ctx.fetch(url, {
      redirect: 'error',
      headers: { Accept: 'image/jpeg,image/png,image/webp,image/gif,image/avif' },
      signal: controller ? controller.signal : undefined,
    });
    if (timer) clearTimeout(timer);
  } catch {
    return null;
  }
  if (!fetched || !fetched.ok) return null;
  const type = String((fetched.headers && fetched.headers.get('content-type')) || '').toLowerCase();
  const mime = type.split(';')[0].trim();
  if (!IMAGE_TYPES.includes(mime)) return null;
  const declared = Number((fetched.headers && fetched.headers.get('content-length')) || 0);
  if (declared > MAX_COVER_BYTES) return null;
  let body;
  try {
    body = Buffer.from(await fetched.arrayBuffer());
  } catch {
    return null;
  }
  if (!body.length || body.length > MAX_COVER_BYTES) return null;
  coverCacheSet(id, mime, body);
  return coverCache.get(id);
}

async function serveCover(url, res) {
  const id = String(url.searchParams.get('v') || '');
  if (!/^[a-f0-9]{20}$/.test(id)) return json(res, 404, { error: 'cover' });
  const cover = await loadCover(id);
  if (!cover) return json(res, 404, { error: 'cover' });
  try {
    res.writeHead(200, {
      'Content-Type': cover.type,
      'Content-Length': cover.body.length,
      'Cache-Control': 'private, max-age=300',
    });
    res.end(cover.body);
  } catch {
    /* client gone */
  }
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

async function runCommand(body) {
  const command = clean(body.command, 20);
  const value = body.value;
  const p = ctx && ctx.player;
  if (!p) return { status: 503, data: { ok: false, error: 'player' } };

  switch (command) {
    case 'toggle':
      p.toggle();
      return { status: 200, data: { ok: true } };
    case 'play':
      p.play();
      return { status: 200, data: { ok: true } };
    case 'pause':
      p.pause();
      return { status: 200, data: { ok: true } };
    case 'next':
      p.next();
      return { status: 200, data: { ok: true } };
    case 'previous':
      p.previous();
      return { status: 200, data: { ok: true } };
    case 'volume': {
      const level = clampNumber(value, 0, 1.5);
      if (level === null) return { status: 400, data: { ok: false, error: 'value' } };
      p.setVolume(level);
      return { status: 200, data: { ok: true } };
    }
    case 'mute':
      p.setMuted(value === undefined ? true : Boolean(value));
      return { status: 200, data: { ok: true } };
    case 'seek': {
      if (typeof p.seek !== 'function') {
        return { status: 501, data: { ok: false, error: 'not-supported' } };
      }
      const seconds = clampNumber(value, 0, 24 * 3600);
      if (seconds === null) return { status: 400, data: { ok: false, error: 'value' } };
      p.seek(seconds);
      return { status: 200, data: { ok: true } };
    }
    case 'like': {
      if (typeof p.toggleFavorite !== 'function') {
        return { status: 501, data: { ok: false, error: 'not-supported' } };
      }
      p.toggleFavorite();
      return { status: 200, data: { ok: true } };
    }
    default:
      return { status: 400, data: { ok: false, error: 'command' } };
  }
}

/* ------------------------------------------------------------------ *
 * HTTP server
 * ------------------------------------------------------------------ */

async function handle(req, res) {
  try {
    if (!hostOk(req)) return json(res, 403, { error: 'host' });
    setCors(req, res);
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }
    if (!rateOk(req)) {
      res.setHeader('Retry-After', '1');
      return json(res, 429, { error: 'rate' });
    }

    const url = new URL(req.url || '/', `http://localhost:${PORT}`);

    if (url.pathname === '/api/pair' && req.method === 'POST') return createPairRequest(res);
    if (url.pathname.startsWith('/api/pair/') && req.method === 'GET') return pairStatus(url, res);

    if (!tokenMatches(tokenFrom(req, url))) return json(res, 401, { error: 'token' });

    if (url.pathname === '/api/state' && req.method === 'GET') {
      return json(res, 200, publicState());
    }

    if (url.pathname === '/api/events' && req.method === 'GET') {
      if (clients.size >= MAX_CLIENTS) return json(res, 429, { error: 'clients' });
      return openEvents(req, res, url);
    }

    if (url.pathname === '/api/cmd' && req.method === 'POST') {
      const body = await readBody(req);
      if (body.error) return json(res, 400, { ok: false, error: body.error });
      const result = await runCommand(body.data);
      broadcastState(true);
      return json(res, result.status, { ...result.data, state: publicState() });
    }

    if (url.pathname === '/api/cover' && req.method === 'GET') return serveCover(url, res);

    return json(res, 404, { error: 'not-found' });
  } catch (error) {
    try {
      json(res, 500, { error: 'internal' });
    } catch {
      /* ignore */
    }
    if (isDev()) console.error('[xeneon-edge]', error && error.message);
  }
}

function isDev() {
  return process.argv.includes('--dev');
}

function openEvents(req, res, url) {
  const spectrum = url.searchParams.get('spectrum') === '1';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  const client = { res, spectrum, at: Date.now() };
  clients.add(client);
  writeEvent(res, 'state', JSON.stringify(publicState()));
  req.on('close', () => clients.delete(client));
  res.on('close', () => clients.delete(client));
  res.on('error', () => clients.delete(client));
  return true;
}

function listen(host) {
  return new Promise((resolve) => {
    const server = http.createServer(handle);
    server.keepAliveTimeout = 5000;
    server.on('error', (error) => resolve({ ok: false, error }));
    server.listen({ host, port: PORT }, () => resolve({ ok: true, server, host }));
  });
}

async function start() {
  stop();
  serverError = '';
  const results = await Promise.all([listen('127.0.0.1'), listen('::1')]);
  servers = results.filter((result) => result.ok).map((result) => result.server);
  const failures = results.filter((result) => !result.ok);
  if (!servers.length) {
    const error = failures[0] && failures[0].error;
    serverError =
      error && error.code === 'EADDRINUSE'
        ? `Port ${PORT} ist bereits belegt.`
        : `Server konnte nicht starten (${(error && error.code) || 'unbekannt'}).`;
    return false;
  }
  startHeartbeat();
  return true;
}

function stop() {
  clearTimeout(stateTimer);
  stateTimer = null;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  for (const client of clients) {
    try {
      client.res.end();
    } catch {
      /* ignore */
    }
  }
  clients.clear();
  for (const server of servers) {
    try {
      server.close();
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
    } catch {
      /* ignore */
    }
  }
  servers = [];
}

/* ------------------------------------------------------------------ *
 * Plugin API
 * ------------------------------------------------------------------ */

module.exports = {
  apiVersion: 2,
  id: 'xeneon-edge',
  name: 'Xeneon Edge',
  version: '1.0.0',
  // Asks CleanMusic for the 32 live spectrum bands (only forwarded when on).
  visualizer: true,
  description:
    'Lokale Brücke für das iCUE-Widget „CleanMusic“ auf dem CORSAIR XENEON EDGE (Touch-Player).',
  help:
    'Das Widget liegt als CleanMusic.icuewidget im GitHub-Release und wird in iCUE importiert. Danach auf dem Edge ' +
    'öffnen, „Verbinden“ antippen und hier den Code bestätigen. Der Server läuft nur auf diesem PC ' +
    `(localhost:${PORT}); andere Geräte im Netzwerk erreichen ihn nicht. Inoffiziell – nicht von CORSAIR.`,
  settings: [
    {
      id: 'spectrum',
      type: 'toggle',
      label: 'Mini-Spektrum senden',
      default: true,
      help: 'Dezente Frequenzbalken hinter dem Fortschritt (höchstens 20-mal pro Sekunde).',
    },
    {
      id: 'lyrics',
      type: 'toggle',
      label: 'Songtext ans Widget senden',
      default: true,
      help: 'Nur die aktuelle und die nächste Zeile, nur wenn Songtexte in CleanMusic an sind.',
    },
  ],
  actions: [
    { id: 'allow-pair', label: 'Xeneon Edge erlauben', when: 'pairing' },
    { id: 'copy-key', label: 'Kopplungsschlüssel kopieren' },
    { id: 'download-widget', label: 'Widget herunterladen' },
    { id: 'reset-pairs', label: 'Kopplungen zurücksetzen' },
  ],

  async setup(context) {
    ctx = context;
    settingsOverride = {};
    player = ctx.player.state();
    devices = loadDevices();
    coverUrls.clear();
    coverCache.clear();
    const ok = await start();
    publishPanel();
    broadcastState(true);
    if (!ok) notify(serverError);
  },

  dispose() {
    stop();
    clearTimeout(stateTimer);
    stateTimer = null;
    coverUrls.clear();
    coverCache.clear();
    rate.clear();
    devices = [];
    pendingPair = null;
    player = null;
    settingsOverride = {};
    ctx = null;
  },

  onSettings(values) {
    settingsOverride = values && typeof values === 'object' ? values : {};
    broadcastState(true);
  },

  onEvent(type, state) {
    try {
      if (!state || typeof state !== 'object') return;
      if (type === 'visualizer') {
        player = Object.assign({}, player || {}, { visualizer: state.visualizer });
        maybeSpectrum();
        return;
      }
      player = state;
      broadcastState();
    } catch {
      /* a plugin error must never break playback */
    }
  },

  status() {
    const pending = pendingInfo();
    const flags = { running: servers.length > 0, pairing: Boolean(pending && !pending.allowed), devices: devices.length };
    if (serverError) return { ready: false, text: `Port ${PORT} ist belegt`, detail: serverError, flags };
    if (!servers.length) return { ready: false, text: 'Gestoppt', detail: '', flags };
    const connected = clients.size;
    return {
      ready: true,
      text: connected
        ? `Bereit – Widget verbunden (${connected})`
        : 'Wartet auf das Widget',
      detail: `localhost:${PORT} · ${devices.length} von ${MAX_DEVICES} Geräten gekoppelt`,
      flags,
    };
  },

  async runAction(id) {
    if (id === 'allow-pair') return allowPair();
    if (id === 'reset-pairs') return resetPairs();
    if (id === 'copy-key') return copyKey();
    if (id === 'download-widget') {
      try {
        ctx.openExternal(RELEASES_URL);
        return { message: 'Release-Seite geöffnet – dort CleanMusic-Xeneon-Edge-<version>.icuewidget laden.' };
      } catch {
        return { message: 'Link konnte nicht geöffnet werden.' };
      }
    }
    return { message: null };
  },

  // For test/xeneon-edge.test.js – never used by the app.
  _debug: {
    port: () => (servers.length ? PORT : 0),
    state: () => publicState(),
    devices: () => devices.map((device) => ({ name: device.name, at: device.at })),
    pending: () => (pendingPair ? { ...pendingPair } : null),
    expirePair: () => {
      if (pendingPair) pendingPair.at = 0;
    },
    sseCount: () => clients.size,
    tokenMatches,
  },
};
