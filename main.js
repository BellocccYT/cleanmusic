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
  globalShortcut,
  safeStorage,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const crypto = require('node:crypto');
const http = require('node:http');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { DiscordPresence } = require('./discord-rpc');
const pluginManifest = require('./lib/plugin-manifest');
const QRCode = require('qrcode');
const { createSocial, createFakeServer } = require('./social-main');

const ROOT = __dirname;
const isDev = process.argv.includes('--dev');
const isSmoke = process.argv.includes('--smoke');
const isSmokePlugin = process.argv.includes('--smoke-plugin');
const isSmokeObs = process.argv.includes('--smoke-obs');
const isSmokeVisualizer = process.argv.includes('--smoke-visualizer');
const isSmokeStreamerbot = process.argv.includes('--smoke-streamerbot');
const isAutostart = process.argv.includes('--autostart');
if (process.platform === 'win32') app.setAppUserModelId('de.cleanmusic.launcher');
// Updater test: pretend to be 0.0.1 and download the latest release into a
// throwaway folder (never replaces anything, never restarts).
const UPDATE_TEST = isSmoke && process.argv.includes('--smoke-update');
// --smoke-update-setup: the same as an installed copy (loads the setup EXE).
const UPDATE_TEST_SETUP = UPDATE_TEST && process.argv.includes('--smoke-update-setup');
const UPDATE_TEST_DIR = path.join(app.getPath('temp'), 'cleanmusic-update-test');
if (UPDATE_TEST) {
  fs.mkdirSync(UPDATE_TEST_DIR, { recursive: true });
  if (process.platform === 'win32' && !UPDATE_TEST_SETUP) {
    process.env.PORTABLE_EXECUTABLE_DIR = UPDATE_TEST_DIR;
    process.env.PORTABLE_EXECUTABLE_FILE = path.join(UPDATE_TEST_DIR, 'CleanMusic-0.0.1-portable.exe');
  }
}

// The smoke test favourites, creates playlists etc. – never in the real profile.
if (isSmoke) {
  const smokeProfile = path.join(app.getPath('temp'), 'cleanmusic-smoke');
  fs.rmSync(smokeProfile, { recursive: true, force: true });
  app.setPath('userData', smokeProfile);

  // A packaged Windows build is a GUI app: console.log has no console to write
  // to, so the release check (`release\win-unpacked\CleanMusic.exe --smoke`)
  // would be silent. Mirror every line into a file next to the smoke profile.
  const smokeLogFile = path.join(app.getPath('temp'), 'cleanmusic-smoke.log');
  try {
    fs.writeFileSync(smokeLogFile, '');
    ['log', 'error', 'warn'].forEach((level) => {
      const original = console[level].bind(console);
      console[level] = (...args) => {
        original(...args);
        try {
          const line = args
            .map((value) => (typeof value === 'string' ? value : JSON.stringify(value)))
            .join(' ');
          fs.appendFileSync(smokeLogFile, `${line}\n`);
        } catch {
          /* logging must never break the smoke run */
        }
      };
    });
  } catch {
    /* no temp dir – the smoke still runs */
  }
}

// One CleanMusic at a time: a second launch (e.g. a double-click on the
// slow-to-unpack portable EXE) only brings the running window to the front
// instead of fighting over the same profile.
const hasInstanceLock = isSmoke || app.requestSingleInstanceLock();
if (!hasInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    showMainWindow();
    handleDeepLinkArgs(argv);
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
        ? track.artworkUrl100.replace('100x100bb', '600x600bb')
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
  const url = (album && (album.cover_xl || album.cover_big || album.cover_medium)) || '';
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

const SPOTIFY_FORMAT_ERROR = 'Spotify hat das Format geändert – bitte den Datei-Import nutzen.';
const SPOTIFY_MAX_TRACKS = 2000;
const SPOTIFY_LINK_TRACK_LIMIT = 100;

function spotifyTrack(track, format = 'embed') {
  if (!track || typeof track !== 'object') return null;
  const title = cleanText(format === 'export' ? track.trackName || track.title : track.title, 300);
  const artist = cleanText(format === 'export' ? track.artistName || track.artist : track.subtitle, 300);
  if (!title) return null;
  const durationMs = Number(format === 'export' ? track.durationMs || track.duration : track.duration);
  return {
    title,
    artist,
    album: cleanText(format === 'export' ? track.albumName || track.album : '', 200),
    durationMs: Number.isFinite(durationMs) && durationMs > 0 ? Math.round(durationMs) : 0,
    isrc: cleanText(track.isrc || (track.attributes && track.attributes.isrc) || '', 20).toUpperCase(),
  };
}

function spotifyPlaylistFromEntity(entity) {
  if (!entity || typeof entity !== 'object' || !Array.isArray(entity.trackList)) {
    throw new Error(SPOTIFY_FORMAT_ERROR);
  }
  const sourceTracks = entity.trackList;
  const tracks = sourceTracks.slice(0, SPOTIFY_MAX_TRACKS).map((track) => spotifyTrack(track)).filter(Boolean);
  const name = cleanText(entity.name || entity.title, 100);
  if (!name || !tracks.length) throw new Error(SPOTIFY_FORMAT_ERROR);
  return {
    name,
    tracks,
    limited: sourceTracks.length > SPOTIFY_MAX_TRACKS || sourceTracks.length >= SPOTIFY_LINK_TRACK_LIMIT,
    limitMessage: sourceTracks.length > SPOTIFY_MAX_TRACKS
      ? 'Import auf 2000 Titel begrenzt.'
      : sourceTracks.length >= SPOTIFY_LINK_TRACK_LIMIT
        ? 'Spotify zeigt über den Link nur 100 Titel – für alle den Datei-Import nutzen.'
        : '',
    error: null,
  };
}

function spotifyPlaylistId(input) {
  const value = String(input || '').trim();
  let id = '';
  const uri = value.match(/^spotify:playlist:([A-Za-z0-9]{6,64})$/i);
  if (uri) id = uri[1];
  else {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com' || url.username || url.password) return '';
      const match = url.pathname.match(/^(?:\/intl-[a-z]{2}(?:-[a-z]{2,4})?)?\/playlist\/([A-Za-z0-9]{6,64})\/?$/i);
      if (match) id = match[1];
    } catch {
      return '';
    }
  }
  return id;
}

function parseSpotifyEmbedHtml(html) {
  const match = String(html || '').match(
    /<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])(?=[^>]*\btype=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) throw new Error(SPOTIFY_FORMAT_ERROR);
  try {
    const data = JSON.parse(match[1]);
    return spotifyPlaylistFromEntity(data && data.props && data.props.pageProps && data.props.pageProps.state && data.props.pageProps.state.data && data.props.pageProps.state.data.entity);
  } catch (error) {
    if (error && error.message === SPOTIFY_FORMAT_ERROR) throw error;
    throw new Error(SPOTIFY_FORMAT_ERROR);
  }
}

async function readResponseTextLimited(response, maxBytes) {
  const declared = Number(response.headers.get('content-length')) || 0;
  if (declared > maxBytes) throw new Error('Die Spotify-Antwort ist größer als 5 MB.');
  if (!response.body || !response.body.getReader) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) throw new Error('Die Spotify-Antwort ist größer als 5 MB.');
    return new TextDecoder().decode(buffer);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error('Die Spotify-Antwort ist größer als 5 MB.');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return new TextDecoder().decode(bytes);
}

async function fetchSpotifyPlaylist(input) {
  const id = spotifyPlaylistId(input);
  if (!id) throw new Error('Bitte einen öffentlichen Spotify-Playlist-Link oder eine spotify:playlist-URI einfügen.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await net.fetch(`https://open.spotify.com/embed/playlist/${encodeURIComponent(id)}`, {
      signal: controller.signal,
      headers: { accept: 'text/html' },
    });
    if (!response.ok) throw new Error(`Spotify antwortet mit HTTP ${response.status}.`);
    if (response.url && new URL(response.url).origin !== 'https://open.spotify.com') {
      throw new Error('Spotify hat auf eine nicht erlaubte Adresse weitergeleitet.');
    }
    return parseSpotifyEmbedHtml(await readResponseTextLimited(response, 5 * 1024 * 1024));
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('Zeitüberschreitung – Spotify antwortet gerade nicht.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseCsvRows(text) {
  const source = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  let delimiter = ',';
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  for (let index = 0; index < firstLine.length; index += 1) {
    const char = firstLine[index];
    if (char === '"' && firstLine[index + 1] === '"' && quoted) index += 1;
    else if (char === '"') quoted = !quoted;
    else if (!quoted && char === ',') commas += 1;
    else if (!quoted && char === ';') semicolons += 1;
  }
  if (semicolons > commas) delimiter = ';';

  const rows = [];
  let row = [];
  let cell = '';
  quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

// Duration as milliseconds (Exportify) or as mm:ss / h:mm:ss (other exporters).
function csvDurationMs(value) {
  const text = String(value || '').trim();
  const clock = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (clock) return ((Number(clock[1] || 0) * 60 + Number(clock[2])) * 60 + Number(clock[3])) * 1000;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function parseSpotifyCsv(text, filename) {
  const rows = parseCsvRows(text);
  if (rows.length < 2) throw new Error('Die CSV-Datei enthält keine Titel.');
  const headers = rows[0].map((header) => String(header || '').trim().toLowerCase());
  const column = (...names) => headers.findIndex((header) => names.includes(header));
  const titleCol = column('track name', 'trackname', 'track title', 'title', 'song', 'song name', 'songname', 'name', 'track');
  const artistCol = column('artist name(s)', 'artist name', 'artistname', 'artist', 'artists');
  if (titleCol < 0 || artistCol < 0) throw new Error('CSV-Kopfzeile nicht erkannt. Benötigt werden Titel- und Artist-Spalten.');
  const albumCol = column('album name', 'album');
  const durationCol = column('duration (ms)', 'duration_ms', 'duration', 'length', 'time');
  const isrcCol = column('isrc');
  const nameCol = column('playlist name', 'playlist');
  const tracks = rows.slice(1).map((row) => {
    const raw = {
      title: row[titleCol],
      artist: row[artistCol],
      albumName: albumCol >= 0 ? row[albumCol] : '',
      durationMs: durationCol >= 0 ? csvDurationMs(row[durationCol]) : 0,
      isrc: isrcCol >= 0 ? row[isrcCol] : '',
    };
    return spotifyTrack(raw, 'export');
  }).filter(Boolean).slice(0, SPOTIFY_MAX_TRACKS);
  if (!tracks.length) throw new Error('In der CSV-Datei wurden keine gültigen Titel gefunden.');
  const playlistName = nameCol >= 0 ? cleanText(rows.slice(1).map((row) => row[nameCol]).find(Boolean), 100) : '';
  const limited = rows.length - 1 > SPOTIFY_MAX_TRACKS;
  const playlist = { name: playlistName || path.basename(filename, path.extname(filename)).slice(0, 100) || 'Spotify-Playlist', tracks };
  return { name: playlist.name, tracks, playlists: [playlist], limited, limitMessage: limited ? 'Import auf 2000 Titel begrenzt.' : '', error: null };
}

function parseSpotifyJson(text, filename) {
  let data;
  try {
    data = JSON.parse(String(text || '').replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('Die JSON-Datei ist ungültig.');
  }
  if (!data || !Array.isArray(data.playlists)) throw new Error('Das Spotify-Datenexport-Format wurde nicht erkannt.');
  let remaining = SPOTIFY_MAX_TRACKS;
  const playlists = data.playlists.map((playlist, index) => {
    const items = Array.isArray(playlist && playlist.items) ? playlist.items : [];
    const tracks = items.map((item) => {
      const track = item && item.track;
      if (!track) return null;
      return spotifyTrack({
        title: track.trackName,
        artist: track.artistName,
        albumName: track.albumName,
        durationMs: track.durationMs || track.duration,
        isrc: track.isrc,
      }, 'export');
    }).filter(Boolean).slice(0, remaining);
    remaining -= tracks.length;
    return { name: cleanText(playlist && playlist.name, 100) || `Playlist ${index + 1}`, tracks };
  }).filter((playlist) => playlist.tracks.length);
  if (!playlists.length) throw new Error('Im Spotify-Datenexport wurden keine Titel gefunden.');
  const limited = data.playlists.reduce((sum, playlist) => sum + (Array.isArray(playlist && playlist.items) ? playlist.items.length : 0), 0) > SPOTIFY_MAX_TRACKS;
  const single = playlists.length === 1 ? playlists[0] : null;
  return { name: single ? single.name : '', tracks: single ? single.tracks : [], playlists, limited, limitMessage: limited ? 'Import auf insgesamt 2000 Titel begrenzt.' : '', error: null };
}

async function runSpotifyImportSmoke() {
  const csv = parseSpotifyCsv(
    '\uFEFFTrack Name,Artist Name(s),Album Name,Duration (ms),ISRC,Playlist name\r\n"One, More Time","Daft Punk; The Weeknd",Discovery,320000,GBDUW0000059,Smoke CSV',
    'export.csv'
  );
  const semicolon = parseSpotifyCsv(
    'Track name;Artist name;Album;ISRC;Playlist name\n"Track; With Semicolon";"Artist One, Artist Two";Album;GBDUW0000059;Smoke Semi',
    'export.csv'
  );
  const json = parseSpotifyJson(
    JSON.stringify({ playlists: [{ name: 'Smoke JSON', items: [{ track: { trackName: 'One More Time', artistName: 'Daft Punk', albumName: 'Discovery', trackUri: 'spotify:track:test' } }] }] }),
    'Playlist1.json'
  );
  let isrc = null;
  try {
    isrc = (await matchSpotifyTracks([{ title: 'One More Time', artist: 'Daft Punk', isrc: 'GBDUW0000059' }])).tracks[0];
  } catch {
    isrc = null;
  }
  let link;
  try {
    const result = await fetchSpotifyPlaylist('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
    link = { ok: Boolean(result.name && result.tracks.length), name: result.name, tracks: result.tracks.length, limited: result.limited };
  } catch (error) {
    link = { ok: false, error: cleanText(error && error.message, 200) };
  }
  return {
    csv: csv.playlists[0].tracks[0].title === 'One, More Time' && csv.playlists[0].tracks[0].artist === 'Daft Punk; The Weeknd',
    semicolon: semicolon.playlists[0].tracks[0].title === 'Track; With Semicolon' && semicolon.playlists[0].tracks[0].artist === 'Artist One, Artist Two',
    json: json.playlists[0].name === 'Smoke JSON' && json.playlists[0].tracks[0].title === 'One More Time',
    isrc: isrc ? { id: isrc.id, title: isrc.title, artist: isrc.artist, preview: Boolean(isrc.preview) } : null,
    link,
  };
}

function spotifyArtistForSearch(value) {
  return String(value || '').split(/[;,]/, 1)[0].trim().slice(0, 120);
}

// "Calm Down (with Selena Gomez)" → "Calm Down"; "Seven (feat. Latto) (Explicit Ver.)" → "Seven".
// Remixes stay ("From The Back (Remix)"), they are a different recording.
function spotifyCoreTitle(value) {
  const title = String(value || '');
  const core = title
    .replace(/\s*[([][^)\]]*\b(feat|ft|featuring|with|explicit|clean|from|remaster|remastered|version|ver|radio edit|mono|stereo)\b[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+[^-]*\b(remaster|remastered|version|from|edit|mono|stereo)\b.*$/i, '')
    .trim();
  return core || title.trim();
}

function spotifyMatchScore(hit, wanted) {
  const titleWords = looseKey(spotifyCoreTitle(wanted.title)).split(' ').filter(Boolean);
  const artistWords = looseKey(spotifyArtistForSearch(wanted.artist)).split(' ').filter(Boolean);
  const hitTitle = new Set(looseKey(hit.title).split(' ').filter(Boolean));
  const hitArtist = new Set(looseKey(hit.artist).split(' ').filter(Boolean));
  const titleMatch = titleWords.length ? titleWords.filter((word) => hitTitle.has(word)).length / titleWords.length : 0;
  const artistMatch = artistWords.length ? artistWords.filter((word) => hitArtist.has(word)).length / artistWords.length : 1;
  let score = titleMatch * 65 + artistMatch * 30;
  const unwanted = new Set(['karaoke', 'cover', 'instrumental', 'tribute', 'remix']);
  if ([...hitTitle, ...hitArtist].some((word) => unwanted.has(word))) score -= 24;
  const expected = Number(wanted.durationMs) / 1000;
  if (expected > 0 && hit.duration > 0) {
    const delta = Math.abs(expected - hit.duration);
    score += delta <= 10 ? 12 : delta <= 30 ? 4 : -Math.min(20, (delta - 30) / 10);
  }
  return { score, titleMatch, artistMatch };
}

async function searchDeezerPlaylistTrack(track) {
  const artist = spotifyArtistForSearch(track.artist);
  const title = spotifyCoreTitle(track.title);
  const query = `artist:"${artist.replace(/["\\]/g, '')}" track:"${title.replace(/["\\]/g, '')}"`;
  for (const term of [query, `${artist} ${title}`.trim()]) {
    const json = await fetchDeezerPlaylistJson(`https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=12`);
    const hits = normalizeDeezer(json);
    const ranked = hits.map((hit, index) => ({ hit, index, ...spotifyMatchScore(hit, track) }))
      .sort((a, b) => b.score - a.score || a.index - b.index);
    const best = ranked[0];
    if (best && best.titleMatch >= 0.45 && best.artistMatch >= (artist ? 0.25 : 0) && best.score >= 42) return best.hit;
  }
  return null;
}

let deezerPlaylistRequestAt = 0;

async function fetchDeezerPlaylistJson(url) {
  const now = Date.now();
  const slot = Math.max(now, deezerPlaylistRequestAt);
  deezerPlaylistRequestAt = slot + 125;
  if (slot > now) await new Promise((resolve) => setTimeout(resolve, slot - now));
  const json = await fetchJson(url, 15000);
  // Deezer quota (code 4): wait a moment and try once more.
  if (json && json.error && Number(json.error.code) === 4) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    return fetchJson(url, 15000);
  }
  return json;
}

async function matchSpotifyTracks(tracks) {
  const source = Array.isArray(tracks) ? tracks.slice(0, 50) : [];
  const results = new Array(source.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= source.length) return;
      const track = source[index] || {};
      try {
        let hit = null;
        const isrc = String(track.isrc || '').trim().toUpperCase();
        if (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)) {
          const byIsrc = await fetchDeezerPlaylistJson(`https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`);
          const normalized = normalizeDeezer({ data: byIsrc && byIsrc.id ? [byIsrc] : [] });
          if (normalized.length) {
            const candidate = normalized[0];
            const score = spotifyMatchScore(candidate, track);
            if (score.titleMatch >= 0.45 && score.artistMatch >= (spotifyArtistForSearch(track.artist) ? 0.25 : 0)) hit = candidate;
          }
        }
        if (!hit) hit = await searchDeezerPlaylistTrack(track);
        results[index] = hit;
      } catch {
        results[index] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, source.length) }, worker));
  return { tracks: results, error: null };
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

      // Titles in Japanese, Cyrillic, Greek … keep no Latin characters at all.
      // Falling back to the raw identity makes sure they are not dropped.
      const dedupeKey = key || `${track.title}|${track.artist}|${track.id || ''}`.trim().toLowerCase();
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
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
let miniWindow = null;

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

function miniBounds() {
  if (isSmoke) return null;
  const stored = readConfig().miniBounds;
  if (!stored || typeof stored !== 'object') return null;
  const bounds = {
    x: Math.round(Number(stored.x)),
    y: Math.round(Number(stored.y)),
    width: 380,
    height: 148,
  };
  if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) return null;
  try {
    const area = screen.getDisplayMatching(bounds).workArea;
    bounds.x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width));
    bounds.y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height));
  } catch {
    return null;
  }
  return bounds;
}

function rememberMiniBounds() {
  if (isSmoke || !miniWindow || miniWindow.isDestroyed()) return;
  const { x, y } = miniWindow.getBounds();
  writeConfig({ miniBounds: { x, y } });
}

