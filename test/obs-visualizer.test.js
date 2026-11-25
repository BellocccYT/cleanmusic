'use strict';

/**
 * Tests for extras/plugins/obs-visualizer.js – settings fields, the local
 * server and the overlay page. The page script runs in a VM against a
 * recording canvas stub, so every style × colour mode is drawn once without
 * a browser (invalid gradient offsets, colours or NaN coordinates fail).
 *
 * Run with: npm run test:unit
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');

const file = path.join(__dirname, '..', 'extras', 'plugins', 'obs-visualizer.js');
const plugin = require(file);
const PORT = 47989;

let checks = 0;
async function check(name, run) {
  await run();
  checks += 1;
  console.log(`ok   ${name}`);
}

const field = (id) => plugin.settings.find((entry) => entry.id === id);
const NEW_STYLES = ['steps', 'radial-steps', 'radial-wave', 'meter', 'meter-steps', 'history'];
const ALL_STYLES = ['bars', 'mirror', 'radial', 'wave', ...NEW_STYLES];
const COLOR_MODES = ['auto', 'solid', 'gradient', 'line', 'pulse', 'pulse-freq', 'range'];
const SPECTRUM = Array.from({ length: 32 }, (_, i) => Math.round(255 * (0.25 + 0.6 * Math.abs(Math.sin(i * 0.7)))));

function get(pathname, host) {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: pathname, headers: host ? { Host: host } : {} }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
        if (pathname === '/events' && body.includes('\n\n')) req.destroy();
      });
      res.on('end', () => resolve({ status: res.statusCode, body }));
      res.on('close', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', (error) => resolve({ status: 0, body: error.message }));
    req.end();
  });
}

/* --- Canvas stub ------------------------------------------------------ */

const COLOR = /^rgba\((\d{1,3}),(\d{1,3}),(\d{1,3}),((?:\d*\.)?\d+)\)$/;
function assertColor(value) {
  if (value && typeof value === 'object' && Array.isArray(value.stops)) return;
  const match = COLOR.exec(String(value));
  assert.ok(match, `ungültige Farbe: ${value}`);
  [1, 2, 3].forEach((index) => assert.ok(Number(match[index]) <= 255, `Farbe außerhalb: ${value}`));
  assert.ok(Number(match[4]) <= 1, `Deckkraft außerhalb: ${value}`);
}
function assertFinite(args, name) {
  args.forEach((arg) => {
    if (typeof arg === 'number') assert.ok(Number.isFinite(arg), `${name}: ${arg}`);
  });
}

function makeContext(log) {
  const gradient = () => ({
    stops: [],
    addColorStop(offset, color) {
      assert.ok(offset >= 0 && offset <= 1, `Gradient-Offset außerhalb: ${offset}`);
      assertColor(color);
      this.stops.push([offset, color]);
    },
  });
  const target = {
    createLinearGradient(...args) {
      assertFinite(args, 'createLinearGradient');
      return gradient();
    },
    createRadialGradient(...args) {
      assertFinite(args, 'createRadialGradient');
      assert.ok(args[2] >= 0 && args[5] >= 0, 'negativer Radius');
      return gradient();
    },
    arc(...args) {
      assertFinite(args, 'arc');
      assert.ok(args[2] >= 0, 'negativer Radius');
      log.arcs.push(args.slice(0, 3));
    },
    arcTo(...args) {
      assertFinite(args, 'arcTo');
      assert.ok(args[4] >= 0, 'negativer Radius');
    },
    setLineDash(list) {
      assert.ok(list.every((value) => Number.isFinite(value) && value >= 0), 'ungültiges Strichmuster');
    },
    fill() {
      log.fill += 1;
    },
    stroke() {
      log.stroke += 1;
    },
    fillRect(...args) {
      assertFinite(args, 'fillRect');
      log.fill += 1;
    },
  };
  return new Proxy(target, {
    get(object, key) {
      if (key in object) return object[key];
      return (...args) => assertFinite(args, String(key));
    },
    set(object, key, value) {
      if (key === 'fillStyle' || key === 'strokeStyle' || key === 'shadowColor') assertColor(value);
      if (typeof value === 'number') assert.ok(Number.isFinite(value), `${String(key)}: ${value}`);
      object[key] = value;
      return true;
    },
  });
}

