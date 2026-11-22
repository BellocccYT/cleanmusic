'use strict';

/**
 * Smoke-Attrappen für die native Seite. Nur für mobile/scripts/smoke.js.
 * Die echte App benutzt Capacitor-Plugins; hier werden Antworten
 * deterministisch nachgebaut, damit der Test ohne Netz und Emulator läuft.
 */

const { ipcRenderer } = require('electron');

const base = ipcRenderer.sendSync('smoke-base');
const isTv = new URLSearchParams(location.search).get('device') === 'tv';

const smoke = {
  background: { calls: [], last: null },
  music: [],
  updater: [],
  external: [],
  remote: { state: null },
};

window.__SMOKE = smoke;

function mediaPreview() {
  return `${base}/preview.wav`;
}

const httpMock = {
  async request({ url }) {
    const target = String(url);
    const parsed = new URL(target);
    const path = parsed.pathname + parsed.search;

    if (parsed.hostname === 'itunes.apple.com' && parsed.pathname === '/search') {
      const term = parsed.searchParams.get('term') || '';
      const remote = /remote/i.test(term);
      return {
        status: 200,
        data: {
          results: [
            {
              trackId: 101,
              kind: 'song',
              trackName: remote ? 'Smoke Remote' : 'Smoke Preview',
              artistName: 'CleanMusic',
              collectionName: 'Smoke',
              previewUrl: remote ? 'https://example.invalid/remote.wav' : mediaPreview(),
              artworkUrl100: '',
              trackTimeMillis: 30000,
              trackViewUrl: 'https://music.apple.com/',
              artistId: 55,
            },
          ],
        },
      };
    }

    if (parsed.hostname === 'api.deezer.com') {
      if (parsed.pathname === '/search') {
        const term = parsed.searchParams.get('q') || '';
        const remote = /remote/i.test(term);
        return {
          status: 200,
          data: {
            data: [
              {
                id: 202,
                title: remote ? 'Smoke Remote Deezer' : 'Smoke Deezer',
                preview: remote ? 'https://example.invalid/remote.wav' : mediaPreview(),
                artist: { id: 56, name: 'CleanMusic' },
                album: { title: 'Smoke', cover_medium: '' },
                duration: 30,
                link: 'https://www.deezer.com/',
              },
            ],
          },
        };
      }
      if (parsed.pathname === '/chart/0/tracks') {
        return {
          status: 200,
          data: {
            data: [
              {
                id: 303,
                title: 'Smoke Chart',
                preview: mediaPreview(),
                artist: { id: 57, name: 'CleanMusic' },
                album: { title: 'Smoke', cover_medium: '' },
                duration: 30,
                link: 'https://www.deezer.com/',
              },
            ],
          },
        };
      }
      if (/^\/editorial\/0\/(releases|selection)$/.test(parsed.pathname)) {
        return { status: 200, data: { data: [] } };
      }
      if (/^\/album\/\d+\/tracks$/.test(parsed.pathname)) {
        return { status: 200, data: { data: [] } };
      }
      if (/^\/artist\/\d+\/(top|albums|related)$/.test(parsed.pathname)) {
        return { status: 200, data: { data: [] } };
      }
    }

    if (parsed.hostname === 'de1.api.radio-browser.info') {
      return {
        status: 200,
        data: [
          {
            stationuuid: 'smoke-radio',
            name: 'Smoke Radio',
            url_resolved: `${base}/radio.wav`,
            favicon: '',
            tags: 'test',
            country: 'DE',
            codec: 'MP3',
            bitrate: 128,
            homepage: 'https://example.invalid/',
            hls: 0,
          },
        ],
      };
    }

    if (parsed.hostname === 'lrclib.net') {
      if (parsed.pathname === '/api/get') {
        return { status: 404, data: {} };
      }
      return {
        status: 200,
        data: [
          {
            id: 1,
            syncedLyrics: '[00:00.00]Smoke line one\n[00:04.00]Smoke line two',
            plainLyrics: 'Smoke line one\nSmoke line two',
            instrumental: false,
          },
        ],
      };
    }

    if (parsed.hostname === 'api.github.com' && /releases/.test(parsed.pathname)) {
      return {
        status: 200,
        data: [
          {
            tag_name: 'mobile-1.2.0',
            html_url: 'https://github.com/BellocccYT/cleanmusic/releases/tag/mobile-1.2.0',
            body: 'Smoke-Update',
            draft: false,
            prerelease: false,
            assets: [
              {
                name: 'CleanMusic-Android-1.2.0.apk',
                size: 1024,
                digest: `sha256:${'ab'.repeat(32)}`,
                browser_download_url: 'https://github.com/BellocccYT/cleanmusic/releases/download/mobile-1.2.0/CleanMusic-Android-1.2.0.apk',
              },
            ],
          },
        ],
      };
    }

    throw new Error(`Unerwartete Adresse im Smoke: ${target} (${path})`);
  },
};

