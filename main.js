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
  nativeImage,
  Tray,
  screen,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { DiscordPresence } = require('./discord-rpc');

const ROOT = __dirname;
const isDev = process.argv.includes('--dev');
const isSmoke = process.argv.includes('--smoke');
const isSmokePlugin = process.argv.includes('--smoke-plugin');
const isSmokeObs = process.argv.includes('--smoke-obs');
const isSmokeStreamerbot = process.argv.includes('--smoke-streamerbot');
// Updater test: pretend to be 0.0.1 and download the latest release into a
// throwaway folder (never replaces anything, never restarts).
const UPDATE_TEST = isSmoke && process.argv.includes('--smoke-update');
if (UPDATE_TEST && process.platform === 'win32') {
  process.env.PORTABLE_EXECUTABLE_DIR = path.join(app.getPath('temp'), 'cleanmusic-update-test');
  process.env.PORTABLE_EXECUTABLE_FILE = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'CleanMusic-0.0.1-portable.exe');
  fs.mkdirSync(process.env.PORTABLE_EXECUTABLE_DIR, { recursive: true });
}

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
  app.on('second-instance', () => showMainWindow());
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

// Last window size/position – only reused if it is still on a connected screen.
function savedBounds() {
  if (isSmoke) return null;
  const stored = readConfig().window;
  if (!stored || typeof stored !== 'object') return null;
  const bounds = {
    x: Math.round(Number(stored.x)),
    y: Math.round(Number(stored.y)),
    width: Math.round(Number(stored.width)),
    height: Math.round(Number(stored.height)),
  };
  if (!Object.values(bounds).every(Number.isFinite) || bounds.width < 1024 || bounds.height < 640) return null;
  try {
    const area = screen.getDisplayMatching(bounds).workArea;
    const visibleX = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const visibleY = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    if (visibleX < 200 || visibleY < 120) return null;
  } catch {
    return null;
  }
  return Object.assign(bounds, { maximized: Boolean(stored.maximized) });
}

