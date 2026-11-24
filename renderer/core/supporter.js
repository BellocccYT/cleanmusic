'use strict';

/**
 * Supporter extras with an honest code.
 *
 * A few cosmetic extras (themes, live backgrounds, lyric effects, visualizer
 * styles) carry a heart and ask for a code once. The code is PUBLIC: it is on
 * the Ko-fi page, in the Discord, in the README – and the dialog has
 * "Ohne Spende freischalten". Nobody gets anything exclusive for money, so a
 * donation stays a donation (no sale, no licence keys, see LEGAL.md).
 *
 * Whoever used CleanMusic before the extras existed keeps everything
 * (how: 'legacy').
 *
 * Loaded before app.js as window.CMSupporter; tested in test/supporter.test.js.
 */
(function () {
  // Public on purpose – change it freely, old codes may stay in CODES.
  const CODE = 'DANKE-CLEANMUSIC';
  const CODES = [CODE];

  const LOCKED = {
    theme: ['synthwave', 'ozean', 'sonnenuntergang', 'terminal', 'gold', 'kirschbluete'],
    background: ['lava', 'waves', 'synthwave', 'nebula', 'rain', 'custom'],
    lyricsEffect: ['neon', 'wave', 'typer', 'zoom'],
    vizStyle: ['mirror', 'particles'],
  };

  const HOWS = ['code', 'free', 'legacy'];

  function normalize(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 64);
  }

  function checkCode(value) {
    const wanted = normalize(value);
    return wanted.length > 0 && CODES.some((code) => normalize(code) === wanted);
  }

  function isLocked(kind, id, state) {
    if (state && state.unlocked) return false;
    const list = LOCKED[kind];
    return Array.isArray(list) && list.includes(String(id));
  }

  function lockedCount() {
    return Object.values(LOCKED).reduce((sum, list) => sum + list.length, 0);
  }

  function clean(stored) {
    if (!stored || typeof stored !== 'object' || typeof stored.unlocked !== 'boolean') return null;
    return {
      unlocked: stored.unlocked,
      how: stored.unlocked && HOWS.includes(stored.how) ? stored.how : '',
      at: Number.isFinite(stored.at) && stored.at > 0 ? stored.at : 0,
    };
  }

  // No record yet: a fresh profile starts locked, an existing one keeps
  // everything it had (Bestandsschutz).
  function initial(stored, firstRun, now) {
    const known = clean(stored);
    if (known) return known;
    return firstRun ? { unlocked: false, how: '', at: 0 } : { unlocked: true, how: 'legacy', at: Number(now) || 0 };
  }

  function unlock(how, now) {
    return { unlocked: true, how: HOWS.includes(how) ? how : 'code', at: Number(now) || 0 };
  }

  window.CMSupporter = {
    CODE,
    LOCKED,
    normalize,
    checkCode,
    isLocked,
    lockedCount,
    initial,
    unlock,
  };
})();