const audioService = {
  async start(state) {
    smoke.background.calls.push({ method: 'start', ...state });
    smoke.background.last = state;
  },
  async update(state) {
    smoke.background.calls.push({ method: 'update', ...state });
    smoke.background.last = state;
  },
  async stop() {
    smoke.background.calls.push({ method: 'stop' });
  },
  async addListener() {
    return { remove() {} };
  },
};

const remoteListeners = [];
const remotePending = new Map();

const remoteMock = {
  async get() {
    return {
      enabled: true,
      port: 4788,
      requestedPort: 4788,
      ip: '127.0.0.1',
      url: 'http://127.0.0.1:4788/?k=smoke',
      qr: 'data:image/png;base64,iVBORw0KGgo=',
      error: null,
    };
  },
  async start() {
    return this.get();
  },
  async stop() {
    return { enabled: false };
  },
  async rotate() {
    return this.get();
  },
  updateState(state) {
    smoke.remote.state = state;
  },
  respond(payload) {
    const resolve = remotePending.get(payload.id);
    if (resolve) {
      remotePending.delete(payload.id);
      resolve(payload);
    }
  },
  addListener(name, listener) {
    if (name === 'request') remoteListeners.push(listener);
    return Promise.resolve({ remove() {} });
  },
};

window.Capacitor = {
  Plugins: {
    CapacitorHttp: httpMock,
    DeviceInfo: { get: async () => ({ tv: isTv, manufacturer: 'smoke', model: 'smoke', sdk: 34 }) },
    BackgroundAudio: audioService,
    Updater: {
      async download(input) {
        smoke.updater.push({ method: 'download', ...input });
        return { file: 'C:/temp/CleanMusic-Android-1.2.0.apk', size: input.size };
      },
      async install(input) {
        smoke.updater.push({ method: 'install', ...input });
        return { started: true };
      },
    },
    MediaLibrary: {
      async requestPermission() {
        return { granted: true };
      },
      async listAudio() {
        return {
          files: [
            {
              uri: 'content://media/external/audio/media/1',
              name: 'Smoke Song.mp3',
              title: 'Smoke Song',
              artist: 'CleanMusic',
              album: 'Smoke',
              folder: 'Music',
              size: 1024,
              duration: 30,
            },
          ],
        };
      },
    },
    AppLinks: {
      async openExternal(input) {
        smoke.external.push(input);
        return { opened: true };
      },
      async openMusic(input) {
        smoke.music.push(input);
        return { opened: true };
      },
    },
    RemoteServer: remoteMock,
  },
  convertFileSrc(uri) {
    if (String(uri).startsWith('content://')) return mediaPreview();
    return uri;
  },
};

smoke.remoteState = () => smoke.remote.state || { track: null, playing: false, queue: [] };
smoke.ask = (request) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      remotePending.delete(request.id);
      reject(new Error('TV antwortet nicht'));
    }, 5000);
    remotePending.set(request.id, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
    remoteListeners.forEach((listener) => {
      try {
        listener(request);
      } catch (error) {
        clearTimeout(timer);
        remotePending.delete(request.id);
        reject(error);
      }
    });
    if (!remoteListeners.length) {
      clearTimeout(timer);
      remotePending.delete(request.id);
      reject(new Error('kein TV-Listener'));
    }
  });
