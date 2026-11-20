'use strict';

/**
 * CleanMusic – The Music Launcher
 * Main process: window, embedded web players, local library scanning, DRM setup.
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Menu,
  session,
  net,
  clipboard,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { pathToFileURL } = require('node:url');
const { DiscordPresence } = require('./discord-rpc');

const ROOT = __dirname;
const isDev = process.argv.includes('--dev');
const isSmoke = process.argv.includes('--smoke');
const isSmokePlugin = process.argv.includes('--smoke-plugin');

// The smoke test favourites, creates playlists etc. – never in the real profile.
if (isSmoke) {
  const smokeProfile = path.join(app.getPath('temp'), 'cleanmusic-smoke');
  fs.rmSync(smokeProfile, { recursive: true, force: true });
  app.setPath('userData', smokeProfile);
}

// One CleanMusic at a time: a second launch (e.g. a double-click on the
// slow-to-unpack portable EXE) only brings the running window to the front
// instead of fighting over the same profile.
const hasInstanceLock = isSmoke || app.requestSingleInstanceLock();
if (!hasInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

/* ------------------------------------------------------------------ *
 * Widevine (DRM)
 *
 * Electron ships without a Widevine CDM, so Spotify / Apple Music /
 * Deezer / Amazon Music web players cannot decrypt their streams out
 * of the box. Chrome and Edge install a CDM on Windows – we reuse the
 * newest one we can find. This does NOT break DRM: the CDM still gets
 * a proper licence from the service.
 * ------------------------------------------------------------------ */

function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function widevineRootCandidates() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = [];

  if (process.platform === 'win32') {
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || '';

    const appRoots = [
      path.join(programFiles, 'Google', 'Chrome', 'Application'),
      path.join(programFilesX86, 'Google', 'Chrome', 'Application'),
      path.join(localAppData, 'Google', 'Chrome', 'Application'),
      path.join(programFilesX86, 'Microsoft', 'Edge', 'Application'),
      path.join(programFiles, 'Microsoft', 'Edge', 'Application'),
    ];

    for (const appRoot of appRoots) {
      let versions = [];
      try {
        versions = fs.readdirSync(appRoot, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const version of versions) {
        if (version.isDirectory()) {
          candidates.push(path.join(appRoot, version.name, 'WidevineCdm'));
        }
      }
    }
  } else if (process.platform === 'linux') {
    candidates.push(
      '/opt/google/chrome/WidevineCdm',
      '/opt/google/chrome-beta/WidevineCdm',
      '/opt/google/chrome-unstable/WidevineCdm',
      '/usr/lib/chromium/WidevineCdm',
      '/usr/lib/chromium-browser/WidevineCdm',
      '/snap/chromium/current/usr/lib/chromium-browser/WidevineCdm',
      '/opt/brave.com/brave/WidevineCdm',
      '/var/lib/flatpak/app/com.google.Chrome/current/active/files/extra/chrome/WidevineCdm',
      path.join(
        home,
        '.local/share/flatpak/app/com.google.Chrome/current/active/files/extra/chrome/WidevineCdm'
      ),
      path.join(home, '.config/google-chrome/WidevineCdm'),
      path.join(home, '.config/chromium/WidevineCdm'),
      path.join(home, '.config/BraveSoftware/Brave-Browser/WidevineCdm'),
      path.join(home, '.config/microsoft-edge/WidevineCdm')
    );
  } else if (process.platform === 'darwin') {
    const versionsRoot = '/Applications/Google Chrome.app/Contents/Versions';
    let versions = [];

    try {
      versions = fs.readdirSync(versionsRoot, { withFileTypes: true });
    } catch {
      /* Chrome not installed */
    }

    for (const version of versions) {
      if (!version.isDirectory()) continue;

      candidates.push(
        path.join(
          versionsRoot,
          version.name,
          'Google Chrome Framework.framework/Versions/A/Libraries/WidevineCdm'
        )
      );
    }
  }

  return candidates;
}

function findWidevine() {
  const osName = { win32: 'win', darwin: 'mac', linux: 'linux' }[process.platform];
  const archName = { x64: 'x64', arm64: 'arm64', ia32: 'x86' }[process.arch];
  const libraryName = {
    win32: 'widevinecdm.dll',
    darwin: 'libwidevinecdm.dylib',
    linux: 'libwidevinecdm.so',
  }[process.platform];

  if (!osName || !archName || !libraryName) return null;

  const found = [];

  for (const root of widevineRootCandidates()) {
    const manifestPath = path.join(root, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    let manifest = null;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      continue;
    }

    let relative = null;
    if (manifest && Array.isArray(manifest.platforms)) {
      const match = manifest.platforms.find(
        (entry) => entry.os === osName && entry.arch === archName
      );
      if (match && match.sub_package_path) relative = match.sub_package_path;
    }

    if (!relative) {
      relative = `_platform_specific/${osName}_${archName}`;
    }

    const dir = path.join(root, relative);
    if (!fs.existsSync(path.join(dir, libraryName))) continue;

    found.push({
      dir,
      version: manifest && manifest.version ? String(manifest.version) : 'unknown',
      source: root,
    });
  }

  found.sort((a, b) => compareVersions(b.version, a.version));
  return found[0] || null;
}

const widevine = findWidevine();

if (widevine) {
  app.commandLine.appendSwitch('widevine-cdm-path', widevine.dir);
  app.commandLine.appendSwitch('widevine-cdm-version', widevine.version);
}

// Keep audio alive when the window is minimised or hidden behind others.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

// Present a normal Chrome UA – several players refuse to start otherwise.
const userAgentPlatform =
  {
    win32: 'Windows NT 10.0; Win64; x64',
    darwin: 'Macintosh; Intel Mac OS X 10_15_7',
    linux: 'X11; Linux x86_64',
  }[process.platform] || 'Windows NT 10.0; Win64; x64';

