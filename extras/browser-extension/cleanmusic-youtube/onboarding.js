'use strict';

/**
 * CleanMusic für YouTube – onboarding page.
 *
 * Opened once after installation, and from the popup / options / launcher.
 * No chrome.* calls except opening the test link, so the page also works when
 * opened directly from disk.
 */

const CMX = globalThis.CMX;

const welcome = document.getElementById('welcome');
const version = document.getElementById('version');
const params = new URLSearchParams(location.search);

if (params.get('welcome') === '1') welcome.hidden = false;

try {
  version.textContent = `Version ${chrome.runtime.getManifest().version} · Stand ${new Date().getFullYear()}`;
} catch {
  version.textContent = '';
}

document.getElementById('download').addEventListener('click', () => {
  const url = 'https://github.com/BellocccYT/cleanmusic/releases/latest';
  try {
    chrome.tabs.create({ url });
  } catch {
    window.open(url, '_blank', 'noopener');
  }
});

document.getElementById('options').addEventListener('click', () => {
  try {
    chrome.runtime.openOptionsPage();
  } catch {
    location.href = 'options.html';
  }
});

document.getElementById('test').addEventListener('click', () => {
  // A search for "CleanMusic" is the least intrusive way to prove that the
  // protocol handler works: it opens the app without queueing a real video.
  const link = CMX.buildSearchLink('CleanMusic');
  if (!link) return;
  window.open(`launch.html?link=${encodeURIComponent(link)}`, '_blank', 'noopener');
});
