/**
 * S3 – listening rooms ("Gemeinsam hören", docs/PLAN-SOCIAL.md): a room per
 * code (R1-…, only the hash is stored), at most 20 people, one room per
 * account at a time. The host steers; the server only passes on
 * { ref, pos, at, playing, full } (a song reference, never audio) and the
 * fixed emoji reactions – no chat.
 *
 * Live part: one signed WebSocket per member on /v1/room/live, accepted with
 * the Hibernation API (tags: room id, "a:<account>"), so idle rooms cost
 * nothing; "ping" is answered automatically without waking the object.
 * A room without its host dies after 30 minutes; when the host leaves, the
 * oldest member takes over. Guests without a connection drop out after
 * 30 minutes.
 *
 * Request functions run synchronously inside the hub's transaction.
 */
import names from '../../../lib/social-names.js';
import proto from '../../../lib/social-protocol.js';
import { json, fail, TOO_MANY } from './http.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const ROOM_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS rooms (id TEXT PRIMARY KEY, code_hash TEXT NOT NULL UNIQUE, host TEXT NOT NULL,
    created INTEGER NOT NULL, host_away INTEGER NOT NULL DEFAULT 0, state TEXT)`,
  `CREATE TABLE IF NOT EXISTS room_members (room TEXT NOT NULL, account TEXT NOT NULL, joined INTEGER NOT NULL,
    seen INTEGER NOT NULL, PRIMARY KEY (room, account))`,
  'CREATE INDEX IF NOT EXISTS room_members_account ON room_members (account)',
  'CREATE TABLE IF NOT EXISTS room_bans (room TEXT NOT NULL, account TEXT NOT NULL, PRIMARY KEY (room, account))',
];

// [limit, limit for accounts younger than 24 h, window in ms]
export const ROOM_RATE = {
  room: [10, 3, HOUR],
  rjoin: [30, 10, HOUR],
  rleave: [30, 10, HOUR],
  rget: [60, 60, MIN],
  rlive: [60, 30, HOUR],
  rstate: [120, 120, MIN],
  rreact: [30, 10, MIN],
  rtime: [30, 30, MIN],
};

// Close codes the app understands (social-main.js): no reconnect for these.
export const CLOSE = { left: 4000, kicked: 4403, gone: 4404, replaced: 4409, off: 4503 };

const NO_ROOM = () => fail(404, 'kein-raum', 'Du bist in keinem Raum (mehr).');

function memberRoom(hub, account) {
  const row = hub.one('SELECT r.* FROM room_members m JOIN rooms r ON r.id = m.room WHERE m.account = ?', account);
  return row || null;
}

function sockets(hub, tag) {
  try {
    return hub.ctx.getWebSockets(tag);
  } catch {
    return [];
  }
}

function attachment(ws) {
  try {
    return ws.deserializeAttachment() || {};
  } catch {
    return {};
  }
}

function sendTo(ws, message) {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    /* already closed */
  }
}

function closeSocket(ws, code, reason) {
  try {
    ws.close(code, reason);
  } catch {
    /* already closed */
  }
}

function online(hub, roomId) {
  return new Set(sockets(hub, roomId).map((ws) => attachment(ws).a).filter(Boolean));
}

function broadcast(hub, roomId, message, except) {
  sockets(hub, roomId).forEach((ws) => {
    if (ws !== except) sendTo(ws, message);
  });
}

function members(hub, room) {
  const live = online(hub, room.id);
  return hub
    .all(
      `SELECT a.id, a.name, m.joined FROM room_members m JOIN accounts a ON a.id = m.account
       WHERE m.room = ? ORDER BY m.joined`,
      room.id
    )
    .map((row) => ({ id: row.id, tag: names.tagOf(row.id), name: row.name, host: row.id === room.host, online: live.has(row.id) }));
}

function snapshot(hub, room) {
  return {
    id: room.id,
    host: room.host,
    created: room.created,
    members: members(hub, room),
    state: room.state ? JSON.parse(room.state) : null,
  };
}

function announceMembers(hub, roomId) {
  const room = hub.one('SELECT * FROM rooms WHERE id = ?', roomId);
  if (room) broadcast(hub, room.id, { t: 'members', host: room.host, members: members(hub, room) });
}

function deleteRoom(hub, roomId, reason) {
  sockets(hub, roomId).forEach((ws) => {
    sendTo(ws, { t: 'closed', reason });
    closeSocket(ws, CLOSE.gone, reason);
  });
  hub.run('DELETE FROM rooms WHERE id = ?', roomId);
  hub.run('DELETE FROM room_members WHERE room = ?', roomId);
  hub.run('DELETE FROM room_bans WHERE room = ?', roomId);
}

function closeMemberSockets(hub, roomId, account, code, reason) {
  sockets(hub, `a:${account}`).forEach((ws) => {
    if (attachment(ws).r !== roomId) return;
    sendTo(ws, { t: 'closed', reason });
    closeSocket(ws, code, reason);
  });
}

// Leaving or being removed: the oldest member becomes host; an empty room is deleted.
function removeMember(hub, roomId, account, now, code, reason) {
  closeMemberSockets(hub, roomId, account, code, reason);
  hub.run('DELETE FROM room_members WHERE room = ? AND account = ?', roomId, account);
  const room = hub.one('SELECT * FROM rooms WHERE id = ?', roomId);
  if (!room) return;
  if (room.host === account) {
    const next = hub.one('SELECT account FROM room_members WHERE room = ? ORDER BY joined LIMIT 1', roomId);
    if (!next) {
      deleteRoom(hub, roomId, 'leer');
      return;
    }
    const away = online(hub, roomId).has(next.account) ? 0 : now;
    hub.run('UPDATE rooms SET host = ?, host_away = ? WHERE id = ?', next.account, away, roomId);
  }
  announceMembers(hub, roomId);
}

function leaveCurrent(hub, account, now) {
  const room = memberRoom(hub, account);
  if (room) removeMember(hub, room.id, account, now, CLOSE.left, 'verlassen');
}

export function createRoom(hub, account, extra, now) {
  if (!hub.limit(account, 'room', now)) return TOO_MANY();
  leaveCurrent(hub, account.id, now);
  hub.run('INSERT INTO rooms (id, code_hash, host, created, host_away, state) VALUES (?, ?, ?, ?, ?, NULL)', extra.roomId, extra.codeHash, account.id, now, now);
  hub.run('INSERT INTO room_members (room, account, joined, seen) VALUES (?, ?, ?, ?)', extra.roomId, account.id, now, now);
  const room = hub.one('SELECT * FROM rooms WHERE id = ?', extra.roomId);
  return json({ room: snapshot(hub, room), code: extra.code, now }, 201);
}

export function joinRoom(hub, account, extra, now) {
  if (!hub.limit(account, 'rjoin', now)) return TOO_MANY();
  const gone = () => fail(404, 'code', 'Diesen Raum gibt es nicht (mehr) – der Code ist ungültig oder der Raum ist zu.');
  if (!extra.codeHash) return fail(400, 'code', 'Das ist kein gültiger Raumcode.');
  const room = hub.one('SELECT * FROM rooms WHERE code_hash = ?', extra.codeHash);
  if (!room) return gone();
  if (hub.one('SELECT 1 AS x FROM room_bans WHERE room = ? AND account = ?', room.id, account.id)) {
    return fail(403, 'raus', 'Der Host hat dich aus diesem Raum entfernt.');
  }
  if (hub.blockedEither(account.id, room.host)) return gone();
  if (hub.one('SELECT 1 AS x FROM room_members WHERE room = ? AND account = ?', room.id, account.id)) {
    return json({ room: snapshot(hub, room), already: true, now });
  }
  if (hub.one('SELECT COUNT(*) AS n FROM room_members WHERE room = ?', room.id).n >= proto.LIMITS.roomMembers) {
    return fail(409, 'voll', `Der Raum ist voll (höchstens ${proto.LIMITS.roomMembers}).`);
  }
  leaveCurrent(hub, account.id, now);
  hub.run('INSERT INTO room_members (room, account, joined, seen) VALUES (?, ?, ?, ?)', room.id, account.id, now, now);
  announceMembers(hub, room.id);
  return json({ room: snapshot(hub, hub.one('SELECT * FROM rooms WHERE id = ?', room.id)), now }, 201);
}

export function leaveRoom(hub, account, data, now) {
  const room = memberRoom(hub, account.id);
  if (!room) return NO_ROOM();
  if (!hub.limit(account, 'rleave', now)) return TOO_MANY();
  if (data.close && room.host === account.id) {
    deleteRoom(hub, room.id, 'host');
    return json({ ok: true, closed: true });
  }
  removeMember(hub, room.id, account.id, now, CLOSE.left, 'verlassen');
  return json({ ok: true });
}

export function kickMember(hub, account, data, now) {
  const room = memberRoom(hub, account.id);
  if (!room) return NO_ROOM();
  if (room.host !== account.id) return fail(403, 'nur-host', 'Nur der Host kann Leute aus dem Raum entfernen.');
  const target = String(data.id || '');
  if (!names.validId(target) || target === account.id) return fail(400, 'id', 'Unbekannte Person.');
  if (!hub.limit(account, 'rleave', now)) return TOO_MANY();
  hub.run('INSERT INTO room_bans (room, account) VALUES (?, ?) ON CONFLICT DO NOTHING', room.id, target);
  removeMember(hub, room.id, target, now, CLOSE.kicked, 'raus');
  return json({ ok: true });
}

export function getRoom(hub, account, now) {
  if (!hub.limit(account, 'rget', now)) return TOO_MANY();
  const room = memberRoom(hub, account.id);
  return json({ room: room ? snapshot(hub, room) : null, now });
}

/** GET /v1/room/live (signed like every request) → WebSocket with hibernation. */
export function openLive(hub, account, request, now) {
  if (String(request.headers.get('upgrade') || '').toLowerCase() !== 'websocket') {
    return fail(426, 'websocket', 'Hier geht es nur per WebSocket weiter.');
  }
  const room = memberRoom(hub, account.id);
  if (!room) return NO_ROOM();
  if (!hub.limit(account, 'rlive', now)) return TOO_MANY();
  // One live connection per account: an older one (e.g. after a network change) goes.
  sockets(hub, `a:${account.id}`).forEach((ws) => closeSocket(ws, CLOSE.replaced, 'ersetzt'));
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  hub.ctx.acceptWebSocket(server, [room.id, `a:${account.id}`]);
  server.serializeAttachment({ a: account.id, r: room.id });
  hub.run('UPDATE room_members SET seen = ? WHERE room = ? AND account = ?', now, room.id, account.id);
  if (room.host === account.id) hub.run('UPDATE rooms SET host_away = 0 WHERE id = ?', room.id);
  const fresh = hub.one('SELECT * FROM rooms WHERE id = ?', room.id);
  sendTo(server, { t: 'hello', now, me: account.id, room: snapshot(hub, fresh) });
  broadcast(hub, room.id, { t: 'members', host: fresh.host, members: members(hub, fresh) }, server);
  return new Response(null, { status: 101, webSocket: client });
}

/** A message on a room socket (the hub wraps this in a transaction). */
export function onMessage(hub, ws, raw, now) {
  const { a, r } = attachment(ws);
  const text = typeof raw === 'string' ? raw : '';
  if (!a || !r) return closeSocket(ws, CLOSE.gone, 'unbekannt');
  if (!hub.enabled()) return closeSocket(ws, CLOSE.off, 'aus');
  const room = hub.one('SELECT * FROM rooms WHERE id = ?', r);
  const account = hub.one('SELECT * FROM accounts WHERE id = ?', a);
  if (!room || !account || !hub.one('SELECT 1 AS x FROM room_members WHERE room = ? AND account = ?', r, a)) {
    sendTo(ws, { t: 'closed', reason: 'weg' });
    return closeSocket(ws, CLOSE.gone, 'weg');
  }
  let data = null;
  try {
    data = text.length <= proto.LIMITS.roomMessageMax ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object' || !proto.ROOM_MESSAGES.includes(data.t)) {
    return sendTo(ws, { t: 'error', error: 'nachricht', message: 'Unbekannte Nachricht.' });
  }
  hub.run('UPDATE room_members SET seen = ? WHERE room = ? AND account = ?', now, r, a);
  const tooMany = () => sendTo(ws, { t: 'error', error: 'zu-oft', message: 'Zu viele Nachrichten – bitte kurz warten.' });
  if (data.t === 'time') {
    if (!hub.limit(account, 'rtime', now)) return tooMany();
    return sendTo(ws, { t: 'time', c: Number(data.c) || 0, s: now });
  }
  if (data.t === 'react') {
    if (!proto.EMOJIS.includes(data.emoji)) return sendTo(ws, { t: 'error', error: 'emoji', message: 'Diese Reaktion gibt es nicht.' });
    if (!hub.limit(account, 'rreact', now)) return tooMany();
    return broadcast(hub, r, { t: 'react', from: hub.person(account), emoji: data.emoji, at: now }, ws);
  }
  // state: only the host steers.
  if (room.host !== a) return sendTo(ws, { t: 'error', error: 'nur-host', message: 'Nur der Host steuert den Raum.' });
  const state = proto.cleanRoomState(data, now);
  if (!state) return sendTo(ws, { t: 'error', error: 'ref', message: 'Dieser Zustand lässt sich nicht teilen.' });
  if (!hub.limit(account, 'rstate', now)) return tooMany();
  hub.run('UPDATE rooms SET state = ? WHERE id = ?', JSON.stringify(state), r);
  return broadcast(hub, r, { t: 'state', state, now }, ws);
}

/** A room socket closed: remember when, and tell the others who is online. */
export function onClose(hub, ws, now) {
  const { a, r } = attachment(ws);
  if (!a || !r) return;
  const room = hub.one('SELECT * FROM rooms WHERE id = ?', r);
  if (!room) return;
  hub.run('UPDATE room_members SET seen = ? WHERE room = ? AND account = ?', now, r, a);
  const still = sockets(hub, r).some((other) => other !== ws && attachment(other).a === a);
  if (room.host === a && !still) hub.run('UPDATE rooms SET host_away = ? WHERE id = ?', now, r);
  const others = sockets(hub, r).filter((other) => other !== ws);
  const fresh = hub.one('SELECT * FROM rooms WHERE id = ?', r);
  const list = members(hub, fresh).map((row) => (row.id === a && !still ? Object.assign(row, { online: false }) : row));
  others.forEach((other) => sendTo(other, { t: 'members', host: fresh.host, members: list }));
}

export function closeAll(hub, code, reason) {
  sockets(hub).forEach((ws) => closeSocket(ws, code, reason));
}

export function deleteAccountRooms(hub, account, now) {
  hub.all('SELECT room FROM room_members WHERE account = ?', account).forEach((row) => removeMember(hub, row.room, account, now, CLOSE.gone, 'weg'));
  hub.run('DELETE FROM room_bans WHERE account = ?', account);
  sockets(hub, `a:${account}`).forEach((ws) => closeSocket(ws, CLOSE.gone, 'weg'));
}

/** Every 10 minutes: rooms without host for 30 min, guests away for 30 min, rooms older than 24 h. */
export function cleanupRooms(hub, now, limits = proto.LIMITS) {
  hub.all('SELECT * FROM rooms').forEach((room) => {
    if (now - room.created > limits.roomMaxMs) return deleteRoom(hub, room.id, 'alt');
    const live = online(hub, room.id);
    if (!live.has(room.host)) {
      if (!room.host_away) hub.run('UPDATE rooms SET host_away = ? WHERE id = ?', now, room.id);
      else if (now - room.host_away > limits.roomNoHostMs) return deleteRoom(hub, room.id, 'kein-host');
    }
    hub
      .all('SELECT account, seen FROM room_members WHERE room = ? AND account != ?', room.id, room.host)
      .filter((row) => !live.has(row.account) && now - row.seen > limits.roomAwayMs)
      .forEach((row) => removeMember(hub, room.id, row.account, now, CLOSE.gone, 'weg'));
    return null;
  });
}
