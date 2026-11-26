'use strict';

/**
 * Tests for the XENEON EDGE bridge (extras/plugins/xeneon-edge.js) and the
 * widget's pure logic (extras/xeneon-edge/widget/scripts/logic.js).
 *
 * The plugin runs on a throw-away port with a fake CleanMusic context; no
 * Electron, no network. The widget logic is loaded in a VM, like the OBS
 * visualizer page test.
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const PORT = 47901;
process.env.CLEANMUSIC_XENEON_PORT = String(PORT);

const plugin = require(path.join(__dirname, '..', 'extras', 'plugins', 'xeneon-edge.js'));
const logicFile = path.join(__dirname, '..', 'extras', 'xeneon-edge', 'widget', 'scripts', 'logic.js');
const widgetDir = path.join(__dirname, '..', 'extras', 'xeneon-edge', 'widget');

let checks = 0;
async function check(name, run) {
  await run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------------ *
 * Fake CleanMusic context
 * ------------------------------------------------------------------ */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-xeneon-'));
const calls = [];
const notifications = [];
const panels = [];
const fetched = [];
let copied = '';
let opened = '';
let settingValues = { spectrum: true, lyrics: true };
let coverMode = 'image';

let player = {
  track: {
    id: 'deezer:1',
    title: 'Nachtfahrt',
    artist: 'Lena Morgen',
    album: 'Nachleuchten',
    kind: 'preview',
    artwork: 'https://e-cdns-images.dzcdn.net/images/cover/abc/500x500.jpg',
    link: 'https://www.deezer.com/track/1',
    license: '',
    colors: ['#5b8cff', '#35e0c0'],
  },
  playing: true,
  position: 30,
  duration: 200,
  volume: 0.8,
  muted: false,
  at: Date.now(),
  live: false,
  lyric: { line: 'Wir fahren durch die Nacht', next: 'und lassen alles hinter uns' },
  upNext: [
    { title: 'Sterne über Berlin', artist: 'Mira Feld', by: '' },
    { title: 'Kein Zurück', artist: 'Jonas Hale', by: 'Mira' },
    { title: 'Sommerregen', artist: 'Ella Brandt', by: '' },
    { title: 'Leise', artist: 'Kai Nord', by: '' },
    { title: 'Zu weit', artist: 'Nova Lane', by: '' },
  ],
  visualizer: { spectrum: Array(32).fill(120), level: 0.5, at: Date.now() },
};

const ctx = {
  appVersion: '2.1.1',
  platform: 'win32',
  dataDir: tmp,
  settings: { get: () => ({ ...settingValues }) },
  player: {
    state: () => JSON.parse(JSON.stringify(player)),
    play: () => calls.push(['play']),
    pause: () => calls.push(['pause']),
    toggle: () => calls.push(['toggle']),
    next: () => calls.push(['next']),
    previous: () => calls.push(['previous']),
    setVolume: (value) => calls.push(['volume', value]),
    setMuted: (value) => calls.push(['mute', value]),
  },
  ui: { panel: (def) => panels.push(def) },
  notify: (text) => notifications.push(text),
  copyText: (text) => {
    copied = text;
  },
  openExternal: (url) => {
    opened = url;
  },
  refresh: () => {},
  fetch: async (url) => {
    fetched.push(url);
    if (coverMode === 'text') {
      return {
        ok: true,
        headers: { get: (name) => (name === 'content-type' ? 'text/plain' : null) },
        arrayBuffer: async () => Buffer.from('nope'),
      };
    }
    if (coverMode === 'big') {
      return {
        ok: true,
        headers: {
          get: (name) => (name === 'content-type' ? 'image/png' : name === 'content-length' ? String(3 * 1024 * 1024) : null),
        },
        arrayBuffer: async () => Buffer.alloc(4),
      };
    }
    return {
      ok: true,
      headers: {
        get: (name) => (name === 'content-type' ? 'image/png; charset=binary' : null),
      },
      arrayBuffer: async () => Buffer.from([137, 80, 78, 71, 1, 2, 3, 4]),
    };
  },
};

