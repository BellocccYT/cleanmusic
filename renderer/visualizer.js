'use strict';

/**
 * CleanMusic visualizer.
 *
 * Analyses whatever the <audio> element plays via captureStream() – the
 * element keeps playing normally, nothing is re-routed, so a source that
 * cannot be analysed never goes silent; the visualizer just idles.
 *
 * Styles: 'bars' (spectrum), 'radial' (ring around an anchor element,
 * e.g. the cover), 'wave' (oscilloscope), 'mini' (player bar).
 *
 * Optional output engine (volume boost above 100 % and loudness levelling):
 * only built once the user turns one of those on. It routes the element
 * through Web Audio (source → leveller → make-up → volume → limiter) for the
 * rest of the session; the visualizer then taps that source directly and the
 * AudioContext is never suspended again.
 */

window.CMVisualizer = (function () {
  let audioEl = null;
  let ctx = null;
  let analyser = null;
  let source = null; // MediaStreamSource from captureStream() – owned here
  let tapped = false; // analyser hangs on the engine source instead
  let engine = null; // { source, level, makeup, gain, limiter }
  const output = { gain: 1, normalize: false, bass: 0, treble: 0 };
  let freq = null;
  let wave = null;
  let enabled = false;
  let raf = 0;
  let lastDraw = 0;
  let energy = 0;
  let peak = 0;
  let colorA = [91, 140, 255];
  let colorB = [53, 224, 192];
  const targets = new Map(); // canvas -> { style, anchor, bars }
  const frameListeners = new Set();

  function ensureContext() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.8;
      analyser.minDecibels = -90;
      analyser.maxDecibels = -18;
      freq = new Uint8Array(analyser.frequencyBinCount);
      wave = new Uint8Array(analyser.fftSize);
      // Windows may suspend/interrupt the context (output device changed, e.g.
      // Wave Link or Bluetooth) – wake it up again while music plays.
      ctx.addEventListener('statechange', () => {
        if (ctx.state !== 'running' && audioEl && !audioEl.paused) ctx.resume().catch(() => {});
      });
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function disconnectSource() {
    if (tapped && engine) {
      try {
        engine.source.disconnect(analyser);
      } catch {
        /* ignore */
      }
    }
    tapped = false;
    if (!source) return;
    try {
      source.disconnect();
    } catch {
      /* ignore */
    }
    source = null;
  }

  function connect() {
    if (!enabled || !audioEl) return;
    if (engine) {
      ensureContext();
      if (tapped) return;
      disconnectSource();
      try {
        engine.source.connect(analyser);
        tapped = true;
      } catch {
        tapped = false;
      }
      return;
    }
    if (!audioEl.getAttribute('src')) return;
    ensureContext();
    disconnectSource();

    let stream = null;
    try {
      stream = audioEl.captureStream ? audioEl.captureStream() : null;
    } catch {
      stream = null;
    }
    if (!stream) return;

    const hook = () => {
      if (!stream.getAudioTracks().length) return false;
      try {
        disconnectSource();
        source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
      } catch {
        source = null;
      }
      return true;
    };

    if (!hook()) stream.addEventListener('addtrack', hook, { once: true });
  }

  function attach(audio) {
    audioEl = audio;
    audio.addEventListener('playing', connect);
    audio.addEventListener('emptied', () => {
      if (!engine) disconnectSource();
    });
    // With the engine the sound itself runs through the context – keep it awake.
    audio.addEventListener('play', () => {
      if (engine && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    });
  }

  /* ---------------------------------------------------------------- *
   * Output engine
   * ---------------------------------------------------------------- */

  function buildEngine() {
    if (engine || !audioEl) return engine;
    ensureContext();
    try {
      const src = ctx.createMediaElementSource(audioEl);
      const level = ctx.createDynamicsCompressor();
      const makeup = ctx.createGain();
      const gain = ctx.createGain();
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1.5;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.12;
      // Tone: low shelf (bass) and high shelf (treble), flat at 0 dB.
      const bass = ctx.createBiquadFilter();
      bass.type = 'lowshelf';
      bass.frequency.value = 120;
      const treble = ctx.createBiquadFilter();
      treble.type = 'highshelf';
      treble.frequency.value = 7500;
      src.connect(bass);
      bass.connect(treble);
      treble.connect(level);
      level.connect(makeup);
      makeup.connect(gain);
      gain.connect(limiter);
      limiter.connect(ctx.destination);
      engine = { source: src, bass, treble, level, makeup, gain, limiter };
    } catch {
      engine = null;
      return null;
    }
    // The captureStream tap is no longer needed – analyse the engine source.
    disconnectSource();
    if (enabled) connect();
    return engine;
  }

  function applyOutput() {
    if (!engine) return;
    const now = ctx.currentTime;
    engine.bass.gain.setTargetAtTime(output.bass, now, 0.05);
    engine.treble.gain.setTargetAtTime(output.treble, now, 0.05);
    engine.gain.gain.setTargetAtTime(output.gain, now, 0.02);
    const { level, makeup } = engine;
    if (output.normalize) {
      // Gentle levelling: loud masters come down a little, quiet ones up.
      level.threshold.value = -26;
      level.knee.value = 12;
      level.ratio.value = 3;
      level.attack.value = 0.012;
      level.release.value = 0.35;
      makeup.gain.setTargetAtTime(1.9, now, 0.05);
    } else {
      level.threshold.value = 0;
      level.knee.value = 0;
      level.ratio.value = 1;
      makeup.gain.setTargetAtTime(1, now, 0.05);
    }
  }

  /**
   * gain: linear output gain (may be > 1), normalize: levelling on/off,
   * want: build the engine if it does not exist yet.
   * Returns true when the engine carries the sound (element volume must
   * then stay at 1 – the gain is applied here).
   */
  function setOutput(options = {}) {
    if (Number.isFinite(options.gain)) output.gain = Math.max(0, Math.min(3, options.gain));
    if (typeof options.normalize === 'boolean') output.normalize = options.normalize;
    if (Number.isFinite(options.bass)) output.bass = Math.max(-12, Math.min(12, options.bass));
    if (Number.isFinite(options.treble)) output.treble = Math.max(-12, Math.min(12, options.treble));
    if (options.want && !engine) buildEngine();
    applyOutput();
    return Boolean(engine);
  }

  function setEnabled(on) {
    enabled = Boolean(on);
    if (enabled) {
      connect();
      loop();
    } else {
      disconnectSource();
      if (ctx && ctx.state === 'running' && !engine) ctx.suspend().catch(() => {});
      cancelAnimationFrame(raf);
      raf = 0;
      targets.forEach((_target, canvas) => clearCanvas(canvas));
    }
  }

  function register(canvas, options = {}) {
    if (!canvas) return;
    targets.set(canvas, {
      style: options.style || 'bars',
      anchor: options.anchor || null,
      mini: Boolean(options.mini),
      levels: [],
    });
    if (enabled) loop();
  }

  function setStyle(canvas, style) {
    const target = targets.get(canvas);
    if (target) target.style = style;
  }

  function setColors(a, b) {
    if (Array.isArray(a) && a.length === 3) colorA = a;
    if (Array.isArray(b) && b.length === 3) colorB = b;
  }

  function onFrame(listener) {
    frameListeners.add(listener);
    return () => frameListeners.delete(listener);
  }

  function clearCanvas(canvas) {
    const g = canvas.getContext('2d');
    if (g) g.clearRect(0, 0, canvas.width, canvas.height);
  }

  function visible(canvas) {
    return canvas.isConnected && canvas.offsetParent !== null && canvas.clientWidth > 0;
  }

  function fit(canvas) {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return ratio;
  }

  const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;

  // Log-spaced band levels (0..1) from the FFT, 30 Hz – 16 kHz.
  function bands(count) {
    const out = new Array(count).fill(0);
    if (!(source || tapped) || !freq) return out;

    const nyquist = ctx.sampleRate / 2;
    const binHz = nyquist / freq.length;
    const lo = Math.log(30);
    const hi = Math.log(16000);

    for (let i = 0; i < count; i += 1) {
      const from = Math.exp(lo + ((hi - lo) * i) / count);
      const to = Math.exp(lo + ((hi - lo) * (i + 1)) / count);
      const a = Math.max(1, Math.floor(from / binHz));
      const b = Math.max(a + 1, Math.ceil(to / binHz));
      let sum = 0;
      for (let k = a; k < b && k < freq.length; k += 1) sum += freq[k];
      const value = sum / (b - a) / 255;
      // gentle lift for the highs, which are naturally quieter
      out[i] = Math.min(1, value * (0.85 + (i / count) * 0.6));
    }
    return out;
  }

  function smooth(target, levels) {
    const prev = target.levels;
    target.levels = levels.map((value, i) => {
      const old = prev[i] || 0;
      return value > old ? old + (value - old) * 0.6 : old + (value - old) * 0.18;
    });
    return target.levels;
  }

  function idleLevels(count, t) {
    return Array.from({ length: count }, (_, i) => 0.05 + 0.04 * Math.sin(t / 700 + i * 0.45));
  }

  function drawBars(canvas, target, t, ratio) {
    const g = canvas.getContext('2d');
    const { width, height } = canvas;
    const count = target.mini ? 18 : Math.max(32, Math.min(96, Math.floor(width / (14 * ratio))));
    const levels = smooth(target, source || tapped ? bands(count) : idleLevels(count, t));
    g.clearRect(0, 0, width, height);

    const gap = (target.mini ? 2 : 4) * ratio;
    const barWidth = (width - gap * (count - 1)) / count;
    const maxHeight = target.mini ? height : height * 0.36;
    const gradient = g.createLinearGradient(0, height, 0, height - maxHeight);
    gradient.addColorStop(0, rgba(colorA, target.mini ? 0.9 : 0.7));
    gradient.addColorStop(0.65, rgba(colorB, target.mini ? 0.9 : 0.45));
    gradient.addColorStop(1, rgba(colorB, target.mini ? 0.9 : 0.05));
    g.fillStyle = gradient;

    if (!target.mini) {
      g.shadowColor = rgba(colorB, 0.45);
      g.shadowBlur = 18 * ratio;
    }

    levels.forEach((level, i) => {
      const h = Math.max(2 * ratio, level * maxHeight);
      const x = i * (barWidth + gap);
      const y = height - h;
      const r = Math.min(barWidth / 2, 6 * ratio);
      g.beginPath();
      if (g.roundRect) g.roundRect(x, y, barWidth, h, [r, r, 1, 1]);
      else g.rect(x, y, barWidth, h);
      g.fill();
    });
    g.shadowBlur = 0;
  }

  function drawRadial(canvas, target, t, ratio) {
    const g = canvas.getContext('2d');
    const { width, height } = canvas;
    g.clearRect(0, 0, width, height);

    let cx = width / 2;
    let cy = height / 2;
    let radius = Math.min(width, height) * 0.22;
    if (target.anchor && target.anchor.isConnected) {
      const box = target.anchor.getBoundingClientRect();
      const host = canvas.getBoundingClientRect();
      cx = (box.left + box.width / 2 - host.left) * ratio;
      cy = (box.top + box.height / 2 - host.top) * ratio;
      radius = (Math.max(box.width, box.height) / 2) * ratio * 1.08;
    }

    const count = 120;
    const levels = smooth(target, source || tapped ? bands(count / 2) : idleLevels(count / 2, t));
    const mirrored = levels.concat(levels.slice().reverse());
    const reach = Math.min(width, height) * 0.15;

    g.lineCap = 'round';
    g.shadowColor = rgba(colorB, 0.55);
    g.shadowBlur = 22 * ratio;

    mirrored.forEach((level, i) => {
      const angle = (i / mirrored.length) * Math.PI * 2 - Math.PI / 2 + t / 9000;
      const inner = radius + 6 * ratio;
      const outer = inner + 4 * ratio + level * reach * (1 + energy * 0.4);
      const mix = i / mirrored.length;
      const color = [0, 1, 2].map((k) => Math.round(colorA[k] + (colorB[k] - colorA[k]) * Math.abs(mix * 2 - 1)));
      g.strokeStyle = rgba(color, 0.55 + level * 0.45);
      g.lineWidth = Math.max(2 * ratio, ((Math.PI * 2 * inner) / mirrored.length) * 0.55);
      g.beginPath();
      g.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      g.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      g.stroke();
    });
    g.shadowBlur = 0;
  }

  function drawWave(canvas, target, t, ratio) {
    const g = canvas.getContext('2d');
    const { width, height } = canvas;
    g.clearRect(0, 0, width, height);

    const mid = height * 0.84;
    const amp = height * 0.11;
    const layers = [
      { color: colorA, alpha: 0.35, scale: 1.25, offset: 0 },
      { color: colorB, alpha: 0.9, scale: 1, offset: 0 },
    ];

    g.lineJoin = 'round';
    const samples = (source || tapped) && wave ? wave : null;
    const length = samples ? samples.length : 1024;
    layers.forEach((layer, layerIndex) => {
      g.beginPath();
      const step = Math.max(1, Math.floor(length / 512));
      for (let i = 0, x = 0; i < length; i += step) {
        const value = samples
          ? (samples[i] - 128) / 128
          : Math.sin(t / 500 + i / 40 + layerIndex) * 0.04;
        x = (i / (length - 1)) * width;
        const y = mid + value * amp * layer.scale * (1 + energy * 0.6);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokeStyle = rgba(layer.color, layer.alpha);
      g.lineWidth = (layerIndex ? 2.5 : 6) * ratio;
      g.shadowColor = rgba(layer.color, 0.6);
      g.shadowBlur = 20 * ratio;
      g.stroke();
    });
    g.shadowBlur = 0;
  }

  // Watchdog: music plays but the analyser has been flat for a while (tap lost
  // after a device change or a stream rebuffer) – resume the context and tap again.
  let silentSince = 0;
  let lastRecover = 0;
  function watchdog(t) {
    if (!audioEl || audioEl.paused || audioEl.ended || !audioEl.getAttribute('src')) {
      silentSince = 0;
      return;
    }
    let flat = !(source || tapped) || !ctx || ctx.state !== 'running';
    if (!flat) {
      let max = 0;
      for (let k = 0; k < 96; k += 1) if (freq[k] > max) max = freq[k];
      flat = max === 0;
    }
    if (!flat) {
      silentSince = 0;
      return;
    }
    if (!silentSince) {
      silentSince = t;
      return;
    }
    if (t - silentSince < 1500 || t - lastRecover < 3000) return;
    lastRecover = t;
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    if (!engine) connect();
  }

  function loop() {
    if (raf || !enabled) return;

    const tick = (t) => {
      raf = 0;
      if (!enabled) return;

      const active = Array.from(targets.entries()).filter(([canvas]) => visible(canvas));
      if (!active.length && !frameListeners.size) return; // sleep until register()/setEnabled()

      // Paused: a calm idle animation is enough – ~8 fps instead of 60.
      const resting = !audioEl || audioEl.paused;
      if (resting && energy < 0.01 && t - lastDraw < 120) {
        raf = requestAnimationFrame(tick);
        return;
      }
      lastDraw = t;

      if ((source || tapped) && analyser) {
        analyser.getByteFrequencyData(freq);
        analyser.getByteTimeDomainData(wave);
        let bass = 0;
        for (let k = 1; k < 10; k += 1) bass += freq[k];
        const level = bass / 9 / 255;
        peak = Math.max(level, peak * 0.96);
        const beat = peak > 0 ? Math.max(0, (level - peak * 0.72) / (peak * 0.28 + 0.001)) : 0;
        energy += (Math.min(1, beat) - energy) * 0.35;
      } else {
        energy *= 0.9;
      }
      watchdog(t);

      active.forEach(([canvas, target]) => {
        const ratio = fit(canvas);
        if (target.style === 'radial') drawRadial(canvas, target, t, ratio);
        else if (target.style === 'wave') drawWave(canvas, target, t, ratio);
        else drawBars(canvas, target, t, ratio);
      });

      frameListeners.forEach((listener) => {
        try {
          listener(energy, Boolean(source) || tapped);
        } catch {
          /* ignore */
        }
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
  }

  function wake() {
    if (enabled) loop();
  }

  return {
    attach,
    setEnabled,
    isEnabled: () => enabled,
    isAnalysing: () => Boolean(source) || tapped,
    setOutput,
    hasEngine: () => Boolean(engine),
    engineState: () =>
      engine
        ? {
            context: ctx.state,
            gain: output.gain,
            normalize: output.normalize,
            bass: Number(engine.bass.gain.value.toFixed(1)),
            treble: Number(engine.treble.gain.value.toFixed(1)),
          }
        : null,
    register,
    setStyle,
    setColors,
    onFrame,
    wake,
    energy: () => energy,
    // RMS of what the analyser hears right now (null = nothing connected).
    // Test only: drop the analyser tap as a lost device/stream would.
    _dropTap: () => {
      disconnectSource();
      return true;
    },
    signal: () => {
      if (!(source || tapped) || !analyser) return null;
      const buffer = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
      return Number(Math.sqrt(sum / buffer.length).toFixed(4));
    },
  };
})();
