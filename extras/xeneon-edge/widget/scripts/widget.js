/*
 * CleanMusic widget for the CORSAIR XENEON EDGE - UI and connection.
 *
 * Speaks only to http://localhost:4790 (the CleanMusic plugin). Pairing uses a
 * 4-digit code in CleanMusic; the token is kept in localStorage for this
 * widget only and is never sent anywhere except that local address.
 *
 * Inoffiziell - nicht von CORSAIR.
 */
(function () {
  'use strict';

  var $ = function (id) {
    return document.getElementById(id);
  };
  var L = window.CMLogic;
  if (!L) return;

  var SERVER = 'http://localhost:4790';
  var STORE_KEY = 'cleanmusic.xeneon.v1';
  var DIM_AFTER = 10 * 60 * 1000;

  var root = document.documentElement;
  var app = $('app');
  var dom = {
    overlay: $('overlay'),
    cardConnect: $('cardConnect'),
    cardPair: $('cardPair'),
    cardIdle: $('cardIdle'),
    connectNote: $('connectNote'),
    btnConnect: $('btnConnect'),
    pairCode: $('pairCode'),
    pairNote: $('pairNote'),
    btnPairCancel: $('btnPairCancel'),
    btnResume: $('btnResume'),
    art: $('art'),
    artImg: $('artImg'),
    artFallback: $('artFallback'),
    artLetter: $('artLetter'),
    artHeart: $('artHeart'),
    volumeFlash: $('volumeFlash'),
    volumeFlashValue: $('volumeFlashValue'),
    volumeFlashFill: $('volumeFlashFill'),
    title: $('title'),
    artist: $('artist'),
    kind: $('kindLabel'),
    livePill: $('livePill'),
    offlineDot: $('offlineDot'),
    lyrics: $('lyrics'),
    lyricLine: $('lyricLine'),
    lyricNext: $('lyricNext'),
    progress: $('progress'),
    progressTrack: $('progressTrack'),
    progressFill: $('progressFill'),
    progressKnob: $('progressKnob'),
    progressBubble: $('progressBubble'),
    timeNow: $('timeNow'),
    timeTotal: $('timeTotal'),
    liveNote: $('liveNote'),
    btnPrev: $('btnPrev'),
    btnPlay: $('btnPlay'),
    btnNext: $('btnNext'),
    btnLike: $('btnLike'),
    btnMute: $('btnMute'),
    vbar: $('vbar'),
    vfill: $('vfill'),
    btnQueue: $('btnQueue'),
    queue: $('queue'),
    queueList: $('queueList'),
    spectrum: $('spectrum'),
    toast: $('toast'),
  };

  var st = {
    started: false,
    token: '',
    tokenFromKey: false,
    view: 'boot',
    data: null,
    layout: 'compact',
    layoutPref: 'auto',
    skin: { text: '#f4f7ff', accent: '#5b8cff', bg: '#0b0d12', custom: false },
    accentCss: '#5b8cff',
    showLyrics: true,
    showQueue: true,
    showSpectrum: true,
    pairKey: '',
    pair: null,
    pairing: false,
    stream: null,
    pollTimer: 0,
    reconnectTimer: 0,
    offlineTimer: 0,
    retryMs: 1000,
    offline: false,
    lastSeen: 0,
    lastStateAt: 0,
    coverSrc: '',
    coverSeq: 0,
    queueKey: '',
    pending: null,
    pendingTimer: 0,
    lastTap: 0,
    tapTimer: 0,
    pausedSince: 0,
    dimmed: false,
    suppressUntil: 0,
    seekDrag: null,
    volumeDrag: null,
    artDrag: null,
    spectrumData: [],
    spectrumSmooth: [],
    lastSpectrumFrame: 0,
    toastTimer: 0,
    tickTimer: 0,
    reduceMotion: false,
    preview: Boolean(window.__CM_XENEON_PREVIEW__),
  };

  /* ---------------------------------------------------------------- *
   * iCUE properties
   * ---------------------------------------------------------------- */

  function getProperty(name) {
    if (typeof window !== 'undefined' && Object.prototype.hasOwnProperty.call(window, name)) {
      var value = window[name];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    try {
      var local = Function(
        'return typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined'
      )();
      if (local !== undefined && local !== null && local !== '') return local;
    } catch (error) {
      /* browser preview without iCUE */
    }
    return undefined;
  }

  function hexOr(value, fallback) {
    var match = /^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.exec(String(value || '').trim());
    return match ? String(value).trim().toLowerCase() : fallback;
  }

  function applyProperties() {
    var text = hexOr(getProperty('textColor'), '#f4f7ff');
    var accent = hexOr(getProperty('accentColor'), '#5b8cff');
    var background = hexOr(getProperty('backgroundColor'), '#0b0d12');
    st.skin = {
      text: text,
      accent: accent,
      bg: background,
      custom:
        text !== '#f4f7ff' || accent !== '#5b8cff' || background !== '#0b0d12',
    };
    st.showLyrics = getProperty('showLyrics') !== false;
    st.showQueue = getProperty('showQueue') !== false;
    st.showSpectrum = getProperty('showSpectrum') !== false;
    var pref = String(getProperty('layout') || 'auto');
    st.layoutPref = ['auto', 'compact', 'large'].indexOf(pref) >= 0 ? pref : 'auto';
    st.pairKey = String(getProperty('pairKey') || '')
      .trim()
      .slice(0, 200);
    paintSkin();
  }

  function paintSkin() {
    var colors = st.data && st.data.track ? st.data.track.colors : [];
    var stops = L.backgroundStops(colors, st.skin.custom ? st.skin.bg : null, st.skin.accent);
    var accent = st.skin.custom ? st.skin.accent : stops.accent;
    accent = L.ensureContrast(accent, stops.to, 4.5);
    st.accentCss = accent;
    root.style.setProperty('--accent', accent);
    root.style.setProperty('--on-accent', L.ensureContrast('#080b12', accent, 4.5));
    root.style.setProperty('--bg1', stops.from);
    root.style.setProperty('--bg2', stops.to);
    root.style.setProperty('--text', L.ensureContrast(st.skin.text, stops.to, 4.5));
  }

  /* ---------------------------------------------------------------- *
   * Storage (token only; never sent anywhere but localhost)
   * ---------------------------------------------------------------- */

  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      var data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : {};
    } catch (error) {
      return {};
    }
  }

  function writeStore(token) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ token: token, at: Date.now() }));
    } catch (error) {
      /* iCUE storage blocked - pairing has to be repeated next time */
    }
  }

  function clearStore() {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch (error) {
      /* ignore */
    }
  }

  /* ---------------------------------------------------------------- *
   * Network
   * ---------------------------------------------------------------- */

  function tokenHeaders() {
    return st.token ? { 'X-CM-Token': st.token } : {};
  }

  function api(path, options) {
    var opts = options || {};
    var headers = Object.assign({}, opts.headers || {}, tokenHeaders());
    var body = opts.body;
    if (body && typeof body !== 'string') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, opts.timeout || 4500) : null;
    return fetch(SERVER + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: body,
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        if (timer) clearTimeout(timer);
        return response
          .json()
          .catch(function () { return null; })
          .then(function (data) {
            if (response.status === 401 && !opts.quiet401) handleUnauthorized();
            return { status: response.status, ok: response.ok, data: data };
          });
      })
      .catch(function (error) {
        if (timer) clearTimeout(timer);
        throw error;
      });
  }

  function handleUnauthorized() {
    st.token = '';
    st.tokenFromKey = false;
    clearStore();
    closeStream();
    stopPolling();
    showConnect('Der Schlüssel gilt nicht mehr – bitte neu verbinden.');
  }

  function start() {
    if (st.started) return;
    st.started = true;
    st.reduceMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var store = readStore();
    st.token = st.pairKey || store.token || '';
    st.tokenFromKey = Boolean(st.pairKey && !store.token);
    if (st.token) openStream();
    else showConnect();
    setInterval(probe, 3000);
    setInterval(dimCheck, 15000);
    st.tickTimer = setInterval(tick, 250);
    startSpectrum();
  }

  function probe() {
    if (st.view !== 'connect') return;
    api('/api/state', { timeout: 2500, quiet401: true })
      .then(function (result) {
        if (result.status === 401) {
          setConnectNote('CleanMusic gefunden – jetzt „Verbinden“ antippen.');
        } else if (result.ok) {
          setConnectNote('CleanMusic gefunden.');
        } else {
          setConnectNote('CleanMusic gefunden, antwortet aber nicht.');
        }
      })
      .catch(function () {
        setConnectNote('CleanMusic ist noch nicht erreichbar.');
      });
  }

  function openStream() {
    closeStream();
    clearTimeout(st.offlineTimer);
    st.offlineTimer = 0;
    if (!st.token) return showConnect();
    if (st.view !== 'pair' && !st.data) st.view = 'boot';
    var url =
      SERVER +
      '/api/events?k=' +
      encodeURIComponent(st.token) +
      '&spectrum=' +
      (st.showSpectrum ? '1' : '0');
    var stream;
    try {
      stream = new EventSource(url);
    } catch (error) {
      startPolling();
      return;
    }
    st.stream = stream;
    var opened = false;

    stream.addEventListener('state', function (event) {
      opened = true;
      st.retryMs = 1000;
      st.lastSeen = Date.now();
      st.offline = false;
      try {
        receive(JSON.parse(event.data));
      } catch (error) {
        /* ignore a broken frame */
      }
    });

    stream.addEventListener('spectrum', function (event) {
      st.lastSeen = Date.now();
      try {
        var data = JSON.parse(event.data);
        if (Array.isArray(data.v)) {
          st.spectrumData = data.v.slice(0, 32).map(function (value) {
            return Math.max(0, Math.min(255, Number(value) || 0));
          });
        }
      } catch (error) {
        /* ignore */
      }
    });

    stream.addEventListener('ping', function () {
      st.lastSeen = Date.now();
      if (st.offline) {
        st.offline = false;
        render();
      }
    });

    stream.onerror = function () {
      if (stream) stream.close();
      st.stream = null;
      if (!opened) {
        // EventSource is not usable here (unknown in iCUE) - poll instead.
        startPolling();
        return;
      }
      markOfflineSoon(1200);
      st.retryMs = Math.min(10000, Math.max(1000, st.retryMs * 2));
      clearTimeout(st.reconnectTimer);
      st.reconnectTimer = setTimeout(function () {
        if (st.view !== 'connect' && st.view !== 'pair' && st.token) openStream();
      }, st.retryMs);
    };
  }

  function closeStream() {
    clearTimeout(st.reconnectTimer);
    st.reconnectTimer = 0;
    clearTimeout(st.offlineTimer);
    st.offlineTimer = 0;
    if (st.stream) {
      try {
        st.stream.close();
      } catch (error) {
        /* ignore */
      }
    }
    st.stream = null;
  }

  function startPolling() {
    if (st.pollTimer) return;
    pollOnce();
    st.pollTimer = setInterval(pollOnce, 1000);
  }

  function stopPolling() {
    clearInterval(st.pollTimer);
    st.pollTimer = 0;
  }

  function pollOnce() {
    api('/api/state', { timeout: 3000 })
      .then(function (result) {
        if (result.status === 401) return;
        if (!result.ok || !result.data) throw new Error('http');
        receive(result.data);
      })
      .catch(function () {
        markOfflineSoon(4000);
        if (!st.data && st.view !== 'connect') {
          st.view = 'connect';
          setConnectNote('CleanMusic ist nicht erreichbar – ich versuche es weiter.');
          render();
        }
      });
  }

  function markOfflineSoon(delay) {
    if (st.offlineTimer) return;
    st.offlineTimer = setTimeout(function () {
      st.offlineTimer = 0;
      if (Date.now() - st.lastSeen < delay) return;
      if (!st.offline) {
        st.offline = true;
        render();
      }
    }, delay);
  }

  function send(command, value) {
    if (st.view !== 'ready' || st.offline || !st.data) {
      hint('Nicht verbunden – bitte kurz warten.');
      return;
    }
    if (Date.now() < st.suppressUntil) return;
    var previous = st.data;
    applyOptimistic(command, value);
    var marker = { at: Date.now(), previous: previous };
    st.pending = marker;
    clearTimeout(st.pendingTimer);
    st.pendingTimer = setTimeout(function () {
      if (st.pending !== marker) return;
      st.pending = null;
      st.data = previous;
      render();
      hint('Keine Antwort – bitte noch einmal tippen.');
    }, 1500);

    var body = { command: command };
    if (value !== undefined) body.value = value;
    api('/api/cmd', { method: 'POST', body: body, timeout: 4000 })
      .then(function (result) {
        if (st.pending !== marker) return;
        clearTimeout(st.pendingTimer);
        st.pending = null;
        if (!result.ok) {
          st.data = previous;
          render();
          if (result.status === 501) hint('Diese Funktion ist in CleanMusic noch nicht freigeschaltet.');
          else hint('Das hat nicht geklappt – bitte noch einmal tippen.');
          return;
        }
        if (result.data && result.data.state) receive(result.data.state);
        else render();
      })
      .catch(function () {
        if (st.pending !== marker) return;
        clearTimeout(st.pendingTimer);
        st.pending = null;
        st.data = previous;
        render();
        hint('Keine Verbindung zu CleanMusic.');
      });
  }

  function applyOptimistic(command, value) {
    if (!st.data) return;
    var data = st.data;
    if (command === 'toggle') data.playing = !data.playing;
    else if (command === 'play') data.playing = true;
    else if (command === 'pause') data.playing = false;
    else if (command === 'volume') {
      data.volume = L.clampVolume(value);
      if (data.volume > 0) data.muted = false;
    } else if (command === 'mute') {
      data.muted = value === undefined ? !data.muted : Boolean(value);
    } else if (command === 'seek') {
      data.position = Math.max(0, Math.min(Number(value) || 0, data.duration || 0));
      data.at = Date.now();
    } else if (command === 'like' && data.favorite !== null) {
      data.favorite = !data.favorite;
    }
    render();
  }

  function receive(raw) {
    var next = L.sanitizeState(raw);
    st.data = next;
    st.lastSeen = Date.now();
    st.lastStateAt = st.lastStateAt || Date.now();
    st.offline = false;
    clearTimeout(st.offlineTimer);
    st.offlineTimer = 0;
    st.view = next.track ? 'ready' : 'idle';
    resetPending();
    render();
  }

  function resetPending() {
    if (!st.pending) return;
    clearTimeout(st.pendingTimer);
    st.pending = null;
  }

  /* ---------------------------------------------------------------- *
   * Rendering
   * ---------------------------------------------------------------- */

  function render() {
    app.setAttribute('data-view', st.view);
    app.setAttribute('data-offline', st.offline ? 'true' : 'false');
    app.setAttribute('data-seek', st.data && st.data.capabilities.seek ? 'true' : 'false');
    app.setAttribute('data-muted', st.data && st.data.muted ? 'true' : 'false');
    app.setAttribute('data-playing', st.data && st.data.playing ? 'true' : 'false');
    dom.offlineDot.hidden = !st.offline;
    paintSkin();
    renderOverlay();
    renderTrack();
    renderControls();
    renderProgress();
    renderQueue();
    tick();
  }

  function renderOverlay() {
    var show = st.view === 'connect' || st.view === 'pair' || st.view === 'idle';
    dom.overlay.hidden = !show;
    dom.cardConnect.hidden = st.view !== 'connect';
    dom.cardPair.hidden = st.view !== 'pair';
    dom.cardIdle.hidden = st.view !== 'idle';
    if (st.view === 'pair' && st.pair) {
      dom.pairCode.textContent = st.pair.code || '0000';
    }
  }

  function renderTrack() {
    var track = st.data && st.data.track;
    if (!track) {
      dom.title.textContent = 'CleanMusic';
      dom.artist.textContent = 'Bereit für deine Musik';
      dom.kind.textContent = '';
      dom.livePill.hidden = true;
      dom.artLetter.textContent = '♪';
      setCover('');
      dom.lyrics.hidden = true;
      return;
    }
    dom.title.textContent = track.title || 'Unbekannter Titel';
    dom.artist.textContent = track.artist || '';
    dom.artLetter.textContent = L.letterFor(track.title);
    dom.livePill.hidden = !track.live;
    var label = '';
    if (!track.live) {
      var kinds = { preview: 'Vorschau', local: 'Lokal', plugin: 'Plugin', ncs: 'NCS', radio: '' };
      label = track.album || kinds[track.kind] || '';
    }
    dom.kind.textContent = label;
    setCover(track.cover || '');
    renderLyrics();
  }

  /*
   * Covers come from the bridge as /api/cover?v=... . Load them with the token
   * header into a blob so the token never has to sit in an image URL; if blob
   * URLs are blocked, fall back to the query token (needed by <img>).
   */
  function loadImage(image, path, sequence) {
    var base = SERVER + path;
    var token = st.token;
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 6000) : null;

    function direct() {
      if (sequence !== undefined && sequence !== st.coverSeq) return;
      image.onload = function () {
        image.classList.add('loaded');
      };
      image.onerror = function () {
        image.classList.remove('loaded');
      };
      image.src = base + '&k=' + encodeURIComponent(token);
    }

    fetch(base, {
      headers: token ? { 'X-CM-Token': token } : {},
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
    })
      .then(function (response) {
        if (timer) clearTimeout(timer);
        if (!response.ok) throw new Error('cover');
        return response.blob();
      })
      .then(function (blob) {
        if (sequence !== undefined && sequence !== st.coverSeq) return;
        var objectUrl = URL.createObjectURL(blob);
        image.onload = function () {
          image.classList.add('loaded');
          URL.revokeObjectURL(objectUrl);
        };
        image.onerror = function () {
          URL.revokeObjectURL(objectUrl);
          direct();
        };
        image.src = objectUrl;
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        direct();
      });
  }

  function setCover(path) {
    var src = path || '';
    if (src === st.coverSrc) return;
    st.coverSrc = src;
    st.coverSeq += 1;
    if (!src) {
      dom.artImg.classList.remove('loaded');
      dom.artImg.removeAttribute('src');
      return;
    }
    dom.artImg.classList.remove('loaded');
    loadImage(dom.artImg, src, st.coverSeq);
  }

  function renderLyrics() {
    var data = st.data;
    var lyric = data && data.lyric;
    var show =
      st.showLyrics &&
      data &&
      data.lyricsOn &&
      lyric &&
      (lyric.line || lyric.next);
    dom.lyrics.hidden = !show;
    if (!show) return;
    dom.lyricLine.textContent = lyric.line || '';
    dom.lyricNext.textContent = lyric.next || '';
  }

  function renderControls() {
    var data = st.data;
    var caps = (data && data.capabilities) || {};
    var track = data && data.track;
    dom.btnLike.hidden = !caps.like;
    dom.btnLike.classList.toggle('active', Boolean(data && data.favorite === true));
    dom.btnLike.setAttribute('aria-pressed', data && data.favorite === true ? 'true' : 'false');
    var volume = data ? data.volume : 0;
    dom.vfill.style.width = Math.round((L.clampVolume(volume) / 1.5) * 100) + '%';
    dom.vbar.setAttribute('aria-valuenow', String(L.volumePercent(volume)));
    dom.btnMute.setAttribute('aria-label', data && data.muted ? 'Ton einschalten' : 'Stumm schalten');
    var disabled = !track || st.offline;
    dom.btnPrev.disabled = disabled;
    dom.btnNext.disabled = disabled;
    dom.btnPlay.disabled = disabled;
    dom.btnMute.disabled = !track;
    dom.btnLike.disabled = !track;
  }

  function renderProgress() {
    var data = st.data;
    var track = data && data.track;
    var live = Boolean(track && track.live);
    dom.progress.hidden = !track || live;
    dom.liveNote.hidden = !live;
    if (!track || live) return;
    dom.progress.setAttribute('data-seekable', data.capabilities.seek ? 'true' : 'false');
    dom.progress.setAttribute('role', data.capabilities.seek ? 'slider' : 'progressbar');
    dom.progress.setAttribute('aria-valuetext', L.fmtTime(data.position) + ' von ' + L.fmtTime(data.duration));
    tick();
  }

  function tick() {
    var data = st.data;
    if (!data || !data.track || data.track.live || st.view !== 'ready') return;
    if (st.seekDrag) return;
    var position = L.projectedPosition(data, Date.now());
    var fraction = L.progressFraction(position, data.duration);
    setProgressVisual(fraction);
    dom.timeNow.textContent = L.fmtTime(position);
    dom.timeTotal.textContent = L.fmtTime(data.duration);
  }

  function setProgressVisual(fraction) {
    var percent = (fraction * 100).toFixed(2) + '%';
    dom.progressFill.style.width = percent;
    dom.progressKnob.style.left = percent;
    dom.progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
  }

  function renderQueue() {
    var data = st.data;
    var rows = L.queueRows(st.layout);
    var list = data && data.upNext ? data.upNext : [];
    if (!st.showQueue || !rows || !list.length || st.view === 'idle') {
      dom.queue.hidden = true;
      st.queueKey = '';
      return;
    }
    dom.queue.hidden = false;
    var visible = list.slice(0, rows);
    var key = visible
      .map(function (item) { return item.title + '\u0000' + item.artist; })
      .join('\u0001');
    if (key === st.queueKey) return;
    st.queueKey = key;
    dom.queueList.textContent = '';
    visible.forEach(function (item) {
      var row = document.createElement('div');
      row.className = 'queue-row';
      var cover = document.createElement('div');
      cover.className = 'queue-cover';
      if (item.cover) {
        var img = document.createElement('img');
        img.alt = '';
        loadImage(img, item.cover);
        cover.appendChild(img);
      } else {
        cover.textContent = L.letterFor(item.title);
      }
      var text = document.createElement('div');
      text.className = 'queue-text';
      var name = document.createElement('div');
      name.className = 'queue-name';
      name.textContent = item.title || 'Unbekannter Titel';
      var artist = document.createElement('div');
      artist.className = 'queue-artist';
      artist.textContent = item.artist || '';
      text.appendChild(name);
      text.appendChild(artist);
      row.appendChild(cover);
      row.appendChild(text);
      dom.queueList.appendChild(row);
    });
  }

  function layout() {
    var next = L.layoutFor(
      window.innerWidth || document.documentElement.clientWidth,
      window.innerHeight || document.documentElement.clientHeight,
      st.layoutPref
    );
    if (next !== st.layout) {
      st.layout = next;
      document.body.setAttribute('data-layout', next);
      st.queueKey = '';
      renderQueue();
    }
  }

  /* ---------------------------------------------------------------- *
   * Connection cards
   * ---------------------------------------------------------------- */

  function setConnectNote(text) {
    if (dom.connectNote) dom.connectNote.textContent = text;
  }

  function showConnect(note) {
    st.view = 'connect';
    st.pair = null;
    closeStream();
    stopPolling();
    setConnectNote(note || 'CleanMusic wird gesucht …');
    render();
    probe();
  }

  function startPairing() {
    if (st.pairing) return;
    st.pairing = true;
    dom.btnConnect.disabled = true;
    setConnectNote('Verbindung wird geprüft …');

    function pairNew() {
      setConnectNote('Kopplung wird angefragt …');
      fetch(SERVER + '/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      })
        .then(function (response) {
          return response.json().then(function (data) {
            return { status: response.status, data: data };
          });
        })
        .then(function (result) {
          st.pairing = false;
          dom.btnConnect.disabled = false;
          if (result.status === 409) {
            hint('Bitte in CleanMusic zuerst „Kopplungen zurücksetzen“ drücken.');
            setConnectNote('Zu viele Geräte gekoppelt.');
            return;
          }
          if (!result.data || !result.data.pairId) {
            hint('Kopplung konnte nicht gestartet werden.');
            setConnectNote('CleanMusic antwortet nicht richtig.');
            return;
          }
          st.pair = result.data;
          st.view = 'pair';
          dom.pairCode.textContent = result.data.code || '0000';
          dom.pairNote.textContent = 'Warte auf Bestätigung …';
          render();
          pollPair();
        })
        .catch(function () {
          st.pairing = false;
          dom.btnConnect.disabled = false;
          setConnectNote('CleanMusic ist nicht erreichbar.');
          hint('CleanMusic öffnen und das Plugin „Xeneon Edge“ einschalten.');
        });
    }

    // A stored token may still be valid (the server was just late). Try it
    // before spending one of the three device slots.
    if (!st.token) {
      pairNew();
      return;
    }
    api('/api/state', { timeout: 2500, quiet401: true })
      .then(function (result) {
        if (result.ok && result.data) {
          st.pairing = false;
          dom.btnConnect.disabled = false;
          receive(result.data);
          return;
        }
        st.token = '';
        clearStore();
        pairNew();
      })
      .catch(function () {
        st.pairing = false;
        dom.btnConnect.disabled = false;
        setConnectNote('CleanMusic ist nicht erreichbar.');
      });
  }

  function pollPair() {
    if (st.view !== 'pair' || !st.pair) return;
    var pairId = st.pair.pairId;
    fetch(SERVER + '/api/pair/' + encodeURIComponent(pairId), { cache: 'no-store' })
      .then(function (response) {
        return response.json().then(function (data) {
          return { status: response.status, data: data };
        });
      })
      .then(function (result) {
        if (st.view !== 'pair' || !st.pair || st.pair.pairId !== pairId) return;
        if (result.data && result.data.status === 'paired' && result.data.token) {
          st.token = String(result.data.token);
          st.tokenFromKey = false;
          writeStore(st.token);
          st.pair = null;
          st.view = 'boot';
          dom.overlay.hidden = true;
          openStream();
          hint('Verbunden – viel Spaß!');
          return;
        }
        if (result.data && result.data.status === 'expired') {
          st.pair = null;
          showConnect('Der Code ist abgelaufen. Bitte noch einmal „Verbinden“ antippen.');
          return;
        }
        setTimeout(pollPair, 1500);
      })
      .catch(function () {
        setTimeout(pollPair, 2000);
      });
  }

  /* ---------------------------------------------------------------- *
   * Hints, cover gestures, progress and volume
   * ---------------------------------------------------------------- */

  function hint(text) {
    dom.toast.textContent = text;
    dom.toast.hidden = false;
    clearTimeout(st.toastTimer);
    st.toastTimer = setTimeout(function () {
      dom.toast.hidden = true;
    }, 2800);
  }

  function heartBurst() {
    dom.artHeart.classList.remove('burst');
    void dom.artHeart.offsetWidth;
    dom.artHeart.classList.add('burst');
  }

  function showVolumeFlash(volume) {
    dom.volumeFlash.hidden = false;
    dom.volumeFlashValue.textContent = L.volumePercent(volume) + ' %';
    dom.volumeFlashFill.style.width = Math.round((L.clampVolume(volume) / 1.5) * 100) + '%';
    dom.vfill.style.width = Math.round((L.clampVolume(volume) / 1.5) * 100) + '%';
  }

  function hideVolumeFlash() {
    dom.volumeFlash.hidden = true;
  }

  function wake() {
    if (!st.dimmed) return false;
    st.dimmed = false;
    app.classList.remove('is-dimmed');
    st.suppressUntil = Date.now() + 400;
    return true;
  }

  function dimCheck() {
    if (!st.data || !st.data.track) {
      st.pausedSince = 0;
      return;
    }
    if (st.data.playing) {
      st.pausedSince = 0;
      if (st.dimmed) {
        st.dimmed = false;
        app.classList.remove('is-dimmed');
      }
      return;
    }
    if (!st.pausedSince) st.pausedSince = Date.now();
    if (!st.dimmed && Date.now() - st.pausedSince > DIM_AFTER) {
      st.dimmed = true;
      app.classList.add('is-dimmed');
    }
  }

  function artDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!st.data || !st.data.track || st.view !== 'ready') return;
    var drag = {
      id: event.pointerId,
      sx: event.clientX,
      sy: event.clientY,
      mode: '',
      volume: st.data.volume,
    };
    st.artDrag = drag;
    try {
      dom.art.setPointerCapture(event.pointerId);
    } catch (error) {
      /* ignore */
    }
    event.preventDefault();
  }

  function artMove(event) {
    var drag = st.artDrag;
    if (!drag || event.pointerId !== drag.id) return;
    var dx = event.clientX - drag.sx;
    var dy = event.clientY - drag.sy;
    if (!drag.mode && (Math.abs(dx) > 12 || Math.abs(dy) > 12)) {
      drag.mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'volume';
    }
    if (drag.mode === 'swipe') {
      var shift = Math.max(-80, Math.min(80, dx));
      dom.art.style.transition = 'none';
      dom.art.style.transform = 'translateX(' + shift + 'px)';
    } else if (drag.mode === 'volume') {
      var volume = L.clampVolume(drag.volume - dy / 220);
      drag.lastVolume = volume;
      showVolumeFlash(volume);
    }
    event.preventDefault();
  }

  function artUp(event) {
    var drag = st.artDrag;
    if (!drag || event.pointerId !== drag.id) return;
    st.artDrag = null;
    var dx = event.clientX - drag.sx;
    var dy = event.clientY - drag.sy;
    dom.art.style.transition = '';
    dom.art.style.transform = '';
    try {
      dom.art.releasePointerCapture(event.pointerId);
    } catch (error) {
      /* ignore */
    }
    if (drag.mode === 'swipe') {
      var action = L.gestureFor(dx, dy, 44);
      if (action === 'next') send('next');
      else if (action === 'previous') send('previous');
      return;
    }
    if (drag.mode === 'volume') {
      if (Math.abs(dy) >= 36) {
        hideVolumeFlash();
        send('volume', Math.round(L.clampVolume(drag.volume - dy / 220) * 100) / 100);
        return;
      }
      hideVolumeFlash();
    }
    // Tap. With a like capability, wait briefly for a double tap; without it
    // (older CleanMusic) play/pause reacts immediately.
    if (st.data && st.data.capabilities.like) {
      var now = Date.now();
      if (now - st.lastTap < 340) {
        clearTimeout(st.tapTimer);
        st.tapTimer = 0;
        st.lastTap = 0;
        send('like');
        heartBurst();
        return;
      }
      st.lastTap = now;
      clearTimeout(st.tapTimer);
      st.tapTimer = setTimeout(function () {
        st.tapTimer = 0;
        send('toggle');
      }, 340);
      return;
    }
    send('toggle');
  }

  function progressFractionFromEvent(event) {
    var rect = dom.progressTrack.getBoundingClientRect();
    return L.clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1, 0);
  }

  function updateSeekPreview(fraction) {
    var data = st.data;
    if (!data) return;
    var position = fraction * (data.duration || 0);
    setProgressVisual(fraction);
    dom.timeNow.textContent = L.fmtTime(position);
    dom.progressBubble.textContent = L.fmtTime(position);
    dom.progressBubble.hidden = false;
    dom.progressBubble.style.left = (fraction * 100).toFixed(2) + '%';
  }

  function progressDown(event) {
    var data = st.data;
    if (!data || !data.track || data.track.live || !data.capabilities.seek) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    st.seekDrag = { id: event.pointerId, fraction: progressFractionFromEvent(event) };
    dom.progress.classList.add('dragging');
    try {
      dom.progress.setPointerCapture(event.pointerId);
    } catch (error) {
      /* ignore */
    }
    updateSeekPreview(st.seekDrag.fraction);
    event.preventDefault();
  }

  function progressMove(event) {
    if (!st.seekDrag || event.pointerId !== st.seekDrag.id) return;
    st.seekDrag.fraction = progressFractionFromEvent(event);
    updateSeekPreview(st.seekDrag.fraction);
    event.preventDefault();
  }

  function progressUp(event) {
    if (!st.seekDrag || event.pointerId !== st.seekDrag.id) return;
    var fraction = progressFractionFromEvent(event);
    st.seekDrag = null;
    dom.progress.classList.remove('dragging');
    dom.progressBubble.hidden = true;
    try {
      dom.progress.releasePointerCapture(event.pointerId);
    } catch (error) {
      /* ignore */
    }
    var duration = st.data && st.data.duration ? st.data.duration : 0;
    if (duration > 0) send('seek', Math.round(fraction * duration));
  }

  function volumeFractionFromEvent(event) {
    var rect = dom.vbar.getBoundingClientRect();
    return L.clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1, 0);
  }

  function volumeDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    var fraction = volumeFractionFromEvent(event);
    st.volumeDrag = { id: event.pointerId, volume: fraction * 1.5 };
    dom.vfill.style.width = Math.round(fraction * 100) + '%';
    try {
      dom.vbar.setPointerCapture(event.pointerId);
    } catch (error) {
      /* ignore */
    }
    event.preventDefault();
  }

  function volumeMove(event) {
    if (!st.volumeDrag || event.pointerId !== st.volumeDrag.id) return;
    var fraction = volumeFractionFromEvent(event);
    st.volumeDrag.volume = fraction * 1.5;
    dom.vfill.style.width = Math.round(fraction * 100) + '%';
    event.preventDefault();
  }

  function volumeUp(event) {
    if (!st.volumeDrag || event.pointerId !== st.volumeDrag.id) return;
    var fraction = volumeFractionFromEvent(event);
    st.volumeDrag = null;
    try {
      dom.vbar.releasePointerCapture(event.pointerId);
    } catch (error) {
      /* ignore */
    }
    send('volume', Math.round(fraction * 1.5 * 100) / 100);
  }

  /* ---------------------------------------------------------------- *
   * Mini spectrum (max 20 fps, only while playing)
   * ---------------------------------------------------------------- */

  function startSpectrum() {
    var canvas = dom.spectrum;
    var context = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!context) return;

    function frame(time) {
      requestAnimationFrame(frame);
      if (time - st.lastSpectrumFrame < 50) return;
      st.lastSpectrumFrame = time;
      if (
        !st.showSpectrum ||
        st.reduceMotion ||
        !st.data ||
        !st.data.playing ||
        st.offline ||
        document.hidden ||
        !st.data.capabilities.spectrum ||
        !st.spectrumData.length
      ) {
        if (canvas.width && canvas.height) context.clearRect(0, 0, canvas.width, canvas.height);
        return;
      }
      var width = canvas.clientWidth;
      var height = canvas.clientHeight;
      if (!width || !height) return;
      var ratio = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      var count = st.spectrumData.length;
      var barWidth = width / count;
      var smooth = st.spectrumSmooth;
      context.fillStyle = st.accentCss;
      context.globalAlpha = 0.42;
      for (var i = 0; i < count; i += 1) {
        var value = st.spectrumData[i] / 255;
        smooth[i] = Math.max(value, (smooth[i] || 0) * 0.8);
        var barHeight = Math.pow(smooth[i], 1.45) * height;
        if (barHeight < 1) continue;
        var x = i * barWidth;
        context.fillRect(x + barWidth * 0.18, height - barHeight, Math.max(1, barWidth * 0.64), barHeight);
      }
      context.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- *
   * Wiring
   * ---------------------------------------------------------------- */

  function bind() {
    dom.btnPlay.addEventListener('click', function () {
      if (wake()) return;
      send('toggle');
    });
    dom.btnPrev.addEventListener('click', function () {
      if (wake()) return;
      send('previous');
    });
    dom.btnNext.addEventListener('click', function () {
      if (wake()) return;
      send('next');
    });
    dom.btnLike.addEventListener('click', function () {
      if (wake()) return;
      send('like');
      heartBurst();
    });
    dom.btnMute.addEventListener('click', function () {
      if (wake()) return;
      send('mute', !(st.data && st.data.muted));
    });
    dom.btnResume.addEventListener('click', function () {
      if (wake()) return;
      send('play');
    });
    dom.btnConnect.addEventListener('click', function () {
      if (wake()) return;
      startPairing();
    });
    dom.btnPairCancel.addEventListener('click', function () {
      st.pair = null;
      showConnect('Kopplung abgebrochen.');
    });

    dom.art.addEventListener('pointerdown', artDown);
    dom.art.addEventListener('pointermove', artMove);
    dom.art.addEventListener('pointerup', artUp);
    dom.art.addEventListener('pointercancel', function (event) {
      if (!st.artDrag || event.pointerId !== st.artDrag.id) return;
      st.artDrag = null;
      dom.art.style.transform = '';
      hideVolumeFlash();
    });
    dom.art.addEventListener('click', function (event) {
      if (event.detail === 0) send('toggle');
    });

    dom.progress.addEventListener('pointerdown', progressDown);
    dom.progress.addEventListener('pointermove', progressMove);
    dom.progress.addEventListener('pointerup', progressUp);
    dom.progress.addEventListener('pointercancel', function () {
      st.seekDrag = null;
      dom.progress.classList.remove('dragging');
      dom.progressBubble.hidden = true;
    });

    dom.vbar.addEventListener('pointerdown', volumeDown);
    dom.vbar.addEventListener('pointermove', volumeMove);
    dom.vbar.addEventListener('pointerup', volumeUp);
    dom.vbar.addEventListener('pointercancel', function () {
      st.volumeDrag = null;
    });

    document.addEventListener('pointerdown', function (event) {
      if (wake()) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);

    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        layout();
      }).observe(document.documentElement);
    }
    window.addEventListener('resize', layout);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && st.data) tick();
    });
  }

  function onIcueInitialized() {
    applyProperties();
    layout();
    if (st.started) {
      render();
      return;
    }
    start();
  }

  function onIcueDataUpdated() {
    applyProperties();
    layout();
    if (st.data) render();
  }

  // Bare assignment is intentional: iCUE's sandbox may run this script in a
  // function context, where a declared variable would never reach the bridge.
  // The fallback keeps a plain browser preview working too.
  var handlers = {
    onICUEInitialized: onIcueInitialized,
    onDataUpdated: onIcueDataUpdated,
  };
  try {
    icueEvents = handlers;
  } catch (error) {
    try {
      window.icueEvents = handlers;
    } catch (ignored) {
      /* preview without iCUE */
    }
  }

  bind();
  applyProperties();
  layout();
  document.body.setAttribute('data-layout', st.layout);

  var bootAttempts = 0;
  function bootCheck() {
    if (typeof iCUE_initialized !== 'undefined' && iCUE_initialized) {
      onIcueInitialized();
      return;
    }
    if (bootAttempts < 15) {
      bootAttempts += 1;
      setTimeout(bootCheck, 100);
      return;
    }
    onIcueInitialized();
  }
  bootCheck();
})();
