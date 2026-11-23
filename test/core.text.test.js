'use strict';

/**
 * Unit tests for renderer/core/text.js. No Electron, no DOM – just the pure
 * helpers that app.js now imports from CMText.
 *
 * Run with: npm run test:core
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'text.js');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });

const text = sandbox.window.CMText;
assert.ok(text, 'window.CMText fehlt');
assert.equal(typeof text.matchKey, 'function');

let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

check('esc escapes HTML and quotes', () => {
  assert.equal(
    text.esc('<a "b"> & \''),
    '&lt;a &quot;b&quot;&gt; &amp; &#39;'
  );
  assert.equal(text.esc(null), '');
});

check('fmtTime formats and rejects invalid values', () => {
  assert.equal(text.fmtTime(0), '0:00');
  assert.equal(text.fmtTime(5), '0:05');
  assert.equal(text.fmtTime(65), '1:05');
  assert.equal(text.fmtTime(3599), '59:59');
  assert.equal(text.fmtTime(-2), '0:00');
  assert.equal(text.fmtTime(Infinity), '0:00');
});

check('fmtLong formats minutes and hours', () => {
  assert.equal(text.fmtLong(600), '10 Min.');
  assert.equal(text.fmtLong(3600), '1 Std. 0 Min.');
  assert.equal(text.fmtLong(5400), '1 Std. 30 Min.');
});

check('fmtSize formats bytes', () => {
  assert.equal(text.fmtSize(0), '–');
  assert.equal(text.fmtSize(512), '512 B');
  assert.equal(text.fmtSize(1024), '1.0 KB');
  assert.equal(text.fmtSize(1536), '1.5 KB');
});

check('formatList joins with und', () => {
  assert.equal(text.formatList([]), '');
  assert.equal(text.formatList(['A']), 'A');
  assert.equal(text.formatList(['A', 'B']), 'A und B');
  assert.equal(text.formatList(['A', 'B', 'C']), 'A, B und C');
});

check('normKey ignores features and accents', () => {
  assert.equal(text.normKey('Daft Punk feat. Pharrell'), 'daft punk');
  assert.equal(text.normKey('Beyoncé'), 'beyonce');
  assert.equal(text.normKey('  One   More Time!  '), 'one more time');
});

check('matchKey finds Latin duplicates but keeps non-Latin titles apart', () => {
  assert.equal(
    text.matchKey({ artist: 'Daft Punk', title: 'One More Time!' }),
    text.matchKey({ artist: 'DAFT PUNK', title: 'one more time' })
  );
  const a = text.matchKey({ artist: '米津玄師', title: '打上花火' });
  const b = text.matchKey({ artist: '米津玄師', title: 'Lemon' });
  assert.notEqual(a, b);
  assert.notEqual(a, '|');
  assert.equal(text.matchKey({ id: 'x' }), 'id:x');
});

check('primaryArtist keeps the first artist', () => {
  assert.equal(text.primaryArtist('Daft Punk, Pharrell Williams'), 'Daft Punk');
  assert.equal(text.primaryArtist('A & B'), 'A');
  assert.equal(text.primaryArtist('Simon & Garfunkel'), 'Simon');
  assert.equal(text.primaryArtist(''), '');
});

check('seededShuffle is deterministic and keeps the list', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const first = text.seededShuffle(input, 42);
  const second = text.seededShuffle(input, 42);
  assert.deepEqual(first, second);
  assert.deepEqual(first.slice().sort((x, y) => x - y), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
});

check('uid and todayKey have the expected shape', () => {
  assert.ok(text.uid().length >= 8);
  assert.match(text.todayKey(), /^\d{4}-\d{2}-\d{2}$/);
});

console.log(`\n${checks} passed, 0 failed`);