function rememberBounds() {
  if (isSmoke || !mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
  const maximized = mainWindow.isMaximized();
  const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
  writeConfig({ window: Object.assign({}, bounds, { maximized }) });
}

function createMainWindow() {
  const bounds = savedBounds();
  mainWindow = new BrowserWindow({
    width: bounds ? bounds.width : 1380,
    height: bounds ? bounds.height : 880,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 1024,
    minHeight: 640,
    icon: path.join(ROOT, 'renderer', 'assets', 'icon.png'),
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
    if (bounds && bounds.maximized) mainWindow.maximize();
    if (!isSmoke) mainWindow.show();
  });

  let boundsTimer = null;
  const scheduleBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(rememberBounds, 600);
  };
  ['resize', 'move', 'maximize', 'unmaximize'].forEach((name) => mainWindow.on(name, scheduleBounds));
  mainWindow.on('close', () => {
    clearTimeout(boundsTimer);
    rememberBounds();
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

  // The shell is a single page and never navigates itself. Block every
  // navigation – including file:// (a file dropped onto the window would
  // otherwise replace the whole UI) – and send web links to the browser.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
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
            logo: (document.querySelector('.brand .logo') || {}).naturalWidth || 0,
            themes: (() => {
              const cm = window.CleanMusic;
              const start = cm.theme().id;
              const ids = cm.theme().themes;
              const applied = ids.filter((id) => {
                cm.setTheme(id);
                return cm.theme().id === id && cm.theme().accent.startsWith('#');
              }).length;
              cm.setTheme(start);
              return { count: ids.length, applied, active: cm.theme().id, bg: cm.theme().bg };
            })(),
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

          // Volume: perceptual curve, mute key, wheel, boost engine (stays on
          // for the radio test below, so radio runs through Web Audio too).
          const volumeResult = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const cm = window.CleanMusic;
              const audio = document.querySelector('#audio');
              cm.setVolume(0.5);
              const half = cm.volume();
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
              const muted = cm.volume();
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
              document.querySelector('#volume').dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
              const wheel = cm.volume().level;
              const boost = document.querySelector('#opt-boost');
              boost.checked = true;
              boost.dispatchEvent(new Event('change', { bubbles: true }));
              cm.setVolume(1.4);
              const t0 = audio.currentTime;
              await wait(1200);
              const boosted = cm.volume();
              const result = {
                half: { element: half.element, label: half.label, stage: half.stage },
                muted: { muted: muted.muted, stage: muted.stage, label: muted.label },
                wheel,
                boosted: { level: boosted.level, element: boosted.element, engine: boosted.engine, label: boosted.label },
                over: document.querySelector('#volume').classList.contains('over'),
                advancing: audio.currentTime > t0,
                signal: window.CMVisualizer.signal(),
              };
              boost.checked = false;
              boost.dispatchEvent(new Event('change', { bubbles: true }));
              result.afterBoostOff = cm.volume().level;
              cm.setVolume(0.8);
              return result;
            })()
          `);
          console.log('SMOKE_VOLUME:', JSON.stringify(volumeResult));

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
                engine: window.CMVisualizer.hasEngine(),
                signal: window.CMVisualizer.signal(),
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

        // Downloads ("Nur Cutting") into a throwaway folder – never the real music folder.
        try {
          const dlDir = path.join(app.getPath('temp'), 'cleanmusic-smoke-downloads');
          fs.rmSync(dlDir, { recursive: true, force: true });
          const dlResult = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              cm.setCreator('ncs', 'top');
              await wait(400);
              const offButtons = document.querySelectorAll('#view-creator [data-act="download"]').length;
              cm.setDownloads('cutting', ${JSON.stringify(dlDir)});
              const ncsButtons = document.querySelectorAll('#view-creator [data-act="download"]').length;
              cm.setCreator('classics', 'lustig');
              for (let i = 0; i < 40 && cm.creator().items === 0; i += 1) await wait(250);
              await wait(300);
              const classicButtons = document.querySelectorAll('#view-creator [data-act="download"]').length;
              const result = await cm.downloadAt('creator', 0);
              await wait(300);
              const done = document.querySelectorAll('#view-creator [data-dl-file]').length;
              cm.setDownloads('off', '');
              return {
                offButtons, ncsButtons, classicButtons,
                ok: Boolean(result && result.ok), name: result && result.name,
                error: result && result.error, size: result && result.size,
                done, state: cm.downloads(),
              };
            })()
          `);
          const files = fs.existsSync(dlDir) ? fs.readdirSync(dlDir, { recursive: true }) : [];
          dlResult.files = files.map(String);
          console.log('SMOKE_DOWNLOAD:', JSON.stringify(dlResult));
          fs.rmSync(dlDir, { recursive: true, force: true });
        } catch (error) {
          console.error('SMOKE_DOWNLOAD_FAIL:', error.message);
        }

        // Creator services (0.11): sidebar, cutter buttons, session downloads
        // into a throwaway cutting folder.
        try {
          const creatorDir = path.join(app.getPath('temp'), 'cleanmusic-smoke-creator');
          fs.rmSync(creatorDir, { recursive: true, force: true });
          creatorDownloadFolder = creatorDir;
          const ses = session.fromPartition('persist:cm-epidemic');
          ses.downloadURL('https://incompetech.com/music/royalty-free/mp3-royaltyfree/Fluffing%20a%20Duck.mp3');
          ses.downloadURL('https://example.com/');
          const target = path.join(creatorDir, 'Epidemic Sound');
          let files = [];
          for (let i = 0; i < 60; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            files = fs.existsSync(target) ? fs.readdirSync(target) : [];
            if (files.some((name) => name.endsWith('.mp3')) && files.some((name) => name.endsWith('.txt'))) break;
          }
          const ui = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              cm.setCreator('classics', 'lustig');
              await new Promise((resolve) => setTimeout(resolve, 400));
              return {
                services: cm.creatorServices.services(),
                sidebar: document.querySelectorAll('#creator-nav [data-service]').length,
                musicSidebar: document.querySelectorAll('#service-nav [data-service]').length,
                cutterButtons: document.querySelectorAll('#view-creator .creator-tabs [data-creator-service]').length,
                aboList: document.querySelectorAll('#creator-credits .abo-list li').length,
                listed: cm.creatorServices.downloads().map((item) => item.service + ': ' + item.name),
                homeCards: document.querySelectorAll('#view-home .service-card').length,
              };
            })()
          `);
          const note = files.find((name) => name.endsWith('.txt'));
          ui.files = files;
          ui.licenseNote = note ? fs.readFileSync(path.join(target, note), 'utf8').includes('Abo') : false;
          creatorDownloadFolder = '';
          console.log('SMOKE_CREATOR_SERVICES:', JSON.stringify(ui));
          fs.rmSync(creatorDir, { recursive: true, force: true });
        } catch (error) {
          console.error('SMOKE_CREATOR_SERVICES_FAIL:', error.message);
        }

        // Home: new releases, listening history, "Wiederentdecken".
        try {
          const homeResult = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              cm.showView('home');
              cm.setTrend('releases');
              for (let i = 0; i < 60 && !cm.home().releases && !cm.home().releasesError; i += 1) await wait(300);
              await wait(200);
              const releases = cm.home();
              cm.setTrend('charts');
              const first = document.querySelector('#home-charts [data-list="charts"]');
              const id = first ? first.dataset.trackId : null;
              const recorded = id ? cm.recordPlay(id, 3, 15) : false;
              await wait(200);
              const after = cm.home();
              return {
                releases: releases.releases,
                releaseCards: releases.releaseCards,
                releasesError: releases.releasesError,
                recorded,
                history: cm.history().length,
                rediscover: after.rediscover,
                rediscoverHidden: after.rediscoverHidden,
                recSeeds: after.recSeeds,
              };
            })()
          `);
          console.log('SMOKE_HOME:', JSON.stringify(homeResult));
        } catch (error) {
          console.error('SMOKE_HOME_FAIL:', error.message);
        }

        // Windows media overlay + backup import (merge, nothing deleted).
        try {
          const extrasResult = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const before = cm.state().favorites;
              const counts = await cm.importBackup({
                app: 'CleanMusic',
                kind: 'backup',
                format: 1,
                collection: {
                  favorites: [{ id: 'radio:smoke-backup', kind: 'radio', title: 'Backup-Sender', url: 'https://example.invalid/stream' }],
                  playlists: [{ id: 'pl-smoke-backup', name: 'Aus dem Backup', items: [] }],
                },
                credits: [{ id: 'smoke-credit', title: 'T', credit: 'Credit-Text' }],
                history: [],
                settings: { theme: 'nacht' },
              });
              const rejected = await cm.importBackup({ app: 'Other' });
              cm.sleep('30');
              const sleepOn = cm.sleep();
              document.querySelector('#btn-sleep').click();
              const sleepMenu = document.querySelectorAll('#ctx-menu [data-sleep]').length;
              document.querySelector('#ctx-menu [data-sleep="off"]').click();
              const sleepOff = cm.sleep();
              cm.setTone(4, 2);
              await new Promise((resolve) => setTimeout(resolve, 600));
              const tone = cm.volume().engine;
              const toneUi = document.querySelector('#opt-bass-value') ? document.querySelector('#opt-bass-value').textContent : null;
              cm.setTone(0, 0);
              return {
                tone: { bass: tone && tone.bass, treble: tone && tone.treble, label: toneUi },
                sleep: { on: sleepOn, menu: sleepMenu, off: sleepOff },
                creditsText: cm.creditsText().split('\\n').length,
                media: cm.mediaSession(),
                counts,
                rejected,
                favorites: { before, after: cm.state().favorites },
                playlists: cm.state().playlists.length,
              };
            })()
          `);
          console.log('SMOKE_EXTRAS:', JSON.stringify(extrasResult));
          console.log('SMOKE_TRAY:', JSON.stringify({ tray: Boolean(tray && !tray.isDestroyed()), state: trayKey }));
          const updateResult = await smokeUpdate();
          updateResult.ui = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              cm.showView('settings');
              await new Promise((resolve) => setTimeout(resolve, 300));
              const before = cm.update();
              cm.showUpdate({ status: 'available', current: '0.9.0', latest: '9.9.9', notes: 'Test', installable: true, asset: { name: 'x', size: 1048576 }, auto: true });
              const shown = cm.update().card;
              const buttons = Array.from(document.querySelectorAll('#update-card [data-update]')).map((b) => b.dataset.update);
              document.querySelector('#update-card [data-update="later"]').click();
              const hidden = !cm.update().card;
              cm.showUpdate(before.info);
              return { panel: before.panel, status: before.status, shown, buttons, hidden };
            })()
          `);
          console.log('SMOKE_UPDATE:', JSON.stringify(updateResult));

          // Queue + autoplay: a search hit plays alone, suggestions follow,
          // queued titles come first.
          const queueResult = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              cm.showView('search');
              await wait(300);
              const row = document.querySelector('#view-search .song-row[data-list="search"]');
              if (!row) return { found: false };
              row.click();
              await wait(600);
              const single = cm.queue();
              for (let i = 0; i < 60 && cm.queue().length < 2; i += 1) await wait(300);
              const auto = cm.queue();
              cm.enqueueAt('charts', 0, 'next');
              cm.enqueueAt('charts', 1, 'end');
              cm.enqueueAt('charts', 2, 'next');
              const queued = cm.queue();
              const order = queued.items.slice(queued.index + 1, queued.index + 4).map((item) => item.title);
              cm.toggleQueue(true);
              await wait(200);
              const panel = {
                rows: document.querySelectorAll('#queue-panel .queue-row').length,
                labels: Array.from(document.querySelectorAll('#queue-panel .queue-label')).map((el) => el.textContent.trim().split(' ·')[0]),
              };
              const chartsTitles = Array.from(document.querySelectorAll('#home-charts [data-list="charts"]')).slice(0, 3).map((el) => el.getAttribute('title'));
              cm.next();
              await wait(1500);
              const afterNext = cm.queue();
              row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
              const menu = Array.from(document.querySelectorAll('#ctx-menu [data-ctx-queue]')).map((el) => el.dataset.ctxQueue);
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
              document.body.click();
              cm.toggleQueue(false);
              return {
                found: true,
                single: { length: single.length, kind: single.kind },
                autoplay: { length: auto.length, added: auto.items.filter((item) => item.autoplay).length },
                queued: { upcoming: queued.upcoming, index: queued.index, order, flags: queued.items.slice(queued.index + 1, queued.index + 4).map((item) => item.queued) },
                chartsTitles,
                panel,
                afterNext: { current: afterNext.current, queuedLeft: afterNext.items.slice(afterNext.index + 1).filter((item) => item.queued).length },
                menu,
              };
            })()
          `);
          console.log('SMOKE_QUEUE:', JSON.stringify(queueResult));

          // First steps assistant + "what's new" card (0.12).
          const onboardingResult = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const ob = cm.onboarding;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const autoShown = ob.state().open;
              ob.open();
              const steps = [];
              const first = ob.state();
              ob.click('[data-ob-theme="dracula"]');
              const themed = cm.theme().id;
              for (let i = 0; i < 5; i += 1) {
                steps.push(ob.state().title);
                ob.click('[data-ob-action="next"]');
                await wait(50);
              }
              const done = ob.state();
              cm.setTheme('nacht');
              const shown = cm.whatsNew('0.12.0');
              const card = !document.querySelector('#whatsnew-card').hidden;
              document.querySelector('#whatsnew-card [data-whatsnew="ok"]').click();
              const cardClosed = document.querySelector('#whatsnew-card').hidden;
              return {
                autoShownInSmoke: autoShown,
                firstRun: first.firstRun,
                themes: first.themes,
                themed,
                steps,
                options: steps.length,
                closed: !done.open,
                onboarded: done.onboarded,
                whatsNew: shown && card && cardClosed,
              };
            })()
          `);
          console.log('SMOKE_ONBOARDING:', JSON.stringify(onboardingResult));
        } catch (error) {
          console.error('SMOKE_EXTRAS_FAIL:', error.message);
        }

        try {
          const plugins = await mainWindow.webContents.executeJavaScript(
            'window.CleanMusic.plugins()'
          );
          console.log('SMOKE_PLUGINS:', JSON.stringify(plugins));
        } catch (error) {
          console.error('SMOKE_PLUGINS_FAIL:', error.message);
        }

        try {
          const pluginImportUi = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              window.CleanMusic.showView('settings');
              const syntheticDrop = await window.cm.pluginImportDropped(
                new File(['test'], 'synthetic-plugin.js', { type: 'text/javascript' })
              );
              return {
                addButton: Boolean(document.querySelector('[data-plugin-global="add"]')),
                dropTarget: Boolean(document.querySelector('#plugins-panel')),
                rejectsUnselectedFile: Boolean(syntheticDrop && syntheticDrop.error),
              };
            })()
          `);
          console.log('SMOKE_PLUGIN_IMPORT_UI:', JSON.stringify(pluginImportUi));
        } catch (error) {
          console.error('SMOKE_PLUGIN_IMPORT_UI_FAIL:', error.message);
        }

        try {
          const sourceFile = path.join(app.getPath('temp'), 'cleanmusic-smoke-import.js');
          const copiedFile = path.join(pluginDirs()[0], path.basename(sourceFile));
          fs.writeFileSync(sourceFile, "module.exports = { apiVersion: 1, name: 'Smoke-Import' };\n");
          const imported = await importPluginFile(sourceFile);
          const refreshed = await pluginList(true);
          const added = refreshed.plugins.find((plugin) => plugin.id === 'cleanmusic-smoke-import');
          console.log(
            'SMOKE_PLUGIN_IMPORT:',
            JSON.stringify({
              copied: Boolean(imported.ok && fs.existsSync(copiedFile)),
              found: Boolean(added),
              enabled: Boolean(added && added.enabled),
              loaded: Boolean(added && added.loaded),
            })
          );
          const smokePlugin = plugins.get('cleanmusic-smoke-import');
          if (smokePlugin) unloadPlugin(smokePlugin);
          plugins.delete('cleanmusic-smoke-import');
          fs.rmSync(copiedFile, { force: true });
          discoverPlugins();
          fs.rmSync(sourceFile, { force: true });
        } catch (error) {
          console.error('SMOKE_PLUGIN_IMPORT_FAIL:', error.message);
        }

        // Optional: the OBS overlay plugin from extras/ (API v2 end to end).
        if (isSmokeObs) {
          try {
            console.log('SMOKE_OBS:', JSON.stringify(await smokeObsPlugin()));
          } catch (error) {
            console.error('SMOKE_OBS_FAIL:', error.message);
          }
        }

        // Optional: the Streamer.bot plugin from extras/ (Fetch-URL commands).
        if (isSmokeStreamerbot) {
          try {
            console.log('SMOKE_STREAMERBOT:', JSON.stringify(await smokeStreamerbotPlugin()));
          } catch (error) {
            console.error('SMOKE_STREAMERBOT_FAIL:', error.message);
          }
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

                // Plugin charts on the home page (only if the plugin offers them).
                let charts = null;
                if (cm.home().pluginChartsTab) {
                  cm.setTrend('plugin');
                  for (let i = 0; i < 120 && !cm.home().pluginCharts && !cm.home().pluginChartsError; i += 1) await wait(500);
                  charts = {
                    items: cm.home().pluginCharts,
                    cards: document.querySelectorAll('#home-charts [data-list="pcharts"]').length,
                    error: cm.home().pluginChartsError,
                  };
                  cm.setTrend('charts');
                }

                return {
                  found: true,
                  plugin: { id: plugin.id, name: plugin.name, status: plugin.statusText },
                  pluginRows,
                  direct,
                  matched,
                  recs: st.recs,
                  pluginRecs: document.querySelectorAll('#home-recs [data-track-id^="p:"]').length,
                  charts,
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
  version: app.getVersion(),
  smoke: isSmoke,
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

// New releases (Deezer editorial): first playable track of each album.
ipcMain.handle('new-releases', async () => {
  try {
    // 'releases' is sometimes empty – the editors' selection of new albums is the fallback.
    let json = await fetchJson('https://api.deezer.com/editorial/0/releases?limit=18');
    if (!json || !Array.isArray(json.data) || !json.data.length) {
      json = await fetchJson('https://api.deezer.com/editorial/0/selection?limit=18');
    }
    const albums = (json && Array.isArray(json.data) ? json.data : []).slice(0, 18);
    const tracks = await Promise.all(
      albums.map(async (album) => {
        try {
          const list = await fetchJson(`https://api.deezer.com/album/${album.id}/tracks?limit=4`);
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

