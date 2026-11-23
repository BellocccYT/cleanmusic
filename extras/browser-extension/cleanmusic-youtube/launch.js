'use strict';

/**
 * CleanMusic für YouTube – launcher page.
 *
 * Opened by the service worker for context menus and keyboard shortcuts, where
 * Chrome has no user gesture for the external protocol. The page shows what
 * will be sent and turns the actual launch into a real click.
 *
 * The link is validated against the same rules as the app before it is used.
 */

const CMX = globalThis.CMX;
const params = new URLSearchParams(location.search);
const link = params.get('link') || '';
const parsed = CMX.parseDeepLink(link);

const el = {
  heading: document.getElementById('heading'),
  chip: document.getElementById('action-chip'),
  preview: document.getElementById('preview'),
  thumb: document.getElementById('thumb'),
  title: document.getElementById('title'),
  artist: document.getElementById('artist'),
  detail: document.getElementById('detail'),
  open: document.getElementById('open'),
  searchAlt: document.getElementById('search-alt'),
  cancel: document.getElementById('cancel'),
  close: document.getElementById('close'),
  status: document.getElementById('status'),
  help: document.getElementById('help'),
  download: document.getElementById('download'),
  copy: document.getElementById('copy'),
  card: document.getElementById('card')
};

function openExternal(target) {
  const anchor = document.createElement('a');
  anchor.href = target;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function showError(message) {
  el.card.innerHTML = '';
  const box = document.createElement('div');
  box.className = 'error-box';
  box.innerHTML =
    '<strong>Dieser Link kann nicht geöffnet werden.</strong><br />' +
    '<span class="muted tiny"></span>';
  box.querySelector('span').textContent = message;
  el.card.appendChild(box);

  const actions = document.createElement('div');
  actions.className = 'launch-actions';

  const closeButton = document.createElement('button');
  closeButton.className = 'btn';
  closeButton.type = 'button';
  closeButton.textContent = 'Schließen';
  closeButton.addEventListener('click', () => window.close());
  actions.appendChild(closeButton);

  const helpLink = document.createElement('a');
  helpLink.className = 'btn ghost';
  helpLink.href = 'onboarding.html';
  helpLink.textContent = 'Installationshilfe';
  actions.appendChild(helpLink);

  el.card.appendChild(actions);
}

function render() {
  if (!parsed) {
    showError('Die Erweiterung hat keinen gültigen CleanMusic-Link erhalten.');
    return;
  }

  const isSearch = parsed.src === 'search';
  const isAdd = parsed.action === 'add';
  el.chip.textContent = isSearch ? 'Suche' : isAdd ? 'Warteschlange' : 'Wiedergabe';
  el.heading.textContent = isSearch ? 'In CleanMusic suchen' : 'An CleanMusic senden';

  el.title.textContent = parsed.title || (isSearch ? 'Suche' : 'YouTube-Video');
  el.artist.textContent = parsed.artist;
  el.artist.hidden = !parsed.artist;

  if (parsed.src === 'youtube') {
    const thumbnail = CMX.thumbnailUrl(parsed.id);
    if (thumbnail) {
      el.thumb.src = thumbnail;
      el.thumb.hidden = false;
      el.thumb.onerror = () => {
        el.thumb.hidden = true;
      };
    }
    el.detail.textContent = `youtube.com/watch?v=${parsed.id}`;
  } else {
    el.thumb.hidden = true;
    el.detail.textContent = 'Katalogsuche in CleanMusic';
  }

  el.open.href = link;

  const searchQuery = [parsed.artist, parsed.title].filter(Boolean).join(' ');
  if (parsed.src === 'youtube' && searchQuery) {
    el.searchAlt.hidden = false;
    el.searchAlt.addEventListener('click', () => {
      const searchLink = CMX.buildSearchLink(searchQuery);
      if (searchLink) openExternal(searchLink);
      el.status.textContent = 'Suche an CleanMusic gesendet.';
    });
  }

  document.title = `${el.title.textContent} · CleanMusic`;
  el.open.focus();
}

function revealHelpSoon() {
  window.setTimeout(() => {
    if (document.visibilityState === 'visible' && document.hasFocus()) {
      el.help.open = true;
      el.status.textContent = 'Falls sich nichts geöffnet hat: Hilfe unten.';
    }
  }, 2600);
}

el.open.addEventListener('click', () => {
  el.status.textContent = 'CleanMusic wird geöffnet …';
  revealHelpSoon();
});

el.cancel.addEventListener('click', () => window.close());
el.close.addEventListener('click', () => window.close());

el.download.addEventListener('click', () => {
  chrome.tabs.create({ url: 'https://github.com/BellocccYT/cleanmusic/releases/latest' });
});

el.copy.addEventListener('click', () => {
  navigator.clipboard.writeText(link).then(
    () => {
      el.status.textContent = 'Link kopiert.';
    },
    () => {
      el.status.textContent = 'Kopieren nicht möglich.';
    }
  );
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') window.close();
});

render();
