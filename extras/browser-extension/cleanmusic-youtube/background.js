'use strict';

/**
 * CleanMusic für YouTube – background service worker.
 *
 * Responsibilities, and nothing else:
 *  - context menus (page / YouTube link / selected text)
 *  - keyboard shortcuts
 *  - the small badge confirmation
 *  - opening the onboarding, options and launcher pages
 *
 * Launching the app always happens in a page that the user is looking at
 * (content script, popup, launcher) so the click carries a user gesture.
 * The service worker only opens the launcher tab for context menus and
 * shortcuts, where no gesture exists.
 */

importScripts('shared.js');

const CMX = globalThis.CMX;
const LAUNCH_PAGE = 'launch.html';
const YT_PAGES = ['*://www.youtube.com/*', '*://m.youtube.com/*', '*://music.youtube.com/*'];
const YT_LINKS = [
  '*://*.youtube.com/watch*',
  '*://*.youtube.com/shorts/*',
  '*://*.youtube.com/live/*',
  '*://youtu.be/*'
];
const MENU = {
  page: 'cmx-page',
  link: 'cmx-link',
  selection: 'cmx-selection'
};

let settings = CMX.settingsWithDefaults(null);
let badgeTimer = 0;

function pageUrl(path, params) {
  const url = new URL(chrome.runtime.getURL(path));
  if (params) {
    Object.keys(params).forEach((key) => {
      if (params[key]) url.searchParams.set(key, params[key]);
    });
  }
  return url.toString();
}

async function openPage(path, params) {
  try {
    await chrome.tabs.create({ url: pageUrl(path, params), active: true });
  } catch {
    /* tab could not be opened – nothing sensible to do here */
  }
}

function openOnboarding(from) {
  return openPage('onboarding.html', from ? { from } : null);
}

function openLauncher(link) {
  if (!CMX.isAllowedLink(link)) return Promise.resolve(null);
  return openPage(LAUNCH_PAGE, { link });
}
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get('settings');
    settings = CMX.settingsWithDefaults(stored && stored.settings);
  } catch {
    settings = CMX.settingsWithDefaults(null);
  }
  return settings;
}

async function flashBadge(text, color) {
  if (!settings.badge || !chrome.action) return;
  try {
    await chrome.action.setBadgeBackgroundColor({ color: color || '#0f7b5f' });
    await chrome.action.setBadgeText({ text: text || '✓' });
  } catch {
    return;
  }
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => {
    try {
      const cleared = chrome.action.setBadgeText({ text: '' });
      if (cleared && typeof cleared.catch === 'function') cleared.catch(() => {});
    } catch {
      /* badge is cosmetic */
    }
  }, 2200);
}

async function buildMenus() {
  if (!chrome.contextMenus) return; // not available in every Chromium host
  try {
    await chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
      id: MENU.page,
      title: 'Aktuelles YouTube-Video zu CleanMusic',
      contexts: ['page'],
      documentUrlPatterns: YT_PAGES
    });
    chrome.contextMenus.create({
      id: MENU.link,
      title: 'YouTube-Link zu CleanMusic',
      contexts: ['link'],
      targetUrlPatterns: YT_LINKS
    });
    chrome.contextMenus.create({
      id: MENU.selection,
      title: 'Auswahl in CleanMusic suchen',
      contexts: ['selection'],
      documentUrlPatterns: YT_PAGES
    });
  } catch (error) {
    console.warn('CleanMusic: Kontextmenü nicht angelegt:', error && error.message);
  }
}

async function readActiveVideo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return null;
    const info = await chrome.tabs.sendMessage(tab.id, { type: 'cm-get-info' });
    return CMX.cleanVideo(info);
  } catch {
    return null;
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  loadSettings();
  buildMenus();
  if (details.reason === 'install') {
    openPage('onboarding.html', { welcome: '1' });
  }
});

chrome.runtime.onStartup.addListener(() => {
  loadSettings();
  buildMenus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.settings) {
    settings = CMX.settingsWithDefaults(changes.settings.newValue);
  }
});

if (chrome.contextMenus) {
  chrome.contextMenus.onClicked.addListener(async (info) => {
    if (info.menuItemId === MENU.selection) {
      const link = CMX.buildSearchLink(info.selectionText);
      if (!link) return;
      await openLauncher(link);
      flashBadge('✓');
      return;
    }

    if (info.menuItemId === MENU.link) {
      const video = CMX.parseYouTubeUrl(info.linkUrl);
      if (!video) return;
      await openLauncher(CMX.buildDeepLink('add', video));
      flashBadge('✓');
      return;
    }

    if (info.menuItemId === MENU.page) {
      const video = CMX.parseYouTubeUrl(info.pageUrl) || (await readActiveVideo());
      if (!video) {
        // A YouTube page without a video (home, search, channel). Show the popup,
        // which explains the state, instead of opening a help page.
        try {
          if (chrome.action && chrome.action.openPopup) await chrome.action.openPopup();
        } catch {
          /* no video and no popup possible – nothing to do */
        }
        return;
      }
      await openLauncher(CMX.buildDeepLink('add', video));
      flashBadge('✓');
    }
  });
}

if (chrome.commands) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'add-current' && command !== 'play-current') return;
    const video = await readActiveVideo();
    if (!video) {
      // Not a YouTube tab (or the page is still loading): show the popup, which
      // explains the state, or the onboarding page when that is not possible.
      try {
        if (chrome.action && chrome.action.openPopup) {
          await chrome.action.openPopup();
          return;
        }
      } catch {
        /* fall through to the onboarding page */
      }
      openOnboarding('shortcut');
      return;
    }
    await openLauncher(CMX.buildDeepLink(command === 'play-current' ? 'play' : 'add', video));
    flashBadge('↗');
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') return false;

  if (message.type === 'cm-flash') {
    flashBadge('✓');
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'cm-open-onboarding') {
    openOnboarding('extension');
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'cm-open-options') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'cm-open-launch') {
    const link = String(message.link || '');
    if (!CMX.isAllowedLink(link)) {
      sendResponse({ ok: false, error: 'Ungültiger Link.' });
      return false;
    }
    openLauncher(link);
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'cm-get-settings') {
    loadSettings().then((next) => sendResponse({ ok: true, settings: next }));
    return true;
  }

  return false;
});
