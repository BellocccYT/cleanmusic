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

check('stall guard waits for 12 s of a running, non-radio title', () => {
  const running = {
    hasSrc: true,
    paused: false,
    ended: false,
    seeking: false,
    kind: 'plugin',
    mode: 'plugin',
    stalledFor: 11999,
  };
  assert.equal(P.STALL_MS, 12000);
  assert.equal(P.stallDecision(running), 'wait');
  assert.equal(P.stallDecision({ ...running, stalledFor: 12000 }), 'fail');
  assert.equal(P.stallDecision({ ...running, stalledFor: 15000 }), 'fail');
});

check('stall guard leaves pauses, seeks, radio, local and handled titles alone', () => {
  const running = {
    hasSrc: true,
    paused: false,
    ended: false,
    seeking: false,
    kind: 'preview',
    mode: 'preview',
    stalledFor: 20000,
  };
  assert.equal(P.stallDecision({ ...running, paused: true }), 'wait');
  assert.equal(P.stallDecision({ ...running, ended: true }), 'wait');
  assert.equal(P.stallDecision({ ...running, seeking: true }), 'wait');
  assert.equal(P.stallDecision({ ...running, kind: 'radio' }), 'wait');
  assert.equal(P.stallDecision({ ...running, kind: 'local' }), 'wait');
  assert.equal(P.stallDecision({ ...running, mode: 'loading' }), 'wait');
  assert.equal(P.stallDecision({ ...running, mode: 'error' }), 'wait');
  assert.equal(P.stallDecision({ ...running, handled: true }), 'wait');
  assert.equal(P.stallDecision({ ...running, hasSrc: false }), 'wait');
  assert.equal(P.stallDecision({ ...running, stalledFor: NaN }), 'wait');
  assert.equal(P.stallDecision(null), 'wait');
});

check('mediaOrigin: scheme + host, default ports dropped, nothing else', () => {
  assert.equal(P.mediaOrigin('https://rr2---sn-abc.googlevideo.com/videoplayback?id=1'), 'https://rr2---sn-abc.googlevideo.com');
  assert.equal(P.mediaOrigin('HTTPS://Example.COM:443/a'), 'https://example.com');
  assert.equal(P.mediaOrigin('http://127.0.0.1:80/x'), 'http://127.0.0.1');
  assert.equal(P.mediaOrigin('http://127.0.0.1:4810/x'), 'http://127.0.0.1:4810');
  assert.equal(P.mediaOrigin('https://user:pw@host.example/x'), 'https://host.example');
  assert.equal(P.mediaOrigin('file:///C:/Musik/a.mp3'), '');
  assert.equal(P.mediaOrigin('blob:abc'), '');
  assert.equal(P.mediaOrigin(null), '');
});

check('redirect to another origin is followed for the title that is loading', () => {
  const sample = {
    from: 'https://rr2---sn-a.googlevideo.com/videoplayback?id=1',
    to: 'https://rr5---sn-b.googlevideo.com/videoplayback?id=1&cms_redirect=yes',
    src: 'https://rr2---sn-a.googlevideo.com/videoplayback?id=1',
    kind: 'plugin',
    hops: 0,
  };
  assert.equal(P.redirectDecision(sample), 'follow');
  // currentSrc and the src attribute may differ in spelling – either matches.
  assert.equal(P.redirectDecision({ ...sample, src: ['https://other/', sample.from] }), 'follow');
  // Radio and Jamendo/Openverse links redirect to their CDN as well.
  assert.equal(P.redirectDecision({ ...sample, kind: 'radio' }), 'follow');
  assert.equal(P.redirectDecision({ ...sample, kind: 'stream' }), 'follow');
  assert.equal(P.redirectDecision({ ...sample, hops: undefined }), 'follow');
  assert.equal(P.redirectDecision({ ...sample, to: 'http://rr5---sn-b.googlevideo.com/x' }), 'follow');
  assert.equal(P.redirectDecision({ ...sample, from: 'http://127.0.0.1:4810/a', src: 'http://127.0.0.1:4810/a', to: 'http://127.0.0.1:4811/a' }), 'follow');
});

check('redirect: same origin, other element, local files, loops and junk are ignored', () => {
  const sample = {
    from: 'https://a.example/x',
    to: 'https://b.example/x',
    src: 'https://a.example/x',
    kind: 'preview',
    hops: 0,
  };
  assert.equal(P.redirectDecision({ ...sample, to: 'https://a.example/y' }), 'ignore');
  assert.equal(P.redirectDecision({ ...sample, to: 'https://a.example:443/y' }), 'ignore');
  assert.equal(P.redirectDecision({ ...sample, src: 'https://prefetch.example/next' }), 'ignore');
  assert.equal(P.redirectDecision({ ...sample, src: '' }), 'ignore');
  assert.equal(P.redirectDecision({ ...sample, kind: 'local' }), 'ignore');
  assert.equal(P.redirectDecision({ ...sample, hops: P.REDIRECT_HOPS }), 'ignore');
  assert.equal(P.redirectDecision({ ...sample, to: 'javascript:alert(1)' }), 'ignore');
  assert.equal(P.redirectDecision({ ...sample, to: 'file:///C:/x.mp3' }), 'ignore');
  assert.equal(P.redirectDecision({ ...sample, to: sample.from }), 'ignore');
  assert.equal(P.redirectDecision(null), 'ignore');
  assert.equal(P.REDIRECT_HOPS, 3);
});

check('lyrics: tapping a line seeks to its start, shifted by the offset', () => {
  assert.equal(P.lyricSeekTime(12.5, 0, 200), 12.5);
  // Offset +1 s shows lines one second early, so the line starts earlier in the audio.
  assert.equal(P.lyricSeekTime(12.5, 1, 200), 11.5);
  assert.equal(P.lyricSeekTime(12.5, -2, 200), 14.5);
  assert.equal(P.lyricSeekTime(0.4, 2, 200), 0);
  // Unknown duration (stream still loading) still seeks.
  assert.equal(P.lyricSeekTime(30, 0, NaN), 30);
  assert.equal(P.lyricSeekTime(30, 0, 0), 30);
  assert.equal(P.lyricSeekTime(1 / 3, 0, 10), 0.333);
});

check('lyrics: no seek past the end or without a time', () => {
  assert.equal(P.lyricSeekTime(199.9, 0, 200), null);
  assert.equal(P.lyricSeekTime(250, 0, 200), null);
  assert.equal(P.lyricSeekTime(undefined, 0, 200), null);
  assert.equal(P.lyricSeekTime(null, 0, 200), null);
  assert.equal(P.lyricSeekTime('', 0, 200), null);
  assert.equal(P.lyricSeekTime('x', 0, 200), null);
  assert.equal(P.lyricSeekTime(10, 'x', 200), 10);
});

console.log(`\n${checks} passed, 0 failed`);
