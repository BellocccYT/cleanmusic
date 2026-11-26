'use strict';

/*
 * iCUE stub + fake CleanMusic bridge for screenshots and browser preview.
 * Only used by preview/shoot.js - never packaged into the widget.
 */

const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.join(' ');
const match = /--cm-scenario=([a-z-]+)/.exec(args);
const scenario = (match && match[1]) || 'playing';
let cover = Buffer.alloc(0);
try {
  cover = fs.readFileSync(path.join(__dirname, 'cover.png'));
} catch (error) {
  cover = Buffer.alloc(0);
}

const TOKEN = 'preview-token-0123456789abcdef0123456789';

window.__CM_XENEON_PREVIEW__ = true;
window.iCUE_initialized = true;
window.iCUE = { isPreview: false, fpsLimit: 60, iCUELanguage: 'de' };
window.layout = 'auto';
window.showLyrics = true;
window.showQueue = true;
window.showSpectrum = true;
window.pairKey = '';
window.textColor = '#f4f7ff';
window.accentColor = '#5b8cff';
window.backgroundColor = '#0b0d12';

if (scenario !== 'connect' && scenario !== 'pairing') {
  try {
    localStorage.setItem('cleanmusic.xeneon.v1', JSON.stringify({ token: TOKEN, at: Date.now() }));
  } catch (error) {
    /* ignore */
  }
} else {
  try {
    localStorage.removeItem('cleanmusic.xeneon.v1');
  } catch (error) {
    /* ignore */
  }
}

function nextTitles() {
  return [
    { title: 'Sterne über Berlin', artist: 'Mira Feld', cover: '/api/cover?v=0123456789abcdef0123' },
    { title: 'Kein Zurück', artist: 'Jonas Hale', cover: '/api/cover?v=0123456789abcdef0123' },
    { title: 'Sommerregen', artist: 'Ella Brandt', cover: '/api/cover?v=0123456789abcdef0123' },
    { title: 'Leise', artist: 'Kai Nord', cover: '/api/cover?v=0123456789abcdef0123' },
  ];
}

function baseState() {
  return {
    appVersion: '2.1.1',
    at: Date.now(),
    capabilities: { seek: false, like: false, spectrum: true },
    track: {
      title: 'Nachtfahrt',
      artist: 'Lena Morgen',
      album: 'Nachleuchten',
      kind: 'preview',
      live: false,
      colors: ['#5b8cff', '#35e0c0'],
      cover: '/api/cover?v=0123456789abcdef0123',
    },
    playing: true,
    position: 96,
    duration: 214,
    volume: 0.72,
    muted: false,
    favorite: null,
    lyricsOn: true,
    lyric: {
      line: 'Wir fahren durch die Nacht',
      next: 'und lassen alles hinter uns',
    },
    upNext: nextTitles(),
  };
}

function stateFor(name) {
  const state = baseState();
  if (name === 'pause') {
    state.playing = false;
    state.position = 84;
  } else if (name === 'radio') {
    state.track = {
      title: 'Nachtfahrt Radio',
      artist: 'Live aus Hamburg',
      album: '',
      kind: 'radio',
      live: true,
      colors: ['#ff7a59', '#ffb347'],
      cover: '',
    };
    state.playing = true;
    state.position = 0;
    state.duration = 0;
    state.lyric = null;
    state.lyricsOn = false;
    state.upNext = [];
  } else if (name === 'idle') {
    state.track = null;
    state.playing = false;
    state.position = 0;
    state.duration = 0;
    state.lyric = null;
    state.lyricsOn = false;
    state.upNext = [];
  }
  return state;
}

function reply(data, status) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

let stateServed = 0;
const realFetch = window.fetch.bind(window);
window.fetch = function (input, init) {
  const url = typeof input === 'string' ? input : input.url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    return realFetch(input, init);
  }
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    return Promise.reject(new TypeError('Failed to fetch'));
  }
  if (parsed.pathname === '/api/cover') {
    if (!cover.length) return Promise.resolve(new Response('', { status: 404 }));
    return Promise.resolve(
      new Response(cover, { status: 200, headers: { 'Content-Type': 'image/png' } })
    );
  }
  if (parsed.pathname === '/api/state') {
    if (scenario === 'connect') return Promise.reject(new TypeError('Failed to fetch'));
    if (scenario === 'offline' && stateServed > 0) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    stateServed += 1;
    return reply(stateFor(scenario));
  }
  if (parsed.pathname === '/api/pair') {
    return reply({ pairId: 'preview-pair', code: '4172', expires: Date.now() + 120000 });
  }
  if (parsed.pathname.indexOf('/api/pair/') === 0) {
    return reply({ status: 'pending' });
  }
  if (parsed.pathname === '/api/cmd') {
    return reply({ ok: true, state: stateFor(scenario) });
  }
  if (parsed.pathname === '/api/events') {
    return reply({ error: 'use-event-source' }, 400);
  }
  return reply({});
};

let offlineStreams = 0;

class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.listeners = {};
    this.onerror = null;
    this.closed = false;
    setTimeout(() => this.start(), 140);
  }

  addEventListener(name, handler) {
    if (!this.listeners[name]) this.listeners[name] = [];
    this.listeners[name].push(handler);
  }

  close() {
    this.closed = true;
    clearInterval(this.spectrumTimer);
  }

  emit(name, data) {
    if (this.closed) return;
    if (name === 'error') {
      if (typeof this.onerror === 'function') this.onerror({});
      return;
    }
    const event = { data: JSON.stringify(data) };
    (this.listeners[name] || []).forEach((handler) => handler(event));
  }

  start() {
    if (scenario === 'connect') {
      this.emit('error');
      return;
    }
    if (scenario === 'offline') {
      offlineStreams += 1;
      if (offlineStreams > 1) {
        // A silent reconnect keeps the last state visible; the widget's
        // offline timer is what the screenshot is meant to show.
        return;
      }
      const state = stateFor('offline');
      state.playing = true;
      this.emit('state', state);
      setTimeout(() => this.emit('error'), 1300);
      return;
    }
    const state = stateFor(scenario);
    this.emit('state', state);
    if (state.playing) {
      this.spectrumTimer = setInterval(() => {
        const values = [];
        for (let i = 0; i < 32; i += 1) {
          values.push(
            Math.max(
              0,
              Math.min(
                255,
                120 + 70 * Math.sin(i * 0.62 + Date.now() / 260) + 40 * Math.sin(i * 1.7)
              )
            )
          );
        }
        this.emit('spectrum', { v: values, level: 0.62, at: Date.now() });
      }, 60);
    }
  }
}

window.EventSource = FakeEventSource;