/* ------------------------------------------------------------------ *
 * HTTP helper
 * ------------------------------------------------------------------ */

let lastRequestAt = 0;

async function request(method, pathname, options = {}) {
  if (!options.raw) {
    const gap = 60 - (Date.now() - lastRequestAt);
    if (gap > 0) await wait(gap);
    lastRequestAt = Date.now();
  }
  const headers = Object.assign({}, options.headers || {});
  if (options.token) headers['X-CM-Token'] = options.token;
  let body = null;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = Buffer.byteLength(body);
  }
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: pathname, method, headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(buffer.toString('utf8'));
          } catch {
            json = null;
          }
          resolve({ status: res.statusCode, headers: res.headers, buffer, json, text: buffer.toString('utf8') });
        });
      }
    );
    req.on('error', (error) => resolve({ status: 0, headers: {}, buffer: Buffer.alloc(0), json: null, text: error.message }));
    if (body) req.write(body);
    req.end();
  });
}

const get = (pathname, token, headers) => request('GET', pathname, { token, headers });
const post = (pathname, body, token) => request('POST', pathname, { body: body || {}, token });

async function pauseRate() {
  await wait(70);
}

async function freshToken() {
  const pair = await post('/api/pair');
  assert.equal(pair.status, 200, pair.text);
  await plugin.runAction('allow-pair');
  const status = await get(`/api/pair/${pair.json.pairId}`);
  assert.equal(status.status, 200);
  assert.equal(status.json.status, 'paired');
  return status.json.token;
}

/* ------------------------------------------------------------------ *
 * Widget logic in a VM
 * ------------------------------------------------------------------ */

function loadLogic() {
  const code = fs.readFileSync(logicFile, 'utf8');
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'logic.js' });
  return sandbox.module.exports;
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

