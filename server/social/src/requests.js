/**
 * 2.1 – friend requests (docs/PLAN-SOCIAL.md, „Freundschaftsanfragen“).
 *
 * A friend code made by a 2.1 client carries the flag `requests: true`
 * (column codes.ask). Redeeming such a code no longer makes both friends at
 * once: it leaves a request that the code owner accepts or declines.
 *
 * Compatibility with the 2.0.x clients that are live:
 * - Codes without the flag (every 2.0.x code) keep the instant behaviour, so
 *   a 2.0.x user never has to answer a request they cannot see – only the
 *   owner of an ask-code (always a 2.1 client) receives requests.
 * - A 2.0.x client that redeems an ask-code does not know "pending"; it gets
 *   a 409 with a readable message ("Anfrage gesendet …"), which 2.0.x shows
 *   as a toast. 2.1 clients send `requests: true` and get 202 + `pending`.
 *
 * Requests expire after 7 days, at most 20 wait per direction. A decline is
 * silent: the sender keeps seeing "wartet" until the request expires.
 * Blocking deletes the requests of both sides; deleting the account too.
 *
 * All functions run synchronously inside the hub's transaction (src/hub.js).
 */
import names from '../../../lib/social-names.js';
import { json, fail, TOO_MANY } from './http.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const REQUEST_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS requests (from_id TEXT NOT NULL, to_id TEXT NOT NULL, at INTEGER NOT NULL, expires INTEGER NOT NULL,
    declined INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (from_id, to_id))`,
  'CREATE INDEX IF NOT EXISTS requests_to ON requests (to_id, expires)',
];

// [limit, limit for accounts younger than 24 h, window in ms]
export const REQUEST_RATE = {
  answer: [60, 20, HOUR], // accept, decline, withdraw
};

/** Additive column on the S1 table `codes` (also for existing databases). */
export function migrateRequests(hub) {
  const columns = hub.all('PRAGMA table_info(codes)').map((row) => row.name);
  if (!columns.includes('ask')) hub.run('ALTER TABLE codes ADD COLUMN ask INTEGER NOT NULL DEFAULT 0');
}

/** Both directions gone (friendship made, block, account deleted). */
export function forgetRequests(hub, a, b) {
  hub.run('DELETE FROM requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)', a, b, b, a);
}

/** An open request from `from` to `to` (for reports: you may report who asks you). */
export function hasRequest(hub, from, to, now) {
  return Boolean(hub.one('SELECT 1 AS x FROM requests WHERE from_id = ? AND to_id = ? AND expires > ?', from, to, now));
}

function openCount(hub, column, id, now) {
  const extra = column === 'to_id' ? ' AND declined = 0' : '';
  return hub.one(`SELECT COUNT(*) AS n FROM requests WHERE ${column} = ? AND expires > ?${extra}`, id, now).n;
}

/**
 * Called by the hub's redeem after the code, block and "already friends"
 * checks. Returns a response when the code asks first, or null for the old
 * instant friendship (codes without the flag, or the owner already asked you).
 */
export function redeemAsRequest(hub, account, other, code, data, now) {
  // The owner already sent you a request (or you declined one): redeeming
  // their code says yes – friends right away.
  if (hub.one('SELECT 1 AS x FROM requests WHERE from_id = ? AND to_id = ? AND expires > ?', other.id, account.id, now)) return null;
  if (!code.ask) return null;
  const max = hub.limits.openRequests;
  if (openCount(hub, 'to_id', other.id, now) >= max) {
    return fail(409, 'voll', `Bei ${other.name} warten schon zu viele Anfragen – bitte später noch einmal.`);
  }
  if (openCount(hub, 'from_id', account.id, now) >= max) {
    return fail(409, 'voll', `Du hast schon ${max} offene Anfragen – warte, bis sie angenommen werden oder ablaufen.`);
  }
  const expires = now + hub.limits.requestTtlMs;
  hub.run(
    `INSERT INTO requests (from_id, to_id, at, expires, declined) VALUES (?, ?, ?, ?, 0)
     ON CONFLICT (from_id, to_id) DO UPDATE SET at = excluded.at, expires = excluded.expires, declined = 0`,
    account.id, other.id, now, expires
  );
  hub.run('DELETE FROM codes WHERE hash = ?', code.hash);
  if (data.requests === true) return json({ friend: hub.person(other), pending: true, expires }, 202);
  // 2.0.x clients: no "pending" – a message they show as a toast.
  return fail(409, 'anfrage-gesendet', `Anfrage an ${other.name} · ${names.tagOf(other.id)} gesendet – sobald die Person annimmt, seid ihr Freunde.`);
}

export function acceptRequest(hub, account, data, now) {
  const id = String(data.id || '');
  if (!names.validId(id)) return fail(400, 'id', 'Unbekannte Person.');
  if (!hub.limit(account, 'answer', now)) return TOO_MANY();
  const row = hub.one('SELECT 1 AS x FROM requests WHERE from_id = ? AND to_id = ? AND expires > ? AND declined = 0', id, account.id, now);
  const gone = () => fail(404, 'anfrage', 'Diese Anfrage gibt es nicht mehr.');
  if (!row) return gone();
  const other = hub.one('SELECT * FROM accounts WHERE id = ?', id);
  if (!other || hub.blockedEither(account.id, id)) {
    forgetRequests(hub, account.id, id);
    return gone();
  }
  if (hub.isFriend(account.id, id)) {
    forgetRequests(hub, account.id, id);
    return json({ friend: hub.person(other), already: true });
  }
  const limit = hub.limits.friends;
  if (hub.friendCount(account.id) >= limit || hub.friendCount(id) >= limit) {
    return fail(409, 'voll', `Eine der beiden Freundeslisten ist voll (höchstens ${limit}).`);
  }
  hub.befriend(account.id, id, now);
  return json({ friend: hub.person(other) }, 201);
}

/** Decline (silent, hidden from you) or – with `withdraw` – take back your own request. */
export function declineRequest(hub, account, data, now) {
  const id = String(data.id || '');
  if (!names.validId(id) || id === account.id) return fail(400, 'id', 'Unbekannte Person.');
  if (!hub.limit(account, 'answer', now)) return TOO_MANY();
  if (data.withdraw === true) {
    return json({ ok: true, withdrawn: hub.run('DELETE FROM requests WHERE from_id = ? AND to_id = ?', account.id, id) > 0 });
  }
  const changed = hub.run('UPDATE requests SET declined = 1 WHERE from_id = ? AND to_id = ? AND declined = 0', id, account.id);
  return json({ ok: true, declined: changed > 0 });
}

/** For GET /v1/friends: requests to you (not declined) and the ones you sent (declined ones still "wait"). */
export function listRequests(hub, account, now) {
  const requests = hub
    .all(
      `SELECT r.from_id AS id, a.name, r.at, r.expires FROM requests r JOIN accounts a ON a.id = r.from_id
       WHERE r.to_id = ? AND r.expires > ? AND r.declined = 0 ORDER BY r.at DESC LIMIT 50`,
      account.id, now
    )
    .map((row) => ({ from: hub.person(row), at: row.at, expires: row.expires }));
  const sent = hub
    .all(
      `SELECT r.to_id AS id, a.name, r.at, r.expires FROM requests r JOIN accounts a ON a.id = r.to_id
       WHERE r.from_id = ? AND r.expires > ? ORDER BY r.at DESC LIMIT 50`,
      account.id, now
    )
    .map((row) => ({ to: hub.person(row), at: row.at, expires: row.expires }));
  return { requests, sent };
}

export function deleteAccountRequests(hub, id) {
  hub.run('DELETE FROM requests WHERE from_id = ? OR to_id = ?', id, id);
}

export function cleanupRequests(hub, now) {
  hub.run('DELETE FROM requests WHERE expires < ?', now);
}
