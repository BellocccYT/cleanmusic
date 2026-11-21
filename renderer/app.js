'use strict';

/* ------------------------------------------------------------------ *
 * CleanMusic – renderer
 * ------------------------------------------------------------------ */

(function () {
  const SERVICES = Array.isArray(window.CM_SERVICES) ? window.CM_SERVICES : [];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const ICONS = {
    search:
      '<svg class="ic" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><line x1="16.5" y1="16.5" x2="21" y2="21"></line></svg>',
    folder:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"></path></svg>',
    spark:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3Z"></path></svg>',
    play:
      '<svg class="ic fill" viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z"></path></svg>',
    radio:
      '<svg class="ic" viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="11" rx="2"></rect><path d="M7 14h.01"></path><path d="M10.5 14h.01"></path><path d="M14 14h.01"></path><path d="M3 9l14-5"></path></svg>',
    service:
      '<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"></circle><path d="M4 12h16"></path><path d="M12 4a14 14 0 0 1 0 16"></path><path d="M12 4a14 14 0 0 0 0 16"></path></svg>',
    heart:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M12 20.2s-7.2-4.4-9.2-8.9C1.5 8.1 3.4 4.6 6.9 4.6c2.2 0 3.9 1.3 5.1 3 1.2-1.7 2.9-3 5.1-3 3.5 0 5.4 3.5 4.1 6.7-2 4.5-9.2 8.9-9.2 8.9Z"></path></svg>',
    plus:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
    queueNext:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M4 7h9"></path><path d="M4 12h9"></path><path d="M4 17h5"></path><path d="M15 9.5v9l6-4.5z"></path></svg>',
    list:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M4 6h11"></path><path d="M4 11h11"></path><path d="M4 16h6"></path><path d="M18 18.5V8l3-1"></path><circle cx="16" cy="18.5" r="2"></circle></svg>',
    shuffle:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M16 3h5v5"></path><path d="M4 20 21 3"></path><path d="M21 16v5h-5"></path><path d="M15 15l6 6"></path><path d="M4 4l5 5"></path></svg>',
    edit:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"></path><path d="M13.5 6.5l4 4"></path></svg>',
    trash:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 13h10l1-13"></path><path d="M9 7V4h6v3"></path></svg>',
    close:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12"></path><path d="M18 6 6 18"></path></svg>',
    grip:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M9 6h.01"></path><path d="M15 6h.01"></path><path d="M9 12h.01"></path><path d="M15 12h.01"></path><path d="M9 18h.01"></path><path d="M15 18h.01"></path></svg>',
    plug:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M9 3v5"></path><path d="M15 3v5"></path><path d="M6 8h12v3a6 6 0 0 1-12 0V8Z"></path><path d="M12 17v4"></path></svg>',
    refresh:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"></path><path d="M4 4v4h4"></path><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"></path><path d="M20 20v-4h-4"></path></svg>',
    scissors:
      '<svg class="ic" viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><path d="M20 4 8.1 15.9"></path><path d="M14.5 14.5 20 20"></path><path d="M8.1 8.1 12 12"></path></svg>',
    expand:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>',
    bolt:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"></path></svg>',
    star:
      '<svg class="ic" viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"></path></svg>',
    wave:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M2 12h2l2-6 3 12 3-15 3 18 3-12 2 6h2"></path></svg>',
    note:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>',
    download:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M12 4v11"></path><path d="m7 10 5 5 5-5"></path><path d="M5 20h14"></path></svg>',
    file:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"></path><path d="M14 3v5h5"></path><path d="M10 13.5v4l3.5-2z"></path></svg>',
    copy:
      '<svg class="ic" viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
    discord:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M8 7.5c2.6-.9 5.4-.9 8 0"></path><path d="M7 16.5c3.2 1.2 6.8 1.2 10 0"></path><path d="M6.5 6.5 5 9c-1.2 2.8-1.6 5.6-1 8.5 1.5 1.2 3 1.9 4.5 2.2l1-2"></path><path d="m17.5 6.5 1.5 2.5c1.2 2.8 1.6 5.6 1 8.5-1.5 1.2-3 1.9-4.5 2.2l-1-2"></path><circle cx="9.5" cy="12.5" r="1"></circle><circle cx="14.5" cy="12.5" r="1"></circle></svg>',
  };

  const PLAY_SVG = '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5-11-6.5Z"></path></svg>';
  const EQ = '<span class="eq"><span></span></span>';

  const RADIO_TAGS = [
    ['pop', 'Pop'],
    ['rock', 'Rock'],
    ['electronic', 'Electronic'],
    ['jazz', 'Jazz'],
    ['classical', 'Klassik'],
    ['hip hop', 'Hip-Hop'],
    ['chillout', 'Chillout'],
    ['techno', 'Techno'],
    ['house', 'House'],
    ['metal', 'Metal'],
    ['country', 'Country'],
    ['schlager', 'Schlager'],
    ['news', 'News'],
    ['80s', '80s'],
    ['90s', '90s'],
  ];

  const STORAGE = {
    settings: 'cleanmusic.settings.v1',
    library: 'cleanmusic.library.v1',
    volume: 'cleanmusic.volume.v1', // 0.7 and older: linear element volume
    level: 'cleanmusic.volume.v2', // { level (slider, 0–1.5), muted }
    playback: 'cleanmusic.playback.v1',
    collection: 'cleanmusic.collection.v1',
    matches: 'cleanmusic.matches.v1',
    recs: 'cleanmusic.recs.v1',
    credits: 'cleanmusic.credits.v1',
    openverseCache: 'cleanmusic.ovcache.v1',
    downloads: 'cleanmusic.downloads.v1', // entry id → { path, at }
    creatorDownloads: 'cleanmusic.creatordl.v1', // [{ path, name, service, at }]
    seenVersion: 'cleanmusic.seenversion.v1', // last version the user saw "what's new" for
    history: 'cleanmusic.history.v1', // [{ entry, plays, first, last }]
  };

  const FIRST_RUN = (() => {
    try {
      return [STORAGE.settings, STORAGE.collection, STORAGE.library].every((key) => localStorage.getItem(key) === null);
    } catch {
      return false;
    }
  })();

  const RECS_MAX_AGE = 6 * 60 * 60 * 1000;

  // Needed while `state` is initialised (loadCollection / restoreRecs).
  // 'stream' = a full, directly playable file (free music, sound effects).
  const ENTRY_KINDS = ['preview', 'plugin', 'stream', 'local', 'radio'];
  const ENTRY_FIELDS = [
    'id', 'kind', 'source', 'sourceLabel', 'title', 'artist', 'album', 'artwork',
    'duration', 'url', 'link', 'artistId', 'pluginId', 'refId', 'path', 'dir', 'meta',
    'license', 'licenseUrl', 'credit', 'category', 'addedAt',
  ];

  const bridge = window.cm || {
    pickFolder: async () => {
      toast('Ordner-Auswahl gibt es nur in der Desktop-App.');
      return null;
    },
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener');
      return true;
    },
    getInfo: async () => ({ platform: 'browser', widevine: null }),
    clearServiceData: async () => false,
    openMusickit: async () => toast('MusicKit gibt es nur in der Desktop-App.'),
    spotifyPlaylistLink: async () => ({ error: 'Nur in der Desktop-App verfügbar.' }),
    pluginPlaylist: async () => ({ name: '', items: [], error: 'Nur in der Desktop-App verfügbar.' }),
    playlistImportFile: async () => ({ error: 'Nur in der Desktop-App verfügbar.' }),
    playlistMatch: async () => ({ matches: [] }),
    searchCatalog: async () => ({
      tracks: [],
      errors: [{ source: 'Suche', message: 'Nur in der Desktop-App verfügbar.' }],
      sources: null,
    }),
    topTracks: async () => ({ tracks: [], errors: [] }),
    radioStations: async () => ({
      stations: [],
      error: 'Radio gibt es nur in der Desktop-App.',
    }),
    refreshPreview: async () => ({ url: null }),
    recommendations: async () => ({ tracks: [], videos: [], seeds: [], errors: [] }),
    pluginsList: async () => ({ dirs: [], plugins: [] }),
    pluginSetEnabled: async () => ({ dirs: [], plugins: [] }),
    pluginAction: async () => ({ dirs: [], plugins: [], error: 'Nur in der Desktop-App verfügbar.' }),
    pluginOpenFolder: async () => ({ dir: null, error: 'Nur in der Desktop-App verfügbar.' }),
    pluginSearch: async () => ({ results: [], error: 'Nur in der Desktop-App verfügbar.' }),
    pluginResolve: async () => ({ ok: false, error: 'Nur in der Desktop-App verfügbar.' }),
    pluginMatch: async () => ({ ok: false, error: 'Nur in der Desktop-App verfügbar.' }),
    creatorPlaylist: async () => ({ tracks: [], error: 'Nur in der Desktop-App verfügbar.' }),
    creatorOpenverse: async () => ({ items: [], more: false, error: 'Nur in der Desktop-App verfügbar.' }),
    copyText: async (text) => {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
    discordGet: async () => ({ config: { enabled: false, clientId: '', showArtwork: true }, status: {} }),
    discordSet: async () => ({ config: { enabled: false, clientId: '', showArtwork: true }, status: {} }),
    discordUpdate: () => {},
    onDiscordStatus: () => {},
  };

  const supportsWebview = bridge.isElectron === true;

  const state = {
    view: 'home',
    currentService: null,
    currentPlaylist: null,
    query: '',
    views: new Map(),
    info: null,
    library: { tracks: [], entries: [], folder: null },
    search: { query: '', tracks: [], loading: false, errors: [], sources: null },
    charts: { tracks: [], loading: false, loaded: false, errors: [] },
    releases: { tracks: [], loading: false, loaded: false, error: null },
    pluginCharts: { pluginId: null, items: [], loading: false, loaded: false, error: null },
    trend: 'charts', // 'charts' | 'releases' on the home page
    radio: { stations: [], entries: [], loading: false, loaded: false, error: null, tag: '', query: '' },
    plugins: { list: [], dirs: [], loading: false, loaded: false },
    pluginSearch: { pluginId: null, query: '', results: [], loading: false, error: null },
    recs: Object.assign(
      { tracks: [], seeds: [], loading: false, loaded: false, error: null, seedKey: '', at: 0 },
      restoreRecs()
    ),
    queue: { items: [], index: -1, kind: 'local', upcoming: -1 },
    nowMode: null,
    nowLabel: null,
    retry: null,
    favFilter: 'all',
    creator: {
      tab: 'ncs',
      category: { ncs: 'top', classics: 'lustig', sfx: 'whoosh', games: 'retro', free: 'cinematic' },
      query: { sfx: '', games: '', free: '' },
      lists: {},
    },
    credits: (readJSON(STORAGE.credits, []) || []).filter(
      (item) => item && typeof item.id === 'string' && typeof item.credit === 'string'
    ),
    discord: { config: { enabled: false, clientId: '', showArtwork: true }, status: {} },
    fullscreen: false,
    collection: loadCollection(),
    matches: readJSON(STORAGE.matches, {}) || {},
    playback: Object.assign(
      { shuffle: false, repeat: 'off' },
      readJSON(STORAGE.playback, {})
    ),
    settings: Object.assign(
      {
        systemBrowser: false,
        fullTracks: true,
        visualizer: true,
        vizStyle: 'radial',
        miniViz: true,
        normalize: false,
        volumeBoost: false,
        bass: 0, // dB, −6 … +9
        treble: 0, // dB, −6 … +6
        theme: 'nacht',
        coverAccent: false,
        autoplay: true, // suggestions after single titles (search)
        onboarded: false,
        downloads: 'off', // 'off' | 'cutting' – there is deliberately no "everything"
        downloadDir: '',
      },
      readJSON(STORAGE.settings, {})
    ),
  };

  // 0.5.0 settings → plugin settings.
  if (state.settings.ytFull === false) state.settings.fullTracks = false;
  delete state.settings.ytFull;
  delete state.settings.ytdlp;

  const audio = $('#audio');
  let favIds = new Set(state.collection.favorites.map((entry) => entry.id));
  let toastTimer = null;
  let searchRequestId = 0;
  let pluginSearchRequestId = 0;
  let playToken = 0;
  let prefetchTimer = null;
  let recsTimer = null;
  let serviceMenuEntry = null;
  let ctxEntries = [];
  let drag = null;

  /* ---------------------------------------------------------------- *
   * Helpers
   * ---------------------------------------------------------------- */

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or unavailable */
    }
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        default: return '&#39;';
      }
    });
  }

  function fmtTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  function fmtLong(seconds) {
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} Min.`;
    const hours = Math.floor(minutes / 60);
    return `${hours} Std. ${minutes % 60} Min.`;
  }

  function fmtSize(bytes) {
    if (!bytes) return '–';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  function formatList(items) {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} und ${items[items.length - 1]}`;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function normKey(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\b(feat|ft|featuring)\b.*$/g, '')
      .replace(/[^a-z0-9äöüß]+/g, ' ')
      .trim();
  }

  function matchKey(entry) {
    return `${normKey(entry.artist)}|${normKey(entry.title)}`;
  }

  function shuffled(list) {
    const copy = list.slice();
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[other]] = [copy[other], copy[index]];
    }
    return copy;
  }

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  function serviceById(id) {
    return SERVICES.find((service) => service.id === id) || null;
  }

  function saveSettings() {
    writeJSON(STORAGE.settings, state.settings);
  }

  function pluginById(id) {
    return state.plugins.list.find((plugin) => plugin.id === id) || null;
  }

  function isPluginReady(plugin) {
    return Boolean(plugin && plugin.enabled && plugin.loaded && plugin.status && plugin.status.ready);
  }

  function pluginReady(id) {
    return isPluginReady(pluginById(id));
  }

  function readyPlugins(capability) {
    return state.plugins.list.filter(
      (plugin) => isPluginReady(plugin) && (!capability || plugin.capabilities[capability])
    );
  }

  function anyPluginReady() {
    return readyPlugins().length > 0;
  }

  function searchPlugin() {
    return readyPlugins('search')[0] || null;
  }

  function matchPlugin() {
    return readyPlugins('match')[0] || null;
  }

  function fullMode() {
    return Boolean(matchPlugin()) && state.settings.fullTracks !== false;
  }

  function currentItem() {
    return state.queue.items[state.queue.index] || null;
  }

  /* ---------------------------------------------------------------- *
   * Entries – one shape for every playable thing
   * ---------------------------------------------------------------- */

  function previewEntry(track) {
    return {
      id: String(track.id),
      kind: 'preview',
      source: track.source || 'deezer',
      sourceLabel: track.sourceLabel || 'Vorschau',
      title: track.title || 'Unbekannt',
      artist: track.artist || '',
      album: track.album || '',
      artwork: track.artwork || '',
      duration: Number(track.duration) || 0,
      url: track.preview || track.url || '',
      link: track.link || '',
      artistId: track.artistId || null,
    };
  }

  function pluginEntry(plugin, item) {
    return {
      id: `p:${plugin.id}:${item.id}`,
      kind: 'plugin',
      pluginId: plugin.id,
      refId: String(item.id),
      source: plugin.source.id,
      sourceLabel: plugin.source.label,
      title: item.title || 'Unbekannt',
      artist: item.artist || '',
      album: '',
      artwork: item.artwork || '',
      duration: Number(item.duration) || 0,
      url: '',
      link: item.link || '',
    };
  }

  // Favourites saved by 0.5.0 (before plugins existed).
  function migrateEntry(entry) {
    if (!entry || entry.kind !== 'youtube' || !entry.ytId) return entry;
    const next = Object.assign({}, entry, {
      id: `p:ytdlp:${entry.ytId}`,
      kind: 'plugin',
      pluginId: 'ytdlp',
      refId: entry.ytId,
    });
    delete next.ytId;
    return next;
  }

  function ncsEntry(track) {
    const entry = previewEntry(track);
    entry.license = 'NCS';
    entry.licenseUrl = 'https://ncs.io/usage-policy';
    entry.credit =
      `Song: ${entry.artist ? `${entry.artist} - ` : ''}${entry.title} [NCS Release]\n` +
      'Music provided by NoCopyrightSounds\n' +
      `Free Download/Stream: https://ncs.io/music-search?q=${encodeURIComponent(entry.title)}`;
    return entry;
  }

  function classicEntry(track) {
    return {
      id: track.id,
      kind: 'stream',
      source: 'incompetech',
      sourceLabel: 'incompetech',
      title: track.title,
      artist: track.artist,
      album: '',
      artwork: '',
      duration: 0,
      url: track.url,
      link: track.url,
      license: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      credit:
        `"${track.title}" Kevin MacLeod (incompetech.com)\n` +
        'Licensed under Creative Commons: By Attribution 4.0 License\n' +
        'http://creativecommons.org/licenses/by/4.0/',
      category: track.category,
    };
  }

  function openverseEntry(item) {
    return {
      id: String(item.id),
      kind: 'stream',
      source: String(item.source || 'openverse'),
      sourceLabel: item.sourceLabel || 'Openverse',
      title: item.title || 'Unbekannt',
      artist: item.artist || '',
      album: '',
      artwork: item.artwork || '',
      duration: Number(item.duration) || 0,
      url: item.url,
      link: item.link || '',
      license: item.license || '',
      licenseUrl: item.licenseUrl || '',
      credit: item.credit || '',
      meta: Array.isArray(item.tags) ? item.tags.join(' · ') : '',
    };
  }

  function licenseKey(license) {
    const value = String(license || '').toLowerCase();
    if (value === 'cc0' || value === 'public domain') return 'free';
    if (value === 'ncs') return 'ncs';
    if (value.startsWith('cc by')) return 'by';
    return 'other';
  }

  function localEntry(track) {
    return {
      id: `local:${track.path}`,
      kind: 'local',
      source: 'local',
      sourceLabel: 'Lokal',
      title: track.title || track.name || 'Unbekannt',
      artist: track.artist || '',
      album: '',
      artwork: '',
      duration: 0,
      url: track.url,
      link: '',
      path: track.path,
      dir: track.dir || '',
    };
  }

  function radioEntry(station) {
    return {
      id: `radio:${station.id}`,
      kind: 'radio',
      source: 'radio',
      sourceLabel: 'Radio',
      title: station.name,
      artist:
        [station.country, ...(station.tags || [])]
          .filter(Boolean)
          .slice(0, 2)
          .join(' · ') || 'Live Radio',
      album: '',
      artwork: station.favicon || '',
      duration: 0,
      url: station.url,
      link: station.homepage || '',
      meta: [
        station.country,
        station.codec,
        station.bitrate ? `${station.bitrate} kbps` : '',
      ]
        .filter(Boolean)
        .join(' · '),
    };
  }

  function storable(entry) {
    const out = {};
    ENTRY_FIELDS.forEach((key) => {
      const value = entry[key];
      if (value !== undefined && value !== null && value !== '') out[key] = value;
    });
    if (!out.addedAt) out.addedAt = Date.now();
    return out;
  }

  function validEntry(entry) {
    return (
      entry &&
      typeof entry.id === 'string' &&
      typeof entry.title === 'string' &&
      ENTRY_KINDS.includes(entry.kind)
    );
  }

  /* ---------------------------------------------------------------- *
   * Collection: favourites + playlists
   * ---------------------------------------------------------------- */

  function loadCollection() {
    const raw = readJSON(STORAGE.collection, null) || {};
    const favorites = Array.isArray(raw.favorites)
      ? raw.favorites.map(migrateEntry).filter(validEntry)
      : [];
    const playlists = Array.isArray(raw.playlists)
      ? raw.playlists
          .filter((playlist) => playlist && typeof playlist.id === 'string')
          .map((playlist) => ({
            id: playlist.id,
            name: String(playlist.name || 'Playlist').slice(0, 80),
            createdAt: Number(playlist.createdAt) || Date.now(),
            updatedAt: Number(playlist.updatedAt) || Date.now(),
            items: Array.isArray(playlist.items)
              ? playlist.items.map(migrateEntry).filter(validEntry)
              : [],
          }))
      : [];

    return { favorites, playlists };
  }

  function persistCollection() {
    writeJSON(STORAGE.collection, state.collection);
  }

  function onCollectionChanged(what = {}) {
    favIds = new Set(state.collection.favorites.map((entry) => entry.id));
    persistCollection();
    renderLibraryNav();
    syncFavButtons();
    renderFavorites();
    if (state.currentPlaylist) renderPlaylist();
    updateNowPlayingActions();
    updateStatusChips();
    if (what.favorites) scheduleRecsRefresh();
  }

  function toggleFavorite(entry) {
    if (!entry) return;

    const index = state.collection.favorites.findIndex((item) => item.id === entry.id);
    if (index === -1) {
      state.collection.favorites.unshift(storable(Object.assign({}, entry, { addedAt: 0 })));
      toast(`♥ „${entry.title}“ in Favoriten`);
    } else {
      state.collection.favorites.splice(index, 1);
      toast(`„${entry.title}“ aus Favoriten entfernt`);
    }

    onCollectionChanged({ favorites: true });
  }

  function playlistById(id) {
    return state.collection.playlists.find((playlist) => playlist.id === id) || null;
  }

  function createPlaylist(name) {
    const playlist = {
      id: uid(),
      name: String(name || 'Playlist').trim().slice(0, 80) || 'Playlist',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      items: [],
    };
    state.collection.playlists.push(playlist);
    onCollectionChanged({ playlists: true });
    return playlist;
  }

  function addToPlaylist(id, entries) {
    const playlist = playlistById(id);
    if (!playlist) return;

    const known = new Set(playlist.items.map((entry) => entry.id));
    const fresh = [];
    entries.forEach((entry) => {
      if (!entry || known.has(entry.id)) return;
      known.add(entry.id);
      fresh.push(entry);
    });

    fresh.forEach((entry) => playlist.items.push(storable(Object.assign({}, entry, { addedAt: 0 }))));
    playlist.updatedAt = Date.now();
    onCollectionChanged({ playlists: true });

    if (!fresh.length) toast(`Schon in „${playlist.name}“`);
    else if (fresh.length === 1) toast(`„${fresh[0].title}“ → ${playlist.name}`);
    else toast(`${fresh.length} Titel → ${playlist.name}`);
  }

  function removeFromPlaylist(id, index) {
    const playlist = playlistById(id);
    if (!playlist || !playlist.items[index]) return;
    const [removed] = playlist.items.splice(index, 1);
    playlist.updatedAt = Date.now();
    onCollectionChanged({ playlists: true });
    toast(`„${removed.title}“ entfernt`);
  }

  function movePlaylistItem(id, from, to) {
    const playlist = playlistById(id);
    if (!playlist) return;
    if (from === to || from < 0 || from >= playlist.items.length) return;
    const target = Math.max(0, Math.min(playlist.items.length - 1, to));
    const [item] = playlist.items.splice(from, 1);
    playlist.items.splice(target, 0, item);
    playlist.updatedAt = Date.now();
    onCollectionChanged({ playlists: true });
  }

  async function promptNewPlaylist(entries = []) {
    const name = await askText({
      title: 'Neue Playlist',
      text: entries.length === 1 ? `Mit „${entries[0].title}“ als erstem Titel.` : '',
      value: `Playlist ${state.collection.playlists.length + 1}`,
      confirm: 'Erstellen',
    });
    if (!name) return null;

    const playlist = createPlaylist(name);
    if (entries.length) addToPlaylist(playlist.id, entries);
    else toast(`Playlist „${playlist.name}“ erstellt`);
    return playlist;
  }

  async function renamePlaylist(id) {
    const playlist = playlistById(id);
    if (!playlist) return;
    const name = await askText({ title: 'Playlist umbenennen', value: playlist.name, confirm: 'Speichern' });
    if (!name || name === playlist.name) return;
    playlist.name = name.slice(0, 80);
    playlist.updatedAt = Date.now();
    onCollectionChanged({ playlists: true });
  }

  async function deletePlaylist(id) {
    const playlist = playlistById(id);
    if (!playlist) return;
    const ok = await askConfirm({
      title: `„${playlist.name}“ löschen?`,
      text: `${playlist.items.length} Titel. Die Titel selbst bleiben erhalten (Favoriten, lokale Dateien).`,
      confirm: 'Löschen',
      danger: true,
    });
    if (!ok) return;

    state.collection.playlists = state.collection.playlists.filter((item) => item.id !== id);
    if (state.currentPlaylist === id) {
      state.currentPlaylist = null;
      showView('favorites');
    }
    onCollectionChanged({ playlists: true });
    toast(`Playlist „${playlist.name}“ gelöscht`);
  }

  function updateStoredUrl(id, url, artwork) {
    let changed = false;
    const apply = (entry) => {
      if (entry.id !== id) return;
      if (entry.url !== url) {
        entry.url = url;
        changed = true;
      }
      if (artwork && !entry.artwork) {
        entry.artwork = artwork;
        changed = true;
      }
    };
    state.collection.favorites.forEach(apply);
    state.collection.playlists.forEach((playlist) => playlist.items.forEach(apply));
    if (changed) persistCollection();
  }

  /* ---------------------------------------------------------------- *
   * Lists – every rendered row points to (list key, index)
   * ---------------------------------------------------------------- */

  function filteredFavorites() {
    const all = state.collection.favorites;
    if (state.favFilter === 'radio') return all.filter((entry) => entry.kind === 'radio');
    if (state.favFilter === 'tracks') return all.filter((entry) => entry.kind !== 'radio');
    return all;
  }

  function visibleRecs() {
    return state.recs.tracks.filter((entry) => entry.kind !== 'plugin' || pluginReady(entry.pluginId));
  }

  function listEntries(key) {
    switch (key) {
      case 'search': return state.search.tracks;
      case 'charts': return state.charts.tracks;
      case 'ext': return state.pluginSearch.results;
      case 'creator': return creatorItems();
      case 'recs': return visibleRecs();
      case 'favorites': return filteredFavorites();
      case 'local': return state.library.entries;
      case 'radio': return state.radio.entries;
      case 'releases': return state.releases.tracks;
      case 'pcharts': return state.pluginCharts.items;
      case 'rediscover': return rediscoverEntries();
      default:
        if (key && key.startsWith('playlist:')) {
          const playlist = playlistById(key.slice(9));
          return playlist ? playlist.items : [];
        }
        return [];
    }
  }

  function entryAt(key, index) {
    return listEntries(key)[index] || null;
  }

  function playList(key, index) {
    const list = listEntries(key);
    const entry = list[index];
    if (!entry) return;
    // A search hit plays on its own – autoplay continues with suggestions
    // instead of the other search results.
    const single = autoplayOn() && SINGLE_CONTEXTS.includes(key);
    const items = single ? [entry] : list.slice();
    const start = single ? 0 : index;
    // Titles the user queued stay queued when another list starts.
    const pending = state.queue.items.length ? pendingQueued() : [];
    items.splice(start + 1, 0, ...pending);
    state.queue = { items, index: start, kind: key, upcoming: -1 };
    playFromQueue(start);
  }

  function playListShuffled(key) {
    const items = listEntries(key);
    if (!items.length) return;
    if (!state.playback.shuffle) {
      state.playback.shuffle = true;
      writeJSON(STORAGE.playback, state.playback);
      syncPlaybackButtons();
    }
    playList(key, Math.floor(Math.random() * items.length));
  }

  /* ---------------------------------------------------------------- *
   * Rows and cards
   * ---------------------------------------------------------------- */

  function isPlayingId(id) {
    const current = currentItem();
    return Boolean(current && id && current.id === id);
  }

  function favButton(entry, className = 'icon-btn') {
    const on = favIds.has(entry.id);
    return `<button class="${className} fav ${on ? 'on' : ''}" data-act="fav" title="${
      on ? 'Aus Favoriten entfernen' : 'Zu Favoriten'
    }">${ICONS.heart}</button>`;
  }

  function lengthBadge(entry) {
    if (entry.kind === 'radio') return '<span class="song-preview live">LIVE</span>';

    if (entry.kind === 'preview') {
      return fullMode()
        ? `<span class="song-preview full" title="Voller Titel über ${esc(matchPlugin().source.label)} (Plugin)">${
            entry.duration ? fmtTime(entry.duration) : 'Voll'
          }</span>`
        : '<span class="song-preview" title="30-Sekunden-Vorschau">30 s</span>';
    }

    if (entry.kind === 'stream' && !entry.duration) return '<span class="song-preview full">Voll</span>';

    return `<span class="song-preview">${entry.duration ? fmtTime(entry.duration) : ''}</span>`;
  }

  function songArt(entry) {
    if (entry.artwork) {
      return `<img src="${esc(entry.artwork)}" alt="" loading="lazy" draggable="false" />`;
    }
    if (entry.kind === 'radio') return `<span class="art-ic">${ICONS.radio}</span>`;
    if (entry.license === 'NCS') return `<span class="art-tile" data-tone="ncs">${ICONS.bolt}</span>`;
    if (entry.kind === 'stream') {
      const tone = entry.category || licenseKey(entry.license);
      return `<span class="art-tile" data-tone="${esc(tone)}">${
        entry.source === 'freesound' ? ICONS.wave : ICONS.note
      }</span>`;
    }
    return '<span>♪</span>';
  }

  function licenseBadge(entry) {
    if (!entry.license) return '';
    return `<span class="lic-badge" data-lic="${licenseKey(entry.license)}" title="${esc(
      entry.license === 'NCS' ? 'NCS – frei für Videos mit Credit' : `Lizenz: ${entry.license}`
    )}">${esc(entry.license)}</span>`;
  }

  function songRow(entry, index, listKey, options = {}) {
    const playing = isPlayingId(entry.id);
    const sub =
      [entry.artist, entry.album].filter(Boolean).join(' · ') ||
      (entry.kind === 'local' ? entry.dir || 'Lokale Datei' : entry.meta || '');
    const searchable = entry.kind !== 'radio' && entry.kind !== 'stream';

    return `
      <div class="song-row ${playing ? 'playing' : ''} ${options.handle ? 'has-handle' : ''}"
        data-list="${esc(listKey)}" data-index="${index}" data-track-id="${esc(entry.id)}"
        role="button" tabindex="0" draggable="true">
        ${options.handle ? `<span class="drag-handle" title="Ziehen zum Sortieren">${ICONS.grip}</span>` : ''}
        <div class="song-art">${songArt(entry)}</div>
        <div class="song-info">
          <div class="song-title">${esc(entry.title)}</div>
          <div class="song-sub">${esc(sub)}</div>
        </div>
        <span class="song-badges">
          <span class="song-source" data-source="${esc(entry.source || entry.kind)}">${esc(
            entry.sourceLabel || ''
          )}</span>
          ${licenseBadge(entry)}
        </span>
        ${lengthBadge(entry)}
        <div class="song-actions">
          ${downloadButton(entry)}
          ${
            entry.credit
              ? `<button class="icon-btn credit-btn" data-act="credit" title="Credit kopieren & in Video-Credits sammeln">${ICONS.copy}</button>`
              : ''
          }
          ${favButton(entry)}
          <button class="icon-btn" data-act="add" title="Zur Playlist hinzufügen">${ICONS.plus}</button>
          ${
            searchable
              ? `<button class="icon-btn" data-act="services" title="In einem Dienst suchen">${ICONS.service}</button>`
              : ''
          }
          ${entry.link ? '<button class="icon-btn" data-act="link" title="Im Dienst öffnen">↗</button>' : ''}
          ${
            options.removable
              ? `<button class="icon-btn" data-act="remove" title="Aus der Playlist entfernen">${ICONS.close}</button>`
              : ''
          }
          <button class="icon-btn song-play" data-act="play" title="Abspielen">${PLAY_SVG}</button>
        </div>
      </div>`;
  }

  function chartCard(entry, index, listKey) {
    const playing = isPlayingId(entry.id);

    return `
      <article
        class="chart-card ${playing ? 'playing' : ''}"
        data-list="${esc(listKey)}" data-index="${index}" data-track-id="${esc(entry.id)}"
        draggable="true"
        title="${esc(entry.title)}${entry.artist ? ` – ${esc(entry.artist)}` : ''}"
      >
        <div class="chart-art">
          ${
            entry.artwork
              ? `<img src="${esc(entry.artwork)}" alt="" loading="lazy" draggable="false" />`
              : '<span class="chart-fallback">♪</span>'
          }
          <div class="chart-play"><span>${ICONS.play}</span></div>
          ${entry.kind === 'plugin' ? `<span class="card-tag">${esc(entry.sourceLabel || 'Plugin')}</span>` : ''}
          ${favButton(entry, 'card-fav')}
        </div>
        <div class="chart-title">${esc(entry.title)}</div>
        <div class="chart-sub">${esc(entry.artist)}</div>
      </article>`;
  }

  function syncFavButtons() {
    $$('[data-act="fav"]').forEach((button) => {
      const holder = button.closest('[data-track-id]');
      const on = Boolean(holder && favIds.has(holder.dataset.trackId));
      button.classList.toggle('on', on);
      button.title = on ? 'Aus Favoriten entfernen' : 'Zu Favoriten';
    });
  }

  /* ---------------------------------------------------------------- *
   * Dialog + popover menus
   * ---------------------------------------------------------------- */

  function openDialog({ title, text = '', html = '', value = '', input = true, confirm = 'OK', danger = false, info = false }) {
    return new Promise((resolve) => {
      const root = $('#dialog');
      const form = $('#dialog-form');
      const field = $('#dialog-input');
      const ok = $('#dialog-ok');
      const cancel = $('#dialog-cancel');
      const textEl = $('#dialog-text');

      hideMenus();
      $('#dialog-title').textContent = title;
      if (html) textEl.innerHTML = html;
      else textEl.textContent = text;
      textEl.hidden = !text && !html;
      textEl.classList.toggle('dialog-rich', Boolean(html));
      cancel.hidden = info;
      field.hidden = !input;
      field.value = value;
      ok.textContent = confirm;
      ok.classList.toggle('danger', danger);
      root.hidden = false;

      requestAnimationFrame(() => {
        if (input) {
          field.focus();
          field.select();
        } else {
          ok.focus();
        }
      });

      const finish = (result) => {
        root.hidden = true;
        cancel.hidden = false;
        form.removeEventListener('submit', onSubmit);
        cancel.removeEventListener('click', onCancel);
        root.removeEventListener('mousedown', onBackdrop);
        document.removeEventListener('keydown', onKey, true);
        resolve(result);
      };

      const onSubmit = (event) => {
        event.preventDefault();
        if (!input) return finish(true);
        const result = field.value.trim();
        if (!result) {
          field.focus();
          return undefined;
        }
        return finish(result);
      };
      const onCancel = () => finish(input ? null : false);
      const onBackdrop = (event) => {
        if (event.target === root) onCancel();
      };
      const onKey = (event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onCancel();
        }
      };

      form.addEventListener('submit', onSubmit);
      cancel.addEventListener('click', onCancel);
      root.addEventListener('mousedown', onBackdrop);
      document.addEventListener('keydown', onKey, true);
    });
  }

  const SHORTCUTS = [
    ['Strg + K', 'Suche'],
    ['F', 'Vollbild-Player an/aus'],
    ['M', 'Ton aus/an'],
    ['+ / −', 'Lautstärke'],
    ['Leertaste / K', 'Play/Pause (im Vollbild)'],
    ['← / →', '5 Sekunden zurück/vor (im Vollbild)'],
    ['↑ / ↓', 'Lautstärke (im Vollbild)'],
    ['N / P', 'Nächster/vorheriger Titel (im Vollbild)'],
    ['Esc', 'Vollbild, Menü oder Dialog schließen'],
    ['Medientasten', 'Play/Pause, Weiter, Zurück – auch im Hintergrund'],
    ['?', 'Diese Übersicht'],
  ];

  function showShortcuts() {
    if (!$('#dialog').hidden) return;
    const rows = SHORTCUTS.map(([keys, what]) => `<span class="kbd-row"><kbd>${esc(keys)}</kbd><span>${esc(what)}</span></span>`).join('');
    openDialog({ title: 'Tastenkürzel', html: `<span class="kbd-grid">${rows}</span>`, input: false, confirm: 'Schließen', info: true });
  }

  function askText(options) {
    return openDialog(Object.assign({ input: true }, options));
  }

  function askConfirm(options) {
    return openDialog(Object.assign({ input: false }, options));
  }

  function isYouTubePlaylistLink(value) {
    try {
      const url = new URL(String(value || ''));
      return ['music.youtube.com', 'www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname.toLowerCase()) &&
        Boolean(url.searchParams.get('list'));
    } catch {
      return false;
    }
  }

  const YOUTUBE_PLAYLIST_PLUGIN_MESSAGE = 'Für YouTube-Music-Links brauchst du ein aktives Quellen-Plugin mit Playlist-Import. Alternativ die Playlist auf tunemymusic.com als CSV exportieren und hier über Datei wählen laden.';

  function uniquePlaylistName(value, fallback) {
    const baseName = String(value || fallback).trim().slice(0, 80) || fallback;
    let name = baseName;
    let suffix = 2;
    const known = new Set(state.collection.playlists.map((playlist) => playlist.name.toLocaleLowerCase()));
    while (known.has(name.toLocaleLowerCase())) {
      const ending = ` (${suffix})`;
      name = `${baseName.slice(0, 80 - ending.length)}${ending}`;
      suffix += 1;
    }
    return name;
  }

  async function importSpotifyPlaylist(data, cancelled = () => false, onProgress = () => {}) {
    const sourceTracks = Array.isArray(data && data.tracks) ? data.tracks.slice(0, 2000) : [];
    const entries = [];
    const missing = [];
    let processed = 0;
    for (let offset = 0; offset < sourceTracks.length; offset += 10) {
      if (cancelled()) return { cancelled: true };
      const batch = sourceTracks.slice(offset, offset + 10);
      const result = await bridge.playlistMatch(batch);
      const matches = Array.isArray(result && result.matches) ? result.matches : [];
      batch.forEach((track, index) => {
        const match = matches[index];
        if (match && match.preview) entries.push(previewEntry(match));
        else missing.push({ title: String(track.title || 'Unbekannt'), artist: String(track.artist || '') });
      });
      processed += batch.length;
      onProgress({ found: entries.length, total: sourceTracks.length, processed });
    }
    if (cancelled()) return { cancelled: true };

    const name = uniquePlaylistName(data && data.name, 'Spotify-Playlist');
    const playlist = createPlaylist(name);
    if (entries.length) addToPlaylist(playlist.id, entries);
    return {
      playlistId: playlist.id,
      name: playlist.name,
      requested: sourceTracks.length,
      imported: playlist.items.length,
      missing,
      limited: Boolean(data && data.limited),
      limitMessage: String((data && data.limitMessage) || ''),
    };
  }

  function importPluginPlaylist(plugin, data) {
    const items = Array.isArray(data && data.items) ? data.items.slice(0, 2000) : [];
    const entries = items.map((item) => pluginEntry(plugin, item)).filter(Boolean);
    const name = uniquePlaylistName(data && data.name, 'YouTube Music Playlist');
    const playlist = createPlaylist(name);
    if (entries.length) addToPlaylist(playlist.id, entries);
    return { playlistId: playlist.id, name: playlist.name, requested: items.length, imported: entries.length };
  }

  function spotifyImportProgressHtml(progress) {
    return `<p class="spotify-progress-head">${esc(progress.found)} / ${esc(progress.total)} gefunden …</p>
      <small class="muted">${esc(progress.processed)} von ${esc(progress.total)} Titeln geprüft</small>
      <div class="spotify-progress"><i style="width:${progress.total ? Math.round((progress.processed / progress.total) * 100) : 0}%"></i></div>`;
  }

  function openPlaylistImportDialog() {
    if (!bridge.isElectron) {
      toast('Der Playlist-Import ist nur in der Desktop-App verfügbar.');
      return;
    }
    const root = $('#dialog');
    const form = $('#dialog-form');
    const field = $('#dialog-input');
    const ok = $('#dialog-ok');
    const cancel = $('#dialog-cancel');
    const textEl = $('#dialog-text');
    let cancelled = false;
    let done = false;
    let generation = 0;

    const finish = () => {
      if (done) return;
      done = true;
      generation += 1;
      root.hidden = true;
      field.hidden = false;
      ok.hidden = false;
      cancel.hidden = false;
      cancel.textContent = 'Abbrechen';
      textEl.classList.remove('dialog-rich');
      textEl.classList.remove('spotify-import-body');
      form.classList.remove('spotify-import-dialog');
      delete textEl._spotifyMissingText;
      delete textEl._spotifyPlaylists;
      textEl.removeEventListener('click', onAction);
      form.removeEventListener('submit', onSubmit);
      cancel.removeEventListener('click', onCancel);
      root.removeEventListener('mousedown', onBackdrop);
      document.removeEventListener('keydown', onKey, true);
    };
    const setView = (title, html, cancelLabel = 'Schließen') => {
      $('#dialog-title').textContent = title;
      textEl.innerHTML = html;
      textEl.hidden = false;
      textEl.classList.add('dialog-rich');
      textEl.classList.add('spotify-import-body');
      form.classList.add('spotify-import-dialog');
      field.hidden = true;
      ok.hidden = true;
      cancel.hidden = false;
      cancel.textContent = cancelLabel;
      root.hidden = false;
    };
    const showStart = (message = '') => setView('Playlist übertragen', `
      ${message ? `<p class="spotify-import-error">${esc(message)}</p>` : ''}
      <p>Spotify- oder YouTube-Music-Link einfügen – oder eine CSV-/JSON-Datei wählen.</p>
      <label class="spotify-link-label" for="spotify-playlist-link">Playlist-Link</label>
      <div class="spotify-link-row"><input id="spotify-playlist-link" type="url" placeholder="https://music.youtube.com/playlist?list=…" autocomplete="off" />
      <button class="btn primary small" data-spotify-action="link">Übertragen</button></div>
      <div class="spotify-import-divider">oder</div>
      <button class="btn ghost" data-spotify-action="file">Datei wählen …</button>
      <p class="muted small">Private Spotify-Playlist? Auf exportify.app als CSV exportieren. YouTube Music kannst du auf tunemymusic.com als CSV exportieren und hier laden.</p>`);

    const showError = (message) => setView('Playlist übertragen', `
      <p class="spotify-import-error">${esc(message || 'Der Import ist fehlgeschlagen.')}</p>
      <button class="btn ghost small" data-spotify-action="back">Zurück</button>`);

    const showResult = (results) => {
      const allMissing = results.flatMap((result) => result.missing || []);
      const reports = results.map((result) => `
        <section class="spotify-import-result">
          <strong>${esc(result.name)}</strong>
          <p>${esc(result.imported)} von ${esc(result.requested)} übertragen</p>
          ${result.limited ? `<p class="muted small">${esc(result.limitMessage || 'Der Import wurde auf 2000 Titel begrenzt.')}</p>` : ''}
          ${result.missing.length ? `<details><summary>${result.missing.length} nicht gefundene Titel</summary><ul>${result.missing.map((track) => `<li>${esc(track.title)}${track.artist ? ` · ${esc(track.artist)}` : ''}</li>`).join('')}</ul></details>` : ''}
        </section>`).join('');
      setView('Playlist-Import abgeschlossen', `${reports}
        ${allMissing.length ? '<button class="btn ghost small" data-spotify-action="copy-missing">Kopieren</button>' : ''}
        <button class="btn primary small" data-spotify-action="done">Fertig</button>`);
      textEl._spotifyMissingText = allMissing.map((track) => `${track.title}${track.artist ? ` – ${track.artist}` : ''}`).join('\n');
    };

    const loadYouTubeLink = async (url) => {
      const plugin = readyPlugins('playlist')[0];
      if (!plugin) {
        showError(YOUTUBE_PLAYLIST_PLUGIN_MESSAGE);
        return;
      }
      const token = ++generation;
      cancelled = false;
      setView('Playlist wird gelesen …', '<p>Die Playlist wird über das aktive Quellen-Plugin gelesen.</p>', 'Abbrechen');
      let result;
      try {
        result = await bridge.pluginPlaylist(plugin.id, url);
      } catch (error) {
        if (!done && !cancelled && token === generation) showError(error && error.message || 'Playlist konnte nicht gelesen werden.');
        return;
      }
      if (done || cancelled || token !== generation) return;
      if (!result || result.error || !Array.isArray(result.items) || !result.items.length) {
        showError(result && result.error ? result.error : 'Die Playlist enthält keine importierbaren Titel.');
        return;
      }
      const imported = importPluginPlaylist(plugin, result);
      setView('Playlist-Import abgeschlossen', `
        <section class="spotify-import-result">
          <strong>${esc(imported.name)}</strong>
          <p>${esc(imported.imported)} Titel übertragen</p>
        </section>
        <button class="btn primary small" data-spotify-action="done">Fertig</button>`);
    };

    const startImport = async (playlists, token) => {
      cancelled = false;
      const results = [];
      for (const data of playlists) {
        if (done || cancelled || token !== generation) return;
        let progress = { found: 0, processed: 0, total: (data.tracks || []).length };
        setView(`„${data.name}“ wird übertragen`, `<div class="spotify-progress-box">${spotifyImportProgressHtml(progress)}</div><p class="muted small">Du kannst den Import abbrechen.</p>`, 'Abbrechen');
        let result;
        try {
          result = await importSpotifyPlaylist(data, () => cancelled || done || token !== generation, (next) => {
            progress = next;
            const box = textEl.querySelector('.spotify-progress-box');
            if (box && !done && !cancelled && token === generation) box.innerHTML = spotifyImportProgressHtml(progress);
          });
        } catch (error) {
          if (!done && !cancelled && token === generation) showError(error && error.message || 'Deezer-Suche fehlgeschlagen.');
          return;
        }
        if (result.cancelled || done || cancelled || token !== generation) return;
        results.push(result);
      }
      if (!done && !cancelled && token === generation) showResult(results);
    };

    const loadLink = async () => {
      const input = textEl.querySelector('#spotify-playlist-link');
      const url = input ? input.value.trim() : '';
      if (!url) {
        if (input) input.focus();
        return;
      }
      const token = ++generation;
      cancelled = false;
      if (isYouTubePlaylistLink(url)) {
        await loadYouTubeLink(url);
        return;
      }
      setView('Spotify-Playlist wird geladen …', '<p>Öffentliche Playlist wird abgerufen.</p>', 'Abbrechen');
      let result;
      try {
        result = await bridge.spotifyPlaylistLink(url);
      } catch (error) {
        if (!done && !cancelled && token === generation) showError(error && error.message || 'Spotify-Playlist konnte nicht geladen werden.');
        return;
      }
      if (done || cancelled || token !== generation) return;
      if (!result || result.error || !Array.isArray(result.tracks) || !result.tracks.length) {
        showError(result && result.error ? result.error : 'Spotify-Playlist enthält keine Titel.');
        return;
      }
      startImport([result], token);
    };

    const loadFile = async () => {
      const token = ++generation;
      cancelled = false;
      setView('Spotify-Datei wird gelesen …', '<p>CSV oder JSON wird geprüft.</p>', 'Abbrechen');
      let result;
      try {
        result = await bridge.playlistImportFile();
      } catch (error) {
        if (!done && !cancelled && token === generation) showError(error && error.message || 'Datei konnte nicht gelesen werden.');
        return;
      }
      if (done || cancelled || token !== generation || (result && result.canceled)) return;
      if (!result || result.error || !Array.isArray(result.playlists) || !result.playlists.length) {
        showError(result && result.error ? result.error : 'In der Datei wurden keine Playlists gefunden.');
        return;
      }
      if (result.playlists.length === 1) {
        startImport(result.playlists, token);
        return;
      }
      const options = result.playlists.map((playlist, index) => `
        <label class="spotify-playlist-choice"><input type="checkbox" value="${index}" checked />
          <span><strong>${esc(playlist.name)}</strong><small>${playlist.tracks.length} Titel</small></span></label>`).join('');
      setView('Playlists auswählen', `<p>Jede ausgewählte Playlist wird separat angelegt.</p><div class="spotify-playlist-choices">${options}</div>
        <button class="btn primary small" data-spotify-action="selected">Auswahl übertragen</button>`, 'Abbrechen');
      textEl._spotifyPlaylists = result.playlists;
    };

    function onAction(event) {
      const button = event.target.closest('[data-spotify-action]');
      if (!button) return;
      event.preventDefault();
      const action = button.dataset.spotifyAction;
      if (action === 'link') loadLink();
      else if (action === 'file') loadFile();
      else if (action === 'back') showStart();
      else if (action === 'done') finish();
      else if (action === 'copy-missing') {
        bridge.copyText(textEl._spotifyMissingText || '').then((ok) => toast(ok ? 'Nicht gefundene Titel kopiert' : 'Kopieren nicht möglich'));
      } else if (action === 'selected') {
        const lists = textEl._spotifyPlaylists || [];
        const selected = Array.from(textEl.querySelectorAll('.spotify-playlist-choice input:checked'))
          .map((checkbox) => lists[Number(checkbox.value)]).filter(Boolean);
        if (!selected.length) {
          toast('Wähle mindestens eine Playlist aus.');
          return;
        }
        startImport(selected, generation);
      }
    }
    function onSubmit(event) {
      event.preventDefault();
      if (textEl.querySelector('#spotify-playlist-link')) loadLink();
    }
    function onCancel() {
      if (!done) {
        cancelled = true;
        finish();
      }
    }
    function onBackdrop(event) { if (event.target === root) onCancel(); }
    function onKey(event) { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }

    hideMenus();
    showStart();
    cancel.textContent = 'Schließen';
    textEl.addEventListener('click', onAction);
    form.addEventListener('submit', onSubmit);
    cancel.addEventListener('click', onCancel);
    root.addEventListener('mousedown', onBackdrop);
    document.addEventListener('keydown', onKey, true);
  }

  function positionMenu(menu, anchor) {
    menu.hidden = false;
    const rect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const left = Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - 12);
    let top = rect.bottom + 8;
    if (top + menuRect.height > window.innerHeight - 12) top = rect.top - menuRect.height - 8;
    menu.style.left = `${Math.max(12, left)}px`;
    menu.style.top = `${Math.max(12, top)}px`;
  }

  function openServiceMenu(anchor, entry) {
    if (!entry) return;
    hideMenus();
    serviceMenuEntry = entry;

    const menu = $('#service-menu');
    menu.innerHTML = `
      <div class="service-menu-label">${esc(entry.title)}${entry.artist ? ` · ${esc(entry.artist)}` : ''}</div>
      ${SERVICES.filter((service) => !service.creator).map(
        (service) => `
          <button class="service-menu-item" data-menu-service="${service.id}">
            <span class="svc-badge" style="--svc:${service.color}">${esc(service.short)}</span>
            <span>${esc(service.name)}</span>
          </button>`
      ).join('')}`;

    positionMenu(menu, anchor);
  }

  function openAddMenu(anchor, entries) {
    if (!entries.length) return;
    hideMenus();
    ctxEntries = entries;

    const menu = $('#ctx-menu');
    const label =
      entries.length === 1 ? `„${entries[0].title}“ hinzufügen zu` : `${entries.length} Titel hinzufügen zu`;
    const playlists = state.collection.playlists;

    const current = currentItem();
    const queueable = !(entries.length === 1 && current && entries[0].id === current.id);
    menu.innerHTML = `
      ${
        queueable
          ? `<button class="service-menu-item" data-ctx-queue="next">
              <span class="menu-ic">${ICONS.queueNext}</span>
              <span class="menu-text">Als Nächstes abspielen</span>
            </button>
            <button class="service-menu-item" data-ctx-queue="end">
              <span class="menu-ic">${ICONS.list}</span>
              <span class="menu-text">Zur Warteschlange hinzufügen</span>
            </button>
            <div class="menu-sep"></div>`
          : ''
      }
      <div class="service-menu-label">${esc(label)}</div>
      ${playlists
        .map(
          (playlist) => `
            <button class="service-menu-item" data-ctx-playlist="${esc(playlist.id)}">
              <span class="menu-ic">${ICONS.list}</span>
              <span class="menu-text">${esc(playlist.name)}</span>
              <span class="menu-count">${playlist.items.length}</span>
            </button>`
        )
        .join('')}
      ${playlists.length ? '<div class="menu-sep"></div>' : ''}
      <button class="service-menu-item" data-ctx-new>
        <span class="menu-ic">${ICONS.plus}</span>
        <span class="menu-text">Neue Playlist …</span>
      </button>`;

    positionMenu(menu, anchor);
  }

  function hideMenus() {
    const service = $('#service-menu');
    const ctx = $('#ctx-menu');
    if (service) service.hidden = true;
    if (ctx) ctx.hidden = true;
  }

  /* ---------------------------------------------------------------- *
   * Sidebar
   * ---------------------------------------------------------------- */

  function buildSidebar() {
    const serviceButton = (service) => `
        <button class="nav-item service-item" data-service="${service.id}">
          <span class="svc-badge" style="--svc:${service.color}">${esc(service.short)}</span>
          <span class="svc-name">${esc(service.name)}</span>
        </button>`;
    const creatorNav = $('#creator-nav');
    if (creatorNav) creatorNav.innerHTML = SERVICES.filter((service) => service.creator).map(serviceButton).join('');
    $('#service-nav').innerHTML = SERVICES.filter((service) => !service.creator).map(
      (service) => `
        <button class="nav-item service-item" data-service="${service.id}">
          <span class="svc-badge" style="--svc:${service.color}">${esc(service.short)}</span>
          <span class="svc-name">${esc(service.name)}</span>
        </button>`
    ).join('');

    renderLibraryNav();
  }

  function renderLibraryNav() {
    const count = $('#fav-count');
    if (count) count.textContent = state.collection.favorites.length || '';

    const host = $('#playlist-nav');
    if (!host) return;

    host.innerHTML = state.collection.playlists
      .map(
        (playlist) => `
          <button
            class="nav-item playlist-item ${
              state.view === 'playlist' && state.currentPlaylist === playlist.id ? 'active' : ''
            }"
            data-playlist="${esc(playlist.id)}"
            data-drop="playlist:${esc(playlist.id)}"
            title="${esc(playlist.name)}"
          >
            <span class="nav-ic">${ICONS.list}</span>
            <span class="svc-name">${esc(playlist.name)}</span>
            <span class="nav-count">${playlist.items.length || ''}</span>
          </button>`
      )
      .join('');
  }

  /* ---------------------------------------------------------------- *
   * Home
   * ---------------------------------------------------------------- */

  function updateStatusChips() {
    const row = $('#status-row');
    if (!row) return;

    const widevine = state.info && state.info.widevine;
    const chips = [
      widevine
        ? `<span class="status-chip ok"><i></i>Widevine ${esc(widevine.version)}</span>`
        : `<span class="status-chip warn"><i></i>Kein Widevine gefunden</span>`,
      `<span class="status-chip ok"><i></i>${
        state.settings.systemBrowser ? 'System-Browser' : 'Eingebettete Player'
      }</span>`,
      `<span class="status-chip"><i></i>${state.library.tracks.length} lokale Titel</span>`,
      `<span class="status-chip"><i></i>${state.collection.favorites.length} Favoriten</span>`,
    ];

    readyPlugins().forEach((plugin) => {
      chips.push(`<span class="status-chip ok"><i></i>Plugin ${esc(plugin.name)} aktiv</span>`);
    });

    const idle = state.plugins.list.filter((plugin) => !plugin.enabled);
    if (idle.length) {
      chips.push(
        `<button class="status-chip action" data-home-action="settings"><i></i>${
          idle.length === 1 ? '1 Plugin' : `${idle.length} Plugins`
        } gefunden · aus</button>`
      );
    }

    row.innerHTML = chips.join('');
  }

  /* ---------------------------------------------------------------- *
   * Listening history (local only) – feeds suggestions and "Wiederentdecken"
   *
   * A title counts as heard after 20 s (12 s for 30-s previews). Radio is
   * not recorded. Stored in localStorage, max. 300 titles, never sent anywhere
   * except the artist names used for suggestions (same as favourites).
   * ---------------------------------------------------------------- */

  const HISTORY_MAX = 300;
  const DAY = 24 * 60 * 60 * 1000;
  let history = loadHistory();
  const listen = { id: null, secs: 0, last: 0, counted: false };

  function loadHistory() {
    const stored = readJSON(STORAGE.history, []);
    return (Array.isArray(stored) ? stored : [])
      .filter((row) => row && validEntry(row.entry))
      .map((row) => ({
        entry: migrateEntry(row.entry),
        plays: Math.max(1, Number(row.plays) || 1),
        first: Number(row.first) || Date.now(),
        last: Number(row.last) || Date.now(),
      }));
  }

  function recordPlay(entry) {
    if (!entry || entry.kind === 'radio' || !validEntry(entry)) return;
    const now = Date.now();
    const known = history.find((row) => row.entry.id === entry.id);
    if (known) {
      known.plays += 1;
      known.last = now;
      known.entry = storable(entry);
    } else {
      history.unshift({ entry: storable(entry), plays: 1, first: now, last: now });
    }
    history.sort((a, b) => b.last - a.last);
    history = history.slice(0, HISTORY_MAX);
    writeJSON(STORAGE.history, history);
  }

  function trackListening() {
    const item = currentItem();
    if (!item || audio.paused) {
      listen.last = 0;
      return;
    }
    if (listen.id !== item.id) {
      listen.id = item.id;
      listen.secs = 0;
      listen.counted = false;
      listen.last = 0;
    }
    const now = performance.now();
    if (listen.last) listen.secs += Math.min(2, (now - listen.last) / 1000);
    listen.last = now;
    const needed = state.nowMode === 'preview' || item.kind === 'preview' ? 12 : 20;
    if (!listen.counted && listen.secs >= needed) {
      listen.counted = true;
      recordPlay(item);
    }
  }

  // Titles you liked (several plays or a favourite) but have not heard for a while.
  function rediscoverEntries() {
    const now = Date.now();
    const seen = new Set();
    const out = [];
    history
      .filter((row) => now - row.last > 10 * DAY && row.plays >= 2)
      .sort((a, b) => b.plays - a.plays || a.last - b.last)
      .forEach((row) => {
        if (seen.has(row.entry.id)) return;
        seen.add(row.entry.id);
        out.push(row.entry);
      });
    const recent = new Map(history.map((row) => [row.entry.id, row.last]));
    state.collection.favorites
      .filter((entry) => entry.kind !== 'radio' && now - (recent.get(entry.id) || entry.addedAt || now) > 21 * DAY)
      .forEach((entry) => {
        if (seen.has(entry.id)) return;
        seen.add(entry.id);
        out.push(entry);
      });
    return out.slice(0, 18);
  }

  function renderHomeRediscover() {
    const host = $('#home-rediscover');
    const section = $('#home-rediscover-section');
    if (!host || !section) return;
    const list = rediscoverEntries();
    section.hidden = !list.length;
    host.innerHTML = list.map((entry, index) => chartCard(entry, index, 'rediscover')).join('');
  }

  function chartsPlugin() {
    return readyPlugins('charts')[0] || null;
  }

  async function loadPluginCharts(force = false) {
    const plugin = chartsPlugin();
    if (!plugin || !bridge.pluginCharts) return;
    const current = state.pluginCharts;
    if (current.loading) return;
    if (current.loaded && current.pluginId === plugin.id && !force) return;
    state.pluginCharts = { pluginId: plugin.id, items: current.pluginId === plugin.id ? current.items : [], loading: true, loaded: false, error: null };
    renderHomeCharts();
    try {
      const result = await bridge.pluginCharts(plugin.id, 30);
      state.pluginCharts = {
        pluginId: plugin.id,
        items: (Array.isArray(result.items) ? result.items : []).map((item) => pluginEntry(plugin, item)),
        loading: false,
        loaded: true,
        error: result.error || null,
      };
    } catch (error) {
      state.pluginCharts = { pluginId: plugin.id, items: [], loading: false, loaded: true, error: error.message };
    }
    renderHomeCharts();
  }

  async function loadReleases(force = false) {
    if (!bridge.newReleases || state.releases.loading) return;
    if (state.releases.loaded && !force) return;
    state.releases.loading = true;
    renderHomeCharts();
    try {
      const result = await bridge.newReleases();
      state.releases = {
        tracks: (Array.isArray(result.tracks) ? result.tracks : []).map((track) =>
          Object.assign(previewEntry(track), { released: track.released || '' })
        ),
        loading: false,
        loaded: true,
        error: result.errors && result.errors.length ? result.errors[0].message : null,
      };
    } catch (error) {
      state.releases = { tracks: [], loading: false, loaded: true, error: error.message };
    }
    renderHomeCharts();
  }

  function buildHome() {
    const cards = SERVICES.filter((service) => !service.creator).map(
      (service) => `
        <article class="service-card" style="--svc:${service.color}">
          <div class="service-card-top">
            <span class="svc-badge lg" style="--svc:${service.color}">${esc(service.short)}</span>
            <div>
              <h3>${esc(service.name)}</h3>
              <p>${esc(service.note)}</p>
            </div>
          </div>
          <div class="service-card-actions">
            <button class="btn primary small" data-open="${service.id}">Öffnen</button>
            <button class="btn ghost small" data-external="${service.id}">Im Browser</button>
          </div>
        </article>`
    ).join('');

    const full = fullMode();
    const fullPlugin = full ? matchPlugin() : null;

    $('#view-home').innerHTML = `
      <div class="page home-page">
        <section class="hero">
          <div class="hero-copy">
            <div class="eyebrow">The Music Launcher</div>
            <h1>Alle Dienste.<br /><span class="grad">Ein Startpunkt.</span></h1>
            <p>
              Streaming im offiziellen Web-Player, Vorschauen direkt in der App,
              lokale Musik nativ. Dein Login bleibt, wo er hingehört.
            </p>
            <div class="quick-actions">
              <button class="quick-action primary" data-home-action="search">
                ${ICONS.search} Song suchen <kbd>Strg K</kbd>
              </button>
              <button class="quick-action" data-home-action="favorites">
                ${ICONS.heart} Favoriten
              </button>
              <button class="quick-action" data-home-action="creator">
                ${ICONS.scissors} Cutter-Modus
              </button>
              <button class="quick-action" data-home-action="add-folder">
                ${ICONS.folder} Ordner hinzufügen
              </button>
              <button class="quick-action" data-home-action="radio">
                ${ICONS.radio} Radio
              </button>
              <button class="quick-action" data-home-action="musickit">
                ${ICONS.spark} MusicKit
              </button>
            </div>
          </div>
          <div class="hero-art" aria-hidden="true">
            <div class="hero-eq">${'<span></span>'.repeat(14)}</div>
            <span class="hero-badge">${
              full ? `Volle Titel · ${esc(fullPlugin.name)}` : '30 s Previews · legal'
            }</span>
          </div>
        </section>

        <div class="status-row" id="status-row"></div>

        <section class="home-section">
          <div class="home-section-head">
            <div class="home-section-title">
              <h2>Neu für dich</h2>
              <span class="muted small" id="home-recs-sub">Basierend auf deinen Favoriten und dem, was du hörst</span>
            </div>
            <button class="btn ghost small" data-home-action="recs">${ICONS.refresh} Neu mischen</button>
          </div>
          <div id="home-recs" class="charts-row"></div>
        </section>

        <section class="home-section">
          <div class="home-section-head">
            <div class="home-section-title">
              <h2>Trending & Neuheiten</h2>
              <span class="muted small">${
                full ? `voller Titel über ${esc(fullPlugin.source.label)}` : '30-Sekunden-Vorschau'
              }</span>
            </div>
            <div class="row trend-tabs">
              <button class="radio-tag ${state.trend === 'charts' ? 'active' : ''}" data-home-action="trend-charts">Charts</button>
              <button class="radio-tag ${state.trend === 'releases' ? 'active' : ''}" data-home-action="trend-releases">Neuerscheinungen</button>
              ${
                chartsPlugin()
                  ? `<button class="radio-tag ${state.trend === 'plugin' ? 'active' : ''}" data-home-action="trend-plugin">${esc(
                      chartsPlugin().chartsLabel || `${chartsPlugin().source.label} Charts`
                    )}</button>`
                  : ''
              }
              <button class="btn ghost small" data-home-action="refresh">Neu laden</button>
            </div>
          </div>
          <div id="home-charts" class="charts-row"></div>
        </section>

        <section class="home-section" id="home-rediscover-section" hidden>
          <div class="home-section-head">
            <div class="home-section-title">
              <h2>Wiederentdecken</h2>
              <span class="muted small">Lange nicht gehört</span>
            </div>
          </div>
          <div id="home-rediscover" class="charts-row"></div>
        </section>

        <section class="home-section">
          <div class="home-section-head">
            <div class="home-section-title">
              <h2>Dienste</h2>
              <span class="muted small">Offizielle Web-Player</span>
            </div>
          </div>
          <div class="grid services-grid">${cards}</div>
        </section>

        <section class="home-split">
          <div class="panel home-local" id="home-local"></div>
          <div class="panel">
            <h3>So funktioniert's</h3>
            <ul class="how-list">
              <li><span><strong>Lokal</strong> läuft nativ in CleanMusic – ohne Login, ohne DRM.</span></li>
              <li><span><strong>Vorschauen</strong> von Apple Music und Deezer laufen im eigenen Player.</span></li>
              <li><span><strong>Volle Katalogtitel</strong> im offiziellen Web-Player oder per MusicKit${
                full ? ' – oder über ein Plugin direkt hier' : ''
              }.</span></li>
              <li><span><strong>Favoriten & Playlists</strong> mischen alle Quellen: ♥ oder + an jedem Titel.</span></li>
            </ul>
            <p class="muted small" style="margin-top:12px">
              Kein DRM-Bypass, keine Werbeblocker. Plugins sind optional und nicht enthalten.
            </p>
          </div>
        </section>
      </div>`;

    updateStatusChips();
    renderHomeRecs();
    renderHomeCharts();
    renderHomeRediscover();
    renderHomeLocal();
    if (!state.charts.loaded) loadCharts();
  }

  async function loadCharts(force = false) {
    if (state.charts.loading) return;
    if (state.charts.loaded && !force) return;

    const previous = state.charts.tracks;
    state.charts = { tracks: previous, loading: true, loaded: false, errors: [] };
    renderHomeCharts();
    renderSearchResults();

    try {
      const result = await bridge.topTracks();
      state.charts = {
        tracks: (Array.isArray(result.tracks) ? result.tracks : []).map(previewEntry),
        loading: false,
        loaded: true,
        errors: Array.isArray(result.errors) ? result.errors : [],
      };
    } catch (error) {
      state.charts = {
        tracks: [],
        loading: false,
        loaded: true,
        errors: [{ source: 'Charts', message: error.message }],
      };
    }

    renderHomeCharts();
    renderSearchResults();
  }

  function skeletonCards(count, className = 'chart-card', artClass = 'chart-art') {
    return Array.from(
      { length: count },
      () => `
        <div class="${className}">
          <div class="${artClass} skeleton-art"></div>
          <div class="sk-line"></div>
          <div class="sk-line short"></div>
        </div>`
    ).join('');
  }

  function renderHomeCharts() {
    const host = $('#home-charts');
    if (!host) return;
    $$('[data-home-action^="trend-"]').forEach((button) =>
      button.classList.toggle('active', button.dataset.homeAction === `trend-${state.trend}`)
    );

    if (state.trend === 'plugin' && !chartsPlugin()) state.trend = 'charts';
    if (state.trend === 'plugin') {
      const charts = state.pluginCharts;
      const plugin = chartsPlugin();
      if (charts.pluginId !== plugin.id || (!charts.loaded && !charts.loading)) {
        host.innerHTML = skeletonCards(8);
        loadPluginCharts();
        return;
      }
      if (charts.loading && !charts.items.length) {
        host.innerHTML = skeletonCards(8);
        return;
      }
      if (!charts.items.length) {
        host.innerHTML = `
          <div class="charts-empty">
            <span>${esc(charts.error || 'Gerade keine Charts vom Plugin.')}</span>
            <button class="btn ghost small" data-home-action="refresh">Erneut versuchen</button>
          </div>`;
        return;
      }
      host.innerHTML = charts.items.map((entry, index) => chartCard(entry, index, 'pcharts')).join('');
      return;
    }

    if (state.trend === 'releases') {
      const releases = state.releases;
      if (!releases.loaded || (releases.loading && !releases.tracks.length)) {
        host.innerHTML = skeletonCards(8);
        if (!releases.loading) loadReleases();
        return;
      }
      if (!releases.tracks.length) {
        host.innerHTML = `
          <div class="charts-empty">
            <span>${esc(releases.error || 'Gerade keine Neuerscheinungen gefunden.')}</span>
            <button class="btn ghost small" data-home-action="refresh">Erneut versuchen</button>
          </div>`;
        return;
      }
      host.innerHTML = releases.tracks.map((entry, index) => chartCard(entry, index, 'releases')).join('');
      return;
    }

    const charts = state.charts;

    if (charts.loading && !charts.tracks.length) {
      host.innerHTML = skeletonCards(8);
      return;
    }

    if (!charts.tracks.length) {
      host.innerHTML = `
        <div class="charts-empty">
          <span>Charts konnten gerade nicht geladen werden.</span>
          <button class="btn ghost small" data-home-action="refresh">Erneut versuchen</button>
        </div>`;
      return;
    }

    host.innerHTML = charts.tracks.map((entry, index) => chartCard(entry, index, 'charts')).join('');
  }

  function renderHomeRecs() {
    const host = $('#home-recs');
    const sub = $('#home-recs-sub');
    if (!host) return;

    const seeds = recSeeds();
    const recs = visibleRecs();

    if (!seeds.artists.length && !seeds.pluginSeeds.length) {
      if (sub) sub.textContent = 'Persönliche Vorschläge';
      host.innerHTML = `
        <div class="charts-empty">
          <span>Markiere Titel mit ♥ – dann findest du hier Vorschläge passend zu deinen Favoriten.</span>
          <button class="btn ghost small" data-home-action="search">Songs suchen</button>
        </div>`;
      return;
    }

    if (sub) sub.textContent = recsSubtitle();

    if (state.recs.loading && !recs.length) {
      host.innerHTML = skeletonCards(8);
      return;
    }

    if (!recs.length) {
      host.innerHTML = `
        <div class="charts-empty">
          <span>${esc(state.recs.error || 'Gerade keine Vorschläge gefunden.')}</span>
          <button class="btn ghost small" data-home-action="recs">Erneut versuchen</button>
        </div>`;
      return;
    }

    host.innerHTML = recs
      .slice(0, 24)
      .map((entry, index) => chartCard(entry, index, 'recs'))
      .join('');
  }

  function renderHomeLocal() {
    const host = $('#home-local');
    if (!host) return;

    const entries = state.library.entries;

    if (!entries.length) {
      host.innerHTML = `
        <div class="home-local-head">
          <div>
            <h3>Deine Musik</h3>
            <p>Lokale Dateien laufen zu 100 % in CleanMusic.</p>
          </div>
          <span class="home-local-badge">0 Titel</span>
        </div>
        <div class="home-local-empty">
          <button class="btn primary small" data-home-action="add-folder">Ordner hinzufügen</button>
          <span class="muted small">MP3, FLAC, WAV, M4A …</span>
        </div>`;
      return;
    }

    const rows = entries
      .slice(0, 5)
      .map((entry, index) => {
        const playing = isPlayingId(entry.id);

        return `
          <button class="home-local-row ${playing ? 'playing' : ''}"
            data-list="local" data-index="${index}" data-track-id="${esc(entry.id)}" draggable="true">
            <span class="home-local-idx">${playing ? EQ : index + 1}</span>
            <span class="home-local-meta">
              <span class="home-local-title">${esc(entry.title)}</span>
              <span class="home-local-sub">${esc(entry.artist || entry.dir || 'Lokale Datei')}</span>
            </span>
            <span class="home-local-play">${ICONS.play}</span>
          </button>`;
      })
      .join('');

    host.innerHTML = `
      <div class="home-local-head">
        <div>
          <h3>Deine Musik</h3>
          <p>${entries.length} lokale Titel</p>
        </div>
        <button class="btn ghost small" data-home-action="open-local">Alle ansehen</button>
      </div>
      <div class="home-local-list">${rows}</div>
      <div class="home-local-foot">
        <span class="muted small">${esc(state.library.folder || '')}</span>
        <button class="btn ghost small" data-home-action="add-folder">+ Ordner</button>
      </div>`;
  }

  /* ---------------------------------------------------------------- *
   * Recommendations
   * ---------------------------------------------------------------- */

  function restoreRecs() {
    const stored = readJSON(STORAGE.recs, null);
    if (!stored || !Array.isArray(stored.tracks)) return {};
    return {
      tracks: stored.tracks.map(migrateEntry).filter(validEntry),
      seeds: Array.isArray(stored.seeds) ? stored.seeds.slice(0, 5) : [],
      seedKey: String(stored.seedKey || ''),
      at: Number(stored.at) || 0,
      loaded: true,
    };
  }

  function primaryArtist(value) {
    return String(value || '')
      .split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bfeaturing\b|\bx\b|\bvs\.?|\/|\bund\b|\band\b)\s*/i)[0]
      .trim();
  }

  function recSeeds() {
    const scores = new Map();

    const add = (entry, weight) => {
      if (!entry || entry.kind === 'radio') return;
      const name = primaryArtist(entry.artist);
      if (!name || name.length < 2) return;

      const key = name.toLowerCase();
      const seed = scores.get(key) || { name, score: 0, deezerId: null };
      seed.score += weight;
      if (!seed.deezerId && entry.source === 'deezer' && entry.artistId) seed.deezerId = entry.artistId;
      scores.set(key, seed);
    };

    state.collection.favorites.forEach((entry, index) => add(entry, 1 + Math.max(0, 1 - index / 15)));
    // What you actually listen to: more plays and more recent = stronger.
    const now = Date.now();
    history.forEach((row) => {
      const age = (now - row.last) / DAY;
      add(row.entry, Math.min(row.plays, 6) * 0.3 * Math.exp(-age / 30));
    });
    state.collection.playlists.forEach((playlist) =>
      playlist.items.forEach((entry) => add(entry, 0.35))
    );

    const artists = Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ name, deezerId }) => ({ name, deezerId }));

    // Favourites from a source plugin: the plugin can suggest related titles.
    const pluginSeeds = [];
    state.collection.favorites.forEach((entry) => {
      if (entry.kind !== 'plugin' || !entry.refId) return;
      const plugin = pluginById(entry.pluginId);
      if (!isPluginReady(plugin) || !plugin.capabilities.related) return;

      let seed = pluginSeeds.find((known) => known.id === plugin.id);
      if (!seed) {
        seed = { id: plugin.id, refIds: [] };
        pluginSeeds.push(seed);
      }
      if (seed.refIds.length < 2) seed.refIds.push(entry.refId);
    });

    const key = `${artists.map((artist) => artist.name.toLowerCase()).join('|')}#${pluginSeeds
      .map((seed) => `${seed.id}:${seed.refIds.join(',')}`)
      .join(';')}`;
    return { artists, pluginSeeds, key };
  }

  function recsSubtitle() {
    if (state.recs.loading) return 'Vorschläge werden gemischt …';
    if (state.recs.seeds.length) return `Weil du ${formatList(state.recs.seeds.slice(0, 3))} magst`;
    return 'Basierend auf deinen Favoriten';
  }

  function scheduleRecsRefresh(delay = 2500) {
    clearTimeout(recsTimer);
    recsTimer = setTimeout(() => loadRecs(false), delay);
  }

  function mergeRecs(tracks, videos) {
    const out = [];
    const seen = new Set();
    let videoIndex = 0;

    const push = (entry) => {
      const key = matchKey(entry);
      if (seen.has(entry.id) || seen.has(key)) return;
      seen.add(entry.id);
      seen.add(key);
      out.push(entry);
    };

    tracks.forEach((entry, index) => {
      push(entry);
      if (index % 3 === 2 && videos[videoIndex]) push(videos[videoIndex++]);
    });
    while (videos[videoIndex]) push(videos[videoIndex++]);

    return out;
  }

  let recsTask = null;

  function loadRecs(force = false) {
    if (recsTask) {
      if (force) state.recs.pending = 'force';
      else if (!state.recs.pending) state.recs.pending = true;
      return recsTask;
    }

    recsTask = runRecs(force).finally(() => {
      recsTask = null;
      const pending = state.recs.pending;
      state.recs.pending = false;
      if (pending) return loadRecs(pending === 'force');
      return undefined;
    });
    return recsTask;
  }

  async function runRecs(force) {
    const seeds = recSeeds();

    if (!seeds.artists.length && !seeds.pluginSeeds.length) {
      state.recs = Object.assign(state.recs, {
        tracks: [], seeds: [], loading: false, loaded: true, error: null, seedKey: seeds.key, at: 0,
      });
      renderRecsViews();
      return;
    }

    const fresh = Date.now() - state.recs.at < RECS_MAX_AGE;
    if (!force && state.recs.seedKey === seeds.key && state.recs.tracks.length && fresh) {
      renderRecsViews();
      return;
    }

    state.recs.loading = true;
    renderRecsViews();

    try {
      const result = await bridge.recommendations({
        artists: seeds.artists,
        pluginSeeds: seeds.pluginSeeds,
      });

      const exclude = new Set();
      state.collection.favorites.forEach((entry) => {
        exclude.add(entry.id);
        exclude.add(matchKey(entry));
      });
      const recentCut = Date.now() - 7 * DAY;
      history.forEach((row) => {
        if (row.last > recentCut) {
          exclude.add(row.entry.id);
          exclude.add(matchKey(row.entry));
        }
      });
      const keep = (entry) => !exclude.has(entry.id) && !exclude.has(matchKey(entry));

      let tracks = (Array.isArray(result.tracks) ? result.tracks : []).map(previewEntry).filter(keep);
      let videos = (Array.isArray(result.pluginItems) ? result.pluginItems : [])
        .map((item) => {
          const plugin = pluginById(item.pluginId);
          return plugin ? pluginEntry(plugin, item) : null;
        })
        .filter((entry) => entry && keep(entry));
      if (force) {
        tracks = shuffled(tracks);
        videos = shuffled(videos);
      }

      const errors = Array.isArray(result.errors) ? result.errors : [];
      Object.assign(state.recs, {
        tracks: mergeRecs(tracks, videos).slice(0, 40),
        seeds: Array.isArray(result.seeds) ? result.seeds : [],
        loading: false,
        loaded: true,
        error: errors.length ? errors.map((error) => error.message).join(' · ') : null,
        seedKey: seeds.key,
        at: Date.now(),
      });

      writeJSON(STORAGE.recs, {
        tracks: state.recs.tracks.map(storable),
        seeds: state.recs.seeds,
        seedKey: state.recs.seedKey,
        at: state.recs.at,
      });
    } catch (error) {
      Object.assign(state.recs, { loading: false, loaded: true, error: error.message });
    }

    renderRecsViews();
  }

  function renderRecsViews() {
    renderHomeRecs();
    renderFavRecs();
  }

  /* ---------------------------------------------------------------- *
   * Favourites + playlist views
   * ---------------------------------------------------------------- */

  function renderFavorites() {
    const host = $('#view-favorites');
    if (!host) return;

    const all = state.collection.favorites;
    const radioCount = all.filter((entry) => entry.kind === 'radio').length;
    const trackCount = all.length - radioCount;
    if ((state.favFilter === 'radio' && !radioCount) || (state.favFilter === 'tracks' && !trackCount)) {
      state.favFilter = 'all';
    }
    const list = filteredFavorites();

    const filters =
      trackCount && radioCount
        ? `<div class="radio-tags">
            ${[
              ['all', `Alle · ${all.length}`],
              ['tracks', `Titel · ${trackCount}`],
              ['radio', `Radio · ${radioCount}`],
            ]
              .map(
                ([value, label]) =>
                  `<button class="radio-tag ${state.favFilter === value ? 'active' : ''}" data-fav-filter="${value}">${label}</button>`
              )
              .join('')}
          </div>`
        : '';

    host.innerHTML = `
      <div class="page">
        <div class="page-head">
          <div>
            <div class="eyebrow">Bibliothek</div>
            <h2>Favoriten</h2>
            <p>${
              all.length
                ? `${trackCount} Titel · ${radioCount} Sender – gemischt aus Vorschauen, Plugin-Quellen, lokalen Dateien und Radio.`
                : 'Alles, was du mit ♥ markierst – Titel, Vorschauen, Plugin-Treffer, lokale Dateien und Radiosender.'
            }</p>
          </div>
          <div class="page-actions">
            <button class="btn ghost small" data-fav-action="spotify-import">Playlist übertragen</button>
            ${
              list.length
                ? `<button class="btn ghost small" data-fav-action="add-all">${ICONS.plus} Zur Playlist</button>
                   <button class="btn ghost small" data-fav-action="shuffle">${ICONS.shuffle} Shuffle</button>
                   <button class="btn primary small" data-fav-action="play">${ICONS.play} Abspielen</button>`
                : ''
            }
          </div>
        </div>

        ${filters}

        ${
          list.length
            ? `<div class="song-list">${list.map((entry, index) => songRow(entry, index, 'favorites')).join('')}</div>`
            : `<div class="empty compact">
                 <div class="empty-icon">♥</div>
                 <h3>Noch keine Favoriten</h3>
                 <p>Tippe bei einem Titel, einer Vorschau oder einem Radiosender auf ♥ – oder zieh ihn auf „Favoriten“ in der Seitenleiste.</p>
                 <button class="btn primary" data-fav-action="search">Songs suchen</button>
               </div>`
        }

        <section class="home-section">
          <div class="home-section-head">
            <div class="home-section-title">
              <h2>Mehr wie deine Favoriten</h2>
              <span class="muted small" id="fav-recs-sub"></span>
            </div>
            <button class="btn ghost small" data-fav-action="recs">${ICONS.refresh} Neu mischen</button>
          </div>
          <div id="fav-recs"></div>
        </section>
      </div>`;

    renderFavRecs();
  }

  function renderFavRecs() {
    const host = $('#fav-recs');
    const sub = $('#fav-recs-sub');
    if (!host) return;

    const seeds = recSeeds();
    const recs = visibleRecs();

    if (!seeds.artists.length && !seeds.pluginSeeds.length) {
      if (sub) sub.textContent = '';
      host.innerHTML =
        '<p class="muted small">Sobald du Titel favorisierst, schlägt CleanMusic hier ähnliche Songs vor.</p>';
      return;
    }

    if (sub) sub.textContent = recsSubtitle();

    if (state.recs.loading && !recs.length) {
      host.innerHTML = `
        <div class="search-status">
          <span class="spinner small"></span>
          <span>Vorschläge werden gemischt …</span>
        </div>`;
      return;
    }

    if (!recs.length) {
      host.innerHTML = `<p class="muted small">${esc(state.recs.error || 'Gerade keine Vorschläge gefunden.')}</p>`;
      return;
    }

    host.innerHTML = `<div class="song-list">${recs
      .slice(0, 12)
      .map((entry, index) => songRow(entry, index, 'recs'))
      .join('')}</div>`;
  }

  function coverMosaic(playlist) {
    const arts = [];
    playlist.items.forEach((entry) => {
      if (entry.artwork && arts.length < 4 && !arts.includes(entry.artwork)) arts.push(entry.artwork);
    });

    if (arts.length >= 4) {
      return `<div class="cover-grid">${arts
        .map((src) => `<img src="${esc(src)}" alt="" draggable="false" />`)
        .join('')}</div>`;
    }
    if (arts.length) return `<img src="${esc(arts[0])}" alt="" draggable="false" />`;
    return `<span class="cover-ic">${ICONS.list}</span>`;
  }

  function openPlaylist(id) {
    if (!playlistById(id)) return;
    state.currentPlaylist = id;
    renderPlaylist();
    showView('playlist');
  }

  function renderPlaylist() {
    const host = $('#view-playlist');
    if (!host) return;

    const playlist = playlistById(state.currentPlaylist);
    if (!playlist) {
      host.innerHTML = '';
      return;
    }

    const key = `playlist:${playlist.id}`;
    const items = playlist.items;
    const total = items.reduce((sum, entry) => sum + (Number(entry.duration) || 0), 0);
    const kinds = new Set(items.map((entry) => entry.sourceLabel).filter(Boolean));

    host.innerHTML = `
      <div class="page">
        <div class="page-head playlist-head">
          <div class="playlist-cover">${coverMosaic(playlist)}</div>
          <div class="playlist-meta">
            <div class="eyebrow">Playlist</div>
            <h2>${esc(playlist.name)}</h2>
            <p>${items.length} Titel${total ? ` · ca. ${fmtLong(total)}` : ''}${
              kinds.size ? ` · ${esc(Array.from(kinds).join(', '))}` : ''
            }</p>
          </div>
          <div class="page-actions">
            <button class="btn ghost small" data-pl-action="rename">${ICONS.edit} Umbenennen</button>
            <button class="btn ghost small danger" data-pl-action="delete">${ICONS.trash} Löschen</button>
            ${
              items.length
                ? `<button class="btn ghost small" data-pl-action="shuffle">${ICONS.shuffle} Shuffle</button>
                   <button class="btn primary small" data-pl-action="play">${ICONS.play} Abspielen</button>`
                : ''
            }
          </div>
        </div>

        ${
          items.length
            ? `<div class="song-list playlist-list">${items
                .map((entry, index) => songRow(entry, index, key, { handle: true, removable: true }))
                .join('')}</div>
               <p class="muted small">Tipp: Titel per Drag & Drop sortieren – oder aus jeder Liste auf eine Playlist in der Seitenleiste ziehen.</p>`
            : `<div class="empty compact">
                 <div class="empty-icon">${ICONS.list}</div>
                 <h3>Noch leer</h3>
                 <p>Füge Titel über <strong>+</strong> an jedem Song hinzu oder zieh sie auf „${esc(
                   playlist.name
                 )}“ in der Seitenleiste.</p>
                 <button class="btn primary" data-pl-action="search">Songs suchen</button>
               </div>`
        }
      </div>`;
  }

  /* ---------------------------------------------------------------- *
   * Radio
   * ---------------------------------------------------------------- */

  function buildRadio() {
    const tags = RADIO_TAGS.map(
      ([value, label]) =>
        `<button class="radio-tag" data-radio-tag="${value}">${label}</button>`
    ).join('');

    $('#view-radio').innerHTML = `
      <div class="page">
        <div class="page-head">
          <div>
            <div class="eyebrow">Live Radio</div>
            <h2>Radio, das wirklich läuft</h2>
            <p>
              Öffentliche Streams – volle Songs, kein Login, kein DRM.
              Läuft direkt in CleanMusic. Mit ♥ landen Sender in deinen Favoriten.
            </p>
          </div>
          <div class="page-actions">
            <div class="radio-search">
              <input
                id="radio-search-input"
                type="search"
                placeholder="Sender suchen …"
                autocomplete="off"
                spellcheck="false"
              />
              <button class="btn primary small" id="btn-radio-search">Suchen</button>
            </div>
          </div>
        </div>

        <div class="radio-tags" id="radio-tags">
          <button class="radio-tag active" data-radio-tag="">Top</button>
          ${tags}
        </div>

        <div id="radio-grid" class="radio-grid"></div>
      </div>`;

    renderRadioGrid();
  }

  async function loadRadio(options = {}) {
    if (state.radio.loading) return;

    const tag = typeof options.tag === 'string' ? options.tag : state.radio.tag;
    const query =
      typeof options.query === 'string' ? options.query : state.radio.query;

    if (
      state.radio.loaded &&
      !options.force &&
      tag === state.radio.tag &&
      query === state.radio.query
    ) {
      renderRadioGrid();
      return;
    }

    state.radio = {
      stations: [],
      entries: [],
      loading: true,
      loaded: false,
      error: null,
      tag,
      query,
    };
    renderRadioGrid();

    try {
      const result = await bridge.radioStations({ tag, query });
      const stations = Array.isArray(result.stations) ? result.stations : [];
      state.radio = {
        stations,
        entries: stations.map(radioEntry),
        loading: false,
        loaded: true,
        error: result.error || null,
        tag,
        query,
      };
    } catch (error) {
      state.radio = {
        stations: [],
        entries: [],
        loading: false,
        loaded: true,
        error: error.message,
        tag,
        query,
      };
    }

    renderRadioGrid();
  }

  function renderRadioGrid() {
    const host = $('#radio-grid');
    if (!host) return;

    const radio = state.radio;

    if (radio.loading) {
      host.innerHTML = skeletonCards(12, 'radio-card', 'radio-logo');
      return;
    }

    if (!radio.entries.length) {
      host.innerHTML = `
        <div class="panel empty-search">
          <h3>Keine Sender gefunden</h3>
          <p>${
            radio.error
              ? esc(radio.error)
              : 'Versuche einen anderen Suchbegriff oder ein anderes Genre.'
          }</p>
          <div class="row">
            <button class="btn ghost small" id="btn-radio-retry">Erneut versuchen</button>
          </div>
        </div>`;
      return;
    }

    host.innerHTML = radio.entries
      .map((entry, index) => {
        const playing = isPlayingId(entry.id);

        return `
          <article
            class="radio-card ${playing ? 'playing' : ''}"
            data-list="radio" data-index="${index}" data-track-id="${esc(entry.id)}"
            draggable="true"
            title="${esc(entry.title)}"
          >
            <div class="radio-logo">
              ${
                entry.artwork
                  ? `<img src="${esc(entry.artwork)}" alt="" loading="lazy" draggable="false" />`
                  : `<span class="radio-fallback">${ICONS.radio}</span>`
              }
              <span class="radio-live">LIVE</span>
              <div class="chart-play"><span>${ICONS.play}</span></div>
              ${favButton(entry, 'card-fav')}
            </div>
            <div class="radio-name">${esc(entry.title)}</div>
            <div class="radio-meta">${esc(entry.meta || '')}</div>
          </article>`;
      })
      .join('');

    host.querySelectorAll('.radio-logo img').forEach((image) => {
      image.addEventListener('error', () => image.remove(), { once: true });
    });
  }

  /* ---------------------------------------------------------------- *
   * Search
   * ---------------------------------------------------------------- */

  function buildSearch(query) {
    state.query = String(query || '').trim();
    renderSearchShell();

    if (state.query) {
      fetchCatalog(state.query);
      if (searchPlugin()) fetchPluginSearch(state.query);
    } else {
      renderSearchResults();
      if (!state.charts.loaded) loadCharts();
    }
  }

  function renderSearchShell() {
    const term = state.query;
    const full = fullMode();
    const fullPlugin = matchPlugin();
    const finder = searchPlugin();

    const targets = SERVICES.filter((service) => !service.creator).map(
      (service) => `
        <button class="search-target" data-search-service="${service.id}" style="--svc:${service.color}">
          <span class="svc-badge" style="--svc:${service.color}">${esc(service.short)}</span>
          <span class="st-name">${esc(service.name)}</span>
          <span class="st-go">Suchen →</span>
        </button>`
    ).join('');

    const idle = state.plugins.list.filter((plugin) => !plugin.enabled);
    const pluginHint =
      idle.length && !anyPluginReady()
        ? `<div class="panel plugin-hint">
            <div>
              <strong>${
                idle.length === 1
                  ? `Plugin „${esc(idle[0].name)}“ gefunden`
                  : `${idle.length} Plugins gefunden`
              }</strong>
              <p>Plugins bleiben aus, bis du sie in den Einstellungen bewusst aktivierst.</p>
            </div>
            <button class="btn ghost small" data-search-action="plugins">${ICONS.plug} Zu den Plugins</button>
          </div>`
        : '';

    const sources = finder
      ? `Apple Music, Deezer und ${esc(finder.source.label)}`
      : 'Apple Music und Deezer';

    $('#view-search').innerHTML = `
      <div class="page">
        <div class="page-head">
          <div>
            <div class="eyebrow">Unified Search</div>
            <h2>${term ? `Suche: „${esc(term)}“` : 'Songs, die hier laufen'}</h2>
            <p>
              ${
                full
                  ? `Treffer aus ${sources} – volle Titel laufen über das Plugin „${esc(
                      fullPlugin.name
                    )}“ direkt in CleanMusic.`
                  : term
                    ? 'Vorschauen spielen direkt in CleanMusic. Volle Titel laufen über MusicKit oder als lokale Datei.'
                    : 'Beliebte Titel mit 30-Sekunden-Vorschau – direkt in der App abspielbar.'
              }
            </p>
          </div>
          <div class="page-actions">
            ${term ? '<button class="btn ghost small" id="btn-refresh-search">Neu laden</button>' : ''}
            <button class="btn primary small" id="btn-musickit-search">MusicKit</button>
          </div>
        </div>

        ${pluginHint}

        <div id="plugin-results" class="search-results" hidden></div>

        <div id="search-results" class="search-results"></div>

        <div class="panel">
          <h3>In einem Dienst weitersuchen</h3>
          <p>Volle Kataloge, deine Bibliothek und Playlists – im offiziellen Web-Player.</p>
          <div class="search-targets" style="margin-top:12px">${targets}</div>
        </div>

        <div class="panel hint">
          <strong>${full ? 'Woher kommen die vollen Titel?' : 'Warum 30-Sekunden-Vorschauen?'}</strong>
          <p>
            ${
              full
                ? `Apple Music und Deezer liefern nur Metadaten und Vorschauen. Für den vollen Titel sucht das Plugin „${esc(
                    fullPlugin.name
                  )}“ einen passenden Treffer bei ${esc(
                    fullPlugin.source.label
                  )}, CleanMusic streamt ihn – ohne etwas zu speichern. Klappt das nicht, läuft die Vorschau.`
                : 'Apple Music und Deezer stellen Vorschauen offiziell bereit – die laufen legal in CleanMusic. Volle Titel erlauben nur MusicKit (Apple) und lokale Dateien. Alles andere bleibt im Web-Player des Dienstes. Optionale Quellen-Plugins findest du unter Einstellungen → Plugins.'
            }
          </p>
        </div>
      </div>`;

    renderPluginResults();
  }

  async function fetchCatalog(query) {
    const term = String(query || '').trim();
    if (!term) return;

    const requestId = ++searchRequestId;
    state.search = { query: term, tracks: [], loading: true, errors: [], sources: null };
    renderSearchResults();

    try {
      const result = await bridge.searchCatalog(term);
      if (requestId !== searchRequestId) return;

      state.search = {
        query: term,
        tracks: (Array.isArray(result.tracks) ? result.tracks : []).map(previewEntry),
        loading: false,
        errors: Array.isArray(result.errors) ? result.errors : [],
        sources: result.sources || null,
      };
    } catch (error) {
      if (requestId !== searchRequestId) return;

      state.search = {
        query: term,
        tracks: [],
        loading: false,
        errors: [{ source: 'Suche', message: error.message }],
        sources: null,
      };
    }

    renderSearchResults();
  }

  async function fetchPluginSearch(query) {
    const term = String(query || '').trim();
    const plugin = searchPlugin();
    if (!term || !plugin) return;

    const requestId = ++pluginSearchRequestId;
    Object.assign(state.pluginSearch, {
      pluginId: plugin.id,
      query: term,
      results: [],
      loading: true,
      error: null,
    });
    renderPluginResults();

    try {
      const result = await bridge.pluginSearch(plugin.id, term);
      if (requestId !== pluginSearchRequestId) return;
      Object.assign(state.pluginSearch, {
        results: (Array.isArray(result.results) ? result.results : []).map((item) =>
          pluginEntry(plugin, item)
        ),
        loading: false,
        error: result.error || null,
      });
    } catch (error) {
      if (requestId !== pluginSearchRequestId) return;
      Object.assign(state.pluginSearch, { results: [], loading: false, error: error.message });
    }

    renderPluginResults();
  }

  function renderPluginResults() {
    const host = $('#plugin-results');
    if (!host) return;

    const plugin = searchPlugin();
    if (!plugin || !state.query) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }

    host.hidden = false;
    const result = state.pluginSearch;

    if (result.query !== state.query && !result.loading) {
      host.innerHTML = '';
      return;
    }

    if (result.loading) {
      host.innerHTML = `
        <div class="search-status">
          <span class="spinner small"></span>
          <span>Suche über das Plugin „${esc(plugin.name)}“ …</span>
        </div>`;
      return;
    }

    if (!result.results.length) {
      host.innerHTML = `
        <div class="results-head">
          <span>${esc(plugin.source.label)}</span>
          <span class="muted small">${esc(result.error ? `${plugin.name}: ${result.error}` : 'Keine Treffer')}</span>
        </div>`;
      return;
    }

    host.innerHTML = `
      <div class="results-head">
        <span class="results-title">${ICONS.plug} ${esc(plugin.source.label)}</span>
        <span class="muted small">${result.results.length} Treffer · volle Titel über das Plugin „${esc(plugin.name)}“</span>
      </div>
      <div class="song-list">
        ${result.results.map((entry, index) => songRow(entry, index, 'ext')).join('')}
      </div>`;
  }

  function renderSearchResults() {
    const host = $('#search-results');
    if (!host) return;

    const usingCharts = !state.query;
    const listKey = usingCharts ? 'charts' : 'search';
    const search = state.search;
    const tracks = usingCharts ? state.charts.tracks : search.tracks;
    const loading = usingCharts ? state.charts.loading : search.loading;
    const errors = usingCharts ? state.charts.errors : search.errors;
    const sources = usingCharts
      ? tracks.length
        ? { apple: 0, deezer: tracks.length }
        : null
      : search.sources;

    if (loading) {
      host.innerHTML = `
        <div class="search-status">
          <span class="spinner small"></span>
          <span>${usingCharts ? 'Charts werden geladen …' : 'Suche in Apple Music und Deezer …'}</span>
        </div>`;
      return;
    }

    const errorText = (errors || [])
      .map((error) => `${error.source}: ${error.message}`)
      .join(' · ');

    if (!tracks.length) {
      host.innerHTML = `
        <div class="panel empty-search">
          <h3>Keine Vorschau-Treffer</h3>
          <p>
            ${
              usingCharts
                ? 'Beliebte Titel konnten nicht geladen werden.'
                : `Für „${esc(search.query)}“ hat keiner der Vorschau-Kataloge etwas geliefert.`
            }
          </p>
          ${errorText ? `<p class="muted small">${esc(errorText)}</p>` : ''}
          <div class="row">
            ${
              usingCharts
                ? '<button class="btn ghost small" data-home-action="refresh">Charts neu laden</button>'
                : ''
            }
            <span class="muted small">Volle Titel findest du über die Dienste unten oder im MusicKit-Fenster.</span>
          </div>
        </div>`;
      return;
    }

    const sourceText = sources
      ? `${sources.apple} Apple Music · ${sources.deezer} Deezer`
      : '';

    host.innerHTML = `
      <div class="results-head">
        <span class="results-title">${usingCharts ? 'Charts' : 'Apple Music & Deezer'}</span>
        ${sourceText ? `<span class="muted small">${esc(sourceText)}</span>` : ''}
        <span class="muted small">${
          fullMode() ? `voller Titel über ${esc(matchPlugin().source.label)}` : '30-Sekunden-Vorschau'
        }</span>
      </div>
      <div class="song-list">
        ${tracks.map((entry, index) => songRow(entry, index, listKey)).join('')}
      </div>
      ${errorText ? `<p class="muted small">Teilweise fehlgeschlagen: ${esc(errorText)}</p>` : ''}`;
  }

  /* ---------------------------------------------------------------- *
   * Embedded service views
   * ---------------------------------------------------------------- */

  function ensureServiceView(service, initialUrl) {
    if (state.views.has(service.id)) return state.views.get(service.id);

    const view = document.createElement('webview');
    view.className = 'service-view';
    view.dataset.service = service.id;
    view.setAttribute('partition', `persist:cm-${service.id}`);
    view.setAttribute('allowpopups', '');
    view.setAttribute('src', initialUrl || service.url);

    view.addEventListener('did-start-loading', () => {
      if (state.currentService === service.id && state.view === 'service') {
        showLoading(true, service.name);
      }
    });

    view.addEventListener('did-stop-loading', () => {
      if (state.currentService === service.id) showLoading(false);
    });

    view.addEventListener('did-fail-load', (event) => {
      if (event.errorCode === -3 || event.isMainFrame === false) return;
      showLoading(false);
      if (state.currentService === service.id && state.view === 'service') {
        showServiceBanner(service);
      }
    });

    $('#service-host').appendChild(view);
    state.views.set(service.id, view);
    return view;
  }

  function openService(id, options = {}) {
    const service = serviceById(id);
    if (!service) return;

    if (state.settings.systemBrowser || !supportsWebview) {
      openExternalService(id);
      return;
    }

    const isNew = !state.views.has(service.id);
    const searchUrl = options.query && typeof service.search === 'function' ? service.search(options.query) : null;
    const view = ensureServiceView(service, searchUrl || undefined);

    // A freshly attached webview must get its URL through `src`; loadURL()
    // only works once the guest is attached.
    if (!isNew && searchUrl) {
      Promise.resolve(view.loadURL(searchUrl)).catch(() => {});
    }

    state.currentService = id;
    hideServiceBanner();
    showView('service');
  }

  function openExternalService(id) {
    const service = serviceById(id);
    if (!service) return;

    let url = service.url;
    const view = state.views.get(id);
    if (view && typeof view.getURL === 'function') {
      try {
        const current = view.getURL();
        if (current && /^https?:/i.test(current)) url = current;
      } catch {
        /* not attached yet */
      }
    }

    bridge.openExternal(url);
  }

  function setActiveService(id) {
    state.views.forEach((view, serviceId) => {
      view.classList.toggle('active', serviceId === id);
    });
  }

  function showLoading(show, name) {
    const el = $('#loading');
    if (!el) return;
    if (show && name) $('#loading-text').textContent = `${name} wird geladen …`;
    el.classList.toggle('hidden', !show);
  }

  function showServiceBanner(service) {
    const el = $('#service-banner');
    el.dataset.service = service.id;
    el.innerHTML = `
      <span>${esc(service.name)} konnte nicht geladen werden.</span>
      <button class="btn ghost small" data-banner-reload>Neu laden</button>
      <button class="btn ghost small" data-banner-external>Im Browser öffnen</button>
      <button class="icon-btn" data-banner-close title="Schließen">×</button>`;
    el.classList.add('show');
  }

  function hideServiceBanner() {
    const el = $('#service-banner');
    if (el) el.classList.remove('show');
  }

  /* ---------------------------------------------------------------- *
   * Local library
   * ---------------------------------------------------------------- */

  function rebuildLocalEntries() {
    state.library.entries = state.library.tracks.map(localEntry);
  }

  function restoreLibrary() {
    const stored = readJSON(STORAGE.library, null);
    if (!stored || !Array.isArray(stored.tracks)) return;

    state.library.tracks = stored.tracks
      .filter((track) => track && typeof track.url === 'string')
      .map((track) => ({
        name: track.name || '',
        path: track.path || '',
        dir: track.dir || '',
        url: track.url,
        size: Number(track.size) || 0,
        title: track.title || track.name || 'Unbekannt',
        artist: track.artist || '',
      }));
    state.library.folder = stored.folder || null;
    rebuildLocalEntries();
  }

  function persistLibrary() {
    writeJSON(STORAGE.library, {
      folder: state.library.folder,
      tracks: state.library.tracks.slice(0, 4000),
    });
  }

  async function addFolder() {
    const result = await bridge.pickFolder();
    if (!result) return;

    const known = new Set(state.library.tracks.map((track) => track.path));
    const added = result.files
      .filter((file) => !known.has(file.path))
      .map((file) => {
        const base = file.name.replace(/\.[^.]+$/, '');
        const match = base.match(/^(.+?)\s+-\s+(.+)$/);
        return {
          name: file.name,
          path: file.path,
          dir: file.dir,
          url: file.url,
          size: file.size,
          title: match ? match[2].trim() : base,
          artist: match ? match[1].trim() : '',
        };
      });

    state.library.tracks = state.library.tracks.concat(added);
    state.library.folder = result.folder;
    rebuildLocalEntries();
    persistLibrary();
    renderLocal();
    renderHomeLocal();
    updateStatusChips();
    toast(added.length ? `${added.length} Titel hinzugefügt` : 'Keine neuen Audiodateien gefunden');
  }

  function clearLibrary() {
    const current = currentItem();
    state.library = { tracks: [], entries: [], folder: null };
    persistLibrary();

    if (current && current.kind === 'local') {
      state.queue = { items: [], index: -1, kind: 'local', upcoming: -1 };
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      state.nowMode = null;
      setNowPlaying(null);
      setTransportEnabled(false);
    }

    renderLocal();
    renderHomeLocal();
    updateStatusChips();
  }

  function renderLocal() {
    const entries = state.library.entries;
    const tracks = state.library.tracks;
    const folder = state.library.folder;

    const rows = entries
      .map((entry, index) => {
        const playing = isPlayingId(entry.id);
        const fav = favIds.has(entry.id);
        return `
          <tr data-list="local" data-index="${index}" data-track-id="${esc(entry.id)}"
            class="${playing ? 'playing' : ''}" draggable="true">
            <td class="col-idx">${playing ? EQ : index + 1}</td>
            <td class="col-title">
              <span class="t-title">${esc(entry.title)}</span>
              ${entry.artist ? `<span class="t-artist">${esc(entry.artist)}</span>` : ''}
            </td>
            <td class="col-dir">${esc(entry.dir)}</td>
            <td class="col-size">${fmtSize(tracks[index] ? tracks[index].size : 0)}</td>
            <td class="col-act">
              <span class="row-actions">
                <button class="icon-btn fav ${fav ? 'on' : ''}" data-act="fav" title="${
                  fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten'
                }">${ICONS.heart}</button>
                <button class="icon-btn" data-act="add" title="Zur Playlist hinzufügen">${ICONS.plus}</button>
              </span>
            </td>
          </tr>`;
      })
      .join('');

    const body = entries.length
      ? `<div class="table-wrap">
           <table class="track-table">
             <thead>
               <tr><th class="col-idx">#</th><th class="col-title">Titel</th><th class="col-dir">Ordner</th><th class="col-size">Größe</th><th class="col-act"></th></tr>
             </thead>
             <tbody>${rows}</tbody>
           </table>
         </div>`
      : `<div class="empty">
           <div class="empty-icon">♪</div>
           <h3>Noch keine lokale Musik</h3>
           <p>Füge einen Ordner mit MP3, FLAC, WAV, M4A, OGG oder OPUS hinzu. Diese Titel spielt CleanMusic komplett selbst ab – ohne Streaming, ohne DRM.</p>
           <button class="btn primary" id="btn-empty-add">Ordner auswählen</button>
         </div>`;

    $('#view-local').innerHTML = `
      <div class="page">
        <div class="page-head">
          <div>
            <div class="eyebrow">Bibliothek</div>
            <h2>Lokale Musik</h2>
            <p>${
              entries.length
                ? `${entries.length} Titel${folder ? ` · ${esc(folder)}` : ''}`
                : 'Der Teil, der zu 100 % in CleanMusic läuft.'
            }</p>
          </div>
          <div class="page-actions">
            ${entries.length ? `<button class="btn ghost" data-local-action="shuffle">${ICONS.shuffle} Shuffle</button>` : ''}
            <button class="btn primary" id="btn-add-folder">Ordner hinzufügen</button>
            ${entries.length ? '<button class="btn ghost" id="btn-clear-lib">Leeren</button>' : ''}
          </div>
        </div>
        ${body}
      </div>`;
  }

  /* ---------------------------------------------------------------- *
   * Playback – resolving a playable URL for every kind of entry
   * ---------------------------------------------------------------- */

  function previewExpired(url) {
    const match = /exp=(\d+)/.exec(url || '');
    return match ? Number(match[1]) * 1000 < Date.now() + 60 * 1000 : false;
  }

  async function freshPreview(item, force) {
    if (item.url && !force && !previewExpired(item.url)) return item.url;

    try {
      const result = await bridge.refreshPreview(item.id, { title: item.title, artist: item.artist });
      if (result && result.url) {
        item.url = result.url;
        if (!item.artwork && result.artwork) item.artwork = result.artwork;
        updateStoredUrl(item.id, result.url, item.artwork);
        return result.url;
      }
    } catch {
      /* keep the old URL */
    }

    return item.url || null;
  }

  function rememberMatch(key, refId) {
    state.matches[key] = refId;
    const keys = Object.keys(state.matches);
    if (keys.length > 800) {
      keys.slice(0, keys.length - 800).forEach((old) => delete state.matches[old]);
    }
    writeJSON(STORAGE.matches, state.matches);
  }

  async function resolveFull(item, force) {
    const plugin = matchPlugin();
    if (!plugin) throw new Error('Kein Plugin für volle Titel aktiv');

    const key = `${plugin.id}|${matchKey(item)}`;
    const known = state.matches[key];
    const label = plugin.source.label;

    if (known && plugin.capabilities.resolve) {
      const result = await bridge.pluginResolve(plugin.id, known, force);
      if (result && result.ok) {
        return { url: result.stream.url, mode: 'matched', stream: result.stream, label };
      }
    }

    const result = await bridge.pluginMatch(plugin.id, {
      title: item.title,
      artist: item.artist,
      album: item.album,
      duration: item.duration,
      force: Boolean(force && !known),
    });

    if (!result || !result.ok) {
      throw new Error((result && result.error) || 'Kein voller Titel gefunden');
    }

    if (result.stream.refId) rememberMatch(key, result.stream.refId);
    return { url: result.stream.url, mode: 'matched', stream: result.stream, label };
  }

  async function resolveSource(item, force) {
    if (item.kind === 'local' || item.kind === 'radio' || item.kind === 'stream') {
      return { url: item.url, mode: item.kind };
    }

    if (item.kind === 'plugin') {
      const plugin = pluginById(item.pluginId);
      if (!isPluginReady(plugin) || !plugin.capabilities.resolve) {
        throw new Error(
          `Für diesen Titel braucht es das Plugin „${plugin ? plugin.name : item.pluginId}“ – Einstellungen → Plugins.`
        );
      }
      const result = await bridge.pluginResolve(plugin.id, item.refId, force);
      if (!result || !result.ok) {
        throw new Error(`${plugin.name}: ${(result && result.error) || 'Stream nicht verfügbar'}`);
      }
      return { url: result.stream.url, mode: 'plugin', stream: result.stream, label: plugin.source.label };
    }

    let notice = null;
    if (fullMode()) {
      try {
        return await resolveFull(item, force);
      } catch (error) {
        notice = `Kein voller Titel gefunden – spiele die 30-s-Vorschau.`;
      }
    }

    const url = await freshPreview(item, force);
    if (!url) throw new Error('Für diesen Titel gibt es keine Vorschau.');
    return { url, mode: 'preview', notice };
  }

  function needsSlowResolve(item) {
    return item.kind === 'plugin' || (item.kind === 'preview' && (fullMode() || !item.url));
  }

  function prefetchPluginEntry(entry) {
    if (entry.kind === 'plugin') {
      const plugin = pluginById(entry.pluginId);
      if (!isPluginReady(plugin) || !plugin.capabilities.resolve) return null;
      return Promise.resolve(bridge.pluginResolve(plugin.id, entry.refId, false));
    }
    if (entry.kind === 'preview' && fullMode()) return resolveFull(entry, false);
    return null;
  }

  function setPlayLoading(on) {
    $('#btn-play').classList.toggle('loading', Boolean(on));
    $('#fs-play').classList.toggle('loading', Boolean(on));
  }

  async function playFromQueue(index, options = {}) {
    const item = state.queue.items[index];
    if (!item) return;

    state.queue.index = index;
    state.queue.upcoming = -1;
    if (!options.retry) state.retry = { id: item.id, count: 0 };
    const token = ++playToken;

    const live = item.kind === 'radio';
    const seek = $('#seek');
    seek.disabled = live;
    seek.max = '0';
    seek.value = '0';
    $('#t-cur').textContent = live ? 'LIVE' : '0:00';
    $('#t-dur').textContent = live ? 'LIVE' : item.duration ? fmtTime(item.duration) : '0:00';

    const seekRow = seek.closest('.seek-row');
    if (seekRow) seekRow.hidden = live;
    const liveIndicator = $('#live-indicator');
    if (liveIndicator) liveIndicator.hidden = !live;

    const slow = needsSlowResolve(item);
    if (slow) audio.pause();

    state.nowMode = slow ? 'loading' : null;
    state.nowLabel = null;
    setNowPlaying(item);
    setTransportEnabled(true);
    setPlayLoading(slow);
    updatePlayingHighlights();

    let source;
    try {
      source = await resolveSource(item, Boolean(options.force));
    } catch (error) {
      if (token !== playToken) return;
      setPlayLoading(false);
      state.nowMode = 'error';
      setNowPlaying(item);
      toast(error.message || 'Titel konnte nicht geladen werden');
      return;
    }

    if (token !== playToken) return;

    setPlayLoading(false);
    state.nowMode = source.mode;
    state.nowLabel = source.label || null;
    if (source.stream && !item.duration && source.stream.duration) {
      item.duration = source.stream.duration;
    }

    audio.src = source.url;
    audio.play().catch((error) => {
      if (error && (error.name === 'AbortError' || error.name === 'NotSupportedError')) return;
      toast(`Konnte nicht abspielen: ${error.message}`);
    });

    setNowPlaying(item);
    refreshRowArt(item);
    if (source.notice) toast(source.notice);
    planUpcoming();
    schedulePrefetch();
  }

  // Covers can arrive with the stream (e.g. NCS via Apple's catalog).
  function refreshRowArt(item) {
    if (!item.artwork) return;
    $$('#content .song-row[data-track-id]').forEach((row) => {
      if (row.dataset.trackId !== item.id) return;
      const art = row.querySelector('.song-art');
      if (art && !art.querySelector('img')) art.innerHTML = songArt(item);
    });
  }

  function planUpcoming() {
    const { items, index } = state.queue;
    // Titles the user queued always come next – also with shuffle.
    if (items[index + 1] && items[index + 1].queued) {
      state.queue.upcoming = index + 1;
      if (state.fullscreen) renderUpNext();
      return;
    }
    if (autoplayEligible()) maybeAutoplay();
    if (items.length < 2) {
      state.queue.upcoming = -1;
      return;
    }

    if (state.playback.shuffle) {
      let next;
      do {
        next = Math.floor(Math.random() * items.length);
      } while (next === index);
      state.queue.upcoming = next;
    } else {
      state.queue.upcoming = (index + 1) % items.length;
    }
    if (state.fullscreen) renderUpNext();
  }

  function schedulePrefetch() {
    clearTimeout(prefetchTimer);
    if (!anyPluginReady()) return;

    // Resolve the next track while this one plays – plugins may need a few
    // seconds per title, the next one should start instantly.
    prefetchTimer = setTimeout(() => {
      const next = state.queue.items[state.queue.upcoming];
      if (!next) return;
      const task = prefetchPluginEntry(next);
      if (task) task.catch(() => {});
    }, 5000);
  }

  // Hover intent: resolving takes seconds, so start when the pointer rests
  // on a row – the click that usually follows then plays almost at once.
  let hoverTimer = null;
  let hoverRunning = 0;
  const hoverPrefetched = new Set();

  function prefetchEntry(entry) {
    if (!entry || hoverPrefetched.has(entry.id) || hoverRunning >= 2) return;

    const task = prefetchPluginEntry(entry);
    if (!task) return;

    hoverPrefetched.add(entry.id);
    hoverRunning += 1;
    task
      .catch(() => hoverPrefetched.delete(entry.id))
      .finally(() => {
        hoverRunning -= 1;
      });
  }

  function onRowHover(event) {
    const row = event.target.closest && event.target.closest('[data-list][data-index]');
    clearTimeout(hoverTimer);
    if (!row || !anyPluginReady()) return;
    hoverTimer = setTimeout(() => {
      prefetchEntry(entryAt(row.dataset.list, Number(row.dataset.index)));
    }, 450);
  }

  function stepQueue(direction) {
    const items = state.queue.items;
    if (!items.length) return;

    if (direction > 0 && autoplayEligible()) {
      const task = maybeAutoplay();
      if (task) {
        task.then(() => {
          if (state.queue.index < state.queue.items.length - 1) playFromQueue(state.queue.index + 1);
        });
        return;
      }
    }

    const current = state.queue.index;
    let next;

    if (direction > 0 && state.queue.upcoming >= 0 && state.queue.upcoming < items.length) {
      next = state.queue.upcoming;
    } else if (state.playback.shuffle && items.length > 1) {
      do {
        next = Math.floor(Math.random() * items.length);
      } while (next === current);
    } else {
      next = current < 0 ? 0 : (current + direction + items.length) % items.length;
    }

    playFromQueue(next);
  }

  function updatePlayingHighlights() {
    const current = currentItem();
    const currentId = current ? current.id : null;

    $$('#content [data-track-id]').forEach((el) => {
      el.classList.toggle('playing', Boolean(currentId) && el.dataset.trackId === currentId);
    });

    $$('#view-local tbody tr[data-index]').forEach((row) => {
      const cell = row.querySelector('.col-idx');
      if (cell) {
        cell.innerHTML = row.classList.contains('playing') ? EQ : String(Number(row.dataset.index) + 1);
      }
    });

    $$('#view-home .home-local-row').forEach((row) => {
      const idx = row.querySelector('.home-local-idx');
      if (idx) {
        idx.innerHTML = row.classList.contains('playing') ? EQ : String(Number(row.dataset.index) + 1);
      }
    });
  }

  function setNowPlaying(item) {
    const fallbackArtist = {
      local: 'Lokale Wiedergabe',
      radio: 'Live Radio',
      plugin: 'Plugin',
      preview: 'Vorschau',
    };

    $('#np-title').textContent = item ? item.title : 'Nichts ausgewählt';
    $('#np-artist').textContent = item
      ? item.artist || fallbackArtist[item.kind] || ''
      : 'Lokale Wiedergabe';

    const letter = $('#np-art-letter');
    const image = $('#np-art-img');

    if (item && item.artwork) {
      image.src = item.artwork;
      image.hidden = false;
      letter.hidden = true;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
      letter.hidden = false;
      letter.textContent = item
        ? (item.title || '♪').trim().charAt(0).toUpperCase() || '♪'
        : '♪';
    }

    const badge = $('#np-badge');
    const mode = state.nowMode;
    let text = '';
    let tone = '';

    if (item) {
      if (mode === 'loading') {
        const plugin = item.kind === 'plugin' ? pluginById(item.pluginId) : null;
        text = plugin ? `${plugin.name} lädt …` : 'Voller Titel wird gesucht …';
        tone = 'loading';
      } else if (mode === 'error') {
        text = 'Nicht verfügbar';
        tone = 'error';
      } else if (item.kind === 'radio') {
        text = 'Radio · LIVE';
      } else if (item.kind === 'stream') {
        text = `Voll · ${item.license || item.sourceLabel || 'frei'}`;
        tone = 'free';
      } else if (mode === 'plugin' || mode === 'matched') {
        text = `Voll · ${state.nowLabel || item.sourceLabel || 'Plugin'}`;
        tone = 'ext';
      } else if (item.kind === 'preview') {
        text = '30 s Vorschau';
      }
    }

    badge.textContent = text;
    badge.dataset.tone = tone;
    badge.hidden = !text;
    updateNowPlayingActions();
    applyArtworkColors(item ? item.artwork : '');
    syncFullscreen();
    pushPresence();
    pushPlayerState();
    updateMediaSession();
    renderQueuePanel();
  }

  function updateNowPlayingActions() {
    const item = currentItem();
    const fav = $('#btn-np-fav');
    const add = $('#btn-np-add');
    if (!fav || !add) return;

    fav.disabled = !item;
    add.disabled = !item;
    const on = Boolean(item && favIds.has(item.id));
    fav.classList.toggle('on', on);
    fav.title = on ? 'Aus Favoriten entfernen' : 'Zu Favoriten';
  }

  function setTransportEnabled(enabled) {
    ['#btn-prev', '#btn-play', '#btn-next', '#btn-shuffle', '#btn-repeat'].forEach(
      (selector) => {
        $(selector).disabled = !enabled;
      }
    );
  }

  /* ---------------------------------------------------------------- *
   * Player wiring
   * ---------------------------------------------------------------- */

  function syncPlaybackButtons() {
    const shuffleButton = $('#btn-shuffle');
    const repeatButton = $('#btn-repeat');

    shuffleButton.classList.toggle('active', Boolean(state.playback.shuffle));
    shuffleButton.title = state.playback.shuffle ? 'Shuffle an' : 'Shuffle aus';

    repeatButton.classList.toggle('active', state.playback.repeat !== 'off');
    repeatButton.classList.toggle('repeat-one', state.playback.repeat === 'one');
    const fsShuffle = $('#fs-shuffle');
    const fsRepeat = $('#fs-repeat');
    if (fsShuffle) fsShuffle.classList.toggle('active', Boolean(state.playback.shuffle));
    if (fsRepeat) {
      fsRepeat.classList.toggle('active', state.playback.repeat !== 'off');
      fsRepeat.classList.toggle('repeat-one', state.playback.repeat === 'one');
    }

    repeatButton.title =
      state.playback.repeat === 'one'
        ? 'Titel wiederholen'
        : state.playback.repeat === 'all'
          ? 'Alle wiederholen'
          : 'Wiederholen aus';
  }

  function wirePlayer() {
    const playButton = $('#btn-play');

    playButton.addEventListener('click', () => {
      if (!audio.src) return;
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    });

    $('#btn-prev').addEventListener('click', () => {
      if (audio.currentTime > 4 && Number.isFinite(audio.duration)) {
        audio.currentTime = 0;
        return;
      }
      stepQueue(-1);
    });
    $('#btn-next').addEventListener('click', () => stepQueue(1));

    $('#btn-shuffle').addEventListener('click', () => {
      state.playback.shuffle = !state.playback.shuffle;
      writeJSON(STORAGE.playback, state.playback);
      syncPlaybackButtons();
      planUpcoming();
      schedulePrefetch();
    });

    $('#btn-repeat').addEventListener('click', () => {
      state.playback.repeat =
        state.playback.repeat === 'off'
          ? 'all'
          : state.playback.repeat === 'all'
            ? 'one'
            : 'off';
      writeJSON(STORAGE.playback, state.playback);
      syncPlaybackButtons();
    });

    syncPlaybackButtons();

    $('#btn-np-fav').addEventListener('click', () => toggleFavorite(currentItem()));
    $('#btn-np-add').addEventListener('click', (event) => {
      event.stopPropagation();
      const item = currentItem();
      if (item) openAddMenu(event.currentTarget, [item]);
    });

    audio.addEventListener('play', () => {
      playButton.classList.add('playing');
      $('#fs-play').classList.add('playing');
      pushPresence();
      fsActivity();
    });
    audio.addEventListener('pause', () => {
      playButton.classList.remove('playing');
      $('#fs-play').classList.remove('playing');
      $('#fullscreen').classList.remove('idle');
      pushPresence();
    });
    audio.addEventListener('seeked', () => pushPresence());

    audio.addEventListener('ended', () => {
      if (sleepTimer.endOfTrack) {
        setSleepTimer(null);
        toast('Schlaf-Timer: Wiedergabe angehalten. Gute Nacht!');
        return;
      }
      if (state.playback.repeat === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
        return;
      }

      const { items, index } = state.queue;
      const atEnd = index >= items.length - 1;
      if (state.playback.repeat === 'off' && !state.playback.shuffle && atEnd) {
        if (autoplayEligible()) stepQueue(1);
        return;
      }

      stepQueue(1);
    });

    audio.addEventListener('error', () => {
      if (!audio.getAttribute('src')) return;
      const item = currentItem();
      if (!item) return;

      if (audio.error) {
        console.warn(`Audio error ${audio.error.code} (${item.kind}): ${audio.error.message || ''}`);
      }

      // Streams: 1) same URL again after a moment (some CDNs reject the
      // first request), 2) resolve a fresh URL, 3) give up.
      if (!state.retry || state.retry.id !== item.id) state.retry = { id: item.id, count: 0 };
      const retry = state.retry;

      if (item.kind !== 'local' && item.kind !== 'radio' && retry.count < 2) {
        retry.count += 1;
        const streamed = state.nowMode === 'plugin' || state.nowMode === 'matched';

        if (retry.count === 1 && streamed) {
          const src = audio.getAttribute('src');
          const token = playToken;
          setTimeout(() => {
            if (token !== playToken) return;
            audio.src = src;
            audio.play().catch(() => {});
          }, 1200);
          return;
        }

        playFromQueue(state.queue.index, { force: true, retry: true });
        return;
      }

      state.nowMode = 'error';
      setNowPlaying(item);
      toast(
        item.kind === 'radio'
          ? 'Der Sender ist gerade nicht erreichbar.'
          : item.kind === 'local'
            ? 'Die Datei ist nicht lesbar oder wurde verschoben.'
            : 'Der Titel konnte nicht abgespielt werden.'
      );
    });

    audio.addEventListener('loadedmetadata', () => {
      pushPresence();
      const item = currentItem();
      if ((item && item.kind === 'radio') || !Number.isFinite(audio.duration)) {
        $('#seek').disabled = true;
        $('#seek').max = '0';
        $('#t-dur').textContent = 'LIVE';
        $('#t-cur').textContent = 'LIVE';

        const row = $('#seek').closest('.seek-row');
        if (row) row.hidden = true;
        const indicator = $('#live-indicator');
        if (indicator) indicator.hidden = false;
        return;
      }

      $('#seek').disabled = false;
      $('#seek').max = String(audio.duration);
      $('#t-dur').textContent = fmtTime(audio.duration);

      const row = $('#seek').closest('.seek-row');
      if (row) row.hidden = false;
      const indicator = $('#live-indicator');
      if (indicator) indicator.hidden = true;
    });

    audio.addEventListener('timeupdate', () => {
      if (!Number.isFinite(audio.duration)) return;
      const seek = $('#seek');
      if (document.activeElement !== seek) {
        seek.value = String(audio.currentTime);
      }
      $('#t-cur').textContent = fmtTime(audio.currentTime);
      updateFsProgress();
    });

    $('#seek').addEventListener('input', (event) => {
      const value = Number(event.target.value);
      if (Number.isFinite(value)) audio.currentTime = value;
      $('#t-cur').textContent = fmtTime(value);
    });

    const volume = $('#volume');
    Object.assign(vol, loadVolume());
    applyVolume();

    volume.addEventListener('input', () => setVolume(Number(volume.value)));
    $('#btn-mute').addEventListener('click', () => setMuted(!vol.muted));
    $('#btn-sleep').addEventListener('click', (event) => {
      event.stopPropagation();
      openSleepMenu($('#btn-sleep'));
    });
    [volume, $('#btn-mute'), $('#volume-pct')].forEach((el) => {
      if (el) el.addEventListener('wheel', onVolumeWheel, { passive: false });
    });
  }

  /* ---------------------------------------------------------------- *
   * First steps (onboarding) + "Neu in dieser Version"
   *
   * The assistant opens on the very first start (nothing stored yet) and
   * can be opened again from the settings. Existing users get a short
   * "what's new" card once after an update instead.
   * ---------------------------------------------------------------- */

  const WHATS_NEW = {
    '1.3.0': [
      'Neue Game-Sounds-Kategorien von Freesound über Openverse – mit CC0-/CC-BY-Lizenzfilter.',
      'Freie Musik hat jetzt Chiptune/8-Bit, Videospiel und Boss-Kampf; Kevin MacLeod zusätzlich Gaming & Retro.',
      'Der Mini-Visualizer zeigt das Spektrum jetzt auch mit aktiver optionaler Audio-Kette.',
    ],
    '1.2.0': [
      'YouTube-Music-Playlists lassen sich jetzt per Link mit einem aktiven Quellen-Plugin übertragen.',
      'Spotify-Links und CSV-/JSON-Dateien funktionieren weiterhin wie bisher.',
    ],
    '1.1.0': [
      'Spotify-Playlists per öffentlichem Link oder CSV-/JSON-Datei übertragen.',
      'Titel werden mit Deezer-Vorschauen abgeglichen; nicht gefundene Titel kannst du kopieren.',
    ],
    '1.0.2': [
      'Installierte Version: Updates brechen nicht mehr ab, wenn du direkt nach dem Start auf „Updaten“ klickst.',
      'Klappt ein Update-Download nicht, gibt es jetzt „Nochmal versuchen“.',
    ],
    '1.0.1': [
      'Songwünsche für Plugins: Mit dem Streamer.bot-Plugin (ab 1.1.0) wünscht sich dein Twitch-Chat per !sr Titel – optional, mit Limits.',
      'Wünsche stehen in der Warteschlange unter „Songwünsche aus dem Chat“ mit Namen.',
    ],
    '1.0.0': [
      'CleanMusic 1.0 – jetzt auch als Installer (Startmenü, Deinstallation, Updates mit einem Klick).',
      'Tastenkürzel-Übersicht: einfach ? drücken (oder Einstellungen → System → „Tastenkürzel“).',
      'Seit 0.10–0.12: Warteschlange + Autoplay, Epidemic Sound und Artlist, Erste-Schritte-Assistent.',
    ],
    '0.12.0': [
      'Erste-Schritte-Assistent – jederzeit unter Einstellungen → System → „Erste Schritte“.',
      'Seit 0.11: Epidemic Sound und Artlist im Cutter-Modus, Abo-Downloads im Cutting-Ordner.',
      'Seit 0.10: Warteschlange, „Als Nächstes“ und Autoplay nach Suchtreffern.',
    ],
  };

  const ONBOARDING_STEPS = 5;
  let onboardingStep = 0;

  function onboardingThemes() {
    const active = currentTheme();
    return THEMES.map((theme) => {
      const c = theme.colors;
      const style = `--t-bg:${c.bg};--t-panel:${c.panel3};--t-text:${c.text};--t-accent:${c.accent};--t-accent-2:${c.accent2};--t-border:${c.border}`;
      return `
        <button class="theme-card ${active && active.id === theme.id ? 'active' : ''}" data-ob-theme="${esc(theme.id)}" style="${style}" title="${esc(theme.name)}">
          <span class="theme-preview" aria-hidden="true">
            <i class="tp-side"></i><i class="tp-line"></i><i class="tp-line short"></i><i class="tp-dot"></i><i class="tp-dot two"></i>
          </span>
          <strong>${esc(theme.name)}</strong>
        </button>`;
    }).join('');
  }

  function onboardingToggle(id, title, text, on) {
    return `
      <label class="toggle-row">
        <span><strong>${title}</strong><small>${text}</small></span>
        <input type="checkbox" data-ob-option="${id}" ${on ? 'checked' : ''} />
      </label>`;
  }

  function onboardingBody(step) {
    switch (step) {
      case 0:
        return `
          <div class="ob-hero">
            <img class="ob-logo" src="assets/logo.svg" alt="" />
            <div>
              <h2>Willkommen bei CleanMusic</h2>
              <p>Alle Musikdienste an einem Ort, eigene Musik, Radio – und ein Cutter-Modus mit Musik und Sounds für deine Videos. Such dir zuerst einen Look aus:</p>
            </div>
          </div>
          <div class="theme-grid ob-themes">${onboardingThemes()}</div>`;
      case 1: {
        const count = state.library.entries.length;
        return `
          <h2>Deine Musik</h2>
          <p>MP3, FLAC, WAV, M4A … aus deinen Ordnern laufen direkt in CleanMusic – ohne Login, ohne Internet.</p>
          <div class="ob-folder">
            <button class="btn primary" data-ob-action="folder">${ICONS.folder} Musikordner hinzufügen</button>
            <span class="muted small" id="ob-folder-count">${count ? `${count} Titel in deiner Bibliothek` : 'Optional – geht auch später unter „Lokale Musik“.'}</span>
          </div>`;
      }
      case 2:
        return `
          <h2>So spielt CleanMusic</h2>
          <div class="ob-tiles">
            <div class="ob-tile">${ICONS.search}<strong>Suchen & reinhören</strong><span>30-Sekunden-Vorschauen aus Apple Music und Deezer, danach Autoplay mit Vorschlägen. ♥ und + sammeln alles in Favoriten und Playlists.</span></div>
            <div class="ob-tile">${ICONS.radio}<strong>Radio</strong><span>Tausende Sender live, volle Songs, ohne Login.</span></div>
            <div class="ob-tile">${ICONS.spark}<strong>Deine Dienste</strong><span>Spotify, YouTube Music, Apple Music & Co. laufen als offizielle Web-Player eingebettet – dein Login bleibt.</span></div>
            <div class="ob-tile">${ICONS.scissors}<strong>Cutter-Modus</strong><span>Musik und Sounds für Videos mit Lizenz und fertigem Credit – plus Epidemic Sound und Artlist mit deinem Abo.</span></div>
          </div>`;
      case 3:
        return `
          <h2>Deine Einstellungen</h2>
          <p>Alles lässt sich später unter Einstellungen ändern.</p>
          <div class="ob-options">
            ${onboardingToggle('autoplay', 'Autoplay', 'Nach einem Titel aus der Suche passende Vorschläge weiterspielen.', autoplayOn())}
            ${onboardingToggle('updates', 'Beim Start nach Updates suchen', 'Neue Versionen mit einem Klick installieren.', updateInfo ? updateInfo.auto : true)}
            ${onboardingToggle('downloads', 'Downloads „Nur Cutting“', 'Freie Musik und Sounds (CC0, CC BY) mit Credit-Datei herunterladen.', state.settings.downloads === 'cutting')}
            ${onboardingToggle('visualizer', 'Visualizer', 'Tanzt im Vollbild-Player zur Musik.', state.settings.visualizer)}
            ${onboardingToggle('tray', 'Beim Schließen im Infobereich weiterlaufen', 'Das X versteckt nur das Fenster, die Musik läuft weiter.', Boolean(state.closeToTray))}
          </div>`;
      default:
        return `
          <h2>Plugins & los geht's</h2>
          <p>CleanMusic bringt keine Plugins mit. Du kannst unter Einstellungen → Plugins selbst welche hinzufügen – etwa das OBS-Overlay oder Streamer.bot für Streams. Plugins starten nie von allein, erst wenn du sie einschaltest.</p>
          <ul class="ob-tips">
            <li><kbd>Strg K</kbd> sucht, <kbd>F</kbd> öffnet den Vollbild-Player, <kbd>M</kbd> schaltet stumm.</li>
            <li>Rechtsklick auf einen Titel: „Als Nächstes abspielen“ oder in eine Playlist.</li>
            <li>Dieser Assistent: Einstellungen → System → „Erste Schritte“.</li>
          </ul>`;
    }
  }

  function renderOnboarding() {
    const root = $('#onboarding');
    if (!root) return;
    const step = onboardingStep;
    const last = step === ONBOARDING_STEPS - 1;
    root.innerHTML = `
      <div class="ob-card" role="dialog" aria-modal="true" aria-label="Erste Schritte">
        <div class="ob-progress">${Array.from({ length: ONBOARDING_STEPS }, (_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
        <div class="ob-body">${onboardingBody(step)}</div>
        <div class="ob-actions">
          <button class="btn ghost small" data-ob-action="skip">${last ? 'Zu den Einstellungen' : 'Überspringen'}</button>
          <span class="ob-spacer"></span>
          ${step > 0 ? '<button class="btn ghost small" data-ob-action="back">Zurück</button>' : ''}
          <button class="btn primary small" data-ob-action="next">${last ? 'Los geht\'s' : 'Weiter'}</button>
        </div>
      </div>`;
  }

  function openOnboarding() {
    const root = $('#onboarding');
    if (!root) return;
    onboardingStep = 0;
    root.hidden = false;
    renderOnboarding();
  }

  function closeOnboarding(target) {
    const root = $('#onboarding');
    if (!root || root.hidden) return;
    root.hidden = true;
    root.innerHTML = '';
    state.settings.onboarded = true;
    saveSettings();
    markVersionSeen();
    if (target === 'settings') showView('settings');
  }

  function applyOnboardingOption(id, on) {
    switch (id) {
      case 'autoplay':
        state.settings.autoplay = on;
        saveSettings();
        renderQueuePanel();
        break;
      case 'updates':
        if (bridge.updateSet) bridge.updateSet({ auto: on }).then(onUpdateState).catch(() => {});
        break;
      case 'downloads':
        state.settings.downloads = on ? 'cutting' : 'off';
        saveSettings();
        refreshDownloadButtons();
        break;
      case 'visualizer':
        setVisualizerEnabled(on);
        break;
      case 'tray':
        if (bridge.traySet) {
          bridge
            .traySet({ closeToTray: on })
            .then((result) => {
              state.closeToTray = Boolean(result && result.closeToTray);
            })
            .catch(() => {});
        }
        break;
      default:
    }
    renderSettings();
  }

  async function onOnboardingClick(event) {
    const theme = event.target.closest('[data-ob-theme]');
    if (theme) {
      state.settings.theme = theme.dataset.obTheme;
      saveSettings();
      applyTheme();
      renderOnboarding();
      return;
    }
    const action = event.target.closest('[data-ob-action]');
    if (!action) return;
    switch (action.dataset.obAction) {
      case 'folder':
        await addFolder();
        renderOnboarding();
        return;
      case 'back':
        onboardingStep = Math.max(0, onboardingStep - 1);
        renderOnboarding();
        return;
      case 'next':
        if (onboardingStep >= ONBOARDING_STEPS - 1) {
          closeOnboarding();
          return;
        }
        onboardingStep += 1;
        renderOnboarding();
        return;
      case 'skip':
        closeOnboarding(onboardingStep >= ONBOARDING_STEPS - 1 ? 'settings' : null);
        return;
      default:
    }
  }

  function currentVersion() {
    return (state.info && state.info.version) || '';
  }

  function markVersionSeen() {
    const version = currentVersion();
    if (version) writeJSON(STORAGE.seenVersion, version);
  }

  function showWhatsNew(version) {
    const notes = WHATS_NEW[version];
    const card = $('#whatsnew-card');
    if (!notes || !card) return false;
    card.innerHTML = `
      <span class="update-icon">${ICONS.spark}</span>
      <div class="update-text">
        <strong>Neu in CleanMusic ${esc(version)}</strong>
        <ul class="whatsnew-list">${notes.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
      </div>
      <div class="update-actions">
        <button class="btn primary small" data-whatsnew="ok">Alles klar</button>
        <button class="btn ghost small" data-whatsnew="tour">Erste Schritte ansehen</button>
      </div>`;
    card.hidden = false;
    return true;
  }

  // Called once the app version is known (getInfo).
  function startupGuide() {
    if (state.info && state.info.smoke) return;
    if (FIRST_RUN && !state.settings.onboarded) {
      openOnboarding();
      return;
    }
    const version = currentVersion();
    const seen = readJSON(STORAGE.seenVersion, '');
    if (version && seen !== version) {
      showWhatsNew(version);
      markVersionSeen();
    }
  }

  function wireOnboarding() {
    $('#onboarding').addEventListener('click', onOnboardingClick);
    $('#onboarding').addEventListener('change', (event) => {
      const option = event.target.closest('[data-ob-option]');
      if (option) applyOnboardingOption(option.dataset.obOption, option.checked);
    });
    $('#whatsnew-card').addEventListener('click', (event) => {
      const button = event.target.closest('[data-whatsnew]');
      if (!button) return;
      $('#whatsnew-card').hidden = true;
      if (button.dataset.whatsnew === 'tour') openOnboarding();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !$('#onboarding').hidden) closeOnboarding();
    });
  }

  /* ---------------------------------------------------------------- *
   * Queue + autoplay
   *
   * The queue is state.queue.items with the playing title at .index.
   * - Titles you add ("Als Nächstes" / "Zur Warteschlange") are copies
   *   flagged `queued` and sit right after the current title. They always
   *   come next – also with shuffle – and survive starting another list.
   * - A title clicked in the search plays on its own; when the queue runs
   *   out, autoplay appends suggestions for it (flag `autoplay`).
   * ---------------------------------------------------------------- */

  const SINGLE_CONTEXTS = ['search', 'ext'];
  const AUTOPLAY_KINDS = ['preview', 'plugin'];
  let autoplayTask = null;
  let queuePanelOpen = false;

  function autoplayOn() {
    return state.settings.autoplay !== false;
  }

  // Titles the user queued that have not played yet.
  function pendingQueued() {
    const { items, index } = state.queue;
    return items.slice(index + 1).filter((entry) => entry.queued);
  }

  function queueCopy(entry, flags) {
    return Object.assign({}, entry, { queued: false, autoplay: false, requestedBy: null }, flags);
  }

  function enqueue(entries, mode = 'end', flags = {}) {
    const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
    if (!list.length) return;
    const copies = list.map((entry) => queueCopy(entry, Object.assign({ queued: true }, flags)));
    const by = flags.requestedBy ? `Songwunsch von ${flags.requestedBy}: ` : '';
    const q = state.queue;

    if (q.index < 0 || !q.items[q.index]) {
      state.queue = { items: copies, index: 0, kind: 'queue', upcoming: -1 };
      playFromQueue(0);
      toast(by + (copies.length === 1 ? `„${copies[0].title}“ wird abgespielt` : `${copies.length} Titel werden abgespielt`));
      return;
    }

    let at = q.index + 1;
    if (mode === 'end') {
      while (at < q.items.length && q.items[at].queued) at += 1;
    }
    q.items.splice(at, 0, ...copies);
    planUpcoming();
    schedulePrefetch();
    renderQueuePanel();
    const name = copies.length === 1 ? `„${copies[0].title}“` : `${copies.length} Titel`;
    toast(by + (mode === 'next' ? `${name} kommt als Nächstes` : `${name} in der Warteschlange`));
  }

  function autoplayEligible() {
    const { items, index } = state.queue;
    const item = items[index];
    return Boolean(
      autoplayOn() &&
        item &&
        AUTOPLAY_KINDS.includes(item.kind) &&
        !state.playback.shuffle &&
        state.playback.repeat === 'off' &&
        index >= items.length - 1
    );
  }

  function maybeAutoplay() {
    if (autoplayTask) return autoplayTask;
    if (!autoplayEligible() || !bridge.recommendations) return null;
    const seed = currentItem();
    autoplayTask = fetchAutoplay(seed)
      .catch(() => 0)
      .finally(() => {
        autoplayTask = null;
      });
    return autoplayTask;
  }

  async function fetchAutoplay(seed) {
    const name = primaryArtist(seed.artist);
    const artists = name && name.length > 1 ? [{ name, deezerId: seed.source === 'deezer' ? seed.artistId || null : null }] : [];
    const pluginSeeds = [];
    if (seed.kind === 'plugin' && seed.refId) {
      const plugin = pluginById(seed.pluginId);
      if (isPluginReady(plugin) && plugin.capabilities.related) pluginSeeds.push({ id: plugin.id, refIds: [seed.refId] });
    }
    if (!artists.length && !pluginSeeds.length) return 0;

    const result = await bridge.recommendations({ artists, pluginSeeds });
    // The user may have started something else meanwhile.
    const now = currentItem();
    if (!now || now.id !== seed.id) return 0;

    const known = new Set();
    state.queue.items.forEach((entry) => {
      known.add(entry.id);
      known.add(matchKey(entry));
    });
    const keep = (entry) => entry && !known.has(entry.id) && !known.has(matchKey(entry));
    const tracks = (Array.isArray(result.tracks) ? result.tracks : []).map(previewEntry).filter(keep);
    const videos = (Array.isArray(result.pluginItems) ? result.pluginItems : [])
      .map((item) => {
        const plugin = pluginById(item.pluginId);
        return plugin ? pluginEntry(plugin, item) : null;
      })
      .filter(keep);
    // Plugin titles first when the seed came from a plugin (same source, full titles).
    const merged = seed.kind === 'plugin' ? mergeRecs(shuffled(videos), shuffled(tracks)) : mergeRecs(shuffled(tracks), shuffled(videos));
    const picked = [];
    const seen = new Set();
    merged.forEach((entry) => {
      const key = matchKey(entry);
      if (picked.length >= 12 || seen.has(key)) return;
      seen.add(key);
      picked.push(queueCopy(entry, { autoplay: true }));
    });
    if (!picked.length) return 0;

    state.queue.items.push(...picked);
    planUpcoming();
    schedulePrefetch();
    renderQueuePanel();
    if (state.fullscreen) renderUpNext();
    return picked.length;
  }

  function removeFromQueue(position) {
    const q = state.queue;
    if (position <= q.index || position >= q.items.length) return;
    q.items.splice(position, 1);
    planUpcoming();
    schedulePrefetch();
    renderQueuePanel();
    if (state.fullscreen) renderUpNext();
  }

  function moveInQueue(from, to) {
    const q = state.queue;
    if (from <= q.index || to <= q.index || from >= q.items.length || to >= q.items.length || from === to) return;
    const [entry] = q.items.splice(from, 1);
    q.items.splice(to, 0, entry);
    planUpcoming();
    schedulePrefetch();
    renderQueuePanel();
    if (state.fullscreen) renderUpNext();
  }

  function clearAddedToQueue() {
    const q = state.queue;
    const head = q.items.slice(0, q.index + 1);
    const rest = q.items.slice(q.index + 1).filter((entry) => !entry.queued && !entry.autoplay);
    const removed = q.items.length - head.length - rest.length;
    q.items = head.concat(rest);
    planUpcoming();
    schedulePrefetch();
    renderQueuePanel();
    if (state.fullscreen) renderUpNext();
    toast(removed ? `${removed} Titel entfernt` : 'Nichts zum Entfernen');
  }

  function queueGroup(entry) {
    if (entry.requestedBy) return 'request';
    if (entry.queued) return 'queued';
    if (entry.autoplay) return 'autoplay';
    return 'context';
  }

  function queueRow(entry, position, options = {}) {
    return `
      <div class="queue-row ${options.current ? 'current' : ''}" data-qi="${position}" ${options.current ? '' : 'draggable="true"'}>
        <span class="queue-art">${entry.artwork ? `<img src="${esc(entry.artwork)}" alt="" loading="lazy" />` : '♪'}</span>
        <span class="queue-meta">
          <span class="queue-title">${esc(entry.title)}</span>
          <span class="queue-sub">${esc(entry.artist || entry.sourceLabel || '')}${
            entry.requestedBy ? ` · <em class="queue-by">Wunsch von ${esc(entry.requestedBy)}</em>` : ''
          }</span>
        </span>
        ${options.current ? `<span class="queue-now">${EQ}</span>` : `<button class="icon-btn queue-remove" data-q-remove="${position}" title="Aus der Warteschlange entfernen">${ICONS.close}</button>`}
      </div>`;
  }

  function renderQueuePanel() {
    const panel = $('#queue-panel');
    const button = $('#btn-queue');
    if (button) button.classList.toggle('active', queuePanelOpen);
    if (!panel) return;
    panel.hidden = !queuePanelOpen;
    if (!queuePanelOpen) return;

    const { items, index } = state.queue;
    const current = items[index];
    const seed = current && current.autoplay ? null : current;
    const labels = {
      queued: 'Von dir eingereiht',
      request: 'Songwünsche aus dem Chat',
      context: 'Weiter aus der Liste',
      autoplay: `Autoplay${seed && seed.artist ? ` · passend zu ${esc(primaryArtist(seed.artist))}` : ''}`,
    };

    let body = '';
    if (!current) {
      body = '<p class="queue-empty">Noch nichts in der Warteschlange. Spiel einen Titel ab oder wähle bei einem Titel „Als Nächstes abspielen“.</p>';
    } else {
      body += '<div class="queue-label">Läuft gerade</div>' + queueRow(current, index, { current: true });
      const upcoming = items.slice(index + 1, index + 1 + 60);
      let group = null;
      upcoming.forEach((entry, offset) => {
        const next = queueGroup(entry);
        if (next !== group) {
          group = next;
          body += `<div class="queue-label">${labels[group]}</div>`;
        }
        body += queueRow(entry, index + 1 + offset);
      });
      if (items.length - index - 1 > 60) {
        body += `<p class="queue-more">… und ${items.length - index - 61} weitere</p>`;
      }
      if (!upcoming.length) {
        body += `<p class="queue-empty">${
          autoplayTask
            ? 'Autoplay sucht passende Titel …'
            : autoplayOn() && AUTOPLAY_KINDS.includes(current.kind)
              ? 'Danach geht es mit Vorschlägen weiter.'
              : 'Danach ist Schluss.'
        }</p>`;
      }
      if (state.playback.shuffle) {
        body += '<p class="queue-hint">Zufall ist an: Von dir eingereihte Titel kommen trotzdem zuerst.</p>';
      }
    }

    panel.innerHTML = `
      <div class="queue-head">
        <h3>Warteschlange</h3>
        <button class="icon-btn" data-q-action="close" title="Schließen">${ICONS.close}</button>
      </div>
      <div class="queue-tools">
        <label class="queue-autoplay"><input type="checkbox" data-q-action="autoplay" ${autoplayOn() ? 'checked' : ''} /> Autoplay</label>
        <button class="btn ghost small" data-q-action="clear">Eingereihte entfernen</button>
      </div>
      <div class="queue-list">${body}</div>`;
  }

  function toggleQueuePanel(open = !queuePanelOpen) {
    queuePanelOpen = Boolean(open);
    renderQueuePanel();
  }

  function setAutoplay(on) {
    state.settings.autoplay = Boolean(on);
    saveSettings();
    if (on) maybeAutoplay();
    renderQueuePanel();
    renderSettings();
    toast(on ? 'Autoplay an – nach einzelnen Titeln laufen Vorschläge weiter' : 'Autoplay aus');
  }

  function wireQueuePanel() {
    const panel = $('#queue-panel');
    $('#btn-queue').addEventListener('click', () => toggleQueuePanel());

    panel.addEventListener('click', (event) => {
      const remove = event.target.closest('[data-q-remove]');
      if (remove) {
        removeFromQueue(Number(remove.dataset.qRemove));
        return;
      }
      const action = event.target.closest('[data-q-action]');
      if (action && action.dataset.qAction === 'close') {
        toggleQueuePanel(false);
        return;
      }
      if (action && action.dataset.qAction === 'clear') {
        clearAddedToQueue();
        return;
      }
      const row = event.target.closest('.queue-row[data-qi]');
      if (row && !row.classList.contains('current')) playFromQueue(Number(row.dataset.qi));
    });
    panel.addEventListener('change', (event) => {
      if (event.target.matches('[data-q-action="autoplay"]')) setAutoplay(event.target.checked);
    });

    let dragFrom = -1;
    panel.addEventListener('dragstart', (event) => {
      const row = event.target.closest('.queue-row[data-qi]');
      if (!row) return;
      event.stopPropagation();
      dragFrom = Number(row.dataset.qi);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(dragFrom));
      row.classList.add('dragging');
    });
    panel.addEventListener('dragover', (event) => {
      if (dragFrom < 0) return;
      const row = event.target.closest('.queue-row[data-qi]');
      if (!row || row.classList.contains('current')) return;
      event.preventDefault();
      event.stopPropagation();
      $$('#queue-panel .queue-row.drop-target').forEach((el) => el.classList.remove('drop-target'));
      row.classList.add('drop-target');
    });
    panel.addEventListener('drop', (event) => {
      const row = event.target.closest('.queue-row[data-qi]');
      if (dragFrom < 0 || !row) return;
      event.preventDefault();
      event.stopPropagation();
      moveInQueue(dragFrom, Number(row.dataset.qi));
      dragFrom = -1;
    });
    panel.addEventListener('dragend', () => {
      dragFrom = -1;
      $$('#queue-panel .dragging, #queue-panel .drop-target').forEach((el) => el.classList.remove('dragging', 'drop-target'));
    });

    // Right click on any title row or card: queue / playlist menu at the pointer.
    document.addEventListener('contextmenu', (event) => {
      const row = event.target.closest && event.target.closest('#content [data-list][data-index]');
      if (!row) return;
      const entry = entryAt(row.dataset.list, Number(row.dataset.index));
      if (!entry) return;
      event.preventDefault();
      const point = { getBoundingClientRect: () => ({ left: event.clientX, right: event.clientX, top: event.clientY, bottom: event.clientY }) };
      openAddMenu(point, [entry]);
    });
  }

  /* ---------------------------------------------------------------- *
   * Sleep timer: pause after N minutes or at the end of the current title
   * ---------------------------------------------------------------- */

  const sleepTimer = { until: 0, endOfTrack: false, timer: null, tick: null };

  function setSleepTimer(value) {
    clearTimeout(sleepTimer.timer);
    clearInterval(sleepTimer.tick);
    sleepTimer.until = 0;
    sleepTimer.endOfTrack = false;
    sleepTimer.timer = null;
    sleepTimer.tick = null;
    if (value === 'track') {
      sleepTimer.endOfTrack = true;
      toast('Schlaf-Timer: Stopp am Ende des Titels');
    } else if (Number(value) > 0) {
      const ms = Number(value) * 60000;
      sleepTimer.until = Date.now() + ms;
      sleepTimer.timer = setTimeout(sleepNow, ms);
      sleepTimer.tick = setInterval(updateSleepButton, 30000);
      toast(`Schlaf-Timer: Stopp in ${value} Minuten`);
    } else if (value === 'off') {
      toast('Schlaf-Timer aus');
    }
    updateSleepButton();
  }

  function sleepNow() {
    if (!audio.paused) $('#btn-play').click();
    setSleepTimer(null);
    toast('Schlaf-Timer: Wiedergabe angehalten. Gute Nacht!');
  }

  function sleepLabel() {
    if (sleepTimer.endOfTrack) return 'Stopp am Ende des Titels';
    if (sleepTimer.until) return `Stopp in ${Math.max(1, Math.ceil((sleepTimer.until - Date.now()) / 60000))} min`;
    return '';
  }

  function updateSleepButton() {
    const button = $('#btn-sleep');
    if (!button) return;
    const label = sleepLabel();
    button.classList.toggle('active', Boolean(label));
    button.title = label ? `Schlaf-Timer: ${label}` : 'Schlaf-Timer';
  }

  function openSleepMenu(anchor) {
    hideMenus();
    const menu = $('#ctx-menu');
    const label = sleepLabel();
    const options = [
      ['15', '15 Minuten'],
      ['30', '30 Minuten'],
      ['45', '45 Minuten'],
      ['60', '1 Stunde'],
      ['90', '1,5 Stunden'],
      ['track', 'Ende des Titels'],
    ];
    menu.innerHTML = `
      <div class="service-menu-label">${label ? esc(`Schlaf-Timer · ${label}`) : 'Schlaf-Timer'}</div>
      ${options
        .map(
          ([value, text]) => `
            <button class="service-menu-item" data-sleep="${value}">
              <span class="menu-text">${text}</span>
            </button>`
        )
        .join('')}
      ${label ? '<div class="menu-sep"></div><button class="service-menu-item" data-sleep="off"><span class="menu-text">Timer aus</span></button>' : ''}`;
    positionMenu(menu, anchor);
  }

  /* ---------------------------------------------------------------- *
   * Volume
   *
   * The slider is perceptual: gain = level². 0.7 and older stored the
   * linear element volume – migrated once via level = √volume. With
   * "Boost" the slider goes up to 150 %, with "Lautstärke angleichen" a
   * gentle leveller runs; both need the Web Audio engine in visualizer.js.
   * ---------------------------------------------------------------- */

  const vol = { level: 0.92, muted: false };

  function loadVolume() {
    const stored = readJSON(STORAGE.level, null);
    if (stored && Number.isFinite(Number(stored.level))) {
      return { level: Math.min(1.5, Math.max(0, Number(stored.level))), muted: Boolean(stored.muted) };
    }
    const old = Number(readJSON(STORAGE.volume, NaN));
    return { level: Number.isFinite(old) ? Math.sqrt(Math.min(1, Math.max(0, old))) : 0.92, muted: false };
  }

  function toneLabel(value) {
    const db = Math.round(Number(value) || 0);
    return db > 0 ? `+${db} dB` : `${db} dB`;
  }

  function setTone(bass, treble) {
    if (Number.isFinite(bass)) state.settings.bass = Math.max(-6, Math.min(9, Math.round(bass)));
    if (Number.isFinite(treble)) state.settings.treble = Math.max(-6, Math.min(6, Math.round(treble)));
    saveSettings();
    applyVolume();
    ['bass', 'treble'].forEach((key) => {
      const input = $(`#opt-${key}`);
      const label = $(`#opt-${key}-value`);
      if (input && Number(input.value) !== state.settings[key]) input.value = String(state.settings[key]);
      if (label) label.textContent = toneLabel(state.settings[key]);
    });
  }

  function maxVolume() {
    return state.settings.volumeBoost ? 1.5 : 1;
  }

  function persistVolume() {
    writeJSON(STORAGE.level, { level: vol.level, muted: vol.muted });
  }

  function volumeLevel() {
    return Math.min(vol.level, maxVolume());
  }

  function applyVolume() {
    const level = volumeLevel();
    const gain = level * level;
    const viz = window.CMVisualizer;
    const engine =
      viz && viz.setOutput
        ? viz.setOutput({
            gain: vol.muted ? 0 : gain,
            normalize: Boolean(state.settings.normalize),
            bass: Number(state.settings.bass) || 0,
            treble: Number(state.settings.treble) || 0,
            want: Boolean(
              state.settings.normalize ||
                state.settings.volumeBoost ||
                Number(state.settings.bass) ||
                Number(state.settings.treble)
            ),
          })
        : false;
    if (engine) {
      // The engine applies the gain – the element itself stays at full level.
      audio.volume = 1;
      audio.muted = false;
    } else {
      audio.volume = Math.min(1, gain);
      audio.muted = vol.muted;
    }
    updateVolumeUi();
    pushPlayerState();
  }

  function setVolume(level, { unmute = true } = {}) {
    if (!Number.isFinite(level)) return;
    vol.level = Math.round(Math.min(maxVolume(), Math.max(0, level)) * 100) / 100;
    if (unmute) vol.muted = false;
    applyVolume();
    persistVolume();
  }

  function nudgeVolume(delta) {
    setVolume(volumeLevel() + delta);
  }

  function setMuted(muted) {
    vol.muted = Boolean(muted);
    // Unmuting at 0 % would stay silent – come back at a sensible level.
    if (!vol.muted && vol.level < 0.02) vol.level = 0.5;
    applyVolume();
    persistVolume();
  }

  function onVolumeWheel(event) {
    event.preventDefault();
    const delta = event.deltaY || event.deltaX;
    if (!delta) return;
    nudgeVolume((delta < 0 ? 1 : -1) * (event.shiftKey ? 0.01 : 0.05));
  }

  function volumeStage() {
    const level = volumeLevel();
    if (vol.muted || level <= 0) return 'mute';
    if (level < 0.34) return 'low';
    if (level < 0.7) return 'mid';
    return 'high';
  }

  function updateVolumeUi() {
    const max = maxVolume();
    const level = vol.muted ? 0 : volumeLevel();
    const pct = Math.round(volumeLevel() * 100);
    const over = !vol.muted && level > 1;
    ['#volume', '#fs-volume'].forEach((selector) => {
      const input = $(selector);
      if (!input) return;
      input.max = String(max);
      input.value = String(level);
      input.style.setProperty('--fill', `${((level / max) * 100).toFixed(2)}%`);
      input.style.setProperty('--full', `${((1 / max) * 100).toFixed(2)}%`);
      input.classList.toggle('over', over);
      input.setAttribute('aria-valuetext', vol.muted ? 'stumm' : `${pct} Prozent`);
    });
    ['#volume-pct', '#fs-volume-pct'].forEach((selector) => {
      const label = $(selector);
      if (!label) return;
      label.textContent = vol.muted ? 'stumm' : `${pct} %`;
      label.classList.toggle('over', over);
    });
    const stage = volumeStage();
    ['#btn-mute', '#fs-mute'].forEach((selector) => {
      const button = $(selector);
      if (!button) return;
      button.dataset.level = stage;
      button.title = vol.muted ? 'Ton an (M)' : 'Stumm schalten (M)';
    });
  }

  function updateMuteIcon() {
    updateVolumeUi();
  }

  /* ---------------------------------------------------------------- *
   * Creator services (Epidemic Sound, Artlist) – downloads made in their
   * official web apps land in the cutting folder and are listed here.
   * ---------------------------------------------------------------- */

  const creatorDownloads = (readJSON(STORAGE.creatorDownloads, []) || []).filter(
    (item) => item && typeof item.path === 'string'
  );

  function creatorServices() {
    return SERVICES.filter((service) => service.creator);
  }

  function syncCreatorDownloadFolder() {
    if (bridge.creatorDownloadsConfig) {
      bridge.creatorDownloadsConfig({ folder: state.settings.downloadDir || '' }).catch(() => {});
    }
  }

  function onCreatorDownload(info) {
    if (!info) return;
    if (info.state === 'started') {
      toast(`${info.service}: „${info.name}“ wird gespeichert …`);
      return;
    }
    if (info.state === 'completed' && info.path) {
      creatorDownloads.unshift({ path: info.path, name: info.name, service: info.service, at: Date.now() });
      creatorDownloads.splice(30);
      writeJSON(STORAGE.creatorDownloads, creatorDownloads);
      toast(`${info.service}: „${info.name}“ gespeichert – im Cutter-Modus zum Schnittprogramm ziehen`);
      renderCredits();
      return;
    }
    toast(`${info.service}: ${info.error || 'Download fehlgeschlagen'}`);
  }

  async function checkCreatorDownloads() {
    if (!creatorDownloads.length || !bridge.cuttingExists) return;
    try {
      const exists = await bridge.cuttingExists(creatorDownloads.map((item) => item.path));
      let changed = false;
      for (let i = creatorDownloads.length - 1; i >= 0; i -= 1) {
        if (!exists[i]) {
          creatorDownloads.splice(i, 1);
          changed = true;
        }
      }
      if (changed) {
        writeJSON(STORAGE.creatorDownloads, creatorDownloads);
        renderCredits();
      }
    } catch {
      /* ignore */
    }
  }

  function creatorDownloadsHtml() {
    const services = creatorServices();
    if (!services.length) return '';
    const list = creatorDownloads.slice(0, 12);
    return `
      <div class="abo-downloads">
        <div class="credits-head">
          <h3>Abo-Downloads</h3>
          <span class="credits-count">${creatorDownloads.length}</span>
        </div>
        <p class="muted small">
          Was du in ${services.map((service) => esc(service.name)).join(' oder ')} mit deinem Abo herunterlädst,
          landet im Cutting-Ordner – mit einer Lizenz-Notiz daneben.
        </p>
        <div class="row abo-open">
          ${services
            .map(
              (service) =>
                `<button class="btn ghost small" data-creator-service="${esc(service.id)}">
                  <span class="svc-badge" style="--svc:${service.color}">${esc(service.short)}</span>${esc(service.name)}
                </button>`
            )
            .join('')}
        </div>
        ${
          list.length
            ? `<ul class="abo-list">
                ${list
                  .map(
                    (item) => `
                      <li>
                        <button class="icon-btn dl-btn done" data-dl-file="${esc(item.path)}" data-abo-reveal="${esc(item.path)}" draggable="true"
                          title="Ins Schnittprogramm ziehen – Klick zeigt die Datei">${ICONS.file}</button>
                        <div>
                          <strong title="${esc(item.name)}">${esc(item.name)}</strong>
                          <span>${esc(item.service)}</span>
                        </div>
                      </li>`
                  )
                  .join('')}
              </ul>`
            : '<p class="credits-empty">Noch keine Abo-Downloads.</p>'
        }
      </div>`;
  }

  /* ---------------------------------------------------------------- *
   * Downloads ("Nur Cutting")
   *
   * Only freely licensed files from the cutter mode (CC0, CC BY, Public
   * Domain) – never streams, previews or plugin titles. Each file gets a
   * credit .txt next to it; finished downloads can be dragged straight
   * into a video editor.
   * ---------------------------------------------------------------- */

  const downloads = readJSON(STORAGE.downloads, {}) || {};
  const downloading = new Set();

  function canDownload(entry) {
    if (!entry || state.settings.downloads !== 'cutting') return false;
    if (entry.kind !== 'stream' || !entry.url) return false;
    const key = licenseKey(entry.license);
    return key === 'free' || key === 'by';
  }

  function downloadButton(entry) {
    if (!canDownload(entry)) return '';
    const done = downloads[entry.id];
    if (done) {
      return `<button class="icon-btn dl-btn done" data-act="reveal" data-dl-file="${esc(done.path)}" draggable="true"
        title="Heruntergeladen – in dein Schnittprogramm ziehen, Klick zeigt die Datei">${ICONS.file}</button>`;
    }
    const busy = downloading.has(entry.id);
    return `<button class="icon-btn dl-btn ${busy ? 'busy' : ''}" data-act="download" ${busy ? 'disabled' : ''}
      title="Herunterladen (mit Credit-Datei)">${ICONS.download}</button>`;
  }

  function downloadCategory(entry) {
    const tab = creatorTab();
    if (entry.source === 'incompetech') {
      const classics = CREATOR.tabs.find((item) => item.id === 'classics');
      const mood = classics && classics.categories ? classics.categories.find((item) => item.id === entry.category) : null;
      return `Kevin MacLeod${mood ? ` - ${mood.label}` : ''}`;
    }
    if (entry.source === 'freesound' || (tab && (tab.kind === 'sfx' || tab.id === 'sfx'))) return 'Soundeffekte';
    return 'Freie Musik';
  }

  function refreshDownloadButtons() {
    if (state.view === 'creator') renderCreator();
    renderFavorites();
    if (state.currentPlaylist) renderPlaylist();
  }

  async function downloadEntry(entry) {
    if (!canDownload(entry) || downloading.has(entry.id) || !bridge.cuttingDownload) return;
    downloading.add(entry.id);
    refreshDownloadButtons();
    let result;
    try {
      result = await bridge.cuttingDownload({
        url: entry.url,
        title: entry.title,
        artist: entry.artist,
        license: entry.license,
        licenseUrl: entry.licenseUrl,
        credit: entry.credit,
        link: entry.link,
        category: downloadCategory(entry),
        folder: state.settings.downloadDir,
      });
    } catch (error) {
      result = { error: error.message };
    }
    downloading.delete(entry.id);
    if (result && result.ok) {
      downloads[entry.id] = { path: result.path, at: Date.now() };
      writeJSON(STORAGE.downloads, downloads);
      toast(`${result.existed ? 'Schon vorhanden' : 'Gespeichert'}: ${result.name} – zum Schnittprogramm ziehen`);
    } else {
      toast((result && result.error) || 'Download fehlgeschlagen');
    }
    refreshDownloadButtons();
    return result;
  }

  async function revealDownload(entry) {
    const done = downloads[entry.id];
    if (!done) return;
    const ok = bridge.cuttingReveal ? await bridge.cuttingReveal(done.path) : false;
    if (!ok) {
      delete downloads[entry.id];
      writeJSON(STORAGE.downloads, downloads);
      toast('Datei nicht mehr da – du kannst sie neu herunterladen.');
      refreshDownloadButtons();
    }
  }

  // Forget downloads whose files were deleted or moved.
  async function checkDownloads() {
    const ids = Object.keys(downloads);
    if (!ids.length || !bridge.cuttingExists) return;
    try {
      const exists = await bridge.cuttingExists(ids.map((id) => downloads[id].path));
      let changed = false;
      ids.forEach((id, index) => {
        if (!exists[index]) {
          delete downloads[id];
          changed = true;
        }
      });
      if (changed) {
        writeJSON(STORAGE.downloads, downloads);
        refreshDownloadButtons();
      }
    } catch {
      /* ignore */
    }
  }

  function downloadsPanel() {
    const mode = state.settings.downloads;
    const folder = state.settings.downloadDir || state.downloadDefault || 'Musik\\CleanMusic Cutting';
    return `
      <div class="panel" id="downloads-panel">
        <h3>Downloads <span class="tag">nur freie Lizenzen</span></h3>
        <p>
          CleanMusic lädt ausschließlich frei lizenzierte Dateien aus dem Cutter-Modus herunter
          (CC0, CC BY, Public Domain) – jeweils mit einer Credit-Datei daneben. Streams,
          Vorschauen und Plugin-Titel lassen sich nicht herunterladen. Was du in Epidemic Sound oder
          Artlist mit deinem Abo herunterlädst, landet ebenfalls in diesem Ordner.
        </p>
        <div class="row dl-modes">
          <button class="radio-tag ${mode === 'off' ? 'active' : ''}" data-dl-mode="off">Aus</button>
          <button class="radio-tag ${mode === 'cutting' ? 'active' : ''}" data-dl-mode="cutting">Nur Cutting</button>
        </div>
        <div class="ps-row dl-folder-row" style="margin-top:12px">
          <label><strong>Ordner</strong><small>Unterordner je Kategorie, z. B. „Soundeffekte“.</small></label>
          <span class="ps-folder">
            <input type="text" id="dl-folder" value="${esc(folder)}" readonly spellcheck="false" />
            <button class="btn ghost small" data-dl-action="pick">Ändern …</button>
            <button class="btn ghost small" data-dl-action="open">Öffnen</button>
          </span>
        </div>
        ${
          state.settings.downloadDir
            ? '<p class="muted small" style="margin-top:6px"><button class="link-btn" data-dl-action="reset">Standardordner verwenden</button></p>'
            : ''
        }
      </div>`;
  }

  /* ---------------------------------------------------------------- *
   * Cutter mode (music + sound effects for videos)
   * ---------------------------------------------------------------- */

  const CREATOR = window.CM_CREATOR || { tabs: [] };

  function creatorTab(id = state.creator.tab) {
    return CREATOR.tabs.find((tab) => tab.id === id) || CREATOR.tabs[0] || null;
  }

  function creatorKey() {
    const tab = creatorTab();
    if (!tab) return '';
    const custom = tab.search ? state.creator.query[tab.id] : '';
    return custom ? `${tab.id}:q:${custom.toLowerCase()}` : `${tab.id}:${state.creator.category[tab.id]}`;
  }

  function creatorList() {
    return state.creator.lists[creatorKey()] || null;
  }

  function creatorItems() {
    const list = creatorList();
    return list ? list.items : [];
  }

  function openverseCache() {
    return readJSON(STORAGE.openverseCache, {}) || {};
  }

  function cachedOpenverse(key) {
    const hit = openverseCache()[key];
    return hit && Date.now() - hit.at < 24 * 60 * 60 * 1000 ? hit : null;
  }

  function storeOpenverse(key, value) {
    const cache = openverseCache();
    cache[key] = Object.assign({ at: Date.now() }, value);
    const keys = Object.keys(cache).sort((a, b) => cache[a].at - cache[b].at);
    while (keys.length > 60) delete cache[keys.shift()];
    writeJSON(STORAGE.openverseCache, cache);
  }

  async function loadCreator(options = {}) {
    const tab = creatorTab();
    if (!tab) return;

    const key = creatorKey();
    const existing = state.creator.lists[key];
    if (existing && !options.more && !options.force) {
      renderCreatorList();
      return;
    }
    if (existing && existing.loading) return;

    if (tab.id === 'classics') {
      const category = state.creator.category.classics;
      state.creator.lists[key] = {
        items: tab.tracks
          .filter((track) => category === 'all' || track.category === category)
          .map(classicEntry),
        loading: false,
        error: null,
        more: false,
        page: 1,
      };
      renderCreatorList();
      return;
    }

    if (tab.id === 'ncs') {
      const category =
        tab.categories.find((entry) => entry.id === state.creator.category.ncs) || tab.categories[0];
      state.creator.lists[key] = { items: [], loading: true, error: null, more: false, page: 1 };
      renderCreatorList();

      let result;
      try {
        result = await bridge.creatorPlaylist(category.playlist);
      } catch (error) {
        result = { tracks: [], error: error.message };
      }

      state.creator.lists[key] = {
        items: (Array.isArray(result.tracks) ? result.tracks : []).map(ncsEntry),
        loading: false,
        error: result.error || null,
        more: false,
        page: 1,
      };
      if (creatorKey() === key) renderCreatorList();
      return;
    }

    // Sound effects / free music via Openverse (cached for a day – the
    // anonymous API allows ~200 requests per day).
    const custom = state.creator.query[tab.id];
    const category =
      tab.categories.find((entry) => entry.id === state.creator.category[tab.id]) || tab.categories[0];
    const query = custom || category.query;
    const kind = tab.kind === 'sfx' || tab.id === 'sfx' ? 'sfx' : 'music';
    const page = options.more && existing ? existing.page + 1 : 1;
    const previous = options.more && existing ? existing.items : [];
    const cacheKey = `${kind}|${query.toLowerCase()}|${page}`;

    state.creator.lists[key] = { items: previous, loading: true, error: null, more: false, page };
    renderCreatorList();

    let result = options.force ? null : cachedOpenverse(cacheKey);
    if (!result) {
      try {
        result = await bridge.creatorOpenverse({ kind, query, page });
      } catch (error) {
        result = { items: [], more: false, error: error.message };
      }
      if (!result.error) storeOpenverse(cacheKey, { items: result.items, more: result.more });
    }

    const seen = new Set(previous.map((entry) => entry.id));
    const fresh = (Array.isArray(result.items) ? result.items : [])
      .map(openverseEntry)
      .filter((entry) => !seen.has(entry.id));

    state.creator.lists[key] = {
      items: previous.concat(fresh),
      loading: false,
      error: result.error || null,
      more: Boolean(result.more),
      page,
    };
    if (creatorKey() === key) renderCreatorList();
  }

  function creatorNote(tab) {
    if (tab.kind === 'sfx') return 'CC0 & CC BY · Freesound';
    switch (tab.id) {
      case 'ncs':
        return fullMode()
          ? `voller Titel über ${matchPlugin().source.label} · Credit mit Kopier-Knopf`
          : '30-s-Vorschau · Credit mit Kopier-Knopf';
      case 'classics':
        return 'Volle Titel · CC BY 4.0 · Kevin MacLeod';
      case 'sfx':
        return 'CC0 & CC BY · Freesound';
      default:
        return 'Volle Titel · CC0 & CC BY';
    }
  }

  function renderCreator() {
    const host = $('#view-creator');
    if (!host) return;

    const tab = creatorTab();
    if (!tab) {
      host.innerHTML = '';
      return;
    }

    const custom = tab.search ? state.creator.query[tab.id] : '';
    const active = state.creator.category[tab.id];
    const tabs = CREATOR.tabs
      .map(
        (entry) => `
          <button class="creator-tab ${entry.id === tab.id ? 'active' : ''}" data-creator-tab="${entry.id}">
            ${ICONS[entry.icon] || ''}<span>${esc(entry.label)}</span>
          </button>`
      )
      .join('');

    const chips = (tab.id === 'classics' ? [{ id: 'all', label: 'Alle' }] : [])
      .concat(tab.categories)
      .map(
        (entry) =>
          `<button class="radio-tag ${!custom && entry.id === active ? 'active' : ''}" data-creator-cat="${entry.id}"${
            entry.color ? ` style="--chip:${entry.color}"` : ''
          }>${esc(entry.label)}</button>`
      )
      .join('');

    host.innerHTML = `
      <div class="page creator-page">
        <div class="page-head">
          <div>
            <div class="eyebrow">Für Cutter & Creator</div>
            <h2>Cutter-Modus</h2>
            <p>Musik und Soundeffekte für deine Videos – mit Lizenz an jedem Titel und fertigem Credit zum Kopieren.</p>
          </div>
          <div class="page-actions">
            <button class="btn ghost small" data-creator-action="fullscreen">${ICONS.expand} Vollbild-Player</button>
          </div>
        </div>

        <div class="creator-tabs">${tabs}${creatorServices()
          .map(
            (service) => `<button class="creator-tab creator-service" data-creator-service="${esc(service.id)}" title="${esc(service.name)} öffnen (dein Abo)">
                <span class="svc-badge" style="--svc:${service.color}">${esc(service.short)}</span><span>${esc(service.name)}</span>
              </button>`
          )
          .join('')}</div>

        <div class="creator-grid">
          <div class="creator-main">
            <div class="panel creator-info" data-lic="${tab.license ? licenseKey(tab.license) : 'mixed'}">
              <div>
                <strong>${esc(tab.title)}</strong>
                <p>${esc(tab.info)}</p>
              </div>
              ${
                tab.policy
                  ? `<a class="btn ghost small" href="${esc(tab.policy.url)}" target="_blank" rel="noreferrer">${esc(
                      tab.policy.label
                    )} ↗</a>`
                  : ''
              }
            </div>

            <div class="radio-tags creator-chips">${chips}</div>

            ${
              tab.search
                ? `<div class="radio-search creator-search">
                    <input id="creator-search-input" type="search" value="${esc(custom)}"
                      placeholder="${
                        tab.kind === 'sfx' || tab.id === 'sfx'
                          ? 'Eigenen Sound suchen (englisch, z. B. „door slam“) …'
                          : 'Eigene Stimmung suchen (englisch, z. B. „summer vlog“) …'
                      }"
                      autocomplete="off" spellcheck="false" />
                    <button class="btn primary small" data-creator-action="search">Suchen</button>
                  </div>`
                : ''
            }

            <div id="creator-list"></div>
          </div>

          <aside class="panel creator-credits" id="creator-credits"></aside>
        </div>
      </div>`;

    renderCreatorList();
    renderCredits();
  }

  function renderCreatorList() {
    const host = $('#creator-list');
    if (!host) return;

    const tab = creatorTab();
    const list = creatorList();

    if (!list || (list.loading && !list.items.length)) {
      host.innerHTML = `
        <div class="search-status">
          <span class="spinner small"></span>
          <span>${tab.id === 'ncs' ? 'NCS-Playlist wird geladen …' : 'Suche bei Openverse …'}</span>
        </div>`;
      return;
    }

    if (!list.items.length) {
      host.innerHTML = `
        <div class="panel empty-search">
          <h3>Nichts gefunden</h3>
          <p>${esc(list.error || 'Versuche eine andere Kategorie oder einen anderen Begriff.')}</p>
          <div class="row">
            <button class="btn ghost small" data-creator-action="retry">Erneut versuchen</button>
          </div>
        </div>`;
      return;
    }

    host.innerHTML = `
      <div class="results-head">
        <span>${list.items.length} ${tab.kind === 'sfx' || tab.id === 'sfx' ? 'Sounds' : 'Titel'}</span>
        <span class="muted small">${esc(creatorNote(tab))}</span>
        <button class="btn ghost small results-action" data-creator-action="play-all">${ICONS.play} Alle abspielen</button>
      </div>
      <div class="song-list">
        ${list.items.map((entry, index) => songRow(entry, index, 'creator')).join('')}
      </div>
      ${
        list.loading
          ? '<div class="search-status"><span class="spinner small"></span><span>Lädt …</span></div>'
          : list.more
            ? '<div class="row"><button class="btn ghost small" data-creator-action="more">Mehr laden</button></div>'
            : ''
      }
      ${list.error ? `<p class="muted small">${esc(list.error)}</p>` : ''}`;

    updatePlayingHighlights();
  }

  function submitCreatorSearch() {
    const tab = creatorTab();
    const input = $('#creator-search-input');
    state.creator.query[tab.id] = input ? input.value.trim().slice(0, 80) : '';
    renderCreator();
    loadCreator();
  }

  function persistCredits() {
    writeJSON(STORAGE.credits, state.credits.slice(0, 200));
  }

  async function collectCredit(entry) {
    if (!entry || !entry.credit) return;

    let ok = false;
    try {
      ok = await bridge.copyText(entry.credit);
    } catch {
      ok = false;
    }

    if (!state.credits.some((item) => item.id === entry.id)) {
      state.credits.push({
        id: entry.id,
        title: entry.title,
        artist: entry.artist || '',
        license: entry.license || '',
        credit: entry.credit,
      });
      persistCredits();
    }

    renderCredits();
    toast(ok ? `Credit kopiert · „${entry.title}“ in Video-Credits` : 'Kopieren fehlgeschlagen');
  }

  function creditsText() {
    return [
      'Musik & Sounds',
      '',
      ...state.credits.map((item) => item.credit),
      '',
      'Zusammengestellt mit CleanMusic',
    ].join('\n\n').replace(/\n{3,}/g, '\n\n');
  }

  async function saveCredits() {
    if (!state.credits.length || !bridge.creditsSave) return;
    const result = await bridge.creditsSave(creditsText());
    if (result && result.ok) toast('Credits gespeichert: ' + result.path);
    else if (result && result.error) toast('Speichern fehlgeschlagen: ' + result.error);
  }

  async function copyAllCredits() {
    if (!state.credits.length) return;
    const text = state.credits.map((item) => item.credit).join('\n\n');
    let ok = false;
    try {
      ok = await bridge.copyText(text);
    } catch {
      ok = false;
    }
    toast(ok ? `${state.credits.length} Credits kopiert – ab in die Videobeschreibung` : 'Kopieren fehlgeschlagen');
  }

  function renderCredits() {
    const host = $('#creator-credits');
    if (!host) return;

    const items = state.credits;
    host.innerHTML = `
      <div class="credits-head">
        <h3>Video-Credits</h3>
        <span class="credits-count">${items.length}</span>
      </div>
      <p class="muted small">
        Klick bei einem Titel auf den Kopier-Knopf: der Credit landet in der Zwischenablage und hier.
        Am Ende alles auf einmal in die Videobeschreibung.
      </p>
      ${
        items.length
          ? `<ol class="credits-list">
              ${items
                .map(
                  (item, index) => `
                    <li>
                      <div>
                        <strong>${esc(item.title)}</strong>
                        <span>${esc([item.artist, item.license].filter(Boolean).join(' · '))}</span>
                      </div>
                      <button class="icon-btn" data-credit-remove="${index}" title="Entfernen">${ICONS.close}</button>
                    </li>`
                )
                .join('')}
            </ol>
            <div class="row">
              <button class="btn primary small" data-creator-action="copy-credits">${ICONS.copy} Alle kopieren</button>
              <button class="btn ghost small" data-creator-action="save-credits">Als .txt speichern</button>
              <button class="btn ghost small" data-creator-action="clear-credits">Leeren</button>
            </div>`
          : '<p class="credits-empty">Noch leer.</p>'
      }
      ${creatorDownloadsHtml()}`;
  }

  /* ---------------------------------------------------------------- *
   * Fullscreen player
   * ---------------------------------------------------------------- */

  let fsIdleTimer = null;
  let lastColorSource = null;
  const DEFAULT_A = [91, 140, 255];
  const DEFAULT_B = [53, 224, 192];

  function openFullscreen() {
    const root = $('#fullscreen');
    if (!root || state.fullscreen) return;

    state.fullscreen = true;
    root.hidden = false;
    document.body.classList.add('fs-open');
    hideMenus();
    syncFullscreen();
    syncPlaybackButtons();

    if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }

    window.CMVisualizer.wake();
    fsActivity();
  }

  function closeFullscreen() {
    if (!state.fullscreen) return;
    state.fullscreen = false;
    $('#fullscreen').hidden = true;
    $('#fullscreen').classList.remove('idle');
    document.body.classList.remove('fs-open');
    clearTimeout(fsIdleTimer);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function toggleFullscreen() {
    if (state.fullscreen) closeFullscreen();
    else openFullscreen();
  }

  function fsActivity() {
    const root = $('#fullscreen');
    if (!root) return;
    root.classList.remove('idle');
    clearTimeout(fsIdleTimer);
    fsIdleTimer = setTimeout(() => {
      if (state.fullscreen && !audio.paused) root.classList.add('idle');
    }, 2800);
  }

  function updateFsProgress() {
    if (!state.fullscreen) return;
    const item = currentItem();
    const live = Boolean(item && item.kind === 'radio') || !Number.isFinite(audio.duration);
    const seek = $('#fs-seek');

    $('#fs-progress').hidden = live && Boolean(item);
    $('#fs-live').hidden = !(live && item);

    if (!live) {
      seek.max = String(audio.duration || 0);
      if (document.activeElement !== seek) seek.value = String(audio.currentTime || 0);
      const percent = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
      seek.style.setProperty('--fill', `${percent}%`);
      $('#fs-cur').textContent = fmtTime(audio.currentTime);
      $('#fs-dur').textContent = fmtTime(audio.duration);
    }
  }

  function renderUpNext() {
    const host = $('#fs-next');
    if (!host) return;

    const { items, index, upcoming } = state.queue;
    const next = [];
    if (upcoming >= 0 && items[upcoming]) next.push(upcoming);
    if (!state.playback.shuffle) {
      for (let step = 2; next.length < 3 && step <= items.length; step += 1) {
        const position = (index + step) % items.length;
        if (position !== index && !next.includes(position)) next.push(position);
      }
    }

    if (!next.length) {
      host.innerHTML = '';
      host.hidden = true;
      return;
    }

    host.hidden = false;
    host.innerHTML = `
      <div class="fs-next-label">Als Nächstes</div>
      ${next
        .map((position) => {
          const entry = items[position];
          return `
            <button class="fs-next-item" data-fs-queue="${position}">
              <span class="fs-next-art">${
                entry.artwork ? `<img src="${esc(entry.artwork)}" alt="" />` : '♪'
              }</span>
              <span class="fs-next-meta">
                <span class="fs-next-title">${esc(entry.title)}</span>
                <span class="fs-next-sub">${esc(entry.artist || entry.sourceLabel || '')}</span>
              </span>
            </button>`;
        })
        .join('')}`;
  }

  function syncFullscreen() {
    if (!state.fullscreen) return;

    const item = currentItem();
    $('#fs-title').textContent = item ? item.title : 'Nichts ausgewählt';
    $('#fs-artist').textContent = item ? item.artist || item.sourceLabel || '' : 'Wähl einen Titel, Sender oder Sound';

    const badge = $('#np-badge');
    const fsBadge = $('#fs-badge');
    fsBadge.textContent = badge.hidden ? item ? item.sourceLabel || '' : '' : badge.textContent;
    fsBadge.dataset.tone = badge.dataset.tone || '';
    fsBadge.hidden = !fsBadge.textContent;

    const image = $('#fs-cover-img');
    const letter = $('#fs-cover-letter');
    const background = $('#fs-bg-img');
    if (item && item.artwork) {
      image.src = item.artwork;
      image.hidden = false;
      letter.hidden = true;
      background.src = item.artwork;
      background.hidden = false;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
      letter.hidden = false;
      letter.textContent = item ? (item.title || '♪').trim().charAt(0).toUpperCase() || '♪' : '♪';
      background.removeAttribute('src');
      background.hidden = true;
    }

    const fav = $('#fs-fav');
    const on = Boolean(item && favIds.has(item.id));
    fav.classList.toggle('on', on);
    fav.disabled = !item;
    $('#fs-add').disabled = !item;
    $('#fs-play').classList.toggle('playing', !audio.paused);
    $('#fs-play').classList.toggle('loading', $('#btn-play').classList.contains('loading'));
    updateVolumeUi();

    $$('#fs-styles [data-fs-style]').forEach((button) => {
      const style = button.dataset.fsStyle;
      button.classList.toggle(
        'active',
        style === 'off' ? !state.settings.visualizer : state.settings.visualizer && state.settings.vizStyle === style
      );
    });

    updateFsProgress();
    renderUpNext();
    applyArtworkColors(item ? item.artwork : '');
  }

  function setAccent(a, b) {
    const root = document.documentElement;
    root.style.setProperty('--fs-a', a.join(', '));
    root.style.setProperty('--fs-b', b.join(', '));
    window.CMVisualizer.setColors(a, b);
    coverRgb = a === DEFAULT_A ? null : a;
    state.coverColors = coverRgb ? [rgbToHex(a), rgbToHex(b)] : null;
    applyAccent();
    pushPlayerState();
  }

  function rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    return [h / 6, s, l];
  }

  function hslToRgb(h, s, l) {
    const hue = (p, q, t) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    if (s === 0) return [l, l, l].map((v) => Math.round(v * 255));
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((v) => Math.round(v * 255));
  }

  // Two vivid colours from the cover: the strongest hue and a second one
  // at least ~60° away (or a shifted variant of the first).
  function vibrantColors(image) {
    const canvas = document.createElement('canvas');
    canvas.width = 28;
    canvas.height = 28;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(image, 0, 0, 28, 28);
    const data = g.getImageData(0, 0, 28, 28).data;

    const buckets = Array.from({ length: 12 }, () => ({ weight: 0, h: 0, s: 0, l: 0, n: 0 }));
    for (let i = 0; i < data.length; i += 4) {
      const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      if (s < 0.22 || l < 0.16 || l > 0.9) continue;
      const bucket = buckets[Math.floor(h * 12) % 12];
      const weight = s * (1 - Math.abs(l - 0.55));
      bucket.weight += weight;
      bucket.h += h * weight;
      bucket.s += s * weight;
      bucket.l += l * weight;
      bucket.n += 1;
    }

    const ranked = buckets
      .map((bucket, index) => ({ ...bucket, index }))
      .filter((bucket) => bucket.n > 2)
      .sort((a, b) => b.weight - a.weight);
    if (!ranked.length) return null;

    const toColor = (bucket, shift = 0) => {
      const h = (bucket.h / bucket.weight + shift + 1) % 1;
      const s = Math.min(1, Math.max(0.55, bucket.s / bucket.weight));
      const l = Math.min(0.68, Math.max(0.52, bucket.l / bucket.weight));
      return hslToRgb(h, s, l);
    };

    const first = ranked[0];
    const second = ranked.find((bucket) => {
      const distance = Math.min(Math.abs(bucket.index - first.index), 12 - Math.abs(bucket.index - first.index));
      return distance >= 2;
    });

    return [toColor(first), second ? toColor(second) : toColor(first, 0.12)];
  }

  function applyArtworkColors(src) {
    if (src === lastColorSource) return;
    lastColorSource = src;

    if (!src) {
      setAccent(DEFAULT_A, DEFAULT_B);
      return;
    }

    const image = new Image();
    image.onload = () => {
      if (lastColorSource !== src) return;
      try {
        const colors = vibrantColors(image);
        if (colors) setAccent(colors[0], colors[1]);
        else setAccent(DEFAULT_A, DEFAULT_B);
      } catch {
        setAccent(DEFAULT_A, DEFAULT_B);
      }
    };
    image.onerror = () => setAccent(DEFAULT_A, DEFAULT_B);
    image.src = src;
  }

  function setVisualizerStyle(style) {
    if (style === 'off') {
      setVisualizerEnabled(false);
    } else {
      state.settings.vizStyle = style;
      if (!state.settings.visualizer) setVisualizerEnabled(true);
      else saveSettings();
      window.CMVisualizer.setStyle($('#fs-viz'), style);
    }
    syncFullscreen();
    renderSettings();
  }

  function setVisualizerEnabled(enabled) {
    state.settings.visualizer = Boolean(enabled);
    saveSettings();
    window.CMVisualizer.setEnabled(state.settings.visualizer);
    applyVisualizerVisibility();
  }

  function applyVisualizerVisibility() {
    document.body.classList.toggle('viz-off', !state.settings.visualizer);
    document.body.classList.toggle('mini-viz-off', !state.settings.miniViz);
    window.CMVisualizer.wake();
  }

  /* ---------------------------------------------------------------- *
   * Themes
   *
   * Palettes live in themes.js. Every slot becomes a CSS variable, colours
   * used with transparency also as an "r, g, b" triplet. "Akzent aus Cover"
   * replaces the accent with the cover colour of the current title, adjusted
   * so it stays readable on light and dark themes.
   * ---------------------------------------------------------------- */

  const THEMES = Array.isArray(window.CM_THEMES) ? window.CM_THEMES : [];
  let coverRgb = null; // vivid colour of the current cover, if any

  function hexToRgb(hex) {
    const value = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(value)) return [0, 0, 0];
    return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16));
  }

  function rgbToHex(rgb) {
    return `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  }

  function currentTheme() {
    return THEMES.find((theme) => theme.id === state.settings.theme) || THEMES[0] || null;
  }

  function applyTheme() {
    const theme = currentTheme();
    if (!theme) return;
    const c = theme.colors;
    const root = document.documentElement;
    const vars = {
      '--bg': c.bg,
      '--bg-2': c.bg2,
      '--panel': c.panel,
      '--panel-2': c.panel2,
      '--panel-3': c.panel3,
      '--border': c.border,
      '--border-soft': c.borderSoft,
      '--text': c.text,
      '--muted': c.muted,
      '--muted-2': c.muted2,
      '--accent-2': c.accent2,
      '--danger': c.danger,
      '--ok': c.ok,
      '--warn': c.warn,
      '--on-accent': c.onAccent,
      '--bg-rgb': hexToRgb(c.bg).join(', '),
      '--panel-rgb': hexToRgb(c.panel2).join(', '),
      '--border-rgb': hexToRgb(c.border).join(', '),
      '--muted-rgb': hexToRgb(c.muted).join(', '),
      '--accent-2-rgb': hexToRgb(c.accent2).join(', '),
      '--danger-rgb': hexToRgb(c.danger).join(', '),
      '--ok-rgb': hexToRgb(c.ok).join(', '),
      '--warn-rgb': hexToRgb(c.warn).join(', '),
      '--tint': theme.light ? '24, 32, 48' : '255, 255, 255',
      '--shadow': theme.light ? '0 18px 48px rgba(24, 32, 48, 0.16)' : '0 20px 60px rgba(0, 0, 0, 0.5)',
    };
    Object.entries(vars).forEach(([name, value]) => root.style.setProperty(name, value));
    root.style.colorScheme = theme.light ? 'light' : 'dark';
    root.dataset.theme = theme.id;
    root.dataset.mode = theme.light ? 'light' : 'dark';
    applyAccent();
    if (bridge.setTitleBar) bridge.setTitleBar({ color: c.bg, symbolColor: c.text });
  }

  // Theme accent, or the cover colour brought to a readable lightness.
  function accentRgb() {
    const theme = currentTheme();
    const base = hexToRgb(theme ? theme.colors.accent : '#5b8cff');
    if (!state.settings.coverAccent || !coverRgb) return base;
    const [h, sat, l] = rgbToHsl(coverRgb[0], coverRgb[1], coverRgb[2]);
    const light = Boolean(theme && theme.light);
    const lightness = light ? Math.min(0.42, Math.max(0.3, l)) : Math.min(0.72, Math.max(0.62, l));
    return hslToRgb(h, Math.min(0.88, Math.max(0.5, sat)), lightness);
  }

  function applyAccent() {
    const rgb = accentRgb();
    const root = document.documentElement;
    root.style.setProperty('--accent', rgbToHex(rgb));
    root.style.setProperty('--accent-rgb', rgb.join(', '));
  }

  function setTheme(id) {
    if (!THEMES.some((theme) => theme.id === id)) return;
    state.settings.theme = id;
    saveSettings();
    applyTheme();
    renderSettings();
  }

  function themePanel() {
    const active = currentTheme();
    return `
      <div class="panel" id="theme-panel">
        <h3>Aussehen</h3>
        <div class="theme-grid">
          ${THEMES.map((theme) => {
            const c = theme.colors;
            const style = `--t-bg:${c.bg};--t-panel:${c.panel3};--t-text:${c.text};--t-accent:${c.accent};--t-accent-2:${c.accent2};--t-border:${c.border}`;
            return `
              <button class="theme-card ${active && active.id === theme.id ? 'active' : ''}" data-theme-id="${esc(theme.id)}" style="${style}" title="${esc(theme.name)}">
                <span class="theme-preview" aria-hidden="true">
                  <i class="tp-side"></i><i class="tp-line"></i><i class="tp-line short"></i><i class="tp-dot"></i><i class="tp-dot two"></i>
                </span>
                <strong>${esc(theme.name)}</strong>
                <small>${theme.light ? 'Hell' : 'Dunkel'}</small>
              </button>`;
          }).join('')}
        </div>
        <label class="toggle-row" style="margin-top:14px">
          <span>
            <strong>Akzentfarbe aus dem Cover</strong>
            <small>Knöpfe, Regler und Markierungen übernehmen die Farbe des laufenden Titels.</small>
          </span>
          <input type="checkbox" id="opt-cover-accent" ${state.settings.coverAccent ? 'checked' : ''} />
        </label>
        <p class="muted small" style="margin-top:10px">
          Farbpaletten von Catppuccin, Dracula, Nord, Tokyo Night, Rosé Pine, Gruvbox und Everforest,
          jeweils unter MIT-Lizenz (siehe THIRD-PARTY-NOTICES.md).
        </p>
      </div>`;
  }

  /* ---------------------------------------------------------------- *
   * Discord Rich Presence
   * ---------------------------------------------------------------- */

  let presenceTimer = null;

  function pushPresence(immediate = false) {
    clearTimeout(presenceTimer);
    presenceTimer = setTimeout(() => {
      if (!state.discord.config.enabled) return;

      const item = currentItem();
      if (!item || !audio.getAttribute('src') || state.nowMode === 'error') {
        bridge.discordUpdate(null);
        return;
      }

      const duration = Number.isFinite(audio.duration) ? audio.duration : item.duration || 0;
      bridge.discordUpdate({
        title: item.title,
        artist: item.artist,
        album: item.album,
        source: item.sourceLabel,
        artwork: item.artwork,
        link: item.link,
        linkLabel: item.kind === 'radio' ? 'Sender öffnen' : 'Anhören',
        playing: !audio.paused,
        live: item.kind === 'radio',
        position: audio.currentTime || 0,
        duration,
      });
    }, immediate ? 0 : 700);
  }

  /* ---------------------------------------------------------------- *
   * Updates (check runs in the main process on every start)
   * ---------------------------------------------------------------- */

  let updateInfo = null;
  let updateDismissed = null; // version the user snoozed
  let updateSnoozeTimer = null;
  let chimedFor = null; // version the chime already played for (this showing)
  const UPDATE_SNOOZE = 2 * 60 * 60 * 1000;

  // Short, quiet two-tone chime – synthesized, no audio file. Silent when
  // CleanMusic is muted; follows the volume a little.
  function playUpdateChime() {
    if (vol.muted) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const now = ctx.currentTime + 0.02;
      const peak = 0.05 + 0.08 * Math.min(1, Math.max(0.3, volumeLevel()));
      [
        [784, 0],
        [1175, 0.13],
      ].forEach(([freq, at]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + at);
        gain.gain.exponentialRampToValueAtTime(peak, now + at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.7);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + at);
        osc.stop(now + at + 0.75);
      });
      setTimeout(() => ctx.close().catch(() => {}), 1500);
    } catch {
      /* no audio device – the card is enough */
    }
  }

  function formatSize(bytes) {
    const mb = (Number(bytes) || 0) / (1024 * 1024);
    return mb ? `${mb.toFixed(0)} MB` : '';
  }

  function onUpdateState(info) {
    updateInfo = info || null;
    renderUpdateCard();
    renderUpdateStatus();
  }

  function renderUpdateCard() {
    const card = $('#update-card');
    if (!card) return;
    const info = updateInfo;
    const show =
      info &&
      ((info.status === 'available' && updateDismissed !== info.latest) ||
        info.status === 'downloading' ||
        info.status === 'ready' ||
        (info.status === 'error' && info.asset));
    card.hidden = !show;
    if (!show) return;
    if (info.status === 'available' && chimedFor !== info.latest) {
      chimedFor = info.latest;
      playUpdateChime();
    }

    let body = '';
    if (info.status === 'available') {
      body = `
        <div class="update-text">
          <strong>CleanMusic ${esc(info.latest)} ist da – möchtest du updaten?</strong>
          <small>Du hast ${esc(info.current)}.${
            info.installable && info.asset ? ` Download ${esc(formatSize(info.asset.size))}, danach Neustart.` : ''
          }${info.notes ? ' <button class="link-btn" data-update="notes">Was ist neu?</button>' : ''}</small>
        </div>
        <div class="update-actions">
          ${
            info.installable && info.asset
              ? '<button class="btn primary small" data-update="download">Updaten</button>'
              : '<button class="btn primary small" data-update="open">Updaten (Download-Seite)</button>'
          }
          <button class="btn ghost small" data-update="later">Erinnere mich später noch einmal</button>
        </div>`;
    } else if (info.status === 'downloading') {
      const pct = Math.round((info.progress || 0) * 100);
      body = `
        <div class="update-text">
          <strong>Update ${esc(info.latest)} wird geladen …</strong>
          <small>${pct} %</small>
          <span class="update-progress"><i style="width:${pct}%"></i></span>
        </div>`;
    } else if (info.status === 'ready') {
      body = `
        <div class="update-text">
          <strong>Update ${esc(info.latest)} ist bereit</strong>
          <small>${
            info.kind === 'setup'
              ? 'Geprüft. CleanMusic schließt sich kurz, installiert das Update und startet von selbst neu.'
              : 'Geprüft und neben deiner jetzigen Version gespeichert. Die alte EXE kannst du danach löschen.'
          }</small>
        </div>
        <div class="update-actions">
          <button class="btn primary small" data-update="install">${info.kind === 'setup' ? 'Jetzt installieren' : 'Jetzt neu starten'}</button>
          <button class="btn ghost small" data-update="later">Beim nächsten Mal</button>
        </div>`;
    } else {
      body = `
        <div class="update-text">
          <strong>Update ${esc(info.latest || '')} hat nicht geklappt</strong>
          <small>${esc(info.error || '')}</small>
        </div>
        <div class="update-actions">
          ${info.installable && info.asset ? '<button class="btn primary small" data-update="download">Nochmal versuchen</button>' : ''}
          <button class="btn ${info.installable && info.asset ? 'ghost' : 'primary'} small" data-update="open">Zur Download-Seite</button>
          <button class="btn ghost small" data-update="later">Schließen</button>
        </div>`;
    }
    card.innerHTML = `<span class="update-icon">${ICONS.download}</span>${body}`;
  }

  function updateStatusText() {
    const info = updateInfo;
    if (!info) return '';
    switch (info.status) {
      case 'checking':
        return 'Suche nach Updates …';
      case 'current':
        return info.latest
          ? `Du bist auf dem neuesten Stand (${info.current}).`
          : `Version ${info.current} – noch keine Veröffentlichung gefunden.`;
      case 'available':
        return `Version ${info.latest} ist verfügbar (du hast ${info.current}).`;
      case 'downloading':
        return `Update ${info.latest} wird geladen …`;
      case 'ready':
        return `Update ${info.latest} ist bereit – Neustart genügt.`;
      case 'error':
        return info.error || 'Update-Prüfung fehlgeschlagen.';
      default:
        return '';
    }
  }

  function renderUpdateStatus() {
    const line = $('#update-status');
    if (line) line.textContent = updateStatusText();
    const toggle = $('#opt-update');
    if (toggle && updateInfo) toggle.checked = Boolean(updateInfo.auto);
  }

  function updatePanel() {
    const auto = updateInfo ? updateInfo.auto : true;
    return `
      <div class="panel" id="update-panel">
        <h3>Updates</h3>
        <label class="toggle-row">
          <span>
            <strong>Beim Start nach Updates suchen</strong>
            <small>Fragt die Veröffentlichungen von CleanMusic auf GitHub ab. Es werden keine persönlichen Daten gesendet.</small>
          </span>
          <input type="checkbox" id="opt-update" ${auto ? 'checked' : ''} />
        </label>
        <div class="row" style="margin-top:10px">
          <button class="btn ghost small" data-update="check">Jetzt suchen</button>
          <span class="muted small" id="update-status">${esc(updateStatusText())}</span>
        </div>
      </div>`;
  }

  async function onUpdateAction(action) {
    if (!bridge.updateCheck) return;
    switch (action) {
      case 'check':
        onUpdateState(await bridge.updateCheck());
        if (updateInfo && updateInfo.status === 'available') updateDismissed = null;
        renderUpdateCard();
        return;
      case 'download':
        onUpdateState(await bridge.updateDownload());
        return;
      case 'install':
        if (!(await bridge.updateInstall())) toast('Neustart nicht möglich – Datei fehlt.');
        return;
      case 'open':
        bridge.updateOpen();
        return;
      case 'notes': {
        const ok = await askConfirm({
          title: `Neu in CleanMusic ${updateInfo.latest}`,
          text: updateInfo.notes,
          confirm: updateInfo.installable && updateInfo.asset ? 'Aktualisieren' : 'Zur Download-Seite',
        });
        if (ok) onUpdateAction(updateInfo.installable && updateInfo.asset ? 'download' : 'open');
        return;
      }
      case 'later': {
        const version = updateInfo ? updateInfo.latest : null;
        updateDismissed = version;
        $('#update-card').hidden = true;
        // Ask again later in this session – and on every start anyway.
        clearTimeout(updateSnoozeTimer);
        updateSnoozeTimer = setTimeout(() => {
          if (updateDismissed !== version) return;
          updateDismissed = null;
          chimedFor = null;
          renderUpdateCard();
        }, UPDATE_SNOOZE);
        if (updateInfo && updateInfo.status === 'available') toast('Okay – ich erinnere dich in 2 Stunden und beim nächsten Start.');
        return;
      }
      default:
    }
  }

  /* ---------------------------------------------------------------- *
   * Media keys + Windows media overlay (navigator.mediaSession)
   * ---------------------------------------------------------------- */

  let mediaPositionAt = 0;

  function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    const item = currentItem();
    if (!item) {
      session.metadata = null;
      session.playbackState = 'none';
      return;
    }
    try {
      const fallback = new URL('assets/icon.png', location.href).href;
      session.metadata = new MediaMetadata({
        title: item.title || 'CleanMusic',
        artist: item.artist || item.sourceLabel || '',
        album: item.album || (item.kind === 'radio' ? 'Live Radio' : 'CleanMusic'),
        artwork: item.artwork
          ? [{ src: item.artwork, sizes: '512x512' }]
          : [{ src: fallback, sizes: '256x256', type: 'image/png' }],
      });
    } catch {
      /* ignore */
    }
    session.playbackState = audio.getAttribute('src') && !audio.paused ? 'playing' : 'paused';
  }

  function updateMediaPosition(force = false) {
    if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!force && Date.now() - mediaPositionAt < 5000) return;
    mediaPositionAt = Date.now();
    try {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          position: Math.min(audio.duration, audio.currentTime || 0),
          playbackRate: audio.playbackRate || 1,
        });
      } else {
        navigator.mediaSession.setPositionState();
      }
    } catch {
      /* ignore */
    }
  }

  function wireMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const set = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        /* action not supported */
      }
    };
    set('play', () => {
      if (audio.paused) $('#btn-play').click();
    });
    set('pause', () => {
      if (!audio.paused) $('#btn-play').click();
    });
    set('previoustrack', () => $('#btn-prev').click());
    set('nexttrack', () => stepQueue(1));
    set('seekbackward', (details) => {
      if (Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, audio.currentTime - ((details && details.seekOffset) || 10));
    });
    set('seekforward', (details) => {
      if (Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + ((details && details.seekOffset) || 10));
      }
    });
    set('seekto', (details) => {
      if (details && Number.isFinite(details.seekTime) && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(audio.duration, Math.max(0, details.seekTime));
      }
    });
    ['play', 'pause', 'emptied'].forEach((name) =>
      audio.addEventListener(name, () => {
        updateMediaSession();
        updateMediaPosition(true);
      })
    );
    ['loadedmetadata', 'seeked', 'durationchange'].forEach((name) =>
      audio.addEventListener(name, () => updateMediaPosition(true))
    );
    audio.addEventListener('timeupdate', () => updateMediaPosition());
  }

  /* ---------------------------------------------------------------- *
   * Backup: export / import (local JSON file)
   *
   * Favourites, playlists, video credits, listening history and the
   * appearance/playback settings. Import merges – nothing is deleted.
   * ---------------------------------------------------------------- */

  const BACKUP_SETTINGS = [
    'theme',
    'coverAccent',
    'visualizer',
    'vizStyle',
    'miniViz',
    'normalize',
    'volumeBoost',
    'fullTracks',
    'systemBrowser',
  ];

  async function exportBackup() {
    if (!bridge.backupSave) return;
    const settings = {};
    BACKUP_SETTINGS.forEach((key) => {
      settings[key] = state.settings[key];
    });
    const data = {
      app: 'CleanMusic',
      kind: 'backup',
      format: 1,
      version: (state.info && state.info.version) || '',
      exportedAt: new Date().toISOString(),
      collection: state.collection,
      credits: state.credits,
      history,
      settings,
    };
    const result = await bridge.backupSave(JSON.stringify(data, null, 2));
    if (result && result.ok) toast('Gesichert: ' + result.path);
    else if (result && result.error) toast('Sichern fehlgeschlagen: ' + result.error);
  }

  function mergeBackup(data) {
    const counts = { favorites: 0, playlists: 0, credits: 0, history: 0 };
    const collection = data.collection && typeof data.collection === 'object' ? data.collection : {};

    const favorites = Array.isArray(collection.favorites) ? collection.favorites.map(migrateEntry).filter(validEntry) : [];
    const known = new Set(state.collection.favorites.map((entry) => entry.id));
    favorites.forEach((entry) => {
      if (known.has(entry.id)) return;
      known.add(entry.id);
      state.collection.favorites.push(storable(entry));
      counts.favorites += 1;
    });

    (Array.isArray(collection.playlists) ? collection.playlists : [])
      .filter((playlist) => playlist && typeof playlist.id === 'string')
      .forEach((playlist) => {
        const items = (Array.isArray(playlist.items) ? playlist.items : []).map(migrateEntry).filter(validEntry);
        const existing = playlistById(playlist.id);
        if (existing) {
          const ids = new Set(existing.items.map((entry) => entry.id));
          items.forEach((entry) => {
            if (!ids.has(entry.id)) existing.items.push(storable(entry));
          });
          existing.updatedAt = Date.now();
        } else {
          state.collection.playlists.push({
            id: playlist.id,
            name: String(playlist.name || 'Playlist').slice(0, 80),
            createdAt: Number(playlist.createdAt) || Date.now(),
            updatedAt: Date.now(),
            items: items.map(storable),
          });
          counts.playlists += 1;
        }
      });

    (Array.isArray(data.credits) ? data.credits : []).forEach((credit) => {
      if (!credit || typeof credit.id !== 'string' || typeof credit.credit !== 'string') return;
      if (state.credits.some((item) => item.id === credit.id)) return;
      state.credits.push({
        id: credit.id,
        title: String(credit.title || ''),
        artist: String(credit.artist || ''),
        license: String(credit.license || ''),
        credit: credit.credit.slice(0, 2000),
      });
      counts.credits += 1;
    });

    (Array.isArray(data.history) ? data.history : []).forEach((row) => {
      if (!row || !validEntry(row.entry)) return;
      const entry = migrateEntry(row.entry);
      const mine = history.find((item) => item.entry.id === entry.id);
      if (mine) {
        mine.plays = Math.max(mine.plays, Number(row.plays) || 1);
        mine.last = Math.max(mine.last, Number(row.last) || 0);
      } else {
        history.push({
          entry: storable(entry),
          plays: Math.max(1, Number(row.plays) || 1),
          first: Number(row.first) || Date.now(),
          last: Number(row.last) || Date.now(),
        });
        counts.history += 1;
      }
    });
    history.sort((a, b) => b.last - a.last);
    history = history.slice(0, HISTORY_MAX);
    writeJSON(STORAGE.history, history);

    const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
    BACKUP_SETTINGS.forEach((key) => {
      if (key in settings && typeof settings[key] === typeof state.settings[key]) state.settings[key] = settings[key];
    });
    saveSettings();
    persistCredits();
    onCollectionChanged({ favorites: true });
    applyTheme();
    applyVolume();
    renderCredits();
    buildHome();
    renderSettings();
    return counts;
  }

  async function importBackup(preset) {
    let data = preset;
    if (!data) {
      if (!bridge.backupOpen) return null;
      const result = await bridge.backupOpen();
      if (!result || result.canceled) return null;
      if (result.error) {
        toast(result.error);
        return null;
      }
      data = result.data;
    }
    if (!data || data.app !== 'CleanMusic' || data.kind !== 'backup') {
      toast('Das ist kein CleanMusic-Backup.');
      return null;
    }
    const counts = mergeBackup(data);
    toast(
      `Wiederhergestellt: ${counts.favorites} Favoriten, ${counts.playlists} Playlists, ${counts.credits} Credits, ${counts.history} Verlaufstitel`
    );
    return counts;
  }

  /* ---------------------------------------------------------------- *
   * Player state for plugins (API v2)
   *
   * The main process forwards it to plugins as 'nowplaying' / 'state' /
   * 'volume' events; plugins can steer the player through commands.
   * ---------------------------------------------------------------- */

  let playerStateTimer = null;
  let playerStateAt = 0;

  function playerSnapshot() {
    const item = currentItem();
    const hasSource = Boolean(audio.getAttribute('src'));
    return {
      track: item
        ? {
            id: item.id,
            title: item.title || '',
            artist: item.artist || '',
            album: item.album || '',
            source: item.sourceLabel || '',
            kind: item.kind || '',
            artwork: item.artwork || '',
            link: item.link || '',
            license: item.license || '',
            colors: state.coverColors || [],
          }
        : null,
      playing: hasSource && !audio.paused,
      position: audio.currentTime || 0,
      duration: Number.isFinite(audio.duration) ? audio.duration : (item && item.duration) || 0,
      live: Boolean(item && item.kind === 'radio'),
      volume: volumeLevel(),
      muted: vol.muted,
    };
  }

  function pushPlayerState(immediate = false) {
    if (!bridge.playerState) return;
    clearTimeout(playerStateTimer);
    playerStateTimer = setTimeout(() => {
      playerStateAt = Date.now();
      try {
        bridge.playerState(playerSnapshot());
      } catch {
        /* ignore */
      }
    }, immediate ? 0 : 120);
  }

  /* ---------------------------------------------------------------- *
   * Song requests (plugins, e.g. Streamer.bot !sr)
   *
   * A plugin hands over a search text and a name; CleanMusic picks the
   * first fitting hit (full title from the active source plugin, else a
   * 30-second preview) and queues it like "Zur Warteschlange hinzufügen",
   * marked "Wunsch von …". Limits per viewer live in the plugin.
   * ---------------------------------------------------------------- */

  const REQUEST_SOURCES = ['auto', 'full', 'preview'];

  function requestName(value) {
    return String(value || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/^@+/, '')
      .trim()
      .slice(0, 40);
  }

  function pendingRequests() {
    const { items, index } = state.queue;
    const list = [];
    items.forEach((entry, position) => {
      if (position <= index || !entry.requestedBy) return;
      list.push({
        by: entry.requestedBy,
        title: entry.title || '',
        artist: entry.artist || '',
        source: entry.sourceLabel || '',
        preview: entry.kind === 'preview',
        position: position - index,
      });
    });
    return list;
  }

  const REQUEST_UNWANTED = ['karaoke', 'instrumental', 'cover', 'tribute', 'nightcore', 'sped', 'slowed', '8d'];

  function requestWords(value) {
    return normKey(value).split(' ').filter((word) => word.length > 1);
  }

  // Score = how many words of the wish appear in artist + title; versions the
  // viewer did not ask for (karaoke, cover, …) count against a hit.
  function bestRequestHit(hits, query) {
    const wanted = requestWords(query);
    let best = null;
    let bestScore = -Infinity;
    hits.forEach((entry, order) => {
      const words = new Set([...requestWords(entry.artist), ...requestWords(entry.title)]);
      let score = wanted.filter((word) => words.has(word)).length * 10;
      REQUEST_UNWANTED.forEach((word) => {
        if (words.has(word) && !wanted.includes(word)) score -= 15;
      });
      score -= order * 0.1; // keep the source's order on ties
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    });
    return best;
  }

  function fitsLength(entry, maxSeconds) {
    if (!maxSeconds || entry.kind !== 'plugin') return true;
    return !entry.duration || entry.duration <= maxSeconds;
  }

  async function findRequestTrack(query, source, maxSeconds) {
    const plugin = searchPlugin();
    if (source !== 'preview' && plugin) {
      try {
        const result = await bridge.pluginSearch(plugin.id, query);
        const hits = (Array.isArray(result.results) ? result.results : []).map((item) => pluginEntry(plugin, item));
        const hit = bestRequestHit(hits.filter((entry) => fitsLength(entry, maxSeconds)), query);
        if (hit) return hit;
        if (hits.length && source === 'full') return { tooLong: true };
      } catch {
        /* fall back to previews */
      }
    }
    if (source === 'full') return null;
    const result = await bridge.searchCatalog(query);
    const tracks = (Array.isArray(result.tracks) ? result.tracks : []).slice(0, 25).map(previewEntry);
    return bestRequestHit(tracks, query);
  }

  async function songRequest(value) {
    const query = String((value && value.query) || '')
      .replace(/[\r\n\t]+/g, ' ')
      .trim()
      .slice(0, 200);
    const by = requestName(value && value.by) || 'Chat';
    const source = REQUEST_SOURCES.includes(value && value.source) ? value.source : 'auto';
    const maxSeconds = Math.max(0, Math.round(Number(value && value.maxSeconds) || 0));
    if (!query) return { ok: false, reason: 'empty' };
    if (source === 'full' && !searchPlugin()) return { ok: false, reason: 'no-source' };

    const found = await findRequestTrack(query, source, maxSeconds);
    if (!found) return { ok: false, reason: 'not-found' };
    if (found.tooLong) return { ok: false, reason: 'too-long' };

    const key = matchKey(found);
    const { items, index } = state.queue;
    const current = items[index];
    if ((current && matchKey(current) === key) || items.slice(index + 1).some((entry) => matchKey(entry) === key)) {
      return { ok: false, reason: 'duplicate', track: { title: found.title, artist: found.artist } };
    }

    enqueue([found], 'end', { requestedBy: by });
    const mine = pendingRequests().filter((entry) => entry.by === by);
    const placed = mine[mine.length - 1];
    return {
      ok: true,
      track: { title: found.title, artist: found.artist, source: found.sourceLabel || '', preview: found.kind === 'preview' },
      position: placed ? placed.position : 0,
      playingNow: !placed,
    };
  }

  function removeSongRequest(value) {
    const by = requestName(value && value.by).toLowerCase();
    if (!by) return { ok: false, reason: 'empty' };
    const { items, index } = state.queue;
    for (let position = items.length - 1; position > index; position -= 1) {
      const entry = items[position];
      if (entry.requestedBy && entry.requestedBy.toLowerCase() === by) {
        removeFromQueue(position);
        return { ok: true, track: { title: entry.title, artist: entry.artist } };
      }
    }
    return { ok: false, reason: 'none' };
  }

  async function answerPlayerCall(callId, task) {
    let result;
    try {
      result = await task();
    } catch (error) {
      result = { ok: false, reason: 'error', error: String((error && error.message) || error) };
    }
    if (callId && bridge.playerCommandResult) bridge.playerCommandResult(callId, result);
  }

  function onPlayerCommand(message) {
    const { command, value, callId } = message || {};
    switch (command) {
      case 'request':
        answerPlayerCall(callId, () => songRequest(value));
        break;
      case 'requests':
        answerPlayerCall(callId, () => pendingRequests());
        break;
      case 'removeRequest':
        answerPlayerCall(callId, () => removeSongRequest(value));
        break;
      case 'play':
        if (audio.paused) $('#btn-play').click();
        break;
      case 'pause':
        if (!audio.paused) $('#btn-play').click();
        break;
      case 'toggle':
        $('#btn-play').click();
        break;
      case 'next':
        stepQueue(1);
        break;
      case 'previous':
        $('#btn-prev').click();
        break;
      case 'volume':
        setVolume(Number(value));
        break;
      case 'mute':
        setMuted(Boolean(value));
        break;
      default:
    }
  }

  async function loadDiscord() {
    try {
      state.discord = await bridge.discordGet();
    } catch {
      /* keep defaults */
    }
    renderSettings();
  }

  async function saveDiscord(patch) {
    try {
      state.discord = await bridge.discordSet(patch);
    } catch (error) {
      toast(error.message);
    }
    renderSettings();
    pushPresence(true);
  }

  function discordStatusHtml() {
    const { config, status } = state.discord;
    if (!config.enabled) return '<span class="status-chip"><i></i>Aus</span>';
    if (status && status.connected) {
      return `<span class="status-chip ok"><i></i>Verbunden${status.user ? ` als ${esc(status.user)}` : ''}</span>`;
    }
    if (status && status.error) {
      return `<span class="status-chip warn"><i></i>${esc(status.error)}</span>`;
    }
    return '<span class="status-chip"><i></i>Verbinde mit Discord …</span>';
  }

  function renderDiscordStatus() {
    const host = $('#discord-status');
    if (host) host.innerHTML = discordStatusHtml();
  }

  function visualizerPanel() {
    const styles = [
      ['radial', 'Kreis ums Cover'],
      ['bars', 'Balken'],
      ['wave', 'Welle'],
    ];
    return `
      <div class="panel" id="viz-panel">
        <h3>Visualizer <span class="tag">optional</span></h3>
        <label class="toggle-row">
          <span>
            <strong>Visualizer anzeigen</strong>
            <small>Analysiert, was gerade läuft, und tanzt im Vollbild-Player mit – Farben kommen aus dem Cover.</small>
          </span>
          <input type="checkbox" id="opt-viz" ${state.settings.visualizer ? 'checked' : ''} />
        </label>
        <div class="row viz-styles">
          ${styles
            .map(
              ([value, label]) =>
                `<button class="radio-tag ${state.settings.vizStyle === value ? 'active' : ''}" data-viz-style="${value}" ${
                  state.settings.visualizer ? '' : 'disabled'
                }>${label}</button>`
            )
            .join('')}
        </div>
        <label class="toggle-row ${state.settings.visualizer ? '' : 'disabled'}" style="margin-top:12px">
          <span>
            <strong>Mini-Visualizer in der Player-Leiste</strong>
            <small>Kleine Balken neben der Lautstärke.</small>
          </span>
          <input type="checkbox" id="opt-mini-viz" ${state.settings.miniViz ? 'checked' : ''} ${
            state.settings.visualizer ? '' : 'disabled'
          } />
        </label>
      </div>`;
  }

  function discordPanel() {
    const { config } = state.discord;
    return `
      <div class="panel" id="discord-panel">
        <h3>Discord Rich Presence <span class="tag">optional</span></h3>
        <p>
          Zeigt in deinem Discord-Profil, was du gerade hörst – Titel, Artist, Cover und Fortschritt.
          Läuft lokal über deinen Discord-Client, nichts geht an fremde Server.
        </p>
        <label class="toggle-row" style="margin-top:12px">
          <span>
            <strong>Rich Presence aktivieren</strong>
            <small>Andere sehen in Discord, was du hörst. Aus = nichts wird gesendet.</small>
          </span>
          <input type="checkbox" id="opt-discord" ${config.enabled ? 'checked' : ''} />
        </label>
        <div class="discord-id-row">
          <label for="discord-client-id">Application-ID</label>
          <input id="discord-client-id" inputmode="numeric" autocomplete="off" spellcheck="false"
            placeholder="z. B. 123456789012345678" value="${esc(config.clientId)}" />
          <button class="btn ghost small" data-discord-action="save">Speichern</button>
        </div>
        <div class="plugin-status" id="discord-status">${discordStatusHtml()}</div>
        <label class="toggle-row" style="margin-top:12px">
          <span>
            <strong>Cover anzeigen</strong>
            <small>Sonst erscheint das Bild „logo“ aus deiner Discord-Application.</small>
          </span>
          <input type="checkbox" id="opt-discord-art" ${config.showArtwork ? 'checked' : ''} />
        </label>
        <details class="discord-help">
          <summary>So bekommst du eine Application-ID (2 Minuten)</summary>
          <ol>
            <li>Im <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">Discord Developer Portal</a> auf „New Application“ klicken.</li>
            <li>Als Namen z. B. „CleanMusic“ wählen – genau der erscheint als „Hört CleanMusic“.</li>
            <li>Unter „General Information“ die <strong>Application ID</strong> kopieren, hier einfügen, Speichern.</li>
            <li>Optional: unter „Rich Presence → Art Assets“ ein Bild namens <code>logo</code> hochladen.</li>
          </ol>
        </details>
      </div>`;
  }

  /* ---------------------------------------------------------------- *
   * Plugins
   * ---------------------------------------------------------------- */

  function applyPluginList(result) {
    if (!result) return;
    state.plugins.list = Array.isArray(result.plugins) ? result.plugins : [];
    state.plugins.dirs = Array.isArray(result.dirs) ? result.dirs : [];
    state.plugins.loaded = true;
  }

  async function refreshPlugins(refresh = false) {
    state.plugins.loading = true;
    renderSettings();

    try {
      applyPluginList(await bridge.pluginsList(refresh));
    } catch {
      /* keep the last known list */
    }

    state.plugins.loading = false;
    onPluginsChanged();
  }

  async function handlePluginImport(result) {
    if (!result || result.canceled) return;
    if (result.error) {
      toast(result.error);
      return;
    }
    if (result.ok) {
      await refreshPlugins(true);
      toast(`Plugin-Datei „${result.name}“ hinzugefügt – es bleibt ausgeschaltet`);
    }
  }

  function onPluginsChanged() {
    renderSettings();
    buildHome();
    renderSearchShell();
    renderSearchResults();
    renderFavorites();
    if (state.currentPlaylist) renderPlaylist();
    if (searchPlugin() && state.query && state.pluginSearch.query !== state.query) {
      fetchPluginSearch(state.query);
    }
    scheduleRecsRefresh(400);
  }

  async function setPluginEnabled(id, enabled, options = {}) {
    const plugin = pluginById(id);
    if (!plugin) return;

    if (enabled && !options.skipConfirm) {
      const ok = await askConfirm({
        title: `Plugin „${plugin.name}“ aktivieren?`,
        text:
          `${plugin.file}\n\n` +
          'Plugins sind nicht Teil von CleanMusic und laufen mit vollen Rechten auf deinem PC. ' +
          'Aktiviere nur Dateien aus einer Quelle, der du vertraust. Was ein Plugin tut und ob ' +
          'das bei den jeweiligen Diensten erlaubt ist, liegt in deiner Verantwortung.',
        confirm: 'Aktivieren',
      });
      if (!ok) {
        renderSettings();
        return;
      }
    }

    state.plugins.loading = true;
    renderSettings();
    try {
      applyPluginList(await bridge.pluginSetEnabled(id, enabled));
    } catch (error) {
      toast(error.message);
    }
    state.plugins.loading = false;
    onPluginsChanged();

    const now = pluginById(id);
    if (!enabled) {
      toast(`Plugin „${plugin.name}“ aus`);
    } else if (now && now.error) {
      toast(`Plugin-Fehler: ${now.error}`);
    } else if (isPluginReady(now)) {
      toast(`Plugin „${now.name}“ aktiv`);
    } else if (now) {
      toast(`Plugin „${now.name}“ geladen – ${now.status ? now.status.text : 'noch nicht bereit'}`);
    }
  }

  async function runPluginAction(id, actionId) {
    state.plugins.loading = true;
    renderSettings();

    let result = null;
    try {
      result = await bridge.pluginAction(id, actionId);
      applyPluginList(result);
    } catch (error) {
      result = { error: error.message };
    }

    state.plugins.loading = false;
    onPluginsChanged();
    if (result && result.error) toast(result.error);
    else if (result && result.message) toast(result.message);
  }

  /* ---------------------------------------------------------------- *
   * Settings
   * ---------------------------------------------------------------- */

  function pluginSettingsForm(plugin) {
    const settings = plugin.settings;
    if (!plugin.enabled || !plugin.loaded || !settings || !Array.isArray(settings.fields) || !settings.fields.length) {
      return '';
    }
    const values = settings.values || {};
    const rows = settings.fields
      .map((field) => {
        const id = `ps-${plugin.id}-${field.id}`;
        const data = `data-plugin-setting="${esc(plugin.id)}" data-field="${esc(field.id)}" data-type="${esc(field.type)}"`;
        const value = values[field.id];
        const help = field.help ? `<small>${esc(field.help)}</small>` : '';
        if (field.type === 'toggle') {
          return `
            <label class="toggle-row ps-row">
              <span><strong>${esc(field.label)}</strong>${help}</span>
              <input type="checkbox" id="${id}" ${data} ${value ? 'checked' : ''} />
            </label>`;
        }
        let control;
        if (field.type === 'select') {
          control = `<select id="${id}" ${data}>${field.options
            .map(
              (option) =>
                `<option value="${esc(option.value)}" ${option.value === value ? 'selected' : ''}>${esc(option.label)}</option>`
            )
            .join('')}</select>`;
        } else if (field.type === 'number') {
          control = `<input type="number" id="${id}" ${data} value="${esc(value)}"${
            field.min != null ? ` min="${field.min}"` : ''
          }${field.max != null ? ` max="${field.max}"` : ''} />`;
        } else if (field.type === 'folder') {
          control = `<span class="ps-folder">
              <input type="text" id="${id}" ${data} value="${esc(value)}" placeholder="${esc(field.placeholder)}" spellcheck="false" />
              <button class="btn ghost small" data-plugin-folder="${esc(plugin.id)}" data-field="${esc(field.id)}">Ordner …</button>
            </span>`;
        } else {
          control = `<input type="text" id="${id}" ${data} value="${esc(value)}" placeholder="${esc(field.placeholder)}" spellcheck="false" />`;
        }
        return `
          <div class="ps-row">
            <label for="${id}"><strong>${esc(field.label)}</strong>${help}</label>
            ${control}
          </div>`;
      })
      .join('');
    return `<div class="plugin-settings"><div class="ps-title">Einstellungen</div>${rows}</div>`;
  }

  async function savePluginSetting(id, field, value) {
    try {
      const result = await bridge.pluginSettingsSet(id, { [field]: value });
      if (result && result.error) toast(`Plugin-Einstellung: ${result.error}`);
      applyPluginList(result);
    } catch (error) {
      toast(`Plugin-Einstellung: ${error.message}`);
    }
    renderSettings();
  }

  function pluginCard(plugin) {
    const status = plugin.status;
    const ready = isPluginReady(plugin);
    const busy = state.plugins.loading;
    let line = '';

    if (plugin.error) {
      line = `<span class="status-chip warn"><i></i>Fehler</span><span class="plugin-detail">${esc(plugin.error)}</span>`;
    } else if (plugin.enabled && status) {
      line = `<span class="status-chip ${ready ? 'ok' : 'warn'}"><i></i>${esc(
        status.text || (ready ? 'Bereit' : 'Nicht bereit')
      )}</span>${
        status.detail
          ? `<span class="plugin-detail" title="${esc(status.detail)}">${esc(status.detail)}</span>`
          : ''
      }`;
    } else if (plugin.enabled && !plugin.loaded) {
      line = '<span class="status-chip"><i></i>Wird geladen …</span>';
    }

    const flags = (status && status.flags) || {};
    const actions =
      plugin.enabled && plugin.loaded
        ? plugin.actions
            .filter((action) => !action.when || flags[action.when])
            .map(
              (action) =>
                `<button class="btn ghost small" data-plugin-id="${esc(plugin.id)}" data-plugin-action="${esc(
                  action.id
                )}" ${busy ? 'disabled' : ''}>${esc(action.label)}</button>`
            )
            .concat(
              plugin.links.map(
                (link) =>
                  `<a class="btn ghost small" href="${esc(link.url)}" target="_blank" rel="noreferrer">${esc(
                    link.label
                  )} ↗</a>`
              )
            )
            .join('')
        : '';

    return `
      <div class="plugin-card ${plugin.enabled ? 'on' : ''}">
        <label class="toggle-row">
          <span>
            <strong>${esc(plugin.name)}${
              plugin.version ? ` <span class="plugin-version">${esc(plugin.version)}</span>` : ''
            }</strong>
            ${plugin.description ? `<small>${esc(plugin.description)}</small>` : ''}
            <small class="plugin-file" title="${esc(plugin.file)}">${esc(plugin.file)}</small>
          </span>
          <input type="checkbox" data-plugin-toggle="${esc(plugin.id)}" ${plugin.enabled ? 'checked' : ''} ${
            busy ? 'disabled' : ''
          } />
        </label>
        ${line ? `<div class="plugin-status">${line}</div>` : ''}
        ${actions ? `<div class="row">${actions}</div>` : ''}
        ${pluginSettingsForm(plugin)}
        ${plugin.enabled && plugin.help ? `<p class="muted small plugin-help">${esc(plugin.help)}</p>` : ''}
        ${plugin.enabled && plugin.notice ? `<p class="muted small plugin-notice">${esc(plugin.notice)}</p>` : ''}
      </div>`;
  }

  function pluginPanel() {
    const list = state.plugins.list;
    const dirs = state.plugins.dirs;
    const fullPlugin = matchPlugin();

    return `
      <div class="panel" id="plugins-panel">
        <h3>Plugins <span class="tag">optional</span></h3>
        <p>
          CleanMusic bringt keine Plugins mit. Füge eine vertrauenswürdige <code>.js</code>-Datei hinzu
          oder zieh sie auf diesen Bereich. Neue Plugins bleiben ausgeschaltet, bis du sie bewusst
          aktivierst. Plugins laufen mit vollen Rechten.
        </p>
        <div class="row">
          <button class="btn primary small" data-plugin-global="add">${ICONS.plus} Plugin-Datei hinzufügen …</button>
          <button class="btn ghost small" data-plugin-global="open">${ICONS.folder} Plugin-Ordner öffnen</button>
          <button class="btn ghost small" data-plugin-global="refresh" ${
            state.plugins.loading ? 'disabled' : ''
          }>${ICONS.refresh} Neu einlesen</button>
        </div>
        ${
          dirs.length
            ? `<p class="muted small plugin-dirs">Ordner: ${dirs
                .map((dir) => `<code>${esc(dir)}</code>`)
                .join(' · ')}</p>`
            : ''
        }
        <div class="plugin-list">
          ${
            list.length
              ? list.map(pluginCard).join('')
              : `<p class="muted small">${
                  state.plugins.loaded ? 'Keine Plugins gefunden.' : 'Plugins werden gesucht …'
                }</p>`
          }
        </div>
        ${
          fullPlugin
            ? `<label class="toggle-row" style="margin-top:14px">
                <span>
                  <strong>Vorschauen als volle Titel abspielen</strong>
                  <small>Apple-Music- und Deezer-Treffer werden über „${esc(fullPlugin.name)}“ mit ${esc(
                    fullPlugin.source.label
                  )} abgeglichen. Klappt das nicht, läuft die 30-s-Vorschau.</small>
                </span>
                <input type="checkbox" id="opt-full-tracks" ${
                  state.settings.fullTracks !== false ? 'checked' : ''
                } />
              </label>`
            : ''
        }
      </div>`;
  }

  function renderSettings() {
    const host = $('#view-settings');
    if (!host) return;

    const info = state.info || {};
    const widevine = info.widevine;

    const facts = [
      ['CleanMusic', info.version || '–'],
      ['Electron', info.electron || '–'],
      ['Chromium', info.chrome || '–'],
      ['Plattform', info.platform || '–'],
      ['Widevine', widevine ? `${widevine.version}` : 'nicht gefunden'],
      ['Plugins', `${readyPlugins().length} aktiv · ${state.plugins.list.length} gefunden`],
    ];

    host.innerHTML = `
      <div class="page narrow">
        <div class="page-head">
          <div>
            <div class="eyebrow">Einstellungen</div>
            <h2>Einrichten</h2>
            <p>Wiedergabe, Plugins, MusicKit und gespeicherte Dienst-Sessions.</p>
          </div>
        </div>

        <div class="panel">
          <h3>Wiedergabe</h3>
          <label class="toggle-row">
            <span>
              <strong>Dienste im System-Browser öffnen</strong>
              <small>Standard: eingebetteter Web-Player direkt in CleanMusic.</small>
            </span>
            <input type="checkbox" id="opt-system" ${state.settings.systemBrowser ? 'checked' : ''} />
          </label>
          <label class="toggle-row">
            <span>
              <strong>Autoplay</strong>
              <small>Nach einem einzelnen Titel aus der Suche laufen passende Vorschläge weiter. Von dir Eingereihtes kommt immer zuerst.</small>
            </span>
            <input type="checkbox" id="opt-autoplay" ${autoplayOn() ? 'checked' : ''} />
          </label>
          <label class="toggle-row">
            <span>
              <strong>Beim Schließen im Infobereich weiterlaufen</strong>
              <small>Das X versteckt CleanMusic nur, die Musik läuft weiter. Beenden über das Symbol im Infobereich.</small>
            </span>
            <input type="checkbox" id="opt-tray" ${state.closeToTray ? 'checked' : ''} />
          </label>
          <label class="toggle-row">
            <span>
              <strong>Lautstärke angleichen</strong>
              <small>Gleicht laute und leise Titel sanft an, damit du nicht ständig nachregeln musst.</small>
            </span>
            <input type="checkbox" id="opt-normalize" ${state.settings.normalize ? 'checked' : ''} />
          </label>
          <label class="toggle-row">
            <span>
              <strong>Boost bis 150 %</strong>
              <small>Für leise Quellen. Ein Limiter verhindert Übersteuern. Mausrad, M und +/− regeln überall.</small>
            </span>
            <input type="checkbox" id="opt-boost" ${state.settings.volumeBoost ? 'checked' : ''} />
          </label>
          <div class="tone-row">
            <div class="tone-head">
              <strong>Klang</strong>
              <small>Bass und Höhen anheben oder absenken. 0 dB = unverändert.</small>
            </div>
            <label class="tone-control">
              <span>Bass</span>
              <input type="range" id="opt-bass" min="-6" max="9" step="1" value="${Number(state.settings.bass) || 0}" />
              <output id="opt-bass-value">${toneLabel(state.settings.bass)}</output>
            </label>
            <label class="tone-control">
              <span>Höhen</span>
              <input type="range" id="opt-treble" min="-6" max="6" step="1" value="${Number(state.settings.treble) || 0}" />
              <output id="opt-treble-value">${toneLabel(state.settings.treble)}</output>
            </label>
            <div class="row tone-presets">
              <button class="radio-tag" data-tone-preset="0,0">Neutral</button>
              <button class="radio-tag" data-tone-preset="5,0">Mehr Bass</button>
              <button class="radio-tag" data-tone-preset="-2,4">Stimme klar</button>
              <button class="radio-tag" data-tone-preset="4,3">Laptop-Lautsprecher</button>
            </div>
          </div>
        </div>

        ${themePanel()}

        ${visualizerPanel()}

        ${downloadsPanel()}

        ${pluginPanel()}

        ${discordPanel()}

        <div class="panel">
          <h3>Apple Music · MusicKit</h3>
          <p>
            Apple Music ist der einzige große Dienst, der Dritten offizielle
            In-App-Wiedergabe erlaubt. Dafür brauchst du einen MusicKit-Developer-Token
            aus deinem Apple-Developer-Account.
          </p>
          <div class="row">
            <button class="btn primary" id="btn-musickit">MusicKit-Fenster öffnen</button>
            <a class="btn ghost" href="https://developer.apple.com/musickit/" target="_blank" rel="noreferrer">Apple-Doku</a>
          </div>
          <p class="muted small" style="margin-top:10px">
            Hinweis: MusicKit braucht ein Apple-Music-Abo und funktioniert nur,
            wenn Widevine geladen ist.
          </p>
        </div>

        <div class="panel">
          <h3>System</h3>
          <dl class="facts">
            ${facts.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}
          </dl>
          <div class="row" style="margin-top:12px">
            <button class="btn ghost small" data-onboarding="open">Erste Schritte erneut zeigen</button>
            <button class="btn ghost small" data-shortcuts="open">Tastenkürzel</button>
          </div>
        </div>

${updatePanel()}

        <div class="panel" id="backup-panel">
          <h3>Sichern & Wiederherstellen</h3>
          <p>
            Favoriten, Playlists, Video-Credits, Hör-Verlauf und Aussehen als JSON-Datei – zum
            Umziehen auf einen anderen PC oder als Sicherung. Wiederherstellen ergänzt nur, es wird
            nichts gelöscht.
          </p>
          <div class="row">
            <button class="btn primary small" data-backup="export">Daten sichern …</button>
            <button class="btn ghost small" data-backup="import">Backup wiederherstellen …</button>
          </div>
        </div>

        <div class="panel">
          <h3>Dienst-Daten</h3>
          <p>Meldet einen Dienst ab und löscht dessen lokale Web-Session.</p>
          <div class="chips">
            ${SERVICES.map(
              (service) => `<button class="chip danger" data-clear="${service.id}">${esc(service.name)} zurücksetzen</button>`
            ).join('')}
          </div>
        </div>

        <div class="legal-note">
          CleanMusic selbst umgeht keinen Kopierschutz. Die eingebetteten Player sind die offiziellen
          Web-Angebote der jeweiligen Anbieter – es gelten deren Nutzungsbedingungen. Plugins
          sind nicht Teil von CleanMusic: Sie sind optional, standardmäßig aus und laufen auf deine
          Verantwortung – ein Plugin kann Dienste auf eine Weise nutzen, die deren Bedingungen nicht
          erlauben. Für die Veröffentlichung einer eigenen App brauchst du bei den meisten Diensten
          eine Freigabe.
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------------- *
   * Navigation
   * ---------------------------------------------------------------- */

  function showView(name) {
    if (name === 'service' && !state.currentService) name = 'home';
    if (name === 'playlist' && !playlistById(state.currentPlaylist)) name = 'favorites';
    state.view = name;
    hideMenus();

    $$('.view').forEach((view) => {
      view.classList.toggle('active', view.id === `view-${name}`);
    });

    $$('#sidebar .nav-item').forEach((button) => {
      const active =
        (button.dataset.view && button.dataset.view === name) ||
        (name === 'service' && button.dataset.service === state.currentService) ||
        (name === 'playlist' && button.dataset.playlist === state.currentPlaylist);
      button.classList.toggle('active', Boolean(active));
    });

    const host = $('#service-host');
    host.classList.toggle('active', name === 'service');
    setActiveService(name === 'service' ? state.currentService : null);

    if (name === 'search') {
      renderSearchResults();
      if (!state.charts.loaded) loadCharts();
    }

    if (name === 'radio') {
      renderRadioGrid();
      if (!state.radio.loaded && !state.radio.loading) loadRadio({});
    }

    if (name === 'home' || name === 'favorites') loadRecs(false);

    if (name === 'creator') {
      renderCreator();
      loadCreator();
    }

    if (name !== 'service') showLoading(false);

    updatePlayingHighlights();
    updateExternalButton();
  }

  function focusSearch() {
    const input = $('#global-search');
    input.focus();
    input.select();
  }

  function updateExternalButton() {
    const button = $('#btn-open-external');
    const service = serviceById(state.currentService);
    button.disabled = !service;
    button.textContent = service ? `Im Browser · ${service.name}` : 'Im Browser';
  }

  /* ---------------------------------------------------------------- *
   * Drag & drop
   * ---------------------------------------------------------------- */

  function clearDropMarks() {
    $$('.drop-target, .drop-before, .drop-after').forEach((el) => {
      el.classList.remove('drop-target', 'drop-before', 'drop-after');
    });
  }

  function handleDrop(target, entry) {
    if (!entry) return;

    if (target === 'favorites') {
      if (favIds.has(entry.id)) toast(`„${entry.title}“ ist schon in deinen Favoriten`);
      else toggleFavorite(entry);
      return;
    }

    if (target === 'new') {
      promptNewPlaylist([entry]);
      return;
    }

    if (target.startsWith('playlist:')) addToPlaylist(target.slice(9), [entry]);
  }

  function wireDragAndDrop() {
    document.addEventListener(
      'dragstart',
      (event) => {
        const file = event.target.closest && event.target.closest('[data-dl-file]');
        if (!file || !bridge.cuttingDrag) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        bridge.cuttingDrag(file.dataset.dlFile);
      },
      true
    );

    document.addEventListener('dragstart', (event) => {
      const row = event.target.closest && event.target.closest('[data-list][data-index]');
      if (!row) return;

      const entry = entryAt(row.dataset.list, Number(row.dataset.index));
      if (!entry) {
        event.preventDefault();
        return;
      }

      drag = { list: row.dataset.list, index: Number(row.dataset.index), entry };
      event.dataTransfer.effectAllowed = 'copyMove';
      event.dataTransfer.setData('text/plain', `${entry.artist ? `${entry.artist} – ` : ''}${entry.title}`);
      row.classList.add('dragging');
      document.body.classList.add('is-dragging');
      hideMenus();
    });

    document.addEventListener('dragend', () => {
      $$('.dragging').forEach((el) => el.classList.remove('dragging'));
      document.body.classList.remove('is-dragging');
      clearDropMarks();
      drag = null;
    });

    // Files dropped anywhere else must not be opened by the browser engine.
    const isFileDrag = (event) =>
      Array.from((event.dataTransfer && event.dataTransfer.types) || []).includes('Files');
    document.addEventListener('dragover', (event) => {
      if (!isFileDrag(event) || event.defaultPrevented) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'none';
    });
    document.addEventListener('drop', (event) => {
      if (isFileDrag(event) && !event.defaultPrevented) event.preventDefault();
    });

    const settingsView = $('#view-settings');
    const hasFiles = (event) => Array.from((event.dataTransfer && event.dataTransfer.types) || []).includes('Files');
    settingsView.addEventListener('dragover', (event) => {
      const pluginPanel = event.target.closest('#plugins-panel');
      if (!pluginPanel || !hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      pluginPanel.classList.add('file-drop-active');
    });
    settingsView.addEventListener('dragleave', (event) => {
      const pluginPanel = event.target.closest('#plugins-panel');
      if (!pluginPanel) return;
      if (!pluginPanel.contains(event.relatedTarget)) pluginPanel.classList.remove('file-drop-active');
    });
    settingsView.addEventListener('drop', async (event) => {
      const pluginPanel = event.target.closest('#plugins-panel');
      if (!pluginPanel || !hasFiles(event)) return;
      event.preventDefault();
      event.stopPropagation();
      pluginPanel.classList.remove('file-drop-active');
      const file = Array.from(event.dataTransfer.files || []).find((entry) => /\.js$/i.test(entry.name));
      if (!file) {
        toast('Zieh eine .js-Datei auf den Plugin-Bereich.');
        return;
      }
      await handlePluginImport(await bridge.pluginImportDropped(file));
    });

    const sidebar = $('#sidebar');

    sidebar.addEventListener('dragover', (event) => {
      const target = event.target.closest('[data-drop]');
      if (!target || !drag) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      if (!target.classList.contains('drop-target')) {
        clearDropMarks();
        target.classList.add('drop-target');
      }
    });

    sidebar.addEventListener('dragleave', (event) => {
      const target = event.target.closest('[data-drop]');
      if (target && !target.contains(event.relatedTarget)) target.classList.remove('drop-target');
    });

    sidebar.addEventListener('drop', (event) => {
      const target = event.target.closest('[data-drop]');
      if (!target || !drag) return;
      event.preventDefault();
      const entry = drag.entry;
      clearDropMarks();
      handleDrop(target.dataset.drop, entry);
    });

    const playlistView = $('#view-playlist');

    const reorderTarget = (event) => {
      if (!drag || drag.list !== `playlist:${state.currentPlaylist}`) return null;
      const row = event.target.closest('.song-row[data-index]');
      if (!row) return null;
      const rect = row.getBoundingClientRect();
      return { row, after: event.clientY > rect.top + rect.height / 2 };
    };

    playlistView.addEventListener('dragover', (event) => {
      const target = reorderTarget(event);
      if (!target) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      clearDropMarks();
      target.row.classList.add(target.after ? 'drop-after' : 'drop-before');
    });

    playlistView.addEventListener('drop', (event) => {
      const target = reorderTarget(event);
      if (!target) return;
      event.preventDefault();

      const from = drag.index;
      let to = Number(target.row.dataset.index) + (target.after ? 1 : 0);
      if (from < to) to -= 1;
      clearDropMarks();
      movePlaylistItem(state.currentPlaylist, from, to);
    });
  }

  /* ---------------------------------------------------------------- *
   * Wire global UI
   * ---------------------------------------------------------------- */

  function onRowClick(event) {
    const row = event.target.closest('[data-list][data-index]');
    if (!row) return;

    event.stopPropagation();
    if (event.target.closest('.drag-handle')) return;

    const key = row.dataset.list;
    const index = Number(row.dataset.index);
    const entry = entryAt(key, index);
    if (!entry) return;

    const act = event.target.closest('[data-act]');
    const action = act && row.contains(act) ? act.dataset.act : 'play';
    if (action !== 'add' && action !== 'services') hideMenus();

    switch (action) {
      case 'fav':
        toggleFavorite(entry);
        return;
      case 'add':
        event.preventDefault();
        openAddMenu(act, [entry]);
        return;
      case 'services':
        event.preventDefault();
        openServiceMenu(act, entry);
        return;
      case 'link':
        bridge.openExternal(entry.link);
        return;
      case 'credit':
        collectCredit(entry);
        return;
      case 'download':
        downloadEntry(entry);
        return;
      case 'reveal':
        revealDownload(entry);
        return;
      case 'remove':
        if (key.startsWith('playlist:')) removeFromPlaylist(key.slice(9), index);
        return;
      default:
        playList(key, index);
    }
  }

  function wireGlobal() {
    const search = $('#global-search');
    const content = $('#content');

    search.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        const query = search.value.trim();
        buildSearch(query);
        showView('search');
      }
    });

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        focusSearch();
      }
      if (event.key === 'Escape') {
        hideServiceBanner();
        hideMenus();
      }
    });

    // Every row/card in every list: play, ♥, +, services, link, remove.
    content.addEventListener('click', onRowClick, true);

    content.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const row = event.target.closest('[data-list][data-index]');
      if (!row || event.target !== row) return;
      event.preventDefault();
      playList(row.dataset.list, Number(row.dataset.index));
    });

    content.addEventListener('mouseover', onRowHover);
    content.addEventListener('scroll', hideMenus, true);
    window.addEventListener('resize', hideMenus);

    $('#sidebar').addEventListener('click', (event) => {
      if (event.target.closest('#btn-spotify-import')) {
        openPlaylistImportDialog();
        return;
      }
      if (event.target.closest('#btn-new-playlist')) {
        promptNewPlaylist();
        return;
      }

      const playlist = event.target.closest('[data-playlist]');
      if (playlist) {
        openPlaylist(playlist.dataset.playlist);
        return;
      }

      const view = event.target.closest('.nav-item[data-view]');
      if (view) {
        showView(view.dataset.view);
        return;
      }

      const service = event.target.closest('[data-service]');
      if (service) openService(service.dataset.service);
    });

    $('#btn-open-external').addEventListener('click', () => {
      if (state.currentService) openExternalService(state.currentService);
    });

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="http"]');
      if (link) {
        event.preventDefault();
        bridge.openExternal(link.href);
      }
    });

    // Popover menus.
    document.addEventListener('click', (event) => {
      const serviceItem = event.target.closest('[data-menu-service]');
      if (serviceItem) {
        const entry = serviceMenuEntry;
        hideMenus();
        if (entry) {
          openService(serviceItem.dataset.menuService, {
            query: `${entry.title} ${entry.artist || ''}`.trim(),
          });
        }
        return;
      }

      const sleepItem = event.target.closest('[data-sleep]');
      if (sleepItem) {
        hideMenus();
        setSleepTimer(sleepItem.dataset.sleep);
        return;
      }

      const queueItem = event.target.closest('[data-ctx-queue]');
      if (queueItem) {
        const entries = ctxEntries;
        hideMenus();
        enqueue(entries, queueItem.dataset.ctxQueue);
        return;
      }

      const playlistItem = event.target.closest('[data-ctx-playlist]');
      if (playlistItem) {
        const entries = ctxEntries;
        hideMenus();
        addToPlaylist(playlistItem.dataset.ctxPlaylist, entries);
        return;
      }

      if (event.target.closest('[data-ctx-new]')) {
        const entries = ctxEntries;
        hideMenus();
        promptNewPlaylist(entries);
        return;
      }

      if (!event.target.closest('.service-menu')) hideMenus();
    });

    $('#view-home').addEventListener('click', (event) => {
      const action = event.target.closest('[data-home-action]');
      if (action) {
        switch (action.dataset.homeAction) {
          case 'search':
            focusSearch();
            return;
          case 'add-folder':
            addFolder();
            return;
          case 'musickit':
            bridge.openMusickit();
            return;
          case 'radio':
            showView('radio');
            return;
          case 'favorites':
            showView('favorites');
            return;
          case 'creator':
            showView('creator');
            return;
          case 'settings':
            showView('settings');
            return;
          case 'refresh':
            if (state.trend === 'releases') loadReleases(true);
            else if (state.trend === 'plugin') loadPluginCharts(true);
            else loadCharts(true);
            return;
          case 'trend-charts':
          case 'trend-releases':
          case 'trend-plugin':
            state.trend = action.dataset.homeAction.slice(6);
            renderHomeCharts();
            return;
          case 'recs':
            loadRecs(true);
            return;
          case 'open-local':
            showView('local');
            return;
          default:
            return;
        }
      }

      const open = event.target.closest('[data-open]');
      if (open) return openService(open.dataset.open);

      const external = event.target.closest('[data-external]');
      if (external) return openExternalService(external.dataset.external);
    });

    $('#view-search').addEventListener('click', (event) => {
      if (event.target.closest('#btn-refresh-search')) {
        const term = state.search.query || state.query;
        fetchCatalog(term);
        if (searchPlugin()) fetchPluginSearch(term);
        return;
      }

      if (event.target.closest('[data-home-action="refresh"]')) {
        loadCharts(true);
        return;
      }

      if (event.target.closest('#btn-musickit-search')) {
        bridge.openMusickit();
        return;
      }

      if (event.target.closest('[data-search-action="plugins"]')) {
        showView('settings');
        const panel = $('#plugins-panel');
        if (panel) panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
        return;
      }

      const target = event.target.closest('[data-search-service]');
      if (target) {
        const query = state.search.query || state.query;
        openService(target.dataset.searchService, query ? { query } : {});
      }
    });

    $('#view-favorites').addEventListener('click', (event) => {
      const filter = event.target.closest('[data-fav-filter]');
      if (filter) {
        state.favFilter = filter.dataset.favFilter;
        renderFavorites();
        updatePlayingHighlights();
        return;
      }

      const action = event.target.closest('[data-fav-action]');
      if (!action) return;

      switch (action.dataset.favAction) {
        case 'play':
          playList('favorites', 0);
          return;
        case 'shuffle':
          playListShuffled('favorites');
          return;
        case 'add-all':
          event.stopPropagation();
          openAddMenu(action, filteredFavorites().slice());
          return;
        case 'recs':
          loadRecs(true);
          return;
        case 'search':
          focusSearch();
          return;
        case 'spotify-import':
          openPlaylistImportDialog();
          return;
        default:
      }
    });

    $('#view-playlist').addEventListener('click', (event) => {
      const action = event.target.closest('[data-pl-action]');
      if (!action || !state.currentPlaylist) return;
      const key = `playlist:${state.currentPlaylist}`;

      switch (action.dataset.plAction) {
        case 'play':
          playList(key, 0);
          return;
        case 'shuffle':
          playListShuffled(key);
          return;
        case 'rename':
          renamePlaylist(state.currentPlaylist);
          return;
        case 'delete':
          deletePlaylist(state.currentPlaylist);
          return;
        case 'search':
          focusSearch();
          return;
        default:
      }
    });

    $('#view-radio').addEventListener('click', (event) => {
      const tag = event.target.closest('[data-radio-tag]');
      if (tag) {
        $$('#radio-tags .radio-tag').forEach((chip) => {
          chip.classList.toggle('active', chip === tag);
        });
        const input = $('#radio-search-input');
        if (input) input.value = '';
        loadRadio({ tag: tag.dataset.radioTag, query: '' });
        return;
      }

      if (event.target.closest('#btn-radio-search')) {
        const input = $('#radio-search-input');
        const query = input ? input.value.trim() : '';
        $$('#radio-tags .radio-tag').forEach((chip) => {
          chip.classList.toggle('active', chip.dataset.radioTag === '');
        });
        loadRadio({ query, tag: '' });
        return;
      }

      if (event.target.closest('#btn-radio-retry')) {
        loadRadio({ force: true });
      }
    });

    $('#view-radio').addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.target.id !== 'radio-search-input') return;

      const query = event.target.value.trim();
      $$('#radio-tags .radio-tag').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.radioTag === '');
      });
      loadRadio({ query, tag: '' });
    });

    $('#view-local').addEventListener('click', (event) => {
      if (event.target.closest('#btn-add-folder') || event.target.closest('#btn-empty-add')) {
        addFolder();
        return;
      }
      if (event.target.closest('#btn-clear-lib')) {
        clearLibrary();
        return;
      }
      if (event.target.closest('[data-local-action="shuffle"]')) playListShuffled('local');
    });

    $('#view-settings').addEventListener('click', async (event) => {
      if (event.target.closest('#btn-musickit')) {
        bridge.openMusickit();
        return;
      }

      if (event.target.closest('[data-onboarding]')) {
        openOnboarding();
        return;
      }
      if (event.target.closest('[data-shortcuts]')) {
        showShortcuts();
        return;
      }

      const updateButton = event.target.closest('[data-update]');
      if (updateButton) {
        onUpdateAction(updateButton.dataset.update);
        return;
      }

      const backup = event.target.closest('[data-backup]');
      if (backup) {
        if (backup.dataset.backup === 'export') exportBackup();
        else importBackup();
        return;
      }

      const tonePreset = event.target.closest('[data-tone-preset]');
      if (tonePreset) {
        const [bass, treble] = tonePreset.dataset.tonePreset.split(',').map(Number);
        setTone(bass, treble);
        toast(`Klang: ${tonePreset.textContent}`);
        return;
      }

      const dlMode = event.target.closest('[data-dl-mode]');
      if (dlMode) {
        state.settings.downloads = dlMode.dataset.dlMode === 'cutting' ? 'cutting' : 'off';
        saveSettings();
        renderSettings();
        refreshDownloadButtons();
        toast(
          state.settings.downloads === 'cutting'
            ? 'Downloads an – nur freie Dateien aus dem Cutter-Modus'
            : 'Downloads aus'
        );
        return;
      }

      const dlAction = event.target.closest('[data-dl-action]');
      if (dlAction) {
        const action = dlAction.dataset.dlAction;
        if (action === 'pick' && bridge.pluginPickFolder) {
          const picked = await bridge.pluginPickFolder();
          if (picked) {
            state.settings.downloadDir = picked;
            saveSettings();
            syncCreatorDownloadFolder();
            renderSettings();
          }
        } else if (action === 'open' && bridge.cuttingOpenFolder) {
          const error = await bridge.cuttingOpenFolder(state.settings.downloadDir);
          if (error) toast(`Ordner konnte nicht geöffnet werden: ${error}`);
        } else if (action === 'reset') {
          state.settings.downloadDir = '';
          saveSettings();
          syncCreatorDownloadFolder();
          renderSettings();
        }
        return;
      }

      const folderButton = event.target.closest('[data-plugin-folder]');
      if (folderButton) {
        const picked = bridge.pluginPickFolder ? await bridge.pluginPickFolder() : null;
        if (picked) savePluginSetting(folderButton.dataset.pluginFolder, folderButton.dataset.field, picked);
        return;
      }

      const themeCard = event.target.closest('[data-theme-id]');
      if (themeCard) {
        setTheme(themeCard.dataset.themeId);
        return;
      }

      const vizStyle = event.target.closest('[data-viz-style]');
      if (vizStyle) {
        setVisualizerStyle(vizStyle.dataset.vizStyle);
        return;
      }

      if (event.target.closest('[data-discord-action="save"]')) {
        const input = $('#discord-client-id');
        saveDiscord({ clientId: input ? input.value : '' });
        return;
      }

      const pluginGlobal = event.target.closest('[data-plugin-global]');
      if (pluginGlobal) {
        if (pluginGlobal.dataset.pluginGlobal === 'open') {
          const result = await bridge.pluginOpenFolder();
          if (result && result.error) toast(`Ordner konnte nicht geöffnet werden: ${result.error}`);
        } else if (pluginGlobal.dataset.pluginGlobal === 'add') {
          await handlePluginImport(await bridge.pluginAddFile());
        } else if (pluginGlobal.dataset.pluginGlobal === 'refresh') {
          refreshPlugins(true);
        }
        return;
      }

      const pluginAction = event.target.closest('[data-plugin-action]');
      if (pluginAction) {
        runPluginAction(pluginAction.dataset.pluginId, pluginAction.dataset.pluginAction);
        return;
      }

      const clear = event.target.closest('[data-clear]');
      if (clear) {
        const service = serviceById(clear.dataset.clear);
        const done = await bridge.clearServiceData(clear.dataset.clear);
        toast(done ? `${service ? service.name : 'Dienst'} zurückgesetzt` : 'Zurücksetzen fehlgeschlagen');
      }
    });

    $('#view-settings').addEventListener('input', (event) => {
      if (event.target.id === 'opt-bass') setTone(Number(event.target.value), undefined);
      else if (event.target.id === 'opt-treble') setTone(undefined, Number(event.target.value));
    });

    $('#view-settings').addEventListener('change', (event) => {
      if (event.target.id === 'opt-system') {
        state.settings.systemBrowser = event.target.checked;
        saveSettings();
        updateStatusChips();
        toast(event.target.checked ? 'Dienste öffnen im System-Browser' : 'Dienste öffnen eingebettet');
        return;
      }

      const pluginSetting = event.target.closest('[data-plugin-setting]');
      if (pluginSetting) {
        const type = pluginSetting.dataset.type;
        const value =
          type === 'toggle' ? pluginSetting.checked : type === 'number' ? Number(pluginSetting.value) : pluginSetting.value;
        savePluginSetting(pluginSetting.dataset.pluginSetting, pluginSetting.dataset.field, value);
        return;
      }

      const pluginToggle = event.target.closest('[data-plugin-toggle]');
      if (pluginToggle) {
        setPluginEnabled(pluginToggle.dataset.pluginToggle, pluginToggle.checked);
        return;
      }

      if (event.target.id === 'opt-viz') {
        setVisualizerEnabled(event.target.checked);
        renderSettings();
        syncFullscreen();
        return;
      }

      if (event.target.id === 'opt-autoplay') {
        setAutoplay(event.target.checked);
        return;
      }

      if (event.target.id === 'opt-update') {
        if (bridge.updateSet) {
          bridge
            .updateSet({ auto: event.target.checked })
            .then(onUpdateState)
            .catch(() => {});
        }
        toast(event.target.checked ? 'Sucht beim Start nach Updates' : 'Keine automatische Update-Suche');
        return;
      }

      if (event.target.id === 'opt-tray') {
        const wanted = event.target.checked;
        (bridge.traySet ? bridge.traySet({ closeToTray: wanted }) : Promise.resolve({ closeToTray: false }))
          .then((result) => {
            state.closeToTray = Boolean(result && result.closeToTray);
            toast(state.closeToTray ? 'Schließen versteckt CleanMusic im Infobereich' : 'Schließen beendet CleanMusic');
          })
          .catch(() => {});
        return;
      }

      if (event.target.id === 'opt-normalize' || event.target.id === 'opt-boost') {
        const boost = event.target.id === 'opt-boost';
        state.settings[boost ? 'volumeBoost' : 'normalize'] = event.target.checked;
        saveSettings();
        if (vol.level > maxVolume()) vol.level = maxVolume();
        applyVolume();
        persistVolume();
        toast(
          boost
            ? event.target.checked
              ? 'Boost an – Lautstärke bis 150 %'
              : 'Boost aus – maximal 100 %'
            : event.target.checked
              ? 'Lautstärke wird angeglichen'
              : 'Lautstärke-Angleichung aus'
        );
        return;
      }

      if (event.target.id === 'opt-cover-accent') {
        state.settings.coverAccent = event.target.checked;
        saveSettings();
        applyAccent();
        toast(event.target.checked ? 'Akzentfarbe folgt dem Cover' : 'Akzentfarbe vom Theme');
        return;
      }

      if (event.target.id === 'opt-mini-viz') {
        state.settings.miniViz = event.target.checked;
        saveSettings();
        applyVisualizerVisibility();
        return;
      }

      if (event.target.id === 'opt-discord') {
        const input = $('#discord-client-id');
        saveDiscord({ enabled: event.target.checked, clientId: input ? input.value : undefined });
        return;
      }

      if (event.target.id === 'opt-discord-art') {
        saveDiscord({ showArtwork: event.target.checked });
        return;
      }

      if (event.target.id === 'opt-full-tracks') {
        state.settings.fullTracks = event.target.checked;
        saveSettings();
        onPluginsChanged();
        toast(event.target.checked ? 'Vorschauen laufen als volle Titel' : 'Vorschauen bleiben 30 Sekunden');
      }
    });

    $('#service-banner').addEventListener('click', (event) => {
      const service = serviceById($('#service-banner').dataset.service);
      if (event.target.closest('[data-banner-close]')) return hideServiceBanner();
      if (event.target.closest('[data-banner-external]') && service) return openExternalService(service.id);
      if (event.target.closest('[data-banner-reload]') && service) {
        const view = state.views.get(service.id);
        if (view) {
          hideServiceBanner();
          Promise.resolve(view.reload()).catch(() => {});
        }
      }
      return undefined;
    });

    $('#view-settings').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.id === 'discord-client-id') {
        event.preventDefault();
        saveDiscord({ clientId: event.target.value });
      }
    });

    // Cutter mode
    $('#view-creator').addEventListener('click', (event) => {
      const creatorService = event.target.closest('[data-creator-service]');
      if (creatorService) {
        openService(creatorService.dataset.creatorService);
        return;
      }

      const aboReveal = event.target.closest('[data-abo-reveal]');
      if (aboReveal && bridge.cuttingReveal) {
        bridge.cuttingReveal(aboReveal.dataset.aboReveal).then((ok) => {
          if (!ok) {
            toast('Datei nicht mehr da.');
            checkCreatorDownloads();
          }
        });
        return;
      }

      const tab = event.target.closest('[data-creator-tab]');
      if (tab) {
        state.creator.tab = tab.dataset.creatorTab;
        renderCreator();
        loadCreator();
        return;
      }

      const category = event.target.closest('[data-creator-cat]');
      if (category) {
        const current = creatorTab();
        state.creator.category[current.id] = category.dataset.creatorCat;
        if (current.search) state.creator.query[current.id] = '';
        renderCreator();
        loadCreator();
        return;
      }

      const remove = event.target.closest('[data-credit-remove]');
      if (remove) {
        state.credits.splice(Number(remove.dataset.creditRemove), 1);
        persistCredits();
        renderCredits();
        return;
      }

      const action = event.target.closest('[data-creator-action]');
      if (!action) return;

      switch (action.dataset.creatorAction) {
        case 'search':
          submitCreatorSearch();
          return;
        case 'more':
          loadCreator({ more: true });
          return;
        case 'retry':
          loadCreator({ force: true });
          return;
        case 'play-all':
          playList('creator', 0);
          return;
        case 'copy-credits':
          copyAllCredits();
          return;
        case 'save-credits':
          saveCredits();
          return;
        case 'clear-credits':
          state.credits = [];
          persistCredits();
          renderCredits();
          return;
        case 'fullscreen':
          openFullscreen();
          return;
        default:
      }
    });

    $('#view-creator').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && event.target.id === 'creator-search-input') {
        event.preventDefault();
        submitCreatorSearch();
      }
    });

    // Fullscreen player
    $('#btn-fullscreen').addEventListener('click', () => toggleFullscreen());
    $('#np-art').addEventListener('dblclick', () => openFullscreen());

    const fullscreen = $('#fullscreen');
    fullscreen.addEventListener('mousemove', fsActivity);
    fullscreen.addEventListener('click', (event) => {
      fsActivity();

      const queued = event.target.closest('[data-fs-queue]');
      if (queued) {
        playFromQueue(Number(queued.dataset.fsQueue));
        return;
      }

      const style = event.target.closest('[data-fs-style]');
      if (style) {
        setVisualizerStyle(style.dataset.fsStyle);
        return;
      }

      const act = event.target.closest('[data-fs-act]');
      if (!act) return;

      switch (act.dataset.fsAct) {
        case 'close':
          closeFullscreen();
          return;
        case 'play':
          $('#btn-play').click();
          return;
        case 'prev':
          $('#btn-prev').click();
          return;
        case 'next':
          $('#btn-next').click();
          return;
        case 'shuffle':
          $('#btn-shuffle').click();
          return;
        case 'repeat':
          $('#btn-repeat').click();
          return;
        case 'fav':
          toggleFavorite(currentItem());
          syncFullscreen();
          return;
        case 'add': {
          event.stopPropagation();
          const item = currentItem();
          if (item) openAddMenu(act, [item]);
          return;
        }
        default:
      }
    });

    $('#fs-seek').addEventListener('input', (event) => {
      const value = Number(event.target.value);
      if (Number.isFinite(value)) audio.currentTime = value;
      updateFsProgress();
    });

    $('#fs-volume').addEventListener('input', (event) => setVolume(Number(event.target.value)));
    $('#fs-volume').addEventListener('wheel', onVolumeWheel, { passive: false });
    $('#fs-mute').addEventListener('click', () => setMuted(!vol.muted));

    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && state.fullscreen) closeFullscreen();
    });

    // Player shortcuts: F everywhere, the rest while the fullscreen player is open.
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (!$('#dialog').hidden) return;
      const typing = event.target.closest && event.target.closest('input, textarea, select, [contenteditable]');
      if (typing && event.target.type !== 'range') return;

      const key = event.key;
      if (key === '?' || key === 'F1') {
        event.preventDefault();
        showShortcuts();
        return;
      }
      if (key === 'f' || key === 'F') {
        event.preventDefault();
        toggleFullscreen();
        return;
      }
      if (key === 'm' || key === 'M') {
        event.preventDefault();
        setMuted(!vol.muted);
        return;
      }
      if (key === '+' || key === '-') {
        event.preventDefault();
        nudgeVolume(key === '+' ? 0.05 : -0.05);
        return;
      }

      if (!state.fullscreen) return;
      fsActivity();

      switch (key) {
        case ' ':
        case 'k':
          event.preventDefault();
          $('#btn-play').click();
          return;
        case 'ArrowRight':
          event.preventDefault();
          if (Number.isFinite(audio.duration)) audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
          return;
        case 'ArrowLeft':
          event.preventDefault();
          if (Number.isFinite(audio.duration)) audio.currentTime = Math.max(0, audio.currentTime - 5);
          return;
        case 'ArrowUp':
        case 'ArrowDown': {
          event.preventDefault();
          nudgeVolume(key === 'ArrowUp' ? 0.05 : -0.05);
          return;
        }
        case 'n':
        case 'N':
          stepQueue(1);
          return;
        case 'p':
        case 'P':
          $('#btn-prev').click();
          return;
        case 'Escape':
          closeFullscreen();
          return;
        default:
      }
    });

    wireDragAndDrop();
  }

  /* ---------------------------------------------------------------- *
   * Boot
   * ---------------------------------------------------------------- */

  function init() {
    applyTheme();
    window.addEventListener('error', (event) => {
      console.error(`Renderer error: ${event.message}`);
    });

    restoreLibrary();
    buildSidebar();
    buildHome();
    buildSearch('');
    buildRadio();
    renderLocal();
    renderFavorites();
    renderSettings();
    wirePlayer();
    wireQueuePanel();
    wireOnboarding();
    wireGlobal();

    // Visualizer: analyses the <audio> element, draws in the player bar
    // and in the fullscreen player; the cover pulses with the bass.
    const viz = window.CMVisualizer;
    viz.attach(audio);
    viz.register($('#mini-viz'), { mini: true });
    viz.register($('#fs-viz'), { style: state.settings.vizStyle, anchor: $('#fs-cover') });
    viz.onFrame((energy) => {
      if (!state.fullscreen) return;
      $('#fs-cover').style.setProperty('--beat', energy.toFixed(3));
    });
    viz.setEnabled(state.settings.visualizer);
    applyVisualizerVisibility();
    applyVolume();

    // Plugins (API v2): player events, commands, messages.
    ['play', 'pause', 'ended', 'seeked', 'loadedmetadata', 'emptied'].forEach((name) =>
      audio.addEventListener(name, () => pushPlayerState())
    );
    audio.addEventListener('timeupdate', () => {
      if (Date.now() - playerStateAt > 10000) pushPlayerState();
      trackListening();
    });
    audio.addEventListener('pause', () => {
      listen.last = 0;
    });
    if (bridge.onPlayerCommand) bridge.onPlayerCommand(onPlayerCommand);
    wireMediaSession();
    if (bridge.onPluginNotify) {
      bridge.onPluginNotify((message) => {
        if (message && message.text) toast(`${message.name}: ${message.text}`);
      });
    }
    if (bridge.onPluginsChanged) bridge.onPluginsChanged(() => refreshPlugins(false));

    if (bridge.onUpdateState) bridge.onUpdateState(onUpdateState);
    if (bridge.updateGet) bridge.updateGet().then(onUpdateState).catch(() => {});
    $('#update-card').addEventListener('click', (event) => {
      const button = event.target.closest('[data-update]');
      if (button) onUpdateAction(button.dataset.update);
    });

    if (bridge.trayGet) {
      bridge
        .trayGet()
        .then((result) => {
          state.closeToTray = Boolean(result && result.closeToTray);
          renderSettings();
        })
        .catch(() => {});
    }

    if (bridge.cuttingDefaultFolder) {
      bridge
        .cuttingDefaultFolder()
        .then((folder) => {
          state.downloadDefault = folder;
          renderSettings();
        })
        .catch(() => {});
    }
    checkDownloads();
    syncCreatorDownloadFolder();
    checkCreatorDownloads();
    if (bridge.onCreatorDownload) bridge.onCreatorDownload(onCreatorDownload);

    bridge.onDiscordStatus((status) => {
      state.discord.status = status || {};
      renderDiscordStatus();
    });
    loadDiscord();

    showView('home');
    setTransportEnabled(false);
    updateNowPlayingActions();
    updateMuteIcon();

    bridge
      .getInfo()
      .then((info) => {
        state.info = info;
        renderSettings();
        updateStatusChips();
        startupGuide();
      })
      .catch(() => {});

    refreshPlugins(false);
  }

  // Small debug surface (also used by the smoke test).
  window.CleanMusic = {
    openService,
    showView,
    search: (query) => buildSearch(query),
    playList,
    openPlaylist,
    toggleFavoriteAt: (key, index) => toggleFavorite(entryAt(key, index)),
    createPlaylist: (name) => createPlaylist(name).id,
    playlistImportDialogSmoke: async () => {
      openPlaylistImportDialog();
      const result = {
        open: !$('#dialog').hidden,
        linkField: Boolean($('#dialog-text #spotify-playlist-link')),
        fileButton: Boolean($('#dialog-text [data-spotify-action="file"]')),
        youtubeDetected: isYouTubePlaylistLink('https://music.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i'),
      };
      if (result.youtubeDetected && !readyPlugins('playlist').length) {
        const input = $('#dialog-text #spotify-playlist-link');
        input.value = 'https://music.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i';
        $('#dialog-text [data-spotify-action="link"]').click();
        result.noPluginMessage = $('#dialog-text .spotify-import-error')?.textContent === YOUTUBE_PLAYLIST_PLUGIN_MESSAGE;
      } else {
        result.noPluginMessage = false;
      }
      $('#dialog-cancel').click();
      return Object.assign(result, { closed: $('#dialog').hidden });
    },
    youtubePlaylistSmoke: async (url = 'https://music.youtube.com/playlist?list=PL4fGSI1pDJn6puJdseH2Rt9sMvt9E2M4i') => {
      const plugin = readyPlugins('playlist')[0];
      if (!plugin) return { available: false };
      const data = await bridge.pluginPlaylist(plugin.id, url);
      if (!data || data.error || !Array.isArray(data.items)) return { available: true, error: data && data.error || 'Playlist konnte nicht geladen werden.' };
      if (!data.items.length) return { available: true, name: data.name || '', count: 0, moreThan20: false, playback: false };
      const imported = importPluginPlaylist(plugin, data);
      const playlist = playlistById(imported.playlistId);
      const first = playlist && playlist.items[0];
      if (first) playList(`playlist:${imported.playlistId}`, 0);
      state.collection.playlists = state.collection.playlists.filter((item) => item.id !== imported.playlistId);
      onCollectionChanged({ playlists: true });
      return {
        available: true,
        name: imported.name,
        count: imported.imported,
        moreThan20: imported.imported > 20,
        firstId: first && first.id || '',
        firstTitle: first && first.title || '',
      };
    },
    importSpotifySmoke: async () => {
      const sample = {
        name: 'Spotify-Import-Smoke',
        tracks: [
          { title: 'One More Time', artist: 'Daft Punk', isrc: 'GBDUW0000059' },
          { title: 'Get Lucky', artist: 'Daft Punk' },
          { title: 'Billie Jean', artist: 'Michael Jackson' },
        ],
      };
      try {
        const result = await importSpotifyPlaylist(sample);
        const playlist = playlistById(result.playlistId);
        const output = { imported: result.imported, requested: result.requested, created: Boolean(playlist) };
        if (playlist) {
          state.collection.playlists = state.collection.playlists.filter((item) => item.id !== playlist.id);
          onCollectionChanged({ playlists: true });
        }
        return Object.assign(output, { deleted: !playlistById(result.playlistId) });
      } catch (error) {
        return { imported: 0, requested: sample.tracks.length, created: false, deleted: true, error: String(error && error.message || error) };
      }
    },
    addToPlaylistAt: (id, key, index) => addToPlaylist(id, [entryAt(key, index)].filter(Boolean)),
    movePlaylistItem,
    loadRecs,
    plugins: () =>
      state.plugins.list.map((plugin) => ({
        id: plugin.id,
        name: plugin.name,
        file: Boolean(plugin.file),
        enabled: plugin.enabled,
        loaded: plugin.loaded,
        ready: isPluginReady(plugin),
        statusText: plugin.status ? plugin.status.text : null,
        error: plugin.error,
      })),
    enablePlugin: (id) => setPluginEnabled(id, true, { skipConfirm: true }),
    openFullscreen,
    closeFullscreen,
    creator: () => {
      const list = creatorList();
      return {
        tab: state.creator.tab,
        category: state.creator.category[state.creator.tab],
        key: creatorKey(),
        items: list ? list.items.length : 0,
        loading: Boolean(list && list.loading),
        error: list ? list.error : null,
        licenses: list ? Array.from(new Set(list.items.map((item) => item.license).filter(Boolean))) : [],
        credits: state.credits.length,
      };
    },
    setCreator: (tab, category) => {
      state.creator.tab = tab;
      if (category) state.creator.category[tab] = category;
      showView('creator');
    },
    collectCreditAt: (key, index) => collectCredit(entryAt(key, index)),
    downloadAt: (key, index) => downloadEntry(entryAt(key, index)),
    creatorServices: { services: () => creatorServices().map((service) => service.id), downloads: () => creatorDownloads.slice() },
    simulateCreatorDownload: (info) => onCreatorDownload(info),
    mediaSession: () =>
      'mediaSession' in navigator && navigator.mediaSession.metadata
        ? {
            title: navigator.mediaSession.metadata.title,
            artist: navigator.mediaSession.metadata.artist,
            artwork: navigator.mediaSession.metadata.artwork.length,
            state: navigator.mediaSession.playbackState,
          }
        : null,
    importBackup: (data) => importBackup(data),
    onboarding: {
      open: () => openOnboarding(),
      state: () => ({
        open: !$('#onboarding').hidden,
        step: onboardingStep,
        title: ($('#onboarding h2') || {}).textContent || '',
        themes: document.querySelectorAll('#onboarding [data-ob-theme]').length,
        options: document.querySelectorAll('#onboarding [data-ob-option]').length,
        onboarded: Boolean(state.settings.onboarded),
        firstRun: FIRST_RUN,
      }),
      click: (selector) => {
        const el = document.querySelector('#onboarding ' + selector);
        if (el) el.click();
        return Boolean(el);
      },
    },
    whatsNew: (version) => showWhatsNew(version),
    shortcuts: () => showShortcuts(),
    queue: () => ({
      index: state.queue.index,
      kind: state.queue.kind,
      upcoming: state.queue.upcoming,
      length: state.queue.items.length,
      current: currentItem() ? currentItem().title : null,
      items: state.queue.items.map((entry) => ({ id: entry.id, title: entry.title, queued: Boolean(entry.queued), autoplay: Boolean(entry.autoplay) })),
      autoplayPending: Boolean(autoplayTask),
    }),
    enqueueAt: (key, index, mode) => enqueue(entryAt(key, index), mode),
    toggleQueue: (open) => toggleQueuePanel(open),
    next: () => stepQueue(1),
    update: () => ({
      info: updateInfo,
      card: !$('#update-card').hidden,
      panel: Boolean($('#update-panel')),
      status: ($('#update-status') || {}).textContent || '',
    }),
    showUpdate: (info) => onUpdateState(info),
    updateChimed: () => chimedFor,
    sleep: (value) => {
      if (value !== undefined) setSleepTimer(value);
      return { label: sleepLabel(), active: $('#btn-sleep').classList.contains('active') };
    },
    creditsText: () => creditsText(),
    history: () => history.map((row) => ({ id: row.entry.id, title: row.entry.title, plays: row.plays, last: row.last })),
    recordPlay: (id, plays = 1, daysAgo = 0) => {
      const entry = [state.charts.tracks, state.collection.favorites, state.releases.tracks]
        .flat()
        .find((item) => item.id === id);
      for (let i = 0; i < plays; i += 1) recordPlay(entry);
      const row = history.find((item) => item.entry.id === id);
      if (row) row.last = Date.now() - daysAgo * DAY;
      writeJSON(STORAGE.history, history);
      renderHomeRediscover();
      return Boolean(row);
    },
    home: () => ({
      trend: state.trend,
      charts: state.charts.tracks.length,
      releases: state.releases.tracks.length,
      releasesError: state.releases.error,
      releaseCards: document.querySelectorAll('#home-charts [data-list="releases"]').length,
      pluginCharts: state.pluginCharts.items.length,
      pluginChartsError: state.pluginCharts.error,
      pluginChartsTab: Boolean(document.querySelector('[data-home-action="trend-plugin"]')),
      rediscover: document.querySelectorAll('#home-rediscover .chart-card').length,
      rediscoverHidden: ($('#home-rediscover-section') || {}).hidden,
      recSeeds: recSeeds().artists.map((artist) => artist.name),
    }),
    setTrend: (trend) => {
      state.trend = ['releases', 'plugin'].includes(trend) ? trend : 'charts';
      renderHomeCharts();
    },
    downloads: () => ({ mode: state.settings.downloads, count: Object.keys(downloads).length }),
    setDownloads: (mode, folder) => {
      state.settings.downloads = mode === 'cutting' ? 'cutting' : 'off';
      state.settings.downloadDir = folder || '';
      saveSettings();
      refreshDownloadButtons();
    },
    playerSnapshot: () => playerSnapshot(),
    requests: () => pendingRequests(),
    songRequest: (value) => songRequest(value),
    theme: () => ({
      id: currentTheme() ? currentTheme().id : null,
      themes: THEMES.map((theme) => theme.id),
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      bg: getComputedStyle(document.body).backgroundColor,
      coverAccent: state.settings.coverAccent,
      cover: state.coverColors || null,
    }),
    setTheme: (id) => setTheme(id),
    volume: () => ({
      level: vol.level,
      muted: vol.muted,
      max: maxVolume(),
      stage: volumeStage(),
      element: Number(audio.volume.toFixed(4)),
      elementMuted: audio.muted,
      engine: window.CMVisualizer.engineState ? window.CMVisualizer.engineState() : null,
      label: ($('#volume-pct') || {}).textContent || '',
    }),
    setVolume: (level) => setVolume(Number(level)),
    setMuted: (muted) => setMuted(muted),
    setTone: (bass, treble) => setTone(Number(bass), Number(treble)),
    visualizer: () => ({
      enabled: window.CMVisualizer.isEnabled(),
      analysing: window.CMVisualizer.isAnalysing(),
      energy: Number(window.CMVisualizer.energy().toFixed(3)),
    }),
    nowPlaying: () => {
      const item = currentItem();
      return item
        ? {
            id: item.id,
            kind: item.kind,
            mode: state.nowMode,
            src: audio.src ? audio.src.slice(0, 60) : '',
            paused: audio.paused,
            time: Number(audio.currentTime.toFixed(2)),
            duration: Number.isFinite(audio.duration) ? Math.round(audio.duration) : null,
          }
        : null;
    },
    state: () => ({
      view: state.view,
      currentService: state.currentService,
      tracks: state.library.tracks.length,
      searchTracks: state.search.tracks.length,
      pluginResults: state.pluginSearch.results.length,
      radioStations: state.radio.stations.length,
      radioError: state.radio.error,
      queueKind: state.queue.kind,
      services: SERVICES.length,
      favorites: state.collection.favorites.length,
      playlists: state.collection.playlists.map((playlist) => ({
        name: playlist.name,
        items: playlist.items.length,
      })),
      recs: state.recs.tracks.length,
      recSeeds: state.recs.seeds,
      plugins: state.plugins.list.length,
      pluginsReady: readyPlugins().length,
    }),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
