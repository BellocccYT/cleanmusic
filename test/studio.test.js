'use strict';

/**
 * Unit tests for renderer/core/studio.js – the Studio timeline data model.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'renderer', 'core', 'studio.js');
const sandbox = { window: {}, Date };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
const S = sandbox.window.CMStudio;
assert.ok(S, 'window.CMStudio fehlt');

const plain = (value) => JSON.parse(JSON.stringify(value));
let checks = 0;
function check(name, run) {
  run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const clip = (over = {}) =>
  Object.assign(
    {
      key: 'c1',
      title: 'Fluffing a Duck',
      artist: 'Kevin MacLeod',
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      credit: '"Fluffing a Duck" Kevin MacLeod (incompetech.com)',
      source: 'incompetech',
      url: 'https://incompetech.com/x.mp3',
      link: 'https://incompetech.com/x',
      in: 0,
      out: 10,
      duration: 10,
    },
    over
  );

check('clips are normalised and clamped', () => {
  const c = S.normalizeClip(clip({ in: -3, out: 99, fadeIn: 20, fadeOut: -1, loopMs: 9 }));
  assert.equal(c.in, 0);
  assert.equal(c.out, 99);
  assert.equal(c.fadeIn, 5);
  assert.equal(c.fadeOut, 0);
  assert.equal(c.loopMs, 50);
  assert.equal(S.normalizeClip({}), null);
  assert.equal(S.normalizeClip(null), null);
  assert.equal(S.normalizeClip({ key: '' }), null);
});

check('legacy projects (items) lift into clips, new projects keep clips', () => {
  const legacy = S.normalizeProject({ id: 'p1', name: 'Alt', items: [{ key: 'a', title: 'T', credit: 'C', license: 'CC0' }] });
  assert.equal(legacy.clips.length, 1);
  assert.equal(legacy.clips[0].title, 'T');
  assert.equal(legacy.clips[0].out, 0, 'legacy items have no trim');
  const fresh = S.normalizeProject({ id: 'p2', name: 'Neu', clips: [clip()] });
  assert.equal(fresh.clips.length, 1);
  assert.equal(fresh.clips[0].out, 10);
});

check('clipOf maps an entry into a full-range clip', () => {
  const c = S.clipOf({ id: 'deezer:1', title: 'Song', artist: 'Artist', license: 'CC BY 3.0', url: 'https://a/b.mp3', link: 'https://a/b', duration: 42, sourceLabel: 'Openverse' }, 'k');
  assert.equal(c.key, 'k');
  assert.equal(c.in, 0);
  assert.equal(c.out, 42);
  assert.equal(c.duration, 42);
  assert.equal(c.source, 'Openverse');
});

check('timeline layout places clips sequentially', () => {
  const layout = S.timelineLayout([clip({ key: 'a', out: 10 }), clip({ key: 'b', in: 2, out: 7 })]);
  assert.equal(layout.total, 15);
  assert.deepEqual(
    layout.rows.map((row) => [row.key, row.start, row.end]),
    [['a', 0, 10], ['b', 10, 15]]
  );
  assert.equal(S.totalDuration([clip({ out: 10 }), clip({ in: 2, out: 7 })]), 15);
});

check('licence key and stream-safety follow the app rules', () => {
  assert.equal(S.licenseKey('CC0'), 'free');
  assert.equal(S.licenseKey('Public Domain'), 'free');
  assert.equal(S.licenseKey('CC BY 4.0'), 'by');
  assert.equal(S.licenseKey('NCS'), 'ncs');
  assert.equal(S.licenseKey('© alle Rechte'), 'other');
  assert.equal(S.isStreamSafe([clip({ license: 'CC0' }), clip({ license: 'CC BY 3.0' })]), true);
  assert.equal(S.isStreamSafe([clip({ license: 'CC0' }), clip({ license: '©' })]), false);
});

check('credit text groups by licence, dedupes and lists changes', () => {
  const project = {
    id: 'p',
    name: 'Mein Video',
    clips: [
      clip({ key: 'a', license: 'CC BY 4.0', out: 10, fadeIn: 0.5 }),
      clip({ key: 'b', license: 'CC0', credit: 'Sound B (CC0)', in: 2, out: 8, normalize: true }),
      clip({ key: 'c', license: 'CC BY 4.0', out: 5 }),
    ],
  };
  const text = S.studioCreditText(project);
  assert.match(text, /Mein Video/);
  assert.match(text, /CC BY 4\.0/);
  assert.match(text, /CC0/);
  assert.match(text, /Änderungen/);
  assert.match(text, /Fade-in 0\.5 s/);
  assert.match(text, /normalisiert/);
  // The same credit (clips a and c) is deduped to one line in the credits.
  assert.equal((text.match(/incompetech\.com/g) || []).length, 1, 'credit appears once');
  // Changes document the trim/effects of the clips that were cut.
  assert.ok((text.match(/Änderungen:\n-/g) || []).length >= 1);
  assert.equal(S.studioCreditText({ clips: [] }), '');
});

check('presets are present and only WAV renders today', () => {
  assert.ok(S.PRESETS.length >= 3);
  assert.ok(S.PRESETS.every((preset) => preset.format === 'wav'));
  assert.ok(S.PRESETS.some((preset) => preset.id === 'video'));
});

console.log(`${checks} passed, 0 failed`);
