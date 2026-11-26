/**
 * CleanMusic Social hub – one Durable Object with SQLite storage.
 *
 * Every request except /v1/status is signed (ECDSA P-256 over version,
 * method, path, time ±5 min, nonce and body hash – lib/social-protocol.js).
 * All crypto work happens first; the database part then runs synchronously
 * inside one transaction, so requests never interleave half-way.
 *
 * Stored: public key + account id, display name, friends, blocks, open
 * friend codes (hashed, 24 h), the last activity (10 min), reactions (24 h),
 * reports (30 days), nonces (10 min), rate-limit counters (IP prefixes only
 * as a daily-salted hash, at most 24 h). Inactive accounts go after 12 months.
 * 2.1: friend requests (7 days, src/requests.js) and – only with the switch
 * "Mir online zeigen" – one minute-rounded timestamp (src/presence.js).
 */
import { DurableObject } from 'cloudflare:workers';
import names from '../../../lib/social-names.js';
import proto from '../../../lib/social-protocol.js';
import { json, fail, TOO_MANY } from './http.js';
import * as groups from './groups.js';
import * as requests from './requests.js';
import * as presence from './presence.js';
import * as rooms from './rooms.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NEW_ACCOUNT_MS = DAY;
const INACTIVE_MS = 365 * DAY;
const REPORT_KEEP_MS = 30 * DAY;
const NAME_REPORTS = 3;
const INBOX_MAX = 100;