function miniSnapshot() {
  return {
    track: playerState.track
      ? {
          title: playerState.track.title,
          artist: playerState.track.artist,
          artwork: cleanUrl(playerState.track.artwork, /^https:\/\//i),
        }
      : null,
    playing: playerState.playing,
    position: playerState.position,
    duration: playerState.duration,
    volume: playerState.volume,
    alwaysOnTop: Boolean(readConfig().miniAlwaysOnTop),
  };
}

function sendMiniState() {
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('mini-state', miniSnapshot());
}

function saveMiniOnTop(value) {
  const alwaysOnTop = Boolean(value);
  writeConfig({ miniAlwaysOnTop: alwaysOnTop });
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.setAlwaysOnTop(alwaysOnTop);
  sendMiniState();
}

function openMiniWindow() {
  if (miniWindow && !miniWindow.isDestroyed()) {
    miniWindow.show();
    miniWindow.focus();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    return true;
  }
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const bounds = miniBounds();
  miniWindow = new BrowserWindow({
    ...(bounds || { width: 380, height: 148 }),
    minWidth: 340,
    minHeight: 132,
    maxWidth: 520,
    maxHeight: 180,
    frame: false,
    resizable: true,
    show: false,
    alwaysOnTop: Boolean(readConfig().miniAlwaysOnTop),
    backgroundColor: '#10141c',
    icon: path.join(ROOT, 'renderer', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(ROOT, 'preload-mini.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  miniWindow.loadFile(path.join(ROOT, 'renderer', 'mini.html'));
  miniWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  miniWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  miniWindow.webContents.once('did-finish-load', sendMiniState);
  miniWindow.once('ready-to-show', () => {
    if (!miniWindow || miniWindow.isDestroyed()) return;
    if (isSmoke) return;
    miniWindow.show();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  });
  let boundsTimer = null;
  const scheduleBounds = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(rememberMiniBounds, 500);
  };
  miniWindow.on('move', scheduleBounds);
  miniWindow.on('resize', scheduleBounds);
  miniWindow.on('close', (event) => {
    if (quitting || isSmoke) return;
    event.preventDefault();
    miniWindow.hide();
    showMainWindow();
  });
  miniWindow.on('closed', () => {
    clearTimeout(boundsTimer);
    miniWindow = null;
  });
  return true;
}

function closeMiniWindow(restore = true) {
  if (miniWindow && !miniWindow.isDestroyed()) {
    const window = miniWindow;
    miniWindow = null;
    window.removeAllListeners('close');
    window.close();
  }
  if (restore) showMainWindow();
}

function mainPlayerPath() {
  const portable = process.env.PORTABLE_EXECUTABLE_FILE;
  return portable && path.isAbsolute(portable) ? portable : process.execPath;
}

function updateLoginItem() {
  if (!app.isPackaged || process.platform !== 'win32') return;
  const enabled = Boolean(readConfig().startOnLogin);
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, path: mainPlayerPath(), args: ['--autostart'] });
  } catch (error) {
    console.error('Login item:', error.message);
  }
}

let lastTaskbarUpdate = 0;
let thumbarKey = '';
const thumbarIcon = (name) => nativeImage.createFromPath(path.join(ROOT, 'renderer', 'assets', 'thumbar', `${name}.png`));

function updateTaskbar(force = false) {
  if (process.platform !== 'win32' || !mainWindow || mainWindow.isDestroyed()) return;
  const enabled = readConfig().taskbarProgress !== false;
  const now = Date.now();
  if (!force && now - lastTaskbarUpdate < 950) return;
  lastTaskbarUpdate = now;
  const hasTrack = Boolean(playerState.track);
  const duration = Number(playerState.duration) || 0;
  if (!enabled || !hasTrack || !duration) mainWindow.setProgressBar(-1);
  else {
    const value = Math.max(0, Math.min(1, Number(playerState.position) / duration));
    mainWindow.setProgressBar(value, playerState.playing ? {} : { mode: 'paused' });
  }
  const key = `${hasTrack}:${playerState.playing}`;
  if (force || key !== thumbarKey) {
    thumbarKey = key;
    mainWindow.setThumbarButtons([
      { tooltip: 'Zurück', icon: thumbarIcon('previous'), flags: hasTrack ? [] : ['disabled'], click: () => sendPlayerCommand('previous') },
      { tooltip: playerState.playing ? 'Pause' : 'Abspielen', icon: thumbarIcon(playerState.playing ? 'pause' : 'play'), flags: hasTrack ? [] : ['disabled'], click: () => sendPlayerCommand('toggle') },
      { tooltip: 'Weiter', icon: thumbarIcon('next'), flags: hasTrack ? [] : ['disabled'], click: () => sendPlayerCommand('next') },
    ]);
  }
}

const GLOBAL_SHORTCUTS = [
  ['Control+Alt+P', 'toggle'],
  ['Control+Alt+Right', 'next'],
  ['Control+Alt+Left', 'previous'],
  ['Control+Alt+Up', 'volumeUp'],
  ['Control+Alt+Down', 'volumeDown'],
  ['Control+Alt+M', 'mini'],
];
let registeredShortcuts = [];

function disableGlobalShortcuts() {
  registeredShortcuts.forEach((accelerator) => globalShortcut.unregister(accelerator));
  registeredShortcuts = [];
}

function configureGlobalShortcuts(enabled) {
  disableGlobalShortcuts();
  if (!enabled) {
    writeConfig({ globalShortcuts: false });
    return { enabled: false, registered: [], conflict: null };
  }
  const registered = [];
  let conflict = null;
  for (const [accelerator, command] of GLOBAL_SHORTCUTS) {
    const ok = globalShortcut.register(accelerator, () => {
      if (command === 'mini') return openMiniWindow();
      if (command === 'volumeUp' || command === 'volumeDown') {
        const next = Math.max(0, Math.min(1.5, playerState.volume + (command === 'volumeUp' ? 0.05 : -0.05)));
        sendPlayerCommand('volume', next);
        return;
      }
      sendPlayerCommand(command);
    });
    if (ok) {
      registered.push(accelerator);
      registeredShortcuts.push(accelerator);
    } else if (!conflict) conflict = accelerator;
  }
  writeConfig({ globalShortcuts: true });
  return { enabled: true, registered, conflict };
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
  mainWindow.webContents.on('did-finish-load', () => updateTaskbar(true));

  mainWindow.once('ready-to-show', () => {
    if (bounds && bounds.maximized) mainWindow.maximize();
    if (isSmoke) return;
    if (isAutostart && tray && closeToTray()) mainWindow.hide();
    else if (isAutostart) mainWindow.minimize();
    else mainWindow.show();
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
    if (!isSmoke && !isAutostart && mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
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

      // Pure helpers that had real bugs – keep them covered.
      try {
        const fixDir = path.join(app.getPath('temp'), 'cleanmusic-smoke-fixes');
        fs.mkdirSync(fixDir, { recursive: true });
        const goodConfig = path.join(fixDir, 'good.json');
        const badConfig = path.join(fixDir, 'bad.json');
        fs.writeFileSync(goodConfig, JSON.stringify({ remoteEnabled: true }));
        fs.writeFileSync(badConfig, '{ kaputt');
        const parsed = parseConfigFile(goodConfig);
        console.log(
          'SMOKE_FIXES:',
          JSON.stringify({
            nonLatinKept: interleaveTracks([{ title: '打上花火', artist: '米津玄師', id: 'apple:1' }], []).length === 1,
            duplicatesRemoved:
              interleaveTracks(
                [{ title: 'One More Time', artist: 'Daft Punk' }],
                [{ title: 'one more time!', artist: 'DAFT PUNK' }]
              ).length === 1,
            downloadHosts:
              allowedDownloadHost('https://cdn.incompetech.com/x.mp3') && !allowedDownloadHost('https://example.com/x.mp3'),
            configParsed: Boolean(parsed && parsed.remoteEnabled === true),
            configCorrupt: parseConfigFile(badConfig) === null,
            onboardingMusic: fs.existsSync(
              path.join(ROOT, 'renderer', 'assets', 'onboarding', 'thinking-music.mp3')
            ),
          })
        );
        fs.rmSync(fixDir, { recursive: true, force: true });
      } catch (error) {
        console.error('SMOKE_FIXES_FAIL:', error.message);
      }

      try {
        const result = await mainWindow.webContents.executeJavaScript(`
          (() => ({
            navItems: document.querySelectorAll('#sidebar .nav-item').length,
            sidebar: {
              services: document.querySelectorAll('#service-nav .service-item').length,
              visibleServices: Array.from(document.querySelectorAll('#service-nav .service-item')).filter(
                (item) => item.offsetParent !== null
              ).length,
              more: Boolean(document.querySelector('#btn-services-more')),
              extraHidden: Boolean((document.querySelector('#service-extra') || {}).hidden),
              creatorHidden: Boolean((document.querySelector('#creator-nav') || {}).hidden),
            },
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

      // Services stay compact: four featured entries, the rest behind one
      // toggle; Creator starts collapsed. The choice is persisted.
      try {
        const sidebarSmoke = await mainWindow.webContents.executeJavaScript(`
          (async () => {
            const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const total = document.querySelectorAll('#service-nav .service-item').length;
            const visible = () =>
              Array.from(document.querySelectorAll('#service-nav .service-item')).filter(
                (item) => item.offsetParent !== null
              ).length;
            const initial = visible();
            const more = () => document.querySelector('#btn-services-more');
            if (more()) more().click();
            await wait(80);
            const expanded = visible();
            const expandedLabel = more() ? more().textContent.trim() : '';
            const storedExpanded = JSON.parse(localStorage.getItem('cleanmusic.nav.v1') || '{}');
            if (more()) more().click();
            await wait(80);
            const collapsed = visible();
            const creatorToggle = document.querySelector('[data-nav-toggle="creator"]');
            if (creatorToggle) creatorToggle.click();
            await wait(80);
            const creatorOpen = !document.querySelector('#creator-nav').hidden;
            const storedCreator = JSON.parse(localStorage.getItem('cleanmusic.nav.v1') || '{}');
            if (creatorToggle) creatorToggle.click();
            await wait(80);
            const creatorClosed = document.querySelector('#creator-nav').hidden;
            return {
              total,
              initial,
              expanded,
              expandedLabel,
              collapsed,
              creatorOpen,
              creatorClosed,
              storedExpanded,
              storedCreator,
            };
          })()
        `);
        console.log('SMOKE_SIDEBAR:', JSON.stringify(sidebarSmoke));
      } catch (error) {
        console.error('SMOKE_SIDEBAR_FAIL:', error.message);
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
              cm.openSettings('sound');
              await wait(120);
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

          // Silence guard: real digital silence must be recognised, music must
          // not, and the recovery steps must be sane. The silent file is served
          // over http – the renderer's CSP does not allow data: media.
          let silentServer = null;
          try {
            const silentWav = Buffer.from(smokeWavDataUrl().split(',')[1], 'base64');
            const silentUrl = await new Promise((resolve, reject) => {
              silentServer = http.createServer((request, response) => {
                if (request.url !== '/silent.wav') {
                  response.writeHead(404);
                  response.end();
                  return;
                }
                response.writeHead(200, {
                  'content-type': 'audio/wav',
                  'content-length': silentWav.length,
                  'accept-ranges': 'none',
                  'cache-control': 'no-store',
                });
                response.end(silentWav);
              });
              silentServer.on('error', reject);
              silentServer.listen(0, '127.0.0.1', () =>
                resolve(`http://localhost:${silentServer.address().port}/silent.wav`)
              );
            });
            const silentResult = await mainWindow.webContents.executeJavaScript(`
              (async () => {
                const cm = window.CleanMusic;
                const before = {
                  signal: window.CMVisualizer.signal(),
                  silentFor: Math.round(window.CMVisualizer.silentFor()),
                };
                const probe = await cm.silenceProbe(${JSON.stringify(silentUrl)});
                // Visualizer off: the guard must still hear the silence.
                const probeOff = await cm.silenceProbe(${JSON.stringify(silentUrl)}, { visualizerOff: true });
                return {
                  before,
                  probe,
                  probeOff,
                  decisions: {
                    rematch: cm.silenceGuard({ time: 12, silentFor: 12000, mode: 'matched', tries: 0 }),
                    short: cm.silenceGuard({ time: 3, silentFor: 2000, mode: 'plugin', tries: 0 }),
                    audible: cm.silenceGuard({ time: 12, silentFor: 0, mode: 'plugin', tries: 0 }),
                    reload: cm.silenceGuard({ time: 12, silentFor: 12000, mode: 'plugin', tries: 0 }),
                    preview: cm.silenceGuard({ time: 12, silentFor: 12000, mode: 'matched', tries: 1 }),
                    tell: cm.silenceGuard({ time: 12, silentFor: 12000, mode: 'preview', tries: 2 }),
                  },
                };
              })()
            `);
            console.log('SMOKE_SILENCE:', JSON.stringify(silentResult));
            // Visualizer off: the guard must still hear the silence (1.18 could not).
            if (!(silentResult.probeOff && silentResult.probeOff.silentFor > 1500 && silentResult.decisions.rematch === 'rematch')) {
              console.error('SMOKE_SILENCE_OFF_FAIL:', JSON.stringify(silentResult.probeOff));
            }
          } catch (error) {
            console.error('SMOKE_SILENCE_FAIL:', error.message);
          } finally {
            if (silentServer) {
              try {
                silentServer.close();
              } catch {
                /* already gone */
              }
            }
          }

          const seekResult = await mainWindow.webContents.executeJavaScript(`
            (() => {
              const seek = document.querySelector('#seek');
              return {
                fill: seek.style.getPropertyValue('--fill').trim(),
                value: Number(seek.value) || 0,
                max: Number(seek.max) || 0,
              };
            })()
          `);
          console.log('SMOKE_SEEK:', JSON.stringify(seekResult));

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

              const waitForCategory = async (tab, category) => {
                cm.setCreator(tab, category.id);
                for (let i = 0; i < 50 && cm.creator().loading; i += 1) await wait(250);
                const result = cm.creator();
                return { label: category.label, items: result.items, licenses: result.licenses, error: result.error };
              };
              const gameTab = window.CM_CREATOR.tabs.find((entry) => entry.id === 'games');
              const freeTab = window.CM_CREATOR.tabs.find((entry) => entry.id === 'free');
              const gameSounds = {};
              const freeMusic = {};
              for (const category of gameTab.categories) gameSounds[category.id] = await waitForCategory('games', category);
              for (const id of ['chiptune', 'videospiel', 'boss-kampf']) {
                const category = freeTab.categories.find((entry) => entry.id === id);
                freeMusic[id] = await waitForCategory('free', category);
              }
              cm.setCreator('classics', 'gaming-retro');
              const gamingRetro = cm.creator();
              const allowedLicense = (value) => /^(CC0|Public Domain|CC BY(?: [0-9.]+)?)$/i.test(value);
              const openverseResults = [...Object.values(gameSounds), ...Object.values(freeMusic)];
              // An Openverse outage or rate limit (HTTP 403) must not fail the
              // release check; only a successful-but-empty category does.
              const skipped = openverseResults
                .filter((result) => Boolean(result.error))
                .map((result) => result.label);
              const categoryFailures = openverseResults
                .filter(
                  (result) =>
                    !result.error &&
                    (!result.items ||
                      !result.licenses.length ||
                      result.licenses.some((license) => !allowedLicense(license)))
                )
                .map((result) => result.label);
              if (!gamingRetro.items) categoryFailures.push('Gaming & Retro (Kevin MacLeod)');
              cm.setCreator('classics', 'lustig');
              const newCategories = {
                gameSounds,
                freeMusic,
                gamingRetro: { items: gamingRetro.items },
                allHit: categoryFailures.length === 0,
                failures: categoryFailures,
                skipped,
              };

              cm.setCreator('ncs', 'top');
              for (let i = 0; i < 40 && !cm.creator().items; i += 1) await wait(300);
              let ncs = null;
              const ncsRow = document.querySelector('#creator-list .song-row');
              if (ncsRow) {
                ncsRow.click();
                for (let i = 0; i < 50; i += 1) {
                  await wait(300);
                  ncs = cm.nowPlaying();
                  if (ncs && ncs.mode !== 'loading' && (ncs.time > 0.3 || ncs.mode === 'error')) break;
                }
              } else {
                ncs = { skipped: 'Keine NCS-Titel geladen (Netzwerk)' };
              }

              cm.setCreator('classics', 'lustig');
              await wait(300);
              const classicRow = document.querySelector('#creator-list .song-row');
              if (classicRow) classicRow.click();
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

              return { tabs, newCategories, ncs, now, fullscreen, viz, credits, creditRows };
            })()
          `);
          console.log('SMOKE_CREATOR:', JSON.stringify(creatorResult));
          if (!creatorResult.newCategories || !creatorResult.newCategories.allHit) {
            throw new Error(`Neue Spiele-Kategorien ohne gültige Treffer: ${(creatorResult.newCategories && creatorResult.newCategories.failures || []).join(', ')}`);
          }
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
          try {
            fs.rmSync(creatorDir, { recursive: true, force: true });
          } catch {
            // Windows may still hold the downloaded file for a moment; the
            // next smoke run removes the folder before it starts.
          }
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
                taste: { tracks: { 'backup artist|backup title': { value: 1, at: Date.now(), n: 'Backup Artist' } }, artists: {}, skips: [] },
                settings: { theme: 'nacht' },
              });
              const rejected = await cm.importBackup({ app: 'Other' });
              cm.sleep('30');
              const sleepOn = cm.sleep();
              document.querySelector('#btn-sleep').click();
              const sleepMenu = document.querySelectorAll('#ctx-menu [data-sleep]').length;
              document.querySelector('#ctx-menu [data-sleep="off"]').click();
              const sleepOff = cm.sleep();
              cm.openSettings('sound');
              await new Promise((resolve) => setTimeout(resolve, 80));
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

          const shuffleSmoke = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const btn = document.querySelector('#btn-shuffle');
              if (btn.classList.contains('active')) btn.click();
              cm.playList('charts', 0);
              await wait(120);
              const beforeQueue = cm.queue();
              const before = beforeQueue.items.map((item) => item.id);
              const beforeContext = beforeQueue.items.filter((item) => !item.queued).map((item) => item.id);
              btn.click();
              await wait(120);
              const mixedQueue = cm.queue();
              const mixed = mixedQueue.items.map((item) => item.id);
              const mixedContext = mixedQueue.items.filter((item) => !item.queued).map((item) => item.id);
              const changed = mixedContext.slice(1).join('|') !== beforeContext.slice(1).join('|');
              const noDuplicates = new Set(mixedContext).size === mixedContext.length;
              btn.click();
              await wait(120);
              const restored = cm.queue().items.map((item) => item.id);
              const restoreOk = restored.join('|') === before.join('|');
              btn.click();
              await wait(120);
              cm.next();
              await wait(120);
              const sequential = cm.queue().index === 1;
              btn.click();
              await wait(120);
              return { titles: before.length, changed, noDuplicates, sequential, restoreOk };
            })()
          `);
          console.log('SMOKE_SHUFFLE:', JSON.stringify(shuffleSmoke));

          // Playlist "Erweitern": the button exists and appends suggestions
          // that fit the artists already in the list.
          const extendSmoke = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const id = cm.createPlaylist('Smoke Erweitern');
              cm.addToPlaylistAt(id, 'charts', 0);
              cm.addToPlaylistAt(id, 'charts', 1);
              cm.openPlaylist(id);
              await wait(150);
              const button = document.querySelector('#view-playlist [data-pl-action="extend"]');
              const buttonThere = Boolean(button);
              if (button) button.click();
              let rows = 0;
              for (let i = 0; i < 60; i += 1) {
                rows = document.querySelectorAll('#dialog [data-extend-index]').length;
                if (rows) break;
                await wait(250);
              }
              const boxes = Array.from(document.querySelectorAll('#dialog [data-extend-index]'));
              if (boxes.length > 1) {
                boxes[boxes.length - 1].checked = false;
                boxes[boxes.length - 1].dispatchEvent(new Event('change', { bubbles: true }));
              }
              const selected = boxes.filter((box) => box.checked).length;
              const countLabel = (document.querySelector('#dialog-ok') || {}).textContent || '';
              if (document.querySelector('#dialog-ok')) document.querySelector('#dialog-ok').click();
              await wait(600);
              for (let i = 0; i < 40; i += 1) {
                if (document.querySelector('#dialog').hidden) break;
                await wait(150);
              }
              await wait(300);
              const items = document.querySelectorAll('#view-playlist .song-row').length;
              cm.showView('home');
              return {
                buttonThere,
                rows,
                selected,
                countLabel,
                dialogClosed: document.querySelector('#dialog').hidden,
                items,
              };
            })()
          `);
          console.log('SMOKE_EXTEND:', JSON.stringify(extendSmoke));

          // Taste engine + smart mixes: feedback changes the profile, mixes
          // render on home and in their own view, reset clears everything.
          const tasteSmoke = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const before = cm.mixes();
              cm.tasteAt('charts', 0, 'like');
              cm.tasteAt('charts', 1, 'artist-dislike');
              const profile = cm.taste();
              const after = cm.mixes();
              cm.showView('mixes');
              await wait(150);
              const cards = document.querySelectorAll('#view-mixes .mix-card').length;
              const homeCards = document.querySelectorAll('#home-mixes .mix-card').length;
              const tastePanel = Boolean(document.querySelector('#view-mixes .mix-taste'));
              cm.tasteReset();
              const cleared = cm.taste();
              cm.showView('home');
              return {
                before, after, cards, homeCards, tastePanel,
                likes: profile.stats.likes,
                dislikes: profile.stats.dislikes,
                topArtist: profile.stats.artists[0] || '',
                cleared: { likes: cleared.stats.likes, dislikes: cleared.stats.dislikes, tracks: cleared.tracks },
              };
            })()
          `);
          console.log('SMOKE_TASTE:', JSON.stringify(tasteSmoke));

          // Smart playlists ("Rezepte v0"): rules build a real playlist, the
          // dialog previews the count, refreshing persists, dislikes drop out.
          const smartSmoke = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              const made = cm.smartPlaylist('Smoke Smart', {
                sources: ['charts', 'favorites', 'history', 'recs', 'local'],
                limit: 12,
                excludeDislikes: true,
              });
              const info = cm.smartPlaylistInfo(made.id);
              cm.openPlaylist(made.id);
              await wait(180);
              const eyebrow = (document.querySelector('#view-playlist .playlist-meta .eyebrow') || {}).textContent || '';
              const refresh = Boolean(document.querySelector('#view-playlist [data-pl-action="smart-refresh"]'));
              const rulesButton = Boolean(document.querySelector('#view-playlist [data-pl-action="smart-rules"]'));
              const chips = document.querySelectorAll('#view-playlist .smart-chip').length;
              const sidebar = Boolean(document.querySelector('#playlist-nav [data-playlist="' + made.id + '"]'));

              document.querySelector('#view-playlist [data-pl-action="smart-rules"]').click();
              await wait(180);
              const dialogOpen = !document.querySelector('#dialog').hidden;
              const sourceBoxes = document.querySelectorAll('#dialog [data-smart-source]').length;
              const previewBefore = (document.querySelector('#dialog #smart-preview') || {}).textContent || '';
              const limitField = document.querySelector('#dialog #smart-limit');
              if (limitField) {
                limitField.value = '5';
                limitField.dispatchEvent(new Event('input', { bubbles: true }));
              }
              const previewAfter = (document.querySelector('#dialog #smart-preview') || {}).textContent || '';
              document.querySelector('#dialog-ok').click();
              await wait(700);
              const dialogClosed = document.querySelector('#dialog').hidden;
              const after = cm.smartPlaylistInfo(made.id);
              const stored = (JSON.parse(localStorage.getItem('cleanmusic.collection.v1') || '{}').playlists || []).find(
                (playlist) => playlist.id === made.id
              );

              const keyA = cm.matchKey({ artist: '米津玄師', title: '打上花火', id: 'a' });
              const keyB = cm.matchKey({ artist: '米津玄師', title: 'Lemon', id: 'b' });
              const nonLatinDistinct = keyA !== keyB && keyA.split('|').join('').trim() !== '';

              const normalized = cm.smartPlaylist('Smoke Normalize', {
                sources: ['favorites', 'bogus'],
                limit: 999,
                notPlayedDays: 3,
              });
              const normalizedInfo = cm.smartPlaylistInfo(normalized.id);
              const normalizedOk =
                normalizedInfo.smart.limit === 100 &&
                normalizedInfo.smart.notPlayedDays === 0 &&
                normalizedInfo.smart.sources.join(',') === 'favorites';
              cm.smartPlaylistRemove(normalized.id);

              const victim = after.titles[0] || '';
              cm.tasteAt('playlist:' + made.id, 0, 'track-dislike');
              cm.smartPlaylistRebuild(made.id);
              const afterDislike = cm.smartPlaylistInfo(made.id);
              const excluded = Boolean(victim) && !afterDislike.titles.includes(victim);
              cm.tasteReset();

              cm.smartPlaylistRemove(made.id);
              cm.showView('home');

              document.querySelector('#btn-smart-playlist').click();
              await wait(150);
              const createButtonDialog = !document.querySelector('#dialog').hidden;
              if (createButtonDialog) document.querySelector('#dialog-cancel').click();
              await wait(100);

              return {
                made: made.count,
                eyebrow,
                refresh,
                rulesButton,
                chips,
                sidebar,
                dialogOpen,
                sourceBoxes,
                previewBefore: /Titel passen|Keine Treffer/.test(previewBefore),
                previewAfter: /Titel passen|Keine Treffer/.test(previewAfter),
                dialogClosed,
                count: after.count,
                limit: after.smart ? after.smart.limit : 0,
                updated: after.smart ? after.smart.updatedAt > 0 : false,
                persisted: stored && stored.smart ? stored.smart.limit : 0,
                unique: info.uniqueIds === info.count && info.uniqueKeys === info.count,
                allValid: info.allValid,
                nonLatinDistinct,
                normalizedOk,
                excluded,
                createButtonDialog,
              };
            })()
          `);
          console.log('SMOKE_SMART:', JSON.stringify(smartSmoke));

          // 2.0 Phase 3: recipes refresh on open / daily, new filters, "why".
          try {
            const recipeSmoke = await mainWindow.webContents.executeJavaScript(`
              (async () => {
                const cm = window.CleanMusic;
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                const sources = ['charts', 'favorites', 'history', 'recs', 'local'];
                const open = cm.smartPlaylist('Smoke Rezept', { sources, limit: 10, refresh: 'onOpen' });
                const before = cm.smartPlaylistInfo(open.id);
                await wait(30);
                cm.openPlaylist(open.id);
                await wait(200);
                const after = cm.smartPlaylistInfo(open.id);
                const chips = Array.from(document.querySelectorAll('#view-playlist .smart-chip')).map((chip) => chip.textContent);
                const whyIds = Object.keys(after.smart.why || {});
                const firstId = whyIds[0] || '';
                const why = firstId ? cm.recipeWhy(open.id, firstId) : '';

                const daily = cm.smartPlaylist('Smoke Täglich', { sources, limit: 8, refresh: 'daily' });
                const dailyFresh = cm.refreshDailyRecipes();
                cm.smartPlaylistAge(daily.id, 2 * 24 * 60 * 60 * 1000);
                const dailyStale = cm.refreshDailyRecipes();

                const bpm = cm.smartPlaylist('Smoke BPM', { sources, limit: 10, bpmMin: 300, bpmMax: 320 });
                const bpmInfo = cm.smartPlaylistInfo(bpm.id);
                const kind = cm.smartPlaylist('Smoke Art', { sources, limit: 10, kinds: ['local'] });
                const kindInfo = cm.smartPlaylistInfo(kind.id);

                const dialog = (() => {
                  const edit = document.querySelector('[data-pl-action="smart-rules"]'); if (edit) edit.click();
                  return true;
                })();
                await wait(150);
                const fields = {
                  refresh: Boolean(document.querySelector('#smart-refresh')),
                  bpm: Boolean(document.querySelector('#smart-bpm-min')) && Boolean(document.querySelector('#smart-bpm-max')),
                  moods: document.querySelectorAll('[data-smart-mood]').length,
                  kinds: document.querySelectorAll('[data-smart-kind]').length,
                };
                const cancel = document.querySelector('#dialog-cancel');
                if (cancel && !document.querySelector('#dialog').hidden) cancel.click();
                await wait(60);

                const mixRecipe = cm.mixRecipe('again');
                const mixAgain = cm.mixRecipe('again');
                const mixOk = Boolean(mixRecipe) && mixRecipe.smart.refresh === 'daily' &&
                  mixRecipe.smart.notPlayedDays === 14 && mixAgain && mixAgain.id === mixRecipe.id;
                if (mixRecipe) cm.smartPlaylistRemove(mixRecipe.id);

                [open.id, daily.id, bpm.id, kind.id].forEach((id) => cm.smartPlaylistRemove(id));
                return {
                  rebuiltOnOpen: after.smart.updatedAt > before.smart.updatedAt,
                  refreshChip: chips.includes('Aktualisiert beim Öffnen'),
                  why: after.count === 0 || (whyIds.length === Math.min(after.count, 150) && /Passt ins Rezept/.test(why)),
                  dailyFresh,
                  dailyStale,
                  bpmEmpty: bpmInfo.count === 0,
                  kindsLocalOnly: kindInfo.count === 0 || kindInfo.titles.length === kindInfo.count,
                  dialog: dialog && fields.refresh && fields.bpm && fields.moods === 6 && fields.kinds === 4,
                  mixRecipe: mixOk,
                  count: after.count,
                };
              })()
            `);
            const recipeOk = recipeSmoke.rebuiltOnOpen && recipeSmoke.refreshChip && recipeSmoke.why &&
              recipeSmoke.dailyFresh === 0 && recipeSmoke.dailyStale === 1 && recipeSmoke.bpmEmpty &&
              recipeSmoke.kindsLocalOnly && recipeSmoke.dialog && recipeSmoke.mixRecipe;
            if (!recipeOk) throw new Error(JSON.stringify(recipeSmoke));
            console.log('SMOKE_RECIPES:', JSON.stringify(recipeSmoke));
          } catch (error) {
            console.error('SMOKE_RECIPES_FAIL:', error.message);
          }

          // 1.23: group week card – own card, friend codes, ranking, remove.
          try {
            const groupSmoke = await mainWindow.webContents.executeJavaScript(`
              (async () => {
                const cm = window.CleanMusic;
                const G = window.CMGroup;
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                cm.groupReset();
                cm.showView('review');
                await wait(200);
                const nameField = document.querySelector('#rv-group-name');
                nameField.value = 'Smoke';
                nameField.dispatchEvent(new Event('change', { bubbles: true }));
                await wait(80);
                const week = G.weekKey();
                const friend = G.encode({ name: 'Freundin', week, secs: 7200, plays: 30, artists: ['Kevin MacLeod'], at: Date.now() });
                const add = (text) => {
                  const field = document.querySelector('#rv-group-code');
                  field.value = text;
                  document.querySelector('[data-review-action="group-add"]').click();
                };
                add('Schau mal: ' + friend + ' :)');
                await wait(120);
                add(friend.slice(0, -2) + 'zz');
                await wait(80);
                const own = G.encode(cm.groupState().card);
                add(own);
                await wait(80);
                const linked = G.encode({ name: 'Linkgast', week, secs: 60, plays: 1, artists: [], at: Date.now() });
                const linkImport = await cm.groupImport(linked, { confirm: true });
                const rows = Array.from(document.querySelectorAll('.rv-group-list li')).map((li) => li.querySelector('strong').textContent);
                const state = cm.groupState();
                const removeButton = document.querySelector('[data-group-remove="freundin"]');
                if (removeButton) removeButton.click();
                await wait(120);
                const after = cm.groupState();
                const stored = JSON.parse(localStorage.getItem(window.CMPersist.STORAGE.group) || '{}');
                cm.groupReset();
                cm.showView('home');
                return {
                  name: state.name,
                  members: state.members,
                  rows,
                  ownCardWeek: state.card.week === week,
                  removed: after.members === 1,
                  persisted: stored.name === 'Smoke',
                  linkImport,
                  linkedCode: linked,
                };
              })()
            `);
            const groupOk = groupSmoke.name === 'Smoke' && groupSmoke.members === 2 &&
              groupSmoke.rows[0] === 'Freundin' && groupSmoke.rows.includes('Smoke (du)') &&
              groupSmoke.rows.length === 3 && groupSmoke.ownCardWeek && groupSmoke.removed && groupSmoke.persisted &&
              groupSmoke.linkImport === true;
            const parsedGroup = parseDeepLink('cleanmusic://group?c=' + encodeURIComponent(groupSmoke.linkedCode));
            groupSmoke.deepLink = Boolean(parsedGroup && parsedGroup.action === 'group' && parsedGroup.code === groupSmoke.linkedCode) &&
              parseDeepLink('cleanmusic://group?c=<script>') === null && parseDeepLink('cleanmusic://group') === null;
            delete groupSmoke.linkedCode;
            if (!groupOk || !groupSmoke.deepLink) throw new Error(JSON.stringify(groupSmoke));
            console.log('SMOKE_GROUP:', JSON.stringify(groupSmoke));
          } catch (error) {
            console.error('SMOKE_GROUP_FAIL:', error.message);
          }

          // Plugin-API v3: manifest read before activation, permissions enforced,
          // dynamic select options.
          try {
            const pluginFolder = pluginDirs()[0];
            fs.mkdirSync(pluginFolder, { recursive: true });
            const v3File = path.join(pluginFolder, 'smoke-v3.js');
            fs.writeFileSync(v3File, [
              '/* cleanmusic-plugin',
              '{ "apiVersion": 3, "name": "Smoke v3", "version": "0.0.1", "permissions": ["ui:settings", "ui:panel", "library:read", "network:example.com"] }',
              '*/',
              "'use strict';",
              'const probe = {};',
              'module.exports = {',
              '  apiVersion: 3,',
              "  name: 'Smoke v3',",
              "  settings: [{ id: 'device', type: 'select', label: 'Gerät', options: [{ value: 'a', label: 'A' }], optionsFrom: 'listDevices' }],",
              "  listDevices: async () => [{ value: 'b', label: 'B (dynamisch)' }],",
              '  async setup(ctx) {',
              "    const attempt = (fn) => { try { fn(); return 'erlaubt'; } catch (error) { return 'gesperrt'; } };",
              '    probe.player = attempt(() => ctx.player.state());',
              "    probe.clipboard = attempt(() => ctx.copyText('x'));",
              "    probe.fetchOther = await ctx.fetch('https://evil.invalid/').then(() => 'erlaubt', () => 'gesperrt');",
              "    probe.settings = Object.keys(ctx.settings.get()).join(',');",
              '    const favs = await ctx.library.favorites();',
              "    probe.library = favs && favs.ok === true && Array.isArray(favs.items) ? favs.items.length : 'fail';",
              "    probe.panel = ctx.ui.panel({ slot: 'settings', title: 'Smoke-Panel', html: '<p>Hallo</p>' });",
              '  },',
              '  probe: () => probe,',
              '};',
              '',
            ].join('\n'));
            discoverPlugins();
            const v3 = plugins.get('smoke-v3');
            const before = await pluginInfo(v3, false, false);
            await loadPlugin(v3);
            const after = await pluginInfo(v3, true, false);
            const probe = v3.module ? v3.module.probe() : {};
            const deviceField = ((after.settings && after.settings.fields) || []).find((field) => field.id === 'device');
            const v3Result = {
              nameBefore: before.name,
              api: before.api,
              perms: (before.permissions || []).map((item) => item.id),
              loaded: Boolean(v3.module),
              error: v3.error,
              probe,
              dynamic: deviceField ? deviceField.options.map((option) => option.value) : [],
              panels: (after.panels || []).map((panel) => ({ slot: panel.slot, title: panel.title })),
            };
            unloadPlugin(v3);
            plugins.delete('smoke-v3');
            fs.rmSync(v3File, { force: true });
            const v3Ok = v3Result.nameBefore === 'Smoke v3' && v3Result.api === 3 && v3Result.perms.includes('ui:settings') &&
              v3Result.perms.includes('ui:panel') && v3Result.perms.includes('library:read') &&
              v3Result.loaded && probe.player === 'gesperrt' && probe.clipboard === 'gesperrt' &&
              probe.fetchOther === 'gesperrt' && probe.settings === 'device' &&
              typeof probe.library === 'number' && probe.panel === true &&
              v3Result.panels.some((panel) => panel.title === 'Smoke-Panel' && panel.slot === 'settings') &&
              v3Result.dynamic.includes('a') && v3Result.dynamic.includes('b');
            if (!v3Ok) throw new Error(JSON.stringify(v3Result));
            console.log('SMOKE_PLUGIN_V3:', JSON.stringify(v3Result));
          } catch (error) {
            console.error('SMOKE_PLUGIN_V3_FAIL:', error.message);
          }

          // Social without a server: Discord "In CleanMusic anhören", playlist links.
          try {
            const social = await mainWindow.webContents.executeJavaScript(`
              (async () => {
                const cm = window.CleanMusic;
                const made = cm.smartPlaylist('Smoke Teilen', { sources: ['charts', 'recs', 'history', 'favorites'], limit: 5 });
                const shared = await cm.playlistShare(made.id);
                const imported = shared && shared.code ? await cm.playlistImportLink(shared.code, { confirm: true }) : null;
                cm.smartPlaylistRemove(made.id);
                if (imported && imported.id) cm.smartPlaylistRemove(imported.id);
                return {
                  shared: shared ? shared.shared : 0,
                  link: shared && shared.link ? shared.link.slice(0, 46) : '',
                  code: shared ? shared.code : '',
                  imported: imported ? imported.count : 0,
                  total: imported ? imported.total : 0,
                };
              })()
            `);
            const parsedPlaylist = parseDeepLink('cleanmusic://playlist?d=' + encodeURIComponent(social.code));
            const deepOk = Boolean(parsedPlaylist && parsedPlaylist.action === 'playlist' && parsedPlaylist.code === social.code) &&
              parseDeepLink('cleanmusic://playlist?d=P1.<script>') === null;

            const probe = new DiscordPresence();
            probe.configure({ enabled: false, clientId: '', showArtwork: true, shareButton: true });
            const shareLink = 'https://bellocccyt.github.io/cleanmusic/s/?src=deezer&id=3135553&t=One+More+Time';
            const both = probe.buildActivity({ title: 'T', artist: 'A', playing: true, link: 'https://www.deezer.com/track/3135553', linkLabel: 'Anhören', shareUrl: shareLink });
            const foreign = probe.buildActivity({ title: 'T', artist: 'A', playing: true, shareUrl: 'https://evil.example/s/?x' });
            probe.configure({ enabled: false, clientId: '', showArtwork: true, shareButton: false });
            const off = probe.buildActivity({ title: 'T', artist: 'A', playing: true, link: 'https://www.deezer.com/track/3135553', shareUrl: shareLink });
            const discordOk = Boolean(both && both.buttons && both.buttons.length === 2 && both.buttons[0].label === 'In CleanMusic anhören') &&
              !(foreign && foreign.buttons && foreign.buttons.length) &&
              Boolean(off && off.buttons && off.buttons.length === 1 && off.buttons[0].label === 'Anhören');

            const socialResult = {
              shared: social.shared,
              link: social.link,
              imported: social.imported,
              total: social.total,
              deepLink: deepOk,
              discord: discordOk,
            };
            const socialOk = social.shared > 0 && social.link === 'https://bellocccyt.github.io/cleanmusic/p/#P1.' &&
              social.imported > 0 && social.total === social.shared && deepOk && discordOk;
            if (!socialOk) throw new Error(JSON.stringify(socialResult));
            console.log('SMOKE_SOCIAL:', JSON.stringify(socialResult));
          } catch (error) {
            console.error('SMOKE_SOCIAL_FAIL:', error.message);
          }

          // Social Weg B: signed requests against a local fake server (social-main.js).
          try {
            const fake = createFakeServer();
            const origin = await fake.listen();
            const js = (code) => mainWindow.webContents.executeJavaScript(code);
            const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
            const q = (value) => JSON.stringify(value);
            const noServer = await social.request({ method: 'GET', path: '/v1/friends' });
            const badServer = await social.setServer('http://evil.example');
            await js(`window.CleanMusic.socialServer(${q(origin)})`);
            const foreignPath = await social.request({ method: 'GET', path: '/v1/admin/reports' });
            const otherHost = await social.request({ method: 'GET', path: '//evil.example/v1/friends' });
            const enabled = await js('window.CleanMusic.socialEnable()');
            const keyText = fs.readFileSync(social.keyFile(), 'utf8');
            const bridgeKeys = await js('Object.keys(window.cm).filter((key) => /social/i.test(key)).sort().join(",")');
            const badName = await js('window.CleanMusic.socialName("Admin")');
            const goodName = await js('window.CleanMusic.socialName("Smoke Tester")');
            const friend = await fake.remoteClient();
            await friend.call('POST', '/v1/name', { name: 'Smoke Freund' });
            const code = await js('window.CleanMusic.socialCode().then((made) => made && made.code)');
            // 2.1: redeeming the app's code leaves a request; the app accepts it.
            const redeemed = await friend.call('POST', '/v1/friend/redeem', { code, requests: true });
            await js('window.CleanMusic.socialRefresh()');
            const requestUi = await js(`(async () => {
              const cm = window.CleanMusic;
              cm.showView('friends');
              await new Promise((resolve) => setTimeout(resolve, 250));
              const count = document.querySelector('#friends-count');
              return {
                rows: document.querySelectorAll('#view-friends .social-request').length,
                buttons: document.querySelectorAll('#view-friends .social-request [data-social="accept"], #view-friends .social-request [data-social="decline"]').length,
                count: count.textContent,
                badge: count.classList.contains('requests'),
                friends: cm.socialState().friends.length,
                note: cm.socialState().notes.some((text) => /Freundschaftsanfrage/.test(text)),
              };
            })()`);
            const accepted = await js(`window.CleanMusic.socialAccept(${q(friend.id)})`);
            await friend.call('POST', '/v1/presence', { show: true });
            await friend.call('POST', '/v1/activity', { ref: { src: 'search', id: '', title: 'Numb', artist: 'Linkin Park' } });
            await js('window.CleanMusic.socialRefresh()');
            const onlineNote = (await js('window.CleanMusic.socialState()')).notes.some((text) => /ist jetzt online/.test(text));
            const ui = await js(`(async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              cm.showView('home');
              await wait(150);
              const home = document.querySelectorAll('#home-friends .social-listen').length;
              cm.showView('friends');
              await wait(300);
              return {
                home,
                rows: document.querySelectorAll('#view-friends .social-all .social-friend').length,
                listen: document.querySelectorAll('#view-friends .social-listen').length,
                cards: document.querySelectorAll('#view-friends .social-card .social-cover').length,
                homeCover: document.querySelectorAll('#home-friends .social-cover').length,
                emojis: document.querySelectorAll('#view-friends .social-emoji').length,
                count: document.querySelector('#friends-count').textContent,
                me: (document.querySelector('#view-friends .social-me') || {}).textContent || '',
              };
            })()`);
            const appState = await js('window.CleanMusic.socialState()');
            const appId = appState.me && appState.me.id;
            const reacted = await js(`window.CleanMusic.socialReact(${q(friend.id)}, '🔥')`);
            const played = await js(`window.CleanMusic.socialPlay(${q(friend.id)})`);
            let playing = false;
            for (let i = 0; i < 30 && played && !playing; i += 1) {
              await pause(400);
              playing = await js('!document.querySelector("#audio").paused');
            }
            const tickOff = await js('window.CleanMusic.socialTick()');
            const sharedBefore = fake.state().activity.some((row) => row.id === appId);
            await js('window.CleanMusic.socialShowActivity(true)');
            const sharedAfter = fake.state().activity.find((row) => row.id === appId);
            await friend.call('POST', '/v1/react', { to: appId, emoji: '🎧' });
            await js('window.CleanMusic.socialRefresh()');
            const inbox = (await js('window.CleanMusic.socialState()')).reactions;
            await js('window.CleanMusic.socialShowActivity(false)');
            const cleared = !fake.state().activity.some((row) => row.id === appId);
            await js('document.querySelector("#audio").pause()');
            // 2.1: the own "Mir online zeigen" switch (off by default) goes to the server and back.
            const onlineBefore = fake.state().presence.includes(appId);
            await js('window.CleanMusic.socialShowOnline(true)');
            const onlineOn = fake.state().presence.includes(appId);
            await js('window.CleanMusic.socialShowOnline(false)');
            const onlineOff = !fake.state().presence.includes(appId);
            // 2.1: a 2.0.x-style client (no `requests` flag) redeems an ask-code → readable message; decline is silent.
            const friend3 = await fake.remoteClient();
            const code3 = await js('window.CleanMusic.socialCode().then((made) => made && made.code)');
            const legacy = await friend3.call('POST', '/v1/friend/redeem', { code: code3 });
            await js('window.CleanMusic.socialRefresh()');
            const legacyVisible = (await js('window.CleanMusic.socialState()')).requests.some((row) => row.from.id === friend3.id);
            const declined = await js(`window.CleanMusic.socialDecline(${q(friend3.id)})`);
            const declinedGone = !(await js('window.CleanMusic.socialState()')).requests.length;
            const stillWaits = ((await friend3.call('GET', '/v1/friends')).data.sent || []).length === 1;
            const requestsOk = redeemed.status === 202 && requestUi.rows === 1 && requestUi.buttons === 2 && requestUi.count === '1' &&
              requestUi.badge && requestUi.friends === 0 && requestUi.note && accepted === true && onlineNote &&
              !onlineBefore && onlineOn && onlineOff && legacy.status === 409 && legacy.data.error === 'anfrage-gesendet' &&
              legacyVisible && declined === true && declinedGone && stillWaits;
            const friend2 = await fake.remoteClient();
            const code2 = (await friend2.call('POST', '/v1/friend-code', {})).data.code;
            const deep = parseDeepLink(`cleanmusic://friend?c=${code2}`);
            const deepOk = Boolean(deep && deep.action === 'friend' && deep.code === code2) &&
              parseDeepLink('cleanmusic://friend?c=F1-<script>') === null;
            const viaLink = await js(`window.CleanMusic.socialFriendLink(${q(code2)})`);
            await js(`window.CleanMusic.socialReport(${q(friend2.id)}, 'name')`);
            await js(`window.CleanMusic.socialBlock(${q(friend2.id)})`);
            const blocked = (await js('window.CleanMusic.socialState()')).blocked.map((row) => row.id);
            await js(`window.CleanMusic.socialUnblock(${q(friend2.id)})`);
            // S2: group – create, invite code (also as deep link), the friend joins,
            // week cards on both sides, shared playlist (add, remove), leave.
            const madeGroup = await js('window.CleanMusic.socialGroupCreate("Smoke Gruppe")');
            const gid = madeGroup && madeGroup.id;
            const groupCode = ((await js(`window.CleanMusic.socialGroupCode(${q(gid)})`)) || {}).code || '';
            const groupDeep = parseDeepLink(`cleanmusic://friend?c=${groupCode}`);
            const groupJoined = await friend.call('POST', '/v1/group/join', { code: groupCode });
            await friend.call('POST', '/v1/week', { week: '2026-W48', secs: 5400, plays: 12, artists: ['Linkin Park'] });
            await friend.call('POST', '/v1/group/track', { group: gid, ref: { src: 'search', id: '', title: 'Numb', artist: 'Linkin Park' } });
            await js('window.CleanMusic.socialRefresh()');
            await js('window.CleanMusic.socialTick()');
            const groupUi = await js(`(async () => {
              window.CleanMusic.showView('friends');
              await new Promise((resolve) => setTimeout(resolve, 250));
              return {
                groups: document.querySelectorAll('#view-friends .social-group').length,
                ranking: document.querySelectorAll('#view-friends .social-group .rv-group-list li').length,
                tracks: document.querySelectorAll('#view-friends .social-group [data-social="group-play"]').length,
              };
            })()`);
            const weekPushed = fake.state().weeks.includes(appId);
            const friendTrack = ((await js('window.CleanMusic.socialState()')).groups[0] || { tracks: [] }).tracks[0];
            const untracked = friendTrack ? await js(`window.CleanMusic.socialGroupUntrack(${q(gid)}, ${friendTrack.rid})`) : false;
            const added = await js(`window.CleanMusic.socialGroupAdd(${q(gid)})`);
            const groupTracks = (fake.state().groups.find((row) => row.id === gid) || {}).tracks;
            const left = await js(`window.CleanMusic.socialGroupLeave(${q(gid)})`);
            const groupsAfter = (await js('window.CleanMusic.socialState()')).groups.length;
            const groupOk = Boolean(gid) && /^G1-/.test(groupCode) && Boolean(groupDeep && groupDeep.action === 'friend') &&
              groupJoined.status === 201 && groupUi.groups === 1 && groupUi.ranking === 2 && groupUi.tracks === 1 && weekPushed &&
              untracked === true && added === true && groupTracks === 1 && left === true && groupsAfter === 0;
            // S3 "Gemeinsam hören": the friend hosts a room, the app follows (title,
            // pause, seek), takes over itself, follows again; then the host leaves,
            // the app becomes host and the friend (as guest) gets its state.
            const rooms = await (async () => {
              const out = {};
              const refA = { src: 'search', id: '', title: 'Numb', artist: 'Linkin Park' };
              const refB = { src: 'deezer', id: '3135553', title: 'One More Time', artist: 'Daft Punk' };
              const keyOf = (ref) => `${ref.src}:${ref.id}:${ref.title.toLowerCase()}`;
              const roomState = () => js('window.CleanMusic.socialRoomState()');
              const until = async (test, ms = 20000) => {
                for (let waited = 0; waited < ms; waited += 250) {
                  const now = await roomState();
                  if (test(now)) return now;
                  await pause(250);
                }
                return roomState();
              };
              const made = await friend.call('POST', '/v1/room', {});
              const code = made.data.code || '';
              const deepRoom = parseDeepLink(`cleanmusic://friend?c=${code}`);
              out.deep = Boolean(deepRoom && deepRoom.action === 'friend' && deepRoom.code === code);
              const hostSock = await friend.live();
              out.hello = Boolean(await hostSock.next('hello'));
              hostSock.send({ t: 'state', ref: refA, pos: 0, at: Date.now(), playing: true, full: false });
              await pause(200);
              const joined = await js(`window.CleanMusic.socialRoomJoin(${q(code)})`);
              out.joined = Boolean(joined && joined.id);
              out.members = ((await hostSock.next('members')) || { members: [] }).members.length;
              let st = await until((now) => now.status === 'open' && now.loadedKey === keyOf(refA) && now.player.playing);
              out.first = st.loadedKey === keyOf(refA) && st.player.playing;
              out.skew = Number.isFinite(st.skew);
              out.panel = await js('document.querySelectorAll("#view-friends .social-room.active .social-friend").length');
              hostSock.send({ t: 'state', ref: refB, pos: 0, at: Date.now(), playing: true, full: false });
              st = await until((now) => now.loadedKey === keyOf(refB) && now.player.key === keyOf(refB) && now.player.playing);
              out.track = st.player.key === keyOf(refB) && st.player.playing;
              hostSock.send({ t: 'state', ref: refB, pos: 3, at: Date.now(), playing: false, full: false });
              st = await until((now) => !now.player.playing, 6000);
              out.pause = !st.player.playing;
              hostSock.send({ t: 'state', ref: refB, pos: 15, at: Date.now(), playing: true, full: false });
              st = await until((now) => now.player.playing && now.player.position > 13 && now.player.position < 22, 8000);
              out.seek = Math.round(st.player.position * 10) / 10;
              await js('window.CleanMusic.socialRoomReact("🔥")');
              const react = await hostSock.next('react');
              out.react = react ? react.emoji : '';
              await pause(1700);
              await js('document.querySelector("#audio").pause()');
              st = await until((now) => now.following === false, 4000);
              out.takeOver = st.following === false;
              await js('window.CleanMusic.socialRoomFollow()');
              st = await until((now) => now.following && now.player.playing, 6000);
              out.followAgain = st.following && st.player.playing;
              await friend.call('POST', '/v1/room/leave', {});
              st = await until((now) => now.room && now.room.isHost, 6000);
              out.handOver = Boolean(st.room && st.room.isHost);
              await pause(500);
              await friend.call('POST', '/v1/room/join', { code });
              const guestSock = await friend.live();
              const hello = await guestSock.next('hello');
              out.hostState = hello && hello.room.state && hello.room.state.ref ? hello.room.state.ref.title : '';
              await pause(500);
              await js('document.querySelector("#audio").pause()');
              const paused = await guestSock.next('state');
              out.hostPause = Boolean(paused && paused.state.playing === false);
              await js('window.CleanMusic.socialRoomLeave(true)');
              const closed = await guestSock.next('closed');
              out.closed = closed ? closed.reason : '';
              out.roomsAfter = fake.state().rooms.length;
              st = await roomState();
              out.left = !st.room && !st.local.code;
              hostSock.close();
              guestSock.close();
              return out;
            })().catch((error) => ({ error: error.message }));
            const roomOk = rooms.deep && rooms.hello && rooms.joined && rooms.members === 2 && rooms.first && rooms.skew &&
              rooms.panel === 2 && rooms.track && rooms.pause && rooms.seek > 13 && rooms.seek < 22 && rooms.react === '🔥' &&
              rooms.takeOver && rooms.followAgain && rooms.handOver && rooms.hostState === 'One More Time' && rooms.hostPause &&
              rooms.closed === 'host' && rooms.roomsAfter === 0 && rooms.left;
            fake.setEnabled(false);
            const off = await js('window.CleanMusic.socialRefresh()');
            fake.setEnabled(true);
            const log = fake.state().log;
            const deleted = await js('window.CleanMusic.socialDelete()');
            const after = await js('window.CleanMusic.socialState()');
            const accountsLeft = fake.state().accounts;
            const result = {
              noServer: noServer.error,
              badServer: badServer.error || '',
              allowlist: [foreignPath.error, otherHost.error].join(','),
              enabled,
              keyEncrypted: !keyText.includes('PRIVATE KEY') && JSON.parse(keyText).v === 1,
              bridge: bridgeKeys,
              names: [badName, goodName].join(','),
              me: ui.me.trim(),
              redeemed: redeemed.status,
              friendRequests: requestsOk || { requestUi, accepted, onlineNote, onlineBefore, onlineOn, onlineOff, legacy: legacy.status, legacyVisible, declined, declinedGone, stillWaits },
              ui,
              qr: Boolean(appState.code && appState.code.qr),
              reacted,
              played: Boolean(played) && playing,
              tickOff,
              shared: [sharedBefore, Boolean(sharedAfter)].join(','),
              sharedRef: sharedAfter ? sharedAfter.ref.src : '',
              inbox: inbox.length,
              cleared,
              deepLink: deepOk,
              viaLink: Boolean(viaLink && viaLink.id === friend2.id),
              reports: fake.state().reports.length,
              blocked: blocked.includes(friend2.id),
              killSwitch: off === null,
              groups: groupOk || { gid: Boolean(gid), groupCode, joined: groupJoined.status, groupUi, weekPushed, untracked, added, groupTracks, left, groupsAfter },
              rooms: roomOk || rooms,
              signed: log.length > 0 && log.every((entry) => entry.signed),
              requests: log.length,
              deleted: Boolean(deleted) && !fs.existsSync(social.keyFile()) && !after.local.enabled && accountsLeft === 3,
            };
            await social.setServer('');
            await fake.close();
            const ok = result.noServer === 'kein-server' && result.badServer === 'adresse' && result.allowlist === 'adresse,adresse' &&
              enabled === true && result.keyEncrypted && result.bridge === 'onSocialRoom,socialInfo,socialNameCheck,socialRequest,socialRoom,socialServerSet,socialSetup' &&
              result.names === 'false,true' && result.me.startsWith('Smoke Tester') && requestsOk &&
              ui.home === 1 && ui.rows === 0 && ui.listen === 1 && ui.cards === 1 && ui.homeCover === 1 && ui.emojis === 5 && ui.count === '1' && result.qr &&
              reacted === true && result.played && tickOff === 'none' && result.shared === 'false,true' && result.inbox === 1 &&
              result.cleared && deepOk && result.viaLink && result.reports === 1 && result.blocked && result.killSwitch &&
              result.signed && result.deleted && groupOk && roomOk;
            if (!ok) throw new Error(JSON.stringify(result));
            console.log('SMOKE_SOCIAL_SERVER:', JSON.stringify(result));
          } catch (error) {
            console.error('SMOKE_SOCIAL_SERVER_FAIL:', error.message);
          }

          // Supporter extras: 7-day trial, reset after it, public code (no free button), ♥ + Ko-fi hint.
          try {
            const sup = await mainWindow.webContents.executeJavaScript(`
              (async () => {
                const cm = window.CleanMusic;
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                const DAY = 24 * 60 * 60 * 1000;
                const q = (selector) => document.querySelector(selector);
                const trial = (until) => ({ unlocked: false, how: '', at: 0, trialUntil: until, trialReset: false, trialNotice: false });
                const before = cm.supporterState();
                const extrasBefore = cm.supporterExtras();
                const fresh = !before.unlocked && before.trialUntil > Date.now() + 6 * DAY;
                const card = () => q('#view-settings [data-theme-id="synthwave"]');

                // Trial running: extras open, softer heart, no dialog.
                cm.supporterSet(trial(Date.now() + 3 * DAY));
                cm.openSettings('look');
                await wait(150);
                const trialMarked = Boolean(card() && card().classList.contains('extra-trial') && !card().classList.contains('extra-locked'));
                card().click();
                await wait(150);
                const trialOpen = q('#dialog').hidden && cm.supporterExtras().theme === 'synthwave';

                // Trial over: active extras go back to the free defaults, card once.
                cm.supporterExtras({ lyricsEffect: 'neon', vizStyle: 'mirror' });
                cm.supporterSet(trial(Date.now() - 1000));
                const first = cm.supporterCheckTrial();
                const extrasAfter = cm.supporterExtras();
                const reset = extrasAfter.theme === 'nacht' && extrasAfter.lyricsEffect === 'pop' && extrasAfter.vizStyle === 'radial' &&
                  (first.reset || []).join(',') === 'theme,lyricsEffect,vizStyle';
                const trialCard = cm.supportCard();
                const second = cm.supporterCheckTrial();
                const once = first.notice === true && second.reset === null && second.notice === false &&
                  trialCard.kind === 'trial' && !trialCard.hidden && /7 Tage/.test(trialCard.text) && /kostenlos auf Ko-fi/.test(trialCard.text);
                cm.supportCardClose();

                // Locked now: heart marks it, the ♥ button and the dialog have no free button.
                cm.openSettings('look');
                await wait(150);
                const marked = Boolean(card() && card().classList.contains('extra-locked'));
                const freeOpen = Boolean(q('#view-settings [data-theme-id="nacht"]:not(.extra-locked):not(.extra-trial)'));
                const nav = q('#nav-support');
                const navOk = Boolean(nav && nav.offsetParent && /Unterstützen/.test(nav.textContent));
                nav.click();
                await wait(120);
                const navDialog = !q('#dialog').hidden && q('#dialog-title').textContent === 'CleanMusic unterstützen';
                q('#dialog-cancel').click();
                await wait(80);
                card().click();
                await wait(120);
                const dialog = !q('#dialog').hidden && q('#dialog-title').textContent === 'Supporter-Extra';
                const below = q('#dialog-form .unlock-below');
                const dialogOk = dialog && !q('#dialog [data-unlock="free"]') &&
                  /Auf Ko-fi unterstützen/.test((q('#dialog-text .unlock-kofi[data-unlock="kofi"]') || {}).textContent || '') &&
                  Boolean(below && q('#dialog-input').nextElementSibling === below) &&
                  /Den Code findest du kostenlos auf meiner Ko-fi-Seite und im Discord/.test(below ? below.textContent : '') &&
                  /Code kostenlos auf Ko-fi ansehen/.test((q('#dialog-form [data-unlock="code"]') || {}).textContent || '');
                q('#dialog-input').value = 'falsch';
                q('#dialog-form').requestSubmit();
                await wait(120);
                const wrongLocked = !cm.supporterState().unlocked && cm.extraLocked('theme', 'synthwave') && !q('#dialog-form .unlock-below');
                // The public code unlocks everything and applies the theme.
                card().click();
                await wait(120);
                q('#dialog-input').value = 'danke-cleanmusic';
                q('#dialog-form').requestSubmit();
                await wait(200);
                const after = cm.supporterState();
                const applied = Boolean(card() && card().classList.contains('active') && !card().classList.contains('extra-locked'));
                const allOpen = !cm.extraLocked('lyricsEffect', 'neon') && !cm.extraLocked('background', 'lava');

                // Ko-fi hint: never in the smoke run, needs 10 h, once in 30 days, "Nicht mehr zeigen" sticks.
                cm.kofiHintReset();
                const hint = {
                  smoke: cm.kofiHint({ force: false, secs: 50 * 3600 }),
                  under: cm.kofiHint({ secs: 9 * 3600 }),
                  shown: cm.kofiHint({ secs: 12 * 3600 }),
                };
                const hintCard = cm.supportCard();
                hint.card = hintCard.kind === 'hint' && /12 Stunden/.test(hintCard.text) && Boolean(q('#support-card [data-support-card="never"]'));
                q('#support-card [data-support-card="close"]').click();
                hint.closed = cm.supportCard().hidden;
                hint.again = cm.kofiHint({ secs: 12 * 3600 });
                hint.month = cm.kofiHint({ secs: 12 * 3600, now: Date.now() + 31 * DAY });
                q('#support-card [data-support-card="never"]').click();
                hint.off = Boolean((cm.kofiHintState() || {}).off) && cm.kofiHint({ secs: 99 * 3600, now: Date.now() + 90 * DAY }) === false;
                cm.kofiHintReset();

                const extrasNow = cm.supporterExtras();
                const restore = {};
                ['theme', 'lyricsEffect', 'vizStyle'].forEach((key) => { if (extrasNow[key] !== extrasBefore[key]) restore[key] = extrasBefore[key]; });
                cm.supporterExtras(restore);
                cm.supporterSet(before);
                return { fresh, trialMarked, trialOpen, reset, once, marked, freeOpen, navOk, navDialog, dialogOk, wrongLocked, how: after.how, applied, allOpen, hint };
              })()
            `);
            const h = sup.hint || {};
            const supOk = sup.fresh && sup.trialMarked && sup.trialOpen && sup.reset && sup.once && sup.marked && sup.freeOpen &&
              sup.navOk && sup.navDialog && sup.dialogOk && sup.wrongLocked && sup.how === 'code' && sup.applied && sup.allOpen &&
              h.smoke === false && h.under === false && h.shown === true && h.card && h.closed && h.again === false && h.month === true && h.off;
            if (!supOk) throw new Error(JSON.stringify(sup));
            console.log('SMOKE_SUPPORTER:', JSON.stringify(sup));
          } catch (error) {
            console.error('SMOKE_SUPPORTER_FAIL:', error.message);
          }

          // "Warum läuft das?" explains source, license and queue origin.
          const whySmoke = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              cm.playList('charts', 0);
              await wait(900);
              const button = document.querySelector('#btn-np-why');
              const enabled = Boolean(button && !button.disabled);
              if (button) button.click();
              await wait(180);
              const dialog = document.querySelector('#dialog');
              const open = !dialog.hidden;
              const title = (document.querySelector('#dialog-title') || {}).textContent || '';
              const rows = dialog.querySelectorAll('.why-grid > div').length;
              const text = (document.querySelector('#dialog-text') || {}).textContent || '';
              const close = document.querySelector('#dialog-ok');
              if (close) close.click();
              await wait(100);
              return {
                enabled,
                open,
                title,
                rows,
                hasSource: /Quelle|Herkunft/.test(text),
                hasLicense: /Lizenz/.test(text),
                closed: dialog.hidden,
              };
            })()
          `);
          console.log('SMOKE_WHY:', JSON.stringify(whySmoke));

          const settingsSmoke = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              cm.showView('settings');
              await wait(150);
              const ids = ['playback', 'sound', 'look', 'plugins', 'connections', 'system'];
              const panels = {};
              for (const id of ids) {
                const tab = document.querySelector('#view-settings [data-settings-tab="' + id + '"]');
                if (!tab) continue;
                tab.click();
                await wait(80);
                panels[id] = {
                  panels: document.querySelectorAll('#view-settings .panel').length,
                  title: (document.querySelector('#view-settings .page-head h2') || {}).textContent || '',
                };
              }
              const active = document.querySelector('#view-settings .settings-tab.active');
              return {
                support: Boolean(document.querySelector('#view-settings #support-panel [data-support="open"]')),
                tabs: document.querySelectorAll('#view-settings [data-settings-tab]').length,
                active: active ? active.dataset.settingsTab : '',
                panels,
              };
            })()
          `);
          console.log('SMOKE_SETTINGS:', JSON.stringify(settingsSmoke));
          if (!settingsSmoke.support) console.error('SMOKE_SUPPORT_FAIL: Unterstützen-Bereich fehlt im System-Tab');

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
              const musicButton = Boolean(document.querySelector('#onboarding [data-ob-action="music"]'));
              const musicCredit = Boolean(document.querySelector('#onboarding .ob-credit'));
              ob.click('[data-ob-theme="dracula"]');
              const themed = cm.theme().id;
              for (let i = 0; i < 5; i += 1) {
                steps.push(ob.state().title);
                ob.click('[data-ob-action="next"]');
                await wait(50);
              }
              const done = ob.state();
              cm.setTheme('nacht');
               const shown = cm.whatsNew('1.13.0');
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
                musicButton,
                musicCredit,
                whatsNew: shown && card && cardClosed,
              };
            })()
          `);
          console.log('SMOKE_ONBOARDING:', JSON.stringify(onboardingResult));

          // Update card shows every changelog between the previous and the
          // current version, not just the newest one.
          const whatsNewSmoke = await mainWindow.webContents.executeJavaScript(`
            (() => {
              const cm = window.CleanMusic;
              const card = document.querySelector('#whatsnew-card');
              const title = () => (card.querySelector('.update-text > strong') || {}).textContent || '';
              const groups = () => card.querySelectorAll('.whatsnew-version').length;
              const items = () => card.querySelectorAll('.whatsnew-list li').length;
              const multi = cm.whatsNew('1.20.1', '1.18.1');
              const multiState = { title: title(), groups: groups(), items: items() };
              card.querySelector('[data-whatsnew="ok"]').click();
              const one = cm.whatsNew('1.20.1', '1.20.0');
              const oneState = { title: title(), groups: groups(), items: items() };
              card.querySelector('[data-whatsnew="ok"]').click();
              const same = cm.whatsNew('1.20.1', '1.20.1');
              const current = cm.whatsNew('1.20.1', '');
              const currentState = { title: title(), groups: groups(), items: items() };
              card.querySelector('[data-whatsnew="ok"]').click();
              return {
                multi,
                multiState,
                one,
                oneState,
                same,
                sameHidden: card.hidden,
                current,
                currentState,
                closed: card.hidden,
              };
            })()
          `);
          console.log('SMOKE_WHATS_NEW:', JSON.stringify(whatsNewSmoke));

          let playlistImportChecks;
          try {
            playlistImportChecks = await runSpotifyImportSmoke();
          } catch (error) {
            playlistImportChecks = { error: cleanText(error && error.message, 200) };
          }
          let playlistImportUi;
          try {
            playlistImportUi = await mainWindow.webContents.executeJavaScript(`
              (async () => ({
                dialog: await window.CleanMusic.playlistImportDialogSmoke(),
                import: await window.CleanMusic.importSpotifySmoke(),
              }))()
            `);
          } catch (error) {
            playlistImportUi = { error: cleanText(error && error.message, 200) };
          }
          console.log('SMOKE_PLAYLIST_IMPORT:', JSON.stringify({ ...playlistImportChecks, renderer: playlistImportUi }));

          // Shortcut overview (1.0): "?" opens it, Escape closes it.
          const shortcutsResult = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
              await wait(80);
              const open = !document.querySelector('#dialog').hidden;
              const title = document.querySelector('#dialog-title').textContent;
              const rows = document.querySelectorAll('#dialog-text kbd').length;
              const cancelHidden = document.querySelector('#dialog-cancel').hidden;
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
              await wait(80);
              return { open, title, rows, cancelHidden, closed: document.querySelector('#dialog').hidden, cancelBack: !document.querySelector('#dialog-cancel').hidden };
            })()
          `);
          console.log('SMOKE_SHORTCUTS:', JSON.stringify(shortcutsResult));

          // AI filter (1.4): labelled songs yes, real names no.
          const aiResult = await mainWindow.webContents.executeJavaScript(`
            (() => {
              const check = window.CleanMusic.aiCheck;
              const yes = ['Song (AI Cover)', 'Suno Mix', 'KI-generiert', 'Track [AI]', 'Made with Udio', 'AI-generated Lofi'];
              const no = ['Kaiser Chiefs', 'Ai Otsuka', 'Pakistan', 'Kim Petras', 'Sunrise Avenue', 'Raindrops'];
              return {
                flagged: yes.filter((t) => check(t)).length + '/' + yes.length,
                clean: no.filter((t) => !check(t)).length + '/' + no.length,
                wrong: yes.filter((t) => !check(t)).concat(no.filter((t) => check(t))),
                youtubeTab: window.CleanMusic.creatorTabs().includes('youtube'),
              };
            })()
          `);
          console.log('SMOKE_AI_FILTER:', JSON.stringify(aiResult));

          // 1.5: backgrounds, themes, stream-safe badge, "Für dich", moods, lyrics, up next.
          const v15 = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const out = {};
              cm.setBackground('aurora');
              out.background = document.documentElement.dataset.bg || '';
              cm.setBackground('none');
              out.backgroundOff = !document.documentElement.dataset.bg;
              out.themes = window.CM_THEMES.length;
              cm.setStreamSafe(true);
              await new Promise((resolve) => setTimeout(resolve, 300));
              const badge = document.querySelector('#stream-badge');
              out.streamBadge = badge && !badge.hidden ? badge.textContent : '';
              cm.setStreamSafe(false);
              out.forYou = (await cm.creatorForYou('mix')).length;
              out.moods = ['Chill Lofi Beats', 'Party Hits 2024', 'Gym Workout Mix', 'Urlaub'].map((dir) => cm.guessMood({ dir, title: '' }) || '-');
              const lyrics = await window.cm.lyricsGet({ title: 'One More Time', artist: 'Daft Punk', duration: 320 });
              out.lyrics = { synced: lyrics.lines.length, plain: Boolean(lyrics.plain), error: lyrics.error };
              out.upNext = Array.isArray(cm.playerSnapshot().upNext);
              return out;
            })()
          `);
          console.log('SMOKE_V15:', JSON.stringify(v15));

          // Lyrics: a title that turns out to be a 30-s preview gets the static view (and back).
          try {
            const lyricMode = await mainWindow.webContents.executeJavaScript('window.CleanMusic.lyricsModeTest()');
            if (!(lyricMode && lyricMode.before === 3 && lyricMode.preview && lyricMode.full === 3)) {
              throw new Error(JSON.stringify(lyricMode));
            }
            console.log('SMOKE_LYRICS_MODE:', JSON.stringify(lyricMode));
          } catch (error) {
            console.error('SMOKE_LYRICS_MODE_FAIL:', error.message);
          }

          // Lyric-Video-Effekt: Wörter, ein Akzent-Schlüsselwort, stabiler Seed.
          try {
            const first = await mainWindow.webContents.executeJavaScript('window.CleanMusic.lyricsEffectTest("lyricvideo", 0)');
            const second = await mainWindow.webContents.executeJavaScript('window.CleanMusic.lyricsEffectTest("lyricvideo", 0)');
            if (!(first && first.effect === 'lyricvideo' && first.words > 0 && first.accent === 1 && first.html === second.html)) {
              throw new Error(JSON.stringify({ first, seedStable: first && first.html === second.html }));
            }
            console.log('SMOKE_LYRIC_VIDEO:', JSON.stringify({ words: first.words, accent: first.accent, seedStable: first.html === second.html }));
          } catch (error) {
            console.error('SMOKE_LYRIC_VIDEO_FAIL:', error.message);
          }

          // Studio (2.0): Timeline rendern (Datenmodell + WAV) und Export per IPC.
          try {
            const studio = await mainWindow.webContents.executeJavaScript('window.CleanMusic.studioSmoke()');
            if (!(studio && studio.clips === 2 && studio.safe && studio.riff && studio.ordered && studio.changes && studio.total === 6 * 44100)) {
              throw new Error(JSON.stringify(studio));
            }
            const preview = await mainWindow.webContents.executeJavaScript('window.CleanMusic.studioPreviewSmoke()');
            if (!(preview && preview.button && preview.effects && preview.transitions && preview.total)) {
              throw new Error(JSON.stringify(preview));
            }
            const studioDir = fs.mkdtempSync(path.join(app.getPath('temp'), 'cleanmusic-smoke-studio-'));
            let exportSmoke = null;
            try {
              const exported = await mainWindow.webContents.executeJavaScript(`window.CleanMusic.studioExportSmoke(${JSON.stringify(studioDir)})`);
              const wavPath = exported && exported.name ? path.join(studioDir, '_Studio', exported.name) : '';
              exportSmoke = {
                ok: Boolean(exported && exported.ok),
                safe: Boolean(exported && exported.safe),
                changes: Boolean(exported && exported.changes),
                wav: fs.existsSync(wavPath),
                txt: fs.existsSync(wavPath && wavPath.replace(/\.wav$/i, '') + '.txt'),
              };
            } finally {
              fs.rmSync(studioDir, { recursive: true, force: true });
            }
            console.log('SMOKE_STUDIO:', JSON.stringify({ render: studio, export: exportSmoke, preview }));
          } catch (error) {
            console.error('SMOKE_STUDIO_FAIL:', error.message);
          }

          // Store foundation (2.0 Phase 1): wrap-by-reference, subscribe, settings.
          try {
            const stateStore = await mainWindow.webContents.executeJavaScript('window.CleanMusic.stateStoreTest()');
            if (!(stateStore && stateStore.changed && stateStore.notified && stateStore.theme === 'nacht' && stateStore.normalized)) {
              throw new Error(JSON.stringify(stateStore));
            }
            console.log('SMOKE_STATE:', JSON.stringify(stateStore));
          } catch (error) {
            console.error('SMOKE_STATE_FAIL:', error.message);
          }

          // Queue slice (2.0 Phase 1): list operations through the store slice.
          try {
            const queueSmoke = await mainWindow.webContents.executeJavaScript('window.CleanMusic.queueSliceTest()');
            const queueOk =
              queueSmoke &&
              queueSmoke.inserted &&
              queueSmoke.removed === true &&
              queueSmoke.appended &&
              queueSmoke.cleared === 2 &&
              queueSmoke.seed &&
              Array.isArray(queueSmoke.items) &&
              queueSmoke.items.join(',') === 'qa';
            if (!queueOk) throw new Error(JSON.stringify(queueSmoke));
            console.log('SMOKE_QUEUE_SLICE:', JSON.stringify(queueSmoke));
          } catch (error) {
            console.error('SMOKE_QUEUE_SLICE_FAIL:', error.message);
          }

          // Collection helpers (2.0 Phase 1): favourites, playlists, history.
          try {
            const collectionSmoke = await mainWindow.webContents.executeJavaScript('window.CleanMusic.collectionSliceTest()');
            const collectionOk =
              collectionSmoke &&
              collectionSmoke.prepended &&
              collectionSmoke.removed &&
              collectionSmoke.restored &&
              collectionSmoke.untouched &&
              collectionSmoke.fresh &&
              collectionSmoke.history;
            if (!collectionOk) throw new Error(JSON.stringify(collectionSmoke));
            console.log('SMOKE_COLLECTION:', JSON.stringify(collectionSmoke));
          } catch (error) {
            console.error('SMOKE_COLLECTION_FAIL:', error.message);
          }

          // Volume rules (2.0 Phase 1): ear-friendly curve, boost ceiling, mute.
          try {
            const volumeSmoke = await mainWindow.webContents.executeJavaScript('window.CleanMusic.volumeSliceTest()');
            const volumeOk =
              volumeSmoke &&
              volumeSmoke.max &&
              volumeSmoke.curve &&
              volumeSmoke.mute &&
              volumeSmoke.unmute &&
              volumeSmoke.clamped &&
              volumeSmoke.element;
            if (!volumeOk) throw new Error(JSON.stringify(volumeSmoke));
            console.log('SMOKE_VOLUME_RULES:', JSON.stringify(volumeSmoke));
          } catch (error) {
            console.error('SMOKE_VOLUME_RULES_FAIL:', error.message);
          }

          // Playback rules (2.0 Phase 1): repeat cycle, labels, buttons, autoplay gate.
          try {
            const playbackSmoke = await mainWindow.webContents.executeJavaScript('window.CleanMusic.playbackSliceTest()');
            const playbackOk =
              playbackSmoke &&
              playbackSmoke.cycle &&
              playbackSmoke.oneActive &&
              playbackSmoke.shuffleActive &&
              playbackSmoke.label &&
              playbackSmoke.normalized &&
              playbackSmoke.blocks;
            if (!playbackOk) throw new Error(JSON.stringify(playbackSmoke));
            console.log('SMOKE_PLAYBACK:', JSON.stringify(playbackSmoke));
          } catch (error) {
            console.error('SMOKE_PLAYBACK_FAIL:', error.message);
          }

          // Statistics helpers (2.0 Phase 1): listening time, plays, review totals.
          try {
            const statsSmoke = await mainWindow.webContents.executeJavaScript('window.CleanMusic.statsSliceTest()');
            const statsOk =
              statsSmoke &&
              statsSmoke.listened &&
              statsSmoke.played &&
              statsSmoke.artist &&
              statsSmoke.week &&
              statsSmoke.review &&
              statsSmoke.real &&
              statsSmoke.total;
            if (!statsOk) throw new Error(JSON.stringify(statsSmoke));
            console.log('SMOKE_STATS:', JSON.stringify(statsSmoke));
          } catch (error) {
            console.error('SMOKE_STATS_FAIL:', error.message);
          }

          // Taste rules (2.0 Phase 1): feedback, score, skips, artists, stats.
          try {
            const tasteSmoke = await mainWindow.webContents.executeJavaScript('window.CleanMusic.tasteSliceTest()');
            const tasteOk =
              tasteSmoke && tasteSmoke.set && tasteSmoke.scored && tasteSmoke.cleared && tasteSmoke.skipped && tasteSmoke.artists && tasteSmoke.stats;
            if (!tasteOk) throw new Error(JSON.stringify(tasteSmoke));
            console.log('SMOKE_TASTE_RULES:', JSON.stringify(tasteSmoke));
          } catch (error) {
            console.error('SMOKE_TASTE_RULES_FAIL:', error.message);
          }

          // Mix rules (2.0 Phase 1): five mixes, limits, deterministic order.
          try {
            const mixesSmoke = await mainWindow.webContents.executeJavaScript('window.CleanMusic.mixesSliceTest()');
            const mixesOk = mixesSmoke && mixesSmoke.five && mixesSmoke.deterministic && mixesSmoke.limited && mixesSmoke.defs;
            if (!mixesOk) throw new Error(JSON.stringify(mixesSmoke));
            console.log('SMOKE_MIXES:', JSON.stringify(mixesSmoke));
          } catch (error) {
            console.error('SMOKE_MIXES_FAIL:', error.message);
          }

          // 1.6: artist page, share link, deep link (cleanmusic://).
          const deepOk = parseDeepLink('cleanmusic://play?src=deezer&id=3135553&t=One%20More%20Time&a=Daft%20Punk');
          const deepAdd = parseDeepLink('cleanmusic://add?src=youtube&id=dQw4w9WgXcQ&t=Never%20Gonna%20Give%20You%20Up&a=Rick%20Astley');
          const deepBad = [
            'cleanmusic://play?src=file&id=1',
            'cleanmusic://play?src=youtube&id=../../x',
            'https://evil.example/?src=deezer&id=1',
          ].map((link) => parseDeepLink(link));
          const v16 = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const share = cm.shareUrl({ id: 'deezer:3135553', kind: 'preview', title: 'One More Time', artist: 'Daft Punk' });
              await cm.openArtist({ name: 'Daft Punk' });
              const artist = cm.artistPage();
              cm.showView('home');
              return { share, artist };
            })()
          `);
          sendToRenderer('deep-link', deepOk);
          await new Promise((resolve) => setTimeout(resolve, 6000));
          v16.deepLink = await mainWindow.webContents.executeJavaScript('(window.CleanMusic.playerSnapshot().track || {}).title || ""');
          v16.deepParsed = Boolean(deepOk && deepOk.src === 'deezer');
          v16.deepAdd = Boolean(deepAdd && deepAdd.action === 'add' && deepAdd.src === 'youtube' && deepAdd.id === 'dQw4w9WgXcQ');
          v16.deepRejected = deepBad.every((link) => link === null);
          console.log('SMOKE_V16:', JSON.stringify(v16));

          // 1.7: BPM, review, transitions, WAV export.
          const v17 = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const out = {};
              out.bpmSynthetic = [cm.bpmSynthetic(120), cm.bpmSynthetic(95), cm.bpmSynthetic(150)];
              out.bpmReal = await cm.bpmOf('https://incompetech.com/music/royalty-free/mp3-royaltyfree/Monkeys%20Spinning%20Monkeys.mp3');
              out.bpmForeign = await cm.bpmOf('https://example.com/x.mp3');
              cm.statsTest({ id: 'test:1', kind: 'preview', title: 'Smoke Song', artist: 'Smoke Artist', sourceLabel: 'Vorschau' }, 125);
              out.review = cm.reviewSummary('month');
              cm.showView('review');
              out.reviewView = Boolean(document.querySelector('#view-review .rv-tiles'));
              cm.showView('home');
              cm.setTransition('crossfade');
              out.transition = cm.transitionMode();
              cm.setTransition('off');
              out.wav = cm.wavTest();
              return out;
            })()
          `);
          console.log('SMOKE_V17:', JSON.stringify(v17));

          // 1.8: download list + search – in a throwaway folder with two test files.
          const listDir = path.join(app.getPath('temp'), 'cleanmusic-smoke-dllist');
          fs.rmSync(listDir, { recursive: true, force: true });
          fs.mkdirSync(path.join(listDir, 'Kevin MacLeod - Lustig'), { recursive: true });
          fs.writeFileSync(path.join(listDir, 'Kevin MacLeod - Lustig', 'Kevin MacLeod - Fluffing a Duck.mp3'), Buffer.alloc(64));
          fs.writeFileSync(
            path.join(listDir, 'Kevin MacLeod - Lustig', 'Kevin MacLeod - Fluffing a Duck.txt'),
            'Titel: Fluffing a Duck\r\nVon: Kevin MacLeod\r\nLizenz: CC BY 4.0\r\n\r\nCredit für deine Videobeschreibung:\r\n"Fluffing a Duck" Kevin MacLeod (incompetech.com)\r\n'
          );
          fs.mkdirSync(path.join(listDir, 'Schnitte'), { recursive: true });
          fs.writeFileSync(path.join(listDir, 'Schnitte', 'Other Song (0-10 bis 0-20).wav'), Buffer.alloc(64));
          const v18 = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              cm.setDownloads('off', ${JSON.stringify(listDir)});
              const all = await cm.downloadsView('');
              const duck = await cm.downloadsView('duck macleod');
              const none = await cm.downloadsView('gibtsnicht xyz');
              cm.setDownloads('off', '');
              cm.showView('home');
              return { all, duck, none };
            })()
          `);
          fs.rmSync(listDir, { recursive: true, force: true });
          v18.layout = await mainWindow.webContents.executeJavaScript(`
            (() => {
              const cm = window.CleanMusic;
              cm.setLayout('simple');
              const hidden = getComputedStyle(document.querySelector('.nav-item[data-view="creator"]')).display === 'none';
              cm.setLayout('advanced');
              const shown = getComputedStyle(document.querySelector('.nav-item[data-view="creator"]')).display !== 'none';
              cm.setVinyl(true);
              const vinyl = document.documentElement.classList.contains('cover-vinyl') && getComputedStyle(document.querySelector('.fs-tonearm')).display === 'block';
              cm.setVinyl(false);
              if (!vinyl) return { hiddenInSimple: hidden, shownInAdvanced: shown, vinyl: false };
              return { hiddenInSimple: hidden, shownInAdvanced: shown };
            })()
          `);
          console.log('SMOKE_V18:', JSON.stringify(v18));

          // 1.14: pre-made playlists (stream-safe + normal) render as cards.
          const presetsSmoke = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              cm.showView('presets');
              const out = {
                cards: document.querySelectorAll('#view-presets .preset-card').length,
                safe: document.querySelectorAll('#view-presets [data-preset-kind="safe"]').length,
                normal: document.querySelectorAll('#view-presets [data-preset-kind="normal"]').length,
              };
              out.playlist = await cm.presetSmoke('emotional');
              cm.showView('home');
              return out;
            })()
          `);
          console.log('SMOKE_PRESETS:', JSON.stringify(presetsSmoke));

          const liveBg = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const ids = ['lava', 'waves', 'synthwave', 'nebula', 'rain'];
              const pixels = {};
              for (const id of ids) {
                cm.setBackground(id);
                const image = window.CMLiveBackground.renderTestFrame(id);
                let count = 0;
                if (image) for (let i = 3; i < image.data.length; i += 4) if (image.data[i] > 0) count += 1;
                pixels[id] = count;
              }
              cm.setBackground('lava');
              cm.setBgMotion(true);
              cm.setBgPulse(true);
              const audio = document.querySelector('#audio');
              if (audio.src && audio.paused) await audio.play().catch(() => {});
              const beatBefore = Number(getComputedStyle(document.documentElement).getPropertyValue('--beat')) || 0;
              await new Promise((resolve) => setTimeout(resolve, 450));
              const beatAfter = Number(getComputedStyle(document.documentElement).getPropertyValue('--beat')) || 0;
              const beatChanged = beatAfter > 0 || beatAfter !== beatBefore;
              window.CMLiveBackground.setVisibilityForTest(true);
              const hiddenPaused = window.CMLiveBackground.state().paused && !window.CMLiveBackground.state().running;
              window.CMLiveBackground.setVisibilityForTest(false);
              await new Promise((resolve) => setTimeout(resolve, 160));
              const frameIntervalMs = window.CMLiveBackground.state().lastFrameDelta;
              cm.setBgMotion(false);
              const motionOffPaused = window.CMLiveBackground.state().paused && !window.CMLiveBackground.state().running;
              cm.setBgMotion(true);
              cm.openFullscreen();
              const fullscreen = {};
              for (const mode of ['cover-static', 'cover-moving', 'live', 'off']) {
                cm.setFsBackground(mode);
                fullscreen[mode] = document.querySelector('#fullscreen').classList.contains('fs-background-' + mode);
              }
              cm.closeFullscreen();
              cm.setFsBackground('cover-moving');
              cm.setBgPulse(false);
              cm.setBackground('none');
              return {
                pixels,
                allRendered: ids.every((id) => pixels[id] > 0),
                beat: { before: beatBefore, after: beatAfter, changed: beatChanged },
                hiddenPaused,
                motionOffPaused,
                fullscreen,
                videoMuted: window.CMLiveBackground.state().videoMuted && window.CMLiveBackground.state().videoVolume === 0,
                fpsAtMost30: frameIntervalMs === 0 || frameIntervalMs >= 1000 / 30 - 0.5,
                frameIntervalMs,
              };
            })()
          `);
          console.log('SMOKE_LIVEBG:', JSON.stringify(liveBg));

          const performance = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
              cm.openSettings('look');
              await wait(80);
              const controls = {
                panel: Boolean(document.querySelector('#performance-panel')),
                level: Boolean(document.querySelector('#opt-performance')),
                fsToggle: Boolean(document.querySelector('#opt-fs-viz')),
              };
              const initial = cm.performanceInfo();
              cm.setPerformance('saver');
              cm.openFullscreen();
              await wait(500);
              const saver = cm.performanceInfo();
              const saverLive = cm.liveBg();
              cm.setFsVisualizer(false);
              await wait(80);
              const fsOff = cm.performanceInfo();
              const offStyle = document.querySelector('#fs-styles [data-fs-style="off"]').classList.contains('active');
              cm.setFsVisualizer(true);
              cm.setPerformance('quality');
              await wait(500);
              const quality = cm.performanceInfo();
              const qualityLive = cm.liveBg();
              const qualityStyle = document.querySelector('#fs-styles [data-fs-style="radial"]').classList.contains('active');
              cm.setPerformance('balanced');
              cm.closeFullscreen();
              cm.showView('home');
              const balancedLive = cm.liveBg();
              return {
                controls,
                initial: initial.id,
                saver: {
                  id: saver.id,
                  fps: saver.canvasPerformance && saver.canvasPerformance.maxFps,
                  liveFps: saverLive.maxFps,
                  resolution: saverLive.resolution,
                  shadow: saver.canvasPerformance && saver.canvasPerformance.shadow,
                  ratio: saver.canvas && saver.canvas.clientWidth ? Number((saver.canvas.width / saver.canvas.clientWidth).toFixed(3)) : null,
                  frameMs: saver.canvasPerformance && saver.canvasPerformance.lastFrameDelta,
                },
                fsOff: { hidden: fsOff.fsVizHidden, offStyle },
                quality: {
                  id: quality.id,
                  fps: quality.canvasPerformance && quality.canvasPerformance.maxFps,
                  liveFps: qualityLive.maxFps,
                  liveResolution: qualityLive.resolution,
                  ratio: quality.canvas && quality.canvas.clientWidth ? Number((quality.canvas.width / quality.canvas.clientWidth).toFixed(3)) : null,
                  qualityStyle,
                  frameMs: quality.canvasPerformance && quality.canvasPerformance.lastFrameDelta,
                },
                balancedLive: { maxFps: balancedLive.maxFps, resolution: balancedLive.resolution },
              };
            })()
          `);
          console.log('SMOKE_PERF:', JSON.stringify(performance));

          const v113Ui = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              const cm = window.CleanMusic;
              const eq = await cm.equalizerTest();
              const wav = cm.wavEffectsTest();
              const project = cm.cutProjectSmoke();
              const story = await cm.reviewImageTest('story');
              const post = await cm.reviewImageTest('post');
              return {
                eq,
                wav,
                project: { count: project.count, deduped: project.deduped },
                images: { story: story.startsWith('data:image/png;base64,'), post: post.startsWith('data:image/png;base64,'), storyBytes: Math.floor(story.length * 0.75), postBytes: Math.floor(post.length * 0.75) },
              };
            })()
          `);
          const v113Dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'cleanmusic-smoke-113-'));
          let autoBackupSmoke = null;
          let projectSaveSmoke = null;
          try {
            fs.writeFileSync(path.join(v113Dir, 'keep.txt'), 'keep');
            for (let index = 0; index < 6; index += 1) {
              const file = path.join(v113Dir, `cleanmusic-backup-20200101-00000${index}.json`);
              fs.writeFileSync(file, '{}');
              fs.utimesSync(file, new Date(2020, 0, index + 1), new Date(2020, 0, index + 1));
            }
            const result = await mainWindow.webContents.executeJavaScript(`
              (async () => ({
                backup: await window.cm.backupAutoSave({ folder: ${JSON.stringify(v113Dir)}, text: JSON.stringify({ app: 'CleanMusic', kind: 'backup', format: 1 }) }),
                project: await window.cm.projectCreditsSave({ folder: ${JSON.stringify(v113Dir)}, name: 'Smoke Video', text: ${JSON.stringify(v113Ui.project && v113Ui.project.text || 'Smoke credits')} }),
              }))()
            `);
            const backups = fs.readdirSync(v113Dir).filter((name) => /^cleanmusic-backup-.*\.json$/i.test(name));
            autoBackupSmoke = { ok: Boolean(result.backup && result.backup.ok), kept: backups.length, keptOtherFile: fs.existsSync(path.join(v113Dir, 'keep.txt')) };
            const savedProject = result.project && result.project.path;
            projectSaveSmoke = { ok: Boolean(result.project && result.project.ok), withinFolder: Boolean(savedProject && path.relative(v113Dir, savedProject).startsWith(`_Projekte${path.sep}`)), txt: Boolean(savedProject && path.extname(savedProject) === '.txt') };
          } finally {
            fs.rmSync(v113Dir, { recursive: true, force: true });
          }
          console.log('SMOKE_1_13:', JSON.stringify({ ...v113Ui, autoBackup: autoBackupSmoke, projectSave: projectSaveSmoke }));
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
              window.CleanMusic.openSettings('plugins');
              await new Promise((resolve) => setTimeout(resolve, 100));
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

        // Optional: the OBS audio visualizer plugin from extras/ (spectrum end to end).
        if (isSmokeVisualizer) {
          try {
            console.log('SMOKE_VISUALIZER:', JSON.stringify(await smokeVisualizerPlugin()));
          } catch (error) {
            console.error('SMOKE_VISUALIZER_FAIL:', error.message);
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
                const candidates = cm.plugins().filter((plugin) => plugin.file);
                const candidate = candidates.find((plugin) => plugin.id === 'ytdlp') || candidates[0];
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

                let youtubePlaylist = null;
                try {
                  youtubePlaylist = await cm.youtubePlaylistSmoke();
                  if (youtubePlaylist && youtubePlaylist.available && !youtubePlaylist.error) {
                    let playback = null;
                    for (let i = 0; i < 100; i += 1) {
                      await wait(500);
                      playback = cm.nowPlaying();
                      if (playback && playback.mode !== 'loading' && playback.time > 0.5) break;
                    }
                    youtubePlaylist.playback = Boolean(
                      youtubePlaylist.moreThan20 && playback && playback.id === youtubePlaylist.firstId &&
                      playback.mode !== 'loading' && playback.time > 0.5
                    );
                  }
                } catch (error) {
                  youtubePlaylist = { available: true, error: String(error && error.message || error) };
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
                  youtubePlaylist,
                  visualizer: cm.visualizer(),
                };
              })()
            `);
            console.log('SMOKE_PLUGIN:', JSON.stringify(pluginResult));
          } catch (error) {
            console.error('SMOKE_PLUGIN_FAIL:', error.message);
          }


          // Full titles with the audio chain on (bass +3): every title must be audible,
          // not just "playing" (time runs, but silence).
          try {
            const audible = await mainWindow.webContents.executeJavaScript(`
              (async () => {
                const cm = window.CleanMusic;
                const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                const audio = document.querySelector('#audio');
                cm.setTone(3, 0);
                const queries = ['linkin park numb', 'queen bohemian rhapsody', 'alan walker faded', 'eminem lose yourself', 'apache 207 roller', 'rick astley never gonna give you up'];
                const titles = [];
                for (const query of queries) {
                  cm.search(query);
                  cm.showView('search');
                  let row = null;
                  for (let i = 0; i < 60 && !row; i += 1) {
                    await wait(500);
                    row = document.querySelector('#plugin-results .song-row');
                  }
                  if (!row) { titles.push({ query, error: 'kein Treffer' }); continue; }
                  row.click();
                  let now = null;
                  for (let i = 0; i < 80; i += 1) {
                    await wait(500);
                    now = cm.nowPlaying();
                    if (now && now.mode !== 'loading' && now.time > 1.5) break;
                  }
                  let peak = 0;
                  let samples = 0;
                  for (let i = 0; i < 12; i += 1) {
                    await wait(250);
                    const value = window.CMVisualizer.signal();
                    if (value !== null) { samples += 1; peak = Math.max(peak, value); }
                  }
                  const engine = window.CMVisualizer.engineState();
                  titles.push({
                    query,
                    mode: now && now.mode,
                    time: now && now.time,
                    paused: audio.paused,
                    host: (() => { try { return new URL(audio.currentSrc).hostname; } catch { return ''; } })(),
                    peak: Number(peak.toFixed(4)),
                    samples,
                    gain: engine ? Number(engine.gain.toFixed(3)) : null,
                    context: engine ? engine.context : null,
                    volume: audio.volume,
                    muted: audio.muted,
                  });
                }
                cm.setTone(0, 0);
                return titles;
              })()
            `);
            const silent = audible.filter((title) => !title.error && title.time > 1.5 && (title.peak === 0 || title.gain === 0));
            if (silent.length) throw new Error(JSON.stringify(audible));
            console.log('SMOKE_PLUGIN_AUDIBLE:', JSON.stringify(audible));
          } catch (error) {
            console.error('SMOKE_PLUGIN_AUDIBLE_FAIL:', error.message);
          }

          // Playlist with crossfade + audio chain: the NEXT title must get its level
          // back (a stuck fade looks exactly like "plays, but no sound").
          for (const engineOn of [true, false]) {
            try {
              const fade = await mainWindow.webContents.executeJavaScript(`
                (async () => {
                  const cm = window.CleanMusic;
                  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
                  const audio = document.querySelector('#audio');
                  cm.setTone(${engineOn ? 3 : 0}, 0);
                  cm.setTransition('crossfade');
                  cm.search('daft punk one more time');
                  cm.showView('search');
                  for (let i = 0; i < 60 && document.querySelectorAll('#plugin-results .song-row').length < 2; i += 1) await wait(500);
                  for (let i = 0; i < 40 && !document.querySelector('#search-results .song-row'); i += 1) await wait(500);
                  const id = cm.createPlaylist('Smoke Crossfade ' + Date.now());
                  cm.addToPlaylistAt(id, 'ext', 0);
                  cm.addToPlaylistAt(id, 'ext', 1);
                  cm.addToPlaylistAt(id, 'search', 0);
                  cm.playList('playlist:' + id, 0);
                  const hops = [];
                  for (let hop = 0; hop < 2; hop += 1) {
                    let now = null;
                    for (let i = 0; i < 80; i += 1) {
                      await wait(500);
                      now = cm.nowPlaying();
                      if (now && now.mode !== 'loading' && now.time > 1 && Number.isFinite(audio.duration) && audio.duration > 20) break;
                    }
                    const from = now ? now.id : '';
                    audio.currentTime = Math.max(0, audio.duration - 9);
                    const timeline = [];
                    let switched = 0;
                    for (let i = 0; i < 70; i += 1) {
                      await wait(500);
                      const cur = cm.nowPlaying();
                      const engine = window.CMVisualizer.engineState();
                      const point = {
                        t: i / 2,
                        id: cur ? cur.id.slice(0, 22) : '',
                        mode: cur ? cur.mode : '',
                        time: cur ? cur.time : 0,
                        paused: audio.paused,
                        level: engine ? Number(engine.gain.toFixed(2)) : Number(audio.volume.toFixed(2)),
                        signal: window.CMVisualizer.signal(),
                      };
                      timeline.push(point);
                      if (cur && cur.id !== from && cur.mode !== 'loading' && cur.time > 1) switched += 1;
                      if (switched >= 24) break;
                    }
                    const after = timeline.filter((p) => p.id && p.id !== from.slice(0, 22) && p.mode !== 'loading' && p.time > 1);
                    const last = after[after.length - 1] || null;
                    hops.push({ from: from.slice(0, 22), to: last ? last.id : '', mode: last ? last.mode : '', finalLevel: last ? last.level : null, finalSignal: last ? last.signal : null, timeline: timeline.filter((p, i) => i % 4 === 0).map((p) => [p.t, p.id.slice(-6), p.mode, p.time, p.paused ? 'P' : '', p.level, p.signal]) });
                  }
                  cm.setTransition('off');
                  cm.setTone(0, 0);
                  audio.pause();
                  return hops;
                })()
              `);
              const stuck = fade.filter((hop) => !hop.to || hop.finalLevel === null || hop.finalLevel < 0.3);
              const line = (engineOn ? 'engine' : 'plain') + ' ' + JSON.stringify(fade);
              if (stuck.length) console.error('SMOKE_PLUGIN_CROSSFADE_FAIL:', line);
              else console.log('SMOKE_PLUGIN_CROSSFADE:', line);
            } catch (error) {
              console.error('SMOKE_PLUGIN_CROSSFADE_FAIL:', error.message);
            }
          }
        }

        try {
          console.log('SMOKE_REMOTE:', JSON.stringify(await smokeRemote()));
        } catch (error) {
          console.error('SMOKE_REMOTE_FAIL:', error.message);
        }

        try {
          console.log('SMOKE_MIGRATIONS:', JSON.stringify(await smokeMigrations()));
        } catch (error) {
          console.error('SMOKE_MIGRATIONS_FAIL:', error.message);
        }

        try {
          console.log('SMOKE_DIAGNOSE:', JSON.stringify(await smokeDiagnose()));
        } catch (error) {
          console.error('SMOKE_DIAGNOSE_FAIL:', error.message);
        }

        // Restart with stored data: the run above starts from an empty
        // profile, so code that only runs while restoring saved state
        // (recs, favorites, playlists, history …) was never executed at
        // load time. 2.0.0 shipped a TDZ crash in restoreRecs() that way.
        try {
          await mainWindow.webContents.executeJavaScript(`
            localStorage.setItem('cleanmusic.recs.v1', JSON.stringify({
              tracks: [{ id: 'deezer:3135553', kind: 'preview', source: 'deezer', title: 'One More Time', artist: 'Daft Punk', preview: 'https://cdnt-preview.dzcdn.net/x.mp3' }],
              seeds: ['Daft Punk'], seedKey: 'smoke', at: Date.now(),
            }));
            true;
          `);
          const errors = [];
          const onConsole = (...args) => {
            const details = args[1];
            const level = details && typeof details === 'object' ? details.level : args[1];
            const message = details && typeof details === 'object' ? details.message : args[2];
            if (level === 'error' || level === 3) errors.push(String(message).slice(0, 200));
          };
          mainWindow.webContents.on('console-message', onConsole);
          await new Promise((resolve) => {
            mainWindow.webContents.once('did-finish-load', resolve);
            mainWindow.webContents.reload();
          });
          await new Promise((resolve) => setTimeout(resolve, 4000));
          mainWindow.webContents.removeListener('console-message', onConsole);
          const reload = await mainWindow.webContents.executeJavaScript(`({
            api: Boolean(window.CleanMusic),
            home: document.querySelector('#view-home') ? document.querySelector('#view-home').children.length : 0,
            recs: (() => { try { return JSON.parse(localStorage.getItem('cleanmusic.recs.v1')).tracks.length; } catch { return -1; } })(),
          })`);
          reload.errors = errors.filter((text) => !/Failed to load resource|net::ERR_/i.test(text));
          if (!reload.api || !reload.home || reload.errors.length) console.error('SMOKE_RELOAD_FAIL:', JSON.stringify(reload));
          else console.log('SMOKE_RELOAD:', JSON.stringify(reload));
        } catch (error) {
          console.error('SMOKE_RELOAD_FAIL:', error.message);
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

const LIVE_BG_EXTENSIONS = new Set(['.mp4', '.webm', '.gif']);
const LIVE_BG_MAX_BYTES = 300 * 1024 * 1024;

ipcMain.handle('live-bg-pick', async (event) => {
  if (event.sender !== (mainWindow && mainWindow.webContents)) return { error: 'Nicht verfügbar.' };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Eigenes Hintergrundvideo auswählen',
    properties: ['openFile'],
    filters: [{ name: 'Video oder GIF', extensions: ['mp4', 'webm', 'gif'] }],
  });
  if (result.canceled || !result.filePaths.length) return { canceled: true };
  const file = path.resolve(result.filePaths[0]);
  const extension = path.extname(file).toLowerCase();
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || !LIVE_BG_EXTENSIONS.has(extension)) return { error: 'Nur MP4, WebM oder GIF sind erlaubt.' };
    if (stat.size > LIVE_BG_MAX_BYTES) return { error: 'Die Hintergrunddatei darf höchstens 300 MB groß sein.' };
    writeConfig({ liveBgPath: file });
    return { ok: true, url: pathToFileURL(file).href, kind: extension === '.gif' ? 'gif' : 'video' };
  } catch (error) {
    return { error: cleanText(error && error.message, 180) || 'Datei konnte nicht gelesen werden.' };
  }
});

ipcMain.handle('live-bg-get', (event) => {
  if (event.sender !== (mainWindow && mainWindow.webContents)) return null;
  const file = String(readConfig().liveBgPath || '');
  if (!file) return { url: '', kind: '', missing: false };
  const extension = path.extname(file).toLowerCase();
  try {
    const stat = fs.statSync(file);
    if (!path.isAbsolute(file) || !stat.isFile() || stat.size > LIVE_BG_MAX_BYTES || !LIVE_BG_EXTENSIONS.has(extension)) throw new Error('invalid');
    return { url: pathToFileURL(file).href, kind: extension === '.gif' ? 'gif' : 'video', missing: false };
  } catch {
    writeConfig({ liveBgPath: '' });
    return { url: '', kind: '', missing: true };
  }
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
  windows: os.release(),
  installType: isInstalledCopy() ? 'installiert' : 'portable',
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

ipcMain.handle('spotify-playlist-link', async (_event, url) => {
  try {
    return await fetchSpotifyPlaylist(url);
  } catch (error) {
    return { name: '', tracks: [], limited: false, error: cleanText(error && error.message, 240) || 'Spotify-Playlist konnte nicht geladen werden.' };
  }
});

ipcMain.handle('playlist-import-file', async () => {
  let result;
  try {
    result = await dialog.showOpenDialog(mainWindow, {
      title: 'Spotify-Playlist-Datei auswählen',
      properties: ['openFile'],
      filters: [{ name: 'Spotify-Playlisten', extensions: ['csv', 'json'] }],
    });
  } catch (error) {
    return { canceled: false, playlists: [], limited: false, error: cleanText(error && error.message, 240) || 'Dateiauswahl fehlgeschlagen.' };
  }
  if (result.canceled || !result.filePaths.length) return { canceled: true, playlists: [], limited: false, error: null };
  const filename = result.filePaths[0];
  try {
    const stat = await fsp.stat(filename);
    if (stat.size > 10 * 1024 * 1024) throw new Error('Die Datei ist größer als 10 MB.');
    const text = await fsp.readFile(filename, 'utf8');
    const extension = path.extname(filename).toLowerCase();
    if (extension === '.csv') return parseSpotifyCsv(text, filename);
    if (extension === '.json') return parseSpotifyJson(text, filename);
    throw new Error('Bitte eine CSV- oder JSON-Datei auswählen.');
  } catch (error) {
    return { canceled: false, playlists: [], limited: false, error: cleanText(error && error.message, 240) || 'Die Datei konnte nicht gelesen werden.' };
  }
});

ipcMain.handle('playlist-match', async (_event, tracks) => {
  if (!Array.isArray(tracks)) return { matches: [], error: 'Ungültige Titelliste.' };
  const batch = tracks.slice(0, 50).map((track) => ({
    title: cleanText(track && track.title, 300),
    artist: cleanText(track && track.artist, 300),
    durationMs: Math.max(0, Number(track && track.durationMs) || 0),
    isrc: cleanText(track && track.isrc, 20).toUpperCase(),
  }));
  try {
    const result = await matchSpotifyTracks(batch);
    return { matches: result.tracks, error: null };
  } catch (error) {
    return { matches: batch.map(() => null), error: cleanText(error && error.message, 200) || 'Deezer-Suche fehlgeschlagen.' };
  }
});

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
  // With a title in a non-Latin script both keys are empty – then any result
  // would match ("startsWith('')"). Better no preview than the wrong song.
  if (!titleKey) return null;
  const exact = results.find(
    (entry) =>
      entry.previewUrl &&
      looseKey(entry.trackName).startsWith(titleKey) &&
      (!artistWord || looseKey(entry.artistName).includes(artistWord))
  );
  const loose = results.find(
    (entry) =>
      entry.previewUrl &&
      titleWord &&
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
const OPENVERSE_LICENSES = new Set(['cc0', 'by', 'pdm']);

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
      .filter(
        (item) =>
          item &&
          OPENVERSE_LICENSES.has(String(item.license || '').toLowerCase()) &&
          /^https:\/\//i.test(item.url || '')
      )
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

ipcMain.handle('project-credits-save', (_event, input) => {
  const project = input && typeof input === 'object' ? input : {};
  const text = typeof project.text === 'string' ? project.text : '';
  if (!text.trim() || Buffer.byteLength(text, 'utf8') > 1024 * 1024) return { error: 'Keine Credits oder Datei größer als 1 MB.' };
  const base = path.resolve(downloadBase(project.folder));
  const name = safeName(project.name, 'Projekt');
  const destination = path.resolve(base, '_Projekte', `${name}.txt`);
  const relative = path.relative(base, destination);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || path.extname(destination).toLowerCase() !== '.txt') {
    return { error: 'Das Ziel muss als .txt im Cutting-Ordner bleiben.' };
  }
  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, text.replace(/\r?\n/g, '\r\n'), 'utf8');
    return { ok: true, name: path.basename(destination), path: destination };
  } catch (error) {
    return { error: cleanText(error && error.message, 200) || 'Credits konnten nicht gespeichert werden.' };
  }
});

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
    if (response.url && !allowedDownloadHost(response.url)) {
      clearTimeout(timer);
      throw new Error('Weiterleitung nicht erlaubt');
    }
    const type = String(response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const fromUrl = (path.extname(new URL(url).pathname) || '').toLowerCase();
    const extension =
      DOWNLOAD_TYPES[type] || (/^\.(mp3|ogg|wav|flac|m4a|aac)$/.test(fromUrl) ? fromUrl : '');
    if (!extension) {
      clearTimeout(timer);
      throw new Error('Keine Audiodatei');
    }
    // Stream instead of buffering blindly: a 2 GB "original" would otherwise
    // be loaded into memory completely before the size check.
    const LIMIT = 250 * 1024 * 1024;
    const announced = Number(response.headers.get('content-length')) || 0;
    if (announced > LIMIT) {
      clearTimeout(timer);
      throw new Error('Datei zu groß');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      total += value.byteLength;
      if (total > LIMIT) {
        try {
          await reader.cancel();
        } catch {
          /* enough */
        }
        clearTimeout(timer);
        throw new Error('Datei zu groß');
      }
    }
    clearTimeout(timer);
    const buffer = Buffer.concat(chunks, total);
    if (buffer.length > LIMIT) throw new Error('Datei zu groß');

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

/* Download list (1.8): audio files in the Cutting folder (two levels deep)
 * with the credit .txt next to them – read only, nothing is changed. */
ipcMain.handle('downloads-list', async (_event, folder) => {
  const base = downloadBase(folder);
  const files = [];
  const readCredit = (file) => {
    const stem = file.replace(/\.[^.]+$/, '');
    for (const candidate of [`${stem}.txt`, `${stem} – Lizenz.txt`]) {
      try {
        if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8').slice(0, 4000);
      } catch {
        /* next */
      }
    }
    return '';
  };
  const walk = (dir, depth) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= 3000) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 2) walk(full, depth + 1);
        continue;
      }
      if (!/\.(mp3|ogg|wav|flac|m4a|aac|aiff?)$/i.test(entry.name)) continue;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch {
        continue;
      }
      files.push({
        path: full,
        name: entry.name,
        folder: path.relative(base, dir).split(path.sep).join(' / '),
        size: stat.size,
        at: stat.mtimeMs,
        url: pathToFileURL(full).href,
        credit: readCredit(full),
      });
    }
  };
  walk(base, 0);
  files.sort((a, b) => b.at - a.at);
  return { base, files, error: null };
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

/* --- Pre-migration backups (2.0 Phase 2) -------------------------------- *
 * renderer/core/migrations.js hands over a snapshot of every cleanmusic.* key
 * before it migrates anything. It lands in <userData>/backups as
 * vor-schema-<from>-<to>-<timestamp>.json; only the newest five of these files
 * are kept (other files in the folder are never touched). */
const MIGRATION_BACKUP_PREFIX = 'vor-schema-';
const MIGRATION_BACKUP_KEEP = 5;
const MIGRATION_BACKUP_MAX = 100 * 1024 * 1024;

function migrationBackupDir() {
  return path.join(app.getPath('userData'), 'backups');
}

function writeMigrationBackup(text, meta) {
  if (typeof text !== 'string' || !text.length || text.length > MIGRATION_BACKUP_MAX) {
    return { ok: false, error: 'Ungültige Sicherung' };
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.kind !== 'schema-snapshot' || typeof parsed.keys !== 'object') {
      return { ok: false, error: 'Ungültige Sicherung' };
    }
  } catch {
    return { ok: false, error: 'Ungültige Sicherung' };
  }
  const from = Math.max(0, Math.min(999, Math.floor(Number(meta && meta.from) || 0)));
  const to = Math.max(0, Math.min(999, Math.floor(Number(meta && meta.to) || 0)));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const folder = migrationBackupDir();
  const file = path.join(folder, `${MIGRATION_BACKUP_PREFIX}${from}-${to}-${stamp}.json`);
  const temp = `${file}.tmp`;
  try {
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(temp, text, 'utf8');
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.rmSync(temp, { force: true }); } catch { /* nothing to clean */ }
    return { ok: false, error: cleanText(error.message, 200) || 'Sicherung fehlgeschlagen' };
  }
  try {
    fs.readdirSync(folder)
      .filter((name) => name.startsWith(MIGRATION_BACKUP_PREFIX) && name.endsWith('.json'))
      .map((name) => ({ name, at: fs.statSync(path.join(folder, name)).mtimeMs }))
      .sort((a, b) => b.at - a.at)
      .slice(MIGRATION_BACKUP_KEEP)
      .forEach(({ name }) => fs.rmSync(path.join(folder, name), { force: true }));
  } catch {
    /* pruning is best effort */
  }
  return { ok: true, path: file };
}

ipcMain.on('migration-backup', (event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    event.returnValue = { ok: false, error: 'Nicht erlaubt' };
    return;
  }
  event.returnValue = writeMigrationBackup(payload && payload.text, payload && payload.meta);
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

ipcMain.handle('backup-folder-pick', async (event) => {
  if (event.sender !== (mainWindow && mainWindow.webContents)) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Ordner für automatische Backups auswählen',
    defaultPath: app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled || !result.filePaths.length ? null : result.filePaths[0];
});

ipcMain.handle('backup-auto-save', async (_event, input) => {
  const rawFolder = input && typeof input.folder === 'string' ? input.folder : '';
  const folder = rawFolder && path.isAbsolute(rawFolder) ? path.resolve(rawFolder) : '';
  const text = input && typeof input.text === 'string' ? input.text : '';
  if (!folder || !path.isAbsolute(folder) || !text || Buffer.byteLength(text, 'utf8') > 30 * 1024 * 1024) {
    return { error: 'Ungültige Backup-Daten oder Ordner.' };
  }
  try {
    if (!fs.statSync(folder).isDirectory()) return { error: 'Der Backup-Pfad ist kein Ordner.' };
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const name = `cleanmusic-backup-${stamp}.json`;
    const destination = path.join(folder, name);
    fs.writeFileSync(destination, text, { encoding: 'utf8', flag: 'wx' });
    const own = fs.readdirSync(folder, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /^cleanmusic-backup-.*\.json$/i.test(entry.name))
      .map((entry) => {
        const full = path.join(folder, entry.name);
        return { full, at: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.at - a.at);
    own.slice(5).forEach((entry) => fs.rmSync(entry.full, { force: true }));
    return { ok: true, name, path: destination };
  } catch (error) {
    return { error: cleanText(error && error.message, 200) || 'Backup konnte nicht gespeichert werden.' };
  }
});

function decodePngDataUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,') || value.length > 21 * 1024 * 1024) return null;
  const encoded = value.slice('data:image/png;base64,'.length);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length < 8 || bytes.length > 15 * 1024 * 1024 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return null;
  const image = nativeImage.createFromBuffer(bytes);
  return image.isEmpty() ? null : { bytes, image };
}

ipcMain.handle('save-png', async (_event, dataUrl) => {
  const image = decodePngDataUrl(dataUrl);
  if (!image) return { error: 'Ungültiges PNG oder Datei größer als 15 MB.' };
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Rückblick als Bild speichern',
    defaultPath: path.join(app.getPath('pictures'), `CleanMusic-Rueckblick-${new Date().toISOString().slice(0, 10)}.png`),
    filters: [{ name: 'PNG-Bild', extensions: ['png'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  try {
    const destination = path.extname(result.filePath).toLowerCase() === '.png' ? result.filePath : `${result.filePath}.png`;
    fs.writeFileSync(destination, image.bytes);
    return { ok: true, path: destination };
  } catch (error) {
    return { error: cleanText(error && error.message, 200) || 'PNG konnte nicht gespeichert werden.' };
  }
});

ipcMain.handle('copy-png', (_event, dataUrl) => {
  const image = decodePngDataUrl(dataUrl);
  if (!image) return false;
  clipboard.writeImage(image.image);
  return true;
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
    shareButton: config.shareButton !== false,
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
  if ('shareButton' in input) next.shareButton = Boolean(input.shareButton);
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
    shareUrl: String(track.shareUrl || '').length <= 512
      ? cleanUrl(track.shareUrl, /^https:\/\/bellocccyt\.github\.io\/cleanmusic\/s\/\?/)
      : '',
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

function parseConfigFile(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return null;
  }
}

function readConfig() {
  const file = configFile();
  // A corrupted or locked file is not an empty configuration – try the last
  // good copy instead of silently starting from scratch (which would wipe all
  // settings on the next writeConfig).
  const main = parseConfigFile(file);
  if (main) return main;
  if (!fs.existsSync(file)) return {};
  const backup = parseConfigFile(`${file}.bak`);
  return backup || {};
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  const file = configFile();
  const temp = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Write to a temp file and swap it in: a crash in the middle can never
    // leave a truncated config behind, and the previous state stays as .bak.
    fs.writeFileSync(temp, JSON.stringify(next, null, 2));
    if (fs.existsSync(file)) {
      try {
        fs.copyFileSync(file, `${file}.bak`);
      } catch {
        /* backup is best effort */
      }
    }
    fs.renameSync(temp, file);
  } catch {
    /* read-only profile – keep it in memory only */
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      /* ignore */
    }
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
  const setupPicked = pickUpdateAsset(
    {
      assets: [
        { name: 'CleanMusic-9.9.9-portable.exe', size: 5, browser_download_url: 'https://github.com/a/b/p.exe' },
        { name: 'CleanMusic-9.9.9-setup.exe', size: 6, digest: 'sha256:' + 'b'.repeat(64), browser_download_url: 'https://github.com/a/b/s.exe' },
      ],
    },
    { kind: 'setup', file: 'x', dir: 'y', pattern: /^CleanMusic-[0-9.]+-setup\.exe$/i }
  );
  const setupOk = Boolean(setupPicked && setupPicked.url === 'https://github.com/a/b/s.exe');

  const checked = await checkForUpdates();
  const result = {
    versions,
    assetOk,
    setupOk,
    kind: checked.kind,
    status: checked.status,
    latest: checked.latest,
    current: checked.current,
    error: checked.error,
  };

  if (UPDATE_TEST) {
    // Pretend to be 0.0.1 → the latest release is "new"; download it into a throwaway folder.
    result.available = checked.status === 'available';
    result.asset = checked.asset;
    if (result.available && UPDATE_TEST_SETUP && checked.asset) {
      const running = downloadUpdate();
      await new Promise((resolve) => setTimeout(resolve, 300));
      result.cleanupWhileDownloading = cleanupSetupDir(UPDATE_TEST_DIR) ? 'deleted' : 'skipped';
      const first = await running;
      result.firstDownload = first.status;
      setUpdate({ status: 'error', error: 'Test' });
      result.retryAllowed = true;
    }
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
    }
    fs.rmSync(UPDATE_TEST_DIR, { recursive: true, force: true });
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

  // Song requests (plugin 1.1.0, CleanMusic 1.0.1).
  const q = (text) => encodeURIComponent(text);
  const sr = (user, text) => get('/request?token=' + token + '&user=' + q(user) + '&q=' + q(text));
  const srOff = await sr('smoke', 'Daft Punk One More Time');
  await js("window.cm.pluginSettingsSet('streamerbot', { requests: true, requestSource: 'preview', requestPerUser: 2, requestCooldown: 0, requestBlock: 'verboten' })");
  await wait(500);
  const srNoToken = await get('/request?user=smoke&q=' + q('Daft Punk'));
  const srEmpty = await sr('smoke', '');
  const srBlocked = await sr('smoke', 'Das ist verboten');
  const sr1 = await sr('smoke', 'Daft Punk One More Time');
  const srDup = await sr('smoke', 'Daft Punk One More Time');
  const sr2 = await sr('@Smoke', 'Tame Impala The Less I Know The Better');
  const srLimit = await sr('smoke', 'Queen Bohemian Rhapsody');
  await js("window.cm.pluginSettingsSet('streamerbot', { requestCooldown: 60 })");
  await wait(500);
  const other1 = await sr('viewer2', 'Queen Bohemian Rhapsody');
  const other2 = await sr('viewer2', 'ABBA Dancing Queen');
  const wishList = await get('/requests');
  const pending = await js('window.CleanMusic.requests()');
  const panel = await js(`(async () => {
    window.CleanMusic.toggleQueue(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const text = document.querySelector('#queue-panel').textContent;
    window.CleanMusic.toggleQueue(false);
    return { label: text.includes('Songwünsche aus dem Chat'), by: text.includes('Wunsch von smoke') };
  })()`);
  const wrong = await get('/wrongsong?token=' + token + '&user=smoke');
  const wrongNone = await get('/wrongsong?token=' + token + '&user=nobody');
  const afterWrong = await js('window.CleanMusic.requests().length');  // Song requests with links, "next", playlist, AI filter (plugin 1.2.0, CleanMusic 1.4.0).
  await js("window.cm.pluginSettingsSet('streamerbot', { requests: true, requestSource: 'preview', requestCooldown: 0, requestPerUser: 6, requestMax: 30, requestPosition: 'next', requestPlaylist: 'Smoke Wünsche', requestBlockAi: true })");
  await wait(500);
  const linkSpotify = await sr('linker', 'https://open.spotify.com/intl-de/track/0VjIjW4GlUZAMYd2vXMi3b?si=smoke');
  const firstAfterSpotify = await js('(window.CleanMusic.requests()[0] || {}).title || ""');
  let deezerId = null;
  try {
    const found = await fetchJson('https://api.deezer.com/search?q=' + encodeURIComponent('Get Lucky Daft Punk') + '&limit=1');
    deezerId = found && found.data && found.data[0] ? found.data[0].id : null;
  } catch {
    deezerId = null;
  }
  const linkDeezer = deezerId ? await sr('linker', `https://www.deezer.com/de/track/${deezerId}`) : { status: 0, body: 'keine Deezer-ID' };
  let appleId = null;
  try {
    const found = await fetchJson('https://itunes.apple.com/search?term=queen%20bohemian%20rhapsody&media=music&entity=song&limit=1&country=DE');
    appleId = found && found.results && found.results[0] ? found.results[0].trackId : null;
  } catch {
    appleId = null;
  }
  const linkApple = appleId ? await sr('linker', `https://music.apple.com/de/album/smoke/1?i=${appleId}`) : { status: 0, body: 'keine Apple-ID' };
  const linkOther = await sr('linker', 'https://soundcloud.com/someone/some-track');
  const linkYoutube = await sr('linker', 'https://youtu.be/dQw4w9WgXcQ');
  const aiQuery = await sr('linker', 'Drake Hotline Bling (AI Cover)');
  const savedCount = await js("window.CleanMusic.playlistCount('Smoke Wünsche')");
  await js("window.cm.pluginSettingsSet('streamerbot', { requestPosition: 'end' })");
  await wait(400);
  const ender = await sr('ender', 'Michael Jackson Billie Jean');
  const lastPending = await js('(() => { const list = window.CleanMusic.requests(); return list.length ? list[list.length - 1].by : ""; })()');
  const linkResults = {
    spotify: linkSpotify.body,
    spotifyFirst: firstAfterSpotify,
    deezer: linkDeezer.body,
    apple: linkApple.body,
    other: linkOther.body,
    youtubeWithoutPlugin: linkYoutube.body,
    aiBlocked: aiQuery.body,
    savedToPlaylist: savedCount,
    endMode: [ender.body, lastPending],
  };

  await js("window.cm.pluginSettingsSet('streamerbot', { requests: false })");
  await wait(300);
  const srOffAgain = await sr('viewer3', 'ABBA');

  await js("window.cm.pluginSettingsSet('streamerbot', { control: false })");
  await wait(2600);
  const blocked = await get('/skip?token=' + token);
  const info = (await pluginList(false)).plugins.find((entry) => entry.id === 'streamerbot');

  // WebSocket (plugin 1.3.0): Hello, Authenticate, GetActions, DoAction.
  const wsSeen = { connection: 0, auth: null, first: null, last: null };
  const wsPort = port + 1;
  const wsServer = http.createServer((_request, response) => {
    response.writeHead(426);
    response.end('Upgrade required');
  });
  const frame = (payload) => {
    const data = Buffer.from(JSON.stringify(payload), 'utf8');
    let header;
    if (data.length < 126) header = Buffer.from([0x81, data.length]);
    else if (data.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(data.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(data.length), 2);
    }
    return Buffer.concat([header, data]);
  };
  const salt = Buffer.from('smoke-salt').toString('base64');
  const challenge = Buffer.from('smoke-challenge').toString('base64');
  const wsSockets = new Set();
  wsServer.on('upgrade', (request, socket) => {
    const accept = crypto
      .createHash('sha1')
      .update(String(request.headers['sec-websocket-key'] || '') + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    wsSeen.connection += 1;
    wsSockets.add(socket);
    socket.on('close', () => wsSockets.delete(socket));
    socket.on('error', () => wsSockets.delete(socket));
    let rest = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      rest = Buffer.concat([rest, chunk]);
      for (;;) {
        if (rest.length < 2) return;
        const opcode = rest[0] & 0x0f;
        const masked = (rest[1] & 0x80) !== 0;
        let length = rest[1] & 0x7f;
        let offset = 2;
        if (length === 126) {
          if (rest.length < 4) return;
          length = rest.readUInt16BE(2);
          offset = 4;
        } else if (length === 127) {
          if (rest.length < 10) return;
          length = Number(rest.readBigUInt64BE(2));
          offset = 10;
        }
        let mask = null;
        if (masked) {
          if (rest.length < offset + 4) return;
          mask = rest.subarray(offset, offset + 4);
          offset += 4;
        }
        if (rest.length < offset + length) return;
        let payload = rest.subarray(offset, offset + length);
        if (masked) {
          const copy = Buffer.alloc(length);
          for (let index = 0; index < length; index += 1) copy[index] = payload[index] ^ mask[index % 4];
          payload = copy;
        }
        rest = rest.subarray(offset + length);
        if (opcode === 0x8) {
          socket.end();
          return;
        }
        if (opcode !== 0x1) continue;
        let message = null;
        try {
          message = JSON.parse(payload.toString('utf8'));
        } catch {
          continue;
        }
        if (!message || typeof message !== 'object') continue;
        if (message.request === 'Authenticate') {
          const secret = crypto.createHash('sha256').update('smoke-secret' + salt, 'utf8').digest('base64');
          const expected = crypto.createHash('sha256').update(secret + challenge, 'utf8').digest('base64');
          wsSeen.auth = message.authentication === expected;
          socket.write(frame({ status: wsSeen.auth ? 'ok' : 'error', id: message.id, request: 'Authenticate' }));
        } else if (message.request === 'GetActions') {
          socket.write(
            frame({
              status: 'ok',
              id: message.id,
              request: 'GetActions',
              actions: [
                { id: 'a1', name: 'CleanMusic Titelwechsel' },
                { id: 'a2', name: 'Nur ein Test' },
              ],
            })
          );
        } else if (message.request === 'DoAction') {
          const entry = { name: message.action && message.action.name, args: message.args || {} };
          if (!wsSeen.first) wsSeen.first = entry;
          wsSeen.last = entry;
          socket.write(frame({ status: 'ok', id: message.id, request: 'DoAction' }));
        }
      }
    });
    socket.write(
      frame({
        timestamp: new Date().toISOString(),
        request: 'Hello',
        info: { instanceId: 'smoke', name: 'Streamer.bot Smoke', version: '0.2.5', mode: 'ui' },
        authentication: { salt, challenge },
      })
    );
  });
  await new Promise((resolve) => wsServer.listen(wsPort, '127.0.0.1', resolve));
  await js(
    `window.cm.pluginSettingsSet('streamerbot', ${JSON.stringify({
      wsEnabled: true,
      wsUrl: `ws://127.0.0.1:${wsPort}/`,
      wsPassword: 'smoke-secret',
      wsAction: 'CleanMusic Titelwechsel',
    })})`
  );
  await wait(1500);
  const wsModule = plugins.get('streamerbot') && plugins.get('streamerbot').module;
  const wsDebug = wsModule && typeof wsModule._debug === 'function' ? wsModule._debug().ws : null;
  const announcedOnConnect = wsSeen.first;
  wsSeen.first = null;
  wsSeen.last = null;
  // The HTTP control was switched off above – use the player UI for the
  // track change instead.
  await js("document.querySelector('#btn-next').click()");
  await wait(1200);
  const afterWsSkip = await js('window.CleanMusic.playerSnapshot()');
  const wsResult = {
    connected: wsSeen.connection > 0,
    state: wsDebug ? wsDebug.state : null,
    auth: wsSeen.auth === true,
    actions: wsDebug ? wsDebug.actions : null,
    announcedOnConnect: Boolean(announcedOnConnect && announcedOnConnect.name === 'CleanMusic Titelwechsel'),
    onSkip: Boolean(wsSeen.last && wsSeen.last.name === 'CleanMusic Titelwechsel'),
    argsTitle: wsSeen.last ? wsSeen.last.args.title : '',
    matchesTrack: Boolean(wsSeen.last && afterWsSkip.track && wsSeen.last.args.title === afterWsSkip.track.title),
    statusText: ((await pluginList(false)).plugins.find((entry) => entry.id === 'streamerbot') || {}).status?.text || null,
  };
  await js("window.cm.pluginSettingsSet('streamerbot', { wsEnabled: false })");
  await wait(400);
  const wsModuleAfter = plugins.get('streamerbot') && plugins.get('streamerbot').module;
  wsResult.offState = wsModuleAfter && typeof wsModuleAfter._debug === 'function' ? wsModuleAfter._debug().ws.state : null;
  for (const socket of wsSockets) {
    try {
      socket.destroy();
    } catch {
      /* ignore */
    }
  }
  wsServer.close();

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
    requests: {
      off: srOff.status,
      noToken: srNoToken.status,
      empty: srEmpty.status,
      blocked: srBlocked.body,
      first: [sr1.status, sr1.body],
      duplicate: srDup.body,
      second: sr2.body,
      perUserLimit: srLimit.body,
      other: other1.body,
      cooldown: [other2.status, other2.body],
      list: wishList.body,
      pending: pending.map((entry) => `${entry.position}:${entry.by}`),
      panel,
      wrongsong: wrong.body,
      wrongNone: wrongNone.body,
      afterWrong,
      offAgain: srOffAgain.status,
      links: linkResults,
    },
    status: info && info.status ? info.status.text : null,
    fields: info && info.settings ? info.settings.fields.length : 0,
    websocket: wsResult,
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

/* Smoke test for extras/plugins/obs-visualizer.js (npm run smoke:visualizer). */
async function smokeVisualizerPlugin() {
  const http = require('node:http');
  const port = 4799;
  const target = path.join(pluginDirs()[0], 'obs-visualizer.js');
  fs.copyFileSync(path.join(ROOT, 'extras', 'plugins', 'obs-visualizer.js'), target);

  const stored = readConfig().pluginSettings || {};
  writeConfig({
    pluginSettings: Object.assign({}, stored, { 'obs-visualizer': { port, style: 'bars' } }),
  });
  discoverPlugins();
  const config = pluginConfig();
  config.enabled = config.enabled.filter((id) => id !== 'obs-visualizer').concat('obs-visualizer');
  savePluginConfig(config);
  const plugin = plugins.get('obs-visualizer');
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

  // The earlier steps leave a title in the player; make sure it runs.
  await js("window.CleanMusic.setVolume(0.7); true");
  sendPlayerCommand('play');
  await wait(1600);
  const snapshot = await js('window.CleanMusic.visualizerSnapshot()');
  const json = await get('/visualizer.json');
  const data = json.status === 200 ? JSON.parse(json.body) : null;
  const page = await get('/visualizer?style=radial');
  const foreign = await get('/visualizer.json', 'evil.example');
  const events = await get('/events');

  const settingsResult = await js(
    "window.cm.pluginSettingsSet('obs-visualizer', { style: 'radial', bars: 48, width: 60, gap: 8 })"
  );
  const info = (settingsResult.plugins || []).find((entry) => entry.id === 'obs-visualizer');
  const after = await get('/visualizer.json');
  const afterData = after.status === 200 ? JSON.parse(after.body) : null;

  const cleanup = pluginConfig();
  cleanup.enabled = cleanup.enabled.filter((id) => id !== 'obs-visualizer');
  savePluginConfig(cleanup);
  unloadPlugin(plugin);
  plugins.delete('obs-visualizer');
  fs.rmSync(target, { force: true });
  discoverPlugins();
  await wait(300);
  const closed = await get('/visualizer.json');

  return {
    loaded: !plugin.error,
    error: plugin.error,
    rendererBands: snapshot && Array.isArray(snapshot.spectrum) ? snapshot.spectrum.length : 0,
    rendererLive: Boolean(snapshot && Array.isArray(snapshot.spectrum) && snapshot.spectrum.some((value) => value > 0)),
    json: json.status,
    bands: data && Array.isArray(data.spectrum) ? data.spectrum.length : 0,
    live: Boolean(data && Array.isArray(data.spectrum) && data.spectrum.some((value) => value > 0)),
    page: page.status === 200 && page.body.includes('Visualizer'),
    foreignHost: foreign.status,
    events: events.body.startsWith('retry:') && events.body.includes('"spectrum"'),
    status: info && info.status ? info.status.text : null,
    style: info && info.settings ? info.settings.values.style : null,
    bars: afterData ? afterData.bars : null,
    width: afterData ? afterData.width : null,
    gap: afterData ? afterData.gap : null,
    styleServed: afterData ? afterData.style : null,
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
 *   onEvent(type, player) – 'nowplaying' | 'state' | 'volume' | 'visualizer'
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
    const head = readPluginManifest(info.file);
    if (known && known.file === info.file) {
      if (!known.module) Object.assign(known, head);
      continue;
    }
    if (known) unloadPlugin(known);
    plugins.set(id, { ...info, ...head, module: null, error: null });
  }
}

// Plugin-API v3: the manifest comment at the top of the file (lib/plugin-manifest.js).
function readPluginManifest(file) {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(pluginManifest.HEAD_BYTES);
      const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
      const parsed = pluginManifest.parseManifest(buffer.subarray(0, read).toString('utf8'));
      return { manifest: parsed.manifest, manifestError: parsed.error };
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { manifest: null, manifestError: null };
  }
}

function pluginAllows(plugin, permission) {
  return pluginManifest.allows(plugin ? plugin.manifest : null, permission);
}

const SOURCE_CAPABILITIES = ['search', 'resolve', 'lookup', 'playlist', 'charts', 'match', 'related'];

function permissionError(permission) {
  return new Error(`Plugin-Berechtigung „${permission}“ fehlt im Manifest.`);
}

// Plugin-API v3: a plugin can register small read-only panels (ui:panel).
// They appear in the settings card or on the home view.
const PANEL_SLOTS = ['settings', 'home'];
function registerPluginPanel(id, def) {
  const plugin = plugins.get(id);
  if (!plugin || !def || typeof def !== 'object') return false;
  const panel = {
    slot: PANEL_SLOTS.includes(def.slot) ? def.slot : 'settings',
    title: cleanText(def.title, 80) || 'Panel',
    html: String(def.html == null ? '' : def.html).slice(0, 20000),
  };
  const rest = (plugin.panels || []).filter((entry) => entry.title !== panel.title && entry.slot !== panel.slot);
  plugin.panels = rest.concat(panel).slice(-4);
  sendToRenderer('plugins-changed', { id });
  return true;
}

function pluginContext(id) {
  const owner = plugins.get(id);
  const manifest = owner ? owner.manifest : null;
  const may = (permission) => pluginManifest.allows(manifest, permission);
  const guard = (permission, fn) => (...args) => {
    if (!may(permission)) throw permissionError(permission);
    return fn(...args);
  };
  const dataDir = path.join(app.getPath('userData'), 'plugin-data', id);
  return {
    apiVersion: 2,
    appVersion: app.getVersion(),
    platform: process.platform,
    userAgent: app.userAgentFallback,
    // Chromium's network stack – the same one the <audio> element uses.
    fetch: (url, options) =>
      pluginManifest.allowsUrl(manifest, url)
        ? net.fetch(url, options)
        : Promise.reject(permissionError(`network:${(() => { try { return new URL(String(url)).hostname; } catch { return '?'; } })()}`)),
    config: {
      get: () => Object.assign({}, pluginConfig().data[id]),
      set: (patch) => {
        const current = pluginConfig();
        current.data[id] = Object.assign({}, current.data[id], patch);
        savePluginConfig(current);
      },
    },
    pickFile: async (options = {}) => {
      if (!may('fs:folder')) throw permissionError('fs:folder');
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
    library: may('library:read')
      ? {
          favorites: () => callRenderer('libraryRead', { kind: 'favorites' }),
          playlists: () => callRenderer('libraryRead', { kind: 'playlists' }),
          history: () => callRenderer('libraryRead', { kind: 'history' }),
          queue: () => callRenderer('libraryRead', { kind: 'queue' }),
          local: () => callRenderer('libraryRead', { kind: 'local' }),
          current: () => callRenderer('libraryRead', { kind: 'current' }),
        }
      : new Proxy({}, { get: (_target, key) => (key === 'then' ? undefined : () => { throw permissionError('library:read'); }) }),
    ui: may('ui:panel')
      ? { panel: (def) => registerPluginPanel(id, def) }
      : new Proxy({}, { get: (_target, key) => (key === 'then' ? undefined : () => { throw permissionError('ui:panel'); }) }),
    player: !may('player')
      ? new Proxy({}, { get: (_target, key) => (key === 'then' ? undefined : () => { throw permissionError('player'); }) })
      : {
      state: () => JSON.parse(JSON.stringify(playerState)),
      play: () => sendPlayerCommand('play'),
      pause: () => sendPlayerCommand('pause'),
      toggle: () => sendPlayerCommand('toggle'),
      next: () => sendPlayerCommand('next'),
      previous: () => sendPlayerCommand('previous'),
      setVolume: (level) => sendPlayerCommand('volume', Number(level)),
      setMuted: (muted) => sendPlayerCommand('mute', Boolean(muted)),
      // Song requests (CleanMusic 1.0.1): resolve with a plain result object.
      request: (query, options = {}) =>
        callRenderer('request', {
          query: oneLine(query, 200),
          by: oneLine(options.by, 40),
          source: ['auto', 'full', 'preview'].includes(options.source) ? options.source : 'auto',
          maxSeconds: Math.max(0, Math.min(6 * 3600, Math.round(Number(options.maxSeconds) || 0))),
          position: options.position === 'end' ? 'end' : 'next',
          playlist: oneLine(options.playlist, 80),
          blockAi: Boolean(options.blockAi),
          aiWords: oneLine(options.aiWords, 1000),
        }),
      requests: () => callRenderer('requests'),
      removeRequest: (by) => callRenderer('removeRequest', { by: oneLine(by, 40) }),
    },
    copyText: guard('clipboard', (text) => clipboard.writeText(String(text == null ? '' : text).slice(0, 10000))),
    openExternal: (url) => {
      if (!may('external-links')) throw permissionError('external-links');
      const target = String(url || '');
      if (!/^https?:\/\//i.test(target)) return false;
      shell.openExternal(target);
      return true;
    },
    openPath: async (target) => {
      if (!may('fs:folder')) throw permissionError('fs:folder');
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
  lyric: null, // { line, next } while lyrics are on
  upNext: [], // [{ title, artist, by }] – the next titles, by = song request from
  visualizer: { spectrum: [], level: 0, at: 0 }, // 32 bands 0–255, only for plugins with visualizer: true
};

/* --- Visualizer spectrum for overlays (API v2) ---------------------- */

let visualizerWatchOn = false;

function pluginWantsVisualizer() {
  for (const plugin of plugins.values()) {
    if (plugin.module && plugin.module.visualizer === true && pluginAllows(plugin, 'visualizer')) return true;
  }
  return false;
}

function updateVisualizerWatch() {
  const on = pluginWantsVisualizer();
  if (on === visualizerWatchOn) return;
  visualizerWatchOn = on;
  sendToRenderer('visualizer-watch', on);
}

function emitVisualizerEvent() {
  let interested = false;
  for (const plugin of plugins.values()) {
    if (plugin.module && plugin.module.visualizer === true && pluginAllows(plugin, 'visualizer') && typeof plugin.module.onEvent === 'function') {
      interested = true;
      break;
    }
  }
  if (!interested) return;
  const snapshot = JSON.parse(JSON.stringify(playerState));
  for (const plugin of plugins.values()) {
    if (!plugin.module || plugin.module.visualizer !== true) continue;
    if (!pluginAllows(plugin, 'visualizer')) continue;
    if (typeof plugin.module.onEvent !== 'function') continue;
    try {
      const result = plugin.module.onEvent('visualizer', snapshot);
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      /* a plugin error must never break playback */
    }
  }
}

ipcMain.on('visualizer-state', (event, raw) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
  if (!raw || typeof raw !== 'object') return;
  const spectrum = (Array.isArray(raw.spectrum) ? raw.spectrum : [])
    .slice(0, 64)
    .map((value) => Math.max(0, Math.min(255, Math.round(Number(value) || 0))));
  const level = Math.max(0, Math.min(1, Number(raw.level) || 0));
  playerState.visualizer = { spectrum, level, at: Date.now() };
  if (spectrum.length) emitVisualizerEvent();
});

function sendPlayerCommand(command, value) {
  sendToRenderer('player-command', { command, value });
  return true;
}

function oneLine(value, max) {
  return cleanText(value, max * 2)
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, max);
}

// Player commands that answer (song requests): the renderer replies with the callId.
const rendererCalls = new Map();
let rendererCallId = 0;

function callRenderer(command, value, timeout = 25000) {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve({ ok: false, reason: 'error', error: 'CleanMusic ist nicht bereit.' });
  rendererCallId += 1;
  const callId = rendererCallId;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      rendererCalls.delete(callId);
      resolve({ ok: false, reason: 'timeout' });
    }, timeout);
    rendererCalls.set(callId, (result) => {
      clearTimeout(timer);
      rendererCalls.delete(callId);
      resolve(result);
    });
    sendToRenderer('player-command', { command, value, callId });
  });
}

/* --- Optional phone remote (LAN only, disabled until enabled) -------- */

let remoteServer = null;
let remoteKeyCache = new Map();
const remoteSseClients = new Set();
const remoteRate = new Map();
const remoteStationCache = new Map();

function isPrivateIpv4(value) {
  const parts = String(value || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168);
}

function normalizedRemoteIp(value) {
  const address = String(value || '').split('%')[0].toLowerCase();
  if (address.startsWith('::ffff:')) return address.slice(7);
  return address;
}

function isAllowedRemoteIp(value) {
  const address = normalizedRemoteIp(value);
  return address === '::1' || /^127\./.test(address) || isPrivateIpv4(address);
}

function remoteLanAddress() {
  // Virtual adapters (WSL, Hyper-V, Docker, VirtualBox, VMware, VPNs) are not
  // reachable from the phone – prefer Wi-Fi/Ethernet and 192.168.x.x.
  const virtual = /vethernet|wsl|hyper-v|docker|virtualbox|vmware|vbox|loopback|tailscale|zerotier|hamachi|vpn|tap|tun/i;
  const candidates = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if ((entry.family === 'IPv4' || entry.family === 4) && !entry.internal && isPrivateIpv4(entry.address)) {
        let score = 0;
        if (virtual.test(name)) score -= 100;
        if (/wlan|wi-?fi|wireless|ethernet|lan/i.test(name)) score += 10;
        if (entry.address.startsWith('192.168.')) score += 5;
        else if (entry.address.startsWith('10.')) score += 2;
        candidates.push({ address: entry.address, score });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.length ? candidates[0].address : '';
}

function remoteConfig() {
  const config = readConfig();
  return {
    enabled: Boolean(config.remoteEnabled && remoteServer && remoteServer.listening),
    port: Math.max(0, Math.min(65535, Number(config.remotePort) || 4790)),
    key: typeof config.remoteKey === 'string' ? config.remoteKey : '',
  };
}

function remotePageUrl() {
  const config = remoteConfig();
  const ip = isSmoke ? '127.0.0.1' : remoteLanAddress();
  if (!config.key || !ip || !config.enabled) return null;
  const port = remoteServer.address() && remoteServer.address().port || config.port;
  return `http://${ip}:${port}/?k=${encodeURIComponent(config.key)}`;
}

