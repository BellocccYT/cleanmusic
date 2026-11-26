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

check('the fifteen motion styles are known, frame styles exclude the stacked one', () => {
  assert.deepEqual(plain(LV.STYLES), ['lyricvideo', 'poster', 'brush', 'cinema', 'glitch', 'collage', 'synthwave', 'comic', 'cards', 'revolt', 'story', 'diary', 'news', 'terminal', 'tunnel']);
  assert.deepEqual(plain(LV.FRAME_STYLES), ['poster', 'brush', 'cinema', 'glitch', 'collage', 'synthwave', 'comic', 'cards', 'revolt', 'story', 'diary', 'news', 'terminal', 'tunnel']);
  assert.equal(LV.isStyle('poster'), true);
  assert.equal(LV.isStyle('glitch'), true);
  assert.equal(LV.isStyle('collage'), true);
  assert.equal(LV.isStyle('synthwave'), true);
  assert.equal(LV.isStyle('comic'), true);
  assert.equal(LV.isStyle('cards'), true);
  assert.equal(LV.isStyle('revolt'), true);
  assert.equal(LV.isStyle('story'), true);
  assert.equal(LV.isStyle('diary'), true);
  assert.equal(LV.isStyle('news'), true);
  assert.equal(LV.isStyle('terminal'), true);
  assert.equal(LV.isStyle('tunnel'), true);
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

/* --- 2.2.0: glitch, collage, synthwave, comic ------------------------------- */

check('glitch colours: dark ground, bright words, two readable ghosts', () => {
  assert.deepEqual(plain(LV.glitchColors(null)), {
    bg: '#06070e', fg: '#eef3ff', accent: '#ff2e88', ghostA: '#22d3ee', ghostB: '#ff3ea5', line: '#46557a',
  });
  for (const colors of covers) {
    const c = LV.glitchColors(colors);
    assert.match(c.bg, /^#[0-9a-f]{6}$/);
    assert.ok(LV.contrast(c.fg, c.bg) >= 12, `white type readable (${colors && colors[0]})`);
    assert.ok(LV.contrast(c.accent, c.bg) >= 4.5, 'accent readable');
    assert.ok(LV.contrast(c.ghostA, c.bg) >= 4, 'ghost A visible');
    assert.ok(LV.contrast(c.ghostB, c.bg) >= 4, 'ghost B visible');
    assert.ok(LV.contrast('#ffffff', c.bg) >= 12, 'ground stays dark');
  }
});

check('collage palette: three paper tones, readable ink and a cut-out accent', () => {
  const base = LV.collagePalette(null);
  assert.deepEqual(plain(base.papers), ['#f6edda', '#efe0c4', '#fbf7ee']);
  for (const colors of covers) {
    const c = LV.collagePalette(colors);
    assert.equal(c.papers.length, 3);
    assert.equal(new Set(c.papers).size, 3, 'paper tones differ');
    c.papers.forEach((paper) => {
      assert.match(paper, /^#[0-9a-f]{6}$/);
      assert.ok(LV.contrast(c.inks[0], paper) >= 9, 'ink readable on every paper');
      assert.ok(LV.contrast(c.accent, paper) >= 4, 'accent readable on paper');
    });
    assert.ok(LV.contrast(c.tape, c.papers[0]) >= 1.1);
  }
});

check('synthwave colours: dark night sky, readable chrome and neon grid', () => {
  const base = LV.synthColors(null);
  assert.equal(base.grid, '#ff3ea5');
  for (const colors of covers) {
    const c = LV.synthColors(colors);
    assert.ok(LV.contrast('#ffffff', c.sky) >= 12, `sky dark (${colors && colors[0]})`);
    assert.ok(LV.contrast(c.chromeMid, c.sky) >= 6.5, 'chrome mid readable');
    assert.ok(LV.contrast(c.chromeLow, c.sky) >= 4.5, 'chrome low readable');
    assert.ok(LV.contrast(c.grid, c.sky) >= 3.5, 'grid visible');
    assert.ok(LV.contrast(c.key, c.sky) >= 6.5, 'key readable');
  }
});

check('comic colours: bright paper, hard ink, loud accent', () => {
  const base = LV.comicColors(null);
  assert.equal(base.ink, '#141414');
  for (const colors of covers) {
    const c = LV.comicColors(colors);
    assert.ok(LV.contrast(c.ink, c.bg) >= 10, `ink readable (${colors && colors[0]})`);
    assert.ok(LV.contrast(c.accent, c.bg) >= 3, 'accent readable');
    assert.ok(LV.contrast(c.bubble, c.bg) >= 1, 'bubble sits on the paper');
  }
});

const frameChunk = { words: [{ text: 'gonna' }, { text: 'fail' }] };
const frameChunkLong = { words: [{ text: 'Preaching' }, { text: 'to' }, { text: 'the' }, { text: 'choir' }] };

check('glitchFrame: deterministic offsets, keyword, calm slice count', () => {
  const a = plain(LV.glitchFrame(frameChunkLong, 42));
  assert.deepEqual(a, plain(LV.glitchFrame(frameChunkLong, 42)), 'deterministic');
  assert.equal(a.key, 0, '"Preaching" is the keyword');
  assert.equal(a.jitter.length, 4);
  a.jitter.forEach((value) => assert.ok(value >= -1 && value <= 1));
  assert.ok(a.bars >= 2 && a.bars <= 4);
  assert.ok(a.shift >= 3 && a.shift < 10);
  assert.equal(LV.glitchFrame(frameChunkLong, 42, { portrait: true }).stack, true);
  assert.equal(LV.glitchFrame(frameChunkLong, 42).stack, false);
});

check('collageFrame: every letter is its own snippet and nothing is lost', () => {
  const a = plain(LV.collageFrame(frameChunkLong, 7));
  assert.deepEqual(a, plain(LV.collageFrame(frameChunkLong, 7)), 'deterministic');
  assert.equal(a.key, 0);
  const rebuilt = Object.values(a.letters)
    .flat()
    .map((letter) => letter.ch)
    .join('');
  assert.equal(rebuilt, LV.tokenize(frameChunkLong.words.map((w) => w.text).join(' ')).join(''), 'all letters kept');
  Object.values(a.letters).flat().forEach((letter) => {
    assert.ok(letter.paper >= 0 && letter.paper <= 2);
    assert.ok(['ink', 'accent'].includes(letter.ink));
    assert.ok(letter.face >= 0 && letter.face <= 2);
    assert.ok(letter.rot >= -8 && letter.rot <= 8);
  });
  const portrait = LV.collageFrame(frameChunk, 7, { portrait: true });
  assert.equal(portrait.rows.length, 2, 'upright: one word per row');
  assert.equal(portrait.stack, true);
  const short = { words: [{ text: 'Go' }, { text: 'on' }] };
  const wide = LV.collageFrame(short, 7);
  assert.equal(wide.rows.length, 1, 'wide short pair: one row');
  assert.equal(LV.collageFrame(frameChunk, 7).rows.length, 1, 'nine letters still fit one wide row');
  const longer = { words: [{ text: 'Everything' }, { text: 'forever' }] };
  assert.equal(LV.collageFrame(longer, 7).rows.length, 2, 'very long phrase: stacked even when wide');
});

check('synthFrame and comicFrame: rows, stack and sensible keywords', () => {
  const short = { words: [{ text: 'young' }, { text: 'wild' }] };
  const synth = plain(LV.synthFrame(short, 3));
  assert.deepEqual(synth, plain(LV.synthFrame(short, 3)), 'deterministic');
  assert.equal(synth.rows.length, 1);
  assert.ok(synth.key >= 0 && synth.key < 2, 'keyword marked');
  assert.ok(['left', 'right'].includes(synth.skew));
  assert.equal(LV.synthFrame(frameChunkLong, 3).stack, true, 'long phrase: stacked');
  const synthPortrait = LV.synthFrame(frameChunkLong, 3, { portrait: true });
  assert.equal(synthPortrait.stack, true);
  assert.equal(synthPortrait.rows.length, 4);

  const comic = plain(LV.comicFrame(frameChunkLong, 5));
  assert.deepEqual(comic, plain(LV.comicFrame(frameChunkLong, 5)), 'deterministic');
  assert.ok(comic.key >= 0 && comic.key < 4);
  assert.ok(['burst', 'round', 'cloud'].includes(comic.bubble));
  assert.ok(comic.tilt >= -3 && comic.tilt <= 3);
  assert.equal(LV.comicFrame(frameChunk, 5, { portrait: true }).stack, true);
  const filler = LV.comicFrame({ words: [{ text: 'the' }] }, 5);
  assert.equal(filler.key, -1, 'a filler never becomes the key word');
  const empty = LV.comicFrame({ words: [] }, 5);
  assert.equal(empty.key, -1);
  assert.equal(empty.accent, -1, 'no accent without words');
});

/* --- 2.2.0: lyric-aware cards, revolt, story ------------------------------- */

check('motifOf reads love, money, night, city and fire from the line', () => {
  assert.equal(LV.motifOf('My heart is on fire').id, 'love');
  assert.equal(LV.motifOf('A lot of money, be my own housewife').id, 'money');
  assert.equal(LV.motifOf('Acres of open stars in the dark night').id, 'night');
  assert.equal(LV.motifOf('Drive fast through the city').id, 'city');
  assert.equal(LV.motifOf('We fight until the war is over').id, 'fight');
  assert.equal(LV.motifOf('Rain on the sea').id, 'sea');
  assert.equal(LV.motifOf('Mein Herz brennt').id, 'love');
  // Neutral lines get a deterministic fallback.
  const a = plain(LV.motifOf('la la la', 42));
  assert.deepEqual(a, plain(LV.motifOf('la la la', 42)));
  assert.ok(['star', 'night', 'eye', 'flower', 'love'].includes(a.id));
  assert.equal(LV.motifOf('sex on the side').suit, 'heart');
  assert.equal(LV.motifOf('cash and gold').suit, 'diamond');
});

check('card/revolt/story colours stay readable on every cover', () => {
  for (const colors of covers) {
    const cards = LV.cardsColors(colors);
    assert.ok(LV.contrast(cards.ink, cards.paper) >= 12, `card ink (${colors && colors[0]})`);
    assert.ok(LV.contrast(cards.accent, cards.paper) >= 4.5, 'card printing ink');
    const red = LV.revoltColors(colors, 'red');
    const black = LV.revoltColors(colors, 'black');
    assert.ok(LV.contrast(red.fg, red.bg) >= 4.5, 'red poster type');
    assert.ok(LV.contrast(red.accent, red.bg) >= 3.5, 'red poster accent');
    assert.ok(LV.contrast(black.fg, black.bg) >= 12, 'black poster type');
    const story = LV.storyColors(colors);
    assert.ok(LV.contrast(story.fg, story.bg) >= 10, 'story type');
    assert.ok(LV.contrast(story.accent, story.bg) >= 3.5, 'story accent');
  }
});

check('cardsFrame derives cards and symbols from the words', () => {
  const love = plain(LV.cardsFrame(frameChunkLong, 11, { text: 'Be my sex on the side' }));
  assert.deepEqual(love, plain(LV.cardsFrame(frameChunkLong, 11, { text: 'Be my sex on the side' })), 'deterministic');
  assert.equal(love.motif.id, 'love');
  assert.equal(love.cards[0].icon, 'heart');
  assert.equal(love.cards[0].suit, 'heart');
  assert.ok(love.cards.length >= 2 && love.cards.length <= 3);
  love.cards.forEach((card) => {
    assert.ok(card.rot >= -15 && card.rot <= 25);
    assert.ok(card.scale > 0.8 && card.scale <= 1);
  });
  const money = LV.cardsFrame(frameChunk, 11, { text: 'A lot of money' });
  assert.equal(money.motif.id, 'money');
  assert.equal(money.cards[0].icon, 'coin');
  assert.equal(LV.cardsFrame(frameChunkLong, 11, { text: 'Be my sex', portrait: true }).stack, true);
});

check('revoltFrame picks a red poster for hot lines and keeps calm ones quieter', () => {
  const hot = plain(LV.revoltFrame(frameChunkLong, 9, { text: 'We fight the fire' }));
  assert.deepEqual(hot, plain(LV.revoltFrame(frameChunkLong, 9, { text: 'We fight the fire' })), 'deterministic');
  assert.equal(hot.tone, 'red');
  assert.ok(hot.slashes >= 3, 'hot lines get more slashes');
  assert.equal(hot.motif.id, 'fire');
  const calm = LV.revoltFrame(frameChunkLong, 9, { text: 'A quiet afternoon' });
  assert.ok(['red', 'black'].includes(calm.tone));
  assert.ok(calm.slashes >= 1 && calm.slashes <= 3);
  assert.equal(LV.revoltFrame(frameChunkLong, 9, { text: 'We fight the fire', portrait: true }).stack, true);
});

check('storyFrame turns the line into a scene and keeps every word', () => {
  const drive = plain(LV.storyFrame(frameChunkLong, 4, { text: 'Drive fast out of here' }));
  assert.deepEqual(drive, plain(LV.storyFrame(frameChunkLong, 4, { text: 'Drive fast out of here' })), 'deterministic');
  assert.equal(drive.motif.id, 'city');
  assert.equal(drive.scene, 'city');
  assert.equal(drive.caption, 'CITY');
  assert.equal(LV.storyFrame(frameChunkLong, 4, { text: 'My heart is on fire' }).scene, 'love');
  assert.equal(LV.storyFrame(frameChunkLong, 4, { text: 'Rain on the sea' }).scene, 'sea');
  assert.equal(LV.storyFrame(frameChunkLong, 4, { text: 'Stars in the night' }).scene, 'night');
  assert.equal(LV.storyFrame(frameChunkLong, 4, { text: 'Drive fast', portrait: true }).stack, true);
  const rows = LV.storyFrame(frameChunkLong, 4, { text: 'Drive fast', portrait: true }).rows;
  assert.equal(rows.length, 4, 'upright: one word per row');
});

/* --- 2.2.0: diary, news, terminal, tunnel ---------------------------------- */

check('diary/news/terminal/tunnel colours stay readable', () => {
  for (const colors of covers) {
    const diary = LV.diaryColors(colors);
    assert.ok(LV.contrast(diary.ink, diary.paper) >= 12, `diary ink (${colors && colors[0]})`);
    assert.ok(LV.contrast(diary.accent, diary.paper) >= 4, 'diary accent');
    const news = LV.newsColors(colors);
    assert.ok(LV.contrast(news.ink, news.paper) >= 13, 'news ink');
    assert.ok(LV.contrast(news.accent, news.paper) >= 4.5, 'news spot colour');
    assert.ok(LV.contrast(news.muted, news.paper) >= 4.5, 'news small print');
    const term = LV.terminalColors(colors);
    assert.ok(LV.contrast(term.fg, term.bg) >= 7, 'terminal type');
    assert.ok(LV.contrast(term.accent, term.bg) >= 4.5, 'terminal accent');
    const tunnel = LV.tunnelColors(colors);
    assert.ok(LV.contrast(tunnel.fg, tunnel.bg) >= 12, 'tunnel type');
    assert.ok(LV.contrast(tunnel.accent, tunnel.bg) >= 5, 'tunnel key');
    [tunnel.ring1, tunnel.ring2, tunnel.ring3].forEach((ring) => assert.ok(LV.contrast(ring, tunnel.bg) >= 4, 'tunnel ring'));
  }
});

check('diaryFrame and newsFrame follow the motif and keep their layout', () => {
  const diary = plain(LV.diaryFrame(frameChunkLong, 8, { text: 'My heart is on fire' }));
  assert.deepEqual(diary, plain(LV.diaryFrame(frameChunkLong, 8, { text: 'My heart is on fire' })), 'deterministic');
  assert.equal(diary.motif.id, 'love');
  assert.equal(diary.doodle, 'heart');
  assert.ok(diary.rows.length >= 1);
  const diaryPortrait = LV.diaryFrame(frameChunkLong, 8, { text: 'My heart', portrait: true });
  assert.equal(diaryPortrait.stack, true);

  const news = plain(LV.newsFrame(frameChunkLong, 8, { text: 'The price of fame' }));
  assert.equal(news.motif.id, 'money');
  assert.equal(news.photoIcon, 'coin');
  assert.ok(news.kicker.length >= 4);
  assert.ok(news.columns >= 2 && news.columns <= 3);
  assert.equal(LV.newsFrame(frameChunkLong, 8, { text: 'The price of fame', portrait: true }).stack, true);
});

check('terminalFrame and tunnelFrame set prompt, rings and key', () => {
  const term = plain(LV.terminalFrame(frameChunkLong, 12, { text: 'A lot of money' }));
  assert.deepEqual(term, plain(LV.terminalFrame(frameChunkLong, 12, { text: 'A lot of money' })), 'deterministic');
  assert.equal(term.motif.id, 'money');
  assert.match(term.command, /^play --mood /);
  assert.equal(term.label, 'FORTUNE');
  assert.ok(['$', '>'].includes(term.prompt));
  assert.equal(LV.terminalFrame(frameChunkLong, 12, { text: 'A lot of money', portrait: true }).stack, true);

  const tunnel = plain(LV.tunnelFrame(frameChunkLong, 12, { text: 'Be my sex on the side' }));
  assert.equal(tunnel.motif.id, 'love');
  assert.equal(tunnel.icon, 'heart');
  assert.ok(tunnel.rings >= 5 && tunnel.rings <= 7);
  assert.ok(tunnel.depth >= 0.88 && tunnel.depth <= 1.08);
  assert.equal(LV.tunnelFrame(frameChunkLong, 12, { text: 'Be my sex', portrait: true }).stack, true);
});

console.log(`${checks} passed, 0 failed`);
