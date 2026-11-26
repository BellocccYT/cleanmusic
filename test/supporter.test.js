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
  assert.equal(S.isLocked('lyricsEffect', 'lyricvideo', locked), true);
  // 2.1.1: the full-screen motion styles are extras as well.
  for (const style of ['poster', 'brush', 'cinema']) assert.equal(S.isLocked('lyricsEffect', style, locked), true);
  assert.equal(S.isLocked('lyricsEffect', 'karaoke', locked), false);
  assert.equal(S.isLocked('vizStyle', 'particles', locked), true);
  assert.equal(S.isLocked('vizStyle', 'off', locked), false);
  assert.equal(S.isLocked('unknown', 'x', locked), false);
  assert.equal(S.isLocked('theme', 'synthwave', { unlocked: true }), false);
  assert.equal(S.lockedCount(), 22);
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 25, 12);
const trialState = (until, extra = {}) =>
  Object.assign({ unlocked: false, how: '', at: 0, trialUntil: until, trialReset: false, trialNotice: false }, extra);
const open = (how, at) => ({ unlocked: true, how, at, trialUntil: 0, trialReset: false, trialNotice: false });

check('fresh profiles get 7 trial days, existing ones keep everything', () => {
  assert.equal(S.TRIAL_DAYS, 7);
  assert.deepEqual(plain(S.initial(null, true, NOW)), trialState(NOW + 7 * DAY));
  assert.deepEqual(plain(S.initial(null, false, 5)), open('legacy', 5));
  // A stored state always wins over the first-run guess.
  assert.deepEqual(plain(S.initial(open('code', 3), true, NOW)), open('code', 3));
  assert.deepEqual(plain(S.initial({ unlocked: true, how: 'legacy', at: 2 }, false, NOW)), open('legacy', 2));
  const running = trialState(NOW + DAY);
  assert.deepEqual(plain(S.initial(running, false, NOW)), running);
});

check('1.27.0 profiles stored as locked get the trial once', () => {
  // 1.27.0 (and the mobile first start) stored { unlocked: false } without a trial.
  assert.deepEqual(plain(S.initial({ unlocked: false, how: '', at: 0 }, false, NOW)), trialState(NOW + 7 * DAY));
  // An expired trial is never renewed.
  const over = trialState(NOW - DAY, { trialReset: true, trialNotice: true });
  assert.deepEqual(plain(S.initial(over, false, NOW)), over);
  assert.deepEqual(plain(S.initial(trialState(NOW - DAY), false, NOW)), trialState(NOW - DAY));
});

check('broken stored values fall back to the first-run decision', () => {
  assert.deepEqual(plain(S.initial({ unlocked: 'yes' }, true, NOW)), trialState(NOW + 7 * DAY));
  assert.deepEqual(plain(S.initial([], false, 5)), open('legacy', 5));
  assert.deepEqual(plain(S.initial({ unlocked: true, how: '<script>', at: -1, trialUntil: 'x' }, true, NOW)), open('', 0));
  assert.deepEqual(plain(S.initial({ unlocked: false, trialUntil: -4, trialReset: 'yes' }, false, NOW)), trialState(NOW + 7 * DAY));
});

check('extras are open during the trial and locked afterwards', () => {
  const running = trialState(NOW + 2 * DAY);
  assert.equal(S.inTrial(running, NOW), true);
  assert.equal(S.isLocked('theme', 'synthwave', running, NOW), false);
  assert.equal(S.isLocked('vizStyle', 'particles', running, NOW), false);
  assert.equal(S.trialDaysLeft(running, NOW), 2);
  assert.equal(S.trialDaysLeft(trialState(NOW + 60 * 1000), NOW), 1);
  const over = trialState(NOW);
  assert.equal(S.inTrial(over, NOW), false);
  assert.equal(S.trialDaysLeft(over, NOW), 0);
  assert.equal(S.isLocked('theme', 'synthwave', over, NOW), true);
  assert.equal(S.isLocked('theme', 'nacht', over, NOW), false);
  // Unlocked profiles never count as "in trial".
  assert.equal(S.inTrial(Object.assign(open('code', 1), { trialUntil: NOW + DAY }), NOW), false);
  assert.equal(S.isExtra('background', 'custom'), true);
  assert.equal(S.isExtra('background', 'none'), false);
});

check('an expired trial resets active extras to the free defaults once', () => {
  const ending = trialState(NOW - 1);
  assert.equal(S.trialExpired(ending, NOW), true);
  assert.equal(S.trialExpired(trialState(NOW + DAY), NOW), false);
  assert.equal(S.trialExpired(open('legacy', 1), NOW), false);
  assert.equal(S.trialExpired(trialState(0), NOW), false);
  assert.deepEqual(plain(S.FREE_DEFAULTS), { theme: 'nacht', background: 'none', lyricsEffect: 'pop', vizStyle: 'radial' });
  assert.deepEqual(
    plain(S.resetPlan({ theme: 'synthwave', background: 'custom', lyricsEffect: 'neon', vizStyle: 'mirror', volume: 1 })),
    { theme: 'nacht', background: 'none', lyricsEffect: 'pop', vizStyle: 'radial' }
  );
  // Free choices stay as they are.
  assert.deepEqual(plain(S.resetPlan({ theme: 'dracula', background: 'aurora', lyricsEffect: 'karaoke', vizStyle: 'bars' })), {});
  assert.deepEqual(plain(S.resetPlan({ theme: 'gold', background: 'none' })), { theme: 'nacht' });
  assert.deepEqual(plain(S.resetPlan(null)), {});
  const reset = S.markTrialReset(ending);
  assert.equal(S.trialExpired(reset, NOW), false);
  assert.equal(S.trialNoticeDue(reset), true);
  const noticed = S.markTrialNotice(reset);
  assert.equal(S.trialNoticeDue(noticed), false);
  assert.equal(S.trialNoticeDue(ending), false);
  // Unlocking with the code makes the card unnecessary.
  assert.equal(S.trialNoticeDue(Object.assign(open('code', 1), { trialReset: true })), false);
});

check('unlocking records how and ends the trial', () => {
  assert.deepEqual(plain(S.unlock('free', 9)), open('free', 9));
  assert.deepEqual(plain(S.unlock('code', 9)), open('code', 9));
  assert.deepEqual(plain(S.unlock('weird', 9)), open('code', 9));
});

check('the Ko-fi hint needs 10 hours, at most once in 30 days, and can be switched off', () => {
  const hours = (h) => h * 60 * 60;
  assert.equal(S.hintDue(null, hours(9.9), NOW), false);
  assert.equal(S.hintDue(null, hours(10), NOW), true);
  assert.equal(S.hintDue({ at: NOW - 10 * DAY }, hours(50), NOW), false);
  assert.equal(S.hintDue({ at: NOW - 30 * DAY }, hours(50), NOW), true);
  assert.equal(S.hintDue({ at: 0, off: true }, hours(50), NOW), false);
  assert.equal(S.hintDue('kaputt', 'viel', NOW), false);
  const shown = S.hintShown(null, NOW);
  assert.deepEqual(plain(shown), { at: NOW, off: false });
  assert.equal(S.hintDue(shown, hours(50), NOW + DAY), false);
  assert.deepEqual(plain(S.hintOff(shown)), { at: NOW, off: true });
});

console.log(`\n${checks} passed, 0 failed`);
