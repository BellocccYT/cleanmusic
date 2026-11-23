'use strict';

/**
 * CleanMusic für YouTube – options page.
 *
 * Settings live in chrome.storage.local (this device only) and are applied by
 * the content script immediately through storage.onChanged.
 */

const CMX = globalThis.CMX;
const COMMAND_LABELS = {
  _execute_action: 'Popup öffnen',
  'add-current': 'Aktuelles Video zur Warteschlange',
  'play-current': 'Aktuelles Video abspielen'
};

const inputs = Array.from(document.querySelectorAll('[data-setting]'));
const savedEl = document.getElementById('saved');
const shortcutsEl = document.getElementById('shortcuts');
const hintEl = document.getElementById('shortcut-hint');
let savedTimer = 0;

function current() {
  const settings = {};
  inputs.forEach((input) => {
    settings[input.dataset.setting] = Boolean(input.checked);
  });
  return CMX.settingsWithDefaults(settings);
}

function paint(settings) {
  inputs.forEach((input) => {
    input.checked = settings[input.dataset.setting] !== false;
  });
}

function flashSaved(text) {
  savedEl.textContent = text || 'Gespeichert';
  clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => {
    savedEl.textContent = '';
  }, 1800);
}

async function save() {
  const settings = current();
  try {
    await chrome.storage.local.set({ settings });
    flashSaved();
  } catch {
    flashSaved('Nicht gespeichert');
  }
}

function fallbackShortcutHint() {
  const text = 'chrome://extensions/shortcuts';
  try {
    navigator.clipboard.writeText(text).then(
      () => {
        hintEl.textContent = `${text} (kopiert – bitte in die Adresszeile einfügen)`;
      },
      () => {
        hintEl.textContent = text;
      }
    );
  } catch {
    hintEl.textContent = text;
  }
}

async function renderShortcuts() {
  if (!chrome.commands || !chrome.commands.getAll) {
    shortcutsEl.innerHTML = '<div class="shortcut-row"><span class="none">Nicht verfügbar</span></div>';
    return;
  }
  const commands = await chrome.commands.getAll();
  const rows = commands
    .filter((command) => COMMAND_LABELS[command.name])
    .map((command) => {
      const key = command.shortcut
        ? `<kbd>${command.shortcut}</kbd>`
        : '<span class="none">nicht belegt</span>';
      return `<div class="shortcut-row"><span>${COMMAND_LABELS[command.name]}</span>${key}</div>`;
    });
  shortcutsEl.innerHTML = rows.length
    ? rows.join('')
    : '<div class="shortcut-row"><span class="none">Keine Kürzel verfügbar</span></div>';
}

function init() {
  document.getElementById('version').textContent = `v${chrome.runtime.getManifest().version}`;

  chrome.storage.local.get('settings', (stored) => {
    paint(CMX.settingsWithDefaults(stored && stored.settings));
  });

  inputs.forEach((input) => input.addEventListener('change', save));

  document.getElementById('reset').addEventListener('click', async () => {
    const defaults = CMX.settingsWithDefaults(null);
    paint(defaults);
    await chrome.storage.local.set({ settings: defaults });
    flashSaved('Zurückgesetzt');
  });

  document.getElementById('test').addEventListener('click', () => {
    const link = CMX.buildSearchLink('CleanMusic');
    chrome.runtime.sendMessage({ type: 'cm-open-launch', link }, (response) => {
      if (chrome.runtime.lastError || !response || !response.ok) flashSaved('Test fehlgeschlagen');
    });
  });

  document.getElementById('help').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  });

  document.getElementById('shortcut-settings').addEventListener('click', () => {
    try {
      chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }, () => {
        if (chrome.runtime.lastError) fallbackShortcutHint();
      });
    } catch {
      fallbackShortcutHint();
    }
  });

  renderShortcuts();
}

init();
