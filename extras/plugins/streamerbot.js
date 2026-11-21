'use strict';

/**
 * CleanMusic plugin: Streamer.bot (optional, API v2).
 *
 * Not part of CleanMusic itself and never loaded automatically. Add it under
 * Einstellungen → Plugins → „Plugin hinzufügen“ and switch it on.
 *
 * Streamer.bot calls small local addresses with its "Fetch URL" sub-action:
 *
 *   GET /song                 → one line for the chat ("Gerade läuft: …")
 *   GET /nowplaying.json      → title, artist, source, cover, position
 *   GET /skip?token=…         → next title
 *   GET /pause?token=…        → pause / resume
 *
 * Listens on 127.0.0.1 only and answers only requests whose Host is
 * 127.0.0.1/localhost. Commands that change playback need the token, so a
 * web page cannot trigger them (e.g. via an <img> tag).
 */

const http = require('node:http');
const crypto = require('node:crypto');

let ctx = null;
let server = null;
let serverPort = 0;
let serverError = null;
let player = null;
let lastCommand = 0;
let requests = 0;

const COMMAND_GAP = 2500; // ms between two playback commands (chat spam)

function settings() {
  const defaults = {
    port: 4788,
    template: 'Gerade läuft: {artist} – {title}',
    idleText: 'Gerade läuft nichts.',
    control: true,
  };
  return Object.assign(defaults, ctx ? ctx.settings.get() : {});
}

function token() {
  const stored = ctx.config.get().token;
  if (typeof stored === 'string' && /^[a-f0-9]{24}$/.test(stored)) return stored;
  const fresh = crypto.randomBytes(12).toString('hex');
  ctx.config.set({ token: fresh });
  return fresh;
}

function baseUrl() {
  return `http://127.0.0.1:${serverPort || settings().port}`;
}

function songLine() {
  const s = settings();
  const track = player && player.track;
  if (!track) return s.idleText || 'Gerade läuft nichts.';
  const line = String(s.template || '{artist} – {title}')
    .replace(/\{title\}/g, track.title || '')
    .replace(/\{artist\}/g, track.artist || track.source || '')
    .replace(/\{source\}/g, track.source || '')
    .replace(/\{link\}/g, track.link || '')
    .replace(/\s+[–-]\s*$/g, '')
    .replace(/^\s*[–-]\s+/g, '')
    .trim();
  return line.slice(0, 400);
}

function nowPlaying() {
  const p = player || {};
  const track = p.track || null;
  let position = Number(p.position) || 0;
  if (p.playing && !p.live && p.at) {
    position += (Date.now() - p.at) / 1000;
    if (p.duration) position = Math.min(p.duration, position);
  }
  return {
    playing: Boolean(p.playing),
    live: Boolean(p.live),
    position: Math.round(position),
    duration: Math.round(Number(p.duration) || 0),
    title: track ? track.title || '' : '',
    artist: track ? track.artist || '' : '',
    source: track ? track.source || '' : '',
    artwork: track ? track.artwork || '' : '',
    link: track ? track.link || '' : '',
    text: songLine(),
  };
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

const text = (res, status, body) => send(res, status, 'text/plain; charset=utf-8', body);

function tokenOk(url) {
  const given = String(url.searchParams.get('token') || '');
  const expected = token();
  return given.length === expected.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function command(res, url, run) {
  if (!settings().control) return text(res, 403, 'Steuerung ist im Plugin ausgeschaltet.');
  if (!tokenOk(url)) return text(res, 403, 'Falscher oder fehlender Token.');
  const now = Date.now();
  if (now - lastCommand < COMMAND_GAP) return text(res, 429, 'Langsam – kurz warten.');
  lastCommand = now;
  return text(res, 200, run());
}

function handle(req, res) {
  requests += 1;
  const host = String(req.headers.host || '');
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) return text(res, 403, 'Nur lokal erreichbar.');
  if (req.method !== 'GET' && req.method !== 'POST') return text(res, 405, 'Nur GET oder POST.');

  const url = new URL(req.url, 'http://127.0.0.1');
  switch (url.pathname) {
    case '/':
    case '/song':
      return text(res, 200, songLine());
    case '/nowplaying.json':
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(nowPlaying()));
    case '/skip':
      return command(res, url, () => {
        ctx.player.next();
        return '⏭ Nächster Titel';
      });
    case '/pause':
      return command(res, url, () => {
        const wasPlaying = Boolean(player && player.playing);
        ctx.player.toggle();
        return wasPlaying ? '⏸ Pausiert' : '▶ Weiter geht’s';
      });
    default:
      return text(res, 404, 'Nicht gefunden.');
  }
}