(async () => {
  const L = loadLogic();
  let token = '';

  await check('Widget-Logik: Layout nach Größe, nicht nach Slot-Namen', () => {
    assert.equal(L.layoutFor(840, 344, 'auto'), 'compact');
    assert.equal(L.layoutFor(696, 416, 'auto'), 'compact');
    assert.equal(L.layoutFor(840, 696, 'auto'), 'medium');
    assert.equal(L.layoutFor(1688, 696, 'auto'), 'wide');
    assert.equal(L.layoutFor(2536, 696, 'auto'), 'wide');
    assert.equal(L.layoutFor(696, 840, 'auto'), 'portrait');
    assert.equal(L.layoutFor(696, 2536, 'auto'), 'tall');
    assert.equal(L.layoutFor(840, 344, 'compact'), 'compact');
    assert.equal(L.layoutFor(840, 344, 'large'), 'medium');
    assert.equal(L.layoutFor(0, 0, 'auto'), 'compact');
    assert.equal(L.queueRows('wide'), 4);
    assert.equal(L.queueRows('medium'), 3);
    assert.equal(L.queueRows('compact'), 0);
  });

  await check('Widget-Logik: Zeit, Projektion und Fortschritt', () => {
    assert.equal(L.fmtTime(0), '0:00');
    assert.equal(L.fmtTime(65), '1:05');
    assert.equal(L.fmtTime(3725), '1:02:05');
    assert.equal(L.fmtTime(-4), '0:00');
    assert.equal(L.fmtTime(NaN), '0:00');

    const now = 1_700_000_000_000;
    const playing = { position: 10, duration: 100, playing: true, at: now, live: false };
    assert.equal(L.projectedPosition(playing, now + 2000), 12);
    assert.equal(L.projectedPosition(playing, now + 60_000), 15, 'höchstens 5 s extrapolieren');
    assert.equal(L.projectedPosition({ ...playing, playing: false }, now + 2000), 10);
    assert.equal(L.projectedPosition({ ...playing, live: true }, now + 2000), 0);
    assert.equal(L.projectedPosition({ ...playing, position: 99, duration: 100 }, now + 60_000), 100);
    assert.equal(L.projectedPosition(null, now), 0);

    assert.equal(L.progressFraction(50, 200), 0.25);
    assert.equal(L.progressFraction(500, 200), 1);
    assert.equal(L.progressFraction(10, 0), 0);
  });

  await check('Widget-Logik: Wischen, Lautstärke und Tippen', () => {
    assert.equal(L.gestureFor(-90, 10, 44), 'next');
    assert.equal(L.gestureFor(90, -10, 44), 'previous');
    assert.equal(L.gestureFor(5, -90, 44), 'louder');
    assert.equal(L.gestureFor(5, 90, 44), 'quieter');
    assert.equal(L.gestureFor(10, 10, 44), '');
    assert.equal(L.gestureFor(-20, 0, 44), '');
    assert.equal(L.clampVolume(9), 1.5);
    assert.equal(L.clampVolume(-1), 0);
    assert.equal(L.volumePercent(0.72), 72);
    assert.equal(L.volumePercent(1.5), 150);
  });

  await check('Widget-Logik: Kontrast und Coverfarben', () => {
    const accent = L.ensureContrast('#0b0d12', '#0b0d12', 4.5);
    assert.ok(L.contrast(L.parseHex(accent), L.parseHex('#0b0d12')) >= 4.5);
    const lightText = L.ensureContrast('#ffffff', '#f4f7ff', 4.5);
    assert.ok(L.contrast(L.parseHex(lightText), L.parseHex('#f4f7ff')) >= 4.5);

    const plain = L.backgroundStops(['#5b8cff', '#35e0c0'], null, '#5b8cff');
    assert.equal(plain.accent, '#5b8cff');
    assert.ok(/^#[0-9a-f]{6}$/.test(plain.from));
    assert.ok(/^#[0-9a-f]{6}$/.test(plain.to));
    assert.ok(L.luminance(L.parseHex(plain.to)) < L.luminance(L.parseHex(plain.from)));
    const custom = L.backgroundStops([], '#223344', '#5b8cff');
    assert.ok(/^#[0-9a-f]{6}$/.test(custom.from));
    assert.equal(custom.accent, '#5b8cff');
  });

  await check('Widget-Logik: Zustand nur mit erlaubten Feldern', () => {
    const clean = L.sanitizeState({
      appVersion: '2.1.1',
      at: 12,
      capabilities: { seek: 1, like: true, spectrum: 'yes' },
      track: {
        title: 'Nachtfahrt',
        artist: 'Lena Morgen',
        album: 'Nachleuchten',
        kind: 'preview',
        live: false,
        artwork: 'C:\\Users\\privat\\cover.jpg',
        link: 'https://example.com/x',
        colors: ['#abc', 'red', '#123456', '#000000'],
        cover: '/api/cover?v=0123456789abcdef0123',
      },
      playing: 1,
      position: -5,
      duration: 999999,
      volume: 9,
      muted: 'yes',
      favorite: 'yes',
      lyricsOn: true,
      lyric: { line: 'Zeile', next: 'Nächste' },
      upNext: Array.from({ length: 10 }, (_, index) => ({
        title: 'Titel ' + index,
        artist: 'Artist',
        cover: '/api/cover?v=zzz',
      })),
    });
    assert.equal(clean.capabilities.seek, false, 'nur echte Booleans');
    assert.equal(clean.capabilities.like, true);
    assert.equal(clean.capabilities.spectrum, false);
    assert.equal(clean.track.colors.length, 3);
    assert.equal(clean.track.cover, '/api/cover?v=0123456789abcdef0123');
    assert.equal(clean.position, 0);
    assert.equal(clean.duration, 24 * 3600);
    assert.equal(clean.volume, 1.5);
    assert.equal(clean.muted, false);
    assert.equal(clean.favorite, null);
    assert.equal(clean.upNext.length, 4);
    assert.equal(clean.upNext[0].cover, '');
    assert.equal(clean.lyric.line, 'Zeile');
    assert.ok(!JSON.stringify(clean).includes('Users'));
    assert.ok(!JSON.stringify(clean).includes('http'));
    assert.equal(L.letterFor('Nachtfahrt'), 'N');
    assert.equal(L.letterFor(''), '♪');
  });

  await check('Widget: Manifest und Kopf sind vollständig', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(widgetDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.name, 'CleanMusic');
    assert.equal(manifest.interactive, true);
    assert.deepEqual(manifest.supported_devices, [{ type: 'dashboard_lcd', features: ['sensor-screen'] }]);
    assert.deepEqual(manifest.permissions, [{ type: 'url', domain: 'localhost', port: 4790 }]);
    assert.ok(fs.existsSync(path.join(widgetDir, manifest.preview_icon)));
    assert.ok(fs.existsSync(path.join(widgetDir, 'resources', 'icon.svg')));
    assert.ok(fs.existsSync(path.join(widgetDir, 'resources', 'preview.png')));
    const html = fs.readFileSync(path.join(widgetDir, 'index.html'), 'utf8');
    assert.ok(html.startsWith('<!DOCTYPE html>'));
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(!/[^\x00-\x7f]/.test(head), 'Kopf nur ASCII');
    assert.ok(head.includes('<title>tr(\'CleanMusic\')</title>'));
    assert.ok(head.includes('id="x-icue-groups"'));
    assert.ok(head.includes('content="textColor"'));
    assert.ok(head.includes('content="accentColor"'));
    assert.ok(head.includes('content="backgroundColor"'));
  });

  await check('Plugin: startet, Host-Prüfung und Token-Pflicht', async () => {
    await plugin.setup(ctx);
    assert.equal(plugin._debug.port(), PORT);
    const status = plugin.status();
    assert.equal(status.ready, true);
    assert.equal(status.flags.running, true);
    assert.equal(status.flags.pairing, false);
    assert.equal(status.text, 'Wartet auf das Widget');

    const foreign = await get('/api/state', null, { Host: `evil.example:${PORT}` });
    assert.equal(foreign.status, 403);
    const noToken = await get('/api/state');
    assert.equal(noToken.status, 401);
    const wrong = await get('/api/state', 'x'.repeat(43));
    assert.equal(wrong.status, 401);
  });

  await check('Plugin: Kopplung mit Code, Erlauben und Token einmalig', async () => {
    const pair = await post('/api/pair');
    assert.equal(pair.status, 200);
    assert.equal(pair.json.code.length, 4);
    assert.ok(/^\d{4}$/.test(pair.json.code));
    assert.ok(notifications.some((text) => text.includes(pair.json.code)));
    assert.ok(panels.some((panel) => panel.html.includes(pair.json.code)));
    assert.equal(plugin.status().flags.pairing, true);

    const before = await get(`/api/pair/${pair.json.pairId}`);
    assert.equal(before.status, 200);
    assert.equal(before.json.status, 'pending');
    assert.equal(before.json.token, undefined);

    const allowed = await plugin.runAction('allow-pair');
    assert.ok(/gekoppelt/i.test(allowed.message));
    assert.equal(plugin.status().flags.pairing, false);
    assert.equal(plugin._debug.devices().length, 1);

    const once = await get(`/api/pair/${pair.json.pairId}`);
    assert.equal(once.json.status, 'paired');
    assert.equal(typeof once.json.token, 'string');
    assert.ok(once.json.token.length >= 40);
    token = once.json.token;

    const twice = await get(`/api/pair/${pair.json.pairId}`);
    assert.equal(twice.json.status, 'paired');
    assert.equal(twice.json.token, undefined, 'Token nur einmal');

    const state = await get('/api/state', token);
    assert.equal(state.status, 200);
  });

  await check('Plugin: Zustand ohne Pfade oder fremde URLs', async () => {
    const state = await get('/api/state', token);
    assert.equal(state.status, 200);
    const data = state.json;
    assert.equal(data.track.title, 'Nachtfahrt');
    assert.equal(data.track.artist, 'Lena Morgen');
    assert.equal(data.track.album, 'Nachleuchten');
    assert.equal(data.track.kind, 'preview');
    assert.deepEqual(data.track.colors, ['#5b8cff', '#35e0c0']);
    assert.ok(/^\/api\/cover\?v=[a-f0-9]{20}$/.test(data.track.cover));
    assert.equal(data.track.artwork, undefined);
    assert.equal(data.track.link, undefined);
    assert.ok(!JSON.stringify(data).includes('dzcdn.net'));
    assert.ok(!JSON.stringify(data).includes('deezer.com'));
    assert.equal(data.capabilities.seek, false);
    assert.equal(data.capabilities.like, false);
    assert.equal(data.favorite, null);
    assert.equal(data.lyric.line, 'Wir fahren durch die Nacht');
    assert.equal(data.upNext.length, 4);
    assert.equal(data.upNext[0].title, 'Sterne über Berlin');
    assert.ok(data.position >= 30);
    assert.equal(data.duration, 200);
    assert.equal(data.volume, 0.8);

    player.track.kind = 'radio';
    player.live = true;
    plugin.onEvent('state', player);
    const radio = await get('/api/state', token);
    assert.equal(radio.json.track.live, true);
    assert.equal(radio.json.position, 0);
    player.track.kind = 'preview';
    player.live = false;
    plugin.onEvent('state', player);
  });

  await check('Plugin: Befehle rufen die richtigen Player-Funktionen', async () => {
    calls.length = 0;
    for (const command of ['play', 'pause', 'toggle', 'next', 'previous']) {
      const result = await post('/api/cmd', { command }, token);
      assert.equal(result.status, 200, command);
      assert.equal(result.json.ok, true);
      assert.ok(result.json.state);
      await pauseRate();
    }
    const volume = await post('/api/cmd', { command: 'volume', value: 0.55 }, token);
    assert.equal(volume.status, 200);
    const mute = await post('/api/cmd', { command: 'mute', value: true }, token);
    assert.equal(mute.status, 200);
    assert.deepEqual(calls, [
      ['play'],
      ['pause'],
      ['toggle'],
      ['next'],
      ['previous'],
      ['volume', 0.55],
      ['mute', true],
    ]);

    const seek = await post('/api/cmd', { command: 'seek', value: 12 }, token);
    assert.equal(seek.status, 501);
    assert.equal(seek.json.error, 'not-supported');
    const like = await post('/api/cmd', { command: 'like' }, token);
    assert.equal(like.status, 501);

    const bad = await post('/api/cmd', { command: 'rm -rf' }, token);
    assert.equal(bad.status, 400);
    const badVolume = await post('/api/cmd', { command: 'volume', value: 'laut' }, token);
    assert.equal(badVolume.status, 400);
  });

  await check('Plugin: bereit für seek/like aus Plugin-API 2.2', async () => {
    ctx.player.seek = (seconds) => calls.push(['seek', seconds]);
    ctx.player.toggleFavorite = () => calls.push(['toggleFavorite']);
    const state = await get('/api/state', token);
    assert.equal(state.json.capabilities.seek, true);
    assert.equal(state.json.capabilities.like, true);
    const seek = await post('/api/cmd', { command: 'seek', value: 42 }, token);
    assert.equal(seek.status, 200);
    const like = await post('/api/cmd', { command: 'like' }, token);
    assert.equal(like.status, 200);
    assert.deepEqual(calls.slice(-2), [['seek', 42], ['toggleFavorite']]);
    delete ctx.player.seek;
    delete ctx.player.toggleFavorite;
    await pauseRate();
  });

  await check('Plugin: Cover-Proxy nur erlaubte Hosts, image/*, 2 MB', async () => {
    fetched.length = 0;
    coverMode = 'image';
    player.track.artwork = 'https://e-cdns-images.dzcdn.net/images/cover/new/500x500.jpg';
    plugin.onEvent('state', player);
    const state = await get('/api/state', token);
    assert.ok(/^\/api\/cover\?v=[a-f0-9]{20}$/.test(state.json.track.cover));
    const cover = await get(state.json.track.cover, token);
    assert.equal(cover.status, 200);
    assert.equal(cover.headers['content-type'], 'image/png');
    assert.deepEqual([...cover.buffer], [137, 80, 78, 71, 1, 2, 3, 4]);
    assert.ok(fetched.some((url) => url.includes('dzcdn.net')));

    coverMode = 'text';
    player.track.artwork = 'https://e-cdns-images.dzcdn.net/images/cover/text/500x500.jpg';
    plugin.onEvent('state', player);
    const textState = await get('/api/state', token);
    const textCover = await get(textState.json.track.cover, token);
    assert.equal(textCover.status, 404);

    coverMode = 'big';
    player.track.artwork = 'https://e-cdns-images.dzcdn.net/images/cover/big/500x500.jpg';
    plugin.onEvent('state', player);
    const bigState = await get('/api/state', token);
    const bigCover = await get(bigState.json.track.cover, token);
    assert.equal(bigCover.status, 404);

    fetched.length = 0;
    player.track.artwork = 'https://evil.example/cover.jpg';
    plugin.onEvent('state', player);
    const evil = await get('/api/state', token);
    assert.equal(evil.json.track.cover, null);
    assert.equal(fetched.length, 0, 'fremder Host wird nicht geholt');

    player.track.artwork = 'http://e-cdns-images.dzcdn.net/insecure.jpg';
    plugin.onEvent('state', player);
    assert.equal((await get('/api/state', token)).json.track.cover, null);

    const dataCover =
      'data:image/png;base64,' + Buffer.from([137, 80, 78, 71, 9]).toString('base64');
    player.track.artwork = dataCover;
    plugin.onEvent('state', player);
    const dataState = await get('/api/state', token);
    const dataImage = await get(dataState.json.track.cover, token);
    assert.equal(dataImage.status, 200);
    assert.deepEqual([...dataImage.buffer], [137, 80, 78, 71, 9]);

    assert.equal((await get('/api/cover?v=zzz', token)).status, 404);
    assert.equal((await get('/api/cover?v=0123456789abcdef0123', token)).status, 404);
  });

  await check('Plugin: Songtext-Schalter wirkt sofort', async () => {
    settingValues = { spectrum: true, lyrics: false };
    plugin.onSettings(settingValues);
    const state = await get('/api/state', token);
    assert.equal(state.json.lyric, null);
    assert.equal(state.json.lyricsOn, true);
    settingValues = { spectrum: true, lyrics: true };
    plugin.onSettings(settingValues);
    assert.ok((await get('/api/state', token)).json.lyric);
  });

  await check('Plugin: SSE liefert Zustand und Spektrum', async () => {
    const events = [];
    let buffer = '';
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: `/api/events?k=${encodeURIComponent(token)}&spectrum=1`,
        headers: { Accept: 'text/event-stream' },
      },
      (res) => {
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          buffer += chunk;
          let index;
          while ((index = buffer.indexOf('\n\n')) >= 0) {
            const block = buffer.slice(0, index);
            buffer = buffer.slice(index + 2);
            const name = /^event: (.+)$/m.exec(block);
            const data = /^data: (.+)$/m.exec(block);
            if (name && data) events.push({ name: name[1], data: data[1] });
          }
        });
      }
    );
    req.end();
    await wait(200);

    async function next(name, timeout = 1500) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const index = events.findIndex((event) => event.name === name);
        if (index >= 0) return JSON.parse(events.splice(index, 1)[0].data);
        await wait(20);
      }
      throw new Error(`kein ${name}-Ereignis`);
    }

    const initial = await next('state');
    assert.equal(initial.track.title, 'Nachtfahrt');
    assert.equal(plugin.status().text, 'Bereit – Widget verbunden (1)');
    assert.equal(plugin._debug.sseCount(), 1);

    player.position = 77;
    plugin.onEvent('state', player);
    const pushed = await next('state');
    assert.ok(pushed.position >= 77);

    plugin.onEvent('visualizer', {
      visualizer: { spectrum: Array.from({ length: 32 }, (_, i) => i * 7), level: 0.4, at: Date.now() },
    });
    const spectrum = await next('spectrum');
    assert.equal(spectrum.v.length, 32);
    assert.ok(spectrum.v.every((value) => value >= 0 && value <= 255));

    req.destroy();
    await wait(100);
    assert.equal(plugin._debug.sseCount(), 0);
  });

  await check('Plugin: Ablauf, Gerätegrenze, Schlüssel und Zurücksetzen', async () => {
    const expired = await post('/api/pair');
    plugin._debug.expirePair();
    const gone = await get(`/api/pair/${expired.json.pairId}`);
    assert.equal(gone.status, 410);
    assert.equal(gone.json.status, 'expired');

    plugin.runAction('reset-pairs');
    assert.equal(plugin._debug.devices().length, 0);
    assert.equal((await get('/api/state', token)).status, 401);

    for (let index = 0; index < 3; index += 1) {
      const pair = await post('/api/pair');
      assert.equal(pair.status, 200);
      await plugin.runAction('allow-pair');
      await pauseRate();
    }
    assert.equal(plugin._debug.devices().length, 3);
    const full = await post('/api/pair');
    assert.equal(full.status, 409);
    assert.equal(full.json.error, 'devices-full');

    plugin.runAction('reset-pairs');
    copied = '';
    const copiedResult = await plugin.runAction('copy-key');
    assert.ok(/kopiert/i.test(copiedResult.message));
    assert.ok(copied.length >= 40);
    assert.equal(plugin._debug.devices().length, 1);
    assert.equal(plugin._debug.tokenMatches(copied), true);

    plugin.runAction('reset-pairs');
    assert.equal(plugin._debug.tokenMatches(copied), false);
    token = await freshToken();
  });

  await check('Plugin: 20 Anfragen pro Sekunde, dann 429', async () => {
    await wait(1100);
    const burst = await Promise.all(
      Array.from({ length: 26 }, () => request('GET', '/api/state', { token, raw: true }))
    );
    assert.ok(burst.some((result) => result.status === 429), 'mindestens eine 429');
    assert.ok(burst.some((result) => result.status === 200));
    await wait(1100);
    assert.equal((await get('/api/state', token)).status, 200);
  });

  await check('Plugin: Statuszeile und Aktionen', async () => {
    const status = plugin.status();
    assert.ok(/Bereit|Wartet/.test(status.text));
    assert.ok(status.detail.includes('47901'));
    const ids = plugin.actions.map((action) => action.id);
    assert.deepEqual(ids, ['allow-pair', 'copy-key', 'download-widget', 'reset-pairs']);
    const download = await plugin.runAction('download-widget');
    assert.ok(/Release-Seite/.test(download.message));
    assert.ok(opened.includes('github.com'));
    assert.equal(plugin.settings.length, 2);
    assert.equal(plugin.settings[0].id, 'spectrum');
    assert.equal(plugin.settings[1].id, 'lyrics');
  });

  await check('Plugin: Ausschalten gibt den Port frei', async () => {
    plugin.dispose();
    assert.equal(plugin.status().flags.running, false);
    const closed = await get('/api/state', token);
    assert.equal(closed.status, 0);
  });

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${checks} passed, 0 failed`);
})().catch(async (error) => {
  console.error(error);
  try {
    plugin.dispose();
  } catch {
    /* ignore */
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
});