app.userAgentFallback =
  `Mozilla/5.0 (${userAgentPlatform}) AppleWebKit/537.36 ` +
  `(KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;

/* ------------------------------------------------------------------ *
 * Local library
 * ------------------------------------------------------------------ */

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.oga', '.opus',
  '.wma', '.aiff', '.aif', '.alac',
]);

const MAX_TRACKS = 5000;

async function walkAudio(dir, out = [], depth = 0) {
  if (depth > 12 || out.length >= MAX_TRACKS) return out;

  let entries = [];
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }

  for (const entry of entries) {
    if (out.length >= MAX_TRACKS) break;
    if (entry.name.startsWith('.')) continue;

    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await walkAudio(full, out, depth + 1);
      continue;
    }

    if (!AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

    let size = 0;
    try {
      const stat = await fsp.stat(full);
      size = stat.size;
    } catch {
      /* ignore unreadable file */
    }

    out.push({
      name: entry.name,
      path: full,
      dir: path.dirname(full),
      url: pathToFileURL(full).href,
      size,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Catalog search with legal 30-second previews
 *
 * Sources: the official iTunes Search API (Apple Music catalog) and
 * the public Deezer API. Both hand out preview URLs explicitly for
 * this kind of use. Playback stays inside CleanMusic; no stream is
 * extracted or decrypted.
 * ------------------------------------------------------------------ */

const TRANSIENT_NET = /ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_TIMED_OUT|ERR_INTERNET_DISCONNECTED|ERR_ADDRESS_UNREACHABLE/;

function friendlyNetError(error) {
  const message = String((error && error.message) || error || '');
  if (/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_ADDRESS_UNREACHABLE/.test(message)) {
    return new Error('Keine Verbindung (Internet oder DNS). Bitte gleich erneut versuchen.');
  }
  if (/abort/i.test(message)) return new Error('Zeitüberschreitung – der Dienst antwortet gerade nicht.');
  return error instanceof Error ? error : new Error(message);
}

async function fetchJson(url, timeoutMs = 12000, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await net.fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    // Flaky DNS / network switches (VPNs!) usually recover within a second.
    if (attempt < 2 && TRANSIENT_NET.test(String(error && error.message))) {
      await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
      return fetchJson(url, timeoutMs, attempt + 1);
    }
    throw friendlyNetError(error);
  } finally {
    clearTimeout(timer);
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
      artwork: track.artworkUrl100
        ? track.artworkUrl100.replace('100x100bb', '300x300bb')
        : '',
      duration: Math.round((Number(track.trackTimeMillis) || 0) / 1000),
      preview: track.previewUrl,
      link: track.trackViewUrl || '',
      artistId: track.artistId ? String(track.artistId) : null,
    }));
}

// Deezer serves a grey placeholder (MD5 of an empty string) when a cover is missing.
const DEEZER_PLACEHOLDER = 'd41d8cd98f00b204e9800998ecf8427e';

function deezerCover(album) {
  const url = (album && (album.cover_medium || album.cover_big)) || '';
  return url.includes(DEEZER_PLACEHOLDER) ? '' : url;
}

function normalizeDeezer(json, options = {}) {
  const data = json && Array.isArray(json.data) ? json.data : [];

  return data
    .filter((track) => track && (track.preview || options.requirePreview === false))
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

function interleaveTracks(first, second) {
  const out = [];
  const seen = new Set();
  const max = Math.max(first.length, second.length);

  for (let index = 0; index < max; index += 1) {
    for (const track of [first[index], second[index]]) {
      if (!track) continue;

      const key = `${track.title}|${track.artist}`
        .toLowerCase()
        .replace(/[^a-z0-9äöüß]+/gi, ' ')
        .trim();

      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(track);
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * Windows
 * ------------------------------------------------------------------ */

let mainWindow = null;
let musicKitWindow = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#080a0e',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#080a0e',
      symbolColor: '#dfe4ea',
      height: 40,
    },
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
    },
  });

  mainWindow.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  mainWindow.webContents.setBackgroundThrottling(false);

  mainWindow.once('ready-to-show', () => {
    if (!isSmoke) mainWindow.show();
  });

  // Never stay invisible: show the window after a few seconds even if the
  // first paint takes longer (slow disk, virus scanner, many local titles).
  setTimeout(() => {
    if (!isSmoke && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 4000);

  // Security: guests never get a preload or Node access.
  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });

  // Links opened from the shell go to the real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  if (isDev || isSmoke) {
    mainWindow.webContents.on('console-message', (...args) => {
      const details = args[1];
      if (details && typeof details === 'object') {
        if (details.level === 'error' || details.level === 'warning') {
          console.log(`[renderer:${details.level}] ${details.message}`);
        }
      } else if (args[1] === 3 || args[1] === 2) {
        console.log(`[renderer:${args[1] === 3 ? 'error' : 'warning'}] ${args[2]}`);
      }
    });
  }

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  if (isSmoke) {
    mainWindow.webContents.once('did-finish-load', async () => {
      console.log('SMOKE_OK: renderer loaded');
      console.log(
        `SMOKE_WIDEVINE: ${widevine ? `${widevine.version} @ ${widevine.dir}` : 'not found'}`
      );

      try {
        const result = await mainWindow.webContents.executeJavaScript(`
          (() => ({
            navItems: document.querySelectorAll('#sidebar .nav-item').length,
            hasAudio: Boolean(document.querySelector('#audio')),
            debug: window.CleanMusic.state(),
          }))()
        `);
        console.log('SMOKE_UI:', JSON.stringify(result));
      } catch (error) {
        console.error('SMOKE_UI_FAIL:', error.message);
      }

      setTimeout(async () => {
        try {
          const result = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const view = document.querySelector('webview');
              const rows = document.querySelectorAll('#view-search .song-row');

              let playback = null;
              if (rows.length) {
                rows[0].click();
                await new Promise((resolve) => setTimeout(resolve, 1600));
                const audio = document.querySelector('#audio');
                playback = {
                  src: audio.src ? audio.src.slice(0, 80) : '',
                  paused: audio.paused,
                  time: Number(audio.currentTime.toFixed(2)),
                  mediaError: audio.error ? audio.error.code : null,
                };
              }

              let url = null;
              try { url = view ? view.getURL() : null; } catch (error) { url = 'error: ' + error.message; }

              return {
                count: document.querySelectorAll('webview').length,
                url,
                active: view ? view.classList.contains('active') : false,
                hostActive: document.querySelector('#service-host').classList.contains('active'),
                songRows: rows.length,
                playback,
                debug: window.CleanMusic.state(),
              };
            })()
          `);
          console.log('SMOKE_WEBVIEWS:', JSON.stringify(result));
        } catch (error) {
          console.error('SMOKE_WEBVIEW_FAIL:', error.message);
        }

        try {
          await mainWindow.webContents.executeJavaScript(
            "window.CleanMusic.search('daft punk')"
          );
          // The iTunes API sometimes needs several seconds – wait for results.
          await mainWindow.webContents.executeJavaScript(`
            (async () => {
              for (let i = 0; i < 50; i += 1) {
                if (document.querySelector('#search-results .song-source[data-source="apple"]')) return;
                await new Promise((resolve) => setTimeout(resolve, 300));
              }
            })()
          `);

          const appleResult = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const rows = Array.from(document.querySelectorAll('#view-search .song-row'));
              const apple = rows.find((row) => row.querySelector('.song-source[data-source="apple"]'));
              if (!apple) return { found: false, rows: rows.length };

              apple.click();
              await new Promise((resolve) => setTimeout(resolve, 1600));
              const audio = document.querySelector('#audio');

              const shuffle = document.querySelector('#btn-shuffle');
              shuffle.click();
              const shuffleActive = shuffle.classList.contains('active');
              shuffle.click();

              const menuButton = document.querySelector('#view-search .song-row [data-act="services"]');
              let serviceMenu = null;
              if (menuButton) {
                menuButton.click();
                await new Promise((resolve) => setTimeout(resolve, 300));
                serviceMenu = {
                  open: !document.querySelector('#service-menu').hidden,
                  items: document.querySelectorAll('#service-menu [data-menu-service]').length,
                };
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
              }

              return {
                found: true,
                rows: rows.length,
                src: audio.src ? audio.src.slice(0, 80) : '',
                paused: audio.paused,
                time: Number(audio.currentTime.toFixed(2)),
                mediaError: audio.error ? audio.error.code : null,
                shuffleActive,
                serviceMenu,
              };
            })()
          `);
          console.log('SMOKE_APPLE:', JSON.stringify(appleResult));

          await mainWindow.webContents.executeJavaScript(
            "window.CleanMusic.showView('radio')"
          );
          await new Promise((resolve) => setTimeout(resolve, 8000));

          const radioResult = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cards = document.querySelectorAll('#view-radio .radio-card[data-list="radio"]');
              if (!cards.length) return { found: false, debug: window.CleanMusic.state() };

              cards[0].click();
              await new Promise((resolve) => setTimeout(resolve, 2500));
              const audio = document.querySelector('#audio');
              return {
                found: true,
                cards: cards.length,
                src: audio.src ? audio.src.slice(0, 80) : '',
                paused: audio.paused,
                time: Number(audio.currentTime.toFixed(2)),
                mediaError: audio.error ? audio.error.code : null,
                liveIndicator: !document.querySelector('#live-indicator').hidden,
                seekHidden: document.querySelector('.seek-row').hidden,
              };
            })()
          `);
          console.log('SMOKE_RADIO:', JSON.stringify(radioResult));

          await mainWindow.webContents.executeJavaScript(
            "window.CleanMusic.showView('search')"
          );
        } catch (error) {
          console.error('SMOKE_SEARCH_FAIL:', error.message);
        }

        try {
          const libraryResult = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

              const rows = Array.from(document.querySelectorAll('#search-results .song-row'));
              rows.slice(0, 2).forEach((row) => row.querySelector('[data-act="fav"]').click());
              const radioFav = document.querySelector('#view-radio .radio-card [data-act="fav"]');
              if (radioFav) radioFav.click();

              const id = cm.createPlaylist('Smoke Mix');
              cm.addToPlaylistAt(id, 'search', 2);
              cm.addToPlaylistAt(id, 'search', 3);
              cm.addToPlaylistAt(id, 'favorites', 0);
              cm.addToPlaylistAt(id, 'favorites', 0);
              cm.movePlaylistItem(id, 2, 0);
              cm.openPlaylist(id);
              await wait(200);

              const plRows = document.querySelectorAll('#view-playlist .song-row');
              const firstInPlaylist = plRows[0] ? plRows[0].dataset.trackId : null;
              if (plRows[0]) plRows[0].click();
              await wait(1800);
              const now = cm.nowPlaying();

              cm.showView('favorites');
              const favRows = document.querySelectorAll('#view-favorites .song-list .song-row').length;
              await cm.loadRecs(true);
              const st = cm.state();

              return {
                favorites: st.favorites,
                favRows,
                favCount: document.querySelector('#fav-count').textContent,
                playlists: st.playlists,
                navPlaylists: document.querySelectorAll('#playlist-nav [data-playlist]').length,
                plRows: plRows.length,
                firstInPlaylist,
                now,
                recs: st.recs,
                recSeeds: st.recSeeds,
                homeRecCards: document.querySelectorAll('#home-recs .chart-card').length,
              };
            })()
          `);
          console.log('SMOKE_LIBRARY:', JSON.stringify(libraryResult));
        } catch (error) {
          console.error('SMOKE_LIBRARY_FAIL:', error.message);
        }

        try {
          const creatorResult = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const tabs = {};
              for (const [tab, category] of [['ncs', 'gaming'], ['classics', 'lustig'], ['sfx', 'whoosh'], ['free', 'relaxing']]) {
                cm.setCreator(tab, category);
                for (let i = 0; i < 50; i += 1) {
                  const s = cm.creator();
                  if (!s.loading && (s.items || s.error)) break;
                  await wait(300);
                }
                tabs[tab] = cm.creator();
              }

              cm.setCreator('ncs', 'top');
              for (let i = 0; i < 40 && !cm.creator().items; i += 1) await wait(300);
              document.querySelector('#creator-list .song-row').click();
              let ncs = null;
              for (let i = 0; i < 50; i += 1) {
                await wait(300);
                ncs = cm.nowPlaying();
                if (ncs && ncs.mode !== 'loading' && (ncs.time > 0.3 || ncs.mode === 'error')) break;
              }

              cm.setCreator('classics', 'lustig');
              await wait(300);
              document.querySelector('#creator-list .song-row').click();
              await wait(3000);
              const now = cm.nowPlaying();

              cm.openFullscreen();
              await wait(1500);
              const fullscreen = {
                open: !document.querySelector('#fullscreen').hidden,
                title: document.querySelector('#fs-title').textContent,
                upNext: document.querySelectorAll('#fs-next .fs-next-item').length,
                playing: document.querySelector('#fs-play').classList.contains('playing'),
                accent: getComputedStyle(document.documentElement).getPropertyValue('--fs-a').trim(),
              };
              const viz = cm.visualizer();
              cm.closeFullscreen();

              await cm.collectCreditAt('creator', 0);
              await cm.collectCreditAt('creator', 1);
              const credits = cm.creator().credits;
              const creditRows = document.querySelectorAll('#creator-credits .credits-list li').length;

              return { tabs, ncs, now, fullscreen, viz, credits, creditRows };
            })()
          `);
          console.log('SMOKE_CREATOR:', JSON.stringify(creatorResult));
        } catch (error) {
          console.error('SMOKE_CREATOR_FAIL:', error.message);
        }

        try {
          const plugins = await mainWindow.webContents.executeJavaScript(
            'window.CleanMusic.plugins()'
          );
          console.log('SMOKE_PLUGINS:', JSON.stringify(plugins));
        } catch (error) {
          console.error('SMOKE_PLUGINS_FAIL:', error.message);
        }

        // Optional: exercise the first source plugin found in the plugin folders.
        if (isSmokePlugin) {
          try {
            const pluginResult = await mainWindow.webContents.executeJavaScript(`
              (async () => {
                const cm = window.CleanMusic;
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                const candidate = cm.plugins().find((plugin) => plugin.file);
                if (!candidate) return { found: false };

                await cm.enablePlugin(candidate.id);
                let plugin = null;
                for (let i = 0; i < 60; i += 1) {
                  plugin = cm.plugins().find((entry) => entry.id === candidate.id);
                  if (plugin && plugin.ready) break;
                  await wait(250);
                }
                if (!plugin || !plugin.ready) return { found: true, ready: false, plugin };

                cm.search('daft punk get lucky');
                cm.showView('search');

                let pluginRows = 0;
                for (let i = 0; i < 60 && !pluginRows; i += 1) {
                  await wait(500);
                  pluginRows = document.querySelectorAll('#plugin-results .song-row').length;
                }
                if (!pluginRows) return { found: true, pluginRows, state: cm.state() };

                let started = Date.now();
                document.querySelector('#plugin-results .song-row').click();
                let now = null;
                for (let i = 0; i < 80; i += 1) {
                  await wait(500);
                  now = cm.nowPlaying();
                  if (now && now.mode !== 'loading' && now.time > 0.5) break;
                }
                const direct = Object.assign({ ms: Date.now() - started }, now);

                started = Date.now();
                document.querySelector('#search-results .song-row').click();
                for (let i = 0; i < 100; i += 1) {
                  await wait(500);
                  now = cm.nowPlaying();
                  if (now && now.mode !== 'loading' && now.time > 0.5) break;
                }
                const matched = Object.assign({ ms: Date.now() - started }, now);

                document.querySelector('#plugin-results .song-row [data-act="fav"]').click();
                await cm.loadRecs(true);
                cm.showView('home');
                await wait(300);
                const st = cm.state();

                return {
                  found: true,
                  plugin: { id: plugin.id, name: plugin.name, status: plugin.statusText },
                  pluginRows,
                  direct,
                  matched,
                  recs: st.recs,
                  pluginRecs: document.querySelectorAll('#home-recs [data-track-id^="p:"]').length,
                };
              })()
            `);
            console.log('SMOKE_PLUGIN:', JSON.stringify(pluginResult));
          } catch (error) {
            console.error('SMOKE_PLUGIN_FAIL:', error.message);
          }
        }

        app.quit();
      }, 5000);
    });
    mainWindow.webContents.once('did-fail-load', (_event, code, description) => {
      console.error(`SMOKE_FAIL: ${code} ${description}`);
      app.exit(1);
    });
  }

  return mainWindow;
}

