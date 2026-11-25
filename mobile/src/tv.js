'use strict';

/**
 * CleanMusic TV Lite – Oberfläche für Android TV, Google TV und Fire TV.
 *
 * Dieselbe APK wie auf dem Handy, aber eine eigene, schlanke Seite:
 *  - Jetzt läuft, Radio, Charts, Favoriten, Songtexte, Themes, Live-Hintergrund,
 *    Plattenspieler, Visualizer, Warteschlange und Party-Modus
 *  - keine Plugins, kein Cutter, keine Downloads, keine Wellenform/BPM,
 *    kein Rückblick, kein Playlist-Import, keine lokale Musik, kein „Erweitert“
 *
 * Hauptbedienung ist das Handy: die Seite zeigt einen QR-Code und öffnet die
 * Steuerseite (renderer/remote/index.html) über den nativen HTTP-Server.
 * Die Fernbedienung bleibt als Notlösung: Fokus-Navigation, Play/Pause,
 * Weiter/Zurück und die Zurück-Taste funktionieren immer.
 */

(function () {
  const bridge = window.cm || {};
  const root = document.documentElement;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const STORAGE = {
    settings: 'cleanmusic.settings.v1',
    collection: 'cleanmusic.collection.v1',
    level: 'cleanmusic.volume.v2',
  };

  const VIEWS = ['home', 'mixes', 'radio', 'charts', 'favorites', 'party', 'queue'];

  const state = {
    view: 'home',
    settings: {},
    collection: { favorites: [], playlists: [] },
    queue: [],
    index: -1,
    playing: false,
    radio: { stations: [], entries: [], tag: 'top', loaded: false },
    charts: { tracks: [], loaded: false, error: null },
    lyrics: { key: '', lines: [], plain: '', index: -1, error: null, loading: false },
    mixes: { key: '', nonce: 0, lists: null },
    volume: 1,
    remote: { enabled: false, port: 0, url: '', qr: '', error: null, starting: false },
    focus: null,
    confirm: null,
    searchCache: new Map(),
    radioCache: new Map(),
  };

  /* ---------------------------------------------------------------- *
   * Hilfen
   * ---------------------------------------------------------------- */

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Speicher voll/gesperrt – App läuft weiter */
    }
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmt(seconds) {
    const n = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  }

  function hexToRgb(hex) {
    const match = String(hex || '').replace('#', '');
    const value = match.length === 3 ? match.split('').map((c) => c + c).join('') : match;
    const int = parseInt(value, 16);
    if (!Number.isFinite(int)) return [255, 255, 255];
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  }

  function loadSettings() {
    state.settings = Object.assign(
      {
        theme: 'nacht',
        background: 'none',
        bgMotion: true,
        bgPulse: false,
        visualizer: true,
        miniViz: true,
        vizStyle: 'radial',
        lyrics: true,
        lyricsEffect: 'pop',
        lyricsOffset: 0,
        coverVinyl: false,
      },
      readJSON(STORAGE.settings, {}) || {}
    );
  }

  function saveSettingsPatch(patch) {
    Object.assign(state.settings, patch);
    try {
      const raw = readJSON(STORAGE.settings, {}) || {};
      localStorage.setItem(STORAGE.settings, JSON.stringify(Object.assign({}, raw, patch)));
    } catch {
      /* Speicher gesperrt */
    }
  }

  function applyVinyl() {
    const on = state.settings.tvVinyl !== false; // im TV standardmäßig an
    $('#tv').classList.toggle('is-vinyl', on);
    const button = $('#tv-vinyl');
    if (button) button.textContent = on ? 'Plattenspieler: an' : 'Plattenspieler: aus';
  }

  function refreshLookLabels() {
    const theme = (Array.isArray(window.CM_THEMES) ? window.CM_THEMES : []).find(
      (item) => item.id === state.settings.theme
    );
    const themeButton = $('#tv-theme');
    if (themeButton) themeButton.textContent = `Theme: ${theme ? theme.name.replace('CleanMusic ', '') : 'Nacht'}`;
    const backgroundButton = $('#tv-background');
    if (backgroundButton) {
      const labels = {
        none: 'aus',
        lava: 'Lava',
        waves: 'Wellen',
        synthwave: 'Synthwave',
        nebula: 'Nebel',
        rain: 'Regen',
      };
      backgroundButton.textContent = `Hintergrund: ${labels[state.settings.background] || 'aus'}`;
    }
    const vizButton = $('#tv-viz-toggle');
    if (vizButton) vizButton.textContent = state.settings.visualizer === false ? 'Visualizer: aus' : 'Visualizer: an';
    applyVinyl();
  }

  function cycleTheme() {
    const themes = Array.isArray(window.CM_THEMES) ? window.CM_THEMES : [];
    if (!themes.length) return;
    const index = themes.findIndex((item) => item.id === state.settings.theme);
    const next = themes[(index + 1) % themes.length];
    saveSettingsPatch({ theme: next.id });
    applyTheme();
    refreshLookLabels();
    toast(`Theme: ${next.name}`);
  }

  function cycleBackground() {
    const order = ['none', 'lava', 'waves', 'synthwave', 'nebula', 'rain'];
    const index = order.indexOf(state.settings.background);
    const next = order[(index + 1) % order.length];
    saveSettingsPatch({ background: next });
    applyBackground();
    refreshLookLabels();
    toast(next === 'none' ? 'Hintergrund aus' : 'Live-Hintergrund an');
  }

  function toggleVinyl() {
    saveSettingsPatch({ tvVinyl: state.settings.tvVinyl === false });
    applyVinyl();
    toast(state.settings.tvVinyl === false ? 'Plattenspieler aus' : 'Plattenspieler an');
  }

  function toggleVisualizer() {
    saveSettingsPatch({ visualizer: state.settings.visualizer === false });
    applyVisualizer();
    refreshLookLabels();
    toast(state.settings.visualizer === false ? 'Visualizer aus' : 'Visualizer an');
  }


  function loadCollection() {
    const raw = readJSON(STORAGE.collection, {}) || {};
    state.collection = {
      favorites: Array.isArray(raw.favorites) ? raw.favorites : [],
      playlists: Array.isArray(raw.playlists) ? raw.playlists : [],
    };
  }

  /* ---------------------------------------------------------------- *
   * Theme + Hintergrund
   * ---------------------------------------------------------------- */

  function applyTheme() {
    const themes = Array.isArray(window.CM_THEMES) ? window.CM_THEMES : [];
    const theme = themes.find((item) => item.id === state.settings.theme) || themes[0];
    if (!theme) return;
    const c = theme.colors;
    const vars = {
      '--bg': c.bg,
      '--bg-2': c.bg2,
      '--panel': c.panel,
      '--panel-2': c.panel2,
      '--panel-3': c.panel3,
      '--border': c.border,
      '--border-soft': c.borderSoft,
      '--text': c.text,
      '--muted': c.muted,
      '--muted-2': c.muted2,
      '--accent': c.accent,
      '--accent-2': c.accent2,
      '--danger': c.danger,
      '--on-accent': c.onAccent,
      '--tint': theme.light ? '24, 32, 48' : '255, 255, 255',
      '--accent-rgb': hexToRgb(c.accent).join(', '),
      '--bg-2-rgb': hexToRgb(c.bg2).join(', '),
    };
    Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
    root.dataset.theme = theme.id;
    root.dataset.light = theme.light ? '1' : '0';

    if (window.CMVisualizer && window.CMVisualizer.setColors) {
      window.CMVisualizer.setColors(hexToRgb(c.accent), hexToRgb(c.accent2));
    }
  }

  function applyBackground() {
    const live = window.CMLiveBackground;
    if (!live) return;
    const id = String(state.settings.background || 'none');
    const media = id === 'custom' ? 'custom' : id;
    live.configure({
      id: media,
      motion: state.settings.bgMotion !== false,
      pulse: Boolean(state.settings.bgPulse),
      fsMode: state.settings.bgFs || 'cover-moving',
      maxFps: 30,
      resolution: 0.75,
      detail: 0.6,
      mediaUrl: state.settings.bgUrl || '',
      mediaKind: state.settings.bgKind || '',
    });
    document.body.classList.toggle('has-media-bg', Boolean(state.settings.bgUrl));
    document.body.classList.toggle('no-motion', state.settings.bgMotion === false);
  }

  function applyVisualizer() {
    const viz = window.CMVisualizer;
    if (!viz) return;
    const enabled = state.settings.visualizer !== false;
    viz.setEnabled(enabled);
    const mini = $('#tv-mini-viz');
    const party = $('#tv-viz');
    const home = $('#tv-home-viz');
    if (mini && !mini.dataset.registered) {
      viz.register(mini, { style: 'bars', mini: true });
      mini.dataset.registered = '1';
    }
    if (party && !party.dataset.registered) {
      viz.register(party, {
        style: state.settings.vizStyle || 'radial',
        anchor: $('#tv-party-cover'),
        reach: 0.24,
        simulate: true,
      });
      party.dataset.registered = '1';
    }
    if (home && !home.dataset.registered) {
      viz.register(home, { style: 'radial', anchor: $('#tv-home-cover'), reach: 0.2, simulate: true });
      home.dataset.registered = '1';
    }
    if (mini && state.settings.vizStyle) viz.setStyle(mini, 'bars');
    if (party) viz.setStyle(party, state.settings.vizStyle || 'radial');
    if (home) viz.setStyle(home, 'radial');
    if (viz.setPerformance) {
      viz.setPerformance({ profile: root.dataset.perf === 'quality' ? 'quality' : 'balanced' });
    }
  }

  /* ---------------------------------------------------------------- *
   * Fokus-Navigation (Fernbedienung)
   * ---------------------------------------------------------------- */

  function focusables() {
    const list = $$('#tv button, #tv .tv-card, #tv .tv-chip, #tv [data-focus]');
    return list.filter((el) => {
      if (el.disabled) return false;
      if (el.hidden) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return el.offsetWidth > 0 || el.offsetHeight > 0;
    });
  }

  function setFocus(el, options = {}) {
    if (!el) return;
    if (state.focus && state.focus !== el) state.focus.classList.remove('is-focus');
    state.focus = el;
    el.classList.add('is-focus');
    if (options.scroll !== false) {
      try {
        el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch {
        /* ältere WebView */
      }
    }
  }

  function focusFirst(container) {
    const host = container || $('#tv main .tv-view.is-active') || $('#tv');
    const list = focusables().filter((el) => host.contains(el) && !el.closest('.tv-view:not(.is-active)'));
    const cards = list.filter((el) => el.classList.contains('tv-card'));
    setFocus(cards[0] || list.find((el) => el.dataset.autofocus) || list[0] || null, { scroll: false });
  }

  function moveFocus(direction) {
    const list = focusables();
    if (!list.length) return;
    const current = state.focus && list.includes(state.focus) ? state.focus : null;
    if (!current) return focusFirst();

    const from = current.getBoundingClientRect();
    const cx = from.left + from.width / 2;
    const cy = from.top + from.height / 2;

    const candidates = [];
    for (const el of list) {
      if (el === current) continue;
      const rect = el.getBoundingClientRect();
      const ex = rect.left + rect.width / 2;
      const ey = rect.top + rect.height / 2;
      const dx = ex - cx;
      const dy = ey - cy;
      let primary = 0;
      let secondary = 0;
      if (direction === 'left') {
        if (dx > -12) continue;
        primary = -dx;
        secondary = Math.abs(dy);
      } else if (direction === 'right') {
        if (dx < 12) continue;
        primary = dx;
        secondary = Math.abs(dy);
      } else if (direction === 'up') {
        if (dy > -12) continue;
        primary = -dy;
        secondary = Math.abs(dx);
      } else {
        if (dy < 12) continue;
        primary = dy;
        secondary = Math.abs(dx);
      }
      candidates.push({ el, primary, secondary });
    }

    if (!candidates.length) return;
    // Erst die nächste Reihe/Spalte, erst dann seitlich versetzt: sonst
    // springt „runter“ von einer Kopfzeilen-Schaltfläche direkt in die
    // Player-Leiste und überspringt das Raster.
    const nearest = Math.min(...candidates.map((item) => item.primary));
    const row = candidates.filter((item) => item.primary <= nearest * 1.4 + 8);
    row.sort((a, b) => a.secondary - b.secondary || a.primary - b.primary);
    setFocus(row[0].el);
  }

  function activateFocused() {
    if (state.focus) {
      state.focus.click();
      return;
    }
    focusFirst();
  }

  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented) return;
    const map = {
      ArrowLeft: 'left',
      ArrowRight: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      Left: 'left',
      Right: 'right',
      Up: 'up',
      Down: 'down',
    };
    if (map[event.key]) {
      event.preventDefault();
      if (state.confirm) return moveConfirm(event.key);
      moveFocus(map[event.key]);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Select' || event.key === 'OK') {
      event.preventDefault();
      if (state.confirm) return;
      activateFocused();
      return;
    }
    if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'GoBack' || event.key === 'BrowserBack') {
      event.preventDefault();
      if (state.confirm) return closeConfirm(false);
      if (state.view !== 'home') return showView('home');
      return;
    }
    if (event.key === 'MediaPlayPause' || event.key === 'Play' || event.key === 'Pause') {
      event.preventDefault();
      return toggle();
    }
    if (event.key === 'MediaTrackNext') return next();
    if (event.key === 'MediaTrackPrevious') return previous();
  });

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button, .tv-card, .tv-chip');
    if (target && !target.closest('.tv-confirm')) setFocus(target, { scroll: false });
  });

  /* ---------------------------------------------------------------- *
   * Ansichten
   * ---------------------------------------------------------------- */

  function showView(name) {
    if (!VIEWS.includes(name)) return;
    state.view = name;
    $$('.tv-view').forEach((view) => view.classList.toggle('is-active', view.dataset.tvPanel === name));
    $$('.tv-nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.tvView === name));
    if (name === 'radio' && !state.radio.loaded) loadRadio(state.radio.tag);
    if (name === 'charts' && !state.charts.loaded) loadCharts();
    if (name === 'mixes') {
      renderMixes();
      // Fresh/Discover brauchen die Charts – nachladen und neu zeichnen.
      if (!state.charts.loaded) {
        Promise.resolve(loadCharts()).then(() => {
          if (state.view === 'mixes') renderMixes();
        });
      }
    }
    if (name === 'favorites') renderFavorites();
    if (name === 'queue') paintQueue();
    if (name === 'party') partMode(true);
    else partMode(false);
    focusFirst();
  }

  function partMode(on) {
    if (on) document.body.classList.add('is-party');
    else document.body.classList.remove('is-party');
  }

  /* ---------------------------------------------------------------- *
   * Player
   * ---------------------------------------------------------------- */

  const audio = $('#audio');
  let lyricsTimer = 0;
  let remotePushAt = 0;

  function current() {
    return state.queue[state.index] || null;
  }

  function playableUrl(entry) {
    if (!entry) return '';
    const url = entry.preview || entry.url || '';
    return /^https?:\/\//i.test(url) ? url : '';
  }

  function playEntry(entry, options = {}) {
    const url = playableUrl(entry);
    if (!entry || !url) return false;

    if (options.reset) {
      state.queue = [entry];
      state.index = 0;
    } else if (options.index != null) {
      state.index = options.index;
    }

    audio.src = url;
    audio.loop = entry.kind === 'radio';
    audio.volume = Math.min(1, state.volume);
    state.playing = true;
    const task = audio.play();
    if (task && task.catch) task.catch(() => { state.playing = false; paintPlayer(); });
    onTrackChanged();
    paintPlayer();
    pushRemote(true);
    return true;
  }

  function toggle() {
    if (!current()) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  function next() {
    if (state.index < state.queue.length - 1) {
      playEntry(state.queue[state.index + 1], { index: state.index + 1 });
      return;
    }
    if (state.queue.length && state.queue[0].kind === 'radio') {
      playEntry(state.queue[0], { index: 0 });
    }
  }

  function previous() {
    if (audio.currentTime > 4 && state.queue[state.index] && state.queue[state.index].kind !== 'radio') {
      audio.currentTime = 0;
      return;
    }
    if (state.index > 0) playEntry(state.queue[state.index - 1], { index: state.index - 1 });
    else if (state.queue.length) {
      audio.currentTime = 0;
    }
  }

  function enqueue(entry, position) {
    if (!entry) return false;
    const at = position === 'next' ? state.index + 1 : state.queue.length;
    state.queue.splice(Math.max(0, at), 0, entry);
    if (state.index < 0) {
      playEntry(entry, { index: 0 });
    }
    paintAll();
    pushRemote(true);
    return true;
  }

  function onTrackChanged() {
    const entry = current();
    ensureLyrics(entry);
    paintNowPlaying();
    paintNext();
    document.title = entry ? `${entry.title} · CleanMusic TV` : 'CleanMusic TV';
  }

  audio.addEventListener('play', () => {
    state.playing = true;
    paintPlayer();
    pushRemote(true);
  });
  audio.addEventListener('pause', () => {
    state.playing = false;
    paintPlayer();
    pushRemote(true);
  });
  audio.addEventListener('loadedmetadata', () => {
    paintPlayer();
    pushRemote(true);
  });
  audio.addEventListener('timeupdate', () => {
    paintProgress();
    updateLyricLine();
    if (Date.now() - remotePushAt > 1200) pushRemote();
  });
  audio.addEventListener('ended', () => {
    if (audio.loop) return;
    if (state.index < state.queue.length - 1) next();
    else {
      state.playing = false;
      paintPlayer();
      pushRemote(true);
    }
  });
  audio.addEventListener('error', () => {
    const entry = current();
    if (entry && entry.kind === 'radio') {
      toast('Sender antwortet nicht – bitte einen anderen wählen.');
    }
    state.playing = false;
    paintPlayer();
  });

  /* ---------------------------------------------------------------- *
   * Malen
   * ---------------------------------------------------------------- */

  function coverHtml(entry, className) {
    const art = entry && /^https:\/\//i.test(entry.artwork || '') ? entry.artwork : '';
    if (art) return `<div class="${className}"><img src="${esc(art)}" alt="" loading="lazy" /></div>`;
    return `<div class="${className}"><span>♪</span></div>`;
  }

  function paintAll() {
    paintNowPlaying();
    paintPlayer();
    paintNext();
    paintQueue();
    renderFavorites();
  }

  function paintNowPlaying() {
    const entry = current();
    const title = entry ? entry.title : 'Nichts ausgewählt';
    const artist = entry ? entry.artist || (entry.kind === 'radio' ? 'Live Radio' : '') : 'Radio, Charts oder Favoriten starten';

    $('#tv-home-title').textContent = title;
    $('#tv-home-artist').textContent = artist;
    const cover = $('#tv-home-cover');
    if (cover) {
      const art = entry && /^https:\/\//i.test(entry.artwork || '') ? entry.artwork : '';
      cover.innerHTML = art ? `<img src="${esc(art)}" alt="" />` : '<span>♪</span>';
    }
    paintStageMeta(entry, title, artist);
    renderHomeServices(entry);
    paintParty();
  }

  function paintStageMeta(entry, title, artist) {
    const stageTitle = $('#tv-party-title');
    const stageArtist = $('#tv-party-artist');
    if (stageTitle) stageTitle.textContent = title;
    if (stageArtist) stageArtist.textContent = artist || '';
    const cover = $('#tv-party-cover');
    if (cover) {
      const art = entry && /^https:\/\//i.test(entry.artwork || '') ? entry.artwork : '';
      cover.innerHTML = art ? `<img src="${esc(art)}" alt="" />` : '<span>♪</span>';
    }
  }

  function renderHomeServices(entry) {
    const host = $('#tv-home-services');
    if (!host) return;
    if (!entry || !entry.title) {
      host.innerHTML = '';
      return;
    }
    const services = [
      ['spotify', 'Spotify'],
      ['ytmusic', 'YT Music'],
      ['apple', 'Apple Music'],
    ];
    host.innerHTML = services
      .map(
        ([id, label]) =>
          `<button type="button" class="tv-btn" data-open-music="${id}" title="In ${esc(label)} öffnen" data-focus>${esc(label)}</button>`
      )
      .join('');
    host.querySelectorAll('[data-open-music]').forEach((button) => {
      button.addEventListener('click', () => openInService(button.dataset.openMusic, entry));
    });
  }

  function openInService(service, entry) {
    if (!entry) return;
    if (typeof bridge.openMusic === 'function') {
      bridge.openMusic({ service, title: entry.title, artist: entry.artist, url: entry.link || '' });
      toast(`Öffne ${service === 'spotify' ? 'Spotify' : service === 'apple' ? 'Apple Music' : 'YouTube Music'} …`);
      return;
    }
    const query = encodeURIComponent([entry.artist, entry.title].filter(Boolean).join(' '));
    const url =
      service === 'spotify'
        ? `https://open.spotify.com/search/${query}`
        : service === 'apple'
          ? `https://music.apple.com/de/search?term=${query}`
          : `https://music.youtube.com/search?q=${query}`;
    if (bridge.openExternal) bridge.openExternal(url);
  }

  function paintPlayer() {
    const entry = current();
    $('#tv-title').textContent = entry ? entry.title : 'Nichts ausgewählt';
    $('#tv-artist').textContent = entry ? entry.artist || '' : 'CleanMusic TV';
    const cover = $('#tv-cover');
    if (cover) {
      const art = entry && /^https:\/\//i.test(entry.artwork || '') ? entry.artwork : '';
      cover.innerHTML = art ? `<img src="${esc(art)}" alt="" />` : '<span>♪</span>';
    }
    $('#tv-play').textContent = state.playing ? 'Ⅱ' : '▶';
    document.body.classList.toggle('is-playing', state.playing && !audio.paused);
    paintProgress();
  }

  function paintProgress() {
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    const ratio = duration ? Math.min(1, position / duration) : 0;
    const fill = $('#tv-progress-fill');
    if (fill) fill.style.width = `${(ratio * 100).toFixed(2)}%`;
    $('#tv-position').textContent = fmt(position);
    $('#tv-duration').textContent = duration ? fmt(duration) : current() && current().kind === 'radio' ? 'LIVE' : '0:00';
  }

  function paintNext() {
    const host = $('#tv-home-next');
    if (!host) return;
    const items = state.queue.slice(state.index + 1, state.index + 6);
    if (!items.length) {
      host.innerHTML = '<li class="tv-muted">Noch keine Titel</li>';
    } else {
      host.innerHTML = items
        .map(
          (item) =>
            `<li><b>${esc(item.title)}</b><span>${esc(item.artist || '')}</span></li>`
        )
        .join('');
    }
    const nextEntry = state.queue[state.index + 1];
    $('#tv-party-next').textContent = nextEntry ? `Als Nächstes: ${nextEntry.title}${nextEntry.artist ? ` · ${nextEntry.artist}` : ''}` : '';
  }

  function paintQueue() {
    const host = $('#tv-queue-list');
    if (!host) return;
    if (!state.queue.length) {
      host.innerHTML = '<li class="tv-muted">Noch keine Titel – vom Handy einreihen.</li>';
      return;
    }
    host.innerHTML = state.queue
      .map(
        (item, index) => `
        <li class="tv-queue-row ${index === state.index ? 'is-playing' : ''}" data-queue-index="${index}" data-focus>
          <span class="tv-queue-idx">${index === state.index ? '▶' : index + 1}</span>
          <span><span>${esc(item.title)}</span><span class="tv-queue-sub">${esc(item.artist || '')}</span></span>
          <span class="tv-queue-sub">${item.kind === 'radio' ? 'LIVE' : fmt(item.duration)}</span>
        </li>`
      )
      .join('');
    host.querySelectorAll('[data-queue-index]').forEach((row) => {
      row.addEventListener('click', () => playEntry(state.queue[Number(row.dataset.queueIndex)], { index: Number(row.dataset.queueIndex) }));
    });
  }

  /* ---------------------------------------------------------------- *
   * Songtexte (LRCLIB) mit denselben Effekten wie am Desktop
   * ---------------------------------------------------------------- */

  const BIG_EFFECTS = ['kinetic', 'wave', 'typer', 'zoom'];

  function lyricEffect() {
    const allowed = ['none', 'pop', 'karaoke', 'kinetic', 'neon', 'wave', 'typer', 'zoom'];
    return allowed.includes(state.settings.lyricsEffect) ? state.settings.lyricsEffect : 'pop';
  }

  function lyricsSynced() {
    const entry = current();
    return Boolean(entry) && entry.kind !== 'radio' && entry.source !== 'radio';
  }

  function lineDuration(index) {
    const line = state.lyrics.lines[index];
    const nextLine = state.lyrics.lines[index + 1];
    const value = line && nextLine ? nextLine.time - line.time : 4;
    return Math.max(0.6, Math.min(10, value || 4));
  }

  async function ensureLyrics(entry) {
    const key = entry ? `${entry.artist || ''}|${entry.title || ''}`.toLowerCase() : '';
    if (!entry || !lyricsSynced() || typeof bridge.lyricsGet !== 'function') {
      state.lyrics = { key, lines: [], plain: '', index: -1, error: null, loading: false };
      paintLyrics();
      return;
    }
    if (key === state.lyrics.key) return;
    state.lyrics = { key, lines: [], plain: '', index: -1, error: null, loading: true };
    paintLyrics();
    let result;
    try {
      result = await bridge.lyricsGet({
        title: entry.title || '',
        artist: entry.artist || '',
        album: entry.album || '',
        duration: Math.round(entry.duration || audio.duration || 0),
      });
    } catch (error) {
      result = { error: error.message };
    }
    if (state.lyrics.key !== key) return;
    state.lyrics.lines = Array.isArray(result.lines) ? result.lines : [];
    state.lyrics.plain = result.plain || '';
    state.lyrics.error = result.error || null;
    state.lyrics.loading = false;
    state.lyrics.index = -1;
    paintLyrics();
  }

  function paintLyrics() {
    const entry = current();
    const line = state.lyrics.lines[state.lyrics.index];
    $('#tv-home-lyric').textContent = line ? line.text : '';
    paintParty();
    if (!entry) return;
    pushRemote(true);
  }

  function paintParty() {
    const host = $('#tv-party-lyrics');
    if (!host) return;
    const lines = state.lyrics.lines;
    const effect = lyricEffect();

    if (!lines.length) {
      const message = state.lyrics.loading
        ? 'Songtext wird gesucht …'
        : state.lyrics.plain
          ? state.lyrics.plain.split('\n').slice(0, 6).join(' · ')
          : state.lyrics.error || 'Songtext erscheint, sobald ein Titel mit Text läuft.';
      host.className = 'tv-party-lyrics tv-lyrics';
      host.innerHTML = `<p class="tv-party-line is-next">${esc(message)}</p>`;
      return;
    }

    if (BIG_EFFECTS.includes(effect) && state.view === 'party') {
      const index = Math.max(0, state.lyrics.index);
      const line = lines[index] || { text: '♪' };
      const nextLine = lines[index + 1];
      const text = String(line.text || '♪');
      const typer = effect === 'typer';
      const units = typer ? Array.from(text) : text.split(/\s+/).filter(Boolean);
      const span = Math.min(lineDuration(index) * (typer ? 0.8 : 0.7), typer ? 3.5 : 2.6) * 1000;
      const step = units.length > 1 ? span / units.length : 0;
      host.className = `tv-party-lyrics tv-lyrics ly-kinetic ly-k-${effect}`;
      host.innerHTML = `
        <p class="ly-k-line">${units
          .map((unit, at) => {
            const delay = Math.round(at * step);
            const timing =
              effect === 'wave'
                ? `animation-delay:${delay}ms, ${delay + 550 + at * 90}ms`
                : `animation-delay:${delay}ms`;
            const cls = !typer && unit.replace(/[^\p{L}]/gu, '').length > 6 ? 'hl' : '';
            return `<span class="${cls}" style="${timing};--tilt:${(at % 2 ? 1 : -1) * (2 + (at % 3))}deg">${unit === ' ' ? '&nbsp;' : esc(unit)}</span>`;
          })
          .join(typer ? '' : ' ')}</p>
        <p class="ly-k-next">${esc((nextLine && nextLine.text) || '')}</p>`;
      return;
    }

    host.className = `tv-party-lyrics tv-lyrics tv-lyrics-list`;
    host.dataset.fx = effect;
    host.innerHTML = lines
      .slice(Math.max(0, state.lyrics.index - 4), Math.max(0, state.lyrics.index) + 6)
      .map((line, offset) => {
        const at = Math.max(0, state.lyrics.index - 4) + offset;
        const cls = at === state.lyrics.index ? 'is-current' : at < state.lyrics.index ? 'is-past' : 'is-next';
        return `<p class="tv-party-line ${cls}">${esc(line.text) || '♪'}</p>`;
      })
      .join('');
  }

  function updateLyricLine() {
    if (!state.lyrics.lines.length || !lyricsSynced()) return;
    const offset = Math.max(-10, Math.min(10, Number(state.settings.lyricsOffset) || 0));
    const time = (audio.currentTime || 0) + offset;
    let index = -1;
    for (let at = 0; at < state.lyrics.lines.length; at += 1) {
      if (state.lyrics.lines[at].time <= time + 0.2) index = at;
      else break;
    }
    if (index === state.lyrics.index) return;
    state.lyrics.index = index;
    const line = state.lyrics.lines[index];
    $('#tv-home-lyric').textContent = line ? line.text : '';
    if (state.view === 'party') paintParty();
  }

  /* ---------------------------------------------------------------- *
   * Radio und Charts
   * ---------------------------------------------------------------- */

  function stationEntry(station) {
    return {
      id: `radio:${station.id}`,
      kind: 'radio',
      source: 'radio',
      sourceLabel: 'Radio',
      title: station.name,
      artist: [station.country, ...(station.tags || [])].filter(Boolean).slice(0, 2).join(' · ') || 'Live Radio',
      album: '',
      artwork: station.favicon || '',
      duration: 0,
      url: station.url,
      link: station.homepage || '',
    };
  }

  function previewEntry(track) {
    return {
      id: track.id,
      kind: 'preview',
      source: track.source,
      sourceLabel: track.sourceLabel || (track.source === 'apple' ? 'Apple Music' : 'Deezer'),
      title: track.title,
      artist: track.artist,
      album: track.album || '',
      artwork: track.artwork || '',
      duration: track.duration || 0,
      preview: track.preview,
      link: track.link || '',
      artistId: track.artistId || null,
    };
  }

  const RADIO_TAGS = [
    ['top', 'Beliebt'],
    ['pop', 'Pop'],
    ['rock', 'Rock'],
    ['electronic', 'Electronic'],
    ['jazz', 'Jazz'],
    ['classical', 'Klassik'],
    ['chillout', 'Chill'],
    ['hiphop', 'Hip-Hop'],
  ];

  function renderRadioChips() {
    const host = $('#tv-radio-chips');
    if (!host) return;
    host.innerHTML = RADIO_TAGS.map(
      ([tag, label]) =>
        `<button type="button" class="tv-chip ${state.radio.tag === tag ? 'is-active' : ''}" data-radio-tag="${tag}" data-focus>${esc(label)}</button>`
    ).join('');
    host.querySelectorAll('[data-radio-tag]').forEach((chip) => {
      chip.addEventListener('click', () => loadRadio(chip.dataset.radioTag));
    });
  }

  async function loadRadio(tag) {
    state.radio.tag = tag || 'top';
    state.radio.loading = true;
    renderRadioChips();
    $('#tv-radio-grid').innerHTML = '<p class="tv-muted">Sender werden geladen …</p>';
    try {
      const result = await bridge.radioStations({ tag: state.radio.tag === 'top' ? '' : state.radio.tag });
      state.radio.stations = Array.isArray(result.stations) ? result.stations : [];
      state.radio.entries = state.radio.stations.map(stationEntry);
      state.radio.error = result.error || null;
      state.radio.loaded = true;
    } catch (error) {
      state.radio.stations = [];
      state.radio.entries = [];
      state.radio.error = error.message || 'Radio nicht erreichbar';
      state.radio.loaded = true;
    }
    renderRadio();
  }

  function renderRadio() {
    const host = $('#tv-radio-grid');
    if (!host) return;
    if (!state.radio.entries.length) {
      host.innerHTML = `<p class="tv-muted">${esc(state.radio.error || 'Keine Sender gefunden.')}</p>`;
      return;
    }
    host.innerHTML = state.radio.entries
      .map((entry, index) => {
        const playing = current() && current().id === entry.id;
        return `
        <button type="button" class="tv-card ${playing ? 'is-playing' : ''}" data-radio-index="${index}" data-focus>
          ${coverHtml(entry, 'tv-card-art')}
          <div class="tv-card-title">${esc(entry.title)}</div>
          <div class="tv-card-sub">${esc(entry.artist)}</div>
        </button>`;
      })
      .join('');
    host.querySelectorAll('[data-radio-index]').forEach((card) => {
      card.addEventListener('click', () => {
        const station = state.radio.stations[Number(card.dataset.radioIndex)];
        if (!station) return;
        state.radioCache.set(station.id, station);
        playEntry(stationEntry(station), { reset: true });
        toast(`Radio: ${station.name}`);
      });
    });
    if (state.view === 'radio') focusFirst();
  }

  async function loadCharts(force = false) {
    if (state.charts.loading) return;
    if (state.charts.loaded && !force) return;
    state.charts.loading = true;
    $('#tv-charts-grid').innerHTML = '<p class="tv-muted">Charts werden geladen …</p>';
    try {
      const result = await bridge.topTracks();
      state.charts.tracks = (Array.isArray(result.tracks) ? result.tracks : []).filter((track) => track.preview);
      state.charts.error = result.errors && result.errors.length ? result.errors[0].message : null;
      state.charts.loaded = true;
    } catch (error) {
      state.charts.tracks = [];
      state.charts.error = error.message || 'Charts nicht erreichbar';
      state.charts.loaded = true;
    }
    state.charts.loading = false;
    renderCharts();
  }

  function renderCharts() {
    const host = $('#tv-charts-grid');
    if (!host) return;
    if (!state.charts.tracks.length) {
      host.innerHTML = `<p class="tv-muted">${esc(state.charts.error || 'Keine Charts gefunden.')}</p>`;
      return;
    }
    host.innerHTML = state.charts.tracks
      .map((track, index) => {
        const entry = previewEntry(track);
        const playing = current() && current().id === entry.id;
        return `
        <button type="button" class="tv-card ${playing ? 'is-playing' : ''}" data-chart-index="${index}" data-focus>
          ${coverHtml(entry, 'tv-card-art')}
          <div class="tv-card-title">${esc(entry.title)}</div>
          <div class="tv-card-sub">${esc(entry.artist)}</div>
        </button>`;
      })
      .join('');
    host.querySelectorAll('[data-chart-index]').forEach((card) => {
      card.addEventListener('click', () => {
        const track = state.charts.tracks[Number(card.dataset.chartIndex)];
        if (!track) return;
        playEntry(previewEntry(track), { reset: true });
      });
    });
    if (state.view === 'charts') focusFirst();
  }

  /* ---------------------------------------------------------------- *
   * Favoriten (aus derselben Sammlung wie Handy und Desktop)
   * ---------------------------------------------------------------- */

  /* ---------------------------------------------------------------- *
   * Mixes: dieselben Regeln wie am Desktop (renderer/core/mixes.js)
   *
   * Der Fernseher hat keinen Hör-Verlauf und kein Geschmacksprofil, deshalb
   * kommen die Titel aus Favoriten, Playlists und Charts; „Tage seit zuletzt“
   * ist immer groß, damit Fresh/Discover die Charts nutzen.
   * ---------------------------------------------------------------- */

  function mixArtistKey(name) {
    const t = window.CMText;
    return t ? t.normKey(t.primaryArtist(name)) : '';
  }

  function mixPool() {
    loadCollection();
    const out = [];
    const seen = new Set();
    const add = (entry) => {
      if (!entry || !entry.id || typeof entry.title !== 'string') return;
      if (!playableUrl(entry)) return;
      if (seen.has(entry.id)) return;
      seen.add(entry.id);
      out.push(entry);
    };
    favoriteEntries().forEach(add);
    state.collection.playlists.forEach((playlist) =>
      (playlist && Array.isArray(playlist.items) ? playlist.items : []).forEach(add)
    );
    state.charts.tracks.forEach((track) => add(previewEntry(track)));
    return out;
  }

  function mixContext() {
    const favoriteIds = new Set();
    const favoriteKeys = new Set();
    favoriteEntries().forEach((entry) => {
      favoriteIds.add(entry.id);
      const t = window.CMText;
      if (t) favoriteKeys.add(t.matchKey(entry));
    });
    const playlistIds = new Set();
    state.collection.playlists.forEach((playlist) =>
      (playlist && Array.isArray(playlist.items) ? playlist.items : []).forEach((entry) => playlistIds.add(entry.id))
    );
    const recIds = new Set(state.charts.tracks.map((track) => previewEntry(track).id));
    const knownArtists = new Set();
    favoriteEntries().forEach((entry) => {
      const key = mixArtistKey(entry.artist);
      if (key) knownArtists.add(key);
    });
    return {
      baseScore: () => 0,
      days: () => 999,
      plays: () => 0,
      favoriteIds,
      favoriteKeys,
      playlistIds,
      recIds,
      knownArtists,
      artistKey: mixArtistKey,
      excluded: () => false,
    };
  }

  function mixSeed() {
    return { day: new Date().toISOString().slice(0, 10), nonce: state.mixes.nonce };
  }

  function ensureMixes(force = false) {
    if (!window.CMMixes) return {};
    loadCollection();
    const seed = mixSeed();
    const key = `${seed.day}:${seed.nonce}:${favoriteEntries().length}:${state.charts.tracks.length}`;
    if (!force && state.mixes.lists && state.mixes.key === key) return state.mixes.lists;
    const pool = mixPool();
    const lists = window.CMMixes.buildAll(pool, mixContext(), seed, 25);
    state.mixes.key = key;
    state.mixes.lists = lists;
    return lists;
  }

  function renderMixes() {
    const host = $('#tv-mixes-grid');
    if (!host) return;
    if (!window.CMMixes) {
      host.innerHTML = '<p class="tv-muted">Mixes sind in dieser Version nicht verfügbar.</p>';
      return;
    }
    const lists = ensureMixes();
    host.innerHTML = window.CMMixes.DEFS.map((def) => {
      const list = lists[def.id] || [];
      const first = list[0] || null;
      return `
        <button type="button" class="tv-card tv-mix-card" data-mix="${esc(def.id)}" data-focus>
          ${first ? coverHtml(first, 'tv-card-art') : `<div class="tv-card-art"><span>♪</span></div>`}
          <div class="tv-card-title">${esc(def.title)}</div>
          <div class="tv-card-sub">${esc(def.subtitle)} · ${list.length}</div>
        </button>`;
    }).join('');
    host.querySelectorAll('[data-mix]').forEach((card) => {
      card.addEventListener('click', () => playMix(card.dataset.mix));
    });
    if (state.view === 'mixes') focusFirst();
  }

  // Starts a mix as the new queue – like picking a playlist on the desktop.
  function playMix(id) {
    const lists = ensureMixes();
    const list = (lists[id] || [])
      .map((entry) => (entry.kind === 'radio' ? entry : playableEntry(entry)))
      .filter((entry) => playableUrl(entry));
    if (!list.length) return false;
    state.queue = list;
    state.index = 0;
    playEntry(list[0], { index: 0 });
    return true;
  }

  function favoriteEntries() {
    return state.collection.favorites.filter((entry) => entry && typeof entry.title === 'string');
  }

  function renderFavorites() {
    loadCollection();
    const host = $('#tv-fav-grid');
    if (!host) return;
    const favorites = favoriteEntries();
    if (!favorites.length) {
      host.innerHTML = '<p class="tv-muted">Noch keine Favoriten. Am Handy ♥ antippen – oder per Desktop koppeln.</p>';
      return;
    }
    host.innerHTML = favorites
      .map(
        (entry, index) => `
        <button type="button" class="tv-card" data-fav-index="${index}" data-focus>
          ${coverHtml(entry, 'tv-card-art')}
          <div class="tv-card-title">${esc(entry.title)}</div>
          <div class="tv-card-sub">${esc(entry.artist || entry.sourceLabel || '')}</div>
        </button>`
      )
      .join('');
    host.querySelectorAll('[data-fav-index]').forEach((card) => {
      card.addEventListener('click', () => {
        const entry = favorites[Number(card.dataset.favIndex)];
        if (!entry) return;
        playEntry(playableEntry(entry), { reset: true });
      });
    });
  }

  function playableEntry(entry) {
    if (entry.kind === 'radio') {
      return {
        id: entry.id,
        kind: 'radio',
        source: 'radio',
        sourceLabel: 'Radio',
        title: entry.title,
        artist: entry.artist || 'Live Radio',
        artwork: entry.artwork || '',
        duration: 0,
        url: entry.url,
        link: entry.link || '',
      };
    }
    return {
      id: entry.id,
      kind: 'preview',
      source: entry.source,
      sourceLabel: entry.sourceLabel || '',
      title: entry.title,
      artist: entry.artist || '',
      album: entry.album || '',
      artwork: entry.artwork || '',
      duration: entry.duration || 0,
      preview: entry.preview || entry.url || '',
      link: entry.link || '',
      artistId: entry.artistId || null,
    };
  }

  function toggleFavorite(entry) {
    if (!entry || !entry.id) return { ok: false, reason: 'no-track' };
    loadCollection();
    const stored = Object.assign({}, entry, { addedAt: 0 });
    const index = state.collection.favorites.findIndex((item) => item.id === entry.id);
    if (index >= 0) {
      state.collection.favorites.splice(index, 1);
    } else {
      state.collection.favorites.unshift(stored);
    }
    writeJSON(STORAGE.collection, state.collection);
    renderFavorites();
    toast(index >= 0 ? 'Aus Favoriten entfernt' : 'In Favoriten gespeichert');
    return { ok: true, favorite: index < 0 };
  }

  /* ---------------------------------------------------------------- *
   * Handy-Steuerung: nativer HTTP-Server
   * ---------------------------------------------------------------- */

  function pushRemote(force = false) {
    if (!bridge.tvRemote || typeof bridge.tvRemote.update !== 'function') return;
    const now = Date.now();
    if (!force && now - remotePushAt < 900) return;
    remotePushAt = now;
    const entry = current();
    bridge.tvRemote.update({
      track: entry
        ? {
            title: entry.title,
            artist: entry.artist || '',
            cover: /^https:\/\//i.test(entry.artwork || '') ? entry.artwork : '',
          }
        : null,
      position: Number(audio.currentTime) || 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : 0,
      playing: state.playing && !audio.paused,
      volume: state.volume,
      queue: state.queue.slice(state.index + 1, state.index + 11).map((item) => ({ title: item.title, artist: item.artist || '' })),
      lyric: state.lyrics.lines[state.lyrics.index] ? state.lyrics.lines[state.lyrics.index].text : '',
      device: 'tv',
    });
  }

  function setRemoteInfo(info) {
    state.remote = Object.assign({}, state.remote, info || {});
    renderRemote();
  }

  async function renderRemote() {
    const status = $('#tv-remote-state');
    const frame = $('#tv-qr');
    const toggleButton = $('#tv-remote-toggle');
    const rotateButton = $('#tv-remote-rotate');
    if (!status || !frame) return;

    if (state.remote.starting) {
      status.textContent = 'Steuerung startet …';
      return;
    }
    if (!state.remote.enabled || !state.remote.qr) {
      status.textContent = state.remote.error || 'Steuerung ist aus.';
      frame.innerHTML = '<span class="tv-qr-empty">QR-Code</span>';
      if (toggleButton) toggleButton.textContent = 'Steuerung an';
      if (rotateButton) rotateButton.hidden = true;
      return;
    }
    status.textContent = state.remote.url.replace(/^https?:\/\//i, '').replace(/\?.*$/, '');
    frame.innerHTML = `<img src="${esc(state.remote.qr)}" alt="QR-Code zur Handy-Steuerung" />`;
    if (toggleButton) toggleButton.textContent = 'Steuerung aus';
    if (rotateButton) rotateButton.hidden = false;
  }

  async function startRemote() {
    if (!bridge.tvRemote) {
      setRemoteInfo({ enabled: false, error: 'Steuerung gibt es nur in der installierten Android-App.' });
      return;
    }
    state.remote.starting = true;
    await renderRemote();
    try {
      const info = await bridge.tvRemote.setEnabled(true);
      setRemoteInfo(Object.assign({ starting: false }, info));
    } catch (error) {
      setRemoteInfo({ starting: false, enabled: false, error: error.message || 'Steuerung konnte nicht starten.' });
    }
  }

  async function stopRemote() {
    if (!bridge.tvRemote) return;
    try {
      const info = await bridge.tvRemote.setEnabled(false);
      setRemoteInfo(Object.assign({ enabled: false }, info));
    } catch {
      setRemoteInfo({ enabled: false });
    }
  }

  async function rotateRemote() {
    if (!bridge.tvRemote) return;
    try {
      setRemoteInfo(await bridge.tvRemote.rotate());
      toast('Neuer Link erzeugt – alte Handys müssen neu scannen.');
    } catch (error) {
      toast(error.message || 'Link konnte nicht erneuert werden.');
    }
  }

  /* ---------------------------------------------------------------- *
   * Anfragen der Steuerseite
   * ---------------------------------------------------------------- */

  function safeTrack(track) {
    if (!track || !['apple', 'deezer'].includes(track.source)) return null;
    if (!/^https:\/\//i.test(track.preview || '')) return null;
    return previewEntry(track);
  }

  async function handleRemoteRequest(request) {
    const { id, kind, path, query, body, device } = request || {};
    const respond = (status, data) => {
      if (bridge.tvRemote && typeof bridge.tvRemote.respond === 'function') {
        bridge.tvRemote.respond({ id, status, data });
      }
    };

    try {
      if (kind === 'search') {
        const term = String((query && query.q) || '').trim().slice(0, 120);
        if (!term) return respond(200, { tracks: [] });
        const result = await bridge.searchCatalog(term);
        const tracks = [];
        (result.tracks || []).forEach((track) => {
          const entry = safeTrack(track);
          if (!entry) return;
          state.searchCache.set(entry.id, entry);
          tracks.push({
            id: entry.id,
            title: entry.title,
            artist: entry.artist,
            cover: entry.artwork,
            source: entry.source,
          });
        });
        while (state.searchCache.size > 160) {
          state.searchCache.delete(state.searchCache.keys().next().value);
        }
        return respond(200, { tracks: tracks.slice(0, 30) });
      }

      if (kind === 'cmd') {
        const cmd = String((body && body.cmd) || '');
        const value = body ? body.value : undefined;
        let ok = true;
        if (cmd === 'toggle') toggle();
        else if (cmd === 'play') {
          if (audio.paused) audio.play().catch(() => {});
        } else if (cmd === 'pause') audio.pause();
        else if (cmd === 'next') next();
        else if (cmd === 'prev') previous();
        else if (cmd === 'seek') {
          const position = Number(value);
          ok = Number.isFinite(position) && position >= 0;
          if (ok) audio.currentTime = position;
        } else if (cmd === 'volume') {
          const level = Number(value);
          ok = Number.isFinite(level) && level >= 0 && level <= 1.5;
          if (ok) {
            state.volume = level;
            audio.volume = Math.min(1, level);
            writeJSON(STORAGE.level, { level, muted: false });
          }
        } else if (cmd === 'like') {
          const entry = current();
          ok = Boolean(entry) && toggleFavorite(entry).ok;
        } else {
          return respond(400, { error: 'bad-command' });
        }
        pushRemote(true);
        announce(device, cmd);
        return respond(ok ? 200 : 400, { ok });
      }

      if (kind === 'queue') {
        const entry = state.searchCache.get(String((body && body.id) || ''));
        if (!entry) return respond(404, { error: 'not-found' });
        enqueue(entry, body.position === 'next' ? 'next' : 'end');
        announce(device, 'queue');
        return respond(200, { ok: true });
      }

      if (kind === 'radio-list') {
        const tag = String((query && query.tag) || '');
        const result = await bridge.radioStations({ tag });
        const stations = (result.stations || []).map((station) => {
          state.radioCache.set(station.id, station);
          return {
            id: station.id,
            name: station.name,
            meta: [station.country, ...(station.tags || [])].filter(Boolean).slice(0, 2).join(' · '),
          };
        });
        return respond(200, { stations, error: result.error || null });
      }

      if (kind === 'radio-play') {
        const station = state.radioCache.get(String((body && body.id) || ''));
        if (!station) return respond(404, { error: 'not-found' });
        playEntry(stationEntry(station), { reset: true });
        announce(device, 'radio');
        return respond(200, { ok: true });
      }

      if (kind === 'favorites-list') {
        loadCollection();
        return respond(200, {
          favorites: favoriteEntries()
            .slice(0, 60)
            .map((entry) => ({
              id: entry.id,
              title: entry.title,
              artist: entry.artist || '',
              cover: /^https:\/\//i.test(entry.artwork || '') ? entry.artwork : '',
              kind: entry.kind,
            })),
        });
      }

      if (kind === 'favorite-play') {
        loadCollection();
        const entry = favoriteEntries().find((item) => item.id === String((body && body.id) || ''));
        if (!entry) return respond(404, { error: 'not-found' });
        playEntry(playableEntry(entry), { reset: true });
        announce(device, 'favorite');
        return respond(200, { ok: true });
      }

      if (kind === 'pair') {
        const accepted = await askPair(body || {}, device);
        if (!accepted) return respond(403, { ok: false, error: 'declined' });
        return respond(200, { ok: true, ...accepted });
      }

      return respond(404, { error: 'not-found' });
    } catch (error) {
      return respond(500, { error: String((error && error.message) || error) });
    }
  }

  function announce(device, action) {
    const who = String(device || '').trim() || 'Das Handy';
    const labels = {
      queue: 'hat einen Song eingereiht',
      radio: 'hat einen Sender gestartet',
      favorite: 'hat einen Favoriten gestartet',
      toggle: 'hat pausiert oder weitergespielt',
      play: 'hat weitergespielt',
      pause: 'hat pausiert',
      next: 'hat weitergeschaltet',
      prev: 'hat zurückgeschaltet',
      seek: 'hat gespult',
      volume: 'hat die Lautstärke geändert',
      like: 'hat einen Favoriten gesetzt',
    };
    const text = labels[action];
    if (text) toast(`${who} ${text}`);
  }

  /* ---------------------------------------------------------------- *
   * Overlay: eine Frage, zwei Knöpfe (Fernbedienung)
   * ---------------------------------------------------------------- */

  function prompt({ title, text, yesLabel = 'OK', noLabel = 'Später', onYes, onNo }) {
    const overlay = $('#tv-confirm');
    $('#tv-confirm-title').textContent = title;
    $('#tv-confirm-text').textContent = text;
    const yes = $('#tv-confirm-yes');
    const no = $('#tv-confirm-no');
    yes.textContent = yesLabel;
    no.textContent = noLabel;
    overlay.hidden = false;
    state.confirm = { onYes, onNo };
    setFocus(yes, { scroll: false });
    yes.onclick = () => {
      overlay.hidden = true;
      state.confirm = null;
      focusFirst();
      if (onYes) onYes();
    };
    no.onclick = () => {
      overlay.hidden = true;
      state.confirm = null;
      focusFirst();
      if (onNo) onNo();
    };
  }

  function closeConfirm() {
    const confirm = state.confirm;
    state.confirm = null;
    $('#tv-confirm').hidden = true;
    if (confirm && confirm.onNo) confirm.onNo();
    focusFirst();
  }

  /* ---------------------------------------------------------------- *
   * Koppeln per QR (Desktop -> Fernseher)
   * ---------------------------------------------------------------- */

  function askPair(payload, device) {
    const favorites = Array.isArray(payload.favorites) ? payload.favorites.length : 0;
    const playlists = Array.isArray(payload.playlists) ? payload.playlists.length : 0;
    if (!favorites && !playlists) return Promise.resolve(null);
    return new Promise((resolve) => {
      let answered = false;
      const answer = (value) => {
        if (answered) return;
        answered = true;
        resolve(value);
      };
      prompt({
        title: 'Koppeln bestätigen',
        text: `${device || 'Der Desktop'} möchte ${favorites} Favoriten und ${playlists} Playlists übernehmen. Einmal bestätigen – es wird nur lokal gespeichert.`,
        yesLabel: 'Übernehmen',
        noLabel: 'Abbrechen',
        onYes: () => answer(mergePair(payload)),
        onNo: () => answer(false),
      });
    });
  }

  function mergePair(payload) {
    loadCollection();
    const byId = new Map(state.collection.favorites.map((entry) => [entry.id, entry]));
    (payload.favorites || []).forEach((entry) => {
      if (!entry || typeof entry.id !== 'string' || typeof entry.title !== 'string') return;
      if (!['preview', 'plugin', 'stream', 'local', 'radio'].includes(entry.kind)) return;
      byId.set(entry.id, Object.assign({}, entry, { addedAt: entry.addedAt || Date.now() }));
    });
    const playlists = new Map(state.collection.playlists.map((list) => [list.id, list]));
    (payload.playlists || []).forEach((list) => {
      if (!list || typeof list.id !== 'string') return;
      playlists.set(list.id, {
        id: String(list.id).slice(0, 80),
        name: String(list.name || 'Playlist').slice(0, 80),
        createdAt: Number(list.createdAt) || Date.now(),
        updatedAt: Date.now(),
        items: Array.isArray(list.items) ? list.items.slice(0, 500) : [],
      });
    });
    state.collection.favorites = Array.from(byId.values()).slice(0, 2000);
    state.collection.playlists = Array.from(playlists.values()).slice(0, 200);
    writeJSON(STORAGE.collection, state.collection);
    renderFavorites();
    toast(`Übernommen: ${byId.size} Favoriten, ${playlists.size} Playlists`);
    return { favorites: byId.size, playlists: playlists.size };
  }

  function moveConfirm(key) {
    const yes = $('#tv-confirm-yes');
    const no = $('#tv-confirm-no');
    const isYes = state.focus === yes;
    if (key === 'ArrowLeft' || key === 'ArrowRight') setFocus(isYes ? no : yes, { scroll: false });
    if (key === 'ArrowDown' || key === 'ArrowUp') setFocus(isYes ? no : yes, { scroll: false });
  }

  /* ---------------------------------------------------------------- *
   * Update-Hinweis auf dem Fernseher
   * ---------------------------------------------------------------- */

  const TV_UPDATE_KEY = 'cleanmusic.tvupdate.v1';

  function maybeShowUpdate(info) {
    if (!info || info.status !== 'available' || !info.asset) return;
    let dismissed = '';
    try {
      dismissed = localStorage.getItem(TV_UPDATE_KEY) || '';
    } catch {
      dismissed = '';
    }
    if (dismissed === info.latest) return;
    try {
      prompt({
        title: `Update ${info.latest} ist da`,
        text: 'Neue Version aus den GitHub-Releases. Die APK wird geprüft (Größe und SHA-256) und danach öffnet Android den Installer. Deine Favoriten und Einstellungen bleiben.',
        yesLabel: 'Updaten',
        noLabel: 'Später',
        onYes: async () => {
          toast('Update wird geladen …');
          const downloaded = await bridge.updateDownload();
          if (!downloaded || downloaded.status !== 'ready') {
            toast((downloaded && downloaded.error) || 'Download fehlgeschlagen.');
            return;
          }
          const started = await bridge.updateInstall();
          if (!started) toast('Installer konnte nicht geöffnet werden.');
        },
        onNo: () => {
          try {
            localStorage.setItem(TV_UPDATE_KEY, info.latest || '');
          } catch {
            /* Speicher gesperrt */
          }
        },
      });
    } catch (error) {
      window.__TV_UPDATE_ERROR = String((error && error.stack) || error);
    }
  }

  /* ---------------------------------------------------------------- *
   * Toast + Uhr
   * ---------------------------------------------------------------- */

  let toastTimer = 0;
  function toast(text) {
    const el = $('#tv-toast');
    if (!el || !text) return;
    el.textContent = text;
    el.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
  }

  function tickClock() {
    const el = $('#tv-clock');
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  /* ---------------------------------------------------------------- *
   * Start
   * ---------------------------------------------------------------- */

  function wireControls() {
    $$('.tv-nav-item').forEach((item) => {
      item.addEventListener('click', () => showView(item.dataset.tvView));
    });
    $('#tv-play').addEventListener('click', toggle);    $('#tv-next').addEventListener('click', next);
    $('#tv-prev').addEventListener('click', previous);
    $('#tv-charts-refresh').addEventListener('click', () => {
      state.charts.loaded = false;
      loadCharts(true);
    });
    $('#tv-mixes-refresh').addEventListener('click', () => {
      // New nonce → a fresh mix for the same day, like "Neu mischen" on desktop.
      state.mixes.nonce += 1;
      state.mixes.key = '';
      renderMixes();
    });
    $('#tv-remote-toggle').addEventListener('click', () => {
      if (state.remote.enabled) stopRemote();
      else startRemote();
    });
    $('#tv-remote-rotate').addEventListener('click', rotateRemote);
    $('#tv-theme').addEventListener('click', cycleTheme);
    $('#tv-background').addEventListener('click', cycleBackground);
    $('#tv-vinyl').addEventListener('click', toggleVinyl);
    $('#tv-viz-toggle').addEventListener('click', toggleVisualizer);
    $('#tv-stage-open').addEventListener('click', () => showView('party'));
  }

  function wireMediaSession() {
    // native.js fragt diese Haken für Benachrichtigung/Sperrbildschirm ab.
    window.CMNowPlaying = () => {
      const entry = current();
      return {
        title: entry ? entry.title : '',
        artist: entry ? entry.artist || '' : '',
        album: entry ? entry.album || '' : '',
        artwork: entry && /^https:\/\//i.test(entry.artwork || '') ? entry.artwork : '',
      };
    };
    window.CMMediaAction = (action, event) => {
      if (action === 'play') {
        if (audio.paused) audio.play().catch(() => {});
      } else if (action === 'pause') {
        audio.pause();
      } else if (action === 'toggle') {
        toggle();
      } else if (action === 'next') {
        next();
      } else if (action === 'previous') {
        previous();
      } else if (action === 'seek') {
        const position = Number(event && event.position);
        if (Number.isFinite(position)) audio.currentTime = Math.max(0, position);
      } else if (action === 'stop') {
        audio.pause();
      }
    };
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => window.CMMediaAction('play'));
        navigator.mediaSession.setActionHandler('pause', () => window.CMMediaAction('pause'));
        navigator.mediaSession.setActionHandler('nexttrack', () => next());
        navigator.mediaSession.setActionHandler('previoustrack', () => previous());
      } catch {
        /* nicht unterstützt */
      }
    }
  }

  async function loadRemoteInfo() {
    if (!bridge.tvRemote) {
      setRemoteInfo({ enabled: false, error: 'Handy-Steuerung nur in der Android-App.' });
      return;
    }
    try {
      const info = await bridge.tvRemote.get();
      setRemoteInfo(info);
      if (info && info.enabled) {
        // Server läuft beim Start nicht automatisch – die Steuerung gehört
        // sichtbar auf den Startbildschirm, nicht in den Hintergrund.
      }
    } catch {
      setRemoteInfo({ enabled: false });
    }
  }

  function start() {
    try {
      loadSettings();
      loadCollection();
      applyTheme();
      applyBackground();
      wireControls();
      wireMediaSession();
      if (window.CMVisualizer) {
        window.CMVisualizer.attach(audio);
      }
      applyVisualizer();
      // Kein Web-Audio-Umweg: createMediaElementSource verlangt CORS und würde
      // Radio-Streams ohne CORS stumm schalten. Die Analyse läuft über
      // captureStream; ohne Tonspur bleibt die (animierte) Ersatzdarstellung.
      renderRadioChips();
      refreshLookLabels();
      paintAll();
      renderRemote();
      tickClock();
      setInterval(tickClock, 20000);
      showView('home');

      if (bridge.onRemoteRequest) bridge.onRemoteRequest(handleRemoteRequest);

      loadRemoteInfo();
      if (bridge.onUpdateState) bridge.onUpdateState(maybeShowUpdate);
      if (bridge.updateGet) {
        bridge.updateGet().then(maybeShowUpdate).catch(() => {});
      }
      // Startseite: Steuerung direkt anbieten (QR-Code groß).
      setTimeout(() => {
        if (!state.remote.enabled && !state.remote.error && bridge.tvRemote) startRemote();
      }, 600);

      // Charts im Hintergrund vorladen, damit der Bereich sofort gefüllt ist.
      setTimeout(() => loadCharts(), 1200);

      if (window.CMLiveBackground && window.CMVisualizer) {
        window.CMVisualizer.onFrame(() => {
          if (state.settings.bgPulse) window.CMLiveBackground.setBeat(window.CMVisualizer.level());
        });
      }
    } catch (error) {
      window.__TV_START_ERROR = String((error && error.stack) || error);
      console.error('TV-Start:', error);
    }
  }

  /* Zurück-Taste (MainActivity): Overlay -> Startseite -> App verlassen. */
  window.CMBack = () => {
    const confirm = $('#tv-confirm');
    if (confirm && !confirm.hidden) {
      closeConfirm(false);
      return true;
    }
    if (state.view !== 'home') {
      showView('home');
      return true;
    }
    return false;
  };

  /* Testhaken für mobile/smoke (kein Produktbestandteil der UI). */
  window.CMTv = {
    state,
    audio,
    showView,
    playEntry,
    previewEntry,
    stationEntry,
    handleRemoteRequest,
    toggleFavorite,
    applyTheme,
    applyBackground,
    focus: () => (state.focus ? {
      id: state.focus.id || '',
      cls: state.focus.className || '',
      text: String(state.focus.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)
    } : null),
    focusables: () => focusables().length,
    remote: () => state.remote,
    showUpdate: maybeShowUpdate,
    ready: true,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
