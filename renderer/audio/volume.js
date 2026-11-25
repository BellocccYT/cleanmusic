'use strict';

/**
 * Volume rules (2.0, Phase 1 – player slice, step 1) – window.CMVolume.
 *
 * The player keeps its own audio element; what stays here are the pure rules
 * around the level: the ear-friendly curve, the boost ceiling, rounding and
 * the "unmute at 0 %" behaviour. app.js only wires it to the element.
 *
 *   level 0 … max        what the slider shows (0 … 1, 1.5 with boost)
 *   gain  = level²       perceived loudness (0 … 1, boost goes above 1)
 *
 * Loaded before app.js, tested in test/volume.test.js.
 */
(function () {
  const BOOST_MAX = 1.5;
  // Below this the slider is effectively "off"; unmuting restores a sane level.
  const SILENT = 0.02;
  const UNMUTE_TO = 0.5;

  function max(boost) {
    return boost ? BOOST_MAX : 1;
  }

  // Two decimals, never negative, never above the current ceiling.
  function clampLevel(level, maxLevel) {
    const ceiling = Number.isFinite(Number(maxLevel)) && Number(maxLevel) > 0 ? Number(maxLevel) : 1;
    const value = Number(level);
    if (!Number.isFinite(value)) return 0;
    return Math.round(Math.min(ceiling, Math.max(0, value)) * 100) / 100;
  }

  // Perceived gain. Mute wins, the crossfade factor scales it down.
  function gain(level, muted, fadeFactor = 1) {
    if (muted) return 0;
    const value = clampLevel(level, BOOST_MAX);
    const fade = Number.isFinite(Number(fadeFactor)) ? Math.max(0, Math.min(1, Number(fadeFactor))) : 1;
    return value * value * fade;
  }

  // Element volume for the path without the audio chain (0 … 1).
  function elementVolume(level, muted, fadeFactor = 1) {
    return Math.min(1, gain(level, muted, fadeFactor));
  }

  // Unmuting at (almost) zero would stay inaudible – come back at half.
  function unmuteLevel(level) {
    const value = Number(level) || 0;
    return value < SILENT ? UNMUTE_TO : value;
  }

  function adjust(level, delta, maxLevel) {
    const step = Number(delta) || 0;
    return clampLevel((Number(level) || 0) + step, maxLevel);
  }

  // Percent for labels and ARIA text.
  function percent(level) {
    return Math.round(Math.max(0, Number(level) || 0) * 100);
  }

  // Slider fill for the current ceiling (boost shows the 100 % mark separately).
  function fill(level, maxLevel) {
    const ceiling = Number(maxLevel) > 0 ? Number(maxLevel) : 1;
    const value = Math.max(0, Number(level) || 0);
    return Math.min(100, (value / ceiling) * 100);
  }

  window.CMVolume = {
    BOOST_MAX,
    SILENT,
    UNMUTE_TO,
    max,
    clampLevel,
    gain,
    elementVolume,
    unmuteLevel,
    adjust,
    percent,
    fill,
  };
})();