function remoteText(value, max = 200) {
  let text = redactDiagnostic(cleanText(value, max * 2));
  if (/^(?:[a-z]:[\\/]|\\\\)/i.test(text.trim())) return 'Lokale Datei';
  text = text.replace(/(?:^|\s)~[\\/][^\s]*/g, ' [lokaler Pfad]');
  const username = String(process.env.USERNAME || '');
  if (username.length > 1) {
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    text = text.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '[Benutzer]');
  }
  return cleanText(text, max);
}

function remoteSettingsPublic() {
  const config = remoteConfig();
  const url = remotePageUrl();
  if (!url) return Promise.resolve({
    enabled: config.enabled,
    port: remoteServer && remoteServer.listening ? remoteServer.address().port : config.port,
    requestedPort: config.port,
    url: '',
    qr: '',
    ip: '',
    error: null,
  });
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 220 })
    .then((qr) => ({
      enabled: config.enabled,
      port: remoteServer && remoteServer.listening ? remoteServer.address().port : config.port,
      requestedPort: config.port,
      url: url || '',
      qr: url ? qr : '',
      ip: isSmoke ? '127.0.0.1' : remoteLanAddress(),
      error: null,
    }))
    .catch(() => ({ enabled: config.enabled, port: config.port, requestedPort: config.port, url: url || '', qr: '', ip: '', error: 'QR-Code konnte nicht erstellt werden.' }));
}

