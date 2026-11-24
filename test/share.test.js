'use strict';

/**
 * Unit tests for renderer/core/share.js – playlist links without a server.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'share.js');
const sandbox = {
  window: {}, TextEncoder, TextDecoder, btoa, atob, Blob, Response,
  CompressionStream, DecompressionStream, Uint8Array,
};
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const S = sandbox.window.CMShare;
assert.ok(S, 'window.CMShare fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
async function check(name, run) {
  await run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const entries = [
  { id: 'deezer:3135553', kind: 'preview', title: 'One More Time', artist: 'Daft Punk' },
  { id: 'apple:1440833098', kind: 'preview', title: 'Blinding Lights', artist: 'The Weeknd' },
  { id: 'plugin:ytdlp:dQw4w9WgXcQ', kind: 'plugin', refId: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', artist: 'Rick Astley' },
  { id: 'local:1', kind: 'local', title: 'Mein Lied', path: 'C:/Musik/x.mp3' },
  { id: 'radio:1', kind: 'radio', title: 'Radio' },
  { id: 'stream:ncs:1', kind: 'stream', title: 'Fade', artist: 'Alan Walker' },
  { id: 'unicode', kind: 'preview', title: '夜に駆ける', artist: 'YOASOBI' },
];

(async () => {
  await check('refOf: same rules as song links, local and radio skipped', async () => {
    assert.deepEqual(plain(S.refOf(entries[0])), { src: 'deezer', id: '3135553', title: 'One More Time', artist: 'Daft Punk' });
    assert.equal(S.refOf(entries[2]).src, 'youtube');
    assert.equal(S.refOf(entries[3]), null);
    assert.equal(S.refOf(entries[4]), null);
    assert.equal(S.refOf(entries[5]).src, 'search');
  });

  await check('encode → decode round trip keeps order, names and Unicode', async () => {
    const { code, shared, skipped } = await S.encodePlaylist('Roadtrip 🚗', entries);
    assert.equal(shared, 5);
    assert.equal(skipped, 2);
    assert.match(code, S.CODE_RE);
    const result = await S.decodePlaylist(`Hör mal: https://bellocccyt.github.io/cleanmusic/p/#${code} !`);
    assert.equal(result.name, 'Roadtrip 🚗');
    assert.deepEqual(plain(result.tracks.map((track) => track.src)), ['deezer', 'apple', 'youtube', 'search', 'search']);
    assert.equal(result.tracks[4].title, '夜に駆ける');
  });

  await check('100 titles stay short enough for a link', async () => {
    const many = Array.from({ length: 140 }, (_value, index) => ({
      id: `deezer:${100000 + index}`, kind: 'preview', title: `Song Nummer ${index}`, artist: 'Künstler',
    }));
    const { code, shared, skipped } = await S.encodePlaylist('Groß', many);
    assert.equal(shared, S.TRACKS_MAX);
    assert.equal(skipped, 40);
    assert.ok(code.length < 4000, `Code ist ${code.length} Zeichen lang`);
  });

  await check('nothing shareable → no code', async () => {
    const { code } = await S.encodePlaylist('Nur lokal', [entries[3], entries[4]]);
    assert.equal(code, '');
  });

  await check('broken, foreign and tampered codes are refused', async () => {
    assert.match((await S.decodePlaylist('hallo')).error, /Kein CleanMusic/);
    assert.match((await S.decodePlaylist('P1.AAAAAAAAAAAA')).error, /beschädigt|Format/);
    const { code } = await S.encodePlaylist('X', entries.slice(0, 1));
    assert.match((await S.decodePlaylist(code.slice(0, -6))).error, /beschädigt|Format/);
  });

  await check('tampered content is cleaned: bad ids dropped, text limited', async () => {
    const json = JSON.stringify({ v: 1, n: '<b>'.repeat(50), t: [['d', 'abc', 'x', 'y'], ['y', 'kurz', 'z', ''], ['s', '', '', ''], ['d', '42', 'T'.repeat(200), 'A']] });
    const packed = new Uint8Array(await new Response(new Blob([new TextEncoder().encode(json)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let binary = '';
    packed.forEach((byte) => { binary += String.fromCharCode(byte); });
    const code = 'P1.' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const result = await S.decodePlaylist(code);
    assert.equal(result.tracks.length, 1);
    assert.equal(result.tracks[0].id, '42');
    assert.equal(result.tracks[0].title.length, 80);
    assert.equal(result.name.length, 80);
  });

  console.log(`${checks} passed, 0 failed`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
