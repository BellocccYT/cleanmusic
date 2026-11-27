'use strict';

/**
 * Supporter extras with an honest code – and a 7-day trial.
 *
 * A few cosmetic extras (themes, live backgrounds, lyric effects, visualizer
 * styles) carry a heart. A fresh profile may use all of them for 7 days; after
 * that they ask for a code once. The code is PUBLIC and free for everybody:
 * it stands openly on the Ko-fi page (About text) and in the Discord – and
 * here in the source. Nobody gets anything exclusive for money, so a donation
 * stays a donation (no sale, no licence keys, no payment check, see LEGAL.md).
 *
 * Whoever used CleanMusic before the extras existed keeps everything
 * (how: 'legacy'). Profiles that 1.27.0 stored as locked (no trial yet) get
 * the 7 days once after the update.
 *
 * The Ko-fi hint after 10 hours of listening lives here as well (hintDue).
 *
 * Loaded before app.js as window.CMSupporter; tested in test/supporter.test.js.
 */
(function () {
  // Public on purpose – change it freely, old codes may stay in CODES.
  const CODE = 'DANKE-CLEANMUSIC';
  const CODES = [CODE];

  const DAY = 24 * 60 * 60 * 1000;
  const TRIAL_DAYS = 7;
  const TRIAL_MS = TRIAL_DAYS * DAY;

  const LOCKED = {
    theme: ['synthwave', 'ozean', 'sonnenuntergang', 'terminal', 'gold', 'kirschbluete'],
    background: ['lava', 'waves', 'synthwave', 'nebula', 'rain', 'custom'],
    lyricsEffect: ['neon', 'wave', 'typer', 'zoom', 'lyricvideo', 'poster', 'brush', 'cinema', 'glitch', 'collage', 'synthwave', 'comic', 'cards', 'revolt', 'story', 'diary', 'news', 'terminal', 'tunnel', 'chat', 'aurora', 'concert', 'swiss'],
    vizStyle: ['mirror', 'particles'],
  };

  // Free defaults (the app's own standards) a running trial falls back to.
  // The keys are the settings keys in app.js.
  const FREE_DEFAULTS = {
    theme: 'nacht',
    background: 'none',
    lyricsEffect: 'pop',
    vizStyle: 'radial',
  };

  // Ko-fi hint: after 10 hours of listening, at most once in 30 days.
  const HINT_SECS = 10 * 60 * 60;
  const HINT_GAP_MS = 30 * DAY;

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

  function stamp(value) {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function at(now) {
    return Number.isFinite(now) ? now : Date.now();
  }

  function isExtra(kind, id) {
    const list = LOCKED[kind];
    return Array.isArray(list) && list.includes(String(id));
  }

  // True while a trial runs (only for profiles that are not unlocked).
  function inTrial(state, now) {
    return Boolean(state && !state.unlocked && stamp(state.trialUntil) > at(now));
  }

  // Whole days left, rounded up (1 on the last day), 0 without a trial.
  function trialDaysLeft(state, now) {
    if (!inTrial(state, now)) return 0;
    return Math.max(1, Math.ceil((state.trialUntil - at(now)) / DAY));
  }

  function isLocked(kind, id, state, now) {
    if (state && state.unlocked) return false;
    if (inTrial(state, now)) return false;
    return isExtra(kind, id);
  }

  function lockedCount() {
    return Object.values(LOCKED).reduce((sum, list) => sum + list.length, 0);
  }

  function clean(stored) {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored) || typeof stored.unlocked !== 'boolean') return null;
    return {
      unlocked: stored.unlocked,
      how: stored.unlocked && HOWS.includes(stored.how) ? stored.how : '',
      at: stamp(stored.at),
      trialUntil: stamp(stored.trialUntil),
      trialReset: stored.trialReset === true,
      trialNotice: stored.trialNotice === true,
    };
  }

  function fresh(now) {
    return { unlocked: false, how: '', at: 0, trialUntil: at(now) + TRIAL_MS, trialReset: false, trialNotice: false };
  }

  // No record yet: a fresh profile starts with the 7-day trial, an existing
  // one keeps everything it had (Bestandsschutz). A locked record without a
  // trial (1.27.0, or the mobile first start) gets the trial once.
  function initial(stored, firstRun, now) {
    const known = clean(stored);
    if (known) {
      if (!known.unlocked && !known.trialUntil) return Object.assign(known, { trialUntil: at(now) + TRIAL_MS, trialReset: false, trialNotice: false });
      return known;
    }
    if (firstRun) return fresh(now);
    return { unlocked: true, how: 'legacy', at: Number(now) || 0, trialUntil: 0, trialReset: false, trialNotice: false };
  }

  function unlock(how, now) {
    return { unlocked: true, how: HOWS.includes(how) ? how : 'code', at: Number(now) || 0, trialUntil: 0, trialReset: false, trialNotice: false };
  }

  // The trial ran out and the active extras have not been reset yet.
  function trialExpired(state, now) {
    return Boolean(state && !state.unlocked && stamp(state.trialUntil) > 0 && at(now) >= state.trialUntil && !state.trialReset);
  }

  // Settings patch that swaps every active locked extra for its free default.
  function resetPlan(settings) {
    const patch = {};
    const current = settings && typeof settings === 'object' ? settings : {};
    Object.keys(FREE_DEFAULTS).forEach((key) => {
      if (isExtra(key, current[key])) patch[key] = FREE_DEFAULTS[key];
    });
    return patch;
  }

  function markTrialReset(state) {
    return Object.assign({}, state, { trialReset: true });
  }

  // The friendly "your 7 days are over" card is still owed.
  function trialNoticeDue(state) {
    return Boolean(state && !state.unlocked && state.trialReset && !state.trialNotice);
  }

  function markTrialNotice(state) {
    return Object.assign({}, state, { trialNotice: true });
  }

  /* --- Ko-fi hint after 10 hours -------------------------------------- */

  function cleanHint(stored) {
    const hint = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    return { at: stamp(hint.at), off: hint.off === true };
  }

  // Pure decision; the app adds "never in the smoke test, never on the first start".
  function hintDue(stored, listenedSecs, now) {
    const hint = cleanHint(stored);
    if (hint.off) return false;
    if (!(Number(listenedSecs) >= HINT_SECS)) return false;
    return !hint.at || at(now) - hint.at >= HINT_GAP_MS;
  }

  function hintShown(stored, now) {
    return Object.assign(cleanHint(stored), { at: at(now) });
  }

  function hintOff(stored) {
    return Object.assign(cleanHint(stored), { off: true });
  }

  window.CMSupporter = {
    CODE,
    LOCKED,
    FREE_DEFAULTS,
    TRIAL_DAYS,
    TRIAL_MS,
    HINT_SECS,
    HINT_GAP_MS,
    normalize,
    checkCode,
    isExtra,
    isLocked,
    inTrial,
    trialDaysLeft,
    lockedCount,
    initial,
    unlock,
    trialExpired,
    resetPlan,
    markTrialReset,
    trialNoticeDue,
    markTrialNotice,
    cleanHint,
    hintDue,
    hintShown,
    hintOff,
  };
})();