function remoteState() {
  return {
    track: playerState.track
      ? {
          title: remoteText(playerState.track.title),
          artist: remoteText(playerState.track.artist),
          cover: cleanUrl(playerState.track.artwork, /^https:\/\//i),
        }
      : null,
    position: playerState.position,
    duration: playerState.duration,
    playing: playerState.playing,
    volume: playerState.volume,
    queue: playerState.upNext.slice(0, 10).map(({ title, artist }) => ({ title: remoteText(title), artist: remoteText(artist) })),
    lyric: playerState.lyric && playerState.lyric.line ? remoteText(playerState.lyric.line, 300) : '',
  };
}

function notifyRemoteState() {
  sendMiniState();
  updateTaskbar();
  if (!remoteSseClients.size) return;
  const payload = `event: state\ndata: ${JSON.stringify(remoteState())}\n\n`;
  for (const response of remoteSseClients) {
    try {
      response.write(payload);
    } catch {
      remoteSseClients.delete(response);
    }
  }
}

function remoteHostAllowed(request) {
  const rawHost = String(request.headers.host || '');
  const match = rawHost.match(/^([a-z0-9.-]+)(?::(\d{1,5}))?$/i);
  if (!match || Number(match[2]) !== Number(request.socket.localPort)) return false;
  const host = match[1].toLowerCase();
  if (host === 'localhost') return true;
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || !isAllowedRemoteIp(host)) return false;
  if (host === normalizedRemoteIp(request.socket.localAddress)) return true;
  return host.startsWith('127.') && normalizedRemoteIp(request.socket.localAddress).startsWith('127.');
}

