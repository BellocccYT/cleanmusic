'use strict';

/**
 * Unit tests for renderer/audio/playback.js – shuffle/repeat state rules.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'audio', 'playback.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const P = sandbox.window.CMPlayback;
assert.ok(P, 'window.CMPlayback fehlt');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('normalize: known values only, unknown keys survive', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(P.normalize(null))), { shuffle: false, repeat: 'off' });
  assert.deepEqual(JSON.parse(JSON.stringify(P.normalize({ shuffle: 1, repeat: 'one', extra: 'x' }))), {
    shuffle: true,
    repeat: 'one',
    extra: 'x',
  });
  assert.equal(P.normalize({ repeat: 'manchmal' }).repeat, 'off');
  assert.equal(P.normalize('kaputt').shuffle, false);
  assert.equal(P.normalize([1, 2]).repeat, 'off');
  assert.equal(P.normalize({ shuffle: 0 }).shuffle, false);
});

check('repeat cycles off → all → one → off', () => {
  assert.equal(P.nextRepeat('off'), 'all');
  assert.equal(P.nextRepeat('all'), 'one');
  assert.equal(P.nextRepeat('one'), 'off');
  assert.equal(P.nextRepeat('quatsch'), 'all', 'unbekannt zählt als aus');
  assert.equal(P.nextRepeat(), 'all');
  assert.deepEqual(JSON.parse(JSON.stringify(P.REPEAT)), ['off', 'all', 'one']);
});

check('repeat helpers answer the questions the UI asks', () => {
  assert.equal(P.repeatActive('all'), true);
  assert.equal(P.repeatActive('one'), true);
  assert.equal(P.repeatActive('off'), false);
  assert.equal(P.repeatOne('one'), true);
  assert.equal(P.repeatOne('all'), false);
  assert.equal(P.repeatOff('off'), true);
  assert.equal(P.repeatOff(undefined), true);
  assert.equal(P.repeatLabel('off'), 'Wiederholen aus');
  assert.equal(P.repeatLabel('all'), 'Alle wiederholen');
  assert.equal(P.repeatLabel('one'), 'Titel wiederholen');
  assert.equal(P.repeatLabel('x'), 'Wiederholen aus');
});

check('autoplay waits for the end of the list', () => {
  assert.equal(P.blocksAutoplay('off'), false);
  assert.equal(P.blocksAutoplay('all'), true);
  assert.equal(P.blocksAutoplay('one'), true);
});

check('titles and single-title contexts', () => {
  assert.equal(P.shuffleTitle(true), 'Shuffle an');
  assert.equal(P.shuffleTitle(false), 'Shuffle aus');
  const contexts = ['search', 'ext', 'shared'];
  assert.equal(P.singleContext(true, 'search', contexts), true);
  assert.equal(P.singleContext(true, 'playlist', contexts), false);
  assert.equal(P.singleContext(false, 'search', contexts), false);
  assert.equal(P.singleContext(true, 'search', null), false);
});

console.log(`\n${checks} passed, 0 failed`);