function stop() {
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
  const port = Math.round(Number(settings().port)) || 4788;
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
      resolve(true);
    });
  });
}

function setupText() {
  const t = token();
  return [
    'CleanMusic × Streamer.bot – Adressen für „Fetch URL“',
    '',
    `!song   ${baseUrl()}/song`,
    `!skip   ${baseUrl()}/skip?token=${t}`,
    `!pause  ${baseUrl()}/pause?token=${t}`,
    '',
    'Den Token nicht im Stream zeigen. Neu erzeugen: Plugin-Karte → „Token neu erzeugen“.',
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * Plugin API
 * ------------------------------------------------------------------ */

module.exports = {
  apiVersion: 2,
  id: 'streamerbot',
  name: 'Streamer.bot',
  version: '1.0.0',
  description:
    'Chat-Befehle für Twitch über Streamer.bot: !song postet den aktuellen Titel, !skip und !pause steuern CleanMusic.',
  help:
    'In Streamer.bot je Befehl eine Action anlegen und darin die Sub-Action „Fetch URL“ mit der kopierten ' +
    'Adresse verwenden. Bei !song das Ergebnis in eine Variable speichern und mit „Send Message to Channel“ ' +
    'in den Twitch-Chat schreiben. !skip und !pause in Streamer.bot nur für Mods freigeben. ' +
    'Schritt für Schritt: extras/plugins/README.md im CleanMusic-Repository.',
  settings: [
    { id: 'port', type: 'number', label: 'Port', default: 4788, min: 1024, max: 65535, help: 'Nur ändern, wenn 4788 belegt ist.' },
    {
      id: 'template',
      type: 'text',
      label: 'Text für !song',
      default: 'Gerade läuft: {artist} – {title}',
      help: 'Platzhalter: {title}, {artist}, {source}, {link}',
    },
    { id: 'idleText', type: 'text', label: 'Text, wenn nichts läuft', default: 'Gerade läuft nichts.' },
    { id: 'control', type: 'toggle', label: '!skip und !pause erlauben', default: true },
  ],
  actions: [
    { id: 'copy', label: 'Adressen kopieren', when: 'running' },
    { id: 'token', label: 'Token neu erzeugen' },
    { id: 'restart', label: 'Server neu starten' },
  ],

  async setup(context) {
    ctx = context;
    player = ctx.player.state();
    token();
    await start();
  },

  dispose() {
    stop();
    ctx = null;
  },

  async onSettings() {
    if (!server || serverPort !== Math.round(Number(settings().port))) await start();
  },

  onEvent(_type, state) {
    player = state;
  },

  status() {
    const flags = { running: Boolean(server) };
    if (serverError) return { ready: false, text: 'Server-Fehler', detail: serverError, flags };
    if (!server) return { ready: false, text: 'Gestoppt', detail: '', flags };
    return {
      ready: true,
      text: `Läuft · Port ${serverPort}`,
      detail: `${baseUrl()}/song · ${requests} Anfragen seit dem Start`,
      flags,
    };
  },

  async runAction(id) {
    if (id === 'copy') {
      ctx.copyText(setupText());
      return { message: 'Adressen kopiert – in Streamer.bot bei „Fetch URL“ einfügen.' };
    }
    if (id === 'token') {
      ctx.config.set({ token: crypto.randomBytes(12).toString('hex') });
      return { message: 'Neuer Token erzeugt – Adressen neu kopieren und in Streamer.bot ersetzen.' };
    }
    if (id === 'restart') {
      const ok = await start();
      return { message: ok ? 'Server neu gestartet.' : serverError };
    }
    return { message: null };
  },

  // For tests.
  _debug: () => ({ port: serverPort, token: ctx ? token() : null, error: serverError }),
};
