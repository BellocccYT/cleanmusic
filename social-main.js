'use strict';

/**
 * Social (Weg B, docs/PLAN-SOCIAL.md) – main-process side.
 *
 * - Creates the device key pair (ECDSA P-256) and keeps the private key here,
 *   encrypted with Electron's safeStorage (<userData>/social-key.json). The
 *   renderer never sees it – it only gets the account id and tag.
 * - Signs every request (lib/social-protocol.js) and sends it to exactly one
 *   host: the configured social server. The renderer passes a method, a path
 *   from the fixed endpoint list and a JSON body – never a URL.
 * - Solves the proof-of-work for a new account in small chunks, so the main
 *   process stays responsive.
 *
 * - S3 rooms ("Gemeinsam hören"): one signed WebSocket to /v1/room/live
 *   (lib/social-ws.js – Electron 33's Node has no global WebSocket). Ping
 *   every 25 s, clock offset from time pings, reconnect with backoff. The
 *   renderer only says connect/send/disconnect; messages are checked here.
 *
 * createFakeServer() is a small in-memory stand-in for the smoke test
 * (SMOKE_SOCIAL_SERVER); it checks signatures, time, nonces and PoW the same way,
 * and has rooms with live sockets.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const names = require('./lib/social-names');
const proto = require('./lib/social-protocol');
const roomWs = require('./lib/social-ws');

const H = proto.HEADERS;

function idOf(pub) {
  return names.accountIdFromDigest(crypto.createHash('sha256').update(Buffer.from(proto.fromBase64Url(pub))).digest());
}

function rawPublicKey(publicKey) {
  const jwk = publicKey.export({ format: 'jwk' });
  return Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
}

function signHeaders(key, method, pathname, text) {
  const time = Date.now();
  const nonce = crypto.randomBytes(16).toString('base64url');
  const hash = crypto.createHash('sha256').update(text).digest('base64url');
  const sig = crypto.sign('sha256', Buffer.from(proto.canonical(method, pathname, time, nonce, hash)), {
    key: key.privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return { [H.key]: key.pub, [H.time]: String(time), [H.nonce]: nonce, [H.sig]: sig.toString('base64url') };
}

async function solvePow(id, bits) {
  const day = proto.powDay(Date.now());
  for (let counter = 0; counter < 2 ** 31; counter += 1) {
    const digest = crypto.createHash('sha256').update(proto.powInput(id, day, counter)).digest();
    if (proto.leadingZeroBits(digest) >= bits) return { day, counter };
    if (counter % 20000 === 19999) await new Promise((resolve) => setImmediate(resolve));
  }
  return null;
}

function createSocial(deps) {
  const { app, ipcMain, net, safeStorage, dialog, readConfig, writeConfig, isSmoke, getWindow, QRCode } = deps;
  let cachedKey = null;

  const keyFile = () => path.join(app.getPath('userData'), 'social-key.json');

  function secureStorage() {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false;
      if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') {
        return safeStorage.getSelectedStorageBackend() !== 'basic_text';
      }
      return true;
    } catch {
      return false;
    }
  }

  function loadKey() {
    if (cachedKey) return cachedKey;
    try {
      const stored = JSON.parse(fs.readFileSync(keyFile(), 'utf8'));
      if (!stored || stored.v !== 1 || !proto.validPublicKey(stored.pub)) return null;
      const privateKey = crypto.createPrivateKey(safeStorage.decryptString(Buffer.from(stored.enc, 'base64')));
      if (proto.toBase64Url(rawPublicKey(crypto.createPublicKey(privateKey))) !== stored.pub) return null;
      cachedKey = { privateKey, pub: stored.pub, id: idOf(stored.pub) };
      return cachedKey;
    } catch {
      return null;
    }
  }

  function createKey() {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pub = proto.toBase64Url(rawPublicKey(publicKey));
    const enc = safeStorage.encryptString(privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64');
    const file = keyFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify({ v: 1, pub, enc, created: Date.now() }));
    fs.renameSync(`${file}.tmp`, file);
    cachedKey = { privateKey, pub, id: idOf(pub) };
    return cachedKey;
  }

  function forgetKey() {
    cachedKey = null;
    try {
      fs.rmSync(keyFile(), { force: true });
    } catch {
      /* ignore */
    }
  }

  function config() {
    const value = readConfig().social;
    return value && typeof value === 'object' ? value : {};
  }

  function setConfig(patch) {
    writeConfig({ social: Object.assign({}, config(), patch) });
  }

  // The smoke profile never talks to the real server – only to a server it sets itself.
  const defaultServer = () => (isSmoke ? '' : proto.normalizeServer(proto.DEFAULT_SERVER));

  function server() {
    return proto.normalizeServer(config().server) || defaultServer();
  }

  function info() {
    const key = loadKey();
    const origin = server();
    return {
      available: secureStorage(),
      server: origin,
      custom: Boolean(proto.normalizeServer(config().server)),
      defaultServer: defaultServer(),
      id: key ? key.id : '',
      tag: key ? names.tagOf(key.id) : '',
      registered: Boolean(key && origin && config().registered === origin),
    };
  }

  async function send(method, pathname, body, options = {}) {
    const origin = server();
    if (!origin) return { error: 'kein-server', message: 'Es ist noch kein Social-Server eingetragen.' };
    const url = new URL(pathname, origin);
    // Host allowlist: only the one configured social server, nothing else.
    if (url.origin !== origin || url.pathname !== pathname) return { error: 'adresse', message: 'Diese Social-Anfrage ist nicht erlaubt.' };
    const text = body === undefined || body === null ? '' : JSON.stringify(body);
    const headers = { accept: 'application/json' };
    if (text) headers['content-type'] = 'application/json';
    if (!options.unsigned) {
      const key = loadKey();
      if (!key) return { error: 'kein-schluessel', message: 'Social ist auf diesem Gerät noch nicht eingerichtet.' };
      Object.assign(headers, signHeaders(key, method, pathname, text));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || 12000);
    try {
      const response = await net.fetch(url.toString(), { method, headers, body: text || undefined, redirect: 'error', signal: controller.signal });
      const raw = await response.text();
      let data = null;
      try {
        data = raw.length <= 300000 ? JSON.parse(raw) : null;
      } catch {
        data = null;
      }
      if (!response.ok || !data || typeof data !== 'object') {
        return {
          error: (data && data.error) || `http-${response.status}`,
          message: (data && typeof data.message === 'string' && data.message.slice(0, 200)) || `Der Social-Server antwortet mit HTTP ${response.status}.`,
          status: response.status,
        };
      }
      return { ok: true, status: response.status, data };
    } catch (error) {
      return {
        error: 'netz',
        message: /abort/i.test(String(error && error.message)) ? 'Zeitüberschreitung – der Social-Server antwortet nicht.' : 'Der Social-Server ist gerade nicht erreichbar.',
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async function setup() {
    if (!secureStorage()) {
      return { error: 'kein-speicher', message: 'Auf diesem System gibt es keinen sicheren Schlüsselspeicher – Social bleibt aus.' };
    }
    const status = await send('GET', '/v1/status', null, { unsigned: true });
    if (!status.ok) return status;
    if (!status.data.enabled) return { error: 'aus', message: 'Social ist auf dem Server gerade abgeschaltet.' };
    const key = loadKey() || createKey();
    const pow = await solvePow(key.id, Math.min(28, Math.max(8, Number(status.data.pow) || 20)));
    const result = await send('POST', '/v1/account', { pow });
    if (result.ok) setConfig({ registered: server() });
    return result;
  }

  async function request(input) {
    const method = String((input && input.method) || '').toUpperCase();
    const pathname = String((input && input.path) || '');
    const body = input && input.body;
    if (!proto.isEndpoint(method, pathname) || (method === 'POST' && pathname === '/v1/account') || pathname === proto.ROOM_LIVE) {
      return { error: 'adresse', message: 'Diese Social-Anfrage ist nicht erlaubt.' };
    }
    if (body != null && (typeof body !== 'object' || Array.isArray(body) || JSON.stringify(body).length > proto.BODY_MAX)) {
      return { error: 'daten', message: 'Ungültige Social-Anfrage.' };
    }
    const hasBody = method === 'POST';
    const result = await send(method, pathname, hasBody ? body || {} : undefined);
    if (result.ok && pathname === '/v1/friend-code' && proto.FRIEND_CODE_RE.test(String(result.data.code || ''))) {
      result.data.link = proto.friendLink(result.data.code);
      try {
        result.data.qr = await QRCode.toDataURL(result.data.link, { margin: 1, width: 320 });
      } catch {
        result.data.qr = '';
      }
    }
    if (method === 'DELETE' && pathname === '/v1/account' && (result.ok || result.error === 'kein-konto')) {
      forgetKey();
      setConfig({ registered: '' });
      return { ok: true, status: 200, data: { deleted: true } };
    }
    if (result.error === 'kein-konto') setConfig({ registered: '' });
    return result;
  }

  async function setServer(input) {
    const value = String(input || '').trim();
    const origin = value ? proto.normalizeServer(value) : '';
    if (value && !origin) {
      return Object.assign(info(), { error: 'adresse', message: 'Bitte eine https-Adresse eintragen (http nur für 127.0.0.1/localhost mit Port).' });
    }
    if (origin && origin !== server() && !isSmoke) {
      const { response } = await dialog.showMessageBox(getWindow(), {
        type: 'question',
        buttons: ['Abbrechen', 'Server übernehmen'],
        defaultId: 0,
        cancelId: 0,
        title: 'Social-Server ändern',
        message: `Social-Anfragen künftig an ${origin} senden?`,
        detail: 'Dorthin gehen dein öffentlicher Schlüssel, dein Anzeigename, deine Freundesliste und – nur wenn du es einschaltest – deine Aktivität. Trag nur einen Server ein, dem du vertraust.',
      });
      if (response !== 1) return Object.assign(info(), { cancelled: true });
    }
    // Only a real change of server ends the registration there. Saving the
    // same server again (e.g. "Speichern" on the empty field while the
    // default is in use) must not throw the account out.
    const before = server();
    const after = origin || defaultServer();
    setConfig(after === before ? { server: origin } : { server: origin, registered: '' });
    return info();
  }

  /* --- S3: the live room connection ------------------------------------ */
  const FINAL_CLOSE = [4000, 4403, 4404, 4409, 4503];
  const room = { conn: null, want: false, retry: 0, timer: null, ping: null, sync: null, seen: 0, samples: [], skew: 0, status: 'off' };

  function emitRoom(event) {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('social-room', event);
  }

  function roomStatus(status, extra) {
    room.status = status;
    emitRoom(Object.assign({ type: 'status', status, skew: room.skew }, extra || {}));
  }

  function stopRoomTimers() {
    clearInterval(room.ping);
    clearInterval(room.sync);
    clearTimeout(room.timer);
    room.ping = null;
    room.sync = null;
    room.timer = null;
  }

  function timePing(conn) {
    if (conn && conn.open) conn.send(JSON.stringify({ t: 'time', c: Date.now() }));
  }

  function roomConnect() {
    room.want = true;
    clearTimeout(room.timer);
    if (room.conn) return { ok: true, status: room.status };
    const origin = server();
    const key = loadKey();
    const url = origin ? proto.roomSocketUrl(origin) : '';
    if (!url || !key) return { error: 'kein-schluessel', message: 'Social ist auf diesem Gerät noch nicht eingerichtet.' };
    roomStatus('connecting');
    const conn = roomWs.connect(url, { headers: signHeaders(key, 'GET', proto.ROOM_LIVE, '') }, {
      open() {
        if (room.conn !== conn) return;
        room.retry = 0;
        room.seen = Date.now();
        roomStatus('open');
        room.ping = setInterval(() => {
          if (Date.now() - room.seen > 70000) conn.close(1001, 'still');
          else conn.send('ping');
        }, 25000);
        // Clock offset: three quick pings, then one every 5 minutes.
        [0, 400, 800].forEach((delay) => setTimeout(() => timePing(conn), delay));
        room.sync = setInterval(() => timePing(conn), 5 * 60 * 1000);
      },
      message(text) {
        if (room.conn !== conn) return;
        room.seen = Date.now();
        if (text === 'pong') return;
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          return;
        }
        if (!data || typeof data !== 'object') return;
        if (data.t === 'time') {
          room.samples = room.samples.concat({ c: Number(data.c), s: Number(data.s), r: Date.now() }).slice(-8);
          const best = proto.skewFromSamples(room.samples);
          if (best) {
            room.skew = best.skew;
            emitRoom({ type: 'skew', skew: best.skew, rtt: best.rtt });
          }
          return;
        }
        emitRoom({ type: 'message', data });
      },
      close(info) {
        if (room.conn !== conn) return;
        room.conn = null;
        stopRoomTimers();
        const body = info.body && typeof info.body === 'object' ? info.body : {};
        const final = FINAL_CLOSE.includes(info.code) || [401, 403, 404, 426].includes(info.status);
        emitRoom({ type: 'closed', code: info.code, status: info.status || 0, error: String(body.error || ''), message: String(body.message || '').slice(0, 200), final });
        if (room.want && !final) {
          room.retry += 1;
          const wait = Math.min(30000, 2000 * 2 ** Math.min(4, room.retry - 1));
          roomStatus('retry', { retryIn: wait });
          room.timer = setTimeout(() => {
            room.timer = null;
            if (room.want) roomConnect();
          }, wait);
        } else {
          room.want = false;
          roomStatus('off');
        }
      },
    });
    room.conn = conn;
    return { ok: true, status: room.status };
  }

  function roomDisconnect() {
    room.want = false;
    stopRoomTimers();
    const conn = room.conn;
    room.conn = null;
    if (conn) conn.close(1000, 'tschüss');
    roomStatus('off');
    return { ok: true };
  }

  // Only the messages a member may send; the server checks them again.
  function roomSend(message) {
    const value = message && typeof message === 'object' ? message : {};
    let out = null;
    if (value.t === 'react' && proto.EMOJIS.includes(value.emoji)) out = { t: 'react', emoji: value.emoji };
    if (value.t === 'jam') out = { t: 'jam', on: value.on === true };
    if (value.t === 'add') {
      const ref = proto.cleanRef(value.ref);
      if (ref) out = { t: 'add', ref };
    }
    if (value.t === 'unqueue') {
      const rid = String(value.rid || '');
      if (/^[A-Za-z0-9_-]{4,24}$/.test(rid)) out = { t: 'unqueue', rid };
    }
    if (value.t === 'queue-clear') out = { t: 'queue-clear' };
    if (value.t === 'state') {
      const state = proto.cleanRoomState(value, Number(value.at) || Date.now());
      if (state) out = Object.assign({ t: 'state' }, state);
    }
    if (!out) return { error: 'daten', message: 'Ungültige Raum-Nachricht.' };
    const text = JSON.stringify(out);
    if (text.length > proto.LIMITS.roomMessageMax || !room.conn || !room.conn.open) return { error: 'offline', message: 'Keine Verbindung zum Raum.' };
    return room.conn.send(text) ? { ok: true } : { error: 'offline', message: 'Keine Verbindung zum Raum.' };
  }

  function roomAction(action, payload) {
    if (action === 'connect') return roomConnect();
    if (action === 'disconnect') return roomDisconnect();
    if (action === 'send') return roomSend(payload);
    if (action === 'status') return { ok: true, status: room.status, skew: room.skew };
    return { error: 'adresse', message: 'Diese Raum-Aktion gibt es nicht.' };
  }

  function register() {
    const own = (event) => {
      const win = getWindow();
      return Boolean(win && !win.isDestroyed() && event.sender === win.webContents);
    };
    const guard = (fn) => async (event, ...args) => (own(event) ? fn(...args) : { error: 'fenster', message: 'Nicht erlaubt.' });
    ipcMain.handle('social-info', guard(() => info()));
    ipcMain.handle('social-server-set', guard((url) => setServer(url)));
    ipcMain.handle('social-name-check', guard((name) => names.checkName(name)));
    ipcMain.handle('social-setup', guard(() => setup()));
    ipcMain.handle('social-request', guard((input) => request(input)));
    ipcMain.handle('social-room', guard((action, payload) => roomAction(String(action || ''), payload)));
  }

  return { register, info, setup, request, setServer, keyFile, loadKey, roomAction };
}

/* --- Smoke: in-memory stand-in for the Worker ---------------------------- */
function createFakeServer() {
  const accounts = new Map(); // id -> { id, pub, name, random }
  const friends = new Map(); // id -> Set(id)
  const codes = new Map(); // code -> { owner, ask }
  const requests = new Map(); // "from>to" -> { from, to, at, declined } (2.1)
  const presence = new Map(); // id -> last request (2.1, only with "Mir online zeigen")
  const activity = new Map(); // id -> { ref, playing, at }
  const reactions = []; // { to, from, emoji, title, at }
  const blocks = new Set(); // "a>b"
  const reports = [];
  const nonces = new Set();
  const log = [];
  const groups = new Map(); // id -> { id, name, owner, members: [id], tracks: [] }
  const groupCodes = new Map(); // code -> group id
  const weeks = new Map(); // account -> week card
  let trackSeq = 0;
  let enabled = true;
  const rooms = new Map(); // id -> { id, code, host, created, members: [{ id, joined }], bans: Set, state, jam, queue: [] }
  const roomSockets = new Set(); // { conn, a, r }
  const POW = 8;

  const set = (id) => (friends.has(id) ? friends.get(id) : friends.set(id, new Set()).get(id));
  const person = (id) => ({ id, tag: names.tagOf(id), name: accounts.has(id) ? accounts.get(id).name : 'Unbekannt' });
  const link = (a, b) => {
    set(a).add(b);
    set(b).add(a);
  };
  const unlink = (a, b) => {
    set(a).delete(b);
    set(b).delete(a);
  };
  const forget = (a, b) => {
    requests.delete(`${a}>${b}`);
    requests.delete(`${b}>${a}`);
  };
  const liveRequest = (from, to) => {
    const row = requests.get(`${from}>${to}`);
    return row && Date.now() - row.at < proto.LIMITS.requestTtlMs ? row : null;
  };

  function verify(req, method, pathname, body) {
    const key = req.headers[H.key];
    const time = req.headers[H.time];
    const nonce = req.headers[H.nonce];
    const sig = req.headers[H.sig];
    if (!proto.validPublicKey(key) || !proto.validNonce(nonce) || !proto.validSignature(sig) || !proto.timeOk(time, Date.now())) return null;
    if (nonces.has(`${key}:${nonce}`)) return null;
    const raw = Buffer.from(proto.fromBase64Url(key));
    const publicKey = crypto.createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') },
      format: 'jwk',
    });
    const hash = crypto.createHash('sha256').update(body).digest('base64url');
    const ok = crypto.verify('sha256', Buffer.from(proto.canonical(method, pathname, time, nonce, hash)), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(proto.fromBase64Url(sig)));
    if (!ok) return null;
    nonces.add(`${key}:${nonce}`);
    return { id: idOf(key), pub: key };
  }

  /* S3 rooms (simplified: no limits, no 30-minute timers) */
  const roomOf = (id) => Array.from(rooms.values()).find((room) => room.members.some((m) => m.id === id)) || null;
  const roomOnline = (room) => new Set(Array.from(roomSockets).filter((s) => s.r === room.id).map((s) => s.a));
  const roomMembers = (room) => {
    const live = roomOnline(room);
    return room.members.map((m) => Object.assign(person(m.id), { host: m.id === room.host, online: live.has(m.id) }));
  };
  const roomQueue = (room) => (Array.isArray(room.queue) ? room.queue : []).slice(0, proto.LIMITS.roomQueue);
  const roomQueueView = (room) => roomQueue(room).map((row) => ({ rid: row.rid, ref: row.ref, by: person(row.by), at: row.at }));
  const roomSnap = (room) => ({ id: room.id, host: room.host, created: room.created, members: roomMembers(room), state: room.state, jam: Boolean(room.jam), queue: roomQueueView(room) });
  const roomSend = (s, message) => s.conn.send(JSON.stringify(message));
  const roomCast = (room, message, except) => roomSockets.forEach((s) => {
    if (s.r === room.id && s !== except) roomSend(s, message);
  });
  const roomAnnounce = (room) => roomCast(room, { t: 'members', host: room.host, members: roomMembers(room) });
  function roomDrop(room, id, code, reason) {
    roomSockets.forEach((s) => {
      if (s.r === room.id && s.a === id) {
        roomSend(s, { t: 'closed', reason });
        s.conn.close(code, reason);
        roomSockets.delete(s);
      }
    });
    room.members = room.members.filter((m) => m.id !== id);
    if (room.host === id) {
      if (!room.members.length) return roomClose(room, 'leer');
      room.host = room.members[0].id;
    }
    return roomAnnounce(room);
  }
  function roomClose(room, reason) {
    roomSockets.forEach((s) => {
      if (s.r !== room.id) return;
      roomSend(s, { t: 'closed', reason });
      s.conn.close(4404, reason);
      roomSockets.delete(s);
    });
    rooms.delete(room.id);
  }
  function roomLeaveCurrent(id) {
    const room = roomOf(id);
    if (room) roomDrop(room, id, 4000, 'verlassen');
  }
  function roomMessage(s, text) {
    const room = rooms.get(s.r);
    if (!room || !room.members.some((m) => m.id === s.a)) return s.conn.close(4404, 'weg');
    if (text === 'ping') return s.conn.send('pong');
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!data || !proto.ROOM_MESSAGES.includes(data.t)) return roomSend(s, { t: 'error', error: 'nachricht' });
    const now = Date.now();
    if (data.t === 'time') return roomSend(s, { t: 'time', c: Number(data.c) || 0, s: now });
    if (data.t === 'react') {
      if (!proto.EMOJIS.includes(data.emoji)) return roomSend(s, { t: 'error', error: 'emoji' });
      return roomCast(room, { t: 'react', from: person(s.a), emoji: data.emoji, at: now }, s);
    }
    if (data.t === 'jam') {
      if (room.host !== s.a) return roomSend(s, { t: 'error', error: 'nur-host' });
      room.jam = data.on === true;
      return roomCast(room, { t: 'jam', jam: room.jam, queue: roomQueueView(room), now });
    }
    if (data.t === 'add') {
      if (!room.jam && room.host !== s.a) return roomSend(s, { t: 'error', error: 'kein-jam' });
      const ref = proto.cleanRef(data.ref);
      if (!ref) return roomSend(s, { t: 'error', error: 'ref' });
      if (roomQueue(room).length >= proto.LIMITS.roomQueue) return roomSend(s, { t: 'error', error: 'voll' });
      if (roomQueue(room).some((row) => proto.refKey(row.ref) === proto.refKey(ref))) return roomSend(s, { t: 'error', error: 'doppelt' });
      room.queue = roomQueue(room).concat({ rid: crypto.randomUUID().replace(/-/g, '').slice(0, 10), ref, by: s.a, at: now });
      return roomCast(room, { t: 'queue', queue: roomQueueView(room), now });
    }
    if (data.t === 'unqueue') {
      const index = roomQueue(room).findIndex((row) => row.rid === String(data.rid || ''));
      if (index < 0) return roomSend(s, { t: 'error', error: 'rid' });
      if (room.host !== s.a && roomQueue(room)[index].by !== s.a) return roomSend(s, { t: 'error', error: 'nicht-deins' });
      room.queue = roomQueue(room).filter((row, at) => at !== index);
      return roomCast(room, { t: 'queue', queue: roomQueueView(room), now });
    }
    if (data.t === 'queue-clear') {
      if (room.host !== s.a) return roomSend(s, { t: 'error', error: 'nur-host' });
      room.queue = [];
      return roomCast(room, { t: 'queue', queue: [], now });
    }
    if (room.host !== s.a) return roomSend(s, { t: 'error', error: 'nur-host' });
    const state = proto.cleanRoomState(data, now);
    if (!state) return roomSend(s, { t: 'error', error: 'ref' });
    room.state = state;
    log.push({ method: 'WS', path: 'state', signed: true, status: 200 });
    return roomCast(room, { t: 'state', state, now }, s);
  }

  function handle(method, pathname, auth, data) {
    if (method === 'POST' && pathname === '/v1/account') {
      if (accounts.has(auth.id)) return [200, { account: person(auth.id), created: false }];
      const pow = data.pow || {};
      const digest = crypto.createHash('sha256').update(proto.powInput(auth.id, pow.day, pow.counter)).digest();
      if (!proto.powDayOk(pow.day, Date.now()) || proto.leadingZeroBits(digest) < POW) return [400, { error: 'pow', message: 'PoW fehlt.' }];
      accounts.set(auth.id, { id: auth.id, pub: auth.pub, name: names.randomName(), random: true });
      return [201, { account: Object.assign(person(auth.id), { random: true }), created: true }];
    }
    const me = accounts.get(auth.id);
    if (!me) return [401, { error: 'kein-konto', message: 'Kein Konto.' }];
    if (!enabled && !(method === 'DELETE' && pathname === '/v1/account')) return [503, { error: 'aus', message: 'Social ist gerade abgeschaltet.' }];
    const other = String(data.id || data.to || '');
    if (presence.has(auth.id)) presence.set(auth.id, Date.now());
    switch (`${method} ${pathname}`) {
      case 'DELETE /v1/account':
        accounts.delete(auth.id);
        set(auth.id).forEach((id) => set(id).delete(auth.id));
        friends.delete(auth.id);
        activity.delete(auth.id);
        presence.delete(auth.id);
        Array.from(requests.values()).forEach((row) => (row.from === auth.id || row.to === auth.id) && forget(row.from, row.to));
        return [200, { ok: true, deleted: true }];
      case 'POST /v1/name': {
        if (data.random) Object.assign(me, { name: names.randomName(), random: true });
        else {
          const check = names.checkName(data.name);
          if (!check.ok) return [400, { error: 'name', message: check.reason }];
          Object.assign(me, { name: check.name, random: false });
        }
        return [200, { account: Object.assign(person(auth.id), { random: me.random }) }];
      }
      case 'POST /v1/friend-code': {
        if (data.revoke) {
          Array.from(codes.entries()).forEach(([code, row]) => row.owner === auth.id && codes.delete(code));
          return [200, { revoked: 1 }];
        }
        const code = proto.friendCodeFrom(crypto.randomBytes(12));
        codes.set(code, { owner: auth.id, ask: data.requests === true });
        return [201, { code, expires: Date.now() + proto.LIMITS.codeTtlMs, requests: data.requests === true }];
      }
      case 'POST /v1/friend/redeem': {
        const code = proto.parseFriendCode(data.code);
        const row = codes.get(code);
        const owner = row && row.owner;
        if (!owner || owner === auth.id || blocks.has(`${owner}>${auth.id}`) || blocks.has(`${auth.id}>${owner}`)) {
          return [404, { error: 'code', message: 'Der Code ist abgelaufen, schon benutzt oder ungültig.' }];
        }
        codes.delete(code);
        // 2.1: an ask-code leaves a request (unless the owner already asked you).
        if (row.ask && !liveRequest(owner, auth.id) && !set(auth.id).has(owner)) {
          requests.set(`${auth.id}>${owner}`, { from: auth.id, to: owner, at: Date.now(), declined: false });
          if (data.requests === true) return [202, { friend: person(owner), pending: true }];
          return [409, { error: 'anfrage-gesendet', message: `Anfrage an ${person(owner).name} gesendet.` }];
        }
        forget(auth.id, owner);
        link(auth.id, owner);
        return [201, { friend: person(owner) }];
      }
      case 'POST /v1/friend/accept': {
        const row = liveRequest(other, auth.id);
        if (!row || row.declined || !accounts.has(other)) return [404, { error: 'anfrage', message: 'Diese Anfrage gibt es nicht mehr.' }];
        forget(auth.id, other);
        link(auth.id, other);
        return [201, { friend: person(other) }];
      }
      case 'POST /v1/friend/decline': {
        if (data.withdraw === true) return [200, { ok: true, withdrawn: requests.delete(`${auth.id}>${other}`) }];
        const row = liveRequest(other, auth.id);
        if (row) row.declined = true;
        return [200, { ok: true, declined: Boolean(row) }];
      }
      case 'POST /v1/presence':
        if (typeof data.show !== 'boolean') return [400, { error: 'presence', message: 'An oder aus?' }];
        if (data.show) presence.set(auth.id, Date.now());
        else presence.delete(auth.id);
        return [200, { ok: true, showOnline: data.show }];
      case 'POST /v1/friend/remove':
        unlink(auth.id, other);
        return [200, { ok: true }];
      case 'GET /v1/friends': {
        const now = Date.now();
        const open = Array.from(requests.values()).filter((row) => now - row.at < proto.LIMITS.requestTtlMs);
        return [200, {
          me: Object.assign(person(auth.id), { random: me.random, nameChangeAt: 0, showOnline: presence.has(auth.id) }),
          friends: Array.from(set(auth.id)).map((id) => {
            const act = activity.get(id);
            return Object.assign(person(id), {
              since: now,
              online: presence.has(id) && now - presence.get(id) < proto.LIMITS.onlineTtlMs,
              activity: act && now - act.at < proto.LIMITS.activityTtlMs ? act : null,
            });
          }),
          requests: open.filter((row) => row.to === auth.id && !row.declined).map((row) => ({ from: person(row.from), at: row.at, expires: row.at + proto.LIMITS.requestTtlMs })),
          sent: open.filter((row) => row.from === auth.id).map((row) => ({ to: person(row.to), at: row.at, expires: row.at + proto.LIMITS.requestTtlMs })),
          reactions: reactions.filter((r) => r.to === auth.id).map((r) => ({ from: person(r.from), emoji: r.emoji, title: r.title, at: r.at })),
          blocked: Array.from(blocks).filter((pair) => pair.startsWith(`${auth.id}>`)).map((pair) => person(pair.split('>')[1])),
          now,
        }];
      }
      case 'POST /v1/activity': {
        if (data.clear) {
          activity.delete(auth.id);
          return [200, { ok: true, cleared: true }];
        }
        const ref = proto.cleanRef(data.ref);
        if (!ref) return [400, { error: 'ref', message: 'Nicht teilbar.' }];
        activity.set(auth.id, { ref, playing: data.playing !== false, at: Date.now() });
        return [200, { ok: true }];
      }
      case 'POST /v1/react': {
        if (!set(auth.id).has(other)) return [404, { error: 'kein-freund', message: 'Kein Freund.' }];
        if (!proto.EMOJIS.includes(data.emoji)) return [400, { error: 'emoji', message: 'Unbekannt.' }];
        const act = activity.get(other);
        if (!act) return [409, { error: 'keine-aktivitaet', message: 'Hört gerade nichts.' }];
        reactions.push({ to: other, from: auth.id, emoji: data.emoji, title: act.ref.title, at: Date.now() });
        return [200, { ok: true }];
      }
      case 'POST /v1/report':
        if (!proto.REPORT_REASONS.includes(data.reason)) return [400, { error: 'grund', message: 'Grund fehlt.' }];
        reports.push({ from: auth.id, target: other, reason: data.reason });
        return [200, { ok: true, renamed: false }];
      case 'POST /v1/block':
        if (data.block === false) blocks.delete(`${auth.id}>${other}`);
        else {
          blocks.add(`${auth.id}>${other}`);
          unlink(auth.id, other);
          forget(auth.id, other);
        }
        return [200, { ok: true, blocked: data.block !== false }];
      // S2 groups (simplified: no limits, the stored week card is always shown)
      case 'POST /v1/group': {
        const check = names.checkName(data.name);
        if (!check.ok) return [400, { error: 'name', message: check.reason }];
        const id = names.accountIdFromDigest(crypto.randomBytes(15));
        groups.set(id, { id, name: check.name, owner: auth.id, members: [auth.id], tracks: [] });
        return [201, { group: { id, name: check.name } }];
      }
      case 'POST /v1/group/code': {
        const group = groups.get(String(data.group));
        if (!group || !group.members.includes(auth.id)) return [404, { error: 'keine-gruppe', message: 'Keine Gruppe.' }];
        const code = proto.groupCodeFrom(crypto.randomBytes(12));
        groupCodes.set(code, group.id);
        return [201, { code, expires: Date.now() + proto.LIMITS.codeTtlMs }];
      }
      case 'POST /v1/group/join': {
        const group = groups.get(groupCodes.get(proto.parseGroupCode(data.code)));
        if (!group) return [404, { error: 'code', message: 'Der Gruppencode ist ungültig.' }];
        const already = group.members.includes(auth.id);
        if (!already) group.members.push(auth.id);
        return [already ? 200 : 201, { group: { id: group.id, name: group.name }, already }];
      }
      case 'POST /v1/group/leave': {
        const group = groups.get(String(data.group));
        if (!group) return [404, { error: 'keine-gruppe', message: 'Keine Gruppe.' }];
        group.members = group.members.filter((id) => id !== auth.id);
        if (group.owner === auth.id) group.owner = group.members[0] || '';
        if (!group.members.length) groups.delete(group.id);
        return [200, { ok: true }];
      }
      case 'GET /v1/groups':
        return [200, {
          week: proto.isoWeek(Date.now()),
          groups: Array.from(groups.values())
            .filter((group) => group.members.includes(auth.id))
            .map((group) => ({
              id: group.id,
              name: group.name,
              owner: group.owner,
              members: group.members.map((id) => Object.assign(person(id), { week: weeks.get(id) || null })),
              tracks: group.tracks.map((track) => ({ rid: track.rid, ref: track.ref, at: track.at, by: person(track.by) })),
            })),
          now: Date.now(),
        }];
      case 'POST /v1/week': {
        const card = proto.cleanWeek(data);
        if (!card) return [400, { error: 'woche', message: 'Keine Wochenkarte.' }];
        weeks.set(auth.id, card);
        return [200, { ok: true }];
      }
      case 'POST /v1/group/track': {
        const group = groups.get(String(data.group));
        const ref = proto.cleanRef(data.ref);
        if (!group || !group.members.includes(auth.id)) return [404, { error: 'keine-gruppe', message: 'Keine Gruppe.' }];
        if (!ref) return [400, { error: 'ref', message: 'Nicht teilbar.' }];
        trackSeq += 1;
        group.tracks.unshift({ rid: trackSeq, ref, by: auth.id, at: Date.now() });
        return [201, { ok: true }];
      }
      case 'POST /v1/group/track/remove': {
        const group = groups.get(String(data.group));
        if (!group) return [404, { error: 'keine-gruppe', message: 'Keine Gruppe.' }];
        group.tracks = group.tracks.filter((track) => track.rid !== Number(data.rid));
        return [200, { ok: true }];
      }
      case 'POST /v1/room': {
        roomLeaveCurrent(auth.id);
        const id = names.accountIdFromDigest(crypto.randomBytes(15));
        const code = proto.roomCodeFrom(crypto.randomBytes(12));
        const room = { id, code, host: auth.id, created: Date.now(), members: [{ id: auth.id, joined: Date.now() }], bans: new Set(), state: null, jam: false, queue: [] };
        rooms.set(id, room);
        return [201, { room: roomSnap(room), code, now: Date.now() }];
      }
      case 'GET /v1/room': {
        const room = roomOf(auth.id);
        return [200, { room: room ? roomSnap(room) : null, now: Date.now() }];
      }
      case 'POST /v1/room/join': {
        const code = proto.parseRoomCode(data.code);
        const room = Array.from(rooms.values()).find((row) => code && row.code === code);
        if (!room) return [404, { error: 'code', message: 'Diesen Raum gibt es nicht (mehr).' }];
        if (room.bans.has(auth.id)) return [403, { error: 'raus', message: 'Der Host hat dich aus diesem Raum entfernt.' }];
        if (room.members.some((m) => m.id === auth.id)) return [200, { room: roomSnap(room), already: true, now: Date.now() }];
        if (room.members.length >= proto.LIMITS.roomMembers) return [409, { error: 'voll', message: 'Der Raum ist voll.' }];
        roomLeaveCurrent(auth.id);
        room.members.push({ id: auth.id, joined: Date.now() });
        roomAnnounce(room);
        return [201, { room: roomSnap(room), now: Date.now() }];
      }
      case 'POST /v1/room/leave': {
        const room = roomOf(auth.id);
        if (!room) return [404, { error: 'kein-raum', message: 'Du bist in keinem Raum.' }];
        if (data.close && room.host === auth.id) {
          roomClose(room, 'host');
          return [200, { ok: true, closed: true }];
        }
        roomDrop(room, auth.id, 4000, 'verlassen');
        return [200, { ok: true }];
      }
      case 'POST /v1/room/kick': {
        const room = roomOf(auth.id);
        if (!room || room.host !== auth.id) return [403, { error: 'nur-host', message: 'Nur der Host.' }];
        room.bans.add(other);
        roomDrop(room, other, 4403, 'raus');
        return [200, { ok: true }];
      }
      case 'GET /v1/room/live':
        return [426, { error: 'websocket', message: 'Nur per WebSocket.' }];
      default:
        return [404, { error: 'unbekannt', message: 'Unbekannt.' }];
    }
  }

  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      const method = req.method;
      let status = 200;
      let out;
      if (method === 'GET' && pathname === '/v1/status') out = { ok: true, version: 1, enabled, pow: POW, emojis: proto.EMOJIS };
      else if (!proto.isEndpoint(method, pathname)) [status, out] = [404, { error: 'unbekannt', message: 'Unbekannt.' }];
      else {
        const auth = verify(req, method, pathname, body);
        let data = {};
        try {
          data = body ? JSON.parse(body) : {};
        } catch {
          data = null;
        }
        if (!auth) [status, out] = [401, { error: 'signatur', message: 'Signatur fehlt oder stimmt nicht.' }];
        else if (!data) [status, out] = [400, { error: 'json', message: 'Kein JSON.' }];
        else [status, out] = handle(method, pathname, auth, data);
        log.push({ method, path: pathname, signed: Boolean(auth), status });
      }
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out));
    });
  });

  // S3: the live room socket (signed upgrade like every request).
  server.on('upgrade', (req, socket, head) => {
    const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
    const auth = pathname === proto.ROOM_LIVE ? verify(req, 'GET', pathname, '') : null;
    log.push({ method: 'GET', path: pathname, signed: Boolean(auth), status: auth ? 101 : 401 });
    if (!auth) return roomWs.refuse(socket, 401, { error: 'signatur', message: 'Signatur fehlt oder stimmt nicht.' });
    if (!enabled) return roomWs.refuse(socket, 503, { error: 'aus', message: 'Social ist gerade abgeschaltet.' });
    const room = roomOf(auth.id);
    if (!room) return roomWs.refuse(socket, 404, { error: 'kein-raum', message: 'Du bist in keinem Raum.' });
    roomSockets.forEach((old) => {
      if (old.a === auth.id) {
        old.conn.close(4409, 'ersetzt');
        roomSockets.delete(old);
      }
    });
    const entry = { a: auth.id, r: room.id, conn: null };
    entry.conn = roomWs.accept(req, socket, head, {
      message: (text) => roomMessage(entry, text),
      close: () => {
        if (!roomSockets.delete(entry)) return;
        const still = rooms.get(entry.r);
        if (still) roomAnnounce(still);
      },
    });
    if (!entry.conn) return undefined;
    roomSockets.add(entry);
    roomSend(entry, { t: 'hello', now: Date.now(), me: auth.id, room: roomSnap(room) });
    roomCast(room, { t: 'members', host: room.host, members: roomMembers(room) }, entry);
    return undefined;
  });

  // A second, simulated device: it has its own key and talks to this server
  // over the same signed protocol (used to play "the friend").
  async function remoteClient() {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const key = { privateKey, pub: proto.toBase64Url(rawPublicKey(publicKey)) };
    key.id = idOf(key.pub);
    const call = (method, pathname, data) =>
      new Promise((resolve, reject) => {
        const text = data === undefined ? '' : JSON.stringify(data);
        const req = http.request(
          { host: '127.0.0.1', port: server.address().port, path: pathname, method, headers: Object.assign({ 'content-type': 'application/json' }, signHeaders(key, method, pathname, text)) },
          (res) => {
            let raw = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              raw += chunk;
            });
            res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(raw || '{}') }));
          }
        );
        req.on('error', reject);
        req.end(text);
      });
    const pow = await solvePow(key.id, POW);
    await call('POST', '/v1/account', { pow });
    // S3: this device's live room socket – inbox, next(type), send(), close().
    const live = () =>
      new Promise((resolve) => {
        const inbox = [];
        const socket = { inbox, closed: null };
        const url = proto.roomSocketUrl(`http://127.0.0.1:${server.address().port}`);
        const conn = roomWs.connect(url, { headers: signHeaders(key, 'GET', proto.ROOM_LIVE, '') }, {
          open: () => resolve(socket),
          message: (text) => inbox.push(text.startsWith('{') ? JSON.parse(text) : { t: text }),
          close: (info) => {
            socket.closed = info;
            resolve(socket);
          },
        });
        socket.send = (data) => conn.send(typeof data === 'string' ? data : JSON.stringify(data));
        socket.close = () => conn.close(1000, 'ende');
        socket.next = async (type, ms = 5000) => {
          for (let waited = 0; waited < ms; waited += 25) {
            const index = inbox.findIndex((message) => message.t === type);
            if (index >= 0) return inbox.splice(index, 1)[0];
            await new Promise((done) => setTimeout(done, 25));
          }
          return null;
        };
      });
    return { id: key.id, call, live };
  }

  return {
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))),
    close: () =>
      new Promise((resolve) => {
        roomSockets.forEach((s) => s.conn.close(1001, 'ende'));
        roomSockets.clear();
        server.close(() => resolve());
        if (server.closeAllConnections) server.closeAllConnections();
      }),
    remoteClient,
    setEnabled: (value) => {
      enabled = Boolean(value);
    },
    state: () => ({
      accounts: accounts.size,
      log: log.slice(),
      reports: reports.slice(),
      blocks: Array.from(blocks),
      activity: Array.from(activity.entries()).map(([id, act]) => ({ id, ref: act.ref })),
      reactions: reactions.slice(),
      requests: Array.from(requests.values()).map((row) => Object.assign({}, row)),
      presence: Array.from(presence.keys()),
      groups: Array.from(groups.values()).map((group) => ({ id: group.id, owner: group.owner, members: group.members.length, tracks: group.tracks.length })),
      weeks: Array.from(weeks.keys()),
      rooms: Array.from(rooms.values()).map((room) => ({ id: room.id, host: room.host, members: room.members.length, online: roomOnline(room).size, state: room.state, jam: Boolean(room.jam), queue: roomQueueView(room) })),
    }),
  };
}

module.exports = { createSocial, createFakeServer };
