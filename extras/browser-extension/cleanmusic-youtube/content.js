'use strict';

/**
 * CleanMusic für YouTube – content script.
 *
 * Adds the CleanMusic entry points to YouTube and hands the current video to
 * the local CleanMusic app. Everything happens in this page: the click opens
 * `cleanmusic://…` directly, so Chrome still sees the user gesture.
 *
 * Read from the page: video id, title, channel, playlist flag.
 * Sent anywhere else: nothing. No fetch, no cookies, no storage of videos.
 */

(() => {
  if (window.top !== window) return;

  const CMX = globalThis.CMX;
  if (!CMX) return;

  const CLASS = {
    player: 'cm-yt-player',
    action: 'cm-yt-action',
    float: 'cm-yt-float',
    toast: 'cm-yt-toast',
    toastText: 'cm-yt-toast-text',
    toastAction: 'cm-yt-toast-action'
  };
  const ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M9 18V6l10-2v11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<circle cx="16" cy="15" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M19 3v6M16 6h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>';

  let settings = CMX.settingsWithDefaults(null);
  let toastEl = null;
  let toastTimer = 0;
  let ensureTimer = 0;

  /* --- settings ------------------------------------------------------- */

  function applySettings(next) {
    settings = CMX.settingsWithDefaults(next);
    ensure();
    if (!settings.toasts) hideToast(0);
  }

  try {
    chrome.storage.local.get('settings', (stored) => {
      applySettings(stored && stored.settings);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.settings) applySettings(changes.settings.newValue);
    });
  } catch {
    /* extension context gone – the defaults stay active */
  }

  /* --- reading the page ----------------------------------------------- */

  function host() {
    return location.hostname;
  }

  function isMusic() {
    return host() === 'music.youtube.com';
  }

  function isShorts() {
    return /^\/shorts\//.test(location.pathname);
  }

  function text(selector) {
    const node = document.querySelector(selector);
    return node && node.textContent ? node.textContent : '';
  }

  function currentVideo() {
    const url = new URL(location.href);
    const shorts = location.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})/);
    const id = url.searchParams.get('v') || (shorts ? shorts[1] : '');
    if (!id || !CMX.VIDEO_ID.test(id)) return null;

    const musicTitle = isMusic() ? text('ytmusic-player-bar .title') : '';
    const musicArtist = isMusic() ? text('ytmusic-player-bar .byline') : '';
    const shortsTitle = isShorts()
      ? text('ytd-reel-video-renderer[is-active] #shorts-title') ||
        text('ytd-reel-video-renderer[is-active] h2') ||
        text('ytd-shorts #shorts-title')
      : '';
    const heading = text(
      'ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata yt-formatted-string, h1.title yt-formatted-string'
    );
    const metaTitle = (document.querySelector('meta[name="title"]') || {}).content || '';
    const ogTitle = (document.querySelector('meta[property="og:title"]') || {}).content || '';
    const channel =
      text('#owner #channel-name a') ||
      text('ytd-video-owner-renderer #channel-name a') ||
      text('#owner ytd-channel-name a') ||
      text('ytd-channel-name a');

    const rawTitle =
      musicTitle || shortsTitle || heading || metaTitle || ogTitle || document.title;
    if (!CMX.normalizeText(rawTitle, 10)) return null;

    const split = CMX.splitArtistTitle(rawTitle, musicArtist || channel);
    return {
      id,
      title: split.title,
      artist: split.artist,
      url: `https://www.youtube.com/watch?v=${id}`,
      playlist: Boolean(url.searchParams.get('list')),
      site: isMusic() ? 'music' : isShorts() ? 'shorts' : 'watch'
    };
  }

  /* --- launching the app ---------------------------------------------- */

  function openExternal(link) {
    // A real anchor click in the page keeps the transient user activation that
    // Chrome requires for external protocols. It also never navigates this tab
    // away when no handler is registered.
    const anchor = document.createElement('a');
    anchor.href = link;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  function send(type, payload) {
    try {
      const result = chrome.runtime.sendMessage(Object.assign({ type }, payload));
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch {
      /* extension context gone */
    }
  }

  function openHelp() {
    send('cm-open-onboarding');
  }

  function notifyBadge() {
    send('cm-flash');
  }

  function hideToast(delay) {
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      if (toastEl) toastEl.classList.remove('show');
    }, delay == null ? 3200 : delay);
  }

  function showToast(message, actionLabel) {
    if (!settings.toasts || !document.body) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = CLASS.toast;
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = '';

    const label = document.createElement('span');
    label.className = CLASS.toastText;
    label.textContent = message;
    toastEl.appendChild(label);

    if (actionLabel) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = CLASS.toastAction;
      button.textContent = actionLabel;
      button.addEventListener('click', openHelp);
      toastEl.appendChild(button);
    }

    toastEl.classList.add('show');
    hideToast(actionLabel ? 6000 : 2800);
  }

  function launch(action) {
    const video = currentVideo();
    if (!video) {
      showToast('Kein YouTube-Video erkannt.');
      return;
    }

    const link =
      action === 'search'
        ? CMX.buildSearchLink(`${video.artist} ${video.title}`.trim())
        : CMX.buildDeepLink(action, video);

    if (!link || !CMX.isAllowedLink(link)) {
      showToast('Der Link konnte nicht erstellt werden.');
      return;
    }

    openExternal(link);
    notifyBadge();
    showToast(
      action === 'play'
        ? 'Wird in CleanMusic abgespielt …'
        : action === 'search'
          ? 'Suche wird an CleanMusic gesendet …'
          : 'An CleanMusic gesendet …',
      'App fehlt?'
    );
  }

  function onClick(event) {
    event.preventDefault();
    event.stopPropagation();
    if (settings.modifierClicks && (event.metaKey || event.altKey)) {
      launch('search');
      return;
    }
    if (settings.modifierClicks && event.shiftKey) {
      launch('play');
      return;
    }
    launch('add');
  }

  const TOOLTIP = 'Zu CleanMusic hinzufügen · Shift: abspielen · Alt: suchen';

  function makeButton(className, extraClass) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = extraClass ? `${extraClass} ${className}` : className;
    button.title = TOOLTIP;
    button.setAttribute('aria-label', 'Zu CleanMusic hinzufügen');
    button.innerHTML = ICON;
    button.addEventListener('click', onClick);
    return button;
  }

  /* --- injecting ------------------------------------------------------ */

  function remove(className) {
    document.querySelectorAll(`.${className}`).forEach((node) => node.remove());
  }

  function injectPlayerButton() {
    const controls = document.querySelector('.ytp-right-controls');
    if (!controls) return false;
    if (controls.querySelector(`.${CLASS.player}`)) return true;
    controls.prepend(makeButton(CLASS.player, 'ytp-button'));
    return true;
  }

  function injectActionButton() {
    const hostEl = document.querySelector(
      'ytd-watch-metadata #top-level-buttons-computed, #top-level-buttons-computed'
    );
    if (!hostEl) return false;
    if (hostEl.querySelector(`.${CLASS.action}`)) return true;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = CLASS.action;
    button.title = TOOLTIP;
    button.setAttribute('aria-label', 'Zu CleanMusic hinzufügen');
    button.innerHTML =
      `<span class="cm-yt-action-ic">${ICON}</span>` +
      '<span class="cm-yt-action-label">CleanMusic</span>';
    button.addEventListener('click', onClick);
    hostEl.appendChild(button);
    return true;
  }

  function injectFloat() {
    if (document.querySelector(`.${CLASS.float}`)) return;
    document.body.appendChild(makeButton(CLASS.float, isShorts() ? 'cm-yt-float-shorts' : ''));
  }

  function ensure() {
    if (!document.body) return;
    const video = currentVideo();
    if (!video) {
      remove(CLASS.player);
      remove(CLASS.action);
      remove(CLASS.float);
      return;
    }

    const floating = isMusic() || isShorts();
    if (floating) {
      remove(CLASS.player);
      remove(CLASS.action);
      if (settings.floatButton) injectFloat();
      else remove(CLASS.float);
      return;
    }

    remove(CLASS.float);
    if (settings.playerButton) injectPlayerButton();
    else remove(CLASS.player);
    if (settings.actionButton) injectActionButton();
    else remove(CLASS.action);
  }

  function scheduleEnsure() {
    if (ensureTimer) return;
    ensureTimer = window.setTimeout(() => {
      ensureTimer = 0;
      ensure();
    }, 250);
  }

  /* --- wiring --------------------------------------------------------- */

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

  const observer = new MutationObserver(scheduleEnsure);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setInterval(ensure, 5000);
  ensure();
})();