/* ------------------------------------------------------------------ *
 * Downloads – only "Nur Cutting": freely licensed audio from the cutter
 * mode (CC0, CC BY, Public Domain) from known free-music hosts, always
 * with a credit file next to it. Streams and previews are never offered.
 * ------------------------------------------------------------------ */

const DOWNLOAD_LICENSE = /^(cc0|public domain|cc by(?: [0-9.]+)?)$/i;
const DOWNLOAD_HOSTS = ['incompetech.com', 'freesound.org', 'jamendo.com', 'ccmixter.org', 'wikimedia.org'];
const DOWNLOAD_TYPES = {
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/flac': '.flac',
  'audio/x-flac': '.flac',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
};
const downloadedFiles = new Set();

function defaultDownloadDir() {
  return path.join(app.getPath('music'), 'CleanMusic Cutting');
}

function downloadBase(folder) {
  const custom = typeof folder === 'string' ? folder.trim() : '';
  return custom && path.isAbsolute(custom) ? custom : defaultDownloadDir();
}

function safeName(value, fallback) {
  const name = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[. ]+|[. ]+$/g, '')
    .slice(0, 110);
  return name || fallback;
}

function allowedDownloadHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DOWNLOAD_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

ipcMain.handle('cutting-default-folder', () => defaultDownloadDir());

ipcMain.handle('cutting-download', async (_event, input) => {
  const item = input && typeof input === 'object' ? input : {};
  const url = cleanUrl(item.url);
  const license = cleanText(item.license, 40);
  if (!url || !allowedDownloadHost(url)) return { error: 'Diese Quelle ist für Downloads nicht freigegeben.' };
  if (!DOWNLOAD_LICENSE.test(license)) return { error: 'Nur CC0, CC BY und Public Domain können heruntergeladen werden.' };

  const base = downloadBase(item.folder);
  const folder = path.join(base, safeName(item.category, 'Cutting'));
  const stem = safeName(item.artist ? `${item.artist} - ${item.title}` : item.title, 'Titel');

  try {
    fs.mkdirSync(folder, { recursive: true });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 180000);
    const response = await net.fetch(url, { signal: controller.signal });
    if (!response.ok) {
      clearTimeout(timer);
      throw new Error(`HTTP ${response.status}`);
    }
    const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const fromUrl = (path.extname(new URL(url).pathname) || '').toLowerCase();
    const extension =
      DOWNLOAD_TYPES[type] || (/^\.(mp3|ogg|wav|flac|m4a|aac)$/.test(fromUrl) ? fromUrl : '');
    if (!extension) {
      clearTimeout(timer);
      throw new Error('Keine Audiodatei');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    clearTimeout(timer);
    if (buffer.length > 250 * 1024 * 1024) throw new Error('Datei zu groß');

    let file = path.join(folder, stem + extension);
    let existed = false;
    if (fs.existsSync(file)) {
      if (fs.statSync(file).size === buffer.length) existed = true;
      else {
        let n = 2;
        while (fs.existsSync(path.join(folder, `${stem} (${n})${extension}`))) n += 1;
        file = path.join(folder, `${stem} (${n})${extension}`);
      }
    }
    if (!existed) fs.writeFileSync(file, buffer);

    const credit = [
      `Titel: ${cleanText(item.title, 200)}`,
      item.artist ? `Von: ${cleanText(item.artist, 200)}` : '',
      `Lizenz: ${license}${item.licenseUrl ? ` (${cleanUrl(item.licenseUrl)})` : ''}`,
      item.link ? `Quelle: ${cleanUrl(item.link)}` : '',
      '',
      'Credit für deine Videobeschreibung:',
      cleanText(item.credit || '', 800) || `"${cleanText(item.title, 200)}" – ${cleanText(item.artist, 200)} (${license})`,
      '',
      `Heruntergeladen mit CleanMusic am ${new Date().toLocaleDateString('de-DE')}.`,
    ]
      .filter((line, index, lines) => line !== '' || (lines[index - 1] && lines[index - 1] !== ''))
      .join('\r\n');
    fs.writeFileSync(file.replace(/\.[^.]+$/, '') + '.txt', credit + '\r\n', 'utf8');

    downloadedFiles.add(file);
    return { ok: true, path: file, name: path.basename(file), folder, existed, size: buffer.length };
  } catch (error) {
    const message = error.name === 'AbortError' ? 'Zeitüberschreitung' : friendlyNetError(error).message || error.message;
    return { error: `Download fehlgeschlagen: ${message}` };
  }
});