function openMusicKitWindow() {
  if (musicKitWindow && !musicKitWindow.isDestroyed()) {
    musicKitWindow.focus();
    return true;
  }

  musicKitWindow = new BrowserWindow({
    width: 960,
    height: 780,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#080a0e',
    autoHideMenuBar: true,
    title: 'Apple Music · MusicKit',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  musicKitWindow.loadFile(path.join(ROOT, 'renderer', 'musickit.html'));
  musicKitWindow.on('closed', () => {
    musicKitWindow = null;
  });

  return true;
}

/* ------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------ */

ipcMain.handle('pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Musikordner auswählen',
    properties: ['openDirectory'],
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const folder = result.filePaths[0];
  const files = await walkAudio(folder, [], 0);

  return { folder, files };
});

ipcMain.handle('open-external', async (_event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('get-info', () => ({
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  widevine: widevine ? { version: widevine.version, path: widevine.dir } : null,
}));

ipcMain.handle('clear-service-data', async (_event, id) => {
  if (typeof id !== 'string' || !/^[a-z0-9-]+$/i.test(id)) return false;
  const partition = session.fromPartition(`persist:cm-${id}`);
  await partition.clearStorageData();
  await partition.clearCache();
  return true;
});

ipcMain.handle('open-musickit', () => openMusicKitWindow());

ipcMain.handle('search-catalog', async (_event, query) => {
  const empty = { query: '', tracks: [], errors: [], sources: { apple: 0, deezer: 0 } };
  if (typeof query !== 'string') return empty;

  const term = query.trim().slice(0, 120);
  if (!term) return empty;

  const errors = [];

  const [appleResult, deezerResult] = await Promise.allSettled([
    fetchJson(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}` +
        '&media=music&entity=song&limit=30&country=DE'
    ),
    fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=30`),
  ]);

  let apple = [];
  let deezer = [];

  if (appleResult.status === 'fulfilled') {
    apple = normalizeItunes(appleResult.value);
  } else {
    errors.push({
      source: 'Apple Music',
      message: appleResult.reason ? appleResult.reason.message : 'nicht erreichbar',
    });
  }

  if (deezerResult.status === 'fulfilled') {
    deezer = normalizeDeezer(deezerResult.value);
  } else {
    errors.push({
      source: 'Deezer',
      message: deezerResult.reason ? deezerResult.reason.message : 'nicht erreichbar',
    });
  }

  return {
    query: term,
    tracks: interleaveTracks(apple, deezer).slice(0, 60),
    errors,
    sources: { apple: apple.length, deezer: deezer.length },
  };
});

ipcMain.handle('radio-stations', async (_event, options = {}) => {
  const query =
    typeof options.query === 'string' ? options.query.trim().slice(0, 80) : '';
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
    const json = await fetchJson(
      `https://de1.api.radio-browser.info/json/stations/search?${params.toString()}`,
      15000
    );
    return { stations: normalizeStations(json), error: null };
  } catch (error) {
    return {
      stations: [],
      error: error.message || 'Radio-Verzeichnis nicht erreichbar',
    };
  }
});

ipcMain.handle('top-tracks', async () => {
  try {
    const json = await fetchJson('https://api.deezer.com/chart/0/tracks?limit=30');
    return {
      tracks: normalizeDeezer({ data: json && json.data }).slice(0, 30),
      errors: [],
    };
  } catch (error) {
    return {
      tracks: [],
      errors: [{ source: 'Deezer Charts', message: error.message || 'nicht erreichbar' }],
    };
  }
});

function looseKey(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// A track without a usable preview on its own catalog (e.g. NCS releases on
// Deezer): look up the same title in Apple's catalog, which has the preview.
async function previewBySearch(meta) {
  const title = String((meta && meta.title) || '').trim();
  const artist = String((meta && meta.artist) || '').trim();
  if (!title) return null;

  const params = new URLSearchParams({
    term: `${artist} ${title}`.trim().slice(0, 120),
    media: 'music',
    entity: 'song',
    limit: '8',
    country: 'DE',
  });
  const json = await fetchJson(`https://itunes.apple.com/search?${params}`, 15000);
  const results = json && Array.isArray(json.results) ? json.results : [];

  const titleKey = looseKey(title);
  const titleWord = titleKey.split(' ')[0];
  const artistWord = looseKey(artist).split(' ')[0];
  const exact = results.find(
    (entry) =>
      entry.previewUrl &&
      looseKey(entry.trackName).startsWith(titleKey) &&
      (!artistWord || looseKey(entry.artistName).includes(artistWord))
  );
  const loose = results.find(
    (entry) =>
      entry.previewUrl &&
      looseKey(entry.trackName).includes(titleWord) &&
      (!artistWord || looseKey(entry.artistName).includes(artistWord))
  );
  const hit = exact || loose;
  if (!hit) return null;
  return {
    url: hit.previewUrl,
    artwork: hit.artworkUrl100 ? hit.artworkUrl100.replace('100x100bb', '600x600bb') : '',
  };
}

ipcMain.handle('refresh-preview', async (_event, id, meta) => {
  const value = String(id || '');

  try {
    let url = null;

    let match = value.match(/^deezer:(\d+)$/);
    if (match) {
      const json = await fetchJson(`https://api.deezer.com/track/${match[1]}`);
      url = (json && json.preview) || null;
    }

    match = value.match(/^apple:(\d+)$/);
    if (match) {
      const json = await fetchJson(`https://itunes.apple.com/lookup?id=${match[1]}&country=DE`);
      const hit =
        json && Array.isArray(json.results)
          ? json.results.find((entry) => entry && entry.previewUrl)
          : null;
      url = hit ? hit.previewUrl : null;
    }

    if (!url && meta && typeof meta === 'object') {
      const found = await previewBySearch(meta);
      if (found) return { url: found.url, artwork: found.artwork };
    }
    return { url };
  } catch (error) {
    return { url: null, error: error.message };
  }
});

/* ------------------------------------------------------------------ *
 * Recommendations from favourites
 *
 * Seeds are the user's favourite artists (and favourites that came from
 * an enabled source plugin). Suggestions come from Deezer's public
 * artist radio / related-artist endpoints and – optionally – from the
 * plugin's `related()` for those favourites.
 * ------------------------------------------------------------------ */

async function deezerArtistFor(seed) {
  if (seed.deezerId && /^\d+$/.test(String(seed.deezerId))) {
    return { id: String(seed.deezerId), name: seed.name };
  }

  try {
    const json = await fetchJson(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(seed.name.slice(0, 80))}&limit=1`
    );
    const hit = json && Array.isArray(json.data) ? json.data[0] : null;
    return hit ? { id: String(hit.id), name: hit.name } : null;
  } catch {
    return null;
  }
}

function interleaveLimited(lists, perArtistLimit = 2) {
  const out = [];
  const seen = new Set();
  const perArtist = new Map();
  const max = Math.max(0, ...lists.map((list) => list.length));

  for (let index = 0; index < max; index += 1) {
    for (const list of lists) {
      const track = list[index];
      if (!track) continue;

      const key = `${track.title}|${track.artist}`.toLowerCase();
      if (seen.has(track.id) || seen.has(key)) continue;

      const artistKey = String(track.artist || '').toLowerCase();
      const count = perArtist.get(artistKey) || 0;
      if (count >= perArtistLimit) continue;

      seen.add(track.id);
      seen.add(key);
      perArtist.set(artistKey, count + 1);
      out.push(track);
    }
  }

  return out;
}

ipcMain.handle('recommendations', async (_event, seeds) => {
  const input = seeds && typeof seeds === 'object' ? seeds : {};
  const artistSeeds = (Array.isArray(input.artists) ? input.artists : [])
    .filter((seed) => seed && typeof seed.name === 'string' && seed.name.trim())
    .map((seed) => ({ name: seed.name.trim(), deezerId: seed.deezerId || null }))
    .slice(0, 5);
  // Favourites that came from a source plugin: ask the plugin for related titles.
  const pluginSeeds = (Array.isArray(input.pluginSeeds) ? input.pluginSeeds : [])
    .filter((seed) => seed && readyPlugin(seed.id, 'related'))
    .slice(0, 3)
    .map((seed) => ({
      id: String(seed.id),
      refIds: (Array.isArray(seed.refIds) ? seed.refIds : []).map((ref) => cleanText(ref, 200)).slice(0, 2),
    }));
  const errors = [];

  const resolved = await Promise.all(artistSeeds.map(deezerArtistFor));
  const seedArtists = [];
  for (const artist of resolved) {
    if (artist && !seedArtists.some((known) => known.id === artist.id)) seedArtists.push(artist);
  }

  const pluginTask = Promise.allSettled(
    pluginSeeds.flatMap((seed) =>
      seed.refIds.map(async (refId) => ({
        pluginId: seed.id,
        items: cleanItems(await readyPlugin(seed.id, 'related').module.related(refId, 12)),
      }))
    )
  );

  const perSeed = await Promise.all(
    seedArtists.map(async (artist) => {
      const [radio, related] = await Promise.allSettled([
        fetchJson(`https://api.deezer.com/artist/${artist.id}/radio?limit=15`),
        fetchJson(`https://api.deezer.com/artist/${artist.id}/related?limit=5`),
      ]);

      return {
        radio: radio.status === 'fulfilled' ? normalizeDeezer(radio.value) : [],
        related:
          related.status === 'fulfilled' && related.value && Array.isArray(related.value.data)
            ? related.value.data
            : [],
      };
    })
  );

  const seedIds = new Set(seedArtists.map((artist) => artist.id));
  const relatedArtists = [];
  for (let index = 0; index < 5; index += 1) {
    for (const seed of perSeed) {
      const artist = seed.related[index];
      if (!artist || !artist.id) continue;
      const id = String(artist.id);
      if (seedIds.has(id) || relatedArtists.some((known) => String(known.id) === id)) continue;
      relatedArtists.push(artist);
    }
  }

  const relatedTop = await Promise.all(
    relatedArtists.slice(0, 8).map(async (artist) => {
      try {
        return normalizeDeezer(
          await fetchJson(`https://api.deezer.com/artist/${artist.id}/top?limit=3`)
        );
      } catch {
        return [];
      }
    })
  );

  const pluginItems = [];
  for (const result of await pluginTask) {
    if (result.status === 'fulfilled') {
      for (const item of result.value.items) {
        const known = pluginItems.some(
          (entry) => entry.pluginId === result.value.pluginId && entry.id === item.id
        );
        if (!known) pluginItems.push({ ...item, pluginId: result.value.pluginId });
      }
    } else {
      errors.push({ source: 'Plugin', message: result.reason ? result.reason.message : '' });
    }
  }

  if (artistSeeds.length && !seedArtists.length) {
    errors.push({ source: 'Deezer', message: 'Keine passenden Artists gefunden' });
  }

  return {
    tracks: interleaveLimited([...perSeed.map((seed) => seed.radio), ...relatedTop]).slice(0, 40),
    pluginItems: pluginItems.slice(0, 20),
    seeds: seedArtists.map((artist) => artist.name),
    errors,
  };
});

