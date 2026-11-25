/**
 * 2.1 – "Mir online zeigen" (docs/PLAN-SOCIAL.md, „Online-Status“).
 *
 * Opt-in and data-saving: a row in `presence` exists only while the switch
 * is on. It holds one coarse timestamp (rounded down to the minute) of the
 * last signed request; after the online window (6 min) the housekeeping
 * sets it back to 0. Friends only learn "online: true/false" – no "last
 * seen", and a switched-off account looks exactly like an offline one.
 * No extra requests: the existing poll (GET /v1/friends) and the activity
 * heartbeat keep it fresh.
 */
import { json, fail, TOO_MANY } from './http.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const PRESENCE_SCHEMA = ['CREATE TABLE IF NOT EXISTS presence (id TEXT PRIMARY KEY, at INTEGER NOT NULL)'];

// [limit, limit for accounts younger than 24 h, window in ms]
export const PRESENCE_RATE = {
  presence: [30, 30, HOUR],
};

// Rounded down to the minute (tests with a tiny online window round finer).
const coarse = (hub, now) => {
  const step = Math.max(1, Math.min(MIN, Math.floor(hub.limits.onlineTtlMs / 6)));
  return Math.floor(now / step) * step;
};

export function setPresence(hub, account, data, now) {
  if (typeof data.show !== 'boolean') return fail(400, 'presence', 'Bitte „an“ oder „aus“ wählen.');
  if (!hub.limit(account, 'presence', now)) return TOO_MANY();
  if (data.show) {
    hub.run('INSERT INTO presence (id, at) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET at = excluded.at', account.id, coarse(hub, now));
  } else {
    hub.run('DELETE FROM presence WHERE id = ?', account.id);
  }
  return json({ ok: true, showOnline: data.show });
}

/** Every signed request while the switch is on: at most one write per minute. */
export function touchPresence(hub, id, now) {
  const at = coarse(hub, now);
  hub.run('UPDATE presence SET at = ? WHERE id = ? AND at < ?', at, id, at);
}

export function showsOnline(hub, id) {
  return Boolean(hub.one('SELECT 1 AS x FROM presence WHERE id = ?', id));
}

export function deletePresence(hub, id) {
  hub.run('DELETE FROM presence WHERE id = ?', id);
}

export function cleanupPresence(hub, now, ttl) {
  hub.run('UPDATE presence SET at = 0 WHERE at > 0 AND at < ?', now - ttl);
}
