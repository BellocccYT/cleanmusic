'use strict';

/**
 * Unit tests for renderer/core/social.js – client state for Social (Weg B).
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'social.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const S = sandbox.window.CMSocial;
const proto = require('../lib/social-protocol');
assert.ok(S, 'window.CMSocial fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const A = 'K7Q2ABCDEFGHJKMNPQRSTVWX';
const B = 'Z9Z9ABCDEFGHJKMNPQRSTVWX';
const ref = { src: 'deezer', id: '3135553', title: 'One More Time', artist: 'Daft Punk' };

check('local state: off by default, only booleans count', () => {
  assert.deepEqual(plain(S.normalizeState(null)), { enabled: false, showActivity: false, showOnline: false, onlineToasts: true, seenReactions: 0 });
  assert.deepEqual(plain(S.normalizeState({ enabled: 'yes', showActivity: true, showOnline: 1, onlineToasts: false, seenReactions: 5 })), { enabled: false, showActivity: true, showOnline: false, onlineToasts: false, seenReactions: 5 });
});

check('friends payload is cleaned: ids, names, refs, stale activity, unknown emojis', () => {
  const now = 1795500000000;
  const data = S.normalizeFriends({
    now,
    me: { id: A, name: 'Leiser Komet 42', random: true },
    friends: [
      { id: B, name: '  Rob\u202e  ', activity: { ref, playing: true, at: now - 1000 } },
      { id: 'kaputt', name: 'X' },
      { id: 'AAAAABCDEFGHJKMNPQRSTVWX', name: 'Alt', activity: { ref, at: now - 11 * 60 * 1000 } },
      { id: 'BBBBABCDEFGHJKMNPQRSTVWX', name: 'Lokal', activity: { ref: { src: 'local', title: 'C:/a.mp3' }, at: now } },
    ],
    reactions: [{ from: { id: B, name: 'Rob' }, emoji: '🔥', title: 'T', at: now - 5 }, { from: { id: B }, emoji: '💩', at: now }],
    blocked: [{ id: 'CCCCABCDEFGHJKMNPQRSTVWX', name: null }],
  }, now + 2000);
  assert.equal(data.me.tag, 'K7Q2');
  assert.equal(data.me.random, true);
  assert.equal(data.friends.length, 3);
  assert.equal(data.friends[0].name, 'Rob');
  assert.deepEqual(plain(data.friends[0].activity.ref), ref);
  assert.equal(data.friends[1].activity, null, 'älter als 10 Minuten');
  assert.equal(data.friends[2].activity, null, 'lokale Datei');
  assert.equal(data.reactions.length, 1);
  assert.equal(data.blocked[0].name, 'Unbekannt');
  assert.equal(data.skew, -2000);
  assert.equal(S.display(data.friends[0]), 'Rob · Z9Z9');
});

check('"Freunde hören gerade": fresh songs only, newest first; new reactions since last look', () => {
  const now = 1795500000000;
  const friends = [
    { id: A, activity: { ref, at: now - 60000 } },
    { id: B, activity: { ref, at: now - 1000 } },
    { id: 'X', activity: null },
    { id: 'Y', activity: { ref, at: now - 700000 } },
  ];
  assert.deepEqual(plain(S.listening(friends, now).map((f) => f.id)), [B, A]);
  assert.deepEqual(plain(S.newReactions([{ at: 5 }, { at: 9 }], 5).map((r) => r.at)), [9]);
});

check('activity plan: off by default, no local/radio, track change, 15 s gap, heartbeat, clear', () => {
  const now = 1795500000000;
  const key = S.refKey(S.validRef(ref));
  const plan = (input) => plain(S.activityPlan(Object.assign({ enabled: true, show: true, playing: true, ref, last: null, now }, input)));
  assert.equal(plan({ show: false }).action, 'none');
  assert.equal(plan({ enabled: false, last: { key, at: now - 60000 } }).action, 'clear');
  assert.equal(plan({}).action, 'post');
  assert.equal(plan({ last: { key, at: now - 5000 } }).action, 'none', 'nur alle 15 s');
  assert.equal(plan({ last: { key, at: now - 60000 } }).action, 'none', 'gleicher Titel');
  assert.equal(plan({ last: { key, at: now - 6 * 60000 } }).action, 'post', 'Herzschlag');
  assert.equal(plan({ last: { key: 'other', at: now - 20000 } }).action, 'post', 'neuer Titel');
  assert.equal(plan({ ref: null, last: { key, at: now - 20000 } }).action, 'clear', 'lokal/Radio danach');
  assert.equal(plan({ ref: null, last: { key, at: now - 20000, cleared: true } }).action, 'none');
  assert.equal(plan({ playing: false, last: { key, at: now - 20000 } }).action, 'none', 'Pause: verfällt von selbst');
});

check('friend codes and links match the shared protocol', () => {
  const code = 'F1-0123-4567-89AZ';
  assert.equal(S.parseFriendCode(S.friendLink(code)), code);
  assert.equal(S.friendLink(code), proto.friendLink(code));
  for (const text of ['f1 o123 4567 89az', 'cleanmusic://friend?c=F1-0123-4567-89AZ', 'Hi F1-0I23-4567-89AZ!', 'F1-0123-4567', 'F1-0123-4567-89AZQ']) {
    assert.equal(S.parseFriendCode(text), proto.parseFriendCode(text), text);
  }
  assert.deepEqual(plain(S.EMOJIS), proto.EMOJIS);
  assert.deepEqual(plain(S.REPORT_REASONS.map((r) => r.id)), proto.REPORT_REASONS);
  assert.equal(S.ago(1000, 1000 + 3 * 60000), 'vor 3 Min.');
});

check('S2 groups: payload cleaned, rights, ranking with shared places, week card plan', () => {
  const data = S.normalizeGroups({
    week: '2026-W48',
    groups: [
      {
        id: 'G7Q2ABCDEFGHJKMNPQRSTVWX',
        name: ' Die Hörer ',
        owner: A,
        members: [
          { id: A, name: 'Rob', week: { secs: 3600, plays: 9, artists: ['X', 'Y', 'Z', 'W'] } },
          { id: B, name: 'Lena', week: { secs: 3600, plays: 4 } },
          { id: 'CCCCABCDEFGHJKMNPQRSTVWX', name: 'Max', week: null },
          { id: 'kaputt', name: 'X' },
        ],
        tracks: [
          { rid: 1, ref, by: { id: B, name: 'Lena' }, at: 5 },
          { rid: 2, ref: { src: 'local', title: 'C:/a.mp3' }, by: { id: B } },
        ],
      },
      { id: 'kaputt', name: 'X' },
    ],
  }, A);
  assert.equal(data.week, '2026-W48');
  assert.equal(data.groups.length, 1);
  const group = data.groups[0];
  assert.equal(group.name, 'Die Hörer');
  assert.equal(group.isOwner, true);
  assert.equal(group.members.length, 3);
  assert.deepEqual(plain(group.members[0].week.artists), ['X', 'Y', 'Z']);
  assert.equal(group.tracks.length, 1);
  assert.equal(group.tracks[0].mine, false);
  assert.deepEqual(plain(S.groupRanking(group.members).map((row) => [row.name, row.rank])), [['Lena', 1], ['Rob', 1], ['Max', 3]]);
  assert.equal(S.parseGroupCode('F1-0123-4567-89AZ G1-o123-4567-89az'), 'G1-0123-4567-89AZ');
  assert.equal(S.parseGroupCode(S.friendLink('G1-0123-4567-89AZ')), proto.parseGroupCode('G1-0123-4567-89AZ'));
  const now = 1795500000000;
  const card = { week: '2026-W48', secs: 600, plays: 3, artists: [] };
  const plan = (input) => S.weekPlan(Object.assign({ inGroups: true, card, last: null, now }, input));
  assert.equal(plan({ inGroups: false }), false, 'nur in Gruppen');
  assert.equal(plan({}), true, 'erste Karte');
  assert.equal(plan({ last: { week: '2026-W47', secs: 9999, at: now - 1000 } }), true, 'neue Woche');
  assert.equal(plan({ last: { week: '2026-W48', secs: 500, at: now - 11 * 60000 } }), true);
  assert.equal(plan({ last: { week: '2026-W48', secs: 590, at: now - 11 * 60000 } }), false, 'unter 1 Minute mehr');
  assert.equal(plan({ last: { week: '2026-W48', secs: 0, at: now - 60000 } }), false, 'höchstens alle 10 Minuten');
});

check('poll plan: fewer requests (visible only, friends every 30 s/3 min, groups only in a group or every 10 min)', () => {
  const now = 1795500000000;
  const plan = (input) => plain(S.pollPlan(Object.assign({ now, hidden: false, friendsOpen: false, lastFriends: 0, lastGroups: 0, groupCount: 0 }, input)));
  // Never while hidden.
  assert.deepEqual(plan({ hidden: true }), { friends: false, groups: false });
  // Friends view open: at most every 30 s.
  assert.deepEqual(plan({ friendsOpen: true, lastFriends: now - 10000, lastGroups: now, groupCount: 0 }), { friends: false, groups: false });
  assert.deepEqual(plan({ friendsOpen: true, lastFriends: now - S.FRIENDS_OPEN_GAP, lastGroups: now - S.GROUPS_GAP, groupCount: 0 }), { friends: true, groups: true });
  // Otherwise: at most every 3 min.
  assert.deepEqual(plan({ lastFriends: now - 60000, lastGroups: now, groupCount: 0 }), { friends: false, groups: false }, 'unter 3 Minuten');
  assert.deepEqual(plan({ lastFriends: now - S.FRIENDS_IDLE_GAP, lastGroups: now, groupCount: 0 }), { friends: true, groups: false });
  // Groups: while in a group (short poll too), or every 10 min even without one.
  assert.deepEqual(plan({ friendsOpen: true, lastFriends: now - S.FRIENDS_OPEN_GAP, lastGroups: now - 1000, groupCount: 1 }), { friends: true, groups: true }, 'in einer Gruppe immer');
  assert.deepEqual(plan({ lastFriends: now - S.FRIENDS_IDLE_GAP, lastGroups: now - S.GROUPS_GAP, groupCount: 0 }), { friends: true, groups: true }, 'ohne Gruppe alle 10 Minuten');
  // First run: everything was never fetched.
  assert.deepEqual(plan({ lastFriends: 0, lastGroups: 0, groupCount: 0 }), { friends: true, groups: true });
});

check('2.1 requests + online: payload, old servers, sorting, notices once per 30 min, never on start, badge', () => {
  const now = 1795500000000;
  const C = 'CCCCABCDEFGHJKMNPQRSTVWX';
  const data = S.normalizeFriends({
    now,
    me: { id: A, name: 'Ich', showOnline: true },
    friends: [
      { id: B, name: 'Rob', online: true },
      { id: C, name: 'Anna', online: 'ja', activity: { ref, at: now - 1000 } },
      { id: 'DDDDABCDEFGHJKMNPQRSTVWX', name: 'Bert' },
    ],
    requests: [
      { from: { id: C, name: 'Anna' }, at: now - 5000, expires: now + 1000 },
      { from: { id: B, name: 'Rob' }, at: now - 1000, expires: now - 1 },
      { from: { id: 'kaputt' }, at: now },
    ],
    sent: [{ to: { id: B, name: 'Rob' }, at: now - 2000, expires: now + 5000 }],
  }, now);
  assert.equal(data.me.showOnline, true);
  assert.deepEqual(plain(data.features), { requests: true, presence: true });
  assert.deepEqual(plain(data.friends.map((f) => f.online)), [true, false, false], 'nur echtes true');
  assert.deepEqual(plain(data.requests.map((r) => r.from.name)), ['Anna'], 'abgelaufen und kaputt raus');
  assert.equal(data.sent[0].to.id, B);
  const old = S.normalizeFriends({ now, me: { id: A, name: 'Ich' }, friends: [] }, now);
  assert.deepEqual(plain(old.features), { requests: false, presence: false }, 'Server vor 2.1');
  assert.equal(old.me.showOnline, null);
  assert.deepEqual(plain(old.requests), []);
  assert.deepEqual(plain(S.sortFriends(data.friends, now).map((f) => f.name)), ['Anna', 'Rob', 'Bert'], 'hört gerade, online, Rest');
  assert.equal(S.friendStatus(data.friends[1], now), 'listening');
  // Online notices.
  const friends = (online) => [{ id: B, name: 'Rob', tag: 'Z9Z9', online }, { id: C, name: 'Anna', tag: 'CCCC', online: false }];
  const start = S.onlineNotices({ prev: null, friends: friends(true), now, notified: {} });
  assert.deepEqual(plain(start.ids), [], 'nie beim Start');
  const off = S.onlineNotices({ prev: start.seen, friends: friends(false), now: now + 1000, notified: start.notified });
  const on = S.onlineNotices({ prev: off.seen, friends: friends(true), now: now + 2000, notified: off.notified });
  assert.deepEqual(plain(on.ids), [B], 'offline → online');
  const again = S.onlineNotices({ prev: { [B]: false }, friends: friends(true), now: now + 60000, notified: on.notified });
  assert.deepEqual(plain(again.ids), [], 'höchstens einmal in 30 Minuten');
  const later = S.onlineNotices({ prev: { [B]: false }, friends: friends(true), now: now + 2000 + S.ONLINE_NOTICE_GAP, notified: again.notified });
  assert.deepEqual(plain(later.ids), [B]);
  assert.deepEqual(plain(S.onlineNotices({ prev: {}, friends: friends(true), now, notified: {} }).ids), [], 'neuer Freund zählt nicht');
  assert.equal(S.onlineText([{ name: 'Rob', tag: 'Z9Z9' }]), 'Rob · Z9Z9 ist jetzt online');
  assert.equal(S.onlineText([{ name: 'Rob' }, { name: 'Anna' }, { name: 'Bert' }]), '3 Freunde sind jetzt online');
  // New requests and the sidebar badge.
  assert.deepEqual(plain(S.newRequests(null, data.requests)), [], 'nicht beim ersten Laden');
  assert.equal(S.newRequests([], data.requests).length, 1);
  assert.equal(S.newRequests([C], data.requests).length, 0);
  assert.deepEqual(plain(S.navBadge(data.requests, 3)), { text: '1', kind: 'requests', title: '1 offene Freundschaftsanfrage' });
  assert.deepEqual(plain(S.navBadge([], 2)), { text: '2', kind: 'live', title: '2 Freunde hören gerade' });
  assert.equal(S.navBadge([], 0).text, '');
  assert.equal(S.expiresIn(now + 3 * 86400000, now), 'noch 3 Tage');
});

check('S3 rooms: code, snapshot, guest follows (title, pause, seek), host sends, user takes over', () => {
  assert.equal(S.parseRoomCode('Komm in meinen Raum: https://bellocccyt.github.io/cleanmusic/f/#R1-0123-4567-89AZ'), 'R1-0123-4567-89AZ');
  for (const text of ['r1 o123 4567 89az', 'F1-0123-4567-89AZ', 'G1-0123-4567-89AZ R1-AAAA-BBBB-CCCC']) {
    assert.equal(S.parseRoomCode(text), proto.parseRoomCode(text), text);
  }
  assert.equal(S.parseGroupCode('R1-0123-4567-89AZ'), '');
  const room = S.normalizeRoom({
    id: 'RRRRABCDEFGHJKMNPQRSTVWX',
    host: A,
    members: [{ id: A, name: 'Host', online: true }, { id: B, name: 'Gast' }, { id: 'kaputt' }],
    state: { ref, pos: 10, at: 5, playing: true, full: true },
  }, B);
  assert.equal(room.isHost, false);
  assert.deepEqual(plain(room.members.map((m) => [m.name, m.host, m.online, m.self])), [['Host', true, true, false], ['Gast', false, false, true]]);
  assert.equal(S.roomState({ ref: { src: 'local', title: 'x' } }), null);
  assert.equal(S.roomState({ ref: null, playing: true }).playing, false);

  const key = S.refKey(S.validRef(ref));
  const now = 1795500000000;
  const state = { ref, pos: 60, at: now - 2000, playing: true, full: true };
  assert.equal(S.expectedPosition(state, now), 62);
  const plan = (local, extra) => plain(S.roomSyncPlan(Object.assign({ state, now, clock: 50000, lastSeekAt: 0, local: Object.assign({ key, position: 62, playing: true, full: true, duration: 300 }, local) }, extra)));
  assert.equal(plan({}).action, 'none', 'synchron');
  assert.deepEqual(plan({ key: 'anderer' }), { action: 'load', position: 62, reason: 'titel' });
  assert.equal(plan({ loading: true, key: 'anderer' }).action, 'none');
  assert.deepEqual(plan({ position: 58 }), { action: 'seek', position: 62.25, reason: 'spulen' });
  assert.equal(plan({ position: 62.8 }).action, 'none', 'unter 1 s');
  assert.equal(plan({ position: 58 }, { lastSeekAt: 48000 }).action, 'none', 'nach dem Spulen kurz warten');
  assert.deepEqual(plan({ playing: false }), { action: 'play', position: null, reason: 'play' });
  assert.deepEqual(plan({ playing: false, position: 0 }), { action: 'play', position: 62.25, reason: 'play' });
  // Preview against a full title: only title and play/pause follow.
  assert.equal(plan({ full: false, position: 5, duration: 30 }).action, 'none');
  assert.equal(plan({ full: false, playing: false, ended: true, position: 30, duration: 30 }).action, 'none', 'Vorschau vorbei: warten');
  // Host paused (and jumped back).
  const paused = Object.assign({}, state, { playing: false, pos: 20 });
  assert.deepEqual(plain(S.roomSyncPlan({ state: paused, now, clock: 50000, local: { key, position: 62, playing: true, full: true } })), { action: 'pause', position: 20, reason: 'pause' });
  assert.equal(S.roomSyncPlan({ state: paused, now, clock: 50000, local: { key, position: 20.5, playing: false, full: true } }).action, 'none');
  // Host plays something unshareable (local file, radio).
  assert.equal(S.roomSyncPlan({ state: { ref: null, pos: 0, at: now, playing: false }, now, local: { key, playing: true } }).action, 'pause');
  assert.equal(plan({ position: 299.9 }, { state: Object.assign({}, state, { pos: 299.8 }) }).action, 'none', 'Ende');

  // Host: start, track change, pause, seek, heartbeat, gap.
  const host = (input) => plain(S.roomHostPlan(Object.assign({ key, position: 10, playing: true, full: true, clock: 100000, last: { key, pos: 0, playing: true, full: true, at: 90000 } }, input)));
  assert.equal(host({ last: null }).reason, 'start');
  assert.equal(host({}).send, false, '10 s gespielt = erwartet');
  assert.equal(host({ key: 'neu' }).reason, 'titel');
  assert.equal(host({ playing: false }).reason, 'pause');
  assert.equal(host({ position: 40 }).reason, 'spulen');
  assert.equal(host({ position: 30, last: { key, pos: 0, playing: true, full: true, at: 70000 } }).reason, 'herzschlag');
  assert.equal(host({ key: 'neu', last: { key, pos: 0, playing: true, full: true, at: 99800 } }).send, false, 'höchstens alle 0,4 s');
  assert.equal(host({ full: false }).reason, 'quelle');

  // The user takes over: own pause/play/seek – but not the end of a title or our own seek.
  const input = { state, now, local: { key, position: 62, playing: false, full: true } };
  assert.equal(S.roomDeviation('pause', input), true);
  assert.equal(S.roomDeviation('pause', { state, now, local: { key, ended: true } }), false);
  assert.equal(S.roomDeviation('play', { state: paused, now, local: { key } }), true);
  assert.equal(S.roomDeviation('play', input), false);
  assert.equal(S.roomDeviation('seeked', { state, now, local: { key, position: 120, full: true } }), true);
  assert.equal(S.roomDeviation('seeked', { state, now, local: { key, position: 62.4, full: true } }), false);

  assert.deepEqual(plain(S.normalizeRoomLocal({ code: 'R1-0123-4567-89AZ', room: 'RRRRABCDEFGHJKMNPQRSTVWX', at: 5 })), { code: 'R1-0123-4567-89AZ', room: 'RRRRABCDEFGHJKMNPQRSTVWX', at: 5 });
  assert.deepEqual(plain(S.normalizeRoomLocal({ code: '<x>', room: 'R' })), { code: '', room: '', at: 0 });
});

check('2.1.1 cards: cover source without the server, safe image URLs, careful search pick, fresh keys', () => {
  assert.deepEqual(plain(S.coverSource(ref)), { type: 'link', url: 'https://www.deezer.com/track/3135553' });
  assert.deepEqual(plain(S.coverSource({ src: 'apple', id: '1440818839', title: 'X' })), { type: 'link', url: 'https://music.apple.com/song/1440818839' });
  assert.deepEqual(plain(S.coverSource({ src: 'youtube', id: 'dQw4w9WgXcQ', title: 'X' })), { type: 'image', url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg' });
  assert.deepEqual(plain(S.coverSource({ src: 'search', title: 'Numb', artist: 'Linkin Park' })), { type: 'search', query: 'Linkin Park Numb' });
  assert.equal(S.coverSource({ src: 'youtube', id: 'x"><img', title: 'X' }), null, 'nur gültige IDs');
  assert.equal(S.coverSource({ src: 'local', title: 'C:/a.mp3' }), null);
  assert.equal(S.safeImage('https://is1.mzstatic.com/a/100x100bb.jpg'), 'https://is1.mzstatic.com/a/300x300bb.jpg');
  for (const bad of ['http://x.test/a.jpg', 'https://x.test/a".jpg', 'javascript:alert(1)', 'https://x.test/a b.jpg', '']) assert.equal(S.safeImage(bad), '', bad);
  const tracks = [
    { title: 'Numb (Live)', artist: 'Someone Else', artwork: 'https://x.test/wrong.jpg' },
    { title: 'Numb', artist: 'Linkin Park', artwork: 'https://x.test/numb.jpg' },
  ];
  assert.equal(S.pickCover(tracks, { title: 'Numb', artist: 'Linkin Park' }), 'https://x.test/numb.jpg');
  assert.equal(S.pickCover([{ title: 'Faint', artist: 'Linkin Park', artwork: 'https://x.test/f.jpg' }], { title: 'Numb', artist: 'Linkin Park' }), '', 'falscher Titel = kein Cover');
  assert.equal(S.pickCover([{ title: 'Numb', artist: 'Linkin Park', artwork: 'http://x.test/n.jpg' }], { title: 'Numb' }), '', 'nur https');
  assert.match(S.coverId(ref), /^c[0-9a-z]+$/);
  assert.equal(S.coverId(ref), S.coverId(Object.assign({}, ref)));
  assert.notEqual(S.coverId(ref), S.coverId(Object.assign({}, ref, { title: 'Other' })));
  const friend = { id: A, activity: { ref } };
  assert.equal(S.cardKey(friend), `${A}|deezer:3135553:one more time`);
  assert.equal(S.cardKey({ id: B, activity: null }), '');
  assert.deepEqual(plain(S.freshKeys(null, ['a', 'b'])), ['a', 'b'], 'erstes Zeichnen: alles neu');
  assert.deepEqual(plain(S.freshKeys(new Set(['a']), ['a', 'b'])), ['b']);
  assert.deepEqual(plain(S.freshKeys(['a', 'b'], ['a', 'b'])), []);
});

console.log(`\n${checks} passed, 0 failed`);