/* ------------------------------------------------------------------ *
 * Cutter mode: music and sound effects for videos
 *
 * - NCS: the official NoCopyrightSounds playlists on Deezer (previews).
 * - Free music / sound effects: Openverse (Creative Commons search by
 *   the WordPress foundation) – Jamendo music, Freesound effects, each
 *   with license and ready-made attribution text.
 * ------------------------------------------------------------------ */

ipcMain.handle('creator-playlist', async (_event, playlistId) => {
  const id = String(playlistId || '');
  if (!/^\d{1,20}$/.test(id)) return { tracks: [], error: 'Ungültige Playlist' };

  try {
    const json = await fetchJson(`https://api.deezer.com/playlist/${id}/tracks?limit=100`, 15000);
    // NCS tracks on Deezer often carry no preview – the renderer resolves one at play time.
    return { tracks: normalizeDeezer({ data: json && json.data }, { requirePreview: false }), error: null };
  } catch (error) {
    return { tracks: [], error: error.message || 'Deezer nicht erreichbar' };
  }
});

function licenseLabel(license, version) {
  const key = String(license || '').toLowerCase();
  if (key === 'cc0') return 'CC0';
  if (key === 'pdm') return 'Public Domain';
  return `CC ${key.toUpperCase()}${version ? ` ${version}` : ''}`.trim();
}

