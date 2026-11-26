'use strict';

/**
 * Full-screen motion lyrics (2.1.1) – the DOM side of the four motion styles:
 *   lyricvideo – stacked blocks (the 2.0 "Lyric Video", now fitted to the screen)
 *   poster     – pastel poster frames, giant soft serif words, simple shapes
 *   brush      – one strong colour, marker letters painted in by a wipe
 *   cinema     – dark film look, words glide in with motion blur, real spectrum
 *
 * app.js hands over the stage element (#fs-lyrics .ly-kinetic) plus the lines
 * and a time getter; everything that can be decided without a DOM (word
 * groups, colours, layouts) comes from window.CMLyricVideo
 * (core/lyricvideo.js). The fullscreen layout itself (stage fills the screen,
 * controls fade out while idle) is CSS in lyric-stage.css via
 * #fullscreen.lyrics-stage.
 *
 * Rules: beat only as a gentle pulse (no strobe), prefers-reduced-motion =
 * fades only, data-perf="saver" = no blur/texture, nothing is drawn while the
 * window or the fullscreen player is hidden. Loaded before app.js as
 * window.CMLyricStage.
 */
window.CMLyricStage = (function () {
  const FONTS = {
    lyricvideo: ['400 100px "Bebas Neue"'],
    poster: ['900 100px "CM Fraunces"'],
    brush: ['400 100px "CM Permanent Marker"'],
    cinema: ['700 100px "CM Cinzel"'],
  };
  const FPS = { saver: 15, balanced: 24, quality: 30 };
  const SIZE_SCALE = { s: 0.84, m: 1, l: 1.1, xl: 1.2 };
  const fontsLoaded = new Set();

  let run = null;
  let offsetCache = { lines: null, style: '', offsets: [] };

  const lv = () => window.CMLyricVideo;
  const esc = (value) =>
    window.CMText && window.CMText.esc
      ? window.CMText.esc(value)
      : String(value == null ? '' : value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  function seedOf(text) {
    if (window.CMText && window.CMText.stringSeed) return window.CMText.stringSeed(String(text));
    let h = 2166136261;
    for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
    return h >>> 0;
  }

  function perf() {
    const value = document.documentElement.dataset.perf;
    return FPS[value] ? value : 'balanced';
  }

  function reducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // Hidden fullscreen player or lyrics box: nothing to draw.
  function stageVisible(stage) {
    return !document.hidden && stage.isConnected && !stage.closest('[hidden]');
  }

  function setWatch(r, on) {
    const viz = window.CMVisualizer;
    if (!viz || !viz.setWatching || r.watching === on) return;
    r.watching = on;
    try {
      viz.setWatching(on, 'lyrics');
    } catch {
      /* the visualizer is optional */
    }
  }

  function ensureFonts(style) {
    if (!document.fonts || !document.fonts.load) return;
    for (const spec of FONTS[style] || []) {
      if (fontsLoaded.has(spec)) continue;
      fontsLoaded.add(spec);
      document.fonts
        .load(spec)
        .then(() => {
          if (run && run.style === style) refit(run);
        })
        .catch(() => {});
    }
  }

  /* --- Lifecycle ------------------------------------------------------------ */

  /**
   * opts: { style, lines, index, time: () => seconds, colors: ['#hex', '#hex'] | null,
   *         artwork, title, size: 's'|'m'|'l'|'xl' }
   */
  function render(stage, opts) {
    const LV = lv();
    if (!stage || !LV) return;
    const style = LV.isStyle(opts && opts.style) ? opts.style : 'lyricvideo';
    if (!run || run.stage !== stage || run.style !== style) {
      stop();
      run = {
        stage,
        style,
        opts,
        raf: 0,
        timer: 0,
        last: 0,
        beat: 0,
        watching: false,
        chunks: [],
        chunkIndex: -1,
        lineKey: '',
        dark: false,
        lastFlip: 0,
        ro: null,
      };
      setupStage(run);
      if (window.ResizeObserver) {
        run.ro = new ResizeObserver(() => {
          if (run && run.stage === stage) refit(run);
        });
        run.ro.observe(stage);
      }
    }
    const r = run;
    r.opts = opts;
    r.reduced = reducedMotion();
    r.scale = SIZE_SCALE[opts.size] || 1;
    stage.classList.toggle('ls-reduced', r.reduced);
    ensureFonts(style);
    if (style === 'lyricvideo') renderStacked(r);
    else prepareLine(r);
    schedule(r);
  }

  function stop() {
    const r = run;
    if (!r) return;
    run = null;
    if (r.raf) cancelAnimationFrame(r.raf);
    if (r.timer) clearTimeout(r.timer);
    if (r.ro) r.ro.disconnect();
    setWatch(r, false);
  }

  function schedule(r) {
    if (r !== run || r.raf || r.timer) return;
    r.raf = requestAnimationFrame((now) => tick(r, now));
  }

  function tick(r, now) {
    r.raf = 0;
    if (r !== run) return;
    if (!r.stage.isConnected) {
      stop();
      return;
    }
    if (!stageVisible(r.stage)) {
      // Fullscreen closed or window hidden: no drawing, no analysis – check again later.
      setWatch(r, false);
      r.timer = setTimeout(() => {
        r.timer = 0;
        schedule(r);
      }, 400);
      return;
    }
    const fps = FPS[perf()];
    if (now - r.last >= 1000 / fps - 2) {
      r.last = now;
      frame(r, now);
    }
    schedule(r);
  }

  function frame(r, now) {
    const viz = window.CMVisualizer;
    const wantsAudio = !r.reduced;
    setWatch(r, wantsAudio);
    let bands = null;
    if (viz && wantsAudio) {
      try {
        // spectrum() also refreshes level() while no visualizer loop runs.
        bands = viz.spectrum ? viz.spectrum(48) : null;
      } catch {
        bands = null;
      }
    }
    if (!r.reduced && viz) {
      const level = viz.level ? viz.level() : 0;
      r.beat += (Math.min(1, level * 1.4) - r.beat) * 0.35;
      r.stage.style.setProperty('--ls-beat', r.beat.toFixed(3));
      if (r.style === 'lyricvideo') pulseStacked(r, now, viz);
    }
    if (r.style !== 'lyricvideo') {
      const index = lv().activeChunk(r.chunks, currentTime(r));
      if (index !== r.chunkIndex) showChunk(r, index);
    }
    if (r.style === 'cinema' && !r.reduced) drawSpectrum(r, bands);
  }

  function currentTime(r) {
    try {
      return Number(r.opts.time()) || 0;
    } catch {
      return 0;
    }
  }

  /* --- Stage skeletons --------------------------------------------------------- */

  function setupStage(r) {
    const { stage, style } = r;
    stage.removeAttribute('style');
    if (style === 'lyricvideo') return; // rebuilt per line by renderStacked
    stage.className = `ly-kinetic ly-k-${style} ls-stage ls-${style}`;
    if (style === 'cinema') {
      stage.innerHTML = `
        <div class="lc-ground" aria-hidden="true"></div>
        <div class="lc-scratch" aria-hidden="true"></div>
        <svg class="lc-heart" viewBox="0 0 100 92" aria-hidden="true"><path d="M50 90 C 18 66 2 48 2 28 C 2 13 13 2 27 2 C 38 2 46 9 50 18 C 54 9 62 2 73 2 C 87 2 98 13 98 28 C 98 48 82 66 50 90 Z" /><path class="lc-crack" d="M50 18 L 45 34 L 54 46 L 46 60 L 52 72 L 49 88" /></svg>
        <div class="ls-frames"></div>
        <canvas class="lc-spectrum" aria-hidden="true"></canvas>`;
    } else {
      stage.innerHTML = '<div class="ls-frames"></div>';
    }
  }

  /* --- Frame styles (poster, brush, cinema) ------------------------------------ */

  function offsetsFor(lines, style) {
    if (offsetCache.lines !== lines || offsetCache.style !== style) {
      offsetCache = { lines, style, offsets: lv().frameOffsets(lines, style) };
    }
    return offsetCache.offsets;
  }

  function lineAt(r) {
    const { lines, index } = r.opts;
    const list = Array.isArray(lines) ? lines : [];
    if (index >= 0 && list[index]) return { line: list[index], next: list[index + 1], intro: false };
    // Before the first line: the song title as an intro frame.
    const first = list[0];
    const title = String(r.opts.title || '').trim();
    return { line: { time: 0, text: title || '♪' }, next: first, intro: true };
  }

  function prepareLine(r) {
    const LV = lv();
    const { line, next, intro } = lineAt(r);
    const lineKey = `${r.opts.index}|${line.time}|${line.text}`;
    const colors = r.opts.colors;
    const colorKey = Array.isArray(colors) ? colors.join(',') : '';
    if (lineKey === r.lineKey && colorKey === r.colorKey) return;
    r.lineKey = lineKey;
    r.colorKey = colorKey;
    r.lineText = String(line.text || '');
    r.chunks = LV.chunkLine(line, next ? next.time : undefined, r.style);
    const offsets = offsetsFor(r.opts.lines, r.style);
    r.frameBase = intro ? 0 : offsets[Math.max(0, r.opts.index)] || 0;
    r.lineEnd = next ? Number(next.time) : Number(line.time) + 4;
    const { stage } = r;
    if (r.style === 'poster') {
      r.palette = LV.posterPalette(colors);
    } else if (r.style === 'brush') {
      const c = LV.brushColors(colors);
      stage.style.setProperty('--lb-bg', c.bg);
      stage.style.setProperty('--lb-fg', c.fg);
      stage.style.setProperty('--lb-smear', c.smear);
    } else if (r.style === 'cinema') {
      const c = LV.cinemaColors(colors);
      r.cinema = c;
      stage.style.setProperty('--lc-glow', c.glow);
      stage.style.setProperty('--lc-ember', c.ember);
      stage.style.setProperty('--lc-fg', c.fg);
      stage.style.setProperty('--lc-key', c.key);
      stage.style.setProperty('--lc-heart', c.heart);
      stage.classList.toggle('lc-has-heart', !intro && Boolean(line.text) && LV.cinemaHeart(line.text, seedOf(line.text)));
    }
    r.chunkIndex = -1;
    showChunk(r, LV.activeChunk(r.chunks, currentTime(r)));
  }

  function showChunk(r, index) {
    r.chunkIndex = index;
    const chunk = r.chunks[index];
    const host = r.stage.querySelector('.ls-frames');
    if (!chunk || !host) return;
    const now = currentTime(r);
    const seed = seedOf(`${r.lineText}#${index}`);
    const k = r.frameBase + Math.max(0, index);
    // Word delays relative to "now", so a frame shown mid-way (seek, reopen) is complete.
    const delayOf = (word) => Math.max(0, Math.min(2.4, (Number(word.time) || 0) - now));
    let el;
    if (r.style === 'poster') el = posterEl(r, chunk, seed, k, delayOf);
    else if (r.style === 'brush') el = brushEl(r, chunk, seed, delayOf);
    else el = cinemaEl(r, chunk, seed, delayOf, Math.max(0.4, chunk.end - Math.max(now, chunk.start)));
    if (r.style === 'cinema' && !r.reduced) {
      host.querySelectorAll('.lc-frame:not(.lc-out)').forEach((old) => {
        old.classList.add('lc-out');
        setTimeout(() => old.remove(), 300);
      });
      host.appendChild(el);
    } else {
      host.replaceChildren(el);
    }
    fitFrame(r, el);
  }

  // Poster -----------------------------------------------------------------

  const FLOWER = (() => {
    const n = 6;
    const pt = (radius, deg) => {
      const a = (deg * Math.PI) / 180;
      return `${(50 + radius * Math.cos(a)).toFixed(2)} ${(50 + radius * Math.sin(a)).toFixed(2)}`;
    };
    let d = `M ${pt(20, -30)}`;
    for (let i = 0; i < n; i += 1) {
      const c = i * (360 / n);
      d += ` C ${pt(58, c - 26)} ${pt(58, c + 26)} ${pt(20, c + 30)}`;
    }
    return `${d} Z`;
  })();

  function shapeSvg(shape) {
    let body;
    switch (shape.kind) {
      case 'ring':
        body = '<circle class="lp-line" cx="50" cy="50" r="43" />';
        break;
      case 'flower':
        body = `<path class="lp-line" d="${FLOWER}" />`;
        break;
      case 'cross':
        body = '<g class="lp-cross"><rect x="8" y="40" width="84" height="20" rx="2" transform="rotate(45 50 50)" /><rect x="8" y="40" width="84" height="20" rx="2" transform="rotate(-45 50 50)" /></g>';
        break;
      case 'pill':
        body = '<ellipse class="lp-fill" cx="50" cy="50" rx="48" ry="30" />';
        break;
      default:
        body = '<circle class="lp-fill" cx="50" cy="50" r="48" />';
    }
    return `<svg class="lp-shape lp-tone-${shape.tone}" viewBox="0 0 100 100" style="left:${shape.x}%;top:${shape.y}%;--r:${shape.r};--rot:${shape.rot}deg" aria-hidden="true">${body}</svg>`;
  }

  function posterEl(r, chunk, seed, k, delayOf) {
    const LV = lv();
    const layout = LV.posterFrame(chunk, seed);
    const colors = LV.posterColors(r.palette, k);
    r.stage.style.setProperty('--lp-bg', colors.bg);
    r.stage.style.setProperty('--lp-big', colors.big);
    r.stage.style.setProperty('--lp-small', colors.small);
    const words = chunk.words;
    const bigWord = words[layout.big.index];
    const bigText = bigWord ? bigWord.text : '♪';
    const el = document.createElement('div');
    el.className = `lp-frame lp-anchor-${layout.big.anchor}`;
    const small = layout.small.indexes
      .map((i) => `<span class="ls-w lp-sw" style="--d:${delayOf(words[i]).toFixed(2)}s">${esc(words[i].text)}</span>`)
      .join(' ');
    el.innerHTML = `
      ${layout.shapes.map(shapeSvg).join('')}
      <div class="lp-big" style="--x:${layout.big.x}%;--rot:${layout.big.rot}deg">
        <span class="ls-w lp-bigword${layout.big.upper ? ' lp-upper' : ''}" style="--d:${bigWord ? Math.min(0.12, delayOf(bigWord)).toFixed(2) : 0}s">${esc(bigText)}</span>
      </div>
      ${small ? `<div class="lp-small lp-side-${layout.small.side} lp-align-${layout.small.align}">${small}</div>` : ''}`;
    el.dataset.cover = String(layout.big.cover);
    return el;
  }

  // Brush ----------------------------------------------------------------------

  function brushEl(r, chunk, seed, delayOf) {
    const box = stageSize(r);
    const layout = lv().brushFrame(chunk, seed, { portrait: Boolean(box && box.portrait) });
    const words = chunk.words;
    const el = document.createElement('div');
    el.className = `lb-frame lb-align-${layout.align}`;
    el.style.setProperty('--tilt', `${layout.tilt}deg`);
    const paintLen = (i) => {
      const start = Number(words[i].time) || chunk.start;
      const end = words[i + 1] ? Number(words[i + 1].time) : chunk.end;
      return Math.max(0.22, Math.min(0.9, (end - start) * 0.85));
    };
    const rows = words.length
      ? layout.rows
          .map(
            (row) =>
              `<div class="lb-row">${row
                .map((i) => `<span class="ls-w lb-w" style="--d:${delayOf(words[i]).toFixed(2)}s;--len:${paintLen(i).toFixed(2)}s">${esc(words[i].text)}</span>`)
                .join(' ')}</div>`
          )
          .join('')
      : '<div class="lb-row"><span class="ls-w lb-w" style="--d:0s;--len:.5s">♪</span></div>';
    const smear = layout.smear
      ? '<svg class="lb-smear" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><path d="M6 26 C 40 10 70 30 104 18 S 170 12 194 22" /></svg>'
      : '';
    el.innerHTML = `${smear}<div class="lb-rows">${rows}</div>`;
    return el;
  }

  // Cinema ---------------------------------------------------------------------

  function cinemaEl(r, chunk, seed, delayOf, hold) {
    const layout = lv().cinemaFrame(chunk, seed);
    const box = stageSize(r);
    const stack = Boolean(box && box.portrait) && chunk.words.length > 1;
    const el = document.createElement('div');
    el.className = `lc-frame lc-from-${layout.from}${stack ? ' lc-stack' : ''}`;
    el.dataset.cover = String(layout.cover);
    const words = chunk.words
      .map(
        (word, i) =>
          `<span class="ls-w lc-w${i === layout.key ? ' lc-key' : ''}" style="--d:${delayOf(word).toFixed(2)}s">${esc(word.text)}</span>`
      )
      .join(' ');
    el.innerHTML = `<div class="lc-drift" style="--hold:${hold.toFixed(2)}s">${words}</div>`;
    return el;
  }

  function drawSpectrum(r, bands) {
    const canvas = r.stage.querySelector('.lc-spectrum');
    if (!canvas) return;
    const ratio = Math.min(perf() === 'saver' ? 1 : 1.5, window.devicePixelRatio || 1);
    const w = Math.round(canvas.clientWidth * ratio);
    const h = Math.round(canvas.clientHeight * ratio);
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (!Array.isArray(bands) || !bands.length) return;
    const c = r.cinema || {};
    const grad = ctx.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, c.key || '#f8d51c');
    grad.addColorStop(0.35, c.ember || '#ff9a2e');
    grad.addColorStop(1, c.glow || '#e4561a');
    ctx.fillStyle = grad;
    // Symmetric: the bass in the middle, the highs towards both edges.
    const n = bands.length;
    const slot = w / 2 / n;
    const bar = Math.max(1, slot * 0.42);
    for (let i = 0; i < n; i += 1) {
      const v = Math.max(0, Math.min(1, Number(bands[i]) || 0));
      const height = Math.max(ratio, v ** 1.6 * h);
      const offset = (i + 0.5) * slot;
      ctx.globalAlpha = 0.35 + v * 0.65;
      ctx.fillRect(w / 2 - offset - bar / 2, h - height, bar, height);
      ctx.fillRect(w / 2 + offset - bar / 2, h - height, bar, height);
    }
    ctx.globalAlpha = 1;
  }

  /* --- Lyric Video (stacked blocks) --------------------------------------------- */

  function renderStacked(r) {
    const LV = lv();
    const { stage } = r;
    const lines = Array.isArray(r.opts.lines) ? r.opts.lines : [];
    const index = r.opts.index;
    const line = lines[index];
    const next = lines[index + 1];
    const text = String((line && line.text) || '♪');
    const layout = LV.layoutLine(text, seedOf(text));
    const saver = perf() === 'saver';
    const reduced = r.reduced;
    const dur = line && next ? Math.max(0.6, Math.min(10, next.time - line.time || 4)) : 4;

    stage.className = `ly-kinetic ly-k-lyricvideo lv-stage ls-fit ${layout.dark ? 'lv-dark' : 'lv-light'}${
      layout.single ? ' lv-single' : ''
    }${reduced ? ' lv-reduced ls-reduced' : ''}`;
    r.dark = layout.dark;

    const flat = [];
    layout.blocks.forEach((block) => block.forEach((word) => flat.push(word)));
    const times = line ? LV.wordTimes(line, next ? next.time : undefined) : [];
    const start = line ? Number(line.time) || 0 : 0;

    const wordHtml = (word, at) => {
      const delay = times[at]
        ? Math.max(0, Math.min(dur * 0.65, times[at].time - start))
        : (at / Math.max(1, flat.length)) * Math.min(2.4, dur * 0.65);
      const cls = `lv-word lv-${word.style} lv-s${word.size}`;
      const dir = seedOf(`${word.text}:${at}`) % 4;
      const vars = reduced
        ? `--lv-delay:${delay.toFixed(2)}s`
        : `--lv-delay:${delay.toFixed(2)}s;--lv-dx:${dir === 0 ? '-46vw' : dir === 1 ? '46vw' : '0'};--lv-dy:${
            dir === 2 ? '-30vh' : dir === 3 ? '30vh' : '0'
          };--lv-skew:${(seedOf(word.text) % 21) - 10}deg;--lv-blur:${saver ? '0px' : '12px'}`;
      const inner = word.style === 'vertical' ? Array.from(word.text).map((ch) => `<i>${esc(ch)}</i>`).join('') : esc(word.text);
      return `<span class="${cls}" style="${vars}">${inner}</span>`;
    };

    let body;
    if (layout.single) {
      const word = flat[0] ? Object.assign({}, flat[0], { style: 'accent', size: 3 }) : { text, style: 'accent', size: 3 };
      body = `<div class="lv-frame lv-frame-single">${wordHtml(word, 0)}</div>`;
    } else {
      let at = 0;
      body = layout.blocks.map((block) => `<div class="lv-block">${block.map((word) => wordHtml(word, at++)).join('')}</div>`).join('');
    }

    const artwork = r.opts.artwork;
    const silhouette = !saver && artwork ? `<img class="lv-silhouette" src="${esc(artwork)}" alt="" aria-hidden="true" />` : '';
    const deco = saver
      ? ''
      : `<svg class="lv-deco" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <g class="lv-lines">
          <line x1="0" y1="11" x2="100" y2="4" />
          <line x1="0" y1="30" x2="100" y2="23" />
          <line x1="6" y1="99" x2="100" y2="91" />
          <line x1="0" y1="72" x2="100" y2="65" />
        </g>
        <path class="lv-flame lv-flame-a" d="M12 6 C 19 14 22 20 22 27 A 10 10 0 1 1 2 27 C 2 20 5 14 12 6 Z" />
        <path class="lv-flame lv-flame-b" d="M92 74 C 97 80 99 85 99 91 A 7 7 0 1 1 85 91 C 85 85 87 80 92 74 Z" />
        <circle class="lv-circle" cx="80" cy="18" r="6" />
      </svg>`;

    stage.innerHTML = `<div class="lv-body">${body}</div>${silhouette}${deco}<p class="ly-k-next">${esc((next && next.text) || '')}</p>`;
    fitStacked(r);
  }

  function pulseStacked(r, now, viz) {
    const energy = viz.energy ? viz.energy() : 0;
    const level = viz.level ? viz.level() : 0;
    r.stage.style.setProperty('--lv-pulse', (1 + Math.min(1, level * 1.5) * 0.035).toFixed(4));
    r.stage.style.setProperty('--lv-shake', `${(energy * 2).toFixed(2)}px`);
    // Strong beat flips light/dark with a minimum gap – no strobing.
    if (energy > 0.82 && now - r.lastFlip > 900) {
      r.lastFlip = now;
      r.dark = !r.dark;
      r.stage.classList.toggle('lv-dark', r.dark);
      r.stage.classList.toggle('lv-light', !r.dark);
    }
  }

  /* --- Fitting: as big as the screen allows ------------------------------------- */

  function stageSize(r) {
    const w = r.stage.clientWidth;
    const h = r.stage.clientHeight;
    return w > 40 && h > 40 ? { w, h, portrait: h > w * 1.15 } : null;
  }

  // Font size (px) so that `el` (measured at 100px) fills maxW × maxH.
  function fitSize(el, maxW, maxH, cap) {
    if (!el) return 0;
    el.style.fontSize = '100px';
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return 0;
    const size = Math.min((maxW / w) * 100, (maxH / h) * 100, cap);
    el.style.fontSize = `${Math.max(12, size).toFixed(1)}px`;
    return size;
  }

  function fitStacked(r) {
    const box = stageSize(r);
    const body = r.stage.querySelector('.lv-body');
    if (!box || !body) return;
    // The size lives on the stage element, so the stage HTML stays stable.
    r.stage.style.setProperty('--lv-size', '100px');
    const w = body.offsetWidth;
    const h = body.offsetHeight;
    if (!w || !h) return;
    const size = Math.min(((box.w * 0.88) / w) * 100, ((box.h * 0.8) / h) * 100, box.h * 0.7) * r.scale;
    r.stage.style.setProperty('--lv-size', `${Math.max(16, size).toFixed(1)}px`);
  }

  function fitFrame(r, el) {
    const box = stageSize(r);
    if (!box || !el || !el.isConnected) return;
    const s = r.scale;
    if (r.style === 'poster') {
      const cover = (Number(el.dataset.cover) || 1.1) * (box.portrait ? 1.25 : 1);
      fitSize(el.querySelector('.lp-bigword'), box.w * cover * s, box.h * 0.96, box.h * 0.94);
      fitSize(el.querySelector('.lp-small'), box.w * 0.64 * s, box.h * 0.3, box.h * 0.2 * s);
    } else if (r.style === 'brush') {
      const single = el.querySelectorAll('.lb-row').length <= 1;
      fitSize(el.querySelector('.lb-rows'), box.w * 0.88 * s, box.h * (single ? 0.9 : 0.8), box.h * (single ? 0.78 : 0.5) * s);
    } else if (r.style === 'cinema') {
      const cover = (Number(el.dataset.cover) || 1) * (box.portrait ? 1.15 : 1);
      const stacked = el.classList.contains('lc-stack');
      fitSize(el.querySelector('.lc-drift'), box.w * (stacked ? 0.9 : cover) * s, box.h * (stacked ? 0.62 : 0.5), box.h * (stacked ? 0.22 : 0.42) * s);
    }
  }

  function refit(r) {
    if (!r || r !== run || !r.stage.isConnected) return;
    if (r.style === 'lyricvideo') {
      fitStacked(r);
      return;
    }
    const frames = r.stage.querySelectorAll('.ls-frames > :not(.lc-out)');
    frames.forEach((el) => fitFrame(r, el));
  }

  // For the smoke test: what is on stage right now.
  function snapshot() {
    if (!run) return null;
    const stage = run.stage;
    return {
      style: run.style,
      chunks: run.chunks.length,
      chunk: run.chunkIndex,
      words: stage.querySelectorAll('.ls-w, .lv-word').length,
      frames: stage.querySelectorAll('.ls-frames > :not(.lc-out)').length,
      font: (() => {
        const word = stage.querySelector('.ls-w, .lv-word');
        return word ? parseFloat(getComputedStyle(word).fontSize) || 0 : 0;
      })(),
      watching: run.watching,
    };
  }

  return { render, stop, snapshot, refit: () => refit(run), STYLES: ['lyricvideo', 'poster', 'brush', 'cinema'] };
})();