function knownDownload(file) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return null;
  const resolved = path.resolve(file);
  if (!/\.(mp3|ogg|wav|flac|m4a|aac|aiff?|zip)$/i.test(resolved)) return null;
  return fs.existsSync(resolved) ? resolved : null;
}

/* ------------------------------------------------------------------ *
 * Creator services (Epidemic Sound, Artlist): their official web apps
 * run embedded like every other service. Files the user downloads there
 * with the official download buttons (their subscription licence) are
 * saved into the cutting folder instead of asking where to put them.
 * Nothing is fetched past the web app; other services are unchanged.
 * ------------------------------------------------------------------ */

const CREATOR_SERVICES = {
  epidemic: { label: 'Epidemic Sound', site: 'https://www.epidemicsound.com' },
  artlist: { label: 'Artlist', site: 'https://artlist.io' },
};
const CREATOR_FILES = /\.(mp3|wav|aiff?|flac|m4a|aac|ogg|zip)$/i;
let creatorDownloadFolder = '';

ipcMain.handle('creator-downloads-config', (_event, config) => {
  creatorDownloadFolder = config && typeof config.folder === 'string' ? config.folder : '';
  return { folder: downloadBase(creatorDownloadFolder) };
});

function creatorLicenseNote(service, file) {
  return [
    `Datei: ${path.basename(file)}`,
    `Quelle: ${service.label} (${service.site})`,
    `Heruntergeladen mit CleanMusic über dein ${service.label}-Konto am ${new Date().toLocaleDateString('de-DE')}.`,
    '',
    `Lizenz: Die Nutzung ist über dein ${service.label}-Abo lizenziert – es gelten dessen Nutzungsbedingungen.`,
    'Wichtig: Kanäle (YouTube, Twitch, …) ggf. im Konto des Dienstes verknüpfen bzw. freischalten,',
    'damit es keine Copyright-Meldungen gibt. Ohne aktives Abo endet die Lizenz für neue Projekte.',
  ].join('\r\n');
}

function wireCreatorDownloads() {
  Object.entries(CREATOR_SERVICES).forEach(([id, service]) => {
    const partition = session.fromPartition(`persist:cm-${id}`);
    partition.on('will-download', (event, item) => {
      const original = item.getFilename() || 'download';
      if (!CREATOR_FILES.test(original)) {
        event.preventDefault();
        sendToRenderer('creator-download', {
          service: service.label,
          state: 'blocked',
          name: cleanText(original, 120),
          error: 'Nur Audio-Dateien (und ZIP mit Stems) werden gespeichert.',
        });
        return;
      }

      const extension = path.extname(original).toLowerCase();
      const stem = safeName(path.basename(original, path.extname(original)), 'Download');
      const folder = path.join(downloadBase(creatorDownloadFolder), service.label);
      try {
        fs.mkdirSync(folder, { recursive: true });
      } catch {
        event.preventDefault();
        sendToRenderer('creator-download', { service: service.label, state: 'failed', name: original, error: 'Ordner nicht beschreibbar.' });
        return;
      }
      let file = path.join(folder, stem + extension);
      for (let n = 2; fs.existsSync(file); n += 1) file = path.join(folder, `${stem} (${n})${extension}`);
      item.setSavePath(file);
      sendToRenderer('creator-download', { service: service.label, state: 'started', name: path.basename(file) });

      item.once('done', (_event, state) => {
        if (state !== 'completed') {
          sendToRenderer('creator-download', { service: service.label, state: 'failed', name: path.basename(file), error: state });
          return;
        }
        try {
          fs.writeFileSync(file.replace(/\.[^.]+$/, '') + ' – Lizenz.txt', creatorLicenseNote(service, file) + '\r\n', 'utf8');
        } catch {
          /* the file itself is what matters */
        }
        downloadedFiles.add(file);
        sendToRenderer('creator-download', {
          service: service.label,
          state: 'completed',
          name: path.basename(file),
          path: file,
        });
      });
    });
  });
}

// Drag a downloaded file straight into a video editor.
ipcMain.on('cutting-drag', (event, file) => {
  const resolved = knownDownload(file);
  if (!resolved) return;
  try {
    const icon = nativeImage.createFromPath(path.join(ROOT, 'renderer', 'assets', 'icon.png')).resize({ width: 48 });
    event.sender.startDrag({ file: resolved, icon });
  } catch {
    /* ignore */
  }
});

ipcMain.handle('cutting-reveal', (_event, file) => {
  const resolved = knownDownload(file);
  if (!resolved) return false;
  shell.showItemInFolder(resolved);
  return true;
});

ipcMain.handle('cutting-exists', (_event, files) =>
  (Array.isArray(files) ? files : []).slice(0, 500).map((file) => Boolean(knownDownload(file)))
);

ipcMain.handle('cutting-open-folder', async (_event, folder) => {
  const target = downloadBase(folder);
  try {
    fs.mkdirSync(target, { recursive: true });
  } catch {
    return 'Ordner konnte nicht angelegt werden.';
  }
  return shell.openPath(target);
});

