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
  assert.deepEqual(plain(S.normalizeState(null)), { enabled: false, showActivity: false, seenReactions: 0 });
  assert.deepEqual(plain(S.normalizeState({ enabled: 'yes', showActivity: true, seenReactions: 5 })), { enabled: false, showActivity: true, seenReactions: 5 });
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

console.log(`\n${checks} passed, 0 failed`);