function remoteAuthorized(request, url) {
  if (!remoteHostAllowed(request) || !isAllowedRemoteIp(request.socket.remoteAddress)) return false;
  const expected = String(readConfig().remoteKey || '');
  const supplied = String(request.headers['x-cm-key'] || url.searchParams.get('k') || '');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function remoteRateAllowed(request) {
  const ip = normalizedRemoteIp(request.socket.remoteAddress);
  const now = Date.now();
  let entry = remoteRate.get(ip);
  if (!entry || now - entry.start >= 1000) {
    entry = { start: now, count: 0 };
    remoteRate.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= 20;
}

function sendRemoteJson(response, status, data) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  response.end(body);
}

function readRemoteBody(request, maxBytes = 8192) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('body-too-large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(new Error('bad-json'));
      }
    });
    request.on('error', reject);
  });
}

function safeRemoteTrack(track) {
  if (!track || !['apple', 'deezer'].includes(track.source) || !track.id || !track.preview) return null;
  let preview;
  try {
    preview = new URL(track.preview);
  } catch {
    return null;
  }
  if (preview.protocol !== 'https:') return null;
  const entry = {
    id: cleanText(track.id, 200),
    source: track.source,
    sourceLabel: track.sourceLabel === 'Apple Music' ? 'Apple Music' : 'Deezer',
    title: cleanText(track.title, 200),
    artist: cleanText(track.artist, 200),
    album: cleanText(track.album, 200),
    artwork: cleanUrl(track.artwork, /^https:\/\//i),
    duration: Math.max(0, Number(track.duration) || 0),
    preview: preview.href,
    link: cleanUrl(track.link, /^https:\/\//i),
    artistId: cleanText(track.artistId, 40),
  };
  return entry;
}

async function handleRemoteRequest(request, response) {
  let url;
  try {
    url = new URL(request.url, 'http://localhost');
  } catch {
    sendRemoteJson(response, 400, { error: 'bad-request' });
    return;
  }
  const peer = normalizedRemoteIp(request.socket.remoteAddress);
  if (!isAllowedRemoteIp(peer)) return sendRemoteJson(response, 403, { error: 'forbidden' });
  if (!remoteHostAllowed(request)) return sendRemoteJson(response, 403, { error: 'forbidden' });
  if (!remoteRateAllowed(request)) return sendRemoteJson(response, 429, { error: 'rate-limit' });
  if (!remoteAuthorized(request, url)) return sendRemoteJson(response, 401, { error: 'unauthorized' });

  if (request.method === 'GET' && url.pathname === '/') {
    let html;
    try {
      html = await fsp.readFile(path.join(ROOT, 'renderer', 'remote', 'index.html'));
    } catch {
      return sendRemoteJson(response, 500, { error: 'unavailable' });
    }
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'content-length': html.length,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    });
    response.end(html);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/state') return sendRemoteJson(response, 200, remoteState());

  if (request.method === 'GET' && url.pathname === '/api/events') {
    if (remoteSseClients.size >= 10) return sendRemoteJson(response, 429, { error: 'too-many-streams' });
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    response.write(`event: state\ndata: ${JSON.stringify(remoteState())}\n\n`);
    remoteSseClients.add(response);
    response.on('close', () => remoteSseClients.delete(response));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/search') {
    const query = String(url.searchParams.get('q') || '').trim().slice(0, 120);
    if (!query) return sendRemoteJson(response, 200, { tracks: [] });
    const results = await Promise.allSettled([
      fetchJson(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=30&country=DE`),
      fetchJson(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=30`),
    ]);
    const tracks = [];
    const seen = new Set();
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const list = index === 0 ? normalizeItunes(result.value) : normalizeDeezer(result.value);
      list.forEach((track) => {
        const safe = safeRemoteTrack(track);
        if (!safe) return;
        const ref = `${safe.source}:${safe.id}`;
        if (seen.has(ref)) return;
        seen.add(ref);
        remoteKeyCache.delete(ref);
        remoteKeyCache.set(ref, safe);
        tracks.push({ id: ref, title: safe.title, artist: safe.artist, cover: safe.artwork, source: safe.source });
      });
    });
    while (remoteKeyCache.size > 120) remoteKeyCache.delete(remoteKeyCache.keys().next().value);
    return sendRemoteJson(response, 200, { tracks: tracks.slice(0, 30) });
  }

  if (request.method === 'GET' && url.pathname === '/api/radio') {
    const tag = String(url.searchParams.get('tag') || '').trim().slice(0, 40);
    const params = new URLSearchParams({ limit: '40', hidebroken: 'true', order: 'clickcount', reverse: 'true' });
    if (tag) params.set('tag', tag);
    try {
      const json = await fetchJson(`https://de1.api.radio-browser.info/json/stations/search?${params.toString()}`, 15000);
      const stations = normalizeStations(json).slice(0, 30);
      remoteStationCache.clear();
      stations.forEach((station) => remoteStationCache.set(station.id, station));
      return sendRemoteJson(response, 200, {
        stations: stations.map((station) => ({
          id: station.id,
          name: station.name,
          meta: [station.country, station.codec, station.bitrate ? `${station.bitrate} kbps` : ''].filter(Boolean).join(' · '),
        })),
        error: null,
      });
    } catch (error) {
      return sendRemoteJson(response, 200, { stations: [], error: friendlyNetError(error).message || 'Radio nicht erreichbar.' });
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/radio') {
    let body;
    try { body = await readRemoteBody(request); } catch { return sendRemoteJson(response, 400, { error: 'bad-request' }); }
    const station = remoteStationCache.get(String(body.id || ''));
    if (!station) return sendRemoteJson(response, 404, { error: 'not-found' });
    const result = await callRenderer('remoteRadio', { station }, 6000);
    return sendRemoteJson(response, result && result.ok === false ? 503 : 200, { ok: !(result && result.ok === false) });
  }

  if (request.method === 'GET' && url.pathname === '/api/favorites') {
    const result = await callRenderer('remoteFavorites', { list: true }, 6000);
    return sendRemoteJson(response, 200, {
      favorites: result && Array.isArray(result.favorites) ? result.favorites : [],
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/favorites') {
    let body;
    try { body = await readRemoteBody(request); } catch { return sendRemoteJson(response, 400, { error: 'bad-request' }); }
    const id = String(body.id || '').slice(0, 300);
    if (!id) return sendRemoteJson(response, 400, { error: 'bad-request' });
    const result = await callRenderer('remoteFavorites', { id }, 6000);
    return sendRemoteJson(response, result && result.ok === false ? (result.reason === 'not-found' ? 404 : 503) : 200, {
      ok: !(result && result.ok === false),
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/cmd') {
    let body;
    try { body = await readRemoteBody(request); } catch { return sendRemoteJson(response, 400, { error: 'bad-request' }); }
    const command = String(body.cmd || '');
    if (!['toggle', 'play', 'pause', 'next', 'prev', 'seek', 'volume', 'like'].includes(command)) {
      return sendRemoteJson(response, 400, { error: 'bad-command' });
    }
    let value;
    if (command === 'seek') {
      value = Number(body.value);
      if (!Number.isFinite(value) || value < 0 || value > Math.max(0, playerState.duration)) return sendRemoteJson(response, 400, { error: 'bad-value' });
    } else if (command === 'volume') {
      value = Number(body.value);
      if (!Number.isFinite(value) || value < 0 || value > 1.5) return sendRemoteJson(response, 400, { error: 'bad-value' });
    }
    const names = { prev: 'previous' };
    const result = await callRenderer(names[command] || command, value, 6000);
    return sendRemoteJson(response, result && result.ok === false ? 503 : 200, { ok: !(result && result.ok === false) });
  }

  if (request.method === 'POST' && url.pathname === '/api/queue') {
    let body;
    try { body = await readRemoteBody(request); } catch { return sendRemoteJson(response, 400, { error: 'bad-request' }); }
    const track = remoteKeyCache.get(String(body.id || ''));
    const mode = body.position === 'next' ? 'next' : 'end';
    if (!track) return sendRemoteJson(response, 404, { error: 'not-found' });
    const result = await callRenderer('remoteQueue', { track, mode }, 6000);
    return sendRemoteJson(response, result && result.ok === false ? 503 : 200, { ok: !(result && result.ok === false) });
  }

  sendRemoteJson(response, 404, { error: 'not-found' });
}

function stopRemoteServer() {
  if (!remoteServer) return Promise.resolve();
  const server = remoteServer;
  remoteServer = null;
  remoteKeyCache.clear();
  remoteStationCache.clear();
  remoteRate.clear();
  for (const response of remoteSseClients) response.end();
  remoteSseClients.clear();
  return new Promise((resolve) => {
    try { server.close(() => resolve()); } catch { resolve(); }
  });
}

function startRemoteServer(port, { smoke = false } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      handleRemoteRequest(request, response).catch(() => {
        if (!response.headersSent) sendRemoteJson(response, 500, { error: 'internal-error' });
        else response.end();
      });
    });
    server.headersTimeout = 5000;
    server.requestTimeout = 10000;
    server.keepAliveTimeout = 5000;
    server.maxHeadersCount = 40;
    server.on('error', reject);
    server.listen(port, smoke ? '127.0.0.1' : '0.0.0.0', () => {
      server.removeListener('error', reject);
      remoteServer = server;
      resolve(server.address().port);
    });
  });
}

