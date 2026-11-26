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

/* --- 2.1.1: motion lyric styles (poster, brush, cinema) --------------------- */

check('the four motion styles are known, frame styles exclude the stacked one', () => {
  assert.deepEqual(plain(LV.STYLES), ['lyricvideo', 'poster', 'brush', 'cinema']);
  assert.deepEqual(plain(LV.FRAME_STYLES), ['poster', 'brush', 'cinema']);
  assert.equal(LV.isStyle('poster'), true);
  assert.equal(LV.isStyle('karaoke'), false);
  assert.equal(LV.letterCount("i'm"), 2);
  assert.equal(LV.letterCount('愛してる'), 4, 'non-Latin letters count');
});

const longLine = { time: 10, text: "Truth is, it's more like loads of cash and a nice guy and a life lived right" };

check('chunkLine keeps every word once, in order, within the word/letter rules', () => {
  for (const style of LV.FRAME_STYLES) {
    const rules = LV.CHUNK_RULES[style];
    const chunks = LV.chunkLine(longLine, 18, style);
    const words = chunks.flatMap((c) => c.words.map((w) => w.text));
    assert.deepEqual(words, LV.tokenize(longLine.text), `${style}: all words in order`);
    for (const chunk of chunks) {
      const weight = chunk.words.reduce((s, w) => s + (LV.isFiller(w.text) ? 0.5 : 1), 0);
      assert.ok(chunk.words.length >= 1 && chunk.words.length <= rules.words + 1, `${style}: words per frame`);
      assert.ok(chunk.words.length === 1 || weight <= rules.words, `${style}: fillers count half`);
      const letters = chunk.words.reduce((s, w) => s + LV.letterCount(w.text), 0);
      // A single long word may exceed the letter budget, groups never do by much.
      assert.ok(chunk.words.length === 1 || letters <= rules.letters + 6, `${style}: letters per frame`);
    }
  }
});

check('chunkLine timing covers the line without gaps and in order', () => {
  const chunks = LV.chunkLine(longLine, 18, 'poster');
  assert.equal(chunks[0].start, 10, 'first frame starts with the line');
  assert.equal(chunks[chunks.length - 1].end, 18, 'last frame ends at the next line');
  for (let i = 1; i < chunks.length; i += 1) {
    assert.equal(chunks[i].start, chunks[i - 1].end, 'frames touch');
    assert.ok(chunks[i].start >= chunks[i - 1].start, 'frames are ordered');
  }
});

check('chunkLine ends a frame after punctuation and never on a trailing filler', () => {
  const chunks = LV.chunkLine(longLine, 18, 'poster');
  assert.deepEqual(plain(chunks[0].words.map((w) => w.text)), ['Truth', 'is,']);
  for (let i = 0; i < chunks.length - 1; i += 1) {
    const words = chunks[i].words;
    const last = words[words.length - 1].text;
    assert.ok(words.length === 1 || !LV.isFiller(last) || /[,.!?]$/.test(last), `frame ${i} ends on filler "${last}"`);
  }
});

check('chunkLine handles empty lines, single words and enhanced-LRC marks', () => {
  const empty = LV.chunkLine({ time: 4, text: '' }, 9, 'brush');
  assert.equal(empty.length, 1);
  assert.equal(empty[0].words.length, 0);
  assert.equal(empty[0].start, 4);
  assert.equal(empty[0].end, 9);
  const solo = LV.chunkLine({ time: 1, text: 'Unbelievable' }, undefined, 'cinema');
  assert.equal(solo.length, 1);
  assert.equal(solo[0].end, 5, 'missing next time: 4 s');
  const marked = LV.chunkLine({
    time: 0,
    text: 'oh no oh i am gonna fail',
    words: [
      { time: 0, text: 'oh' }, { time: 0.4, text: 'no' }, { time: 0.8, text: 'oh' },
      { time: 1.6, text: 'i' }, { time: 1.8, text: 'am' }, { time: 2.0, text: 'gonna' }, { time: 2.6, text: 'fail' },
    ],
  }, 4, 'poster');
  assert.ok(marked.length >= 2);
  marked.slice(1).forEach((chunk) => assert.equal(chunk.start, chunk.words[0].time, 'frame starts at its first word mark'));
});

check('activeChunk follows the time and frameOffsets counts frames per line', () => {
  const chunks = LV.chunkLine(longLine, 18, 'cinema');
  assert.equal(LV.activeChunk(chunks, 0), 0, 'before the line: first frame');
  assert.equal(LV.activeChunk(chunks, 10), 0);
  assert.equal(LV.activeChunk(chunks, 17.9), chunks.length - 1);
  assert.equal(LV.activeChunk([], 3), -1);
  const lines = [{ time: 0, text: 'Eins zwei drei vier fünf sechs' }, { time: 3, text: 'Sieben' }, { time: 5, text: '' }];
  const offsets = LV.frameOffsets(lines, 'poster');
  assert.equal(offsets.length, 4);
  assert.equal(offsets[0], 0);
  assert.equal(offsets[1], LV.chunkLine(lines[0], 3, 'poster').length);
  assert.equal(offsets[2], offsets[1] + 1);
  assert.equal(offsets[3], offsets[2] + 1);
});

check('swatchIndex never repeats a background on consecutive frames', () => {
  for (const n of [3, 4, 5]) {
    for (let k = 1; k < 200; k += 1) {
      assert.notEqual(LV.swatchIndex(k, n), LV.swatchIndex(k - 1, n), `n=${n} k=${k}`);
      assert.ok(LV.swatchIndex(k, n) >= 0 && LV.swatchIndex(k, n) < n);
    }
  }
});

