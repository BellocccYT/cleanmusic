/**
 * S2 – groups on the server (docs/PLAN-SOCIAL.md): join per invite code
 * (G1-…, 24 h, several people), a week card per member that updates itself
 * (listening time, plays, top 3 artists – only stored while you are in a
 * group, the last two weeks), and a shared playlist of song references
 * (max. 200; everyone adds, the creator or the adder removes).
 *
 * All functions run synchronously inside the hub's transaction; `hub` gives
 * the SQL helpers and rate limits (src/hub.js).
 */
import names from '../../../lib/social-names.js';
import proto from '../../../lib/social-protocol.js';
import { json, fail, TOO_MANY } from './http.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const GROUP_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, created INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS members (group_id TEXT NOT NULL, account TEXT NOT NULL, joined INTEGER NOT NULL, PRIMARY KEY (group_id, account))',
  'CREATE INDEX IF NOT EXISTS members_account ON members (account)',
  'CREATE TABLE IF NOT EXISTS group_codes (hash TEXT PRIMARY KEY, group_id TEXT NOT NULL, expires INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS group_codes_group ON group_codes (group_id)',
  `CREATE TABLE IF NOT EXISTS weeks (account TEXT NOT NULL, week TEXT NOT NULL, secs INTEGER NOT NULL, plays INTEGER NOT NULL,
    artists TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (account, week))`,
  `CREATE TABLE IF NOT EXISTS group_tracks (rid INTEGER PRIMARY KEY, group_id TEXT NOT NULL, ref TEXT NOT NULL, key TEXT NOT NULL,
    added_by TEXT NOT NULL, at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS group_tracks_group ON group_tracks (group_id, at)',
];

// [limit, limit for accounts younger than 24 h, window in ms]
export const GROUP_RATE = {
  group: [5, 2, DAY],
  gcode: [20, 5, HOUR],
  join: [20, 5, HOUR],
  gleave: [30, 10, HOUR],
  week: [2, 2, MIN],
  track: [60, 20, HOUR],
  groups: [30, 30, MIN],
};

const NO_GROUP = () => fail(404, 'keine-gruppe', 'Diese Gruppe gibt es nicht (mehr) oder du bist kein Mitglied.');

function groupRow(hub, id) {
  return hub.one('SELECT * FROM groups WHERE id = ?', String(id || ''));
}

function isMember(hub, groupId, account) {
  return Boolean(hub.one('SELECT 1 AS x FROM members WHERE group_id = ? AND account = ?', String(groupId || ''), account));
}

function groupCount(hub, account) {
  return hub.one('SELECT COUNT(*) AS n FROM members WHERE account = ?', account).n;
}

function deleteGroup(hub, id) {
  hub.run('DELETE FROM groups WHERE id = ?', id);
  hub.run('DELETE FROM members WHERE group_id = ?', id);
  hub.run('DELETE FROM group_codes WHERE group_id = ?', id);
  hub.run('DELETE FROM group_tracks WHERE group_id = ?', id);
}

// Leaving or being removed: the oldest member takes over; an empty group is deleted.
function removeMember(hub, groupId, account) {
  hub.run('DELETE FROM members WHERE group_id = ? AND account = ?', groupId, account);
  if (!groupCount(hub, account)) hub.run('DELETE FROM weeks WHERE account = ?', account);
  const group = groupRow(hub, groupId);
  if (!group || group.owner !== account) return;
  const next = hub.one('SELECT account FROM members WHERE group_id = ? ORDER BY joined LIMIT 1', groupId);
  if (next) hub.run('UPDATE groups SET owner = ? WHERE id = ?', next.account, groupId);
  else deleteGroup(hub, groupId);
}

export function createGroup(hub, account, data, extra, now) {
  const check = names.checkName(data.name);
  if (!check.ok) return fail(400, 'name', check.reason);
  if (groupCount(hub, account.id) >= proto.LIMITS.groupsPerAccount) {
    return fail(409, 'zu-viele-gruppen', `Du bist schon in ${proto.LIMITS.groupsPerAccount} Gruppen.`);
  }
  if (!hub.limit(account, 'group', now)) return TOO_MANY();
  hub.run('INSERT INTO groups (id, name, owner, created) VALUES (?, ?, ?, ?)', extra.groupId, check.name, account.id, now);
  hub.run('INSERT INTO members (group_id, account, joined) VALUES (?, ?, ?)', extra.groupId, account.id, now);
  return json({ group: { id: extra.groupId, name: check.name } }, 201);
}

export function groupCode(hub, account, data, extra, now, ttl) {
  if (!isMember(hub, data.group, account.id)) return NO_GROUP();
  if (!hub.limit(account, 'gcode', now)) return TOO_MANY();
  const open = hub.all('SELECT hash FROM group_codes WHERE group_id = ? ORDER BY expires DESC', String(data.group));
  open.slice(proto.LIMITS.openCodes - 1).forEach((row) => hub.run('DELETE FROM group_codes WHERE hash = ?', row.hash));
  hub.run('INSERT INTO group_codes (hash, group_id, expires) VALUES (?, ?, ?)', extra.codeHash, String(data.group), now + ttl);
  return json({ code: extra.code, expires: now + ttl }, 201);
}

export function joinGroup(hub, account, extra, now) {
  if (!hub.limit(account, 'join', now)) return TOO_MANY();
  if (!extra.codeHash) return fail(400, 'code', 'Das ist kein gültiger Gruppencode.');
  const row = hub.one('SELECT group_id, expires FROM group_codes WHERE hash = ?', extra.codeHash);
  const group = row && row.expires > now ? groupRow(hub, row.group_id) : null;
  if (!group) return fail(404, 'code', 'Der Gruppencode ist abgelaufen oder ungültig.');
  const info = { id: group.id, name: group.name };
  if (isMember(hub, group.id, account.id)) return json({ group: info, already: true });
  if (groupCount(hub, account.id) >= proto.LIMITS.groupsPerAccount) {
    return fail(409, 'zu-viele-gruppen', `Du bist schon in ${proto.LIMITS.groupsPerAccount} Gruppen.`);
  }
  if (hub.one('SELECT COUNT(*) AS n FROM members WHERE group_id = ?', group.id).n >= proto.LIMITS.groupMembers) {
    return fail(409, 'voll', `Die Gruppe ist voll (höchstens ${proto.LIMITS.groupMembers}).`);
  }
  hub.run('INSERT INTO members (group_id, account, joined) VALUES (?, ?, ?)', group.id, account.id, now);
  return json({ group: info }, 201);
}

export function leaveGroup(hub, account, data, now) {
  if (!isMember(hub, data.group, account.id)) return NO_GROUP();
  if (!hub.limit(account, 'gleave', now)) return TOO_MANY();
  removeMember(hub, String(data.group), account.id);
  return json({ ok: true });
}

export function kickMember(hub, account, data, now) {
  const group = groupRow(hub, data.group);
  if (!group || !isMember(hub, group.id, account.id)) return NO_GROUP();
  if (group.owner !== account.id) return fail(403, 'nur-ersteller', 'Nur wer die Gruppe erstellt hat, kann Mitglieder entfernen.');
  const target = String(data.id || '');
  if (!names.validId(target) || target === account.id) return fail(400, 'id', 'Unbekannte Person.');
  if (!hub.limit(account, 'gleave', now)) return TOO_MANY();
  removeMember(hub, group.id, target);
  return json({ ok: true });
}

export function listGroups(hub, account, now) {
  if (!hub.limit(account, 'groups', now)) return TOO_MANY();
  const week = proto.isoWeek(now);
  const groups = hub
    .all('SELECT g.* FROM groups g JOIN members m ON m.group_id = g.id WHERE m.account = ? ORDER BY g.created', account.id)
    .map((group) => ({
      id: group.id,
      name: group.name,
      owner: group.owner,
      created: group.created,
      members: hub
        .all(
          `SELECT a.id, a.name, m.joined, w.secs, w.plays, w.artists FROM members m JOIN accounts a ON a.id = m.account
           LEFT JOIN weeks w ON w.account = a.id AND w.week = ? WHERE m.group_id = ? ORDER BY m.joined`,
          week, group.id
        )
        .map((row) => ({
          id: row.id,
          tag: names.tagOf(row.id),
          name: row.name,
          week: row.secs == null ? null : { secs: row.secs, plays: row.plays, artists: JSON.parse(row.artists) },
        })),
      tracks: hub
        .all(
          `SELECT t.rid, t.ref, t.at, t.added_by, a.name FROM group_tracks t LEFT JOIN accounts a ON a.id = t.added_by
           WHERE t.group_id = ? ORDER BY t.at DESC LIMIT ?`,
          group.id, proto.LIMITS.groupTracks
        )
        .map((row) => ({ rid: row.rid, ref: JSON.parse(row.ref), at: row.at, by: { id: row.added_by, tag: names.tagOf(row.added_by), name: row.name || 'Unbekannt' } })),
    }));
  return json({ week, groups, now });
}

export function postWeek(hub, account, data, now) {
  const card = proto.cleanWeek(data);
  if (!card || !proto.weekOk(card.week, now)) return fail(400, 'woche', 'Diese Wochenkarte passt nicht zur aktuellen Woche.');
  // Week sums are only kept while you are in a group (data minimisation).
  if (!groupCount(hub, account.id)) return fail(409, 'keine-gruppe', 'Wochenkarten gibt es nur in Gruppen.');
  if (!hub.limit(account, 'week', now)) return TOO_MANY();
  hub.run(
    `INSERT INTO weeks (account, week, secs, plays, artists, at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (account, week) DO UPDATE SET secs = excluded.secs, plays = excluded.plays, artists = excluded.artists, at = excluded.at`,
    account.id, card.week, card.secs, card.plays, JSON.stringify(card.artists), now
  );
  hub.run(
    'DELETE FROM weeks WHERE account = ? AND week NOT IN (SELECT week FROM weeks WHERE account = ? ORDER BY week DESC LIMIT 2)',
    account.id, account.id
  );
  return json({ ok: true, week: card.week });
}

export function addTrack(hub, account, data, now) {
  if (!isMember(hub, data.group, account.id)) return NO_GROUP();
  const ref = proto.cleanRef(data.ref);
  if (!ref) return fail(400, 'ref', 'Dieser Titel lässt sich nicht teilen (lokale Dateien und Radio bleiben bei dir).');
  if (!hub.limit(account, 'track', now)) return TOO_MANY();
  const key = `${ref.src}:${ref.id}:${ref.title.toLowerCase()}:${ref.artist.toLowerCase()}`;
  if (hub.one('SELECT 1 AS x FROM group_tracks WHERE group_id = ? AND key = ?', String(data.group), key)) return json({ ok: true, already: true });
  if (hub.one('SELECT COUNT(*) AS n FROM group_tracks WHERE group_id = ?', String(data.group)).n >= proto.LIMITS.groupTracks) {
    return fail(409, 'voll', `Die Gruppen-Playlist ist voll (höchstens ${proto.LIMITS.groupTracks} Titel).`);
  }
  hub.run('INSERT INTO group_tracks (group_id, ref, key, added_by, at) VALUES (?, ?, ?, ?, ?)', String(data.group), JSON.stringify(ref), key, account.id, now);
  return json({ ok: true }, 201);
}

export function removeTrack(hub, account, data) {
  const group = groupRow(hub, data.group);
  if (!group || !isMember(hub, group.id, account.id)) return NO_GROUP();
  const track = hub.one('SELECT added_by FROM group_tracks WHERE rid = ? AND group_id = ?', Number(data.rid) || 0, group.id);
  if (!track) return fail(404, 'titel', 'Diesen Titel gibt es in der Gruppe nicht mehr.');
  if (group.owner !== account.id && track.added_by !== account.id) {
    return fail(403, 'nur-ersteller', 'Entfernen darf, wer die Gruppe erstellt oder den Titel hinzugefügt hat.');
  }
  hub.run('DELETE FROM group_tracks WHERE rid = ?', Number(data.rid));
  return json({ ok: true });
}

export function deleteAccountGroups(hub, account) {
  hub.all('SELECT group_id FROM members WHERE account = ?', account).forEach((row) => removeMember(hub, row.group_id, account));
  hub.run('DELETE FROM weeks WHERE account = ?', account);
  hub.run('DELETE FROM group_tracks WHERE added_by = ?', account);
}

export function cleanupGroups(hub, now) {
  hub.run('DELETE FROM group_codes WHERE expires < ?', now);
  hub.run('DELETE FROM weeks WHERE week < ?', proto.isoWeek(now - 21 * DAY));
}
