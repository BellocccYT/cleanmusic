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
 * createFakeServer() is a small in-memory stand-in for the smoke test
 * (SMOKE_SOCIAL_SERVER); it checks signatures, time, nonces and PoW the same way.
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const names = require('./lib/social-names');
const proto = require('./lib/social-protocol');

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

  function server() {
    return proto.normalizeServer(config().server) || proto.normalizeServer(proto.DEFAULT_SERVER);
  }

  function info() {
    const key = loadKey();
    const origin = server();
    return {
      available: secureStorage(),
      server: origin,
      custom: Boolean(proto.normalizeServer(config().server)),
      defaultServer: proto.normalizeServer(proto.DEFAULT_SERVER),
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
    if (!proto.isEndpoint(method, pathname) || (method === 'POST' && pathname === '/v1/account')) {
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
    setConfig({ server: origin, registered: '' });
    return info();
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
  }

  return { register, info, setup, request, setServer, keyFile, loadKey };
}

/* --- Smoke: in-memory stand-in for the Worker ---------------------------- */
function createFakeServer() {
  const accounts = new Map(); // id -> { id, pub, name, random }
  const friends = new Map(); // id -> Set(id)
  const codes = new Map(); // code -> owner
  const activity = new Map(); // id -> { ref, playing, at }
  const reactions = []; // { to, from, emoji, title, at }
  const blocks = new Set(); // "a>b"
  const reports = [];
  const nonces = new Set();
  const log = [];
  let enabled = true;
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
    switch (`${method} ${pathname}`) {
      case 'DELETE /v1/account':
        accounts.delete(auth.id);
        set(auth.id).forEach((id) => set(id).delete(auth.id));
        friends.delete(auth.id);
        activity.delete(auth.id);
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
        const code = proto.friendCodeFrom(crypto.randomBytes(12));
        codes.set(code, auth.id);
        return [201, { code, expires: Date.now() + proto.LIMITS.codeTtlMs }];
      }
      case 'POST /v1/friend/redeem': {
        const code = proto.parseFriendCode(data.code);
        const owner = codes.get(code);
        if (!owner || owner === auth.id || blocks.has(`${owner}>${auth.id}`) || blocks.has(`${auth.id}>${owner}`)) {
          return [404, { error: 'code', message: 'Der Code ist abgelaufen, schon benutzt oder ungültig.' }];
        }
        codes.delete(code);
        link(auth.id, owner);
        return [201, { friend: person(owner) }];
      }
      case 'POST /v1/friend/remove':
        unlink(auth.id, other);
        return [200, { ok: true }];
      case 'GET /v1/friends': {
        const now = Date.now();
        return [200, {
          me: Object.assign(person(auth.id), { random: me.random, nameChangeAt: 0 }),
          friends: Array.from(set(auth.id)).map((id) => {
            const act = activity.get(id);
            return Object.assign(person(id), { since: now, activity: act && now - act.at < proto.LIMITS.activityTtlMs ? act : null });
          }),
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
        }
        return [200, { ok: true, blocked: data.block !== false }];
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
    return { id: key.id, call };
  }

  return {
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))),
    close: () => new Promise((resolve) => server.close(() => resolve())),
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
    }),
  };
}

module.exports = { createSocial, createFakeServer };
