/**
 * Worker tests: the real Worker + Durable Object (SQLite) in Miniflare,
 * bundled with esbuild exactly like `wrangler deploy` does. No Cloudflare
 * account needed. Run: npm test (in server/social).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const require = createRequire(import.meta.url);
const proto = require('../../../lib/social-protocol.js');
const names = require('../../../lib/social-names.js');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADMIN = 'a'.repeat(40);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let mf;
let ipCounter = 0;

before(async () => {
  const outfile = path.join(root, '.test-dist', 'worker.mjs');
  await build({
    entryPoints: [path.join(root, 'src', 'index.js')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    external: ['cloudflare:workers'],
    outfile,
    logLevel: 'error',
  });
  // Miniflare 5 (bundled with wrangler 4.158) still accepts the v4 option shape via this helper.
  mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    scriptPath: outfile,
    compatibilityDate: '2026-11-01',
    durableObjects: { HUB: { className: 'SocialHub', useSQLite: true } },
    bindings: {
      LOCAL_DEV: 'true',
      POW_BITS: '8',
      ADMIN_TOKEN: ADMIN,
      TEST_LIMITS: JSON.stringify({ friends: 3, activityTtlMs: 2500, codeTtlMs: 4000, accountsPerIp: 2 }),
    },
  }));
  await mf.ready;
});

after(async () => {
  if (mf) await mf.dispose();
});

function client(ip) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  const id = names.accountIdFromDigest(crypto.createHash('sha256').update(raw).digest());
  ipCounter += 1;
  return { privateKey, key: proto.toBase64Url(raw), id, ip: ip || `198.51.${ipCounter}.7` };
}

function signedHeaders(who, method, pathname, body, options = {}) {
  const time = options.time || Date.now();
  const nonce = options.nonce || proto.toBase64Url(crypto.randomBytes(16));
  const hash = proto.toBase64Url(crypto.createHash('sha256').update(body).digest());
  const text = proto.canonical(method, pathname, time, nonce, hash);
  const sig = crypto.sign('sha256', Buffer.from(text), { key: who.privateKey, dsaEncoding: 'ieee-p1363' });
  return {
    'content-type': 'application/json',
    'cf-connecting-ip': who.ip,
    'cm-key': who.key,
    'cm-time': String(time),
    'cm-nonce': nonce,
    'cm-sig': options.badSig ? proto.toBase64Url(Buffer.alloc(64, 1)) : proto.toBase64Url(sig),
  };
}

async function call(who, method, pathname, data, options = {}) {
  const body = data === undefined ? '' : JSON.stringify(data);
  const headers = signedHeaders(who, method, pathname, body, options);
  const response = await mf.dispatchFetch(`http://social.test${pathname}`, { method, headers, body: body || undefined });
  return { status: response.status, data: await response.json() };
}

async function admin(method, pathname, data) {
  const response = await mf.dispatchFetch(`http://social.test${pathname}`, {
    method,
    headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  return { status: response.status, data: await response.json() };
}

function pow(who, bits) {
  const day = proto.powDay(Date.now());
  for (let counter = 0; ; counter += 1) {
    const digest = crypto.createHash('sha256').update(proto.powInput(who.id, day, counter)).digest();
    if (proto.leadingZeroBits(digest) >= bits) return { day, counter };
  }
}

async function account(who) {
  const result = await call(who, 'POST', '/v1/account', { pow: pow(who, 8) });
  assert.equal(result.status, 201, JSON.stringify(result.data));
  return result.data.account;
}

async function befriend(a, b) {
  const code = await call(a, 'POST', '/v1/friend-code', {});
  assert.equal(code.status, 201, JSON.stringify(code.data));
  const redeemed = await call(b, 'POST', '/v1/friend/redeem', { code: code.data.code });
  assert.equal(redeemed.status, 201, JSON.stringify(redeemed.data));
  return code.data.code;
}

const ref = { src: 'deezer', id: '3135553', title: 'One More Time', artist: 'Daft Punk' };

test('status is public and shows the switches', async () => {
  const response = await mf.dispatchFetch('http://social.test/v1/status');
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.enabled, true);
  assert.equal(data.pow, 8);
  assert.deepEqual(data.emojis, proto.EMOJIS);
  assert.equal((await mf.dispatchFetch('http://social.test/')).status, 404);
  assert.equal((await mf.dispatchFetch('http://social.test/v1/account')).status, 404);
});

test('signatures: missing, wrong, too old and replayed requests are refused', async () => {
  const eve = client();
  const unsigned = await mf.dispatchFetch('http://social.test/v1/friends');
  assert.equal(unsigned.status, 401);
  assert.equal((await call(eve, 'GET', '/v1/friends', undefined, { badSig: true })).data.error, 'signatur');
  assert.equal((await call(eve, 'GET', '/v1/friends', undefined, { time: Date.now() - 6 * 60 * 1000 })).data.error, 'zeit');
  await account(eve);
  const nonce = proto.toBase64Url(crypto.randomBytes(16));
  assert.equal((await call(eve, 'GET', '/v1/friends', undefined, { nonce })).status, 200);
  assert.equal((await call(eve, 'GET', '/v1/friends', undefined, { nonce })).data.error, 'wiederholt');
  // A body that does not match the signature.
  const headers = signedHeaders(eve, 'POST', '/v1/name', '{"name":"Rob"}');
  const swapped = await mf.dispatchFetch('http://social.test/v1/name', { method: 'POST', headers, body: '{"name":"Evil"}' });
  assert.equal(swapped.status, 401);
  const big = await call(eve, 'POST', '/v1/name', { name: 'x'.repeat(5000) });
  assert.equal(big.status, 413);
});

test('accounts: proof-of-work, random name with tag, idempotent, limited per network', async () => {
  const shared = '203.0.113.9';
  const one = client(shared);
  const noPow = await call(one, 'POST', '/v1/account', {});
  assert.equal(noPow.data.error, 'pow');
  const weak = await call(one, 'POST', '/v1/account', { pow: { day: proto.powDay(Date.now()), counter: -1 } });
  assert.equal(weak.data.error, 'pow');
  const created = await account(one);
  assert.equal(created.id, one.id);
  assert.equal(created.tag, one.id.slice(0, 4));
  assert.equal(created.random, true);
  assert.match(created.name, /^\S+ \S+ \d{1,2}$/);
  const again = await call(one, 'POST', '/v1/account', { pow: pow(one, 8) });
  assert.equal(again.status, 200);
  assert.equal(again.data.created, false);
  await account(client('203.0.113.200')); // same /24 → same network
  const third = await call(client(shared), 'POST', '/v1/account', { pow: pow(client(shared), 8) });
  assert.ok([400, 429].includes(third.status));
  const blocked = client('203.0.113.50');
  const limited = await call(blocked, 'POST', '/v1/account', { pow: pow(blocked, 8) });
  assert.equal(limited.data.error, 'zu-viele-konten');
  const unknown = await call(client(), 'GET', '/v1/friends');
  assert.equal(unknown.data.error, 'kein-konto');
});

test('names: filter on the server, once per day, random names any time', async () => {
  const rob = client();
  await account(rob);
  assert.match((await call(rob, 'POST', '/v1/name', { name: 'Admin' })).data.message, /nicht erlaubt/);
  assert.match((await call(rob, 'POST', '/v1/name', { name: 'R🎧b' })).data.message, /Emoji/);
  const ok = await call(rob, 'POST', '/v1/name', { name: '  DJ  Nachtfalter ' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.account.name, 'DJ Nachtfalter');
  assert.equal(ok.data.account.random, false);
  assert.equal((await call(rob, 'POST', '/v1/name', { name: 'Noch einer' })).data.error, 'name-tag');
  const random = await call(rob, 'POST', '/v1/name', { random: true });
  assert.equal(random.data.account.random, true);
});

test('friend codes: single use, never your own, both sides see each other, 24 h / limit', async () => {
  const alice = client();
  const bob = client();
  const carol = client();
  await Promise.all([account(alice), account(bob), account(carol)]);
  const code = await call(alice, 'POST', '/v1/friend-code', {});
  assert.match(code.data.code, proto.FRIEND_CODE_RE);
  assert.equal((await call(alice, 'POST', '/v1/friend/redeem', { code: code.data.code })).data.error, 'eigener-code');
  const redeemed = await call(bob, 'POST', '/v1/friend/redeem', { code: proto.friendLink(code.data.code) });
  assert.equal(redeemed.status, 201);
  assert.equal(redeemed.data.friend.id, alice.id);
  assert.equal((await call(carol, 'POST', '/v1/friend/redeem', { code: code.data.code })).status, 404);
  assert.equal((await call(carol, 'POST', '/v1/friend/redeem', { code: 'hallo' })).data.error, 'code');
  const aliceFriends = await call(alice, 'GET', '/v1/friends');
  const bobFriends = await call(bob, 'GET', '/v1/friends');
  assert.deepEqual(aliceFriends.data.friends.map((f) => f.id), [bob.id]);
  assert.deepEqual(bobFriends.data.friends.map((f) => f.id), [alice.id]);
  assert.equal(aliceFriends.data.me.id, alice.id);
  // Revoke and expiry.
  const open = await call(alice, 'POST', '/v1/friend-code', {});
  assert.equal((await call(alice, 'POST', '/v1/friend-code', { revoke: true })).data.revoked, 1);
  assert.equal((await call(carol, 'POST', '/v1/friend/redeem', { code: open.data.code })).status, 404);
  const late = await call(alice, 'POST', '/v1/friend-code', {});
  await wait(4200);
  assert.equal((await call(carol, 'POST', '/v1/friend/redeem', { code: late.data.code })).status, 404);
  // Friend limit (3 in this test setup instead of 200).
  const dave = client();
  await account(dave);
  await befriend(carol, alice);
  await befriend(dave, alice);
  const extra = client();
  await account(extra);
  const extraCode = (await call(extra, 'POST', '/v1/friend-code', {})).data.code;
  assert.equal((await call(alice, 'POST', '/v1/friend/redeem', { code: extraCode })).data.error, 'voll');
  assert.equal((await call(alice, 'POST', '/v1/friend-code', {})).status, 429, 'neue Konten: 3 Codes pro Stunde');
  assert.equal((await call(bob, 'POST', '/v1/friend/remove', { id: alice.id })).status, 200);
  assert.equal((await call(alice, 'GET', '/v1/friends')).data.friends.length, 2);
});

test('activity: only shareable refs, 1 per 15 s, visible to friends, expires, can be cleared', async () => {
  const alice = client();
  const bob = client();
  const stranger = client();
  await Promise.all([account(alice), account(bob), account(stranger)]);
  await befriend(alice, bob);
  assert.equal((await call(alice, 'POST', '/v1/activity', { ref: { src: 'local', title: 'C:/a.mp3' } })).data.error, 'ref');
  assert.equal((await call(alice, 'POST', '/v1/activity', { ref })).status, 200);
  assert.equal((await call(alice, 'POST', '/v1/activity', { ref })).status, 429);
  const seen = (await call(bob, 'GET', '/v1/friends')).data.friends[0];
  assert.deepEqual(seen.activity.ref, ref);
  assert.equal(seen.activity.playing, true);
  assert.equal((await call(stranger, 'GET', '/v1/friends')).data.friends.length, 0);
  // Reactions: friends only, fixed emojis, need a current song.
  assert.equal((await call(stranger, 'POST', '/v1/react', { to: alice.id, emoji: '🔥' })).data.error, 'kein-freund');
  assert.equal((await call(bob, 'POST', '/v1/react', { to: alice.id, emoji: 'hallo' })).data.error, 'emoji');
  assert.equal((await call(bob, 'POST', '/v1/react', { to: alice.id, emoji: '🔥' })).status, 200);
  const inbox = (await call(alice, 'GET', '/v1/friends')).data.reactions;
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].emoji, '🔥');
  assert.equal(inbox[0].title, 'One More Time');
  assert.equal(inbox[0].from.id, bob.id);
  assert.equal((await call(alice, 'POST', '/v1/react', { to: bob.id, emoji: '🎧' })).data.error, 'keine-aktivitaet');
  await wait(2700);
  assert.equal((await call(bob, 'GET', '/v1/friends')).data.friends[0].activity, null, 'Aktivität verfällt');
  assert.equal((await call(alice, 'POST', '/v1/activity', { clear: true })).data.cleared, true);
});

test('block, report (3 name reports → random name), delete account', async () => {
  const target = client();
  const r1 = client();
  const r2 = client();
  const r3 = client();
  await Promise.all([target, r1, r2, r3].map(account));
  assert.equal((await call(target, 'POST', '/v1/name', { name: 'Grenzwertig' })).status, 200);
  await befriend(r1, target);
  await befriend(r2, target);
  await befriend(r3, target);
  assert.equal((await call(client(), 'POST', '/v1/report', { id: target.id, reason: 'name' })).status, 401);
  assert.equal((await call(r1, 'POST', '/v1/report', { id: target.id, reason: 'egal' })).data.error, 'grund');
  assert.equal((await call(r1, 'POST', '/v1/report', { id: target.id, reason: 'name' })).data.renamed, false);
  assert.equal((await call(r1, 'POST', '/v1/report', { id: target.id, reason: 'name' })).data.renamed, false, 'gleicher Melder zählt einmal');
  assert.equal((await call(r2, 'POST', '/v1/report', { id: target.id, reason: 'name' })).data.renamed, false);
  // r3 blocks first – blocked people can still be reported.
  assert.equal((await call(r3, 'POST', '/v1/block', { id: target.id })).data.blocked, true);
  assert.equal((await call(target, 'GET', '/v1/friends')).data.friends.length, 2, 'Blockieren beendet die Freundschaft');
  assert.equal((await call(r3, 'POST', '/v1/report', { id: target.id, reason: 'name' })).data.renamed, true);
  const me = (await call(target, 'GET', '/v1/friends')).data.me;
  assert.equal(me.random, true);
  assert.notEqual(me.name, 'Grenzwertig');
  // A blocked person cannot use your codes (and you cannot use theirs).
  const code = (await call(target, 'POST', '/v1/friend-code', {})).data.code;
  assert.equal((await call(r3, 'POST', '/v1/friend/redeem', { code })).status, 404);
  assert.deepEqual((await call(r3, 'GET', '/v1/friends')).data.blocked.map((p) => p.id), [target.id]);
  assert.equal((await call(r3, 'POST', '/v1/block', { id: target.id, block: false })).data.blocked, false);
  // Delete: everything goes, friends no longer see the account.
  assert.equal((await call(target, 'DELETE', '/v1/account')).data.deleted, true);
  assert.equal((await call(r1, 'GET', '/v1/friends')).data.friends.length, 0);
  assert.equal((await call(target, 'GET', '/v1/friends')).data.error, 'kein-konto');
});

test('operator: kill switch (delete still works), bans, reports – only with the token', async () => {
  const user = client();
  const bad = client();
  await Promise.all([account(user), account(bad)]);
  const noToken = await mf.dispatchFetch('http://social.test/v1/admin/switch', { method: 'POST', body: '{}' });
  assert.equal(noToken.status, 401);
  assert.equal((await admin('POST', '/v1/admin/switch', { enabled: false })).data.enabled, false);
  assert.equal((await call(user, 'GET', '/v1/friends')).data.error, 'aus');
  assert.equal((await (await mf.dispatchFetch('http://social.test/v1/status')).json()).enabled, false);
  assert.equal((await admin('POST', '/v1/admin/switch', { enabled: true })).data.enabled, true);
  assert.equal((await admin('POST', '/v1/admin/ban', { id: bad.id })).data.banned, true);
  assert.equal((await call(bad, 'GET', '/v1/friends')).data.error, 'gesperrt');
  assert.equal((await call(bad, 'POST', '/v1/account', { pow: pow(bad, 8) })).data.error, 'gesperrt');
  assert.ok(Array.isArray((await admin('GET', '/v1/admin/reports')).data.reports));
  await admin('POST', '/v1/admin/switch', { enabled: false });
  assert.equal((await call(user, 'DELETE', '/v1/account')).data.deleted, true, 'Löschen geht auch bei Not-Aus');
  await admin('POST', '/v1/admin/switch', { enabled: true });
});

test('S2 groups: invite code for several, week ranking, shared playlist rights, kick/leave, cleanup', async () => {
  const owner = client();
  const m1 = client();
  const m2 = client();
  const outsider = client();
  await Promise.all([owner, m1, m2, outsider].map(account));
  assert.equal((await call(owner, 'POST', '/v1/group', { name: 'Admin' })).data.error, 'name');
  const made = await call(owner, 'POST', '/v1/group', { name: 'Die Hörer' });
  assert.equal(made.status, 201);
  const gid = made.data.group.id;
  assert.equal((await call(outsider, 'POST', '/v1/group/code', { group: gid })).data.error, 'keine-gruppe');
  const code = (await call(owner, 'POST', '/v1/group/code', { group: gid })).data.code;
  assert.match(code, proto.GROUP_CODE_RE);
  assert.equal((await call(m1, 'POST', '/v1/group/join', { code: proto.friendLink(code) })).status, 201);
  assert.equal((await call(m2, 'POST', '/v1/group/join', { code })).status, 201, 'ein Gruppencode gilt für mehrere');
  assert.equal((await call(m2, 'POST', '/v1/group/join', { code })).data.already, true);
  // Week cards: only for group members, only this/last week, cleaned.
  const week = proto.isoWeek(Date.now());
  assert.equal((await call(outsider, 'POST', '/v1/week', { week, secs: 60 })).data.error, 'keine-gruppe');
  assert.equal((await call(owner, 'POST', '/v1/week', { week: '2020-W01', secs: 60 })).data.error, 'woche');
  assert.equal((await call(owner, 'POST', '/v1/week', { week, secs: 3600, plays: 20, artists: ['A', 'B', 'C', 'D'] })).status, 200);
  assert.equal((await call(m1, 'POST', '/v1/week', { week, secs: 7200, plays: 30 })).status, 200);
  const group = (await call(m2, 'GET', '/v1/groups')).data.groups[0];
  assert.equal(group.name, 'Die Hörer');
  assert.equal(group.owner, owner.id);
  assert.deepEqual(group.members.map((member) => member.week && member.week.secs), [3600, 7200, null]);
  assert.deepEqual(group.members[0].week.artists, ['A', 'B', 'C']);
  // Shared playlist: everyone adds, no duplicates, creator or adder removes.
  assert.equal((await call(m1, 'POST', '/v1/group/track', { group: gid, ref })).status, 201);
  assert.equal((await call(m2, 'POST', '/v1/group/track', { group: gid, ref })).data.already, true);
  assert.equal((await call(m2, 'POST', '/v1/group/track', { group: gid, ref: { src: 'local', title: 'x' } })).data.error, 'ref');
  assert.equal((await call(outsider, 'POST', '/v1/group/track', { group: gid, ref })).data.error, 'keine-gruppe');
  const track = (await call(owner, 'GET', '/v1/groups')).data.groups[0].tracks[0];
  assert.equal(track.by.id, m1.id);
  assert.equal((await call(m2, 'POST', '/v1/group/track/remove', { group: gid, rid: track.rid })).data.error, 'nur-ersteller');
  assert.equal((await call(owner, 'POST', '/v1/group/track/remove', { group: gid, rid: track.rid })).status, 200);
  // Kick, leave (oldest member takes over), last member gone → group gone.
  assert.equal((await call(m1, 'POST', '/v1/group/kick', { group: gid, id: m2.id })).data.error, 'nur-ersteller');
  assert.equal((await call(owner, 'POST', '/v1/group/kick', { group: gid, id: m2.id })).status, 200);
  assert.equal((await call(m2, 'GET', '/v1/groups')).data.groups.length, 0);
  assert.equal((await call(owner, 'POST', '/v1/group/leave', { group: gid })).status, 200);
  assert.equal((await call(m1, 'GET', '/v1/groups')).data.groups[0].owner, m1.id, 'ältestes Mitglied übernimmt');
  assert.equal((await call(owner, 'POST', '/v1/week', { week, secs: 1 })).data.error, 'keine-gruppe', 'Wochensumme weg ohne Gruppe');
  assert.equal((await call(m1, 'DELETE', '/v1/account')).data.deleted, true);
  assert.equal((await call(m2, 'POST', '/v1/group/join', { code })).status, 404, 'leere Gruppe ist gelöscht');
});