// Runs the overlay page script; returns helpers to push data and advance time.
function page(html, search = '', size = [800, 300]) {
  const script = /<script>([\s\S]*)<\/script>/.exec(html)[1];
  const log = { fill: 0, stroke: 0, arcs: [] };
  let clock = 1000;
  let raf = null;
  let events = null;
  const canvas = { clientWidth: size[0], clientHeight: size[1], width: 0, height: 0, getContext: () => makeContext(log) };
  const titleEl = { textContent: '', classList: { add() {}, remove() {} } };
  class FakeEventSource {
    constructor() {
      events = this;
    }
  }
  const window = { devicePixelRatio: 1, location: { search }, EventSource: FakeEventSource };
  const sandbox = {
    window,
    document: { getElementById: (id) => (id === 'viz' ? canvas : titleEl) },
    requestAnimationFrame: (fn) => {
      raf = fn;
      return 1;
    },
    performance: { now: () => clock },
    URLSearchParams,
    EventSource: FakeEventSource,
    fetch: () => Promise.reject(new Error('kein fetch')),
    setInterval: () => 0,
  };
  vm.runInNewContext(script, sandbox, { filename: 'visualizer-page.js' });
  return {
    log,
    send(data) {
      events.onmessage({ data: JSON.stringify(data) });
    },
    run(ms, step = 1000 / 60) {
      const end = clock + ms;
      while (clock < end) {
        clock += step;
        raf(clock);
      }
    },
    snapshot: () => JSON.parse(JSON.stringify(window.__cmVisualizer.snapshot())),
    reset() {
      log.fill = 0;
      log.stroke = 0;
      log.arcs.length = 0;
    },
  };
}

function payloadWith(json, extra = {}) {
  return Object.assign({}, json, {
    playing: true,
    spectrum: SPECTRUM,
    level: 0.5,
    track: { title: 'Test', artist: 'Band', artwork: '', colors: ['#5b8cff', '#35e0c0'] },
  }, extra);
}