/* Backup: favourites, playlists, credits, history, appearance as JSON. */
ipcMain.handle('backup-save', async (_event, text) => {
  if (typeof text !== 'string' || text.length > 30 * 1024 * 1024) return { error: 'Ungültige Daten' };
  const stamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'CleanMusic-Daten sichern',
    defaultPath: path.join(app.getPath('documents'), `CleanMusic-Backup-${stamp}.json`),
    filters: [{ name: 'CleanMusic-Backup', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  try {
    fs.writeFileSync(result.filePath, text, 'utf8');
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('credits-save', async (_event, text) => {
  if (typeof text !== 'string' || !text.trim() || text.length > 2 * 1024 * 1024) return { error: 'Keine Credits' };
  const stamp = new Date().toISOString().slice(0, 10);
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Video-Credits speichern',
    defaultPath: path.join(app.getPath('documents'), `CleanMusic-Credits-${stamp}.txt`),
    filters: [{ name: 'Text', extensions: ['txt'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  try {
    fs.writeFileSync(result.filePath, text.replace(/\r?\n/g, '\r\n'), 'utf8');
    return { ok: true, path: result.filePath };
  } catch (error) {
    return { error: error.message };
  }
});

ipcMain.handle('backup-open', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'CleanMusic-Backup öffnen',
    defaultPath: app.getPath('documents'),
    properties: ['openFile'],
    filters: [{ name: 'CleanMusic-Backup', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  try {
    const file = result.filePaths[0];
    if (fs.statSync(file).size > 30 * 1024 * 1024) return { error: 'Datei zu groß' };
    return { ok: true, data: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (error) {
    return { error: `Backup nicht lesbar: ${error.message}` };
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

// Theme colours for the native window controls.
ipcMain.on('set-titlebar', (_event, colors) => {
  const hex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
  if (!colors || !hex(colors.color) || !hex(colors.symbolColor)) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.setTitleBarOverlay({ color: colors.color, symbolColor: colors.symbolColor, height: 40 });
    mainWindow.setBackgroundColor(colors.color);
  } catch {
    /* not supported on this platform */
  }
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

/* Smoke test for the updater (npm run smoke / smoke:update). */
async function smokeUpdate() {
  const versions = [
    isNewerVersion('0.9.1', '0.9.0'),
    isNewerVersion('v1.0.0', '0.9.9'),
    !isNewerVersion('0.9.0', '0.9.0'),
    !isNewerVersion('0.8.9', '0.9.0'),
    !isNewerVersion('kaputt', '0.9.0'),
  ].every(Boolean);
  const fakeTarget = { kind: 'portable', file: 'x', dir: 'y', pattern: /^CleanMusic-[0-9.]+-portable\.exe$/i };
  const picked = pickUpdateAsset(
    {
      assets: [
        { name: 'CleanMusic-9.9.9.AppImage', browser_download_url: 'https://github.com/a/b/c.AppImage' },
        { name: 'CleanMusic-9.9.9-portable.exe', browser_download_url: 'https://evil.example/x.exe' },
        { name: 'CleanMusic-9.9.9-portable.exe', size: 5, digest: 'sha256:' + 'a'.repeat(64), browser_download_url: 'https://github.com/a/b/x.exe' },
      ],
    },
    fakeTarget
  );
  const assetOk = Boolean(picked && picked.url === 'https://github.com/a/b/x.exe' && picked.sha256 === 'a'.repeat(64));

  const checked = await checkForUpdates();
  const result = {
    versions,
    assetOk,
    status: checked.status,
    latest: checked.latest,
    current: checked.current,
    error: checked.error,
  };

  if (UPDATE_TEST) {
    // Pretend to be 0.0.1 → the latest release is "new"; download it into a throwaway folder.
    result.available = checked.status === 'available';
    result.asset = checked.asset;
    if (result.available) {
      const started = Date.now();
      const done = await downloadUpdate();
      result.download = {
        status: done.status,
        error: done.error,
        seconds: Math.round((Date.now() - started) / 1000),
        file: done.file ? path.basename(done.file) : null,
        size: done.file && fs.existsSync(done.file) ? fs.statSync(done.file).size : 0,
        verified: Boolean(updateState.asset && updateState.asset.sha256),
      };
      fs.rmSync(path.dirname(process.env.PORTABLE_EXECUTABLE_FILE), { recursive: true, force: true });
    }
  }
  return result;
}

/* Smoke test for extras/plugins/streamerbot.js (npm run smoke:streamerbot). */
async function smokeStreamerbotPlugin() {
  const http = require('node:http');
  const port = 4797;
  const target = path.join(pluginDirs()[0], 'streamerbot.js');
  fs.copyFileSync(path.join(ROOT, 'extras', 'plugins', 'streamerbot.js'), target);

  const stored = readConfig().pluginSettings || {};
  writeConfig({ pluginSettings: Object.assign({}, stored, { streamerbot: { port } }) });
  discoverPlugins();
  const config = pluginConfig();
  config.enabled = config.enabled.filter((id) => id !== 'streamerbot').concat('streamerbot');
  savePluginConfig(config);
  const plugin = plugins.get('streamerbot');
  await loadPlugin(plugin);

  const js = (code) => mainWindow.webContents.executeJavaScript(code);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const get = (pathname, host) =>
    new Promise((resolve) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: pathname, headers: host ? { Host: host } : {} },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => resolve({ status: res.statusCode, body }));
        }
      );
      req.on('error', (error) => resolve({ status: 0, body: error.message }));
      req.end();
    });

  const token = (pluginConfig().data.streamerbot || {}).token || '';
  await js("(async () => { const a = document.querySelector('#audio'); if (a.paused) document.querySelector('#btn-play').click(); return true; })()");
  await wait(1200);
  const before = await js('window.CleanMusic.playerSnapshot()');
  const song = await get('/song');
  const json = await get('/nowplaying.json');
  const noToken = await get('/skip');
  const badToken = await get('/skip?token=' + 'x'.repeat(24));
  const foreign = await get('/song', 'evil.example');
  const skip = await get('/skip?token=' + token);
  const spam = await get('/pause?token=' + token);
  await wait(2800);
  const after = await js('window.CleanMusic.playerSnapshot()');
  const pause = await get('/pause?token=' + token);
  await wait(700);
  const paused = await js("document.querySelector('#audio').paused");
  await wait(2200);
  const resume = await get('/pause?token=' + token);
  await wait(900);
  const resumed = await js("!document.querySelector('#audio').paused");

  await js("window.cm.pluginSettingsSet('streamerbot', { control: false })");
  await wait(2600);
  const blocked = await get('/skip?token=' + token);
  const info = (await pluginList(false)).plugins.find((entry) => entry.id === 'streamerbot');

  const cleanup = pluginConfig();
  cleanup.enabled = cleanup.enabled.filter((id) => id !== 'streamerbot');
  savePluginConfig(cleanup);
  unloadPlugin(plugin);
  plugins.delete('streamerbot');
  fs.rmSync(target, { force: true });
  discoverPlugins();
  await wait(300);
  const closed = await get('/song');

  return {
    loaded: !plugin.error,
    error: plugin.error,
    token: /^[a-f0-9]{24}$/.test(token),
    song: song.status === 200 && before.track ? song.body.includes(before.track.title) : song.body,
    json: json.status === 200 ? JSON.parse(json.body).title === (before.track && before.track.title) : json.status,
    noToken: noToken.status,
    badToken: badToken.status,
    foreignHost: foreign.status,
    skip: skip.status,
    skipped: Boolean(before.track && after.track && before.track.id !== after.track.id),
    spamLimit: spam.status,
    pause: [pause.status, pause.body],
    paused,
    resume: [resume.status, resume.body],
    resumed,
    blockedWhenOff: blocked.status,
    status: info && info.status ? info.status.text : null,
    fields: info && info.settings ? info.settings.fields.length : 0,
    closedAfterUnload: closed.status === 0,
  };
}

/* Smoke test for extras/plugins/obs-overlay.js (npm run smoke:obs). */
async function smokeObsPlugin() {
  const http = require('node:http');
  const port = 4798;
  const textDir = path.join(app.getPath('temp'), 'cleanmusic-smoke-obs');
  fs.rmSync(textDir, { recursive: true, force: true });
  const target = path.join(pluginDirs()[0], 'obs-overlay.js');
  fs.copyFileSync(path.join(ROOT, 'extras', 'plugins', 'obs-overlay.js'), target);

  const stored = readConfig().pluginSettings || {};
  writeConfig({
    pluginSettings: Object.assign({}, stored, { 'obs-overlay': { port, textFiles: true, folder: textDir } }),
  });
  discoverPlugins();
  const config = pluginConfig();
  config.enabled = config.enabled.filter((id) => id !== 'obs-overlay').concat('obs-overlay');
  savePluginConfig(config);
  const plugin = plugins.get('obs-overlay');
  await loadPlugin(plugin);

  const js = (code) => mainWindow.webContents.executeJavaScript(code);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const get = (pathname, host) =>
    new Promise((resolve) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: pathname, headers: host ? { Host: host } : {} },
        (res) => {
          let body = '';
          res.on('data', (chunk) => {
            body += chunk;
            if (pathname === '/events' && body.includes('\n\n')) req.destroy();
          });
          res.on('end', () => resolve({ status: res.statusCode, body }));
          res.on('close', () => resolve({ status: res.statusCode, body }));
        }
      );
      req.on('error', (error) => resolve({ status: 0, body: error.message }));
      req.end();
    });

  // Something playing: the earlier steps leave a title in the player.
  await js("window.CleanMusic.setVolume(0.7); true");
  await wait(1500);
  const snapshot = await js('window.CleanMusic.playerSnapshot()');
  const json = await get('/nowplaying.json');
  const data = json.status === 200 ? JSON.parse(json.body) : null;
  const overlay = await get('/overlay?style=bar');
  const foreign = await get('/nowplaying.json', 'evil.example');
  const events = await get('/events');

  sendPlayerCommand('pause');
  await wait(700);
  const pausedByCommand = await js("document.querySelector('#audio').paused");
  sendPlayerCommand('play');
  await wait(1200);
  const playingAgain = await js("!document.querySelector('#audio').paused");

  const settingsResult = await js("window.cm.pluginSettingsSet('obs-overlay', { style: 'minimal' })");
  const info = (settingsResult.plugins || []).find((entry) => entry.id === 'obs-overlay');
  const after = await get('/nowplaying.json');
  const files = fs.existsSync(path.join(textDir, 'nowplaying.txt'))
    ? fs.readFileSync(path.join(textDir, 'nowplaying.txt'), 'utf8')
    : null;

  // Clean up: switch off, remove, port must be free again.
  const cleanup = pluginConfig();
  cleanup.enabled = cleanup.enabled.filter((id) => id !== 'obs-overlay');
  savePluginConfig(cleanup);
  unloadPlugin(plugin);
  plugins.delete('obs-overlay');
  fs.rmSync(target, { force: true });
  discoverPlugins();
  await wait(300);
  const closed = await get('/nowplaying.json');

  return {
    loaded: !plugin.error,
    error: plugin.error,
    snapshotTitle: snapshot && snapshot.track ? snapshot.track.title : null,
    json: json.status,
    title: data && data.track ? data.track.title : null,
    colors: data && data.track ? data.track.colors.length : 0,
    overlay: overlay.status === 200 && overlay.body.includes('Now Playing'),
    foreignHost: foreign.status,
    events: events.body.startsWith('retry:') && events.body.includes('data: {'),
    pausedByCommand,
    playingAgain,
    status: info && info.status ? info.status.text : null,
    fields: info && info.settings ? info.settings.fields.length : 0,
    style: info && info.settings ? info.settings.values.style : null,
    styleServed: after.status === 200 ? JSON.parse(after.body).style : null,
    textFile: files,
    closedAfterUnload: closed.status === 0,
  };
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
 *
 * API v2 adds (v1 plugins keep working unchanged):
 *   settings: [{ id, label, type, default, ... }] – fields CleanMusic
 *     shows in the plugin card; onSettings(values) is called on change
 *   onEvent(type, player) – 'nowplaying' | 'state' | 'volume'
 *   charts(limit) + chartsLabel – a top list for the home page
 *   ctx.player (state + play/pause/next/previous/volume), ctx.settings,
 *   ctx.copyText, ctx.openExternal, ctx.openPath, ctx.notify,
 *   ctx.refresh, ctx.dataDir, ctx.getPath
 * See docs/PLUGIN-API.md.
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
  const dataDir = path.join(app.getPath('userData'), 'plugin-data', id);
  return {
    apiVersion: 2,
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

    // --- API v2 ---
    dataDir,
    getPath: (name) => {
      const allowed = ['documents', 'music', 'pictures', 'videos', 'downloads', 'temp'];
      return allowed.includes(name) ? app.getPath(name) : dataDir;
    },
    settings: {
      get: () => pluginSettingValues(id),
    },
    player: {
      state: () => JSON.parse(JSON.stringify(playerState)),
      play: () => sendPlayerCommand('play'),
      pause: () => sendPlayerCommand('pause'),
      toggle: () => sendPlayerCommand('toggle'),
      next: () => sendPlayerCommand('next'),
      previous: () => sendPlayerCommand('previous'),
      setVolume: (level) => sendPlayerCommand('volume', Number(level)),
      setMuted: (muted) => sendPlayerCommand('mute', Boolean(muted)),
    },
    copyText: (text) => clipboard.writeText(String(text == null ? '' : text).slice(0, 10000)),
    openExternal: (url) => {
      const target = String(url || '');
      if (!/^https?:\/\//i.test(target)) return false;
      shell.openExternal(target);
      return true;
    },
    openPath: async (target) => {
      const resolved = path.resolve(String(target || ''));
      try {
        if (!fs.statSync(resolved).isDirectory()) return 'Nur Ordner können geöffnet werden.';
      } catch {
        return 'Ordner nicht gefunden.';
      }
      return shell.openPath(resolved);
    },
    notify: (text) => {
      const plugin = plugins.get(id);
      const name = plugin && plugin.module && plugin.module.name ? plugin.module.name : id;
      sendToRenderer('plugin-notify', { id, name: cleanText(name, 80), text: cleanText(text, 300) });
    },
    refresh: () => sendToRenderer('plugins-changed', { id }),
  };
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

/* --- Player state for plugins (API v2) ------------------------------ */

const playerState = {
  track: null, // { id, title, artist, album, source, kind, artwork, link, license, colors }
  playing: false,
  position: 0,
  duration: 0,
  live: false,
  volume: 1,
  muted: false,
  at: Date.now(),
};

function sendPlayerCommand(command, value) {
  sendToRenderer('player-command', { command, value });
  return true;
}

function emitPluginEvent(type) {
  const snapshot = JSON.parse(JSON.stringify(playerState));
  for (const plugin of plugins.values()) {
    if (!plugin.module || typeof plugin.module.onEvent !== 'function') continue;
    try {
      const result = plugin.module.onEvent(type, snapshot);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      /* a plugin error must never break playback */
    }
  }
}

function cleanColors(colors) {
  return (Array.isArray(colors) ? colors : [])
    .filter((color) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))
    .slice(0, 2);
}

ipcMain.on('player-state', (_event, raw) => {
  if (!raw || typeof raw !== 'object') return;
  const track =
    raw.track && typeof raw.track === 'object'
      ? {
          id: cleanText(raw.track.id, 200),
          title: cleanText(raw.track.title, 200),
          artist: cleanText(raw.track.artist, 200),
          album: cleanText(raw.track.album, 200),
          source: cleanText(raw.track.source, 60),
          kind: cleanText(raw.track.kind, 20),
          artwork: cleanUrl(raw.track.artwork, /^https:\/\//i),
          link: cleanUrl(raw.track.link),
          license: cleanText(raw.track.license, 60),
          colors: cleanColors(raw.track.colors),
        }
      : null;

  const trackChanged = JSON.stringify(track) !== JSON.stringify(playerState.track);
  const volumeChanged =
    Number(raw.volume) !== playerState.volume || Boolean(raw.muted) !== playerState.muted;

  playerState.track = track;
  playerState.playing = Boolean(raw.playing);
  playerState.position = Math.max(0, Number(raw.position) || 0);
  playerState.duration = Math.max(0, Number(raw.duration) || 0);
  playerState.live = Boolean(raw.live);
  playerState.volume = Math.min(1.5, Math.max(0, Number(raw.volume) || 0));
  playerState.muted = Boolean(raw.muted);
  playerState.at = Date.now();

  updateTray();
  if (trackChanged) emitPluginEvent('nowplaying');
  if (volumeChanged) emitPluginEvent('volume');
  emitPluginEvent('state');
});

/* --- Plugin settings fields (API v2) -------------------------------- */

const SETTING_TYPES = ['text', 'number', 'toggle', 'select', 'folder'];

function pluginSettingFields(mod) {
  return (mod && Array.isArray(mod.settings) ? mod.settings : [])
    .filter((field) => field && PLUGIN_ID.test(String(field.id || '').toLowerCase()) && SETTING_TYPES.includes(field.type))
    .slice(0, 12)
    .map((field) => ({
      id: String(field.id),
      type: field.type,
      label: cleanText(field.label || field.id, 80),
      help: cleanText(field.help || '', 300),
      placeholder: cleanText(field.placeholder || '', 80),
      min: Number.isFinite(Number(field.min)) ? Number(field.min) : null,
      max: Number.isFinite(Number(field.max)) ? Number(field.max) : null,
      options: (Array.isArray(field.options) ? field.options : [])
        .filter((option) => option && option.value != null)
        .slice(0, 20)
        .map((option) => ({ value: cleanText(option.value, 60), label: cleanText(option.label || option.value, 60) })),
      default: field.default,
    }));
}

function coerceSetting(field, value) {
  switch (field.type) {
    case 'toggle':
      return Boolean(value);
    case 'number': {
      let number = Number(value);
      if (!Number.isFinite(number)) number = Number(field.default) || 0;
      if (field.min != null) number = Math.max(field.min, number);
      if (field.max != null) number = Math.min(field.max, number);
      return number;
    }
    case 'select': {
      const text = String(value == null ? '' : value);
      return field.options.some((option) => option.value === text) ? text : String(field.default == null ? '' : field.default);
    }
    default:
      return cleanText(value == null ? '' : value, 400);
  }
}

function pluginSettingValues(id) {
  const plugin = plugins.get(id);
  const fields = pluginSettingFields(plugin && (plugin.module || plugin.candidate));
  const config = readConfig();
  const stored =
    config.pluginSettings && typeof config.pluginSettings === 'object' && config.pluginSettings[id]
      ? config.pluginSettings[id]
      : {};
  const values = {};
  fields.forEach((field) => {
    values[field.id] = coerceSetting(field, field.id in stored ? stored[field.id] : field.default);
  });
  return values;
}

ipcMain.handle('plugin-pick-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Ordner auswählen',
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled || !result.filePaths.length ? null : result.filePaths[0];
});

ipcMain.handle('plugin-settings-set', async (_event, id, patch) => {
  const plugin = readyPlugin(id);
  if (plugin && patch && typeof patch === 'object') {
    const fields = pluginSettingFields(plugin.module);
    const config = readConfig();
    const all = config.pluginSettings && typeof config.pluginSettings === 'object' ? config.pluginSettings : {};
    const current = Object.assign({}, all[plugin.id]);
    fields.forEach((field) => {
      if (field.id in patch) current[field.id] = coerceSetting(field, patch[field.id]);
    });
    writeConfig({ pluginSettings: Object.assign({}, all, { [plugin.id]: current }) });
    if (typeof plugin.module.onSettings === 'function') {
      try {
        await plugin.module.onSettings(pluginSettingValues(plugin.id));
      } catch (error) {
        return Object.assign({ error: cleanText(error.message || String(error)) }, await pluginList(false));
      }
    }
  }
  return pluginList(false);
});

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
    if (mod.apiVersion !== 1 && mod.apiVersion !== 2) {
      throw new Error('Nicht unterstützte Plugin-API (erwartet apiVersion 1 oder 2)');
    }
    // Settings fields must already be readable inside setup().
    plugin.candidate = mod;
    if (typeof mod.setup === 'function') await mod.setup(pluginContext(plugin.id));
    plugin.candidate = null;
    plugin.module = mod;
    plugin.error = null;
  } catch (error) {
    plugin.module = null;
    plugin.candidate = null;
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
    settings: mod
      ? {
          fields: pluginSettingFields(mod).map((field) => ({ ...field, default: undefined })),
          values: pluginSettingValues(plugin.id),
        }
      : { fields: [], values: {} },
    chartsLabel: cleanText((mod && mod.chartsLabel) || '', 40),
    capabilities: {
      charts: Boolean(mod && typeof mod.charts === 'function'),
      events: Boolean(mod && typeof mod.onEvent === 'function'),
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

async function importPluginFile(sourcePath) {
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) {
    return { error: 'Ungültige Dateiauswahl.' };
  }

  const extension = path.extname(sourcePath).toLowerCase();
  const fileName = path.basename(sourcePath);
  const pluginId = path.basename(sourcePath, path.extname(sourcePath)).toLowerCase();
  if (extension !== '.js' || !PLUGIN_ID.test(pluginId)) {
    return { error: 'Wähle eine .js-Datei mit einem gültigen Plugin-Dateinamen.' };
  }

  let stat;
  try {
    stat = fs.lstatSync(sourcePath);
  } catch {
    return { error: 'Die ausgewählte Datei ist nicht mehr verfügbar.' };
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return { error: 'Die Auswahl ist keine reguläre Datei.' };
  }

  const pluginDir = pluginDirs()[0];
  const destination = path.join(pluginDir, fileName);
  if (path.resolve(sourcePath).toLowerCase() === path.resolve(destination).toLowerCase()) {
    return { error: 'Diese Datei liegt bereits im Plugin-Ordner.' };
  }

  try {
    fs.mkdirSync(pluginDir, { recursive: true });
  } catch (error) {
    return { error: `Plugin-Ordner konnte nicht angelegt werden: ${cleanText(error.message)}` };
  }
  const alreadyExists = fs.existsSync(destination);
  if (alreadyExists) {
    const answer = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Plugin-Datei überschreiben?',
      message: `„${fileName}“ liegt bereits im Plugin-Ordner.`,
      detail: 'Möchtest du die Datei überschreiben? Das Plugin wird danach ausgeschaltet.',
      buttons: ['Abbrechen', 'Überschreiben'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (answer.response !== 1) return { canceled: true };
  }

  try {
    fs.copyFileSync(sourcePath, destination);
  } catch (error) {
    return { error: `Plugin-Datei konnte nicht kopiert werden: ${cleanText(error.message)}` };
  }

  const current = plugins.get(pluginId);
  if (current) {
    unloadPlugin(current);
    plugins.delete(pluginId);
  }
  const config = pluginConfig();
  config.enabled = config.enabled.filter((id) => id !== pluginId);
  savePluginConfig(config);
  discoverPlugins();

  return { ok: true, name: fileName, replaced: alreadyExists };
}

ipcMain.handle('plugin-add-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Plugin-Datei hinzufügen',
    properties: ['openFile'],
    filters: [{ name: 'JavaScript-Dateien', extensions: ['js'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return { canceled: true };
  return importPluginFile(result.filePaths[0]);
});

ipcMain.handle('plugin-import-dropped', async (_event, sourcePath) => importPluginFile(sourcePath));

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

// Charts from a plugin (e.g. a top list of its source) for the home page.
ipcMain.handle('plugin-charts', async (_event, id, limit) => {
  const plugin = readyPlugin(id, 'charts');
  if (!plugin) return { items: [], error: 'Plugin nicht aktiv' };
  const count = Math.max(5, Math.min(50, Number(limit) || 30));
  try {
    const items = await Promise.race([
      plugin.module.charts(count),
      new Promise((_resolve, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), 90000)),
    ]);
    return { items: cleanItems(items), error: null };
  } catch (error) {
    return { items: [], error: cleanText(error.message || String(error)) };
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

/* ------------------------------------------------------------------ *
 * Updates
 *
 * On every start (setting, default on) CleanMusic asks the GitHub
 * releases of this project for the latest version. The portable EXE and
 * the AppImage can update themselves: the new file is downloaded next to
 * the current one, checked against size and the SHA-256 digest GitHub
 * publishes, and started after CleanMusic closed. Other installs (e.g.
 * started from the source) only get a link to the release page.
 * ------------------------------------------------------------------ */

const UPDATE_REPO = 'BellocccYT/cleanmusic';
const UPDATE_HOSTS = ['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com'];

let updateState = {
  status: 'idle', // idle | checking | current | available | downloading | ready | error
  current: app.getVersion(),
  latest: null,
  notes: '',
  url: '',
  asset: null,
  progress: 0,
  file: null,
  error: null,
  checkedAt: 0,
};
let updateTask = null;

function parseVersion(value) {
  const match = String(value || '')
    .trim()
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

// What this copy of CleanMusic can replace by itself.
function updateTarget() {
  if (process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_FILE) {
    return {
      kind: 'portable',
      file: process.env.PORTABLE_EXECUTABLE_FILE,
      dir: process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.env.PORTABLE_EXECUTABLE_FILE),
      pattern: /^CleanMusic-[0-9.]+-portable\.exe$/i,
    };
  }
  if (process.platform === 'linux' && process.env.APPIMAGE) {
    return {
      kind: 'appimage',
      file: process.env.APPIMAGE,
      dir: path.dirname(process.env.APPIMAGE),
      pattern: /^CleanMusic-[0-9.]+\.AppImage$/i,
    };
  }
  return null;
}

function updateHostAllowed(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && UPDATE_HOSTS.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function pickUpdateAsset(release, target) {
  if (!target || !release || !Array.isArray(release.assets)) return null;
  const asset = release.assets.find(
    (item) => item && target.pattern.test(String(item.name || '')) && updateHostAllowed(item.browser_download_url)
  );
  if (!asset) return null;
  const digest = /^sha256:[0-9a-f]{64}$/i.test(String(asset.digest || '')) ? String(asset.digest).slice(7).toLowerCase() : null;
  return {
    name: String(asset.name),
    size: Number(asset.size) || 0,
    url: String(asset.browser_download_url),
    sha256: digest,
  };
}

function updateConfig() {
  return { auto: readConfig().updateCheck !== false };
}

function publicUpdate() {
  return Object.assign({}, updateState, {
    installable: Boolean(updateTarget()),
    auto: updateConfig().auto,
    asset: updateState.asset ? { name: updateState.asset.name, size: updateState.asset.size } : null,
  });
}

function sendUpdate() {
  sendToRenderer('update-state', publicUpdate());
}

function setUpdate(patch) {
  updateState = Object.assign({}, updateState, patch);
  sendUpdate();
}

async function checkForUpdates() {
  if (updateTask) return updateTask;
  if (updateState.status === 'downloading' || updateState.status === 'ready') return publicUpdate();

  updateTask = (async () => {
    setUpdate({ status: 'checking', error: null });
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      const response = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
        signal: controller.signal,
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': `CleanMusic/${app.getVersion()} (update check)`,
        },
      });
      clearTimeout(timer);
      if (response.status === 404) {
        setUpdate({ status: 'current', latest: null, checkedAt: Date.now() });
        return publicUpdate();
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const release = await response.json();
      const latest = String(release.tag_name || '').replace(/^v/i, '');
      const current = UPDATE_TEST ? '0.0.1' : app.getVersion();
      const newer = !release.draft && !release.prerelease && isNewerVersion(latest, current);
      setUpdate({
        status: newer ? 'available' : 'current',
        latest: parseVersion(latest) ? latest : null,
        notes: cleanText(release.body || '', 2000),
        url: cleanUrl(release.html_url) || `https://github.com/${UPDATE_REPO}/releases/latest`,
        asset: newer ? pickUpdateAsset(release, updateTarget()) : null,
        checkedAt: Date.now(),
        error: null,
      });
    } catch (error) {
      const message = error.name === 'AbortError' ? 'Zeitüberschreitung' : friendlyNetError(error).message || error.message;
      setUpdate({ status: 'error', error: `Update-Prüfung fehlgeschlagen: ${message}`, checkedAt: Date.now() });
    }
    return publicUpdate();
  })().finally(() => {
    updateTask = null;
  });
  return updateTask;
}

async function downloadUpdate() {
  const target = updateTarget();
  const asset = updateState.asset;
  if (!target || !asset || updateState.status !== 'available') return publicUpdate();

  const dest = path.join(target.dir, asset.name);
  if (path.resolve(dest).toLowerCase() === path.resolve(target.file).toLowerCase()) {
    setUpdate({ status: 'error', error: 'Diese Version läuft bereits.' });
    return publicUpdate();
  }

  setUpdate({ status: 'downloading', progress: 0, error: null });
  const partial = `${dest}.download`;
  try {
    const response = await net.fetch(asset.url, { headers: { 'user-agent': `CleanMusic/${app.getVersion()}` } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.url && !updateHostAllowed(response.url)) throw new Error('Unerwartete Download-Adresse');

    const hash = crypto.createHash('sha256');
    const out = fs.createWriteStream(partial);
    const reader = response.body.getReader();
    let received = 0;
    let lastSent = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      received += chunk.length;
      if (received > 600 * 1024 * 1024) throw new Error('Datei zu groß');
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve));
      if (Date.now() - lastSent > 250) {
        lastSent = Date.now();
        setUpdate({ progress: asset.size ? Math.min(0.99, received / asset.size) : 0 });
      }
    }
    await new Promise((resolve, reject) => out.end((error) => (error ? reject(error) : resolve())));

    if (asset.size && received !== asset.size) throw new Error('Download unvollständig');
    const digest = hash.digest('hex');
    if (asset.sha256 && digest !== asset.sha256) throw new Error('Prüfsumme stimmt nicht – Datei verworfen');

    fs.rmSync(dest, { force: true });
    fs.renameSync(partial, dest);
    if (target.kind === 'appimage') fs.chmodSync(dest, 0o755);
    setUpdate({ status: 'ready', progress: 1, file: dest });
  } catch (error) {
    fs.rmSync(partial, { force: true });
    setUpdate({ status: 'error', error: `Download fehlgeschlagen: ${error.message}` });
  }
  return publicUpdate();
}

function installUpdate() {
  const file = updateState.file;
  if (updateState.status !== 'ready' || !file || !fs.existsSync(file)) return false;
  // The new version starts once this one has fully closed (single-instance lock).
  quitting = true;
  app.relaunch({ execPath: file, args: [] });
  app.quit();
  return true;
}

ipcMain.handle('update-get', () => publicUpdate());
ipcMain.handle('update-check', () => checkForUpdates());
ipcMain.handle('update-download', () => downloadUpdate());
ipcMain.handle('update-install', () => installUpdate());
ipcMain.handle('update-open', () => {
  shell.openExternal(updateState.url || `https://github.com/${UPDATE_REPO}/releases/latest`);
  return true;
});
ipcMain.handle('update-set', (_event, patch) => {
  writeConfig({ updateCheck: Boolean(patch && patch.auto) });
  return publicUpdate();
});

/* ------------------------------------------------------------------ *
 * Tray icon: title in the tooltip, mini controls, optional close-to-tray
 * ------------------------------------------------------------------ */

let tray = null;
let quitting = false;
let trayKey = '';

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function closeToTray() {
  return Boolean(readConfig().closeToTray);
}

function updateTray(force = false) {
  if (!tray || tray.isDestroyed()) return;
  const track = playerState.track;
  const key = JSON.stringify([track && track.title, track && track.artist, playerState.playing]);
  if (!force && key === trayKey) return;
  trayKey = key;

  const line = track ? (track.artist ? `${track.artist} – ${track.title}` : track.title) : '';
  const tooltip = line ? `CleanMusic\n${playerState.playing ? '▶' : '⏸'} ${line}` : 'CleanMusic';
  tray.setToolTip(tooltip.slice(0, 127));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: line ? line.slice(0, 60) : 'Nichts ausgewählt', enabled: false },
      { type: 'separator' },
      {
        label: playerState.playing ? 'Pause' : 'Abspielen',
        enabled: Boolean(track),
        click: () => sendPlayerCommand('toggle'),
      },
      { label: 'Nächster Titel', enabled: Boolean(track), click: () => sendPlayerCommand('next') },
      { label: 'Vorheriger Titel', enabled: Boolean(track), click: () => sendPlayerCommand('previous') },
      { type: 'separator' },
      { label: 'CleanMusic öffnen', click: () => showMainWindow() },
      {
        label: 'Beenden',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
}

function createTray() {
  if (tray) return;
  try {
    const icon = nativeImage
      .createFromPath(path.join(ROOT, 'renderer', 'assets', 'icon.png'))
      .resize({ width: 16, height: 16, quality: 'best' });
    tray = new Tray(icon);
    tray.on('click', () => showMainWindow());
    updateTray(true);
  } catch (error) {
    tray = null;
    console.error('Tray:', error.message);
  }
}

ipcMain.handle('tray-get', () => ({ closeToTray: closeToTray() }));
ipcMain.handle('tray-set', (_event, patch) => {
  const next = Boolean(patch && patch.closeToTray);
  writeConfig({ closeToTray: next });
  return { closeToTray: next };
});

app.whenReady().then(() => {
  if (!hasInstanceLock) return;
  Menu.setApplicationMenu(null);
  pluginBoot = loadEnabledPlugins().catch((error) => console.error('Plugins:', error.message));
  createMainWindow();
  createTray();
  wireCreatorDownloads();
  // Update check on every start (setting "Beim Start nach Updates suchen").
  if (!isSmoke && updateConfig().auto) {
    setTimeout(() => checkForUpdates().catch(() => {}), 4000);
  }
  // Close button → tray (only if the user switched it on).
  // Windows shutting down / logging off must never be blocked by the tray mode.
  mainWindow.on('session-end', () => {
    quitting = true;
  });
  mainWindow.on('close', (event) => {
    if (quitting || isSmoke || !tray || !closeToTray()) return;
    event.preventDefault();
    mainWindow.hide();
  });
  if (!isSmoke) presence.configure(discordConfig());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  quitting = true;
  presence.shutdown();
  if (tray && !tray.isDestroyed()) tray.destroy();
});
