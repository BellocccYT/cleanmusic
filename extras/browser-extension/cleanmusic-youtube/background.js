'use strict';

/**
 * CleanMusic für YouTube – background service worker.
 *
 * Opens a cleanmusic:// link. The CleanMusic installer (or the portable EXE
 * on its first start) registers the scheme; the app then resolves the video
 * and either enqueues it ("add") or plays it ("play").
 */

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const ACTIONS = new Set(['add', 'play']);

function buildLink(action, video) {
  const params = new URLSearchParams();
  params.set('src', 'youtube');
  params.set('id', video.id);
  if (video.title) params.set('t', String(video.title).slice(0, 200));
  if (video.artist) params.set('a', String(video.artist).slice(0, 200));
  return `cleanmusic://${action === 'add' ? 'add' : 'play'}?${params.toString()}`;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'cm-launch') return false;

  const action = ACTIONS.has(message.action) ? message.action : 'add';
  const video = message.video && typeof message.video === 'object' ? message.video : {};
  const id = String(video.id || '');
  if (!VIDEO_ID.test(id)) {
    sendResponse({ ok: false, error: 'Kein YouTube-Video erkannt.' });
    return false;
  }

  const url = buildLink(action, Object.assign({}, video, { id }));
  try {
    chrome.tabs.create({ url, active: true }, () => {
      const error = chrome.runtime.lastError;
      if (error) sendResponse({ ok: false, error: error.message, url });
      else sendResponse({ ok: true, url });
    });
  } catch (error) {
    sendResponse({ ok: false, error: error && error.message ? error.message : String(error), url });
  }
  return true;
});