const OPENVERSE_SOURCES = {
  freesound: 'Freesound',
  jamendo: 'Jamendo',
  ccmixter: 'ccMixter',
  wikimedia_audio: 'Wikimedia',
};

ipcMain.handle('creator-openverse', async (_event, options) => {
  const input = options && typeof options === 'object' ? options : {};
  const kind = input.kind === 'sfx' ? 'sfx' : 'music';
  const query = String(input.query || '').trim().slice(0, 80);
  const page = Math.max(1, Math.min(10, Number(input.page) || 1));
  if (!query) return { items: [], error: null, more: false };

  const params = new URLSearchParams({
    q: query,
    license: 'cc0,by',
    page_size: '20', // anonymous Openverse limit
    page: String(page),
  });
  if (kind === 'sfx') {
    params.set('source', 'freesound');
    params.set('length', 'short');
  } else {
    params.set('category', 'music');
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await net.fetch(`https://api.openverse.org/v1/audio/?${params}`, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': `CleanMusic/${app.getVersion()} (desktop music app)` },
    });
    clearTimeout(timer);

    if (response.status === 429) {
      return {
        items: [],
        more: false,
        error: 'Openverse-Limit erreicht (ohne Konto ca. 200 Anfragen am Tag). Später erneut versuchen.',
      };
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const items = (Array.isArray(json.results) ? json.results : [])
      .filter((item) => item && /^https:\/\//i.test(item.url || ''))
      .map((item) => ({
        id: `ov:${item.id}`,
        source: item.source || 'openverse',
        sourceLabel: OPENVERSE_SOURCES[item.source] || item.source || 'Openverse',
        title: cleanText(item.title || 'Unbekannt', 200),
        artist: cleanText(item.creator || '', 120),
        duration: Math.round((Number(item.duration) || 0) / 1000),
        url: item.url,
        link: cleanUrl(item.foreign_landing_url),
        artwork: kind === 'music' ? cleanUrl(item.thumbnail, /^https:\/\//i) : '',
        license: licenseLabel(item.license, item.license_version),
        licenseUrl: cleanUrl(item.license_url),
        credit: cleanText(item.attribution || '', 600),
        tags: (Array.isArray(item.tags) ? item.tags : [])
          .map((tag) => cleanText(tag && tag.name, 30))
          .filter(Boolean)
          .slice(0, 4),
      }));

    return { items, more: page < (Number(json.page_count) || 1), error: null };
  } catch (error) {
    return { items: [], more: false, error: friendlyNetError(error).message || 'Openverse nicht erreichbar' };
  }
});

ipcMain.handle('copy-text', (_event, text) => {
  if (typeof text !== 'string' || !text) return false;
  clipboard.writeText(text.slice(0, 20000));
  return true;
});

/* ------------------------------------------------------------------ *
 * Optional Discord Rich Presence
 * ------------------------------------------------------------------ */

const presence = new DiscordPresence();

function discordConfig() {
  const stored = readConfig().discord;
  const config = stored && typeof stored === 'object' ? stored : {};
  return {
    enabled: Boolean(config.enabled),
    clientId: String(config.clientId || ''),
    showArtwork: config.showArtwork !== false,
  };
}

presence.onChange = (status) => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('discord-status', status);
};

ipcMain.handle('discord-get', () => ({ config: discordConfig(), status: presence.status() }));

ipcMain.handle('discord-set', (_event, patch) => {
  const input = patch && typeof patch === 'object' ? patch : {};
  const next = { ...discordConfig() };
  if ('enabled' in input) next.enabled = Boolean(input.enabled);
  if ('clientId' in input) next.clientId = String(input.clientId || '').replace(/\D/g, '').slice(0, 25);
  if ('showArtwork' in input) next.showArtwork = Boolean(input.showArtwork);
  writeConfig({ discord: next });
  presence.configure(next);
  return { config: next, status: presence.status() };
});

ipcMain.on('discord-update', (_event, track) => {
  if (!track || typeof track !== 'object') {
    presence.clear();
    return;
  }
  presence.update({
    title: cleanText(track.title, 200),
    artist: cleanText(track.artist, 200),
    album: cleanText(track.album, 200),
    source: cleanText(track.source, 60),
    artwork: cleanUrl(track.artwork, /^https:\/\//i),
    link: cleanUrl(track.link, /^https:\/\//i),
    linkLabel: cleanText(track.linkLabel, 32),
    playing: Boolean(track.playing),
    live: Boolean(track.live),
    position: Number(track.position) || 0,
    duration: Number(track.duration) || 0,
  });
});

/* ------------------------------------------------------------------ *
 * Config (main process only)
 * ------------------------------------------------------------------ */

function configFile() {
  return path.join(app.getPath('userData'), 'cleanmusic-config.json');
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configFile(), 'utf8')) || {};
  } catch {
    return {};
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  try {
    fs.mkdirSync(path.dirname(configFile()), { recursive: true });
    fs.writeFileSync(configFile(), JSON.stringify(next, null, 2));
  } catch {
    /* read-only profile – keep it in memory only */
  }
  return next;
}

/* ------------------------------------------------------------------ *
 * Plugins
 *
 * CleanMusic ships without plugins. A plugin is a single .js file the
 * user puts into a plugin folder; it is only loaded after the user
 * enabled it in the settings. Plugins run in the main process with full
 * Node access – exactly like an app the user installs – so nothing is
 * loaded implicitly.
 *
 * API v1 (all optional except id/name):
 *   apiVersion, id, name, version, description, notice, help, links,
 *   source: { id, label }, actions: [{ id, label, when }],
 *   setup(ctx), dispose(), status(refresh), runAction(id),
 *   search(query), resolve(refId, force), match(track, force),
 *   related(refId, limit)
 * ------------------------------------------------------------------ */

const PLUGIN_ID = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const plugins = new Map(); // id -> { id, file, dir, module, error }

function pluginDirs() {
  const dirs = [path.join(app.getPath('userData'), 'plugins')];
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    dirs.push(path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'plugins'));
  }
  if (!app.isPackaged) dirs.push(path.join(ROOT, 'plugins'));
  return Array.from(new Set(dirs));
}

