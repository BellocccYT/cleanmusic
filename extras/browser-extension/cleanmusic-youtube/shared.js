'use strict';

/**
 * CleanMusic für YouTube – shared helpers.
 *
 * Loaded before content.js, imported by background.js and included in every
 * extension page. Pure functions only: no DOM, no network, no chrome.* calls,
 * so the same file also runs under Node in the test suite.
 *
 * The extension may only ever launch `cleanmusic://` links, and only with the
 * parameters the CleanMusic app accepts (see parseDeepLink in main.js):
 * add|play + src=deezer|apple|youtube|search + id + optional t/a.
 */

(function (root) {
  const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
  const YT_HOSTS = ['youtube.com', 'music.youtube.com', 'youtube-nocookie.com'];
  const ALLOWED_SRC = ['deezer', 'apple', 'youtube', 'search'];

  /** Every switch lives here; the options page and the content script use it. */
  const DEFAULT_SETTINGS = Object.freeze({
    playerButton: true, // note icon inside the player controls
    actionButton: true, // button next to like / share / save
    floatButton: true, // floating button on YouTube Music and Shorts
    toasts: true, // short on-page confirmations
    badge: true, // check mark on the toolbar icon
    modifierClicks: true // Shift = play now, Alt = search in CleanMusic
  });

  function normalizeText(value, max) {
    return String(value == null ? '' : value)
      .replace(/[\u0000-\u001f\u007f]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max || 200);
  }

  function isYouTubeHost(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    return YT_HOSTS.indexOf(host) !== -1;
  }

  function isYouTubePage(raw) {
    try {
      const url = new URL(String(raw || ''));
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
      return isYouTubeHost(url.hostname);
    } catch {
      return false;
    }
  }

  /** watch?v=, youtu.be/, /shorts/, /embed/, /live/ – nothing else. */
  function parseYouTubeUrl(raw) {
    let url;
    try {
      url = new URL(String(raw || ''));
    } catch {
      return null;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
    const parts = url.pathname.split('/').filter(Boolean);
    let id = '';

    if (host === 'youtu.be') {
      id = parts[0] || '';
    } else if (YT_HOSTS.indexOf(host) !== -1) {
      if (parts[0] === 'watch') id = url.searchParams.get('v') || '';
      else if (['shorts', 'embed', 'live', 'v'].indexOf(parts[0]) !== -1) id = parts[1] || '';
    } else {
      return null;
    }

    return VIDEO_ID.test(id) ? { id } : null;
  }

  function thumbnailUrl(id) {
    return VIDEO_ID.test(String(id || '')) ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : '';
  }

  /** Strips YouTube noise from a page title. */
  function cleanTitle(raw) {
    return normalizeText(raw, 240)
      .replace(/^\(\d+\)\s*/, '')
      .replace(/\s*[-–—]\s*YouTube(\s*Music)?$/i, '')
      .replace(/\s*[(\[](?:official\s+)?(?:music\s+)?(?:video|audio|lyrics?|visualizer|lyric\s+video)[^)\]]*[)\]]/gi, '')
      .replace(/\s*[|\-–—]\s*YouTube(\s*Music)?$/i, '')
      .replace(/\s*#shorts?\b.*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 220);
  }

  /** Channel / byline cleanup, including YouTube Music's "Artist • Album • Year". */
  function cleanArtist(raw) {
    return normalizeText(raw, 200)
      .replace(/\s*[-–—]\s*Topic$/i, '')
      .replace(/\s*VEVO$/i, '')
      .replace(/\s*[•·]\s*.*$/, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 160);
  }

  /** Channel names that are clearly uploaders, not the artist themselves. */
  function looksLikeChannel(name) {
    return /(?:uploads?|records?|label|music|channel|tv|official|media|entertainment|network)$/i.test(
      String(name || '').trim()
    );
  }

  /** "Artist – Song" is common when the channel is not the artist. */
  function splitArtistTitle(title, artist) {
    let nextTitle = cleanTitle(title);
    let nextArtist = cleanArtist(artist);
    const name = /^(youtube|youtube music|various artists|topic|auto-generated)$/i;
    if (nextArtist && name.test(nextArtist)) nextArtist = '';

    if (nextArtist) {
      const lower = nextTitle.toLowerCase();
      const prefix = nextArtist.toLowerCase();
      const stripped = [' - ', ' – ', ' — '].some((sep) => {
        if (!lower.startsWith(prefix + sep)) return false;
        nextTitle = cleanTitle(nextTitle.slice(nextArtist.length + sep.length));
        return true;
      });
      if (!stripped && looksLikeChannel(nextArtist)) {
        const split = nextTitle.match(/^(.{2,80}?)\s+[-–—]\s+(.+)$/);
        if (split) {
          nextArtist = cleanArtist(split[1]);
          nextTitle = cleanTitle(split[2]);
        }
      }
    } else {
      const split = nextTitle.match(/^(.{2,80}?)\s+[-–—]\s+(.+)$/);
      if (split) {
        nextArtist = cleanArtist(split[1]);
        nextTitle = cleanTitle(split[2]);
      }
    }

    return { title: nextTitle, artist: nextArtist };
  }

  /** Turns anything the content script, popup or context menu hands over into a safe video. */
  function cleanVideo(input) {
    if (!input || typeof input !== 'object') return null;
    const id = String(input.id || '');
    if (!VIDEO_ID.test(id)) return null;
    return {
      id,
      title: normalizeText(input.title, 200),
      artist: normalizeText(input.artist, 160),
      url: `https://www.youtube.com/watch?v=${id}`,
      playlist: Boolean(input.playlist)
    };
  }

  function buildDeepLink(action, input) {
    const video = cleanVideo(input);
    if (!video) return '';
    const params = new URLSearchParams();
    params.set('src', 'youtube');
    params.set('id', video.id);
    if (video.title) params.set('t', video.title);
    if (video.artist) params.set('a', video.artist);
    return `cleanmusic://${action === 'play' ? 'play' : 'add'}?${params.toString()}`;
  }

  function buildSearchLink(query) {
    const text = normalizeText(query, 200);
    if (!text) return '';
    return `cleanmusic://play?src=search&t=${encodeURIComponent(text)}`;
  }

  /** Same rules as parseDeepLink() in the app – keeps us from launching anything else. */
  function parseDeepLink(raw) {
    let url;
    try {
      url = new URL(String(raw || ''));
    } catch {
      return null;
    }
    if (url.protocol !== 'cleanmusic:') return null;

    const host = (url.hostname || '').toLowerCase();
    const action = host === 'add' ? 'add' : 'play';
    const src = String(url.searchParams.get('src') || '');
    if (ALLOWED_SRC.indexOf(src) === -1) return null;

    const id = String(url.searchParams.get('id') || '');
    if (src !== 'search' && !VIDEO_ID.test(id)) return null;
    if (src === 'youtube' && !VIDEO_ID.test(id)) return null;

    const title = normalizeText(url.searchParams.get('t'), 200);
    const artist = normalizeText(url.searchParams.get('a'), 200);
    if (src === 'search' && !title) return null;

    return { action, src, id: src === 'search' ? '' : id, title, artist };
  }

  function isAllowedLink(raw) {
    return Boolean(parseDeepLink(raw));
  }

  function settingsWithDefaults(input) {
    const out = Object.assign({}, DEFAULT_SETTINGS);
    if (input && typeof input === 'object') {
      Object.keys(DEFAULT_SETTINGS).forEach((key) => {
        if (typeof input[key] === 'boolean') out[key] = input[key];
      });
    }
    return out;
  }

  const api = {
    VIDEO_ID,
    DEFAULT_SETTINGS,
    normalizeText,
    isYouTubeHost,
    isYouTubePage,
    parseYouTubeUrl,
    thumbnailUrl,
    cleanTitle,
    cleanArtist,
    splitArtistTitle,
    cleanVideo,
    buildDeepLink,
    buildSearchLink,
    parseDeepLink,
    isAllowedLink,
    settingsWithDefaults
  };

  root.CMX = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
