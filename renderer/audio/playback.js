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

  // Labels follow the interface language; without i18n (tests, older callers)
  // the German text stays. Missing keys also fall back, never render a key.
  function tr(key, fallback) {
    const i18n = typeof window !== 'undefined' ? window.CMI18n : null;
    if (i18n && typeof i18n.has === 'function' && typeof i18n.t === 'function' && i18n.has(key)) {
      return i18n.t(key);
    }
    return fallback;
  }

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
    const mode = repeatMode(value);
    return tr(
      { off: 'playback.repeatOff', all: 'playback.repeatAll', one: 'playback.repeatOne' }[mode],
      LABELS[mode]
    );
  }

  // Autoplay only continues when nothing repeats – the whole list must end.
  function blocksAutoplay(value) {
    return !repeatOff(value);
  }

  function shuffleTitle(on) {
    return tr(on ? 'playback.shuffleOn' : 'playback.shuffleOff', on ? 'Shuffle an' : 'Shuffle aus');
  }

  // "Ein Titel spielt allein": search hits, external links and shared songs start
  // on their own when autoplay is on, so suggestions follow instead of the list.
  function singleContext(autoplay, key, contexts) {
    if (!autoplay) return false;
    return (Array.isArray(contexts) ? contexts : []).includes(key);
  }

  // A title can "play" without ever moving on: a stream that never delivers
  // data, a CDN that keeps the connection open, a stuck decoder. Radio and
  // local files are excluded (live gaps are normal, a broken file is reported
  // by the element itself), as are paused/seeking titles and titles that are
  // still loading or already failed.
  const STALL_MS = 12000;

  function stallDecision(sample) {
    const input = sample && typeof sample === 'object' ? sample : {};
    if (!input.hasSrc) return 'wait';
    if (input.paused || input.ended || input.seeking) return 'wait';
    if (input.kind === 'radio' || input.kind === 'local') return 'wait';
    if (input.mode === 'loading' || input.mode === 'error') return 'wait';
    if (input.handled) return 'wait';
    const still = Number(input.stalledFor);
    if (!Number.isFinite(still) || still < STALL_MS) return 'wait';
    return 'fail';
  }

  // A media request that the server redirects to another origin – YouTube's
  // CDN sends rarely played videos to a different cache server, radio and
  // Jamendo links point to their CDN. Chromium then treats the data as
  // cross-origin: the element still plays it, but Web Audio only gets zeros.
  // With the audio chain on (EQ, bass/treble, levelling, boost) the title runs
  // silent and the visualizer stays flat – no error, so nothing is reported.
  // Loading the redirect target directly keeps the data single-origin.
  const REDIRECT_HOPS = 3;

  // "scheme://host[:port]" without default ports, '' for anything but http(s).
  function mediaOrigin(url) {
    const match = /^(https?):\/\/([^/?#\s]+)/i.exec(String(url || ''));
    if (!match) return '';
    const scheme = match[1].toLowerCase();
    let host = match[2].toLowerCase().replace(/^[^@]*@/, '');
    if ((scheme === 'http' && /:80$/.test(host)) || (scheme === 'https' && /:443$/.test(host))) {
      host = host.replace(/:\d+$/, '');
    }
    return host ? `${scheme}://${host}` : '';
  }

  function redirectDecision(sample) {
    const input = sample && typeof sample === 'object' ? sample : {};
    const from = String(input.from || '');
    const to = String(input.to || '');
    if (!from || !to || from === to) return 'ignore';
    // Only what the player is loading right now (not a prefetch, not an old title).
    const sources = (Array.isArray(input.src) ? input.src : [input.src]).map((value) => String(value || ''));
    if (!sources.includes(from)) return 'ignore';
    if (input.kind === 'local') return 'ignore';
    const before = mediaOrigin(from);
    const after = mediaOrigin(to);
    // Same origin stays usable for Web Audio – nothing to do.
    if (!before || !after || before === after) return 'ignore';
    if ((Number(input.hops) || 0) >= REDIRECT_HOPS) return 'ignore';
    return 'follow';
  }

  /**
   * Tap a synced lyric line → jump there (2.3.1, like Spotify). The lyrics
   * follow audio time + offset, so the line starts at its time minus the
   * offset. Returns seconds, or null when there is nothing sensible to seek to
   * (no time, past the end).
   */
  function lyricSeekTime(lineTime, offset, duration) {
    const at = Number(lineTime);
    if (lineTime === null || lineTime === undefined || lineTime === '' || !Number.isFinite(at)) return null;
    const shift = Number(offset);
    const target = Math.max(0, at - (Number.isFinite(shift) ? shift : 0));
    const length = Number(duration);
    if (Number.isFinite(length) && length > 0 && target >= length - 0.25) return null;
    return Math.round(target * 1000) / 1000;
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
    STALL_MS,
    stallDecision,
    REDIRECT_HOPS,
    mediaOrigin,
    redirectDecision,
    lyricSeekTime,
  };
})();
