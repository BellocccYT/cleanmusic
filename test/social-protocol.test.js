'use strict';

/**
 * Unit tests for lib/social-protocol.js – endpoints, signed text, proof-of-work,
 * friend codes, song references and the server address.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const P = require('../lib/social-protocol');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('only listed endpoints are allowed', () => {
  assert.ok(P.isEndpoint('GET', '/v1/friends'));
  assert.ok(P.isEndpoint('DELETE', '/v1/account'));
  assert.equal(P.isEndpoint('GET', '/v1/account'), false);
  assert.equal(P.isEndpoint('POST', '/v1/admin/ban'), false);
  assert.equal(P.isEndpoint('POST', '/v1/friends/../admin'), false);
});

check('a Node ECDSA signature over the canonical text verifies (P-256, IEEE P1363)', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  const key = P.toBase64Url(raw);
  assert.ok(P.validPublicKey(key), key);
  const body = '{"name":"Rob"}';
  const hash = P.toBase64Url(crypto.createHash('sha256').update(body).digest());
  const text = P.canonical('post', '/v1/name', 1795500000000, 'abcdefghijklmnop', hash);
  assert.equal(text.split('\n')[0], 'CM-SOCIAL-1');
  assert.equal(text.split('\n')[1], 'POST');
  const sig = crypto.sign('sha256', Buffer.from(text), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  assert.ok(P.validSignature(P.toBase64Url(sig)));
  assert.ok(crypto.verify('sha256', Buffer.from(text), { key: publicKey, dsaEncoding: 'ieee-p1363' }, sig));
  assert.deepEqual(Buffer.from(P.fromBase64Url(P.toBase64Url(raw))), raw);
  assert.throws(() => P.fromBase64Url('a+b/'));
});

check('time window ±5 minutes and nonce format', () => {
  const now = 1795500000000;
  assert.ok(P.timeOk(now - 299000, now));
  assert.equal(P.timeOk(now - 301000, now), false);
  assert.equal(P.timeOk('1.5', now), false);
  assert.ok(P.validNonce('A'.repeat(22)));
  assert.equal(P.validNonce('kurz'), false);
});

check('proof-of-work: leading zero bits, day stamp', () => {
  assert.equal(P.leadingZeroBits(new Uint8Array([0, 0, 0x10, 0xff])), 19);
  assert.equal(P.leadingZeroBits(new Uint8Array([0x80])), 0);
  assert.equal(P.leadingZeroBits(new Uint8Array([0, 1])), 15);
  const now = Date.UTC(2026, 10, 25, 0, 30);
  assert.equal(P.powDay(now), '2026-11-25');
  assert.ok(P.powDayOk('2026-11-24', now));
  assert.equal(P.powDayOk('2026-11-23', now), false);
  let counter = 0;
  const input = (n) => crypto.createHash('sha256').update(P.powInput('ID', '2026-11-25', n)).digest();
  while (P.leadingZeroBits(input(counter)) < 8) counter += 1;
  assert.ok(P.leadingZeroBits(input(counter)) >= 8);
});

check('friend codes: format, parsing from links and chat, typo-tolerant', () => {
  const code = P.friendCodeFrom(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 31]));
  assert.equal(code, 'F1-0123-4567-89AZ');
  assert.match(code, P.FRIEND_CODE_RE);
  assert.equal(P.parseFriendCode(`hey, add me: ${P.friendLink(code)} !`), code);
  assert.equal(P.parseFriendCode('cleanmusic://friend?c=F1-0123-4567-89AZ'), code);
  assert.equal(P.parseFriendCode('f1 o123 4567 89az'), code);
  assert.equal(P.parseFriendCode('F1-0123-4567'), '');
  assert.equal(P.parseFriendCode('F1-0123-4567-89AZX'), '');
  assert.equal(P.friendLink(code), 'https://bellocccyt.github.io/cleanmusic/f/#F1-0123-4567-89AZ');
});

check('song references: same rules as share links, no local files or radio', () => {
  assert.deepEqual(P.cleanRef({ src: 'deezer', id: '3135553', title: ' One  More Time ', artist: 'Daft Punk' }), {
    src: 'deezer', id: '3135553', title: 'One More Time', artist: 'Daft Punk',
  });
  assert.equal(P.cleanRef({ src: 'deezer', id: 'x1', title: 'T' }), null);
  assert.equal(P.cleanRef({ src: 'local', id: '', title: 'C:/Musik/a.mp3' }), null);
  assert.equal(P.cleanRef({ src: 'youtube', id: 'short', title: 'T' }), null);
  assert.equal(P.cleanRef({ src: 'search', id: 'egal', title: '' }), null);
  assert.equal(P.cleanRef({ src: 'search', id: 'egal', title: 'T\u202eX' }).id, '');
  assert.equal(P.cleanRef({ src: 'apple', id: '1', title: 'x'.repeat(200) }).title.length, 80);
});

check('server address: https only, http just for local tests', () => {
  assert.equal(P.normalizeServer('https://cleanmusic-social.example.workers.dev/'), 'https://cleanmusic-social.example.workers.dev');
  assert.equal(P.normalizeServer('http://127.0.0.1:8787'), 'http://127.0.0.1:8787');
  assert.equal(P.normalizeServer('http://localhost:8787/'), 'http://localhost:8787');
  assert.equal(P.normalizeServer('http://example.com'), '');
  assert.equal(P.normalizeServer('http://127.0.0.1'), '');
  assert.equal(P.normalizeServer('https://user:pw@example.com'), '');
  assert.equal(P.normalizeServer('https://example.com/pfad'), '');
  assert.equal(P.normalizeServer('https://intranet'), '');
  assert.equal(P.normalizeServer('ftp://example.com'), '');
  assert.equal(P.normalizeServer(''), '');
});

check('S2: group codes, ISO weeks (same as CMGroup) and week cards', () => {
  const code = P.groupCodeFrom(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 31]));
  assert.equal(code, 'G1-0123-4567-89AZ');
  assert.equal(P.parseGroupCode(`Gruppe: ${P.friendLink(code)}`), code);
  assert.equal(P.parseFriendCode(code), '', 'Gruppencode ist kein Freundescode');
  assert.equal(P.parseGroupCode('F1-0123-4567-89AZ'), '');
  assert.equal(P.parseFriendCode('G1-0123-4567-89AZ F1-AAAA-BBBB-CCCC'), 'F1-AAAA-BBBB-CCCC');
  assert.equal(P.isoWeek(Date.UTC(2026, 10, 24)), '2026-W48');
  assert.equal(P.isoWeek(Date.UTC(2026, 10, 22)), '2026-W47');
  assert.equal(P.isoWeek(Date.UTC(2021, 0, 3)), '2020-W53');
  assert.equal(P.isoWeek(Date.UTC(2024, 11, 30)), '2025-W01');
  const now = Date.UTC(2026, 10, 25, 12);
  assert.ok(P.weekOk('2026-W48', now) && P.weekOk('2026-W47', now));
  assert.equal(P.weekOk('2026-W45', now), false);
  assert.deepEqual(P.cleanWeek({ week: '2026-W48', secs: 1e9, plays: -2, artists: ['A', '', ' B ', 'C', 'D'] }), {
    week: '2026-W48', secs: 604800, plays: 0, artists: ['A', 'B', 'C'],
  });
  assert.equal(P.cleanWeek({ week: '48' }), null);
  assert.ok(P.isEndpoint('GET', '/v1/groups') && P.isEndpoint('POST', '/v1/group/track/remove'));
});

console.log(`\n${checks} passed, 0 failed`);
