'use strict';

/**
 * Unit tests for renderer/core/supporter.js – supporter extras with a public code.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'supporter.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const S = sandbox.window.CMSupporter;
assert.ok(S, 'window.CMSupporter fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('the public code works in any spelling', () => {
  assert.equal(S.checkCode(S.CODE), true);
  assert.equal(S.checkCode('danke cleanmusic'), true);
  assert.equal(S.checkCode('  Danke-CleanMusic!  '), true);
  assert.equal(S.checkCode(''), false);
  assert.equal(S.checkCode('DANKE'), false);
  assert.equal(S.checkCode(null), false);
});

check('only listed extras are locked, and only while locked', () => {
  const locked = { unlocked: false };
  assert.equal(S.isLocked('theme', 'synthwave', locked), true);
  assert.equal(S.isLocked('theme', 'nacht', locked), false);
  assert.equal(S.isLocked('background', 'lava', locked), true);
  assert.equal(S.isLocked('background', 'aurora', locked), false);
  assert.equal(S.isLocked('lyricsEffect', 'neon', locked), true);
  assert.equal(S.isLocked('lyricsEffect', 'karaoke', locked), false);
  assert.equal(S.isLocked('vizStyle', 'particles', locked), true);
  assert.equal(S.isLocked('vizStyle', 'off', locked), false);
  assert.equal(S.isLocked('unknown', 'x', locked), false);
  assert.equal(S.isLocked('theme', 'synthwave', { unlocked: true }), false);
  assert.equal(S.lockedCount(), 18);
});

check('fresh profiles start locked, existing ones keep everything', () => {
  assert.deepEqual(plain(S.initial(null, true, 5)), { unlocked: false, how: '', at: 0 });
  assert.deepEqual(plain(S.initial(null, false, 5)), { unlocked: true, how: 'legacy', at: 5 });
  // A stored state always wins over the first-run guess.
  assert.deepEqual(plain(S.initial({ unlocked: false, how: '', at: 0 }, false, 5)), { unlocked: false, how: '', at: 0 });
  assert.deepEqual(plain(S.initial({ unlocked: true, how: 'code', at: 3 }, true, 5)), { unlocked: true, how: 'code', at: 3 });
});

check('broken stored values fall back to the first-run decision', () => {
  assert.deepEqual(plain(S.initial({ unlocked: 'yes' }, true, 5)), { unlocked: false, how: '', at: 0 });
  assert.deepEqual(plain(S.initial([], false, 5)), { unlocked: true, how: 'legacy', at: 5 });
  assert.deepEqual(plain(S.initial({ unlocked: true, how: '<script>', at: -1 }, true, 5)), { unlocked: true, how: '', at: 0 });
});

check('unlocking records how', () => {
  assert.deepEqual(plain(S.unlock('free', 9)), { unlocked: true, how: 'free', at: 9 });
  assert.deepEqual(plain(S.unlock('code', 9)), { unlocked: true, how: 'code', at: 9 });
  assert.deepEqual(plain(S.unlock('weird', 9)), { unlocked: true, how: 'code', at: 9 });
});

console.log(`\n${checks} passed, 0 failed`);
