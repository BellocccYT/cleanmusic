'use strict';

/**
 * Unit tests for renderer/core/entries.js – the one entry shape.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'entries.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const E = sandbox.window.CMEntries;
assert.ok(E, 'window.CMEntries fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('previewEntry: catalogue preview with defaults', () => {
  const entry = plain(
    E.previewEntry({
      id: 3135553,
      title: 'One More Time',
      artist: 'Daft Punk',
      album: 'Discovery',
      duration: 320,
      preview: 'https://cdns-preview.example/1.mp3',
      link: 'https://deezer.com/track/3135553',
      artistId: 27,
    })
  );
  assert.equal(entry.id, '3135553');
  assert.equal(entry.kind, 'preview');
  assert.equal(entry.source, 'deezer');
  assert.equal(entry.sourceLabel, 'Vorschau');
  assert.equal(entry.url, 'https://cdns-preview.example/1.mp3');
  assert.equal(entry.duration, 320);
  assert.equal(entry.artistId, 27);
  const empty = plain(E.previewEntry({ id: 1 }));
  assert.equal(empty.title, 'Unbekannt');
  assert.equal(empty.url, '');
  assert.equal(empty.artistId, null);
  assert.equal(empty.source, 'deezer');
});

check('pluginEntry: plugin-confirmed CC BY is kept', () => {
  const plugin = { id: 'yt', source: { id: 'youtube', label: 'YouTube' } };
  const entry = plain(
    E.pluginEntry(plugin, { id: 'abc', title: 'Song', artist: 'Band', license: 'cc-by', duration: '210' })
  );
  assert.equal(entry.id, 'p:yt:abc');
  assert.equal(entry.kind, 'plugin');
  assert.equal(entry.refId, 'abc');
  assert.equal(entry.ytLicense, 'cc-by');
  assert.equal(entry.duration, 210);
  assert.equal(plain(E.pluginEntry(plugin, { id: 'x' })).ytLicense, '');
  assert.equal(plain(E.pluginEntry(plugin, { id: 'x', license: 'standard' })).ytLicense, '');
});

check('migrateEntry lifts 0.5.0 YouTube favourites', () => {
  const old = { id: 'y:abc', kind: 'youtube', ytId: 'abc', title: 'Alt' };
  const next = plain(E.migrateEntry(old));
  assert.equal(next.id, 'p:ytdlp:abc');
  assert.equal(next.kind, 'plugin');
  assert.equal(next.pluginId, 'ytdlp');
  assert.equal(next.refId, 'abc');
  assert.equal(next.ytId, undefined);
  const other = { id: 'x', kind: 'preview' };
  assert.equal(E.migrateEntry(other), other);
  assert.equal(E.migrateEntry(null), null);
});

check('ncsEntry and classicEntry carry licence + credit', () => {
  const ncs = plain(E.ncsEntry({ id: 'n1', title: 'Level Up', artist: 'Artist', url: 'https://ncs/1.mp3' }));
  assert.equal(ncs.license, 'NCS');
  assert.match(ncs.credit, /NoCopyrightSounds/);
  assert.match(ncs.credit, /q=Level%20Up/);
  assert.equal(ncs.kind, 'preview');

  const classic = plain(
    E.classicEntry({ id: 'c1', title: 'Sneaky Snitch', artist: 'Kevin MacLeod', url: 'https://x/1.mp3', category: 'lustig' })
  );
  assert.equal(classic.kind, 'stream');
  assert.equal(classic.license, 'CC BY 4.0');
  assert.match(classic.credit, /Creative Commons: By Attribution 4.0/);
  assert.equal(classic.category, 'lustig');
});

check('openverseEntry: stream with licence and tags', () => {
  const entry = plain(
    E.openverseEntry({
      id: 42,
      title: 'Chill Loop',
      artist: 'Someone',
      url: 'https://x/2.mp3',
      license: 'cc0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      credit: 'Someone – Chill Loop (CC0)',
      tags: ['chill', 'loop'],
    })
  );
  assert.equal(entry.kind, 'stream');
  assert.equal(entry.license, 'cc0');
  assert.equal(entry.meta, 'chill · loop');
  assert.equal(entry.sourceLabel, 'Openverse');
});

check('licenseKey and licenseCategory', () => {
  assert.equal(E.licenseKey('CC0'), 'free');
  assert.equal(E.licenseKey('Public Domain'), 'free');
  assert.equal(E.licenseKey('NCS'), 'ncs');
  assert.equal(E.licenseKey('CC BY 4.0'), 'by');
  assert.equal(E.licenseKey('CC BY 3.0'), 'by');
  assert.equal(E.licenseKey('Alle Rechte'), 'other');
  assert.equal(E.licenseKey(''), 'other');
  assert.equal(E.licenseCategory({ license: 'CC BY 4.0' }), 'by');
  assert.equal(E.licenseCategory({ license: '', ytLicense: 'cc-by' }), 'by');
  assert.equal(E.licenseCategory({ license: 'NCS', ytLicense: 'cc-by' }), 'ncs');
  assert.equal(E.licenseCategory(null), 'other');
});

check('localEntry and radioEntry', () => {
  const local = plain(E.localEntry({ path: 'C:\\Musik\\a.mp3', title: 'A', artist: 'B', url: 'file:///a.mp3', dir: 'Musik' }));
  assert.equal(local.id, 'local:C:\\Musik\\a.mp3');
  assert.equal(local.kind, 'local');
  assert.equal(local.sourceLabel, 'Lokal');
  assert.equal(local.dir, 'Musik');
  assert.equal(plain(E.localEntry({ path: 'x' })).title, 'Unbekannt');

  const radio = plain(
    E.radioEntry({ id: 'r1', name: 'Radio Eins', country: 'DE', tags: ['pop', 'news', 'x'], url: 'https://r/1', codec: 'MP3', bitrate: 128 })
  );
  assert.equal(radio.id, 'radio:r1');
  assert.equal(radio.artist, 'DE · pop');
  assert.equal(radio.meta, 'DE · MP3 · 128 kbps');
  const bare = plain(E.radioEntry({ id: 'r2', name: 'Bare', url: 'https://r/2' }));
  assert.equal(bare.artist, 'Live Radio');
  assert.equal(bare.meta, '');
});

check('storable keeps known fields only and adds addedAt', () => {
  const entry = E.storable({
    id: 'a1',
    kind: 'preview',
    title: 'Titel',
    artist: 'Artist',
    url: 'blob:https://x/1',
    secret: 'drop me',
    duration: 0,
    artwork: '',
    addedAt: 0,
  });
  const flat = plain(entry);
  assert.equal(flat.id, 'a1');
  assert.equal(flat.url, 'blob:https://x/1');
  assert.equal(flat.secret, undefined);
  assert.equal(flat.duration, 0, '0 ist ein gültiger Wert und bleibt');
  assert.equal(flat.artwork, undefined, 'leere Strings werden weggelassen');
  assert.ok(flat.addedAt > 0);
  assert.equal(plain(E.storable({ id: 'b', addedAt: 123 })).addedAt, 123);
});

check('validEntry accepts only the known shape', () => {
  assert.equal(E.validEntry({ id: 'a', title: 'T', kind: 'preview' }), true);
  assert.equal(E.validEntry({ id: 'a', title: 'T', kind: 'radio' }), true);
  assert.equal(E.validEntry({ id: 'a', title: 'T', kind: 'unbekannt' }), false);
  assert.equal(E.validEntry({ id: 5, title: 'T', kind: 'preview' }), false);
  assert.equal(E.validEntry({ id: 'a', kind: 'preview' }), false);
  assert.equal(E.validEntry(null), false);
  assert.deepEqual(plain(E.KINDS), ['preview', 'plugin', 'stream', 'local', 'radio']);
  assert.ok(E.FIELDS.includes('ytLicense'));
});

console.log(`\n${checks} passed, 0 failed`);
