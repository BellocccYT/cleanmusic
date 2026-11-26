'use strict';

/**
 * Full-screen motion lyrics (2.1.1) – the DOM side of the motion styles:
 *   lyricvideo – stacked blocks (the 2.0 "Lyric Video", now fitted to the screen)
 *   poster     – pastel poster frames, giant soft serif words, simple shapes
 *   brush      – one strong colour, marker letters painted in by a wipe
 *   cinema     – dark film look, words glide in with motion blur, real spectrum
 *   2.2.0 adds glitch (calm digital tearing), collage (cut-out letters on
 *   paper), synthwave (chrome type over a neon grid) and comic (pop art with
 *   a speech bubble), plus cards (tarot/playing cards), revolt (red/black
 *   poster) and story (flat illustration) – the last three pick their symbols
 *   from the words of the line.
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
    glitch: ['400 100px "Bebas Neue"'],
    collage: ['900 100px "CM Fraunces"', '400 100px "Bebas Neue"', '700 100px "CM Cinzel"'],
    synthwave: ['700 100px "CM Orbitron"'],
    comic: ['400 100px "CM Bangers"'],
    cards: ['400 100px "Bebas Neue"', '900 100px "CM Fraunces"'],
    revolt: ['400 100px "Bebas Neue"'],
    story: ['400 100px "Bebas Neue"', '900 100px "CM Fraunces"'],
    diary: ['400 100px "CM Permanent Marker"', '900 100px "CM Fraunces"'],
    news: ['900 100px "CM Fraunces"', '400 100px "Bebas Neue"'],
    terminal: [],
    tunnel: ['400 100px "Bebas Neue"', '700 100px "CM Orbitron"'],
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
        portrait: null,
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
    renderCast(r);
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
    if (r.style === 'glitch') updateGlitchHud(r);
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
    } else if (style === 'glitch') {
      stage.innerHTML = `
        <div class="lg-ground" aria-hidden="true"></div>
        <div class="lg-scan" aria-hidden="true"></div>
        <div class="ls-frames"></div>
        <div class="lg-hud" aria-hidden="true"><span><i class="lg-rec"></i>REC</span><span class="lg-time">00:00</span></div>`;
    } else if (style === 'synthwave') {
      stage.innerHTML = `
        <div class="ly-sky" aria-hidden="true"></div>
        <div class="ly-sun" aria-hidden="true"></div>
        <div class="ly-horizon" aria-hidden="true"></div>
        <div class="ly-grid" aria-hidden="true"></div>
        <div class="ls-frames"></div>`;
    } else if (style === 'comic') {
      stage.innerHTML = `<div class="lcm-halftone" aria-hidden="true"></div><div class="ls-frames"></div>`;
    } else if (style === 'revolt') {
      stage.innerHTML = `<div class="lr-ground" aria-hidden="true"></div><div class="ls-frames"></div>`;
    } else if (style === 'story') {
      stage.innerHTML = `<div class="ls2-wash" aria-hidden="true"></div><div class="ls-frames"></div>`;
    } else if (style === 'diary') {
      stage.innerHTML = `<div class="ldy-paper" aria-hidden="true"></div><div class="ls-frames"></div>`;
    } else if (style === 'news') {
      stage.innerHTML = `<div class="lnw-paper" aria-hidden="true"></div><div class="ls-frames"></div>`;
    } else if (style === 'terminal') {
      stage.innerHTML = `<div class="ltm-bg" aria-hidden="true"></div><div class="ls-frames"></div>`;
    } else if (style === 'tunnel') {
      stage.innerHTML = `<div class="ltn-bg" aria-hidden="true"></div><div class="ls-frames"></div>`;
    } else {
      // cards (and any future plain stage)
      stage.innerHTML = '<div class="ls-frames"></div>';
    }
  }

  /* --- Plugin stage: figures behind the words (Plugin-API v3, "stage") -------- */

  const CAST_LANDSCAPE = [
    { x: 10, h: 62 },
    { x: 90, h: 62 },
    { x: 24, h: 42 },
    { x: 76, h: 42 },
    { x: 50, h: 34 },
    { x: 38, h: 30 },
  ];
  const CAST_PORTRAIT = [
    { x: 14, h: 40 },
    { x: 86, h: 40 },
    { x: 22, h: 30 },
    { x: 78, h: 30 },
    { x: 50, h: 24 },
    { x: 38, h: 22 },
  ];

  function sceneKey(scene) {
    if (!scene || !Array.isArray(scene.characters) || !scene.characters.length) return '';
    let hash = 2166136261;
    const value = [
      scene.game,
      scene.label ? '1' : '0',
      scene.accent,
      scene.size,
      scene.characters.map((character) => [character.src, character.name, character.anchor, character.motion, character.scale].join('|')).join('~'),
    ].join('~');
    for (const char of value) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
    return String(hash >>> 0);
  }

  function castMarkup(scene) {
    const portrait = window.innerHeight > window.innerWidth * 1.1;
    const rows = portrait ? CAST_PORTRAIT : CAST_LANDSCAPE;
    const size = Math.max(0.5, Math.min(1.4, Number(scene.size) || 1));
    return scene.characters
      .slice(0, 6)
      .map((character, index) => {
        const row = rows[Math.min(index, rows.length - 1)];
        const height = Math.max(12, Math.min(88, row.h * size * (Number(character.scale) || 1)));
        const anchor = ['left', 'right', 'center'].includes(character.anchor) ? character.anchor : index % 2 ? 'right' : 'left';
        const motion = ['bounce', 'sway', 'pulse', 'float', 'stomp'].includes(character.motion) ? character.motion : 'bounce';
        const name = scene.label && character.name ? `<figcaption>${esc(character.name)}</figcaption>` : '';
        return `<figure class="ls-cast-char ls-cast-${anchor} ls-cast-motion-${motion}" style="--x:${row.x}%;--h:${height.toFixed(1)};--delay:${(index * 0.07).toFixed(2)}s;--dim:${index > 1 ? 0.64 : 1}"><img src="${esc(character.src)}" alt="" draggable="false" />${name}</figure>`;
      })
      .join('');
  }

  function renderCast(r, force) {
    const scene = r.opts && r.opts.scene;
    const key = sceneKey(scene);
    let cast = r.stage.querySelector('.ls-cast');
    if (!scene) {
      if (cast) cast.remove();
      r.sceneKey = '';
      return;
    }
    if (!force && key === r.sceneKey && cast) return;
    const enter = key !== r.sceneKey;
    if (!cast) {
      cast = document.createElement('div');
      const frames = r.stage.querySelector('.ls-frames');
      if (frames && frames.parentNode) frames.parentNode.insertBefore(cast, frames);
      else r.stage.insertBefore(cast, r.stage.firstChild);
    }
    cast.className = `ls-cast${enter ? ' ls-cast-enter' : ''}`;
    if (scene.accent) cast.style.setProperty('--ls-cast-accent', scene.accent);
    cast.innerHTML = castMarkup(scene);
    r.sceneKey = key;
  }

  // app.js hands a new scene over while the lyrics are already running.
  function setScene(scene) {
    if (!run) return false;
    run.opts = Object.assign({}, run.opts, { scene: scene || null });
    renderCast(run, true);
    return true;
  }

  // Minimal HUD timecode, only once a second (no flicker).
  function updateGlitchHud(r) {
    const el = r.stage.querySelector('.lg-time');
    if (!el) return;
    const total = Math.max(0, Math.floor(currentTime(r)));
    if (r.hudSecond === total) return;
    r.hudSecond = total;
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    el.textContent = `${mm}:${ss}`;
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
    } else if (r.style === 'glitch') {
      const c = LV.glitchColors(colors);
      r.glitch = c;
      stage.style.setProperty('--lg-bg', c.bg);
      stage.style.setProperty('--lg-fg', c.fg);
      stage.style.setProperty('--lg-accent', c.accent);
      stage.style.setProperty('--lg-ghost-a', c.ghostA);
      stage.style.setProperty('--lg-ghost-b', c.ghostB);
      stage.style.setProperty('--lg-line', c.line);
      r.hudSecond = -1;
    } else if (r.style === 'collage') {
      const c = LV.collagePalette(colors);
      r.collage = c;
      stage.style.setProperty('--lk-paper-0', c.papers[0]);
      stage.style.setProperty('--lk-paper-1', c.papers[1]);
      stage.style.setProperty('--lk-paper-2', c.papers[2]);
      stage.style.setProperty('--lk-ink', c.inks[0]);
      stage.style.setProperty('--lk-soft', c.inks[1]);
      stage.style.setProperty('--lk-accent', c.accent);
      stage.style.setProperty('--lk-tape', c.tape);
    } else if (r.style === 'synthwave') {
      const c = LV.synthColors(colors);
      r.synth = c;
      stage.style.setProperty('--ly-sky', c.sky);
      stage.style.setProperty('--ly-sky-2', c.sky2);
      stage.style.setProperty('--ly-grid', c.grid);
      stage.style.setProperty('--ly-grid-2', c.grid2);
      stage.style.setProperty('--ly-sun-1', c.sun1);
      stage.style.setProperty('--ly-sun-2', c.sun2);
      stage.style.setProperty('--ly-chrome-top', c.chromeTop);
      stage.style.setProperty('--ly-chrome-mid', c.chromeMid);
      stage.style.setProperty('--ly-chrome-low', c.chromeLow);
      stage.style.setProperty('--ly-key', c.key);
      stage.style.setProperty('--ly-ink', c.ink);
    } else if (r.style === 'comic') {
      const c = LV.comicColors(colors);
      r.comic = c;
      stage.style.setProperty('--lcm-bg', c.bg);
      stage.style.setProperty('--lcm-ink', c.ink);
      stage.style.setProperty('--lcm-accent', c.accent);
      stage.style.setProperty('--lcm-pop', c.pop);
      stage.style.setProperty('--lcm-bubble', c.bubble);
      stage.style.setProperty('--lcm-shadow', c.shadow);
    } else if (r.style === 'cards') {
      const c = LV.cardsColors(colors);
      r.cards = c;
      stage.style.setProperty('--lcd-bg', c.bg);
      stage.style.setProperty('--lcd-paper', c.paper);
      stage.style.setProperty('--lcd-ink', c.ink);
      stage.style.setProperty('--lcd-accent', c.accent);
      stage.style.setProperty('--lcd-gold', c.gold);
      stage.style.setProperty('--lcd-soft', c.soft);
    } else if (r.style === 'revolt') {
      const c = LV.revoltColors(colors, 'red');
      r.revolt = c;
      stage.style.setProperty('--lr-bg', c.bg);
      stage.style.setProperty('--lr-fg', c.fg);
      stage.style.setProperty('--lr-accent', c.accent);
      stage.style.setProperty('--lr-ink', c.ink);
    } else if (r.style === 'story') {
      const c = LV.storyColors(colors);
      r.story = c;
      stage.style.setProperty('--ls2-bg', c.bg);
      stage.style.setProperty('--ls2-fg', c.fg);
      stage.style.setProperty('--ls2-accent', c.accent);
      stage.style.setProperty('--ls2-accent-2', c.accent2);
      stage.style.setProperty('--ls2-soft', c.soft);
      stage.style.setProperty('--ls2-paper', c.paper);
    } else if (r.style === 'diary') {
      const c = LV.diaryColors(colors);
      r.diary = c;
      stage.style.setProperty('--ldy-paper', c.paper);
      stage.style.setProperty('--ldy-ink', c.ink);
      stage.style.setProperty('--ldy-accent', c.accent);
      stage.style.setProperty('--ldy-tape', c.tape);
      stage.style.setProperty('--ldy-rule', c.rule);
      stage.style.setProperty('--ldy-soft', c.soft);
    } else if (r.style === 'news') {
      const c = LV.newsColors(colors);
      r.news = c;
      stage.style.setProperty('--lnw-paper', c.paper);
      stage.style.setProperty('--lnw-ink', c.ink);
      stage.style.setProperty('--lnw-accent', c.accent);
      stage.style.setProperty('--lnw-muted', c.muted);
      stage.style.setProperty('--lnw-soft', c.soft);
    } else if (r.style === 'terminal') {
      const c = LV.terminalColors(colors);
      r.terminal = c;
      stage.style.setProperty('--ltm-bg', c.bg);
      stage.style.setProperty('--ltm-fg', c.fg);
      stage.style.setProperty('--ltm-accent', c.accent);
      stage.style.setProperty('--ltm-dim', c.dim);
      stage.style.setProperty('--ltm-panel', c.panel);
    } else if (r.style === 'tunnel') {
      const c = LV.tunnelColors(colors);
      r.tunnel = c;
      stage.style.setProperty('--ltn-bg', c.bg);
      stage.style.setProperty('--ltn-fg', c.fg);
      stage.style.setProperty('--ltn-accent', c.accent);
      stage.style.setProperty('--ltn-ring1', c.ring1);
      stage.style.setProperty('--ltn-ring2', c.ring2);
      stage.style.setProperty('--ltn-ring3', c.ring3);
      stage.style.setProperty('--ltn-dim', c.dim);
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
    const box = stageSize(r);
    r.portrait = Boolean(box && box.portrait);
    // Word delays relative to "now", so a frame shown mid-way (seek, reopen) is complete.
    const delayOf = (word) => Math.max(0, Math.min(2.4, (Number(word.time) || 0) - now));
    let el;
    if (r.style === 'poster') el = posterEl(r, chunk, seed, k, delayOf);
    else if (r.style === 'brush') el = brushEl(r, chunk, seed, delayOf);
    else if (r.style === 'cinema') el = cinemaEl(r, chunk, seed, delayOf, Math.max(0.4, chunk.end - Math.max(now, chunk.start)));
    else if (r.style === 'glitch') el = glitchEl(r, chunk, seed, delayOf);
    else if (r.style === 'collage') el = collageEl(r, chunk, seed, delayOf);
    else if (r.style === 'synthwave') el = synthwaveEl(r, chunk, seed, delayOf);
    else if (r.style === 'comic') el = comicEl(r, chunk, seed, delayOf);
    else if (r.style === 'cards') el = cardsEl(r, chunk, seed, delayOf);
    else if (r.style === 'revolt') el = revoltEl(r, chunk, seed, delayOf);
    else if (r.style === 'story') el = storyEl(r, chunk, seed, delayOf);
    else if (r.style === 'diary') el = diaryEl(r, chunk, seed, delayOf);
    else if (r.style === 'news') el = newsEl(r, chunk, seed, delayOf);
    else if (r.style === 'terminal') el = terminalEl(r, chunk, seed, delayOf);
    else el = tunnelEl(r, chunk, seed, delayOf);
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

  // Glitch (Störung) -----------------------------------------------------------

  function glitchEl(r, chunk, seed, delayOf) {
    const LV = lv();
    const box = stageSize(r);
    const layout = LV.glitchFrame(chunk, seed, { portrait: Boolean(box && box.portrait) });
    const rnd = LV.prng(seed ^ 0x51ed);
    const el = document.createElement('div');
    el.className = 'lg-frame';
    el.dataset.shift = String(layout.shift);
    const words = chunk.words.length
      ? chunk.words
          .map(
            (word, i) =>
              `<span class="ls-w lg-w${i === layout.key ? ' lg-key' : ''}" data-text="${esc(word.text)}" style="--d:${delayOf(word).toFixed(2)}s;--rot:${layout.rot[i]}deg;--x:${(layout.jitter[i] * 0.055).toFixed(3)}em">${esc(word.text)}</span>`
          )
          .join('')
      : '<span class="ls-w lg-w" data-text="♪" style="--d:0s;--rot:0deg;--x:0em">♪</span>';
    const bars = Array.from({ length: layout.bars }, () =>
      `<i style="--y:${(6 + rnd() * 88).toFixed(1)}%;--w:${(16 + rnd() * 58).toFixed(1)}%;--h:${(1 + rnd() * 3).toFixed(1)}px;--dx:${(rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 18)}%;--bd:${(-rnd() * 7).toFixed(2)}s"></i>`
    ).join('');
    el.innerHTML = `
      <div class="lg-code">CH 0${1 + Math.floor(rnd() * 8)} <span>·</span> ${String(layout.shift).padStart(2, '0')} ms</div>
      <div class="lg-words${layout.stack ? ' lg-stack' : ''}">${words}</div>
      <div class="lg-bars" aria-hidden="true">${bars}</div>`;
    return el;
  }

  // Collage --------------------------------------------------------------------

  function collageEl(r, chunk, seed, delayOf) {
    const LV = lv();
    const box = stageSize(r);
    const layout = LV.collageFrame(chunk, seed, { portrait: Boolean(box && box.portrait) });
    const rnd = LV.prng(seed ^ 0x5a17);
    const el = document.createElement('div');
    el.className = `lk-frame lk-align-${layout.align}`;
    el.style.setProperty('--tilt', `${layout.tilt}deg`);
    const words = chunk.words;
    const rows = words.length
      ? layout.rows
          .map(
            (row) =>
              `<div class="lk-row">${row
                .map((index) => {
                  const word = words[index];
                  const letters = (layout.letters[index] || [])
                    .map(
                      (letter, at) =>
                        `<span class="ls-w lk-letter lk-paper-${letter.paper} lk-face-${letter.face} lk-ink-${letter.ink}" style="--rot:${letter.rot}deg;--d:${(delayOf(word) + at * 0.028).toFixed(2)}s">${esc(letter.ch)}</span>`
                    )
                    .join('');
                  const tape = index === layout.tape ? '<i class="lk-tape" aria-hidden="true"></i>' : '';
                  return `<span class="lk-word${index === layout.key ? ' lk-key' : ''}">${letters}${tape}</span>`;
                })
                .join('')}</div>`
          )
          .join('')
      : '<div class="lk-row"><span class="lk-word"><span class="ls-w lk-letter lk-paper-0 lk-face-1 lk-ink-ink" style="--rot:0deg;--d:0s">♪</span></span></div>';
    const scraps = Array.from(
      { length: layout.scraps },
      () =>
        `<i class="lk-scrap" style="--sx:${(rnd() < 0.5 ? 2 + rnd() * 12 : 78 + rnd() * 14).toFixed(1)}%;--sy:${(8 + rnd() * 78).toFixed(1)}%;--sw:${(9 + rnd() * 14).toFixed(1)}%;--sh:${(7 + rnd() * 9).toFixed(1)}%;--srot:${(rnd() * 24 - 12).toFixed(1)}deg"></i>`
    ).join('');
    el.innerHTML = `<div class="lk-scraps" aria-hidden="true">${scraps}</div><div class="lk-rows">${rows}</div>`;
    return el;
  }

  // Synthwave ------------------------------------------------------------------

  function synthwaveEl(r, chunk, seed, delayOf) {
    const LV = lv();
    const box = stageSize(r);
    const layout = LV.synthFrame(chunk, seed, { portrait: Boolean(box && box.portrait) });
    const rnd = LV.prng(seed ^ 0x7a31);
    const el = document.createElement('div');
    el.className = 'ly-frame';
    const words = chunk.words;
    const rows = words.length
      ? layout.rows
          .map(
            (row) =>
              `<div class="ly-row">${row
                .map(
                  (index) =>
                    `<span class="ls-w ly-w${index === layout.key ? ' ly-key' : ''}" style="--d:${delayOf(words[index]).toFixed(2)}s">${esc(words[index].text)}</span>`
                )
                .join('')}</div>`
          )
          .join('')
      : '<div class="ly-row"><span class="ls-w ly-w" style="--d:0s">♪</span></div>';
    const skew = layout.skew === 'left' ? -1 : 1;
    el.innerHTML = `
      <div class="ly-flare" style="--fx:${(12 + rnd() * 12).toFixed(1)}%;--fy:${(18 + rnd() * 24).toFixed(1)}%;--frot:${(skew * (8 + rnd() * 10)).toFixed(1)}deg" aria-hidden="true"></div>
      <div class="ly-rows${layout.stack ? ' ly-stack' : ''}">${rows}</div>`;
    return el;
  }

  // Comic ----------------------------------------------------------------------

  function comicBubble(kind) {
    if (kind === 'round') {
      return '<ellipse class="lcm-bubble-body" cx="50" cy="44" rx="45" ry="32" /><path class="lcm-bubble-body" d="M38 72 L30 92 L52 76 Z" />';
    }
    if (kind === 'cloud') {
      return '<path class="lcm-bubble-body" d="M14 58 C 2 44 8 26 24 24 C 26 8 46 2 58 12 C 70 0 92 6 92 24 C 104 32 100 52 86 56 C 84 72 66 78 54 68 C 40 80 18 76 14 58 Z" />';
    }
    return '<path class="lcm-bubble-body" d="M50 2 L60 18 L80 8 L76 28 L98 32 L82 46 L96 62 L74 62 L70 84 L54 70 L40 88 L32 68 L10 74 L20 54 L2 44 L22 34 L10 14 L32 20 Z" /><path class="lcm-bubble-body" d="M44 76 L32 96 L54 84 Z" />';
  }

  function comicEl(r, chunk, seed, delayOf) {
    const LV = lv();
    const box = stageSize(r);
    const layout = LV.comicFrame(chunk, seed, { portrait: Boolean(box && box.portrait) });
    const rnd = LV.prng(seed ^ 0x2c19);
    const el = document.createElement('div');
    el.className = `lcm-frame${layout.stack ? ' lcm-stack' : ''}`;
    el.style.setProperty('--tilt', `${layout.tilt}deg`);
    const words = chunk.words;
    const wordHtml = words.map(
      (word, i) =>
        `<span class="ls-w lcm-w${i === layout.key ? ' lcm-key' : ''}${i === layout.accent && i !== layout.key ? ' lcm-pop' : ''}" style="--d:${delayOf(word).toFixed(2)}s;--rot:${(Math.round((rnd() * 5 - 2.5) * 10) / 10).toFixed(1)}deg">${esc(word.text)}</span>`
    );
    const rows = layout.stack
      ? wordHtml.map((word) => `<div class="lcm-row">${word}</div>`).join('')
      : `<div class="lcm-row">${wordHtml.join('') || '<span class="ls-w lcm-w" style="--d:0s;--rot:0deg">♪</span>'}</div>`;
    const bubble = layout.key >= 0
      ? `<svg class="lcm-bubble" viewBox="0 0 100 100" preserveAspectRatio="none" style="--brot:${(rnd() * 10 - 5).toFixed(1)}deg;--btop:${layout.stack ? `${Math.min(78, 33 + layout.key * 22)}%` : '45%'}" aria-hidden="true">${comicBubble(layout.bubble)}</svg>`
      : '';
    const decor = layout.exclaim
      ? `<svg class="lcm-star" viewBox="0 0 100 100" style="--sx:${(rnd() < 0.5 ? 4 + rnd() * 10 : 80 + rnd() * 10).toFixed(1)}%;--sy:${(6 + rnd() * 20).toFixed(1)}%;--srot:${(rnd() * 30 - 15).toFixed(1)}deg" aria-hidden="true"><path d="M50 2 L60 34 L94 26 L68 50 L94 74 L60 66 L50 98 L40 66 L6 74 L32 50 L6 26 L40 34 Z" /></svg>
         <svg class="lcm-zap" viewBox="0 0 100 100" style="--sx:${(rnd() < 0.5 ? 8 + rnd() * 12 : 76 + rnd() * 12).toFixed(1)}%;--sy:${(68 + rnd() * 18).toFixed(1)}%;--srot:${(rnd() * 24 - 12).toFixed(1)}deg" aria-hidden="true"><path d="M58 2 L18 56 H44 L34 98 L84 38 H54 Z" /></svg>`
      : '';
    el.innerHTML = `${bubble}<div class="lcm-words">${rows}</div>${decor}`;
    return el;
  }

  // Cards (2.2.0) -------------------------------------------------------------

  const ICON_PATHS = {
    heart: '<path d="M50 88 C 20 66 6 50 6 33 C 6 17 18 6 32 6 C 40 6 47 12 50 20 C 53 12 60 6 68 6 C 82 6 94 17 94 33 C 94 50 80 66 50 88 Z"/>',
    spade: '<path d="M50 6 C 34 30 12 42 12 59 C 12 72 22 80 34 80 C 40 80 45 77 48 72 L 44 94 H 56 L 52 72 C 55 77 60 80 66 80 C 78 80 88 72 88 59 C 88 42 66 30 50 6 Z"/>',
    diamond: '<path d="M50 4 L 92 50 L 50 96 L 8 50 Z"/>',
    club: '<circle cx="50" cy="27" r="18"/><circle cx="26" cy="56" r="18"/><circle cx="74" cy="56" r="18"/><path d="M44 60 L 39 94 H 61 L 56 60 Z"/>',
    star: '<path d="M50 3 L 61 35 L 96 36 L 68 57 L 79 92 L 50 71 L 21 92 L 32 57 L 4 36 L 39 35 Z"/>',
    moon: '<path d="M64 4 A 46 46 0 1 0 96 66 A 38 38 0 0 1 64 4 Z"/>',
    eye: '<path fill-rule="evenodd" d="M4 50 C 24 21 76 21 96 50 C 76 79 24 79 4 50 Z M50 35 A 15 15 0 1 0 50 65 A 15 15 0 1 0 50 35 Z"/>',
    flower: '<g><circle cx="50" cy="24" r="15"/><circle cx="75" cy="42" r="15"/><circle cx="69" cy="72" r="15"/><circle cx="31" cy="72" r="15"/><circle cx="25" cy="42" r="15"/><circle class="lcd-center" cx="50" cy="50" r="13"/></g>',
    coin: '<circle cx="50" cy="50" r="34"/><circle class="lcd-line" cx="50" cy="50" r="22"/><path class="lcd-line" d="M50 34 V66"/>',
    flame: '<path d="M50 3 C 60 25 79 35 79 56 A 29 29 0 0 1 21 56 C 21 42 31 32 39 19 C 41 34 47 39 50 45 C 54 32 54 17 50 3 Z"/>',
    wave: '<path class="lcd-line" d="M3 38 Q 17 22 31 38 T 59 38 T 87 38 T 99 34"/><path class="lcd-line" d="M3 58 Q 17 42 31 58 T 59 58 T 87 58 T 99 54"/><path class="lcd-line" d="M3 78 Q 17 62 31 78 T 59 78 T 87 78 T 99 74"/>',
    city: '<path d="M4 94 V 48 H 20 V 94 Z M26 94 V 28 H 46 V 94 Z M52 94 V 56 H 68 V 94 Z M74 94 V 20 H 94 V 94 Z"/><path class="lcd-line" d="M32 38 H40 M32 50 H40 M32 62 H40 M80 32 H88 M80 44 H88"/>',
    clock: '<circle cx="50" cy="50" r="35"/><path class="lcd-line" d="M50 26 V 52 L 67 63"/>',
    sun: '<circle cx="50" cy="50" r="21"/><path class="lcd-line" d="M50 4 V 16 M50 84 V 96 M4 50 H 16 M84 50 H 96 M18 18 L 27 27 M73 73 L 82 82 M82 18 L 73 27 M27 73 L 18 82"/>',
    burst: '<path d="M50 2 L 58 30 L 82 12 L 70 38 L 98 44 L 72 56 L 88 82 L 60 70 L 50 98 L 40 70 L 12 82 L 28 56 L 2 44 L 30 38 L 18 12 L 42 30 Z"/>',
    cloud: '<path d="M20 76 C 6 76 2 58 14 50 C 12 34 28 26 38 34 C 44 18 66 16 74 32 C 88 30 96 44 92 56 C 100 64 94 76 82 76 Z"/>',
  };

  function iconSvg(icon, cls) {
    return `<svg class="lcd-icon${cls ? ` ${cls}` : ''}" viewBox="0 0 100 100" aria-hidden="true">${ICON_PATHS[icon] || ICON_PATHS.star}</svg>`;
  }

  function cardsEl(r, chunk, seed, delayOf) {
    const LV = lv();
    const box = stageSize(r);
    const layout = LV.cardsFrame(chunk, seed, { portrait: Boolean(box && box.portrait), text: r.lineText });
    const el = document.createElement('div');
    el.className = `lcd-frame lcd-side-${layout.side}${layout.stack ? ' lcd-stack' : ''}${box && box.portrait ? ' lcd-portrait' : ''}`;
    const cards = layout.cards
      .map(
        (card, i) => `<div class="lcd-card" style="--rot:${card.rot}deg;--x:${card.x}%;--y:${card.y}%;--sc:${card.scale};--d:${(i * 0.07).toFixed(2)}s;z-index:${layout.cards.length - i}">
          <span class="lcd-rank">${esc(card.rank)}</span>
          ${iconSvg(card.suit, 'lcd-corner')}
          <span class="lcd-pic">${iconSvg(card.icon, 'lcd-pic-icon')}</span>
          ${card.label ? `<span class="lcd-label">${esc(card.label)}</span>` : ''}
          ${iconSvg(card.suit, 'lcd-corner lcd-corner-b')}
        </div>`
      )
      .join('');
    const words = chunk.words.length
      ? chunk.words
          .map(
            (word, i) =>
              `<span class="ls-w lcd-w${i === layout.key ? ' lcd-key' : ''}" style="--d:${delayOf(word).toFixed(2)}s">${esc(word.text)}</span>`
          )
          .join('')
      : '<span class="ls-w lcd-w" style="--d:0s">♪</span>';
    el.innerHTML = `
      <div class="lcd-cards" aria-hidden="true">${cards}</div>
      <div class="lcd-copy"><div class="lcd-words">${words}</div><div class="lcd-rule"></div><span class="lcd-caption">${esc(layout.motif.label)}</span></div>
      ${layout.spark ? `<svg class="lcd-spark" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 2 L58 38 L94 50 L58 62 L50 98 L42 62 L6 50 L42 38 Z"/></svg>` : ''}`;
    return el;
  }

  // Revolt (2.2.0) ------------------------------------------------------------

  function revoltEl(r, chunk, seed, delayOf) {
    const LV = lv();
    const box = stageSize(r);
    const layout = LV.revoltFrame(chunk, seed, { portrait: Boolean(box && box.portrait), text: r.lineText });
    const c = LV.revoltColors(r.opts.colors, layout.tone);
    const el = document.createElement('div');
    el.className = `lr-frame lr-tone-${layout.tone}${layout.stack ? ' lr-stack' : ''}`;
    el.style.setProperty('--lr-bg', c.bg);
    el.style.setProperty('--lr-fg', c.fg);
    el.style.setProperty('--lr-accent', c.accent);
    el.style.setProperty('--lr-ink', c.ink);
    el.style.setProperty('--lr-angle', `${layout.angle}deg`);
    const words = chunk.words.length
      ? chunk.words
          .map(
            (word, i) =>
              `<span class="ls-w lr-w${i === layout.key ? ' lr-key' : ''}" style="--d:${delayOf(word).toFixed(2)}s">${esc(word.text)}</span>`
          )
          .join('')
      : '<span class="ls-w lr-w" style="--d:0s">♪</span>';
    const slash = Array.from({ length: layout.slashes }, () => '<i></i>').join('');
    el.innerHTML = `
      <div class="lr-bands" aria-hidden="true"></div>
      ${layout.burst ? '<svg class="lr-burst" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 2 L58 30 L82 12 L70 38 L98 44 L72 56 L88 82 L60 70 L50 98 L40 70 L12 82 L28 56 L2 44 L30 38 L18 12 L42 30 Z"/></svg>' : ''}
      <div class="lr-words">${words}</div>
      <div class="lr-foot"><span class="lr-label">${esc(layout.motif.label)}</span><span class="lr-slashes" aria-hidden="true">${slash}</span></div>`;
    return el;
  }

  // Story (2.2.0) -------------------------------------------------------------

  const STORY_ART = {
    night:
      '<circle class="ls2-accent" cx="70" cy="27" r="17"/><circle class="ls2-bg-fill" cx="63" cy="22" r="15"/>' +
      '<path class="ls2-paper" d="M22 18 L25 26 L33 29 L25 32 L22 40 L19 32 L11 29 L19 26 Z M48 40 L50 45 L55 47 L50 49 L48 54 L46 49 L41 47 L46 45 Z"/>' +
      '<path class="ls2-soft" d="M0 74 C 18 58 36 70 52 64 C 70 57 84 70 100 62 V100 H0 Z"/>' +
      '<path class="ls2-ink" d="M0 88 C 18 78 34 90 52 84 C 70 78 84 90 100 83 V100 H0 Z"/>',
    sea:
      '<circle class="ls2-accent" cx="68" cy="26" r="15"/><path class="ls2-stroke ls2-stroke-paper" d="M8 62 Q 22 46 36 62 T 64 62 T 92 62"/>' +
      '<path class="ls2-stroke ls2-stroke-accent" d="M4 76 Q 18 60 32 76 T 60 76 T 88 76"/><path class="ls2-stroke ls2-stroke-paper" d="M14 90 Q 28 74 42 90 T 70 90 T 98 90"/>',
    city:
      '<circle class="ls2-accent2" cx="22" cy="22" r="12"/><circle class="ls2-bg-fill" cx="27" cy="18" r="10"/>' +
      '<path class="ls2-paper" d="M58 16 L61 23 L68 26 L61 29 L58 36 L55 29 L48 26 L55 23 Z"/>' +
      '<path class="ls2-soft" d="M4 100 V 48 H 20 V 100 Z M26 100 V 28 H 46 V 100 Z M52 100 V 56 H 68 V 100 Z M74 100 V 20 H 94 V 100 Z"/>' +
      '<path class="ls2-paper" d="M32 38 H41 V 44 H32 Z M32 50 H41 V 56 H32 Z M80 32 H89 V 38 H80 Z M80 44 H89 V 50 H80 Z M58 64 H65 V 70 H58 Z"/>' +
      '<path class="ls2-ink" d="M0 82 H100 V100 H0 Z"/><path class="ls2-stroke ls2-stroke-accent2" d="M8 88 H92"/><rect class="ls2-accent" x="22" y="86" width="32" height="7" rx="3"/><circle class="ls2-paper" cx="28" cy="94" r="3"/><circle class="ls2-paper" cx="48" cy="94" r="3"/>',
    love:
      '<path class="ls2-accent" d="M50 86 C 24 66 10 51 10 36 C 10 21 21 11 34 11 C 42 11 47 16 50 23 C 53 16 58 11 66 11 C 79 11 90 21 90 36 C 90 51 76 66 50 86 Z"/>' +
      '<path class="ls2-stroke ls2-stroke-paper" d="M18 6 L14 22 M34 2 L30 18 M66 2 L70 18 M82 6 L86 22"/>' +
      '<path class="ls2-paper" d="M50 52 L54 62 L64 62 L56 68 L59 78 L50 72 L41 78 L44 68 L36 62 L46 62 Z"/>',
    fire:
      '<circle class="ls2-soft" cx="50" cy="54" r="34"/><path class="ls2-accent2" d="M50 8 C 61 32 80 42 80 61 A 30 30 0 0 1 20 61 C 20 46 31 36 39 23 C 41 38 47 44 50 50 C 54 37 54 22 50 8 Z"/>' +
      '<path class="ls2-paper" d="M50 44 C 56 56 64 60 64 69 A 14 14 0 0 1 36 69 C 36 62 43 56 46 50 C 47 57 49 59 50 61 C 52 55 52 50 50 44 Z"/>' +
      '<path class="ls2-stroke ls2-stroke-accent2" d="M12 22 L22 30 M88 22 L78 30 M8 54 H20 M80 54 H92"/>',
    flower:
      '<path class="ls2-stroke ls2-stroke-soft" d="M50 94 V 52"/><path class="ls2-accent" d="M50 76 C 36 76 28 68 26 58 C 40 58 48 64 50 76 Z M50 84 C 64 84 72 76 74 66 C 60 66 52 72 50 84 Z"/>' +
      '<g class="ls2-paper"><circle cx="50" cy="30" r="13"/><circle cx="68" cy="40" r="13"/><circle cx="64" cy="58" r="13"/><circle cx="36" cy="58" r="13"/><circle cx="32" cy="40" r="13"/></g>' +
      '<circle class="ls2-accent2" cx="50" cy="45" r="10"/><circle class="ls2-accent" cx="84" cy="18" r="10"/>',
    money:
      '<circle class="ls2-accent2" cx="50" cy="46" r="26"/><circle class="ls2-stroke ls2-stroke-ink" cx="50" cy="46" r="17"/><path class="ls2-stroke ls2-stroke-ink" d="M50 34 V 58"/>' +
      '<circle class="ls2-accent" cx="22" cy="76" r="9"/><circle class="ls2-paper" cx="78" cy="74" r="7"/>' +
      '<path class="ls2-paper" d="M14 16 L17 24 L25 27 L17 30 L14 38 L11 30 L3 27 L11 24 Z M82 12 L85 20 L93 23 L85 26 L82 34 L79 26 L71 23 L79 20 Z"/>',
    time:
      '<g class="ls2-stroke ls2-stroke-soft"><circle cx="50" cy="50" r="44"/><circle cx="50" cy="50" r="38"/></g><circle class="ls2-paper" cx="50" cy="50" r="28"/>' +
      '<path class="ls2-stroke ls2-stroke-ink" d="M50 30 V 52 L 64 62"/><circle class="ls2-accent" cx="50" cy="50" r="4"/>' +
      '<path class="ls2-paper" d="M14 14 L17 22 L25 25 L17 28 L14 36 L11 28 L3 25 L11 22 Z"/>',
    eye:
      '<path class="ls2-paper" fill-rule="evenodd" d="M4 50 C 24 20 76 20 96 50 C 76 80 24 80 4 50 Z M50 34 A 16 16 0 1 0 50 66 A 16 16 0 1 0 50 34 Z"/>' +
      '<circle class="ls2-accent" cx="50" cy="50" r="12"/><circle class="ls2-ink" cx="50" cy="50" r="5"/>' +
      '<path class="ls2-stroke ls2-stroke-accent2" d="M12 24 L22 32 M88 24 L78 32 M10 76 L20 68 M90 76 L80 68"/>',
    dream:
      '<path class="ls2-paper" d="M18 72 C 6 72 2 56 12 48 C 10 34 26 26 36 34 C 42 18 64 16 72 32 C 86 30 94 44 90 56 C 98 64 92 72 80 72 Z"/>' +
      '<circle class="ls2-accent" cx="74" cy="24" r="11"/><path class="ls2-accent2" d="M28 16 L31 24 L39 27 L31 30 L28 38 L25 30 L17 27 L25 24 Z M82 56 L84 61 L89 63 L84 65 L82 70 L80 65 L75 63 L80 61 Z"/>',
    fight:
      '<path class="ls2-accent" d="M50 2 L58 30 L82 12 L70 38 L98 44 L72 56 L88 82 L60 70 L50 98 L40 70 L12 82 L28 56 L2 44 L30 38 L18 12 L42 30 Z"/>' +
      '<path class="ls2-stroke ls2-stroke-paper" d="M16 90 L28 78 M40 94 L52 82 M72 94 L60 82"/>',
  };

  function storyEl(r, chunk, seed, delayOf) {
    const LV = lv();
    const box = stageSize(r);
    const layout = LV.storyFrame(chunk, seed, { portrait: Boolean(box && box.portrait), text: r.lineText });
    const words = chunk.words;
    const rows = words.length
      ? layout.rows
          .map(
            (row) =>
              `<div class="ls2-row">${row
                .map(
                  (index) =>
                    `<span class="ls-w ls2-w${index === layout.key ? ' ls2-key' : ''}" style="--d:${delayOf(words[index]).toFixed(2)}s">${esc(words[index].text)}</span>`
                )
                .join('')}</div>`
          )
          .join('')
      : '<div class="ls2-row"><span class="ls-w ls2-w" style="--d:0s">♪</span></div>';
    const el = document.createElement('div');
    el.className = `ls2-frame ls2-align-${layout.align}${layout.stack ? ' ls2-stack' : ''}`;
    el.style.setProperty('--ls2-tilt', `${layout.tilt}deg`);
    el.innerHTML = `
      <div class="ls2-art" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${STORY_ART[layout.scene] || STORY_ART.night}</svg></div>
      <div class="ls2-copy"><div class="ls2-words">${rows}</div><div class="ls2-caption"><span>${esc(layout.caption)}</span></div></div>`;
    return el;
  }

  // Tagebuch (diary) ----------------------------------------------------------

  function diaryEl(r, chunk, seed, delayOf) {
    const LV = lv();
    const box = stageSize(r);
    const layout = LV.diaryFrame(chunk, seed, { portrait: Boolean(box && box.portrait), text: r.lineText });
    const words = chunk.words;
    const rows = words.length
      ? layout.rows
          .map(
            (row) =>
              `<div class="ldy-row">${row
                .map(
                  (index) =>
                    `<span class="ls-w ldy-w${index === layout.key ? ' ldy-key' : ''}${index === layout.underline ? ' ldy-under' : ''}" style="--d:${delayOf(words[index]).toFixed(2)}s">${esc(words[index].text)}</span>`
                )
                .join('')}</div>`
          )
          .join('')
      : '<div class="ldy-row"><span class="ls-w ldy-w" style="--d:0s">♪</span></div>';
    const artwork = r.opts.artwork ? `<img src="${esc(r.opts.artwork)}" alt="" loading="lazy" />` : '';
    const el = document.createElement('div');
    el.className = `ldy-frame ldy-align-${layout.align || 'left'}${layout.stack ? ' ldy-stack' : ''}`;
    el.style.setProperty('--ldy-tilt', `${layout.tilt}deg`);
    el.innerHTML = `
      ${layout.polaroid ? `<div class="ldy-photo"><div class="ldy-photo-inner">${artwork}</div><i class="ldy-photo-tape"></i></div>` : ''}
      <svg class="ldy-doodle" viewBox="0 0 100 100" aria-hidden="true">${ICON_PATHS[layout.doodle] || ICON_PATHS.star}</svg>
      <div class="ldy-words">${rows}</div>
      <div class="ldy-note"><span>${esc(layout.motif.label)}</span><i></i></div>
      ${layout.scribble ? '<svg class="ldy-scribble" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path d="M2 14 C 20 4 34 18 52 10 S 82 4 98 12"/></svg>' : ''}`;
    return el;
  }

  // Zeitung (news) ------------------------------------------------------------

  function newsEl(r, chunk, seed, delayOf) {
    const LV = lv();
    const box = stageSize(r);
    const layout = LV.newsFrame(chunk, seed, { portrait: Boolean(box && box.portrait), text: r.lineText });
    const words = chunk.words;
    const headline = words.length
      ? words
          .map(
            (word, i) =>
              `<span class="ls-w lnw-w${i === layout.key ? ' lnw-key' : ''}" style="--d:${delayOf(word).toFixed(2)}s">${esc(word.text)}</span>`
          )
          .join('')
      : '<span class="ls-w lnw-w" style="--d:0s">♪</span>';
    const el = document.createElement('div');
    el.className = `lnw-frame${layout.stack ? ' lnw-stack' : ''}`;
    el.style.setProperty('--lnw-cols', String(layout.columns));
    el.innerHTML = `
      <header class="lnw-head"><span class="lnw-kicker">${esc(layout.kicker)}</span><span class="lnw-edition">CLEANMUSIC · SONGTEXT</span></header>
      <div class="lnw-rule"></div>
      <div class="lnw-headline">${headline}</div>
      <div class="lnw-lower">
        <div class="lnw-photo" aria-hidden="true"><div class="lnw-photo-art">${iconSvg(layout.photoIcon, 'lnw-photo-icon')}</div><span>${esc(layout.photoLabel)}</span></div>
        <div class="lnw-cols" aria-hidden="true">${Array.from({ length: layout.columns }, () => `<span class="lnw-col">${'<i></i>'.repeat(72)}</span>`).join('')}</div>
      </div>
      <footer class="lnw-foot"><span>${esc(layout.motif.label)}</span><span>NR. ${String((Number(seed) >>> 0) % 900 + 100)}</span><span>SEITE 1</span></footer>`;
    return el;
  }

  // Terminal ------------------------------------------------------------------

  function terminalEl(r, chunk, seed, delayOf) {
    const LV = lv();
    const box = stageSize(r);
    const layout = LV.terminalFrame(chunk, seed, { portrait: Boolean(box && box.portrait), text: r.lineText });
    const words = chunk.words;
    const line = words.length
      ? words
          .map(
            (word, i) =>
              `<span class="ls-w ltm-w${i === layout.key ? ' ltm-key' : ''}" style="--d:${delayOf(word).toFixed(2)}s">${esc(word.text)}</span>`
          )
          .join(' ')
      : '<span class="ls-w ltm-w" style="--d:0s">♪</span>';
    const el = document.createElement('div');
    el.className = `ltm-frame${layout.stack ? ' ltm-stack' : ''}`;
    el.innerHTML = `
      <div class="ltm-window">
        <div class="ltm-bar"><span>cleanmusic@local</span><span>~/lyrics</span></div>
        <div class="ltm-screen">
          <div class="ltm-cmd"><span class="ltm-prompt">${esc(layout.prompt)}</span> <span class="ltm-command">${esc(layout.command)}</span><span class="ltm-cursor" aria-hidden="true"></span></div>
          <div class="ltm-words">${line}</div>
          <div class="ltm-status"><span>MOTIF ${esc(layout.label)}</span><span>ONLINE</span><span>48 kHz</span></div>
        </div>
      </div>`;
    return el;
  }

  // Tunnel --------------------------------------------------------------------

  function tunnelEl(r, chunk, seed, delayOf) {
    const LV = lv();
    const box = stageSize(r);
    const layout = LV.tunnelFrame(chunk, seed, { portrait: Boolean(box && box.portrait), text: r.lineText });
    const words = chunk.words;
    const rows = words.length
      ? layout.rows
          .map(
            (row) =>
              `<div class="ltn-row">${row
                .map(
                  (index) =>
                    `<span class="ls-w ltn-w${index === layout.key ? ' ltn-key' : ''}" style="--d:${delayOf(words[index]).toFixed(2)}s">${esc(words[index].text)}</span>`
                )
                .join('')}</div>`
          )
          .join('')
      : '<div class="ltn-row"><span class="ls-w ltn-w" style="--d:0s">♪</span></div>';
    const rings = Array.from(
      { length: layout.rings },
      (_, i) => `<i style="--i:${i};--ring-rot:${(layout.spin + i * 9).toFixed(1)}deg"></i>`
    ).join('');
    const el = document.createElement('div');
    el.className = `ltn-frame${layout.stack ? ' ltn-stack' : ''}`;
    el.style.setProperty('--ltn-depth', String(layout.depth));
    el.innerHTML = `
      <div class="ltn-rings" aria-hidden="true">${rings}</div>
      <div class="ltn-core" aria-hidden="true">${iconSvg(layout.icon, 'ltn-core-icon')}</div>
      <div class="ltn-words">${rows}</div>`;
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

  // Measures the union of the word boxes (rotations included) with the
  // entrance animations switched off – otherwise a mid-animation scale would
  // make the words too big.
  function fitGroup(r, el, maxW, maxH, cap, selector) {
    if (!el) return 0;
    r.stage.classList.add('ls-measuring');
    el.style.fontSize = '100px';
    const rects = Array.from(el.querySelectorAll(selector))
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0);
    if (!rects.length) {
      // No word boxes (hidden frame): at least do not leave the measuring size.
      el.style.fontSize = `${Math.max(12, Math.min(maxW, maxH) * 0.24).toFixed(1)}px`;
      r.stage.classList.remove('ls-measuring');
      return 0;
    }
    const left = Math.min(...rects.map((rect) => rect.left));
    const right = Math.max(...rects.map((rect) => rect.right));
    const top = Math.min(...rects.map((rect) => rect.top));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    const width = right - left;
    const height = bottom - top;
    let size = 0;
    if (width > 0 && height > 0) {
      size = Math.min((maxW * 0.95 / width) * 100, (maxH * 0.95 / height) * 100, cap);
      el.style.fontSize = `${Math.max(12, size).toFixed(1)}px`;
    }
    r.stage.classList.remove('ls-measuring');
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
    } else if (r.style === 'glitch') {
      const stacked = Boolean(el.querySelector('.lg-words.lg-stack'));
      fitGroup(r, el.querySelector('.lg-words'), box.w * 0.9 * s, box.h * (stacked ? 0.6 : 0.34), box.h * (stacked ? 0.26 : 0.4) * s, '.lg-w');
    } else if (r.style === 'collage') {
      const stacked = Boolean(el.querySelectorAll('.lk-row').length > 1);
      fitGroup(r, el.querySelector('.lk-rows'), box.w * 0.86 * s, box.h * (stacked ? 0.72 : 0.55), box.h * (stacked ? 0.28 : 0.34) * s, '.lk-letter');
    } else if (r.style === 'synthwave') {
      const stacked = Boolean(el.querySelector('.ly-rows.ly-stack'));
      fitGroup(r, el.querySelector('.ly-rows'), box.w * 0.9 * s, box.h * (stacked ? 0.62 : 0.42), box.h * (stacked ? 0.28 : 0.42) * s, '.ly-w');
    } else if (r.style === 'comic') {
      const stacked = Boolean(el.querySelector('.lcm-frame.lcm-stack'));
      fitGroup(r, el.querySelector('.lcm-words'), box.w * (stacked ? 0.8 : 0.82) * s, box.h * (stacked ? 0.62 : 0.42), box.h * (stacked ? 0.28 : 0.46) * s, '.lcm-w');
    } else if (r.style === 'cards') {
      const stacked = el.classList.contains('lcd-stack') || el.classList.contains('lcd-portrait');
      fitGroup(r, el.querySelector('.lcd-words'), box.w * (stacked ? 0.86 : 0.42) * s, box.h * (stacked ? 0.34 : 0.56), box.h * (stacked ? 0.2 : 0.36) * s, '.lcd-w');
    } else if (r.style === 'revolt') {
      const stacked = el.classList.contains('lr-stack');
      fitGroup(r, el.querySelector('.lr-words'), box.w * 0.84 * s, box.h * (stacked ? 0.58 : 0.44), box.h * (stacked ? 0.28 : 0.44) * s, '.lr-w');
    } else if (r.style === 'story') {
      const stacked = el.classList.contains('ls2-stack');
      fitGroup(r, el.querySelector('.ls2-words'), box.w * (stacked ? 0.86 : 0.45) * s, box.h * (stacked ? 0.3 : 0.5), box.h * (stacked ? 0.18 : 0.34) * s, '.ls2-w');
    } else if (r.style === 'diary') {
      const stacked = el.classList.contains('ldy-stack');
      fitGroup(r, el.querySelector('.ldy-words'), box.w * (stacked ? 0.86 : 0.58) * s, box.h * (stacked ? 0.4 : 0.5), box.h * (stacked ? 0.24 : 0.34) * s, '.ldy-w');
    } else if (r.style === 'news') {
      const stacked = el.classList.contains('lnw-stack');
      fitGroup(r, el.querySelector('.lnw-headline'), box.w * 0.9 * s, box.h * (stacked ? 0.55 : 0.3), box.h * (stacked ? 0.17 : 0.26) * s, '.lnw-w');
    } else if (r.style === 'terminal') {
      const stacked = el.classList.contains('ltm-stack');
      fitGroup(r, el.querySelector('.ltm-words'), box.w * 0.86 * s, box.h * (stacked ? 0.52 : 0.3), box.h * (stacked ? 0.18 : 0.26) * s, '.ltm-w');
    } else if (r.style === 'tunnel') {
      const stacked = el.classList.contains('ltn-stack');
      fitGroup(r, el.querySelector('.ltn-words'), box.w * (stacked ? 0.86 : 0.8) * s, box.h * (stacked ? 0.62 : 0.4), box.h * (stacked ? 0.2 : 0.34) * s, '.ltn-w');
    }
  }

  function refit(r) {
    if (!r || r !== run || !r.stage.isConnected) return;
    if (r.style === 'lyricvideo') {
      fitStacked(r);
      return;
    }
    // A resize/rotation changes side-by-side versus stacked layouts: rebuild
    // the current frame instead of only scaling the old one.
    const box = stageSize(r);
    if (box && r.portrait !== null && box.portrait !== r.portrait) {
      showChunk(r, r.chunkIndex);
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
      cast: stage.querySelectorAll('.ls-cast-char').length,
      font: (() => {
        const word = stage.querySelector('.ls-w, .lv-word');
        return word ? parseFloat(getComputedStyle(word).fontSize) || 0 : 0;
      })(),
      watching: run.watching,
    };
  }

  return {
    render,
    stop,
    setScene,
    snapshot,
    refit: () => refit(run),
    STYLES: (window.CMLyricVideo && window.CMLyricVideo.STYLES) || ['lyricvideo', 'poster', 'brush', 'cinema'],
  };
})();