function smokeWavDataUrl() {
  const samples = 8000;
  const wav = Buffer.alloc(44 + samples, 128);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(8000, 28);
  wav.writeUInt16LE(1, 32);
  wav.writeUInt16LE(8, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(samples, 40);
  return `data:audio/wav;base64,${wav.toString('base64')}`;
}

/** 2.0 Phase 2: schema marker, pre-migration backup file and quarantine. */
async function smokeMigrations() {
  const broken = '{"favorites": [ kaputt';
  const result = await mainWindow.webContents.executeJavaScript(`
    (() => {
      const M = window.CMMigrations;
      if (!M || !window.CMPersist) return { error: 'CMMigrations fehlt' };
      const first = M.report() || {};
      const key = window.CMPersist.STORAGE.collection;
      const keep = localStorage.getItem(key);
      const schemaKeep = localStorage.getItem(M.SCHEMA_KEY);
      localStorage.setItem(key, ${JSON.stringify(broken)});
      localStorage.removeItem(M.SCHEMA_KEY);
      const second = M.run({ appVersion: 'smoke' });
      const box = JSON.parse(localStorage.getItem(M.QUARANTINE_KEY) || '{}');
      const parked = Array.isArray(box.items) && box.items.some((item) => item.key === key && item.raw === ${JSON.stringify(broken)});
      if (keep === null) localStorage.removeItem(key); else localStorage.setItem(key, keep);
      localStorage.removeItem(M.QUARANTINE_KEY);
      if (schemaKeep !== null) localStorage.setItem(M.SCHEMA_KEY, schemaKeep);
      const third = M.run({ appVersion: 'smoke' });
      return {
        startSchema: first.to,
        startSkipped: first.skipped || null,
        version: M.SCHEMA_VERSION,
        ran: second.ran,
        backup: second.backup,
        quarantined: second.quarantined.map((item) => item.name),
        parked,
        again: third.ran.length,
        collectionKey: key,
      };
    })()
  `);
  if (!result || result.error) throw new Error((result && result.error) || 'keine Antwort');
  let backupOk = false;
  try {
    const file = String(result.backup || '');
    const inFolder = path.relative(migrationBackupDir(), file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    backupOk = !inFolder.startsWith('..') && !path.isAbsolute(inFolder) &&
      data.kind === 'schema-snapshot' && data.keys[result.collectionKey] === broken;
  } catch {
    backupOk = false;
  }
  const summary = {
    startSchema: result.startSchema,
    ran: result.ran,
    backupFile: backupOk,
    quarantined: result.quarantined,
    parked: result.parked,
    idempotent: result.again === 0,
  };
  if (result.startSchema !== result.version || result.startSkipped || !backupOk || !result.parked ||
      !result.quarantined.includes('collection') || result.ran.join() !== 'baseline' || result.again !== 0) {
    throw new Error(JSON.stringify(summary));
  }
  return summary;
}

async function smokeDiagnose() {
  if (!isSmoke) throw new Error('Diagnose-Smoke ist nur im Smoke-Profil erlaubt.');
  const server = http.createServer((request, response) => {
    if (request.url && request.url.startsWith('/forbidden')) {
      response.writeHead(403, { 'content-type': 'audio/mpeg', 'content-length': '4' });
      response.end('nein');
      return;
    }
    response.writeHead(404, { 'content-type': 'text/plain' });
    response.end('nicht da');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}/forbidden.mp3`;
  try {
    await mainWindow.webContents.executeJavaScript(
      `window.CleanMusic.diagnosticPlay(${JSON.stringify(url)})`
    );
    await new Promise((resolve) => setTimeout(resolve, 3000));
    const text = await diagnosticText();
    const result = {
      forbidden: text.includes('HTTP 403'),
      audio: text.includes('Audio:'),
      problems: text.includes('Wiedergabe-Probleme (letzte 10)'),
      media: text.includes('Medien-Anfragen mit Fehler (letzte 15)'),
      hostOnly: text.includes(`127.0.0.1:${port}`) && !text.includes('/forbidden'),
      sample: text.split('\n').filter((line) => /Audio:|HTTP 403|Wiedergabe-Probleme|Fehlercode|hängt 12 s/.test(line)).slice(0, 8),
    };
    if (!result.forbidden || !result.audio || !result.problems || !result.media || !result.hostOnly) {
      throw new Error(JSON.stringify(result));
    }
    return result;
  } finally {
    await mainWindow.webContents.executeJavaScript(`
      (() => {
        const audio = document.querySelector('#audio');
        if (audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
        return true;
      })()
    `).catch(() => {});
    server.close();
  }
}

async function smokeRemote() {
  if (!isSmoke) throw new Error('Fernbedienungs-Smoke ist nur im Smoke-Profil erlaubt.');
  const defaultOff = !remoteServer && !readConfig().remoteEnabled;
  const key = crypto.randomBytes(24).toString('base64url');
  writeConfig({ remoteEnabled: true, remotePort: 4790, remoteKey: key });
  const port = await startRemoteServer(0, { smoke: true });
  if (!remoteServer || remoteServer.address().address !== '127.0.0.1') throw new Error('Smoke-Server hat nicht nur auf 127.0.0.1 gebunden.');
  const base = `http://127.0.0.1:${port}`;
  const request = (url, options = {}) => fetch(`${base}${url}`, options);
  const noKey = await request('/api/state');
  const wrongKey = await request('/api/state', { headers: { 'X-CM-Key': 'not-the-key' } });
  const authorized = { 'X-CM-Key': key };
  const pageResponse = await request(`/?k=${encodeURIComponent(key)}`);
  const page = await pageResponse.text();
  const stateResponse = await request('/api/state', { headers: authorized });
  const initial = await stateResponse.json();
  const serialized = JSON.stringify(initial);
  const sanitized = !/(?:[A-Z]:\\Users\\|\\\\|"path"|"pluginId")/i.test(serialized);

  const setup = await mainWindow.webContents.executeJavaScript(`
    (async () => {
      const audio = document.querySelector('#audio');
      const before = { hadSrc: Boolean(audio.src), paused: audio.paused, loop: audio.loop };
      audio.loop = true;
      if (!audio.src) audio.src = ${JSON.stringify(smokeWavDataUrl())};
      if (audio.paused) await audio.play();
      return before;
    })()
  `);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const beforeToggleResponse = await request('/api/state', { headers: authorized });
  const beforeToggle = await beforeToggleResponse.json();
  const commandResponse = await request('/api/cmd', {
    method: 'POST',
    headers: { ...authorized, 'content-type': 'application/json' },
    body: JSON.stringify({ cmd: 'toggle' }),
  });
  await new Promise((resolve) => setTimeout(resolve, 350));
  const afterToggleResponse = await request('/api/state', { headers: authorized });
  const afterToggle = await afterToggleResponse.json();
  const toggled = commandResponse.ok && beforeToggle.playing !== afterToggle.playing;
  if (toggled) {
    await request('/api/cmd', {
      method: 'POST',
      headers: { ...authorized, 'content-type': 'application/json' },
      body: JSON.stringify({ cmd: 'toggle' }),
    });
  }
  await mainWindow.webContents.executeJavaScript(`
    (() => {
      const audio = document.querySelector('#audio');
      audio.loop = ${Boolean(setup.loop)};
      if (!${Boolean(setup.hadSrc)}) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
      else if (${Boolean(setup.paused)}) audio.pause();
    })()
  `);

  const searchResponse = await request('/api/search?q=daft%20punk', { headers: authorized });
  const search = await searchResponse.json();
  const searchCount = Array.isArray(search.tracks) ? search.tracks.length : 0;
  const radioResponse = await request('/api/radio?tag=pop', { headers: authorized });
  const radio = await radioResponse.json();
  const radioCount = Array.isArray(radio.stations) ? radio.stations.length : 0;
  const favoritesResponse = await request('/api/favorites', { headers: authorized });
  const favorites = await favoritesResponse.json();
  const favoritesOk = Array.isArray(favorites.favorites);
  let queueStatus = 0;
  if (searchCount) {
    const queueResponse = await request('/api/queue', {
      method: 'POST',
      headers: { ...authorized, 'content-type': 'application/json' },
      body: JSON.stringify({ id: search.tracks[0].id, position: 'next' }),
    });
    queueStatus = queueResponse.status;
  }
  const remoteSettings = await remoteSettingsPublic();
  const taskbarIcons = ['previous', 'play', 'pause', 'next'].every((name) => {
    try { return fs.statSync(path.join(ROOT, 'renderer', 'assets', 'thumbar', `${name}.png`)).size > 0; } catch { return false; }
  });
  const diagnostic = await diagnosticText();
  const diagnosticsSafe = diagnostic.includes(`CleanMusic ${app.getVersion()}`) && !diagnostic.includes(os.homedir());
  const disabledFeatures = !readConfig().globalShortcuts && !readConfig().startOnLogin && readConfig().taskbarProgress !== false;
  let miniBridge = false;
  if (openMiniWindow() && miniWindow && !miniWindow.isDestroyed()) {
    const loaded = new Promise((resolve) => {
      if (!miniWindow.webContents.isLoading()) resolve();
      else miniWindow.webContents.once('did-finish-load', resolve);
    });
    await Promise.race([loaded, new Promise((resolve) => setTimeout(resolve, 5000))]);
    miniBridge = await miniWindow.webContents.executeJavaScript(
      'Boolean(window.mini && typeof window.mini.onState === "function" && typeof window.mini.command === "function" && !window.cm)'
    );
    closeMiniWindow(false);
  }
  await stopRemoteServer();
  writeConfig({ remoteEnabled: false });
  const result = {
    defaultOff,
    bind: '127.0.0.1',
    port,
    noKey: noKey.status,
    wrongKey: wrongKey.status,
    page: { status: pageResponse.status, csp: Boolean(pageResponse.headers.get('content-security-policy')), inlineOnly: !/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(page) },
    qr: /^http:\/\/127\.0\.0\.1:\d+\//.test(remoteSettings.url) && remoteSettings.qr.startsWith('data:image/png;base64,'),
    state: stateResponse.status,
    sanitized,
    toggle: toggled,
    search: { status: searchResponse.status, count: searchCount },
    radio: { status: radioResponse.status, count: radioCount },
    favorites: { status: favoritesResponse.status, ok: favoritesOk },
    queue: queueStatus,
    taskbarIcons,
    miniBridge,
    diagnosticsSafe,
    disabledFeatures,
    stopped: !remoteServer,
  };
  if (!defaultOff || noKey.status !== 401 || wrongKey.status !== 401 || pageResponse.status !== 200 || !result.page.csp || !result.page.inlineOnly || !result.qr || stateResponse.status !== 200 || !sanitized || !toggled || !searchResponse.ok || !searchCount || !radioResponse.ok || !radioCount || !favoritesResponse.ok || !favoritesOk || queueStatus !== 200 || !taskbarIcons || !miniBridge || !diagnosticsSafe || !disabledFeatures || !result.stopped) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function setRemoteEnabled(enabled, requestedPort) {
  const config = readConfig();
  const port = Math.max(1024, Math.min(65535, Math.round(Number(requestedPort) || Number(config.remotePort) || 4790)));
  if (!enabled) {
    await stopRemoteServer();
    writeConfig({ remoteEnabled: false, remotePort: port });
    return remoteSettingsPublic();
  }
  const key = config.remoteKey || crypto.randomBytes(24).toString('base64url');
  await stopRemoteServer();
  writeConfig({ remoteEnabled: true, remotePort: port, remoteKey: key });
  try {
    await startRemoteServer(port);
    return remoteSettingsPublic();
  } catch (error) {
    writeConfig({ remoteEnabled: false });
    return { enabled: false, port, requestedPort: port, url: '', qr: '', ip: '', error: cleanText(error.message, 180) || 'Der Port konnte nicht geöffnet werden.' };
  }
}

async function rotateRemoteKey() {
  const key = crypto.randomBytes(24).toString('base64url');
  writeConfig({ remoteKey: key });
  remoteKeyCache.clear();
  for (const response of remoteSseClients) {
    try { response.end(); } catch { /* already closed */ }
  }
  remoteSseClients.clear();
  return remoteSettingsPublic();
}

async function registeredRemoteAutostart() {
  if (isSmoke || !readConfig().remoteEnabled || remoteServer) return;
  const config = readConfig();
  const key = typeof config.remoteKey === 'string' && config.remoteKey.length >= 20
    ? config.remoteKey
    : crypto.randomBytes(24).toString('base64url');
  writeConfig({ remoteKey: key, remotePort: Math.max(1024, Math.min(65535, Number(config.remotePort) || 4790)) });
  try {
    await startRemoteServer(Number(readConfig().remotePort) || 4790);
  } catch (error) {
    writeConfig({ remoteEnabled: false });
    console.error('Remote server:', error.message);
  }
}

/* --- Desktop -> TV: Favoriten und Playlists per Link senden ---------- */

function tvPairTarget(value) {
  let url;
  try {
    url = new URL(String(value || ''));
  } catch {
    return null;
  }
  if (url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (host !== 'localhost' && !/^127\./.test(host) && !isPrivateIpv4(host)) return null;
  const port = Number(url.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
  if (url.username || url.password) return null;
  const key = url.searchParams.get('k') || '';
  if (key.length < 20 || key.length > 200) return null;
  return url;
}

ipcMain.handle('tv-pair-send', async (event, input) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return { ok: false, error: 'Nicht erlaubt.' };
  const target = tvPairTarget(input && input.url);
  if (!target) return { ok: false, error: 'Bitte den vollständigen TV-Link einfügen (http://IP:Port/?k=…).' };
  const favorites = Array.isArray(input.favorites) ? input.favorites.slice(0, 2000) : [];
  const playlists = Array.isArray(input.playlists) ? input.playlists.slice(0, 200) : [];
  const body = JSON.stringify({ favorites, playlists });
  if (Buffer.byteLength(body) > 4 * 1024 * 1024) return { ok: false, error: 'Zu viele Daten für den Fernseher.' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await net.fetch(`${target.origin}/api/pair${target.search}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-cm-key': target.searchParams.get('k') || '' },
      body,
      signal: controller.signal,
    });
    if (response.status === 401) return { ok: false, error: 'Der TV-Link ist ungültig. Am Fernseher einen neuen Link erzeugen.' };
    if (!response.ok) return { ok: false, error: `Fernseher antwortet mit HTTP ${response.status}.` };
    const result = await response.json().catch(() => ({}));
    if (result && result.ok === false) return { ok: false, error: 'Am Fernseher abgelehnt.' };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.name === 'AbortError' ? 'Fernseher antwortet nicht.' : 'Fernseher nicht erreichbar.' };
  } finally {
    clearTimeout(timer);
  }
});

ipcMain.handle('remote-get', (event) => event.sender === (mainWindow && mainWindow.webContents) ? remoteSettingsPublic() : null);
ipcMain.handle('remote-set', (event, patch) => event.sender === (mainWindow && mainWindow.webContents)
  ? setRemoteEnabled(Boolean(patch && patch.enabled), patch && patch.port)
  : null);
ipcMain.handle('remote-rotate', (event) => event.sender === (mainWindow && mainWindow.webContents) ? rotateRemoteKey() : null);

ipcMain.on('mini-command', (event, message) => {
  if (!miniWindow || event.sender !== miniWindow.webContents || !message) return;
  switch (message.command) {
    case 'toggle': case 'next': case 'previous':
      sendPlayerCommand(message.command);
      break;
    case 'seek': case 'volume':
      if (Number.isFinite(Number(message.value))) sendPlayerCommand(message.command, Number(message.value));
      break;
    case 'alwaysOnTop':
      saveMiniOnTop(Boolean(message.value));
      break;
    case 'restore':
      closeMiniWindow(true);
      break;
    default:
  }
});

ipcMain.on('player-command-result', (event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return;
  const done = rendererCalls.get(Number(payload && payload.callId));
  if (!done) return;
  let result = null;
  try {
    result = JSON.parse(JSON.stringify(payload.result === undefined ? null : payload.result));
  } catch {
    result = { ok: false, reason: 'error' };
  }
  done(result);
});

function emitPluginEvent(type) {
  const snapshot = JSON.parse(JSON.stringify(playerState));
  for (const plugin of plugins.values()) {
    if (!plugin.module || typeof plugin.module.onEvent !== 'function') continue;
    if (!pluginAllows(plugin, 'player')) continue;
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
  playerState.lyric =
    raw.lyric && typeof raw.lyric === 'object'
      ? { line: cleanText(raw.lyric.line, 300), next: cleanText(raw.lyric.next, 300) }
      : null;
  playerState.upNext = (Array.isArray(raw.upNext) ? raw.upNext : []).slice(0, 10).map((entry) => ({
    title: cleanText(entry && entry.title, 200),
    artist: cleanText(entry && entry.artist, 200),
    by: cleanText(entry && entry.by, 40),
  }));

  updateTray();
  notifyRemoteState();
  if (trackChanged) emitPluginEvent('nowplaying');
  if (volumeChanged) emitPluginEvent('volume');
  emitPluginEvent('state');
});

/* --- Plugin settings fields (API v2) -------------------------------- */

const SETTING_TYPES = ['text', 'number', 'toggle', 'select', 'folder', 'password'];

function pluginSettingFields(mod, plugin = null) {
  if (plugin && !pluginAllows(plugin, 'ui:settings')) return [];
  const dynamic = plugin && plugin.dynamicOptions ? plugin.dynamicOptions : {};
  return (mod && Array.isArray(mod.settings) ? mod.settings : [])
    .filter((field) => field && PLUGIN_ID.test(String(field.id || '').toLowerCase()) && SETTING_TYPES.includes(field.type))
    .slice(0, 24)
    .map((field) => ({
      id: String(field.id),
      type: field.type,
      label: cleanText(field.label || field.id, 80),
      help: cleanText(field.help || '', 300),
      placeholder: cleanText(field.placeholder || '', 80),
      min: Number.isFinite(Number(field.min)) ? Number(field.min) : null,
      max: Number.isFinite(Number(field.max)) ? Number(field.max) : null,
      options: mergeOptions(
        (Array.isArray(field.options) ? field.options : [])
          .filter((option) => option && option.value != null)
          .slice(0, 20)
          .map((option) => ({ value: cleanText(option.value, 60), label: cleanText(option.label || option.value, 60) })),
        dynamic[String(field.id)]
      ),
      optionsFrom: field.type === 'select' && typeof field.optionsFrom === 'string' && /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(field.optionsFrom)
        ? field.optionsFrom
        : null,
      default: field.default,
    }));
}

function mergeOptions(base, extra) {
  const out = base.slice();
  (Array.isArray(extra) ? extra : []).forEach((option) => {
    if (!out.some((known) => known.value === option.value)) out.push(option);
  });
  return out.slice(0, 50);
}

// v3: a select field with optionsFrom: 'listDevices' asks the plugin for its
// options when the settings are shown (max. 50, 3 s, cleaned like static ones).
async function refreshDynamicOptions(plugin) {
  const mod = plugin && plugin.module;
  if (!mod) return;
  const fields = pluginSettingFields(mod, Object.assign({}, plugin, { dynamicOptions: {} })).filter((field) => field.optionsFrom);
  if (!fields.length) return;
  const next = {};
  for (const field of fields) {
    const fn = mod[field.optionsFrom];
    if (typeof fn !== 'function') continue;
    try {
      const raw = await Promise.race([
        Promise.resolve(fn.call(mod)),
        new Promise((resolve) => setTimeout(() => resolve([]), 3000)),
      ]);
      next[field.id] = (Array.isArray(raw) ? raw : [])
        .filter((option) => option && option.value != null)
        .slice(0, 50)
        .map((option) => ({ value: cleanText(option.value, 60), label: cleanText(option.label || option.value, 60) }));
    } catch {
      next[field.id] = [];
    }
  }
  plugin.dynamicOptions = next;
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
  const fields = pluginSettingFields(plugin && (plugin.module || plugin.candidate), plugin);
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
    const fields = pluginSettingFields(plugin.module, plugin);
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
    Object.assign(plugin, readPluginManifest(plugin.file));
    if (plugin.manifestError) throw new Error(`Manifest: ${plugin.manifestError}`);
    delete require.cache[require.resolve(plugin.file)];
    const mod = require(plugin.file);
    if (!mod || typeof mod !== 'object') throw new Error('Plugin exportiert kein Objekt');
    if (mod.apiVersion !== 1 && mod.apiVersion !== 2 && mod.apiVersion !== 3) {
      throw new Error('Nicht unterstützte Plugin-API (erwartet apiVersion 1, 2 oder 3)');
    }
    if (plugin.manifestError) throw new Error(`Manifest: ${plugin.manifestError}`);
    if (mod.apiVersion === 3 && !plugin.manifest) {
      throw new Error('Plugin-API v3 braucht den Manifest-Kopf /* cleanmusic-plugin { … } */.');
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

  updateVisualizerWatch();
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
  plugin.panels = [];
  updateVisualizerWatch();
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
  if (capability && SOURCE_CAPABILITIES.includes(capability) && !pluginAllows(plugin, 'source')) return null;
  if (capability === 'download' && !pluginAllows(plugin, 'downloads:cc-only')) return null;
  return plugin;
}

function cleanText(value, max = 300) {
  return String(value == null ? '' : value).slice(0, max);
}

const diagnosticErrors = [];
let rendererDiagnosticState = {};
const mediaRequestErrors = [];

const DIAGNOSTIC_MODES = ['plugin', 'matched', 'preview', 'stream', 'local', 'radio', 'loading', 'error'];

function cleanHost(value) {
  const host = cleanText(value, 120).trim().toLowerCase();
  return /^[a-z0-9.-]+(?::\d{1,5})?$/.test(host) ? host : '';
}

function mediaHost(value) {
  try {
    return cleanHost(new URL(String(value || '')).host);
  } catch {
    return '';
  }
}

function recordMediaRequestError(what, url) {
  mediaRequestErrors.push({
    at: new Date().toISOString(),
    what: redactDiagnostic(cleanText(what, 60)),
    host: mediaHost(url),
  });
  if (mediaRequestErrors.length > 15) {
    mediaRequestErrors.splice(0, mediaRequestErrors.length - 15);
  }
}

function cleanDiagnosticProblems(input) {
  return (Array.isArray(input) ? input : [])
    .slice(-10)
    .map((problem) => {
      const row = problem && typeof problem === 'object' ? problem : {};
      const mode = DIAGNOSTIC_MODES.includes(row.mode) ? row.mode : '';
      return {
        at: cleanText(row.at, 40),
        art: redactDiagnostic(cleanText(row.art, 60)),
        mode,
        readyState: Math.max(0, Math.min(4, Math.floor(Number(row.readyState) || 0))),
        networkState: Math.max(0, Math.min(3, Math.floor(Number(row.networkState) || 0))),
        host: cleanHost(row.host),
        title: redactDiagnostic(cleanText(row.title, 80)),
      };
    });
}

function redactDiagnostic(value) {
  let text = String(value == null ? '' : value).slice(0, 4000);
  for (const home of new Set([os.homedir(), process.env.USERPROFILE, process.env.HOME].filter(Boolean))) {
    const escaped = String(home).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\\/]+/g, '[\\\\/]');
    try { text = text.replace(new RegExp(escaped, 'gi'), '~'); } catch { /* malformed environment path */ }
  }
  return text
    .replace(/([?&](?:k|token|key)=)[^&\s]+/gi, '$1[ausgeblendet]')
    .replace(/(X-CM-Key\s*[:=]\s*)[^\s,;]+/gi, '$1[ausgeblendet]');
}

function recordDiagnosticError(source, error) {
  const message = redactDiagnostic(error && error.stack ? error.stack : error && error.message ? error.message : error);
  diagnosticErrors.push({ at: new Date().toISOString(), source: cleanText(source, 40), message });
  if (diagnosticErrors.length > 30) diagnosticErrors.splice(0, diagnosticErrors.length - 30);
}

async function activePluginDiagnostics() {
  const { enabled } = pluginConfig();
  const active = Array.from(plugins.values()).filter(
    (plugin) => plugin.module && enabled.includes(plugin.id)
  );
  return Promise.all(
    active.map(async (plugin) => {
      try {
        const info = await pluginInfo(plugin, true, false);
        return {
          name: cleanText(info.name || plugin.id, 80),
          version: cleanText(info.version || 'unbekannt', 30),
          status: cleanText((info.status && info.status.text) || '', 160),
        };
      } catch (error) {
        return {
          name: cleanText(plugin.id, 80),
          version: 'unbekannt',
          status: `Status-Fehler: ${cleanText(error && error.message, 100)}`,
        };
      }
    })
  );
}

async function diagnosticText() {
  const config = readConfig();
  const audio = rendererDiagnosticState;
  const pluginRows = await activePluginDiagnostics();
  const pluginLine =
    pluginRows
      .map((plugin) => `${plugin.name} ${plugin.version}${plugin.status ? ` (${plugin.status})` : ''}`)
      .join(', ') || 'keine';
  const lines = [
    `CleanMusic ${app.getVersion()} (${isInstalledCopy() ? 'installiert' : 'portable'})`,
    `Electron ${process.versions.electron} · Chrome ${process.versions.chrome} · Windows ${os.release()}`,
    `Plugins: ${pluginLine}`,
    `Audio: ${audio.audioContext || 'unbekannt'} · ${audio.sampleRate ? `${audio.sampleRate} Hz` : 'Abtastrate unbekannt'} · Lautstärke ${audio.volume || 0}%${audio.muted ? ' · stumm' : ''} · Audio-Kette ${audio.audioChain ? 'an' : 'aus'}`,
    `Fernbedienung: ${config.remoteEnabled ? 'an' : 'aus'} · Layout: ${audio.layout || 'unbekannt'}`,
    `Daten-Schema: ${audio.schema || '?'}${audio.migration ? ` (${audio.migration})` : ''} · Quarantäne: ${audio.quarantined || 0}`,
    '',
    'Wiedergabe-Probleme (letzte 10):',
  ];
  if (!audio.problems || !audio.problems.length) lines.push('Keine.');
  else {
    audio.problems.forEach((problem) => {
      lines.push(
        `[${problem.at}] ${problem.art} · Modus ${problem.mode || 'unbekannt'} · readyState ${problem.readyState} · networkState ${problem.networkState} · ${problem.host || 'ohne Host'} · ${problem.title || 'ohne Titel'}`
      );
    });
  }
  lines.push('', 'Medien-Anfragen mit Fehler (letzte 15):');
  if (!mediaRequestErrors.length) lines.push('Keine.');
  else {
    mediaRequestErrors.forEach((error) => {
      lines.push(`[${error.at}] ${error.what} · ${error.host || 'ohne Host'}`);
    });
  }
  lines.push('', 'Letzte Fehler (maximal 30):');
  if (!diagnosticErrors.length) lines.push('Keine Fehler seit dem Start.');
  else diagnosticErrors.forEach((error) => lines.push(`[${error.at}] ${error.source}: ${error.message}`));
  return redactDiagnostic(lines.join('\n'));
}

process.on('uncaughtExceptionMonitor', (error) => recordDiagnosticError('Hauptprozess', error));
process.on('unhandledRejection', (error) => recordDiagnosticError('Hauptprozess · Promise', error));

ipcMain.on('diagnostic-error', (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  recordDiagnosticError('Renderer', payload && payload.message);
});
ipcMain.on('diagnostic-state', (event, payload) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || !payload || typeof payload !== 'object') return;
  rendererDiagnosticState = {
    audioChain: Boolean(payload.audioChain),
    audioContext: cleanText(payload.audioContext, 30),
    sampleRate: Math.max(0, Math.min(384000, Math.floor(Number(payload.sampleRate) || 0))),
    volume: Math.max(0, Math.min(150, Math.floor(Number(payload.volume) || 0))),
    muted: Boolean(payload.muted),
    layout: payload.layout === 'simple' ? 'Einfach' : 'Erweitert',
    schema: Math.max(0, Math.floor(Number(payload.schema) || 0)),
    quarantined: Math.max(0, Math.floor(Number(payload.quarantined) || 0)),
    migration: cleanText(payload.migration || '', 40),
    problems: cleanDiagnosticProblems(payload.problems),
  };
});
ipcMain.handle('diagnostic-copy', async (event) =>
  mainWindow && event.sender === mainWindow.webContents ? diagnosticText() : ''
);

function cleanUrl(value, pattern = /^https?:\/\//i) {
  const url = String(value || '');
  return pattern.test(url) ? url : '';
}

function cleanItems(items, maxItems = 50) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && item.id != null)
    .slice(0, Math.max(0, Math.min(2000, Number(maxItems) || 50)))
    .map((item) => ({
      id: cleanText(item.id, 200),
      title: cleanText(item.title || 'Unbekannt'),
      artist: cleanText(item.artist || item.channel || ''),
      duration: Number(item.duration) || 0,
      artwork: cleanUrl(item.artwork, /^https:\/\//i),
      link: cleanUrl(item.link),
      aiHint: Boolean(item.aiHint),
      license: item.license === 'cc-by' ? 'cc-by' : '',
    }));
}

const pluginStreamHeaders = new Map();
let pluginStreamHeaderHook = false;

function streamHeaders(input) {
  const source = input && typeof input === 'object' ? input : {};
  const headers = {};
  Object.keys(source).forEach((name) => {
    if (!/^[a-z0-9-]{1,40}$/i.test(name)) return;
    const value = source[name];
    if (typeof value !== 'string' || !value.trim()) return;
    headers[name] = value.replace(/[\r\n]+/g, ' ').slice(0, 600);
  });
  return headers;
}

function rememberStreamHeaders(urls, headers, expires) {
  if (!headers || !Object.keys(headers).length) return;
  const until = Number(expires) || Date.now() + 6 * 60 * 60 * 1000;
  (Array.isArray(urls) ? urls : [urls]).forEach((url) => {
    const clean = cleanUrl(url);
    if (!clean) return;
    pluginStreamHeaders.set(clean, { headers, until });
  });
  if (pluginStreamHeaders.size > 300) {
    const now = Date.now();
    for (const [url, entry] of pluginStreamHeaders) {
      if (entry.until < now) pluginStreamHeaders.delete(url);
    }
    while (pluginStreamHeaders.size > 220) {
      pluginStreamHeaders.delete(pluginStreamHeaders.keys().next().value);
    }
  }
}

// Source plugins may return request headers (e.g. a Referer/User-Agent for a
// signed media URL). <audio> cannot set headers itself, so add them here for
// exactly the URLs the plugin resolved – nothing else is touched.
function installPluginStreamHeaders() {
  if (pluginStreamHeaderHook) return;
  pluginStreamHeaderHook = true;
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['<all_urls>'] },
    (details, callback) => {
      const entry = pluginStreamHeaders.get(details.url);
      if (entry) {
        if (entry.until < Date.now()) {
          pluginStreamHeaders.delete(details.url);
        } else {
          Object.keys(entry.headers).forEach((name) => {
            const lower = name.toLowerCase();
            Object.keys(details.requestHeaders).forEach((known) => {
              if (known.toLowerCase() === lower) delete details.requestHeaders[known];
            });
            details.requestHeaders[name] = entry.headers[name];
          });
        }
      }
      callback({ requestHeaders: details.requestHeaders });
    }
  );
}

function cleanStream(stream) {
  const url = cleanUrl(stream && stream.url);
  if (!url) throw new Error('Plugin hat keine abspielbare URL geliefert');
  const headers = streamHeaders(stream && stream.headers);
  const alternates = (Array.isArray(stream && stream.alternates) ? stream.alternates : [])
    .map((item) => cleanUrl(typeof item === 'string' ? item : item && item.url))
    .filter((item) => item && item !== url)
    .slice(0, 3);
  const expires = Number(stream && stream.expires) || 0;
  rememberStreamHeaders([url, ...alternates], headers, expires);
  return {
    refId: cleanText(stream.refId || stream.id || '', 200),
    url,
    duration: Number(stream.duration) || 0,
    title: cleanText(stream.title || ''),
    artist: cleanText(stream.artist || ''),
    artwork: cleanUrl(stream.artwork, /^https:\/\//i),
    expires,
    format: cleanText(stream.format || '', 120),
    headers: Object.keys(headers).length ? headers : undefined,
    alternates: alternates.length ? alternates : undefined,
  };
}

async function pluginInfo(plugin, enabled, refresh) {
  const mod = plugin.module;
  let status = null;
  if (mod) await refreshDynamicOptions(plugin);
  const manifest = plugin.manifest || null;

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
    name: cleanText((mod && mod.name) || (manifest && manifest.name) || `${plugin.id}.js`, 80),
    version: cleanText((mod && mod.version) || (manifest && manifest.version) || '', 30),
    description: cleanText((mod && mod.description) || (manifest && manifest.description) || '', 600),
    api: manifest ? 3 : mod && mod.apiVersion === 1 ? 1 : 2,
    permissions: manifest ? pluginManifest.describe(manifest.permissions) : null,
    manifestError: plugin.manifestError || null,
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
          fields: pluginSettingFields(mod, plugin).map((field) => ({ ...field, default: undefined })),
          values: pluginSettingValues(plugin.id),
        }
      : { fields: [], values: {} },
    panels: (plugin.panels || []).map((panel) => ({
      slot: PANEL_SLOTS.includes(panel.slot) ? panel.slot : 'settings',
      title: cleanText(panel.title, 80),
      html: String(panel.html || '').slice(0, 20000),
    })),
    chartsLabel: cleanText((mod && mod.chartsLabel) || '', 40),
    capabilities: {
      charts: Boolean(mod && typeof mod.charts === 'function'),
      playlist: Boolean(mod && typeof mod.playlist === 'function'),
      lookup: Boolean(mod && typeof mod.lookup === 'function'),
      download: Boolean(mod && typeof mod.download === 'function'),
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

ipcMain.handle('plugin-search', async (_event, id, query, options) => {
  const plugin = readyPlugin(id, 'search');
  if (!plugin) return { results: [], error: 'Plugin nicht aktiv' };
  if (typeof query !== 'string' || !query.trim()) return { results: [], error: null };
  const searchOptions = {
    creativeCommons: Boolean(options && options.creativeCommons),
    limit: Math.max(1, Math.min(30, Number(options && options.limit) || 15)),
  };

  try {
    return { results: cleanItems(await plugin.module.search(query.trim().slice(0, 120), searchOptions)), error: null };
  } catch (error) {
    return { results: [], error: cleanText(error.message || String(error)) };
  }
});

/* --- Song requests with a link (1.4.0) ------------------------------- *
 * Spotify (public embed page, like the playlist import), Deezer and Apple
 * (public APIs). YouTube links are handled by a source plugin (lookup).
 * Only these hosts are fetched; anything else is "unsupported-link". */

async function fetchSpotifyTrack(id) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await net.fetch(`https://open.spotify.com/embed/track/${encodeURIComponent(id)}`, {
      signal: controller.signal,
      headers: { accept: 'text/html' },
    });
    if (!response.ok) throw new Error(`Spotify antwortet mit HTTP ${response.status}.`);
    if (response.url && new URL(response.url).origin !== 'https://open.spotify.com') throw new Error(SPOTIFY_FORMAT_ERROR);
    const html = await readResponseTextLimited(response, 5 * 1024 * 1024);
    const match = html.match(/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i);
    if (!match) throw new Error(SPOTIFY_FORMAT_ERROR);
    const data = JSON.parse(match[1]);
    const entity = data && data.props && data.props.pageProps && data.props.pageProps.state && data.props.pageProps.state.data && data.props.pageProps.state.data.entity;
    const title = cleanText(entity && (entity.title || entity.name), 300);
    if (!title) throw new Error(SPOTIFY_FORMAT_ERROR);
    const artists = Array.isArray(entity.artists) ? entity.artists.map((artist) => artist && artist.name).filter(Boolean).join(', ') : entity.subtitle;
    return { title, artist: cleanText(artists || '', 300), durationMs: Number(entity.duration) || 0, isrc: '' };
  } finally {
    clearTimeout(timer);
  }
}

async function resolveRequestLink(input) {
  const value = String(input || '').trim().slice(0, 500);
  const uri = value.match(/^spotify:track:([A-Za-z0-9]{6,64})$/i);
  let url = null;
  if (!uri) {
    try {
      url = new URL(value);
    } catch {
      return { reason: 'unsupported-link' };
    }
    if (url.protocol !== 'https:' || url.username || url.password) return { reason: 'unsupported-link' };
  }
  const host = url ? url.hostname.toLowerCase() : 'open.spotify.com';

  if (uri || host === 'open.spotify.com') {
    const id = uri ? uri[1] : (url.pathname.match(/^(?:\/intl-[a-z]{2}(?:-[a-z]{2,4})?)?\/track\/([A-Za-z0-9]{6,64})\/?$/i) || [])[1];
    if (!id) return { reason: 'unsupported-link' };
    const track = await fetchSpotifyTrack(id);
    const [hit] = (await matchSpotifyTracks([track])).tracks;
    return hit ? { track: hit } : { reason: 'not-found' };
  }

  if (host === 'link.deezer.com' || host === 'deezer.page.link') {
    // Short link: follow it, but only to deezer.com.
    const response = await net.fetch(url.toString(), { headers: { accept: 'text/html' } });
    const final = new URL(response.url || url.toString());
    try {
      await response.body?.cancel();
    } catch {
      /* body not needed */
    }
    if (final.protocol !== 'https:' || !/(^|\.)deezer\.com$/i.test(final.hostname)) return { reason: 'unsupported-link' };
    url = final;
  }

  if (/(^|\.)deezer\.com$/i.test(url.hostname)) {
    const id = (url.pathname.match(/\/track\/(\d{1,20})(?:\/|$)/) || [])[1];
    if (!id) return { reason: 'unsupported-link' };
    const json = await fetchJson(`https://api.deezer.com/track/${id}`, 15000);
    const [hit] = normalizeDeezer({ data: json && json.id ? [json] : [] });
    return hit ? { track: hit } : { reason: 'not-found' };
  }

  if (host === 'music.apple.com' || host === 'itunes.apple.com') {
    const id =
      url.searchParams.get('i') ||
      (url.pathname.match(/\/song\/(?:[^/]+\/)?(\d{1,20})\/?$/) || [])[1] ||
      '';
    if (!/^\d{1,20}$/.test(id)) return { reason: 'unsupported-link' };
    const json = await fetchJson(`https://itunes.apple.com/lookup?id=${id}&entity=song&country=DE`, 15000);
    const [hit] = normalizeItunes(json);
    return hit ? { track: hit } : { reason: 'not-found' };
  }

  return { reason: 'unsupported-link' };
}

ipcMain.handle('request-link', async (_event, url) => {
  try {
    return await resolveRequestLink(url);
  } catch {
    return { reason: 'not-found' };
  }
});

// Cutter mode: a source plugin may download ONLY titles whose Creative Commons
// licence it verified for this very video (plugin "download"). The file must
// land in the Cutting folder; a credit .txt is written next to it.
ipcMain.handle('plugin-download', async (_event, id, input) => {
  const plugin = readyPlugin(id, 'download');
  if (!plugin) return { error: 'Das Quellen-Plugin kann nicht herunterladen.' };
  const item = input && typeof input === 'object' ? input : {};
  const folder = path.join(downloadBase(item.folder), 'YouTube (Creative Commons)');
  let timeout;
  try {
    fs.mkdirSync(folder, { recursive: true });
    const result = await Promise.race([
      plugin.module.download(cleanText(item.refId, 64), { dir: folder }),
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Zeitüberschreitung')), 330000);
      }),
    ]);
    const file = path.resolve(String((result && result.file) || ''));
    const inside = file.toLowerCase().startsWith((path.resolve(folder) + path.sep).toLowerCase());
    if (!inside || !fs.existsSync(file) || !/\.m4a$/i.test(file)) {
      throw new Error('Das Plugin hat keine Audiodatei im Cutting-Ordner geliefert.');
    }
    const license = cleanText(result.license, 120);
    if (!/creative commons/i.test(license)) {
      fs.rmSync(file, { force: true });
      throw new Error('Keine Creative-Commons-Lizenz bestätigt – Datei verworfen.');
    }
    const title = cleanText(result.title || item.title, 200);
    const artist = cleanText(result.artist || item.artist, 200);
    const link = cleanUrl(result.link || item.link);
    const credit = [
      `Titel: ${title}`,
      artist ? `Von: ${artist}` : '',
      `Lizenz: CC BY (laut YouTube: ${license})`,
      link ? `Quelle: ${link}` : '',
      '',
      'Credit für deine Videobeschreibung:',
      `"${title}" von ${artist || 'YouTube'} – ${link} – lizenziert unter CC BY (https://creativecommons.org/licenses/by/3.0/)`,
      '',
      'Hinweis: Die Lizenzangabe stammt vom Uploader. Content-ID-Ansprüche sind trotzdem möglich.',
      `Heruntergeladen mit CleanMusic am ${new Date().toLocaleDateString('de-DE')}.`,
    ]
      .filter((line, index, lines) => line !== '' || (lines[index - 1] && lines[index - 1] !== ''))
      .join('\r\n');
    fs.writeFileSync(file.replace(/\.[^.]+$/, '') + '.txt', credit + '\r\n', 'utf8');
    downloadedFiles.add(file);
    return { ok: true, path: file, name: path.basename(file), folder, existed: false, size: fs.statSync(file).size };
  } catch (error) {
    return { error: cleanText(error.message || String(error), 240) };
  } finally {
    clearTimeout(timeout);
  }
});

ipcMain.handle('plugin-lookup', async (_event, id, url) => {
  const plugin = readyPlugin(id, 'lookup');
  if (!plugin) return { item: null, error: 'Plugin nicht aktiv' };
  let timeout;
  try {
    const item = await Promise.race([
      plugin.module.lookup(String(url || '').trim().slice(0, 500)),
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Zeitüberschreitung')), 90000);
      }),
    ]);
    return { item: cleanItems([item], 1)[0] || null, error: null };
  } catch (error) {
    return { item: null, error: cleanText(error.message || String(error)) };
  } finally {
    clearTimeout(timeout);
  }
});

/* --- Lyrics (1.5): LRCLIB, a free community lyrics database ---------- *
 * Only title, artist, album and length are sent; results are cached for
 * the session. Synced lyrics come as LRC ("[mm:ss.xx] line"). */

const lyricsCache = new Map();

function parseLrc(text) {
  const lines = [];
  String(text || '')
    .split(/\r?\n/)
    .forEach((row) => {
      const stamps = Array.from(row.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g));
      if (!stamps.length) return;
      const raw = row.replace(/\[[^\]]*\]/g, '').trim();
      // Enhanced LRC (LRCLIB "syncedLyrics") may carry per-word marks <mm:ss.xx>.
      const marks = Array.from(raw.matchAll(/<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>/g));
      const words = marks
        .map((mark, i) => {
          const start = mark.index + mark[0].length;
          const end = i + 1 < marks.length ? marks[i + 1].index : raw.length;
          const text = cleanText(raw.slice(start, end).trim(), 60);
          if (!text) return null;
          const fraction = mark[3] ? Number(`0.${mark[3]}`) : 0;
          return { time: Number(mark[1]) * 60 + Number(mark[2]) + fraction, text };
        })
        .filter(Boolean);
      const lineText = cleanText(marks.length ? raw.replace(/<[^>]*>/g, '').trim() : raw, 300);
      stamps.forEach((stamp) => {
        const fraction = stamp[3] ? Number(`0.${stamp[3]}`) : 0;
        const line = { time: Number(stamp[1]) * 60 + Number(stamp[2]) + fraction, text: lineText };
        if (words.length) line.words = words;
        lines.push(line);
      });
    });
  return lines.sort((a, b) => a.time - b.time).slice(0, 1500);
}

