'use strict';

/**
 * Unit tests for renderer/core/group.js – week cards and group ranking.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'group.js');
const sandbox = { window: {}, TextEncoder, TextDecoder, btoa, atob };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const G = sandbox.window.CMGroup;
assert.ok(G, 'window.CMGroup fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('ISO week keys (Monday start, year boundaries)', () => {
  assert.equal(G.weekKey(new Date(2026, 10, 24)), '2026-W48');
  assert.equal(G.weekKey(new Date(2026, 10, 23)), '2026-W48', 'Montag');
  assert.equal(G.weekKey(new Date(2026, 10, 22)), '2026-W47', 'Sonntag gehört zur Vorwoche');
  assert.equal(G.weekKey(new Date(2021, 0, 3)), '2020-W53');
  assert.equal(G.weekKey(new Date(2024, 11, 30)), '2025-W01');
});

check('encode → decode round trip, also inside a chat message', () => {
  const card = { name: 'Rob', week: '2026-W48', secs: 22371, plays: 81, artists: ['Kevin MacLeod', 'Ñandú', '日本'], at: 1795500000000 };
  const code = G.encode(card);
  assert.match(code, /^CM1-[A-Za-z0-9_-]+-[0-9a-z]+$/);
  const direct = G.decode(code);
  assert.deepEqual(plain(direct.card), card);
  const chat = `🎧 Meine Woche in CleanMusic: 6 h 12 min\n${code}\nschlag mich!`;
  assert.deepEqual(plain(G.decode(chat).card), card);
});

check('typos and junk are rejected with a readable message', () => {
  const code = G.encode({ name: 'Rob', week: '2026-W48', secs: 60 });
  const broken = code.slice(0, 10) + (code[10] === 'A' ? 'B' : 'A') + code.slice(11);
  assert.match(G.decode(broken).error, /vertippt|beschädigt/);
  assert.match(G.decode('hallo').error, /Kein CleanMusic-Wochencode/);
  assert.match(G.decode(code.slice(0, -1) + (code.endsWith('0') ? '1' : '0')).error, /vertippt/);
});

check('cards are cleaned: names, limits, no HTML', () => {
  const card = plain(G.normalizeCard({ name: '  <b>Ali</b>\n  ', week: '2026-W48', secs: 1e12, plays: -5, artists: ['a', '', 'b', 'c', 'd'] }));
  assert.equal(card.name, 'bAli/b');
  assert.equal(card.secs, 7 * 24 * 3600);
  assert.equal(card.plays, 0);
  assert.deepEqual(card.artists, ['a', 'b', 'c']);
  assert.throws(() => G.encode({ name: '', week: '2026-W48' }));
  assert.equal(G.normalizeCard({ name: 'x', week: '48' }).week, '');
});

check('members: newer card wins, older is ignored, names are case-insensitive', () => {
  let group = { name: 'Rob', members: {} };
  ({ group } = G.addMember(group, { name: 'Lena', week: '2026-W47', secs: 100, at: 1 }));
  const newer = G.addMember(group, { name: 'lena', week: '2026-W48', secs: 50, at: 2 });
  assert.equal(newer.added, true);
  assert.equal(newer.updated, true);
  const older = G.addMember(newer.group, { name: 'LENA', week: '2026-W47', secs: 999, at: 3 });
  assert.equal(older.added, false);
  assert.equal(Object.keys(older.group.members).length, 1);
  assert.equal(older.group.members.lena.secs, 50);
});

check('group keeps at most MEMBERS_MAX people', () => {
  let group = {};
  for (let index = 0; index < G.MEMBERS_MAX + 5; index += 1) {
    ({ group } = G.addMember(group, { name: `P${index}`, week: '2026-W48', secs: index, at: index + 1 }));
  }
  assert.equal(Object.keys(group.members).length, G.MEMBERS_MAX);
  assert.ok(group.members.p34, 'die neuesten bleiben');
});

check('ranking: this week only, own card once, shared ranks on ties', () => {
  const group = {
    members: {
      lena: { name: 'Lena', week: '2026-W48', secs: 5000, plays: 20 },
      tom: { name: 'Tom', week: '2026-W48', secs: 3000, plays: 9 },
      alt: { name: 'Alt', week: '2026-W47', secs: 99999, plays: 1 },
      me: { name: 'Rob', week: '2026-W48', secs: 1, plays: 1 },
      kim: { name: 'Kim', week: '2026-W48', secs: 3000, plays: 9 },
    },
  };
  const rows = plain(G.ranking(group, { name: 'Rob', week: '2026-W48', secs: 4000, plays: 10 }, '2026-W48'));
  assert.deepEqual(rows.map((row) => row.name), ['Lena', 'Rob', 'Kim', 'Tom']);
  assert.deepEqual(rows.map((row) => row.rank), [1, 2, 3, 3]);
  assert.equal(rows.find((row) => row.self).secs, 4000, 'eigene Karte ersetzt alte Kopie von mir');
  assert.equal(rows.some((row) => row.name === 'Alt'), false);
});

console.log(`${checks} passed, 0 failed`);
