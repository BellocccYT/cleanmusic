'use strict';

/**
 * Unit tests for extras/plugins/game-motion.js – game detection and character
 * picking. The plugin itself is not loaded by CleanMusic here.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../lib/plugin-manifest.js');
const plugin = require('../extras/plugins/game-motion.js');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanmusic-game-motion-'));
const image = (relative) => {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'png');
  return file;
};
image('undertale/sans.png');
image('undertale/papyrus.png');
image('undertale/flowey.webp');
image('undertale/notiz.txt');
image('doom/doomguy.png');
image('hollow-knight/knight.png');
image('hollow-knight/hornet.gif');

const T = plugin.__test;
const rules = T.parseRules({
  games: [
    { id: 'undertale', name: 'Undertale', accent: '#ffd23f', artists: ['Toby Fox'], tracks: ['Megalovania', 'Bonetrousle'] },
    { id: 'doom', name: 'DOOM', accent: '#c8321e', keywords: ['doom'], artists: ['Mick Gordon'], tracks: ['BFG Division'] },
  ],
});

check('manifest declares the stage permission', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'extras', 'plugins', 'game-motion.js'), 'utf8');
  const { manifest, error } = M.parseManifest(text);
  assert.equal(error, null);
  assert.equal(manifest.apiVersion, 3);
  assert.equal(manifest.name, 'Game Motion');
  assert.deepEqual(manifest.permissions.sort(), ['fs:folder', 'player', 'stage', 'ui:panel', 'ui:settings'].sort());
  assert.equal(plugin.apiVersion, 3);
});

check('normalize/slug treat umlauts and punctuation consistently', () => {
  assert.equal(T.normalize('Mick Gordon – BFG Division!'), 'mick gordon bfg division');
  assert.equal(T.slug('The Witcher 3: Wild Hunt'), 'the-witcher-3-wild-hunt');
  assert.equal(T.prettyName('hollow-knight'), 'Hollow Knight');
});

check('detects by album, track and artist', () => {
  assert.equal(T.detectGame({ title: 'Random', artist: '', album: 'UNDERTALE Soundtrack' }, rules, root, '').id, 'undertale');
  assert.equal(T.detectGame({ title: 'Megalovania', artist: 'Toby Fox', album: '' }, rules, root, '').id, 'undertale');
  assert.equal(T.detectGame({ title: 'BFG Division', artist: 'Mick Gordon', album: '' }, rules, root, '').id, 'doom');
});

check('does not match a keyword inside another word', () => {
  assert.equal(T.detectGame({ title: 'Doomed', artist: 'Nobody', album: 'Doomed' }, rules, root, ''), null);
});

check('falls back to a folder whose name is in the album', () => {
  const game = T.detectGame({ title: 'Greenpath', artist: '', album: 'Hollow Knight (Original Soundtrack)' }, { games: [] }, root, '');
  assert.equal(game.id, 'hollow-knight');
  assert.equal(game.folder, 'hollow-knight');
});

check('manual game overrides the detection', () => {
  const game = T.detectGame({ title: 'Something Else', artist: 'Nobody', album: 'Nothing' }, rules, root, 'doom');
  assert.equal(game.id, 'doom');
  assert.equal(game.folder, 'doom');
});

check('picks only images, deterministically, at most the requested count', () => {
  const game = { id: 'undertale', name: 'Undertale', folder: 'undertale', characters: [] };
  const track = { id: 'u1', title: 'Megalovania', artist: 'Toby Fox' };
  const first = T.pickCharacters(root, game, 2, track, 'auto');
  const again = T.pickCharacters(root, game, 2, track, 'auto');
  assert.equal(first.length, 2);
  assert.deepEqual(first.map((entry) => entry.file), again.map((entry) => entry.file));
  assert.ok(first.every((entry) => /\.(png|webp|gif)$/i.test(entry.file)));
  assert.ok(first.every((entry) => !/notiz\.txt$/i.test(entry.file)));
  assert.deepEqual(first.map((entry) => entry.anchor), ['left', 'right']);
});

check('explicit character order wins', () => {
  const game = {
    id: 'undertale',
    name: 'Undertale',
    folder: 'undertale',
    characters: [
      { file: 'papyrus.png', name: 'Papyrus', anchor: 'right', motion: 'sway' },
      { file: 'sans.png', name: 'Sans', anchor: 'left', motion: 'stomp' },
    ],
  };
  const picked = T.pickCharacters(root, game, 2, { title: 'x' }, 'auto');
  assert.deepEqual(picked.map((entry) => entry.name), ['Papyrus', 'Sans']);
  assert.equal(picked[0].motion, 'sway');
});

check('buildScene returns a safe stage scene with file URLs', () => {
  const result = T.buildScene(
    { id: 'u1', title: 'Megalovania', artist: 'Toby Fox', album: 'UNDERTALE Soundtrack' },
    { enabled: true, folder: root, manualGame: '', count: 2, motion: 'auto', size: 'm', names: true },
    rules
  );
  assert.equal(result.reason, '');
  assert.equal(result.scene.game, 'Undertale');
  assert.equal(result.scene.label, true);
  assert.equal(result.scene.size, 1);
  assert.equal(result.scene.characters.length, 2);
  assert.ok(result.scene.characters.every((character) => character.src.startsWith('file:///')));
});

check('buildScene works when the folder itself is the game folder', () => {
  const result = T.buildScene(
    { id: 'u2', title: 'Whatever', artist: '', album: '' },
    { enabled: true, folder: path.join(root, 'undertale'), manualGame: 'undertale', count: 1, motion: 'auto', size: 's', names: false },
    rules
  );
  assert.equal(result.scene.game, 'Undertale');
  assert.equal(result.scene.characters.length, 1);
  assert.equal(result.scene.size, 0.82);
});

check('disabled or missing folder means no scene, never an error', () => {
  assert.equal(T.buildScene({ title: 'x' }, { enabled: false, folder: root }, rules).reason, 'aus');
  assert.equal(T.buildScene({ title: 'x' }, { enabled: true, folder: '' }, rules).reason, 'folder');
});

fs.rmSync(root, { recursive: true, force: true });
console.log(`${checks} passed, 0 failed`);
