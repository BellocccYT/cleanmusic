'use strict';

/**
 * Unit tests for renderer/core/lyricvideo.js – the "Lyric Video" layout and
 * word-timing helpers.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'lyricvideo.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const LV = sandbox.window.CMLyricVideo;
assert.ok(LV, 'window.CMLyricVideo fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('filler words are recognised (German + English, with punctuation)', () => {
  assert.equal(LV.isFiller('the'), true);
  assert.equal(LV.isFiller('TO,'), true);
  assert.equal(LV.isFiller('I'), true);
  assert.equal(LV.isFiller('und'), true);
  assert.equal(LV.isFiller('der'), true);
  assert.equal(LV.isFiller('choir'), false);
  assert.equal(LV.isFiller('PREACHING'), false);
  assert.equal(LV.isFiller('Herz'), false);
});

check('the keyword is the longest/rarest non-filler word', () => {
  assert.equal(LV.chooseKeyword(['preaching', 'to', 'the', 'choir']), 'preaching');
  assert.equal(LV.chooseKeyword(['und', 'meer', 'der', 'nacht']), 'nacht');
  // Two equal-length candidates: the rarest (fewer occurrences) wins.
  assert.equal(LV.chooseKeyword(['love', 'love', 'hate']), 'hate');
  // Only fillers: fall back to any word, deterministically the first.
  assert.equal(LV.chooseKeyword(['the', 'to', 'and']), 'the');
});

check('layoutLine is deterministic for the same seed and text', () => {
  const a = plain(LV.layoutLine('Preaching to the choir', LV.normWord('x')));
  const b = plain(LV.layoutLine('Preaching to the choir', LV.normWord('x')));
  assert.deepEqual(a, b);
});

check('layoutLine splits words into stacked blocks and marks one accent keyword', () => {
  const seed = LV.normWord('Preaching to the choir').charCodeAt(0) || 1;
  const layout = LV.layoutLine('Preaching to the choir', seed);
  assert.equal(layout.accent, 'Preaching');
  assert.ok(layout.blocks.length >= 1 && layout.blocks.length <= 3, '2–4 words per block');
  const flat = layout.blocks.flat();
  assert.equal(flat.length, 4);
  const styles = new Set(flat.map((w) => w.style));
  assert.ok(styles.has('accent'), 'exactly the keyword carries accent');
  assert.equal(flat.filter((w) => w.style === 'accent').length, 1, 'one accent keyword');
  assert.ok(['filled', 'outline'].some((s) => styles.has(s)), 'other words are filled/outline');
});

check('layoutLine supports single-word frames and vertical words', () => {
  const single = LV.layoutLine('GET', 1);
  assert.equal(single.single, true);
  assert.equal(single.blocks.length, 1);
  assert.equal(single.accent, 'GET');
  // A longer line may pick a vertical word and a huge word.
  const sawVertical = [];
  for (let seed = 1; seed < 40; seed += 1) {
    const layout = LV.layoutLine('Im dunklen Meer der Nacht', seed);
    const flat = layout.blocks.flat();
    if (flat.some((w) => w.style === 'vertical')) sawVertical.push(seed);
  }
  assert.ok(sawVertical.length > 0, 'some lines produce a vertical word');
  // The accent keyword is never also the vertical word.
  for (let seed = 1; seed < 40; seed += 1) {
    const layout = LV.layoutLine('Im dunklen Meer der Nacht', seed);
    if (!layout.vertical) continue;
    assert.notEqual(LV.normWord(layout.vertical), LV.normWord(layout.accent));
  }
});

check('layoutLine chooses dark or light backgrounds and stable single/dark flags', () => {
  const seen = { dark: 0, light: 0 };
  for (let seed = 1; seed < 40; seed += 1) {
    const layout = LV.layoutLine('Im dunklen Meer der Nacht', seed);
    if (layout.dark) seen.dark += 1;
    else seen.light += 1;
  }
  assert.ok(seen.dark > 0 && seen.light > 0, 'both light and dark appear');
  const again = LV.layoutLine('Im dunklen Meer der Nacht', 7);
  const again2 = LV.layoutLine('Im dunklen Meer der Nacht', 7);
  assert.equal(again.dark, again2.dark);
  assert.equal(again.single, again2.single);
});

check('wordTimes uses enhanced-LRC word marks when present', () => {
  const line = {
    time: 10,
    text: 'Preaching to the choir',
    words: [
      { time: 10, text: 'Preaching' },
      { time: 10.8, text: 'to' },
      { time: 11.1, text: 'the' },
      { time: 11.4, text: 'choir' },
    ],
  };
  assert.deepEqual(plain(LV.wordTimes(line, 12)), plain(line.words));
});

check('wordTimes spreads words by syllable weight without marks', () => {
  const times = LV.wordTimes({ time: 0, text: 'Preaching to the choir' }, 4);
  assert.equal(times.length, 4);
  assert.equal(times[0].time, 0);
  assert.equal(times[0].text, 'Preaching');
  assert.ok(times[3].time > times[0].time);
  assert.ok(times[3].time < 4);
  // The last word stays before nextLineTime.
  assert.ok(times[times.length - 1].time <= 4);
});

check('wordTimes is safe for empty lines and missing next time', () => {
  assert.deepEqual(plain(LV.wordTimes({ time: 3, text: '' }, 9)), []);
  const one = LV.wordTimes({ time: 3, text: 'Solo' }, undefined);
  assert.equal(one.length, 1);
  assert.equal(one[0].time, 3);
});

console.log(`${checks} passed, 0 failed`);