function pluginConfig() {
  const config = readConfig();
  const stored = config.plugins && typeof config.plugins === 'object' ? config.plugins : {};
  const data = stored.data && typeof stored.data === 'object' ? stored.data : {};

  return {
    enabled: Array.isArray(stored.enabled) ? stored.enabled.filter((id) => PLUGIN_ID.test(id)) : [],
    data,
  };
}

function savePluginConfig(next) {
  writeConfig({ plugins: next });
}

function discoverPlugins() {
  try {
    fs.mkdirSync(pluginDirs()[0], { recursive: true });
  } catch {
    /* ignore */
  }

  const found = new Map();
  for (const dir of pluginDirs()) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile() || !/\.js$/i.test(entry.name) || /^[._]/.test(entry.name)) continue;
      const id = entry.name.replace(/\.js$/i, '').toLowerCase();
      if (!PLUGIN_ID.test(id) || found.has(id)) continue;
      found.set(id, { id, file: path.join(dir, entry.name), dir });
    }
  }

  for (const [id, plugin] of plugins) {
    if (!found.has(id)) {
      unloadPlugin(plugin);
      plugins.delete(id);
    }
  }

  for (const [id, info] of found) {
    const known = plugins.get(id);
    if (known && known.file === info.file) continue;
    if (known) unloadPlugin(known);
    plugins.set(id, { ...info, module: null, error: null });
  }
}