// A spread of cover colours, including grey, near-black and near-white.
const covers = [null, ['#5b8cff', '#35e0c0'], ['#ff2d78', '#ff2d78'], ['#808080', '#7a7a7a'], ['#050505', '#101010'],
  ['#fafafa', '#f0f0f0'], ['#d4a017', '#1e90ff'], ['#2e8b57', '#c71585'], ['#8b0000', '#ff8c00'], ['#4b0082', '#00ced1']];

check('poster colours: three pastel swatches, readable small words, changing backgrounds', () => {
  assert.deepEqual(plain(LV.posterPalette(null)), plain(LV.POSTER_SWATCHES));
  for (const colors of covers) {
    const palette = LV.posterPalette(colors);
    assert.equal(palette.length, 3);
    palette.forEach((c) => assert.match(c, /^#[0-9a-f]{6}$/));
    let prev = '';
    for (let k = 0; k < 12; k += 1) {
      const frame = LV.posterColors(palette, k);
      assert.notEqual(frame.bg, prev, 'background changes per frame');
      prev = frame.bg;
      assert.ok(LV.contrast(frame.small, frame.bg) >= 1.9, `small words readable (${colors && colors[0]}, k=${k})`);
      assert.ok(LV.contrast(frame.big, frame.bg) >= 1.45, 'giant word stands out');
    }
  }
});

check('brush colours keep the paint readable on the background', () => {
  assert.deepEqual(plain(LV.brushColors(null)).bg, '#7a2b52');
  for (const colors of covers) {
    const c = LV.brushColors(colors);
    assert.ok(LV.contrast(c.fg, c.bg) >= 3, `paint contrast (${colors && colors[0]})`);
    assert.ok(LV.contrast('#ffffff', c.bg) >= 4.5, 'background stays strong/dark');
  }
});

check('cinema colours: dark ground, bright words, glow from colourful covers', () => {
  const plainCinema = LV.cinemaColors(null);
  assert.equal(plainCinema.glow, '#e4561a');
  assert.equal(LV.cinemaColors(['#808080', '#7a7a7a']).glow, '#e4561a', 'grey cover keeps the fire glow');
  assert.notEqual(LV.cinemaColors(['#5b8cff', '#35e0c0']).glow, '#e4561a', 'colourful cover tints the glow');
  for (const colors of covers) {
    const c = LV.cinemaColors(colors);
    assert.ok(LV.contrast(c.fg, c.bg) >= 12);
    assert.ok(LV.contrast(c.key, c.bg) >= 8);
  }
});

check('posterFrame: one giant keyword, the rest small, shapes near the edges', () => {
  const chunk = { words: [{ text: 'gonna' }, { text: 'fail' }] };
  const a = plain(LV.posterFrame(chunk, 42));
  assert.deepEqual(a, plain(LV.posterFrame(chunk, 42)), 'deterministic');
  assert.equal(a.big.text, 'fail', '"gonna" is a filler, "fail" becomes the giant word');
  assert.deepEqual(a.small.indexes, [0]);
  assert.ok(a.shapes.length >= 1 && a.shapes.length <= 3);
  a.shapes.forEach((s) => assert.ok(s.x <= 24 || s.x >= 76, 'shape at an edge'));
  const solo = LV.posterFrame({ words: [{ text: 'Oh!' }] }, 3);
  assert.equal(solo.big.text, 'Oh!');
  assert.equal(solo.big.anchor, 'middle');
  assert.deepEqual(solo.small.indexes, []);
  const kinds = new Set();
  for (let seed = 1; seed < 60; seed += 1) LV.posterFrame(chunk, seed).shapes.forEach((s) => kinds.add(s.kind));
  assert.ok(kinds.has('flower') && kinds.has('cross') && kinds.has('circle'), 'all shape kinds appear');
});

check('brushFrame and cinemaFrame are deterministic and mark sensible keywords', () => {
  const two = { words: [{ text: 'Copy' }, { text: 'everything' }] };
  assert.deepEqual(plain(LV.brushFrame(two, 9)), plain(LV.brushFrame(two, 9)));
  assert.equal(LV.brushFrame(two, 9).rows.length, 2, 'long pair: two rows');
  assert.equal(LV.brushFrame({ words: [{ text: 'Go' }, { text: 'on' }] }, 9).rows.length, 1);
  assert.equal(LV.brushFrame({ words: [{ text: 'Go' }, { text: 'on' }] }, 9, { portrait: true }).rows.length, 2, 'upright screen: one word per row');
  const cinema = LV.cinemaFrame({ words: [{ text: 'so' }, { text: 'young' }] }, 5);
  assert.equal(cinema.key, 1, 'keyword marked');
  assert.ok(['left', 'right'].includes(cinema.from));
  assert.equal(LV.cinemaFrame({ words: [{ text: 'the' }] }, 5).key, -1, 'a filler is never the keyword');
  assert.equal(LV.cinemaHeart('So dance alone', 1), true);
  assert.equal(LV.cinemaHeart('Mein Herz brennt', 1), true);
  let hearts = 0;
  for (let seed = 1; seed < 200; seed += 1) if (LV.cinemaHeart('Up the stairs', seed)) hearts += 1;
  assert.ok(hearts > 5 && hearts < 70, `rare hearts otherwise (${hearts}/199)`);
});

console.log(`${checks} passed, 0 failed`);
