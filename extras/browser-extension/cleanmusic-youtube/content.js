'use strict';

/**
 * CleanMusic für YouTube – content script.
 *
 * Adds a small button to the YouTube player (and a floating button on
 * YouTube Music / Shorts). The video id, title and channel are read from the
 * page; the background worker opens cleanmusic://add or cleanmusic://play.
 * Nothing is sent anywhere except to the local CleanMusic app.
 */

(() => {
  if (window.top !== window) return;

  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const BTN_CLASS = 'cm-yt-add';
  const FLOAT_CLASS = 'cm-yt-float';
  const TOAST_CLASS = 'cm-yt-toast';
  const ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 18V6l10-2v11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <circle cx="16" cy="15" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>
      <path d="M19 3v6M16 6h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;

  let toastEl = null;
  let toastTimer = 0;
  let ensureTimer = 0;

  function clean(value, max = 200) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  function isMusic() {
    return location.hostname === 'music.youtube.com';
  }

  function isShorts() {
    return /^\/shorts\//.test(location.pathname);
  }

  function currentVideo() {
    const url = new URL(location.href);
    const shorts = location.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/);
    const id = url.searchParams.get('v') || (shorts ? shorts[1] : '');
    if (!id || !VIDEO_ID.test(id)) return null;

    const musicTitle = document.querySelector('ytmusic-player-bar .title')?.textContent;
    const musicArtist = document.querySelector('ytmusic-player-bar .byline')?.textContent;
    const metaTitle = document.querySelector('meta[name="title"]')?.content;
    const heading = document.querySelector(
      'h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string'
    )?.textContent;

    let title = clean((isMusic() ? musicTitle : '') || heading || metaTitle || document.title, 220);
    let artist = clean(
      (isMusic() ? musicArtist : '') ||
        document.querySelector('#owner #channel-name a, ytd-channel-name a, #channel-name a')?.textContent ||
        '',
      160
    );

    title = title
      .replace(/^\(\d+\)\s*/, '')
      .replace(/\s*[-–—]\s*YouTube(\s*Music)?$/i, '')
      .replace(/\s*[\(\[](?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visualizer|lyric\s+video)[^\)\]]*[\)\]]/gi, '')
      .trim();
    artist = artist.replace(/\s*[-–—]\s*Topic$/i, '').replace(/\s*VEVO$/i, '').trim();

    // A title like "Artist – Song" is common when the channel is not the artist.
    const split = title.match(/^(.{2,80}?)\s+[-–—]\s+(.+)$/);
    if (split && (!artist || /^(youtube|various artists|topic)$/i.test(artist))) {
      artist = clean(split[1], 160);
      title = clean(split[2], 220);
    }

    // "Artist – Song" in the title, artist also known from the channel.
    if (artist) {
      const prefix = title.toLowerCase();
      const name = artist.toLowerCase();
      if (prefix.startsWith(`${name} - `)) title = clean(title.slice(artist.length + 3), 220);
      else if (prefix.startsWith(`${name} – `)) title = clean(title.slice(artist.length + 3), 220);
      else if (prefix.startsWith(`${name} — `)) title = clean(title.slice(artist.length + 3), 220);
    }

    if (!title) return null;
    return { id, title, artist };
  }

  function showToast(text) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = TOAST_CLASS;
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2800);
  }

  function directLink(action, video) {
    const params = new URLSearchParams();
    params.set('src', 'youtube');
    params.set('id', video.id);
    if (video.title) params.set('t', video.title);
    if (video.artist) params.set('a', video.artist);
    return `cleanmusic://${action === 'add' ? 'add' : 'play'}?${params.toString()}`;
  }

  // Fallback when the background worker is not reachable (e.g. after a reload).
  function openDirect(action, video) {
    const anchor = document.createElement('a');
    anchor.href = directLink(action, video);
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    showToast('CleanMusic wird geöffnet …');
  }

  function launch(action) {
    const video = currentVideo();
    if (!video) {
      showToast('Kein YouTube-Video erkannt.');
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: 'cm-launch', action, video }, (response) => {
        if (chrome.runtime.lastError) {
          openDirect(action, video);
          return;
        }
        if (response && response.ok) {
          showToast(action === 'add' ? 'An CleanMusic gesendet' : 'In CleanMusic geöffnet');
        } else {
          showToast((response && response.error) || 'CleanMusic ist nicht erreichbar.');
          openDirect(action, video);
        }
      });
    } catch {
      openDirect(action, video);
    }
  }

  function makeButton(className, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.innerHTML = ICON;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      launch('add');
    });
    return button;
  }

  function injectPlayerButton() {
    if (isMusic() || isShorts()) return false;
    const controls = document.querySelector('.ytp-right-controls');
    if (!controls) return false;
    if (controls.querySelector(`.${BTN_CLASS}`)) return true;
    controls.prepend(makeButton(`ytp-button ${BTN_CLASS}`, 'Zu CleanMusic hinzufügen'));
    return true;
  }

  function injectFloating() {
    if (document.querySelector(`.${FLOAT_CLASS}`)) return;
    if (!currentVideo()) return;
    document.body.appendChild(makeButton(FLOAT_CLASS, 'Zu CleanMusic hinzufügen'));
  }

  function removeControls() {
    document.querySelectorAll(`.${BTN_CLASS}, .${FLOAT_CLASS}`).forEach((el) => el.remove());
  }

  function ensure() {
    if (!currentVideo()) {
      removeControls();
      return;
    }
    if (isMusic() || isShorts()) {
      document.querySelector(`.${BTN_CLASS}`)?.remove();
      injectFloating();
    } else {
      document.querySelector(`.${FLOAT_CLASS}`)?.remove();
      injectPlayerButton();
    }
  }

  function scheduleEnsure() {
    clearTimeout(ensureTimer);
    ensureTimer = window.setTimeout(ensure, 180);
  }

  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || message.type !== 'cm-get-info') return false;
      sendResponse(currentVideo());
      return false;
    });
  } catch {
    /* extension context gone */
  }

  document.addEventListener('yt-navigate-finish', scheduleEnsure);
  document.addEventListener('yt-page-data-updated', scheduleEnsure);
  window.addEventListener('popstate', scheduleEnsure);
  new MutationObserver(scheduleEnsure).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.setInterval(ensure, 4000);
  ensure();
})();
