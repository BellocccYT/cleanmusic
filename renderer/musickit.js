'use strict';

(function () {
  const TOKEN_KEY = 'cm.musickit.token';
  const STORE_COUNTRY = 'de';

  const $ = (selector) => document.querySelector(selector);

  let music = null;
  let booted = false;

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
      }
    });
  }

  function setStatus(message, kind) {
    const el = $('#status');
    el.textContent = message || '';
    el.className = `status${kind ? ` ${kind}` : ''}`;
  }

  function readToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  function saveToken(token) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* ignore */
    }
  }

  function clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }

  async function connect() {
    const token = $('#token').value.trim();

    if (!token) {
      setStatus('Bitte zuerst einen Developer-Token einfügen.', 'err');
      return;
    }

    if (typeof window.MusicKit === 'undefined') {
      setStatus('MusicKit ist nicht geladen. Braucht Internetzugang.', 'err');
      return;
    }

    saveToken(token);
    setStatus('Verbinde mit Apple Music …');

    try {
      music = await window.MusicKit.configure({
        developerToken: token,
        app: { name: 'CleanMusic', build: '0.1.0' },
      });

      await music.authorize();

      setStatus('Verbunden. Jetzt einen Song suchen.', 'ok');
      $('#search-row').hidden = false;
      $('#q').focus();
    } catch (error) {
      music = null;
      setStatus(`Fehler: ${error && error.message ? error.message : String(error)}`, 'err');
    }
  }

  async function search() {
    if (!music) {
      setStatus('Zuerst verbinden.', 'err');
      return;
    }

    const term = $('#q').value.trim();
    if (!term) return;

    setStatus('Suche …');

    try {
      const response = await music.api.music(`/v1/catalog/${STORE_COUNTRY}/search`, {
        term,
        types: 'songs',
        limit: 20,
      });

      const payload = response && response.data ? response.data : response;
      const songs =
        payload && payload.results && payload.results.songs && payload.results.songs.data
          ? payload.results.songs.data
          : [];

      renderSongs(songs);
      setStatus(songs.length ? `${songs.length} Treffer` : 'Keine Treffer', songs.length ? 'ok' : '');
    } catch (error) {
      setStatus(`Suche fehlgeschlagen: ${error && error.message ? error.message : String(error)}`, 'err');
    }
  }

  function renderSongs(songs) {
    const list = $('#results');

    if (!songs.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = songs
      .map((song) => {
        const attributes = song.attributes || {};
        const artwork = attributes.artwork && attributes.artwork.url
          ? attributes.artwork.url.replace('{w}', '76').replace('{h}', '76')
          : '';

        return `
          <button class="song" data-play="${esc(song.id)}">
            ${artwork ? `<img src="${esc(artwork)}" alt="" />` : '<img alt="" />'}
            <span class="song-meta">
              <strong>${esc(attributes.name || 'Unbekannt')}</strong>
              <small>${esc(attributes.artistName || '')}${attributes.albumName ? ` · ${esc(attributes.albumName)}` : ''}</small>
            </span>
            <span class="play">▶</span>
          </button>`;
      })
      .join('');
  }

  async function playSong(id) {
    if (!music) return;

    try {
      await music.setQueue({ song: id });
      await music.play();
      setStatus('Wiedergabe gestartet.', 'ok');
    } catch (error) {
      setStatus(`Wiedergabe fehlgeschlagen: ${error && error.message ? error.message : String(error)}`, 'err');
    }
  }

  function boot() {
    if (booted) return;
    booted = true;

    $('#token').value = readToken();

    $('#btn-connect').addEventListener('click', connect);
    $('#btn-search').addEventListener('click', search);

    $('#btn-clear').addEventListener('click', () => {
      clearToken();
      $('#token').value = '';
      music = null;
      $('#search-row').hidden = true;
      $('#results').innerHTML = '';
      setStatus('Token gelöscht.');
    });

    $('#q').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') search();
    });

    $('#results').addEventListener('click', (event) => {
      const button = event.target.closest('[data-play]');
      if (button) playSong(button.dataset.play);
    });

    if (!window.MusicKit) {
      setTimeout(() => {
        if (!window.MusicKit) {
          setStatus('MusicKit konnte nicht geladen werden (Internetverbindung prüfen).', 'err');
        }
      }, 4000);
    }
  }

  if (window.MusicKit) {
    boot();
  } else {
    document.addEventListener('musickitloaded', boot, { once: true });
    document.addEventListener('DOMContentLoaded', () => {
      // The listener above is the normal path; this keeps the UI usable
      // even if the CDN script never loads.
      setTimeout(boot, 1500);
    });
  }
})();
