'use strict';

/**
 * Unit tests for renderer/audio/volume.js – volume curve and level rules.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'audio', 'volume.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const V = sandbox.window.CMVolume;
assert.ok(V, 'window.CMVolume fehlt');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('max: 100 % normally, 150 % with boost', () => {
  assert.equal(V.max(false), 1);
  assert.equal(V.max(true), 1.5);
  assert.equal(V.max(), 1);
});

check('clampLevel: rounds to two decimals and stays in range', () => {
  assert.equal(V.clampLevel(0.5, 1), 0.5);
  assert.equal(V.clampLevel(1.37, 1.5), 1.37);
  assert.equal(V.clampLevel(1.37, 1), 1, 'ohne Boost gekappt');
  assert.equal(V.clampLevel(-2, 1), 0);
  assert.equal(V.clampLevel(1.23456, 1.5), 1.23);
  assert.equal(V.clampLevel('kaputt', 1), 0);
  assert.equal(V.clampLevel(0.5, 0), 0.5, 'unbrauchbare Obergrenze → 1');
  assert.equal(V.clampLevel(0.5, 'x'), 0.5);
});

check('gain: square curve, mute wins, fade scales', () => {
  assert.equal(V.gain(0.5, false), 0.25);
  assert.equal(V.gain(1, false), 1);
  assert.equal(V.gain(1, true), 0);
  assert.equal(V.gain(0.5, false, 0.5), 0.125);
  assert.equal(V.gain(0.5, false, 2), 0.25, 'Fade geklemmt');
  assert.equal(V.gain(0.5, false, -1), 0);
  // Boost may exceed 1 – the chain handles it, the element path caps it.
  assert.ok(V.gain(1.5, false) > 1);
  assert.equal(V.elementVolume(1.5, false), 1);
  assert.equal(V.elementVolume(0.5, false), 0.25);
  assert.equal(V.elementVolume(0.5, true), 0);
});

check('unmuteLevel: silent stays audible at 50 %', () => {
  assert.equal(V.unmuteLevel(0), 0.5);
  assert.equal(V.unmuteLevel(0.01), 0.5);
  assert.equal(V.unmuteLevel(0.02), 0.02);
  assert.equal(V.unmuteLevel(0.7), 0.7);
  assert.equal(V.unmuteLevel('x'), 0.5);
});

check('adjust: steps are clamped like setVolume', () => {
  assert.equal(V.adjust(0.9, 0.05, 1), 0.95);
  assert.equal(V.adjust(0.98, 0.05, 1), 1);
  assert.equal(V.adjust(0.03, -0.05, 1), 0);
  assert.equal(V.adjust(1.4, 0.05, 1.5), 1.45);
  assert.equal(V.adjust('x', 0.1, 1), 0.1);
});

check('percent and fill for labels and the slider', () => {
  assert.equal(V.percent(0.925), 93);
  assert.equal(V.percent(0), 0);
  assert.equal(V.percent('x'), 0);
  assert.equal(V.fill(0.5, 1), 50);
  assert.equal(V.fill(0.75, 1.5), 50);
  assert.equal(V.fill(1, 1), 100);
  assert.equal(V.fill(0, 1), 0);
});

console.log(`\n${checks} passed, 0 failed`);
