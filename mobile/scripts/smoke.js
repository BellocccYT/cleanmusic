'use strict';

/**
 * Headless-Smoke für die Android-Oberfläche (Electron, kein Emulator nötig).
 *
 * Geprüft wird die Web-Schicht, die auch in der APK läuft:
 *   - App startet (Handy): Brücke, Tab-Leiste, lokale Musik, Update-Karte
 *   - Vorschau spielt, Radio spielt
 *   - Hintergrund-Wiedergabe: Dienst erhält Titel, Ton läuft bei verstecktem
 *     Fenster weiter (der echte Android-Dienst wird zusätzlich am Gerät geprüft)
 *   - TV Lite: eigene Oberfläche, app.js/Cutter/Downloads nicht geladen,
 *     Fokus-Navigation erreicht alle Hauptbereiche
 *   - Handy-Steuerseite: 401 ohne Schlüssel, /api/search, /api/queue,
 *     /api/radio, /api/favorites, /api/events
 *
 * Die native Seite (Kotlin) wird durch Attrappen ersetzt; das Protokoll der
 * Steuerseite läuft gegen einen Referenz-Server mit denselben Prüfungen.
 *
 * Start:  npm.cmd run smoke:mobile   (im Repository-Hauptordner)
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const www = path.join(root, 'www');

// Wegwerf-Profil: gleicher Startzustand bei jedem Lauf (localStorage leer).
const profile = path.join(os.tmpdir(), 'cleanmusic-mobile-smoke');
try {
  fs.rmSync(profile, { recursive: true, force: true });
} catch {
  /* noch gesperrt – Electron legt es neu an */
}
app.setPath('userData', profile);

let mediaBase = '';
ipcMain.on('smoke-base', (event) => {
  event.returnValue = mediaBase;
});

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('mute-audio');
app.commandLine.appendSwitch('disable-http-cache');

const failures = [];
let checks = 0;

