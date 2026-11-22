'use strict';

/**
 * CleanMusic Mobile – Brücke für Android (Phase 1, Etappe 1).
 *
 * Netzwerk: nur Katalog-Suche (Apple/Deezer-Vorschauen) und Radio.
 * Beide Wege laufen über CapacitorHttp und dieselben Allowlists wie main.js:
 *   - https://itunes.apple.com/search
 *   - https://api.deezer.com/search
 *   - https://de1.api.radio-browser.info/json/stations/search
 *
 * Wiedergabe: Das <audio>-Element bleibt im WebView. Für Sperrbildschirm
 * und Benachrichtigung spiegelt diese Datei Titel/Status in den nativen
 * Foreground-Service (BackgroundAudioPlugin + BackgroundAudioService).
 *
 * Kein Plugin-Loader, kein Cutter, keine Downloads, kein yt-dlp.
 */

(function () {
  const MOBILE_VERSION = 'mobile-1.0.0';

  const root = document.documentElement;
  root.dataset.mobile = '1';
  root.dataset.device = 'phone';

  // Erste mobile Runde: schlanke Ansicht, kein Desktop-Assistent.
  try {
    if (localStorage.getItem('cleanmusic.settings.v1') === null) {
      localStorage.setItem(
        'cleanmusic.settings.v1',
        JSON.stringify({ layout: 'simple', onboarded: true, background: 'none' })
      );
    }
    if (localStorage.getItem('cleanmusic.seenversion.v1') === null) {
      localStorage.setItem('cleanmusic.seenversion.v1', JSON.stringify(MOBILE_VERSION));
    }
  } catch {
    /* Speicher nicht verfügbar – App läuft trotzdem */
  }

  /* ------------------------------------------------------------------ *
   * Netzwerk-Allowlist (identisch zu den Hosts in main.js)
   * ------------------------------------------------------------------ */

  const ALLOWED = [
    { host: 'itunes.apple.com', path: '/search' },
    { host: 'api.deezer.com', path: '/search' },
    { host: 'de1.api.radio-browser.info', path: '/json/stations/search' },
  ];

  const TRANSIENT_NET =
    /ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_TIMED_OUT|ERR_INTERNET_DISCONNECTED|ERR_ADDRESS_UNREACHABLE|Failed to fetch|NetworkError|timeout/i;

  function allowedUrl(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      return false;
    }
    if (url.protocol !== 'https:') return false;
    if (url.username || url.password) return false;
    if (url.port && url.port !== '443') return false;
    return ALLOWED.some((entry) => entry.host === url.hostname && entry.path === url.pathname);
  }

  function friendlyNetError(error) {
    const message = String((error && error.message) || error || '');
    if (/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_ADDRESS_UNREACHABLE|Failed to fetch|NetworkError/i.test(message)) {
      return new Error('Keine Verbindung (Internet oder DNS). Bitte gleich erneut versuchen.');
    }
    if (/abort|timeout/i.test(message)) {
      return new Error('Zeitüberschreitung – der Dienst antwortet gerade nicht.');
    }
    return error instanceof Error ? error : new Error(message || 'Netzwerkfehler');
  }

  function getCapacitorHttp() {
    const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    return plugins.CapacitorHttp || null;
  }

  async function requestJson(url, timeoutMs = 12000, attempt = 0) {
    if (!allowedUrl(url)) throw new Error('Diese Adresse ist in der mobilen App nicht erlaubt.');

    try {
      const http = getCapacitorHttp();
      if (http && typeof http.request === 'function') {
        const response = await http.request({
          url,
          method: 'GET',
          headers: { accept: 'application/json' },
          connectTimeout: timeoutMs,
          readTimeout: timeoutMs,
          responseType: 'json',
        });
        if (!response || response.status < 200 || response.status >= 300) {
          throw new Error(`HTTP ${response ? response.status : '?'}`);
        }
        let data = response.data;
        if (typeof data === 'string') data = JSON.parse(data);
        if (!data || typeof data !== 'object') throw new Error('Ungültige Antwort');
        return data;
      }

      // Browser-Vorschau (kein Android): gleicher Allowlist-Check davor.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      if (attempt < 2 && TRANSIENT_NET.test(String((error && error.message) || error))) {
        await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
        return requestJson(url, timeoutMs, attempt + 1);
      }
      throw friendlyNetError(error);
    }
  }

  /* ------------------------------------------------------------------ *
   * Normalisierung – dieselben Formen wie main.js
   * ------------------------------------------------------------------ */

  function normalizeItunes(json) {
    const results = json && Array.isArray(json.results) ? json.results : [];
    return results
      .filter((track) => track && track.kind === 'song' && track.previewUrl)
      .map((track) => ({
        id: `apple:${track.trackId}`,
        source: 'apple',
        sourceLabel: 'Apple Music',
        title: track.trackName || 'Unbekannt',
        artist: track.artistName || '',
        album: track.collectionName || '',
        artwork: track.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '600x600bb') : '',
        duration: Math.round((Number(track.trackTimeMillis) || 0) / 1000),
        preview: track.previewUrl,
        link: track.trackViewUrl || '',
        artistId: track.artistId ? String(track.artistId) : null,
      }));
  }

  const DEEZER_PLACEHOLDER = 'd41d8cd98f00b204e9800998ecf8427e';

  function deezerCover(album) {
    const url = (album && (album.cover_xl || album.cover_big || album.cover_medium)) || '';
    return url.includes(DEEZER_PLACEHOLDER) ? '' : url;
  }

  function normalizeDeezer(json) {
    const data = json && Array.isArray(json.data) ? json.data : [];
    return data
      .filter((track) => track && track.preview)
      .map((track) => ({
        id: `deezer:${track.id}`,
        source: 'deezer',
        sourceLabel: 'Deezer',
        title: track.title_short || track.title || 'Unbekannt',
        artist: (track.artist && track.artist.name) || '',
        album: (track.album && track.album.title) || '',
        artwork: deezerCover(track.album),
        duration: Number(track.duration) || 0,
        preview: track.preview,
        link: track.link || '',
        artistId: track.artist && track.artist.id ? String(track.artist.id) : null,
      }));
  }

  function interleaveTracks(first, second) {
    const out = [];
    const seen = new Set();
    const max = Math.max(first.length, second.length);
    for (let index = 0; index < max; index += 1) {
      for (const track of [first[index], second[index]]) {
        if (!track) continue;
        const key = `${track.title}|${track.artist}`.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, ' ').trim();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(track);
      }
    }
    return out;
  }

  function normalizeStations(list) {
    const seen = new Set();
    const out = [];
    for (const station of Array.isArray(list) ? list : []) {
      if (!station || !station.url_resolved) continue;
      if (station.hls) continue;
      const url = String(station.url_resolved);
      if (/\.(m3u8?|pls)(\?|$)/i.test(url)) continue;
      const name = String(station.name || '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        id: station.stationuuid || url,
        name,
        url,
        favicon: /^https:\/\//i.test(station.favicon || '') ? station.favicon : '',
        tags: String(station.tags || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
          .slice(0, 3),
        country: station.country || '',
        codec: String(station.codec || '').toUpperCase(),
        bitrate: Number(station.bitrate) || 0,
        homepage: station.homepage || '',
      });
      if (out.length >= 48) break;
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Mobile Brücke window.cm
   * ------------------------------------------------------------------ */

  const notDesktop = async () => ({ error: 'Nur in der Desktop-App verfügbar.' });

  const bridge = {
    isElectron: false,
    isMobile: true,

    pickFolder: async () => {
      toast('Ordner-Auswahl gibt es auf dem Handy nicht.');
      return null;
    },
    openExternal: async (url) => {
      try {
        const target = new URL(String(url));
        if (!/^https?:$/.test(target.protocol)) return false;
        window.open(target.href, '_blank', 'noopener');
        return true;
      } catch {
        return false;
      }
    },
    getInfo: async () => ({
      platform: 'android',
      mobile: true,
      version: MOBILE_VERSION,
      widevine: null,
      smoke: false,
    }),
    clearServiceData: async () => false,
    openMusickit: async () => toast('MusicKit gibt es nur in der Desktop-App.'),
    spotifyPlaylistLink: notDesktop,
    pluginPlaylist: notDesktop,
    playlistImportFile: notDesktop,
    playlistMatch: async () => ({ matches: [] }),

    searchCatalog: async (query) => {
      const term = String(query || '').trim().slice(0, 120);
      if (!term) return { query: '', tracks: [], errors: [], sources: { apple: 0, deezer: 0 } };

      const errors = [];
      const [appleResult, deezerResult] = await Promise.allSettled([
        requestJson(
          `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=30&country=DE`
        ),
        requestJson(`https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=30`),
      ]);

      let apple = [];
      let deezer = [];
      if (appleResult.status === 'fulfilled') apple = normalizeItunes(appleResult.value);
      else errors.push({ source: 'Apple Music', message: appleResult.reason.message });

      if (deezerResult.status === 'fulfilled') deezer = normalizeDeezer(deezerResult.value);
      else errors.push({ source: 'Deezer', message: deezerResult.reason.message });

      return {
        query: term,
        tracks: interleaveTracks(apple, deezer).slice(0, 60),
        errors,
        sources: { apple: apple.length, deezer: deezer.length },
      };
    },

    radioStations: async (options = {}) => {
      const query = typeof options.query === 'string' ? options.query.trim().slice(0, 80) : '';
      const tag = typeof options.tag === 'string' ? options.tag.trim().slice(0, 40) : '';
      const params = new URLSearchParams({
        limit: '80',
        hidebroken: 'true',
        order: 'clickcount',
        reverse: 'true',
      });
      if (query) params.set('name', query);
      if (tag) params.set('tag', tag);

      try {
        const json = await requestJson(
          `https://de1.api.radio-browser.info/json/stations/search?${params.toString()}`,
          15000
        );
        return { stations: normalizeStations(json), error: null };
      } catch (error) {
        return { stations: [], error: error.message || 'Radio-Verzeichnis nicht erreichbar' };
      }
    },

    // Ohne Katalogsuche keine weiteren Desktop-Netzdienste im Prototyp.
    refreshPreview: async () => ({ url: null }),
    topTracks: async () => ({ tracks: [], errors: [] }),
    newReleases: async () => ({ tracks: [], errors: [] }),
    recommendations: async () => ({ tracks: [], videos: [], seeds: [], errors: [] }),
    artistPage: async () => ({ error: 'Künstlerseiten folgen in einer späteren mobilen Version.' }),
    albumTracks: async () => ({ tracks: [], error: 'Künstlerseiten folgen in einer späteren mobilen Version.' }),

    pluginsList: async () => ({ dirs: [], plugins: [] }),
    pluginSetEnabled: async () => ({ dirs: [], plugins: [] }),
    pluginAction: notDesktop,
    pluginOpenFolder: notDesktop,
    pluginSearch: async () => ({ results: [], error: 'Plugins gibt es auf dem Handy nicht.' }),
    pluginResolve: async () => ({ ok: false, error: 'Plugins gibt es auf dem Handy nicht.' }),
    pluginMatch: async () => ({ ok: false, error: 'Plugins gibt es auf dem Handy nicht.' }),
    creatorPlaylist: notDesktop,
    creatorOpenverse: notDesktop,

    copyText: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
    discordGet: async () => ({ config: { enabled: false, clientId: '', showArtwork: true }, status: {} }),
    discordSet: async () => ({ config: { enabled: false, clientId: '', showArtwork: true }, status: {} }),
    discordUpdate: () => {},
    onDiscordStatus: () => {},
    miniOpen: async () => false,
    taskbarGet: async () => ({ progress: false }),
    taskbarSet: async () => ({ progress: false }),
    shortcutsGet: async () => ({ enabled: false, registered: [] }),
    shortcutsSet: async () => ({ enabled: false, registered: [] }),
    loginGet: async () => ({ enabled: false }),
    loginSet: async () => ({ enabled: false, supported: false }),
    remoteGet: async () => ({ enabled: false, port: 4790, url: '', qr: '' }),
    remoteSet: async () => ({ enabled: false }),
    remoteRotate: async () => ({ enabled: false }),
    diagnosticCopy: async () => '',
    diagnosticError: () => {},
    diagnosticState: () => {},
    backupFolderPick: async () => null,
    backupAutoSave: notDesktop,
    projectCreditsSave: notDesktop,
    savePng: notDesktop,
    copyPng: async () => false,
    liveBgPick: async () => ({ canceled: true }),
    liveBgGet: async () => ({ url: '', kind: '', missing: false }),
  };

  window.cm = bridge;

  /* ------------------------------------------------------------------ *
   * Hintergrund-Wiedergabe: WebView-Ton -> nativer Foreground-Service
   * ------------------------------------------------------------------ */

  function bgPlugin() {
    const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    return plugins.BackgroundAudio || null;
  }

  function text(id) {
    const el = document.getElementById(id);
    return el ? String(el.textContent || '').trim() : '';
  }

  function currentMeta() {
    const session = navigator.mediaSession;
    const metadata = session && session.metadata;
    const art = document.getElementById('np-art-img');
    const title = text('np-title');
    return {
      title: title && title !== 'Nichts ausgewählt' ? title : '',
      artist: text('np-artist'),
      album: (metadata && metadata.album) || '',
      artwork:
        (metadata && metadata.artwork && metadata.artwork[0] && metadata.artwork[0].src) ||
        (art && !art.hidden ? art.currentSrc || art.src : '') ||
        '',
    };
  }

  function snapshot(playing) {
    const audio = document.getElementById('audio');
    if (!audio) return null;
    const meta = currentMeta();
    const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
    const position = Number.isFinite(audio.currentTime) && audio.currentTime > 0 ? audio.currentTime : 0;
    return {
      title: meta.title.slice(0, 200),
      artist: meta.artist.slice(0, 200),
      album: meta.album.slice(0, 200),
      artwork: /^https:\/\//i.test(meta.artwork) ? meta.artwork.slice(0, 1000) : '',
      playing: Boolean(playing && !audio.paused),
      position: Math.min(position, 24 * 60 * 60),
      duration: Math.min(duration, 24 * 60 * 60),
    };
  }

  let serviceStarted = false;
  let lastSignature = '';
  let lastSentAt = 0;
  let pendingTimer = null;

  async function pushState(force = false) {
    const plugin = bgPlugin();
    const audio = document.getElementById('audio');
    if (!plugin || !audio) return;

    const playing = !audio.paused && Boolean(audio.currentSrc || audio.getAttribute('src'));
    const state = snapshot(playing);
    if (!state) return;

    if (!state.title) {
      if (serviceStarted) {
        serviceStarted = false;
        lastSignature = '';
        try {
          await plugin.stop();
        } catch {
          /* Dienst war schon weg */
        }
      }
      return;
    }

    const signature = [state.title, state.artist, state.album, state.artwork, state.playing, state.duration].join('|');
    const now = Date.now();
    if (!force && signature === lastSignature && now - lastSentAt < 1800) return;
    lastSignature = signature;
    lastSentAt = now;

    try {
      if (!serviceStarted && state.playing) {
        serviceStarted = true;
        await plugin.start(state);
      } else if (serviceStarted) {
        await plugin.update(state);
      }
    } catch {
      // Dienst durfte (noch) nicht starten – beim nächsten Ereignis erneut.
      if (!state.playing) serviceStarted = false;
    }
  }

  function schedulePush(force = true) {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      pushState(force);
    }, 120);
  }

  function click(id) {
    const el = document.getElementById(id);
    if (el && !el.disabled) el.click();
  }

  function handleMediaAction(event) {
    const action = String((event && event.action) || '');
    const audio = document.getElementById('audio');
    if (!audio) return;

    if (action === 'play') {
      if (audio.paused) click('btn-play');
    } else if (action === 'pause') {
      if (!audio.paused) click('btn-play');
    } else if (action === 'next') {
      click('btn-next');
    } else if (action === 'previous' || action === 'prev') {
      click('btn-prev');
    } else if (action === 'seek') {
      const position = Number(event.position);
      if (Number.isFinite(position) && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.max(0, Math.min(audio.duration, position));
      }
    } else if (action === 'stop') {
      if (!audio.paused) click('btn-play');
      serviceStarted = false;
      lastSignature = '';
      const plugin = bgPlugin();
      if (plugin) plugin.stop().catch(() => {});
    } else if (action === 'toggle') {
      click('btn-play');
    }
  }

  function wireBackgroundAudio() {
    const plugin = bgPlugin();
    if (!plugin) {
      console.warn('BackgroundAudio-Plugin nicht gefunden – Wiedergabe läuft nur im Vordergrund.');
      return;
    }

    if (plugin.addListener) {
      plugin.addListener('mediaAction', handleMediaAction).catch(() => {});
    }

    const audio = document.getElementById('audio');
    if (!audio) return;

    ['play', 'playing', 'pause', 'loadedmetadata', 'durationchange', 'seeked', 'ratechange', 'ended', 'emptied'].forEach(
      (name) => audio.addEventListener(name, () => schedulePush(true))
    );

    setInterval(() => {
      if (!audio.paused) pushState(false);
    }, 2000);

    document.addEventListener('visibilitychange', () => {
      if (audio.paused) pushState(true);
    });

    schedulePush(true);
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */

  /* ------------------------------------------------------------------ *
   * Handy-Oberfläche: Tab-Leiste unten, „Mehr“-Blatt, Mini-Player
   * ------------------------------------------------------------------ */

  const TAB_ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"></path><path d="M5 9.5V21h14V9.5"></path><path d="M10 21v-6h4v6"></path>',
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',
    radio: '<circle cx="12" cy="12" r="2"></circle><path d="M8.5 8.5a5 5 0 0 0 0 7"></path><path d="M15.5 8.5a5 5 0 0 1 0 7"></path><path d="M5.6 5.6a9 9 0 0 0 0 12.8"></path><path d="M18.4 5.6a9 9 0 0 1 0 12.8"></path>',
    favorites: '<path d="M12 20.2s-7.2-4.4-9.2-8.9C1.5 8.1 3.4 4.6 6.9 4.6c2.2 0 3.9 1.3 5.1 3 1.2-1.7 2.9-3 5.1-3 3.5 0 5.4 3.5 4.1 6.7-2 4.5-9.2 8.9-9.2 8.9Z"></path>',
    more: '<circle cx="5" cy="12" r="1.4"></circle><circle cx="12" cy="12" r="1.4"></circle><circle cx="19" cy="12" r="1.4"></circle>',
  };
  const TABS = [
    ['home', 'Home'],
    ['search', 'Suche'],
    ['radio', 'Radio'],
    ['favorites', 'Favoriten'],
    ['more', 'Mehr'],
  ];

  function activeViewName() {
    const view = document.querySelector('.view.active');
    return view && view.id ? view.id.replace(/^view-/, '') : '';
  }

  function syncSearchState() {
    const view = document.getElementById('view-search');
    if (!view) return;
    const input = document.getElementById('global-search');
    const empty = !input || !input.value.trim();
    view.classList.toggle('m-search-empty', empty);
  }

  function syncTabs() {
    const bar = document.getElementById('m-tabbar');
    if (!bar) return;
    const current = activeViewName();
    const main = TABS.some(([view]) => view === current && view !== 'more');
    const moreOpen = root.classList.contains('m-more');
    bar.querySelectorAll('.m-tab').forEach((tab) => {
      const view = tab.dataset.mView;
      const on = view === 'more' ? moreOpen || (!main && Boolean(current)) : !moreOpen && view === current;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-current', on ? 'page' : 'false');
    });
    syncSearchState();
  }

  function closeMore() {
    root.classList.remove('m-more');
    syncTabs();
  }

  function buildMobileShell() {
    const app = document.getElementById('app');
    if (!app || document.getElementById('m-tabbar')) return;

    const bar = document.createElement('nav');
    bar.id = 'm-tabbar';
    bar.setAttribute('aria-label', 'Hauptnavigation');
    TABS.forEach(([view, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'm-tab';
      button.dataset.mView = view;
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + TAB_ICONS[view] + '</svg><span>' + label + '</span>';
      bar.append(button);
    });
    app.append(bar);

    const backdrop = document.createElement('div');
    backdrop.id = 'm-sheet-backdrop';
    app.append(backdrop);

    bar.addEventListener('click', (event) => {
      const tab = event.target.closest('.m-tab');
      if (!tab) return;
      const view = tab.dataset.mView;
      if (view === 'more') {
        root.classList.toggle('m-more');
        syncTabs();
        return;
      }
      root.classList.remove('m-more');
      const nav = document.querySelector('#sidebar .nav-item[data-view="' + view + '"]');
      if (nav) nav.click();
      else if (window.CleanMusic && typeof window.CleanMusic.showView === 'function') window.CleanMusic.showView(view);
      const content = document.getElementById('content');
      if (content) content.scrollTop = 0;
      syncTabs();
    });
    backdrop.addEventListener('click', closeMore);
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      const head = document.createElement('div');
      head.className = 'm-sheet-head';
      head.innerHTML =
        '<strong>Mehr</strong><button type="button" class="m-sheet-close" aria-label="Mehr schließen">×</button>';
      sidebar.prepend(head);
      head.querySelector('.m-sheet-close').addEventListener('click', closeMore);
      sidebar.addEventListener('click', (event) => {
        if (event.target.closest('.nav-item, #playlist-nav button, #playlist-nav [data-playlist]')) setTimeout(closeMore, 0);
      });
    }
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && root.classList.contains('m-more')) closeMore();
    });

    // Aktiven Tab nachziehen, wenn die App selbst die Ansicht wechselt.
    const observer = new MutationObserver(syncTabs);
    document.querySelectorAll('.view').forEach((view) => observer.observe(view, { attributes: true, attributeFilter: ['class'] }));

    const globalSearch = document.getElementById('global-search');
    if (globalSearch) globalSearch.addEventListener('input', syncSearchState);

    // Mini-Player: Tippen auf Cover/Titel öffnet den Vollbild-Player.
    const playerbar = document.getElementById('playerbar');
    const np = playerbar && playerbar.querySelector('.np');
    if (np) {
      np.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        const fs = document.getElementById('btn-fullscreen');
        if (fs && !fs.disabled) fs.click();
      });
    }

    // Dünne Fortschrittslinie oben am Mini-Player.
    if (playerbar) {
      const progress = document.createElement('div');
      progress.id = 'm-progress';
      progress.innerHTML = '<i></i>';
      playerbar.prepend(progress);
      const fill = progress.firstChild;
      const audio = document.getElementById('audio');
      if (audio) {
        const paint = () => {
          const dur = Number(audio.duration);
          const ratio = Number.isFinite(dur) && dur > 0 ? Math.min(1, audio.currentTime / dur) : 0;
          fill.style.width = (ratio * 100).toFixed(2) + '%';
        };
        ['timeupdate', 'loadedmetadata', 'emptied', 'seeked'].forEach((name) => audio.addEventListener(name, paint));
      }
    }
    syncTabs();
  }

  function start() {
    buildMobileShell();
    wireBackgroundAudio();
    setTimeout(() => {
      const app = window.CleanMusic;
      const active = document.querySelector('.view.active');
      if (app && typeof app.showView === 'function' && (!active || active.id === 'view-home')) {
        app.showView('radio');
      }
    }, 350);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
