'use strict';

/**
 * Playback state rules (2.0, Phase 1 – player slice, step 2) – window.CMPlayback.
 *
 * Shuffle and repeat are the two switches the player keeps in
 * `cleanmusic.playback.v1`. Their values, the cycle of the repeat button and the
 * labels live here so app.js only updates state and buttons.
 *
 *   repeat: 'off' | 'all' | 'one'
 *
 * Pure, loaded before app.js, tested in test/playback.test.js.
 */
(function () {
  const REPEAT = ['off', 'all', 'one'];
  const LABELS = {
    off: 'Wiederholen aus',
    all: 'Alle wiederholen',
    one: 'Titel wiederholen',
  };

  // Stored playback object → known values only (unknown/olds keys are kept).
  function normalize(raw) {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    return Object.assign({}, input, {
      shuffle: Boolean(input.shuffle),
      repeat: REPEAT.includes(input.repeat) ? input.repeat : 'off',
    });
  }

  function repeatMode(value) {
    return REPEAT.includes(value) ? value : 'off';
  }

  // One click on the repeat button: off → all → one → off.
  function nextRepeat(value) {
    const at = REPEAT.indexOf(repeatMode(value));
    return REPEAT[(at + 1) % REPEAT.length];
  }

  function repeatActive(value) {
    return repeatMode(value) !== 'off';
  }

  function repeatOne(value) {
    return repeatMode(value) === 'one';
  }

  function repeatOff(value) {
    return repeatMode(value) === 'off';
  }

  function repeatLabel(value) {
    return LABELS[repeatMode(value)];
  }

  // Autoplay only continues when nothing repeats – the whole list must end.
  function blocksAutoplay(value) {
    return !repeatOff(value);
  }

  function shuffleTitle(on) {
    return on ? 'Shuffle an' : 'Shuffle aus';
  }

  // "Ein Titel spielt allein": search hits, external links and shared songs start
  // on their own when autoplay is on, so suggestions follow instead of the list.
  function singleContext(autoplay, key, contexts) {
    if (!autoplay) return false;
    return (Array.isArray(contexts) ? contexts : []).includes(key);
  }

  window.CMPlayback = {
    REPEAT,
    normalize,
    repeatMode,
    nextRepeat,
    repeatActive,
    repeatOne,
    repeatOff,
    repeatLabel,
    blocksAutoplay,
    shuffleTitle,
    singleContext,
  };
})();