(async () => {
  const manifestText = fs.readFileSync(file, 'utf8').slice(0, 8192);

  await check('Manifest: Version passt zum Modul, Berechtigungen unverändert', () => {
    const manifest = JSON.parse(/\/\*\s*cleanmusic-plugin\s*([\s\S]*?)\*\//.exec(manifestText)[1]);
    assert.equal(manifest.version, plugin.version);
    assert.equal(plugin.version, '1.3.0');
    assert.deepEqual(manifest.permissions, ['player', 'visualizer', 'server:local', 'clipboard', 'external-links', 'ui:settings']);
    assert.equal(plugin.apiVersion, 2);
    assert.equal(plugin.visualizer, true);
  });

  await check('Einstellungsfelder: höchstens 24, eindeutig, gültig für die Plugin-API', () => {
    const ids = plugin.settings.map((entry) => entry.id);
    assert.ok(ids.length <= 24, `${ids.length} Felder`);
    assert.equal(new Set(ids).size, ids.length);
    plugin.settings.forEach((entry) => {
      assert.match(entry.id.toLowerCase(), /^[a-z0-9][a-z0-9_-]{0,40}$/);
      assert.ok(['text', 'number', 'toggle', 'select', 'folder', 'password'].includes(entry.type), entry.id);
      assert.ok(String(entry.label).length <= 80, entry.id);
      assert.ok(String(entry.help || '').length <= 300, entry.id);
      assert.ok(String(entry.placeholder || '').length <= 80, entry.id);
      if (entry.type === 'select') {
        assert.ok(entry.options.length <= 20, entry.id);
        assert.ok(entry.options.some((option) => option.value === entry.default), `${entry.id}: Standard fehlt`);
        entry.options.forEach((option) => assert.ok(option.label.length <= 60 && option.value.length <= 60));
      }
      if (entry.type === 'number') {
        assert.ok(entry.default >= entry.min && entry.default <= entry.max, `${entry.id}: Standard außerhalb`);
      }
    });
    assert.ok(String(plugin.help).length <= 800);
  });

  await check('Bestehende Einstellungen behalten ihre Standardwerte', () => {
    const expect = {
      port: [4789, 1024, 65535],
      bars: [32, 8, 64],
      width: [100, 30, 100],
      gap: [3, 0, 20],
      sensitivity: [1.15, 0.5, 2],
    };
    Object.entries(expect).forEach(([id, [value, min, max]]) => {
      assert.equal(field(id).default, value, id);
      assert.equal(field(id).min, min, id);
      assert.equal(field(id).max, max, id);
    });
    assert.equal(field('style').default, 'bars');
    assert.equal(field('glow').default, true);
    assert.equal(field('background').default, false);
    assert.equal(field('showTitle').default, false);
    assert.equal(field('hideOnPause').default, true);
    // New options start neutral, so 1.2.0 setups look the same.
    assert.equal(field('colorMode').default, 'auto');
    assert.equal(field('smoothing').default, 'normal');
    assert.equal(field('inertia').default, 88);
    assert.equal(field('range').default, '30-16000');
    assert.equal(field('radialArc').default, 360);
    assert.equal(field('radialRotation').default, 0);
    assert.equal(field('delay').default, 0);
    ['mirrorX', 'normalize', 'hideOnSilence'].forEach((id) => assert.equal(field(id).default, false, id));
  });

  await check('Stil-Auswahl: alte vier Stile plus sechs neue', () => {
    const values = field('style').options.map((option) => option.value);
    assert.deepEqual(values.slice().sort(), ALL_STYLES.slice().sort());
    assert.deepEqual(plugin._debug().styles.slice().sort(), ALL_STYLES.slice().sort());
    assert.deepEqual(field('colorMode').options.map((option) => option.value), COLOR_MODES);
  });

  const state = { playing: true, track: { title: 'Test', artist: 'Band', colors: ['#5b8cff', '#35e0c0'] }, visualizer: { spectrum: SPECTRUM, level: 0.5 } };
  let stored = { port: PORT };
  await plugin.setup({
    settings: { get: () => stored },
    player: { state: () => state },
    copyText() {},
    openExternal() {},
  });

  let json = null;
  try {
    await check('Server: Seite, JSON mit neuen Feldern, SSE, Fremd-Host gesperrt', async () => {
      const page200 = await get('/visualizer');
      assert.equal(page200.status, 200);
      assert.ok(page200.body.includes('CleanMusic · Visualizer'));
      const result = await get('/visualizer.json');
      assert.equal(result.status, 200);
      json = JSON.parse(result.body);
      assert.equal(json.spectrum.length, 32);
      assert.equal(json.style, 'bars');
      assert.equal(json.colorMode, 'auto');
      assert.equal(json.inertia, 88);
      assert.equal(json.range, '30-16000');
      assert.equal(json.mirrorX, false);
      assert.equal(json.delay, 0);
      assert.ok(!('port' in json), 'Port gehört nicht in die Seite');
      plugin.settings.filter((entry) => entry.id !== 'port').forEach((entry) => assert.ok(entry.id in json, entry.id));
      assert.equal((await get('/visualizer.json', 'evil.example')).status, 403);
      const events = await get('/events');
      assert.ok(events.body.startsWith('retry:') && events.body.includes('"colorMode"'));
    });

    await check('Server: ?style= erzwingt jeden Stil, Unbekanntes wird ignoriert', async () => {
      for (const style of ALL_STYLES) {
        const result = await get(`/visualizer?style=${style}`);
        assert.equal(result.status, 200);
        assert.ok(result.body.includes(`const forced = "${style}"`), style);
      }
      const evil = await get('/visualizer?style=%3Cscript%3E');
      assert.ok(evil.body.includes('const forced = ""'));
    });

    await check('Server: Einstellungswechsel wird ausgeliefert', async () => {
      stored = { port: PORT, style: 'radial-wave', colorMode: 'range', radialArc: 180, stepSize: 12 };
      await plugin.onSettings();
      const after = JSON.parse((await get('/visualizer.json')).body);
      assert.equal(after.style, 'radial-wave');
      assert.equal(after.colorMode, 'range');
      assert.equal(after.radialArc, 180);
      assert.equal(after.stepSize, 12);
      stored = { port: PORT };
      await plugin.onSettings();
    });

    const pages = {};
    for (const style of ALL_STYLES) pages[style] = (await get(`/visualizer?style=${style}`)).body;
    const plain = (await get('/visualizer')).body;

    await check('Seite: Standard reagiert genau wie 1.2.0 (0,42 hoch / 0,12 runter)', () => {
      const view = page(plain);
      view.send(payloadWith(json));
      view.run(1000 / 60);
      const first = view.snapshot();
      assert.equal(first.style, 'bars');
      assert.equal(first.bands, 32);
      first.levels.forEach((value, i) => {
        const expected = 0.42 * Math.min(1, (SPECTRUM[i] / 255) * 1.15);
        assert.ok(Math.abs(value - expected) < 1e-6, `Band ${i}: ${value} statt ${expected}`);
      });
      view.send(payloadWith(json, { spectrum: new Array(32).fill(0) }));
      view.run(1000 / 60);
      const second = view.snapshot();
      second.levels.forEach((value, i) => {
        assert.ok(Math.abs(value - first.levels[i] * 0.88) < 1e-6, `Band ${i} fällt falsch`);
      });
    });

    await check('Seite: alle Stile × Farbmodi zeichnen ohne Fehler', () => {
      for (const style of ALL_STYLES) {
        for (const mode of COLOR_MODES) {
          const tall = style.startsWith('radial') ? [420, 420] : [800, 300];
          const view = page(pages[style], `?colorMode=${mode}`, tall);
          view.send(payloadWith(json));
          view.run(400);
          const snap = view.snapshot();
          assert.equal(snap.style, style);
          assert.equal(snap.options.colorMode, mode);
          assert.ok(view.log.fill + view.log.stroke > 0, `${style}/${mode} zeichnet nichts`);
        }
      }
    });

    await check('Seite: Optionen-Kombinationen (Kreis-Bogen, invertiert, Glättung, Filter) bleiben gültig', () => {
      const combos = [
        '?radialArc=180&radialRotation=90&mirrorX=1',
        '?radialArc=90&invert=1&inner=30&rounded=0',
        '?invert=1&colorMode=range&colors=ff0000,00ff00,0000ff',
        '?smoothing=time-fast&inertia=0&interp=cubic&blur=2',
        '?smoothing=fast&inertia=98&interp=nearest&scale=linear',
        '?range=30-250&rolloff=1.5&slope=10&floor=20&ceil=80',
        '?range=1k-1k&normalize=1&maxGain=8',
        '?colors=%235b8cff80,%23ffd166&colorMode=gradient&ratio=3&minHeight=40',
        '?stepSize=2&stepGap=0&bars=64&gap=0',
        '?stepSize=64&stepGap=32&bars=8&gap=20&width=30',
      ];
      for (const style of ALL_STYLES) {
        for (const combo of combos) {
          const view = page(pages[style], combo, [640, 360]);
          view.send(payloadWith(json));
          view.run(300);
          view.send(payloadWith(json, { spectrum: new Array(32).fill(0) }));
          view.run(100);
          assert.ok(view.log.fill + view.log.stroke > 0, `${style} ${combo}`);
        }
      }
    });

    await check('Seite: voller Kreis wie 1.2.0, Halbkreis wird zentriert', () => {
      const full = page(pages.radial, '', [420, 420]);
      full.send(payloadWith(json));
      full.run(50);
      const ring = full.log.arcs[full.log.arcs.length - 1];
      assert.ok(Math.abs(ring[0] - 210) < 1e-6 && Math.abs(ring[1] - 210) < 1e-6, `Mitte ${ring}`);
      assert.ok(Math.abs(ring[2] - 420 * 0.19 * 0.97) < 1e-6, `Ring ${ring[2]}`);
      // Lower half circle (arc 180°, starting at 3 o'clock) in an 800 × 300 source.
      const half = page(pages.radial, '?radialArc=180&radialRotation=90', [800, 300]);
      half.send(payloadWith(json));
      half.run(50);
      const arc = half.log.arcs[half.log.arcs.length - 1];
      assert.ok(Math.abs(arc[0] - 400) < 1e-6, `x ${arc[0]}`);
      assert.ok(Math.abs(arc[1] - (150 - 0.5 * 300 * 0.88)) < 1e-6, `y ${arc[1]}`);
    });

    await check('Seite: URL-Parameter überschreiben Einstellungen und werden begrenzt', () => {
      const view = page(pages.radial, '?colorMode=range&bars=12&radialArc=999&rounded=0&inertia=-5&unknown=1&style=bars');
      view.send(payloadWith(json));
      view.run(50);
      const snap = view.snapshot();
      assert.equal(snap.style, 'radial', 'Stil kommt vom Server (?style=)');
      assert.equal(snap.bands, 12);
      assert.equal(snap.options.colorMode, 'range');
      assert.equal(snap.options.radialArc, 360);
      assert.equal(snap.options.rounded, false);
      assert.equal(snap.options.inertia, 0);
      assert.ok(!('unknown' in snap.options));
    });

    await check('Seite: Frequenzen spiegeln ist symmetrisch, Bereich schneidet zu', () => {
      const view = page(plain, '?mirrorX=1&bars=31');
      view.send(payloadWith(json));
      view.run(200);
      const levels = view.snapshot().levels;
      for (let i = 0; i < levels.length; i += 1) assert.ok(Math.abs(levels[i] - levels[levels.length - 1 - i]) < 1e-6);
      const bass = page(plain, '?range=30-250&inertia=0');
      bass.send(payloadWith(json, { spectrum: SPECTRUM.map((value, i) => (i < 11 ? value : 0)) }));
      bass.run(50);
      const snap = bass.snapshot();
      assert.equal(snap.options.lo, 30);
      assert.equal(snap.options.hi, 250);
      assert.ok(snap.levels.every((value) => value > 0), 'Bass-Bereich zeigt nur tiefe Bänder');
    });

    await check('Seite: Verzögerung hält Daten zurück, Pegel und Spitze laufen', () => {
      const view = page(pages.meter, '?delay=500');
      view.send(payloadWith(json));
      view.run(300);
      assert.equal(view.snapshot().queued, 1);
      assert.equal(view.snapshot().meter, 0);
      view.run(400);
      const snap = view.snapshot();
      assert.equal(snap.queued, 0);
      assert.ok(snap.meter > 0.2, `Pegel ${snap.meter}`);
      assert.ok(snap.hold >= snap.meter);
    });

    await check('Seite: „Bei Stille ausblenden“ blendet trotz Wiedergabe aus', () => {
      const silent = payloadWith(json, { spectrum: new Array(32).fill(0) });
      const off = page(plain);
      off.send(silent);
      off.run(3000);
      off.reset();
      off.run(100);
      assert.ok(off.log.fill > 0, 'ohne Option bleibt sichtbar');
      const on = page(plain, '?hideOnSilence=1');
      on.send(silent);
      on.run(3000);
      on.reset();
      on.run(100);
      assert.equal(on.log.fill + on.log.stroke, 0);
    });

    await check('Seite: höchstens 60 Bilder pro Sekunde, auch bei 240 Hz', () => {
      const view = page(plain);
      view.send(payloadWith(json));
      view.run(1000, 1000 / 240);
      const fast = view.snapshot().frames;
      assert.ok(fast <= 61 && fast >= 55, `${fast} Bilder bei 240 Hz`);
      const obs = page(plain);
      obs.send(payloadWith(json));
      obs.run(1000, 1000 / 30);
      const thirty = obs.snapshot().frames;
      assert.ok(thirty >= 29 && thirty <= 31, `${thirty} Bilder bei 30 Hz`);
    });
  } finally {
    plugin.dispose();
  }

  await check('Server: nach dem Ausschalten ist der Port frei', async () => {
    const closed = await get('/visualizer.json');
    assert.equal(closed.status, 0);
  });

  console.log(`${checks} passed, 0 failed`);
})().catch((error) => {
  console.error(error);
  plugin.dispose();
  process.exit(1);
});
