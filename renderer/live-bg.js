'use strict';

(() => {
  const root = document.documentElement;
  const canvas = document.querySelector('#live-bg-canvas');
  const fullCanvas = document.querySelector('#fs-live-bg-canvas');
  const video = document.querySelector('#live-bg-video');
  const gif = document.querySelector('#live-bg-gif');
  video.muted = true;
  video.defaultMuted = true;
  video.volume = 0;
  video.loop = true;
  video.playsInline = true;
  const ctx = canvas && canvas.getContext('2d', { alpha: true });
  const fullCtx = fullCanvas && fullCanvas.getContext('2d', { alpha: true });
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scenes = new Set(['lava', 'waves', 'synthwave', 'nebula', 'rain']);
  const config = {
    id: 'none', motion: true, pulse: false, batteryStop: true, fsMode: 'cover-moving', fsLiveId: 'none',
    mediaUrl: '', mediaKind: '', maxFps: 24, resolution: 0.85, detail: 0.8,
  };
  let raf = 0;
  let lastFrame = 0;
  let startAt = performance.now();
  let beat = 0;
  let battery = null;
  let forcedHidden = false;
  let mediaUrl = '';
  let mediaKind = '';
  let gifFrozen = false;
  let onError = null;
  let frames = 0;
  let lastFrameDelta = 0;
  let lavaBlobs = [];
  let particles = [];

  gif.addEventListener('error', () => { if (onError && config.id === 'custom') onError('Hintergrund-GIF konnte nicht geladen werden.'); });

  function colors() {
    const style = getComputedStyle(root);
    const read = (name) => {
      const parts = style.getPropertyValue(name).split(',').map((part) => Number(part.trim()));
      return parts.length === 3 && parts.every(Number.isFinite) ? parts : null;
    };
    const background = read('--bg-rgb') || [Number.NaN, Number.NaN, Number.NaN];
    return {
      a: read('--accent-rgb') || background,
      b: read('--accent-2-rgb') || background,
      c: read('--warn-rgb') || background,
      muted: read('--muted-rgb') || background,
    };
  }

  function rgba(rgb, alpha) {
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.max(0, Math.min(1, alpha))})`;
  }

  function fitted(target) {
    if (!target) return null;
    // Lower internal resolution gets upscaled by CSS – much cheaper than
    // rendering every CSS pixel of a large fullscreen blur.
    const width = Math.max(1, Math.round(target.clientWidth * config.resolution));
    const height = Math.max(1, Math.round(target.clientHeight * config.resolution));
    if (target.width !== width || target.height !== height) {
      target.width = width;
      target.height = height;
    }
    return { width, height };
  }

  function seedScene(width, height) {
    const blobCount = Math.max(3, Math.round(7 * config.detail));
    const particleCount = Math.max(24, Math.round(110 * config.detail));
    lavaBlobs = Array.from({ length: blobCount }, (_value, index) => ({
      x: (0.12 + (index * 0.137) % 0.76) * width,
      y: (0.12 + (index * 0.217) % 0.76) * height,
      radius: Math.min(width, height) * (0.13 + (index % 3) * 0.035),
      phase: index * 1.71,
    }));
    particles = Array.from({ length: particleCount }, (_value, index) => ({
      x: ((index * 0.61803398875) % 1) * width,
      y: ((index * 0.754877666) % 1) * height,
      depth: 0.15 + ((index * 0.381966) % 0.85),
      phase: index * 2.27,
    }));
  }

  function drawMedia(target, context, size) {
    const source = mediaKind === 'gif' ? gif : video;
    if (!source || source.readyState != null && source.readyState < 2 || mediaKind === 'gif' && !source.naturalWidth) return false;
    const sw = mediaKind === 'gif' ? source.naturalWidth : source.videoWidth;
    const sh = mediaKind === 'gif' ? source.naturalHeight : source.videoHeight;
    if (!sw || !sh) return false;
    const scale = Math.max(size.width / sw, size.height / sh);
    const width = sw * scale;
    const height = sh * scale;
    context.drawImage(source, (size.width - width) / 2, (size.height - height) / 2, width, height);
    const palette = colors();
    context.fillStyle = rgba(palette.a, 0.12 + beat * 0.05);
    context.fillRect(0, 0, size.width, size.height);
    return true;
  }

  function drawScene(target, context, id, time, forcedSize = null) {
    if (!target || !context) return;
    const size = forcedSize || fitted(target);
    if (!size) return;
    const { width, height } = size;
    if ((id === 'custom' || mediaKind && id === 'custom') && drawMedia(target, context, size)) return;
    const palette = colors();
    const t = config.motion && !reduced.matches ? time : 0;
    const pulse = config.pulse ? Math.max(0, Math.min(1, beat)) : 0;
    const zoom = 1 + pulse * 0.15;
    context.clearRect(0, 0, width, height);

    if (id === 'lava') {
      if (!lavaBlobs.length) seedScene(width, height);
      context.save();
      context.filter = `blur(${Math.max(18, Math.min(width, height) * 0.045)}px)`;
      lavaBlobs.forEach((blob, index) => {
        const x = blob.x + Math.sin(t / 6800 + blob.phase) * width * 0.12;
        const y = blob.y + Math.cos(t / 8100 + blob.phase) * height * 0.12;
        const radius = blob.radius * zoom;
        const color = index % 3 === 0 ? palette.a : index % 3 === 1 ? palette.b : palette.c;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, rgba(color, 0.54));
        gradient.addColorStop(1, rgba(color, 0));
        context.fillStyle = gradient;
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
      });
      context.restore();
      return;
    }

    if (id === 'waves') {
      const layers = Math.max(3, Math.round(6 * config.detail));
      for (let layer = 0; layer < layers; layer += 1) {
        const color = layer % 2 ? palette.b : palette.a;
        context.beginPath();
        for (let x = 0; x <= width; x += Math.max(8, width / 120)) {
          const phase = x / width * Math.PI * 4 + t / (2400 + layer * 360) + layer * 0.8;
          const y = height * (0.28 + layer * 0.095) + Math.sin(phase) * height * (0.045 + pulse * 0.012);
          if (x === 0) context.moveTo(x, y); else context.lineTo(x, y);
        }
        context.strokeStyle = rgba(color, 0.2 + layer * 0.055);
        context.lineWidth = Math.max(1, width / 1000) * (1 + pulse * 0.15);
        context.stroke();
      }
      return;
    }

    if (id === 'synthwave') {
      const horizon = height * 0.43;
      const sunX = width * 0.5;
      const sunY = horizon * 0.68;
      const sunRadius = Math.min(width, height) * 0.2 * zoom;
      const sun = context.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
      sun.addColorStop(0, rgba(palette.c, 0.6));
      sun.addColorStop(0.65, rgba(palette.a, 0.36));
      sun.addColorStop(1, rgba(palette.a, 0));
      context.fillStyle = sun;
      context.beginPath(); context.arc(sunX, sunY, sunRadius, 0, Math.PI * 2); context.fill();
      context.strokeStyle = rgba(palette.a, 0.42);
      context.lineWidth = Math.max(1, width / 1400);
      for (let line = 0; line <= 14; line += 1) {
        const p = line / 14;
        const y = horizon + (height - horizon) * p * p;
        context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
      }
      const shift = (t / 90) % 80;
      for (let line = -12; line <= 12; line += 1) {
        const x = width / 2 + line * width / 18;
        context.beginPath(); context.moveTo(width / 2, horizon); context.lineTo(x + (line * shift), height); context.stroke();
      }
      return;
    }

    if (id === 'nebula') {
      if (!particles.length) seedScene(width, height);
      particles.forEach((particle, index) => {
        const x = (particle.x + Math.sin(t / (9000 * particle.depth) + particle.phase) * width * 0.035 + width) % width;
        const y = (particle.y + Math.cos(t / (11000 * particle.depth) + particle.phase) * height * 0.04 + height) % height;
        const radius = (1.5 + particle.depth * 5) * zoom;
        const gradient = context.createRadialGradient(x, y, 0, x, y, radius * 3);
        gradient.addColorStop(0, rgba(index % 2 ? palette.a : palette.b, 0.48 * particle.depth));
        gradient.addColorStop(1, rgba(palette.a, 0));
        context.fillStyle = gradient;
        context.beginPath(); context.arc(x, y, radius * 3, 0, Math.PI * 2); context.fill();
      });
      return;
    }

    if (id === 'rain') {
      if (!particles.length) seedScene(width, height);
      context.strokeStyle = rgba(palette.muted, 0.24);
      particles.forEach((drop, index) => {
        const speed = 0.006 + drop.depth * 0.018;
        const y = (drop.y + (config.motion && !reduced.matches ? t * speed : 0)) % height;
        const x = (drop.x + Math.sin(t / 5000 + drop.phase) * 12) % width;
        const length = (5 + drop.depth * 20) * zoom;
        context.lineWidth = 1 + drop.depth;
        context.beginPath(); context.moveTo(x, y); context.lineTo(x - 2, y + length); context.stroke();
        if (index % 4 === 0) {
          context.fillStyle = rgba(palette.b, 0.16);
          context.beginPath(); context.arc(x, y, 2 + drop.depth * 3, 0, Math.PI * 2); context.fill();
        }
      });
    }
  }

  function shouldRun() {
    const liveApp = scenes.has(config.id) || config.id === 'custom';
    const liveFullscreen = config.fsMode === 'live' && (scenes.has(config.fsLiveId) || config.fsLiveId === 'custom');
    return (liveApp || liveFullscreen) && config.motion && !reduced.matches && !document.hidden && !forcedHidden && !(config.batteryStop && battery && !battery.charging);
  }

  function updateMedia() {
    const mediaActive = config.id === 'custom' || config.fsMode === 'live' && (config.fsLiveId === 'custom' || config.id === 'custom');
    if (!mediaUrl || !mediaActive) {
      video.pause();
      if (mediaKind === 'gif') freezeGif();
      return;
    }
    if (mediaKind === 'video') {
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      if (shouldRun()) video.play().catch(() => { if (onError) onError('Video konnte nicht abgespielt werden.'); });
      else video.pause();
    } else if (mediaKind === 'gif') {
      if (shouldRun()) resumeGif(); else freezeGif();
    }
  }

  function freezeGif() {
    if (!gif || !mediaUrl || mediaKind !== 'gif' || gifFrozen || !gif.naturalWidth || !gif.naturalHeight) return;
    try {
      const snapshot = document.createElement('canvas');
      snapshot.width = Math.min(1280, gif.naturalWidth);
      snapshot.height = Math.max(1, Math.round(snapshot.width * gif.naturalHeight / gif.naturalWidth));
      snapshot.getContext('2d').drawImage(gif, 0, 0, snapshot.width, snapshot.height);
      const still = snapshot.toDataURL('image/png');
      gif.removeAttribute('src');
      gif.src = still;
      gifFrozen = true;
    } catch { /* Keep the last decoded frame if the browser cannot snapshot the GIF. */ }
  }

  function resumeGif() {
    if (!gif || mediaKind !== 'gif' || !gifFrozen) return;
    gifFrozen = false;
    gif.src = mediaUrl;
  }

  function setMedia(url, kind) {
    if (url === mediaUrl && kind === mediaKind) return;
    video.pause();
    video.removeAttribute('src');
    video.load();
    gif.removeAttribute('src');
    mediaUrl = String(url || '');
    mediaKind = mediaUrl ? kind : '';
    gifFrozen = false;
    if (!mediaUrl) return;
    if (mediaKind === 'gif') gif.src = mediaUrl;
    else {
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      video.loop = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = mediaUrl;
      video.load();
      video.addEventListener('error', () => { if (onError && config.id === 'custom') onError('Hintergrundvideo konnte nicht geladen werden.'); }, { once: true });
    }
  }

  function draw(time = performance.now()) {
    const appLive = scenes.has(config.id) || config.id === 'custom';
    const fsId = config.fsLiveId;
    const fsLive = config.fsMode === 'live' ? (scenes.has(fsId) || fsId === 'custom' ? fsId : '') : '';
    if (appLive) drawScene(canvas, ctx, config.id, time - startAt);
    else if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (fsLive) drawScene(fullCanvas, fullCtx, fsLive, time - startAt);
    else if (fullCtx && fullCanvas) fullCtx.clearRect(0, 0, fullCanvas.width, fullCanvas.height);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    updateMedia();
    draw(0);
  }

  function tick(time) {
    raf = 0;
    if (!shouldRun()) { stopLoop(); return; }
    if (time - lastFrame >= 1000 / Math.max(1, config.maxFps)) {
      if (lastFrame) lastFrameDelta = time - lastFrame;
      lastFrame = time;
      frames += 1;
      draw(time);
    }
    raf = requestAnimationFrame(tick);
  }

  function update() {
    root.classList.toggle('bg-hidden', document.hidden || forcedHidden || reduced.matches || (config.batteryStop && battery && !battery.charging));
    updateMedia();
    if (shouldRun()) {
      if (!raf) { lastFrame = 0; raf = requestAnimationFrame(tick); }
    } else stopLoop();
  }

  function configure(next = {}) {
    if ('id' in next) config.id = String(next.id || 'none');
    if ('motion' in next) config.motion = Boolean(next.motion);
    if ('pulse' in next) config.pulse = Boolean(next.pulse);
    if ('batteryStop' in next) config.batteryStop = Boolean(next.batteryStop);
    if ('fsMode' in next) config.fsMode = String(next.fsMode || 'cover-moving');
    if ('fsLiveId' in next) config.fsLiveId = String(next.fsLiveId || 'none');
    const previousPerf = `${config.maxFps}:${config.resolution}:${config.detail}`;
    if (Number.isFinite(next.maxFps)) config.maxFps = Math.max(5, Math.min(60, next.maxFps));
    if (Number.isFinite(next.resolution)) config.resolution = Math.max(0.4, Math.min(1, next.resolution));
    if (Number.isFinite(next.detail)) config.detail = Math.max(0.25, Math.min(1, next.detail));
    if (`${config.maxFps}:${config.resolution}:${config.detail}` !== previousPerf) {
      // Rebuild scene particles and force a new internal canvas size.
      lavaBlobs = [];
      particles = [];
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      if (fullCanvas) { fullCanvas.width = 0; fullCanvas.height = 0; }
    }
    if ('mediaUrl' in next || 'mediaKind' in next) {
      onError = typeof next.onError === 'function' ? next.onError : onError;
      setMedia(next.mediaUrl || '', next.mediaKind || '');
    } else if (typeof next.onError === 'function') onError = next.onError;
    startAt = performance.now();
    update();
  }

  function setBeat(value) {
    beat = config.pulse && config.motion && !reduced.matches ? Math.max(0, Math.min(1, Number(value) || 0)) : 0;
    root.style.setProperty('--beat', beat.toFixed(3));
  }

  document.addEventListener('visibilitychange', update);
  reduced.addEventListener ? reduced.addEventListener('change', update) : reduced.addListener(update);
  window.addEventListener('resize', () => { lavaBlobs = []; particles = []; if (shouldRun()) draw(); });
  if (navigator.getBattery) navigator.getBattery().then((value) => {
    battery = value;
    battery.addEventListener('chargingchange', update);
    battery.addEventListener('levelchange', update);
    update();
  }).catch(() => {});

  window.CMLiveBackground = {
    configure,
    setBeat,
    state: () => ({ id: config.id, motion: config.motion, pulse: config.pulse, fsMode: config.fsMode, maxFps: config.maxFps, resolution: config.resolution, detail: config.detail, running: Boolean(raf), paused: !shouldRun(), frames, lastFrameDelta, beat, videoMuted: video.muted, videoVolume: video.volume, videoSrc: Boolean(video.currentSrc), gifPaused: gifFrozen }),
    renderTestFrame: (id) => {
      const probe = document.createElement('canvas');
      probe.width = 640;
      probe.height = 360;
      const probeContext = probe.getContext('2d');
      if (!probeContext) return null;
      drawScene(probe, probeContext, id, 0, { width: probe.width, height: probe.height });
      return probeContext.getImageData(0, 0, probe.width, probe.height);
    },
    setVisibilityForTest: (hidden) => { forcedHidden = Boolean(hidden); update(); },
  };
})();