function pluginContext(id) {
  return {
    apiVersion: 1,
    appVersion: app.getVersion(),
    platform: process.platform,
    userAgent: app.userAgentFallback,
    // Chromium's network stack – the same one the <audio> element uses.
    fetch: (url, options) => net.fetch(url, options),
    config: {
      get: () => Object.assign({}, pluginConfig().data[id]),
      set: (patch) => {
        const current = pluginConfig();
        current.data[id] = Object.assign({}, current.data[id], patch);
        savePluginConfig(current);
      },
    },
    pickFile: async (options = {}) => {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: String(options.title || 'Datei auswählen'),
        properties: ['openFile'],
        filters: Array.isArray(options.filters) ? options.filters : [],
      });
      return result.canceled || !result.filePaths.length ? null : result.filePaths[0];
    },
    log: (...args) => {
      if (isDev || isSmoke) console.log(`[plugin:${id}]`, ...args);
    },
  };
}

function loadPlugin(plugin) {
  if (plugin.module) return Promise.resolve(plugin);
  if (!plugin.loading) {
    plugin.loading = loadPluginNow(plugin).finally(() => {
      plugin.loading = null;
    });
  }
  return plugin.loading;
}

async function loadPluginNow(plugin) {
  try {
    delete require.cache[require.resolve(plugin.file)];
    const mod = require(plugin.file);
    if (!mod || typeof mod !== 'object') throw new Error('Plugin exportiert kein Objekt');
    if (mod.apiVersion !== 1) throw new Error('Nicht unterstützte Plugin-API (erwartet apiVersion 1)');
    if (typeof mod.setup === 'function') await mod.setup(pluginContext(plugin.id));
    plugin.module = mod;
    plugin.error = null;
  } catch (error) {
    plugin.module = null;
    plugin.error = error.message || String(error);
  }

  return plugin;
}

function unloadPlugin(plugin) {
  if (!plugin || !plugin.module) return;
  try {
    if (typeof plugin.module.dispose === 'function') plugin.module.dispose();
  } catch {
    /* ignore */
  }
  try {
    delete require.cache[require.resolve(plugin.file)];
  } catch {
    /* ignore */
  }
  plugin.module = null;
}

async function loadEnabledPlugins() {
  discoverPlugins();
  const { enabled } = pluginConfig();
  await Promise.all(
    Array.from(plugins.values())
      .filter((plugin) => enabled.includes(plugin.id))
      .map(loadPlugin)
  );
}

function readyPlugin(id, capability) {
  const plugin = plugins.get(String(id || ''));
  if (!plugin || !plugin.module) return null;
  if (capability && typeof plugin.module[capability] !== 'function') return null;
  return plugin;
}

function cleanText(value, max = 300) {
  return String(value == null ? '' : value).slice(0, max);
}

function cleanUrl(value, pattern = /^https?:\/\//i) {
  const url = String(value || '');
  return pattern.test(url) ? url : '';
}

function cleanItems(items) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.id != null)
    .slice(0, 50)
    .map((item) => ({
      id: cleanText(item.id, 200),
      title: cleanText(item.title || 'Unbekannt'),
      artist: cleanText(item.artist || item.channel || ''),
      duration: Number(item.duration) || 0,
      artwork: cleanUrl(item.artwork, /^https:\/\//i),
      link: cleanUrl(item.link),
    }));
}