function ok(name, condition, detail) {
  checks += 1;
  if (condition) {
    console.log(`SMOKE_MOBILE: ${name}`);
  } else {
    failures.push(name);
    console.error(`SMOKE_MOBILE_FAIL: ${name}${detail === undefined ? '' : ` ${JSON.stringify(detail)}`}`);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function wavBuffer(seconds = 2) {
  const rate = 8000;
  const samples = rate * seconds;
  const buffer = Buffer.alloc(44 + samples);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples, 40);
  for (let index = 0; index < samples; index += 1) {
    buffer[44 + index] = 128 + Math.round(20 * Math.sin((index / rate) * 2 * Math.PI * 220));
  }
  return buffer;
}

async function main() {
  if (!fs.existsSync(path.join(www, 'tv.html'))) {
    throw new Error('mobile/www fehlt – zuerst "npm run build:web" ausführen.');
  }

  const media = { wav: wavBuffer(3), radio: wavBuffer(30) };
  const base = await startMediaServer(media);
  mediaBase = base;

  // ---------------------------------------------------------------- //
  // Handy / Tablet
  // ---------------------------------------------------------------- //
  const phone = new BrowserWindow({
    width: 420,
    height: 860,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'smoke-preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
    backgroundColor: '#080a0e',
  });

  await load(phone, path.join(www, 'index.html') + '?device=phone');
  await wait(1800);

  const phoneInfo = await phone.webContents.executeJavaScript(`(() => ({
    device: document.documentElement.dataset.device,
    mobile: document.documentElement.dataset.mobile,
    file: location.pathname.split('/').pop(),
    bridge: Boolean(window.cm && window.cm.isMobile),
    tabbar: Boolean(document.querySelector('#m-tabbar')),
    tabs: Array.from(document.querySelectorAll('.m-tab')).map((tab) => tab.dataset.mView),
    localNav: (() => { const el = document.querySelector('#sidebar .nav-item[data-view="local"]'); return Boolean(el) && getComputedStyle(el).display !== 'none'; })(),
    creatorHidden: (() => { const el = document.querySelector('[data-view="creator"]'); return !el || getComputedStyle(el).display === 'none'; })(),
    serviceGridHidden: (() => { const el = document.querySelector('.services-grid'); return !el || !el.offsetParent; })(),
    deepLinks: Boolean(document.querySelector('#m-open-services')),
    // Since 1.17 the update panel lives in the settings tab 'System'.
    updatePanel: (() => {
      if (window.CleanMusic && typeof window.CleanMusic.openSettings === 'function') window.CleanMusic.openSettings('system');
      const found = Boolean(document.querySelector('#update-panel'));
      if (window.CleanMusic && typeof window.CleanMusic.showView === 'function') window.CleanMusic.showView('home');
      return found;
    })(),
    hasAudio: Boolean(document.querySelector('#audio')),
    updater: Boolean(window.cm && typeof window.cm.updateCheck === 'function')
  }))()`);

  ok('Handy: Weiche lädt app.html', phoneInfo.file === 'app.html', phoneInfo.file);
  ok('Handy: Brücke ist mobile', phoneInfo.bridge && phoneInfo.device === 'phone', phoneInfo);
  ok('Handy: Tab-Leiste mit fünf Bereichen', phoneInfo.tabbar && phoneInfo.tabs.length === 5, phoneInfo.tabs);
  ok('Handy: lokale Musik erreichbar', phoneInfo.localNav, phoneInfo);
  ok('Handy: Cutter ausgeblendet', phoneInfo.creatorHidden, phoneInfo);
  ok('Handy: keine eingebetteten Dienste-Web-Player', phoneInfo.serviceGridHidden, phoneInfo);
  ok('Handy: Deep-Link-Knöpfe im Vollbild', phoneInfo.deepLinks);
  ok('Handy: Update-Panel in den Einstellungen', phoneInfo.updatePanel);
  ok('Handy: Updater-Brücke vorhanden', phoneInfo.updater);

  // 2.0: dieselben Module wie am Desktop (Rezepte, Mixes, Queue, Player).
  const parity = await phone.webContents.executeJavaScript(`(() => ({
    recipes: Boolean(window.CMRecipes) && window.CMRecipes.normalize({}).limit === 30,
    mixes: Boolean(window.CMMixes) && window.CMMixes.DEFS.length === 5,
    queue: Boolean(window.CMQueue && window.CMQueueSlice),
    playback: Boolean(window.CMPlayback) && window.CMPlayback.nextRepeat('off') === 'all',
    entries: Boolean(window.CMEntries),
    taste: Boolean(window.CMTaste),
    stats: Boolean(window.CMStats)
  }))()`);
  ok('Handy: Module für Rezepte, Mixes, Queue und Player geladen', Object.values(parity).every(Boolean), parity);

  const mixes = await phone.webContents.executeJavaScript(`
    (async () => {
      window.CleanMusic.showView('mixes');
      await new Promise((resolve) => setTimeout(resolve, 900));
      const cards = Array.from(document.querySelectorAll('#view-mixes [data-mix-id]'));
      const ids = Array.from(new Set(cards.map((card) => card.dataset.mixId)));
      const result = {
        cards: ids.length,
        ids: ids.join(','),
        view: document.querySelector('#view-mixes').classList.contains('active')
      };
      window.CleanMusic.showView('home');
      return result;
    })()
  `);
  ok('Handy: Mixes-Ansicht mit fünf Karten', mixes.cards === 5 && mixes.view && /daily/.test(mixes.ids), mixes);

  // Vorschau über die Suche
  const search = await phone.webContents.executeJavaScript(`
    (async () => {
      const result = await window.cm.searchCatalog('smoke');
      return { count: result.tracks.length, first: result.tracks[0] ? result.tracks[0].title : '', hasPreview: Boolean(result.tracks[0] && result.tracks[0].preview) };
    })()
  `);
  ok('Katalog: Suche liefert Vorschau', search.count > 0 && search.hasPreview, search);

  // Vorschau über die echte Suche (Suchfeld -> Treffer -> Wiedergabe)
  const preview = await phone.webContents.executeJavaScript(`
    (async () => {
      const input = document.querySelector('#global-search');
      input.value = 'smoke';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const row = document.querySelector('#search-results [data-list="search"]');
      if (!row) return { error: 'kein Suchtreffer', html: document.querySelector('#search-results').textContent.slice(0, 120) };
      row.click();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const audio = document.querySelector('#audio');
      return {
        paused: audio.paused,
        time: audio.currentTime,
        duration: audio.duration,
        title: (document.querySelector('#np-title') || {}).textContent || ''
      };
    })()
  `);
  ok('Vorschau spielt', !preview.error && !preview.paused && preview.time > 0.2, preview);

  // 2.0: Queue und Player-Zustände wie am Desktop (jetzt mit laufendem Titel).
  const repeat = await phone.webContents.executeJavaScript(`(() => {
    const button = document.querySelector('#btn-repeat');
    const before = button.title;
    button.click();
    const after = button.title;
    button.click();
    button.click();
    return { before, after, back: button.title };
  })()`);
  ok(
    'Handy: Wiederholen-Knopf zykelt (aus → alle → Titel → aus)',
    /aus/.test(repeat.before) && /Alle/.test(repeat.after) && repeat.back === repeat.before,
    repeat
  );

  const queueUi = await phone.webContents.executeJavaScript(`
    (async () => {
      const button = document.querySelector('#btn-queue');
      button.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      const panel = document.querySelector('#queue-panel');
      const result = { open: !panel.hidden, rows: panel.querySelectorAll('.queue-row').length };
      button.click();
      return result;
    })()
  `);
  ok('Handy: Warteschlange öffnet mit Titeln', queueUi.open && queueUi.rows >= 1, queueUi);

  // Radio über den Radio-Bereich
  const radio = await phone.webContents.executeJavaScript(`
    (async () => {
      window.CleanMusic.showView('radio');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const card = document.querySelector('#radio-grid .radio-card');
      if (!card) return { error: 'kein Sender', text: document.querySelector('#radio-grid').textContent.slice(0, 120) };
      card.click();
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const audio = document.querySelector('#audio');
      return { paused: audio.paused, time: audio.currentTime, title: (document.querySelector('#np-title') || {}).textContent || '' };
    })()
  `);
  ok('Radio spielt', !radio.error && !radio.paused && radio.time > 0.2 && /Smoke Radio/.test(radio.title), radio);

  // Hintergrund: Dienst-Start + Ton bei verstecktem Fenster
  const bgBefore = await phone.webContents.executeJavaScript(`(() => ({
    started: (window.__SMOKE.background.calls || []).some((call) => call.method === 'start'),
    title: (window.__SMOKE.background.last || {}).title || ''
  }))()`);
  ok('Hintergrund: Dienst erhält den Titel', bgBefore.started && /Smoke/i.test(bgBefore.title), bgBefore);

  const beforeHide = await phone.webContents.executeJavaScript(`document.querySelector('#audio').currentTime`);
  phone.hide();
  await wait(1200);
  const afterHide = await phone.webContents.executeJavaScript(`(() => ({ time: document.querySelector('#audio').currentTime, paused: document.querySelector('#audio').paused }))()`);
  ok('Hintergrund: Ton läuft bei verstecktem Fenster weiter', !afterHide.paused && afterHide.time > beforeHide, { beforeHide, afterHide });
  phone.showInactive();

  // Lokale Musik über die (Attrappen-)Mediathek
  const library = await phone.webContents.executeJavaScript(`
    (async () => {
      const picked = await window.cm.pickFolder();
      return picked ? { folder: picked.folder, files: picked.files.length, url: picked.files[0].url } : null;
    })()
  `);
  ok('Lokale Musik: Mediathek liefert Dateien', Boolean(library && library.files > 0 && library.url), library);

  // Deep Link in die offizielle App
  const intent = await phone.webContents.executeJavaScript(`
    (async () => {
      const okValue = await window.cm.openMusic({ service: 'spotify', title: 'Smoke Preview', artist: 'CleanMusic' });
      return { okValue, calls: window.__SMOKE.music };
    })()
  `);
  ok('Deep Link: offizielle App wird geöffnet', intent.okValue && intent.calls[0] && intent.calls[0].service === 'spotify', intent);

  // Update
  const update = await phone.webContents.executeJavaScript(`
    (async () => {
      const info = await window.cm.updateCheck();
      return { status: info.status, latest: info.latest, asset: info.asset && info.asset.name, kind: info.kind };
    })()
  `);
  ok('Update: neue APK wird erkannt', update.status === 'available' && update.latest === '1.2.0' && update.kind === 'apk', update);

  const ready = await phone.webContents.executeJavaScript(`
    (async () => {
      const downloaded = await window.cm.updateDownload();
      const started = await window.cm.updateInstall();
      return { status: downloaded.status, started, calls: window.__SMOKE.updater };
    })()
  `);
  ok('Update: Download prüft und Installer startet', ready.status === 'ready' && ready.started === true, ready);

  const card = await phone.webContents.executeJavaScript(`(() => {
    const el = document.querySelector('#update-card');
    return { hidden: el.hidden, text: el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 120) };
  })()`);
  ok('Update: Hinweis-Karte sichtbar', !card.hidden && /1\.2\.0/.test(card.text), card);

  // ---------------------------------------------------------------- //
  // TV Lite
  // ---------------------------------------------------------------- //
  const tv = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'smoke-preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
    backgroundColor: '#080a0e',
  });

  await load(tv, path.join(www, 'index.html') + '?device=tv');
  await wait(2500);

  const tvInfo = await tv.webContents.executeJavaScript(`(() => ({
    file: location.pathname.split('/').pop(),
    device: document.documentElement.dataset.device,
    tvApi: Boolean(window.CMTv && window.CMTv.ready),
    appLoaded: typeof window.CleanMusic !== 'undefined',
    scripts: Array.from(document.scripts).map((script) => script.getAttribute('src')),
    cutter: Boolean(document.querySelector('[data-view="creator"], #view-creator, .creator-tabs')),
    downloads: Boolean(document.querySelector('#view-downloads, [data-view="downloads"]')),
    local: Boolean(document.querySelector('#view-local')),
    advanced: Boolean(document.querySelector('[data-layout="advanced"]')),
    qr: Boolean(document.querySelector('#tv-qr img')),
    look: Boolean(document.querySelector('#tv-theme') && document.querySelector('#tv-background') && document.querySelector('#tv-vinyl')),
    remote: window.CMTv ? { enabled: window.CMTv.state.remote.enabled, qr: Boolean(window.CMTv.state.remote.qr), error: window.CMTv.state.remote.error } : null,
    startError: window.__TV_START_ERROR || null,
    plugin: Boolean(window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.RemoteServer),
    cmRemote: Boolean(window.cm && window.cm.tvRemote),
    nav: Array.from(document.querySelectorAll('.tv-nav-item')).map((item) => item.dataset.tvView),
    minFont: (() => {
      const style = getComputedStyle(document.body);
      return parseFloat(style.fontSize);
    })()
  }))()`);

  ok('TV: Weiche lädt tv.html', tvInfo.file === 'tv.html', tvInfo.file);
  ok('TV: eigene Lite-Oberfläche', tvInfo.device === 'tv' && tvInfo.tvApi, tvInfo);
  ok('TV: app.js nicht geladen', !tvInfo.appLoaded && !tvInfo.scripts.some((src) => /app\\.js/.test(src || '')), tvInfo.scripts);
  ok('TV: kein Cutter, keine Downloads, keine lokale Musik', !tvInfo.cutter && !tvInfo.downloads && !tvInfo.local, tvInfo);
  ok('TV: alle Hauptbereiche vorhanden', tvInfo.nav.join(',') === 'home,mixes,radio,charts,favorites,party,queue', tvInfo.nav);
  ok('TV: Schrift mindestens 24 px', tvInfo.minFont >= 24, tvInfo.minFont);
  ok('TV: QR-Code für die Steuerung sichtbar', tvInfo.qr, tvInfo);
  ok('TV: Theme, Hintergrund, Plattenspieler erreichbar', tvInfo.look, tvInfo);

  const focus = await tv.webContents.executeJavaScript(`
    (async () => {
      const tv = window.CMTv;
      tv.showView('charts');
      await new Promise((resolve) => setTimeout(resolve, 600));
      const first = tv.focus();
      const count = tv.focusables();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      const second = tv.focus();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      const third = tv.focus();
      const views = [];
      for (const name of ['home', 'mixes', 'radio', 'charts', 'favorites', 'party', 'queue']) {
        tv.showView(name);
        views.push(Boolean(document.querySelector('[data-tv-panel="' + name + '"].is-active')));
      }
      tv.showView('home');
      return { count, first, second, third, moved: JSON.stringify(first) !== JSON.stringify(second), views };
    })()
  `);
  ok('TV: Fokus-Navigation erreicht Karten', focus.count > 3 && focus.moved, focus);
  ok('TV: alle sechs Bereiche erreichbar', focus.views.every(Boolean), focus.views);

  const stage = await tv.webContents.executeJavaScript(`
    (async () => {
      window.CMTv.showView('party');
      await new Promise((resolve) => setTimeout(resolve, 900));
      const viz = document.querySelector('#tv-viz');
      const result = {
        w: viz.width,
        h: viz.height,
        homeRing: Boolean(document.querySelector('#tv-home-viz')),
        openButton: Boolean(document.querySelector('#tv-stage-open')),
        cover: document.querySelector('#tv-party-cover').getBoundingClientRect().width,
        vinyl: document.querySelector('#tv').classList.contains('is-vinyl'),
      };
      window.CMTv.showView('home');
      await new Promise((resolve) => setTimeout(resolve, 300));
      return result;
    })()
  `);
  ok('TV: große Spektrum-Bühne mit Plattenspieler', stage.w > 200 && stage.h > 200 && stage.homeRing && stage.openButton && stage.cover > 100 && stage.vinyl, stage);

  const tvPreview = await tv.webContents.executeJavaScript(`
    (async () => {
      const tv = window.CMTv;
      const track = tv.state.charts.tracks[0];
      tv.playEntry(tv.previewEntry(track), { reset: true });
      await new Promise((resolve) => setTimeout(resolve, 600));
      const audio = document.querySelector('#audio');
      return { title: document.querySelector('#tv-title').textContent, paused: audio.paused, time: audio.currentTime, queue: tv.state.queue.length };
    })()
  `);
  ok('TV: Vorschau spielt', !tvPreview.paused && tvPreview.time > 0.2 && tvPreview.queue === 1, tvPreview);

  const tvRadio = await tv.webContents.executeJavaScript(`
    (async () => {
      const tv = window.CMTv;
      tv.showView('radio');
      await new Promise((resolve) => setTimeout(resolve, 500));
      const result = await window.cm.radioStations({ tag: 'pop' });
      const station = result.stations[0];
      tv.playEntry(tv.stationEntry(station), { reset: true });
      await new Promise((resolve) => setTimeout(resolve, 700));
      return { stations: result.stations.length, title: tv.state.queue[0].title, paused: document.querySelector('#audio').paused };
    })()
  `);
  ok('TV: Radio spielt', tvRadio.stations > 0 && !tvRadio.paused, tvRadio);

  // 2.0: Mixes auf dem Fernseher (Favoriten + Playlists + Charts, gleiche Regeln).
  const tvMixes = await tv.webContents.executeJavaScript(`
    (async () => {
      const tv = window.CMTv;
      tv.showView('mixes');
      await new Promise((resolve) => setTimeout(resolve, 900));
      const cards = Array.from(document.querySelectorAll('#tv-mixes-grid [data-mix]'));
      const before = tv.state.queue.length;
      const first = cards[0];
      if (first) first.click();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return {
        cards: cards.length,
        ids: cards.map((card) => card.dataset.mix).join(','),
        view: tv.state.view,
        queue: tv.state.queue.length,
        before,
        paused: document.querySelector('#audio').paused,
        engine: Boolean(window.CMMixes && window.CMMixes.DEFS.length === 5)
      };
    })()
  `);
  ok(
    'TV: Mixes-Ansicht mit fünf Karten und Start',
    tvMixes.cards === 5 && tvMixes.view === 'mixes' && tvMixes.engine && /daily/.test(tvMixes.ids) && tvMixes.queue >= 1 && !tvMixes.paused,
    tvMixes
  );

  const tvUpdate = await tv.webContents.executeJavaScript(`
    (async () => {
      const info = await window.cm.updateCheck();
      await new Promise((resolve) => setTimeout(resolve, 600));
      const box = document.querySelector('#tv-confirm');
      const result = {
        status: info.status,
        latest: info.latest,
        error: info.error,
        asset: Boolean(info.asset),
        dismissed: localStorage.getItem('cleanmusic.tvupdate.v1') || '',
        updateError: window.__TV_UPDATE_ERROR || null,
        open: !box.hidden,
        title: document.querySelector('#tv-confirm-title').textContent,
        yes: document.querySelector('#tv-confirm-yes').textContent,
        no: document.querySelector('#tv-confirm-no').textContent
      };
      if (!box.hidden) document.querySelector('#tv-confirm-no').click();
      return result;
    })()
  `);
  ok('TV: Update-Hinweis per Fernbedienung', tvUpdate.open && /Update 1\.2\.0/.test(tvUpdate.title) && /Updaten/.test(tvUpdate.yes), tvUpdate);

  // ---------------------------------------------------------------- //
  // Handy-Steuerung (Referenz-Server mit denselben Prüfungen)
  // ---------------------------------------------------------------- //
  const remote = await startReferenceServer(tv);
  const noKey = await remote.fetch('/api/state');
  const wrongKey = await remote.fetch('/api/state', { headers: { 'X-CM-Key': 'nope' } });
  const state = await remote.fetch('/api/state', { headers: { 'X-CM-Key': remote.key } });
  const stateJson = await state.json();
  const page = await remote.fetch(`/?k=${encodeURIComponent(remote.key)}`);
  const pageHtml = await page.text();

  ok('Steuerseite: ohne Schlüssel 401', noKey.status === 401, noKey.status);
  ok('Steuerseite: falscher Schlüssel 401', wrongKey.status === 401, wrongKey.status);
  ok('Steuerseite: mit Schlüssel 200', state.status === 200 && Boolean(stateJson), state.status);
  ok('Steuerseite: gleiche Seite wie am Desktop', page.status === 200 && /CleanMusic · Fernbedienung/.test(pageHtml));
  ok('Steuerseite: Radio- und Favoriten-Bereich', /id="radio"/.test(pageHtml) && /id="favorites"/.test(pageHtml));

  const searchApi = await remote.fetch('/api/search?q=smoke-remote', { headers: { 'X-CM-Key': remote.key } });
  const searchJson = await searchApi.json();
  ok('Steuerseite: /api/search funktioniert', searchApi.status === 200 && searchJson.tracks.length > 0, searchJson);

  const queueApi = await remote.fetch('/api/queue', {
    method: 'POST',
    headers: { 'X-CM-Key': remote.key, 'content-type': 'application/json' },
    body: JSON.stringify({ id: searchJson.tracks[0].id, position: 'next' }),
  });
  const queueJson = await queueApi.json();
  const queueAfter = await tv.webContents.executeJavaScript('window.CMTv.state.queue.length');
  ok('Steuerseite: /api/queue funktioniert', queueApi.status === 200 && queueJson.ok && queueAfter >= 2, { queueJson, queueAfter });

  const radioApi = await remote.fetch('/api/radio?tag=pop', { headers: { 'X-CM-Key': remote.key } });
  const radioJson = await radioApi.json();
  const radioPlay = radioApi.status === 200 && radioJson.stations.length
    ? await remote.fetch('/api/radio', {
        method: 'POST',
        headers: { 'X-CM-Key': remote.key, 'content-type': 'application/json' },
        body: JSON.stringify({ id: radioJson.stations[0].id }),
      })
    : null;
  ok('Steuerseite: /api/radio funktioniert', radioApi.status === 200 && radioJson.stations.length > 0 && radioPlay && radioPlay.status === 200, radioJson);

  await tv.webContents.executeJavaScript(`window.CMTv.toggleFavorite({
    id: 'radio:smoke-radio',
    kind: 'radio',
    source: 'radio',
    sourceLabel: 'Radio',
    title: 'Smoke Radio',
    artist: 'DE · test',
    url: ${JSON.stringify(mediaBase + '/radio.wav')}
  })`);
  const favoritesApi = await remote.fetch('/api/favorites', { headers: { 'X-CM-Key': remote.key } });
  const favoritesJson = await favoritesApi.json();
  const favoritePlay = favoritesJson.favorites.length
    ? await remote.fetch('/api/favorites', {
        method: 'POST',
        headers: { 'X-CM-Key': remote.key, 'content-type': 'application/json' },
        body: JSON.stringify({ id: favoritesJson.favorites[0].id }),
      })
    : null;
  ok('Steuerseite: /api/favorites funktioniert', favoritesApi.status === 200 && Array.isArray(favoritesJson.favorites) && (!favoritesJson.favorites.length || (favoritePlay && favoritePlay.status === 200)), favoritesJson);

  // Koppeln: Desktop schickt Favoriten/Playlists, TV bestätigt einmal.
  const pairRequest = remote.fetch('/api/pair', {
    method: 'POST',
    headers: { 'X-CM-Key': remote.key, 'content-type': 'application/json' },
    body: JSON.stringify({
      favorites: [
        { id: 'deezer:9001', kind: 'preview', source: 'deezer', sourceLabel: 'Deezer', title: 'Paired Song', artist: 'CleanMusic', preview: 'https://example.invalid/p.wav' },
      ],
      playlists: [{ id: 'pair-test', name: 'Vom Desktop', items: [] }],
    }),
  });
  await wait(900);
  const pairUi = await tv.webContents.executeJavaScript(`(() => ({
    open: !document.querySelector('#tv-confirm').hidden,
    title: document.querySelector('#tv-confirm-title').textContent,
    text: document.querySelector('#tv-confirm-text').textContent
  }))()`);
  await tv.webContents.executeJavaScript(`document.querySelector('#tv-confirm-yes').click()`);
  const pairResponse = await pairRequest;
  const pairJson = await pairResponse.json();
  const paired = await tv.webContents.executeJavaScript(`(() => ({
    favorite: window.CMTv.state.collection.favorites.some((entry) => entry.id === 'deezer:9001'),
    playlist: window.CMTv.state.collection.playlists.some((list) => list.id === 'pair-test')
  }))()`);
  ok('Steuerseite: Koppeln erst nach Bestätigung', pairUi.open && /Koppeln/.test(pairUi.title) && pairResponse.status === 200 && pairJson.ok && paired.favorite && paired.playlist, { pairUi, pairJson, paired });

  const sse = await remote.events();
  ok('Steuerseite: /api/events liefert Zustand', sse.includes('event: state') && sse.includes('"playing"'), sse.slice(0, 120));

  const phoneRemote = new BrowserWindow({
    width: 420,
    height: 800,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  await phoneRemote.loadURL(`http://127.0.0.1:${remote.port}/?k=${encodeURIComponent(remote.key)}`);
  await wait(1500);
  const remoteUi = await phoneRemote.webContents.executeJavaScript(`(() => ({
    title: document.querySelector('#title').textContent,
    status: document.querySelector('#status').textContent,
    radioRows: document.querySelectorAll('#radio .rowline').length,
    favoriteRows: document.querySelectorAll('#favorites .rowline').length
  }))()`);
  ok('Steuerseite im Browser: verbunden', /Verbunden/.test(remoteUi.status) && remoteUi.radioRows > 0, remoteUi);

  await remote.close();
  phoneRemote.destroy();

  // ---------------------------------------------------------------- //
  console.log(`SMOKE_MOBILE_SUMMARY: ${checks} checks, ${failures.length} failures`);
  if (failures.length) {
    console.error(`SMOKE_MOBILE_FAILURES: ${failures.join(' | ')}`);
    app.exit(1);
    return;
  }
  console.log('SMOKE_MOBILE_OK');
  app.exit(0);
}

function load(window, file) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Laden dauert zu lange: ${file}`)), 20000);
    window.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      resolve();
    });
    window.loadFile(file.replace(/\?.*$/, ''), { query: { device: file.includes('device=tv') ? 'tv' : 'phone' } });
  });
}

/* ------------------------------------------------------------------ *
 * Medien-Server (Vorschau + Radio) mit Range-Unterstützung
 * ------------------------------------------------------------------ */

function startMediaServer(media) {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, 'http://127.0.0.1');
      const body = url.pathname === '/radio.wav' ? media.radio : url.pathname === '/preview.wav' ? media.wav : null;
      if (!body) {
        response.writeHead(404).end();
        return;
      }
      const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range || '');
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Number(range[2]) : body.length - 1;
        response.writeHead(206, {
          'content-type': 'audio/wav',
          'accept-ranges': 'bytes',
          'content-range': `bytes ${start}-${end}/${body.length}`,
          'content-length': end - start + 1,
        });
        response.end(body.subarray(start, end + 1));
        return;
      }
      response.writeHead(200, {
        'content-type': 'audio/wav',
        'accept-ranges': 'bytes',
        'content-length': body.length,
        'cache-control': 'no-store',
      });
      response.end(body);
    });
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
}

/* ------------------------------------------------------------------ *
 * Referenz-Server der Steuerseite (gleiche Prüfungen wie RemoteHttpServer)
 * ------------------------------------------------------------------ */

async function startReferenceServer(tv) {
  const key = crypto.randomBytes(24).toString('base64url');
  const rate = new Map();
  const stateQuery = async () => {
    try {
      return await tv.webContents.executeJavaScript('window.__SMOKE.remoteState()');
    } catch {
      return { playing: false };
    }
  };

  const ask = async (request) => {
    const payload = JSON.stringify(request);
    return tv.webContents.executeJavaScript(`window.__SMOKE.ask(${payload})`);
  };

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const remoteIp = request.socket.remoteAddress || '';
    if (!/^(127\.|::1|192\.168\.|10\.)/.test(remoteIp.replace('::ffff:', ''))) {
      response.writeHead(403).end();
      return;
    }
    const host = String(request.headers.host || '');
    if (!new RegExp(`^127\\.0\\.0\\.1:${server.address().port}$`).test(host)) {
      response.writeHead(403).end();
      return;
    }
    const now = Date.now();
    const entry = rate.get(remoteIp) || { at: now, count: 0 };
    if (now - entry.at > 1000) {
      entry.at = now;
      entry.count = 0;
    }
    entry.count += 1;
    rate.set(remoteIp, entry);
    if (entry.count > 20) {
      response.writeHead(429).end();
      return;
    }
    const supplied = String(request.headers['x-cm-key'] || url.searchParams.get('k') || '');
    const a = Buffer.from(key);
    const b = Buffer.from(supplied);
    if (!supplied || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      response.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"unauthorized"}');
      return;
    }

    if (request.method === 'GET' && url.pathname === '/') {
      const html = fs.readFileSync(path.join(www, 'remote', 'index.html'), 'utf8');
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data:; connect-src 'self'" });
      response.end(html);
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/state') {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(await stateQuery()));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/api/events') {
      response.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      });
      response.write(`event: state\ndata: ${JSON.stringify(await stateQuery())}\n\n`);
      const timer = setInterval(async () => {
        try {
          response.write(`event: state\ndata: ${JSON.stringify(await stateQuery())}\n\n`);
        } catch {
          clearInterval(timer);
        }
      }, 1500);
      request.on('close', () => clearInterval(timer));
      return;
    }

    let body = '';
    if (request.method === 'POST') {
      body = await new Promise((resolve) => {
        let data = '';
        request.on('data', (chunk) => {
          data += chunk;
          if (data.length > 8192) request.destroy();
        });
        request.on('end', () => resolve(data));
      });
    }

    const kind =
      url.pathname === '/api/search' ? 'search'
        : url.pathname === '/api/cmd' ? 'cmd'
          : url.pathname === '/api/queue' ? 'queue'
            : url.pathname === '/api/radio' ? (request.method === 'POST' ? 'radio-play' : 'radio-list')
              : url.pathname === '/api/favorites' ? (request.method === 'POST' ? 'favorite-play' : 'favorites-list')
                : url.pathname === '/api/pair' ? 'pair'
                  : null;
    if (!kind) {
      response.writeHead(404).end();
      return;
    }

    let parsed = {};
    try {
      parsed = body ? JSON.parse(body) : {};
    } catch {
      response.writeHead(400).end();
      return;
    }

    const answer = await ask({
      id: 's' + Math.random().toString(36).slice(2),
      kind,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body: parsed,
      device: 'Handy 1',
    });
    response.writeHead(answer.status || 200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(answer.data === undefined ? {} : answer.data));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const fetchFn = (target, options = {}) => {
    return new Promise((resolve, reject) => {
      const request = http.request(
        { host: '127.0.0.1', port, path: target, method: options.method || 'GET', headers: options.headers || {} },
        (response) => {
          let data = '';
          response.on('data', (chunk) => { data += chunk; });
          response.on('end', () => {
            resolve({
              status: response.statusCode,
              headers: { get: (name) => response.headers[String(name).toLowerCase()] },
              json: async () => JSON.parse(data),
              text: async () => data,
            });
          });
        }
      );
      request.on('error', reject);
      if (options.body) request.write(options.body);
      request.end();
    });
  };

  return {
    port,
    key,
    fetch: fetchFn,
    events: () => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('kein SSE-Ereignis')), 4000);
      const request = http.request(
        { host: '127.0.0.1', port, path: '/api/events', headers: { 'X-CM-Key': key } },
        (response) => {
          let data = '';
          response.on('data', (chunk) => {
            data += chunk;
            if (data.includes('event: state')) {
              clearTimeout(timer);
              request.destroy();
              resolve(data);
            }
          });
        }
      );
      request.on('error', reject);
      request.end();
    }),
    close: () => new Promise((resolve) => {
      try {
        server.closeAllConnections();
      } catch {
        /* ältere Node-Version */
      }
      server.close(() => resolve());
      setTimeout(resolve, 1000);
    }),
  };
}

app.whenReady().then(() => {
  ipcMain.on('smoke-log', (_event, message) => console.log(`SMOKE_MOBILE_LOG: ${message}`));
  main().catch((error) => {
    console.error(`SMOKE_MOBILE_FAIL: ${error && error.stack ? error.stack : error}`);
    app.exit(1);
  });
});

process.on('uncaughtException', (error) => {
  console.error(`SMOKE_MOBILE_FAIL: ${error && error.stack ? error.stack : error}`);
  app.exit(1);
});
