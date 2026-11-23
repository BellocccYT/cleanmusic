'use strict';

/**
 * CleanMusic für YouTube – toolbar popup.
 *
 * The popup launches the app itself (click = user gesture) and only asks the
 * content script for the current video. No network access at all.
 */

const CMX = globalThis.CMX;

const el = {
  videoCard: document.getElementById('video-card'),
  empty: document.getElementById('empty'),
  emptyTitle: document.getElementById('empty-title'),
  emptyHint: document.getElementById('empty-hint'),
  thumb: document.getElementById('thumb'),
  title: document.getElementById('video-title'),
  artist: document.getElementById('video-artist'),
  siteChip: document.getElementById('site-chip'),
  playlistChip: document.getElementById('playlist-chip'),
  add: document.getElementById('add'),
  play: document.getElementById('play'),
  searchForm: document.getElementById('search-form'),
  searchInput: document.getElementById('search-input'),
  status: document.getElementById('status'),
  hint: document.getElementById('hint'),
  version: document.getElementById('version'),
  options: document.getElementById('options'),
  help: document.getElementById('help'),
  download: document.getElementById('download')
};

let video = null;
let busyTimer = 0;

function setStatus(message, bad) {
  el.status.textContent = message || '';
  el.status.classList.toggle('bad', Boolean(bad));
}

function setEnabled(enabled) {
  el.add.disabled = !enabled;
  el.play.disabled = !enabled;
}

function setBusy(ms) {
  setEnabled(false);
  clearTimeout(busyTimer);
  busyTimer = window.setTimeout(() => setEnabled(Boolean(video)), ms || 1400);
}

function renderEmpty(title, hint) {
  video = null;
  el.videoCard.hidden = true;
  el.empty.hidden = false;
  el.emptyTitle.textContent = title;
  el.emptyHint.textContent = hint;
  setEnabled(false);
  setStatus('');
  el.hint.textContent =
    'CleanMusic muss installiert sein. Alles bleibt auf diesem Rechner – kein Konto, kein Server.';
}

function siteLabel(site) {
  if (site === 'music') return 'YouTube Music';
  if (site === 'shorts') return 'Shorts';
  return 'YouTube';
}

function renderVideo(info) {
  video = CMX.cleanVideo(info);
  if (!video) {
    renderEmpty(
      'Kein Video erkannt',
      'Öffne ein YouTube-Video und klicke erneut auf das CleanMusic-Symbol.'
    );
    return;
  }

  el.empty.hidden = true;
  el.videoCard.hidden = false;
  el.title.textContent = video.title || 'YouTube-Video';
  el.artist.textContent = video.artist || 'Kanal unbekannt';
  el.siteChip.textContent = siteLabel(info.site);
  el.playlistChip.hidden = !video.playlist;

  const thumbnail = CMX.thumbnailUrl(video.id);
  el.thumb.hidden = !thumbnail;
  if (thumbnail) {
    el.thumb.onerror = () => {
      el.thumb.hidden = true;
    };
    el.thumb.src = thumbnail;
    el.thumb.alt = '';
  }

  el.searchInput.value = `${video.artist} ${video.title}`.trim().slice(0, 200);
  setEnabled(true);
  setStatus('');
  el.hint.textContent =
    'Shift-Klick auf den Player-Knopf spielt direkt ab, Alt-Klick sucht im Katalog.';
}

function openExternal(link) {
  const anchor = document.createElement('a');
  anchor.href = link;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function launch(action) {
  if (!video) return;
  const link = CMX.buildDeepLink(action, video);
  if (!link || !CMX.isAllowedLink(link)) {
    setStatus('Der Link konnte nicht erstellt werden.', true);
    return;
  }
  openExternal(link);
  setBusy();
  setStatus(action === 'play' ? 'In CleanMusic geöffnet.' : 'An CleanMusic gesendet.');
}

function search() {
  const query = el.searchInput.value.trim();
  if (!query) {
    el.searchInput.focus();
    return;
  }
  const link = CMX.buildSearchLink(query);
  if (!link || !CMX.isAllowedLink(link)) {
    setStatus('Die Suche konnte nicht gesendet werden.', true);
    return;
  }
  openExternal(link);
  setBusy();
  setStatus('Suche an CleanMusic gesendet.');
}

async function init() {
  el.version.textContent = `v${chrome.runtime.getManifest().version}`;
  el.add.addEventListener('click', () => launch('add'));
  el.play.addEventListener('click', () => launch('play'));
  el.searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    search();
  });
  el.options.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'cm-open-options' }).catch(() => {});
  });
  el.help.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'cm-open-onboarding' }).catch(() => {});
  });
  el.download.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/BellocccYT/cleanmusic/releases/latest' });
  });

  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const tag = (event.target && event.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (event.key === 'a' || event.key === 'A') {
      event.preventDefault();
      launch('add');
    } else if (event.key === 'p' || event.key === 'P') {
      event.preventDefault();
      launch('play');
    }
  });

  let tab = null;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    tab = null;
  }

  const url = (tab && tab.url) || '';
  if (url && !CMX.isYouTubePage(url)) {
    renderEmpty(
      'Keine YouTube-Seite',
      'Öffne ein Video auf youtube.com – oder suche unten direkt in CleanMusic.'
    );
    return;
  }

  if (!tab || !tab.id) {
    renderEmpty(
      'Kein YouTube-Video auf dieser Seite',
      'Öffne ein Video auf youtube.com – oder suche unten direkt in CleanMusic.'
    );
    return;
  }

  try {
    const info = await chrome.tabs.sendMessage(tab.id, { type: 'cm-get-info' });
    renderVideo(info);
  } catch {
    renderEmpty(
      'Video noch nicht bereit',
      'Lade die YouTube-Seite einmal neu, dann funktioniert der Knopf sofort.'
    );
  }
}

init();