function cleanStream(stream) {
  const url = cleanUrl(stream && stream.url);
  if (!url) throw new Error('Plugin hat keine abspielbare URL geliefert');
  return {
    refId: cleanText(stream.refId || stream.id || '', 200),
    url,
    duration: Number(stream.duration) || 0,
    title: cleanText(stream.title || ''),
    artist: cleanText(stream.artist || ''),
    artwork: cleanUrl(stream.artwork, /^https:\/\//i),
  };
}

async function pluginInfo(plugin, enabled, refresh) {
  const mod = plugin.module;
  let status = null;

  if (mod && typeof mod.status === 'function') {
    try {
      const raw = (await mod.status(Boolean(refresh))) || {};
      status = {
        ready: Boolean(raw.ready),
        text: cleanText(raw.text || ''),
        detail: cleanText(raw.detail || '', 600),
        flags: raw.flags && typeof raw.flags === 'object' ? { ...raw.flags } : {},
      };
    } catch (error) {
      status = { ready: false, text: 'Status-Fehler', detail: cleanText(error.message), flags: {} };
    }
  } else if (mod) {
    status = { ready: true, text: 'Bereit', detail: '', flags: {} };
  }

  return {
    id: plugin.id,
    file: plugin.file,
    enabled,
    loaded: Boolean(mod),
    error: plugin.error,
    name: cleanText((mod && mod.name) || `${plugin.id}.js`, 80),
    version: cleanText((mod && mod.version) || '', 30),
    description: cleanText((mod && mod.description) || '', 600),
    help: cleanText((mod && mod.help) || '', 800),
    notice: cleanText((mod && mod.notice) || '', 800),
    source:
      mod && mod.source && mod.source.label
        ? { id: cleanText(mod.source.id || plugin.id, 40), label: cleanText(mod.source.label, 40) }
        : { id: plugin.id, label: cleanText((mod && mod.name) || plugin.id, 40) },
    links: (mod && Array.isArray(mod.links) ? mod.links : [])
      .map((link) => ({ label: cleanText(link && link.label, 60), url: cleanUrl(link && link.url) }))
      .filter((link) => link.label && link.url)
      .slice(0, 4),
    actions: (mod && Array.isArray(mod.actions) ? mod.actions : [])
      .filter((action) => action && action.id && action.label)
      .map((action) => ({
        id: cleanText(action.id, 40),
        label: cleanText(action.label, 60),
        when: action.when ? cleanText(action.when, 40) : null,
      }))
      .slice(0, 6),
    capabilities: {
      search: Boolean(mod && typeof mod.search === 'function'),
      resolve: Boolean(mod && typeof mod.resolve === 'function'),
      match: Boolean(mod && typeof mod.match === 'function'),
      related: Boolean(mod && typeof mod.related === 'function'),
    },
    status,
  };
}

let pluginBoot = Promise.resolve();

async function pluginList(refresh = false) {
  await pluginBoot;
  if (refresh) await loadEnabledPlugins();
  const { enabled } = pluginConfig();
  const list = await Promise.all(
    Array.from(plugins.values()).map((plugin) =>
      pluginInfo(plugin, enabled.includes(plugin.id), refresh)
    )
  );
  return { dirs: pluginDirs(), plugins: list };
}

ipcMain.handle('plugins-list', async (_event, refresh) => pluginList(Boolean(refresh)));

ipcMain.handle('plugin-set-enabled', async (_event, id, enabled) => {
  discoverPlugins();
  const plugin = plugins.get(String(id || ''));
  if (!plugin) return pluginList(false);

  const config = pluginConfig();
  config.enabled = config.enabled.filter((known) => known !== plugin.id);
  if (enabled) config.enabled.push(plugin.id);
  savePluginConfig(config);

  if (enabled) await loadPlugin(plugin);
  else unloadPlugin(plugin);

  return pluginList(false);
});

ipcMain.handle('plugin-action', async (_event, id, actionId) => {
  const plugin = readyPlugin(id, 'runAction');
  let result = {};

  if (plugin) {
    try {
      const raw = (await plugin.module.runAction(String(actionId || ''))) || {};
      result = { message: raw.message ? cleanText(raw.message) : null, error: null };
    } catch (error) {
      result = { message: null, error: cleanText(error.message || String(error)) };
    }
  }

  return Object.assign(result, await pluginList(false));
});

ipcMain.handle('plugin-open-folder', async () => {
  const dir = pluginDirs()[0];
  fs.mkdirSync(dir, { recursive: true });
  const error = await shell.openPath(dir);
  return { dir, error: error || null };
});

ipcMain.handle('plugin-search', async (_event, id, query) => {
  const plugin = readyPlugin(id, 'search');
  if (!plugin) return { results: [], error: 'Plugin nicht aktiv' };
  if (typeof query !== 'string' || !query.trim()) return { results: [], error: null };

  try {
    return { results: cleanItems(await plugin.module.search(query.trim().slice(0, 120))), error: null };
  } catch (error) {
    return { results: [], error: cleanText(error.message || String(error)) };
  }
});

ipcMain.handle('plugin-resolve', async (_event, id, refId, force) => {
  const plugin = readyPlugin(id, 'resolve');
  if (!plugin) return { ok: false, error: 'Plugin nicht aktiv' };

  try {
    const stream = cleanStream(await plugin.module.resolve(String(refId || ''), Boolean(force)));
    return { ok: true, stream };
  } catch (error) {
    return { ok: false, error: cleanText(error.message || String(error)) };
  }
});

ipcMain.handle('plugin-match', async (_event, id, track) => {
  const plugin = readyPlugin(id, 'match');
  if (!plugin) return { ok: false, error: 'Plugin nicht aktiv' };
  const input = track && typeof track === 'object' ? track : {};

  try {
    const stream = cleanStream(
      await plugin.module.match(
        {
          title: cleanText(input.title),
          artist: cleanText(input.artist),
          album: cleanText(input.album),
          duration: Number(input.duration) || 0,
        },
        Boolean(input.force)
      )
    );
    return { ok: true, stream };
  } catch (error) {
    return { ok: false, error: cleanText(error.message || String(error)) };
  }
});

/* ------------------------------------------------------------------ *
 * App lifecycle
 * ------------------------------------------------------------------ */

app.on('web-contents-created', (_event, contents) => {
  contents.setBackgroundThrottling(false);

  if (contents.getType() === 'webview') {
    // OAuth / login popups inside an embedded player stay in the app.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) return { action: 'allow' };
      return { action: 'deny' };
    });
  }
});

app.whenReady().then(() => {
  if (!hasInstanceLock) return;
  Menu.setApplicationMenu(null);
  pluginBoot = loadEnabledPlugins().catch((error) => console.error('Plugins:', error.message));
  createMainWindow();
  if (!isSmoke) presence.configure(discordConfig());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => presence.shutdown());
