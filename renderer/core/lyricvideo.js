'use strict';

/**
 * Pure layout and timing helpers for the "Lyric Video" songtext effect
 * (id `lyricvideo`): kinetic typography in the style of TikTok/Shorts lyric
 * videos – stacked condensed uppercase words, one accent keyword per line,
 * outline/filled words, optional single-word frames and vertical words.
 *
 * Everything here is deterministic (seeded by the line text) and DOM-free,
 * so it can be tested with plain Node. Loaded before app.js as
 * window.CMLyricVideo; tested in test/lyricvideo.test.js.
 */
(function () {
  // Common English + German filler words that never become the accent keyword.
  const FILLERS = new Set([
    // English
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'is', 'it',
    'its', 'i', 'you', 'me', 'my', 'we', 'us', 'our', 'your', 'he', 'she',
    'him', 'her', 'they', 'them', 'that', 'this', 'these', 'those', 'with',
    'but', 'not', 'no', 'so', 'do', 'does', 'did', 'be', 'am', 'are', 'was',
    'were', 'been', 'will', 'would', 'can', 'could', 'should', 'have', 'has',
    'had', 'oh', 'yeah', 'yea', 'ooh', 'na', 'la', 'da', 'uh', 'mm', 'whoa',
    'hey', 'im', 'ive', 'youre', 'dont', 'cant', 'wont', 'aint', 'gonna',
    'wanna', 'gotta', 'cause', 'what', 'when', 'where', 'why', 'how', 'all',
    'up', 'down', 'out', 'off', 'just', 'like', 'know', 'get', 'got', 'go',
    'come', 'let', 'make', 'say', 'see', 'want',
    // German
    'und', 'der', 'die', 'das', 'ein', 'eine', 'einer', 'einen', 'einem',
    'eines', 'ich', 'du', 'wir', 'ihr', 'sie', 'er', 'es', 'mich', 'dich',
    'sich', 'mir', 'dir', 'uns', 'euch', 'ihn', 'ihm', 'dem', 'den', 'des',
    'auf', 'mit', 'ist', 'sind', 'war', 'waren', 'nicht', 'kein', 'keine',
    'wie', 'was', 'wer', 'wo', 'wenn', 'wann', 'dann', 'dass', 'dies', 'diese',
    'dieser', 'auch', 'noch', 'nur', 'schon', 'mal', 'ja', 'nein', 'haben',
    'hat', 'hast', 'werden', 'wird', 'wirst', 'sein', 'bin', 'bist', 'kann',
    'kannst', 'will', 'willst', 'wollen', 'muessen', 'musst', 'muss', 'tun',
    'geh', 'geht', 'komm',
  ]);

  function normWord(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9äöüß]+/g, '');
  }

  function tokenize(text) {
    return String(text || '').split(/\s+/).filter(Boolean);
  }

  function isFiller(word) {
    const w = normWord(word);
    return !w || FILLERS.has(w);
  }

  // Rough syllable count from vowel groups (min 1), used to spread word times.
  function syllables(word) {
    const w = normWord(word);
    if (!w) return 1;
    const groups = w.match(/[aeiouyäöü]+/g);
    return Math.max(1, groups ? groups.length : 0);
  }

  // Deterministic mulberry32 PRNG – well distributed even for small seeds.
  function prng(seed) {
    let state = (Number(seed) >>> 0) || 1;
    return () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The accent keyword: longest non-filler word; ties go to the rarest one
  // (lowest occurrence count), then the first. Falls back to any word.
  function chooseKeyword(words) {
    const pool = words.map((w, index) => ({ w, index, key: normWord(w) }));
    const real = pool.filter((entry) => !isFiller(entry.w));
    const candidates = real.length ? real : pool;
    let best = candidates[0];
    for (let i = 1; i < candidates.length; i += 1) {
      const cur = candidates[i];
      if (cur.key.length > best.key.length) { best = cur; continue; }
      if (cur.key.length === best.key.length) {
        const count = (x) => candidates.filter((y) => y.key === x.key).length;
        if (count(cur) < count(best)) best = cur;
      }
    }
    return best.w;
  }

  /**
   * Deterministic layout for one lyric line.
   *
   * Returns:
   *   { dark, single, accent, vertical, blocks }
   *   - dark:    dark background (true) or light (false)
   *   - single:  show one huge centred word instead of stacked blocks
   *   - accent:  the keyword (accent-coloured), empty when there are no words
   *   - vertical: the vertical (letter-stacked) word, or '' when none
   *   - blocks:  [[ { text, style, size }, ... ], ...] stacked groups
   *              style ∈ 'accent' | 'filled' | 'outline' | 'huge' | 'vertical'
   *              size  ∈ 0..3 (3 = huge)
   */
  function layoutLine(text, seed) {
    const words = tokenize(text);
    if (!words.length) {
      return { dark: false, single: false, accent: '', vertical: '', blocks: [] };
    }
    const rnd = prng(seed);
    const accent = chooseKeyword(words);
    const accentKey = normWord(accent);

    const letters = words.join('').replace(/[^a-zäöüß]/gi, '').length;
    const shortLine = words.length <= 2 && letters <= 9;
    const single = shortLine && rnd() < 0.72;
    const dark = rnd() < (single ? 0.62 : 0.5);

    // A short non-accent word may become the vertical (letter-stacked) word.
    let vertical = '';
    if (!single) {
      const shorties = words.filter((w) => {
        const key = normWord(w);
        return key.length >= 2 && key.length <= 4 && key !== accentKey;
      });
      if (shorties.length && rnd() < 0.4) {
        vertical = shorties[Math.floor(rnd() * shorties.length)];
      }
    }

    // Split into stacked blocks of 2..4 words, left-aligned.
    const sizes = [];
    let at = 0;
    while (at < words.length) {
      const size = Math.min(words.length - at, 2 + Math.floor(rnd() * 3));
      sizes.push(size);
      at += size;
    }

    // A short strong word at the start may be "huge" (like "I'M" left, big).
    let hugeKey = '';
    if (!single && !vertical && words.length > 1) {
      const firstKey = normWord(words[0]);
      const shortish = words.filter((w) => {
        const key = normWord(w);
        return key.length >= 2 && key.length <= 4 && key !== accentKey;
      });
      if (shortish.length && rnd() < 0.45) {
        hugeKey = normWord(shortish[0]);
      }
    }

    const flat = words.map((w) => {
      const key = normWord(w);
      let style;
      if (key === accentKey) style = 'accent';
      else if (key === normWord(vertical)) style = 'vertical';
      else if (key === hugeKey) style = 'huge';
      else style = rnd() < 0.42 ? 'outline' : 'filled';

      let size;
      if (style === 'accent' || style === 'huge') size = 3;
      else if (style === 'vertical') size = 2;
      else size = isFiller(w) ? Math.floor(rnd() * 2) : Math.floor(rnd() * 3);
      return { text: w, style, size };
    });

    const blocks = [];
    let start = 0;
    for (const size of sizes) {
      blocks.push(flat.slice(start, start + size));
      start += size;
    }

    return { dark, single, accent, vertical, blocks };
  }

  /**
   * Word timings across a line's duration. Uses enhanced-LRC word marks when
   * the line carries them (line.words: [{ time, text }]); otherwise spreads the
   * tokens by syllable weight between line.time and nextLineTime.
   */
  function wordTimes(line, nextLineTime) {
    const start = Number(line && line.time) || 0;
    const next = Number.isFinite(Number(nextLineTime)) ? Number(nextLineTime) : start + 4;
    const dur = Math.max(0.6, next - start);
    if (line && Array.isArray(line.words) && line.words.length) {
      return line.words.map((w) => ({
        time: Number(w.time) || start,
        text: String(w.text || ''),
      }));
    }
    const tokens = tokenize(line && line.text);
    if (!tokens.length) return [];
    const weights = tokens.map((t) => syllables(t));
    const total = weights.reduce((sum, value) => sum + value, 0) || tokens.length;
    let acc = 0;
    return tokens.map((t, i) => {
      const time = start + (acc / total) * dur;
      acc += weights[i];
      return { time, text: t };
    });
  }

  window.CMLyricVideo = {
    FILLERS,
    normWord,
    tokenize,
    isFiller,
    syllables,
    chooseKeyword,
    layoutLine,
    wordTimes,
  };
})();
