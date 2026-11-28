'use strict';

/**
 * CleanMusic Android – Brücke für Handy, Tablet und Fernseher.
 *
 * Netzwerk: dieselben öffentlichen Schnittstellen wie main.js, aber über
 * CapacitorHttp und mit einer festen Allowlist:
 *   - itunes.apple.com/search, /lookup           (Apple-Vorschauen)
 *   - api.deezer.com/search, /chart, /editorial, (Deezer-Vorschauen,
 *     /track, /album, /artist, /search/artist      Charts, Künstlerseiten)
 *   - de1.api.radio-browser.info/json/...         (Radio)
 *   - lrclib.net/api/get, /api/search             (Songtexte)
 *   - api.lyrics.ovh/v1/...                       (Songtexte, Ausweichquelle)
 *   - api.github.com/repos/BellocccYT/cleanmusic/releases (Update-Suche)
 *
 * Kein Plugin-Lader, kein Cutter, keine Downloads, kein yt-dlp.
 * Die APK lädt Updates selbst: Größe + SHA-256 prüfen, dann Android-Installer.
 */

(function () {
  const MOBILE_VERSION = 'mobile-1.1.3';
  const UPDATE_REPO = 'BellocccYT/cleanmusic';
  const UPDATE_INTERVAL = 6 * 60 * 60 * 1000;
  const UPDATE_KEY = 'cleanmusic.updates.v1';

  const root = document.documentElement;
  const isTv = root.dataset.device === 'tv';
  if (!root.dataset.device) root.dataset.device = 'phone';
  if (!isTv) root.dataset.mobile = '1';

  // Erste mobile Runde: schlanke Ansicht, kein Desktop-Assistent.
  try {
    if (localStorage.getItem('cleanmusic.settings.v1') === null) {
      localStorage.setItem(
        'cleanmusic.settings.v1',
        JSON.stringify({ layout: 'simple', onboarded: true, background: 'none', lyrics: true })
      );
      // Frische Installation: Supporter-Extras nicht als „legacy“ frei – core/supporter.js
      // macht daraus beim Start 7 Tage Probezeit, danach fragt es nach dem öffentlichen Code.
      // Wer die App schon hatte, behält alles (Bestandsschutz).
      if (localStorage.getItem('cleanmusic.supporter.v1') === null) {
        localStorage.setItem('cleanmusic.supporter.v1', JSON.stringify({ unlocked: false, how: '', at: 0 }));
      }
    }
    if (localStorage.getItem('cleanmusic.seenversion.v1') === null) {
      localStorage.setItem('cleanmusic.seenversion.v1', JSON.stringify(MOBILE_VERSION));
    }
  } catch {
    /* Speicher nicht verfügbar – App läuft trotzdem */
  }

  /* ------------------------------------------------------------------ *
   * Netzwerk-Allowlist (dieselben Hosts und Wege wie in main.js)
   * ------------------------------------------------------------------ */

  const RULES = [
    { host: 'itunes.apple.com', paths: [/^\/search$/, /^\/lookup$/] },
    {
      host: 'api.deezer.com',
      paths: [
        /^\/search$/,
        /^\/search\/artist$/,
        /^\/chart\/0\/tracks$/,
        /^\/editorial\/0\/(?:releases|selection)$/,
        /^\/track\/\d+$/,
        /^\/album\/\d+$/,
        /^\/album\/\d+\/tracks$/,
        /^\/artist\/\d+$/,
        /^\/artist\/\d+\/(?:top|albums|related)$/,
      ],
    },
    { host: 'de1.api.radio-browser.info', paths: [/^\/json\/stations\/search$/] },
    { host: 'lrclib.net', paths: [/^\/api\/(?:get|search)$/] },
    { host: 'api.lyrics.ovh', paths: [/^\/v1\//] },
    {
      host: 'api.github.com',
      paths: [/^\/repos\/BellocccYT\/cleanmusic\/releases(?:\?.*)?$/],
    },
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
    return RULES.some(
      (rule) =>
        rule.host === url.hostname.toLowerCase() &&
        rule.paths.some((pattern) => pattern.test(url.pathname))
    );
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
          headers: {
            accept: 'application/json',
            'user-agent': `CleanMusic-Android/${currentVersion()}`,
          },
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
        if (response.status === 404) throw new Error('HTTP 404');
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

  function cleanText(value, max = 300) {
    return String(value == null ? '' : value)
      .replace(/[\r\n\t]+/g, ' ')
      .trim()
      .slice(0, max);
  }

  // Lyrics keep their line breaks (plain lyrics are read line by line).
  function cleanLyrics(value, max = 20000) {
    return String(value == null ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
      .slice(0, max);
  }

  function cleanUrl(value, pattern = /^https?:\/\//i, max = 900) {
    const text = cleanText(value, max);
    if (!pattern.test(text)) return '';
    try {
      const url = new URL(text);
      if (url.username || url.password) return '';
      return url.href;
    } catch {
      return '';
    }
  }

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

  /* --- Songtexte (LRCLIB, Ausweichquelle lyrics.ovh) ------------------ */

  function parseLrc(text) {
    const lines = [];
    String(text || '')
      .split(/\r?\n/)
      .forEach((line) => {
        const stamps = line.match(/\[\d{1,2}:\d{2}(?:\.\d{1,3})?\]/g);
        if (!stamps) return;
        const raw = line.replace(/\[[^\]]*\]/g, '').trim();
        // Enhanced LRC (LRCLIB "syncedLyrics") may carry per-word marks <mm:ss.xx>.
        const marks = raw.match(/<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g) || [];
        const words = marks
          .map((mark, i) => {
            const start = raw.indexOf(mark) + mark.length;
            const end = i + 1 < marks.length ? raw.indexOf(marks[i + 1]) : raw.length;
            const text = cleanText(raw.slice(start, end).trim(), 60);
            if (!text) return null;
            const match = mark.match(/<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>/);
            if (!match) return null;
            return {
              time: Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`),
              text,
            };
          })
          .filter(Boolean);
        const content = cleanText(marks.length ? raw.replace(/<[^>]*>/g, '').trim() : raw, 300);
        stamps.forEach((stamp) => {
          const match = stamp.match(/\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/);
          if (!match) return;
          const time = Number(match[1]) * 60 + Number(match[2]) + Number(`0.${match[3] || 0}`);
          const entry = { time, text: content };
          if (words.length) entry.words = words;
          lines.push(entry);
        });
      });
    return lines.sort((a, b) => a.time - b.time);
  }

  const lyricsCache = new Map();

  /* ------------------------------------------------------------------ *
   * Native Plugins
   * ------------------------------------------------------------------ */

  function plugin(name) {
    const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
    return plugins[name] || null;
  }

  function convertFileSrc(uri) {
    try {
      if (window.Capacitor && typeof window.Capacitor.convertFileSrc === 'function') {
        return window.Capacitor.convertFileSrc(uri);
      }
    } catch {
      /* ältere Laufzeit */
    }
    return uri;
  }

  /* ------------------------------------------------------------------ *
   * Update: GitHub-Releases, APK prüfen, Installer öffnen
   * ------------------------------------------------------------------ */

  function updateConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(UPDATE_KEY) || '{}');
      return { auto: raw.auto !== false };
    } catch {
      return { auto: true };
    }
  }

  function saveUpdateConfig(patch) {
    const next = Object.assign(updateConfig(), patch);
    try {
      localStorage.setItem(UPDATE_KEY, JSON.stringify(next));
    } catch {
      /* Speicher gesperrt */
    }
    return next;
  }

  function parseVersion(value) {
    const match = String(value || '')
      .trim()
      .replace(/^mobile-/i, '')
      .replace(/^v/i, '')
      .match(/^(\d+)\.(\d+)\.(\d+)/);
    return match ? match.slice(1).map(Number) : null;
  }

  function isNewerVersion(latest, current) {
    const a = parseVersion(latest);
    const b = parseVersion(current);
    if (!a || !b) return false;
    for (let i = 0; i < 3; i += 1) {
      if (a[i] !== b[i]) return a[i] > b[i];
    }
    return false;
  }

  function currentVersion() {
    return MOBILE_VERSION.replace(/^mobile-/, '');
  }

  let updateState = {
    status: 'idle',
    current: currentVersion(),
    latest: null,
    notes: '',
    url: `https://github.com/${UPDATE_REPO}/releases`,
    asset: null,
    progress: 0,
    error: null,
    checkedAt: 0,
    installable: true,
    kind: 'apk',
    auto: updateConfig().auto,
    file: null,
  };
  const updateListeners = new Set();
  let updateTask = null;

  function publicUpdate() {
    return Object.assign({}, updateState, { auto: updateConfig().auto, installable: true, kind: 'apk' });
  }

  function emitUpdate() {
    const info = publicUpdate();
    updateListeners.forEach((listener) => {
      try {
        listener(info);
      } catch {
        /* Listener der Oberfläche */
      }
    });
  }

  function setUpdate(patch) {
    updateState = Object.assign({}, updateState, patch);
    emitUpdate();
  }

  function pickApkAsset(release) {
    const assets = Array.isArray(release && release.assets) ? release.assets : [];
    const asset = assets.find((item) => item && /^CleanMusic-Android-\d+\.\d+\.\d+\.apk$/i.test(String(item.name || '')));
    if (!asset) return null;
    const digest = /^sha256:[0-9a-f]{64}$/i.test(String(asset.digest || ''))
      ? String(asset.digest).slice(7).toLowerCase()
      : null;
    // Ohne Prüfsumme kein Update – lieber gar nichts installieren als etwas Unbekanntes.
    if (!digest) return null;
    return {
      name: String(asset.name),
      size: Number(asset.size) || 0,
      url: String(asset.browser_download_url || ''),
      sha256: digest,
    };
  }

  async function checkForUpdates({ silent = false } = {}) {
    if (updateTask) return updateTask;
    if (updateState.status === 'downloading' || updateState.status === 'ready') return publicUpdate();
    if (!updateConfig().auto && silent) return publicUpdate();

    updateTask = (async () => {
      if (!silent) setUpdate({ status: 'checking', error: null });
      try {
        const releases = await requestJson(
          `https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=30`,
          15000
        );
        const list = Array.isArray(releases) ? releases : [];
        const mobileRelease = list.find(
          (release) => release && !release.draft && /^mobile-\d+\.\d+\.\d+/i.test(String(release.tag_name || ''))
        );
        if (!mobileRelease) {
          setUpdate({ status: 'current', latest: null, checkedAt: Date.now(), error: null });
          return publicUpdate();
        }
        const latest = String(mobileRelease.tag_name || '').replace(/^mobile-/i, '');
        const newer = isNewerVersion(latest, currentVersion());
        setUpdate({
          status: newer ? 'available' : 'current',
          latest: parseVersion(latest) ? latest : null,
          notes: cleanText(mobileRelease.body || '', 2000),
          url: cleanUrl(mobileRelease.html_url) || `https://github.com/${UPDATE_REPO}/releases`,
          asset: newer ? pickApkAsset(mobileRelease) : null,
          checkedAt: Date.now(),
          error: null,
          progress: 0,
          file: null,
        });
      } catch (error) {
        setUpdate({
          status: 'error',
          error: `Update-Prüfung fehlgeschlagen: ${friendlyNetError(error).message || error.message}`,
          checkedAt: Date.now(),
        });
      }
      return publicUpdate();
    })().finally(() => {
      updateTask = null;
    });
    return updateTask;
  }

  async function downloadUpdate() {
    const asset = updateState.asset;
    const pluginUpdater = plugin('Updater');
    if (!asset || (updateState.status !== 'available' && updateState.status !== 'error')) return publicUpdate();
    if (!pluginUpdater) {
      setUpdate({ status: 'error', error: 'Updates gibt es nur in der installierten Android-App.' });
      return publicUpdate();
    }
    setUpdate({ status: 'downloading', progress: 0, error: null });
    try {
      const result = await pluginUpdater.download({
        url: asset.url,
        name: asset.name,
        size: asset.size,
        sha256: asset.sha256 || '',
      });
      if (!result || !result.file) throw new Error('Download unvollständig');
      setUpdate({ status: 'ready', progress: 1, file: String(result.file) });
    } catch (error) {
      setUpdate({ status: 'error', error: `Download fehlgeschlagen: ${error.message || error}` });
    }
    return publicUpdate();
  }

  async function installUpdate() {
    const pluginUpdater = plugin('Updater');
    if (updateState.status !== 'ready' || !updateState.file || !pluginUpdater) return false;
    try {
      const result = await pluginUpdater.install({ file: updateState.file });
      if (result && result.started === false) {
        setUpdate({
          status: 'error',
          error: result.reason === 'permission'
            ? 'Android braucht die Erlaubnis „Unbekannte Apps installieren“ für CleanMusic.'
            : 'Der Installer konnte nicht geöffnet werden.',
        });
        return false;
      }
      return true;
    } catch (error) {
      setUpdate({ status: 'error', error: `Installer: ${error.message || error}` });
      return false;
    }
  }

  function startUpdateLoop() {
    setTimeout(() => {
      checkForUpdates({ silent: true }).catch(() => {});
    }, 4000);
    setInterval(() => {
      checkForUpdates({ silent: true }).catch(() => {});
    }, UPDATE_INTERVAL);
  }

  /* ------------------------------------------------------------------ *
   * Text-Toast ohne app.js (TV und frühe Fehler)
   * ------------------------------------------------------------------ */

  let fallbackToastTimer = 0;
  function toast(text) {
    if (!text) return;
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.append(el);
    }
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(fallbackToastTimer);
    fallbackToastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /* ------------------------------------------------------------------ *
   * Mobile Brücke window.cm
   * ------------------------------------------------------------------ */

  const notDesktop = async () => ({ error: 'Nur in der Desktop-App verfügbar.' });

  const bridge = {
    isElectron: false,
    isMobile: true,
    isTv: root.dataset.device === 'tv',

    pickFolder: async () => {
      const library = plugin('MediaLibrary');
      if (!library) {
        toast('Lokale Musik gibt es nur in der Android-App.');
        return null;
      }
      try {
        const permission = await library.requestPermission();
        if (!permission || permission.granted === false) {
          toast('Ohne Zugriff auf Audio-Dateien kann CleanMusic deine Musik nicht lesen.');
          return null;
        }
        const result = await library.listAudio();
        const files = (result && Array.isArray(result.files) ? result.files : [])
          .filter((file) => file && file.uri)
          .map((file) => ({
            name: cleanText(file.name, 240) || 'Titel',
            path: String(file.uri),
            dir: cleanText(file.folder, 160),
            url: convertFileSrc(String(file.uri)),
            size: Number(file.size) || 0,
          }));
        if (!files.length) {
          toast('Keine Audiodateien in der Mediathek gefunden.');
          return null;
        }
        return { folder: 'Android-Mediathek', files };
      } catch (error) {
        toast(`Mediathek: ${error.message || error}`);
        return null;
      }
    },

    openExternal: async (url) => {
      const target = String(url || '');
      if (!/^https?:\/\//i.test(target)) return false;
      const links = plugin('AppLinks');
      if (links) {
        const result = await links.openExternal({ url: target });
        return Boolean(result && result.opened);
      }
      window.open(target, '_blank', 'noopener');
      return true;
    },

    openMusic: async (input) => {
      const links = plugin('AppLinks');
      if (!links) return false;
      const result = await links.openMusic({
        service: String((input && input.service) || ''),
        title: String((input && input.title) || ''),
        artist: String((input && input.artist) || ''),
        url: String((input && input.url) || ''),
      });
      return Boolean(result && result.opened);
    },

    getInfo: async () => ({
      platform: 'android',
      mobile: true,
      tv: root.dataset.device === 'tv',
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

    topTracks: async () => {
      try {
        const json = await requestJson('https://api.deezer.com/chart/0/tracks?limit=30');
        return { tracks: normalizeDeezer({ data: json && json.data }).slice(0, 30), errors: [] };
      } catch (error) {
        return { tracks: [], errors: [{ source: 'Deezer Charts', message: error.message || 'nicht erreichbar' }] };
      }
    },

    newReleases: async () => {
      try {
        let json = await requestJson('https://api.deezer.com/editorial/0/releases?limit=18');
        if (!json || !Array.isArray(json.data) || !json.data.length) {
          json = await requestJson('https://api.deezer.com/editorial/0/selection?limit=18');
        }
        const albums = (json && Array.isArray(json.data) ? json.data : []).slice(0, 18);
        const tracks = await Promise.all(
          albums.map(async (album) => {
            try {
              const list = await requestJson(`https://api.deezer.com/album/${album.id}/tracks?limit=4`);
              const first = (list && Array.isArray(list.data) ? list.data : []).find(
                (track) => track && track.preview && track.readable !== false
              );
              if (!first) return null;
              return Object.assign({}, first, {
                album: Object.assign({}, first.album, {
                  id: album.id,
                  title: album.title,
                  cover_medium: album.cover_medium,
                  cover_big: album.cover_big,
                }),
                artist: first.artist || album.artist,
                release_date: album.release_date || '',
              });
            } catch {
              return null;
            }
          })
        );
        const valid = tracks.filter(Boolean);
        return {
          tracks: normalizeDeezer({ data: valid }).map((track, index) =>
            Object.assign(track, { released: cleanText(valid[index].release_date, 12) })
          ),
          errors: [],
        };
      } catch (error) {
        return { tracks: [], errors: [{ source: 'Neuerscheinungen', message: error.message || 'nicht erreichbar' }] };
      }
    },

    refreshPreview: async (id, meta) => {
      const value = String(id || '');
      try {
        let url = null;
        let match = value.match(/^deezer:(\d+)$/);
        if (match) {
          const json = await requestJson(`https://api.deezer.com/track/${match[1]}`);
          url = (json && json.preview) || null;
        }
        match = value.match(/^apple:(\d+)$/);
        if (match) {
          const json = await requestJson(`https://itunes.apple.com/lookup?id=${match[1]}&country=DE`);
          const hit =
            json && Array.isArray(json.results) ? json.results.find((entry) => entry && entry.previewUrl) : null;
          url = hit ? hit.previewUrl : null;
        }
        if (!url && meta && typeof meta === 'object' && meta.title) {
          const params = new URLSearchParams({
            term: `${meta.artist || ''} ${meta.title}`.trim().slice(0, 120),
            media: 'music',
            entity: 'song',
            limit: '8',
            country: 'DE',
          });
          const json = await requestJson(`https://itunes.apple.com/search?${params}`, 15000);
          const results = json && Array.isArray(json.results) ? json.results : [];
          const hit = results.find((entry) => entry && entry.previewUrl);
          if (hit) {
            return {
              url: hit.previewUrl,
              artwork: hit.artworkUrl100 ? hit.artworkUrl100.replace('100x100bb', '600x600bb') : '',
            };
          }
        }
        return { url };
      } catch (error) {
        return { url: null, error: error.message };
      }
    },

    lyricsGet: async (query) => {
      const input = query && typeof query === 'object' ? query : {};
      const title = cleanText(input.title, 200).trim();
      const artist = cleanText(input.artist, 200)
        .split(/,|;| & | feat\.? | ft\.? /i)[0]
        .trim();
      if (!title) return { lines: [], plain: '', error: 'Kein Titel.' };
      const duration = Math.round(Number(input.duration) || 0);
      const key = `${artist}|${title}`.toLowerCase();
      if (!input.refresh && lyricsCache.has(key)) return lyricsCache.get(key);

      const pick = (entry) =>
        entry && typeof entry === 'object'
          ? {
              lines: parseLrc(entry.syncedLyrics),
              plain: cleanLyrics(entry.plainLyrics || ''),
              instrumental: Boolean(entry.instrumental),
            }
          : null;

      let result = null;
      let unreachable = false;
      try {
        const params = new URLSearchParams({ track_name: title, artist_name: artist });
        if (input.album) params.set('album_name', cleanText(input.album, 200));
        if (duration) params.set('duration', String(duration));
        result = pick(await requestJson(`https://lrclib.net/api/get?${params}`));
        if (!result || (!result.lines.length && !result.plain)) {
          const list = await requestJson(
            `https://lrclib.net/api/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`
          );
          const entries = Array.isArray(list) ? list : [];
          const best =
            entries.find((entry) => entry && entry.syncedLyrics) || entries.find((entry) => entry && entry.plainLyrics);
          if (best) result = pick(best);
        }
      } catch {
        unreachable = true;
      }
      // Fallback: another free, key-less lyrics database (plain lyrics only).
      if (!result || (!result.lines.length && !result.plain)) {
        if (!(result && result.instrumental) && artist) {
          try {
            const ovh = await requestJson(
              `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`
            );
            const plain = cleanLyrics((ovh && ovh.lyrics) || '');
            if (plain) result = { lines: [], plain, instrumental: false, source: 'ovh' };
          } catch {
            /* no fallback lyrics */
          }
        }
      }
      if (unreachable && (!result || (!result.lines.length && !result.plain))) {
        return { lines: [], plain: '', error: 'Die Songtext-Suche ist gerade nicht erreichbar.' };
      }
      const out =
        result && (result.lines.length || result.plain)
          ? { lines: result.lines, plain: result.plain, source: result.source || 'lrclib', error: null }
          : {
              lines: [],
              plain: '',
              source: '',
              error: result && result.instrumental ? 'Instrumental – kein Songtext.' : 'Kein Songtext gefunden.',
            };
      lyricsCache.set(key, out);
      if (lyricsCache.size > 120) lyricsCache.delete(lyricsCache.keys().next().value);
      return out;
    },

    artistPage: async (input) => {
      const query = input && typeof input === 'object' ? input : {};
      try {
        let id = Number(query.deezerId) || 0;
        const name = cleanText(query.name, 120).trim();
        if (!id) {
          if (!name) return { error: 'Kein Künstler angegeben.' };
          const found = await requestJson(
            `https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`
          );
          id = found && Array.isArray(found.data) && found.data[0] ? Number(found.data[0].id) : 0;
          if (!id) return { error: `„${name}“ wurde bei Deezer nicht gefunden.` };
        }
        const [artist, top, albums, related] = await Promise.all([
          requestJson(`https://api.deezer.com/artist/${id}`),
          requestJson(`https://api.deezer.com/artist/${id}/top?limit=20`).catch(() => null),
          requestJson(`https://api.deezer.com/artist/${id}/albums?limit=40`).catch(() => null),
          requestJson(`https://api.deezer.com/artist/${id}/related?limit=12`).catch(() => null),
        ]);
        const card = artist && artist.id
          ? {
              id: Number(artist.id),
              name: cleanText(artist.name, 200),
              picture: cleanUrl(artist.picture_xl || artist.picture_big || artist.picture_medium || ''),
              fans: Number(artist.nb_fan) || 0,
            }
          : null;
        if (!card) return { error: 'Künstler nicht gefunden.' };
        return {
          artist: Object.assign(card, { albums: Number(artist.nb_album) || 0, link: cleanUrl(artist.link) }),
          top: normalizeDeezer(top || {}),
          albums: (albums && Array.isArray(albums.data) ? albums.data : [])
            .map((album) => ({
              id: Number(album.id) || 0,
              title: cleanText(album.title, 200),
              cover: cleanUrl(album.cover_xl || album.cover_big || album.cover_medium || album.cover || ''),
              year: cleanText(album.release_date, 10).slice(0, 4),
              type: cleanText(album.record_type, 20),
            }))
            .filter((album) => album.id),
          related: (related && Array.isArray(related.data) ? related.data : [])
            .map((entry) =>
              entry && entry.id
                ? {
                    id: Number(entry.id),
                    name: cleanText(entry.name, 200),
                    picture: cleanUrl(entry.picture_xl || entry.picture_big || entry.picture_medium || ''),
                    fans: Number(entry.nb_fan) || 0,
                  }
                : null
            )
            .filter(Boolean),
          error: null,
        };
      } catch (error) {
        return { error: friendlyNetError(error).message || error.message };
      }
    },

    albumTracks: async (albumId) => {
      const id = Number(albumId) || 0;
      if (!id) return { title: '', tracks: [], error: 'Kein Album.' };
      try {
        const album = await requestJson(`https://api.deezer.com/album/${id}`);
        const cover = {
          id,
          title: album && album.title,
          cover: album && album.cover,
          cover_small: album && album.cover_small,
          cover_medium: album && album.cover_medium,
          cover_big: album && album.cover_big,
          cover_xl: album && album.cover_xl,
          md5_image: album && album.md5_image,
        };
        const tracks = (album && album.tracks && Array.isArray(album.tracks.data) ? album.tracks.data : []).map(
          (track) => Object.assign({}, track, { album: cover })
        );
        return {
          title: cleanText(album && album.title, 200),
          tracks: normalizeDeezer({ data: tracks }),
          error: null,
        };
      } catch (error) {
        return { title: '', tracks: [], error: friendlyNetError(error).message || error.message };
      }
    },

    // Ohne Plugin-Laufzeit gibt es keine fremden Kataloge.
    recommendations: async () => ({ tracks: [], videos: [], seeds: [], errors: [] }),

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

    // Desktop-Fernbedienung: auf dem Handy nicht nötig, die Steuerseite
    // gehört zum Fernseher.
    remoteGet: async () => ({ enabled: false, port: 4790, url: '', qr: '' }),
    remoteSet: async () => ({ enabled: false }),
    remoteRotate: async () => ({ enabled: false }),

    diagnosticCopy: async () => `CleanMusic ${MOBILE_VERSION} · Android`,
    diagnosticError: () => {},
    diagnosticState: () => {},
    backupFolderPick: async () => null,
    backupAutoSave: notDesktop,
    projectCreditsSave: notDesktop,
    savePng: notDesktop,
    copyPng: async () => false,
    liveBgPick: async () => ({ canceled: true }),
    liveBgGet: async () => ({ url: '', kind: '', missing: false }),

    // Update (eigener Weg, weil es keinen Store gibt)
    updateGet: async () => publicUpdate(),
    updateCheck: () => checkForUpdates({ silent: false }),
    updateDownload: () => downloadUpdate(),
    updateInstall: () => installUpdate(),
    updateOpen: async () => {
      const target = updateState.url || `https://github.com/${UPDATE_REPO}/releases`;
      const links = plugin('AppLinks');
      if (links) links.openExternal({ url: target }).catch(() => {});
      return true;
    },
    updateSet: async (patch) => {
      saveUpdateConfig({ auto: Boolean(patch && patch.auto) });
      emitUpdate();
      return publicUpdate();
    },
    onUpdateState: (listener) => {
      if (typeof listener === 'function') updateListeners.add(listener);
    },
  };

  if (!isTv) {
    window.cm = bridge;
  } else {
    // TV: app.js wird nicht geladen. tv.js bekommt nur die benötigten Wege.
    window.cm = Object.assign({}, bridge, {
      tvRemote: {
        get: async () => {
          const remote = plugin('RemoteServer');
          return remote ? remote.get() : { enabled: false, error: 'Nur in der Android-App.' };
        },
        setEnabled: async (enabled) => {
          const remote = plugin('RemoteServer');
          if (!remote) return { enabled: false, error: 'Nur in der Android-App.' };
          return enabled ? remote.start() : remote.stop();
        },
        rotate: async () => {
          const remote = plugin('RemoteServer');
          return remote ? remote.rotate() : { enabled: false };
        },
        update: (payload) => {
          const remote = plugin('RemoteServer');
          if (remote) remote.updateState(payload);
        },
        respond: (payload) => {
          const remote = plugin('RemoteServer');
          if (remote) remote.respond(payload);
        },
      },
      onRemoteRequest: (listener) => {
        const remote = plugin('RemoteServer');
        if (!remote || !remote.addListener) return;
        remote.addListener('request', (event) => {
          try {
            listener(event);
          } catch {
            /* TV-Fehler nicht in den Server tragen */
          }
        });
      },
    });
  }

  /* ------------------------------------------------------------------ *
   * Hintergrund-Wiedergabe: WebView-Ton -> nativer Foreground-Service
   * ------------------------------------------------------------------ */

  function bgPlugin() {
    return plugin('BackgroundAudio');
  }

  function text(id) {
    const el = document.getElementById(id);
    return el ? String(el.textContent || '').trim() : '';
  }

  function currentMeta() {
    if (typeof window.CMNowPlaying === 'function') {
      try {
        return window.CMNowPlaying() || {};
      } catch {
        /* TV-Haken nicht bereit */
      }
    }
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
      title: String(meta.title || '').slice(0, 200),
      artist: String(meta.artist || '').slice(0, 200),
      album: String(meta.album || '').slice(0, 200),
      artwork: /^https:\/\//i.test(meta.artwork || '') ? String(meta.artwork).slice(0, 1000) : '',
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
    const service = bgPlugin();
    const audio = document.getElementById('audio');
    if (!service || !audio) return;

    const playing = !audio.paused && Boolean(audio.currentSrc || audio.getAttribute('src'));
    const state = snapshot(playing);
    if (!state) return;

    if (!state.title) {
      if (serviceStarted) {
        serviceStarted = false;
        lastSignature = '';
        try {
          await service.stop();
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
        await service.start(state);
      } else if (serviceStarted) {
        await service.update(state);
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
    const hook = window.CMMediaAction;
    if (typeof hook === 'function') {
      hook(action, event);
      schedulePush(true);
      return;
    }

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
      const service = bgPlugin();
      if (service) service.stop().catch(() => {});
    } else if (action === 'toggle') {
      click('btn-play');
    }
  }

  function wireBackgroundAudio() {
    const service = bgPlugin();
    if (!service) {
      console.warn('BackgroundAudio-Plugin nicht gefunden – Wiedergabe läuft nur im Vordergrund.');
      return;
    }

    if (service.addListener) {
      try {
        // Capacitor 8 gibt ein PluginListenerHandle zurück (kein Promise).
        const handle = service.addListener('mediaAction', handleMediaAction);
        if (handle && typeof handle.catch === 'function') handle.catch(() => {});
      } catch {
        /* ältere Laufzeit */
      }
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
  const OPEN_SERVICES = [
    ['spotify', 'Spotify', 'SP'],
    ['ytmusic', 'YouTube Music', 'YT'],
    ['apple', 'Apple Music', 'AM'],
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

  // Welche Dienste gerade geöffnet werden können (Deep Link statt Web-Player).
  function openInService(serviceId) {
    const title = text('fs-title');
    const artist = text('fs-artist');
    if (!title || title === 'Nichts ausgewählt') {
      toast('Starte zuerst einen Titel.');
      return;
    }
    bridge
      .openMusic({ service: serviceId, title, artist })
      .then((ok) => {
        if (!ok) {
          const query = encodeURIComponent([artist, title].filter(Boolean).join(' '));
          const urls = {
            spotify: `https://open.spotify.com/search/${query}`,
            ytmusic: `https://music.youtube.com/search?q=${query}`,
            apple: `https://music.apple.com/de/search?term=${query}`,
          };
          bridge.openExternal(urls[serviceId] || urls.spotify);
        }
      })
      .catch(() => {});
  }

  function buildOpenServices() {
    const actions = document.querySelector('#fullscreen .fs-actions');
    if (!actions || document.getElementById('m-open-services')) return;
    const host = document.createElement('div');
    host.id = 'm-open-services';
    host.className = 'm-open-services';
    host.innerHTML =
      '<span class="m-open-label">In der offiziellen App öffnen</span>' +
      OPEN_SERVICES.map(
        ([id, label, short]) =>
          `<button type="button" class="m-open-btn" data-open-music="${id}" title="${label}"><b>${short}</b><span>${label}</span></button>`
      ).join('') +
      '<button type="button" class="m-open-btn" data-share-current title="Link zum Teilen kopieren"><b>⧉</b><span>Teilen</span></button>';
    actions.after(host);
    host.addEventListener('click', (event) => {
      const button = event.target.closest('[data-open-music]');
      if (button) return openInService(button.dataset.openMusic);
      if (event.target.closest('[data-share-current]')) {
        if (window.CleanMusic && typeof window.CleanMusic.shareCurrent === 'function') {
          window.CleanMusic.shareCurrent();
        }
      }
    });
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

    buildOpenServices();
    syncTabs();
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */

  function start() {
    if (isTv) {
      // tv.js setzt window.CMBack selbst (Overlay -> Startseite -> App).
      wireBackgroundAudio();
      startUpdateLoop();
      return;
    }

    // Zurück-Taste: Vollbild/Mehr-Blatt/Unteransicht schließen, dann erst App.
    window.CMBack = () => {
      const fullscreen = document.getElementById('fullscreen');
      if (fullscreen && !fullscreen.hidden) {
        const close = fullscreen.querySelector('[data-fs-act="close"]');
        if (close) close.click();
        return true;
      }
      if (root.classList.contains('m-more')) {
        closeMore();
        return true;
      }
      const active = document.querySelector('.view.active');
      if (active && active.id !== 'view-home' && window.CleanMusic) {
        window.CleanMusic.showView('home');
        return true;
      }
      return false;
    };

    buildMobileShell();
    wireBackgroundAudio();
    startUpdateLoop();
    setTimeout(() => {
      const app = window.CleanMusic;
      const active = document.querySelector('.view.active');
      if (app && typeof app.showView === 'function' && (!active || active.id === 'view-home')) {
        // Startseite zeigt Charts; Radio ist einen Tipp entfernt.
        app.showView('home');
      }
    }, 350);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
