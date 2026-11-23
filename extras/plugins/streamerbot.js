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
 * Optional song requests (off by default, CleanMusic 1.0.1 or newer):
 *
 *   GET /request?token=…&user=…&q=…   → !sr: search text or a link (Spotify, YouTube,
 *                                        Deezer, Apple Music) → "next" in the queue + playlist
 *   GET /wrongsong?token=…&user=…     → !wrongsong: remove the viewer's last request
 *   GET /requests                     → open requests as one chat line
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
let songRequests = 0;
const lastRequestBy = new Map(); // viewer (lower case) → time of the last accepted request
let requestChain = Promise.resolve();

const COMMAND_GAP = 2500; // ms between two playback commands (chat spam)

function settings() {
  const defaults = {
    port: 4788,
    template: 'Gerade läuft: {artist} – {title}',
    idleText: 'Gerade läuft nichts.',
    control: true,
    requests: false,
    requestSource: 'auto',
    requestPerUser: 2,
    requestCooldown: 60,
    requestMax: 15,
    requestMaxMinutes: 10,
    requestBlock: '',
    requestPosition: 'next',
    requestPlaylist: 'Songwünsche aus dem Chat',
    requestBlockAi: true,
    requestAiWords: '',
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

/* ------------------------------------------------------------------ *
 * Song requests
 * ------------------------------------------------------------------ */

function viewer(url) {
  return String(url.searchParams.get('user') || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/^@+/, '')
    .trim()
    .slice(0, 40);
}

function trackName(track) {
  if (!track || !track.title) return 'Der Titel';
  return track.artist ? `„${track.title}“ von ${track.artist}` : `„${track.title}“`;
}

// One request at a time, so limits per viewer cannot be raced.
function serial(task) {
  const run = requestChain.then(task, task);
  requestChain = run.catch(() => {});
  return run;
}

function requestGate(url) {
  if (!settings().requests) return [403, 'Songwünsche sind gerade aus.'];
  if (!tokenOk(url)) return [403, 'Falscher oder fehlender Token.'];
  if (typeof ctx.player.request !== 'function') return [501, 'Songwünsche brauchen CleanMusic 1.0.1 oder neuer.'];
  return null;
}

async function pendingList() {
  const list = await ctx.player.requests();
  return Array.isArray(list) ? list : [];
}

async function songRequest(url) {
  const gate = requestGate(url);
  if (gate) return gate;
  const s = settings();
  const user = viewer(url) || 'Chat';
  const at = `@${user}`;
  const key = user.toLowerCase();
  const query = String(url.searchParams.get('q') || '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, 200);
  if (!query) return [400, `${at} So geht’s: !sr Titel oder Artist`];

  const blocked = String(s.requestBlock || '')
    .split(',')
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
  if (blocked.some((word) => query.toLowerCase().includes(word))) return [200, `${at} Dieser Wunsch geht leider nicht.`];

  const cooldown = Math.max(0, Number(s.requestCooldown) || 0) * 1000;
  const since = Date.now() - (lastRequestBy.get(key) || 0);
  if (cooldown && since < cooldown) {
    return [429, `${at} Kurz warten – dein nächster Wunsch geht in ${Math.ceil((cooldown - since) / 1000)} s.`];
  }

  const pending = await pendingList();
  const perUser = Math.max(1, Math.round(Number(s.requestPerUser) || 2));
  if (pending.filter((entry) => String(entry.by || '').toLowerCase() === key).length >= perUser) {
    return [200, `${at} Du hast schon ${perUser === 1 ? 'einen Wunsch' : `${perUser} Wünsche`} in der Warteschlange.`];
  }
  const max = Math.max(1, Math.round(Number(s.requestMax) || 15));
  if (pending.length >= max) return [200, `${at} Die Wunschliste ist gerade voll – versuch es später noch mal.`];

  const minutes = Math.max(0, Number(s.requestMaxMinutes) || 0);
  const result = await ctx.player.request(query, {
    by: user,
    source: s.requestSource,
    maxSeconds: minutes * 60,
    position: s.requestPosition === 'end' ? 'end' : 'next',
    playlist: String(s.requestPlaylist || '').trim(),
    blockAi: Boolean(s.requestBlockAi),
    aiWords: String(s.requestAiWords || ''),
  });
  if (!result || !result.ok) {
    switch (result && result.reason) {
      case 'not-found':
        return [200, `${at} Dazu habe ich nichts gefunden.`];
      case 'duplicate':
        return [200, `${at} ${trackName(result.track)} ist schon in der Warteschlange.`];
      case 'too-long':
        return [200, `${at} Das ist zu lang (höchstens ${minutes} Minuten).`];
      case 'no-source':
        return [200, `${at} Gerade gibt es keine vollen Titel – Songwünsche gehen später wieder.`];
      case 'not-safe':
        return [200, `${at} Gerade läuft der Stream-sicher-Modus – nur freie Musik, und dieser Wunsch gehört nicht dazu.`];
      case 'ai':
        return [200, `${at} Das ist als KI-Musik gekennzeichnet und wird nicht gespielt.`];
      case 'unsupported-link':
        return [200, `${at} Dieser Link wird nicht unterstützt – schick Titel und Artist oder einen Link von Spotify, YouTube, Deezer oder Apple Music.`];
      case 'no-lookup':
        return [200, `${at} YouTube-Links gehen gerade nicht – schick Titel und Artist.`];
      default:
        return [200, `${at} Das hat nicht geklappt – versuch es gleich noch mal.`];
    }
  }

  lastRequestBy.set(key, Date.now());
  songRequests += 1;
  const preview = result.track && result.track.preview ? ' (30-s-Vorschau)' : '';
  if (result.playingNow) return [200, `${at} ${trackName(result.track)} läuft jetzt${preview}.`];
  if (result.position === 1) return [200, `${at} ${trackName(result.track)} kommt als Nächstes${preview}.`];
  return [200, `${at} ${trackName(result.track)} ist auf Platz ${result.position}${preview}.`];
}

async function wrongSong(url) {
  const gate = requestGate(url);
  if (gate) return gate;
  const user = viewer(url);
  if (!user) return [400, 'Name fehlt (user=…).'];
  const result = await ctx.player.removeRequest(user);
  if (result && result.ok) {
    lastRequestBy.delete(user.toLowerCase());
    return [200, `@${user} ${trackName(result.track)} ist wieder raus.`];
  }
  return [200, `@${user} Du hast gerade keinen Wunsch in der Warteschlange.`];
}

async function requestLine() {
  if (!settings().requests) return [200, 'Songwünsche sind gerade aus.'];
  if (typeof ctx.player.requests !== 'function') return [501, 'Songwünsche brauchen CleanMusic 1.0.1 oder neuer.'];
  const list = await pendingList();
  if (!list.length) return [200, 'Keine offenen Songwünsche – wünsch dir was mit !sr'];
  const shown = list
    .slice(0, 5)
    .map((entry, index) => `${index + 1}. ${entry.artist ? `${entry.artist} – ` : ''}${entry.title} (${entry.by})`);
  const more = list.length > 5 ? ` · +${list.length - 5} weitere` : '';
  return [200, `Wünsche: ${shown.join(' · ')}${more}`.slice(0, 450)];
}

function reply(res, task) {
  serial(task)
    .then(([status, body]) => text(res, status, body))
    .catch((error) => text(res, 500, `Fehler: ${error.message}`));
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
    case '/request':
    case '/sr':
      return reply(res, () => songRequest(url));
    case '/wrongsong':
      return reply(res, () => wrongSong(url));
    case '/requests':
      return reply(res, () => requestLine());
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
    'Songwünsche (nur wenn im Plugin eingeschaltet):',
    `!sr         ${baseUrl()}/request?token=${t}&user=%user%&q=%rawInputUrlEncoded%`,
    `!wrongsong  ${baseUrl()}/wrongsong?token=${t}&user=%user%`,
    `!wishes     ${baseUrl()}/requests`,
    '',
    'Den Token nicht im Stream zeigen. Neu erzeugen: Plugin-Karte → „Token neu erzeugen“.',
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * Streamer.bot WebSocket (Titelwechsel → Action, Action-Liste)
 *
 * Minimaler RFC-6455-Client ohne Abhängigkeiten: Streamer.bot bietet unter
 * „Servers/Clients → WebSocket Server“ (Standard 8080) eine JSON-Schnitt-
 * stelle. CleanMusic verbindet sich als Client, meldet sich – wenn ein
 * Passwort gesetzt ist – mit Salt/Challenge an und ruft bei jedem
 * Titelwechsel die gewählte Action mit Titel, Artist, Cover und Link auf.
 * ------------------------------------------------------------------ */

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const WS_MAX_FRAME = 8 * 1024 * 1024;

let ws = null;
let wsState = 'off'; // off | connecting | open | error
let wsDetail = '';
let wsInfo = null;
let wsActions = [];
let wsRetryTimer = null;
let wsAttempts = 0;
let wsSignatureValue = '';
let wsDisposed = false;
let wsRequestSeq = 0;
let lastTrackKey = '';

function requestId() {
  wsRequestSeq += 1;
  return `cm:${wsRequestSeq}`;
}

/**
 * Opens a WebSocket (ws:// or wss://) and returns { send, close }.
 * handlers: { open(), message(text), close(reason) }
 */
function wsOpen(urlString, handlers) {
  const onOpen = handlers && handlers.open;
  const onMessage = handlers && handlers.message;
  const onClose = handlers && handlers.close;
  let finished = false;
  let socket = null;
  let pending = Buffer.alloc(0);
  let parts = Buffer.alloc(0);
  let partOpcode = 0;

  const finish = (reason) => {
    if (finished) return;
    finished = true;
    try {
      if (socket) socket.destroy();
    } catch {
      /* gone */
    }
    if (onClose) {
      try {
        onClose(reason);
      } catch {
        /* handler must not break the client */
      }
    }
  };

  const sendFrame = (opcode, payload) => {
    if (!socket || socket.destroyed || finished) return;
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8');
    if (data.length > WS_MAX_FRAME) return;
    const mask = crypto.randomBytes(4);
    const header = Buffer.alloc(data.length < 126 ? 2 : data.length < 65536 ? 4 : 10);
    let offset = 2;
    header[0] = 0x80 | opcode;
    if (data.length < 126) {
      header[1] = 0x80 | data.length;
    } else if (data.length < 65536) {
      header[1] = 0x80 | 126;
      header.writeUInt16BE(data.length, 2);
      offset = 4;
    } else {
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(data.length), 2);
      offset = 10;
    }
    const body = Buffer.alloc(data.length);
    for (let index = 0; index < data.length; index += 1) body[index] = data[index] ^ mask[index % 4];
    try {
      socket.write(Buffer.concat([header, mask, body], offset + 4 + data.length));
    } catch {
      /* socket closed between checks */
    }
  };

  const readFrames = (chunk) => {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    for (;;) {
      if (pending.length < 2) return;
      const first = pending[0];
      const second = pending[1];
      const final = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (pending.length < 4) return;
        length = pending.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (pending.length < 10) return;
        const big = pending.readBigUInt64BE(2);
        if (big > BigInt(WS_MAX_FRAME)) {
          finish('Nachricht zu groß');
          return;
        }
        length = Number(big);
        offset = 10;
      }
      let mask = null;
      if (masked) {
        if (pending.length < offset + 4) return;
        mask = pending.subarray(offset, offset + 4);
        offset += 4;
      }
      if (pending.length < offset + length) return;
      let payload = pending.subarray(offset, offset + length);
      if (masked) {
        const copy = Buffer.alloc(length);
        for (let index = 0; index < length; index += 1) copy[index] = payload[index] ^ mask[index % 4];
        payload = copy;
      }
      pending = pending.subarray(offset + length);

      if (opcode === 0x8) {
        sendFrame(0x8, Buffer.alloc(0));
        finish('Verbindung beendet');
        return;
      }
      if (opcode === 0x9) {
        sendFrame(0xa, payload);
        continue;
      }
      if (opcode === 0xa) continue;
      if (opcode === 0x1 || opcode === 0x2) {
        partOpcode = opcode;
        parts = payload;
      } else if (opcode === 0x0) {
        parts = Buffer.concat([parts, payload]);
      } else {
        continue;
      }
      if (!final) continue;
      const text = parts.toString('utf8');
      parts = Buffer.alloc(0);
      if (partOpcode === 0x1 && onMessage) {
        try {
          onMessage(text);
        } catch {
          /* handler must not break the client */
        }
      }
    }
  };

  let parsed;
  try {
    parsed = new URL(String(urlString || ''));
  } catch {
    parsed = null;
  }
  if (!parsed || (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:')) {
    setTimeout(() => finish('Ungültige Adresse (ws://127.0.0.1:8080/)'), 0);
    return { send() {}, close() {} };
  }

  const secure = parsed.protocol === 'wss:';
  const key = crypto.randomBytes(16).toString('base64');
  const request = (secure ? require('node:https') : http).request({
    host: parsed.hostname,
    port: Number(parsed.port) || (secure ? 443 : 80),
    path: (parsed.pathname || '/') + (parsed.search || ''),
    headers: {
      Connection: 'Upgrade',
      Upgrade: 'websocket',
      'Sec-WebSocket-Key': key,
      'Sec-WebSocket-Version': '13',
    },
    // Only ever used for a local Streamer.bot, often with a self-signed cert.
    rejectUnauthorized: false,
  });

  request.on('upgrade', (response, stream, head) => {
    const expected = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    if (String(response.headers['sec-websocket-accept'] || '') !== expected) {
      stream.destroy();
      finish('Handshake abgelehnt');
      return;
    }
    socket = stream;
    socket.setNoDelay(true);
    socket.on('data', readFrames);
    socket.on('error', (error) => finish(error.message || 'Verbindungsfehler'));
    socket.on('close', () => finish('Verbindung beendet'));
    // `open` first: the server may already have sent its Hello in `head`, and
    // the message handler expects a ready client.
    if (onOpen) {
      try {
        onOpen();
      } catch {
        /* ignore */
      }
    }
    if (head && head.length) readFrames(head);
  });
  request.on('response', (response) => {
    response.resume();
    finish(`HTTP ${response.statusCode}`);
  });
  request.on('error', (error) => finish(error.message || 'Verbindungsfehler'));
  request.end();

  return {
    send(object) {
      sendFrame(0x1, JSON.stringify(object));
    },
    close() {
      sendFrame(0x8, Buffer.alloc(0));
      finish('getrennt');
    },
  };
}

function trackLink(track) {
  const id = String((track && track.id) || '');
  const match = id.match(/^(deezer|apple):(.+)$/);
  if (!match) return '';
  const params = new URLSearchParams({ src: match[1], id: match[2] });
  if (track.title) params.set('t', String(track.title));
  if (track.artist) params.set('a', String(track.artist));
  return `https://bellocccyt.github.io/cleanmusic/s/?${params.toString()}`;
}

function wsDoAction(track) {
  const s = settings();
  if (!s.wsEnabled || !s.wsAction || wsState !== 'open' || !ws) return false;
  ws.send({
    request: 'DoAction',
    id: requestId(),
    action: { name: String(s.wsAction) },
    args: {
      title: String(track.title || ''),
      artist: String(track.artist || ''),
      album: String(track.album || ''),
      artwork: String(track.artwork || ''),
      source: String(track.sourceLabel || track.kind || ''),
      link: trackLink(track),
      duration: String(Math.round(Number(track.duration) || 0)),
      playing: player && player.playing ? 'true' : 'false',
    },
  });
  return true;
}

// Sends the current title when it changed (or on (re)connect).
function pushTrackChange(force) {
  const track = player && player.track;
  const key = track ? `${track.id || ''}|${track.title || ''}|${track.artist || ''}` : '';
  if (!key) {
    lastTrackKey = '';
    return;
  }
  if (!force && key === lastTrackKey) return;
  lastTrackKey = key;
  wsDoAction(track);
}

function wsMessage(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return;
  }
  if (!data || typeof data !== 'object') return;

  if (data.request === 'Hello') {
    wsInfo = data.info
      ? { name: String(data.info.name || ''), version: String(data.info.version || '') }
      : null;
    if (data.authentication) {
      const password = String(settings().wsPassword || '');
      if (password) {
        const secret = crypto.createHash('sha256').update(password + data.authentication.salt, 'utf8').digest('base64');
        const authentication = crypto
          .createHash('sha256')
          .update(secret + data.authentication.challenge, 'utf8')
          .digest('base64');
        if (ws) ws.send({ request: 'Authenticate', id: requestId(), authentication });
      } else {
        wsDetail = 'Passwort fehlt (WebSocket-Passwort in Streamer.bot gesetzt)';
      }
    }
    if (ws) ws.send({ request: 'GetActions', id: requestId() });
    // Announce the running title only after the handshake (and login, if set).
    pushTrackChange(true);
    return;
  }

  if (Array.isArray(data.actions)) {
    wsActions = data.actions
      .map((action) => ({ id: String((action && action.id) || ''), name: String((action && action.name) || '') }))
      .filter((action) => action.name);
    wsDetail = `${wsActions.length} Actions verfügbar`;
    return;
  }

  if (data.status === 'error') {
    const error = data.error;
    wsDetail =
      typeof error === 'string'
        ? error
        : (error && (error.message || error.code)) || 'Streamer.bot meldet einen Fehler';
  }
}

function stopWs() {
  clearTimeout(wsRetryTimer);
  wsRetryTimer = null;
  const current = ws;
  ws = null;
  wsState = 'off';
  if (current) current.close();
}

function wsSignature() {
  const s = settings();
  return `${Boolean(s.wsEnabled)}|${String(s.wsUrl || '')}|${String(s.wsPassword || '')}`;
}

function scheduleWsRetry() {
  if (wsDisposed || !settings().wsEnabled) return;
  clearTimeout(wsRetryTimer);
  wsAttempts += 1;
  const delay = Math.min(30000, 2000 * 2 ** Math.min(4, wsAttempts - 1));
  wsRetryTimer = setTimeout(() => {
    wsRetryTimer = null;
    startWs(true);
  }, delay);
}

function startWs(force) {
  if (wsDisposed) return;
  const signature = wsSignature();
  if (!force && signature === wsSignatureValue) return;
  wsSignatureValue = signature;
  stopWs();
  const s = settings();
  wsInfo = null;
  wsActions = [];
  wsDetail = '';
  wsAttempts = 0;
  if (!s.wsEnabled) return;

  wsState = 'connecting';
  const url = String(s.wsUrl || '').trim() || 'ws://127.0.0.1:8080/';
  const client = wsOpen(url, {
    open: () => {
      if (ws !== client) return;
      wsState = 'open';
      wsAttempts = 0;
      wsDetail = 'verbunden';
    },
    message: (text) => {
      if (ws !== client) return;
      wsMessage(text);
    },
    close: (reason) => {
      if (ws !== client) return;
      ws = null;
      wsState = 'error';
      wsDetail = reason || 'nicht verbunden';
      scheduleWsRetry();
    },
  });
  ws = client;
}

/* ------------------------------------------------------------------ *
 * Plugin API
 * ------------------------------------------------------------------ */

module.exports = {
  apiVersion: 2,
  id: 'streamerbot',
  name: 'Streamer.bot',
  version: '1.3.0',
  description:
    'Chat-Befehle für Twitch über Streamer.bot: !song postet den aktuellen Titel, !skip und !pause steuern CleanMusic, ' +
    'optional Songwünsche mit !sr – per Suche oder Link (Spotify, YouTube, Deezer, Apple Music). ' +
    'Neu: Titelwechsel als Action direkt im Streamer.bot-WebSocket.',
  help:
    'In Streamer.bot je Befehl eine Action anlegen und darin die Sub-Action „Fetch URL“ mit der kopierten ' +
    'Adresse verwenden. Bei !song das Ergebnis in eine Variable speichern und mit „Send Message to Channel“ ' +
    'in den Twitch-Chat schreiben. !skip und !pause in Streamer.bot nur für Mods freigeben. ' +
    'Songwünsche (!sr, !wrongsong, !wishes) erst unten einschalten; die Antwort ebenfalls in den Chat schreiben. ' +
    'Links von Spotify, Deezer und Apple Music gehen immer, YouTube-Links mit einem aktiven Quellen-Plugin (ab CleanMusic 1.4.0). ' +
    'Der KI-Filter erkennt nur gekennzeichnete Songs (z. B. „AI Cover“, „Suno“). ' +
    'Titelwechsel per WebSocket: in Streamer.bot unter Servers/Clients → WebSocket Server einschalten, hier ' +
    '„WebSocket“ aktivieren und den Namen der Action eintragen – CleanMusic ruft sie mit den Argumenten ' +
    'title, artist, album, artwork, link, source, duration und playing auf. ' +
    'Achte darauf, dass du gewünschte Musik im Stream spielen darfst. ' +
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
    {
      id: 'requests',
      type: 'toggle',
      label: 'Songwünsche (!sr) erlauben',
      default: false,
      help: 'Zuschauer wünschen sich Titel; CleanMusic reiht sie in die Warteschlange ein („Wunsch von …“).',
    },
    {
      id: 'requestSource',
      type: 'select',
      label: 'Wünsche spielen als',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Volle Titel (Quellen-Plugin), sonst 30-s-Vorschau' },
        { value: 'full', label: 'Nur volle Titel (Quellen-Plugin nötig)' },
        { value: 'preview', label: 'Nur 30-s-Vorschauen' },
      ],
    },
    { id: 'requestPerUser', type: 'number', label: 'Wünsche pro Zuschauer gleichzeitig', default: 2, min: 1, max: 10 },
    { id: 'requestCooldown', type: 'number', label: 'Wartezeit pro Zuschauer (Sekunden)', default: 60, min: 0, max: 3600 },
    { id: 'requestMax', type: 'number', label: 'Höchstens offene Wünsche', default: 15, min: 1, max: 100 },
    {
      id: 'requestMaxMinutes',
      type: 'number',
      label: 'Höchstlänge in Minuten (0 = egal)',
      default: 10,
      min: 0,
      max: 180,
      help: 'Gilt für volle Titel aus dem Quellen-Plugin.',
    },
    {
      id: 'requestPosition',
      type: 'select',
      label: 'Wünsche spielen',
      default: 'next',
      options: [
        { value: 'next', label: 'Als Nächstes (neuester Wunsch zuerst)' },
        { value: 'end', label: 'Nach den anderen Wünschen' },
      ],
    },
    {
      id: 'requestPlaylist',
      type: 'text',
      label: 'In Playlist speichern',
      default: 'Songwünsche aus dem Chat',
      help: 'Jeder Wunsch landet zusätzlich in dieser CleanMusic-Playlist. Leer lassen = nicht speichern.',
    },
    {
      id: 'requestBlockAi',
      type: 'toggle',
      label: 'KI-Songs ablehnen',
      default: true,
      help: 'Lehnt Wünsche ab, die als KI-Musik gekennzeichnet sind (z. B. „AI Cover“, „Suno“, „KI-generiert“). Ungekennzeichnete erkennt niemand zuverlässig.',
    },
    {
      id: 'requestAiWords',
      type: 'text',
      label: 'Zusätzliche KI-Sperrliste',
      default: '',
      help: 'Weitere Wörter oder Artists, durch Komma getrennt.',
    },
    {
      id: 'requestBlock',
      type: 'text',
      label: 'Gesperrte Wörter',
      default: '',
      help: 'Durch Komma getrennt – Wünsche, die eines davon enthalten, werden abgelehnt.',
    },
    {
      id: 'wsEnabled',
      type: 'toggle',
      label: 'Titelwechsel per WebSocket an Streamer.bot',
      default: false,
      help: 'Streamer.bot: Servers/Clients → WebSocket Server einschalten. CleanMusic verbindet sich als Client und ruft die Action unten auf.',
    },
    {
      id: 'wsUrl',
      type: 'text',
      label: 'WebSocket-Adresse',
      default: 'ws://127.0.0.1:8080/',
      help: 'Nur ändern, wenn Streamer.bot auf einem anderen Port läuft.',
    },
    {
      id: 'wsPassword',
      type: 'password',
      label: 'WebSocket-Passwort',
      default: '',
      help: 'Leer lassen, wenn in Streamer.bot kein Passwort gesetzt ist.',
    },
    {
      id: 'wsAction',
      type: 'text',
      label: 'Action bei Titelwechsel',
      default: 'CleanMusic Titelwechsel',
      help: 'Name der Streamer.bot-Action. Argumente: title, artist, album, artwork, link, source, duration, playing. Der Status unten zeigt, wie viele Actions gefunden wurden.',
    },
  ],
  actions: [
    { id: 'copy', label: 'Adressen kopieren', when: 'running' },
    { id: 'token', label: 'Token neu erzeugen' },
    { id: 'restart', label: 'Server neu starten' },
    { id: 'ws', label: 'Streamer.bot neu verbinden' },
  ],

  async setup(context) {
    ctx = context;
    wsDisposed = false;
    player = ctx.player.state();
    token();
    await start();
    startWs();
  },

  dispose() {
    wsDisposed = true;
    stopWs();
    stop();
    ctx = null;
  },

  async onSettings() {
    if (!server || serverPort !== Math.round(Number(settings().port))) await start();
    lastTrackKey = '';
    startWs();
  },

  onEvent(_type, state) {
    player = state;
    pushTrackChange();
  },

  status() {
    const s = settings();
    const wsText = !s.wsEnabled
      ? 'WebSocket aus'
      : wsState === 'open'
        ? 'Streamer.bot verbunden'
        : wsState === 'connecting'
          ? 'WebSocket verbindet …'
          : `WebSocket: ${wsDetail || 'nicht verbunden'}`;
    const flags = { running: Boolean(server), websocket: wsState === 'open' };
    if (serverError) return { ready: false, text: 'Server-Fehler', detail: serverError, flags };
    if (!server) return { ready: false, text: 'Gestoppt', detail: '', flags };
    return {
      ready: true,
      text: `Läuft · Port ${serverPort} · ${wsText}`,
      detail: `${baseUrl()}/song · ${requests} Anfragen seit dem Start${
        settings().requests ? ` · Songwünsche an (${songRequests} angenommen)` : ''
      }${s.wsEnabled ? ` · ${wsInfo ? `${wsInfo.name || 'Streamer.bot'} ${wsInfo.version}` : 'WebSocket'}${wsDetail ? ` (${wsDetail})` : ''}` : ''}`,
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
    if (id === 'ws') {
      wsSignatureValue = '';
      startWs(true);
      return { message: settings().wsEnabled ? 'Verbindung zu Streamer.bot wird aufgebaut …' : 'WebSocket ist ausgeschaltet.' };
    }
    return { message: null };
  },

  // For tests.
  _debug: () => ({
    port: serverPort,
    token: ctx ? token() : null,
    error: serverError,
    ws: { state: wsState, detail: wsDetail, actions: wsActions.map((action) => action.name), info: wsInfo },
  }),
};
