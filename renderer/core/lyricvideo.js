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
 * Since 2.2.0 four more directions: glitch (digital tearing in calm waves),
 * collage (cut-out letters on paper snippets), synthwave (chrome type over a
 * neon grid) and comic (pop-art lettering with a speech bubble). Three of the
 * styles read the line itself: cards (playing/tarot cards), revolt (red/black
 * poster) and story (flat illustration) pick symbols via motifOf().
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

  const STYLES = ['lyricvideo', 'poster', 'brush', 'cinema', 'glitch', 'collage', 'synthwave', 'comic', 'cards', 'revolt', 'story', 'diary', 'news', 'terminal', 'tunnel', 'chat', 'aurora', 'concert', 'swiss'];
  // Styles that play frame by frame (chunks of a line).
  const FRAME_STYLES = ['poster', 'brush', 'cinema', 'glitch', 'collage', 'synthwave', 'comic', 'cards', 'revolt', 'story', 'diary', 'news', 'terminal', 'tunnel', 'chat', 'aurora', 'concert', 'swiss'];

  // 2.3.1: the effect picker groups the motion styles. Every style sits in
  // exactly one group (test/lyricvideo.test.js checks that).
  const PICKER_GROUPS = [
    {
      id: 'type',
      label: 'Typo & Plakat',
      labelEn: 'Type & poster',
      hint: 'Große Schrift, klare Formen',
      hintEn: 'Big type, clear shapes',
      styles: ['lyricvideo', 'poster', 'swiss', 'revolt', 'news'],
    },
    {
      id: 'play',
      label: 'Verspielt',
      labelEn: 'Playful',
      hint: 'Papier, Comic, Handschrift, Chat',
      hintEn: 'Paper, comic, handwriting, chat',
      styles: ['brush', 'collage', 'comic', 'diary', 'chat'],
    },
    {
      id: 'night',
      label: 'Neon & Nacht',
      labelEn: 'Neon & night',
      hint: 'Dunkel, Glühen, Retro-Technik',
      hintEn: 'Dark, glow, retro tech',
      styles: ['cinema', 'glitch', 'synthwave', 'tunnel', 'terminal'],
    },
    {
      id: 'scene',
      label: 'Szenen & Licht',
      labelEn: 'Scenes & light',
      hint: 'Bilder und Licht zum Songtext',
      hintEn: 'Images and light for the lyrics',
      styles: ['aurora', 'concert', 'cards', 'story'],
    },
  ];

  function pickerGroupOf(style) {
    const group = PICKER_GROUPS.find((entry) => entry.styles.includes(style));
    return group ? group.id : '';
  }

  const CHUNK_RULES = {
    poster: { words: 3, letters: 12 },
    brush: { words: 2, letters: 11 },
    cinema: { words: 3, letters: 16 },
    glitch: { words: 3, letters: 14 },
    collage: { words: 2, letters: 10 },
    synthwave: { words: 2, letters: 11 },
    comic: { words: 3, letters: 13 },
    cards: { words: 3, letters: 14 },
    revolt: { words: 3, letters: 14 },
    story: { words: 3, letters: 13 },
    diary: { words: 2, letters: 11 },
    news: { words: 3, letters: 14 },
    terminal: { words: 3, letters: 14 },
    tunnel: { words: 2, letters: 10 },
    chat: { words: 4, letters: 18 },
    aurora: { words: 3, letters: 14 },
    concert: { words: 2, letters: 11 },
    swiss: { words: 3, letters: 14 },
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

  /* --- 2.2.0: glitch, collage, synthwave, comic ---------------------------- */

  const GLITCH_DEFAULT = { bg: '#06070e', fg: '#eef3ff', accent: '#ff2e88', ghostA: '#22d3ee', ghostB: '#ff3ea5', line: '#46557a' };

  // Dark signal ground, a bright accent and two ghost colours for the RGB split.
  function glitchColors(colors) {
    const out = Object.assign({}, GLITCH_DEFAULT);
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha, sa] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    out.bg = hsl(ha, Math.max(0.12, Math.min(0.45, sa * 0.45)), 0.055);
    if (sa >= 0.28) out.accent = hsl(ha, Math.max(0.68, sa), 0.61);
    // Ghosts keep the cyan/magenta split of a signal error and only lean a
    // little towards the cover, so the style stays recognisable.
    out.ghostA = hsl(188 + Math.max(-18, Math.min(18, ha - 188)), 0.88, 0.62);
    out.ghostB = hsl(326 + Math.max(-18, Math.min(18, hb - 326)), 0.88, 0.63);
    const bg = hexToRgb(out.bg);
    out.fg = ensureContrast('#f2f6ff', bg, 12, '#ffffff');
    out.accent = ensureContrast(out.accent, bg, 4.5, GLITCH_DEFAULT.accent);
    out.ghostA = ensureContrast(out.ghostA, bg, 4, GLITCH_DEFAULT.ghostA);
    out.ghostB = ensureContrast(out.ghostB, bg, 4, GLITCH_DEFAULT.ghostB);
    out.line = hsl(ha, 0.18, 0.36);
    return out;
  }

  const COLLAGE_DEFAULT = {
    papers: ['#f6edda', '#efe0c4', '#fbf7ee'],
    inks: ['#1b1712', '#3b342b'],
    accent: '#c81f3b',
    tape: '#d8c39a',
  };

  // Three paper tones, two inks and a cut-out accent that stays readable.
  function collagePalette(colors) {
    const base = {
      papers: COLLAGE_DEFAULT.papers.slice(),
      inks: COLLAGE_DEFAULT.inks.slice(),
      accent: COLLAGE_DEFAULT.accent,
      tape: COLLAGE_DEFAULT.tape,
    };
    const pair = coverPair(colors);
    if (!pair) return base;
    const [ha, sa] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    const paperSat = Math.max(0.16, Math.min(0.32, sa * 0.3 + 0.12));
    base.papers = [0, 1, 2].map((i) => hsl(ha + i * 26, paperSat, 0.94 - i * 0.055));
    base.inks = [ensureContrast(hsl(ha, 0.2, 0.12), hexToRgb(base.papers[0]), 11, '#171512'), hsl(ha, 0.18, 0.3)];
    // Use the warmer of the two cover colours for the cut-out ink (green/teal
    // covers would otherwise turn every accent olive).
    const warmth = (hue) => {
      const d = Math.abs((((hue - 25) % 360) + 360) % 360);
      return Math.min(d, 360 - d);
    };
    const accentHue = warmth(ha) <= warmth(hb) ? ha : hb;
    const accentSat = Math.max(0.72, accentHue === ha ? sa : sb);
    let accent = hsl(accentHue, accentSat, 0.46);
    base.papers.forEach((paper) => {
      accent = ensureContrast(accent, hexToRgb(paper), 4.5, COLLAGE_DEFAULT.accent);
    });
    base.accent = accent;
    base.tape = hsl(ha + 26, 0.24, 0.77);
    return base;
  }

  const SYNTH_DEFAULT = {
    sky: '#100629',
    sky2: '#2a0b45',
    grid: '#ff3ea5',
    grid2: '#7b2dff',
    sun1: '#ffd76a',
    sun2: '#ff4f8b',
    chromeTop: '#ffffff',
    chromeMid: '#a8f0ff',
    chromeLow: '#ff9de0',
    key: '#ffd76a',
    ink: '#240a33',
  };

  // Night sky, neon grid and a chrome gradient for the type.
  function synthColors(colors) {
    const out = Object.assign({}, SYNTH_DEFAULT);
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha, sa] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    // The night is purple, the grid pink/cyan; a cover that lives in that
    // family may tint them, an orange or green one does not turn it into a forest.
    const family = hueDistance(ha, 320) <= 34 || hueDistance(ha, 190) <= 28;
    if (family && sa >= 0.3) {
      out.sky = hsl(ha, 0.55, 0.07);
      out.sky2 = hsl(ha + 18, 0.6, 0.17);
      out.grid = hsl(ha, Math.max(0.8, sa), 0.62);
      out.grid2 = hsl(ha + 130, 0.75, 0.42);
      out.sun2 = hsl(ha - 18, 0.86, 0.6);
      out.chromeLow = hsl(hb, Math.max(0.65, sb), 0.74);
      out.key = hsl(ha + 40, 0.9, 0.7);
    }
    // Warm sun even on a cold cover (a slight lean towards its hue only).
    out.sun1 = hsl(45 + Math.max(-25, Math.min(25, ha - 45)), 0.88, 0.72);
    const sky = hexToRgb(out.sky);
    out.grid = ensureContrast(out.grid, sky, 4, SYNTH_DEFAULT.grid);
    out.chromeMid = ensureContrast(out.chromeMid, sky, 7, '#d6f6ff');
    out.chromeLow = ensureContrast(out.chromeLow, sky, 5, SYNTH_DEFAULT.chromeLow);
    out.key = ensureContrast(out.key, sky, 7, SYNTH_DEFAULT.key);
    return out;
  }

  const COMIC_DEFAULT = {
    bg: '#fff2d0',
    ink: '#141414',
    accent: '#e8253f',
    pop: '#ffd21f',
    bubble: '#fffdf4',
    shadow: '#ffffff',
  };

  // Bright paper, hard ink and a loud accent – pop art, not pastel.
  function comicColors(colors) {
    const out = Object.assign({}, COMIC_DEFAULT);
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha, sa] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    if (sa >= 0.3) {
      out.bg = hsl(ha + 30, 0.55, 0.93);
      out.accent = hsl(ha, Math.max(0.78, sa), 0.5);
      out.pop = hsl(ha + 150, 0.85, 0.62);
      out.shadow = hsl(ha, 0.5, 0.97);
    } else {
      out.accent = ensureContrast(out.accent, hexToRgb(out.bg), 3.5, COMIC_DEFAULT.accent);
    }
    out.ink = ensureContrast(out.ink, hexToRgb(out.bg), 11, COMIC_DEFAULT.ink);
    out.accent = ensureContrast(out.accent, hexToRgb(out.bg), 3.5, COMIC_DEFAULT.accent);
    out.bubble = hsl(hb, 0.2, 0.98);
    return out;
  }

  /**
   * Glitch frame: words with small offsets, a slice or two and a code line.
   *   { key, stack, jitter: [-1..1 per word], rot: [deg per word], shift, bars, from }
   */
  function glitchFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const rnd = prng(seed);
    let key = -1;
    if (texts.length) {
      const keyword = chooseKeyword(texts);
      if (!isFiller(keyword) && rnd() < 0.85) key = texts.indexOf(keyword);
    }
    const portrait = Boolean(options && options.portrait);
    return {
      key,
      stack: portrait && texts.length > 1,
      jitter: texts.map(() => Math.round((rnd() * 2 - 1) * 10) / 10),
      rot: texts.map(() => Math.round((rnd() * 8 - 4) * 10) / 10),
      shift: Math.round(3 + rnd() * 6),
      bars: 2 + Math.floor(rnd() * 3),
      from: rnd() < 0.5 ? 'left' : 'right',
    };
  }

  /**
   * Collage frame: every letter is its own paper snippet.
   *   { key, rows, letters: { wordIndex: [{ ch, rot, paper, ink, face }] },
   *     tilt, align, tape, scraps, stack }
   *   ink ∈ 'ink' | 'accent', face ∈ 0..2 (three cut-out typefaces)
   */
  function collageFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const rnd = prng(seed);
    const portrait = Boolean(options && options.portrait);
    const total = texts.reduce((sum, t) => sum + letterCount(t), 0);
    const stack = texts.length >= 2 && (portrait || total > 12);
    const rows = stack ? texts.map((_t, i) => [i]) : [texts.map((_t, i) => i)];
    let key = -1;
    if (texts.length) {
      const keyword = chooseKeyword(texts);
      if (!isFiller(keyword)) key = texts.indexOf(keyword);
    }
    const letters = {};
    texts.forEach((text, index) => {
      const chars = Array.from(String(text || '')).filter((ch) => ch.trim());
      letters[index] = chars.map(() => ({
        ch: '',
        rot: Math.round((rnd() * 16 - 8) * 10) / 10,
        paper: Math.floor(rnd() * 3),
        ink: index === key && rnd() < 0.55 ? 'accent' : rnd() < 0.1 ? 'accent' : 'ink',
        face: Math.floor(rnd() * 3),
      }));
      letters[index].forEach((letter, at) => {
        letter.ch = chars[at];
      });
    });
    return {
      key,
      rows,
      letters,
      tilt: Math.round((rnd() * 5 - 2.5) * 10) / 10,
      align: rnd() < 0.6 ? 'left' : 'center',
      tape: key >= 0 ? key : texts.length && rnd() < 0.5 ? Math.floor(rnd() * texts.length) : -1,
      scraps: 1 + Math.floor(rnd() * 2),
      stack,
    };
  }

  /**
   * Synthwave frame: chrome words over the grid, one row or one word per row.
   *   { key, rows, stack, skew, flare: 'left'|'right' }
   */
  function synthFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const rnd = prng(seed);
    const portrait = Boolean(options && options.portrait);
    const total = texts.reduce((sum, t) => sum + letterCount(t), 0);
    const stack = texts.length >= 2 && (portrait || total > 12);
    const rows = stack ? texts.map((_t, i) => [i]) : [texts.map((_t, i) => i)];
    let key = -1;
    if (texts.length) {
      const keyword = chooseKeyword(texts);
      if (!isFiller(keyword) && (texts.length > 1 || rnd() < 0.6)) key = texts.indexOf(keyword);
    }
    return {
      key,
      rows,
      stack,
      skew: rnd() < 0.5 ? 'left' : 'right',
      flare: Math.round(10 + rnd() * 14),
    };
  }

  /**
   * Comic frame: chunky lettering, one word in the accent colour, a bubble.
   *   { key, bubble: 'burst'|'round'|'cloud', tilt, exclaim, accent, stack }
   */
  function comicFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const rnd = prng(seed);
    const portrait = Boolean(options && options.portrait);
    const bubbles = ['burst', 'burst', 'round', 'cloud'];
    let key = -1;
    if (texts.length) {
      const keyword = chooseKeyword(texts);
      if (!isFiller(keyword)) key = texts.indexOf(keyword);
    }
    const others = texts.map((_t, i) => i).filter((i) => i !== key);
    const accent = others.length && rnd() < 0.35 ? others[Math.floor(rnd() * others.length)] : key;
    return {
      key,
      bubble: bubbles[Math.floor(rnd() * bubbles.length)],
      tilt: Math.round((rnd() * 6 - 3) * 10) / 10,
      exclaim: rnd() < 0.7,
      accent,
      stack: portrait && texts.length > 1,
    };
  }

  /* --- 2.2.0: cards, revolt, story ---------------------------------------- */

  // Lyric motifs: the new styles pick their symbols and colours from the
  // words of the line, so a love line gets hearts, a night line gets a moon.
  const MOTIFS = [
    { id: 'love', icon: 'heart', suit: 'heart', label: 'LOVE', test: /(love|heart|kiss|herz|lieb|kuss|amor|coeur|cœur|sex|body|körper|koerper|touch|berühr|beruehr)/i },
    { id: 'money', icon: 'coin', suit: 'diamond', label: 'FORTUNE', test: /(money|cash|gold|rich|dollar|geld|reich|coin|price|preis|fame|ruhm|pay|zahl)/i },
    { id: 'night', icon: 'moon', suit: 'spade', label: 'NIGHT', test: /(night|moon|star|dark|nacht|mond|stern|dunkel|traum|dream|sleep|schlaf)/i },
    { id: 'fire', icon: 'flame', suit: 'club', label: 'FIRE', test: /(fire|burn|flame|feuer|brenn|flamme|blood|blut|hot|heiss)/i },
    { id: 'sea', icon: 'wave', suit: 'spade', label: 'TIDE', test: /(sea|ocean|wave|rain|water|meer|welle|regen|wasser|river|fluss|storm|sturm)/i },
    { id: 'city', icon: 'city', suit: 'club', label: 'CITY', test: /(city|street|car|road|drive|stadt|strasse|straße|auto|fahrt|licht|light|highway|freeway)/i },
    { id: 'time', icon: 'clock', suit: 'diamond', label: 'TIME', test: /(time|clock|year|hour|zeit|uhr|jahr|stunde|minute|endless)/i },
    { id: 'flower', icon: 'flower', suit: 'heart', label: 'BLOOM', test: /(flower|garden|blume|garten|rose|tree|baum|grow|wächst|waechst)/i },
    { id: 'eye', icon: 'eye', suit: 'spade', label: 'VISION', test: /(eye|see|look|watch|auge|seh|blick|vision|stare)/i },
    { id: 'fight', icon: 'burst', suit: 'club', label: 'FIGHT', test: /(fight|war|battle|kampf|krieg|strike|schlag|enemy|feind)/i },
  ];

  const MOTIF_FALLBACKS = [
    { id: 'star', icon: 'star', suit: 'spade', label: 'STAR' },
    { id: 'night', icon: 'moon', suit: 'spade', label: 'NIGHT' },
    { id: 'eye', icon: 'eye', suit: 'spade', label: 'VISION' },
    { id: 'flower', icon: 'flower', suit: 'heart', label: 'BLOOM' },
    { id: 'love', icon: 'heart', suit: 'heart', label: 'LOVE' },
  ];

  // First matching motif in reading order; a seeded fallback for neutral lines.
  function motifOf(text, seed) {
    const raw = String(text || '');
    for (const motif of MOTIFS) {
      if (motif.test.test(raw)) return { id: motif.id, icon: motif.icon, suit: motif.suit, label: motif.label };
    }
    const rnd = prng((Number(seed) >>> 0) ^ 0x51f3a7);
    const fallback = MOTIF_FALLBACKS[Math.floor(rnd() * MOTIF_FALLBACKS.length)];
    return Object.assign({}, fallback);
  }

  const CARDS_DEFAULT = { bg: '#0a0913', paper: '#f6eedc', ink: '#16110d', accent: '#cf2038', gold: '#d7a73c', soft: '#b9a98c' };

  // Dark table, cream cards, one red printing ink – readable on every cover.
  function cardsColors(colors) {
    const out = Object.assign({}, CARDS_DEFAULT);
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha, sa] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    out.bg = hsl(ha, Math.max(0.12, Math.min(0.45, sa * 0.4)), 0.065);
    out.paper = hsl(ha + 24, 0.22, 0.93);
    out.ink = ensureContrast(hsl(ha, 0.2, 0.12), hexToRgb(out.paper), 12, '#16110d');
    // Playing-card red stays red; a cover near red may tint it slightly.
    const redHue = hueDistance(ha, 355) <= 26 ? ha : hueDistance(hb, 355) <= 26 ? hb : 355;
    out.accent = ensureContrast(hsl(redHue, 0.82, 0.46), hexToRgb(out.paper), 4.5, CARDS_DEFAULT.accent);
    out.gold = ensureContrast(hsl(42 + Math.max(-14, Math.min(14, ha - 42)), 0.62, 0.54), hexToRgb(out.paper), 1.8, CARDS_DEFAULT.gold);
    out.soft = ensureContrast(hsl(ha + 15, 0.25, 0.35), hexToRgb(out.paper), 3, CARDS_DEFAULT.soft);
    return out;
  }

  const REVOLT_RED = { bg: '#e01b2e', fg: '#fff8ee', ink: '#0b0b0d', accent: '#ffd21f' };
  const REVOLT_BLACK = { bg: '#0b0b0d', fg: '#fff8ee', ink: '#000000', accent: '#ff3045' };

  // Protest-poster red/black/white; a cover near red may tint the ground.
  function revoltColors(colors, tone) {
    const out = Object.assign({}, tone === 'black' ? REVOLT_BLACK : REVOLT_RED);
    const pair = coverPair(colors);
    if (pair) {
      const [ha, sa] = rgbToHsl(pair[0]);
      const [hb, sb] = rgbToHsl(pair[1]);
      if (sa >= 0.3 && hueDistance(ha, 355) <= 20) out.bg = hsl(ha, Math.max(0.72, sa), tone === 'black' ? 0.2 : 0.46);
      if (sb >= 0.3) out.accent = hsl(hb, Math.max(0.8, sb), 0.6);
    }
    const bg = hexToRgb(out.bg);
    out.fg = ensureContrast(out.fg, bg, tone === 'black' ? 12 : 4.5, '#ffffff');
    out.accent = ensureContrast(out.accent, bg, 3.5, REVOLT_RED.accent);
    out.ink = ensureContrast(out.ink, hexToRgb(out.fg), 10, '#000000');
    return out;
  }

  const STORY_DEFAULT = { bg: '#12202b', fg: '#f4eee2', accent: '#e3563f', accent2: '#e9c46a', soft: '#31576b', paper: '#efe4cf' };

  // Editorial illustration ground: deep ink blue, warm paper, red + gold.
  // The cover only leans the hues a little – an orange cover must not turn
  // the night scene brown.
  function storyColors(colors) {
    const out = Object.assign({}, STORY_DEFAULT);
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha] = rgbToHsl(pair[0]);
    const lean = (target) => target + Math.max(-18, Math.min(18, ha - target)) * 0.35;
    out.bg = hsl(lean(205), 0.46, 0.1);
    out.accent = hsl(lean(6), 0.74, 0.56);
    out.accent2 = hsl(lean(42), 0.78, 0.63);
    out.soft = hsl(lean(198), 0.32, 0.34);
    out.paper = hsl(lean(40), 0.3, 0.91);
    const bg = hexToRgb(out.bg);
    out.fg = ensureContrast(out.fg, bg, 10, '#ffffff');
    out.accent = ensureContrast(out.accent, bg, 3.5, STORY_DEFAULT.accent);
    out.accent2 = ensureContrast(out.accent2, bg, 3.5, STORY_DEFAULT.accent2);
    out.soft = ensureContrast(out.soft, bg, 1.5, '#4f7a8c');
    return out;
  }

  /**
   * Card frame: a fan of playing/tarot cards whose symbols follow the line.
   *   { motif, cards: [{ icon, suit, rank, label, rot, x, y, scale }],
   *     key, stack, side: 'left'|'right', spark }
   */
  function cardsFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const text = options && options.text ? String(options.text) : texts.join(' ');
    const portrait = Boolean(options && options.portrait);
    const motif = motifOf(text, seed);
    const rnd = prng((Number(seed) >>> 0) ^ 0x1c4a);
    const count = 2 + Math.floor(rnd() * 2);
    const ranks = ['A', 'II', 'V', 'X', 'XIII', 'XXI'];
    const alt = ['star', 'moon', 'eye', 'heart', 'sun', 'flower'];
    const cards = [];
    for (let i = 0; i < count; i += 1) {
      cards.push({
        icon: i === 0 ? motif.icon : alt[Math.floor(rnd() * alt.length)],
        suit: motif.suit,
        rank: ranks[Math.floor(rnd() * ranks.length)],
        label: i === 0 ? motif.label : '',
        rot: Math.round((-9 + i * 7 + rnd() * 5) * 10) / 10,
        x: Math.round((i * 7 - (count - 1) * 3.5 + rnd() * 2) * 10) / 10,
        y: Math.round((i * 4 - (count - 1) * 2 + rnd() * 2) * 10) / 10,
        scale: Math.round((1 - i * 0.035) * 100) / 100,
      });
    }
    let key = -1;
    if (texts.length) {
      const keyword = chooseKeyword(texts);
      if (!isFiller(keyword)) key = texts.indexOf(keyword);
    }
    return {
      motif,
      cards,
      key,
      stack: portrait && texts.length > 1,
      side: portrait || rnd() < 0.72 ? 'left' : 'right',
      spark: rnd() < 0.8,
    };
  }

  /**
   * Revolt frame: red/black poster, cut-out caps, slashes and a star burst.
   *   { motif, tone: 'red'|'black', key, slashes, burst, angle, stack }
   */
  function revoltFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const text = options && options.text ? String(options.text) : texts.join(' ');
    const rnd = prng((Number(seed) >>> 0) ^ 0x7e21);
    const portrait = Boolean(options && options.portrait);
    const motif = motifOf(text, seed);
    const hot = ['love', 'fire', 'fight', 'money'].includes(motif.id);
    const tone = hot ? 'red' : rnd() < 0.78 ? 'red' : 'black';
    let key = -1;
    if (texts.length) {
      const keyword = chooseKeyword(texts);
      if (!isFiller(keyword)) key = texts.indexOf(keyword);
    }
    return {
      motif,
      tone,
      key,
      slashes: 1 + (hot ? 2 : 0) + Math.floor(rnd() * 2),
      burst: rnd() < 0.85,
      angle: Math.round((rnd() * 5 - 2.5) * 10) / 10,
      stack: portrait && texts.length > 1,
    };
  }

  const SCENE_OF = {
    love: 'love',
    money: 'money',
    night: 'night',
    fire: 'fire',
    fight: 'fire',
    sea: 'sea',
    city: 'city',
    time: 'time',
    flower: 'flower',
    eye: 'eye',
    star: 'night',
  };

  /**
   * Story frame: flat vector scene chosen from the line, hand-set words.
   *   { motif, scene, key, rows, stack, align, tilt, caption }
   */
  function storyFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const text = options && options.text ? String(options.text) : texts.join(' ');
    const portrait = Boolean(options && options.portrait);
    const rnd = prng((Number(seed) >>> 0) ^ 0x3b9d);
    const motif = motifOf(text, seed);
    const total = texts.reduce((sum, t) => sum + letterCount(t), 0);
    const stack = texts.length >= 2 && (portrait || total > 12);
    const rows = stack ? texts.map((_t, i) => [i]) : [texts.map((_t, i) => i)];
    let key = -1;
    if (texts.length) {
      const keyword = chooseKeyword(texts);
      if (!isFiller(keyword)) key = texts.indexOf(keyword);
    }
    return {
      motif,
      scene: SCENE_OF[motif.id] || 'night',
      key,
      rows,
      stack,
      align: rnd() < 0.6 ? 'left' : 'center',
      tilt: Math.round((rnd() * 4 - 2) * 10) / 10,
      caption: motif.label,
    };
  }

  /* --- 2.2.0: diary, news, terminal, tunnel ------------------------------ */

  const DIARY_DEFAULT = { paper: '#f8f1e0', ink: '#1e2a44', accent: '#c94040', tape: '#d9c7a4', rule: '#b9c6d8', soft: '#7d8aa0' };

  // Handwritten page: warm paper, ink blue, one warm accent and tape.
  function diaryColors(colors) {
    const out = Object.assign({}, DIARY_DEFAULT);
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha, sa] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    out.paper = hsl(ha + 28, 0.24, 0.94);
    out.ink = ensureContrast(hsl(ha + 208, 0.32, 0.2), hexToRgb(out.paper), 12, '#1e2a44');
    out.accent = ensureContrast(hsl(hb, Math.max(0.66, sb), 0.48), hexToRgb(out.paper), 4, DIARY_DEFAULT.accent);
    out.tape = hsl(ha + 36, 0.3, 0.8);
    out.rule = hsl(ha + 200, 0.22, 0.72);
    out.soft = ensureContrast(hsl(ha + 210, 0.18, 0.45), hexToRgb(out.paper), 2.5, DIARY_DEFAULT.soft);
    return out;
  }

  const NEWS_DEFAULT = { paper: '#f1ead9', ink: '#141414', accent: '#b31b25', muted: '#6b6256', soft: '#cfc4ad' };

  // Newspaper: newsprint, black ink, one red spot colour.
  function newsColors(colors) {
    const out = Object.assign({}, NEWS_DEFAULT);
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    out.paper = hsl(ha + 34, 0.2, 0.93);
    out.ink = ensureContrast(hsl(ha + 220, 0.12, 0.1), hexToRgb(out.paper), 13, '#141414');
    const redHue = hueDistance(ha, 355) <= 26 ? ha : hueDistance(hb, 355) <= 26 ? hb : 355;
    out.accent = ensureContrast(hsl(redHue, 0.72, 0.42), hexToRgb(out.paper), 4.5, NEWS_DEFAULT.accent);
    out.muted = ensureContrast(hsl(ha + 30, 0.12, 0.34), hexToRgb(out.paper), 4.5, NEWS_DEFAULT.muted);
    out.soft = hsl(ha + 30, 0.16, 0.8);
    return out;
  }

  const TERM_DEFAULT = { bg: '#06110b', fg: '#7dff9b', accent: '#d7ff5f', dim: '#2f6b46', panel: '#0a1a11' };

  // CRT screen: green by default, amber for warm covers; cover accent for keys.
  function terminalColors(colors) {
    const out = Object.assign({}, TERM_DEFAULT);
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha, sa] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    const warm = hueDistance(ha, 40) <= 42;
    out.bg = warm ? '#140d04' : hsl(ha + 160, 0.35, 0.045);
    out.fg = warm ? '#ffc46b' : hsl(138, 0.85, 0.68);
    out.accent = warm ? '#ffe38a' : '#d7ff5f';
    out.dim = warm ? '#6b4a1f' : hsl(140, 0.4, 0.32);
    out.panel = warm ? '#1d1308' : hsl(ha + 160, 0.4, 0.075);
    if (sa >= 0.3) out.accent = hsl(ha, Math.max(0.8, sa), 0.66);
    const bg = hexToRgb(out.bg);
    out.fg = ensureContrast(out.fg, bg, 7, '#7dff9b');
    out.accent = ensureContrast(out.accent, bg, 4.5, TERM_DEFAULT.accent);
    out.dim = ensureContrast(out.dim, bg, 2, TERM_DEFAULT.dim);
    return out;
  }

  const TUNNEL_DEFAULT = { bg: '#070812', fg: '#f4f7ff', accent: '#ffd21f', ring1: '#ff2e88', ring2: '#22d3ee', ring3: '#7b5cff', dim: '#2a2b4a' };

  // Depth tunnel: dark centre, neon rings, bright words in front.
  function tunnelColors(colors) {
    const out = Object.assign({}, TUNNEL_DEFAULT);
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha, sa] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    out.bg = hsl(ha, Math.max(0.2, Math.min(0.5, sa * 0.45)), 0.055);
    // Keep the neon family (magenta/cyan/violet); the cover may lean it a little.
    const lean = (target, source) => target + Math.max(-18, Math.min(18, source - target));
    out.ring1 = hsl(lean(328, ha), 0.88, 0.62);
    out.ring2 = hsl(lean(188, hb), 0.86, 0.62);
    out.ring3 = hsl(lean(268, ha + 40), 0.78, 0.58);
    out.accent = hsl(lean(45, ha), 0.9, 0.64);
    const bg = hexToRgb(out.bg);
    out.fg = ensureContrast(out.fg, bg, 12, '#ffffff');
    out.accent = ensureContrast(out.accent, bg, 5, TUNNEL_DEFAULT.accent);
    out.ring1 = ensureContrast(out.ring1, bg, 4, TUNNEL_DEFAULT.ring1);
    out.ring2 = ensureContrast(out.ring2, bg, 4, TUNNEL_DEFAULT.ring2);
    out.ring3 = ensureContrast(out.ring3, bg, 4, TUNNEL_DEFAULT.ring3);
    return out;
  }

  /**
   * Diary frame: a handwritten page, taped photo and a doodle from the line.
   *   { motif, rows, stack, tilt, doodle, tape, polaroid, scribble, key, underline }
   */
  function diaryFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const text = options && options.text ? String(options.text) : texts.join(' ');
    const portrait = Boolean(options && options.portrait);
    const rnd = prng((Number(seed) >>> 0) ^ 0x4b1d);
    const motif = motifOf(text, seed);
    const total = texts.reduce((sum, t) => sum + letterCount(t), 0);
    const stack = texts.length >= 2 && (portrait || total > 10);
    const rows = stack ? texts.map((_t, i) => [i]) : [texts.map((_t, i) => i)];
    let key = -1;
    if (texts.length) {
      const keyword = chooseKeyword(texts);
      if (!isFiller(keyword)) key = texts.indexOf(keyword);
    }
    return {
      motif,
      rows,
      stack,
      tilt: Math.round((rnd() * 5 - 2.5) * 10) / 10,
      align: rnd() < 0.55 ? 'left' : 'center',
      doodle: motif.icon,
      tape: rnd() < 0.8,
      polaroid: rnd() < 0.9,
      scribble: rnd() < 0.55,
      underline: texts.length && rnd() < 0.6 ? Math.floor(rnd() * texts.length) : -1,
      key,
    };
  }

  /**
   * News frame: headline, kicker, columns and a halftone photo from the motif.
   *   { motif, key, kicker, photoIcon, photoLabel, stack, columns }
   */
  function newsFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const text = options && options.text ? String(options.text) : texts.join(' ');
    const portrait = Boolean(options && options.portrait);
    const rnd = prng((Number(seed) >>> 0) ^ 0x2d77);
    const motif = motifOf(text, seed);
    let key = -1;
    if (texts.length) {
      const keyword = chooseKeyword(texts);
      if (!isFiller(keyword)) key = texts.indexOf(keyword);
    }
    const kickers = ['EXTRA', 'HEUTE', 'STORY', 'AKTUELL'];
    return {
      motif,
      key,
      kicker: kickers[Math.floor(rnd() * kickers.length)],
      photoIcon: motif.icon,
      photoLabel: motif.label,
      stack: portrait && texts.length > 1,
      columns: 2 + Math.floor(rnd() * 2),
    };
  }

  /**
   * Terminal frame: prompt, command and the line typed on a CRT.
   *   { motif, key, command, prompt, stack, label }
   */
  function terminalFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const text = options && options.text ? String(options.text) : texts.join(' ');
    const portrait = Boolean(options && options.portrait);
    const rnd = prng((Number(seed) >>> 0) ^ 0x61af);
    const motif = motifOf(text, seed);
    let key = -1;
    if (texts.length) {
      const keyword = chooseKeyword(texts);
      if (!isFiller(keyword)) key = texts.indexOf(keyword);
    }
    return {
      motif,
      key,
      command: `play --mood ${motif.id}`,
      prompt: rnd() < 0.5 ? '$' : '>',
      stack: portrait && texts.length > 1,
      label: motif.label,
    };
  }

  /**
   * Tunnel frame: words in front of neon rings, icon in the vanishing point.
   *   { motif, key, rows, stack, rings, icon, spin, depth }
   */
  function tunnelFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const text = options && options.text ? String(options.text) : texts.join(' ');
    const portrait = Boolean(options && options.portrait);
    const rnd = prng((Number(seed) >>> 0) ^ 0x1f3c);
    const motif = motifOf(text, seed);
    const total = texts.reduce((sum, t) => sum + letterCount(t), 0);
    const stack = texts.length >= 2 && (portrait || total > 10);
    const rows = stack ? texts.map((_t, i) => [i]) : [texts.map((_t, i) => i)];
    let key = -1;
    if (texts.length) {
      const keyword = chooseKeyword(texts);
      if (!isFiller(keyword)) key = texts.indexOf(keyword);
    }
    return {
      motif,
      key,
      rows,
      stack,
      rings: 5 + Math.floor(rnd() * 3),
      icon: motif.icon,
      spin: Math.round((rnd() * 16 - 8) * 10) / 10,
      depth: Math.round((0.88 + rnd() * 0.2) * 100) / 100,
    };
  }

  /* --- 2.3.1: chat, aurora, concert, swiss --------------------------------- */

  function keyIndex(texts) {
    if (!texts.length) return -1;
    const keyword = chooseKeyword(texts);
    return isFiller(keyword) ? -1 : texts.indexOf(keyword);
  }

  function stackRows(texts, portrait, limit) {
    const total = texts.reduce((sum, t) => sum + letterCount(t), 0);
    const stack = texts.length >= 2 && (portrait || total > limit);
    return { stack, rows: stack ? texts.map((_t, i) => [i]) : [texts.map((_t, i) => i)] };
  }

  const CHAT_DEFAULT = {
    bg: '#0d1016',
    bg2: '#151b27',
    me: '#2f62e9',
    meText: '#ffffff',
    them: '#262c38',
    themText: '#f2f4f8',
    meta: '#8f98aa',
    key: '#ffd34d',
  };

  // Messenger: own bubbles in the cover colour (white text stays readable),
  // the other side in a quiet grey, a dark wallpaper behind.
  function chatColors(colors) {
    const out = Object.assign({}, CHAT_DEFAULT);
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha, sa] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    out.bg = hsl(ha, Math.min(0.32, Math.max(0.12, sa * 0.4)), 0.07);
    out.bg2 = hsl(ha, Math.min(0.36, Math.max(0.14, sa * 0.45)), 0.11);
    const white = hexToRgb('#ffffff');
    out.me = ensureContrast(hsl(ha, Math.max(0.62, Math.min(0.9, sa + 0.1)), 0.5), white, 4.5, CHAT_DEFAULT.me);
    out.them = hsl(ha + 200, 0.12, 0.19);
    const bg = hexToRgb(out.bg);
    out.meta = ensureContrast(hsl(ha, 0.1, 0.62), bg, 4.5, CHAT_DEFAULT.meta);
    out.key = ensureContrast(hsl(hb, Math.max(0.85, sb), 0.7), hexToRgb(out.them), 4.5, CHAT_DEFAULT.key);
    return out;
  }

  function shortText(text, maxWords) {
    const words = tokenize(text);
    return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')} …` : words.join(' ');
  }

  /**
   * Chat thread for frame `index` of a line: the line is a run of messages
   * from one side, the next line answers from the other side (a duet).
   *   options: { lineIndex, prevText, nextText, max }
   *   → { side, other, bubbles: [{ side, chunk | text, fresh }], key, typing }
   *   - bubbles: oldest first, at most `max` (default 4); the previous line's
   *     end (other side) leads in when there is room
   *   - typing:  who "types" next – the same side when the line goes on,
   *              the other side when a next line exists, else ''
   */
  function chatThread(chunks, index, options) {
    const opts = options || {};
    const max = Math.max(2, Math.min(6, Number(opts.max) || 4));
    const lineIndex = Math.max(0, Number(opts.lineIndex) || 0);
    const side = lineIndex % 2 === 0 ? 'me' : 'them';
    const other = side === 'me' ? 'them' : 'me';
    const list = Array.isArray(chunks) ? chunks : [];
    const at = Math.max(0, Math.min(list.length - 1, Number(index) || 0));
    const from = Math.max(0, at - (max - 1));
    const bubbles = [];
    for (let i = from; i <= at; i += 1) bubbles.push({ side, chunk: i, fresh: i === at });
    const prev = String(opts.prevText || '').trim();
    if (prev && bubbles.length < max) bubbles.unshift({ side: other, text: shortText(prev, 4), fresh: false });
    const current = list[at];
    const key = keyIndex(frameTexts(current));
    let typing = '';
    if (at < list.length - 1) typing = side;
    else if (String(opts.nextText || '').trim()) typing = other;
    return { side, other, bubbles, key, typing };
  }

  const AURORA_DEFAULT = { bg: '#060818', blobs: ['#1bb8a0', '#7a3fe0', '#e8478f', '#2f7be6'], fg: '#ffffff', key: '#ffe7a3' };

  // Soft aurora: four deep colour veils from the cover, white words on top.
  function auroraColors(colors) {
    const out = { bg: AURORA_DEFAULT.bg, blobs: AURORA_DEFAULT.blobs.slice(), fg: AURORA_DEFAULT.fg, key: AURORA_DEFAULT.key };
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha, sa] = rgbToHsl(pair[0]);
    let [hb, sb] = rgbToHsl(pair[1]);
    if (hueDistance(ha, hb) < 40 || sb < 0.15) {
      hb = ha + 150;
      sb = 0.7;
    }
    // Keep the aurora family (teal, violet, pink, blue); the cover only leans
    // each veil a little – warm covers otherwise turned the sky olive and muddy.
    const lean = (target, source) => target + Math.max(-22, Math.min(22, ((((source - target) % 360) + 540) % 360) - 180));
    out.bg = hsl(ha, Math.min(0.5, Math.max(0.25, sa * 0.6)), 0.055);
    out.blobs = [hsl(lean(172, ha), 0.72, 0.46), hsl(lean(276, hb), 0.7, 0.52), hsl(lean(328, ha), 0.74, 0.54), hsl(lean(212, hb), 0.76, 0.5)];
    out.key = ensureContrast(hsl(hb, 0.9, 0.84), hexToRgb(out.bg), 9, AURORA_DEFAULT.key);
    return out;
  }

  /**
   * Aurora frame: calm centred words that surface from blur.
   *   { rows, stack, key, rise: 'up'|'down', drift }
   */
  function auroraFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const portrait = Boolean(options && options.portrait);
    const rnd = prng((Number(seed) >>> 0) ^ 0x3a07);
    const { stack, rows } = stackRows(texts, portrait, 13);
    return {
      rows,
      stack,
      key: keyIndex(texts),
      rise: rnd() < 0.7 ? 'up' : 'down',
      drift: Math.round((rnd() * 4 - 2) * 10) / 10,
    };
  }

  const CONCERT_DEFAULT = {
    bg: '#05040a',
    beams: ['#ff3d7f', '#3dc5ff', '#ffd23d'],
    fg: '#ffffff',
    key: '#ffd23d',
    haze: '#2b1d4a',
    crowd: '#020203',
  };

  // Concert: black stage, three light colours (cover-led when colourful).
  function concertColors(colors) {
    const out = Object.assign({}, CONCERT_DEFAULT, { beams: CONCERT_DEFAULT.beams.slice() });
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha, sa] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    if (sa >= 0.3) out.beams[0] = hsl(ha, Math.max(0.8, sa), 0.6);
    if (sb >= 0.3 && hueDistance(ha, hb) >= 30) out.beams[1] = hsl(hb, Math.max(0.8, sb), 0.62);
    out.haze = hsl(ha, 0.4, 0.14);
    out.bg = hsl(ha, 0.3, 0.025);
    const bg = hexToRgb(out.bg);
    out.key = ensureContrast(hsl(sa >= 0.3 ? ha + 30 : 48, 0.95, 0.62), bg, 9, CONCERT_DEFAULT.key);
    out.beams = out.beams.map((c) => ensureContrast(c, bg, 5, '#ffffff'));
    return out;
  }

  /**
   * Concert frame: words in the light, beams aimed from the stage floor.
   *   { rows, stack, key, beams: [{ x, angle, tone, width }], flash }
   */
  function concertFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const portrait = Boolean(options && options.portrait);
    const rnd = prng((Number(seed) >>> 0) ^ 0x7c11);
    const { stack, rows } = stackRows(texts, portrait, 9);
    const count = portrait ? 3 : 4 + Math.floor(rnd() * 2);
    const beams = [];
    for (let i = 0; i < count; i += 1) {
      const x = Math.round(((i + 0.5) / count) * 100 + (rnd() * 8 - 4));
      // Beams lean towards the centre, a little random.
      const lean = (50 - x) * 0.45 + (rnd() * 16 - 8);
      beams.push({
        x: Math.max(4, Math.min(96, x)),
        angle: Math.round(Math.max(-38, Math.min(38, lean))),
        tone: i % 3,
        width: Math.round(10 + rnd() * 8),
      });
    }
    const key = keyIndex(texts);
    return { rows, stack, key, beams, flash: key >= 0 && rnd() < 0.5 };
  }

  /**
   * Crowd silhouette (deterministic): an SVG path in a 1000 × 220 box –
   * heads, shoulders and a few raised hands along the bottom edge.
   */
  function crowdPath(seed, count) {
    const n = Math.max(8, Math.min(60, Math.round(Number(count)) || 30));
    const rnd = prng((Number(seed) >>> 0) ^ 0xc0ffee);
    const step = 1000 / n;
    const num = (v) => Math.round(v * 10) / 10;
    let d = 'M0 220 L0 200';
    for (let i = 0; i < n; i += 1) {
      const cx = step * (i + 0.5) + (rnd() * step * 0.4 - step * 0.2);
      const head = 13 + rnd() * 7;
      const top = 120 + rnd() * 34;
      const shoulder = top + head * 1.9;
      // Shoulder slope up to the neck, round head, back down.
      d += ` L${num(cx - step * 0.5)} ${num(shoulder + 6)}`;
      d += ` Q${num(cx - head * 1.3)} ${num(shoulder - 4)} ${num(cx - head * 0.45)} ${num(top + head * 1.45)}`;
      d += ` A${num(head)} ${num(head)} 0 1 1 ${num(cx + head * 0.45)} ${num(top + head * 1.45)}`;
      if (rnd() < 0.26) {
        // A raised arm next to the head.
        const hx = cx + (rnd() < 0.5 ? -1 : 1) * head * (0.7 + rnd() * 0.5);
        const hy = top - 46 - rnd() * 36;
        const fist = 7 + rnd() * 3;
        d += ` L${num(cx + head * 0.75)} ${num(top + head * 1.6)} L${num(hx + fist * 0.8)} ${num(hy + fist)}`;
        d += ` A${num(fist)} ${num(fist)} 0 1 0 ${num(hx - fist * 0.8)} ${num(hy + fist)} L${num(cx + head * 0.05)} ${num(top + head * 1.75)}`;
      }
      d += ` Q${num(cx + head * 1.3)} ${num(shoulder - 4)} ${num(cx + step * 0.5)} ${num(shoulder + 6)}`;
    }
    return `${d} L1000 200 L1000 220 Z`;
  }

  const SWISS_DEFAULT = { paper: '#f1eee7', ink: '#111111', accent: '#e1251b', grid: '#d4cfc4', muted: '#5f5b55' };

  // Swiss poster: paper, black grotesk, one signal colour.
  function swissColors(colors) {
    const out = Object.assign({}, SWISS_DEFAULT);
    const pair = coverPair(colors);
    if (!pair) return out;
    const [ha, sa] = rgbToHsl(pair[0]);
    const [hb, sb] = rgbToHsl(pair[1]);
    out.paper = hsl(ha + 30, 0.14, 0.93);
    const paper = hexToRgb(out.paper);
    const pick = sa >= 0.45 ? [ha, sa] : sb >= 0.45 ? [hb, sb] : null;
    out.accent = pick
      ? ensureContrast(hsl(pick[0], Math.max(0.75, pick[1]), 0.48), paper, 3.5, SWISS_DEFAULT.accent)
      : SWISS_DEFAULT.accent;
    out.grid = hsl(ha + 30, 0.1, 0.8);
    out.ink = ensureContrast('#111111', paper, 15, '#000000');
    out.muted = ensureContrast(hsl(ha + 30, 0.06, 0.38), paper, 5, SWISS_DEFAULT.muted);
    return out;
  }

  /**
   * Swiss frame: flush-left words in a strict grid, a big line number and one
   * geometric block.
   *   { rows, stack, key, number, block: { kind, x, y, size }, label, slide }
   */
  function swissFrame(chunk, seed, options) {
    const texts = frameTexts(chunk);
    const opts = options || {};
    const portrait = Boolean(opts.portrait);
    const rnd = prng((Number(seed) >>> 0) ^ 0x5e15);
    const text = opts.text ? String(opts.text) : texts.join(' ');
    const { stack, rows } = stackRows(texts, portrait, 8);
    const kinds = ['circle', 'square', 'bar', 'quarter'];
    const lineNo = Math.max(0, Number(opts.lineIndex) || 0) + 1;
    return {
      rows,
      stack,
      key: keyIndex(texts),
      number: String(lineNo % 100).padStart(2, '0'),
      block: {
        kind: kinds[Math.floor(rnd() * kinds.length)],
        // Grid positions (12 columns, 8 rows) – snapped, never in the middle.
        x: Math.round((rnd() < 0.5 ? 8 + Math.floor(rnd() * 2) : 9 + Math.floor(rnd() * 3)) * (100 / 12)),
        // Between the line number (top) and the words (bottom).
        y: Math.round((3 + Math.floor(rnd() * 2)) * (100 / 8)),
        size: Math.round(18 + rnd() * 14),
      },
      label: motifOf(text, seed).label,
      slide: rnd() < 0.5 ? 'left' : 'up',
    };
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
    PICKER_GROUPS,
    pickerGroupOf,
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
    glitchColors,
    collagePalette,
    synthColors,
    comicColors,
    cardsColors,
    revoltColors,
    storyColors,
    diaryColors,
    newsColors,
    terminalColors,
    tunnelColors,
    MOTIFS,
    motifOf,
    posterFrame,
    brushFrame,
    cinemaFrame,
    glitchFrame,
    collageFrame,
    synthFrame,
    comicFrame,
    cardsFrame,
    revoltFrame,
    storyFrame,
    diaryFrame,
    newsFrame,
    terminalFrame,
    tunnelFrame,
    chatColors,
    chatThread,
    auroraColors,
    auroraFrame,
    concertColors,
    concertFrame,
    crowdPath,
    swissColors,
    swissFrame,
    cinemaHeart,
    prng,
  };
})();