async function lrclibJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await net.fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': `CleanMusic/${app.getVersion()} (https://github.com/BellocccYT/cleanmusic)` },
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

ipcMain.handle('lyrics-get', async (_event, query) => {
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
      ? { lines: parseLrc(entry.syncedLyrics), plain: cleanText(entry.plainLyrics || '', 20000), instrumental: Boolean(entry.instrumental) }
      : null;
  let result = null;
  try {
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (input.album) params.set('album_name', cleanText(input.album, 200));
    if (duration) params.set('duration', String(duration));
    result = pick(await lrclibJson(`https://lrclib.net/api/get?${params}`));
    if (!result || (!result.lines.length && !result.plain)) {
      const list = await lrclibJson(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: title, artist_name: artist })}`);
      const entries = Array.isArray(list) ? list : [];
      const best = entries.find((entry) => entry && entry.syncedLyrics) || entries.find((entry) => entry && entry.plainLyrics);
      if (best) result = pick(best);
    }
  } catch {
    return { lines: [], plain: '', error: 'Die Songtext-Suche ist gerade nicht erreichbar.' };
  }
  const out =
    result && (result.lines.length || result.plain)
      ? { lines: result.lines, plain: result.plain, error: null }
      : { lines: [], plain: '', error: result && result.instrumental ? 'Instrumental – kein Songtext.' : 'Kein Songtext gefunden.' };
  lyricsCache.set(key, out);
  if (lyricsCache.size > 200) lyricsCache.delete(lyricsCache.keys().next().value);
  return out;
});

/* --- Artist pages (1.6): Deezer's public API ------------------------ */

function deezerArtistCard(artist) {
  if (!artist || !artist.id) return null;
  return {
    id: Number(artist.id),
    name: cleanText(artist.name, 200),
    picture: cleanUrl(artist.picture_xl || artist.picture_big || artist.picture_medium || '', /^https:\/\//i),
    fans: Number(artist.nb_fan) || 0,
  };
}

ipcMain.handle('artist-page', async (_event, input) => {
  const query = input && typeof input === 'object' ? input : {};
  try {
    let id = Number(query.deezerId) || 0;
    const name = cleanText(query.name, 120).trim();
    if (!id) {
      if (!name) return { error: 'Kein Künstler angegeben.' };
      const found = await fetchJson(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`);
      id = found && Array.isArray(found.data) && found.data[0] ? Number(found.data[0].id) : 0;
      if (!id) return { error: `„${name}“ wurde bei Deezer nicht gefunden.` };
    }
    const [artist, top, albums, related] = await Promise.all([
      fetchJson(`https://api.deezer.com/artist/${id}`),
      fetchJson(`https://api.deezer.com/artist/${id}/top?limit=20`).catch(() => null),
      fetchJson(`https://api.deezer.com/artist/${id}/albums?limit=40`).catch(() => null),
      fetchJson(`https://api.deezer.com/artist/${id}/related?limit=12`).catch(() => null),
    ]);
    const card = deezerArtistCard(artist);
    if (!card) return { error: 'Künstler nicht gefunden.' };
    return {
      artist: Object.assign(card, { albums: Number(artist.nb_album) || 0, link: cleanUrl(artist.link) }),
      top: normalizeDeezer(top || {}),
      albums: (albums && Array.isArray(albums.data) ? albums.data : [])
        .map((album) => ({
          id: Number(album.id) || 0,
          title: cleanText(album.title, 200),
          cover: cleanUrl(album.cover_xl || album.cover_big || album.cover_medium || album.cover || '', /^https:\/\//i),
          year: cleanText(album.release_date, 10).slice(0, 4),
          type: cleanText(album.record_type, 20),
        }))
        .filter((album) => album.id),
      related: (related && Array.isArray(related.data) ? related.data : []).map(deezerArtistCard).filter(Boolean),
      error: null,
    };
  } catch (error) {
    return { error: friendlyNetError(error).message || error.message };
  }
});

