'use strict';

const addButton = document.getElementById('add');
const playButton = document.getElementById('play');
const titleEl = document.getElementById('video-title');
const artistEl = document.getElementById('video-artist');
const statusEl = document.getElementById('status');
const versionEl = document.getElementById('version');

let video = null;

function setVideo(next) {
  video = next && next.id ? next : null;
  if (!video) {
    titleEl.textContent = 'Kein Video erkannt';
    artistEl.textContent = 'Öffne ein YouTube-Video und versuche es erneut.';
    addButton.disabled = true;
    playButton.disabled = true;
    return;
  }
  titleEl.textContent = video.title || 'YouTube-Video';
  artistEl.textContent = video.artist || 'YouTube';
  addButton.disabled = false;
  playButton.disabled = false;
}

function launch(action) {
  if (!video) return;
  addButton.disabled = true;
  playButton.disabled = true;
  statusEl.textContent = 'Sende an CleanMusic …';

  chrome.runtime.sendMessage({ type: 'cm-launch', action, video }, (response) => {
    const error = chrome.runtime.lastError;
    if (error) {
      statusEl.textContent = `CleanMusic nicht erreichbar: ${error.message}`;
    } else if (response && response.ok) {
      statusEl.textContent =
        action === 'add'
          ? 'An CleanMusic gesendet – dort in der Warteschlange.'
          : 'In CleanMusic geöffnet.';
    } else {
      statusEl.textContent = (response && response.error) || 'CleanMusic ist nicht erreichbar.';
    }
    window.setTimeout(() => {
      addButton.disabled = !video;
      playButton.disabled = !video;
    }, 1400);
  });
}

async function init() {
  versionEl.textContent = `v${chrome.runtime.getManifest().version}`;
  addButton.addEventListener('click', () => launch('add'));
  playButton.addEventListener('click', () => launch('play'));

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab && tab.url ? tab.url : '';
  // tab.url is not guaranteed with activeTab alone; the content script is the
  // real check. If the URL is known and not YouTube, answer immediately.
  if (url && !/^https:\/\/(www|m|music)\.youtube\.com\//i.test(url)) {
    setVideo(null);
    titleEl.textContent = 'Keine YouTube-Seite';
    artistEl.textContent = 'Öffne ein YouTube-Video, dann nochmal klicken.';
    return;
  }

  try {
    const info = await chrome.tabs.sendMessage(tab.id, { type: 'cm-get-info' });
    setVideo(info);
  } catch {
    setVideo(null);
    titleEl.textContent = 'Video noch nicht bereit';
    artistEl.textContent = 'Lade die YouTube-Seite einmal neu.';
  }
}

init();