// [limit, limit for accounts younger than 24 h, window in ms] per account key.
const RATE = {
  redeem: [20, 5, HOUR],
  code: [10, 3, HOUR],
  activity: [1, 1, 15 * 1000],
  react: [30, 10, MIN],
  report: [10, 3, DAY],
  block: [60, 20, HOUR],
  remove: [60, 20, HOUR],
  random: [10, 10, DAY],
  friends: [30, 30, MIN],
  ...groups.GROUP_RATE,
  ...requests.REQUEST_RATE,
  ...presence.PRESENCE_RATE,
  ...rooms.ROOM_RATE,
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, pubkey TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    name_random INTEGER NOT NULL DEFAULT 1, name_at INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, seen INTEGER NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS friends (a TEXT NOT NULL, b TEXT NOT NULL, since INTEGER NOT NULL, PRIMARY KEY (a, b))',
  'CREATE INDEX IF NOT EXISTS friends_b ON friends (b)',
  'CREATE TABLE IF NOT EXISTS blocks (a TEXT NOT NULL, b TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (a, b))',
  'CREATE INDEX IF NOT EXISTS blocks_b ON blocks (b)',
  'CREATE TABLE IF NOT EXISTS codes (hash TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS codes_owner ON codes (owner)',
  'CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, ref TEXT NOT NULL, playing INTEGER NOT NULL, at INTEGER NOT NULL)',
  `CREATE TABLE IF NOT EXISTS reactions (rid INTEGER PRIMARY KEY, to_id TEXT NOT NULL, from_id TEXT NOT NULL,
    emoji TEXT NOT NULL, title TEXT NOT NULL, at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS reactions_to ON reactions (to_id, at)',
  `CREATE TABLE IF NOT EXISTS reports (reporter TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, at INTEGER NOT NULL,
    PRIMARY KEY (reporter, target))`,
  'CREATE TABLE IF NOT EXISTS bans (id TEXT PRIMARY KEY, at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS nonces (id TEXT NOT NULL, nonce TEXT NOT NULL, exp INTEGER NOT NULL, PRIMARY KEY (id, nonce))',
  'CREATE TABLE IF NOT EXISTS limits (bucket TEXT PRIMARY KEY, n INTEGER NOT NULL, exp INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
];

const encoder = new TextEncoder();

async function sha256(data) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? encoder.encode(data) : data));
}

async function verifySignature(rawKey, text, signature) {
  try {
    const key = await crypto.subtle.importKey('raw', rawKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, encoder.encode(text));
  } catch {
    return false;
  }
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}


export class SocialHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    // Optional overrides for local tests only (wrangler.toml never sets this).
    let test = {};
    try {
      test = env.TEST_LIMITS ? JSON.parse(env.TEST_LIMITS) : {};
    } catch {
      test = {};
    }
    this.limits = {
      friends: Number(test.friends) || proto.LIMITS.friends,
      activityTtlMs: Number(test.activityTtlMs) || proto.LIMITS.activityTtlMs,
      codeTtlMs: Number(test.codeTtlMs) || proto.LIMITS.codeTtlMs,
      accountsPerIp: Number(test.accountsPerIp) || 3,
      requestTtlMs: Number(test.requestTtlMs) || proto.LIMITS.requestTtlMs,
      openRequests: Number(test.openRequests) || proto.LIMITS.openRequests,
      onlineTtlMs: Number(test.onlineTtlMs) || proto.LIMITS.onlineTtlMs,
    };
    this.roomLimits = Object.assign({}, proto.LIMITS, {
      roomNoHostMs: Number(test.roomNoHostMs) || proto.LIMITS.roomNoHostMs,
      roomAwayMs: Number(test.roomAwayMs) || proto.LIMITS.roomAwayMs,
    });
    // S3: "ping" on a room socket is answered without waking the object.
    try {
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    } catch {
      /* older runtime: the hub answers in webSocketMessage */
    }
    ctx.blockConcurrencyWhile(async () => {
      SCHEMA.concat(groups.GROUP_SCHEMA, requests.REQUEST_SCHEMA, presence.PRESENCE_SCHEMA, rooms.ROOM_SCHEMA).forEach((statement) => this.sql.exec(statement));
      requests.migrateRequests(this);
      rooms.migrateRooms(this);
      if (!(await ctx.storage.getAlarm())) await ctx.storage.setAlarm(Date.now() + 10 * MIN);
    });
  }

  /* --- small SQL helpers ------------------------------------------------ */
  all(query, ...args) {
    return this.sql.exec(query, ...args).toArray();
  }

  one(query, ...args) {
    return this.all(query, ...args)[0] || null;
  }

  run(query, ...args) {
    return this.sql.exec(query, ...args).rowsWritten;
  }

  meta(key) {
    const row = this.one('SELECT v FROM meta WHERE k = ?', key);
    return row ? row.v : null;
  }

  setMeta(key, value) {
    this.run('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', key, String(value));
  }

  /* --- switches --------------------------------------------------------- */
  enabled() {
    return this.env.SOCIAL_ENABLED !== 'false' && this.meta('enabled') !== '0';
  }

  powBits() {
    const value = Number(this.meta('pow') || this.env.POW_BITS || 20);
    return Math.min(28, Math.max(8, Number.isFinite(value) ? Math.round(value) : 20));
  }

  status() {
    return {
      ok: true,
      version: 1,
      enabled: this.enabled(),
      pow: this.powBits(),
      limits: { friends: this.limits.friends, activityTtl: this.limits.activityTtlMs, codeTtl: this.limits.codeTtlMs },
      emojis: proto.EMOJIS,
    };
  }

  /* --- rate limits (fixed windows) -------------------------------------- */
  hit(bucket, limit, windowMs, now) {
    const win = Math.floor(now / windowMs);
    const key = `${bucket}:${win}`;
    const row = this.one('SELECT n FROM limits WHERE bucket = ?', key);
    if (row && row.n >= limit) return false;
    if (row) this.run('UPDATE limits SET n = n + 1 WHERE bucket = ?', key);
    else this.run('INSERT INTO limits (bucket, n, exp) VALUES (?, 1, ?)', key, (win + 1) * windowMs);
    return true;
  }

  limit(account, name, now) {
    const [normal, fresh, windowMs] = RATE[name];
    const isNew = now - account.created < NEW_ACCOUNT_MS;
    return this.hit(`k:${account.id}:${name}`, isNew ? fresh : normal, windowMs, now);
  }

  async ipHash(prefix, now) {
    const key = `salt:${proto.powDay(now)}`;
    let salt = this.meta(key);
    if (!salt) {
      salt = proto.toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      this.run("DELETE FROM meta WHERE k LIKE 'salt:%'");
      this.setMeta(key, salt);
    }
    return proto.toBase64Url(await hmac(salt, prefix)).slice(0, 22);
  }

  /* --- request entry ---------------------------------------------------- */
  async fetch(request) {
    const now = Date.now();
    const url = new URL(request.url);
    const method = request.method.toUpperCase();
    const path = url.pathname;
    try {
      if (method === 'GET' && path === '/v1/status') return json(this.status());
      if (path.startsWith('/v1/admin/')) return await this.admin(request, method, path, now);
      if (!proto.isEndpoint(method, path)) return fail(404, 'unbekannt', 'Diese Adresse gibt es nicht.');

      const ip = await this.ipHash(request.headers.get('cm-ip') || 'unbekannt', now);
      if (!this.hit(`ip:${ip}:all`, 600, 10 * MIN, now)) return TOO_MANY();

      const declared = Number(request.headers.get('content-length') || 0);
      if (declared > proto.BODY_MAX) return fail(413, 'zu-gross', 'Die Anfrage ist zu groß.');
      const body = method === 'GET' || method === 'DELETE' ? '' : await request.text();
      if (body.length > proto.BODY_MAX) return fail(413, 'zu-gross', 'Die Anfrage ist zu groß.');

      const auth = await this.authenticate(request, method, path, body, now);
      if (auth instanceof Response) return auth;

      let data = {};
      if (body) {
        try {
          data = JSON.parse(body);
        } catch {
          return fail(400, 'json', 'Die Anfrage ist kein gültiges JSON.');
        }
        if (!data || typeof data !== 'object' || Array.isArray(data)) return fail(400, 'json', 'Die Anfrage ist kein gültiges JSON.');
      }

      // Remaining async work before the synchronous database part.
      const extra = {};
      if (method === 'POST' && path === '/v1/account') extra.pow = await this.powOk(auth.id, data.pow, now);
      if (path === '/v1/friend/redeem') {
        const code = proto.parseFriendCode(data.code);
        extra.codeHash = code ? proto.toBase64Url(await sha256(code)) : '';
      }
      if (path === '/v1/group') extra.groupId = names.accountIdFromDigest(crypto.getRandomValues(new Uint8Array(15)));
      if (path === '/v1/group/code') {
        extra.code = proto.groupCodeFrom(crypto.getRandomValues(new Uint8Array(12)));
        extra.codeHash = proto.toBase64Url(await sha256(extra.code));
      }
      if (path === '/v1/group/join') {
        const code = proto.parseGroupCode(data.code);
        extra.codeHash = code ? proto.toBase64Url(await sha256(code)) : '';
      }
      if (path === '/v1/room' && method === 'POST') {
        extra.roomId = names.accountIdFromDigest(crypto.getRandomValues(new Uint8Array(15)));
        extra.code = proto.roomCodeFrom(crypto.getRandomValues(new Uint8Array(12)));
        extra.codeHash = proto.toBase64Url(await sha256(extra.code));
      }
      if (path === '/v1/room/join') {
        const code = proto.parseRoomCode(data.code);
        extra.codeHash = code ? proto.toBase64Url(await sha256(code)) : '';
      }
      if (path === '/v1/room/live') extra.request = request;
      if (path === '/v1/friend-code' && !data.revoke) {
        extra.code = proto.friendCodeFrom(crypto.getRandomValues(new Uint8Array(12)));
        extra.codeHash = proto.toBase64Url(await sha256(extra.code));
      }

      return this.ctx.storage.transactionSync(() => {
        if (!this.useNonce(auth.id, request.headers.get(proto.HEADERS.nonce), now)) {
          return fail(401, 'wiederholt', 'Diese Anfrage wurde schon einmal gesendet.');
        }
        const deleting = method === 'DELETE' && path === '/v1/account';
        if (!this.enabled() && !deleting) return fail(503, 'aus', 'Social ist gerade abgeschaltet.');
        if (this.one('SELECT 1 AS x FROM bans WHERE id = ?', auth.id)) return fail(403, 'gesperrt', 'Dieses Konto ist gesperrt.');
        if (method === 'POST' && path === '/v1/account') return this.createAccount(auth, extra, ip, now);
        const account = this.one('SELECT * FROM accounts WHERE id = ?', auth.id);
        if (!account) return fail(401, 'kein-konto', 'Zu diesem Schlüssel gibt es kein Konto.');
        if (now - account.seen > HOUR) this.run('UPDATE accounts SET seen = ? WHERE id = ?', now, account.id);
        if (!deleting) presence.touchPresence(this, account.id, now);
        return this.route(method, path, account, data, extra, now);
      });
    } catch (error) {
      console.error('social', path, error && error.message);
      return fail(500, 'fehler', 'Serverfehler – bitte später noch einmal.');
    }
  }

  async authenticate(request, method, path, body, now) {
    const header = (name) => request.headers.get(proto.HEADERS[name]) || '';
    const key = header('key');
    const time = header('time');
    const nonce = header('nonce');
    const sig = header('sig');
    if (!proto.validPublicKey(key) || !proto.validNonce(nonce) || !proto.validSignature(sig)) {
      return fail(401, 'signatur', 'Die Anfrage ist nicht signiert.');
    }
    if (!proto.timeOk(time, now)) return fail(401, 'zeit', 'Die Uhrzeit deines Geräts weicht mehr als 5 Minuten ab.');
    const raw = proto.fromBase64Url(key);
    if (raw.length !== 65 || raw[0] !== 4) return fail(401, 'signatur', 'Der Schlüssel ist ungültig.');
    const bodyHash = proto.toBase64Url(await sha256(body));
    const ok = await verifySignature(raw, proto.canonical(method, path, time, nonce, bodyHash), proto.fromBase64Url(sig));
    if (!ok) return fail(401, 'signatur', 'Die Signatur stimmt nicht.');
    return { id: names.accountIdFromDigest(await sha256(raw)), key };
  }

  useNonce(id, nonce, now) {
    if (this.one('SELECT 1 AS x FROM nonces WHERE id = ? AND nonce = ?', id, nonce)) return false;
    this.run('INSERT INTO nonces (id, nonce, exp) VALUES (?, ?, ?)', id, nonce, now + 2 * proto.MAX_SKEW_MS);
    return true;
  }

  async powOk(id, pow, now) {
    if (!pow || typeof pow !== 'object') return false;
    const day = String(pow.day || '');
    const counter = Number(pow.counter);
    if (!proto.powDayOk(day, now) || !Number.isSafeInteger(counter) || counter < 0) return false;
    return proto.leadingZeroBits(await sha256(proto.powInput(id, day, counter))) >= this.powBits();
  }

  /* --- endpoints (synchronous, inside the transaction) ------------------ */
  route(method, path, account, data, extra, now) {
    if (method === 'DELETE' && path === '/v1/account') {
      this.deleteAccount(account.id);
      return json({ ok: true, deleted: true });
    }
    switch (path) {
      case '/v1/name':
        return this.setName(account, data, now);
      case '/v1/friend-code':
        return this.friendCode(account, data, extra, now);
      case '/v1/friend/redeem':
        return this.redeem(account, data, extra, now);
      case '/v1/friend/accept':
        return requests.acceptRequest(this, account, data, now);
      case '/v1/friend/decline':
        return requests.declineRequest(this, account, data, now);
      case '/v1/presence':
        return presence.setPresence(this, account, data, now);
      case '/v1/friend/remove':
        return this.removeFriend(account, data, now);
      case '/v1/friends':
        return this.friends(account, now);
      case '/v1/activity':
        return this.activity(account, data, now);
      case '/v1/react':
        return this.react(account, data, now);
      case '/v1/report':
        return this.report(account, data, now);
      case '/v1/block':
        return this.block(account, data, now);
      case '/v1/group':
        return groups.createGroup(this, account, data, extra, now);
      case '/v1/group/code':
        return groups.groupCode(this, account, data, extra, now, this.limits.codeTtlMs);
      case '/v1/group/join':
        return groups.joinGroup(this, account, extra, now);
      case '/v1/group/leave':
        return groups.leaveGroup(this, account, data, now);
      case '/v1/group/kick':
        return groups.kickMember(this, account, data, now);
      case '/v1/groups':
        return groups.listGroups(this, account, now);
      case '/v1/week':
        return groups.postWeek(this, account, data, now);
      case '/v1/group/track':
        return groups.addTrack(this, account, data, now);
      case '/v1/group/track/remove':
        return groups.removeTrack(this, account, data);
      case '/v1/room':
        return method === 'POST' ? rooms.createRoom(this, account, extra, now) : rooms.getRoom(this, account, now);
      case '/v1/room/join':
        return rooms.joinRoom(this, account, extra, now);
      case '/v1/room/leave':
        return rooms.leaveRoom(this, account, data, now);
      case '/v1/room/kick':
        return rooms.kickMember(this, account, data, now);
      case '/v1/room/live':
        return rooms.openLive(this, account, extra.request, now);
      default:
        return fail(404, 'unbekannt', 'Diese Adresse gibt es nicht.');
    }
  }

  me(account) {
    return {
      id: account.id,
      tag: names.tagOf(account.id),
      name: account.name,
      random: Boolean(account.name_random),
      nameChangeAt: account.name_at ? account.name_at + DAY : 0,
      created: account.created,
    };
  }

  person(row) {
    return { id: row.id, tag: names.tagOf(row.id), name: row.name || 'Unbekannt' };
  }

  isFriend(a, b) {
    return Boolean(this.one('SELECT 1 AS x FROM friends WHERE a = ? AND b = ?', a, b));
  }

  blockedEither(a, b) {
    return Boolean(this.one('SELECT 1 AS x FROM blocks WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', a, b, b, a));
  }

  friendCount(id) {
    return this.one('SELECT COUNT(*) AS n FROM friends WHERE a = ?', id).n;
  }

  befriend(a, b, now) {
    this.run('INSERT INTO friends (a, b, since) VALUES (?, ?, ?), (?, ?, ?) ON CONFLICT (a, b) DO NOTHING', a, b, now, b, a, now);
    requests.forgetRequests(this, a, b);
  }

  createAccount(auth, extra, ip, now) {
    const existing = this.one('SELECT * FROM accounts WHERE id = ?', auth.id);
    if (existing) return json({ account: this.me(existing), created: false });
    if (!extra.pow) return fail(400, 'pow', 'Der Rechennachweis fehlt oder stimmt nicht.');
    if (!this.hit(`ip:${ip}:account`, this.limits.accountsPerIp, DAY, now)) {
      return fail(429, 'zu-viele-konten', 'Aus diesem Netz wurden heute schon genug Konten angelegt.');
    }
    this.run(
      'INSERT INTO accounts (id, pubkey, name, name_random, name_at, created, seen) VALUES (?, ?, ?, 1, 0, ?, ?)',
      auth.id, auth.key, names.randomName(), now, now
    );
    return json({ account: this.me(this.one('SELECT * FROM accounts WHERE id = ?', auth.id)), created: true }, 201);
  }

  setName(account, data, now) {
    if (data.random) {
      if (!this.limit(account, 'random', now)) return TOO_MANY();
      const name = names.randomName();
      this.run('UPDATE accounts SET name = ?, name_random = 1 WHERE id = ?', name, account.id);
      return json({ account: this.me(Object.assign({}, account, { name, name_random: 1 })) });
    }
    const check = names.checkName(data.name);
    if (!check.ok) return fail(400, 'name', check.reason);
    if (account.name_at && now - account.name_at < DAY) {
      return fail(429, 'name-tag', 'Deinen eigenen Namen kannst du einmal pro Tag ändern.');
    }
    this.run('UPDATE accounts SET name = ?, name_random = 0, name_at = ? WHERE id = ?', check.name, now, account.id);
    return json({ account: this.me(Object.assign({}, account, { name: check.name, name_random: 0, name_at: now })) });
  }

  friendCode(account, data, extra, now) {
    if (data.revoke) return json({ revoked: this.run('DELETE FROM codes WHERE owner = ?', account.id) });
    if (!this.limit(account, 'code', now)) return TOO_MANY();
    const open = this.all('SELECT hash FROM codes WHERE owner = ? AND expires > ? ORDER BY expires DESC', account.id, now);
    open.slice(proto.LIMITS.openCodes - 1).forEach((row) => this.run('DELETE FROM codes WHERE hash = ?', row.hash));
    const expires = now + this.limits.codeTtlMs;
    // 2.1 clients ask for codes that need a "yes" (friend requests); 2.0.x codes stay instant.
    const ask = data.requests === true ? 1 : 0;
    this.run('INSERT INTO codes (hash, owner, expires, ask) VALUES (?, ?, ?, ?)', extra.codeHash, account.id, expires, ask);
    return json({ code: extra.code, expires, requests: Boolean(ask) }, 201);
  }

  redeem(account, data, extra, now) {
    if (!this.limit(account, 'redeem', now)) return TOO_MANY();
    if (!extra.codeHash) return fail(400, 'code', 'Das ist kein gültiger Freundescode.');
    const row = this.one('SELECT hash, owner, expires, ask FROM codes WHERE hash = ?', extra.codeHash);
    const gone = () => fail(404, 'code', 'Der Code ist abgelaufen, schon benutzt oder ungültig.');
    if (!row || row.expires <= now) return gone();
    if (row.owner === account.id) return fail(400, 'eigener-code', 'Das ist dein eigener Code.');
    const other = this.one('SELECT * FROM accounts WHERE id = ?', row.owner);
    if (!other || this.blockedEither(account.id, other.id)) return gone();
    if (this.isFriend(account.id, other.id)) {
      this.run('DELETE FROM codes WHERE hash = ?', extra.codeHash);
      return json({ friend: this.person(other), already: true });
    }
    if (this.friendCount(account.id) >= this.limits.friends || this.friendCount(other.id) >= this.limits.friends) {
      return fail(409, 'voll', `Eine der beiden Freundeslisten ist voll (höchstens ${this.limits.friends}).`);
    }
    const asked = requests.redeemAsRequest(this, account, other, row, data, now);
    if (asked) return asked;
    this.befriend(account.id, other.id, now);
    this.run('DELETE FROM codes WHERE hash = ?', extra.codeHash);
    return json({ friend: this.person(other) }, 201);
  }

  removeFriend(account, data, now) {
    const id = String(data.id || '');
    if (!names.validId(id)) return fail(400, 'id', 'Unbekannte Person.');
    if (!this.limit(account, 'remove', now)) return TOO_MANY();
    this.unfriend(account.id, id);
    return json({ ok: true });
  }

  unfriend(a, b) {
    this.run('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', a, b, b, a);
    this.run('DELETE FROM reactions WHERE (to_id = ? AND from_id = ?) OR (to_id = ? AND from_id = ?)', a, b, b, a);
  }

  friends(account, now) {
    if (!this.limit(account, 'friends', now)) return TOO_MANY();
    const since = now - this.limits.activityTtlMs;
    const friends = this.all(
      `SELECT a.id, a.name, f.since, act.ref, act.playing, act.at, p.at AS online FROM friends f
       JOIN accounts a ON a.id = f.b
       LEFT JOIN activity act ON act.id = a.id AND act.at > ?
       LEFT JOIN presence p ON p.id = a.id AND p.at > ?
       WHERE f.a = ? ORDER BY a.name`,
      since, now - this.limits.onlineTtlMs, account.id
    ).map((row) => Object.assign(this.person(row), {
      since: row.since,
      online: Boolean(row.online),
      activity: row.ref ? { ref: JSON.parse(row.ref), playing: Boolean(row.playing), at: row.at } : null,
    }));
    const reactions = this.all(
      `SELECT r.from_id, r.emoji, r.title, r.at, a.name FROM reactions r JOIN accounts a ON a.id = r.from_id
       WHERE r.to_id = ? AND r.at > ? ORDER BY r.at DESC LIMIT 50`,
      account.id, now - proto.LIMITS.reactionTtlMs
    ).map((row) => ({ from: this.person({ id: row.from_id, name: row.name }), emoji: row.emoji, title: row.title, at: row.at }));
    const blocked = this.all(
      'SELECT b.b AS id, a.name FROM blocks b LEFT JOIN accounts a ON a.id = b.b WHERE b.a = ? ORDER BY b.at DESC LIMIT 200',
      account.id
    ).map((row) => this.person(row));
    const me = Object.assign(this.me(account), { showOnline: presence.showsOnline(this, account.id) });
    return json(Object.assign({ me, friends, reactions, blocked, now }, requests.listRequests(this, account, now)));
  }

  activity(account, data, now) {
    if (data.clear) {
      this.run('DELETE FROM activity WHERE id = ?', account.id);
      return json({ ok: true, cleared: true });
    }
    const ref = proto.cleanRef(data.ref);
    if (!ref) return fail(400, 'ref', 'Dieser Titel lässt sich nicht teilen (lokale Dateien und Radio bleiben bei dir).');
    if (!this.limit(account, 'activity', now)) return TOO_MANY();
    this.run(
      `INSERT INTO activity (id, ref, playing, at) VALUES (?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET ref = excluded.ref, playing = excluded.playing, at = excluded.at`,
      account.id, JSON.stringify(ref), data.playing === false ? 0 : 1, now
    );
    return json({ ok: true, expires: now + this.limits.activityTtlMs });
  }

  react(account, data, now) {
    const to = String(data.to || '');
    if (!proto.EMOJIS.includes(data.emoji)) return fail(400, 'emoji', 'Diese Reaktion gibt es nicht.');
    if (!this.isFriend(account.id, to)) return fail(404, 'kein-freund', 'Diese Person ist nicht in deiner Freundesliste.');
    const act = this.one('SELECT ref FROM activity WHERE id = ? AND at > ?', to, now - this.limits.activityTtlMs);
    if (!act) return fail(409, 'keine-aktivitaet', 'Dein Freund hört gerade nichts.');
    if (!this.limit(account, 'react', now) || !this.hit(`pair:${account.id}:${to}`, 10, 10 * MIN, now)) return TOO_MANY();
    const title = String(JSON.parse(act.ref).title || '').slice(0, 80);
    this.run('INSERT INTO reactions (to_id, from_id, emoji, title, at) VALUES (?, ?, ?, ?, ?)', to, account.id, data.emoji, title, now);
    this.run(
      'DELETE FROM reactions WHERE to_id = ? AND rid NOT IN (SELECT rid FROM reactions WHERE to_id = ? ORDER BY at DESC LIMIT ?)',
      to, to, INBOX_MAX
    );
    return json({ ok: true });
  }

  report(account, data, now) {
    const target = String(data.id || '');
    const reason = String(data.reason || '');
    if (!proto.REPORT_REASONS.includes(reason)) return fail(400, 'grund', 'Bitte einen Grund wählen.');
    if (!names.validId(target) || target === account.id) return fail(400, 'id', 'Unbekannte Person.');
    const known = this.isFriend(account.id, target) || this.one('SELECT 1 AS x FROM blocks WHERE a = ? AND b = ?', account.id, target) ||
      requests.hasRequest(this, target, account.id, now);
    if (!known) return fail(404, 'kein-freund', 'Melden geht nur für Freunde, Anfragen und Blockierte.');
    if (!this.limit(account, 'report', now)) return TOO_MANY();
    this.run(
      `INSERT INTO reports (reporter, target, reason, at) VALUES (?, ?, ?, ?)
       ON CONFLICT (reporter, target) DO UPDATE SET reason = excluded.reason, at = excluded.at`,
      account.id, target, reason, now
    );
    let renamed = false;
    const other = this.one('SELECT * FROM accounts WHERE id = ?', target);
    if (reason === 'name' && other && !other.name_random) {
      const count = this.one('SELECT COUNT(*) AS n FROM reports WHERE target = ? AND reason = ? AND at >= ?', target, 'name', other.name_at).n;
      if (count >= NAME_REPORTS) {
        this.run('UPDATE accounts SET name = ?, name_random = 1, name_at = ? WHERE id = ?', names.randomName(), now, target);
        this.run("DELETE FROM reports WHERE target = ? AND reason = 'name'", target);
        renamed = true;
      }
    }
    return json({ ok: true, renamed });
  }

  block(account, data, now) {
    const target = String(data.id || '');
    if (!names.validId(target) || target === account.id) return fail(400, 'id', 'Unbekannte Person.');
    if (data.block === false) {
      this.run('DELETE FROM blocks WHERE a = ? AND b = ?', account.id, target);
      return json({ ok: true, blocked: false });
    }
    if (!this.one('SELECT 1 AS x FROM accounts WHERE id = ?', target)) return fail(404, 'id', 'Unbekannte Person.');
    if (!this.limit(account, 'block', now)) return TOO_MANY();
    this.run('INSERT INTO blocks (a, b, at) VALUES (?, ?, ?) ON CONFLICT (a, b) DO UPDATE SET at = excluded.at', account.id, target, now);
    this.unfriend(account.id, target);
    requests.forgetRequests(this, account.id, target);
    return json({ ok: true, blocked: true });
  }

  deleteAccount(id) {
    rooms.deleteAccountRooms(this, id, Date.now());
    groups.deleteAccountGroups(this, id);
    requests.deleteAccountRequests(this, id);
    presence.deletePresence(this, id);
    this.run('DELETE FROM accounts WHERE id = ?', id);
    this.run('DELETE FROM friends WHERE a = ? OR b = ?', id, id);
    this.run('DELETE FROM blocks WHERE a = ? OR b = ?', id, id);
    this.run('DELETE FROM codes WHERE owner = ?', id);
    this.run('DELETE FROM activity WHERE id = ?', id);
    this.run('DELETE FROM reactions WHERE to_id = ? OR from_id = ?', id, id);
    this.run('DELETE FROM reports WHERE reporter = ? OR target = ?', id, id);
    this.run('DELETE FROM nonces WHERE id = ?', id);
    this.run('DELETE FROM limits WHERE bucket LIKE ?', `k:${id}:%`);
  }

  /* --- operator tools (only with the ADMIN_TOKEN secret) ---------------- */
  async admin(request, method, path, now) {
    const token = String(this.env.ADMIN_TOKEN || '');
    if (token.length < 32) return fail(404, 'unbekannt', 'Diese Adresse gibt es nicht.');
    const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const [a, b] = await Promise.all([sha256(given), sha256(token)]);
    if (!crypto.subtle.timingSafeEqual(a, b)) return fail(401, 'admin', 'Kein Zugriff.');
    let data = {};
    if (method === 'POST') {
      try {
        data = JSON.parse((await request.text()) || '{}');
      } catch {
        return fail(400, 'json', 'Kein gültiges JSON.');
      }
    }
    return this.ctx.storage.transactionSync(() => {
      if (method === 'POST' && path === '/v1/admin/switch') {
        if (typeof data.enabled === 'boolean') this.setMeta('enabled', data.enabled ? '1' : '0');
        if (Number.isFinite(data.pow)) this.setMeta('pow', Math.round(data.pow));
        if (data.enabled === false) rooms.closeAll(this, rooms.CLOSE.off, 'aus');
        return json(this.status());
      }
      if (method === 'POST' && path === '/v1/admin/ban') {
        const id = String(data.id || '');
        if (!names.validId(id)) return fail(400, 'id', 'Ungültige Konto-ID.');
        if (data.banned === false) this.run('DELETE FROM bans WHERE id = ?', id);
        else {
          this.run('INSERT INTO bans (id, at) VALUES (?, ?) ON CONFLICT (id) DO NOTHING', id, now);
          this.deleteAccount(id);
        }
        return json({ ok: true, id, banned: data.banned !== false });
      }
      if (method === 'GET' && path === '/v1/admin/reports') {
        return json({
          reports: this.all(
            `SELECT r.target, r.reason, r.at, a.name, (SELECT COUNT(*) FROM reports x WHERE x.target = r.target) AS total
             FROM reports r LEFT JOIN accounts a ON a.id = r.target ORDER BY r.at DESC LIMIT 200`
          ),
        });
      }
      return fail(404, 'unbekannt', 'Diese Adresse gibt es nicht.');
    });
  }

  /* --- S3: room sockets (Hibernation API, see rooms.js) ------------------ */
  async webSocketMessage(ws, message) {
    if (message === 'ping') return ws.send('pong');
    try {
      this.ctx.storage.transactionSync(() => rooms.onMessage(this, ws, message, Date.now()));
    } catch (error) {
      console.error('social room', error && error.message);
    }
    return undefined;
  }

  async webSocketClose(ws, code) {
    try {
      this.ctx.storage.transactionSync(() => rooms.onClose(this, ws, Date.now()));
    } catch (error) {
      console.error('social room close', error && error.message);
    }
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, 'tschüss');
    } catch {
      /* already closed */
    }
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011);
  }

  /* --- housekeeping every 10 minutes ------------------------------------ */
  async alarm() {
    this.cleanup(Date.now());
    await this.ctx.storage.setAlarm(Date.now() + 10 * MIN);
  }

  cleanup(now) {
    this.ctx.storage.transactionSync(() => {
      this.run('DELETE FROM nonces WHERE exp < ?', now);
      this.run('DELETE FROM limits WHERE exp < ?', now);
      this.run('DELETE FROM codes WHERE expires < ?', now);
      this.run('DELETE FROM activity WHERE at < ?', now - this.limits.activityTtlMs);
      this.run('DELETE FROM reactions WHERE at < ?', now - proto.LIMITS.reactionTtlMs);
      this.run('DELETE FROM reports WHERE at < ?', now - REPORT_KEEP_MS);
      groups.cleanupGroups(this, now);
      requests.cleanupRequests(this, now);
      presence.cleanupPresence(this, now, this.limits.onlineTtlMs);
      rooms.cleanupRooms(this, now, this.roomLimits);
      this.all('SELECT id FROM accounts WHERE seen < ? LIMIT 200', now - INACTIVE_MS).forEach((row) => this.deleteAccount(row.id));
    });
  }
}
