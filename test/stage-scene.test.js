'use strict';

/**
 * Unit tests for lib/stage-scene.js – the sanitised figures a plugin may put
 * behind the motion lyrics (Plugin-API v3, permission "stage").
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const S = require('../lib/stage-scene.js');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';

check('junk is rejected, never guessed', () => {
  assert.equal(S.cleanScene(null), null);
  assert.equal(S.cleanScene([]), null);
  assert.equal(S.cleanScene({ characters: [] }), null);
  assert.equal(S.cleanScene({ characters: [{ src: 'javascript:alert(1)' }] }), null);
  assert.equal(S.cleanScene({ characters: [{ src: 'http://example.com/a.png' }] }), null);
  assert.equal(S.cleanScene({ characters: [{ src: 'data:text/html;base64,AAAA' }] }), null);
});

check('valid scene keeps only known fields and sane defaults', () => {
  const scene = S.cleanScene({
    game: 'Undertale\u0000',
    label: true,
    accent: '#FFD23F',
    size: 9,
    extra: 'nope',
    characters: [
      { src: 'https://example.com/sans.png', name: 'Sans', anchor: 'left', motion: 'bounce', scale: 4 },
      { src: png, name: 'Papyrus', anchor: 'weird', motion: 'nope' },
    ],
  });
  assert.equal(scene.game, 'Undertale');
  assert.equal(scene.label, true);
  assert.equal(scene.accent, '#ffd23f');
  assert.equal(scene.size, 1.4);
  assert.equal(scene.extra, undefined);
  assert.equal(scene.characters.length, 2);
  assert.equal(scene.characters[0].scale, 1.4);
  assert.equal(scene.characters[1].anchor, 'right');
  assert.equal(scene.characters[1].motion, S.MOTIONS[1]);
});

check('at most six figures, local files and https/data allowed', () => {
  const characters = Array.from({ length: 9 }, (_, index) => ({ src: `file:///C:/Bilder/${index}.png` }));
  const scene = S.cleanScene({ characters });
  assert.equal(scene.characters.length, 6);
  assert.ok(scene.characters.every((character) => character.src.startsWith('file:///')));
});

check('oversized data URLs are dropped', () => {
  const big = `data:image/png;base64,${'A'.repeat(S.MAX_DATA_URL + 10)}`;
  assert.equal(S.cleanScene({ characters: [{ src: big }, { src: png }] }).characters.length, 1);
});

check('sceneKey is stable and notices changes', () => {
  const a = S.cleanScene({ game: 'A', characters: [{ src: png, name: 'X' }] });
  const b = S.cleanScene({ game: 'A', characters: [{ src: png, name: 'X' }] });
  const c = S.cleanScene({ game: 'A', characters: [{ src: png, name: 'Y' }] });
  assert.equal(S.sceneKey(a), S.sceneKey(b));
  assert.notEqual(S.sceneKey(a), S.sceneKey(c));
  assert.equal(S.sceneKey(null), '');
});

console.log(`${checks} passed, 0 failed`);
