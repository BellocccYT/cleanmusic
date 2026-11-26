'use strict';

/**
 * Pure layout and timing helpers for the "Lyric Video" songtext effect
 * (id `lyricvideo`): kinetic typography in the style of TikTok/Shorts lyric
 * videos – stacked condensed uppercase words, one accent keyword per line,
 * outline/filled words, optional single-word frames and vertical words.
 *
 * Since 2.1.1 also the pure parts of the full-screen motion styles poster,
 * brush and cinema (frames per word group, colour sequences, layouts); the
 * DOM side lives in renderer/lyric-stage.js.
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

  /* --- Motion lyric styles (2.1.1) ---------------------------------------
   * Besides the stacked "Lyric Video" there are three full-screen styles in
   * the spirit of kinetic-typography lyric videos (own designs):
   *   poster – pastel poster type, huge soft serif words, simple shapes
   *   brush  – one strong background colour, painted marker letters
   *   cinema – dark film look, words glide in with motion blur, spectrum
   * They show a line in small chunks of words ("frames"), each timed by
   * wordTimes(). Everything below is pure and deterministic.
   */

  const STYLES = ['lyricvideo', 'poster', 'brush', 'cinema'];
  // Styles that play frame by frame (chunks of a line).
  const FRAME_STYLES = ['poster', 'brush', 'cinema'];

  const CHUNK_RULES = {
    poster: { words: 3, letters: 12 },
    brush: { words: 2, letters: 11 },
    cinema: { words: 3, letters: 16 },
  };

  function isStyle(id) {
    return STYLES.includes(String(id));
  }

  // Letters and digits of any script (non-Latin titles count too).
  function letterCount(word) {
    return String(word == null ? '' : word).replace(/[^\p{L}\p{N}]/gu, '').length;
  }

  function endsPhrase(word) {
    return /[,.!?;:…)\]]["'”’»]?$/.test(String(word || ''));
  }

  function lineEnd(line, nextLineTime) {
    const start = Number(line && line.time) || 0;
    const next = Number(nextLineTime);
    return Number.isFinite(next) ? Math.max(start + 0.6, next) : start + 4;
  }

  /**
   * Splits a line into frames of a few words for the frame styles.
   * Returns [{ start, end, words: [{ time, text }] }], ordered and covering
   * [line.time, nextLineTime). Rules: at most `words` words and about
   * `letters` letters per frame, a frame ends after punctuation, and a
   * trailing filler word ("and", "the", "der" …) moves on to the next frame
   * so a frame never ends on "… and a".
   */
  function chunkLine(line, nextLineTime, style) {
    const rules = CHUNK_RULES[style] || CHUNK_RULES.poster;
    const start = Number(line && line.time) || 0;
    const end = lineEnd(line, nextLineTime);
    const times = wordTimes(line, end);
    if (!times.length) return [{ start, end, words: [] }];

    // Filler words count half towards the word limit ("and a nice" fits two).
    const weightOf = (words) => words.reduce((sum, w) => sum + (isFiller(w.text) ? 0.5 : 1), 0);
    const lettersOf = (words) => words.reduce((sum, w) => sum + letterCount(w.text), 0);
    const groups = [];
    let cur = [];
    const flush = (carryFillers) => {
      if (!cur.length) return;
      let keep = cur.length;
      if (carryFillers) {
        while (keep > 1 && isFiller(cur[keep - 1].text) && !endsPhrase(cur[keep - 1].text)) keep -= 1;
        // Only fillers left ("I am gonna"): keep the group whole instead of a lone "I".
        if (cur.slice(0, keep).every((w) => isFiller(w.text))) keep = cur.length;
      }
      groups.push(cur.slice(0, keep));
      cur = cur.slice(keep);
    };
    times.forEach((word) => {
      const next = cur.concat([word]);
      if (cur.length && (weightOf(next) > rules.words || cur.length >= rules.words + 1 || lettersOf(next) > rules.letters)) flush(true);
      cur.push(word);
      if (endsPhrase(word.text)) flush(false);
    });
    flush(false);

    const chunks = groups.map((words) => ({ start: 0, end: 0, words }));
    let last = start;
    chunks.forEach((chunk, i) => {
      const t = i === 0 ? start : Number(chunk.words[0].time);
      chunk.start = Math.max(last, Math.min(end - 0.05, Number.isFinite(t) ? t : last));
      last = chunk.start;
    });
    chunks.forEach((chunk, i) => {
      chunk.end = i + 1 < chunks.length ? chunks[i + 1].start : end;
    });
    return chunks;
  }

  // Index of the frame that is due at `time` (0 before the first one).
  function activeChunk(chunks, time) {
    if (!Array.isArray(chunks) || !chunks.length) return -1;
    let index = 0;
    for (let i = 0; i < chunks.length; i += 1) {
      if (chunks[i].start <= time) index = i;
      else break;
    }
    return index;
  }

  // Running frame number of each line's first frame, so colour sequences
  // continue across lines: offsets[i] = frames of all lines before i.
  function frameOffsets(lines, style) {
    const list = Array.isArray(lines) ? lines : [];
    const offsets = [];
    let total = 0;
    list.forEach((line, i) => {
      offsets.push(total);
      const next = list[i + 1];
      total += chunkLine(line, next ? next.time : undefined, style).length;
    });
    offsets.push(total);
    return offsets;
  }

  // Swatch for frame k of n (n >= 3): consecutive frames never share one.
  function swatchIndex(k, n) {
    const size = Math.max(1, Math.floor(n) || 1);
    const step = Math.max(0, Math.floor(k) || 0);
    return (step + Math.floor(step / size)) % size;
  }

  /* Colours ---------------------------------------------------------------- */

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(rgb) {
    return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
  }

  function mixRgb(a, b, t) {
    return a.map((v, i) => v + (b[i] - v) * t);
  }

  function luminance(rgb) {
    const ch = rgb.map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  // WCAG contrast ratio of two colours (hex or rgb arrays), 1 … 21.
  function contrast(a, b) {
    const ra = Array.isArray(a) ? a : hexToRgb(a);
    const rb = Array.isArray(b) ? b : hexToRgb(b);
    if (!ra || !rb) return 1;
    const la = luminance(ra);
    const lb = luminance(rb);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function rgbToHsl(rgb) {
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }

  function hslToRgb(h, s, l) {
    const hue = (((h % 360) + 360) % 360) / 360;
    if (!s) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const conv = (t) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return [conv(hue + 1 / 3) * 255, conv(hue) * 255, conv(hue - 1 / 3) * 255];
  }

  function hsl(h, s, l) {
    return rgbToHex(hslToRgb(h, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, l))));
  }

  function hueDistance(a, b) {
    const d = Math.abs((((a - b) % 360) + 360) % 360);
    return Math.min(d, 360 - d);
  }

  // Cover colours as given by app.js (state.coverColors: ['#rrggbb', '#rrggbb'] or null).
  function coverPair(colors) {
    if (!Array.isArray(colors)) return null;
    const a = hexToRgb(colors[0]);
    const b = hexToRgb(colors[1]) || a;
    return a ? [a, b] : null;
  }

  // Darkens (or, on dark grounds, lightens) `color` in its own hue until it
  // reaches `min` contrast on `bg` – stays vivid instead of turning grey.
  function ensureContrast(color, bg, min, toward) {
    const rgb = hexToRgb(color);
    if (!rgb || contrast(rgb, bg) >= min) return color;
    const [h, s, l] = rgbToHsl(rgb);
    const dir = luminance(bg) > 0.3 ? -1 : 1;
    let light = l;
    for (let step = 0; step < 24; step += 1) {
      light = Math.max(0.08, Math.min(0.95, light + dir * 0.03));
      const next = rgbToHex(hslToRgb(h, Math.min(1, s * 1.04 + 0.02), light));
      if (contrast(next, bg) >= min) return next;
    }
    return toward;
  }

  const POSTER_SWATCHES = ['#fbead2', '#f5869f', '#dcd673'];
  const POSTER_INK = '#3b2430';

  // Three pastel swatches: cream plus two pastel cover colours (or the fixed set).
  function posterPalette(colors) {
    const pair = coverPair(colors);
    if (!pair) return POSTER_SWATCHES.slice();
    const [ha, sa] = rgbToHsl(pair[0]);
    let [hb, sb] = rgbToHsl(pair[1]);
    if (hueDistance(ha, hb) < 60 || sb < 0.12) {
      hb = ha + 140;
      sb = 0.6;
    }
    const pastel = (h, s, l) => hsl(h, Math.max(0.62, Math.min(0.88, (s || 0.6) + 0.12)), l);
    return ['#fbead2', pastel(ha, sa, 0.7), pastel(hb, sb, 0.67)];
  }

  // Colours of poster frame k: background, giant word, small words.
  function posterColors(palette, k) {
    const list = Array.isArray(palette) && palette.length >= 3 ? palette : POSTER_SWATCHES;
    const n = list.length;
    const bgIndex = swatchIndex(k, n);
    const others = list.filter((_c, i) => i !== bgIndex);
    const flip = Math.floor(Math.max(0, k) / n) % 2 === 1;
    let big = others[flip ? 1 : 0];
    let small = others[flip ? 0 : 1];
    const bg = list[bgIndex];
    // Small words must stay readable; the giant word only needs to stand out.
    if (contrast(small, bg) < contrast(big, bg)) [big, small] = [small, big];
    small = ensureContrast(small, hexToRgb(bg), 1.9, POSTER_INK);
    big = ensureContrast(big, hexToRgb(bg), 1.45, POSTER_INK);
    return { bg, big, small };
  }

  const BRUSH_DEFAULT = { bg: '#7a2b52', fg: '#ffa448' };

  // One strong background colour and a bright paint colour (contrast >= 3).
  function brushColors(colors) {
    const pair = coverPair(colors);
    let bg = BRUSH_DEFAULT.bg;
    let fg = BRUSH_DEFAULT.fg;
    if (pair) {
      const [ha, sa] = rgbToHsl(pair[0]);
      const [hb, sbRaw] = rgbToHsl(pair[1]);
      bg = hsl(ha, Math.max(0.5, Math.min(0.75, sa || 0.55)), 0.28);
      const fromB = hsl(hb, Math.max(0.8, sbRaw), 0.62);
      const shifted = hsl(ha + 60, 0.9, 0.62);
      if (hueDistance(ha, hb) >= 40 && contrast(fromB, bg) >= 3.2) fg = fromB;
      else if (contrast(BRUSH_DEFAULT.fg, bg) >= 3.2) fg = BRUSH_DEFAULT.fg;
      else if (contrast(shifted, bg) >= 3.2) fg = shifted;
      else fg = '#fff1dc';
    }
    const smear = rgbToHex(mixRgb(hexToRgb(bg), hexToRgb(fg), 0.14));
    return { bg, fg, smear };
  }

  const CINEMA_DEFAULT = { bg: '#0b0706', glow: '#e4561a', ember: '#ff9a2e', fg: '#f6f0e8', key: '#f8d51c', heart: '#b3121c' };

  // Dark film colours: the glow (and keyword) follow the cover when it is colourful.
  function cinemaColors(colors) {
    const out = Object.assign({}, CINEMA_DEFAULT);
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha, sa] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    if (sa >= 0.35) out.glow = hsl(ha, Math.max(0.7, sa), 0.48);
    const key = hsl(hb, Math.max(0.85, sb), 0.62);
    if (sb >= 0.35 && hueDistance(hb, rgbToHsl(hexToRgb(out.glow))[0]) >= 25 && contrast(key, out.bg) >= 8) out.key = key;
    out.ember = rgbToHex(mixRgb(hexToRgb(out.glow), hexToRgb(out.key), 0.5));
    return out;
  }

  /* Frame layouts ------------------------------------------------------------ */

  function frameTexts(chunk) {
    return (chunk && Array.isArray(chunk.words) ? chunk.words : []).map((w) => String(w.text || '')).filter(Boolean);
  }

  const SHAPES = ['circle', 'ring', 'flower', 'cross', 'pill'];

  /**
   * Poster frame: one giant word (the chunk's keyword), the rest small.
   *   big:    { index, text, upper, anchor: 'top'|'middle'|'bottom', x, rot, cover }
   *           x = left offset in % of the width (negative = cut off left),
   *           cover = width share (> 1 = wider than the screen, cut off)
   *   small:  { indexes, side: 'top'|'bottom', align: 'left'|'right' }
   *   shapes: [{ kind, x, y, r, rot, tone: 'big'|'small' }] in % of the screen
   */
  function posterFrame(chunk, seed) {
    const texts = frameTexts(chunk);
    const rnd = prng(seed);
    const keyword = texts.length ? chooseKeyword(texts) : '';
    const bigIndex = Math.max(0, texts.indexOf(keyword));
    const letters = letterCount(keyword);
    const anchors = ['top', 'middle', 'bottom'];
    const anchor = texts.length > 1 ? anchors[Math.floor(rnd() * 3)] : 'middle';
    const big = {
      index: bigIndex,
      text: keyword,
      upper: letters >= 3 && rnd() < 0.5,
      anchor,
      x: Math.round((-8 + rnd() * 10) * 10) / 10,
      rot: [0, 0, -3, 3, -2][Math.floor(rnd() * 5)],
      // > 1 = a little wider than the screen: the edges are cut, the word stays readable.
      cover: Math.round((letters <= 3 ? 0.98 : 1.0 + rnd() * 0.1) * 100) / 100,
    };
    const indexes = texts.map((_t, i) => i).filter((i) => i !== bigIndex);
    let side = anchor === 'top' ? 'bottom' : anchor === 'bottom' ? 'top' : rnd() < 0.5 ? 'top' : 'bottom';
    const small = { indexes, side, align: rnd() < 0.6 ? 'right' : 'left' };

    const count = 1 + Math.floor(rnd() * 3);
    const kinds = SHAPES.slice();
    const shapes = [];
    for (let i = 0; i < count; i += 1) {
      const kind = kinds.splice(Math.floor(rnd() * kinds.length), 1)[0];
      // Shapes sit near the edges, not in the middle of the words.
      const left = rnd() < 0.5;
      shapes.push({
        kind,
        x: Math.round(left ? 2 + rnd() * 20 : 78 + rnd() * 20),
        y: Math.round(8 + rnd() * 84),
        r: Math.round(kind === 'cross' ? 9 + rnd() * 7 : 7 + rnd() * 12),
        rot: Math.round(rnd() * 90 - 45),
        tone: rnd() < 0.5 ? 'big' : 'small',
      });
    }
    return { big, small, shapes };
  }

  /**
   * Brush frame: painted letters in one row, or one row per word when the
   * words are long or the screen is upright (options.portrait).
   *   { rows: [[wordIndex, …], …], tilt, align: 'left'|'center', smear }
   */
  function brushFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const rnd = prng(seed);
    const total = texts.reduce((sum, t) => sum + letterCount(t), 0);
    const portrait = Boolean(options && options.portrait);
    const stack = texts.length >= 2 && (total > 8 || portrait);
    const rows = stack ? texts.map((_t, i) => [i]) : [texts.map((_t, i) => i)];
    return {
      rows,
      tilt: Math.round((rnd() * 6 - 4) * 10) / 10,
      align: rnd() < 0.55 ? 'left' : 'center',
      smear: rnd() < 0.6,
    };
  }

  /**
   * Cinema frame: words glide in from one side, the keyword in the key colour.
   *   { key: wordIndex or -1, from: 'right'|'left', cover }
   */
  function cinemaFrame(chunk, seed) {
    const texts = frameTexts(chunk);
    const rnd = prng(seed);
    let key = -1;
    if (texts.length) {
      const keyword = chooseKeyword(texts);
      const index = texts.indexOf(keyword);
      if (!isFiller(keyword) && (texts.length > 1 || rnd() < 0.45)) key = index;
    }
    return {
      key,
      from: rnd() < 0.75 ? 'right' : 'left',
      cover: Math.round((0.86 + rnd() * 0.24) * 100) / 100,
    };
  }

  const HEART_WORDS = /(love|heart|kiss|alone|cry|tears|broken|herz|lieb|kuss|allein|tränen|traenen|amor|coeur|cœur)/i;

  // A heart (or soft shape) behind the words – for loving/lonely lines, else rarely.
  function cinemaHeart(text, seed) {
    if (HEART_WORDS.test(String(text || ''))) return true;
    return prng((Number(seed) >>> 0) ^ 0x9e3779b9)() < 0.15;
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
    STYLES,
    FRAME_STYLES,
    CHUNK_RULES,
    isStyle,
    letterCount,
    chunkLine,
    activeChunk,
    frameOffsets,
    swatchIndex,
    hexToRgb,
    rgbToHex,
    contrast,
    POSTER_SWATCHES,
    posterPalette,
    posterColors,
    brushColors,
    cinemaColors,
    posterFrame,
    brushFrame,
    cinemaFrame,
    cinemaHeart,
    prng,
  };
})();