ipcMain.handle('album-tracks', async (_event, albumId) => {
  const id = Number(albumId) || 0;
  if (!id) return { title: '', tracks: [], error: 'Kein Album.' };
  try {
    const album = await fetchJson(`https://api.deezer.com/album/${id}`);
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
    const tracks = (album && album.tracks && Array.isArray(album.tracks.data) ? album.tracks.data : []).map((track) =>
      Object.assign({}, track, { album: cover })
    );
    return { title: cleanText(album && album.title, 200), tracks: normalizeDeezer({ data: tracks }), error: null };
  } catch (error) {
    return { title: '', tracks: [], error: friendlyNetError(error).message || error.message };
  }
});

/* --- Social (Weg B, docs/PLAN-SOCIAL.md) ------------------------------- *
 * Key, signing and the one allowed host live in social-main.js; the renderer
 * only gets account id/tag and the server's JSON answers. */
const social = createSocial({
  app,
  ipcMain,
  net,
  safeStorage,
  dialog,
  readConfig,
  writeConfig,
  isSmoke,
  getWindow: () => mainWindow,
  QRCode,
});
social.register();

/* --- Share links (1.6) ------------------------------------------------ *
 * https://bellocccyt.github.io/cleanmusic/s/?src=…&id=…&t=…&a=… opens
 * cleanmusic://play?… – CleanMusic is registered for that scheme (installer:
 * electron-builder "protocols", portable: the outer EXE at runtime). A link
 * only says which song to look up; it never opens files or other pages. */

let pendingDeepLink = null;
let rendererReady = false;

function parseDeepLink(raw) {
  try {
    const url = new URL(String(raw || ''));
    if (url.protocol !== 'cleanmusic:') return null;
    const host = (url.hostname || url.pathname.replace(/^\/+/, '').split('/')[0] || '').toLowerCase();
    // 1.24: group week card (renderer/core/group.js) – only the code, checked again there.
    if (host === 'playlist') {
      const code = String(url.searchParams.get('d') || '');
      return /^P1\.[A-Za-z0-9_-]{8,12000}$/.test(code) ? { action: 'playlist', code } : null;
    }
    // Social friend (F1-…), group (G1-…) or room (R1-…, S3) code from site/f/: only the format, used after a question.
    if (host === 'friend') {
      const code = String(url.searchParams.get('c') || '');
      return /^[FGR]1-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(code) ? { action: 'friend', code } : null;
    }
    if (host === 'group') {
      const code = String(url.searchParams.get('c') || '');
      return /^CM1-[A-Za-z0-9_-]{8,1200}-[0-9a-z]{1,8}$/.test(code) ? { action: 'group', code } : null;
    }
    const action = host === 'add' ? 'add' : 'play';
    const src = String(url.searchParams.get('src') || '');
    if (!['deezer', 'apple', 'youtube', 'search'].includes(src)) return null;
    const id = String(url.searchParams.get('id') || '');
    if ((src === 'deezer' || src === 'apple') && !/^\d{1,20}$/.test(id)) return null;
    if (src === 'youtube' && !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    const title = cleanText(url.searchParams.get('t') || '', 200).replace(/[\u0000-\u001f]+/g, ' ');
    const artist = cleanText(url.searchParams.get('a') || '', 200).replace(/[\u0000-\u001f]+/g, ' ');
    if (src === 'search' && !title) return null;
    return { action, src, id: src === 'search' ? '' : id, title, artist };
  } catch {
    return null;
  }
}

function handleDeepLinkArgs(argv) {
  const raw = (Array.isArray(argv) ? argv : []).find((arg) => /^cleanmusic:\/\//i.test(String(arg)));
  const link = raw ? parseDeepLink(raw) : null;
  if (!link) return false;
  if (rendererReady && mainWindow && !mainWindow.isDestroyed()) sendToRenderer('deep-link', link);
  else pendingDeepLink = link;
  return true;
}

function registerProtocol() {
  if (isSmoke || !app.isPackaged) return;
  try {
    if (process.env.PORTABLE_EXECUTABLE_FILE) app.setAsDefaultProtocolClient('cleanmusic', process.env.PORTABLE_EXECUTABLE_FILE, []);
    else app.setAsDefaultProtocolClient('cleanmusic');
  } catch (error) {
    console.error('Protokoll cleanmusic:// nicht registriert:', error.message);
  }
}

/* --- Cutter analysis (1.7): audio bytes for BPM / waveform, cut export -- *
 * Only free-licence hosts (the "Nur Cutting" allowlist) plus the preview CDNs
 * of Deezer and Apple. The renderer decodes and measures; nothing is played
 * from here. Cut export: only CC0 / CC BY / Public Domain, as WAV + credit. */

const ANALYSIS_HOSTS = ['dzcdn.net', 'itunes.apple.com', 'mzstatic.com'];

function analysisHostAllowed(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return allowedDownloadHost(url) || ANALYSIS_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
  } catch {
    return false;
  }
}

ipcMain.handle('audio-bytes', async (_event, url, options) => {
  const target = cleanUrl(url);
  if (!target || !analysisHostAllowed(target)) return { error: 'Diese Quelle kann nicht analysiert werden.' };
  const full = Boolean(options && options.full);
  const limit = full ? 30 * 1024 * 1024 : 3 * 1024 * 1024;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await net.fetch(target, {
      signal: controller.signal,
      headers: full ? {} : { Range: `bytes=0-${limit - 1}` },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.url && !analysisHostAllowed(response.url)) throw new Error('Weiterleitung nicht erlaubt');
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      total += value.byteLength;
      if (total >= limit) {
        if (full) throw new Error('Datei zu groß für die Wellenform');
        try {
          await reader.cancel();
        } catch {
          /* enough */
        }
        break;
      }
    }
    return { bytes: Buffer.concat(chunks) };
  } catch (error) {
    return { error: error.name === 'AbortError' ? 'Zeitüberschreitung' : cleanText(error.message, 200) };
  } finally {
    clearTimeout(timer);
  }
});

ipcMain.handle('cut-save', async (_event, input) => {
  const item = input && typeof input === 'object' ? input : {};
  const license = cleanText(item.license, 40);
  if (!DOWNLOAD_LICENSE.test(license)) return { error: 'Nur CC0, CC BY und Public Domain können als Ausschnitt gespeichert werden.' };
  const raw = item.bytes;
  const bytes = raw instanceof Uint8Array ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength) : null;
  if (!bytes || bytes.length < 44 || bytes.length > 300 * 1024 * 1024) return { error: 'Ungültige Audiodaten.' };
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') return { error: 'Ungültige Audiodaten.' };
  const from = Math.max(0, Number(item.from) || 0);
  const to = Math.max(from, Number(item.to) || 0);
  const stamp = (secs) => `${Math.floor(secs / 60)}-${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  const title = cleanText(item.title, 200);
  const artist = cleanText(item.artist, 200);
  const folder = path.join(downloadBase(item.folder), 'Schnitte');
  const stem = safeName(`${artist ? `${artist} - ` : ''}${title} (${stamp(from)} bis ${stamp(to)})`, 'Ausschnitt');
  try {
    fs.mkdirSync(folder, { recursive: true });
    let file = path.join(folder, `${stem}.wav`);
    let n = 2;
    while (fs.existsSync(file)) {
      file = path.join(folder, `${stem} (${n}).wav`);
      n += 1;
    }
    fs.writeFileSync(file, bytes);
    const credit = [
      `Titel: ${title}`,
      artist ? `Von: ${artist}` : '',
      `Lizenz: ${license}${item.licenseUrl ? ` (${cleanUrl(item.licenseUrl)})` : ''}`,
      item.link ? `Quelle: ${cleanUrl(item.link)}` : '',
      `Ausschnitt: ${stamp(from).replace('-', ':')} bis ${stamp(to).replace('-', ':')} (gekürzt)`,
      item.changes ? `Änderungen: ${cleanText(item.changes, 240)}` : '',
      '',
      'Credit für deine Videobeschreibung:',
      cleanText(item.credit || '', 800) || `"${title}" – ${artist} (${license})`,
      '',
      'Bei CC BY: Gib an, dass du den Titel gekürzt hast (z. B. „gekürzt“ hinter den Credit).',
      `Gespeichert mit CleanMusic am ${new Date().toLocaleDateString('de-DE')}.`,
    ]
      .filter((line, index, lines) => line !== '' || (lines[index - 1] && lines[index - 1] !== ''))
      .join('\r\n');
    fs.writeFileSync(file.replace(/\.wav$/i, '') + '.txt', credit + '\r\n', 'utf8');
    downloadedFiles.add(file);
    return { ok: true, path: file, name: path.basename(file) };
  } catch (error) {
    return { error: cleanText(error.message, 200) };
  }
});

// Studio (2.0): export a whole project timeline (all clips in order) as one
// WAV plus one credit .txt. Same licence + host rules as the single-clip cut.
ipcMain.handle('studio-export', async (_event, input) => {
  const item = input && typeof input === 'object' ? input : {};
  const clips = (Array.isArray(item.clips) ? item.clips : []).slice(0, 200);
  if (!clips.length) return { error: 'Keine Clips zum Exportieren.' };
  const licenses = clips.map((clip) => cleanText(clip && clip.license, 40));
  if (licenses.some((license) => !DOWNLOAD_LICENSE.test(license))) {
    return { error: 'Nur CC0, CC BY und Public Domain können exportiert werden.' };
  }
  const raw = item.bytes;
  const bytes = raw instanceof Uint8Array ? Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength) : null;
  if (!bytes || bytes.length < 44 || bytes.length > 600 * 1024 * 1024) return { error: 'Ungültige Audiodaten.' };
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') return { error: 'Ungültige Audiodaten.' };
  const name = cleanText(item.name, 80) || 'Projekt';
  const text = typeof item.text === 'string' ? item.text.slice(0, 1024 * 1024) : '';
  const folder = path.join(downloadBase(item.folder), '_Studio');
  const stem = safeName(name, 'Projekt');
  try {
    fs.mkdirSync(folder, { recursive: true });
    let file = path.join(folder, `${stem}.wav`);
    let n = 2;
    while (fs.existsSync(file)) {
      file = path.join(folder, `${stem} (${n}).wav`);
      n += 1;
    }
    fs.writeFileSync(file, bytes);
    fs.writeFileSync(file.replace(/\.wav$/i, '') + '.txt', (text || '').replace(/\r?\n/g, '\r\n') + '\r\n', 'utf8');
    downloadedFiles.add(file);
    return { ok: true, path: file, name: path.basename(file) };
  } catch (error) {
    return { error: cleanText(error.message, 200) };
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

ipcMain.handle('plugin-playlist', async (_event, id, url) => {
  const plugin = readyPlugin(id, 'playlist');
  if (!plugin) return { name: '', items: [], error: 'Plugin nicht aktiv' };
  const input = typeof url === 'string' ? url.trim().slice(0, 2048) : '';
  if (!input) return { name: '', items: [], error: 'Bitte einen Playlist-Link eingeben.' };

  let timeout;
  try {
    const result = await Promise.race([
      plugin.module.playlist(input),
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Zeitüberschreitung beim Lesen der Playlist')), 180000);
      }),
    ]);
    return {
      name: cleanText(result && result.name, 100),
      items: cleanItems(result && result.items, 2000),
      error: null,
    };
  } catch (error) {
    return { name: '', items: [], error: cleanText(error && error.message || String(error)) };
  } finally {
    clearTimeout(timeout);
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
          // Ids the app found unusable (e.g. a muted upload) – skip them.
          exclude: (Array.isArray(input.exclude) ? input.exclude : [])
            .map((ref) => cleanText(ref, 200))
            .filter(Boolean)
            .slice(0, 100),
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
 * releases of this project for the latest version. Every download is
 * checked against size and the SHA-256 digest GitHub publishes.
 *  - portable EXE / AppImage: the new file lands next to the current one
 *    and is started after CleanMusic closed.
 *  - installed (NSIS setup): the new setup EXE lands in the temp folder
 *    and runs silently (--updated /S --force-run): it closes CleanMusic,
 *    installs over it and starts the new version. Data stays in the profile.
 * Other copies (e.g. started from the source) only get a link.
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
let announcedUpdateVersion = null;
const activeUpdateNotifications = new Set();

function notifyWindowsUpdate(latest) {
  if (process.platform !== 'win32' || isSmoke || !latest || announcedUpdateVersion === latest) return false;
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized() && mainWindow.isFocused()) return false;
  try {
    const { Notification } = require('electron');
    if (!Notification.isSupported()) return false;
    const notification = new Notification({
      title: `CleanMusic ${latest} ist da`,
      body: 'Klicke hier, um CleanMusic zu öffnen und das Update anzusehen.',
      icon: path.join(ROOT, 'renderer', 'assets', 'icon.png'),
      urgency: 'normal',
    });
    activeUpdateNotifications.add(notification);
    notification.on('click', () => showMainWindow());
    notification.on('close', () => activeUpdateNotifications.delete(notification));
    notification.show();
    announcedUpdateVersion = latest;
    return true;
  } catch {
    return false;
  }
}

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

// Installed with the setup EXE: the NSIS uninstaller sits next to CleanMusic.exe.
let installedCache = null;
function isInstalledCopy() {
  if (installedCache !== null) return installedCache;
  installedCache = false;
  if (process.platform === 'win32' && app.isPackaged && !process.env.PORTABLE_EXECUTABLE_FILE) {
    try {
      installedCache = fs.readdirSync(path.dirname(process.execPath)).some((name) => /^Uninstall .+\.exe$/i.test(name));
    } catch {
      installedCache = false;
    }
  }
  return installedCache;
}

const SETUP_UPDATE_DIR = path.join(app.getPath('temp'), 'cleanmusic-update');

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
  if (UPDATE_TEST_SETUP || isInstalledCopy()) {
    return {
      kind: 'setup',
      file: process.execPath,
      dir: UPDATE_TEST_SETUP ? UPDATE_TEST_DIR : SETUP_UPDATE_DIR,
      pattern: /^CleanMusic-[0-9.]+-setup\.exe$/i,
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
  const target = updateTarget();
  return Object.assign({}, updateState, {
    installable: Boolean(target),
    kind: target ? target.kind : null,
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
        signal: controller.signal,
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': `CleanMusic/${app.getVersion()} (update check)`,
        },
      });
      if (response.status === 404) {
        setUpdate({ status: 'current', latest: null, checkedAt: Date.now() });
        return publicUpdate();
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // The timeout stays armed while the body is read: a stalled body would
      // otherwise leave `updateTask` pending forever.
      const release = await response.json();
      const latest = String(release.tag_name || '').replace(/^v/i, '');
      const current = UPDATE_TEST ? '0.0.1' : app.getVersion();
      const newer = !release.draft && !release.prerelease && isNewerVersion(latest, current);
      if (newer) notifyWindowsUpdate(latest);
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
    } finally {
      clearTimeout(timer);
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
  if (!target || !asset || (updateState.status !== 'available' && updateState.status !== 'error')) return publicUpdate();

  const dest = path.join(target.dir, asset.name);
  if (path.resolve(dest).toLowerCase() === path.resolve(target.file).toLowerCase()) {
    setUpdate({ status: 'error', error: 'Diese Version läuft bereits.' });
    return publicUpdate();
  }

  setUpdate({ status: 'downloading', progress: 0, error: null });
  const partial = `${dest}.download`;
  // A dead connection must not leave the app in "downloading" forever (that
  // blocks every later update check): abort after 10 minutes without progress.
  const controller = new AbortController();
  let idleTimer = null;
  let reader = null;
  let out = null;
  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
  };
  try {
    fs.mkdirSync(target.dir, { recursive: true });
    touch();
    const response = await net.fetch(asset.url, {
      headers: { 'user-agent': `CleanMusic/${app.getVersion()}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (response.url && !updateHostAllowed(response.url)) throw new Error('Unerwartete Download-Adresse');

    const hash = crypto.createHash('sha256');
    out = fs.createWriteStream(partial);
    // A write error (disk full, permissions) arrives as an event, not as a
    // rejected promise – without this the whole app would crash.
    let streamError = null;
    out.on('error', (error) => {
      streamError = streamError || error;
    });
    reader = response.body.getReader();
    let received = 0;
    let lastSent = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (streamError) throw streamError;
      if (done) break;
      const chunk = Buffer.from(value);
      received += chunk.length;
      touch();
      if (received > 600 * 1024 * 1024) throw new Error('Datei zu groß');
      hash.update(chunk);
      if (!out.write(chunk)) {
        await new Promise((resolve, reject) => {
          const drain = () => {
            out.off('error', fail);
            resolve();
          };
          const fail = (error) => {
            out.off('drain', drain);
            reject(error);
          };
          out.once('drain', drain);
          out.once('error', fail);
        });
      }
      if (Date.now() - lastSent > 250) {
        lastSent = Date.now();
        setUpdate({ progress: asset.size ? Math.min(0.99, received / asset.size) : 0 });
      }
    }
    if (streamError) throw streamError;
    await new Promise((resolve, reject) => {
      out.once('error', reject);
      out.end(resolve);
    });

    if (asset.size && received !== asset.size) throw new Error('Download unvollständig');
    const digest = hash.digest('hex');
    if (asset.sha256 && digest !== asset.sha256) throw new Error('Prüfsumme stimmt nicht – Datei verworfen');

    fs.rmSync(dest, { force: true });
    fs.renameSync(partial, dest);
    if (target.kind === 'appimage') fs.chmodSync(dest, 0o755);
    setUpdate({ status: 'ready', progress: 1, file: dest });
  } catch (error) {
    if (reader) {
      try {
        await reader.cancel();
      } catch {
        /* already closed */
      }
    }
    if (out) out.destroy();
    fs.rmSync(partial, { force: true });
    const reason = error && error.name === 'AbortError' ? 'Zeitüberschreitung – Verbindung hängt' : error.message;
    setUpdate({ status: 'error', error: `Download fehlgeschlagen: ${reason}` });
  } finally {
    clearTimeout(idleTimer);
  }
  return publicUpdate();
}

function installUpdate() {
  const file = updateState.file;
  if (updateState.status !== 'ready' || !file || !fs.existsSync(file)) return false;
  const target = updateTarget();
  if (target && target.kind === 'setup') {
    // Silent NSIS update: waits for CleanMusic to close, installs over it,
    // keeps the profile (--updated) and starts the new version (--force-run).
    try {
      spawn(file, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    } catch (error) {
      setUpdate({ status: 'error', error: `Installer startet nicht: ${error.message}` });
      return false;
    }
    quitting = true;
    app.quit();
    return true;
  }
  // The new version starts once this one has fully closed (single-instance lock).
  quitting = true;
  app.relaunch({ execPath: file, args: [] });
  app.quit();
  return true;
}

// Leftover setup EXE from the last update (it ran from the temp folder).
// Never while an update is being downloaded or waits to be installed:
// 1.0.0/1.0.1 deleted the folder under a running download (ENOENT on rename).
function cleanupSetupDir(folder = SETUP_UPDATE_DIR) {
  if (updateState.status === 'downloading' || updateState.status === 'ready') return false;
  try {
    fs.rmSync(folder, { recursive: true, force: true });
  } catch {
    // still in use – next start
  }
  return true;
}

function cleanupSetupUpdate() {
  if (!isInstalledCopy()) return;
  setTimeout(() => cleanupSetupDir(), 15000);
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
      { label: 'Mini-Player öffnen', click: () => openMiniWindow() },
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

ipcMain.handle('mini-open', (event) => {
  if (event.sender !== (mainWindow && mainWindow.webContents)) return false;
  return openMiniWindow();
});
ipcMain.handle('taskbar-get', () => ({ progress: readConfig().taskbarProgress !== false }));
ipcMain.handle('taskbar-set', (event, patch) => {
  if (event.sender !== (mainWindow && mainWindow.webContents)) return null;
  const progress = Boolean(patch && patch.progress);
  writeConfig({ taskbarProgress: progress });
  updateTaskbar(true);
  return { progress };
});
ipcMain.handle('shortcuts-get', () => ({ enabled: Boolean(readConfig().globalShortcuts), registered: registeredShortcuts.slice() }));
ipcMain.handle('shortcuts-set', (event, patch) => {
  if (event.sender !== (mainWindow && mainWindow.webContents)) return null;
  return configureGlobalShortcuts(Boolean(patch && patch.enabled));
});
ipcMain.handle('login-get', () => ({ enabled: Boolean(readConfig().startOnLogin) }));
ipcMain.handle('login-set', (event, patch) => {
  if (event.sender !== (mainWindow && mainWindow.webContents)) return null;
  const enabled = Boolean(patch && patch.enabled);
  writeConfig({ startOnLogin: enabled });
  updateLoginItem();
  return { enabled, supported: app.isPackaged && process.platform === 'win32' };
});

app.whenReady().then(async () => {
  if (!hasInstanceLock) return;
  Menu.setApplicationMenu(null);
  installPluginStreamHeaders();
  // Diagnosis: failed media requests (streams, previews) – only host and
  // status/error, never the full URL, which may carry a token.
  const mediaFilter = { urls: ['<all_urls>'] };
  session.defaultSession.webRequest.onCompleted(mediaFilter, (details) => {
    if (!details || details.resourceType !== 'media') return;
    if (!(Number(details.statusCode) >= 400)) return;
    recordMediaRequestError(`HTTP ${details.statusCode}`, details.url);
  });
  session.defaultSession.webRequest.onErrorOccurred(mediaFilter, (details) => {
    if (!details || details.resourceType !== 'media') return;
    const error = String(details.error || '');
    if (!error || error === 'net::ERR_ABORTED') return;
    recordMediaRequestError(error, details.url);
  });
  pluginBoot = loadEnabledPlugins().catch((error) => console.error('Plugins:', error.message));
  updateLoginItem();
  if (readConfig().globalShortcuts) configureGlobalShortcuts(true);
  await registeredRemoteAutostart();
  createMainWindow();
  createTray();
  wireCreatorDownloads();
  // Shared links (cleanmusic://): handle one from the start command, register the scheme.
  mainWindow.webContents.on('did-finish-load', () => {
    rendererReady = true;
    if (visualizerWatchOn) sendToRenderer('visualizer-watch', true);
    if (pendingDeepLink) {
      const link = pendingDeepLink;
      pendingDeepLink = null;
      setTimeout(() => sendToRenderer('deep-link', link), 1500);
    }
  });
  handleDeepLinkArgs(process.argv);
  registerProtocol();
  // Update check on every start (setting "Beim Start nach Updates suchen").
  if (!isSmoke) cleanupSetupUpdate();
  if (!isSmoke && updateConfig().auto) {
    setTimeout(() => checkForUpdates().catch(() => {}), 4000);
    // While CleanMusic stays open (including minimized to tray), recheck every 2 hours.
    // checkForUpdates shows a Windows notification as soon as a new release is found.
    setInterval(() => {
      if (!updateConfig().auto || updateState.status === 'downloading' || updateState.status === 'ready') return;
      checkForUpdates().catch(() => {});
    }, 2 * 60 * 60 * 1000);
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
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.close();
});

app.on('will-quit', () => {
  disableGlobalShortcuts();
  stopRemoteServer();
});
