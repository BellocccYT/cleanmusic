'use strict';

/**
 * Calm background music for the first-steps assistant.
 *
 * Separate from the player: its own Audio element, no effect on the queue,
 * volume or Web Audio chain. The track is a 78-second excerpt of
 * "Thinking Music" by Kevin MacLeod (CC BY 4.0); see
 * renderer/assets/onboarding/CREDITS.txt.
 */
(function () {
  const SRC = 'assets/onboarding/thinking-music.mp3';
  const VOLUME = 0.16;

  let audio = null;
  let playing = false;
  let wanted = false;
  let listener = null;
  let fadeTimer = null;
  let gestureBound = false;

  function emit() {
    if (typeof listener !== 'function') return;
    try {
      listener(playing);
    } catch {
      /* a listener must never break playback */
    }
  }

  function ensure() {
    if (audio) return audio;
    audio = new Audio(SRC);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    audio.addEventListener('ended', () => {
      // loop=true should handle this; keep state honest if it ever fires.
      playing = false;
      emit();
    });
    return audio;
  }

  function fadeTo(target, duration, done) {
    clearInterval(fadeTimer);
    const element = ensure();
    const from = element.volume;
    const started = Date.now();
    fadeTimer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - started) / duration);
      element.volume = from + (target - from) * progress;
      if (progress >= 1) {
        clearInterval(fadeTimer);
        fadeTimer = null;
        if (done) done();
      }
    }, 30);
  }

  function bindGesture() {
    if (gestureBound) return;
    gestureBound = true;
    const once = () => {
      document.removeEventListener('pointerdown', once, true);
      document.removeEventListener('keydown', once, true);
      gestureBound = false;
      if (wanted) playNow();
    };
    document.addEventListener('pointerdown', once, true);
    document.addEventListener('keydown', once, true);
  }

  function playNow() {
    const element = ensure();
    const result = element.play();
    if (result && typeof result.then === 'function') {
      result
        .then(() => {
          if (!wanted) {
            element.pause();
            return;
          }
          fadeTo(VOLUME, 900);
          playing = true;
          emit();
        })
        .catch(() => {
          playing = false;
          emit();
          bindGesture();
        });
    } else {
      fadeTo(VOLUME, 900);
      playing = true;
      emit();
    }
  }

  function start() {
    wanted = true;
    if (playing) {
      emit();
      return;
    }
    playNow();
  }

  function stop() {
    wanted = false;
    playing = false;
    emit();
    if (!audio) return;
    fadeTo(0, 360, () => {
      audio.pause();
      audio.currentTime = 0;
    });
  }

  function toggle() {
    if (playing) stop();
    else start();
  }

  window.CMOnboardingMusic = {
    start,
    stop,
    toggle,
    isPlaying: () => playing,
    state: () => ({
      playing,
      wanted,
      paused: audio ? audio.paused : true,
      volume: audio ? audio.volume : 0,
      src: SRC,
    }),
    setListener(fn) {
      listener = fn;
    },
  };
})();
