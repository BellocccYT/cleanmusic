'use strict';

/* ------------------------------------------------------------------ *
 * CleanMusic – renderer
 * ------------------------------------------------------------------ */

(function () {
  const SERVICES = Array.isArray(window.CM_SERVICES) ? window.CM_SERVICES : [];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  // Pure helpers live in renderer/core/text.js (loaded before this file).
  const CMText = window.CMText;
  if (!CMText) throw new Error('renderer/core/text.js fehlt');
  const {
    esc,
    fmtTime,
    fmtLong,
    fmtSize,
    formatList,
    uid,
    normKey,
    matchKey,
    shuffled,
    primaryArtist,
    todayKey,
    stringSeed,
    seededShuffle,
  } = CMText;

  const CMStorage = window.CMStorage;
  if (!CMStorage) throw new Error('renderer/core/storage.js fehlt');
  const { readJSON, writeJSON } = CMStorage;

  const CMQueue = window.CMQueue;
  if (!CMQueue) throw new Error('renderer/audio/queue.js fehlt');
  const { queueGroup } = CMQueue;

  const CMVolume = window.CMVolume;
  if (!CMVolume) throw new Error('renderer/audio/volume.js fehlt');

  const CMPlayback = window.CMPlayback;
  if (!CMPlayback) throw new Error('renderer/audio/playback.js fehlt');

  const CMQueueSlice = window.CMQueueSlice;
  if (!CMQueueSlice) throw new Error('renderer/audio/queue-slice.js fehlt');

  const CMPersist = window.CMPersist;
  if (!CMPersist) throw new Error('renderer/core/persist.js fehlt');
  const { STORAGE } = CMPersist;

  const CMState = window.CMState;
  if (!CMState) throw new Error('renderer/core/state.js fehlt');

  const CMCollection = window.CMCollection;
  if (!CMCollection) throw new Error('renderer/core/collection.js fehlt');

  const CMStats = window.CMStats;
  if (!CMStats) throw new Error('renderer/core/stats.js fehlt');

  const CMStudio = window.CMStudio || null;

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
    like:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M7 10v10H4V10h3Z"></path><path d="M7 10l4-7c1.4 0 2.4 1 2.4 2.4V9h5.1a2 2 0 0 1 2 2.4l-1.2 6A2.5 2.5 0 0 1 16.8 20H7"></path></svg>',
    dislike:
      '<svg class="ic" viewBox="0 0 24 24"><path d="M7 14V4H4v10h3Z"></path><path d="M7 14l4 7c1.4 0 2.4-1 2.4-2.4V15h5.1a2 2 0 0 0 2-2.4l-1.2-6A2.5 2.5 0 0 0 16.8 4H7"></path></svg>',
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
    'license', 'licenseUrl', 'credit', 'category', 'addedAt', 'ytLicense', 'aiHint',
  ];

  // Smart playlists ("Rezepte"): the rules are stored on the playlist and the
  // items are rebuilt from music that is already on the device. No network.
  // The pure part (rules, filters, interleaving, refresh) lives in
  // renderer/core/recipes.js (window.CMRecipes, tested in test/recipes.test.js).
  const RECIPES = window.CMRecipes;
  const SMART_SOURCES = RECIPES.SOURCES;
  const SMART_DAYS = RECIPES.DAYS;
  const SMART_LIMIT_MIN = RECIPES.LIMIT_MIN;
  const SMART_LIMIT_MAX = RECIPES.LIMIT_MAX;

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
    miniOpen: async () => false,
    taskbarGet: async () => ({ progress: true }),
    taskbarSet: async () => ({ progress: true }),
    shortcutsGet: async () => ({ enabled: false, registered: [] }),
    shortcutsSet: async () => ({ enabled: false, registered: [] }),
    loginGet: async () => ({ enabled: false }),
    loginSet: async () => ({ enabled: false, supported: false }),
    remoteGet: async () => ({ enabled: false, port: 4790, url: '', qr: '' }),
    remoteSet: async () => ({ enabled: false }),
    remoteRotate: async () => ({ enabled: false }),
    diagnosticCopy: async () => '',
    diagnosticError: () => {},
    diagnosticState: () => {},
    backupFolderPick: async () => null,
    backupAutoSave: async () => ({ error: 'Nur in der Desktop-App verfügbar.' }),
    projectCreditsSave: async () => ({ error: 'Nur in der Desktop-App verfügbar.' }),
    savePng: async () => ({ error: 'Nur in der Desktop-App verfügbar.' }),
    copyPng: async () => false,
    liveBgPick: async () => ({ canceled: true }),
    liveBgGet: async () => ({ url: '', kind: '', missing: false }),
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
    taste: loadTaste(),
    queue: { items: [], index: -1, kind: 'local', upcoming: -1 },
    nowMode: null,
    nowLabel: null,
    retry: null,
    favFilter: 'all',
    creator: {
      tab: 'ncs',
      category: { foryou: 'mix', ncs: 'top', classics: 'lustig', sfx: 'whoosh', games: 'retro', free: 'cinematic', youtube: 'gaming' },
      query: { sfx: '', games: '', free: '', youtube: '' },
      tempo: 'all',
      lists: {},
    },
    credits: (readJSON(STORAGE.credits, []) || []).filter(
      (item) => item && typeof item.id === 'string' && typeof item.credit === 'string'
    ),
    discord: { config: { enabled: false, clientId: '', showArtwork: true }, status: {} },
    remote: { enabled: false, port: 4790, requestedPort: 4790, url: '', qr: '', ip: '', error: null },
    globalShortcuts: { enabled: false, registered: [], conflict: null },
    taskbarProgress: true,
    startOnLogin: false,
    fullscreen: false,
    collection: loadCollection(),
    matches: readJSON(STORAGE.matches, {}) || {},
    playback: CMPlayback.normalize(readJSON(STORAGE.playback, {})),
    settings: CMState.normalizeSettings(readJSON(STORAGE.settings, {})),
  };

  // 0.5.0 settings → plugin settings.
  if (state.settings.ytFull === false) state.settings.fullTracks = false;
  delete state.settings.ytFull;
  delete state.settings.ytdlp;

  // Store foundation (2.0 Phase 1): wraps `state` by reference so old reads keep
  // working; new code uses store.set/patch + subscribers (see core/state.js).
  const store = CMState.createStore(state);
  // First slice on the store: all queue list changes (see audio/queue-slice.js).
  const queueSlice = CMQueueSlice.create(store);

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
    syncDiagnosticState();
    store.notify();
  }

  function syncDiagnosticState() {
    if (!bridge.diagnosticState) return;
    const viz = window.CMVisualizer;
    const migration = window.CMMigrations ? window.CMMigrations.report() : null;
    bridge.diagnosticState({
      audioChain: Boolean(viz && typeof viz.hasEngine === 'function' && viz.hasEngine()),
      layout: state.settings.layout,
      schema: migration ? migration.to : 0,
      quarantined: migration && Array.isArray(migration.quarantined) ? migration.quarantined.length : 0,
      migration: migration ? migration.skipped || (migration.ran && migration.ran.length ? 'migriert' : '') : '',
    });
  }

  /* Data safety (2.0 Phase 2): tell the user once per start what
   * core/migrations.js had to do – nothing is said when all is well. */
  function reportMigrations() {
    const report = window.CMMigrations ? window.CMMigrations.report() : null;
    if (!report) return;
    if (report.skipped === 'newer-schema') {
      toast('Deine Daten stammen aus einer neueren CleanMusic-Version. Sie bleiben unverändert – bitte CleanMusic aktualisieren.');
      return;
    }
    if (report.skipped === 'backup-failed') {
      toast('Sicherung vor dem Daten-Update fehlgeschlagen – deine Daten bleiben unverändert. Details: Einstellungen → System → Diagnose.');
    }
    const broken = Array.isArray(report.quarantined) ? report.quarantined : [];
    if (broken.length) {
      const names = formatList(broken.map((item) => item.label));
      toast(`Beschädigte Daten gefunden (${names}). Sie wurden sicher beiseitegelegt; CleanMusic startet mit allem, was lesbar war.`);
    }
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
      aiHint: Boolean(item.aiHint),
      ytLicense: item.license === 'cc-by' ? 'cc-by' : '',
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

  // Licence filter category for a recipe. Plugin-confirmed CC counts as CC BY.
  function licenseCategory(entry) {
    const key = licenseKey(entry && entry.license);
    if (key === 'other' && entry && entry.ytLicense === 'cc-by') return 'by';
    return key;
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

  function normalizeSmartRules(raw) {
    return RECIPES.normalize(raw);
  }

  function loadCollection() {
    const raw = readJSON(STORAGE.collection, null) || {};
    const favorites = Array.isArray(raw.favorites)
      ? raw.favorites.map(migrateEntry).filter(validEntry)
      : [];
    const playlists = Array.isArray(raw.playlists)
      ? raw.playlists
          .filter((playlist) => playlist && typeof playlist.id === 'string')
          .map((playlist) => {
            const entry = {
              id: playlist.id,
              name: String(playlist.name || 'Playlist').slice(0, 80),
              createdAt: Number(playlist.createdAt) || Date.now(),
              updatedAt: Number(playlist.updatedAt) || Date.now(),
              // Preset key ("gaming:safe") when the playlist came from a template.
              preset: typeof playlist.preset === 'string' ? playlist.preset.slice(0, 80) : '',
              items: Array.isArray(playlist.items)
                ? playlist.items.map(migrateEntry).filter(validEntry)
                : [],
            };
            // Smart playlists keep their rules; items are rebuilt from them.
            if (playlist.smart && typeof playlist.smart === 'object') {
              entry.smart = normalizeSmartRules(playlist.smart);
            }
            return entry;
          })
      : [];

    return { favorites, playlists };
  }

  // Local taste profile: explicit "mehr/weniger davon", plus skips. Nothing
  // leaves the device; only artist names are used for suggestions, as before.
  function loadTaste() {
    const raw = readJSON(STORAGE.taste, null) || {};
    const taste = { tracks: {}, artists: {}, skips: [], revision: 0 };

    ['tracks', 'artists'].forEach((kind) => {
      const rows = raw[kind] && typeof raw[kind] === 'object' ? raw[kind] : {};
      Object.keys(rows)
        .slice(0, 800)
        .forEach((key) => {
          const row = rows[key];
          if (!row || (row.value !== 1 && row.value !== -1)) return;
          const clean = { value: row.value, at: Number(row.at) || 0 };
          if (typeof row.n === 'string') clean.n = primaryArtist(row.n);
          if (typeof row.a === 'string') clean.a = row.a;
          if (typeof row.dz === 'string' || typeof row.dz === 'number') clean.dz = row.dz;
          taste[kind][key] = clean;
        });
    });

    taste.skips = (Array.isArray(raw.skips) ? raw.skips : [])
      .filter((row) => row && Number(row.at) && (row.a || row.t))
      .slice(-300)
      .map((row) => ({
        a: typeof row.a === 'string' ? row.a : '',
        t: typeof row.t === 'string' ? row.t : '',
        n: typeof row.n === 'string' ? primaryArtist(row.n) : '',
        dz: typeof row.dz === 'string' || typeof row.dz === 'number' ? row.dz : null,
        at: Number(row.at) || 0,
      }));

    taste.revision = Math.max(0, Number(raw.revision) || 0);
    return taste;
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
    invalidateMixes();
    renderHomeMixes();
    if (state.view === 'mixes') renderMixes();
    updateNowPlayingActions();
    updateStatusChips();
    if (what.favorites) scheduleRecsRefresh();
  }

  function toggleFavorite(entry) {
    if (!entry) return;

    if (CMCollection.isFavorite(state.collection.favorites, entry.id)) {
      const result = CMCollection.without(state.collection.favorites, entry.id);
      state.collection.favorites = result.list;
      toast(`„${entry.title}“ aus Favoriten entfernt`);
    } else {
      state.collection.favorites = CMCollection.prepend(
        state.collection.favorites,
        storable(Object.assign({}, entry, { addedAt: 0 }))
      );
      toast(`♥ „${entry.title}“ in Favoriten`);
    }

    onCollectionChanged({ favorites: true });
  }

  function playlistById(id) {
    return state.collection.playlists.find((playlist) => playlist.id === id) || null;
  }

  function createPlaylist(name, preset = '', smart = null) {
    const playlist = {
      id: uid(),
      name: String(name || 'Playlist').trim().slice(0, 80) || 'Playlist',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      preset: String(preset || '').slice(0, 80),
      items: [],
    };
    if (smart) playlist.smart = normalizeSmartRules(smart);
    state.collection.playlists.push(playlist);
    onCollectionChanged({ playlists: true });
    return playlist;
  }

  function addToPlaylist(id, entries, options = {}) {
    const playlist = playlistById(id);
    if (!playlist) return;
    if (playlist.smart) {
      toast('Smart-Playlists entstehen aus Regeln – ändere die Regeln, statt Titel hineinzuziehen.');
      return;
    }

    const fresh = CMCollection.fresh(playlist.items, entries);

    fresh.forEach((entry) => playlist.items.push(storable(Object.assign({}, entry, { addedAt: 0 }))));
    playlist.updatedAt = Date.now();
    onCollectionChanged({ playlists: true });

    if (options.quiet) return;
    if (!fresh.length) toast(`Schon in „${playlist.name}“`);
    else if (fresh.length === 1) toast(`„${fresh[0].title}“ → ${playlist.name}`);
    else toast(`${fresh.length} Titel → ${playlist.name}`);
  }

  function removeFromPlaylist(id, index) {
    const playlist = playlistById(id);
    if (!playlist) return;
    const result = CMCollection.withoutAt(playlist.items, index);
    if (!result.removed) return;
    playlist.items = result.list;
    playlist.updatedAt = Date.now();
    onCollectionChanged({ playlists: true });
    toast(`„${result.removed.title}“ entfernt`);
  }

  function movePlaylistItem(id, from, to) {
    const playlist = playlistById(id);
    if (!playlist) return;
    if (playlist.smart) {
      toast('Smart-Playlists werden aus Regeln sortiert – nutze „Aktualisieren“.');
      return;
    }
    const result = CMCollection.moved(playlist.items, from, to);
    if (!result.moved) return;
    playlist.items = result.list;
    playlist.updatedAt = Date.now();
    onCollectionChanged({ playlists: true });
  }

  /* Smart playlists: collect what is already here, filter it, interleave the
   * sources so one list cannot dominate, and store a normal playlist. */

  function smartKey(entry) {
    const key = matchKey(entry);
    // normKey() drops non-Latin scripts, so Japanese/Cyrillic titles would all
    // collide on "|". Fall back to the stable id in that case.
    if (key && key.replace(/\|/g, '').trim()) return key;
    return `id:${entry.id}`;
  }

  function smartContext(lastPlayed) {
    return {
      valid: validEntry,
      streamSafe,
      disliked: (entry) => tasteTrackValue(entry) < 0 || tasteArtistValue(entry) < 0,
      lastPlayed: (id) => lastPlayed.get(id) || 0,
      bpm: (entry) => Number(bpmCache[entry.id]) || 0,
      mood: (entry) => moodOf(entry) || '',
      license: (entry) => licenseCategory(entry),
      now: Date.now(),
    };
  }

  function smartAccept(entry, rules, lastPlayed, context) {
    return !RECIPES.rejects(entry, rules, context || smartContext(lastPlayed));
  }

  function smartSourceGroups(rules, selfId, lastPlayed) {
    const groups = [];
    const context = smartContext(lastPlayed);
    const add = (entries, source) => {
      if (!Array.isArray(entries) || !entries.length) return;
      const seen = new Set();
      const list = [];
      entries.forEach((entry) => {
        if (!smartAccept(entry, rules, lastPlayed, context)) return;
        const key = smartKey(entry);
        if (seen.has(key)) return;
        seen.add(key);
        list.push(entry);
      });
      if (!list.length) return;
      // tasteScore() looks into history; score each title once per dialog
      // keystroke instead of once per comparison.
      const scores = new Map();
      const score = (entry) => {
        if (!scores.has(entry.id)) scores.set(entry.id, tasteScore(entry));
        return scores.get(entry.id);
      };
      list.sort(
        (a, b) =>
          score(b) - score(a) ||
          String(a.title || '').localeCompare(String(b.title || ''), 'de')
      );
      groups.push({ source, list });
    };

    if (rules.sources.includes('favorites')) add(state.collection.favorites, 'favorites');
    if (rules.sources.includes('local')) add(state.library.entries, 'local');
    if (rules.sources.includes('history')) add(history.map((row) => row.entry), 'history');
    if (rules.sources.includes('playlists')) {
      state.collection.playlists.forEach((playlist) => {
        if (playlist.id !== selfId && !playlist.smart) add(playlist.items, 'playlists');
      });
    }
    if (rules.sources.includes('recs')) add(state.recs.tracks, 'recs');
    if (rules.sources.includes('charts')) add(state.charts.tracks.concat(state.releases.tracks), 'charts');
    return groups;
  }

  function smartCollect(rules, selfId, options = {}) {
    const normalized = normalizeSmartRules(rules);
    const lastPlayed = options.lastPlayed || new Map(history.map((row) => [row.entry.id, row.last]));
    const groups = smartSourceGroups(normalized, selfId, lastPlayed);
    const result = RECIPES.collect(groups, normalized.limit, smartKey);
    return options.withWhy ? result : result.items;
  }

  function smartBuild(playlist) {
    if (!playlist || !playlist.smart) return [];
    return smartCollect(playlist.smart, playlist.id).map((entry) => storable(entry));
  }

  function rebuildSmartPlaylist(playlist, options = {}) {
    if (!playlist || !playlist.smart) return 0;
    const result = smartCollect(playlist.smart, playlist.id, { withWhy: true });
    playlist.items = result.items.map((entry) => storable(entry));
    playlist.smart = normalizeSmartRules(Object.assign({}, playlist.smart, { why: result.why }));
    playlist.smart.updatedAt = Date.now();
    playlist.updatedAt = Date.now();
    if (!options.quiet) {
      onCollectionChanged({ playlists: true });
      if (state.currentPlaylist === playlist.id) renderPlaylist();
    }
    return playlist.items.length;
  }

  function smartRuleChips(smart) {
    return RECIPES.chips(smart)
      .map((label) => `<span class="smart-chip">${esc(label)}</span>`)
      .join('');
  }

  // Recipes with refresh "daily" are rebuilt once per day (start, then hourly
  // check); "onOpen" ones when their playlist is opened.
  function refreshDailyRecipes() {
    let changed = 0;
    state.collection.playlists.forEach((playlist) => {
      if (playlist.smart && playlist.smart.refresh === 'daily' && RECIPES.needsRefresh(playlist.smart, 'start')) {
        rebuildSmartPlaylist(playlist, { quiet: true });
        changed += 1;
      }
    });
    if (changed) onCollectionChanged({ playlists: true });
    return changed;
  }

  function smartUpdatedLabel(value) {
    const at = Number(value) || 0;
    if (!at) return 'noch nicht aktualisiert';
    const date = new Date(at).toLocaleString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `aktualisiert ${date}`;
  }

  /* Automatic playlist extension: Deezer (and the source plugin, if it can
   * suggest related titles) is asked for music that fits the artists already
   * in the playlist. Only new titles are appended – nothing is reordered. */

  const playlistExtendBusy = new Set();

  function chooseExtendTracks(entries, playlist) {
    const rows = entries
      .map((entry, index) => {
        const meta = [entry.artist, entry.duration ? fmtTime(entry.duration) : '', entry.sourceLabel]
          .filter(Boolean)
          .join(' · ');
        const tag =
          entry.kind === 'plugin'
            ? '<span class="extend-tag">Plugin</span>'
            : entry.kind === 'preview'
              ? '<span class="extend-tag">30 s</span>'
              : '';
        return `
          <label class="extend-row">
            <input type="checkbox" data-extend-index="${index}" checked />
            <span class="extend-art">${
              entry.artwork ? `<img src="${esc(entry.artwork)}" alt="" loading="lazy" />` : ICONS.note
            }</span>
            <span class="extend-meta">
              <strong>${esc(entry.title)}</strong>
              <small>${esc(meta)}</small>
            </span>
            ${tag}
          </label>`;
      })
      .join('');

    const html = `
      <div class="extend-toolbar">
        <span>${entries.length} passende Titel für „${esc(playlist.name)}“</span>
        <span class="extend-links">
          <button type="button" class="link-btn" data-extend-all>Alle</button>
          <button type="button" class="link-btn" data-extend-none>Keine</button>
        </span>
      </div>
      <div class="extend-list">${rows}</div>
      <p class="extend-note">Abgewählte Titel bleiben draußen. Doppelte Titel überspringt CleanMusic weiterhin automatisch.</p>`;

    const promise = openDialog({
      title: 'Playlist erweitern',
      html,
      input: false,
      confirm: 'Hinzufügen',
      className: 'extend-dialog',
    });

    const root = $('#dialog');
    const ok = $('#dialog-ok');
    const boxes = () => Array.from(root.querySelectorAll('[data-extend-index]'));
    const update = () => {
      const count = boxes().filter((box) => box.checked).length;
      ok.disabled = count === 0;
      ok.textContent = count ? `${count} hinzufügen` : 'Hinzufügen';
    };
    root.querySelector('[data-extend-all]')?.addEventListener('click', () => {
      boxes().forEach((box) => {
        box.checked = true;
      });
      update();
    });
    root.querySelector('[data-extend-none]')?.addEventListener('click', () => {
      boxes().forEach((box) => {
        box.checked = false;
      });
      update();
    });
    boxes().forEach((box) => box.addEventListener('change', update));
    update();

    return promise.then((accepted) => {
      if (!accepted) return [];
      return boxes()
        .filter((box) => box.checked)
        .map((box) => entries[Number(box.dataset.extendIndex)])
        .filter(Boolean);
    });
  }

  function recommendationSeeds(entries) {
    const scores = new Map();
    entries.forEach((entry) => {
      if (!entry || entry.kind === 'radio') return;
      const name = primaryArtist(entry.artist);
      if (!name || name.length < 2) return;
      const key = name.toLowerCase();
      const seed = scores.get(key) || { name, score: 0, deezerId: null };
      seed.score += 1;
      if (!seed.deezerId && entry.source === 'deezer' && entry.artistId) seed.deezerId = entry.artistId;
      scores.set(key, seed);
    });

    const artists = Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ name, deezerId }) => ({ name, deezerId }));

    const pluginSeeds = [];
    entries.forEach((entry) => {
      if (!entry || entry.kind !== 'plugin' || !entry.refId) return;
      const plugin = pluginById(entry.pluginId);
      if (!isPluginReady(plugin) || !plugin.capabilities.related) return;
      let seed = pluginSeeds.find((known) => known.id === plugin.id);
      if (!seed) {
        seed = { id: plugin.id, refIds: [] };
        pluginSeeds.push(seed);
      }
      if (seed.refIds.length < 2) seed.refIds.push(entry.refId);
    });

    return { artists, pluginSeeds };
  }

  async function extendPlaylist(id) {
    const playlist = playlistById(id);
    if (!playlist || playlistExtendBusy.has(id)) return;
    if (playlist.smart) {
      toast('Smart-Playlists werden aus Regeln gebaut – ändere die Regeln.');
      return;
    }
    if (!bridge.recommendations) {
      toast('Vorschläge sind gerade nicht verfügbar.');
      return;
    }

    const seeds = recommendationSeeds(playlist.items);
    if (!seeds.artists.length && !seeds.pluginSeeds.length) {
      toast('Für diese Playlist fehlen Künstlerangaben – daraus lassen sich keine Vorschläge bauen.');
      return;
    }

    playlistExtendBusy.add(id);
    if (state.currentPlaylist === id) renderPlaylist();
    try {
      const result = await bridge.recommendations({
        artists: seeds.artists,
        pluginSeeds: seeds.pluginSeeds,
      });

      const known = new Set();
      playlist.items.forEach((entry) => {
        known.add(entry.id);
        known.add(matchKey(entry));
      });
      const isNew = (entry) => Boolean(entry) && !known.has(entry.id) && !known.has(matchKey(entry));

      const tracks = (Array.isArray(result.tracks) ? result.tracks : []).map(previewEntry).filter(isNew);
      const videos = (Array.isArray(result.pluginItems) ? result.pluginItems : [])
        .map((item) => {
          const plugin = pluginById(item.pluginId);
          return plugin ? pluginEntry(plugin, item) : null;
        })
        .filter(isNew);
      const picked = mergeRecs(tracks, videos).slice(0, 12);

      if (!picked.length) {
        toast('Keine neuen passenden Titel gefunden – die Playlist ist schon gut gefüllt.');
        return;
      }

      const chosen = await chooseExtendTracks(picked, playlist);
      if (!chosen.length) {
        toast('Nichts ausgewählt – Playlist unverändert.');
        return;
      }

      addToPlaylist(id, chosen, { quiet: true });
      toast(`${chosen.length} Titel ergänzt – passend zu „${playlist.name}“`);
    } catch (error) {
      toast(`Erweitern fehlgeschlagen: ${error.message || error}`);
    } finally {
      playlistExtendBusy.delete(id);
      if (state.currentPlaylist === id) renderPlaylist();
    }
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

  function smartPlaylistDialog(existing) {
    const rules = normalizeSmartRules(existing ? existing.smart : {});
    const name = existing ? existing.name : uniquePlaylistName('Smart-Playlist', 'Smart-Playlist');
    const sourceRows = SMART_SOURCES.map(
      (source) => `
        <label class="smart-check">
          <input type="checkbox" data-smart-source="${source.id}" ${
            rules.sources.includes(source.id) ? 'checked' : ''
          } />
          <span><strong>${esc(source.label)}</strong><small>${esc(source.help)}</small></span>
        </label>`
    ).join('');
    const dayOptions = SMART_DAYS.map(
      (days) =>
        `<option value="${days}" ${rules.notPlayedDays === days ? 'selected' : ''}>${
          days ? `${days} Tagen` : 'Egal'
        }</option>`
    ).join('');
    const html = `
      <div class="smart-form">
        <label class="smart-field">
          <span>Name</span>
          <input id="smart-name" type="text" maxlength="80" value="${esc(name)}" spellcheck="false" />
        </label>
        <fieldset class="smart-group">
          <legend>Quellen</legend>
          <div class="smart-checks">${sourceRows}</div>
        </fieldset>
        <div class="smart-row">
          <label class="smart-field">
            <span>Höchstens</span>
            <input id="smart-limit" type="number" min="${SMART_LIMIT_MIN}" max="${SMART_LIMIT_MAX}" step="5" value="${rules.limit}" />
          </label>
          <label class="smart-field">
            <span>Nicht gehört seit</span>
            <select id="smart-days">${dayOptions}</select>
          </label>
        </div>
        <div class="smart-checks">
          <label class="smart-check">
            <input type="checkbox" id="smart-safe" ${rules.streamSafe ? 'checked' : ''} />
            <span><strong>Nur stream-sicher</strong><small>NCS, CC0, CC BY und bestätigte Plugin-Lizenzen.</small></span>
          </label>
          <label class="smart-check">
            <input type="checkbox" id="smart-with-credit" ${rules.withCredit ? 'checked' : ''} />
            <span><strong>Nur mit Credit</strong><small>Titel, für die eine Lizenz-Notiz vorliegt.</small></span>
          </label>
          <label class="smart-check">
            <input type="checkbox" id="smart-no-dislikes" ${rules.excludeDislikes ? 'checked' : ''} />
            <span><strong>Ohne Dislikes</strong><small>„Weniger davon“ und abgelehnte Artists bleiben draußen.</small></span>
          </label>
        </div>
        <div class="smart-row">
          <label class="smart-field">
            <span>Aktualisieren</span>
            <select id="smart-refresh">${RECIPES.REFRESH.map(
              (item) => `<option value="${item.id}" ${rules.refresh === item.id ? 'selected' : ''}>${esc(item.label)}</option>`
            ).join('')}</select>
          </label>
          <label class="smart-field">
            <span>Tempo (BPM)</span>
            <span class="smart-bpm">
              <input id="smart-bpm-min" type="number" min="0" max="${RECIPES.BPM_MAX}" step="5" placeholder="von" value="${rules.bpmMin || ''}" />
              <span aria-hidden="true">–</span>
              <input id="smart-bpm-max" type="number" min="0" max="${RECIPES.BPM_MAX}" step="5" placeholder="bis" value="${rules.bpmMax || ''}" />
            </span>
          </label>
        </div>
        <fieldset class="smart-group">
          <legend>Stimmung</legend>
          <div class="smart-pills">${RECIPES.MOODS.map(
            (mood) => `<label class="smart-pill"><input type="checkbox" data-smart-mood="${mood.id}" ${rules.moods.includes(mood.id) ? 'checked' : ''} /><span>${esc(mood.label)}</span></label>`
          ).join('')}</div>
          <small class="smart-hint">Erkannt an Ordner, Titel und Artist. Leer = egal. Tempo kennt CleanMusic nur von Titeln, die schon analysiert wurden.</small>
        </fieldset>
        <fieldset class="smart-group">
          <legend>Art</legend>
          <div class="smart-pills">${RECIPES.KINDS.map(
            (kind) => `<label class="smart-pill"><input type="checkbox" data-smart-kind="${kind.id}" ${rules.kinds.includes(kind.id) ? 'checked' : ''} /><span>${esc(kind.label)}</span></label>`
          ).join('')}</div>
        </fieldset>
        <fieldset class="smart-group">
          <legend>Lizenz</legend>
          <div class="smart-pills">${(RECIPES.LICENSES || []).map(
            (lic) => `<label class="smart-pill"><input type="checkbox" data-smart-license="${lic.id}" ${rules.licenses.includes(lic.id) ? 'checked' : ''} /><span>${esc(lic.label)}</span></label>`
          ).join('')}</div>
          <small class="smart-hint">Leer = jede Lizenz. „Nur stream-sicher“ oben ist strenger (CC0/CC BY/NCS/Plugin-CC).</small>
        </fieldset>
        <p class="smart-preview" id="smart-preview"></p>
      </div>`;

    const promise = openDialog({
      title: existing ? 'Regeln bearbeiten' : 'Smart-Playlist',
      html,
      input: false,
      confirm: existing ? 'Speichern' : 'Erstellen',
      className: 'smart-dialog',
    });

    const root = $('#dialog');
    const form = $('#dialog-form');
    const ok = $('#dialog-ok');

    const read = () => ({
      name: String((root.querySelector('#smart-name') || {}).value || '').trim().slice(0, 80),
      rules: {
        sources: Array.from(root.querySelectorAll('[data-smart-source]:checked')).map(
          (input) => input.dataset.smartSource
        ),
        limit: Number((root.querySelector('#smart-limit') || {}).value) || 30,
        streamSafe: Boolean((root.querySelector('#smart-safe') || {}).checked),
        withCredit: Boolean((root.querySelector('#smart-with-credit') || {}).checked),
        notPlayedDays: Number((root.querySelector('#smart-days') || {}).value) || 0,
        excludeDislikes: Boolean((root.querySelector('#smart-no-dislikes') || {}).checked),
        refresh: String((root.querySelector('#smart-refresh') || {}).value || 'manual'),
        bpmMin: Number((root.querySelector('#smart-bpm-min') || {}).value) || 0,
        bpmMax: Number((root.querySelector('#smart-bpm-max') || {}).value) || 0,
        moods: Array.from(root.querySelectorAll('[data-smart-mood]:checked')).map((input) => input.dataset.smartMood),
        kinds: Array.from(root.querySelectorAll('[data-smart-kind]:checked')).map((input) => input.dataset.smartKind),
        licenses: Array.from(root.querySelectorAll('[data-smart-license]:checked')).map((input) => input.dataset.smartLicense),
        why: existing && existing.smart ? existing.smart.why : {},
      },
    });

    const update = () => {
      const values = read();
      const hasSources = values.rules.sources.length > 0;
      const count = hasSources
        ? smartCollect(values.rules, existing ? existing.id : '').length
        : 0;
      const safeRules = Object.assign({}, values.rules, { streamSafe: true });
      const safe =
        !hasSources
          ? 0
          : values.rules.streamSafe
            ? count
            : smartCollect(safeRules, existing ? existing.id : '').length;
      const preview = root.querySelector('#smart-preview');
      if (preview) {
        preview.textContent = !hasSources
          ? 'Wähle mindestens eine Quelle.'
          : count
            ? `${count} Titel passen${count !== safe ? ` · ${safe} davon stream-sicher` : ''}.`
            : 'Keine Treffer – lockere die Filter oder wähle mehr Quellen.';
      }
      ok.disabled = !values.name || !hasSources;
    };

    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();
    requestAnimationFrame(() => {
      const field = root.querySelector('#smart-name');
      if (field) {
        field.focus();
        field.select();
      }
    });

    return promise.then((accepted) => {
      form.removeEventListener('input', update);
      form.removeEventListener('change', update);
      return accepted ? read() : null;
    });
  }

  async function promptSmartPlaylist(existing = null) {
    const answer = await smartPlaylistDialog(existing);
    if (!answer) return null;
    if (!answer.name) {
      toast('Bitte gib der Smart-Playlist einen Namen.');
      return null;
    }
    if (!answer.rules.sources.length) {
      toast('Bitte wähle mindestens eine Quelle.');
      return null;
    }

    let playlist = existing && playlistById(existing.id);
    if (!playlist) {
      playlist = createPlaylist(answer.name, '', answer.rules);
    } else {
      playlist.name = answer.name;
      playlist.smart = normalizeSmartRules(answer.rules);
    }

    rebuildSmartPlaylist(playlist, { quiet: true });
    onCollectionChanged({ playlists: true });
    openPlaylist(playlist.id);
    toast(
      existing
        ? `Regeln gespeichert – ${playlist.items.length} Titel`
        : `Smart-Playlist „${playlist.name}“ mit ${playlist.items.length} Titeln`
    );
    return playlist;
  }

  function refreshSmartPlaylist(id) {
    const playlist = playlistById(id);
    if (!playlist || !playlist.smart) return 0;
    const count = rebuildSmartPlaylist(playlist);
    toast(`Smart-Playlist aktualisiert – ${count} Titel`);
    return count;
  }

  function editSmartPlaylist(id) {
    const playlist = playlistById(id);
    if (playlist && playlist.smart) promptSmartPlaylist(playlist);
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
    return state.recs.tracks.filter(
      (entry) =>
        (entry.kind !== 'plugin' || pluginReady(entry.pluginId)) &&
        tasteTrackValue(entry) >= 0 &&
        tasteArtistValue(entry) >= 0
    );
  }

  function listEntries(key) {
    switch (key) {
      case 'search': return state.search.tracks;
      case 'charts': return state.charts.tracks;
      case 'ext': return state.pluginSearch.results;
      case 'creator': return creatorItems();
      case 'recs': return visibleRecs();
      case 'favorites': return filteredFavorites();
      case 'local': return visibleLocal();
      case 'artist': return artistList('artist');
      case 'album': return artistList('album');
      case 'shared': return state.sharedList || [];
      case 'review': return reviewEntries();
      case 'downloads': return visibleDownloads();
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
    const single = CMPlayback.singleContext(autoplayOn(), key, SINGLE_CONTEXTS);
    const items = single ? [entry] : list.slice();
    const start = single ? 0 : index;
    // Titles the user queued stay queued when another list starts.
    const pending = state.queue.items.length ? pendingQueued() : [];
    items.splice(start + 1, 0, ...pending);
    state.queue = queueSlice.replace(items, start, key, { shuffleBase: null });
    // Shuffle the rest of the list once; the clicked title keeps playing.
    if (state.playback.shuffle && !single) shuffleQueueTail(true);
    playFromQueue(start);
  }

  function playListShuffled(key) {
    const list = listEntries(key);
    if (!list.length) return;
    if (!state.playback.shuffle) {
      state.playback.shuffle = true;
      writeJSON(STORAGE.playback, state.playback);
      syncPlaybackButtons();
    }
    const pending = state.queue.items.length ? pendingQueued() : [];
    const items = shuffled(list.slice());
    items.splice(1, 0, ...pending);
    state.queue = queueSlice.replace(items, 0, key, { shuffleBase: list.slice() });
    playFromQueue(0);
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

  const CONTENT_ID_NOTE =
    'Nicht lizenzgeprüft – kann auf YouTube, TikTok oder Twitch Content-ID-Ansprüche, Stummschaltung oder Sperren auslösen. Rechte vor der Nutzung selbst klären.';

  function licenseBadge(entry) {
    const contentId = entry.contentId
      ? `<span class="lic-badge" data-lic="cid" title="${esc(CONTENT_ID_NOTE)}">⚠ Content ID möglich</span>`
      : '';
    if (!entry.license) return contentId;
    const title =
      entry.license === 'NCS'
        ? 'NCS – frei für Videos mit Credit'
        : entry.contentId
          ? 'Angabe des Uploaders bei YouTube, nicht geprüft – Content ID trotzdem möglich'
          : `Lizenz: ${entry.license}`;
    return `<span class="lic-badge" data-lic="${licenseKey(entry.license)}" title="${esc(title)}">${esc(entry.license)}</span>${contentId}`;
  }

  function youtubeCutterEntry(plugin, item) {
    const entry = pluginEntry(plugin, item);
    const licensed = item.license === 'cc-by';
    entry.contentId = true;
    entry.license = licensed ? 'CC BY laut Uploader' : '';
    entry.credit = licensed
      ? `„${entry.title}“ von ${entry.artist || 'YouTube'} (YouTube) – CC BY laut Uploader: ${item.link || entry.link}`
      : '';
    return entry;
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
          <div class="song-sub">${
            entry.artist && !['local', 'radio', 'stream'].includes(entry.kind)
              ? `<span class="artist-link" data-artist="${esc(entry.artist)}"${
                  entry.source === 'deezer' && entry.artistId ? ` data-artist-deezer="${esc(entry.artistId)}"` : ''
                } title="Künstlerseite öffnen">${esc(entry.artist)}</span>${entry.album ? ` · ${esc(entry.album)}` : ''}`
              : esc(sub)
          }</div>
        </div>
        <span class="song-badges">
          <span class="song-source" data-source="${esc(entry.source || entry.kind)}">${esc(
            entry.sourceLabel || ''
          )}</span>
          ${licenseBadge(entry)}
          ${aiBadge(entry)}
        </span>
        ${bpmBadge(entry)}
        ${lengthBadge(entry)}
        <div class="song-actions">
          ${downloadButton(entry)}
          ${listKey === 'creator' ? '<button class="btn ghost small project-add" data-act="project" title="Zum aktiven Cutting-Projekt hinzufügen">Zum Projekt</button>' : ''}
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

  function openDialog({ title, text = '', html = '', value = '', input = true, confirm = 'OK', danger = false, info = false, className = '' }) {
    return new Promise((resolve) => {
      const root = $('#dialog');
      const form = $('#dialog-form');
      const field = $('#dialog-input');
      const ok = $('#dialog-ok');
      const cancel = $('#dialog-cancel');
      const textEl = $('#dialog-text');

      hideMenus();
      form.className = className ? `dialog ${className}` : 'dialog';
      $('#dialog-title').textContent = title;
      if (html) textEl.innerHTML = html;
      else textEl.textContent = text;
      textEl.hidden = !text && !html;
      textEl.classList.toggle('dialog-rich', Boolean(html));
      cancel.hidden = info;
      field.hidden = !input;
      field.value = value;
      ok.textContent = confirm;
      ok.disabled = false;
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
    ['Global: Strg + Alt + P', 'Play/Pause (wenn aktiviert)'],
    ['Global: Strg + Alt + → / ←', 'Weiter / Zurück (wenn aktiviert)'],
    ['Global: Strg + Alt + ↑ / ↓', 'Lauter / Leiser (wenn aktiviert)'],
    ['Global: Strg + Alt + M', 'Mini-Player (wenn aktiviert)'],
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
    const tasteEntry = entries.length === 1 && entries[0].kind !== 'radio' ? entries[0] : null;
    const tasteArtist = tasteEntry ? primaryArtist(tasteEntry.artist) : '';
    const trackLiked = tasteEntry ? tasteTrackValue(tasteEntry) > 0 : false;
    const trackDisliked = tasteEntry ? tasteTrackValue(tasteEntry) < 0 : false;
    const artistLiked = tasteEntry ? tasteArtistValue(tasteEntry) > 0 : false;
    const artistDisliked = tasteEntry ? tasteArtistValue(tasteEntry) < 0 : false;
    menu.innerHTML = `
      ${
        entries.length === 1 && entries[0].title
          ? `<button class="service-menu-item" data-ctx-share>
              <span class="menu-ic">${ICONS.copy}</span>
              <span class="menu-text">Link zum Teilen kopieren</span>
            </button>`
          : ''
      }
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
      ${
        tasteEntry
          ? `<div class="service-menu-label">Geschmack</div>
             <button class="service-menu-item" data-ctx-taste="like">
               <span class="menu-ic">${ICONS.like}</span>
               <span class="menu-text">Mehr davon</span>
               ${trackLiked ? '<span class="menu-count">✓</span>' : ''}
             </button>
             <button class="service-menu-item" data-ctx-taste="dislike">
               <span class="menu-ic">${ICONS.dislike}</span>
               <span class="menu-text">Weniger davon</span>
               ${trackDisliked ? '<span class="menu-count">✓</span>' : ''}
             </button>
             ${
               tasteArtist
                 ? `<button class="service-menu-item" data-ctx-taste="artist-like">
                      <span class="menu-ic">${ICONS.like}</span>
                      <span class="menu-text">${esc(tasteArtist)} mehr davon</span>
                      ${artistLiked ? '<span class="menu-count">✓</span>' : ''}
                    </button>
                    <button class="service-menu-item" data-ctx-taste="artist-dislike">
                      <span class="menu-ic">${ICONS.dislike}</span>
                      <span class="menu-text">${esc(tasteArtist)} weniger davon</span>
                      ${artistDisliked ? '<span class="menu-count">✓</span>' : ''}
                    </button>`
                 : ''
             }
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

  const NAV_STATE_KEY = STORAGE.nav;
  const savedNav = readJSON(NAV_STATE_KEY, {});
  let navState = Object.assign(
    { services: false, creator: false },
    savedNav && typeof savedNav === 'object' ? savedNav : {}
  );

  function saveNavState() {
    writeJSON(NAV_STATE_KEY, { services: Boolean(navState.services), creator: Boolean(navState.creator) });
  }

  function serviceButton(service) {
    return `
      <button class="nav-item service-item" data-service="${service.id}">
        <span class="svc-badge" style="--svc:${service.color}">${esc(service.short)}</span>
        <span class="svc-name">${esc(service.name)}</span>
      </button>`;
  }

  function syncServiceActive() {
    $$('#service-nav .service-item, #creator-nav .service-item').forEach((button) => {
      button.classList.toggle('active', button.dataset.service === state.currentService);
    });
  }

  function renderServiceNav() {
    const music = SERVICES.filter((service) => !service.creator);
    const featured = music.filter((service) => service.featured);
    const extra = music
      .filter((service) => !service.featured)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    const host = $('#service-nav');
    if (host) {
      host.innerHTML = `
        ${featured.map(serviceButton).join('')}
        <div id="service-extra" class="service-extra" ${navState.services ? '' : 'hidden'}>
          ${extra.map(serviceButton).join('')}
        </div>
        ${
          extra.length
            ? `<button class="nav-more" id="btn-services-more" aria-expanded="${navState.services}">
                 <span class="nav-more-sign">${navState.services ? '−' : '+'}</span>
                 <span>${navState.services ? 'Weniger Dienste' : `Weitere Dienste (${extra.length})`}</span>
                 <span class="nav-chevron ${navState.services ? 'open' : ''}">›</span>
               </button>`
            : ''
        }`;
    }
    const count = $('#service-count');
    if (count) count.textContent = String(music.length);

    const creatorNav = $('#creator-nav');
    if (creatorNav) {
      creatorNav.innerHTML = SERVICES.filter((service) => service.creator).map(serviceButton).join('');
      creatorNav.hidden = !navState.creator;
    }
    const toggle = document.querySelector('[data-nav-toggle="creator"]');
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(Boolean(navState.creator)));
      toggle.classList.toggle('open', Boolean(navState.creator));
    }
  }

  function buildSidebar() {
    renderServiceNav();
    renderLibraryNav();
  }

  function renderLibraryNav() {
    const count = $('#fav-count');
    if (count) count.textContent = state.collection.favorites.length || '';

    const host = $('#playlist-nav');
    if (!host) return;

    const playlists = state.collection.playlists
      .slice()
      .sort(
        (a, b) =>
          Number(Boolean(b.smart)) - Number(Boolean(a.smart)) ||
          a.name.localeCompare(b.name, 'de')
      );
    host.innerHTML = playlists
      .map(
        (playlist) => `
          <button
            class="nav-item playlist-item ${
              state.view === 'playlist' && state.currentPlaylist === playlist.id ? 'active' : ''
            }"
            data-playlist="${esc(playlist.id)}"
            data-drop="playlist:${esc(playlist.id)}"
            title="${esc(playlist.name)}${playlist.smart ? ' · Smart-Playlist' : ''}"
          >
            <span class="nav-ic">${playlist.smart ? ICONS.spark : ICONS.list}</span>
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
    history = CMCollection.recordHistory(history, storable(entry), Date.now(), HISTORY_MAX);
    writeJSON(STORAGE.history, history);
    invalidateMixes();
    statsPlay(entry);
  }

  /* ---------------------------------------------------------------- *
   * Taste profile
   *
   * "Mehr davon / weniger davon" sets an explicit value per title and per
   * artist. Favourites, listening history and early skips add softer signals.
   * Everything is stored locally; artist names are the only thing used for
   * suggestions (same as favourites already were).
   * ---------------------------------------------------------------- */

  const TASTE_SKIP_DAYS = 45;

  function tasteArtistKey(value) {
    return normKey(primaryArtist(value));
  }

  function tasteEntryKey(entry) {
    return entry ? matchKey(entry) : '';
  }

  function tasteTrackValue(entry) {
    const key = tasteEntryKey(entry);
    const row = key ? state.taste.tracks[key] : null;
    return row ? Number(row.value) || 0 : 0;
  }

  function tasteArtistValue(entry) {
    const key = tasteArtistKey(entry && entry.artist);
    const row = key ? state.taste.artists[key] : null;
    return row ? Number(row.value) || 0 : 0;
  }

  function tasteSkipPenalty(entry) {
    const artist = tasteArtistKey(entry && entry.artist);
    const track = tasteEntryKey(entry);
    if (!artist && !track) return 0;
    const now = Date.now();
    let penalty = 0;
    state.taste.skips.forEach((row) => {
      const age = (now - (Number(row.at) || 0)) / DAY;
      if (age > TASTE_SKIP_DAYS) return;
      const decay = Math.exp(-age / 30);
      if (artist && row.a === artist) penalty += 0.5 * decay;
      else if (track && row.t === track) penalty += 0.3 * decay;
    });
    return Math.min(2.6, penalty);
  }

  function tasteScore(entry) {
    if (!entry || entry.kind === 'radio') return 0;
    let score = 0;

    const track = tasteTrackValue(entry);
    if (track > 0) score += 3.2;
    else if (track < 0) score -= 4.4;

    const artist = tasteArtistValue(entry);
    if (artist > 0) score += 2.4;
    else if (artist < 0) score -= 3.4;

    if (favIds.has(entry.id)) score += 1.2;

    const played = history.find((row) => row.entry.id === entry.id);
    if (played) {
      const age = (Date.now() - played.last) / DAY;
      score += Math.min(2.2, played.plays * 0.4) * Math.exp(-age / 120);
    }

    score -= tasteSkipPenalty(entry);
    return Math.max(-8, Math.min(8, score));
  }

  // One list of artist seeds for recommendations: explicit taste first,
  // then favourites, plays, playlist titles and skips.
  function artistScores() {
    const scores = new Map();
    const add = (name, weight, deezerId = null) => {
      const clean = primaryArtist(name);
      const key = clean ? normKey(clean) : '';
      if (!key || clean.length < 2 || !Number.isFinite(weight) || weight === 0) return;
      const seed = scores.get(key) || { name: clean, score: 0, deezerId: null };
      seed.score += weight;
      if (!seed.deezerId && deezerId) seed.deezerId = deezerId;
      scores.set(key, seed);
    };

    Object.values(state.taste.artists).forEach((row) =>
      add(row.n, row.value > 0 ? 4 : -6.5, row.dz)
    );
    Object.values(state.taste.tracks).forEach((row) =>
      add(row.n, row.value > 0 ? 2.2 : -3.4, row.dz)
    );

    const now = Date.now();
    state.collection.favorites.forEach((entry, index) =>
      add(entry.artist, 1 + Math.max(0, 1 - index / 15), entry.source === 'deezer' ? entry.artistId : null)
    );
    history.forEach((row) => {
      const age = (now - row.last) / DAY;
      add(
        row.entry.artist,
        Math.min(row.plays, 6) * 0.3 * Math.exp(-age / 30),
        row.entry.source === 'deezer' ? row.entry.artistId : null
      );
    });
    state.collection.playlists.forEach((playlist) =>
      playlist.items.forEach((entry) => add(entry.artist, 0.35))
    );
    state.taste.skips.forEach((row) => {
      const age = (now - row.at) / DAY;
      if (age > TASTE_SKIP_DAYS) return;
      add(row.n, -0.55 * Math.exp(-age / 30), row.dz);
    });

    return scores;
  }

  function tasteArtists(limit = 5) {
    return Array.from(artistScores().values())
      .filter((artist) => artist.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ name, deezerId }) => ({ name, deezerId }));
  }

  function trimTasteMap(map) {
    const keys = Object.keys(map || {});
    if (keys.length <= 600) return;
    keys
      .sort((a, b) => (Number(map[a].at) || 0) - (Number(map[b].at) || 0))
      .slice(0, keys.length - 600)
      .forEach((key) => delete map[key]);
  }

  function persistTaste() {
    state.taste.revision = (Number(state.taste.revision) || 0) + 1;
    trimTasteMap(state.taste.tracks);
    trimTasteMap(state.taste.artists);
    writeJSON(STORAGE.taste, state.taste);
  }

  function setTasteFeedback(entries, target, value) {
    const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
    if (!list.length) return;
    const now = Date.now();
    let changed = 0;
    let toggledOff = 0;

    list.forEach((entry) => {
      if (!entry || entry.kind === 'radio') return;
      if (target === 'artist') {
        const key = tasteArtistKey(entry.artist);
        if (!key) return;
        const row = state.taste.artists[key];
        if (row && row.value === value) {
          delete state.taste.artists[key];
          toggledOff += 1;
        } else {
          state.taste.artists[key] = {
            value,
            at: now,
            n: primaryArtist(entry.artist),
            dz: entry.source === 'deezer' ? entry.artistId || null : null,
          };
        }
        changed += 1;
      } else {
        const key = tasteEntryKey(entry);
        if (!key) return;
        const row = state.taste.tracks[key];
        if (row && row.value === value) {
          delete state.taste.tracks[key];
          toggledOff += 1;
        } else {
          state.taste.tracks[key] = {
            value,
            at: now,
            n: primaryArtist(entry.artist),
            a: tasteArtistKey(entry.artist),
            dz: entry.source === 'deezer' ? entry.artistId || null : null,
          };
        }
        changed += 1;
      }
    });

    if (!changed) return;
    persistTaste();
    invalidateMixes();
    const label = target === 'artist' ? 'Artist' : 'Titel';
    const name =
      target === 'artist'
        ? `„${primaryArtist(list[0].artist) || list[0].title}“`
        : list.length === 1
          ? `„${list[0].title}“`
          : `${list.length} Titel`;
    if (toggledOff === changed) toast(`${label}-Geschmack für ${name} zurückgesetzt`);
    else toast(`${value > 0 ? 'Mehr davon' : 'Weniger davon'}: ${name}`);
    if (state.view === 'mixes') renderMixes();
    renderHomeMixes();
    scheduleRecsRefresh(1200);
  }

  function noteSkip(entry) {
    if (!entry || entry.kind === 'radio' || audio.paused) return;
    const played = Number(audio.currentTime) || 0;
    const duration = Number(audio.duration) || 0;
    const limit = Math.min(20, duration ? duration * 0.55 : 20);
    if (played < 3 || played >= limit) return;

    const track = tasteEntryKey(entry);
    const artist = tasteArtistKey(entry.artist);
    if (!track && !artist) return;
    const skips = state.taste.skips;
    const last = skips[skips.length - 1];
    if (last && last.t === track && Date.now() - last.at < 5000) return;

    skips.push({
      a: artist,
      t: track,
      n: primaryArtist(entry.artist),
      dz: entry.source === 'deezer' ? entry.artistId || null : null,
      at: Date.now(),
    });
    state.taste.skips = skips.slice(-300);
    persistTaste();
    invalidateMixes();
  }

  function tasteStats() {
    const trackRows = Object.values(state.taste.tracks);
    const artistRows = Object.values(state.taste.artists);
    const cutoff = Date.now() - 30 * DAY;
    return {
      likes: trackRows.filter((row) => row.value > 0).length + artistRows.filter((row) => row.value > 0).length,
      dislikes:
        trackRows.filter((row) => row.value < 0).length + artistRows.filter((row) => row.value < 0).length,
      skips: state.taste.skips.filter((row) => row.at >= cutoff).length,
      artists: tasteArtists(6).map((artist) => artist.name),
    };
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
    const delta = listen.last ? Math.min(2, (now - listen.last) / 1000) : 0;
    listen.secs += delta;
    statsListen(item, delta);
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
    mixesChanged();
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
    mixesChanged();
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
              <button class="quick-action" data-home-action="presets">
                ${ICONS.spark} Vorlagen
              </button>
              <button class="quick-action" data-home-action="mixes">
                ${ICONS.star} Mixes
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

        <section class="home-section" id="home-friends" hidden></section>

        <section class="home-section">
          <div class="home-section-head">
            <div class="home-section-title">
              <h2>Deine Mixes</h2>
              <span class="muted small" id="home-mixes-sub">Aus deinem Geschmack – jeden Tag neu</span>
            </div>
            <button class="btn ghost small" data-home-action="mixes">${ICONS.star} Alle Mixes</button>
          </div>
          <div id="home-mixes" class="mix-row"></div>
        </section>

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
    renderHomeMixes();
    renderHomeFriends();
    renderHomeCharts();
    renderHomeRediscover();
    renderHomeLocal();
    renderHomePanels();
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
    mixesChanged();
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

    const all = state.library.entries;
    // The cards resolve their clicks through visibleLocal() (sort + mood), so
    // they must be built from the same order – otherwise a click plays a
    // different file than the one shown.
    const entries = visibleLocal();

    if (!all.length) {
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
          <p>${all.length} lokale Titel</p>
        </div>
        <button class="btn ghost small" data-home-action="open-local">Alle ansehen</button>
      </div>
      <div class="home-local-list">${rows || '<p class="muted small home-local-note">Für diese Stimmung gibt es keine Titel.</p>'}</div>
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

  function recSeeds() {
    // Explicit taste + favourites + plays + playlists − skips, computed once.
    const artists = tasteArtists(5);

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
      invalidateMixes();
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
      invalidateMixes();
    } catch (error) {
      Object.assign(state.recs, { loading: false, loaded: true, error: error.message });
    }

    renderRecsViews();
  }

  function renderRecsViews() {
    renderHomeRecs();
    renderFavRecs();
    renderHomeMixes();
  }

  /* ---------------------------------------------------------------- *
   * Smart mixes (local taste engine)
   *
   * A mix is a stable set for the current day: built from favourites,
   * playlists, history, local files, charts and fresh recommendations, scored
   * by explicit taste, plays, skips and novelty. No server profile,
   * nothing is uploaded; only artist names go to the public catalogue API.
   * ---------------------------------------------------------------- */

  const MIX_LIMIT = 30;
  const MIX_DEFS = [
    {
      id: 'daily',
      title: 'Dein Mix',
      subtitle: 'dein Geschmack, frisch gemischt',
      desc: 'Favoriten, was du oft hörst – und Titel, die genau dazu passen.',
      icon: 'spark',
      tone: 'daily',
    },
    {
      id: 'fresh',
      title: 'Neu für dich',
      subtitle: 'neue Titel deiner Artists',
      desc: 'Frische Vorschläge abseits deiner Favoriten und der letzten Tage.',
      icon: 'star',
      tone: 'fresh',
    },
    {
      id: 'discover',
      title: 'Entdecken',
      subtitle: 'neue Artists, neue Richtungen',
      desc: 'Titel von Artists, die du noch nicht hörst – aber mögen könntest.',
      icon: 'search',
      tone: 'discover',
    },
    {
      id: 'again',
      title: 'Nochmal',
      subtitle: 'was du früher gern gehört hast',
      desc: 'Titel mit vielen Plays, die in den letzten Wochen nicht dran waren.',
      icon: 'refresh',
      tone: 'again',
    },
    {
      id: 'deep',
      title: 'Tiefe Schnitte',
      subtitle: 'Perlen aus deinen Playlists',
      desc: 'Selten gehörte Titel aus deinen Playlists und deiner lokalen Musik.',
      icon: 'list',
      tone: 'deep',
    },
  ];

  const mixState = { day: '', revision: -1, nonce: 0, lists: null };

  function invalidateMixes() {
    mixState.lists = null;
  }

  // Data that feeds the mixes changed: rebuild and refresh visible cards.
  function mixesChanged() {
    invalidateMixes();
    renderHomeMixes();
    if (state.view === 'mixes') renderMixes();
  }

  function mixPool() {
    const out = [];
    const seen = new Set();
    const add = (entry) => {
      if (!entry || !validEntry(entry) || entry.kind === 'radio') return;
      if (entry.kind === 'plugin' && !pluginReady(entry.pluginId)) return;
      const key = matchKey(entry);
      if (seen.has(entry.id) || (key && seen.has(key))) return;
      seen.add(entry.id);
      if (key) seen.add(key);
      out.push(entry);
    };

    state.recs.tracks.forEach(add);
    state.collection.favorites.forEach(add);
    state.collection.playlists.forEach((playlist) => playlist.items.forEach(add));
    history.forEach((row) => add(row.entry));
    state.library.entries.forEach(add);
    state.charts.tracks.forEach(add);
    state.releases.tracks.forEach(add);
    state.pluginCharts.items.forEach(add);
    return out;
  }

  function mixContext(pool = []) {
    const favoriteIds = new Set();
    const favoriteKeys = new Set();
    state.collection.favorites.forEach((entry) => {
      favoriteIds.add(entry.id);
      favoriteKeys.add(matchKey(entry));
    });

    const playlistIds = new Set();
    state.collection.playlists.forEach((playlist) =>
      playlist.items.forEach((entry) => playlistIds.add(entry.id))
    );

    const recIds = new Set(state.recs.tracks.map((entry) => entry.id));
    const last = new Map();
    const played = new Map();
    const knownArtists = new Set();
    history.forEach((row) => {
      last.set(row.entry.id, row.last);
      played.set(row.entry.id, row.plays);
      const key = tasteArtistKey(row.entry.artist);
      if (key) knownArtists.add(key);
    });
    state.collection.favorites.forEach((entry) => {
      const key = tasteArtistKey(entry.artist);
      if (key) knownArtists.add(key);
    });

    const days = (entry) => {
      const at = last.get(entry.id);
      return at ? (Date.now() - at) / DAY : 999;
    };
    const plays = (entry) => played.get(entry.id) || 0;
    const base = new Map();
    pool.forEach((entry) => base.set(entry, tasteScore(entry)));

    return {
      favoriteIds,
      favoriteKeys,
      playlistIds,
      recIds,
      knownArtists,
      days,
      plays,
      baseScore: (entry) => base.get(entry) || 0,
    };
  }

  function mixExcluded(entry) {
    return tasteTrackValue(entry) < 0 || tasteArtistValue(entry) < 0;
  }

  function mixNoise(entry, id) {
    const value = stringSeed(`${mixState.day}:${id}:${entry.id}:${mixState.nonce}`);
    return ((value % 1000) / 1000 - 0.5) * 1.1;
  }

  function mixScore(entry, id, ctx) {
    const base = ctx.baseScore(entry) + mixNoise(entry, id);
    const days = ctx.days(entry);
    const recent = days < 1 ? 2.2 : days < 3 ? 1.1 : 0;
    const artistKey = tasteArtistKey(entry.artist);

    if (id === 'daily') {
      const known = ctx.favoriteIds.has(entry.id) ? 0.9 : 0;
      const local = entry.kind === 'local' ? 0.25 : 0;
      const playlist = ctx.playlistIds.has(entry.id) ? 0.25 : 0;
      return base + known + local + playlist - recent;
    }

    if (id === 'fresh') {
      return (
        base +
        (ctx.recIds.has(entry.id) ? 1.6 : 0) +
        (artistKey && ctx.knownArtists.has(artistKey) ? 0.35 : 0) -
        (days < 7 ? 3 : 0) -
        (ctx.favoriteIds.has(entry.id) ? 2.5 : 0)
      );
    }

    if (id === 'discover') {
      const unknown = artistKey && !ctx.knownArtists.has(artistKey) ? 2.2 : -0.4;
      return (
        base * 0.85 +
        unknown +
        (ctx.recIds.has(entry.id) ? 0.5 : 0) -
        (days < 14 ? 2 : 0) -
        (ctx.favoriteIds.has(entry.id) ? 4 : 0)
      );
    }

    if (id === 'again') {
      return (
        base +
        Math.min(ctx.plays(entry), 8) * 0.45 +
        (ctx.favoriteIds.has(entry.id) ? 0.6 : 0) +
        (days > 45 ? 0.8 : 0) -
        (days < 14 ? 2.5 : 0)
      );
    }

    if (id === 'deep') {
      const plays = ctx.plays(entry);
      return (
        base +
        (plays === 0 ? 1.4 : plays < 3 ? 0.6 : 0) +
        (days > 30 ? 0.9 : 0) +
        (entry.kind === 'local' ? 0.25 : 0) -
        (days < 14 ? 2 : 0)
      );
    }

    return base;
  }

  function buildMixList(id, pool, ctx) {
    let candidates = pool.filter((entry) => !mixExcluded(entry));

    if (id === 'fresh') {
      candidates = candidates.filter(
        (entry) =>
          !ctx.favoriteIds.has(entry.id) &&
          !ctx.favoriteKeys.has(matchKey(entry)) &&
          !ctx.playlistIds.has(entry.id) &&
          ctx.days(entry) > 7
      );
    }

    if (id === 'discover') {
      candidates = candidates.filter((entry) => {
        const key = tasteArtistKey(entry.artist);
        return (
          key &&
          !ctx.knownArtists.has(key) &&
          !ctx.favoriteIds.has(entry.id) &&
          ctx.days(entry) > 14
        );
      });
    }

    if (id === 'again') {
      candidates = candidates.filter(
        (entry) => (ctx.favoriteIds.has(entry.id) || ctx.plays(entry) > 0) && ctx.days(entry) > 7
      );
    }

    if (id === 'deep') {
      candidates = candidates.filter(
        (entry) =>
          (ctx.playlistIds.has(entry.id) || entry.kind === 'local') &&
          !ctx.favoriteIds.has(entry.id)
      );
    }

    const scored = candidates
      .map((entry) => ({ entry, score: mixScore(entry, id, ctx) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MIX_LIMIT)
      .map((row) => row.entry);

    return seededShuffle(scored, stringSeed(`${mixState.day}:${id}:${mixState.nonce}`));
  }

  function ensureMixes(force = false) {
    const day = todayKey();
    const revision = Number(state.taste.revision) || 0;
    if (!force && mixState.lists && mixState.day === day && mixState.revision === revision) {
      return mixState.lists;
    }

    mixState.day = day;
    mixState.revision = revision;
    const pool = mixPool();
    const ctx = mixContext(pool);
    const lists = {};
    MIX_DEFS.forEach((def) => {
      lists[def.id] = buildMixList(def.id, pool, ctx);
    });
    mixState.lists = lists;
    return lists;
  }

  function mixById(id) {
    const lists = ensureMixes();
    return Array.isArray(lists[id]) ? lists[id] : [];
  }

  function mixDef(id) {
    return MIX_DEFS.find((def) => def.id === id) || null;
  }

  function mixArt(list, def) {
    const arts = [];
    list.forEach((entry) => {
      if (entry.artwork && arts.length < 4 && !arts.includes(entry.artwork)) arts.push(entry.artwork);
    });
    if (arts.length >= 4) {
      return `<div class="cover-grid">${arts
        .map((src) => `<img src="${esc(src)}" alt="" loading="lazy" />`)
        .join('')}</div>`;
    }
    if (arts.length) return `<img src="${esc(arts[0])}" alt="" loading="lazy" />`;
    return `<span class="mix-glyph">${ICONS[def.icon] || ICONS.spark}</span>`;
  }

  function mixCard(def, list, compact = false) {
    const empty = !list.length;
    return `
      <article class="mix-card ${compact ? 'compact' : ''}" data-mix-tone="${esc(def.tone)}">
        <div class="mix-art">
          ${mixArt(list, def)}
          <button class="mix-play" data-mix-action="play" data-mix-id="${esc(def.id)}" ${
            empty ? 'disabled' : ''
          } title="${empty ? 'Noch zu wenig Daten' : 'Mix abspielen'}">${ICONS.play}</button>
          <span class="mix-count">${list.length}</span>
        </div>
        <div class="mix-info">
          <div class="mix-heading">
            <span class="mix-ic">${ICONS[def.icon] || ICONS.spark}</span>
            <h3>${esc(def.title)}</h3>
          </div>
          <p>${esc(def.desc)}</p>
          <span class="mix-sub">${
            empty ? 'Hör ein paar Titel oder markiere ♥' : `${list.length} Titel · ${esc(def.subtitle)}`
          }</span>
        </div>
        ${
          compact
            ? ''
            : `<div class="mix-actions">
                 <button class="btn primary small mix-play-btn" data-mix-action="play" data-mix-id="${esc(def.id)}" ${
                   empty ? 'disabled' : ''
                 }>Abspielen</button>
                 <button class="btn ghost small mix-icon-btn" data-mix-action="shuffle" data-mix-id="${esc(def.id)}" ${
                   empty ? 'disabled' : ''
                 } title="Mix in zufälliger Reihenfolge spielen">${ICONS.shuffle}</button>
                 <button class="btn ghost small mix-icon-btn" data-mix-action="save" data-mix-id="${esc(def.id)}" ${
                   empty ? 'disabled' : ''
                 } title="Als Playlist speichern">${ICONS.plus}</button>
                 <button class="btn ghost small mix-icon-btn" data-mix-action="recipe" data-mix-id="${esc(def.id)}" title="Als Rezept speichern – eigene Smart-Playlist, erneuert sich täglich" aria-label="Als Rezept speichern">${ICONS.spark}</button>
               </div>`
        }
      </article>`;
  }

  function renderHomeMixes() {
    const host = $('#home-mixes');
    if (!host) return;
    const lists = ensureMixes();
    const visible = MIX_DEFS.filter((def) => (lists[def.id] || []).length);
    host.innerHTML = visible.length
      ? visible.map((def) => mixCard(def, lists[def.id] || [], true)).join('')
      : '<p class="muted small">Hör ein paar Titel oder markiere ♥ – dann baut CleanMusic hier deine Mixes.</p>';
  }

  function renderMixes() {
    const host = $('#view-mixes');
    if (!host) return;

    const lists = ensureMixes();
    const stats = tasteStats();
    const hasTaste = stats.likes + stats.dislikes + stats.skips > 0;
    const tasteCopy = hasTaste
      ? `${stats.likes}× mehr davon · ${stats.dislikes}× weniger davon · ${stats.skips} Skips in 30 Tagen`
      : stats.artists.length
        ? 'Deine Mixes nutzen schon Favoriten und Hörverlauf. Für noch bessere Treffer: Rechtsklick auf einen Titel → „Mehr davon“ oder „Weniger davon“.'
        : 'Noch kein Feedback gespeichert. Rechtsklick auf einen Titel → „Mehr davon“ oder „Weniger davon“.';
    const cards = MIX_DEFS.map((def) => mixCard(def, lists[def.id] || [])).join('');

    host.innerHTML = `
      <div class="page mixes-page">
        <div class="page-head">
          <div>
            <div class="eyebrow">Für dich</div>
            <h2>Deine Mixes</h2>
            <p>
              Aus deinen Favoriten, Playlists, lokalen Titeln und dem, was du wirklich hörst.
              „Mehr davon“ und „weniger davon“ (Rechtsklick auf einen Titel) schärfen das Ergebnis.
            </p>
          </div>
          <div class="page-actions">
            <button class="btn ghost small" data-mix-action="refresh">${ICONS.refresh} Neu mischen</button>
          </div>
        </div>

        <div class="mix-taste">
          <div class="mix-taste-copy">
            <strong>Dein Geschmack</strong>
            <p>${tasteCopy}</p>
          </div>
          ${
            stats.artists.length
              ? `<div class="mix-chips">${stats.artists
                  .map((name) => `<span class="mix-chip">${esc(name)}</span>`)
                  .join('')}</div>`
              : ''
          }
          <button class="btn ghost small" data-mix-action="reset" ${hasTaste ? '' : 'disabled'}>
            Zurücksetzen
          </button>
        </div>

        <div class="mix-grid">${cards}</div>
        <p class="muted small">
          Mixes werden einmal pro Tag neu gebaut und bleiben bis dahin stabil. „Speichern“ legt eine
          echte Playlist an; „Mischen“ spielt denselben Mix in zufälliger Reihenfolge.
        </p>
      </div>`;
  }

  function playMix(id, shuffleOrder = false) {
    const list = mixById(id);
    if (!list.length) {
      toast('Für diesen Mix fehlen noch Titel – hör ein paar Songs oder markiere Favoriten.');
      return;
    }
    const def = mixDef(id);
    const mixed = shuffleOrder || state.playback.shuffle;
    const items = mixed ? shuffled(list.slice()) : list.slice();

    if (shuffleOrder && !state.playback.shuffle) {
      state.playback.shuffle = true;
      writeJSON(STORAGE.playback, state.playback);
      syncPlaybackButtons();
    }

    state.queue = queueSlice.replace(items, 0, `mix:${id}`, { shuffleBase: mixed ? list.slice() : null });
    playFromQueue(0);
    toast(`${def ? def.title : 'Mix'} · ${items.length} Titel`);
  }

  function saveMix(id) {
    const list = mixById(id);
    const def = mixDef(id);
    if (!list.length || !def) {
      toast('Dieser Mix ist noch leer.');
      return;
    }
    const date = new Date();
    const name = `${def.title} · ${String(date.getDate()).padStart(2, '0')}.${String(
      date.getMonth() + 1
    ).padStart(2, '0')}.`;
    const existing = state.collection.playlists.find((playlist) => playlist.name === name);
    const playlist = existing || createPlaylist(name);
    addToPlaylist(playlist.id, list, { quiet: true });
    toast(
      existing
        ? `„${name}“ aktualisiert (${list.length} Titel)`
        : `„${name}“ gespeichert (${list.length} Titel)`
    );
  }

  async function resetTasteProfile() {
    const ok = await askConfirm({
      title: 'Geschmack zurücksetzen?',
      message: 'Mehr/weniger-davon, Skips und die daraus gebauten Mixes werden gelöscht. Favoriten und Verlauf bleiben.',
      confirm: 'Zurücksetzen',
      danger: true,
    });
    if (!ok) return;
    state.taste = { tracks: {}, artists: {}, skips: [], revision: (Number(state.taste.revision) || 0) + 1 };
    writeJSON(STORAGE.taste, state.taste);
    invalidateMixes();
    renderMixes();
    renderHomeMixes();
    scheduleRecsRefresh(600);
    toast('Geschmack zurückgesetzt');
  }

  function handleMixAction(action, id) {
    if (action === 'refresh') {
      mixState.nonce += 1;
      invalidateMixes();
      renderMixes();
      renderHomeMixes();
      toast('Mixes neu gemischt');
      return;
    }
    if (action === 'reset') {
      resetTasteProfile();
      return;
    }
    if (!mixDef(id)) return;
    if (action === 'play') playMix(id, false);
    else if (action === 'shuffle') playMix(id, true);
    else if (action === 'save') saveMix(id);
    else if (action === 'recipe') saveMixAsRecipe(id);
  }

  // System recipe → own smart playlist with the Mix's rules (renews daily, editable).
  function saveMixAsRecipe(id) {
    const def = mixDef(id);
    const rules = RECIPES.system(id);
    if (!def || !rules) return null;
    const name = `${def.title} (Rezept)`;
    const existing = state.collection.playlists.find((playlist) => playlist.smart && playlist.name === name);
    if (existing) {
      openPlaylist(existing.id);
      toast(`„${name}“ gibt es schon – hier kannst du die Regeln anpassen.`);
      return existing;
    }
    const playlist = createPlaylist(name, '', rules);
    rebuildSmartPlaylist(playlist, { quiet: true });
    onCollectionChanged({ playlists: true });
    openPlaylist(playlist.id);
    toast(`Rezept „${name}“ angelegt – ${playlist.items.length} Titel, erneuert sich täglich. Über „Regeln“ anpassen.`);
    return playlist;
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
    const playlist = playlistById(id);
    if (!playlist) return;
    state.currentPlaylist = id;
    if (playlist.smart && RECIPES.needsRefresh(playlist.smart, 'open')) {
      rebuildSmartPlaylist(playlist, { quiet: true });
      onCollectionChanged({ playlists: true });
    }
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
    const smart = Boolean(playlist.smart);
    const total = items.reduce((sum, entry) => sum + (Number(entry.duration) || 0), 0);
    const kinds = new Set(items.map((entry) => entry.sourceLabel).filter(Boolean));

    host.innerHTML = `
      <div class="page">
        <div class="page-head playlist-head">
          <div class="playlist-cover">${coverMosaic(playlist)}</div>
          <div class="playlist-meta">
            <div class="eyebrow">${smart ? 'Smart-Playlist' : playlist.preset ? 'Vorlage' : 'Playlist'}</div>
            <h2>${esc(playlist.name)}</h2>
            <p>${items.length} Titel${total ? ` · ca. ${fmtLong(total)}` : ''}${
              kinds.size ? ` · ${esc(Array.from(kinds).join(', '))}` : ''
            }${smart ? ` · ${esc(smartUpdatedLabel(playlist.smart.updatedAt))}` : ''}</p>
            ${smart ? `<div class="smart-chips">${smartRuleChips(playlist.smart)}</div>` : ''}
          </div>
          <div class="page-actions">
            ${
              smart
                ? `<button class="btn ghost small" data-pl-action="smart-rules">${ICONS.edit} Regeln</button>
                   <button class="btn ghost small" data-pl-action="smart-refresh">${ICONS.refresh} Aktualisieren</button>`
                : ''
            }
            ${items.length ? `<button class="btn ghost small" data-pl-action="share" title="Link kopieren – Freunde öffnen die Playlist in CleanMusic">${ICONS.copy} Teilen</button>` : ''}
            <button class="btn ghost small" data-pl-action="rename">${ICONS.edit} Umbenennen</button>
            <button class="btn ghost small danger" data-pl-action="delete">${ICONS.trash} Löschen</button>
            ${
              items.length
                ? `${
                    smart
                      ? ''
                      : `<button class="btn ghost small" data-pl-action="extend" ${
                          playlistExtendBusy.has(playlist.id) ? 'disabled' : ''
                        }>${ICONS.plus} ${playlistExtendBusy.has(playlist.id) ? 'Sucht …' : 'Erweitern'}</button>`
                  }
                   <button class="btn ghost small" data-pl-action="shuffle">${ICONS.shuffle} Shuffle</button>
                   <button class="btn primary small" data-pl-action="play">${ICONS.play} Abspielen</button>`
                : ''
            }
          </div>
        </div>

        ${
          items.length
            ? `<div class="song-list playlist-list">${items
                .map((entry, index) =>
                  songRow(entry, index, key, { handle: !smart, removable: !smart })
                )
                .join('')}</div>
               <p class="muted small">${
                 smart
                   ? 'Diese Liste entsteht aus Regeln. „Aktualisieren“ baut sie mit deiner aktuellen Musik neu.'
                   : 'Tipp: Titel per Drag & Drop sortieren – oder aus jeder Liste auf eine Playlist in der Seitenleiste ziehen.'
               }</p>`
            : smart
              ? `<div class="empty compact">
                   <div class="empty-icon">${ICONS.spark}</div>
                   <h3>Keine Treffer</h3>
                   <p>Keine Titel passen gerade zu den Regeln. Lockere die Filter oder nimm eine Quelle dazu.</p>
                   <button class="btn primary" data-pl-action="smart-rules">Regeln bearbeiten</button>
                 </div>`
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
   * Pre-made playlists ("Vorlagen")
   *
   * Every template exists as "stream-safe" (free licences only: NCS,
   * CC BY, CC0/Public Domain) and as "normal" (catalogue previews).
   * Creating one makes a real playlist – editable, sortable, backed up.
   * ---------------------------------------------------------------- */

  const PLAYLIST_PRESETS = window.CM_PLAYLIST_PRESETS || { presets: [], limit: 40 };
  let presetBusy = false;

  function presetById(id) {
    return (PLAYLIST_PRESETS.presets || []).find((preset) => preset.id === id) || null;
  }

  function presetPlaylist(id, kind) {
    const key = `${id}:${kind}`;
    return state.collection.playlists.find((playlist) => playlist.preset === key) || null;
  }

  // Round-robin so no single source fills the whole playlist.
  function mixPresetEntries(groups, limit) {
    const seen = new Set();
    const out = [];
    const queues = groups.map((group) => group.slice());

    while (out.length < limit) {
      let added = false;
      for (const queue of queues) {
        while (queue.length) {
          const entry = queue.shift();
          if (!entry || !entry.id || seen.has(entry.id)) continue;
          seen.add(entry.id);
          out.push(entry);
          added = true;
          break;
        }
        if (out.length >= limit) break;
      }
      if (!added) break;
    }
    return out;
  }

  async function streamSafePresetEntries(preset) {
    const variant = preset.safe || {};
    const groups = [];

    const classicsTab = CREATOR.tabs.find((tab) => tab.id === 'classics');
    if (classicsTab && variant.classics) {
      groups.push(
        classicsTab.tracks
          .filter((track) => variant.classics === 'all' || track.category === variant.classics)
          .map(classicEntry)
      );
    }

    const ncsIds = Array.isArray(variant.ncs) ? variant.ncs : variant.ncs ? [variant.ncs] : [];
    const ncsTab = CREATOR.tabs.find((tab) => tab.id === 'ncs');
    if (ncsTab) {
      for (const categoryId of ncsIds) {
        const category = ncsTab.categories.find((entry) => entry.id === categoryId);
        if (!category) continue;
        try {
          const result = await bridge.creatorPlaylist(category.playlist);
          groups.push(
            (Array.isArray(result.tracks) ? result.tracks : [])
              .map(ncsEntry)
              .filter(streamSafe)
          );
        } catch {
          /* next source */
        }
      }
    }

    if (variant.openverse) {
      try {
        const result = await bridge.creatorOpenverse({ kind: 'music', query: variant.openverse, page: 1 });
        groups.push(
          (Array.isArray(result.items) ? result.items : [])
            .map(openverseEntry)
            .filter(streamSafe)
        );
      } catch {
        /* nothing */
      }
    }

    return mixPresetEntries(groups, PLAYLIST_PRESETS.limit || 40);
  }

  async function normalPresetEntries(preset) {
    const query = preset.normal && preset.normal.query;
    if (!query) return [];
    try {
      const result = await bridge.searchCatalog(query);
      return (Array.isArray(result.tracks) ? result.tracks : [])
        .map(previewEntry)
        .filter((entry) => entry && entry.url)
        .slice(0, PLAYLIST_PRESETS.limit || 40);
    } catch {
      return [];
    }
  }

  async function createPresetPlaylist(presetId, kind, button) {
    const preset = presetById(presetId);
    if (!preset || presetBusy) return;

    const safe = kind === 'safe';
    const key = `${preset.id}:${safe ? 'safe' : 'normal'}`;
    const name = `${preset.title} · ${safe ? 'Stream-sicher' : 'Normal'}`;
    let playlist = presetPlaylist(preset.id, safe ? 'safe' : 'normal');
    const created = !playlist;
    if (!playlist) playlist = createPlaylist(name, key);

    presetBusy = true;
    const label = button ? button.innerHTML : '';
    if (button) {
      button.disabled = true;
      button.textContent = safe ? 'Sammle freie Titel …' : 'Sammle Titel …';
    }

    try {
      const entries = safe ? await streamSafePresetEntries(preset) : await normalPresetEntries(preset);
      if (!entries.length) {
        if (created) {
          state.collection.playlists = state.collection.playlists.filter((item) => item.id !== playlist.id);
          onCollectionChanged({ playlists: true });
        }
        toast(safe ? 'Keine freien Titel gefunden – bitte später erneut versuchen.' : 'Keine Titel gefunden – bitte später erneut versuchen.');
        if (state.view === 'presets') renderPresets();
        return;
      }

      const known = new Set(playlist.items.map((entry) => entry.id));
      const fresh = entries.filter((entry) => !known.has(entry.id));
      addToPlaylist(playlist.id, entries, { quiet: true });
      onCollectionChanged({ playlists: true });
      openPlaylist(playlist.id);

      const hint = !safe && streamSafeOn() ? ' · nicht stream-sicher' : '';
      if (created) toast(`Vorlage „${playlist.name}“ mit ${entries.length} Titeln angelegt${hint}`);
      else if (fresh.length) toast(`${fresh.length} Titel zu „${playlist.name}“ ergänzt${hint}`);
      else toast(`„${playlist.name}“ ist schon vollständig${hint}`);
    } finally {
      presetBusy = false;
      if (button) {
        button.disabled = false;
        button.innerHTML = label;
      }
    }
  }

  function renderPresets() {
    const host = $('#view-presets');
    if (!host) return;

    const presets = PLAYLIST_PRESETS.presets || [];
    if (!presets.length) {
      host.innerHTML = '<div class="page"><p class="muted small">Keine Vorlagen verfügbar.</p></div>';
      return;
    }

    const cards = presets
      .map((preset) => {
        const safe = presetPlaylist(preset.id, 'safe');
        const normal = presetPlaylist(preset.id, 'normal');
        return `
          <article class="preset-card" style="--preset:${esc(preset.color || 'var(--accent)')}">
            <div class="preset-top">
              <span class="preset-icon">${ICONS[preset.icon] || ICONS.note}</span>
              <div class="preset-heading">
                <h3>${esc(preset.title)}</h3>
                <span>${esc(preset.subtitle || '')}</span>
              </div>
            </div>
            <p class="preset-desc">${esc(preset.description || '')}</p>
            <div class="preset-sources">
              <span>Stream-sicher: NCS · CC BY · CC0</span>
              <span>Normal: Katalog · 30-s-Vorschau</span>
            </div>
            ${
              safe || normal
                ? `<div class="preset-saved">${[
                    safe ? `✓ ${safe.items.length} freie Titel` : '',
                    normal ? `${normal.items.length} Katalogtitel` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}</div>`
                : ''
            }
            <div class="preset-actions">
              <button class="btn primary small" data-preset-id="${esc(preset.id)}" data-preset-kind="safe">
                ${ICONS.plus} ${safe ? 'Stream-sicher ergänzen' : 'Stream-sicher anlegen'}
              </button>
              <button class="btn ghost small" data-preset-id="${esc(preset.id)}" data-preset-kind="normal">
                ${ICONS.plus} ${normal ? 'Normal ergänzen' : 'Normal anlegen'}
              </button>
            </div>
          </article>`;
      })
      .join('');

    host.innerHTML = `
      <div class="page">
        <div class="page-head">
          <div>
            <div class="eyebrow">Vorlagen</div>
            <h2>Fertige Playlists</h2>
            <p>
              Jede Vorlage gibt es zweimal: <strong>Stream-sicher</strong> nur mit freien Lizenzen
              (NCS, CC BY, CC0) – und <strong>Normal</strong> aus dem Katalog. Ein Klick legt eine
              echte Playlist an, die du umbenennen, sortieren und erweitern kannst.
            </p>
          </div>
          <div class="page-actions">
            <button class="btn ${streamSafeOn() ? 'primary' : 'ghost'} small" data-preset-action="streamsafe">
              ${streamSafeOn() ? '✓ Stream-sicher-Modus an' : 'Stream-sicher-Modus einschalten'}
            </button>
          </div>
        </div>

        <div class="preset-legend">
          <span><b>✓ Stream-sicher</b> NCS, CC BY und CC0 – mit Credit im Stream nutzbar.</span>
          <span><b>Normal</b> Katalogtitel als 30-s-Vorschau – Lizenz nicht garantiert.</span>
        </div>

        <div class="grid preset-grid">${cards}</div>
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
      // The first hit is the likely click – start loading it now.
      if (state.pluginSearch.results[0]) prefetchEntry(state.pluginSearch.results[0]);
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
    mixesChanged();
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
    // New files are appended, so the newest ones must survive the cap (a
    // folder can hold up to MAX_TRACKS = 5000 files in main.js).
    writeJSON(STORAGE.library, {
      folder: state.library.folder,
      tracks: state.library.tracks.slice(-5000),
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
      state.queue = queueSlice.replace([], -1, 'local');
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
    const allEntries = state.library.entries;
    const order = localOrder();
    const entries = order.map((original) => allEntries[original]);
    const tracks = order.map((original) => state.library.tracks[original]);
    const folder = state.library.folder;
    let lastDir = null;

    const rows = entries
      .map((entry, index) => {
        let group = '';
        if (localSort === 'folder' && entry.dir !== lastDir) {
          lastDir = entry.dir;
          const count = entries.filter((item) => item.dir === entry.dir).length;
          group = `<tr class="local-group"><td colspan="5"><span class="local-group-name">📁 ${esc(entry.dir || 'Ordner')}</span><span class="muted small">${count} Titel</span>${moodSelect(entry.dir || '')}</td></tr>`;
        }
        const playing = isPlayingId(entry.id);
        const fav = favIds.has(entry.id);
        return group + `
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

    const body = allEntries.length
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
        ${allEntries.length ? localToolbar() : ''}
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

  // Matches that only played silence (e.g. a re-upload whose sound was muted
  // over a copyright claim). The plugin is asked to skip them next time.
  const silentRefs = new Set(
    (readJSON(STORAGE.silentRefs, []) || []).filter((ref) => typeof ref === 'string' && ref).slice(-300)
  );

  function markSilentRef(refId) {
    if (!refId) return;
    silentRefs.delete(refId);
    silentRefs.add(refId);
    writeJSON(STORAGE.silentRefs, Array.from(silentRefs).slice(-300));
  }

  function forgetMatch(item) {
    const plugin = matchPlugin();
    if (!plugin || !item) return;
    const key = `${plugin.id}|${matchKey(item)}`;
    if (!state.matches[key]) return;
    delete state.matches[key];
    writeJSON(STORAGE.matches, state.matches);
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

    if (known && plugin.capabilities.resolve && !silentRefs.has(known)) {
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
      force: Boolean(force && (!known || silentRefs.has(known))),
      exclude: Array.from(silentRefs).slice(-100),
    });

    if (!result || !result.ok) {
      throw new Error((result && result.error) || 'Kein voller Titel gefunden');
    }
    // An older plugin ignores `exclude` and may hand the muted upload back.
    if (result.stream.refId && silentRefs.has(result.stream.refId)) {
      throw new Error('Kein voller Titel mit Ton gefunden');
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
        // The plugin found no stream (or it expired): still play the catalogue
        // preview instead of leaving the player silent.
        const preview = await freshPreview(item, force).catch(() => null);
        if (preview) {
          return {
            url: preview,
            mode: 'preview',
            notice: `${plugin.name}: ${(result && result.error) || 'Stream nicht verfügbar'} – 30-s-Vorschau läuft.`,
          };
        }
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
    return (
      item.kind === 'plugin' ||
      // Expired preview URLs are refreshed through the catalog – that takes
      // a moment, so the old title must not keep playing underneath.
      (item.kind === 'preview' && (fullMode() || !item.url || previewExpired(item.url)))
    );
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
    previewStop();

    state.queue.index = index;
    state.queue.upcoming = -1;
    state.fallbackUrls = [];
    if (!options.retry) state.retry = { id: item.id, count: 0 };
    const token = ++playToken;

    const live = item.kind === 'radio';
    const seek = $('#seek');
    seek.disabled = live;
    seek.max = '0';
    seek.value = '0';
    setSeekFill(seek, 0, 1);
    $('#t-cur').textContent = live ? 'LIVE' : '0:00';
    $('#t-dur').textContent = live ? 'LIVE' : item.duration ? fmtTime(item.duration) : '0:00';

    const seekRow = seek.closest('.seek-row');
    if (seekRow) seekRow.hidden = live;
    const liveIndicator = $('#live-indicator');
    if (liveIndicator) liveIndicator.hidden = !live;

    const slow = needsSlowResolve(item);
    if (slow) {
      // Unload the previous title: otherwise Play (or a media key) would
      // resume the old song under the new title, and a failed resolve would
      // leave it playable.
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }

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
    state.nowRef = (source.stream && source.stream.refId) || '';
    state.fallbackUrls =
      source.stream && Array.isArray(source.stream.alternates) ? source.stream.alternates.slice(0, 3) : [];
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

  /* Shuffle works on the real queue order: the running title stays, everything
   * after it is mixed once. Titles the user queued or requested stay in front;
   * no title repeats before the whole list has played. Turning shuffle off
   * restores the order saved when it was switched on. */

  function shuffleQueueTail(snapshot = false) {
    queueSlice.shuffle(snapshot);
  }

  function restoreQueueTail() {
    queueSlice.restore();
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

    state.queue.upcoming = CMQueue.upcomingIndex(items, index, state.playback.repeat);
    if (state.fullscreen) renderUpNext();
  }

  function schedulePrefetch() {
    clearTimeout(prefetchTimer);
    pushPlayerState(); // the queue changed – overlays show "Als Nächstes"
    if (!anyPluginReady()) return;

    // Resolve the next track while this one plays – plugins may need a few
    // seconds per title, the next one should start instantly.
    // The next two at once – the plugin bundles them into one start.
    prefetchTimer = setTimeout(() => {
      const { items, upcoming } = state.queue;
      const targets = [items[upcoming]];
      // The queue is in real playback order (shuffle included), so the title
      // after the next one can be prepared as well.
      if (upcoming >= 0) targets.push(items[upcoming + 1]);
      targets.filter(Boolean).forEach((entry) => {
        const task = prefetchPluginEntry(entry);
        if (task) task.catch(() => {});
      });
    }, 1500);
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

    if (direction > 0) noteSkip(currentItem());

    if (direction > 0 && autoplayEligible()) {
      const queue = state.queue;
      // Remember where the user was: if they pick another title while the
      // recommendations load, the queue index changes and we must not jump
      // ahead afterwards.
      const at = queue.index;
      const task = maybeAutoplay();
      if (task) {
        task.then(() => {
          if (state.queue === queue && queue.index === at && at < queue.items.length - 1) {
            playFromQueue(at + 1);
          }
        });
        return;
      }
    }

    const next = CMQueue.nextIndex(items.length, state.queue.index, direction, state.queue.upcoming);

    // A new round with shuffle gets a freshly mixed order.
    if (
      direction > 0 &&
      next === 0 &&
      state.playback.shuffle &&
      state.playback.repeat === 'all' &&
      items.length > 1
    ) {
      state.queue.items = shuffled(items);
      state.queue.index = 0;
      playFromQueue(0);
      return;
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
      } else if (mode === 'preview' || item.kind === 'preview') {
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
    const why = $('#btn-np-why');
    if (!fav || !add) return;

    fav.disabled = !item;
    add.disabled = !item;
    if (why) why.disabled = !item;
    const on = Boolean(item && favIds.has(item.id));
    fav.classList.toggle('on', on);
    fav.title = on ? 'Aus Favoriten entfernen' : 'Zu Favoriten';
  }

  function whyOrigin(item) {
    if (item.requestedBy) return `Songwunsch von ${item.requestedBy}`;
    if (item.autoplay) return 'Autoplay – passend zum letzten Titel';
    if (item.queued) return 'Von dir als Nächstes eingereiht';
    const kind = String(state.queue.kind || '');
    if (kind.startsWith('playlist:')) {
      const playlist = playlistById(kind.slice('playlist:'.length));
      return playlist
        ? `Aus der Playlist „${playlist.name}“${playlist.smart ? ' (Smart-Playlist)' : ''}`
        : 'Aus einer Playlist';
    }
    if (kind.startsWith('mix:')) {
      const id = kind.slice('mix:'.length);
      const mix = (typeof MIX_DEFS !== 'undefined' ? MIX_DEFS : []).find((entry) => entry.id === id);
      return mix ? `Aus dem Mix „${mix.title}“` : 'Aus einem Mix';
    }
    if (kind === 'charts') return 'Aus Charts & Neuheiten';
    if (kind === 'search') return 'Aus deiner Suche';
    if (kind === 'radio') return 'Live-Radio';
    if (kind === 'creator') return 'Aus dem Cutter-Modus';
    if (kind === 'local') return 'Aus deiner lokalen Bibliothek';
    if (kind === 'queue') return 'Direkt abgespielt oder eingereiht';
    return 'Aus der aktuellen Liste';
  }

  function whyCurrent() {
    const item = currentItem();
    if (!item) return;
    const kindLabel =
      {
        preview: '30-Sekunden-Vorschau',
        plugin: 'Quelle-Plugin',
        stream: 'Freier Stream',
        local: 'Lokale Datei',
        radio: 'Live-Radio',
      }[item.kind] || item.sourceLabel || item.kind;
    const license = item.license || (item.ytLicense === 'cc-by' ? 'CC BY (Plugin bestätigt)' : '');
    const safe = streamSafe(item);
    const rows = [
      ['Herkunft', whyOrigin(item)],
      ['Quelle', [item.sourceLabel, kindLabel].filter(Boolean).join(' · ')],
      ['Lizenz', license || 'Keine Lizenzangabe'],
      ['Stream-sicher', safe ? 'Ja – mit Credit im Stream nutzbar' : 'Nein oder unbekannt'],
    ];
    const recipeList = String(state.queue.kind || '').startsWith('playlist:')
      ? playlistById(state.queue.kind.slice('playlist:'.length))
      : null;
    if (recipeList && recipeList.smart) {
      rows.push(['Rezept', RECIPES.explain(recipeList.smart, item.id, {
        bpm: Number(bpmCache[item.id]) || 0,
        mood: moodOf(item) || '',
      })]);
    }
    if (item.duration) rows.push(['Länge', fmtLong(item.duration)]);
    if (item.path) rows.push(['Datei', item.path]);

    const credit = item.credit
      ? `<div class="why-block"><span>Credit</span><pre class="why-credit">${esc(item.credit)}</pre></div>`
      : '';
    const actions = [
      item.credit ? '<button type="button" class="btn ghost small" data-why-copy>Credit kopieren</button>' : '',
      item.link ? '<button type="button" class="btn ghost small" data-why-link>Im Dienst öffnen</button>' : '',
    ]
      .filter(Boolean)
      .join('');
    const html = `
      <div class="why-grid">
        ${rows
          .map(
            ([label, value]) =>
              `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`
          )
          .join('')}
      </div>
      ${
        state.queue.kind.startsWith('playlist:') &&
        playlistById(state.queue.kind.slice('playlist:'.length))?.smart
          ? `<div class="why-chips">${smartRuleChips(
              playlistById(state.queue.kind.slice('playlist:'.length)).smart
            )}</div>`
          : ''
      }
      ${credit}
      ${actions ? `<div class="why-actions">${actions}</div>` : ''}`;

    const promise = openDialog({
      title: 'Warum läuft das?',
      html,
      input: false,
      confirm: 'Schließen',
      info: true,
      className: 'why-dialog',
    });
    const root = $('#dialog');
    root.querySelector('[data-why-copy]')?.addEventListener('click', async () => {
      const copied = await bridge.copyText(item.credit);
      toast(copied ? 'Credit in die Zwischenablage kopiert.' : 'Kopieren fehlgeschlagen.');
    });
    root.querySelector('[data-why-link]')?.addEventListener('click', () => {
      if (item.link) bridge.openExternal(item.link);
    });
    return promise;
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
    const repeat = CMPlayback.repeatMode(state.playback.repeat);

    shuffleButton.classList.toggle('active', Boolean(state.playback.shuffle));
    shuffleButton.title = CMPlayback.shuffleTitle(state.playback.shuffle);

    repeatButton.classList.toggle('active', CMPlayback.repeatActive(repeat));
    repeatButton.classList.toggle('repeat-one', CMPlayback.repeatOne(repeat));
    const fsShuffle = $('#fs-shuffle');
    const fsRepeat = $('#fs-repeat');
    if (fsShuffle) fsShuffle.classList.toggle('active', Boolean(state.playback.shuffle));
    if (fsRepeat) {
      fsRepeat.classList.toggle('active', CMPlayback.repeatActive(repeat));
      fsRepeat.classList.toggle('repeat-one', CMPlayback.repeatOne(repeat));
    }

    repeatButton.title = CMPlayback.repeatLabel(repeat);
  }

  function wirePlayer() {
    const playButton = $('#btn-play');

    playButton.addEventListener('click', () => {
      if (!audio.src) return;
      if (audio.paused) audio.play().catch(() => {});
      else {
        // A running crossfade keeps the old title alive in a second element –
        // Pause must silence that too.
        stopGhost();
        audio.pause();
      }
    });

    $('#btn-prev').addEventListener('click', () => {
      if (audio.currentTime > 4 && Number.isFinite(audio.duration)) {
        audio.currentTime = 0;
        return;
      }
      stepQueue(-1);
    });
    $('#btn-next').addEventListener('click', () => stepQueue(1));
    $('#btn-mini').addEventListener('click', async () => {
      const opened = await bridge.miniOpen();
      if (!opened) toast('Mini-Player konnte nicht geöffnet werden.');
    });

    $('#btn-shuffle').addEventListener('click', () => {
      const on = !state.playback.shuffle;
      state.playback.shuffle = on;
      writeJSON(STORAGE.playback, state.playback);
      if (state.queue.items.length) {
        if (on) shuffleQueueTail(true);
        else restoreQueueTail();
      }
      syncPlaybackButtons();
      planUpcoming();
      schedulePrefetch();
      renderQueuePanel();
    });

    $('#btn-repeat').addEventListener('click', () => {
      state.playback.repeat = CMPlayback.nextRepeat(state.playback.repeat);
      writeJSON(STORAGE.playback, state.playback);
      syncPlaybackButtons();
    });

    syncPlaybackButtons();

    $('#btn-np-why').addEventListener('click', whyCurrent);
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
      if (state.playback.repeat === 'off' && atEnd) {
        // Autoplay keeps going after the last title – also after song requests.
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

      // Streams: 0) try another URL the plugin offered, 1) same URL again
      // after a moment (some CDNs reject the first request), 2) resolve a
      // fresh URL, 3) fall back to the catalogue preview, 4) give up.
      if (!state.retry || state.retry.id !== item.id) state.retry = { id: item.id, count: 0 };
      const retry = state.retry;
      const streamed = state.nowMode === 'plugin' || state.nowMode === 'matched';

      if (streamed && state.fallbackUrls.length) {
        const next = state.fallbackUrls.shift();
        const token = playToken;
        setTimeout(() => {
          if (token !== playToken) return;
          audio.src = next;
          audio.play().catch(() => {});
        }, 300);
        return;
      }

      if (item.kind !== 'local' && item.kind !== 'radio' && retry.count < 2) {
        retry.count += 1;

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

      // A full title that still fails after a fresh resolve: play the 30 s
      // preview instead of leaving the queue silent.
      if (streamed && !retry.preview) {
        retry.preview = true;
        const token = playToken;
        freshPreview(item, true)
          .then((url) => {
            if (token !== playToken) return;
            if (url) {
              state.nowMode = 'preview';
              state.nowLabel = null;
              setNowPlaying(item);
              audio.src = url;
              audio.play().catch(() => {});
              toast('Voller Titel nicht verfügbar – 30-s-Vorschau läuft.');
              return;
            }
            state.nowMode = 'error';
            setNowPlaying(item);
            toast('Der Titel konnte nicht abgespielt werden.');
          })
          .catch(() => {
            if (token !== playToken) return;
            state.nowMode = 'error';
            setNowPlaying(item);
            toast('Der Titel konnte nicht abgespielt werden.');
          });
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
      setSeekFill($('#seek'), audio.currentTime, audio.duration);
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
      setSeekFill(seek, audio.currentTime, audio.duration);
      $('#t-cur').textContent = fmtTime(audio.currentTime);
      updateFsProgress();
    });

    // Once a title has really played, a later mid-stream error gets the full
    // retry chain again (fresh URL, alternates) instead of jumping straight
    // to the 30 s preview.
    audio.addEventListener('timeupdate', () => {
      if (state.retry && audio.currentTime > 5 && state.retry.count > 0) {
        state.retry = { id: state.retry.id, count: 0 };
      }
    });

    audio.addEventListener('timeupdate', checkSilence);

    $('#seek').addEventListener('input', (event) => {
      const value = Number(event.target.value);
      if (Number.isFinite(value)) audio.currentTime = value;
      setSeekFill(event.target, value, audio.duration);
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
    '2.0.0': [
      'Freunde: Du siehst jetzt, was deine Freunde gerade hören, und reagierst mit einem Emoji. Kontakt nur per Freundescode – kein Chat, keine Suche nach Personen.',
      'Gruppen: Eine gemeinsame Wochenkarte (wer hört am meisten?) und eine geteilte Gruppen-Playlist – beitreten nur per Gruppencode.',
      'Ganz ohne Konto mit E-Mail oder Passwort: Dein Gerät erzeugt einen Schlüssel, der private Teil bleibt verschlüsselt auf diesem PC. Mehr dazu unter „Datenschutz für Social“ – abschaltbar.',
    ],
    '1.28.0': [
      'Neuer Songtext-Effekt „Lyric Video“: Kinetic Typography im TikTok-/Shorts-Stil – gestapelte Wörter in Condensed-Großbuchstaben, ein Schlüsselwort in der Coverfarbe, Hell/Dunkel-Wechsel auf den Beat.',
      'Supporter-Extras zum Ausprobieren: Neue Installationen haben alle mit ♥ markierten Extras 7 Tage frei. Wer in 1.27.0 noch nicht freigeschaltet hatte, bekommt die 7 Tage ab jetzt.',
      'Nach der Probezeit springen Theme, Hintergrund, Songtext-Effekt und Visualizer-Stil auf den Standard zurück. Den Freischalt-Code gibt es kostenlos auf Ko-fi und im Discord – eine Spende ist freiwillig und kauft nichts Exklusives.',
      'Neu in der Seitenleiste: „Unterstützen“ mit ♥ – führt zu Ko-fi bzw. zum Freischalt-Dialog.',
    ],
    '1.27.0': [
      'Stumme Titel: Hat ein automatisch gefundener voller Titel keinen Ton (zum Beispiel ein stummgeschalteter Upload), sucht CleanMusic nach wenigen Sekunden selbst einen anderen – jetzt auch bei ausgeschaltetem Visualizer.',
      'Supporter-Extras: Ein paar optische Extras sind mit ♥ markiert und fragen einmal nach einem Code. Den bekommt jeder kostenlos – er steht auf Ko-fi und im Discord. Wer CleanMusic schon genutzt hat, hat alles frei.',
      'CleanMusic unterstützen: Unter Einstellungen → System gibt es jetzt einen Ko-fi-Link. Freiwillig – eine Spende kauft nichts Exklusives.',
      'OBS-Audio-Visualizer 1.3.0 (optionales Plugin): sechs neue Stile, Farbverläufe, Glättung, Frequenzbereich und Pegelanzeige.',
    ],
    '1.26.0': [
      'Playlists teilen: Der neue Knopf „Teilen“ in jeder Playlist kopiert einen Link. Deine Freunde tippen drauf, sehen die Titelliste und übernehmen die Playlist in ihr CleanMusic – ohne Konto, ohne Server.',
      'Discord: Wer dein Profil ansieht, bekommt den Knopf „In CleanMusic anhören“ und öffnet den Song direkt bei sich. Lokale Dateien und Radio werden nie geteilt; abschaltbar unter Einstellungen → Verbindungen.',
      'Songtexte: Bei 30-Sekunden-Vorschauen steht jetzt dran, warum der Text nicht mitläuft – vorher blieb die Liste manchmal einfach stehen.',
    ],
    '1.25.0': [
      'Plugins mit Berechtigungen: Bevor du ein Plugin aktivierst, zeigt CleanMusic, was es darf – z. B. Wiedergabe steuern, Live-Spektrum lesen oder ins Internet. Riskante Rechte stehen ganz oben.',
      'Was ein neues Plugin nicht angibt, bekommt es über CleanMusic auch nicht. Ältere Plugins (wie OBS-Overlay und Streamer.bot) laufen unverändert weiter.',
      'Plugins können Auswahllisten in ihren Einstellungen jetzt selbst füllen, z. B. mit einer Geräteliste.',
    ],
    '1.24.0': [
      'Wochenkarte mit Link: Deine Karte enthält jetzt einen Link – deine Freunde tippen drauf, CleanMusic öffnet sich und fragt, ob die Karte in die Gruppe soll.',
      'Mixes als Rezept: Der neue Funken-Knopf an jedem Mix legt eine eigene Smart-Playlist mit denselben Regeln an, die sich täglich erneuert und die du anpassen kannst.',
    ],
    '1.23.0': [
      'Neu im Rückblick: Gruppe – wer hört diese Woche am meisten? Kopiere deine Wochenkarte, schick sie in eure WhatsApp- oder Discord-Gruppe und füge die Codes der anderen ein.',
      'Die Rangliste entsteht nur bei dir: kein Konto, kein Server. Geteilt wird nur, was in der Karte steht (Name, Hörzeit, Titelzahl, Top-Künstler).',
      'CleanMusic zählt dafür ab jetzt auch deine Hörzeit pro Woche.',
    ],
    '1.22.0': [
      'Smart-Playlists aktualisieren sich auf Wunsch selbst: beim Öffnen oder einmal am Tag – oder wie bisher nur per Knopf.',
      'Neue Filter: Tempo (BPM von–bis), Stimmung (Chill, Party, Workout, Fokus, Gaming, Traurig) und Art (lokal, Vorschau, volle Titel, freie Musik).',
      '„Warum läuft das?“ zeigt bei Smart-Playlists, aus welcher Quelle und nach welcher Regel ein Titel ausgewählt wurde.',
    ],
    '1.21.0': [
      'Datensicherung bei Updates: Muss ein Update deine gespeicherten Daten umbauen, legt CleanMusic vorher automatisch eine Sicherung an (die letzten fünf bleiben).',
      'Beschädigte Einträge werden nicht mehr stillschweigend überschrieben, sondern beiseitegelegt – CleanMusic sagt dir, was betroffen war.',
      'Backups merken sich ihre Datenversion; Sicherungen aus einer neueren CleanMusic-Version werden nicht versehentlich eingespielt.',
      'Die Diagnose zeigt jetzt Daten-Schema und Quarantäne.',
    ],
    '1.20.1': [
      'Neuer Info-Knopf im Player: „Warum läuft das?“ zeigt Herkunft, Quelle, Lizenz, Stream-sicher-Status und Länge – bei lokalen Titeln auch die Datei.',
      'Credits lassen sich dort direkt kopieren, Links im Dienst öffnen; Smart-Playlists zeigen ihre Regel-Chips.',
      'Der Assistent merkt sich, ob du die Hintergrundmusik willst, und startet sie beim nächsten Öffnen entsprechend.',
      'Das Dienstemenü an Titeln scrollt jetzt, wenn viele Dienste verfügbar sind.',
    ],
    '1.20.0': [
      'Erste Schritte mit leiser Hintergrundmusik: „Thinking Music“ von Kevin MacLeod (CC BY 4.0), mit Musik-Knopf und sauberem Ausblenden beim Schließen.',
      'Dienste in der Seitenleiste aufgeräumt: vier häufige Dienste sichtbar, der Rest hinter „Weitere Dienste“; Creator lässt sich separat ausklappen.',
      'Neu: Qobuz, Bandcamp und Audius als offizielle Web-Player – zusammen mit YouTube Music, Spotify, Apple Music, SoundCloud, Deezer, TIDAL und Amazon Music.',
      'Start und Bibliothek neu sortiert, Playlists alphabetisch (Smart-Playlists zuerst).',
      'Die Update-Karte zeigt jetzt alle Änderungen seit deiner vorherigen Version, nicht nur die neueste.',
    ],
    '1.19.0': [
      'Smart-Playlists: Regeln aus Favoriten, lokaler Musik, Verlauf, anderen Playlists, Vorschlägen und Charts – mit Live-Vorschau und einem Klick aktualisieren.',
      'Filter nach stream-sicher, Credit, „seit X Tagen nicht gehört“ und Dislikes; Limit von 5 bis 100 Titeln.',
      'Neuer Seitenleisten-Knopf „Smart-Playlist“: smarte Listen tragen ein Funken-Symbol und zeigen ihre Regeln im Kopf.',
      'Titel in japanischer, kyrillischer oder griechischer Schreibweise werden nicht mehr fälschlich zusammengefasst – das gilt auch für „Mehr/Weniger davon“.',
      'Alles bleibt lokal: Smart-Playlists lösen keine neuen Suchen oder Netzwerkabfragen aus.',
    ],
    '1.18.1': [
      'Wiedergabe: Vorschauen mit abgelaufener Adresse laden im Hintergrund nach – „Play“ startet nie mehr den vorherigen Titel.',
      'Crossfade: Pause und Stummschalten wirken sofort, auch mitten in der Überblendung.',
      'Startseite: „Deine Musik“ zeigt und spielt dieselben Titel, auch mit Ordner-Sortierung und Stimmungen.',
      'Cutter: Die Wellenform bleibt nach schnellem Titelwechsel nicht mehr hängen, und die Tempo-Messung lässt sich nach einem Fehler wiederholen.',
      'OBS-Visualizer bleibt live, auch wenn der Visualizer in der App ausgeschaltet ist.',
      'Katalogsuche findet auch Titel in japanischer, kyrillischer oder griechischer Schreibweise.',
      'Sicherer und robuster: Einstellungen werden crash-sicher gespeichert, hängende Update-Downloads brechen ab, große Cutter-Downloads schonen den Speicher.',
      'Chrome-Erweiterung 2.0 (Zip im Release): Knöpfe auf YouTube, Rechtsklick-Menüs, drei Tastenkürzel, Einstellungen und eine Einrichtungsseite.',
    ],
    '1.18.0': [
      'Chrome-Erweiterung „CleanMusic für YouTube“: Knopf im Player und Toolbar-Popup – Video zur Warteschlange hinzufügen oder direkt in CleanMusic abspielen.',
      'Neue Deep-Link-Aktion cleanmusic://add: Ein Titel landet in der Warteschlange, ohne die laufende Wiedergabe zu unterbrechen.',
      'Spielt, aber kein Ton? CleanMusic prüft die Wiedergabe selbst: Volle Plugin-Titel werden einmal neu geladen, danach läuft die 30-s-Vorschau – Vorschauen und lokale Titel bekommen einen Hinweis.',
      'Crossfade abgesichert: Ein abgebrochener Übergang kann die Lautstärke nicht mehr auf 0 hängen lassen.',
    ],
    '1.17.0': [
      'Taste Engine: „Mehr davon“ und „Weniger davon“ per Rechtsklick oder +-Menü an jedem Titel – wird lokal gespeichert und für Vorschläge, Autoplay und Mixes genutzt.',
      'Fünf Smart Mixes: Dein Mix, Neu für dich, Entdecken, Nochmal und Tiefe Schnitte – auf der Startseite und in der neuen Mixes-Ansicht.',
      'Mixes lassen sich als Playlist speichern, täglich neu mischen und reagieren auch auf frühe Skips. Alles bleibt auf deinem Gerät.',
      'Einstellungen jetzt in sechs Kategorien (Wiedergabe, Klang, Darstellung, Plugins, Verbindungen, System) statt einer langen Seite.',
      'Playlist „Erweitern“ zeigt die gefundenen Titel vorher in einem Dialog – alle vorausgewählt, einzeln abwählbar.',
      'OBS-Visualizer: Anzahl der Balken, Breite in Prozent und Abstand sind einstellbar.',
      'Robustere Quellen-Plugins: alternative Stream-URLs, Request-Header und automatischer Fallback auf die 30-s-Vorschau, wenn ein voller Titel nicht abspielbar ist.',
    ],
    '1.16.0': [
      'Shuffle mischt jetzt die echte Warteschlange: kein Titel kommt doppelt, bevor alle dran waren; Ausschalten stellt die alte Reihenfolge wieder her.',
      'Autoplay läuft, wenn die Warteschlange endet – auch nach Songwünschen. Abschaltbar in der Warteschlange und unter Einstellungen → Wiedergabe.',
      'Playlists lassen sich mit einem Klick erweitern: passende neue Titel zu den Künstlern, die schon drin sind.',
    ],
    '1.15.0': [
      'OBS-Audio-Visualizer als optionales Plugin: echte Spektren als Balken, Spiegel, Kreis oder Welle – mit den Farben des Covers.',
      'Plugin-API: Overlays können jetzt das Live-Spektrum abonnieren (visualizer: true) – nur bei Bedarf, ohne die Wiedergabe umzuleiten.',
      'Anleitung und fertiges Plugin: extras/plugins/README.md.',
    ],
    '1.14.0': [
      'Vorlagen (Seitenleiste): acht fertige Playlists für Gaming, Chill, Episch, Fokus, Workout und mehr – mit einem Klick als echte Playlist.',
      'Jede Vorlage gibt es stream-sicher (nur NCS, CC BY und CC0, mit Credit nutzbar) und normal (Katalogtitel als 30-s-Vorschau).',
      'Vorlagen lassen sich erneut anklicken: CleanMusic ergänzt neue Titel und zeigt die Playlist danach direkt an.',
    ],
    '1.13.1': [
      'Vollbild-Leistung: neue Stufen Sparmodus, Ausgewogen und Qualität begrenzen Bildrate, Auflösung und Blur-Effekte.',
      'Der Vollbild-Visualizer lässt sich jetzt getrennt abschalten; der Mini-Visualizer bleibt unabhängig.',
      'Ausgewogen ist Standard und reduziert die GPU-Last deutlich, ohne Ton oder EQ-Kette zu verändern.',
    ],
    '1.13.0': [
      '10-Band-Equalizer mit neun Presets und bis zu zehn eigenen Presets; Bass und Höhen bleiben erhalten.',
      'Cutter-Projekte sammeln Musik-Credits; WAV-Ausschnitte können Fades, Normalisierung und Loop-Übergang enthalten.',
      'Dein Rückblick lässt sich als Story/Post-Bild ohne Cover speichern oder kopieren; wöchentliche Backups sind optional.',
      'Neue Live-Hintergründe, eigenes stummes Video/GIF und bewegte Vollbild-Hintergründe mit Leistungs- und Akku-Optionen.',
    ],
    '1.12.0': [
      'Handy-Fernbedienung im privaten WLAN: Wiedergabe, Lautstärke, Warteschlange und Vorschau-Suche – standardmäßig aus, mit Schlüssel und QR-Code.',
      'Mini-Player, Windows-Taskleistenknöpfe und Fortschritt, optionale globale Tastenkürzel sowie Start mit Windows.',
      'Windows zeigt neue Versionen sofort als Systembenachrichtigung, auch wenn CleanMusic im Infobereich minimiert ist.',
      '„Diagnose kopieren“ für Fehlerberichte; der Text bleibt im Arbeitsspeicher und ersetzt den Benutzerordner durch ~.',
    ],
    '1.11.2': [
      'Plugin-Einstellungen: neuer Knopf „Speichern“ übernimmt alle Felder auf einmal – Änderungen gehen nicht mehr verloren, wenn man direkt ins nächste Feld klickt.',
    ],
    '1.11.1': [
      'Playlist-Import: CSV-Dateien mit Spalte „Song“ statt „Track Name“ und Längen wie 3:45 werden jetzt erkannt (z. B. Exporte von Playlist-Analyse-Seiten).',
    ],
    '1.11.0': [
      'Neue Songtext-Effekte: Neon (flackerndes Leuchten), Welle (Wörter wippen im Takt), Schreibmaschine (Buchstabe für Buchstabe) und Zoom.',
      'Neue Spektrum-Stile: Spiegel (wächst aus der Mitte nach oben und unten) und Partikel (leuchtende Punkte steigen mit der Musik auf).',
    ],
    '1.10.1': [
      'Updates auch im Hintergrund: CleanMusic sucht alle 2 Stunden, solange es läuft – mit Windows-Benachrichtigung.',
      'Neuer, deutlich hörbarer Update-Gong (nur stumm, wenn du CleanMusic stummgeschaltet hast).',
    ],
    '1.10.0': [
      'Songtext-Effekte: Pop (Zeile springt hoch), Karaoke (füllt sich im Takt) und Motion (große Zeile, Wörter poppen einzeln rein – wie in Lyric-Videos).',
      'Umschalten im Vollbild-Player („Effekt: …“) oder unter Einstellungen → Wiedergabe → Songtexte.',
    ],
    '1.9.1': [
      'Schärfere Cover: Apple Music und Deezer liefern jetzt die großen Bilder – vor allem im Vollbild-Player und beim Plattenspieler zu sehen.',
      'Visualizer: verbindet sich zuverlässiger mit dem Ton und reagiert lebendiger auf leise Songs.',
    ],
    '1.9.0': [
      'Plattenspieler: Das Cover dreht sich als Schallplatte, im Vollbild-Player setzt der Tonarm beim Abspielen auf und hebt bei Pause ab.',
      'Einschalten: Einstellungen → Aussehen → Plattenspieler, oder im Vollbild oben rechts das Platten-Symbol.',
      'Visualizer: Friert er ein (z. B. nach einem Wechsel des Ausgabegeräts), verbindet er sich nach wenigen Sekunden von selbst neu.',
    ],
    '1.8.0': [
      'Downloads-Liste (Seitenleiste): alles aus deinem Cutting-Ordner – abspielen, ins Schnittprogramm ziehen, Credit kopieren, im Ordner zeigen.',
      'Suchleiste dort: findet Downloads nach Wörtern in Titel, Künstler, Ordner, Lizenz und Credit. Wunschordner direkt dort wählbar.',
      'Ansicht Einfach/Erweitert (Einstellungen → Aussehen): Einfach blendet Profi-Funktionen aus.',
      'Songtexte: Schriftgröße, Ausrichtung, Zeitversatz, Mitscrollen, Abdunkeln und Großansicht – in den Einstellungen und direkt im Vollbild-Player. Der Bildlauf hält die aktuelle Zeile jetzt in der Mitte.',
    ],
    '1.7.0': [
      'Übergänge: Crossfade (2–12 s) oder lückenlos – Einstellungen → Wiedergabe.',
      'Dein Rückblick (Seitenleiste): Hörminuten, Top-Künstler, Top-Titel und wann du hörst – nur lokal gezählt.',
      'Cutter-Modus: Tempo-Filter (BPM wird gemessen) und Wellenform mit Start/Ende, Schleife und WAV-Export für freie Titel.',
    ],
    '1.6.0': [
      'Künstlerseiten: Klick auf einen Künstlernamen – Top-Titel, Alben & Singles und ähnliche Künstler.',
      'Songs teilen: im +-Menü „Link zum Teilen kopieren“. Wer den Link öffnet, landet direkt in CleanMusic – oder bei Deezer, Spotify bzw. YouTube.',
    ],
    '1.5.0': [
      'Hintergründe (Aurora, Verlauf, Farbwolken, Cover, Sternenhimmel) und sechs neue Themes – Einstellungen → Aussehen.',
      'Stream-sicher-Modus: zeigt, ob der Titel frei lizenziert ist; Songwünsche kommen dann nur aus freier Musik.',
      'Songtexte im Vollbild-Player (Knopf mit den drei Linien) – auch als OBS-Overlay-Stil.',
      'Cutter-Modus „Für dich“ und Lokale Musik nach Ordner und Stimmung.',
      'OBS-Overlay 1.1: sieben neue Stile und „Als Nächstes“ mit den Songwünschen.',
    ],
    '1.4.0': [
      'Songwünsche per Link: Spotify, Deezer, Apple Music und YouTube (mit Quellen-Plugin) – als Nächstes und in einer Playlist gespeichert (Streamer.bot-Plugin 1.2.0).',
      'KI-Filter: gekennzeichnete KI-Songs (z. B. „AI Cover“, „Suno“) lassen sich bei Songwünschen ablehnen und bekommen ein „KI?“.',
      'Cutter-Modus: YouTube-Tab über dein Quellen-Plugin – mit Hinweis „Content ID möglich“, ohne Download.',
      'Schnelleres Laden über das Quellen-Plugin: die nächsten Titel werden früher und gebündelt vorgeladen.',
    ],
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
  const onboardingMusic = window.CMOnboardingMusic || null;
  const ONBOARDING_MUSIC_KEY = STORAGE.onboardingMusic;
  let onboardingMusicOn = readJSON(ONBOARDING_MUSIC_KEY, true) !== false;

  function onboardingMusicPlaying() {
    return Boolean(onboardingMusic && onboardingMusic.isPlaying());
  }

  function onboardingThemes() {
    const active = currentTheme();
    // Supporter themes are offered later in the settings, not in the first steps.
    return THEMES.filter((theme) => !extraLocked('theme', theme.id) && !extraInTrial('theme', theme.id)).map((theme) => {
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
          <div class="theme-grid ob-themes">${onboardingThemes()}</div>
          <p class="ob-credit">Musik: „Thinking Music“ – Kevin MacLeod (CC BY 4.0)</p>`;
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
            ${onboardingToggle('autoplay', 'Autoplay', 'Wenn die Warteschlange zu Ende ist, laufen passende Vorschläge weiter.', autoplayOn())}
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
          <button class="btn ghost small ob-music ${onboardingMusicPlaying() ? 'on' : ''}" data-ob-action="music" title="Hintergrundmusik an/aus">
            ${ICONS.note}<span>Musik ${onboardingMusicPlaying() ? 'an' : 'aus'}</span>
          </button>
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
    if (onboardingMusic && onboardingMusicOn && !(state.info && state.info.smoke)) {
      onboardingMusic.start();
    }
  }

  function closeOnboarding(target) {
    const root = $('#onboarding');
    if (!root || root.hidden) return;
    if (onboardingMusic) onboardingMusic.stop();
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
      case 'music':
        if (onboardingMusic) {
          onboardingMusic.toggle();
          onboardingMusicOn = Boolean(onboardingMusic.state().wanted);
          writeJSON(ONBOARDING_MUSIC_KEY, onboardingMusicOn);
        }
        return;
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

  function versionParts(value) {
    return String(value || '')
      .split('.')
      .map((part) => parseInt(part, 10) || 0);
  }

  function versionCompare(left, right) {
    const a = versionParts(left);
    const b = versionParts(right);
    for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
      const diff = (a[index] || 0) - (b[index] || 0);
      if (diff) return diff;
    }
    return 0;
  }

  function whatsNewVersions(current, previous = '') {
    const target = current || currentVersion();
    if (!target) return [];
    if (!previous) return WHATS_NEW[target] ? [target] : [];
    if (versionCompare(previous, target) >= 0) return [];
    return Object.keys(WHATS_NEW).filter(
      (version) =>
        versionCompare(version, previous) > 0 && versionCompare(version, target) <= 0
    );
  }

  function showWhatsNew(version, previous = '') {
    const target = version || currentVersion();
    const versions = whatsNewVersions(target, previous);
    const card = $('#whatsnew-card');
    if (!versions.length || !card) return false;
    const since = previous && versionCompare(previous, target) < 0 ? previous : '';
    const groups = versions
      .map(
        (entry) => `
          <div class="whatsnew-group">
            ${since ? `<div class="whatsnew-version">Version ${esc(entry)}</div>` : ''}
            <ul class="whatsnew-list">${(WHATS_NEW[entry] || [])
              .map((line) => `<li>${esc(line)}</li>`)
              .join('')}</ul>
          </div>`
      )
      .join('');
    card.innerHTML = `
      <span class="update-icon">${ICONS.spark}</span>
      <div class="update-text">
        <strong>${since ? `Neu seit CleanMusic ${esc(since)}` : `Neu in CleanMusic ${esc(target)}`}</strong>
        ${groups}
        <p class="whatsnew-kofi">${ICONS.heart} CleanMusic bleibt kostenlos. Wenn du magst: <button type="button" class="link-btn" data-whatsnew="kofi">auf Ko-fi unterstützen</button> – freiwillig.</p>
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
      showWhatsNew(version, seen);
      markVersionSeen();
    }
  }

  function wireOnboarding() {
    if (onboardingMusic) {
      onboardingMusic.setListener((playing) => {
        const button = document.querySelector('#onboarding [data-ob-action="music"]');
        if (!button) return;
        button.classList.toggle('on', playing);
        const label = button.querySelector('span');
        if (label) label.textContent = `Musik ${playing ? 'an' : 'aus'}`;
      });
    }
    $('#onboarding').addEventListener('click', onOnboardingClick);
    $('#onboarding').addEventListener('change', (event) => {
      const option = event.target.closest('[data-ob-option]');
      if (option) applyOnboardingOption(option.dataset.obOption, option.checked);
    });
    $('#whatsnew-card').addEventListener('click', (event) => {
      const button = event.target.closest('[data-whatsnew]');
      if (!button) return;
      if (button.dataset.whatsnew === 'kofi') {
        bridge.openExternal(SUPPORT_URL);
        return;
      }
      $('#whatsnew-card').hidden = true;
      if (button.dataset.whatsnew === 'tour') openOnboarding();
      else setTimeout(supportTick, 1500);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !$('#onboarding').hidden) closeOnboarding();
    });
  }

  /* ---------------------------------------------------------------- *
   * 1.5: backgrounds, stream-safe mode, lyrics, Cutter "Für dich",
   * local moods/folders
   * ---------------------------------------------------------------- */

  const BACKGROUNDS = [
    { id: 'none', label: 'Keiner' },
    { id: 'aurora', label: 'Aurora' },
    { id: 'gradient', label: 'Verlauf' },
    { id: 'mesh', label: 'Farbwolken' },
    { id: 'cover', label: 'Cover' },
    { id: 'stars', label: 'Sternenhimmel' },
    { id: 'lava', label: 'Lava-Lampe', live: true },
    { id: 'waves', label: 'Wellen', live: true },
    { id: 'synthwave', label: 'Synthwave-Gitter', live: true },
    { id: 'nebula', label: 'Partikel-Nebel', live: true },
    { id: 'rain', label: 'Regen auf Glas', live: true },
    { id: 'custom', label: 'Eigenes Video …', live: true, custom: true },
  ];

  let bgCoverUrl = '';

  let customBg = { url: '', kind: '' };

  function syncLiveBackground() {
    const live = window.CMLiveBackground;
    if (!live || typeof live.configure !== 'function') return;
    const profile = performanceProfile();
    live.configure({
      id: state.settings.background || 'none',
      motion: state.settings.bgMotion !== false,
      pulse: Boolean(state.settings.bgPulse),
      batteryStop: state.settings.bgBatteryStop !== false,
      fsMode: state.fullscreen ? (state.settings.fsBackground || 'cover-moving') : 'cover-moving',
      fsLiveId: state.settings.background || 'none',
      mediaUrl: state.settings.background === 'custom' ? customBg.url : '',
      mediaKind: state.settings.background === 'custom' ? customBg.kind : '',
      maxFps: profile.fps,
      resolution: profile.liveResolution,
      detail: profile.detail,
      onError: (message) => {
        state.settings.background = 'none';
        saveSettings();
        applyBackground();
        renderSettings();
        toast(message || 'Hintergrundvideo konnte nicht geladen werden.');
      },
    });
  }

  function applyBackground() {
    const id = BACKGROUNDS.some((bg) => bg.id === state.settings.background) ? state.settings.background : 'none';
    const root = document.documentElement;
    if (id === 'none') delete root.dataset.bg;
    else root.dataset.bg = id;
    root.classList.toggle('bg-still', state.settings.bgMotion === false);
    bgCoverUrl = '';
    updateBackgroundCover();
    syncLiveBackground();
  }

  function updateBackgroundCover() {
    if (state.settings.background !== 'cover') return;
    const item = currentItem();
    const art = item && item.artwork ? String(item.artwork) : '';
    const url = /^(https:|data:image\/|blob:)/i.test(art) ? art : '';
    if (url === bgCoverUrl) return;
    bgCoverUrl = url;
    const layer = $('#app-bg');
    if (layer) layer.style.setProperty('--bg-cover', url ? `url("${url.replace(/"/g, '%22')}")` : 'none');
  }

  function setBackground(id) {
    if (id === 'custom') { chooseCustomBackground(); return; }
    state.settings.background = id;
    saveSettings();
    applyBackground();
    renderSettings();
  }

  function backgroundPanelHtml() {
    const active = state.settings.background || 'none';
    return `
        <div class="bg-picker">
          <strong>Hintergrund</strong>
          <div class="radio-tags">${BACKGROUNDS.map(
            (bg) => `<button class="radio-tag ${bg.id === active ? 'active' : ''}${lockedClass('background', bg.id)}" data-bg-id="${bg.id}">${esc(bg.label)}</button>`
          ).join('')}</div>
        </div>
        <label class="toggle-row advanced-only" style="margin-top:10px">
          <span>
            <strong>Hintergrund bewegen</strong>
            <small>Langsame Animation. Aus = ruhiges Standbild, spart Leistung.</small>
          </span>
          <input type="checkbox" id="opt-bg-motion" ${state.settings.bgMotion !== false ? 'checked' : ''} />
        </label>
        <label class="toggle-row advanced-only" style="margin-top:10px">
          <span><strong>Mit der Musik pulsieren</strong><small>Leichter Zoom oder Helligkeitsimpuls aus geglätteter Bass-Energie, ohne den Ton umzuleiten.</small></span>
          <input type="checkbox" id="opt-bg-pulse" ${state.settings.bgPulse ? 'checked' : ''} />
        </label>
        <label class="toggle-row advanced-only" style="margin-top:10px">
          <span><strong>Im Akkubetrieb anhalten</strong><small>Pausiert Live-Animation, wenn das Gerät nicht lädt (falls die Browser-API verfügbar ist).</small></span>
          <input type="checkbox" id="opt-bg-battery" ${state.settings.bgBatteryStop !== false ? 'checked' : ''} />
        </label>
        <label class="toggle-row advanced-only" style="margin-top:10px"><span><strong>Vollbild-Hintergrund</strong><small>Cover, Live-Hintergrund oder dunkle Fläche.</small></span>
          <select id="opt-fs-background" class="select-input">
            <option value="cover-static" ${state.settings.fsBackground === 'cover-static' ? 'selected' : ''}>Cover ruhig</option>
            <option value="cover-moving" ${(!state.settings.fsBackground || state.settings.fsBackground === 'cover-moving') ? 'selected' : ''}>Cover bewegt</option>
            <option value="live" ${state.settings.fsBackground === 'live' ? 'selected' : ''}>Live-Hintergrund</option>
            <option value="off" ${state.settings.fsBackground === 'off' ? 'selected' : ''}>Aus</option>
          </select>
        </label>`;
  }

  /* --- Stream-safe mode ------------------------------------------------ */

  function streamSafeOn() {
    return Boolean(state.settings.streamSafe);
  }

  // Free licence known: NCS, CC0, CC BY, Public Domain, CC BY confirmed by the source plugin.
  function streamSafe(entry) {
    if (!entry) return false;
    const key = licenseKey(entry.license);
    return key === 'free' || key === 'by' || key === 'ncs' || entry.ytLicense === 'cc-by';
  }

  function updateStreamBadge() {
    const badge = $('#stream-badge');
    if (!badge) return;
    const item = currentItem();
    const on = streamSafeOn() && Boolean(item);
    badge.hidden = !on;
    if (!on) return;
    const safe = streamSafe(item);
    badge.dataset.safe = safe ? 'yes' : 'no';
    badge.textContent = safe ? '✓ Stream-sicher' : '⚠ Nicht stream-sicher';
    badge.title = safe
      ? 'Freie Lizenz (NCS, CC0, CC BY) – mit Credit im Stream nutzbar.'
      : 'Keine freie Lizenz bekannt – kann auf Twitch oder YouTube stummgeschaltet oder gemeldet werden.';
  }

  function setStreamSafe(on) {
    state.settings.streamSafe = Boolean(on);
    saveSettings();
    updateStreamBadge();
    renderSettings();
    toast(on ? 'Stream-sicher-Modus an – Songwünsche nur noch aus freier Musik' : 'Stream-sicher-Modus aus');
  }

  // Song requests while streaming: only free music (CC on the source plugin, Openverse).
  async function findSafeRequestTrack(query) {
    const pool = [];
    const plugin = searchPlugin();
    if (plugin) {
      try {
        const found = await bridge.pluginSearch(plugin.id, query, { creativeCommons: true, limit: 15 });
        (Array.isArray(found.results) ? found.results : [])
          .filter((item) => item.license === 'cc-by')
          .forEach((item) => pool.push(youtubeCutterEntry(plugin, item)));
      } catch {
        /* next source */
      }
    }
    if (bridge.creatorOpenverse) {
      try {
        const found = await bridge.creatorOpenverse({ kind: 'music', query, page: 1 });
        (Array.isArray(found.items) ? found.items : []).forEach((item) => pool.push(openverseEntry(item)));
      } catch {
        /* nothing */
      }
    }
    const wanted = requestWords(query);
    const fitting = pool.filter((entry) => {
      if (!streamSafe(entry)) return false;
      const words = new Set([...requestWords(entry.artist), ...requestWords(entry.title)]);
      return wanted.some((word) => words.has(word));
    });
    return bestRequestHit(fitting, query);
  }

  /* --- Lyrics (LRCLIB) ------------------------------------------------- */

  // shownSynced: which view renderLyrics drew last (running list or static preview text).
  const lyricsState = { key: '', lines: [], plain: '', loading: false, error: null, index: -1, shownSynced: null };
  let lyricsHold = false; // smoke test only: keep injected lines

  function lyricsOn() {
    return Boolean(state.settings.lyrics);
  }

  async function ensureLyrics(refresh = false) {
    if (lyricsHold) return;
    const item = currentItem();
    // Radio, local "no lyrics" or switched off: drop the previous title's
    // lyrics instead of leaving them (and the remote's lyric) on screen.
    if (!lyricsOn() || !item || item.kind === 'radio' || !bridge.lyricsGet) {
      if (lyricsState.key) {
        Object.assign(lyricsState, { key: '', lines: [], plain: '', loading: false, error: null, index: -1 });
        renderLyrics();
      }
      return;
    }
    const key = matchKey(item);
    if (!key || (!refresh && key === lyricsState.key)) return;
    Object.assign(lyricsState, { key, lines: [], plain: '', loading: true, error: null, index: -1 });
    renderLyrics();
    let result;
    try {
      result = await bridge.lyricsGet({
        title: item.title || '',
        artist: item.artist || '',
        album: item.album || '',
        duration: Math.round(item.duration || (Number.isFinite(audio.duration) ? audio.duration : 0) || 0),
        refresh,
      });
    } catch (error) {
      result = { error: error.message };
    }
    if (lyricsState.key !== key) return;
    Object.assign(lyricsState, {
      lines: Array.isArray(result.lines) ? result.lines : [],
      plain: result.plain || '',
      loading: false,
      error: result.error || null,
      index: -1,
    });
    renderLyrics();
    pushPlayerState();
  }

  // A 30-second preview is a cut from the middle of the song – the line times do not fit.
  function lyricsSynced() {
    return state.nowMode !== 'preview';
  }

  function renderLyrics() {
    lyricsState.shownSynced = lyricsSynced();
    const host = $('#fs-lyrics');
    const button = $('#fs-lyrics-btn');
    if (button) button.classList.toggle('active', lyricsOn());
    const barButton = $('#btn-lyrics');
    if (barButton) barButton.classList.toggle('active', lyricsOn());
    if (!host) return;
    host.hidden = !lyricsOn();
    applyLyricsStyle(host);
    renderLyricsTools();
    if (host.hidden) return;
    if (lyricsState.loading) {
      host.innerHTML = '<p class="lyrics-note">Songtext wird gesucht …</p>';
      return;
    }
    if (lyricsState.lines.length && !lyricsSynced()) {
      host.innerHTML =
        '<p class="lyrics-note">30-Sekunden-Vorschau – sie beginnt mitten im Song, deshalb läuft der Songtext nur bei vollen Titeln und eigenen Dateien mit.</p>' +
        lyricsState.lines.map((line) => `<p class="static">${esc(line.text) || '♪'}</p>`).join('') +
        '<p class="lyrics-note">Songtext: LRCLIB</p>';
      return;
    }
    if (lyricsState.lines.length && BIG_EFFECTS.includes(lyricsEffect())) {
      host.innerHTML = '<div class="ly-kinetic"></div><p class="lyrics-note">Songtext: LRCLIB</p>';
      lyricsState.index = -2;
      updateLyricLine(true);
      return;
    }
    if (lyricsState.lines.length) {
      host.innerHTML =
        lyricsState.lines.map((line, index) => `<p data-ly="${index}">${esc(line.text) || '♪'}</p>`).join('') +
        '<p class="lyrics-note">Songtext: LRCLIB</p>';
      lyricsState.index = -1;
      updateLyricLine(true);
      return;
    }
    if (lyricsState.plain) {
      host.innerHTML =
        lyricsState.plain
          .split('\n')
          .map((line) => `<p>${esc(line) || '&nbsp;'}</p>`)
          .join('') + '<p class="lyrics-note">Songtext: LRCLIB (ohne Zeitangaben)</p>';
      return;
    }
    host.innerHTML = `<p class="lyrics-note">${esc(lyricsState.error || 'Kein Songtext gefunden.')}</p>`;
  }

  function lyricsOffset() {
    return Math.max(-10, Math.min(10, Number(state.settings.lyricsOffset) || 0));
  }

  function updateLyricLine(force = false) {
    if (!lyricsOn() || !lyricsState.lines.length) return;
    // The lyrics often arrive before the source is known (cache, slow resolve).
    // If the title then turns out to be a preview (or a full title after all),
    // redraw: otherwise a running list stands still without any hint.
    if (lyricsState.shownSynced !== lyricsSynced()) {
      renderLyrics();
      return;
    }
    if (!lyricsSynced()) return;
    const time = (audio.currentTime || 0) + lyricsOffset();
    let index = -1;
    for (let at = 0; at < lyricsState.lines.length; at += 1) {
      if (lyricsState.lines[at].time <= time + 0.2) index = at;
      else break;
    }
    if (index === lyricsState.index && !force) return;
    lyricsState.index = index;
    showLyricLine(index, force);
    pushPlayerState();
  }

  function showLyricLine(index, force) {
    const host = $('#fs-lyrics');
    if (host && !host.hidden && BIG_EFFECTS.includes(lyricsEffect()) && host.querySelector('.ly-kinetic')) {
      if (lyricsEffect() === 'lyricvideo') renderLyricVideo(host, index);
      else renderKinetic(host, index);
      return;
    }
    const current = host && host.querySelector(`[data-ly="${index}"]`);
    if (current) current.style.setProperty('--dur', `${lineDuration(index)}s`);
    if (host && !host.hidden && state.fullscreen) {
      host.querySelectorAll('p[data-ly]').forEach((line) => {
        const at = Number(line.dataset.ly);
        line.classList.toggle('on', at === index);
        line.classList.toggle('past', at < index);
      });
      const line = host.querySelector(`[data-ly="${index}"]`);
      if (line && state.settings.lyricsScroll !== false) {
        // Measured inside the box (not via offsetTop, which counts from the whole player).
        const box = host.getBoundingClientRect();
        const rect = line.getBoundingClientRect();
        const top = host.scrollTop + (rect.top - box.top) - host.clientHeight / 2 + rect.height / 2;
        host.scrollTo({ top: Math.max(0, top), behavior: force ? 'auto' : 'smooth' });
      }
    }
  }

  const LYRIC_SIZES = ['s', 'm', 'l', 'xl'];
  const LYRIC_EFFECTS = [
    ['none', 'Keiner'],
    ['pop', 'Pop'],
    ['karaoke', 'Karaoke'],
    ['kinetic', 'Motion'],
    ['neon', 'Neon'],
    ['wave', 'Welle'],
    ['typer', 'Schreibmaschine'],
    ['zoom', 'Zoom'],
    ['lyricvideo', 'Lyric Video'],
  ];
  // Effects that show one big line instead of the scrolling list.
  const BIG_EFFECTS = ['kinetic', 'wave', 'typer', 'zoom', 'lyricvideo'];

  function lyricsEffect() {
    return LYRIC_EFFECTS.some(([id]) => id === state.settings.lyricsEffect) ? state.settings.lyricsEffect : 'pop';
  }

  function lineDuration(index) {
    const line = lyricsState.lines[index];
    const next = lyricsState.lines[index + 1];
    const value = line && next ? next.time - line.time : 4;
    return Math.max(0.6, Math.min(10, value || 4));
  }

  // Motion: one big line, the words pop in one after another (lyric-video style).
  function renderKinetic(host, index) {
    const stage = host.querySelector('.ly-kinetic');
    if (!stage) return;
    const line = lyricsState.lines[index];
    const next = lyricsState.lines[index + 1];
    const effect = lyricsEffect();
    const text = String((line && line.text) || '♪');
    const typer = effect === 'typer';
    const units = typer ? Array.from(text) : text.split(/\s+/).filter(Boolean);
    const span = Math.min(lineDuration(index) * (typer ? 0.8 : 0.7), typer ? 3.5 : 2.6) * 1000;
    const step = units.length > 1 ? span / units.length : 0;
    stage.className = `ly-kinetic ly-k-${effect}`;
    stage.innerHTML = `
      <p class="ly-k-line">${units
        .map((unit, at) => {
          const delay = Math.round(at * step);
          const timing = effect === 'wave' ? `animation-delay:${delay}ms, ${delay + 550 + at * 90}ms` : `animation-delay:${delay}ms`;
          const cls = !typer && unit.replace(/[^\p{L}]/gu, '').length > 6 ? 'hl' : '';
          return `<span class="${cls}" style="${timing};--tilt:${(at % 2 ? 1 : -1) * (2 + (at % 3))}deg">${unit === ' ' ? '&nbsp;' : esc(unit)}</span>`;
        })
        .join(typer ? '' : ' ')}</p>
      <p class="ly-k-next">${esc((next && next.text) || '')}</p>`;
  }

  // Lyric Video: kinetic typography in TikTok/Shorts style (core/lyricvideo.js).
  let lyricVideoRaf = 0;

  function stopLyricVideoRaf() {
    if (lyricVideoRaf) {
      cancelAnimationFrame(lyricVideoRaf);
      lyricVideoRaf = 0;
    }
  }

  function lyricVideoReduced() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function renderLyricVideo(host, index) {
    const stage = host.querySelector('.ly-kinetic');
    if (!stage) return;
    stopLyricVideoRaf();
    const LV = window.CMLyricVideo;
    const line = lyricsState.lines[index];
    const next = lyricsState.lines[index + 1];
    const text = String((line && line.text) || '♪');
    const layout = LV
      ? LV.layoutLine(text, stringSeed(text))
      : { dark: false, single: false, accent: '', vertical: '', blocks: [] };
    const reduced = lyricVideoReduced();
    const saver = document.documentElement.dataset.perf === 'saver';
    const dur = lineDuration(index);

    stage.className = `ly-kinetic ly-k-lyricvideo lv-stage ${layout.dark ? 'lv-dark' : 'lv-light'}${
      layout.single ? ' lv-single' : ''
    }${reduced ? ' lv-reduced' : ''}`;

    // Flatten the layout once so word timings line up with the token order.
    const flat = [];
    layout.blocks.forEach((block) => block.forEach((word) => flat.push(word)));
    const times = LV && line ? LV.wordTimes(line, next ? next.time : undefined) : [];
    const start = line ? Number(line.time) || 0 : 0;

    const wordHtml = (word, at) => {
      const delay = times[at]
        ? Math.max(0, Math.min(dur * 0.65, times[at].time - start))
        : (at / Math.max(1, flat.length)) * Math.min(2.4, dur * 0.65);
      const style = word.style;
      const cls = `lv-word lv-${style} lv-s${word.size}`;
      const dir = stringSeed(`${word.text}:${at}`) % 4;
      const vars = reduced
        ? `--lv-delay:${delay.toFixed(2)}s`
        : `--lv-delay:${delay.toFixed(2)}s;--lv-dx:${dir === 0 ? '-46vw' : dir === 1 ? '46vw' : '0'};--lv-dy:${
            dir === 2 ? '-30vh' : dir === 3 ? '30vh' : '0'
          };--lv-skew:${((stringSeed(word.text) % 21) - 10)}deg;--lv-blur:${saver ? '0px' : '12px'}`;
      const inner = style === 'vertical' ? Array.from(word.text).map((ch) => `<i>${esc(ch)}</i>`).join('') : esc(word.text);
      return `<span class="${cls}" style="${vars}">${inner}</span>`;
    };

    let body;
    if (layout.single) {
      const word = flat[0] ? Object.assign({}, flat[0], { style: 'accent', size: 3 }) : { text, style: 'accent', size: 3 };
      body = `<div class="lv-frame lv-frame-single">${wordHtml(word, 0)}</div>`;
    } else {
      let at = 0;
      body = layout.blocks
        .map((block) => `<div class="lv-block">${block.map((word) => wordHtml(word, at++)).join('')}</div>`)
        .join('');
    }

    const cover = currentItem();
    const silhouette =
      !saver && cover && cover.artwork ? `<img class="lv-silhouette" src="${esc(cover.artwork)}" alt="" aria-hidden="true" />` : '';
    const deco = saver
      ? ''
      : `<svg class="lv-deco" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <g class="lv-lines">
          <line x1="0" y1="11" x2="100" y2="4" />
          <line x1="0" y1="30" x2="100" y2="23" />
          <line x1="6" y1="99" x2="100" y2="91" />
          <line x1="0" y1="72" x2="100" y2="65" />
        </g>
        <path class="lv-flame lv-flame-a" d="M12 6 C 19 14 22 20 22 27 A 10 10 0 1 1 2 27 C 2 20 5 14 12 6 Z" />
        <path class="lv-flame lv-flame-b" d="M92 74 C 97 80 99 85 99 91 A 7 7 0 1 1 85 91 C 85 85 87 80 92 74 Z" />
        <circle class="lv-circle" cx="80" cy="18" r="6" />
      </svg>`;

    stage.innerHTML = `<div class="lv-body">${body}</div>${silhouette}${deco}<p class="ly-k-next">${esc((next && next.text) || '')}</p>`;

    if (!reduced) startLyricVideoPulse(stage);
  }

  function startLyricVideoPulse(stage) {
    const viz = window.CMVisualizer;
    let dark = stage.classList.contains('lv-dark');
    let lastFlip = 0;
    const tick = () => {
      if (!stage.isConnected) return;
      const level = viz && viz.level ? viz.level() : 0;
      const energy = viz && viz.energy ? viz.energy() : 0;
      stage.style.setProperty('--lv-pulse', (1 + Math.min(1, level * 1.5) * 0.035).toFixed(4));
      stage.style.setProperty('--lv-shake', `${(energy * 2).toFixed(2)}px`);
      const now = performance.now();
      // Strong beat flips light/dark with a minimum gap – no strobing.
      if (energy > 0.82 && now - lastFlip > 900) {
        lastFlip = now;
        dark = !dark;
        stage.classList.toggle('lv-dark', dark);
        stage.classList.toggle('lv-light', !dark);
      }
      lyricVideoRaf = requestAnimationFrame(tick);
    };
    lyricVideoRaf = requestAnimationFrame(tick);
  }

  function applyLyricsStyle(host) {
    const size = LYRIC_SIZES.includes(state.settings.lyricsSize) ? state.settings.lyricsSize : 'm';
    host.dataset.size = size;
    host.dataset.align = state.settings.lyricsAlign === 'center' ? 'center' : 'left';
    host.dataset.effect = lyricsSynced() ? (BIG_EFFECTS.includes(lyricsEffect()) ? 'kinetic' : lyricsEffect()) : 'none';
    host.dataset.fx = lyricsSynced() ? lyricsEffect() : 'none';
    host.classList.toggle('dim-past', state.settings.lyricsDim !== false);
    const fullscreen = $('#fullscreen');
    if (fullscreen) fullscreen.classList.toggle('lyrics-focus', lyricsOn() && Boolean(state.settings.lyricsFocus));
  }

  function offsetLabel() {
    const value = lyricsOffset();
    return value ? `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1).replace('.', ',')} s` : '±0 s';
  }

  function renderLyricsTools() {
    const tools = $('#fs-lyrics-tools');
    if (!tools) return;
    tools.hidden = !lyricsOn();
    if (tools.hidden) return;
    tools.innerHTML = `
      <button data-ly-tool="smaller" title="Schrift kleiner">A−</button>
      <button data-ly-tool="bigger" title="Schrift größer">A+</button>
      <button data-ly-tool="align" title="Ausrichtung">${state.settings.lyricsAlign === 'center' ? 'Mitte' : 'Links'}</button>
      <button data-ly-tool="earlier" title="Songtext früher (wenn er hinterherhinkt)">« früher</button>
      <span class="ly-offset" title="Zeitversatz">${offsetLabel()}</span>
      <button data-ly-tool="later" title="Songtext später (wenn er vorausläuft)">später »</button>
      <button data-ly-tool="effect" title="Effekt wechseln">Effekt: ${(LYRIC_EFFECTS.find(([id]) => id === lyricsEffect()) || [])[1]}</button>
      <button data-ly-tool="focus" class="${state.settings.lyricsFocus ? 'on' : ''}" title="Großansicht: nur Songtext">Großansicht</button>
      <button data-ly-tool="refresh" title="Songtext neu suchen">Neu suchen</button>`;
  }

  function setLyricsOption(patch) {
    Object.assign(state.settings, patch);
    saveSettings();
    renderLyrics();
    if (state.view === 'settings') renderSettings();
  }

  function lyricsTool(tool) {
    const size = LYRIC_SIZES.indexOf(LYRIC_SIZES.includes(state.settings.lyricsSize) ? state.settings.lyricsSize : 'm');
    switch (tool) {
      case 'smaller':
        setLyricsOption({ lyricsSize: LYRIC_SIZES[Math.max(0, size - 1)] });
        return;
      case 'bigger':
        setLyricsOption({ lyricsSize: LYRIC_SIZES[Math.min(LYRIC_SIZES.length - 1, size + 1)] });
        return;
      case 'align':
        setLyricsOption({ lyricsAlign: state.settings.lyricsAlign === 'center' ? 'left' : 'center' });
        return;
      case 'earlier':
        setLyricsOption({ lyricsOffset: Math.round((lyricsOffset() + 0.5) * 10) / 10 });
        return;
      case 'later':
        setLyricsOption({ lyricsOffset: Math.round((lyricsOffset() - 0.5) * 10) / 10 });
        return;
      case 'focus':
        setLyricsOption({ lyricsFocus: !state.settings.lyricsFocus });
        return;
      case 'effect': {
        const ids = LYRIC_EFFECTS.map(([id]) => id);
        setLyricsOption({ lyricsEffect: ids[(ids.indexOf(lyricsEffect()) + 1) % ids.length] });
        return;
      }
      case 'refresh':
        ensureLyrics(true);
        return;
      default:
    }
  }

  function lyricsSettingsHtml() {
    const size = LYRIC_SIZES.includes(state.settings.lyricsSize) ? state.settings.lyricsSize : 'm';
    const sizes = [
      ['s', 'Klein'],
      ['m', 'Normal'],
      ['l', 'Groß'],
      ['xl', 'Sehr groß'],
    ];
    return `
          <div class="lyrics-settings ${lyricsOn() ? '' : 'is-off'}">
            <div class="setting-line">
              <strong>Schriftgröße</strong>
              <div class="radio-tags">${sizes
                .map(([id, label]) => `<button class="radio-tag ${size === id ? 'active' : ''}" data-ly-size="${id}">${label}</button>`)
                .join('')}</div>
            </div>
            <div class="setting-line">
              <strong>Effekt</strong>
              <div class="radio-tags">${LYRIC_EFFECTS.map(
                ([id, label]) => `<button class="radio-tag ${lyricsEffect() === id ? 'active' : ''}${lockedClass('lyricsEffect', id)}" data-ly-effect="${id}">${label}</button>`
              ).join('')}</div>
            </div>
            <div class="setting-line">
              <strong>Ausrichtung</strong>
              <div class="radio-tags">
                <button class="radio-tag ${state.settings.lyricsAlign !== 'center' ? 'active' : ''}" data-ly-align="left">Links</button>
                <button class="radio-tag ${state.settings.lyricsAlign === 'center' ? 'active' : ''}" data-ly-align="center">Mitte</button>
              </div>
            </div>
            <label class="toggle-row">
              <span>
                <strong>Zeitversatz: <span id="ly-offset-value">${offsetLabel()}</span></strong>
                <small>Wenn der Songtext hinterherhinkt: nach rechts (früher). Läuft er voraus: nach links.</small>
              </span>
              <input type="range" id="opt-ly-offset" min="-5" max="5" step="0.1" value="${lyricsOffset()}" />
            </label>
            <label class="toggle-row">
              <span><strong>Automatisch mitscrollen</strong><small>Die aktuelle Zeile bleibt in der Mitte.</small></span>
              <input type="checkbox" id="opt-ly-scroll" ${state.settings.lyricsScroll !== false ? 'checked' : ''} />
            </label>
            <label class="toggle-row">
              <span><strong>Gesungene Zeilen abdunkeln</strong><small>Was schon dran war, wird blasser.</small></span>
              <input type="checkbox" id="opt-ly-dim" ${state.settings.lyricsDim !== false ? 'checked' : ''} />
            </label>
            <label class="toggle-row">
              <span><strong>Großansicht</strong><small>Im Vollbild-Player nur Songtext, groß und ohne Cover.</small></span>
              <input type="checkbox" id="opt-ly-focus" ${state.settings.lyricsFocus ? 'checked' : ''} />
            </label>
          </div>`;
  }

  function wireLyricsTools() {
    const fullscreen = $('#fullscreen');
    if (fullscreen) {
      fullscreen.addEventListener('click', (event) => {
        const tool = event.target.closest('[data-ly-tool]');
        if (!tool) return;
        event.stopPropagation();
        lyricsTool(tool.dataset.lyTool);
      });
    }
  }

  function currentLyric() {
    if (!lyricsOn() || !lyricsState.lines.length || lyricsState.index < 0 || !lyricsSynced()) return null;
    const line = lyricsState.lines[lyricsState.index];
    const next = lyricsState.lines[lyricsState.index + 1];
    return { line: line ? line.text : '', next: next ? next.text : '' };
  }

  function toggleLyrics(force) {
    state.settings.lyrics = typeof force === 'boolean' ? force : !lyricsOn();
    saveSettings();
    if (lyricsOn()) {
      lyricsState.key = '';
      ensureLyrics();
    }
    renderLyrics();
    pushPlayerState();
  }

  function upNextSnapshot() {
    const { items, index } = state.queue;
    return items.slice(index + 1, index + 11).map((entry) => ({
      title: entry.title || '',
      artist: entry.artist || '',
      by: entry.requestedBy || '',
    }));
  }

  /* --- Cutter: "Für dich" ---------------------------------------------- */

  function bumpCreatorUsage(key, amount = 1) {
    if (!key) return;
    const usage = readJSON(STORAGE.creatorUsage, {}) || {};
    usage[key] = (Number(usage[key]) || 0) + amount;
    const keys = Object.keys(usage);
    if (keys.length > 80) keys.sort((a, b) => usage[a] - usage[b]).slice(0, keys.length - 80).forEach((name) => delete usage[name]);
    writeJSON(STORAGE.creatorUsage, usage);
  }

  function isSfxTab(tab) {
    return Boolean(tab && (tab.kind === 'sfx' || tab.id === 'sfx' || tab.id === 'games'));
  }

  async function fetchCreatorCategory(tabId, catId) {
    const tab = CREATOR.tabs.find((item) => item.id === tabId);
    if (!tab || tab.kind === 'plugin' || tab.kind === 'foryou') return [];
    const cached = state.creator.lists[`${tabId}:${catId}`];
    if (cached && Array.isArray(cached.items) && cached.items.length) return shuffled(cached.items);
    if (tab.id === 'classics') {
      return shuffled(tab.tracks.filter((track) => catId === 'all' || track.category === catId).map(classicEntry));
    }
    const category = (tab.categories || []).find((item) => item.id === catId);
    if (!category) return [];
    if (tab.id === 'ncs') {
      const result = await bridge.creatorPlaylist(category.playlist);
      return shuffled((Array.isArray(result.tracks) ? result.tracks : []).map(ncsEntry));
    }
    if (!category.query) return [];
    const kind = isSfxTab(tab) ? 'sfx' : 'music';
    const cacheKey = `${kind}|${category.query.toLowerCase()}|1`;
    let result = cachedOpenverse(cacheKey);
    if (!result) {
      result = await bridge.creatorOpenverse({ kind, query: category.query, page: 1 });
      if (!result.error) storeOpenverse(cacheKey, { items: result.items, more: result.more });
    }
    return shuffled((Array.isArray(result.items) ? result.items : []).map(openverseEntry));
  }

  async function creatorForYou(filter) {
    const usage = readJSON(STORAGE.creatorUsage, {}) || {};
    let keys = Object.entries(usage)
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => key);
    const defaults = ['ncs:gaming', 'classics:lustig', 'free:upbeat', 'sfx:whoosh', 'classics:chill', 'free:cinematic'];
    keys = keys.concat(defaults.filter((key) => !keys.includes(key)));
    keys = keys
      .filter((key) => {
        const tab = CREATOR.tabs.find((item) => item.id === key.split(':')[0]);
        if (!tab || tab.kind === 'plugin' || tab.kind === 'foryou') return false;
        if (filter === 'music') return !isSfxTab(tab);
        if (filter === 'sfx') return isSfxTab(tab);
        return true;
      })
      .slice(0, 4);
    const credited = new Set(state.credits.map((item) => item.id));
    const lists = await Promise.all(keys.map((key) => fetchCreatorCategory(...key.split(':')).catch(() => [])));
    const out = [];
    const seen = new Set();
    for (let round = 0; out.length < 30 && round < 60; round += 1) {
      let more = false;
      lists.forEach((list) => {
        const entry = list[round];
        if (!entry) return;
        more = true;
        if (out.length < 30 && !seen.has(entry.id) && !credited.has(entry.id)) {
          seen.add(entry.id);
          out.push(entry);
        }
      });
      if (!more) break;
    }
    return out;
  }

  /* --- Local music: folders + moods ---------------------------------- */

  const LOCAL_MOODS = [
    { id: 'chill', label: 'Chill', words: ['chill', 'lofi', 'lo-fi', 'relax', 'ambient', 'calm', 'sleep', 'entspann', 'acoustic', 'jazz'] },
    { id: 'party', label: 'Party', words: ['party', 'dance', 'club', 'edm', 'house', 'techno', 'hits', 'feier', 'remix', 'mallorca'] },
    { id: 'workout', label: 'Workout', words: ['workout', 'gym', 'training', 'sport', 'running', 'cardio', 'power', 'hardstyle'] },
    { id: 'fokus', label: 'Fokus', words: ['focus', 'fokus', 'study', 'lernen', 'homework', 'arbeit', 'concentration', 'piano', 'classical', 'klassik'] },
    { id: 'gaming', label: 'Gaming', words: ['game', 'gaming', 'ost', 'soundtrack', '8bit', '8-bit', 'chiptune', 'phonk'] },
    { id: 'traurig', label: 'Traurig', words: ['sad', 'traurig', 'melanchol', 'heartbreak', 'emotional', 'ballad'] },
  ];

  let localSort = readJSON(STORAGE.localView, {}).sort === 'folder' ? 'folder' : 'list';
  let localMood = 'all';
  let localMoods = readJSON(STORAGE.localMoods, {}) || {};

  function guessMood(entry) {
    const text = `${entry.dir || ''} ${entry.title || ''} ${entry.artist || ''}`.toLowerCase();
    const mood = LOCAL_MOODS.find((item) => item.words.some((word) => text.includes(word)));
    return mood ? mood.id : '';
  }

  function moodOf(entry) {
    return localMoods[entry.dir] || guessMood(entry);
  }

  // Original indices of the local titles in display order (mood filter, folder grouping).
  function localOrder() {
    const entries = state.library.entries;
    let order = entries.map((_entry, index) => index);
    if (localMood !== 'all') {
      order = order.filter((index) => (moodOf(entries[index]) || 'none') === localMood);
    }
    if (localSort === 'folder') {
      order = order.slice().sort((a, b) => {
        const dir = String(entries[a].dir || '').localeCompare(String(entries[b].dir || ''), 'de');
        return dir || a - b;
      });
    }
    return order;
  }

  function visibleLocal() {
    return localOrder().map((index) => state.library.entries[index]);
  }

  function localToolbar() {
    const entries = state.library.entries;
    const counts = { all: entries.length, none: 0 };
    entries.forEach((entry) => {
      const mood = moodOf(entry) || 'none';
      counts[mood] = (counts[mood] || 0) + 1;
    });
    const chips = [{ id: 'all', label: 'Alle' }, ...LOCAL_MOODS, { id: 'none', label: 'Ohne Stimmung' }]
      .filter((mood) => mood.id === 'all' || counts[mood.id])
      .map(
        (mood) =>
          `<button class="radio-tag ${localMood === mood.id ? 'active' : ''}" data-local-mood="${mood.id}">${esc(mood.label)} <small>${counts[mood.id] || 0}</small></button>`
      )
      .join('');
    return `
      <div class="local-toolbar">
        <div class="radio-tags">${chips}</div>
        <div class="local-sort">
          <button class="radio-tag ${localSort === 'list' ? 'active' : ''}" data-local-sort="list">Liste</button>
          <button class="radio-tag ${localSort === 'folder' ? 'active' : ''}" data-local-sort="folder">Nach Ordner</button>
        </div>
      </div>`;
  }

  function moodSelect(dir) {
    const current = localMoods[dir] || '';
    return `<select class="local-mood-select" data-local-mood-dir="${esc(dir)}" title="Stimmung für diesen Ordner">
      <option value="" ${current ? '' : 'selected'}>Stimmung: automatisch</option>
      ${LOCAL_MOODS.map((mood) => `<option value="${mood.id}" ${current === mood.id ? 'selected' : ''}>Stimmung: ${esc(mood.label)}</option>`).join('')}
    </select>`;
  }

  function wireLocalExtras() {
    document.addEventListener('click', (event) => {
      const mood = event.target.closest('#view-local [data-local-mood]');
      if (mood) {
        localMood = mood.dataset.localMood;
        renderLocal();
        renderHomeLocal();
        return;
      }
      const sort = event.target.closest('#view-local [data-local-sort]');
      if (sort) {
        localSort = sort.dataset.localSort === 'folder' ? 'folder' : 'list';
        writeJSON(STORAGE.localView, { sort: localSort });
        renderLocal();
        renderHomeLocal();
      }
    });
    document.addEventListener('change', (event) => {
      const select = event.target.closest && event.target.closest('#view-local [data-local-mood-dir]');
      if (!select) return;
      const dir = select.dataset.localMoodDir;
      if (select.value) localMoods[dir] = select.value;
      else delete localMoods[dir];
      writeJSON(STORAGE.localMoods, localMoods);
      renderLocal();
      renderHomeLocal();
    });
  }

  /* ---------------------------------------------------------------- *
   * 1.6: artist pages, sharing, shared links
   * ---------------------------------------------------------------- */

  const SHARE_PAGE = 'https://bellocccyt.github.io/cleanmusic/s/';

  function artistList(key) {
    const page = state.artistPage;
    if (!page || !page.data) return [];
    if (key === 'album') return page.album ? page.album.tracks : [];
    return page.data.top;
  }

  async function openArtist(query) {
    const raw = String((query && query.name) || '').trim();
    const name = primaryArtist(raw) || raw;
    const deezerId = Number(query && query.deezerId) || 0;
    if (!name && !deezerId) return;
    const from = state.view === 'artist' ? (state.artistPage && state.artistPage.from) || 'home' : state.view;
    state.artistPage = { name, deezerId, data: null, loading: true, error: null, album: null, from };
    if (state.fullscreen) closeFullscreen();
    showView('artist');
    renderArtist();
    let result;
    try {
      result = await bridge.artistPage({ name, deezerId });
    } catch (error) {
      result = { error: error.message };
    }
    if (!state.artistPage || state.artistPage.name !== name || state.artistPage.deezerId !== deezerId) return;
    state.artistPage.loading = false;
    state.artistPage.error = (result && result.error) || null;
    state.artistPage.data =
      result && !result.error
        ? {
            artist: result.artist,
            top: (result.top || []).map(previewEntry),
            albums: result.albums || [],
            related: result.related || [],
          }
        : null;
    renderArtist();
  }

  function renderArtist() {
    const host = $('#view-artist');
    if (!host) return;
    const page = state.artistPage || {};
    if (page.loading) {
      host.innerHTML = `<div class="page"><div class="search-status"><span class="spinner small"></span><span>${esc(page.name || 'Künstler')} wird geladen …</span></div></div>`;
      return;
    }
    if (page.error || !page.data) {
      host.innerHTML = `
        <div class="page">
          <div class="panel empty-search">
            <h3>${esc(page.name || 'Künstler')}</h3>
            <p>${esc(page.error || 'Nichts gefunden.')}</p>
            <div class="row"><button class="btn ghost small" data-artist-action="back">Zurück</button></div>
          </div>
        </div>`;
      return;
    }
    const { artist, top, albums, related } = page.data;
    const album = page.album;
    const artistTaste = tasteArtistValue(top[0] || { artist: artist.name, kind: 'preview' });
    const kind = (type) => (type === 'single' ? 'Single' : type === 'ep' ? 'EP' : type === 'compile' ? 'Compilation' : 'Album');
    host.innerHTML = `
      <div class="page artist-page">
        <div class="artist-hero">
          ${artist.picture ? `<img class="artist-photo" src="${esc(artist.picture)}" alt="" />` : '<div class="artist-photo">♪</div>'}
          <div class="artist-head">
            <button class="link-btn artist-back" data-artist-action="back">← Zurück</button>
            <div class="eyebrow">Künstler</div>
            <h2>${esc(artist.name)}</h2>
            <p>${[artist.fans ? `${artist.fans.toLocaleString('de-DE')} Fans auf Deezer` : '', artist.albums ? `${artist.albums} Veröffentlichungen` : '']
              .filter(Boolean)
              .join(' · ')}</p>
            <div class="row">
              ${top.length ? `<button class="btn primary" data-artist-action="play">${ICONS.play} Top-Titel abspielen</button>` : ''}
              ${top.length ? `<button class="btn ghost" data-artist-action="shuffle">${ICONS.shuffle} Shuffle</button>` : ''}
              <button class="btn ghost small" data-artist-action="taste-like">${ICONS.like} Mehr davon${
                artistTaste > 0 ? ' ✓' : ''
              }</button>
              <button class="btn ghost small" data-artist-action="taste-dislike">${ICONS.dislike} Weniger davon${
                artistTaste < 0 ? ' ✓' : ''
              }</button>
            </div>
          </div>
        </div>
        ${
          album
            ? `<div class="artist-section-head" id="artist-album"><h3>${esc(album.title)}</h3><button class="link-btn" data-artist-action="close-album">Schließen</button></div>
               <div class="song-list">${album.tracks.map((entry, index) => songRow(entry, index, 'album')).join('') || '<p class="muted">Keine Vorschauen.</p>'}</div>`
            : ''
        }
        <div class="artist-section-head"><h3>Beliebteste Titel</h3></div>
        <div class="song-list">${top.map((entry, index) => songRow(entry, index, 'artist')).join('') || '<p class="muted">Keine Vorschauen gefunden.</p>'}</div>
        ${
          albums.length
            ? `<div class="artist-section-head"><h3>Alben & Singles</h3></div>
               <div class="artist-albums">${albums
                 .map(
                   (item) => `<button class="artist-album" data-album-id="${item.id}" title="${esc(item.title)}">
                     ${item.cover ? `<img src="${esc(item.cover)}" alt="" loading="lazy" />` : '<span class="artist-album-blank">♪</span>'}
                     <strong>${esc(item.title)}</strong>
                     <small>${esc([item.year, kind(item.type)].filter(Boolean).join(' · '))}</small>
                   </button>`
                 )
                 .join('')}</div>`
            : ''
        }
        ${
          related.length
            ? `<div class="artist-section-head"><h3>Ähnliche Künstler</h3></div>
               <div class="artist-related">${related
                 .map(
                   (item) => `<button class="artist-chip" data-artist-id="${item.id}" data-artist-name="${esc(item.name)}">
                     ${item.picture ? `<img src="${esc(item.picture)}" alt="" loading="lazy" />` : ''}<span>${esc(item.name)}</span>
                   </button>`
                 )
                 .join('')}</div>`
            : ''
        }
        <p class="muted small artist-note">Daten: Deezer. Titel spielen als 30-Sekunden-Vorschau – mit Quellen-Plugin und „volle Titel“ in voller Länge.</p>
      </div>`;
  }

  async function openArtistAlbum(id) {
    const page = state.artistPage;
    if (!page || !page.data || !bridge.albumTracks) return;
    page.album = { id, title: 'Album wird geladen …', tracks: [] };
    renderArtist();
    let result;
    try {
      result = await bridge.albumTracks(id);
    } catch (error) {
      result = { tracks: [], error: error.message };
    }
    if (state.artistPage !== page || !page.album || page.album.id !== id) return;
    page.album = { id, title: result.title || 'Album', tracks: (result.tracks || []).map(previewEntry) };
    renderArtist();
    const head = $('#artist-album');
    if (head) head.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function wireArtistPage() {
    const view = $('#view-artist');
    if (view) {
      view.addEventListener('click', (event) => {
        const action = event.target.closest('[data-artist-action]');
        const page = state.artistPage;
        if (action) {
          switch (action.dataset.artistAction) {
            case 'back':
              showView(page && page.from && page.from !== 'artist' ? page.from : 'home');
              return;
            case 'play':
              playList('artist', 0);
              return;
            case 'shuffle':
              playListShuffled('artist');
              return;
            case 'taste-like':
            case 'taste-dislike': {
              const entries = page && page.data && page.data.top && page.data.top.length
                ? [page.data.top[0]]
                : [{ title: page && page.data ? page.data.artist.name : 'Artist', artist: page && page.data ? page.data.artist.name : '', kind: 'preview' }];
              setTasteFeedback(entries, 'artist', action.dataset.artistAction === 'taste-dislike' ? -1 : 1);
              renderArtist();
              return;
            }
            case 'close-album':
              if (page) page.album = null;
              renderArtist();
              return;
            default:
              return;
          }
        }
        const albumButton = event.target.closest('[data-album-id]');
        if (albumButton) {
          openArtistAlbum(Number(albumButton.dataset.albumId));
          return;
        }
        const chip = event.target.closest('[data-artist-id]');
        if (chip) openArtist({ name: chip.dataset.artistName, deezerId: Number(chip.dataset.artistId) });
      });
    }
    // Artist name in the player bar and the fullscreen player.
    ['#np-artist', '#fs-artist'].forEach((selector) => {
      const el = $(selector);
      if (!el) return;
      el.addEventListener('click', () => {
        const item = currentItem();
        if (!item || !item.artist || item.kind === 'radio' || item.kind === 'stream') return;
        openArtist({ name: item.artist, deezerId: item.source === 'deezer' && item.artistId ? Number(item.artistId) : 0 });
      });
    });
    if (bridge.onDeepLink) bridge.onDeepLink((link) => openDeepLink(link));
    const lyricsButton = $('#btn-lyrics');
    if (lyricsButton) {
      lyricsButton.addEventListener('click', () => {
        lyricsButton.blur();
        if (lyricsOn() && state.fullscreen) {
          toggleLyrics(false);
          return;
        }
        if (!currentItem()) {
          toast('Spiel zuerst einen Titel ab.');
          return;
        }
        if (!lyricsOn()) toggleLyrics(true);
        if (!state.fullscreen) openFullscreen();
        else renderLyrics();
      });
    }
  }

  /* --- Sharing ---------------------------------------------------------- */

  function shareParams(entry) {
    const params = new URLSearchParams();
    const id = String(entry.id || '');
    if (/^deezer:\d+$/.test(id)) {
      params.set('src', 'deezer');
      params.set('id', id.slice(7));
    } else if (/^apple:\d+$/.test(id)) {
      params.set('src', 'apple');
      params.set('id', id.slice(6));
    } else if (entry.kind === 'plugin' && /^[A-Za-z0-9_-]{11}$/.test(String(entry.refId || ''))) {
      params.set('src', 'youtube');
      params.set('id', entry.refId);
    } else {
      params.set('src', 'search');
    }
    params.set('t', String(entry.title || '').slice(0, 120));
    if (entry.artist) params.set('a', String(entry.artist).slice(0, 120));
    return params;
  }

  function shareUrl(entry) {
    return `${SHARE_PAGE}?${shareParams(entry)}`;
  }

  async function shareEntry(entry) {
    if (!entry || !entry.title) return;
    const text = `„${entry.title}“${entry.artist ? ` von ${entry.artist}` : ''} – in CleanMusic anhören: ${shareUrl(entry)}`;
    const ok = await bridge.copyText(text);
    toast(ok ? 'Link kopiert – in Discord, WhatsApp & Co. einfügen' : 'Kopieren nicht möglich');
  }

  // A shared link was opened (cleanmusic://play?…): find the song and play it.
  async function openDeepLink(link) {
    if (link && link.action === 'friend') {
      importFriendLink(link.code);
      return;
    }
    if (link && link.action === 'group') {
      importGroupLink(link.code);
      return;
    }
    if (link && link.action === 'playlist') {
      importPlaylistLink(link.code);
      return;
    }
    if (!link || !link.src) return;
    toast(`${link.action === 'add' ? 'Song' : 'Geteilter Song'} „${link.title || 'Titel'}“ wird geladen …`);
    const entry = await findSharedEntry(link);
    if (!entry) {
      toast('Der geteilte Song wurde nicht gefunden.');
      return;
    }
    if (link.action === 'add') {
      enqueue([entry], 'end');
      return;
    }
    state.sharedList = [entry];
    playList('shared', 0);
  }

  // Find a shared title again: Deezer/Apple by id, YouTube via plugin, else by name.
  async function findSharedEntry(link) {
    let entry = null;
    try {
      if ((link.src === 'deezer' || link.src === 'apple') && bridge.requestLink) {
        const url = link.src === 'deezer' ? `https://www.deezer.com/track/${link.id}` : `https://music.apple.com/song/${link.id}`;
        const result = await bridge.requestLink(url);
        if (result && result.track) entry = previewEntry(result.track);
      } else if (link.src === 'youtube') {
        const plugin = readyPlugins('lookup')[0];
        if (plugin && bridge.pluginLookup) {
          const result = await bridge.pluginLookup(plugin.id, `https://www.youtube.com/watch?v=${link.id}`);
          if (result && result.item) entry = pluginEntry(plugin, result.item);
        }
      }
      if (!entry && link.title) {
        const found = await findRequestTrack(`${link.artist || ''} ${link.title}`.trim(), 'auto', 0);
        if (found && !found.tooLong) entry = found;
      }
    } catch {
      entry = null;
    }
    return entry;
  }

  /* --- Playlists per link (no server: the code sits in the #fragment) --- */
  const PLAYLIST_PAGE = 'https://bellocccyt.github.io/cleanmusic/p/';
  // Voluntary support. A donation unlocks nothing – no paywall (see LEGAL.md).
  const SUPPORT_URL = 'https://ko-fi.com/belloccc';
  const DISCORD_URL = 'https://discord.gg/XqYMZJXJjA';

  /* --- Supporter extras: honest code + 7-day trial, see core/supporter.js */
  let supporter = null;

  function supporterState() {
    if (!supporter) {
      const S = window.CMSupporter;
      supporter = S
        ? S.initial(readJSON(STORAGE.supporter, null), FIRST_RUN, Date.now())
        : { unlocked: true, how: 'legacy', at: 0 };
      writeJSON(STORAGE.supporter, supporter);
    }
    return supporter;
  }

  function extraLocked(kind, id) {
    return Boolean(window.CMSupporter && window.CMSupporter.isLocked(kind, id, supporterState(), Date.now()));
  }

  // An extra that is open only for the trial (the heart stays visible).
  function extraInTrial(kind, id) {
    const S = window.CMSupporter;
    return Boolean(S && S.isExtra(kind, id) && S.inTrial(supporterState(), Date.now()));
  }

  function lockedClass(kind, id) {
    if (extraLocked(kind, id)) return ' extra-locked';
    return extraInTrial(kind, id) ? ' extra-trial' : '';
  }

  function setSupporter(next) {
    supporter = next;
    writeJSON(STORAGE.supporter, supporter);
    renderSettings();
    if (state.fullscreen) syncFullscreen();
  }

  // The code is public and free for everybody: on the Ko-fi page (About text)
  // and in the Discord. A donation never buys anything exclusive.
  async function askUnlockExtras(label) {
    const S = window.CMSupporter;
    if (!S) return true;
    const form = $('#dialog-form');
    const field = $('#dialog-input');
    const placeholder = field.placeholder;
    const below = document.createElement('div');
    below.className = 'unlock-below';
    below.innerHTML = `
      <p>Den Code findest du kostenlos auf meiner Ko-fi-Seite und im Discord – eine Spende ist freiwillig.</p>
      <p class="unlock-links">
        <button type="button" class="link-btn" data-unlock="code">Code kostenlos auf Ko-fi ansehen</button>
        <span aria-hidden="true">·</span>
        <button type="button" class="link-btn" data-unlock="discord">Zum Discord</button>
      </p>`;
    const onClick = (event) => {
      const button = event.target.closest('[data-unlock]');
      if (!button) return;
      event.preventDefault();
      bridge.openExternal(button.dataset.unlock === 'discord' ? DISCORD_URL : SUPPORT_URL);
    };
    form.addEventListener('click', onClick);
    field.insertAdjacentElement('afterend', below);
    field.placeholder = 'Freischalt-Code';
    const intro = label
      ? `<p><strong>${esc(label)}</strong> gehört zu den Supporter-Extras (mit ♥ markiert).</p>`
      : '<p>Die mit ♥ markierten Supporter-Extras schaltest du einmal mit einem Code frei.</p>';
    let answer = null;
    try {
      answer = await openDialog({
        title: label ? 'Supporter-Extra' : 'CleanMusic unterstützen',
        className: 'dialog-unlock',
        html: `
          ${intro}
          <p>CleanMusic ist kostenlos und bleibt es – ohne Werbung und ohne Konto. Wenn dir die App
          gefällt, freue ich mich über eine Unterstützung auf Ko-fi.</p>
          <button type="button" class="btn primary unlock-kofi" data-unlock="kofi">${ICONS.heart} Auf Ko-fi unterstützen</button>`,
        value: '',
        confirm: 'Freischalten',
      });
    } finally {
      form.removeEventListener('click', onClick);
      below.remove();
      field.placeholder = placeholder;
    }
    if (answer === null) return false;
    if (!S.checkCode(answer)) {
      toast('Der Code passt nicht. Du findest ihn kostenlos auf ko-fi.com/belloccc und im Discord.');
      return false;
    }
    setSupporter(S.unlock('code', Date.now()));
    if ($('#support-card').dataset.kind === 'trial') hideSupportCard();
    toast('Alle Supporter-Extras sind freigeschaltet – danke, dass du CleanMusic nutzt ♥');
    return true;
  }

  async function guardExtra(kind, id, label) {
    if (!extraLocked(kind, id)) return true;
    return askUnlockExtras(label);
  }

  function supportStatusText() {
    const S = window.CMSupporter;
    const current = supporterState();
    if (current.unlocked) return `♥ Supporter-Extras sind freigeschaltet${current.how === 'legacy' ? ' – du warst schon vorher dabei' : ''}.`;
    const days = S ? S.trialDaysLeft(current, Date.now()) : 0;
    if (days) return `Probezeit: Alle Supporter-Extras sind noch ${days === 1 ? 'einen Tag' : `${days} Tage`} frei. Danach fragen sie einmal nach dem kostenlosen Code.`;
    return `${S ? S.lockedCount() : 0} Supporter-Extras (Themes, Live-Hintergründe, Songtext-Effekte, Visualizer-Stile) warten auf den kostenlosen Code.`;
  }

  // ♥ in the sidebar: unlocked → straight to Ko-fi, otherwise the dialog.
  function openSupport() {
    if (supporterState().unlocked) bridge.openExternal(SUPPORT_URL);
    else askUnlockExtras('');
  }

  // Trial over: active extras go back to the free standards (once). At boot
  // the lyrics and the fullscreen visualizer are not built yet – they read
  // state.settings later anyway.
  function resetLockedExtras(boot = false) {
    const S = window.CMSupporter;
    const patch = S ? S.resetPlan(state.settings) : {};
    if (!Object.keys(patch).length) return patch;
    Object.assign(state.settings, patch);
    saveSettings();
    if ('theme' in patch) applyTheme();
    if ('background' in patch) applyBackground();
    if (boot) return patch;
    if ('lyricsEffect' in patch) renderLyrics();
    if ('vizStyle' in patch) {
      window.CMVisualizer.setStyle($('#fs-viz'), patch.vizStyle);
      syncVisualizerEngine();
    }
    return patch;
  }

  function checkTrialReset(now = Date.now(), boot = false) {
    const S = window.CMSupporter;
    if (!S || !S.trialExpired(supporterState(), now)) return null;
    const patch = resetLockedExtras(boot);
    setSupporter(S.markTrialReset(supporterState()));
    return Object.keys(patch);
  }

  /* --- Ko-fi cards: trial over, 10 hours of listening ----------------- */
  let supportCardSeen = false; // at most one support card per app start

  function totalListenSecs() {
    return Object.values(stats.months || {}).reduce((sum, month) => sum + (Number(month && month.secs) || 0), 0);
  }

  function supportCardBlocked() {
    return !$('#whatsnew-card').hidden || !$('#onboarding').hidden || !$('#support-card').hidden;
  }

  function hideSupportCard() {
    const card = $('#support-card');
    card.hidden = true;
    card.dataset.kind = '';
  }

  function showSupportCard(kind, { secs = 0 } = {}) {
    const card = $('#support-card');
    if (supportCardBlocked()) return false;
    const hours = Math.floor(secs / 3600);
    const content =
      kind === 'trial'
        ? {
            title: 'Deine 7 Tage Supporter-Extras sind vorbei',
            text: 'Danke fürs Ausprobieren! Themes, Hintergründe und Effekte mit ♥ sind wieder auf dem Standard. Den Code gibt’s kostenlos auf Ko-fi – eine Spende ist freiwillig.',
            actions: `
              <button class="btn primary small" data-support-card="kofi">${ICONS.heart} Code auf Ko-fi holen</button>
              <button class="btn ghost small" data-support-card="code">Code eingeben</button>
              <button class="btn ghost small" data-support-card="close">Schließen</button>`,
          }
        : {
            title: `Schon ${hours} Stunden mit CleanMusic ♥`,
            text: 'CleanMusic ist kostenlos, ohne Werbung und ohne Konto – und das bleibt so. Wenn du magst, kannst du die Weiterentwicklung auf Ko-fi unterstützen. Ganz freiwillig.',
            actions: `
              <button class="btn primary small" data-support-card="kofi">${ICONS.heart} Auf Ko-fi unterstützen</button>
              <button class="btn ghost small" data-support-card="close">Später</button>
              <button class="btn ghost small" data-support-card="never">Nicht mehr zeigen</button>`,
          };
    card.innerHTML = `
      <span class="update-icon">${ICONS.heart}</span>
      <div class="update-text">
        <strong>${esc(content.title)}</strong>
        <small>${esc(content.text)}</small>
      </div>
      <div class="update-actions">${content.actions}</div>`;
    card.dataset.kind = kind;
    card.hidden = false;
    supportCardSeen = true;
    return true;
  }

  function checkTrialNotice() {
    const S = window.CMSupporter;
    if (!S || !S.trialNoticeDue(supporterState())) return false;
    if (!showSupportCard('trial')) return false;
    setSupporter(S.markTrialNotice(supporterState()));
    return true;
  }

  // Never in the smoke test, never on the very first start; `force` (smoke
  // hook) skips only those guards, not the 10 hours or the 30 days.
  function maybeKofiHint({ force = false, secs, now = Date.now() } = {}) {
    const S = window.CMSupporter;
    if (!S) return false;
    if (!force && ((state.info && state.info.smoke) || FIRST_RUN || supportCardSeen)) return false;
    const listened = Number.isFinite(secs) ? secs : totalListenSecs();
    const hint = readJSON(STORAGE.kofiHint, null);
    if (!S.hintDue(hint, listened, now)) return false;
    if (!showSupportCard('hint', { secs: listened })) return false;
    writeJSON(STORAGE.kofiHint, S.hintShown(hint, now));
    return true;
  }

  function supportTick() {
    if (state.info && state.info.smoke) return;
    checkTrialReset();
    if (!supportCardSeen) checkTrialNotice();
    maybeKofiHint();
  }

  function wireSupport() {
    $('#nav-support').addEventListener('click', openSupport);
    $('#support-card').addEventListener('click', (event) => {
      const button = event.target.closest('[data-support-card]');
      if (!button) return;
      const action = button.dataset.supportCard;
      if (action === 'kofi') bridge.openExternal(SUPPORT_URL);
      if (action === 'never') writeJSON(STORAGE.kofiHint, window.CMSupporter.hintOff(readJSON(STORAGE.kofiHint, null)));
      hideSupportCard();
      if (action === 'code') askUnlockExtras('');
    });
    // The trial may end while CleanMusic runs; once an hour is plenty.
    setTimeout(supportTick, 8000);
    setInterval(supportTick, 60 * 60 * 1000);
  }

  async function sharePlaylist(id) {
    const playlist = playlistById(id);
    if (!playlist || !window.CMShare) return null;
    const result = await window.CMShare.encodePlaylist(playlist.name, playlist.items);
    if (!result.code) {
      toast('In dieser Playlist ist nichts Teilbares – lokale Dateien und Radio bleiben bei dir.');
      return result;
    }
    const link = `${PLAYLIST_PAGE}#${result.code}`;
    const text = `🎶 Playlist „${playlist.name}“ (${result.shared} Titel) – in CleanMusic öffnen:\n${link}`;
    const ok = await bridge.copyText(text);
    toast(
      ok
        ? `Link kopiert – ${result.shared} Titel${result.skipped ? `, ${result.skipped} lokale/Radio-Titel bleiben bei dir` : ''}.`
        : 'Kopieren nicht möglich'
    );
    return Object.assign({ link }, result);
  }

  async function importPlaylistLink(code, options = {}) {
    if (!window.CMShare) return null;
    const data = await window.CMShare.decodePlaylist(code);
    if (data.error) {
      toast(data.error);
      return null;
    }
    if (!options.confirm) {
      const ok = await askConfirm({
        title: 'Geteilte Playlist übernehmen?',
        message: `„${data.name}“ mit ${data.tracks.length} Titeln. CleanMusic sucht die Titel bei Deezer, Apple Music oder über dein Quellen-Plugin – das dauert einen Moment.`,
        confirm: 'Übernehmen',
      });
      if (!ok) return null;
    }
    toast(`„${data.name}“ wird übernommen …`);
    const found = new Array(data.tracks.length).fill(null);
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < data.tracks.length) {
        const index = next;
        next += 1;
        found[index] = await findSharedEntry(data.tracks[index]);
        done += 1;
        if (done % 10 === 0 && done < data.tracks.length) toast(`${done} von ${data.tracks.length} Titeln geprüft …`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const entries = found.filter(Boolean);
    if (!entries.length) {
      toast('Keiner der geteilten Titel wurde gefunden.');
      return { id: null, count: 0, total: data.tracks.length };
    }
    const playlist = createPlaylist(uniquePlaylistName(data.name, 'Geteilte Playlist'));
    addToPlaylist(playlist.id, entries, { quiet: true });
    openPlaylist(playlist.id);
    toast(`„${playlist.name}“ übernommen: ${entries.length} von ${data.tracks.length} Titeln gefunden.`);
    return { id: playlist.id, count: entries.length, total: data.tracks.length };
  }

  /* --- Social (Weg B): friends, "hört gerade", reactions -------------------- *
   * Off by default. The main process (social-main.js) holds the key and signs
   * every request; this part only shows what the server answers. Contact only
   * per friend code, fixed emoji reactions, no free text. Shared is a song
   * reference (CMShare.refOf) – never local files or radio – and only with
   * "Meine Aktivität zeigen" switched on. Logic in core/social.js. */
  const SOC = window.CMSocial;
  const SOCIAL_PRIVACY_URL = 'https://bellocccyt.github.io/cleanmusic/privacy/social/';
  const SOCIAL_MIN_AGE = 16; // vom Betreiber zu bestätigen (docs/PLAN-SOCIAL.md, „Datenschutz“)
  let socialLocal = SOC ? SOC.normalizeState(readJSON(STORAGE.social, {})) : { enabled: false, showActivity: false, seenReactions: 0 };
  const socialRt = {
    info: null,
    me: null,
    friends: [],
    reactions: [],
    blocked: [],
    skew: 0,
    code: null,
    busy: '',
    error: '',
    loaded: 0,
    groupsLoaded: 0,
    last: null,
    nameMsg: '',
    groups: [],
    groupWeek: '',
    groupCodes: {},
    lastWeek: null,
    tick: 0,
    poll: 0,
  };

  function socialAvailable() {
    return Boolean(SOC && bridge.socialRequest && bridge.socialInfo && bridge.socialSetup);
  }

  function persistSocial() {
    writeJSON(STORAGE.social, socialLocal);
  }

  async function refreshSocialInfo() {
    if (!socialAvailable()) return null;
    try {
      socialRt.info = await bridge.socialInfo();
    } catch {
      socialRt.info = null;
    }
    return socialRt.info;
  }

  async function socialCall(method, path, body, options = {}) {
    if (!socialAvailable()) return null;
    let result;
    try {
      result = await bridge.socialRequest(method, path, body || null);
    } catch {
      result = null;
    }
    if (!result || !result.ok) {
      const message = (result && result.message) || 'Die Social-Anfrage hat nicht geklappt.';
      socialRt.error = message;
      if (result && result.error === 'kein-konto') {
        // The server no longer knows this key (deleted after 12 months without use).
        socialLocal.enabled = false;
        persistSocial();
        stopSocialTimers();
      }
      if (!options.quiet) toast(message);
      return null;
    }
    socialRt.error = '';
    return result.data || {};
  }

  function socialIntroHtml(host) {
    return `
      <p>Mit Social siehst du, was deine Freunde gerade hören, und kannst mit einem Emoji reagieren.</p>
      <ul class="social-facts">
        <li><strong>Kein Konto mit E-Mail oder Passwort.</strong> Dein Gerät erzeugt einen Schlüssel – der öffentliche Teil ist dein Konto, der private bleibt verschlüsselt auf diesem PC.</li>
        <li><strong>Zufallsname</strong> wie „Leiser Komet 42“. Einen eigenen Namen kannst du später setzen.</li>
        <li><strong>Kontakt nur per Freundescode.</strong> Niemand kann dich suchen oder anschreiben, es gibt keinen Chat.</li>
        <li><strong>„Meine Aktivität zeigen“ bleibt aus</strong>, bis du es einschaltest. Geteilt werden dann nur Titel, Artist und eine Such-Referenz – nie lokale Dateien oder Radio.</li>
        <li>Gespeichert wird auf <strong>${esc(host)}</strong>. „Konto löschen“ entfernt dort sofort alles.</li>
      </ul>
      <p class="muted small">Mindestalter: ${SOCIAL_MIN_AGE} Jahre. Mehr dazu: <a href="${SOCIAL_PRIVACY_URL}" target="_blank" rel="noreferrer">Datenschutz für Social</a>.</p>`;
  }

  async function enableSocial(options = {}) {
    if (!socialAvailable()) {
      toast('Freunde gibt es vorerst nur in der Desktop-App.');
      return false;
    }
    const info = await refreshSocialInfo();
    if (!info || !info.server) {
      toast('Es ist noch kein Social-Server eingetragen.');
      if (state.view !== 'friends') showView('friends');
      return false;
    }
    if (!info.available) {
      toast('Auf diesem System gibt es keinen sicheren Schlüsselspeicher – Social bleibt aus.');
      return false;
    }
    if (!options.confirm) {
      const ok = await openDialog({ title: 'Social einschalten?', input: false, confirm: 'Einschalten', html: socialIntroHtml(info.server.replace(/^https?:\/\//, '')) });
      if (!ok) return false;
    }
    socialRt.busy = 'setup';
    renderFriends();
    toast('Social wird eingerichtet – das dauert ein paar Sekunden …');
    let result = null;
    try {
      result = await bridge.socialSetup();
    } catch {
      result = null;
    }
    socialRt.busy = '';
    if (!result || !result.ok) {
      toast((result && result.message) || 'Social konnte nicht eingerichtet werden.');
      renderFriends();
      return false;
    }
    socialLocal.enabled = true;
    persistSocial();
    await refreshSocialInfo();
    await refreshFriends({ quiet: true });
    startSocialTimers();
    toast(socialRt.me ? `Social ist an – du heißt „${SOC.display(socialRt.me)}“.` : 'Social ist an.');
    renderFriends();
    return true;
  }

  async function clearSocialActivity() {
    if (!socialRt.last || socialRt.last.cleared) return;
    const ok = await socialCall('POST', '/v1/activity', { clear: true }, { quiet: true });
    if (ok) socialRt.last = { key: '', at: Date.now(), cleared: true };
  }

  async function disableSocial() {
    await clearSocialActivity();
    socialLocal.enabled = false;
    persistSocial();
    stopSocialTimers();
    renderFriends();
    renderHomeFriends();
    updateFriendsCount();
    toast('Social ist aus. Dein Konto bleibt bestehen, bis du es löschst.');
  }

  async function refreshFriends(options = {}) {
    if (!socialLocal.enabled || !socialAvailable()) return null;
    const data = await socialCall('GET', '/v1/friends', null, { quiet: options.quiet });
    if (!data) {
      if (state.view === 'friends') renderFriends();
      return null;
    }
    const clean = SOC.normalizeFriends(data, Date.now());
    Object.assign(socialRt, clean, { loaded: Date.now() });
    // S2: groups (an older server without groups simply answers 404 – nothing breaks).
    if (options.groups !== false) await refreshGroups(clean.me ? clean.me.id : '');
    const fresh = SOC.newReactions(clean.reactions, socialLocal.seenReactions);
    if (fresh.length && socialLocal.seenReactions) {
      toast(
        fresh.length === 1
          ? `${fresh[0].emoji} von ${SOC.display(fresh[0].from)}${fresh[0].title ? ` zu „${fresh[0].title}“` : ''}`
          : `${fresh.length} neue Reaktionen von Freunden`
      );
    }
    if (clean.reactions.length && clean.reactions[0].at > socialLocal.seenReactions) {
      socialLocal.seenReactions = clean.reactions[0].at;
      persistSocial();
    }
    updateFriendsCount();
    if (state.view === 'friends') renderFriends();
    renderHomeFriends();
    return clean;
  }

  // S2: GET /v1/groups – called from refreshFriends (and, rarely, on its own).
  async function refreshGroups(myId) {
    const groupData = await socialCall('GET', '/v1/groups', null, { quiet: true });
    if (groupData) {
      const parsed = SOC.normalizeGroups(groupData, myId || '');
      socialRt.groups = parsed.groups;
      socialRt.groupWeek = parsed.week;
      socialRt.groupsLoaded = Date.now();
    }
    return socialRt.groups;
  }

  // The 30 s poll: only fetch what pollPlan allows (never while hidden).
  async function socialPoll() {
    if (!socialLocal.enabled || !socialAvailable()) return null;
    const plan = SOC.pollPlan({
      now: Date.now(),
      hidden: document.hidden,
      friendsOpen: state.view === 'friends',
      lastFriends: socialRt.loaded,
      lastGroups: socialRt.groupsLoaded,
      groupCount: socialRt.groups.length,
    });
    if (!plan.friends) return null;
    return refreshFriends({ quiet: true, groups: plan.groups });
  }

  // Every 15 s: send the own song when it changed (or as a heartbeat), if allowed.
  async function socialTick() {
    if (!socialLocal.enabled || !socialAvailable()) return null;
    const entry = currentItem();
    const ref = entry && window.CMShare ? window.CMShare.refOf(entry) : null;
    const plan = SOC.activityPlan({
      enabled: socialLocal.enabled,
      show: socialLocal.showActivity,
      playing: Boolean(entry) && !audio.paused,
      ref,
      last: socialRt.last,
      now: Date.now(),
    });
    if (plan.action === 'post') {
      const ok = await socialCall('POST', '/v1/activity', { ref, playing: true }, { quiet: true });
      if (ok) socialRt.last = { key: plan.key, at: Date.now(), cleared: false };
    } else if (plan.action === 'clear') {
      await clearSocialActivity();
    }
    // S2: the own week card for the group ranking (only while in a group).
    const card = socialRt.groups.length ? ownWeekCard() : null;
    if (SOC.weekPlan({ inGroups: socialRt.groups.length > 0, card, last: socialRt.lastWeek, now: Date.now() })) {
      const sent = await socialCall('POST', '/v1/week', { week: card.week, secs: card.secs, plays: card.plays, artists: card.artists }, { quiet: true });
      if (sent) socialRt.lastWeek = { week: card.week, secs: card.secs, at: Date.now() };
    }
    return plan.action;
  }

  function startSocialTimers() {
    stopSocialTimers();
    socialRt.tick = setInterval(socialTick, 15000);
    socialRt.poll = setInterval(socialPoll, 30000);
    setTimeout(socialTick, 3000);
  }

  function stopSocialTimers() {
    clearInterval(socialRt.tick);
    clearInterval(socialRt.poll);
    socialRt.tick = 0;
    socialRt.poll = 0;
  }

  async function setShowActivity(on) {
    socialLocal.showActivity = Boolean(on);
    persistSocial();
    if (!socialLocal.showActivity) await clearSocialActivity();
    else await socialTick();
    renderFriends();
  }

  async function saveSocialName(value) {
    const field = $('#social-name');
    const name = value != null ? value : field ? field.value : '';
    const check = await bridge.socialNameCheck(name);
    if (!check || !check.ok) {
      socialRt.nameMsg = (check && check.reason) || 'Dieser Name geht nicht.';
      renderFriends();
      return false;
    }
    const data = await socialCall('POST', '/v1/name', { name: check.name });
    if (!data || !data.account) return false;
    socialRt.me = SOC.normalizeFriends({ me: data.account }, Date.now()).me;
    socialRt.nameMsg = '';
    toast(`Du heißt jetzt „${SOC.display(socialRt.me)}“.`);
    renderFriends();
    return true;
  }

  async function randomSocialName() {
    const data = await socialCall('POST', '/v1/name', { random: true });
    if (!data || !data.account) return false;
    socialRt.me = SOC.normalizeFriends({ me: data.account }, Date.now()).me;
    socialRt.nameMsg = '';
    renderFriends();
    return true;
  }

  async function createFriendCode() {
    const data = await socialCall('POST', '/v1/friend-code', {});
    if (!data || !SOC.CODE_RE.test(String(data.code || ''))) return null;
    socialRt.code = { code: data.code, link: data.link || SOC.friendLink(data.code), qr: data.qr || '', expires: Number(data.expires) || 0 };
    renderFriends();
    const text = `🎧 Lass uns in CleanMusic Freunde sein! Link öffnen oder Code eingeben (gilt 24 Stunden für eine Person):\n${socialRt.code.link}\n${data.code}`;
    const copied = await bridge.copyText(text);
    toast(copied ? 'Freundescode kopiert – schick ihn an eine Person.' : 'Freundescode erstellt.');
    return socialRt.code;
  }

  async function redeemFriendCode(text, options = {}) {
    if (SOC.parseGroupCode(text) && !SOC.parseFriendCode(text)) return joinGroupCode(text, options);
    const code = SOC.parseFriendCode(text);
    if (!code) {
      toast('Das ist kein gültiger Freundescode (F1-XXXX-XXXX-XXXX).');
      return null;
    }
    if (!socialLocal.enabled && !(await enableSocial({ confirm: options.confirm }))) return null;
    const data = await socialCall('POST', '/v1/friend/redeem', { code });
    if (!data || !data.friend) return null;
    const friend = SOC.normalizeFriends({ me: data.friend }, Date.now()).me;
    toast(data.already ? `${SOC.display(friend)} ist schon dein Freund.` : `${SOC.display(friend)} ist jetzt dein Freund.`);
    const field = $('#social-redeem');
    if (field) field.value = '';
    await refreshFriends({ quiet: true });
    return friend;
  }

  // cleanmusic://friend?c=… (from the page site/f/#F1-…): ask first, then redeem.
  async function importFriendLink(code, options = {}) {
    if (SOC.parseGroupCode(code)) return joinGroupCode(code, options);
    if (!socialAvailable()) {
      toast('Freunde gibt es vorerst nur in der Desktop-App.');
      return null;
    }
    if (!options.confirm) {
      const ok = await askConfirm({
        title: 'Freund hinzufügen?',
        text: `Mit dem Code ${code} wirst du mit der Person befreundet, die ihn dir geschickt hat. Ihr seht dann eure Namen und – nur wenn eingeschaltet – was ihr gerade hört.`,
        confirm: 'Hinzufügen',
      });
      if (!ok) return null;
    }
    showView('friends');
    return redeemFriendCode(code, options);
  }

  /* S2: groups – invite code (G1-…), week cards that update themselves, shared playlist. */
  function socialGroup(gid) {
    return socialRt.groups.find((group) => group.id === gid) || null;
  }

  async function createSocialGroup(value) {
    const field = $('#social-group-name');
    const name = value != null ? value : field ? field.value : '';
    const check = await bridge.socialNameCheck(name);
    if (!check || !check.ok) {
      toast((check && check.reason) || 'Dieser Gruppenname geht nicht.');
      return null;
    }
    const data = await socialCall('POST', '/v1/group', { name: check.name });
    if (!data || !data.group) return null;
    if (field) {
      field.value = '';
      delete field.dataset.touched;
    }
    toast(`Gruppe „${data.group.name}“ erstellt – lade jetzt Leute mit einem Gruppencode ein.`);
    socialRt.lastWeek = null;
    await refreshFriends({ quiet: true });
    return data.group;
  }

  async function createGroupCode(gid) {
    const group = socialGroup(gid);
    const data = await socialCall('POST', '/v1/group/code', { group: gid });
    if (!data || !SOC.GROUP_CODE_RE.test(String(data.code || ''))) return null;
    const link = SOC.friendLink(data.code);
    socialRt.groupCodes[gid] = { code: data.code, link, expires: Number(data.expires) || 0 };
    renderFriends();
    const copied = await bridge.copyText(`🎧 Komm in meine CleanMusic-Gruppe „${group ? group.name : 'Gruppe'}“ (Code gilt 24 Stunden):\n${link}\n${data.code}`);
    toast(copied ? 'Gruppencode kopiert – in eure Gruppe schicken.' : 'Gruppencode erstellt.');
    return socialRt.groupCodes[gid];
  }

  async function joinGroupCode(text, options = {}) {
    const code = SOC.parseGroupCode(text);
    if (!code) {
      toast('Das ist kein gültiger Gruppencode (G1-XXXX-XXXX-XXXX).');
      return null;
    }
    if (!socialAvailable()) {
      toast('Freunde gibt es vorerst nur in der Desktop-App.');
      return null;
    }
    if (!options.confirm) {
      const ok = await askConfirm({
        title: 'Gruppe beitreten?',
        text: `Mit dem Code ${code} trittst du einer Gruppe bei. Alle in der Gruppe sehen deinen Namen und deine Wochenkarte (Hörzeit, Anzahl Titel, Top-3-Artists) und können Songs zur Gruppen-Playlist hinzufügen.`,
        confirm: 'Beitreten',
      });
      if (!ok) return null;
    }
    if (!socialLocal.enabled && !(await enableSocial({ confirm: options.confirm }))) return null;
    const data = await socialCall('POST', '/v1/group/join', { code });
    if (!data || !data.group) return null;
    const field = $('#social-group-code');
    if (field) {
      field.value = '';
      delete field.dataset.touched;
    }
    toast(data.already ? `Du bist schon in „${data.group.name}“.` : `Du bist jetzt in „${data.group.name}“.`);
    socialRt.lastWeek = null;
    await refreshFriends({ quiet: true });
    await socialTick();
    if (state.view !== 'friends') showView('friends');
    return data.group;
  }

  async function leaveSocialGroup(gid, options = {}) {
    const group = socialGroup(gid);
    if (!options.confirm && !(await askConfirm({ title: 'Gruppe verlassen?', text: `Du verlässt „${group ? group.name : 'die Gruppe'}“.${group && group.isOwner ? ' Die Leitung geht an das älteste Mitglied.' : ''} Deine Wochenkarte ist dort dann nicht mehr zu sehen.`, confirm: 'Verlassen' }))) return false;
    if (!(await socialCall('POST', '/v1/group/leave', { group: gid }))) return false;
    delete socialRt.groupCodes[gid];
    await refreshFriends({ quiet: true });
    return true;
  }

  async function kickGroupMember(gid, id, options = {}) {
    const group = socialGroup(gid);
    const member = group ? group.members.find((row) => row.id === id) : null;
    if (!options.confirm && !(await askConfirm({ title: 'Aus der Gruppe entfernen?', text: `${SOC.display(member)} wird aus „${group ? group.name : 'der Gruppe'}“ entfernt.`, confirm: 'Entfernen', danger: true }))) return false;
    if (!(await socialCall('POST', '/v1/group/kick', { group: gid, id }))) return false;
    await refreshFriends({ quiet: true });
    return true;
  }

  async function addCurrentToGroup(gid) {
    const entry = currentItem();
    const ref = entry && window.CMShare ? window.CMShare.refOf(entry) : null;
    if (!ref) {
      toast(entry ? 'Lokale Dateien und Radio lassen sich nicht teilen.' : 'Gerade läuft kein Song.');
      return false;
    }
    const data = await socialCall('POST', '/v1/group/track', { group: gid, ref });
    if (!data) return false;
    toast(data.already ? `„${ref.title}“ ist schon in der Gruppen-Playlist.` : `„${ref.title}“ ist jetzt in der Gruppen-Playlist.`);
    await refreshFriends({ quiet: true });
    return true;
  }

  async function removeGroupTrack(gid, rid) {
    if (!(await socialCall('POST', '/v1/group/track/remove', { group: gid, rid: Number(rid) }))) return false;
    await refreshFriends({ quiet: true });
    return true;
  }

  async function playGroupTrack(gid, rid) {
    const group = socialGroup(gid);
    const track = group ? group.tracks.find((row) => row.rid === Number(rid)) : null;
    if (!track) return false;
    toast(`„${track.ref.title}“ wird geladen …`);
    const entry = await findSharedEntry(track.ref);
    if (!entry) {
      toast('Der Song wurde nicht gefunden.');
      return false;
    }
    state.sharedList = [entry];
    playList('shared', 0);
    return true;
  }

  // The group playlist as an own playlist (titles are looked up like a shared playlist).
  async function importGroupPlaylist(gid) {
    const group = socialGroup(gid);
    if (!group || !group.tracks.length) {
      toast('Die Gruppen-Playlist ist noch leer.');
      return null;
    }
    toast(`„${group.name}“ wird übernommen …`);
    const refs = group.tracks.slice().reverse();
    const found = new Array(refs.length).fill(null);
    let next = 0;
    const worker = async () => {
      while (next < refs.length) {
        const index = next;
        next += 1;
        found[index] = await findSharedEntry(refs[index].ref);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const entries = found.filter(Boolean);
    if (!entries.length) {
      toast('Keiner der Titel wurde gefunden.');
      return null;
    }
    const playlist = createPlaylist(uniquePlaylistName(group.name, 'Gruppen-Playlist'));
    addToPlaylist(playlist.id, entries, { quiet: true });
    openPlaylist(playlist.id);
    toast(`„${playlist.name}“ übernommen: ${entries.length} von ${refs.length} Titeln gefunden.`);
    return { id: playlist.id, count: entries.length, total: refs.length };
  }

  function groupsPanelHtml() {
    const now = Date.now() + socialRt.skew;
    const groups = socialRt.groups
      .map((group) => {
        const open = socialRt.groupCodes[group.id];
        const code = open && open.expires > now ? open : null;
        const ranking = SOC.groupRanking(group.members)
          .map((row) => `<li class="${row.self ? 'self' : ''}">
            <span class="rv-rank">${row.rank}</span>
            <span class="rv-who"><strong>${esc(row.name)}${row.self ? ' (du)' : ''}</strong> <span class="social-tag">· ${esc(row.tag)}</span>${row.owner ? ' <span class="chip">leitet</span>' : ''}
              <small>${row.week ? `${esc(hoursMinutes(row.week.secs))} · ${row.week.plays.toLocaleString('de-DE')} Titel${row.week.artists.length ? ` · ${esc(row.week.artists[0])}` : ''}` : 'noch keine Wochenkarte'}</small></span>
            ${group.isOwner && !row.self ? `<button class="icon-btn small" data-social="group-kick" data-gid="${esc(group.id)}" data-id="${esc(row.id)}" title="Aus der Gruppe entfernen" aria-label="${esc(row.name)} entfernen">×</button>` : ''}
          </li>`)
          .join('');
        const tracks = group.tracks
          .slice(0, 50)
          .map((track) => `<li class="social-friend">
            <button class="social-listen-play" data-social="group-play" data-gid="${esc(group.id)}" data-rid="${track.rid}" title="Abspielen"><strong>${esc(track.ref.title)}</strong><small>${track.ref.artist ? `${esc(track.ref.artist)} · ` : ''}von ${esc(track.by.name)}</small></button>
            ${group.isOwner || track.mine ? `<button class="icon-btn small" data-social="group-untrack" data-gid="${esc(group.id)}" data-rid="${track.rid}" title="Aus der Gruppen-Playlist entfernen" aria-label="Entfernen">×</button>` : ''}
          </li>`)
          .join('');
        const week = socialRt.groupWeek.replace(/^(\d{4})-W0?(\d+)$/, 'KW $2/$1');
        return `<div class="social-group" data-group="${esc(group.id)}">
          <div class="home-section-head"><h4>${esc(group.name)} <span class="muted small">· ${group.members.length}/30</span></h4>
            <span class="social-friend-actions">
              <button class="btn ghost small" data-social="group-code" data-gid="${esc(group.id)}">Einladen</button>
              <button class="btn ghost small" data-social="group-leave" data-gid="${esc(group.id)}">Verlassen</button>
            </span></div>
          ${code ? `<p class="small">Gruppencode <strong class="social-code-text">${esc(code.code)}</strong> · <a href="${esc(code.link)}" target="_blank" rel="noreferrer">Link</a> · gilt 24 Stunden für alle, die ihn bekommen.</p>` : ''}
          <h5>Diese Woche${week ? ` · ${esc(week)}` : ''}</h5>
          <ol class="rv-group-list">${ranking}</ol>
          <div class="home-section-head"><h5>Gruppen-Playlist · ${group.tracks.length}/200</h5>
            <span class="social-friend-actions">
              <button class="btn ghost small" data-social="group-add" data-gid="${esc(group.id)}">Aktuellen Song hinzufügen</button>
              ${group.tracks.length ? `<button class="btn ghost small" data-social="group-import" data-gid="${esc(group.id)}">Als Playlist übernehmen</button>` : ''}
            </span></div>
          <ul class="social-list">${tracks || '<li class="muted small">Noch leer – füge den Song hinzu, der gerade läuft.</li>'}</ul>
        </div>`;
      })
      .join('');
    return `<div class="panel social-groups">
        <h3>Gruppen</h3>
        <p class="muted small">Eure Wochenkarten aktualisieren sich von selbst, dazu gibt es eine gemeinsame Playlist. Beitreten geht nur per Gruppencode. Die Gruppe sieht deinen Namen und deine Wochenkarte (Hörzeit, Anzahl Titel, Top-3-Artists).</p>
        ${groups}
        <div class="rv-group-row" style="margin-top:10px">
          <input id="social-group-name" type="text" maxlength="20" placeholder="Name für eine neue Gruppe" spellcheck="false" />
          <button class="btn ghost small" data-social="group-create">Gruppe erstellen</button>
        </div>
        <div class="rv-group-row">
          <input id="social-group-code" type="text" placeholder="Gruppencode oder Link (G1-…)" spellcheck="false" />
          <button class="btn ghost small" data-social="group-join">Beitreten</button>
        </div>
      </div>`;
  }

  function socialFriend(id) {
    return socialRt.friends.find((friend) => friend.id === id) || socialRt.blocked.find((friend) => friend.id === id) || null;
  }

  async function playFriend(id) {
    const friend = socialFriend(id);
    if (!friend || !friend.activity) {
      toast('Dein Freund hört gerade nichts.');
      return false;
    }
    const ref = friend.activity.ref;
    toast(`„${ref.title}“ wird geladen …`);
    const entry = await findSharedEntry(ref);
    if (!entry) {
      toast('Der Song wurde nicht gefunden.');
      return false;
    }
    state.sharedList = [entry];
    playList('shared', 0);
    return true;
  }

  async function reactToFriend(id, emoji) {
    if (!SOC.EMOJIS.includes(emoji)) return false;
    const ok = await socialCall('POST', '/v1/react', { to: id, emoji });
    if (ok) toast(`${emoji} an ${SOC.display(socialFriend(id))} gesendet`);
    return Boolean(ok);
  }

  async function removeFriend(id, options = {}) {
    const friend = socialFriend(id);
    if (!options.confirm && !(await askConfirm({ title: 'Freund entfernen?', text: `${SOC.display(friend)} verschwindet aus deiner Liste (und du aus der anderen). Ihr könnt euch später per Code wieder hinzufügen.`, confirm: 'Entfernen' }))) return false;
    if (!(await socialCall('POST', '/v1/friend/remove', { id }))) return false;
    await refreshFriends({ quiet: true });
    return true;
  }

  async function blockFriend(id, options = {}) {
    const friend = socialFriend(id);
    if (!options.confirm && !(await askConfirm({ title: 'Blockieren?', text: `${SOC.display(friend)} wird sofort aus deiner Freundesliste entfernt und kann deine Codes nicht mehr nutzen. Die Person wird nicht benachrichtigt.`, confirm: 'Blockieren', danger: true }))) return false;
    if (!(await socialCall('POST', '/v1/block', { id, block: true }))) return false;
    toast(`${SOC.display(friend)} ist blockiert.`);
    await refreshFriends({ quiet: true });
    return true;
  }

  async function unblockFriend(id) {
    if (!(await socialCall('POST', '/v1/block', { id, block: false }))) return false;
    await refreshFriends({ quiet: true });
    return true;
  }

  async function reportFriend(id, options = {}) {
    const friend = socialFriend(id);
    let reason = options.reason;
    let alsoBlock = Boolean(options.block);
    if (!reason) {
      const ok = await openDialog({
        title: `${SOC.display(friend)} melden`,
        input: false,
        confirm: 'Melden',
        danger: true,
        html: `<div class="social-report">${SOC.REPORT_REASONS.map((item, index) => `<label><input type="radio" name="social-reason" value="${item.id}" ${index ? '' : 'checked'} /> ${esc(item.label)}</label>`).join('')}
          <label><input type="checkbox" id="social-report-block" checked /> Außerdem blockieren</label>
          <p class="muted small">Nach drei Meldungen von verschiedenen Personen wird ein anstößiger Name automatisch durch einen Zufallsnamen ersetzt.</p></div>`,
      });
      if (!ok) return false;
      const picked = document.querySelector('input[name="social-reason"]:checked');
      const block = document.getElementById('social-report-block');
      reason = picked ? picked.value : 'other';
      alsoBlock = Boolean(block && block.checked);
    }
    if (!(await socialCall('POST', '/v1/report', { id, reason }))) return false;
    toast('Danke – die Meldung ist eingegangen.');
    if (alsoBlock) await blockFriend(id, { confirm: true });
    return true;
  }

  async function deleteSocialAccount(options = {}) {
    if (!options.confirm && !(await askConfirm({ title: 'Social-Konto löschen?', text: 'Dein Konto, dein Name, deine Freundesliste, Blockierungen, Codes, Aktivität und Reaktionen werden auf dem Server sofort gelöscht, der Schlüssel auf diesem PC ebenso. Das lässt sich nicht rückgängig machen.', confirm: 'Endgültig löschen', danger: true }))) return false;
    if (!(await socialCall('DELETE', '/v1/account', null))) return false;
    stopSocialTimers();
    socialLocal = SOC.normalizeState({});
    persistSocial();
    Object.assign(socialRt, { me: null, friends: [], reactions: [], blocked: [], code: null, last: null, nameMsg: '', loaded: 0, groupsLoaded: 0, groups: [], groupWeek: '', groupCodes: {}, lastWeek: null });
    await refreshSocialInfo();
    renderFriends();
    renderHomeFriends();
    updateFriendsCount();
    toast('Dein Social-Konto ist gelöscht – auf dem Server und auf diesem PC.');
    return true;
  }

  async function saveSocialServer(value) {
    const field = $('#social-server');
    const info = await bridge.socialServerSet(value != null ? value : field ? field.value : '');
    if (!info) return null;
    if (info.error) toast(info.message);
    else if (!info.cancelled) {
      toast(info.server ? `Social-Server: ${info.server}` : 'Social-Server entfernt.');
      if (!info.registered && socialLocal.enabled) {
        socialLocal.enabled = false;
        persistSocial();
        stopSocialTimers();
      }
    }
    socialRt.info = info;
    renderFriends();
    return info;
  }

  function updateFriendsCount() {
    const nav = $('#nav-friends');
    // Until a Social server is live (none built in, none entered) "Freunde"
    // stays out of the sidebar – the view itself still works once one is set.
    if (nav) nav.hidden = !socialAvailable() || !(socialRt.info && socialRt.info.server);
    const count = $('#friends-count');
    if (!count) return;
    const live = socialLocal.enabled ? SOC.listening(socialRt.friends, Date.now(), socialRt.skew).length : 0;
    count.textContent = live ? String(live) : '';
    count.title = live ? `${live} Freund${live === 1 ? '' : 'e'} hören gerade` : '';
  }

  function socialListenCard(friend, compact) {
    const act = friend.activity;
    const emojis = SOC.EMOJIS.map((emoji) => `<button class="social-emoji" data-social="react" data-id="${esc(friend.id)}" data-emoji="${esc(emoji)}" title="Reagieren mit ${esc(emoji)}" aria-label="Reagieren mit ${esc(emoji)}">${emoji}</button>`).join('');
    return `<div class="social-listen${compact ? ' compact' : ''}">
        <button class="social-listen-play" data-social="play" data-id="${esc(friend.id)}" title="Diesen Song abspielen">
          <span class="social-who">${esc(friend.name)} <span class="social-tag">· ${esc(friend.tag)}</span></span>
          <strong>${esc(act.ref.title)}</strong>
          <small>${act.ref.artist ? `${esc(act.ref.artist)} · ` : ''}${esc(SOC.ago(act.at, Date.now() + socialRt.skew))}</small>
        </button>
        <div class="social-emojis">${emojis}</div>
      </div>`;
  }

  function renderHomeFriends() {
    const host = $('#home-friends');
    if (!host) return;
    const live = socialLocal.enabled && SOC ? SOC.listening(socialRt.friends, Date.now(), socialRt.skew) : [];
    host.hidden = !live.length;
    host.innerHTML = live.length
      ? `<div class="home-section-head">
          <div class="home-section-title"><h2>Freunde hören gerade</h2><span class="muted small">Antippen spielt den Song bei dir</span></div>
          <button class="btn ghost small" data-social="open">Alle Freunde</button>
        </div>
        <div class="social-listen-row">${live.slice(0, 8).map((friend) => socialListenCard(friend, true)).join('')}</div>`
      : '';
  }

  function renderFriends() {
    const host = $('#view-friends');
    if (!host) return;
    const keep = {};
    ['social-name', 'social-redeem', 'social-server', 'social-group-name', 'social-group-code'].forEach((id) => {
      const field = document.getElementById(id);
      if (field && field.dataset.touched) keep[id] = field.value;
    });
    const focused = document.activeElement && document.activeElement.id;
    host.innerHTML = friendsHtml();
    Object.entries(keep).forEach(([id, value]) => {
      const field = document.getElementById(id);
      if (field) {
        field.value = value;
        field.dataset.touched = '1';
      }
    });
    if (focused && keep[focused] != null) {
      const field = document.getElementById(focused);
      if (field) field.focus();
    }
    updateFriendsCount();
  }

  function friendsHtml() {
    const info = socialRt.info || {};
    const head = `<div class="page-head"><div><div class="eyebrow">Social · Beta</div><h2>Freunde</h2>
      <p>Sieh, was deine Freunde gerade hören, und reagiere mit einem Emoji. Kontakt nur per Code – niemand kann dich suchen oder anschreiben.</p></div></div>`;
    if (!socialAvailable()) {
      return `<div class="page narrow social-page">${head}<div class="panel"><p>Freunde gibt es vorerst nur in der Desktop-App.</p></div></div>`;
    }
    const serverPanel = `<div class="panel advanced-only social-server-panel">
        <h3>Social-Server</h3>
        <p class="muted small">Adresse des Servers, der Konten und Freundeslisten speichert (eigener Cloudflare Worker, siehe <code>server/social/README.md</code>). Für lokale Tests auch <code>http://127.0.0.1:8787</code>.</p>
        <div class="rv-group-row">
          <input id="social-server" type="url" placeholder="https://cleanmusic-social.…workers.dev" value="${esc(info.custom ? info.server : '')}" spellcheck="false" />
          <button class="btn ghost small" data-social="server">Speichern</button>
        </div>
        ${info.defaultServer ? `<p class="muted small">Standard: ${esc(info.defaultServer)}</p>` : ''}
      </div>`;
    if (!info.server) {
      return `<div class="page narrow social-page">${head}
        <div class="panel"><h3>Noch kein Social-Server</h3><p>Für Freunde braucht CleanMusic einen kleinen Server. Solange keiner eingetragen ist, bleibt Social aus – Playlist-Links und die Wochenkarte im Rückblick funktionieren trotzdem ohne Server.</p></div>
        ${serverPanel.replace('advanced-only ', '')}</div>`;
    }
    if (!socialLocal.enabled) {
      return `<div class="page narrow social-page">${head}
        <div class="panel social-intro">
          <h3>Social einschalten</h3>
          ${socialIntroHtml(info.server.replace(/^https?:\/\//, ''))}
          <div class="row" style="margin-top:12px">
            <button class="btn primary" data-social="enable" ${socialRt.busy ? 'disabled' : ''}>${socialRt.busy === 'setup' ? 'Wird eingerichtet …' : 'Social einschalten'}</button>
            ${info.registered ? '<button class="btn ghost small danger" data-social="delete">Konto löschen</button>' : ''}
          </div>
        </div>
        ${serverPanel}</div>`;
    }
    const me = socialRt.me;
    const now = Date.now() + socialRt.skew;
    const live = SOC.listening(socialRt.friends, Date.now(), socialRt.skew);
    const nameLocked = me && me.nameChangeAt > now;
    const code = socialRt.code && socialRt.code.expires > now ? socialRt.code : null;
    const friendRows = socialRt.friends.length
      ? socialRt.friends
          .map((friend) => `<li class="social-friend">
            <span class="social-friend-name"><strong>${esc(friend.name)}</strong> <span class="social-tag">· ${esc(friend.tag)}</span>
              <small>${friend.activity ? `hört „${esc(friend.activity.ref.title)}“` : 'hört gerade nichts'}</small></span>
            <span class="social-friend-actions">
              <button class="btn ghost small" data-social="remove" data-id="${esc(friend.id)}">Entfernen</button>
              <button class="btn ghost small" data-social="block" data-id="${esc(friend.id)}">Blockieren</button>
              <button class="btn ghost small danger" data-social="report" data-id="${esc(friend.id)}">Melden</button>
            </span>
          </li>`)
          .join('')
      : '<li class="muted small">Noch keine Freunde. Erzeuge einen Freundescode und schick ihn an eine Person.</li>';
    const reactions = socialRt.reactions.slice(0, 12).map((reaction) => `<li><span class="social-big-emoji">${reaction.emoji}</span> <strong>${esc(reaction.from.name)}</strong> <span class="social-tag">· ${esc(reaction.from.tag)}</span>${reaction.title ? ` zu „${esc(reaction.title)}“` : ''} <small class="muted">${esc(SOC.ago(reaction.at, now))}</small></li>`).join('');
    const blocked = socialRt.blocked.map((person) => `<li class="social-friend"><span class="social-friend-name"><strong>${esc(person.name)}</strong> <span class="social-tag">· ${esc(person.tag)}</span></span>
        <span class="social-friend-actions"><button class="btn ghost small" data-social="unblock" data-id="${esc(person.id)}">Freigeben</button></span></li>`).join('');
    return `<div class="page narrow social-page">${head}
      <div class="panel social-me-panel">
        <h3>Du</h3>
        <div class="social-me">${me ? `<strong>${esc(me.name)}</strong> <span class="social-tag">· ${esc(me.tag)}</span>${me.random ? ' <span class="chip">Zufallsname</span>' : ''}` : '<span class="muted">wird geladen …</span>'}</div>
        <p class="muted small">Namen sind nicht eindeutig – das Kürzel hinter dem Punkt kommt aus deinem Schlüssel und lässt sich nicht nachmachen.</p>
        <div class="rv-group-row">
          <input id="social-name" type="text" maxlength="20" placeholder="Eigener Name (3–20 Zeichen)" spellcheck="false" ${nameLocked ? 'disabled' : ''} />
          <button class="btn primary small" data-social="name" ${nameLocked ? 'disabled' : ''}>Speichern</button>
          <button class="btn ghost small" data-social="random">Neuer Zufallsname</button>
        </div>
        <p class="muted small" id="social-name-msg">${esc(socialRt.nameMsg || (nameLocked ? `Eigenen Namen wieder ändern ab ${new Date(me.nameChangeAt).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.` : 'Buchstaben, Ziffern, Leerzeichen und . _ - · einmal pro Tag änderbar.'))}</p>
        <label class="toggle-row">
          <span><strong>Meine Aktivität zeigen</strong><small>Deine Freunde sehen Titel und Artist des Songs, der gerade läuft (verfällt nach 10 Minuten). Lokale Dateien und Radio werden nie geteilt.</small></span>
          <input type="checkbox" id="social-show-activity" ${socialLocal.showActivity ? 'checked' : ''} />
        </label>
      </div>

      ${live.length ? `<div class="panel"><h3>Hören gerade</h3><div class="social-listen-row">${live.map((friend) => socialListenCard(friend, false)).join('')}</div></div>` : ''}

      <div class="panel">
        <h3>Freund hinzufügen</h3>
        <p class="muted small">Ein Code gilt 24 Stunden für eine Person. Schick ihn per WhatsApp, Discord &amp; Co. – oder lass den QR-Code scannen.</p>
        <div class="row">
          <button class="btn primary small" data-social="code">Freundescode erzeugen</button>
          ${code ? '<button class="btn ghost small" data-social="copy-code">Nochmal kopieren</button><button class="btn ghost small" data-social="revoke">Codes widerrufen</button>' : ''}
        </div>
        ${code ? `<div class="social-code">${code.qr ? `<img src="${esc(code.qr)}" alt="QR-Code für den Freundescode" width="132" height="132" />` : ''}
          <div><strong class="social-code-text">${esc(code.code)}</strong><p class="small"><a href="${esc(code.link)}" target="_blank" rel="noreferrer">${esc(code.link)}</a></p>
          <p class="muted small">Gültig bis ${esc(new Date(code.expires).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }))}.</p></div></div>` : ''}
        <div class="rv-group-row" style="margin-top:10px">
          <input id="social-redeem" type="text" placeholder="Code oder Link einfügen (F1-…)" spellcheck="false" />
          <button class="btn ghost small" data-social="redeem">Hinzufügen</button>
        </div>
      </div>

      ${groupsPanelHtml()}

      ${reactions ? `<div class="panel"><h3>Reaktionen</h3><ul class="social-list">${reactions}</ul></div>` : ''}

      <div class="panel">
        <div class="home-section-head"><h3>Freunde · ${socialRt.friends.length}/200</h3><button class="btn ghost small" data-social="refresh">Aktualisieren</button></div>
        <ul class="social-list">${friendRows}</ul>
        ${socialRt.error ? `<p class="muted small">${esc(socialRt.error)}</p>` : ''}
      </div>

      ${blocked ? `<div class="panel"><h3>Blockiert</h3><ul class="social-list">${blocked}</ul></div>` : ''}

      <div class="panel">
        <h3>Konto</h3>
        <p class="muted small">Gespeichert auf ${esc(info.server)}. <a href="${SOCIAL_PRIVACY_URL}" target="_blank" rel="noreferrer">Was wird wie lange gespeichert?</a></p>
        <div class="row">
          <button class="btn ghost small" data-social="disable">Social ausschalten</button>
          <button class="btn ghost small danger" data-social="delete">Konto löschen</button>
        </div>
      </div>
      ${serverPanel}
    </div>`;
  }

  let socialNameTimer = 0;
  function wireSocial() {
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-social]');
      if (!button || button.disabled) return;
      const id = button.dataset.id || '';
      switch (button.dataset.social) {
        case 'open':
          showView('friends');
          break;
        case 'enable':
          enableSocial();
          break;
        case 'disable':
          disableSocial();
          break;
        case 'name':
          saveSocialName();
          break;
        case 'random':
          randomSocialName();
          break;
        case 'code':
          createFriendCode();
          break;
        case 'copy-code':
          if (socialRt.code) toast((await bridge.copyText(`${socialRt.code.link}\n${socialRt.code.code}`)) ? 'Freundescode kopiert.' : 'Kopieren nicht möglich');
          break;
        case 'revoke':
          if (await socialCall('POST', '/v1/friend-code', { revoke: true })) {
            socialRt.code = null;
            toast('Alle offenen Freundescodes sind ungültig.');
            renderFriends();
          }
          break;
        case 'redeem': {
          const field = $('#social-redeem');
          redeemFriendCode(field ? field.value : '');
          break;
        }
        case 'refresh':
          refreshFriends();
          break;
        case 'play':
          playFriend(id);
          break;
        case 'react':
          reactToFriend(id, button.dataset.emoji);
          break;
        case 'remove':
          removeFriend(id);
          break;
        case 'block':
          blockFriend(id);
          break;
        case 'unblock':
          unblockFriend(id);
          break;
        case 'report':
          reportFriend(id);
          break;
        case 'delete':
          deleteSocialAccount();
          break;
        case 'server':
          saveSocialServer();
          break;
        case 'group-create':
          createSocialGroup();
          break;
        case 'group-join': {
          const field = $('#social-group-code');
          joinGroupCode(field ? field.value : '');
          break;
        }
        case 'group-code':
          createGroupCode(button.dataset.gid);
          break;
        case 'group-leave':
          leaveSocialGroup(button.dataset.gid);
          break;
        case 'group-kick':
          kickGroupMember(button.dataset.gid, id);
          break;
        case 'group-add':
          addCurrentToGroup(button.dataset.gid);
          break;
        case 'group-play':
          playGroupTrack(button.dataset.gid, button.dataset.rid);
          break;
        case 'group-untrack':
          removeGroupTrack(button.dataset.gid, button.dataset.rid);
          break;
        case 'group-import':
          importGroupPlaylist(button.dataset.gid);
          break;
        default:
          break;
      }
    });
    document.addEventListener('input', (event) => {
      const field = event.target;
      if (!field || !['social-name', 'social-redeem', 'social-server', 'social-group-name', 'social-group-code'].includes(field.id)) return;
      field.dataset.touched = '1';
      if (field.id !== 'social-name' || !bridge.socialNameCheck) return;
      clearTimeout(socialNameTimer);
      socialNameTimer = setTimeout(async () => {
        const message = $('#social-name-msg');
        if (!message || !field.value.trim()) return;
        const check = await bridge.socialNameCheck(field.value);
        message.textContent = check && check.ok ? `„${check.name}“ ist möglich.` : (check && check.reason) || '';
      }, 250);
    });
    document.addEventListener('change', (event) => {
      if (event.target && event.target.id === 'social-show-activity') setShowActivity(event.target.checked);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !event.target) return;
      if (event.target.id === 'social-redeem') redeemFriendCode(event.target.value);
      if (event.target.id === 'social-name') saveSocialName();
      if (event.target.id === 'social-group-code') joinGroupCode(event.target.value);
      if (event.target.id === 'social-group-name') createSocialGroup();
    });
  }

  async function initSocial() {
    updateFriendsCount();
    if (!socialAvailable()) return;
    wireSocial();
    await refreshSocialInfo();
    updateFriendsCount();
    if (socialLocal.enabled && socialRt.info && socialRt.info.registered) {
      startSocialTimers();
      refreshFriends({ quiet: true });
    } else if (socialLocal.enabled) {
      socialLocal.enabled = false;
      persistSocial();
    }
    if (state.view === 'friends') renderFriends();
  }

  function openFriendsView() {
    renderFriends();
    refreshSocialInfo().then(() => {
      if (state.view !== 'friends') return;
      if (socialLocal.enabled && Date.now() - socialRt.loaded > 15000) refreshFriends({ quiet: true });
      else renderFriends();
    });
  }

  /* ---------------------------------------------------------------- *
   * 1.7: transitions (crossfade / gapless), listening review,
   * Cutter BPM + waveform with cut markers
   * ---------------------------------------------------------------- */

  /* --- Transitions ------------------------------------------------------ */

  let fadeFactor = 1; // multiplies the volume while a crossfade runs
  let transition = null; // { ghost, timer, mainBegin }
  const warmed = new Set();
  let warmAudio = null;

  function transitionMode() {
    return ['off', 'gapless', 'crossfade'].includes(state.settings.transition) ? state.settings.transition : 'off';
  }

  function crossfadeSecs() {
    return Math.max(2, Math.min(12, Math.round(Number(state.settings.crossfadeSecs) || 6)));
  }

  function nextQueueEntry() {
    const { items, index, upcoming } = state.queue;
    if (state.playback.repeat === 'one') return null;
    if (upcoming >= 0 && items[upcoming]) return items[upcoming];
    return items[index + 1] || null;
  }

  function stopGhost() {
    const running = transition;
    transition = null;
    if (running) {
      clearInterval(running.timer);
      clearTimeout(running.hardStop);
      try {
        running.ghost.pause();
        running.ghost.removeAttribute('src');
        running.ghost.load();
      } catch {
        /* gone */
      }
    }
    // Always restore the level: a half-finished crossfade must never leave the
    // main player silent – that looks exactly like "it plays, but you hear
    // nothing".
    if (fadeFactor !== 1) {
      fadeFactor = 1;
      applyVolume();
    }
  }

  // Gapless: get the next title ready while this one ends.
  function warmNext(entry) {
    const task = prefetchPluginEntry(entry);
    if (task) task.catch(() => {});
    const url = entry.url && /^(https:|blob:|file:)/i.test(entry.url) ? entry.url : '';
    if (!url) return;
    if (!warmAudio) warmAudio = new Audio();
    warmAudio.preload = 'auto';
    warmAudio.muted = true;
    warmAudio.src = url;
  }

  // Crossfade: a second, temporary player keeps the old title running and
  // fades it out, while the main player starts the next one and fades it in.
  function startCrossfade(secs) {
    const src = audio.currentSrc || audio.src;
    if (!src) return;
    const ghost = new Audio();
    ghost.preload = 'auto';
    transition = { ghost, timer: null, mainBegin: 0, index: state.queue.index };
    const level = volumeLevel();
    ghost.volume = vol.muted ? 0 : Math.min(1, level * level);
    ghost.muted = vol.muted;
    ghost.src = src;
    const giveUp = setTimeout(() => {
      if (transition && transition.ghost === ghost && !transition.timer) stopGhost();
    }, 3000);
    ghost.addEventListener(
      'loadedmetadata',
      () => {
        if (!transition || transition.ghost !== ghost) return;
        try {
          ghost.currentTime = audio.currentTime + 0.2;
        } catch {
          /* keep position */
        }
        ghost.play().catch(() => stopGhost());
      },
      { once: true }
    );
    ghost.addEventListener(
      'playing',
      () => {
        clearTimeout(giveUp);
        if (!transition || transition.ghost !== ghost) return;
        // The title already ended (or the user paused/picked another one) while
        // the ghost was loading: do not advance a second time.
        if (audio.paused || audio.ended || transition.index !== state.queue.index) {
          stopGhost();
          return;
        }
        fadeFactor = 0;
        applyVolume();
        const from = ghost.volume;
        const begin = performance.now();
        // Whatever happens: the fade ends after 30 s at the latest and the
        // level is restored, even if the next title never starts.
        transition.hardStop = setTimeout(() => {
          if (transition && transition.ghost === ghost) stopGhost();
        }, 30000);
        transition.timer = setInterval(() => {
          if (!transition) return;
          const now = performance.now();
          const ghostT = Math.min(1, (now - begin) / (secs * 1000));
          ghost.volume = Math.max(0, from * (1 - ghostT));
          // Fade in only once the next title was handed over – until then the
          // old one still runs through the ghost.
          if (transition.started && !audio.paused && !transition.mainBegin) transition.mainBegin = now;
          const mainT = transition.mainBegin ? Math.min(1, (now - transition.mainBegin) / (secs * 1000)) : 0;
          if (fadeFactor !== mainT) {
            fadeFactor = mainT;
            applyVolume();
          }
          if ((ghostT >= 1 && mainT >= 1) || now - begin > 30000) stopGhost();
        }, 60);
        try {
          stepQueue(1);
        } catch {
          /* the ticker above restores the level anyway */
        } finally {
          if (transition && transition.ghost === ghost) transition.started = true;
        }
      },
      { once: true }
    );
  }

  function maybeTransition() {
    const mode = transitionMode();
    if (mode === 'off' || transition || audio.paused) return;
    const item = currentItem();
    if (!item || item.kind === 'radio' || !Number.isFinite(audio.duration) || audio.duration < 20) return;
    if (sleepTimer.endOfTrack) return;
    const next = nextQueueEntry();
    if (!next) return;
    const left = audio.duration - audio.currentTime;
    if (left <= 10 && !warmed.has(next.id)) {
      warmed.add(next.id);
      warmNext(next);
    }
    if (mode !== 'crossfade') return;
    const secs = crossfadeSecs();
    if (left <= secs && left > 1) startCrossfade(secs);
  }

  function transitionSettingsHtml() {
    const mode = transitionMode();
    return `
          <label class="toggle-row">
            <span>
              <strong>Übergang zwischen Titeln</strong>
              <small>Crossfade blendet weich über, „Lückenlos“ lädt den nächsten Titel vor. Nicht bei Radio und „Titel wiederholen“.</small>
            </span>
            <select id="opt-transition" class="select-input">
              <option value="off" ${mode === 'off' ? 'selected' : ''}>Aus</option>
              <option value="gapless" ${mode === 'gapless' ? 'selected' : ''}>Lückenlos</option>
              <option value="crossfade" ${mode === 'crossfade' ? 'selected' : ''}>Crossfade</option>
            </select>
          </label>
          <label class="toggle-row" ${mode === 'crossfade' ? '' : 'hidden'}>
            <span>
              <strong>Crossfade-Länge: <span id="crossfade-value">${crossfadeSecs()} s</span></strong>
              <small>2 bis 12 Sekunden.</small>
            </span>
            <input type="range" id="opt-crossfade" min="2" max="12" step="1" value="${crossfadeSecs()}" />
          </label>`;
  }

  /* --- Listening review ("Dein Jahr") ---------------------------------- */

  let stats = readJSON(STORAGE.stats, null) || { months: {} };
  if (!stats.months || typeof stats.months !== 'object') stats = { months: {} };
  // 1.23: weeks for the group week card – { "2026-W48": { secs, plays, artists: { name: secs } } }
  if (!stats.weeks || typeof stats.weeks !== 'object' || Array.isArray(stats.weeks)) stats.weeks = {};
  const GROUP = window.CMGroup;
  let group = GROUP.normalizeGroup(readJSON(STORAGE.group, {}));

  function statsWeek() {
    return CMStats.week(stats, GROUP.weekKey());
  }

  function persistGroup() {
    writeJSON(STORAGE.group, group);
  }

  function ownWeekCard() {
    const week = GROUP.weekKey();
    const row = stats.weeks[week] || { secs: 0, plays: 0, artists: {} };
    const artists = Object.entries(row.artists || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);
    return GROUP.normalizeCard({ name: group.name, week, secs: row.secs, plays: row.plays, artists, at: Date.now() });
  }

  function weekLabel(week) {
    const match = /^(\d{4})-W(\d{2})$/.exec(String(week || ''));
    return match ? `KW ${Number(match[2])}/${match[1]}` : String(week || '');
  }

  function hoursMinutes(secs) {
    const total = Math.round((Number(secs) || 0) / 60);
    const hours = Math.floor(total / 60);
    return hours ? `${hours} h ${total % 60} min` : `${total} min`;
  }
  let statsTimer = null;
  let reviewPeriod = 'year';

  function monthKey(date = new Date()) {
    return CMStats.monthKey(date);
  }

  function statsMonth() {
    return CMStats.month(stats, new Date());
  }

  function saveStatsSoon() {
    if (statsTimer) return;
    statsTimer = setTimeout(() => {
      statsTimer = null;
      writeJSON(STORAGE.stats, stats);
    }, 20000);
  }

  function statsListen(item, secs) {
    if (!item || !(secs > 0)) return;
    CMStats.listen(stats, {
      secs,
      id: item.id,
      kind: item.kind,
      artist: primaryArtist(item.artist || ''),
      source: item.sourceLabel || (item.kind === 'local' ? 'Lokal' : item.kind) || 'Sonstige',
      entry: storable(item),
      at: new Date(),
      weekKey: GROUP.weekKey(),
    });
    saveStatsSoon();
  }

  function statsPlay(entry) {
    if (!entry || entry.kind === 'radio') return;
    CMStats.play(stats, {
      id: entry.id,
      artist: primaryArtist(entry.artist || ''),
      entry: storable(entry),
      at: new Date(),
      weekKey: GROUP.weekKey(),
    });
    saveStatsSoon();
  }

  function reviewData(period) {
    return CMStats.review(stats.months, { period, now: new Date() });
  }

  function reviewEntries() {
    return reviewData(reviewPeriod).topTracks.map((row) => row.e);
  }

  function minutes(secs) {
    return Math.round((secs || 0) / 60).toLocaleString('de-DE');
  }

  function barList(rows, unit) {
    const max = Math.max(1, ...rows.map((row) => row.value));
    return rows
      .map(
        (row) => `
          <div class="rv-row" title="${esc(row.label)}: ${esc(row.text)}">
            <span class="rv-label">${row.html || esc(row.label)}</span>
            <span class="rv-track"><i style="width:${Math.max(2, Math.round((row.value / max) * 100))}%"></i></span>
            <span class="rv-value">${esc(row.text)}</span>
          </div>`
      )
      .join('');
  }

  function columns(values, labels) {
    const max = Math.max(1, ...values);
    return `<div class="rv-columns">${values
      .map(
        (value, index) =>
          `<span class="rv-col" title="${esc(labels[index])}: ${minutes(value)} Min."><i style="height:${value ? Math.max(4, Math.round((value / max) * 100)) : 0}%"></i><small>${esc(
            labels[index].length > 3 ? labels[index].slice(0, 3) : labels[index]
          )}</small></span>`
      )
      .join('')}</div>`;
  }

  function renderReview() {
    const host = $('#view-review');
    if (!host) return;
    const data = reviewData(reviewPeriod);
    const year = new Date().getFullYear();
    const heading = reviewPeriod === 'month' ? 'Dein Monat' : reviewPeriod === 'year' ? `Dein Jahr ${year}` : 'Alles bisher';
    const empty = !data.secs && !data.plays;
    const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const hourLabels = Array.from({ length: 24 }, (_value, hour) => `${hour} Uhr`);
    const periods = [
      ['month', 'Dieser Monat'],
      ['year', `Jahr ${year}`],
      ['all', 'Alles'],
    ];
    host.innerHTML = `
      <div class="page review-page">
        <div class="page-head">
          <div>
            <div class="eyebrow">Rückblick</div>
            <h2>${esc(heading)} in CleanMusic</h2>
            <p>Gezählt wird nur auf diesem PC – nichts verlässt CleanMusic.</p>
          </div>
          <div class="page-actions">
            <div class="radio-tags">${periods
              .map(([id, label]) => `<button class="radio-tag ${reviewPeriod === id ? 'active' : ''}" data-review-period="${id}">${esc(label)}</button>`)
              .join('')}</div>
            ${empty ? '' : `<select id="review-image-format" class="select-input" aria-label="Bildformat"><option value="story">Story · 1080 × 1920</option><option value="post">Post · 1080 × 1080</option></select><button class="btn ghost small" data-review-action="share-image">Als Bild speichern</button><button class="btn ghost small" data-review-action="copy-image">In Zwischenablage</button><button class="btn ghost small" data-review-action="copy">Zusammenfassung kopieren</button>`}
          </div>
        </div>
        ${
          empty
            ? '<div class="panel empty-search"><h3>Noch nichts gezählt</h3><p>Hörminuten, Top-Künstler und Top-Titel sammeln sich ab Version 1.7, sobald du Musik hörst.</p></div>'
            : `
        <div class="rv-tiles">
          <div class="panel rv-tile"><strong>${minutes(data.secs)}</strong><span>Minuten gehört</span></div>
          <div class="panel rv-tile"><strong>${data.plays.toLocaleString('de-DE')}</strong><span>Titel abgespielt</span></div>
          <div class="panel rv-tile"><strong>${Object.keys(data.tracks).length.toLocaleString('de-DE')}</strong><span>verschiedene Titel</span></div>
          <div class="panel rv-tile"><strong>${Object.keys(data.artists).length.toLocaleString('de-DE')}</strong><span>Künstler</span></div>
        </div>
        <div class="rv-grid">
          <div class="panel">
            <h3>Top-Künstler</h3>
            ${
              data.topArtists.length
                ? barList(
                    data.topArtists.map(([name, row]) => ({
                      label: name,
                      html: `<span class="artist-link" data-artist="${esc(name)}">${esc(name)}</span>`,
                      value: row.s,
                      text: `${minutes(row.s)} Min.`,
                    }))
                  )
                : '<p class="muted">Noch keine Künstler.</p>'
            }
          </div>
          <div class="panel">
            <h3>Wann du hörst</h3>
            ${columns(data.hours, hourLabels)}
            ${data.topSource ? `<p class="muted small">Am meisten über: <strong>${esc(data.topSource[0])}</strong> (${minutes(data.topSource[1])} Min.)</p>` : ''}
          </div>
        </div>
        ${reviewPeriod === 'year' ? `<div class="panel rv-months"><h3>Minuten pro Monat</h3>${columns(data.months, monthNames)}</div>` : ''}
        <div class="artist-section-head"><h3>Top-Titel</h3>${
          data.topTracks.length ? '<button class="link-btn" data-review-action="play">Alle abspielen</button>' : ''
        }</div>
        <div class="song-list">${data.topTracks.map((row, index) => songRow(row.e, index, 'review')).join('') || '<p class="muted">Noch keine Titel.</p>'}</div>`
        }
        ${groupPanel()}
      </div>`;
  }

  /* Group week card: "Wer hört diese Woche am meisten?" – codes are shared by
   * the users themselves (WhatsApp, Discord …); nothing goes to a server. */
  function groupPanel() {
    const week = GROUP.weekKey();
    const own = ownWeekCard();
    const rows = GROUP.ranking(group, group.name ? own : Object.assign({}, own, { name: 'Du' }), week);
    const older = Object.values(group.members).filter((card) => card.week !== week).length;
    const list = rows.length
      ? rows
          .map(
            (row) => `<li class="${row.self ? 'self' : ''}">
              <span class="rv-rank">${row.rank}</span>
              <span class="rv-who"><strong>${row.self ? (group.name ? `${esc(row.name)} (du)` : 'Du') : esc(row.name)}</strong><small>${esc(hoursMinutes(row.secs))} · ${row.plays.toLocaleString('de-DE')} Titel${row.artists.length ? ` · ${esc(row.artists[0])}` : ''}</small></span>
              ${row.self ? '' : `<button class="icon-btn small" data-group-remove="${esc(GROUP.memberKey(row.name))}" title="Aus der Gruppe entfernen" aria-label="${esc(row.name)} entfernen">×</button>`}
            </li>`
          )
          .join('')
      : '';
    return `
      <div class="panel rv-group" id="rv-group">
        <h3>Gruppe · ${esc(weekLabel(week))}</h3>
        <p class="muted small">Wer hört diese Woche am meisten? Schick deine Wochenkarte in eure Gruppe (WhatsApp, Discord …) und füge die Codes der anderen hier ein. Kein Konto, kein Server – geteilt wird nur, was in der Karte steht.</p>
        <div class="rv-group-row">
          <input id="rv-group-name" type="text" maxlength="${GROUP.NAME_MAX}" placeholder="Dein Name in der Gruppe" value="${esc(group.name)}" spellcheck="false" />
          <button class="btn primary small" data-review-action="group-copy">Meine Wochenkarte kopieren</button>
        </div>
        <div class="rv-group-row">
          <input id="rv-group-code" type="text" placeholder="Code einfügen (CM1-…)" spellcheck="false" />
          <button class="btn ghost small" data-review-action="group-add">Hinzufügen</button>
        </div>
        <ol class="rv-group-list">${list}</ol>
        ${older ? `<p class="muted small">${older} Karte${older === 1 ? '' : 'n'} aus früheren Wochen ausgeblendet – sie zählen nur in ihrer Woche.</p>` : ''}
      </div>`;
  }

  function saveGroupName() {
    const field = $('#rv-group-name');
    if (!field) return group.name;
    const name = GROUP.normalizeCard({ name: field.value }).name;
    if (name !== group.name) {
      group = GROUP.normalizeGroup(Object.assign({}, group, { name }));
      persistGroup();
    }
    return group.name;
  }

  async function copyWeekCard() {
    if (!saveGroupName()) {
      toast('Gib zuerst deinen Namen für die Gruppe ein.');
      const field = $('#rv-group-name');
      if (field) field.focus();
      return '';
    }
    const card = ownWeekCard();
    const code = GROUP.encode(card);
    const top = card.artists.length ? ` · Top: ${card.artists.join(', ')}` : '';
    const link = `https://bellocccyt.github.io/cleanmusic/g/#${code}`;
    const text = `🎧 Meine CleanMusic-Woche (${weekLabel(card.week)}): ${hoursMinutes(card.secs)} · ${card.plays} Titel${top}\nWer hört mehr? Link öffnen oder in CleanMusic unter Rückblick → Gruppe einfügen:\n${link}`;
    const ok = await bridge.copyText(text);
    toast(ok ? 'Wochenkarte kopiert – jetzt in eure Gruppe schicken.' : 'Kopieren nicht möglich');
    return code;
  }

  function addWeekCard() {
    const field = $('#rv-group-code');
    const result = GROUP.decode(field ? field.value : '');
    if (result.error) {
      toast(result.error);
      return false;
    }
    return addDecodedCard(result.card);
  }

  // cleanmusic://group?c=… (from the web page /g/#CM1-…): ask first, then add.
  async function importGroupLink(code, options = {}) {
    const result = GROUP.decode(code);
    if (result.error) {
      toast(result.error);
      return false;
    }
    const card = result.card;
    if (!options.confirm) {
      const ok = await askConfirm({
        title: 'Wochenkarte hinzufügen?',
        message: `${card.name}: ${hoursMinutes(card.secs)} in ${weekLabel(card.week)} · ${card.plays} Titel. Die Karte kommt in deine Gruppe im Rückblick.`,
        confirm: 'Hinzufügen',
      });
      if (!ok) return false;
    }
    const added = addDecodedCard(card);
    if (added) {
      showView('review');
      requestAnimationFrame(() => {
        const panel = $('#rv-group');
        if (panel) panel.scrollIntoView({ block: 'start', behavior: 'smooth' });
      });
    }
    return added;
  }

  function addDecodedCard(card) {
    if (group.name && GROUP.memberKey(card.name) === GROUP.memberKey(group.name)) {
      toast('Das ist deine eigene Karte – die zählt schon automatisch.');
      return false;
    }
    const added = GROUP.addMember(group, card);
    if (!added.added) {
      toast(added.older ? `Von ${card.name} gibt es schon eine neuere Karte.` : 'Karte konnte nicht übernommen werden.');
      return false;
    }
    group = added.group;
    persistGroup();
    renderReview();
    const week = GROUP.weekKey();
    toast(
      card.week === week
        ? `${card.name} ist dabei: ${hoursMinutes(card.secs)} diese Woche.`
        : `Karte von ${card.name} ist aus ${weekLabel(card.week)} – sie zählt nur in dieser Woche.`
    );
    return true;
  }

  async function copyReview() {
    const data = reviewData(reviewPeriod);
    const year = new Date().getFullYear();
    const label = reviewPeriod === 'month' ? 'Mein Monat' : reviewPeriod === 'year' ? `Mein Jahr ${year}` : 'Mein CleanMusic';
    const artists = data.topArtists.slice(0, 3).map(([name]) => name).join(', ');
    const track = data.topTracks[0];
    const text = `${label} in CleanMusic: ${minutes(data.secs)} Minuten Musik, ${data.plays} Titel${
      artists ? ` · Top-Künstler: ${artists}` : ''
    }${track ? ` · Top-Titel: „${track.e.title}“${track.e.artist ? ` von ${track.e.artist}` : ''}` : ''}`;
    const ok = await bridge.copyText(text);
    toast(ok ? 'Zusammenfassung kopiert' : 'Kopieren nicht möglich');
  }

  async function reviewImageDataUrl(format = 'story') {
    const data = reviewData(reviewPeriod);
    if (!data.secs && !data.plays) return '';
    const story = format !== 'post';
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = story ? 1920 : 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const root = getComputedStyle(document.documentElement);
    const bg = root.getPropertyValue('--bg').trim();
    const panel = root.getPropertyValue('--panel-2').trim();
    const text = root.getPropertyValue('--text').trim();
    const muted = root.getPropertyValue('--muted').trim();
    const accent = root.getPropertyValue('--accent').trim();
    const accentRgb = root.getPropertyValue('--accent-rgb').trim();
    const accent2Rgb = root.getPropertyValue('--accent-2-rgb').trim();
    const height = canvas.height;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, height);
    ctx.fillStyle = `rgba(${accentRgb}, .17)`;
    ctx.beginPath(); ctx.ellipse(920, story ? 230 : 90, 340, 270, -0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(${accent2Rgb}, .13)`;
    ctx.beginPath(); ctx.ellipse(120, height - 80, 350, 260, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = text;
    ctx.textBaseline = 'alphabetic';
    let logo = null;
    try {
      logo = new Image();
      logo.src = new URL('assets/logo.svg', location.href).href;
      await new Promise((resolve, reject) => { logo.onload = resolve; logo.onerror = reject; });
      ctx.drawImage(logo, 72, 68, 70, 70);
    } catch { logo = null; }
    ctx.font = '700 32px Segoe UI, sans-serif';
    ctx.fillText('CleanMusic', logo ? 160 : 72, 116);
    ctx.font = '600 26px Segoe UI, sans-serif';
    ctx.fillStyle = muted;
    ctx.fillText('DEIN MUSIK-RÜCKBLICK', 72, story ? 252 : 205);
    ctx.fillStyle = text;
    ctx.font = '700 52px Segoe UI, sans-serif';
    const yearTitle = reviewPeriod === 'month' ? 'Dein Monat' : reviewPeriod === 'year' ? `Dein Jahr ${new Date().getFullYear()}` : 'Alles bisher';
    ctx.fillText(yearTitle, 72, story ? 330 : 275);
    ctx.fillStyle = panel;
    const summaryY = story ? 390 : 315;
    const summaryH = story ? 260 : 190;
    ctx.beginPath(); ctx.roundRect(72, summaryY, 936, summaryH, 28); ctx.fill();
    ctx.fillStyle = accent;
    ctx.font = '700 88px Segoe UI, sans-serif';
    ctx.fillText(minutes(data.secs), 112, summaryY + (story ? 128 : 115));
    ctx.fillStyle = text;
    ctx.font = '600 28px Segoe UI, sans-serif';
    ctx.fillText('Minuten gehört', 116, summaryY + (story ? 174 : 154));
    ctx.fillStyle = muted;
    ctx.font = '500 24px Segoe UI, sans-serif';
    ctx.fillText(`${data.plays.toLocaleString('de-DE')} Titel · ${data.topSource ? `Lieblingsquelle: ${data.topSource[0]}` : 'Lieblingsquelle: –'}`, 116, summaryY + (story ? 220 : 170));

    const section = (title, rows, y, rowGap, maxRows) => {
      ctx.fillStyle = text;
      ctx.font = '700 30px Segoe UI, sans-serif';
      ctx.fillText(title, 80, y);
      rows.slice(0, maxRows).forEach((row, index) => {
        const label = Array.isArray(row) ? row[0] : row.title || '';
        const sub = Array.isArray(row) ? `${minutes(row[1].s)} Min. gehört` : row.artist || '';
        const rowY = y + 52 + index * rowGap;
        ctx.fillStyle = `rgba(${accentRgb}, .15)`;
        ctx.beginPath(); ctx.roundRect(72, rowY - 31, 936, rowGap - 5, 14); ctx.fill();
        ctx.fillStyle = accent;
        ctx.font = '700 22px Segoe UI, sans-serif';
        ctx.fillText(String(index + 1).padStart(2, '0'), 92, rowY + 1);
        ctx.fillStyle = text;
        ctx.font = '600 22px Segoe UI, sans-serif';
        ctx.fillText(String(label).slice(0, story ? 48 : 50), 150, rowY + 1);
        ctx.fillStyle = muted;
        ctx.font = '400 17px Segoe UI, sans-serif';
        ctx.fillText(String(sub).slice(0, 58), 150, rowY + 24);
      });
    };
    if (story) {
      section('TOP-KÜNSTLER', data.topArtists.slice(0, 5), 735, 66, 5);
      section('TOP-TITEL', data.topTracks.slice(0, 5).map((row) => row.e), 1200, 72, 5);
    } else {
      section('TOP-KÜNSTLER', data.topArtists.slice(0, 5), 570, 47, 5);
      section('TOP-TITEL', data.topTracks.slice(0, 5).map((row) => row.e), 820, 43, 5);
    }
    ctx.fillStyle = muted;
    ctx.font = '400 20px Segoe UI, sans-serif';
    ctx.fillText('Lokal erstellt · CleanMusic', 72, height - 42);
    try { return canvas.toDataURL('image/png'); } catch { return ''; }
  }

  async function shareReviewImage(copy = false) {
    const format = $('#review-image-format')?.value || 'story';
    const dataUrl = await reviewImageDataUrl(format);
    if (!dataUrl) { toast('Das Rückblick-Bild konnte nicht erstellt werden.'); return; }
    const result = copy ? await bridge.copyPng(dataUrl) : await bridge.savePng(dataUrl);
    if (copy) toast(result ? 'Rückblick-Bild in die Zwischenablage kopiert.' : 'Kopieren fehlgeschlagen.');
    else if (result && result.ok) toast(`Rückblick-Bild gespeichert: ${result.path}`);
    else if (result && result.error) toast(result.error);
  }

  /* --- Cutter: BPM + waveform ------------------------------------------ */

  let bpmCache = readJSON(STORAGE.bpm, {}) || {};
  const bpmRunning = new Set();
  let bpmQueue = [];
  let bpmBusy = 0;
  let bpmRenderTimer = null;
  const TEMPOS = [
    { id: 'all', label: 'Alle' },
    { id: 'slow', label: 'Langsam < 90', min: 0, max: 90 },
    { id: 'mid', label: 'Mittel 90–119', min: 90, max: 120 },
    { id: 'fast', label: 'Schnell 120–139', min: 120, max: 140 },
    { id: 'veryfast', label: 'Sehr schnell 140+', min: 140, max: 999 },
  ];

  function analysable(entry) {
    return Boolean(entry && entry.url && /^https:\/\//i.test(entry.url) && (entry.kind === 'stream' || entry.kind === 'preview'));
  }

  let decodeRate = 22050;
  async function decodeEntry(entry, options = {}) {
    if (!bridge.audioBytes) throw new Error('Nicht verfügbar');
    const result = await bridge.audioBytes(entry.url, { full: Boolean(options.full) });
    if (!result || result.error || !result.bytes) throw new Error((result && result.error) || 'Audio nicht ladbar');
    const bytes = result.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result.bytes);
    const context = new OfflineAudioContext(2, 1, options.rate || decodeRate);
    return context.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  }

  // Tempo from the energy envelope (10 ms frames) by autocorrelation, 70–180 BPM.
  function estimateBpm(buffer) {
    const rate = buffer.sampleRate;
    const data = buffer.getChannelData(0);
    const start = Math.min(Math.max(0, data.length - rate * 20), Math.floor(rate * 3));
    const end = Math.min(data.length, start + Math.floor(rate * 30));
    const hop = Math.max(1, Math.floor(rate / 100));
    const env = [];
    let previous = 0;
    for (let at = start; at + hop <= end; at += hop) {
      let sum = 0;
      for (let k = at; k < at + hop; k += 2) sum += data[k] * data[k];
      const energy = Math.sqrt(sum / (hop / 2));
      env.push(Math.max(0, energy - previous));
      previous = energy;
    }
    if (env.length < 400) return 0;
    const score = (lag) => {
      let total = 0;
      for (let k = 0; k + lag < env.length; k += 1) total += env[k] * env[k + lag];
      return total;
    };
    let bestLag = 0;
    let best = 0;
    const scores = {};
    for (let lag = 33; lag <= 86; lag += 1) {
      scores[lag] = score(lag);
      if (scores[lag] > best) {
        best = scores[lag];
        bestLag = lag;
      }
    }
    if (!bestLag) return 0;
    // Octave check: music often repeats every half beat too – prefer the
    // double tempo when it fits almost as well (72 → 144 BPM).
    const half = Math.round(bestLag / 2);
    if (half >= 33) {
      const halfScore = Math.max(score(half - 1), score(half), score(half + 1));
      if (halfScore >= best * 0.55) {
        bestLag = [half - 1, half, half + 1].reduce((pick, lag) => (score(lag) > score(pick) ? lag : pick), half);
        best = score(bestLag);
      }
    }
    const left = scores[bestLag - 1] || score(bestLag - 1);
    const right = scores[bestLag + 1] || score(bestLag + 1);
    const curve = left - 2 * best + right;
    const shift = curve ? (0.5 * (left - right)) / curve : 0;
    let bpm = 6000 / (bestLag + Math.max(-0.5, Math.min(0.5, shift)));
    while (bpm < 70) bpm *= 2;
    while (bpm >= 180) bpm /= 2;
    return Math.round(bpm);
  }

  function bpmBadge(entry) {
    const bpm = bpmCache[entry.id];
    return bpm ? `<span class="song-preview bpm-badge" title="Gemessenes Tempo">${bpm} BPM</span>` : '';
  }

  function queueBpm(entries) {
    entries
      .filter((entry) => analysable(entry) && !bpmCache[entry.id] && !bpmRunning.has(entry.id))
      .forEach((entry) => {
        bpmRunning.add(entry.id);
        bpmQueue.push(entry);
      });
    pumpBpm();
  }

  function pumpBpm() {
    while (bpmBusy < 2 && bpmQueue.length) {
      const entry = bpmQueue.shift();
      bpmBusy += 1;
      decodeEntry(entry)
        .then((buffer) => {
          const bpm = estimateBpm(buffer);
          if (bpm) {
            bpmCache[entry.id] = bpm;
            const ids = Object.keys(bpmCache);
            if (ids.length > 3000) ids.slice(0, ids.length - 3000).forEach((id) => delete bpmCache[id]);
            writeJSON(STORAGE.bpm, bpmCache);
          }
        })
        .catch(() => {})
        .finally(() => {
          // A failed decode must not block the title forever: bpmCache alone
          // decides whether it is measured again on the next try.
          bpmRunning.delete(entry.id);
          bpmBusy -= 1;
          clearTimeout(bpmRenderTimer);
          bpmRenderTimer = setTimeout(() => {
            if (state.view === 'creator') renderCreatorList();
          }, 400);
          pumpBpm();
        });
    }
  }

  function tempoOf(id) {
    return TEMPOS.find((tempo) => tempo.id === id) || TEMPOS[0];
  }

  function filterByTempo(items) {
    const tempo = tempoOf(state.creator.tempo);
    if (tempo.id === 'all') return items;
    return items.filter((entry) => {
      const bpm = bpmCache[entry.id];
      return bpm && bpm >= tempo.min && bpm < tempo.max;
    });
  }

  function tempoRow(tab) {
    if (!tab || tab.kind === 'plugin' || isSfxTab(tab)) return '';
    const list = creatorList();
    const items = list ? list.items : [];
    const open = items.filter((entry) => analysable(entry) && !bpmCache[entry.id]).length;
    const active = state.creator.tempo || 'all';
    return `
      <div class="radio-tags tempo-row">
        <span class="muted small">Tempo:</span>
        ${TEMPOS.map((tempo) => `<button class="radio-tag ${active === tempo.id ? 'active' : ''}" data-tempo="${tempo.id}">${esc(tempo.label)}</button>`).join('')}
        ${open ? `<button class="link-btn" data-tempo-measure>${bpmQueue.length || bpmBusy ? `Messe … noch ${open}` : `Tempo messen (${open})`}</button>` : ''}
      </div>`;
  }

  // Waveform + cut markers for the creator title that is playing.
  const cut = { id: null, peaks: null, duration: 0, in: 0, out: 0, loop: false, exportOptions: { fadeIn: 0, fadeOut: 0, normalize: false, loop: false, loopMs: 150 }, loading: false, error: null };

  function cutEntry() {
    const item = currentItem();
    return item && analysable(item) ? item : null;
  }

  async function loadWaveform(entry) {
    cut.id = entry.id;
    cut.peaks = null;
    cut.loading = true;
    cut.error = null;
    cut.in = 0;
    cut.out = 0;
    cut.loop = false;
    cut.exportOptions = { fadeIn: 0, fadeOut: 0, normalize: false, loop: false, loopMs: 150 };
    renderCutPanel();
    try {
      const buffer = await decodeEntry(entry, { full: true });
      if (cut.id !== entry.id) return;
      const data = buffer.getChannelData(0);
      const bars = 480;
      const size = Math.max(1, Math.floor(data.length / bars));
      const peaks = [];
      for (let bar = 0; bar < bars; bar += 1) {
        let peak = 0;
        const from = bar * size;
        for (let k = from; k < from + size && k < data.length; k += 4) peak = Math.max(peak, Math.abs(data[k]));
        peaks.push(peak);
      }
      const top = Math.max(0.01, ...peaks);
      cut.peaks = peaks.map((value) => value / top);
      cut.duration = buffer.duration;
      cut.out = buffer.duration;
      if (!bpmCache[entry.id]) {
        const bpm = estimateBpm(buffer);
        if (bpm) {
          bpmCache[entry.id] = bpm;
          writeJSON(STORAGE.bpm, bpmCache);
        }
      }
    } catch (error) {
      if (cut.id === entry.id) cut.error = error.message;
    }
    if (cut.id === entry.id) {
      cut.loading = false;
      renderCutPanel();
    }
  }

  function canExportCut(entry) {
    const key = licenseKey(entry && entry.license);
    return Boolean(entry && (key === 'free' || key === 'by') && state.settings.downloads === 'cutting' && bridge.cutSave);
  }

  function renderCutPanel() {
    const host = $('#cut-panel');
    if (!host) return;
    const entry = cutEntry();
    if (!entry) {
      host.innerHTML = '';
      host.hidden = true;
      return;
    }
    host.hidden = false;
    if (cut.id !== entry.id) {
      loadWaveform(entry);
      return;
    }
    const length = Math.max(0, cut.out - cut.in);
    host.innerHTML = `
      <div class="panel cut-panel">
        <div class="cut-head">
          <strong>Wellenform · ${esc(entry.title)}</strong>
          <span class="muted small">${bpmCache[entry.id] ? `${bpmCache[entry.id]} BPM · ` : ''}Start ${fmtTime(cut.in)} · Ende ${fmtTime(cut.out)} · Länge ${fmtTime(length)}</span>
        </div>
        ${
          cut.loading
            ? '<div class="search-status"><span class="spinner small"></span><span>Wellenform wird berechnet …</span></div>'
            : cut.error
              ? `<p class="muted small">${esc(cut.error)}</p>`
              : '<canvas id="cut-wave" class="cut-wave" height="84"></canvas>'
        }
        <div class="row cut-actions">
          <button class="btn ghost small" data-cut="in" title="Start an der aktuellen Stelle (Taste I)">Start setzen (I)</button>
          <button class="btn ghost small" data-cut="out" title="Ende an der aktuellen Stelle (Taste O)">Ende setzen (O)</button>
          <button class="btn ${cut.loop ? 'primary' : 'ghost'} small" data-cut="loop">${cut.loop ? 'Schleife an' : 'Ausschnitt abspielen'}</button>
          <button class="btn ghost small" data-cut="reset">Zurücksetzen</button>
          <button class="btn ghost small" data-cut="copy" title="Zeitmarken für dein Schnittprogramm kopieren">Marken kopieren</button>
          ${canExportCut(entry) ? '<button class="btn ghost small" data-cut="save" title="Ausschnitt als WAV mit Credit-.txt in den Cutting-Ordner">Als WAV speichern</button>' : ''}
        </div>
        ${canExportCut(entry) ? `<div class="cut-export-options">
          <label>Fade-in <output id="cut-fade-in-label">${Number(cut.exportOptions.fadeIn).toFixed(1)} s</output><input type="range" min="0" max="5" step="0.1" id="cut-fade-in" value="${cut.exportOptions.fadeIn}" /></label>
          <label>Fade-out <output id="cut-fade-out-label">${Number(cut.exportOptions.fadeOut).toFixed(1)} s</output><input type="range" min="0" max="5" step="0.1" id="cut-fade-out" value="${cut.exportOptions.fadeOut}" /></label>
          <label class="toggle-row"><span><strong>Normalisieren</strong><small>Spitze auf −1 dBFS.</small></span><input type="checkbox" id="cut-normalize" ${cut.exportOptions.normalize ? 'checked' : ''} /></label>
          <label class="toggle-row"><span><strong>Loop-tauglich</strong><small>Übergang Ende → Anfang.</small></span><input type="checkbox" id="cut-loopable" ${cut.exportOptions.loop ? 'checked' : ''} /></label>
          <label class="${cut.exportOptions.loop ? '' : 'is-off'}">Loop-Übergang <output id="cut-loop-ms-label">${cut.exportOptions.loopMs} ms</output><input type="range" min="50" max="500" step="50" id="cut-loop-ms" value="${cut.exportOptions.loopMs}" ${cut.exportOptions.loop ? '' : 'disabled'} /></label>
        </div>` : ''}
      </div>`;
    drawWave();
  }

  function drawWave() {
    const canvas = $('#cut-wave');
    if (!canvas || !cut.peaks) return;
    const width = canvas.clientWidth || 600;
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(width * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(84 * ratio);
    }
    const ctx = canvas.getContext('2d');
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim() || '#5b8cff';
    const muted = styles.getPropertyValue('--muted-2').trim() || '#5f6a7c';
    const text = styles.getPropertyValue('--text').trim() || '#fff';
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, 84);
    const duration = cut.duration || 1;
    const inX = (cut.in / duration) * width;
    const outX = (cut.out / duration) * width;
    const step = width / cut.peaks.length;
    cut.peaks.forEach((peak, index) => {
      const x = index * step;
      const h = Math.max(1, peak * 76);
      ctx.fillStyle = x >= inX && x <= outX ? accent : muted;
      ctx.fillRect(x, 42 - h / 2, Math.max(1, step - 1), h);
    });
    ctx.fillStyle = text;
    ctx.fillRect(Math.round(inX), 0, 2, 84);
    ctx.fillRect(Math.round(outX) - 2, 0, 2, 84);
    const item = currentItem();
    if (item && item.id === cut.id && Number.isFinite(audio.currentTime)) {
      const x = Math.round((audio.currentTime / duration) * width);
      ctx.fillStyle = text;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, 0, 1, 84);
      ctx.globalAlpha = 1;
    }
  }

  function setCutMark(which) {
    const item = currentItem();
    if (!item || item.id !== cut.id || !cut.duration) return;
    const time = Math.max(0, Math.min(cut.duration, audio.currentTime || 0));
    if (which === 'in') {
      cut.in = time;
      if (cut.out <= cut.in) cut.out = cut.duration;
    } else {
      cut.out = time;
      if (cut.in >= cut.out) cut.in = 0;
    }
    renderCutPanel();
  }

  function cutTick() {
    if (!cut.peaks) return;
    const item = currentItem();
    if (!item || item.id !== cut.id) return;
    if (cut.loop && cut.out - cut.in > 0.5 && (audio.currentTime >= cut.out || audio.currentTime < cut.in - 0.3)) {
      audio.currentTime = cut.in;
    }
    if (state.view === 'creator') drawWave();
  }

  function processSlice(buffer, from, to, options = {}) {
    const rate = buffer.sampleRate;
    const channels = Math.min(2, buffer.numberOfChannels);
    const start = Math.max(0, Math.floor(from * rate));
    const end = Math.min(buffer.length, Math.floor(to * rate));
    const frames = Math.max(0, end - start);
    if (!frames) return { channels: [], frames: 0, rate };
    const audioData = Array.from({ length: channels }, (_value, channel) => Float32Array.from(buffer.getChannelData(channel).subarray(start, end)));
    const fadeInFrames = Math.min(frames, Math.round(Math.max(0, Math.min(5, Number(options.fadeIn) || 0)) * rate));
    const fadeOutFrames = Math.min(frames, Math.round(Math.max(0, Math.min(5, Number(options.fadeOut) || 0)) * rate));
    for (let frame = 0; frame < frames; frame += 1) {
      let envelope = 1;
      if (fadeInFrames > 1 && frame < fadeInFrames) envelope *= frame / (fadeInFrames - 1);
      if (fadeOutFrames > 1 && frame >= frames - fadeOutFrames) envelope *= (frames - 1 - frame) / (fadeOutFrames - 1);
      for (let channel = 0; channel < channels; channel += 1) audioData[channel][frame] *= Math.max(0, envelope);
    }
    const loopFrames = options.loop
      ? Math.min(Math.round(Math.max(50, Math.min(500, Number(options.loopMs) || 150)) * rate / 1000), Math.floor(frames / 2))
      : 0;
    if (loopFrames > 1) {
      for (let i = 0; i < loopFrames; i += 1) {
        const phase = i / (loopFrames - 1);
        const outgoing = Math.cos(phase * Math.PI / 2);
        const incoming = Math.sin(phase * Math.PI / 2);
        for (let channel = 0; channel < channels; channel += 1) {
          const tail = frames - loopFrames + i;
          audioData[channel][tail] = audioData[channel][tail] * outgoing + audioData[channel][i] * incoming;
        }
      }
    }
    if (options.normalize) {
      let peak = 0;
      audioData.forEach((channel) => channel.forEach((sample) => { peak = Math.max(peak, Math.abs(sample)); }));
      if (peak > 0) {
        const scale = Math.pow(10, -1 / 20) / peak;
        audioData.forEach((channel) => { for (let i = 0; i < channel.length; i += 1) channel[i] *= scale; });
      }
    }
    return { channels: audioData, frames, rate };
  }

  function encodeWav(channels, rate, frames) {
    const count = Math.max(0, Number.isFinite(frames) ? frames : (channels[0] ? channels[0].length : 0));
    const ch = Math.max(1, Math.min(2, channels.length));
    if (!count) return new Uint8Array(0);
    const out = new DataView(new ArrayBuffer(44 + count * ch * 2));
    const write = (offset, textValue) => [...textValue].forEach((char, index) => out.setUint8(offset + index, char.charCodeAt(0)));
    write(0, 'RIFF');
    out.setUint32(4, 36 + count * ch * 2, true);
    write(8, 'WAVE');
    write(12, 'fmt ');
    out.setUint32(16, 16, true);
    out.setUint16(20, 1, true);
    out.setUint16(22, ch, true);
    out.setUint32(24, rate, true);
    out.setUint32(28, rate * ch * 2, true);
    out.setUint16(32, ch * 2, true);
    out.setUint16(34, 16, true);
    write(36, 'data');
    out.setUint32(40, count * ch * 2, true);
    let offset = 44;
    for (let frame = 0; frame < count; frame += 1) {
      for (let channel = 0; channel < ch; channel += 1) {
        const sample = Math.max(-1, Math.min(1, channels[channel][frame] || 0));
        out.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Uint8Array(out.buffer);
  }

  function wavBytes(buffer, from, to, options = {}) {
    const slice = processSlice(buffer, from, to, options);
    if (!slice.frames) return new Uint8Array(0);
    return encodeWav(slice.channels, slice.rate, slice.frames);
  }

  // Studio: mix all clips in timeline order into one stereo channel pair.
  // A clip's `transition` crossfades its head with the previous clip's tail.
  function renderTimeline(clips, buffers, rate) {
    const layout = CMStudio ? CMStudio.timelineLayout(clips) : { rows: [], total: 0 };
    const totalFrames = Math.max(0, Math.round(layout.total * rate));
    const master = [new Float32Array(totalFrames), new Float32Array(totalFrames)];
    layout.rows.forEach((row, index) => {
      const clip = clips[index];
      const buffer = buffers.get(clip.key);
      if (!buffer) return;
      const nextOverlap = index + 1 < clips.length ? layout.rows[index + 1].overlap : 0;
      const slice = processSlice(buffer, clip.in, clip.out, clip);
      if (!slice.frames) return;
      const inFade = Math.max(0, Math.round(row.overlap * rate));
      const outFade = Math.max(0, Math.round(nextOverlap * rate));
      const startFrame = Math.max(0, Math.round(row.start * rate));
      for (let channel = 0; channel < 2; channel += 1) {
        const data = slice.channels[channel] || new Float32Array(slice.frames);
        const target = master[channel];
        for (let frame = 0; frame < slice.frames; frame += 1) {
          let envelope = 1;
          if (inFade > 1 && frame < inFade) envelope *= frame / (inFade - 1);
          if (outFade > 1 && frame >= slice.frames - outFade) envelope *= (slice.frames - 1 - frame) / (outFade - 1);
          const at = startFrame + frame;
          if (at >= 0 && at < totalFrames) target[at] += data[frame] * Math.max(0, envelope);
        }
      }
    });
    return { channels: master, frames: totalFrames };
  }

  async function saveCut() {
    const entry = cutEntry();
    if (!entry || entry.id !== cut.id || !canExportCut(entry)) return;
    if (cut.out - cut.in < 0.2) {
      toast('Setz erst Start und Ende.');
      return;
    }
    toast('Ausschnitt wird gespeichert …');
    try {
      const buffer = await decodeEntry(entry, { full: true, rate: 44100 });
      const options = Object.assign({}, cut.exportOptions);
      const bytes = wavBytes(buffer, cut.in, cut.out, options);
      const changes = [
        'Ausschnitt',
        options.fadeIn ? `Fade-in ${Number(options.fadeIn).toFixed(1)} s` : '',
        options.fadeOut ? `Fade-out ${Number(options.fadeOut).toFixed(1)} s` : '',
        options.normalize ? 'normalisiert auf −1 dBFS' : '',
        options.loop ? `Loop-Übergang ${Math.max(50, Math.min(500, Number(options.loopMs) || 150))} ms` : '',
      ].filter(Boolean).join(', ');
      const result = await bridge.cutSave({
        bytes,
        title: entry.title,
        artist: entry.artist,
        license: entry.license,
        licenseUrl: entry.licenseUrl,
        credit: entry.credit,
        link: entry.link,
        from: cut.in,
        to: cut.out,
        changes,
        folder: state.settings.downloadDir,
      });
      toast(result && result.ok ? `Gespeichert: ${result.name} – zum Schnittprogramm ziehen` : (result && result.error) || 'Speichern fehlgeschlagen');
    } catch (error) {
      toast(`Speichern fehlgeschlagen: ${error.message}`);
    }
  }

  // Studio: render the whole timeline (all clips in order) into one WAV.
  async function exportProject() {
    const project = activeCutProject();
    if (!project || !project.clips.length) {
      toast('Kein Projekt oder keine Clips zum Exportieren.');
      return;
    }
    if (!bridge.studioExport) {
      toast('Der Export ist nur in der Desktop-App verfügbar.');
      return;
    }
    if (!CMStudio || !CMStudio.isStreamSafe(project.clips)) {
      toast('Nicht alle Clips sind stream-sicher. Export nur mit CC0, CC BY, Public Domain oder NCS.');
      return;
    }
    const clips = project.clips.filter((clip) => clip.url && clip.out > clip.in);
    if (!clips.length) {
      toast('Kein Clip hat einen hörbaren Ausschnitt (Start muss vor dem Ende liegen).');
      return;
    }
    toast('Projekt wird gerendert …');
    try {
      const buffers = new Map();
      for (const clip of clips) {
        if (!buffers.has(clip.key)) {
          buffers.set(clip.key, await decodeEntry({ id: clip.key, url: clip.url, kind: 'stream' }, { full: true, rate: 44100 }));
        }
      }
      const rate = 44100;
      const rendered = renderTimeline(clips, buffers, rate);
      const bytes = encodeWav(rendered.channels, rate, rendered.frames);
      const result = await bridge.studioExport({
        bytes,
        name: project.name,
        text: projectCreditsText(project),
        clips: clips.map((clip) => ({
          title: clip.title,
          artist: clip.artist,
          license: clip.license,
          credit: clip.credit,
          from: clip.in,
          to: clip.out,
          changes: CMStudio.clipChanges(clip),
        })),
        folder: state.settings.downloadDir,
      });
      toast(result && result.ok ? `Projekt gespeichert: ${result.name} – inklusive Credit-.txt` : (result && result.error) || 'Export fehlgeschlagen');
    } catch (error) {
      toast(`Export fehlgeschlagen: ${error.message}`);
    }
  }

  // Studio: rough timeline preview. Plays each clip's trimmed range in order
  // through a dedicated Audio element, so the main player and its analysis
  // chain stay untouched. Fades/crossfades only apply to the export.
  const studioPreview = { audio: null, clips: [], index: -1, playing: false, token: 0 };

  function previewStop() {
    const p = studioPreview;
    if (p.audio) {
      p.audio.pause();
      p.audio.removeAttribute('src');
      try {
        p.audio.load();
      } catch {
        /* ignore */
      }
    }
    p.playing = false;
    p.index = -1;
    p.clips = [];
    const button = $('#studio-preview');
    if (button) button.textContent = '▶ Vorschau';
  }

  function previewPlay() {
    const p = studioPreview;
    const clip = p.clips[p.index];
    if (!clip) {
      previewStop();
      return;
    }
    const audioEl = p.audio;
    const token = ++p.token;
    const start = () => {
      audioEl.removeEventListener('loadedmetadata', start);
      if (!p.playing || p.token !== token) return;
      try {
        audioEl.currentTime = clip.in;
      } catch {
        /* ignore */
      }
      audioEl.play().catch(() => {
        if (p.token === token) previewNext();
      });
    };
    audioEl.addEventListener('loadedmetadata', start);
    audioEl.src = clip.url;
    audioEl.load();
  }

  function previewNext() {
    const p = studioPreview;
    if (!p.playing) return;
    p.index += 1;
    if (p.index >= p.clips.length) {
      previewStop();
      return;
    }
    previewPlay();
  }

  function previewToggle() {
    const p = studioPreview;
    if (p.playing) {
      previewStop();
      return;
    }
    const project = activeCutProject();
    if (!project) return;
    const clips = project.clips.filter((clip) => clip.url && clip.out > clip.in);
    if (!clips.length) {
      toast('Keine Clips mit hörbarem Ausschnitt zum Vorspielen.');
      return;
    }
    if (!p.audio) {
      p.audio = new Audio();
      p.audio.preload = 'auto';
      p.audio.addEventListener('ended', () => previewNext());
      p.audio.addEventListener('timeupdate', () => {
        const clip = p.clips[p.index];
        if (p.playing && clip && p.audio.currentTime >= clip.out - 0.05) previewNext();
      });
      p.audio.addEventListener('error', () => previewNext());
    }
    audio.pause();
    p.clips = clips;
    p.index = 0;
    p.playing = true;
    const button = $('#studio-preview');
    if (button) button.textContent = '⏹ Stopp';
    previewPlay();
  }

  function wireCutterExtras() {
    const view = $('#view-creator');
    if (view) {
      view.addEventListener('click', async (event) => {
        const tempo = event.target.closest('[data-tempo]');
        if (tempo) {
          state.creator.tempo = tempo.dataset.tempo;
          if (state.creator.tempo !== 'all') queueBpm(creatorList() ? creatorList().items : []);
          renderCreator();
          return;
        }
        if (event.target.closest('[data-tempo-measure]')) {
          queueBpm(creatorList() ? creatorList().items : []);
          renderCreator();
          return;
        }
        const button = event.target.closest('[data-cut]');
        if (button) {
          switch (button.dataset.cut) {
            case 'in':
            case 'out':
              setCutMark(button.dataset.cut);
              return;
            case 'loop':
              cut.loop = !cut.loop;
              if (cut.loop && cut.out > cut.in) audio.currentTime = cut.in;
              renderCutPanel();
              return;
            case 'reset':
              cut.in = 0;
              cut.out = cut.duration;
              cut.loop = false;
              renderCutPanel();
              return;
            case 'copy': {
              const ok = await bridge.copyText(`${fmtTime(cut.in)} – ${fmtTime(cut.out)} (${fmtTime(cut.out - cut.in)})`);
              toast(ok ? 'Zeitmarken kopiert' : 'Kopieren nicht möglich');
              return;
            }
            case 'save':
              saveCut();
              return;
            default:
              return;
          }
        }
        const canvas = event.target.closest('#cut-wave');
        if (canvas && cut.duration) {
          const item = currentItem();
          if (!item || item.id !== cut.id) return;
          const rect = canvas.getBoundingClientRect();
          audio.currentTime = Math.max(0, Math.min(cut.duration, ((event.clientX - rect.left) / rect.width) * cut.duration));
          drawWave();
        }
      });
      view.addEventListener('input', (event) => {
        const ids = { 'cut-fade-in': 'fadeIn', 'cut-fade-out': 'fadeOut', 'cut-loop-ms': 'loopMs' };
        const key = ids[event.target.id];
        if (!key) return;
        cut.exportOptions[key] = Number(event.target.value) || 0;
        const label = $(`#${event.target.id}-label`);
        if (label) label.textContent = key === 'loopMs' ? `${cut.exportOptions[key]} ms` : `${cut.exportOptions[key].toFixed(1)} s`;
      });
      view.addEventListener('change', (event) => {
        if (event.target.id === 'cut-normalize') cut.exportOptions.normalize = event.target.checked;
        else if (event.target.id === 'cut-loopable') {
          cut.exportOptions.loop = event.target.checked;
          renderCutPanel();
        } else if (event.target.id === 'cut-fade-in') cut.exportOptions.fadeIn = Number(event.target.value) || 0;
        else if (event.target.id === 'cut-fade-out') cut.exportOptions.fadeOut = Number(event.target.value) || 0;
        else if (event.target.id === 'cut-loop-ms') cut.exportOptions.loopMs = Number(event.target.value) || 150;
        const clipTrim = event.target.closest('[data-clip-in], [data-clip-out]');
        if (clipTrim) {
          const project = activeCutProject();
          const index = Number(clipTrim.dataset.clipIn != null ? clipTrim.dataset.clipIn : clipTrim.dataset.clipOut);
          const clip = project && project.clips[index];
          if (!clip) return;
          const value = Math.max(0, Number(event.target.value) || 0);
          if (clipTrim.dataset.clipIn != null) clip.in = Math.min(value, clip.out);
          else clip.out = Math.max(value, clip.in);
          persistCutProjects();
          renderCredits();
        }
        const clipFx = event.target.closest('[data-clip-fx]');
        if (clipFx) {
          const [at, field] = String(clipFx.dataset.clipFx).split(':');
          const project = activeCutProject();
          const clip = project && project.clips[Number(at)];
          if (!clip) return;
          if (field === 'normalize' || field === 'loop') clip[field] = event.target.checked;
          else if (field === 'loopMs') clip.loopMs = Math.max(50, Math.min(500, Math.round(Number(event.target.value) || 150)));
          else clip[field] = Math.max(0, Math.min(5, Number(event.target.value) || 0));
          persistCutProjects();
          if (field === 'transition' && CMStudio) {
            const total = $('#studio-total');
            if (total) total.textContent = fmtTime(CMStudio.totalDuration(project.clips));
          }
        }
      });
    }
    document.addEventListener('keydown', (event) => {
      if (state.view !== 'creator' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.target.closest && event.target.closest('input, textarea, select, [contenteditable]')) return;
      if (event.key === 'i' || event.key === 'I') setCutMark('in');
      if (event.key === 'o' || event.key === 'O') setCutMark('out');
    });
  }

  function wireReview() {
    const view = $('#view-review');
    if (view) {
      view.addEventListener('click', (event) => {
        const period = event.target.closest('[data-review-period]');
        if (period) {
          reviewPeriod = period.dataset.reviewPeriod;
          renderReview();
          return;
        }
        const action = event.target.closest('[data-review-action]');
        if (!action) return;
        if (action.dataset.reviewAction === 'copy') copyReview();
        if (action.dataset.reviewAction === 'play') playList('review', 0);
        if (action.dataset.reviewAction === 'share-image') shareReviewImage(false);
        if (action.dataset.reviewAction === 'copy-image') shareReviewImage(true);
        if (action.dataset.reviewAction === 'group-copy') copyWeekCard();
        if (action.dataset.reviewAction === 'group-add') addWeekCard();
      });
      view.addEventListener('click', (event) => {
        const remove = event.target.closest('[data-group-remove]');
        if (!remove) return;
        const key = remove.dataset.groupRemove;
        if (!group.members[key]) return;
        const name = group.members[key].name;
        delete group.members[key];
        persistGroup();
        renderReview();
        toast(`${name} aus der Gruppe entfernt`);
      });
      view.addEventListener('change', (event) => {
        if (event.target.id === 'rv-group-name') {
          saveGroupName();
          renderReview();
        }
      });
      view.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && event.target.id === 'rv-group-code') addWeekCard();
      });
    }
    window.addEventListener('beforeunload', () => {
      clearTimeout(statsTimer);
      writeJSON(STORAGE.stats, stats);
    });
  }

  let lastCutId = null;
  function syncCutPanel() {
    if (state.view !== 'creator') return;
    const entry = cutEntry();
    const id = entry ? entry.id : null;
    if (id === lastCutId) return;
    lastCutId = id;
    renderCutPanel();
  }

  /* ---------------------------------------------------------------- *
   * 1.8: download list with search
   * ---------------------------------------------------------------- */

  const dlView = { files: [], base: '', loading: false, error: null, query: '', folder: 'all' };
  let dlSearchTimer = null;

  function creditField(text, label) {
    const match = String(text || '').match(new RegExp(`^${label}:\\s*(.+)$`, 'mi'));
    return match ? match[1].trim() : '';
  }

  function downloadItem(file) {
    const credit = file.credit || '';
    const stem = file.name.replace(/\.[^.]+$/, '');
    const title = creditField(credit, 'Titel') || stem.replace(/^.+? - /, '') || stem;
    const artist = creditField(credit, 'Von') || (stem.includes(' - ') ? stem.split(' - ')[0] : '');
    const licenseLine = creditField(credit, 'Lizenz');
    const license = (licenseLine.match(/^(CC0|CC BY(?:-SA)?(?: \d\.\d)?|Public Domain|NCS)/i) || [])[1] || (licenseLine ? licenseLine.split(' ')[0] : '');
    const creditLines = credit.split(/\r?\n/);
    const creditAt = creditLines.findIndex((line) => /^Credit für deine Videobeschreibung:/i.test(line));
    return {
      id: `dl:${file.path}`,
      kind: 'local',
      source: 'local',
      sourceLabel: file.folder || 'Download',
      title,
      artist,
      album: '',
      artwork: '',
      duration: 0,
      url: file.url,
      link: creditField(credit, 'Quelle'),
      path: file.path,
      dir: file.folder || '',
      license,
      credit: creditAt >= 0 ? (creditLines[creditAt + 1] || '').trim() : '',
      creditText: credit,
      size: file.size,
      at: file.at,
      fileName: file.name,
    };
  }

  function dlWords(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9äöüß]+/)
      .filter(Boolean);
  }

  function visibleDownloads() {
    const words = dlWords(dlView.query);
    return dlView.files.filter((item) => {
      if (dlView.folder !== 'all' && item.dir !== dlView.folder) return false;
      if (!words.length) return true;
      const haystack = dlWords(`${item.title} ${item.artist} ${item.fileName} ${item.dir} ${item.license} ${item.creditText}`).join(' ');
      return words.every((word) => haystack.includes(word));
    });
  }

  async function loadDownloads() {
    if (!bridge.downloadsList) return;
    dlView.loading = true;
    renderDownloads();
    let result;
    try {
      result = await bridge.downloadsList(state.settings.downloadDir || '');
    } catch (error) {
      result = { files: [], error: error.message };
    }
    dlView.loading = false;
    dlView.error = (result && result.error) || null;
    dlView.base = (result && result.base) || '';
    dlView.files = ((result && result.files) || []).map(downloadItem);
    if (dlView.folder !== 'all' && !dlView.files.some((item) => item.dir === dlView.folder)) dlView.folder = 'all';
    renderDownloads();
  }

  function downloadRows(items) {
    return items
      .map((item, index) => {
        const playing = isPlayingId(item.id);
        const date = item.at ? new Date(item.at).toLocaleDateString('de-DE') : '';
        return `
          <div class="dl-row song-row ${playing ? 'playing' : ''}" data-list="downloads" data-index="${index}" title="${esc(item.path)}">
            <span class="dl-ic">${playing ? EQ : '♪'}</span>
            <span class="dl-meta">
              <span class="song-title">${esc(item.title)}</span>
              <span class="song-sub">${esc([item.artist, item.dir, date, fmtSize(item.size)].filter(Boolean).join(' · '))}</span>
            </span>
            ${item.license ? `<span class="lic-badge" data-lic="${licenseKey(item.license)}">${esc(item.license)}</span>` : ''}
            <span class="dl-actions">
              <button class="icon-btn dl-btn done" data-dl-file="${esc(item.path)}" data-dl-act="reveal" data-index="${index}" draggable="true" title="In dein Schnittprogramm ziehen – Klick zeigt die Datei">${ICONS.file}</button>
              ${item.credit ? `<button class="icon-btn" data-dl-act="credit" data-index="${index}" title="Credit kopieren">${ICONS.copy}</button>` : ''}
              <button class="icon-btn" data-dl-act="reveal" data-index="${index}" title="Im Ordner zeigen">${ICONS.folder || '📁'}</button>
            </span>
          </div>`;
      })
      .join('');
  }

  function renderDownloads() {
    const host = $('#view-downloads');
    if (!host) return;
    const folders = Array.from(new Set(dlView.files.map((item) => item.dir).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'de'));
    const items = visibleDownloads();
    const focused = document.activeElement && document.activeElement.id === 'dl-search';
    host.innerHTML = `
      <div class="page downloads-page">
        <div class="page-head">
          <div>
            <div class="eyebrow">Cutting-Ordner</div>
            <h2>Downloads</h2>
            <p>${dlView.base ? esc(dlView.base) : 'Alles, was CleanMusic für deine Videos gespeichert hat.'}</p>
          </div>
          <div class="page-actions">
            <button class="btn ghost small" data-dl-page="pick" title="Wunschordner für alle Downloads wählen">Ordner ändern …</button>
            <button class="btn ghost small" data-dl-page="refresh">Aktualisieren</button>
            <button class="btn ghost small" data-dl-page="open">Ordner öffnen</button>
          </div>
        </div>
        <div class="radio-search dl-search">
          <input id="dl-search" type="search" value="${esc(dlView.query)}" placeholder="In Downloads suchen – Titel, Künstler, Lizenz, Credit …" autocomplete="off" spellcheck="false" />
        </div>
        ${
          folders.length > 1
            ? `<div class="radio-tags dl-folders">${[['all', 'Alle'], ...folders.map((name) => [name, name])]
                .map(
                  ([id, label]) =>
                    `<button class="radio-tag ${dlView.folder === id ? 'active' : ''}" data-dl-folder="${esc(id)}">${esc(label)} <small>${
                      id === 'all' ? dlView.files.length : dlView.files.filter((item) => item.dir === id).length
                    }</small></button>`
                )
                .join('')}</div>`
            : ''
        }
        ${
          dlView.loading && !dlView.files.length
            ? '<div class="search-status"><span class="spinner small"></span><span>Downloads werden gelesen …</span></div>'
            : !dlView.files.length
              ? `<div class="panel empty-search"><h3>Noch keine Downloads</h3><p>${esc(
                  dlView.error ||
                    'Schalte unter Einstellungen → Downloads „Nur Cutting“ ein und lade im Cutter-Modus freie Titel herunter – sie erscheinen dann hier.'
                )}</p></div>`
              : !items.length
                ? '<div class="panel empty-search"><h3>Nichts gefunden</h3><p>Kein Download passt zu deiner Suche.</p></div>'
                : `<div class="results-head"><span>${items.length} ${items.length === 1 ? 'Datei' : 'Dateien'}</span><span class="muted small">Klick spielt ab · Symbol ziehen ins Schnittprogramm</span></div>
                   <div class="song-list">${downloadRows(items)}</div>`
        }
      </div>`;
    if (focused) {
      const input = $('#dl-search');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }

  async function downloadAction(button) {
    const item = visibleDownloads()[Number(button.dataset.index)];
    if (!item) return;
    if (button.dataset.dlAct === 'reveal') {
      if (!(await bridge.cuttingReveal(item.path))) toast('Datei nicht mehr vorhanden.');
      return;
    }
    if (button.dataset.dlAct === 'credit') {
      const ok = await bridge.copyText(item.credit);
      toast(ok ? 'Credit kopiert' : 'Kopieren nicht möglich');
    }
  }

  const ADVANCED_VIEWS = ['creator', 'downloads'];

  function layoutMode() {
    return state.settings.layout === 'simple' ? 'simple' : 'advanced';
  }

  function applyLayout() {
    document.documentElement.dataset.layout = layoutMode();
  }

  function setLayout(mode) {
    state.settings.layout = mode === 'simple' ? 'simple' : 'advanced';
    saveSettings();
    applyLayout();
    if (layoutMode() === 'simple' && ADVANCED_VIEWS.includes(state.view)) showView('home');
    renderSettings();
    toast(layoutMode() === 'simple' ? 'Einfache Ansicht – Profi-Funktionen ausgeblendet' : 'Erweiterte Ansicht – alle Funktionen sichtbar');
  }

  function layoutPanelHtml() {
    const mode = layoutMode();
    return `
        <div class="bg-picker">
          <strong>Ansicht</strong>
          <div class="radio-tags">
            <button class="radio-tag ${mode === 'simple' ? 'active' : ''}" data-layout-id="simple">Einfach</button>
            <button class="radio-tag ${mode === 'advanced' ? 'active' : ''}" data-layout-id="advanced">Erweitert</button>
          </div>
          <small class="muted">Einfach blendet Cutter-Modus, Downloads, Plugins, Discord und Profi-Schalter aus. Nichts geht verloren – zurück jederzeit hier.</small>
        </div>`;
  }

  async function pickDownloadFolder() {
    if (!bridge.pluginPickFolder) return;
    const picked = await bridge.pluginPickFolder();
    if (!picked) return;
    state.settings.downloadDir = picked;
    saveSettings();
    syncCreatorDownloadFolder();
    toast('Neuer Download-Ordner gespeichert');
    loadDownloads();
  }

  /* --- Turntable ------------------------------------------------------- */

  function applyVinyl() {
    document.documentElement.classList.toggle('cover-vinyl', Boolean(state.settings.vinyl));
    const button = $('#fs-vinyl');
    if (button) button.classList.toggle('active', Boolean(state.settings.vinyl));
  }

  function setVinyl(on) {
    state.settings.vinyl = Boolean(on);
    saveSettings();
    applyVinyl();
    if (state.view === 'settings') renderSettings();
  }

  // The record turns only while music plays (the arm lifts on pause).
  function syncPlayingClass() {
    document.documentElement.classList.toggle('is-playing', Boolean(audio.getAttribute('src')) && !audio.paused);
  }

  function wireVinyl() {
    ['play', 'playing', 'pause', 'ended', 'emptied'].forEach((name) => audio.addEventListener(name, syncPlayingClass));
    applyVinyl();
    syncPlayingClass();
  }

  function wireDownloadsView() {
    const view = $('#view-downloads');
    if (!view) return;
    view.addEventListener('input', (event) => {
      if (event.target.id !== 'dl-search') return;
      dlView.query = event.target.value;
      clearTimeout(dlSearchTimer);
      dlSearchTimer = setTimeout(renderDownloads, 150);
    });
    view.addEventListener('click', (event) => {
      const page = event.target.closest('[data-dl-page]');
      if (page) {
        if (page.dataset.dlPage === 'refresh') loadDownloads();
        if (page.dataset.dlPage === 'pick') pickDownloadFolder();
        if (page.dataset.dlPage === 'open' && bridge.cuttingOpenFolder) bridge.cuttingOpenFolder(state.settings.downloadDir || '');
        return;
      }
      const folder = event.target.closest('[data-dl-folder]');
      if (folder) {
        dlView.folder = folder.dataset.dlFolder;
        renderDownloads();
      }
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

  const SINGLE_CONTEXTS = ['search', 'ext', 'shared'];
  let autoplayTask = null;
  let queuePanelOpen = false;

  function autoplayOn() {
    return state.settings.autoplay !== false;
  }

  // Titles the user queued that have not played yet.
  function pendingQueued() {
    return queueSlice.pending();
  }

  function queueCopy(entry, flags) {
    return Object.assign({}, entry, { queued: false, autoplay: false, requestedBy: null, requestedAt: 0 }, flags);
  }

  // Handy-Fernbedienung (Desktop und TV): einen Treffer/Sender sofort spielen,
  // ohne die restliche Warteschlange zu verwerfen.
  function playRemoteEntry(entry) {
    if (!entry) return false;
    const copy = queueCopy(entry);
    const at = queueSlice.insert([copy], 'next');
    if (at >= 0) {
      playFromQueue(at);
    } else {
      queueSlice.replace([copy], 0, 'queue');
      playFromQueue(0);
    }
    return true;
  }

  function enqueue(entries, mode = 'end', flags = {}) {
    const list = (Array.isArray(entries) ? entries : [entries]).filter(Boolean);
    if (!list.length) return;
    const copies = list.map((entry) => queueCopy(entry, Object.assign({ queued: true }, flags)));
    const by = flags.requestedBy ? `Songwunsch von ${flags.requestedBy}: ` : '';
    const q = state.queue;

    if (q.index < 0 || !q.items[q.index]) {
      queueSlice.replace(copies, 0, 'queue');
      playFromQueue(0);
      toast(by + (copies.length === 1 ? `„${copies[0].title}“ wird abgespielt` : `${copies.length} Titel werden abgespielt`));
      return;
    }

    const at = queueSlice.insert(copies, mode);
    if (at < 0) return;
    planUpcoming();
    schedulePrefetch();
    renderQueuePanel();
    const name = copies.length === 1 ? `„${copies[0].title}“` : `${copies.length} Titel`;
    toast(by + (mode === 'next' ? `${name} kommt als Nächstes` : `${name} in der Warteschlange`));
  }

  function autoplayEligible() {
    const { items, index } = state.queue;
    if (!autoplayOn()) return false;
    if (CMPlayback.blocksAutoplay(state.playback.repeat)) return false;
    if (index < 0 || index < items.length - 1) return false;
    return Boolean(autoplaySeed());
  }

  // The current title is the best seed; if it has no artist (radio, local file
  // without tags), look back through what just played.
  function autoplaySeed() {
    return queueSlice.seed((entry) => {
      if (entry.kind === 'radio') return false;
      if (tasteTrackValue(entry) < 0 || tasteArtistValue(entry) < 0) return false;
      const name = primaryArtist(entry.artist);
      if (name && name.length > 1) return true;
      if (entry.kind === 'plugin' && entry.refId) {
        const plugin = pluginById(entry.pluginId);
        return Boolean(isPluginReady(plugin) && plugin.capabilities.related);
      }
      return false;
    });
  }

  function maybeAutoplay() {
    if (autoplayTask) return autoplayTask;
    const seed = autoplaySeed();
    if (!autoplayEligible() || !bridge.recommendations || !seed) return null;
    const queue = state.queue;
    const index = queue.index;
    autoplayTask = fetchAutoplay(seed, queue, index)
      .catch(() => 0)
      .finally(() => {
        autoplayTask = null;
      });
    return autoplayTask;
  }

  async function fetchAutoplay(seed, queue, index) {
    if (!seed) return 0;
    const name = primaryArtist(seed.artist);
    const artists = name && name.length > 1 ? [{ name, deezerId: seed.source === 'deezer' ? seed.artistId || null : null }] : [];
    // Let autoplay drift toward the taste profile instead of only the last artist.
    tasteArtists(3).forEach((artist) => {
      if (artists.length >= 3) return;
      if (artists.some((known) => known.name.toLowerCase() === artist.name.toLowerCase())) return;
      artists.push({ name: artist.name, deezerId: artist.deezerId || null });
    });
    const pluginSeeds = [];
    if (seed.kind === 'plugin' && seed.refId) {
      const plugin = pluginById(seed.pluginId);
      if (isPluginReady(plugin) && plugin.capabilities.related) pluginSeeds.push({ id: plugin.id, refIds: [seed.refId] });
    }
    if (!artists.length && !pluginSeeds.length) return 0;

    const result = await bridge.recommendations({ artists, pluginSeeds });
    // The user may have started something else (or skipped) meanwhile.
    if (state.queue !== queue || state.queue.index !== index) return 0;
    const current = state.queue.items[state.queue.index];
    if (!current) return 0;

    const known = new Set();
    state.queue.items.forEach((entry) => {
      known.add(entry.id);
      known.add(matchKey(entry));
    });
    const keep = (entry) =>
      entry &&
      !known.has(entry.id) &&
      !known.has(matchKey(entry)) &&
      tasteTrackValue(entry) >= 0 &&
      tasteArtistValue(entry) >= 0;
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

    queueSlice.append(picked);
    planUpcoming();
    schedulePrefetch();
    renderQueuePanel();
    if (state.fullscreen) renderUpNext();
    return picked.length;
  }

  function removeFromQueue(position) {
    if (!queueSlice.remove(position)) return;
    planUpcoming();
    schedulePrefetch();
    renderQueuePanel();
    if (state.fullscreen) renderUpNext();
  }

  function moveInQueue(from, to) {
    if (!queueSlice.move(from, to)) return;
    planUpcoming();
    schedulePrefetch();
    renderQueuePanel();
    if (state.fullscreen) renderUpNext();
  }

  function clearAddedToQueue() {
    const removed = queueSlice.clearAdded();
    planUpcoming();
    schedulePrefetch();
    renderQueuePanel();
    if (state.fullscreen) renderUpNext();
    toast(removed ? `${removed} Titel entfernt` : 'Nichts zum Entfernen');
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
            : autoplayOn() && CMPlayback.repeatOff(state.playback.repeat)
              ? 'Danach geht es mit passenden Vorschlägen weiter.'
              : 'Danach ist Schluss.'
        }</p>`;
      }
      if (state.playback.shuffle) {
        body += '<p class="queue-hint">Zufall ist an: Die Reihenfolge ist gemischt, kein Titel kommt doppelt. Von dir eingereihte Titel und Songwünsche bleiben vorn.</p>';
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
    toast(on ? 'Autoplay an – nach dem Ende der Warteschlange laufen passende Vorschläge weiter' : 'Autoplay aus');
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

  const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const EQ_PRESETS = [
    { id: 'neutral', label: 'Neutral', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { id: 'bass', label: 'Bass-Boost', gains: [6, 6, 4, 2, 0, 0, -1, -1, 1, 1] },
    { id: 'voice', label: 'Stimme/Podcast', gains: [0, 0, -2, 0, 3, 4, 3, 1, -1, -2] },
    { id: 'bright', label: 'Hell', gains: [0, 0, 0, -1, 0, 1, 3, 5, 4, 2] },
    { id: 'warm', label: 'Warm', gains: [3, 3, 2, 1, 0, -1, -1, -2, -2, -2] },
    { id: 'laptop', label: 'Laptop-Lautsprecher', gains: [5, 5, 3, 0, -1, 1, 3, 2, 0, -1] },
    { id: 'headphones', label: 'Kopfhörer', gains: [3, 2, 0, -1, 0, 1, 2, 2, 1, 0] },
    { id: 'electronic', label: 'Elektronisch', gains: [4, 3, 1, -1, -2, 1, 2, 3, 3, 2] },
    { id: 'acoustic', label: 'Akustik', gains: [1, 1, 0, 0, 2, 3, 3, 2, 1, 0] },
  ];

  function eqGains(values) {
    return EQ_BANDS.map((_frequency, index) => {
      const value = Number(values && values[index]);
      return Number.isFinite(value) ? Math.max(-12, Math.min(12, Math.round(value))) : 0;
    });
  }

  function loadEqualizer() {
    const saved = readJSON(STORAGE.eq, {}) || {};
    const custom = (Array.isArray(saved.custom) ? saved.custom : [])
      .map((preset) => ({ name: String(preset && preset.name || '').trim().slice(0, 40), gains: eqGains(preset && preset.gains) }))
      .filter((preset, index, all) => preset.name && all.findIndex((entry) => entry.name.toLowerCase() === preset.name.toLowerCase()) === index)
      .slice(0, 10);
    const preset = String(saved.preset || 'neutral');
    const known = EQ_PRESETS.some((entry) => entry.id === preset) || (preset.startsWith('custom:') && custom.some((entry) => entry.name === preset.slice(7)));
    return { enabled: Boolean(saved.enabled), preset: known ? preset : 'neutral', gains: eqGains(saved.gains), custom };
  }

  let eqState = loadEqualizer();

  function persistEq() {
    writeJSON(STORAGE.eq, { enabled: Boolean(eqState.enabled), preset: eqState.preset, gains: eqGains(eqState.gains), custom: eqState.custom.slice(0, 10) });
  }

  function selectEqPreset(id) {
    const builtIn = EQ_PRESETS.find((entry) => entry.id === id);
    const custom = id.startsWith('custom:') ? eqState.custom.find((entry) => entry.name === id.slice(7)) : null;
    if (!builtIn && !custom && id !== 'custom') return;
    eqState.preset = id;
    if (builtIn) eqState.gains = builtIn.gains.slice();
    else if (custom) eqState.gains = custom.gains.slice();
    persistEq();
    applyVolume();
    drawEqCurve();
    renderSettings();
  }

  async function chooseCustomBackground() {
    const result = await bridge.liveBgPick();
    if (!result || result.canceled) return;
    if (result.error || !result.url) { toast(result.error || 'Hintergrunddatei konnte nicht geladen werden.'); return; }
    customBg = { url: result.url, kind: result.kind === 'gif' ? 'gif' : 'video' };
    state.settings.background = 'custom';
    saveSettings();
    applyBackground();
    renderSettings();
    toast('Eigenes Hintergrundvideo geladen.');
  }

  function setFullscreenBackground(mode) {
    state.settings.fsBackground = ['cover-static', 'cover-moving', 'live', 'off'].includes(mode) ? mode : 'cover-moving';
    saveSettings();
    syncLiveBackground();
    syncFullscreen();
    renderSettings();
  }

  async function saveCustomEq() {
    const answer = await askText({ title: 'Equalizer-Preset speichern', message: 'Name für dieses Preset (max. 40 Zeichen):', value: 'Mein Preset', confirm: 'Speichern' });
    const name = String(answer || '').trim().replace(/[\r\n\0]/g, '').slice(0, 40);
    if (!name) return;
    const index = eqState.custom.findIndex((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (index < 0 && eqState.custom.length >= 10) {
      toast('Es sind bereits 10 eigene Presets gespeichert.');
      return;
    }
    const preset = { name, gains: eqGains(eqState.gains) };
    if (index < 0) eqState.custom.push(preset);
    else eqState.custom[index] = preset;
    eqState.preset = `custom:${name}`;
    persistEq();
    renderSettings();
    toast(`Equalizer-Preset „${name}“ gespeichert.`);
  }

  async function deleteCustomEq() {
    if (!eqState.preset.startsWith('custom:')) return;
    const name = eqState.preset.slice(7);
    if (!(await askConfirm({ title: 'Eigenes Preset löschen?', message: `„${name}“ wird gelöscht.`, confirm: 'Löschen', danger: true }))) return;
    eqState.custom = eqState.custom.filter((entry) => entry.name !== name);
    eqState.preset = 'neutral';
    eqState.gains = EQ_PRESETS[0].gains.slice();
    persistEq();
    applyVolume();
    renderSettings();
  }

  function equalizerPanelHtml() {
    const customSelected = eqState.preset.startsWith('custom:');
    return `
      <div class="panel eq-panel" id="eq-panel">
        <h3>10-Band-Equalizer</h3>
        <p class="muted small">Peaking-Filter mit Q 1,1 · ±12 dB. Die Filter verwenden dieselbe dauerhafte Audio-Kette wie Bass/Höhen.</p>
        <label class="toggle-row">
          <span><strong>Equalizer einschalten</strong><small>Schaltet die Web-Audio-Kette ein, ohne den Ton umzuleiten oder den AudioContext später zu pausieren.</small></span>
          <input type="checkbox" id="opt-eq-enabled" ${eqState.enabled ? 'checked' : ''} />
        </label>
        <label class="eq-preset-row"><strong>Preset</strong><select id="opt-eq-preset" class="select-input">
          ${EQ_PRESETS.map((preset) => `<option value="${preset.id}" ${eqState.preset === preset.id ? 'selected' : ''}>${esc(preset.label)}</option>`).join('')}
          <option value="custom" ${eqState.preset === 'custom' ? 'selected' : ''}>Eigene Einstellung</option>
          ${eqState.custom.map((preset) => `<option value="custom:${esc(preset.name)}" ${eqState.preset === `custom:${preset.name}` ? 'selected' : ''}>${esc(preset.name)}</option>`).join('')}
        </select></label>
        <div class="eq-advanced advanced-only">
          <canvas id="eq-curve" height="128" aria-label="Equalizer-Kurve"></canvas>
          <div class="eq-bands">${EQ_BANDS.map((frequency, index) => `<label><span>${frequency >= 1000 ? `${frequency / 1000}k` : frequency} Hz</span><input type="range" min="-12" max="12" step="1" data-eq-band="${index}" value="${eqState.gains[index]}" aria-label="Equalizer ${frequency} Hertz" /><output data-eq-value="${index}">${eqState.gains[index]} dB</output></label>`).join('')}</div>
          <div class="row"><button class="btn ghost small" data-eq-action="save">Eigenes Preset speichern</button>${customSelected ? '<button class="btn ghost small danger" data-eq-action="delete">Preset löschen</button>' : ''}</div>
        </div>
      </div>`;
  }

  function drawEqCurve() {
    const canvas = $('#eq-curve');
    if (!canvas) return;
    const width = Math.max(300, canvas.clientWidth || 600);
    const height = 128;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d');
    const styles = getComputedStyle(document.documentElement);
    const accent = styles.getPropertyValue('--accent').trim();
    const muted = styles.getPropertyValue('--muted-2').trim();
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = muted;
    ctx.globalAlpha = 0.35;
    [-12, -6, 0, 6, 12].forEach((db) => {
      const y = height / 2 - (db / 24) * (height - 18);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    const xOf = (frequency) => ((Math.log(frequency) - Math.log(EQ_BANDS[0])) / (Math.log(EQ_BANDS[9]) - Math.log(EQ_BANDS[0]))) * width;
    ctx.beginPath();
    eqState.gains.forEach((gain, index) => {
      const x = xOf(EQ_BANDS[index]);
      const y = height / 2 - (gain / 24) * (height - 18);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

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
    return CMVolume.max(state.settings.volumeBoost);
  }

  function persistVolume() {
    writeJSON(STORAGE.level, { level: vol.level, muted: vol.muted });
  }

  function volumeLevel() {
    return Math.min(vol.level, maxVolume());
  }

  function applyVolume() {
    const level = volumeLevel();
    const gain = CMVolume.gain(level, vol.muted, fadeFactor);
    const viz = window.CMVisualizer;
    const engine =
      viz && viz.setOutput
        ? viz.setOutput({
            gain,
            normalize: Boolean(state.settings.normalize),
            bass: Number(state.settings.bass) || 0,
            treble: Number(state.settings.treble) || 0,
            eqEnabled: Boolean(eqState.enabled),
            want: Boolean(
              state.settings.normalize ||
                state.settings.volumeBoost ||
                Number(state.settings.bass) ||
                Number(state.settings.treble) ||
                eqState.enabled
            ),
          })
        : false;
    if (viz && viz.setEq) viz.setEq(eqState.gains);
    if (engine) {
      // The engine applies the gain – the element itself stays at full level.
      audio.volume = 1;
      audio.muted = false;
    } else {
      audio.volume = CMVolume.elementVolume(level, vol.muted, fadeFactor);
      audio.muted = vol.muted;
    }
    // The crossfade ghost is a second element; Mute must silence it too.
    if (transition) transition.ghost.muted = vol.muted;
    updateVolumeUi();
    pushPlayerState();
  }

  function setVolume(level, { unmute = true } = {}) {
    if (!Number.isFinite(level)) return;
    vol.level = CMVolume.clampLevel(level, maxVolume());
    if (unmute) vol.muted = false;
    applyVolume();
    persistVolume();
  }

  function nudgeVolume(delta) {
    setVolume(CMVolume.adjust(volumeLevel(), delta, maxVolume()));
  }

  function setMuted(muted) {
    vol.muted = Boolean(muted);
    // Unmuting at 0 % would stay silent – come back at a sensible level.
    if (!vol.muted) vol.level = CMVolume.unmuteLevel(vol.level);
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
    const pct = CMVolume.percent(volumeLevel());
    const over = !vol.muted && level > 1;
    ['#volume', '#fs-volume'].forEach((selector) => {
      const input = $(selector);
      if (!input) return;
      input.max = String(max);
      input.value = String(level);
      input.style.setProperty('--fill', `${CMVolume.fill(level, max).toFixed(2)}%`);
      input.style.setProperty('--full', `${CMVolume.fill(1, max).toFixed(2)}%`);
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
   * Silence guard: a title can "play" without any audio data – a stream
   * that carries no sound, a broken output chain, a device that went away.
   * The visualizer analyser (pre-gain, so the volume never matters) reports
   * exact digital silence; then a streamed title is reloaded once with a
   * fresh URL, afterwards the 30 s preview runs. Local titles only get a
   * hint, once per title. Radio is left alone (gaps are normal there), and
   * without analysis nothing is assumed.
   * ---------------------------------------------------------------- */

  const silence = { id: null, tries: 0, toldAt: 0 };

  // Pure decision (also used by the smoke test). Deliberately patient: real
  // music is never digitally silent for ten seconds, and a title with a long
  // silent intro should not be restarted.
  function silenceDecision(sample) {
    const { time, silentFor, mode, tries } = sample || {};
    // A title found automatically gets checked sooner (6 s of exact silence after
    // 4 s) – the user did not pick that upload and can not tell what went wrong.
    const needTime = mode === 'matched' ? 4 : 8;
    const needSilent = mode === 'matched' ? 6000 : 10000;
    if (!(Number(time) > needTime) || !(Number(silentFor) > needSilent)) return 'wait';
    if (mode === 'plugin' || mode === 'matched') {
      // A match plays only silence (muted upload): reloading would bring the
      // same video back – look for another one instead.
      if (Number(tries) < 1) return mode === 'matched' ? 'rematch' : 'reload';
      if (Number(tries) < 2) return 'preview';
    }
    return 'tell';
  }

  function checkSilence() {
    const viz = window.CMVisualizer;
    if (!viz || typeof viz.silentFor !== 'function') return;
    const item = currentItem();
    if (!item || !item.id) return;
    if (audio.paused || audio.ended || audio.seeking || state.nowMode === 'error') return;
    // Muted or turned down by the user is not "no sound from the title".
    if (vol.muted || volumeLevel() < 0.02) return;
    if (silence.id !== item.id) {
      silence.id = item.id;
      silence.tries = 0;
    }
    if (item.kind === 'radio') return;
    // Works with the visualizer switched off as well: while a full title plays,
    // the analyser taps the element (nothing is drawn) and is read here.
    const fullTitle = state.nowMode === 'plugin' || state.nowMode === 'matched';
    if (typeof viz.setWatching === 'function') viz.setWatching(fullTitle, 'silence');
    if (fullTitle && typeof viz.probeSilence === 'function') viz.probeSilence();

    const decision = silenceDecision({
      time: audio.currentTime,
      silentFor: viz.silentFor(),
      mode: state.nowMode,
      tries: silence.tries,
    });
    if (decision === 'wait') return;

    if (decision === 'rematch') {
      silence.tries = 1;
      markSilentRef(state.nowRef);
      forgetMatch(item);
      toast('Der gefundene volle Titel hat keinen Ton – suche einen anderen …');
      playFromQueue(state.queue.index, { force: true, retry: true });
      return;
    }

    if (decision === 'reload') {
      silence.tries = 1;
      toast('Der Stream liefert keinen Ton – Titel wird neu geladen …');
      playFromQueue(state.queue.index, { force: true, retry: true });
      return;
    }
    if (decision === 'preview') {
      silence.tries = 2;
      const token = playToken;
      const index = state.queue.index;
      freshPreview(item, true)
        .then((url) => {
          if (!url || token !== playToken || state.queue.index !== index) return;
          state.nowMode = 'preview';
          state.nowLabel = null;
          setNowPlaying(item);
          audio.src = url;
          audio.play().catch(() => {});
          toast('Voller Titel ohne Ton – 30-s-Vorschau läuft.');
        })
        .catch(() => {});
      return;
    }

    silence.tries = 3;
    // Never nag: at most one hint every 90 seconds, even across titles.
    if (Date.now() - silence.toldAt < 90000) return;
    silence.toldAt = Date.now();
    toast(`„${item.title}“ läuft ohne Ton – bitte Ausgabegerät und Titel prüfen.`);
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
    // YouTube via the source plugin: only CC BY (the plugin verifies it again per video).
    if (entry.kind === 'plugin') {
      const plugin = pluginById(entry.pluginId);
      return entry.ytLicense === 'cc-by' && Boolean(plugin && isPluginReady(plugin) && plugin.capabilities.download);
    }
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
      result =
        entry.kind === 'plugin'
          ? await bridge.pluginDownload(entry.pluginId, {
              refId: entry.refId,
              title: entry.title,
              artist: entry.artist,
              link: entry.link,
              folder: state.settings.downloadDir,
            })
          : await bridge.cuttingDownload({
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
      if (state.settings.downloads === 'cutting') addEntryToCutProject(entry, true);
      if (state.view === 'downloads') loadDownloads();
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
  const cutProjectData = readJSON(STORAGE.cutProjects, {}) || {};
  const cutProjects = {
    active: typeof cutProjectData.active === 'string' ? cutProjectData.active : null,
    projects: (Array.isArray(cutProjectData.projects) ? cutProjectData.projects : [])
      .slice(0, 100)
      .map((project) => (CMStudio ? CMStudio.normalizeProject(project) : null))
      .filter((project) => project && project.id),
  };
  if (cutProjects.active && !cutProjects.projects.some((project) => project.id === cutProjects.active)) cutProjects.active = null;

  function persistCutProjects() {
    writeJSON(STORAGE.cutProjects, cutProjects);
  }

  function activeCutProject() {
    return cutProjects.projects.find((project) => project.id === cutProjects.active) || null;
  }

  function addEntryToCutProject(entry, silent = false) {
    const project = activeCutProject();
    if (!project || !entry) {
      if (!silent && !project) toast('Wähle zuerst ein Cutting-Projekt.');
      return false;
    }
    const key = String(entry.id || entry.url || `${entry.title}|${entry.artist}`);
    if (project.clips.some((clip) => clip.key === key)) {
      if (!silent) toast('Dieser Titel ist schon im Projekt.');
      return false;
    }
    const clip = CMStudio ? CMStudio.clipOf(entry, key) : null;
    if (!clip) return false;
    project.clips.push(clip);
    persistCutProjects();
    if (state.view === 'creator') renderCredits();
    if (!silent) toast(`„${entry.title}“ zum Projekt „${project.name}“ hinzugefügt.`);
    return true;
  }

  async function createCutProject() {
    const answer = await askText({ title: 'Neues Cutting-Projekt', message: 'Name für dein Video-Projekt:', value: 'Mein Video-Projekt', confirm: 'Erstellen' });
    const name = String(answer || '').trim().slice(0, 80);
    if (!name) return;
    const project = { id: uid(), name, created: Date.now(), clips: [] };
    cutProjects.projects.unshift(project);
    cutProjects.active = project.id;
    persistCutProjects();
    renderCredits();
  }

  function projectCreditsText(project) {
    if (!project) return '';
    return CMStudio ? CMStudio.studioCreditText(project) : '';
  }

  async function saveCutProjectCredits() {
    const project = activeCutProject();
    if (!project || !project.clips.length || !bridge.projectCreditsSave) return;
    const result = await bridge.projectCreditsSave({ name: project.name, folder: state.settings.downloadDir || state.downloadDefault || '', text: projectCreditsText(project) });
    if (result && result.ok) toast(`Projekt-Credits gespeichert: ${result.name}`);
    else toast(result && result.error || 'Credits konnten nicht gespeichert werden.');
  }

  function creatorTabs() {
    return CREATOR.tabs.filter((tab) => tab.kind !== 'plugin' || searchPlugin());
  }

  function creatorTab(id = state.creator.tab) {
    const tabs = creatorTabs();
    return tabs.find((tab) => tab.id === id) || tabs[0] || null;
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
    return list ? filterByTempo(list.items) : [];
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
    if (tab.kind !== 'foryou' && tab.kind !== 'plugin' && !(tab.search && state.creator.query[tab.id])) {
      bumpCreatorUsage(`${tab.id}:${state.creator.category[tab.id] || (tab.id === 'classics' ? 'lustig' : '')}`);
    }
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

    if (tab.kind === 'foryou') {
      state.creator.lists[key] = { items: [], loading: true, error: null, more: false, page: 1 };
      renderCreatorList();
      let picks = [];
      try {
        picks = await creatorForYou(state.creator.category.foryou || 'mix');
      } catch {
        picks = [];
      }
      state.creator.lists[key] = {
        items: picks,
        loading: false,
        error: picks.length ? null : 'Noch keine Vorschläge – stöbere ein bisschen in den anderen Tabs.',
        more: false,
        page: 1,
      };
      if (creatorKey() === key) renderCreatorList();
      return;
    }

    // YouTube via the source plugin: shown with a Content ID warning, never downloadable.
    if (tab.kind === 'plugin') {
      const plugin = searchPlugin();
      const customQuery = state.creator.query[tab.id];
      const chosen =
        tab.categories.find((entry) => entry.id === state.creator.category[tab.id]) || tab.categories[0];
      const term = customQuery || chosen.query;
      const creativeCommons = !customQuery && Boolean(chosen.cc);
      state.creator.lists[key] = { items: [], loading: true, error: null, more: false, page: 1 };
      renderCreatorList();

      let found;
      try {
        found = plugin
          ? await bridge.pluginSearch(plugin.id, term, { creativeCommons, limit: 25 })
          : { results: [], error: 'Kein Quellen-Plugin aktiv.' };
      } catch (error) {
        found = { results: [], error: error.message };
      }
      state.creator.lists[key] = {
        items: (Array.isArray(found.results) ? found.results : []).map((item) => youtubeCutterEntry(plugin, item)),
        loading: false,
        error: found.error || null,
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
    if (tab.kind === 'plugin') return 'Über dein Quellen-Plugin · nicht lizenzgeprüft · kein Download';
    if (tab.kind === 'foryou') return 'Aus deinen meistgenutzten Kategorien · Lizenz an jedem Titel';
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
    const tabs = creatorTabs()
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
            ${tempoRow(tab)}

            ${
              tab.search
                ? `<div class="radio-search creator-search">
                    <input id="creator-search-input" type="search" value="${esc(custom)}"
                      placeholder="${
                        tab.kind === 'plugin'
                          ? 'Auf YouTube suchen (z. B. „phonk gaming“) …'
                          : tab.kind === 'sfx' || tab.id === 'sfx'
                            ? 'Eigenen Sound suchen (englisch, z. B. „door slam“) …'
                            : 'Eigene Stimmung suchen (englisch, z. B. „summer vlog“) …'
                      }"
                      autocomplete="off" spellcheck="false" />
                    <button class="btn primary small" data-creator-action="search">Suchen</button>
                  </div>`
                : ''
            }

            <div id="cut-panel" hidden></div>
            <div id="creator-list"></div>
          </div>

          <aside class="panel creator-credits" id="creator-credits"></aside>
        </div>
      </div>`;

    renderCreatorList();
    renderCredits();
    lastCutId = null;
    syncCutPanel();
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
          <span>${tab.id === 'ncs' ? 'NCS-Playlist wird geladen …' : tab.kind === 'plugin' ? 'Suche über dein Quellen-Plugin …' : tab.kind === 'foryou' ? 'Vorschläge werden zusammengestellt …' : 'Suche bei Openverse …'}</span>
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

    const visible = creatorItems();
    if (!visible.length) {
      host.innerHTML = `
        <div class="panel empty-search">
          <h3>Kein Titel in diesem Tempo</h3>
          <p>${bpmQueue.length || bpmBusy ? 'Das Tempo wird gerade gemessen – passende Titel erscheinen gleich.' : 'Wähle ein anderes Tempo oder „Alle“.'}</p>
        </div>`;
      return;
    }

    host.innerHTML = `
      <div class="results-head">
        <span>${visible.length} ${tab.kind === 'sfx' || tab.id === 'sfx' ? 'Sounds' : 'Titel'}</span>
        <span class="muted small">${esc(creatorNote(tab))}</span>
        <button class="btn ghost small results-action" data-creator-action="play-all">${ICONS.play} Alle abspielen</button>
      </div>
      <div class="song-list">
        ${visible.map((entry, index) => songRow(entry, index, 'creator')).join('')}
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
    // Newest credits are appended at the end – keep those, not the oldest.
    writeJSON(STORAGE.credits, state.credits.slice(-200));
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

  function cutProjectPanelHtml() {
    const project = activeCutProject();
    const projects = cutProjects.projects;
    const layout = project && CMStudio ? CMStudio.timelineLayout(project.clips) : { total: 0 };
    return `
      <section class="cut-projects-panel">
        <div class="credits-head"><h3>Studio</h3><span class="credits-count">${projects.length}</span></div>
        <div class="row">
          <select id="cut-project-select" class="select-input" aria-label="Aktives Projekt">
            <option value="">Kein Projekt</option>
            ${projects.map((entry) => `<option value="${esc(entry.id)}" ${entry.id === cutProjects.active ? 'selected' : ''}>${esc(entry.name)}</option>`).join('')}
          </select>
          <button class="btn ghost small" data-project-action="new">Neues Projekt</button>
        </div>
        ${
          project
            ? `<div class="studio-timeline">
                <p class="muted small">${project.clips.length} Clip${project.clips.length === 1 ? '' : 's'} · Gesamtlänge <span id="studio-total">${fmtTime(layout.total)}</span> · nicht-destruktiv – die Quellen bleiben unverändert.</p>
                ${
                  project.clips.length
                    ? `<ol class="credits-list studio-clips">${project.clips
                        .map((clip, index) => {
                          const inSec = Number(clip.in) || 0;
                          const outSec = Number(clip.out) || 0;
                          const duration = Number(clip.duration) || 0;
                          const fadeIn = Number(clip.fadeIn) || 0;
                          const fadeOut = Number(clip.fadeOut) || 0;
                          const transition = Number(clip.transition) || 0;
                          const loopMs = Number(clip.loopMs) || 150;
                          const max = duration ? ` max="${duration.toFixed(1)}"` : '';
                          return `<li>
                            <div class="studio-clip">
                              <div class="studio-clip-meta">
                                <strong>${esc(clip.title)}</strong>
                                <span>${esc([clip.artist, clip.license].filter(Boolean).join(' · '))}${clip.url ? '' : ' · ohne Audio (nur Credit)'}</span>
                              </div>
                              <div class="studio-clip-trim">
                                <label>Start <input type="number" min="0" step="0.1"${max} data-clip-in="${index}" value="${inSec.toFixed(1)}" /> s</label>
                                <label>Ende <input type="number" min="0" step="0.1"${max} data-clip-out="${index}" value="${outSec.toFixed(1)}" /> s</label>
                                <span class="muted small">${fmtTime(Math.max(0, outSec - inSec))}</span>
                              </div>
                              <details class="studio-clip-fx"${fadeIn || fadeOut || transition || clip.normalize || clip.loop ? ' open' : ''}>
                                <summary>Effekte</summary>
                                <div class="studio-clip-fx-grid">
                                  <label>Fade-in <input type="number" min="0" max="5" step="0.1" data-clip-fx="${index}:fadeIn" value="${fadeIn.toFixed(1)}" /> s</label>
                                  <label>Fade-out <input type="number" min="0" max="5" step="0.1" data-clip-fx="${index}:fadeOut" value="${fadeOut.toFixed(1)}" /> s</label>
                                  <label>Übergang <input type="number" min="0" max="5" step="0.1" data-clip-fx="${index}:transition" value="${transition.toFixed(1)}" /> s</label>
                                  <label class="toggle-row"><span>Normalisieren</span><input type="checkbox" data-clip-fx="${index}:normalize" ${clip.normalize ? 'checked' : ''} /></label>
                                  <label class="toggle-row"><span>Loop</span><input type="checkbox" data-clip-fx="${index}:loop" ${clip.loop ? 'checked' : ''} /></label>
                                  <label>Loop-Übergang <input type="number" min="50" max="500" step="50" data-clip-fx="${index}:loopMs" value="${loopMs}" /> ms</label>
                                </div>
                              </details>
                            </div>
                            <div class="row studio-clip-actions">
                              <button class="icon-btn" data-clip-move="${index}:up" title="Nach oben" ${index === 0 ? 'disabled' : ''}>↑</button>
                              <button class="icon-btn" data-clip-move="${index}:down" title="Nach unten" ${index === project.clips.length - 1 ? 'disabled' : ''}>↓</button>
                              <button class="icon-btn" data-clip-remove="${index}" title="Aus Timeline entfernen">${ICONS.close}</button>
                            </div>
                          </li>`;
                        })
                        .join('')}</ol>`
                    : `<p class="credits-empty">Füge Titel im Cutter mit „Zum Projekt“ hinzu – sie werden zu Clips in der Timeline.</p>`
                }
                <div class="row">
                  <button class="btn ghost small" id="studio-preview" data-project-action="preview" ${project.clips.length ? '' : 'disabled'}>▶ Vorschau</button>
                  <button class="btn primary small" data-project-action="export" ${project.clips.length ? '' : 'disabled'}>Als WAV exportieren</button>
                  <button class="btn ghost small" data-project-action="copy">Credits kopieren</button>
                  <button class="btn ghost small" data-project-action="save">Credits als .txt</button>
                  <button class="btn ghost small danger" data-project-action="delete">Löschen</button>
                </div>
              </div>`
            : '<p class="credits-empty">Lege ein Projekt an, um eine Timeline für dein Video zu bauen.</p>'
        }
      </section>`;
  }

  function renderCredits() {
    const host = $('#creator-credits');
    if (!host) return;

    const items = state.credits;
    host.innerHTML = `${cutProjectPanelHtml()}
      <section class="video-credits-panel">
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
      ${creatorDownloadsHtml()}</section>`;
  }

  /* ---------------------------------------------------------------- *
   * Fullscreen player
   * ---------------------------------------------------------------- */

  let fsIdleTimer = null;
  let lastColorSource = null;
  const DEFAULT_A = [91, 140, 255];
  const DEFAULT_B = [53, 224, 192];

  function openFullscreen() {
    setTimeout(() => renderLyrics(), 80);
    const root = $('#fullscreen');
    if (!root || state.fullscreen) return;

    state.fullscreen = true;
    syncLiveBackground();
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
    syncLiveBackground();
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

  function setSeekFill(seek, current, duration) {
    if (!seek) return;
    const percent = duration > 0 ? Math.max(0, Math.min(100, (current / duration) * 100)) : 0;
    seek.style.setProperty('--fill', `${percent.toFixed(2)}%`);
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
      setSeekFill(seek, audio.currentTime, audio.duration);
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
    for (let step = 2; next.length < 3 && step <= items.length; step += 1) {
      const position = index + step;
      if (position >= items.length && state.playback.repeat !== 'all') break;
      const wrapped = position % items.length;
      if (wrapped !== index && !next.includes(wrapped)) next.push(wrapped);
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

    const mode = ['cover-static', 'cover-moving', 'live', 'off'].includes(state.settings.fsBackground) ? state.settings.fsBackground : 'cover-moving';
    const fullscreenRoot = $('#fullscreen');
    ['cover-static', 'cover-moving', 'live', 'off'].forEach((name) => fullscreenRoot.classList.toggle(`fs-background-${name}`, name === mode));
    const modeSelect = $('#fs-background-mode');
    if (modeSelect) modeSelect.value = mode;

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
    if (mode !== 'cover-moving' || !state.settings.bgMotion) background.style.filter = '';
    const showCoverBackground = mode === 'cover-static' || mode === 'cover-moving';
    if (item && item.artwork) {
      image.src = item.artwork;
      image.hidden = false;
      letter.hidden = true;
      if (showCoverBackground) {
        background.src = item.artwork;
        background.hidden = false;
      } else {
        background.removeAttribute('src');
        background.hidden = true;
      }
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
        style === 'off'
          ? !state.settings.visualizer || !fsVisualizerOn()
          : state.settings.visualizer && fsVisualizerOn() && state.settings.vizStyle === style
      );
      button.classList.toggle('extra-locked', extraLocked('vizStyle', style));
      button.classList.toggle('extra-trial', extraInTrial('vizStyle', style));
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

  const PERFORMANCE_PROFILES = {
    saver: {
      id: 'saver', label: 'Sparmodus', fps: 15, pixelRatio: 0.75, liveResolution: 0.65,
      detail: 0.5, shadow: 0, hint: '15 fps, kleinere Canvas-Auflösung, keine großen Schatten oder Blur-Effekte.',
    },
    balanced: {
      id: 'balanced', label: 'Ausgewogen', fps: 24, pixelRatio: 1, liveResolution: 0.85,
      detail: 0.8, shadow: 0.55, hint: '24 fps, volle CSS-Auflösung und deutlich reduzierte Blur-/Blend-Effekte. Empfohlen.',
    },
    quality: {
      id: 'quality', label: 'Qualität', fps: 30, pixelRatio: 1, liveResolution: 1,
      detail: 1, shadow: 1, hint: 'Maximal 30 fps mit vollen Effekten. Braucht die meiste GPU-Leistung.',
    },
  };

  function performanceProfile() {
    return PERFORMANCE_PROFILES[state.settings.performance] || PERFORMANCE_PROFILES.balanced;
  }

  function fsVisualizerOn() {
    return state.settings.fsVisualizer !== false;
  }

  function setPerformance(id) {
    if (!PERFORMANCE_PROFILES[id]) return;
    state.settings.performance = id;
    saveSettings();
    applyPerformance();
    renderSettings();
    toast(`Leistung: ${performanceProfile().label}`);
  }

  function applyPerformance() {
    const profile = performanceProfile();
    document.documentElement.dataset.perf = profile.id;
    if (window.CMVisualizer && window.CMVisualizer.setPerformance) {
      window.CMVisualizer.setPerformance({
        maxFps: profile.fps,
        maxPixelRatio: profile.pixelRatio,
        detail: profile.detail,
        shadow: profile.shadow,
      });
    }
    syncLiveBackground();
    syncVisualizerEngine();
    applyVisualizerVisibility();
    if (state.fullscreen) syncFullscreen();
  }

  function setFullscreenVisualizer(enabled) {
    state.settings.fsVisualizer = Boolean(enabled);
    if (state.settings.fsVisualizer && !state.settings.visualizer) state.settings.visualizer = true;
    saveSettings();
    syncVisualizerEngine();
    applyVisualizerVisibility();
    if (state.fullscreen) syncFullscreen();
    renderSettings();
  }

  function setVisualizerStyle(style) {
    if (style === 'off') {
      // Fullscreen only: the mini visualizer in the player bar stays untouched.
      setFullscreenVisualizer(false);
      return;
    }
    state.settings.vizStyle = style;
    state.settings.visualizer = true;
    state.settings.fsVisualizer = true;
    saveSettings();
    window.CMVisualizer.setStyle($('#fs-viz'), style);
    syncVisualizerEngine();
    applyVisualizerVisibility();
    syncFullscreen();
    renderSettings();
  }

  function setVisualizerEnabled(enabled) {
    state.settings.visualizer = Boolean(enabled);
    saveSettings();
    syncVisualizerEngine();
    applyVisualizerVisibility();
  }

  function syncVisualizerEngine() {
    const viz = window.CMVisualizer;
    const motionAllowed = state.settings.bgMotion !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pulseAnalyzer = Boolean(state.settings.bgPulse && motionAllowed && !document.hidden);
    const drawing = Boolean(state.settings.visualizer && (state.settings.miniViz || fsVisualizerOn()));
    if (viz && viz.setEnabled) viz.setEnabled(Boolean(drawing || pulseAnalyzer));
  }

  function applyVisualizerVisibility() {
    const on = Boolean(state.settings.visualizer);
    document.body.classList.toggle('viz-off', !on);
    document.body.classList.toggle('mini-viz-off', !on || !state.settings.miniViz);
    document.body.classList.toggle('fs-viz-off', !on || !fsVisualizerOn());
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
              <button class="theme-card ${active && active.id === theme.id ? 'active' : ''}${lockedClass('theme', theme.id)}" data-theme-id="${esc(theme.id)}" style="${style}" title="${esc(theme.name)}">
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
        ${layoutPanelHtml()}
        <label class="toggle-row" style="margin-top:14px">
          <span>
            <strong>Plattenspieler</strong>
            <small>Das Cover dreht sich als Schallplatte – im Vollbild-Player mit Tonarm, der beim Abspielen aufsetzt. Auch im Vollbild oben rechts umschaltbar.</small>
          </span>
          <input type="checkbox" id="opt-vinyl" ${state.settings.vinyl ? 'checked' : ''} />
        </label>
        ${backgroundPanelHtml()}
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
        // Friends get "In CleanMusic anhören" – never for local files or radio.
        shareUrl: window.CMShare && window.CMShare.refOf(item) ? shareUrl(item) : '',
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
      // Clearly audible, independent of the music volume: a bright rising
      // three-note chime (C6 – E6 – G6, then C7) with a soft bell overtone.
      const peak = 0.32;
      [
        [1047, 0],
        [1319, 0.14],
        [1568, 0.28],
        [2093, 0.46],
      ].forEach(([freq, at], index) => {
        [
          [freq, 'triangle', peak],
          [freq * 2, 'sine', peak * 0.18],
        ].forEach(([tone, type, level]) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type;
          osc.frequency.value = tone;
          const length = index === 3 ? 1.4 : 0.6;
          gain.gain.setValueAtTime(0.0001, now + at);
          gain.gain.exponentialRampToValueAtTime(level, now + at + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + at + length);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + at);
          osc.stop(now + at + length + 0.05);
        });
      });
      setTimeout(() => ctx.close().catch(() => {}), 2500);
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
            info.installable && info.asset
              ? info.kind === 'apk'
                ? ` Download ${esc(formatSize(info.asset.size))}, danach fragt Android nach der Installation.`
                : ` Download ${esc(formatSize(info.asset.size))}, danach Neustart.`
              : ''
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
              : info.kind === 'apk'
                ? 'Geprüft. Tippe auf Installieren – Android fragt einmal nach; deine Daten bleiben erhalten.'
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
        if (!(await bridge.updateInstall())) {
          toast(updateInfo && updateInfo.kind === 'apk'
            ? 'Installer wurde nicht geöffnet – bitte die Update-Karte erneut öffnen.'
            : 'Neustart nicht möglich – Datei fehlt.');
        }
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
      session.metadata = new MediaMetadata({
        title: item.title || 'CleanMusic',
        artist: item.artist || item.sourceLabel || '',
        album: item.album || (item.kind === 'radio' ? 'Live Radio' : 'CleanMusic'),
        ...(item.artwork ? { artwork: [{ src: item.artwork, sizes: '512x512' }] } : {}),
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
    audio.addEventListener('timeupdate', () => {
      updateMediaPosition();
      updateLyricLine();
      maybeTransition();
      cutTick();
    });
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

  let autoBackup = Object.assign({ enabled: false, folder: '', lastAt: 0, status: '' }, readJSON(STORAGE.autoBackup, {}) || {});
  if (autoBackup.lastAt && !autoBackup.status) autoBackup.status = `Letztes Backup: ${new Date(autoBackup.lastAt).toLocaleString('de-DE')}`;
  let autoBackupBusy = false;
  let autoBackupTimer = null;

  function backupPayload() {
    const settings = {};
    BACKUP_SETTINGS.forEach((key) => { settings[key] = state.settings[key]; });
    return {
      app: 'CleanMusic', kind: 'backup', format: 1,
      schema: window.CMMigrations ? window.CMMigrations.SCHEMA_VERSION : 1,
      version: (state.info && state.info.version) || '', exportedAt: new Date().toISOString(),
      collection: state.collection, credits: state.credits, history, settings, taste: state.taste,
    };
  }

  function persistAutoBackup() {
    writeJSON(STORAGE.autoBackup, { enabled: Boolean(autoBackup.enabled), folder: String(autoBackup.folder || ''), lastAt: Number(autoBackup.lastAt) || 0 });
  }

  async function runAutoBackupIfDue(force = false) {
    if (autoBackupBusy || !autoBackup.enabled || !autoBackup.folder || (state.info && state.info.smoke)) return;
    if (!force && autoBackup.lastAt && Date.now() - autoBackup.lastAt < 7 * 24 * 60 * 60 * 1000) return;
    autoBackupBusy = true;
    try {
      const result = await bridge.backupAutoSave({ folder: autoBackup.folder, text: JSON.stringify(backupPayload(), null, 2) });
      if (result && result.ok) {
        autoBackup.lastAt = Date.now();
        autoBackup.status = `Letztes Backup: ${new Date(autoBackup.lastAt).toLocaleString('de-DE')}`;
        persistAutoBackup();
      } else autoBackup.status = result && result.error || 'Automatisches Backup fehlgeschlagen.';
    } catch (error) {
      autoBackup.status = error.message || 'Automatisches Backup fehlgeschlagen.';
    } finally {
      autoBackupBusy = false;
      if (state.view === 'settings') renderSettings();
    }
  }

  function startAutoBackupSchedule() {
    clearInterval(autoBackupTimer);
    autoBackupTimer = setInterval(() => runAutoBackupIfDue(), 6 * 60 * 60 * 1000);
    runAutoBackupIfDue();
  }

  async function exportBackup() {
    if (!bridge.backupSave) return;
    const data = backupPayload();
    const result = await bridge.backupSave(JSON.stringify(data, null, 2));
    if (result && result.ok) toast('Gesichert: ' + result.path);
    else if (result && result.error) toast('Sichern fehlgeschlagen: ' + result.error);
  }

  function mergeBackup(data) {
    const counts = { favorites: 0, playlists: 0, credits: 0, history: 0, taste: 0 };
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
        const smart =
          playlist.smart && typeof playlist.smart === 'object'
            ? normalizeSmartRules(playlist.smart)
            : null;
        const existing = playlistById(playlist.id);
        if (existing) {
          const ids = new Set(existing.items.map((entry) => entry.id));
          items.forEach((entry) => {
            if (!ids.has(entry.id)) existing.items.push(storable(entry));
          });
          // Rules win over old items, but nothing is rebuilt or deleted here.
          if (smart) existing.smart = smart;
          existing.updatedAt = Date.now();
        } else {
          state.collection.playlists.push({
            id: playlist.id,
            name: String(playlist.name || 'Playlist').slice(0, 80),
            createdAt: Number(playlist.createdAt) || Date.now(),
            updatedAt: Date.now(),
            // Templates keep their key, otherwise the Vorlagen page would
            // create a duplicate playlist after a restore.
            preset: typeof playlist.preset === 'string' ? playlist.preset.slice(0, 80) : '',
            ...(smart ? { smart } : {}),
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

    // Taste profile: newer values win, feedback is merged instead of replaced.
    const taste = data.taste && typeof data.taste === 'object' ? data.taste : null;
    if (taste) {
      let touched = 0;
      ['tracks', 'artists'].forEach((kind) => {
        const rows = taste[kind] && typeof taste[kind] === 'object' ? taste[kind] : {};
        Object.keys(rows).forEach((key) => {
          const row = rows[key];
          if (!row || (row.value !== 1 && row.value !== -1)) return;
          const mine = state.taste[kind][key];
          if (mine && (Number(mine.at) || 0) >= (Number(row.at) || 0)) return;
          const clean = { value: row.value, at: Number(row.at) || 0 };
          if (typeof row.n === 'string') clean.n = primaryArtist(row.n);
          if (typeof row.a === 'string') clean.a = row.a;
          if (typeof row.dz === 'string' || typeof row.dz === 'number') clean.dz = row.dz;
          state.taste[kind][key] = clean;
          touched += 1;
        });
      });
      const knownSkips = new Set(state.taste.skips.map((row) => `${row.t}|${row.a}|${row.at}`));
      (Array.isArray(taste.skips) ? taste.skips : []).forEach((row) => {
        if (!row || !Number(row.at) || (!row.a && !row.t)) return;
        const id = `${row.t || ''}|${row.a || ''}|${row.at}`;
        if (knownSkips.has(id)) return;
        state.taste.skips.push({
          a: typeof row.a === 'string' ? row.a : '',
          t: typeof row.t === 'string' ? row.t : '',
          n: typeof row.n === 'string' ? primaryArtist(row.n) : '',
          dz: typeof row.dz === 'string' || typeof row.dz === 'number' ? row.dz : null,
          at: Number(row.at) || 0,
        });
        knownSkips.add(id);
        touched += 1;
      });
      state.taste.skips = state.taste.skips.slice(-300);
      if (touched) {
        state.taste.revision = (Number(state.taste.revision) || 0) + 1;
        writeJSON(STORAGE.taste, state.taste);
        counts.taste = touched;
      }
    }

    const settings = data.settings && typeof data.settings === 'object' ? data.settings : {};
    BACKUP_SETTINGS.forEach((key) => {
      if (key in settings && typeof settings[key] === typeof state.settings[key]) state.settings[key] = settings[key];
    });
    saveSettings();
    persistCredits();
    onCollectionChanged({ favorites: true });
    applyTheme();
    applyVolume();
    // Visualizer choices are part of the backup, so apply them right away
    // instead of waiting for the next restart.
    syncVisualizerEngine();
    applyVisualizerVisibility();
    if (window.CMVisualizer && window.CMVisualizer.setStyle) {
      window.CMVisualizer.setStyle($('#fs-viz'), state.settings.vizStyle);
      window.CMVisualizer.wake();
    }
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
    const schemaCheck = window.CMMigrations ? window.CMMigrations.checkBackup(data) : { ok: true };
    if (!schemaCheck.ok) {
      toast(schemaCheck.reason);
      return null;
    }
    const counts = mergeBackup(data);
    toast(
      `Wiederhergestellt: ${counts.favorites} Favoriten, ${counts.playlists} Playlists, ${counts.credits} Credits, ${counts.history} Verlaufstitel${
        counts.taste ? `, ${counts.taste} Geschmacks-Markierungen` : ''
      }`
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
      lyric: currentLyric(),
      upNext: upNextSnapshot(),
    };
  }

  function pushPlayerState(immediate = false) {
    updateStreamBadge();
    updateBackgroundCover();
    ensureLyrics();
    syncCutPanel();
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
   * Visualizer spectrum for plugins (API v2)
   *
   * Only runs while a plugin asks for it (e.g. the OBS visualizer).
   * The analyser already exists in visualizer.js; this just samples the
   * 32 log-spaced bands about 25 times per second and hands them over.
   * ---------------------------------------------------------------- */

  let visualizerWatchOn = false;
  let visualizerWatchTimer = null;
  let visualizerLastPlaying = null;

  function visualizerSnapshot() {
    const viz = window.CMVisualizer;
    if (!viz || typeof viz.spectrum !== 'function') return { spectrum: [], level: 0 };
    const spectrum = viz.spectrum(32).map((value) =>
      Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 255)
    );
    const level = viz.level ? Math.max(0, Math.min(1, Number(viz.level()) || 0)) : 0;
    return { spectrum, level: Number(level.toFixed(3)) };
  }

  function pushVisualizerState(force = false) {
    if (!bridge.visualizerState) return;
    const playing = !audio.paused;
    // While paused one frame is enough; the overlay fades out by itself.
    if (!force && !playing && visualizerLastPlaying === false) return;
    visualizerLastPlaying = playing;
    try {
      // Send explicit zeros on pause so the bars fall even if the analyser
      // still holds its last frame.
      bridge.visualizerState(
        playing ? visualizerSnapshot() : { spectrum: new Array(32).fill(0), level: 0 }
      );
    } catch {
      /* ignore */
    }
  }

  function setVisualizerWatch(on) {
    const next = Boolean(on);
    if (next === visualizerWatchOn) return;
    visualizerWatchOn = next;
    const viz = window.CMVisualizer;
    if (viz && typeof viz.setWatching === 'function') viz.setWatching(next);
    clearInterval(visualizerWatchTimer);
    visualizerWatchTimer = null;
    if (!next) return;
    visualizerWatchTimer = setInterval(() => pushVisualizerState(), 40);
    pushVisualizerState(true);
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

  // AI music: only what is labelled (title, artist, album, plugin hint).
  // Bare "AI"/"KI" counts only in brackets – names like "Ai Otsuka" stay clean.
  const AI_STRONG =
    /(ai[- ]generated|generated (?:by|with) ai|\bai[- ](?:cover|music|song|remix|version|voice|vocals)\b|\bki[- ](?:generiert|cover|song|musik|version)\b|mit ki (?:erstellt|generiert)|\bsuno\b|\budio\b|#ai\b|\baimusic\b|artificial intelligence|künstliche intelligenz)/i;
  const AI_TAGGED = /[([]\s*(?:ai|ki|a\.i\.)\s*[)\]]/i;

  function aiWordList(value) {
    return (Array.isArray(value) ? value : String(value || '').split(','))
      .map((word) => String(word).trim().toLowerCase())
      .filter((word) => word.length > 1)
      .slice(0, 50);
  }

  function aiSuspect(entry, extra = []) {
    if (!entry) return false;
    if (entry.aiHint) return true;
    const parts = [entry.title, entry.album, entry.artist].map((part) => String(part || ''));
    if (parts.some((part) => AI_STRONG.test(part) || AI_TAGGED.test(part))) return true;
    if (!extra.length) return false;
    const text = parts.join(' ').toLowerCase();
    return extra.some((word) => text.includes(word));
  }

  function aiBadge(entry) {
    if (state.settings.markAi === false || !aiSuspect(entry)) return '';
    return '<span class="lic-badge ai-badge" title="KI-Hinweis im Titel, beim Artist oder bei der Quelle – kann falsch sein">KI?</span>';
  }

  const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'];

  function requestLinkKind(query) {
    if (/^spotify:track:[A-Za-z0-9]{6,64}$/i.test(query)) return 'link';
    if (!/^https?:\/\/\S+$/i.test(query)) return null;
    try {
      if (YOUTUBE_HOSTS.includes(new URL(query).hostname.toLowerCase())) return 'youtube';
    } catch {
      return 'link';
    }
    return 'link';
  }

  async function findRequestByLink(query, kind) {
    if (kind === 'youtube') {
      const plugin = readyPlugins('lookup')[0];
      if (!plugin || !bridge.pluginLookup) return { reason: 'no-lookup' };
      const result = await bridge.pluginLookup(plugin.id, query);
      if (!result || !result.item) return { reason: 'not-found' };
      return { entry: pluginEntry(plugin, result.item) };
    }
    if (!bridge.requestLink) return { reason: 'unsupported-link' };
    const result = await bridge.requestLink(query);
    if (!result || !result.track) return { reason: (result && result.reason) || 'not-found' };
    return { entry: previewEntry(result.track) };
  }

  async function songRequest(value) {
    const query = String((value && value.query) || '')
      .replace(/[\r\n\t]+/g, ' ')
      .trim()
      .slice(0, 200);
    const by = requestName(value && value.by) || 'Chat';
    const source = REQUEST_SOURCES.includes(value && value.source) ? value.source : 'auto';
    const maxSeconds = Math.max(0, Math.round(Number(value && value.maxSeconds) || 0));
    const position = value && value.position === 'end' ? 'end' : 'next';
    const playlistName = String((value && value.playlist) || '').trim().slice(0, 80);
    const blockAi = Boolean(value && value.blockAi);
    const extraAi = aiWordList(value && value.aiWords);
    if (!query) return { ok: false, reason: 'empty' };

    const linkKind = requestLinkKind(query);
    if (blockAi && !linkKind && aiSuspect({ title: query }, extraAi)) return { ok: false, reason: 'ai' };

    let found;
    if (linkKind) {
      const result = await findRequestByLink(query, linkKind);
      if (!result.entry) return { ok: false, reason: result.reason, link: true };
      found = result.entry;
      if (maxSeconds && found.kind === 'plugin' && found.duration > maxSeconds) return { ok: false, reason: 'too-long' };
    } else {
      if (!streamSafeOn() && source === 'full' && !searchPlugin()) return { ok: false, reason: 'no-source' };
      found = streamSafeOn() ? await findSafeRequestTrack(query) : await findRequestTrack(query, source, maxSeconds);
      if (!found) return { ok: false, reason: 'not-found' };
      if (found.tooLong) return { ok: false, reason: 'too-long' };
    }
    const track = { title: found.title, artist: found.artist, source: found.sourceLabel || '', preview: found.kind === 'preview' };
    if (blockAi && aiSuspect(found, extraAi)) return { ok: false, reason: 'ai', track };
    if (streamSafeOn() && !streamSafe(found)) return { ok: false, reason: 'not-safe', track };

    const key = matchKey(found);
    const { items, index } = state.queue;
    const current = items[index];
    if ((current && matchKey(current) === key) || items.slice(index + 1).some((entry) => matchKey(entry) === key)) {
      return { ok: false, reason: 'duplicate', track };
    }

    enqueue([found], position, { requestedBy: by, requestedAt: Date.now() });

    let savedTo = '';
    if (playlistName) {
      const playlist =
        state.collection.playlists.find((item) => item.name.toLowerCase() === playlistName.toLowerCase()) ||
        createPlaylist(playlistName);
      addToPlaylist(playlist.id, [found], { quiet: true });
      savedTo = playlist.name;
    }

    const queue = state.queue;
    let placed = 0;
    for (let at = queue.index + 1; at < queue.items.length; at += 1) {
      const entry = queue.items[at];
      if (entry.requestedBy === by && matchKey(entry) === key) {
        placed = at - queue.index;
        break;
      }
    }
    return { ok: true, track, position: placed, playingNow: !placed, link: Boolean(linkKind), savedTo };
  }

  function removeSongRequest(value) {
    const by = requestName(value && value.by).toLowerCase();
    if (!by) return { ok: false, reason: 'empty' };
    const { items, index } = state.queue;
    let newest = -1;
    for (let position = index + 1; position < items.length; position += 1) {
      const entry = items[position];
      if (!entry.requestedBy || entry.requestedBy.toLowerCase() !== by) continue;
      if (newest < 0 || (entry.requestedAt || 0) >= (items[newest].requestedAt || 0)) newest = position;
    }
    if (newest < 0) return { ok: false, reason: 'none' };
    const entry = items[newest];
    removeFromQueue(newest);
    return { ok: true, track: { title: entry.title, artist: entry.artist } };
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

  // Plugin-API v3, library:read – a read-only, sanitised snapshot for plugins.
  function libraryReadSnapshot(kind) {
    const mapEntry = (entry) => {
      const e = entry || {};
      return {
        id: String(e.id || '').slice(0, 200),
        title: String(e.title || '').slice(0, 200),
        artist: String(e.artist || '').slice(0, 200),
        album: String(e.album || '').slice(0, 200),
        kind: String(e.kind || '').slice(0, 20),
        source: String(e.sourceLabel || e.source || '').slice(0, 80),
        license: String(e.license || '').slice(0, 80),
        duration: Math.max(0, Number(e.duration) || 0),
        artwork: /^https:\/\//i.test(e.artwork || '') ? e.artwork : '',
      };
    };
    switch (kind) {
      case 'favorites':
        return { ok: true, items: state.collection.favorites.slice(0, 200).map(mapEntry) };
      case 'playlists':
        return {
          ok: true,
          items: state.collection.playlists.slice(0, 100).map((playlist) => ({
            name: String(playlist.name || '').slice(0, 80),
            count: playlist.items.length,
            smart: Boolean(playlist.smart),
          })),
        };
      case 'history':
        return { ok: true, items: history.slice(0, 200).map((row) => mapEntry(row.entry)) };
      case 'queue':
        return { ok: true, items: state.queue.items.slice(0, 200).map(mapEntry) };
      case 'local':
        return { ok: true, items: (state.library.entries || []).slice(0, 500).map(mapEntry) };
      case 'current':
        return { ok: true, item: currentItem() ? mapEntry(currentItem()) : null };
      default:
        return { ok: false, reason: 'unknown' };
    }
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
      case 'libraryRead':
        answerPlayerCall(callId, () => libraryReadSnapshot(value && value.kind));
        break;
      case 'remoteQueue':
        answerPlayerCall(callId, () => {
          const track = value && value.track;
          if (!track || !['apple', 'deezer'].includes(track.source) || !/^https:\/\//i.test(track.preview || '')) {
            return { ok: false, reason: 'invalid' };
          }
          enqueue(previewEntry(track), value.mode === 'next' ? 'next' : 'end');
          return { ok: true };
        });
        break;
      case 'remoteRadio':
        answerPlayerCall(callId, () => {
          const station = value && value.station;
          if (!station || typeof station.id !== 'string' || !/^https?:\/\//i.test(station.url || '')) {
            return { ok: false, reason: 'invalid' };
          }
          playRemoteEntry(radioEntry(station));
          return { ok: true };
        });
        break;
      case 'remoteFavorites':
        answerPlayerCall(callId, () => {
          if (value && value.list) {
            return {
              ok: true,
              favorites: state.collection.favorites.slice(0, 60).map((entry) => ({
                id: entry.id,
                title: String(entry.title || '').slice(0, 200),
                artist: String(entry.artist || '').slice(0, 200),
                cover: /^https:\/\//i.test(entry.artwork || '') ? entry.artwork : '',
                kind: entry.kind,
              })),
            };
          }
          const id = String((value && value.id) || '');
          const entry = state.collection.favorites.find((item) => item.id === id);
          if (!entry) return { ok: false, reason: 'not-found' };
          playRemoteEntry(entry);
          return { ok: true };
        });
        break;
      case 'play':
        answerPlayerCall(callId, () => {
          if (audio.paused) $('#btn-play').click();
          return { ok: true };
        });
        break;
      case 'pause':
        answerPlayerCall(callId, () => {
          if (!audio.paused) $('#btn-play').click();
          return { ok: true };
        });
        break;
      case 'toggle':
        answerPlayerCall(callId, () => {
          $('#btn-play').click();
          return { ok: true };
        });
        break;
      case 'next':
        answerPlayerCall(callId, () => {
          stepQueue(1);
          return { ok: true };
        });
        break;
      case 'previous':
        answerPlayerCall(callId, () => {
          $('#btn-prev').click();
          return { ok: true };
        });
        break;
      case 'volume':
        answerPlayerCall(callId, () => {
          const level = Number(value);
          if (!Number.isFinite(level) || level < 0 || level > 1.5) return { ok: false, reason: 'invalid' };
          setVolume(level);
          return { ok: true };
        });
        break;
      case 'seek':
        answerPlayerCall(callId, () => {
          const position = Number(value);
          if (!Number.isFinite(position) || position < 0 || position > audio.duration || !Number.isFinite(audio.duration)) {
            return { ok: false, reason: 'invalid' };
          }
          audio.currentTime = position;
          pushPlayerState(true);
          return { ok: true };
        });
        break;
      case 'like':
        answerPlayerCall(callId, () => {
          const item = currentItem();
          if (!item) return { ok: false, reason: 'no-track' };
          toggleFavorite(item);
          return { ok: true };
        });
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
      ['mirror', 'Spiegel'],
      ['particles', 'Partikel'],
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
        <label class="toggle-row ${state.settings.visualizer ? '' : 'disabled'}" style="margin-top:6px">
          <span>
            <strong>Visualizer im Vollbild</strong>
            <small>Der große Effekt hinter Cover und Songtext. Aus spart die meiste GPU-Leistung, der Mini-Visualizer bleibt unabhängig.</small>
          </span>
          <input type="checkbox" id="opt-fs-viz" ${fsVisualizerOn() ? 'checked' : ''} ${
            state.settings.visualizer ? '' : 'disabled'
          } />
        </label>
        <div class="row viz-styles">
          ${styles
            .map(
              ([value, label]) =>
                `<button class="radio-tag ${state.settings.vizStyle === value ? 'active' : ''}${lockedClass('vizStyle', value)}" data-viz-style="${value}" ${
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

  function performancePanel() {
    const profile = performanceProfile();
    return `
      <div class="panel" id="performance-panel">
        <h3>Leistung im Vollbild</h3>
        <p>
          Begrenzt Bildrate, Auflösung und Effekte von Visualizer, bewegtem Cover und
          Live-Hintergrund. Der Ton und die Audio-Kette sind davon nicht betroffen.
        </p>
        <label class="performance-row">
          <span><strong>Leistungsstufe</strong><small id="performance-hint">${esc(profile.hint)}</small></span>
          <select id="opt-performance" class="select-input">
            ${Object.values(PERFORMANCE_PROFILES)
              .map((item) => `<option value="${item.id}" ${profile.id === item.id ? 'selected' : ''}>${esc(item.label)}</option>`)
              .join('')}
          </select>
        </label>
        <p class="muted small performance-note">
          Standard ist „Ausgewogen“. Bei hoher GPU-Last oder im Akkubetrieb „Sparmodus“ wählen.
          Im Hintergrund und bei reduzierter Bewegung pausieren die Animationen automatisch.
        </p>
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
        <label class="toggle-row" style="margin-top:8px">
          <span>
            <strong>Knopf „In CleanMusic anhören“</strong>
            <small>Freunde sehen in deinem Discord-Profil einen Knopf, der den Song bei ihnen in CleanMusic öffnet. Lokale Dateien und Radio werden nie geteilt. Du selbst siehst den Knopf nicht – das macht Discord so.</small>
          </span>
          <input type="checkbox" id="opt-discord-share" ${config.shareButton !== false ? 'checked' : ''} />
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
      if (plugin.manifestError) {
        toast(`Plugin „${plugin.name}“ hat ein fehlerhaftes Manifest: ${plugin.manifestError}`);
        renderSettings();
        return;
      }
      const ok = await askConfirm({
        title: `Plugin „${plugin.name}“ aktivieren?`,
        text:
          `${plugin.file}\n\n` +
          pluginPermissionText(plugin) +
          '\n\nPlugins sind nicht Teil von CleanMusic und laufen als Programmcode auf deinem PC. ' +
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

  // Plugin-API v3, ui:panel – small read-only panels a plugin registers.
  function pluginPanelsHtml(plugin, slot) {
    const panels = ((plugin && plugin.panels) || []).filter((panel) => panel && panel.slot === slot && panel.html);
    if (!panels.length) return '';
    return panels
      .map((panel) => `<div class="plugin-panel"><div class="plugin-panel-title">${esc(panel.title)}</div>${panel.html}</div>`)
      .join('');
  }

  function renderHomePanels() {
    const page = $('#view-home .home-page');
    if (!page) return;
    const panels = [];
    (state.plugins.list || []).forEach((plugin) => {
      if (!plugin || !plugin.enabled || !plugin.loaded) return;
      (plugin.panels || [])
        .filter((panel) => panel && panel.slot === 'home' && panel.html)
        .forEach((panel) => panels.push({ title: panel.title, html: panel.html, plugin: plugin.name }));
    });
    let host = page.querySelector('.home-plugin-panels');
    if (!panels.length) {
      if (host) host.remove();
      return;
    }
    if (!host) {
      host = document.createElement('section');
      host.className = 'home-section home-plugin-panels';
      page.append(host);
    }
    host.innerHTML = panels
      .map(
        (panel) =>
          `<div class="panel plugin-panel"><div class="plugin-panel-title">${esc(panel.title)} <span class="tag">${esc(
            panel.plugin
          )}</span></div>${panel.html}</div>`
      )
      .join('');
  }

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
        } else if (field.type === 'password') {
          control = `<input type="password" id="${id}" ${data} value="${esc(value)}" placeholder="${esc(field.placeholder)}" spellcheck="false" autocomplete="new-password" />`;
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
    return `<div class="plugin-settings"><div class="ps-title">Einstellungen</div>${rows}<div class="ps-actions"><button class="btn primary small" data-plugin-save="${esc(plugin.id)}">Speichern</button></div></div>`;
  }

  async function savePluginSetting(id, field, value) {
    try {
      const result = await bridge.pluginSettingsSet(id, { [field]: value });
      if (result && result.error) toast(`Plugin-Einstellung: ${result.error}`);
      // No full re-render here – it would throw away what is being typed in the next field.
      if (result && Array.isArray(result.plugins)) state.plugins.list = result.plugins.length ? result.plugins : state.plugins.list;
    } catch (error) {
      toast(`Plugin-Einstellung: ${error.message}`);
    }
  }

  // „Speichern“: all fields of one plugin in one go (nothing typed gets lost).
  async function savePluginForm(id) {
    const patch = {};
    document.querySelectorAll('#view-settings [data-plugin-setting]').forEach((input) => {
      if (input.dataset.pluginSetting !== id) return;
      const type = input.dataset.type;
      patch[input.dataset.field] = type === 'toggle' ? input.checked : type === 'number' ? Number(input.value) : input.value;
    });
    try {
      const result = await bridge.pluginSettingsSet(id, patch);
      if (result && result.error) toast(`Plugin-Einstellung: ${result.error}`);
      else toast('Plugin-Einstellungen gespeichert ✓');
      applyPluginList(result);
    } catch (error) {
      toast(`Plugin-Einstellung: ${error.message}`);
    }
    renderSettings();
  }

  // Plugin-API v3: the manifest says what a plugin may do (lib/plugin-manifest.js).
  function pluginPermissionText(plugin) {
    if (!Array.isArray(plugin.permissions)) {
      return 'Keine Angaben zu Berechtigungen – ältere Plugin-API (v' + (plugin.api || 2) + '): Das Plugin kann alles, was CleanMusic kann.';
    }
    if (!plugin.permissions.length) return 'Dieses Plugin möchte keine besonderen Berechtigungen.';
    const risk = { high: '⚠ ', medium: '• ', low: '· ' };
    return 'Dieses Plugin möchte:\n' + plugin.permissions
      .map((item) => `${risk[item.risk] || '• '}${item.label} – ${item.detail}`)
      .join('\n');
  }

  function pluginPermissionChips(plugin) {
    if (plugin.manifestError) {
      return `<div class="plugin-perms"><span class="plugin-perm high">Manifest fehlerhaft: ${esc(plugin.manifestError)}</span></div>`;
    }
    if (!Array.isArray(plugin.permissions)) {
      return `<div class="plugin-perms"><span class="plugin-perm legacy" title="Ältere Plugin-API ohne Berechtigungs-Angaben">API v${esc(plugin.api || 2)} · keine Angaben</span></div>`;
    }
    return `<div class="plugin-perms">${plugin.permissions
      .map((item) => `<span class="plugin-perm ${esc(item.risk)}" title="${esc(item.detail)}">${esc(item.label)}</span>`)
      .join('') || '<span class="plugin-perm low">Keine besonderen Berechtigungen</span>'}</div>`;
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
            ${pluginPermissionChips(plugin)}
          </span>
          <input type="checkbox" data-plugin-toggle="${esc(plugin.id)}" ${plugin.enabled ? 'checked' : ''} ${
            busy ? 'disabled' : ''
          } />
        </label>
        ${line ? `<div class="plugin-status">${line}</div>` : ''}
        ${actions ? `<div class="row">${actions}</div>` : ''}
        ${pluginSettingsForm(plugin)}
        ${pluginPanelsHtml(plugin, 'settings')}
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

  let settingsTab = 'playback';
  const SETTINGS_TABS = [
    { id: 'playback', label: 'Wiedergabe', icon: 'play', text: 'Autoplay, Songtexte, Übergänge und Web-Player.' },
    { id: 'sound', label: 'Klang', icon: 'wave', text: 'Lautstärke, Bass, Höhen und Equalizer.' },
    { id: 'look', label: 'Darstellung', icon: 'spark', text: 'Theme, Hintergrund, Visualizer und Leistung.' },
    { id: 'plugins', label: 'Plugins', icon: 'plug', text: 'Quellen, OBS-Overlays und Streamer.bot.' },
    { id: 'connections', label: 'Verbindungen', icon: 'service', text: 'Handy-Fernbedienung, Discord und MusicKit.' },
    { id: 'system', label: 'System', icon: 'file', text: 'Updates, Backups, Downloads, Dienst-Sessions und Diagnose.' },
  ];

  function settingsMeta() {
    return SETTINGS_TABS.find((tab) => tab.id === settingsTab) || SETTINGS_TABS[0];
  }

  function openSettings(tab) {
    if (tab && SETTINGS_TABS.some((entry) => entry.id === tab)) settingsTab = tab;
    showView('settings');
    renderSettings();
  }

  function renderSettings() {
    const host = $('#view-settings');
    if (!host) return;
    if (!SETTINGS_TABS.some((tab) => tab.id === settingsTab)) settingsTab = 'playback';
    const activeTab = settingsMeta();

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
      <div class="page narrow settings-page">
        <div class="page-head">
          <div>
            <div class="eyebrow">Einstellungen</div>
            <h2>${activeTab.label}</h2>
            <p>${activeTab.text}</p>
          </div>
        </div>

        <div class="settings-tabs" role="tablist">
          ${SETTINGS_TABS.map(
            (tab) => `<button class="settings-tab ${tab.id === settingsTab ? 'active' : ''}" role="tab" aria-selected="${
              tab.id === settingsTab
            }" data-settings-tab="${tab.id}">${ICONS[tab.icon] || ''}<span>${tab.label}</span></button>`
          ).join('')}
        </div>

        ${settingsTab === 'playback' ? `
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
              <small>Wenn die Warteschlange zu Ende ist, laufen passende Vorschläge weiter – auch nach Songwünschen. Von dir Eingereihtes kommt immer zuerst.</small>
            </span>
            <input type="checkbox" id="opt-autoplay" ${autoplayOn() ? 'checked' : ''} />
          </label>
          <label class="toggle-row advanced-only">
            <span>
              <strong>KI-Songs markieren</strong>
              <small>Titel mit KI-Hinweis (z. B. „AI Cover“, „Suno“, „KI-generiert“) bekommen ein „KI?“. Erkennt nur, was gekennzeichnet ist.</small>
            </span>
            <input type="checkbox" id="opt-markai" ${state.settings.markAi !== false ? 'checked' : ''} />
          </label>
          <label class="toggle-row advanced-only">
            <span>
              <strong>Stream-sicher-Modus (Ich streame)</strong>
              <small>Zeigt in der Player-Leiste, ob der Titel frei lizenziert ist (NCS, CC0, CC BY), und Songwünsche kommen nur noch aus freier Musik.</small>
            </span>
            <input type="checkbox" id="opt-streamsafe" ${streamSafeOn() ? 'checked' : ''} />
          </label>
          <label class="toggle-row">
            <span>
              <strong>Songtexte laden</strong>
              <small>Mitlaufender Songtext im Vollbild-Player (und im OBS-Overlay-Stil „Songtext“). Fragt Titel und Artist bei der freien Datenbank LRCLIB an.</small>
            </span>
            <input type="checkbox" id="opt-lyrics" ${lyricsOn() ? 'checked' : ''} />
          </label>
          ${lyricsSettingsHtml()}
          ${transitionSettingsHtml()}
        </div>
        ` : ''}

        ${settingsTab === 'sound' ? `
        <div class="panel">
          <h3>Klang &amp; Lautstärke</h3>
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
          ${equalizerPanelHtml()}
        </div>
        ` : ''}

        ${settingsTab === 'look' ? `
          ${themePanel()}

          ${performancePanel()}

          ${visualizerPanel()}
        ` : ''}

        ${settingsTab === 'plugins' ? pluginPanel() : ''}

        ${settingsTab === 'connections' ? `
        ${discordPanel()}

        <div class="panel" id="remote-panel">
          <h3>Handy-Fernbedienung</h3>
          <p>Steuere CleanMusic im selben privaten WLAN über eine kleine Webseite. Standardmäßig aus. Jede Anfrage braucht den geheimen Link-Schlüssel; nur Loopback und private IPv4-Netze werden angenommen.</p>
          <label class="toggle-row">
            <span><strong>Fernbedienung einschalten</strong><small>Startet den lokalen HTTP-Server auf Port 4790. Beim ersten Windows-Dialog nur „Private Netzwerke“ zulassen.</small></span>
            <input type="checkbox" id="opt-remote" ${state.remote.enabled ? 'checked' : ''} />
          </label>
          <div class="row" style="margin-top:12px">
            <label class="muted small" for="opt-remote-port">Port</label>
            <input id="opt-remote-port" type="number" min="1024" max="65535" value="${Number(state.remote.requestedPort || state.remote.port) || 4790}" style="width:110px" />
            <button class="btn ghost small" data-remote-action="port">Port speichern</button>
            ${state.remote.enabled ? '<button class="btn ghost small danger" data-remote-action="rotate">Neuen Link erzeugen</button>' : ''}
          </div>
          ${state.remote.error ? `<p class="muted small">${esc(state.remote.error)}</p>` : ''}
          ${state.remote.enabled && state.remote.url ? `<div class="row" style="align-items:flex-start;margin-top:14px"><img src="${esc(state.remote.qr)}" alt="QR-Code für die Fernbedienung" width="150" height="150" style="border-radius:10px;background:white;padding:5px" /><div><strong>Auf dem Handy öffnen</strong><p class="small"><a href="${esc(state.remote.url)}" id="remote-link">${esc(state.remote.url)}</a></p><p class="muted small">Der Schlüssel steckt im Link. Teile ihn nur mit Geräten, denen du vertraust. Ein neuer Link widerruft den alten sofort.</p></div></div>` : ''}
          <div class="row" style="margin-top:14px;align-items:center;gap:8px;flex-wrap:wrap">
            <label class="muted small" for="tv-pair-url">An Fernseher senden</label>
            <input id="tv-pair-url" type="url" placeholder="http://192.168.…:4790/?k=…" spellcheck="false" style="flex:1 1 240px;min-width:0" />
            <button class="btn ghost small" data-tv-pair="send">Favoriten &amp; Playlists senden</button>
          </div>
          <p class="muted small">Den Link zeigt CleanMusic TV auf dem Startbildschirm (QR-Code). Am Fernseher einmal bestätigen.</p>
        </div>

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
        ` : ''}

        ${settingsTab === 'system' ? `
        <div class="panel">
          <h3>System &amp; Start</h3>
          <dl class="facts">
            ${facts.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}
          </dl>
          <div class="row" style="margin-top:12px">
            <button class="btn ghost small" data-onboarding="open">Erste Schritte erneut zeigen</button>
            <button class="btn ghost small" data-shortcuts="open">Tastenkürzel</button>
            <label class="toggle-row" style="flex:1;min-width:240px;margin:0">
              <span><strong>Globale Tastenkürzel</strong><small>Standardmäßig aus. Steuern CleanMusic auch im Hintergrund.</small></span>
              <input type="checkbox" id="opt-global-shortcuts" ${state.globalShortcuts.enabled ? 'checked' : ''} />
            </label>
          </div>
          ${state.globalShortcuts.conflict ? `<p class="muted small">Kürzel ist schon belegt: ${esc(state.globalShortcuts.conflict)}</p>` : ''}
          <label class="toggle-row" style="margin-top:14px">
            <span>
              <strong>Beim Schließen im Infobereich weiterlaufen</strong>
              <small>Das X versteckt CleanMusic nur, die Musik läuft weiter. Beenden über das Symbol im Infobereich.</small>
            </span>
            <input type="checkbox" id="opt-tray" ${state.closeToTray ? 'checked' : ''} />
          </label>
          <label class="toggle-row">
            <span>
              <strong>Fortschritt in der Taskleiste</strong>
              <small>${info.platform === 'win32' ? 'Zeigt Titel-Fortschritt und Play/Pause-Knöpfe in der Windows-Taskleiste.' : 'Nur unter Windows verfügbar.'}</small>
            </span>
            <input type="checkbox" id="opt-taskbar" ${state.taskbarProgress ? 'checked' : ''} ${info.platform === 'win32' ? '' : 'disabled'} />
          </label>
          ${info.platform === 'win32' ? `<label class="toggle-row" style="margin-top:14px"><span><strong>Mit Windows starten</strong><small>${state.closeToTray ? 'Startet im Infobereich; andernfalls minimiert.' : 'Startet minimiert.'} Portable Builds werden bei Updates auf den neuen Dateipfad gesetzt.</small></span><input type="checkbox" id="opt-login" ${state.startOnLogin ? 'checked' : ''} /></label>` : ''}
          <label class="toggle-row" style="margin-top:14px">
            <span><strong>Hilfe</strong><small>Diagnose bleibt im Arbeitsspeicher. Es werden keine Dateien oder Telemetrie angelegt.</small></span>
            <span class="row"><button class="btn ghost small" data-diagnostic="copy">Diagnose kopieren</button><button class="btn ghost small" data-diagnostic="issue">Fehler melden</button></span>
          </label>
        </div>

        <div class="panel" id="support-panel">
          <h3>CleanMusic unterstützen</h3>
          <p>
            CleanMusic ist kostenlos und Open Source – und bleibt es. Wenn du die Weiterentwicklung
            unterstützen möchtest, geht das freiwillig über Ko-fi. Die mit ♥ markierten
            Supporter-Extras schaltest du mit einem Code frei, den jeder kostenlos bekommt – er steht
            auf meiner Ko-fi-Seite und im Discord. Eine Spende ist nie Bedingung.
          </p>
          <p class="muted small" id="support-status">${supportStatusText()}</p>
          <div class="row">
            <button class="btn primary small" data-support="open">${ICONS.heart} Auf Ko-fi unterstützen</button>
            ${supporterState().unlocked ? '' : '<button class="btn ghost small" data-support="unlock">Code eingeben</button>'}
          </div>
        </div>

${updatePanel()}

        ${downloadsPanel()}

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
          <label class="toggle-row" style="margin-top:14px">
            <span><strong>Backup automatisch speichern</strong><small>Wöchentlich ein JSON im gewählten Ordner; maximal die letzten fünf CleanMusic-Backups bleiben erhalten.</small></span>
            <input type="checkbox" id="opt-auto-backup" ${autoBackup.enabled ? 'checked' : ''} />
          </label>
          <div class="row" style="margin-top:8px">
            <span class="muted small">${esc(autoBackup.folder || 'Kein Ordner gewählt')}</span>
            <button class="btn ghost small" data-backup="folder">Ordner wählen …</button>
          </div>
          ${autoBackup.status ? `<p class="muted small">${esc(autoBackup.status)}</p>` : ''}
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
        ` : ''}
      </div>`;
    drawEqCurve();
  }

  /* ---------------------------------------------------------------- *
   * Navigation
   * ---------------------------------------------------------------- */

  function showView(name) {
    if (name === 'service' && !state.currentService) name = 'home';
    if (name === 'playlist' && !playlistById(state.currentPlaylist)) name = 'favorites';
    state.view = name;
    if (name !== 'creator') previewStop();
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

    if (name === 'review') renderReview();
    if (name === 'downloads') loadDownloads();
    if (name === 'presets') renderPresets();
    if (name === 'mixes') renderMixes();
    if (name === 'search') {
      renderSearchResults();
      if (!state.charts.loaded) loadCharts();
    }

    if (name === 'radio') {
      renderRadioGrid();
      if (!state.radio.loaded && !state.radio.loading) loadRadio({});
    }

    if (name === 'home' || name === 'favorites') loadRecs(false);
    if (name === 'home') renderHomeMixes();
    if (name === 'friends') openFriendsView();

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
    const dlAction = event.target.closest('[data-dl-act]');
    if (dlAction) {
      event.preventDefault();
      event.stopPropagation();
      downloadAction(dlAction);
      return;
    }
    const artistLink = event.target.closest('[data-artist]');
    if (artistLink) {
      event.preventDefault();
      event.stopPropagation();
      openArtist({ name: artistLink.dataset.artist, deezerId: Number(artistLink.dataset.artistDeezer) || 0 });
      return;
    }
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
      case 'project':
        addEntryToCutProject(entry);
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
      if (event.target.closest('#btn-smart-playlist')) {
        promptSmartPlaylist();
        return;
      }
      if (event.target.closest('#btn-services-more')) {
        navState.services = !navState.services;
        saveNavState();
        renderServiceNav();
        syncServiceActive();
        return;
      }
      if (event.target.closest('[data-nav-toggle="creator"]')) {
        navState.creator = !navState.creator;
        saveNavState();
        renderServiceNav();
        syncServiceActive();
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

      if (event.target.closest('[data-ctx-share]')) {
        const entry = ctxEntries[0];
        hideMenus();
        shareEntry(entry);
        return;
      }

      const tasteItem = event.target.closest('[data-ctx-taste]');
      if (tasteItem) {
        const mode = tasteItem.dataset.ctxTaste;
        const entries = ctxEntries.slice();
        hideMenus();
        if (mode.startsWith('artist-')) {
          setTasteFeedback(entries, 'artist', mode.includes('dislike') ? -1 : 1);
        } else {
          setTasteFeedback(entries, 'track', mode.includes('dislike') ? -1 : 1);
        }
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

      const mixAction = event.target.closest('[data-mix-action]');
      if (mixAction) {
        handleMixAction(mixAction.dataset.mixAction, mixAction.dataset.mixId);
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
          case 'presets':
            showView('presets');
            return;
          case 'mixes':
            showView('mixes');
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
        openSettings('plugins');
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
        case 'extend':
          extendPlaylist(state.currentPlaylist);
          return;
        case 'share':
          sharePlaylist(state.currentPlaylist);
          return;
        case 'smart-refresh':
          refreshSmartPlaylist(state.currentPlaylist);
          return;
        case 'smart-rules':
          editSmartPlaylist(state.currentPlaylist);
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

    $('#view-presets').addEventListener('click', (event) => {
      if (event.target.closest('[data-preset-action="streamsafe"]')) {
        setStreamSafe(!streamSafeOn());
        renderPresets();
        return;
      }

      const button = event.target.closest('[data-preset-id]');
      if (button) createPresetPlaylist(button.dataset.presetId, button.dataset.presetKind, button);
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
      const settingsTabButton = event.target.closest('[data-settings-tab]');
      if (settingsTabButton) {
        settingsTab = settingsTabButton.dataset.settingsTab;
        renderSettings();
        const content = $('#content');
        if (content) content.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const eqAction = event.target.closest('[data-eq-action]');
      if (eqAction) {
        if (eqAction.dataset.eqAction === 'save') await saveCustomEq();
        else if (eqAction.dataset.eqAction === 'delete') await deleteCustomEq();
        return;
      }

      if (event.target.closest('#btn-musickit')) {
        bridge.openMusickit();
        return;
      }

      const remoteAction = event.target.closest('[data-remote-action]');
      if (remoteAction) {
        if (remoteAction.dataset.remoteAction === 'rotate') {
          const confirmed = await askConfirm({
            title: 'Neuen Fernbedienungs-Link erzeugen?',
            message: 'Der bisherige Link und QR-Code werden sofort ungültig.',
            confirm: 'Neuen Link erzeugen',
          });
          if (!confirmed) return;
          state.remote = await bridge.remoteRotate();
        } else {
          const portInput = $('#opt-remote-port');
          const port = Math.max(1024, Math.min(65535, Math.round(Number(portInput && portInput.value) || 4790)));
          state.remote = await bridge.remoteSet({ enabled: state.remote.enabled, port });
        }
        renderSettings();
        if (state.remote.error) toast(state.remote.error);
        else if (remoteAction.dataset.remoteAction === 'rotate') toast('Neuer Link erstellt – der alte ist ungültig.');
        return;
      }

      const tvPair = event.target.closest('[data-tv-pair]');
      if (tvPair) {
        if (!bridge.tvPairSend) {
          toast('Senden an den Fernseher gibt es nur in der Desktop-App.');
          return;
        }
        const input = $('#tv-pair-url');
        const url = input ? input.value.trim() : '';
        if (!url) {
          toast('Bitte den TV-Link einfügen (steht am Fernseher unter dem QR-Code).');
          return;
        }
        toast('Wird an den Fernseher gesendet …');
        const result = await bridge.tvPairSend({
          url,
          favorites: state.collection.favorites,
          playlists: state.collection.playlists,
        });
        if (result && result.ok) {
          toast('Am Fernseher bestätigen – danach sind Favoriten und Playlists dort.');
        } else {
          toast((result && result.error) || 'Senden fehlgeschlagen.');
        }
        return;
      }

      const diagnostic = event.target.closest('[data-diagnostic]');
      if (diagnostic) {
        if (diagnostic.dataset.diagnostic === 'issue') {
          bridge.openExternal('https://github.com/BellocccYT/cleanmusic/issues/new');
        } else {
          const text = await bridge.diagnosticCopy();
          const copied = await bridge.copyText(text);
          toast(copied ? 'Diagnose in die Zwischenablage kopiert.' : 'Kopieren fehlgeschlagen.');
        }
        return;
      }

      const pluginSave = event.target.closest('[data-plugin-save]');
      if (pluginSave) {
        savePluginForm(pluginSave.dataset.pluginSave);
        return;
      }

      const lySize = event.target.closest('[data-ly-size]');
      if (lySize) {
        setLyricsOption({ lyricsSize: lySize.dataset.lySize });
        return;
      }
      const lyEffect = event.target.closest('[data-ly-effect]');
      if (lyEffect) {
        const id = lyEffect.dataset.lyEffect;
        guardExtra('lyricsEffect', id, `Songtext-Effekt „${lyEffect.textContent.trim()}“`).then((ok) => {
          if (ok) setLyricsOption({ lyricsEffect: id });
        });
        return;
      }
      const lyAlign = event.target.closest('[data-ly-align]');
      if (lyAlign) {
        setLyricsOption({ lyricsAlign: lyAlign.dataset.lyAlign });
        return;
      }

      const layoutButton = event.target.closest('[data-layout-id]');
      if (layoutButton) {
        setLayout(layoutButton.dataset.layoutId);
        return;
      }

      const bgButton = event.target.closest('[data-bg-id]');
      if (bgButton) {
        const id = bgButton.dataset.bgId;
        guardExtra('background', id, `Hintergrund „${bgButton.textContent.trim()}“`).then((ok) => {
          if (ok) setBackground(id);
        });
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
      const supportButton = event.target.closest('[data-support]');
      if (supportButton) {
        if (supportButton.dataset.support === 'unlock') askUnlockExtras('');
        else bridge.openExternal(SUPPORT_URL);
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
        else if (backup.dataset.backup === 'import') importBackup();
        else if (backup.dataset.backup === 'folder') {
          const folder = await bridge.backupFolderPick();
          if (folder) {
            autoBackup.folder = folder;
            autoBackup.lastAt = 0;
            persistAutoBackup();
            renderSettings();
            if (autoBackup.enabled) runAutoBackupIfDue();
          }
        }
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
        const id = themeCard.dataset.themeId;
        const theme = THEMES.find((entry) => entry.id === id);
        guardExtra('theme', id, `Theme „${theme ? theme.name : id}“`).then((ok) => {
          if (ok) setTheme(id);
        });
        return;
      }

      const vizStyle = event.target.closest('[data-viz-style]');
      if (vizStyle) {
        const id = vizStyle.dataset.vizStyle;
        guardExtra('vizStyle', id, `Visualizer-Stil „${vizStyle.textContent.trim()}“`).then((ok) => {
          if (ok) setVisualizerStyle(id);
        });
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
      const band = event.target.closest('[data-eq-band]');
      if (band) {
        const index = Number(band.dataset.eqBand);
        eqState.gains[index] = Math.max(-12, Math.min(12, Number(band.value) || 0));
        if (EQ_PRESETS.some((preset) => preset.id === eqState.preset)) eqState.preset = 'custom';
        const label = $(`[data-eq-value="${index}"]`);
        if (label) label.textContent = `${eqState.gains[index]} dB`;
        persistEq();
        applyVolume();
        drawEqCurve();
      }
    });

    $('#view-settings').addEventListener('change', async (event) => {
      if (event.target.id === 'opt-system') {
        state.settings.systemBrowser = event.target.checked;
        saveSettings();
        updateStatusChips();
        toast(event.target.checked ? 'Dienste öffnen im System-Browser' : 'Dienste öffnen eingebettet');
        return;
      }

      if (event.target.id === 'opt-eq-enabled') {
        eqState.enabled = event.target.checked;
        persistEq();
        applyVolume();
        syncDiagnosticState();
        toast(eqState.enabled ? '10-Band-Equalizer eingeschaltet.' : 'Equalizer ausgeschaltet.');
        renderSettings();
        return;
      }

      if (event.target.id === 'opt-auto-backup') {
        autoBackup.enabled = event.target.checked;
        persistAutoBackup();
        if (autoBackup.enabled && !autoBackup.folder) {
          event.target.checked = false;
          autoBackup.enabled = false;
          persistAutoBackup();
          toast('Wähle zuerst einen Backup-Ordner.');
        } else if (autoBackup.enabled) {
          runAutoBackupIfDue(true);
          toast('Wöchentliches Backup eingeschaltet.');
        } else toast('Automatisches Backup ausgeschaltet.');
        renderSettings();
        return;
      }

      if (event.target.id === 'opt-eq-preset') {
        selectEqPreset(event.target.value);
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

      if (event.target.id === 'opt-performance') {
        setPerformance(event.target.value);
        return;
      }

      if (event.target.id === 'opt-fs-viz') {
        setFullscreenVisualizer(event.target.checked);
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

      if (event.target.id === 'opt-markai') {
        state.settings.markAi = event.target.checked;
        saveSettings();
        toast(event.target.checked ? 'KI-Songs werden markiert' : 'KI-Markierung aus');
        return;
      }

      if (event.target.id === 'opt-bg-motion') {
        state.settings.bgMotion = event.target.checked;
        saveSettings();
        syncVisualizerEngine();
        applyBackground();
        return;
      }

      if (event.target.id === 'opt-bg-pulse') {
        state.settings.bgPulse = event.target.checked;
        saveSettings();
        syncVisualizerEngine();
        syncLiveBackground();
        if (!state.settings.bgPulse && window.CMLiveBackground) window.CMLiveBackground.setBeat(0);
        return;
      }

      if (event.target.id === 'opt-bg-battery') {
        state.settings.bgBatteryStop = event.target.checked;
        saveSettings();
        syncLiveBackground();
        return;
      }

      if (event.target.id === 'opt-fs-background') {
        setFullscreenBackground(event.target.value);
        return;
      }

      if (event.target.id === 'opt-bg-pulse') {
        state.settings.bgPulse = event.target.checked;
        saveSettings();
        syncVisualizerEngine();
        syncLiveBackground();
        if (!state.settings.bgPulse && window.CMLiveBackground) window.CMLiveBackground.setBeat(0);
        return;
      }

      if (event.target.id === 'opt-bg-battery') {
        state.settings.bgBatteryStop = event.target.checked;
        saveSettings();
        syncLiveBackground();
        return;
      }

      if (event.target.id === 'opt-fs-background') {
        setFullscreenBackground(event.target.value);
        return;
      }

      if (event.target.id === 'opt-streamsafe') {
        setStreamSafe(event.target.checked);
        return;
      }

      if (event.target.id === 'opt-lyrics') {
        toggleLyrics(event.target.checked);
        return;
      }

      if (event.target.id === 'opt-vinyl') {
        setVinyl(event.target.checked);
        return;
      }

      if (event.target.id === 'opt-ly-offset') {
        state.settings.lyricsOffset = Math.round(Number(event.target.value) * 10) / 10 || 0;
        saveSettings();
        const label = $('#ly-offset-value');
        if (label) label.textContent = offsetLabel();
        renderLyrics();
        return;
      }

      if (['opt-ly-scroll', 'opt-ly-dim', 'opt-ly-focus'].includes(event.target.id)) {
        const key = { 'opt-ly-scroll': 'lyricsScroll', 'opt-ly-dim': 'lyricsDim', 'opt-ly-focus': 'lyricsFocus' }[event.target.id];
        state.settings[key] = event.target.checked;
        saveSettings();
        renderLyrics();
        return;
      }

      if (event.target.id === 'opt-transition') {
        state.settings.transition = event.target.value;
        saveSettings();
        if (state.settings.transition !== 'crossfade') stopGhost();
        renderSettings();
        toast(
          state.settings.transition === 'crossfade'
            ? `Crossfade an – ${crossfadeSecs()} Sekunden`
            : state.settings.transition === 'gapless'
              ? 'Lückenlos an – der nächste Titel wird vorgeladen'
              : 'Übergänge aus'
        );
        return;
      }

      if (event.target.id === 'opt-crossfade') {
        state.settings.crossfadeSecs = Number(event.target.value) || 6;
        saveSettings();
        const label = $('#crossfade-value');
        if (label) label.textContent = `${crossfadeSecs()} s`;
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

      if (event.target.id === 'opt-taskbar') {
        const result = await bridge.taskbarSet({ progress: event.target.checked });
        state.taskbarProgress = Boolean(result && result.progress);
        return;
      }

      if (event.target.id === 'opt-remote') {
        const portInput = $('#opt-remote-port');
        const port = Math.max(1024, Math.min(65535, Math.round(Number(portInput && portInput.value) || 4790)));
        state.remote = await bridge.remoteSet({ enabled: event.target.checked, port });
        renderSettings();
        toast(state.remote.error || (state.remote.enabled ? 'Fernbedienung aktiv – nur im privaten WLAN verwenden.' : 'Fernbedienung ausgeschaltet.'));
        return;
      }

      if (event.target.id === 'opt-global-shortcuts') {
        state.globalShortcuts = await bridge.shortcutsSet({ enabled: event.target.checked });
        if (state.globalShortcuts.conflict) toast(`Kürzel ist schon belegt: ${state.globalShortcuts.conflict}`);
        else toast(state.globalShortcuts.enabled ? 'Globale Tastenkürzel eingeschaltet.' : 'Globale Tastenkürzel ausgeschaltet.');
        renderSettings();
        return;
      }

      if (event.target.id === 'opt-login') {
        const result = await bridge.loginSet({ enabled: event.target.checked });
        state.startOnLogin = Boolean(result && result.enabled);
        if (!result || !result.supported) toast('Autostart gibt es nur in gepackten Windows-Versionen.');
        else toast(state.startOnLogin ? 'CleanMusic startet mit Windows.' : 'Autostart ausgeschaltet.');
        return;
      }

      if (event.target.id === 'opt-normalize' || event.target.id === 'opt-boost') {
        const boost = event.target.id === 'opt-boost';
        state.settings[boost ? 'volumeBoost' : 'normalize'] = event.target.checked;
        saveSettings();
        if (vol.level > maxVolume()) vol.level = CMVolume.clampLevel(vol.level, maxVolume());
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
      if (event.target.id === 'opt-discord-share') {
        saveDiscord({ shareButton: event.target.checked });
        pushPresence(true);
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
    $('#view-creator').addEventListener('click', async (event) => {
      const clipRemove = event.target.closest('[data-clip-remove]');
      if (clipRemove) {
        const project = activeCutProject();
        const index = Number(clipRemove.dataset.clipRemove);
        if (project && project.clips[index]) {
          project.clips.splice(index, 1);
          persistCutProjects();
          renderCredits();
        }
        return;
      }
      const clipMove = event.target.closest('[data-clip-move]');
      if (clipMove) {
        const project = activeCutProject();
        const [at, direction] = String(clipMove.dataset.clipMove).split(':');
        const index = Number(at);
        const other = direction === 'up' ? index - 1 : index + 1;
        if (project && project.clips[index] && project.clips[other]) {
          const [clip] = project.clips.splice(index, 1);
          project.clips.splice(other, 0, clip);
          persistCutProjects();
          renderCredits();
        }
        return;
      }
      const projectAction = event.target.closest('[data-project-action]');
      if (projectAction) {
        const project = activeCutProject();
        switch (projectAction.dataset.projectAction) {
          case 'new': await createCutProject(); return;
          case 'preview': previewToggle(); return;
          case 'export': exportProject(); return;
          case 'copy': {
            if (!project) return;
            const ok = await bridge.copyText(projectCreditsText(project));
            toast(ok ? 'Projekt-Credits kopiert.' : 'Kopieren fehlgeschlagen.');
            return;
          }
          case 'save': await saveCutProjectCredits(); return;
          case 'delete':
            if (!project || !(await askConfirm({ title: 'Projekt löschen?', message: `„${project.name}“ und seine gesammelten Credits werden entfernt.`, confirm: 'Löschen', danger: true }))) return;
            cutProjects.projects = cutProjects.projects.filter((entry) => entry.id !== project.id);
            cutProjects.active = null;
            persistCutProjects();
            renderCredits();
            return;
          default: return;
        }
      }
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

    $('#view-creator').addEventListener('change', (event) => {
      if (event.target.id !== 'cut-project-select') return;
      cutProjects.active = event.target.value || null;
      persistCutProjects();
      renderCredits();
    });

    // Fullscreen player
    $('#btn-fullscreen').addEventListener('click', () => toggleFullscreen());
    $('#np-art').addEventListener('dblclick', () => openFullscreen());

    const fullscreen = $('#fullscreen');
    fullscreen.addEventListener('mousemove', fsActivity);
    fullscreen.addEventListener('change', (event) => {
      if (event.target.id === 'fs-background-mode') setFullscreenBackground(event.target.value);
    });
    fullscreen.addEventListener('click', (event) => {
      fsActivity();

      const queued = event.target.closest('[data-fs-queue]');
      if (queued) {
        playFromQueue(Number(queued.dataset.fsQueue));
        return;
      }

      const style = event.target.closest('[data-fs-style]');
      if (style) {
        const id = style.dataset.fsStyle;
        guardExtra('vizStyle', id, `Visualizer-Stil „${style.textContent.trim()}“`).then((ok) => {
          if (ok) setVisualizerStyle(id);
        });
        return;
      }

      const act = event.target.closest('[data-fs-act]');
      if (!act) return;

      switch (act.dataset.fsAct) {
        case 'close':
          closeFullscreen();
          return;
        case 'lyrics':
          toggleLyrics();
          act.blur();
          return;
        case 'vinyl':
          setVinyl(!state.settings.vinyl);
          act.blur();
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
    applyBackground();
    applyLayout();
    window.addEventListener('error', (event) => {
      console.error(`Renderer error: ${event.message}`);
      bridge.diagnosticError(`window.onerror: ${event.message || 'Unbekannter Fehler'} (${event.filename || ''}:${event.lineno || 0})`);
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason && (event.reason.stack || event.reason.message) || event.reason || 'Unbekannter Promise-Fehler';
      bridge.diagnosticError(`unhandledrejection: ${String(reason)}`);
    });

    restoreLibrary();
    buildSidebar();
    buildHome();
    buildSearch('');
    buildRadio();
    renderLocal();
    renderFavorites();
    supporterState();
    checkTrialReset(Date.now(), true);
    renderSettings();
    initSocial();
    wirePlayer();
    wireQueuePanel();
    wireOnboarding();
    wireSupport();
    wireLocalExtras();
    wireArtistPage();
    wireCutterExtras();
    wireDownloadsView();
    wireLyricsTools();
    wireVinyl();
    wireReview();
    wireGlobal();

    // Visualizer: analyses the <audio> element, draws in the player bar
    // and in the fullscreen player; the cover pulses with the bass.
    const viz = window.CMVisualizer;
    viz.attach(audio);
    viz.register($('#mini-viz'), { mini: true });
    viz.register($('#fs-viz'), { style: state.settings.vizStyle, anchor: $('#fs-cover') });
    applyPerformance();
    let lastBackgroundPulse = 0;
    viz.onFrame((energy) => {
      const motionAllowed = state.settings.bgMotion !== false && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (state.fullscreen) {
        $('#fs-cover').style.setProperty('--beat', motionAllowed ? energy.toFixed(3) : '0');
        const backdrop = $('#fs-bg-img');
        if (backdrop && state.settings.fsBackground === 'cover-moving' && motionAllowed) {
          const pulse = Math.max(0, Math.min(1, energy));
          backdrop.style.filter = `blur(80px) saturate(${1.7 + pulse * 0.12}) brightness(${0.42 + pulse * 0.06}) hue-rotate(${pulse * 8}deg)`;
        } else if (backdrop) backdrop.style.filter = '';
      }
      const now = performance.now();
      if (now - lastBackgroundPulse < 1000 / 30) return;
      lastBackgroundPulse = now;
      const beat = motionAllowed && state.settings.bgPulse && !audio.paused && viz.level ? viz.level() : 0;
      if (window.CMLiveBackground) window.CMLiveBackground.setBeat(beat);
    });
    syncVisualizerEngine();
    document.addEventListener('visibilitychange', syncVisualizerEngine);
    applyVisualizerVisibility();
    applyVolume();
    syncDiagnosticState();
    setTimeout(reportMigrations, 1500);
    setTimeout(refreshDailyRecipes, 5000);
    setInterval(refreshDailyRecipes, 60 * 60 * 1000);

    // Plugins (API v2): player events, commands, messages.
    ['play', 'pause', 'ended', 'seeked', 'loadedmetadata', 'emptied'].forEach((name) =>
      audio.addEventListener(name, () => pushPlayerState())
    );
    audio.addEventListener('timeupdate', () => {
      if (Date.now() - playerStateAt > 900) pushPlayerState();
      trackListening();
    });
    audio.addEventListener('pause', () => {
      listen.last = 0;
    });
    if (bridge.onPlayerCommand) bridge.onPlayerCommand(onPlayerCommand);
    if (bridge.onVisualizerWatch) bridge.onVisualizerWatch(setVisualizerWatch);
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

    Promise.all([
      bridge.remoteGet().catch(() => null),
      bridge.taskbarGet().catch(() => null),
      bridge.shortcutsGet().catch(() => null),
      bridge.loginGet().catch(() => null),
      bridge.liveBgGet().catch(() => null),
    ]).then(([remote, taskbar, shortcuts, login, liveBg]) => {
      if (remote) state.remote = remote;
      if (taskbar) state.taskbarProgress = Boolean(taskbar.progress);
      if (shortcuts) state.globalShortcuts = Object.assign(state.globalShortcuts, shortcuts);
      if (login) state.startOnLogin = Boolean(login.enabled);
      if (liveBg) {
        customBg = { url: liveBg.url || '', kind: liveBg.kind || '' };
        if (liveBg.missing && state.settings.background === 'custom') {
          state.settings.background = 'none';
          saveSettings();
          applyBackground();
          toast('Das gespeicherte Hintergrundvideo fehlt. Hintergrund auf „Keiner“ zurückgesetzt.');
        } else if (state.settings.background === 'custom') applyBackground();
      }
      renderSettings();
    });

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
        startAutoBackupSchedule();
      })
      .catch(() => {});

    refreshPlugins(false);
  }

  // Small debug surface (also used by the smoke test).
  window.CleanMusic = {
    openService,
    showView,
    openSettings,
    search: (query) => buildSearch(query),
    playList,
    openPlaylist,
    shareCurrent: () => shareEntry(currentItem()),
    toggleFavoriteAt: (key, index) => toggleFavorite(entryAt(key, index)),
    createPlaylist: (name) => createPlaylist(name).id,
    matchKey: (entry) => matchKey(entry || {}),
    // Smart playlists (smoke + manual verification)
    smartPlaylist: (name, rules) => {
      const playlist = createPlaylist(name, '', rules);
      rebuildSmartPlaylist(playlist, { quiet: true });
      onCollectionChanged({ playlists: true });
      return { id: playlist.id, count: playlist.items.length };
    },
    smartPlaylistInfo: (id) => {
      const playlist = playlistById(id);
      if (!playlist) return null;
      return {
        id: playlist.id,
        name: playlist.name,
        smart: playlist.smart,
        count: playlist.items.length,
        titles: playlist.items.map((entry) => entry.title),
        uniqueIds: new Set(playlist.items.map((entry) => entry.id)).size,
        uniqueKeys: new Set(playlist.items.map((entry) => smartKey(entry))).size,
        allValid: playlist.items.every(validEntry),
      };
    },
    smartPlaylistRebuild: (id) => rebuildSmartPlaylist(playlistById(id), { quiet: true }),
    refreshDailyRecipes: () => refreshDailyRecipes(),
    mixRecipe: (id) => {
      const playlist = saveMixAsRecipe(id);
      return playlist ? { id: playlist.id, name: playlist.name, smart: playlist.smart, count: playlist.items.length } : null;
    },
    groupState: () => ({ name: group.name, members: Object.keys(group.members).length, card: ownWeekCard() }),
    groupImport: (code, options) => importGroupLink(code, options),
    playlistShare: (id) => sharePlaylist(id),
    supporterState: () => Object.assign({}, supporterState()),
    supporterSet: (unlocked) => {
      if (unlocked && typeof unlocked === 'object') setSupporter(Object.assign({}, unlocked));
      else setSupporter(unlocked ? window.CMSupporter.unlock('code', Date.now()) : { unlocked: false, how: '', at: 0 });
      return Object.assign({}, supporter);
    },
    supporterCheckTrial: (now) => ({ reset: checkTrialReset(now), notice: checkTrialNotice() }),
    supportCard: () => ({ hidden: $('#support-card').hidden, kind: $('#support-card').dataset.kind || '', text: $('#support-card').textContent.replace(/\s+/g, ' ').trim() }),
    supportCardClose: () => hideSupportCard(),
    kofiHint: (options) => maybeKofiHint(Object.assign({ force: true }, options)),
    kofiHintState: () => readJSON(STORAGE.kofiHint, null),
    kofiHintReset: () => { try { localStorage.removeItem(STORAGE.kofiHint); } catch { /* egal */ } },
    supporterExtras: (patch) => {
      if (patch && patch.theme) setTheme(patch.theme);
      if (patch && patch.background) setBackground(patch.background);
      if (patch && patch.lyricsEffect) setLyricsOption({ lyricsEffect: patch.lyricsEffect });
      if (patch && patch.vizStyle) {
        state.settings.vizStyle = patch.vizStyle;
        saveSettings();
      }
      const s = state.settings;
      return { theme: s.theme, background: s.background, lyricsEffect: s.lyricsEffect, vizStyle: s.vizStyle };
    },
    extraLocked: (kind, id) => extraLocked(kind, id),
    playlistImportLink: (code, options) => importPlaylistLink(code, options),
    // Social (Weg B) – smoke + manual checks
    socialServer: (url) => saveSocialServer(url),
    socialEnable: () => enableSocial({ confirm: true }),
    socialState: () => JSON.parse(JSON.stringify({
      local: socialLocal,
      info: socialRt.info,
      me: socialRt.me,
      friends: socialRt.friends,
      reactions: socialRt.reactions,
      blocked: socialRt.blocked,
      groups: socialRt.groups,
      code: socialRt.code ? { code: socialRt.code.code, link: socialRt.code.link, qr: Boolean(socialRt.code.qr) } : null,
    })),
    socialRefresh: () => refreshFriends({ quiet: true }),
    socialTick: () => socialTick(),
    socialName: (name) => saveSocialName(name),
    socialRandomName: () => randomSocialName(),
    socialShowActivity: (on) => setShowActivity(on),
    socialCode: () => createFriendCode(),
    socialRedeem: (code) => redeemFriendCode(code, { confirm: true }),
    socialFriendLink: (code) => importFriendLink(code, { confirm: true }),
    socialPlay: (id) => playFriend(id),
    socialReact: (id, emoji) => reactToFriend(id, emoji),
    socialBlock: (id) => blockFriend(id, { confirm: true }),
    socialUnblock: (id) => unblockFriend(id),
    socialReport: (id, reason) => reportFriend(id, { reason, block: false }),
    socialRemove: (id) => removeFriend(id, { confirm: true }),
    socialDisable: () => disableSocial(),
    socialDelete: () => deleteSocialAccount({ confirm: true }),
    socialGroupCreate: (name) => createSocialGroup(name),
    socialGroupCode: (gid) => createGroupCode(gid),
    socialGroupJoin: (code) => joinGroupCode(code, { confirm: true }),
    socialGroupAdd: (gid) => addCurrentToGroup(gid),
    socialGroupUntrack: (gid, rid) => removeGroupTrack(gid, rid),
    socialGroupLeave: (gid) => leaveSocialGroup(gid, { confirm: true }),
    groupReset: () => {
      group = GROUP.normalizeGroup({});
      persistGroup();
      if (state.view === 'review') renderReview();
    },
    smartPlaylistAge: (id, ms) => {
      const playlist = playlistById(id);
      if (!playlist || !playlist.smart) return false;
      playlist.smart.updatedAt = Date.now() - Number(ms || 0);
      return true;
    },
    recipeWhy: (id, entryId) => {
      const playlist = playlistById(id);
      return playlist && playlist.smart ? RECIPES.explain(playlist.smart, entryId) : '';
    },
    smartPlaylistRemove: (id) => {
      const existed = Boolean(playlistById(id));
      state.collection.playlists = state.collection.playlists.filter((item) => item.id !== id);
      if (state.currentPlaylist === id) state.currentPlaylist = null;
      onCollectionChanged({ playlists: true });
      return existed;
    },
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
    // Smoke test: build one template in both variants, check it, clean up.
    presetSmoke: async (presetId = 'emotional') => {
      const run = async (kind) => {
        await createPresetPlaylist(presetId, kind);
        const playlist = presetPlaylist(presetId, kind);
        const out = {
          created: Boolean(playlist),
          items: playlist ? playlist.items.length : 0,
          allSafe: playlist ? playlist.items.every(streamSafe) : false,
          withCredit: playlist ? playlist.items.filter((entry) => Boolean(entry.credit)).length : 0,
          first: playlist && playlist.items[0] ? playlist.items[0].title : '',
        };
        if (playlist) {
          state.collection.playlists = state.collection.playlists.filter((item) => item.id !== playlist.id);
          onCollectionChanged({ playlists: true });
        }
        return out;
      };

      const safe = await run('safe');
      const normal = await run('normal');
      showView('home');
      return { safe, normal };
    },
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
        music: onboardingMusic ? onboardingMusic.state() : null,
      }),
      click: (selector) => {
        const el = document.querySelector('#onboarding ' + selector);
        if (el) el.click();
        return Boolean(el);
      },
    },
    whatsNew: (version, previous) => showWhatsNew(version, previous || ''),
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
    taste: () => {
      const stats = tasteStats();
      return {
        stats,
        tracks: Object.keys(state.taste.tracks).length,
        artists: Object.keys(state.taste.artists).length,
        skips: state.taste.skips.length,
        revision: state.taste.revision,
      };
    },
    tasteAt: (key, index, mode) => {
      const entry = entryAt(key, index);
      if (!entry) return false;
      const target = String(mode).startsWith('artist-') ? 'artist' : 'track';
      setTasteFeedback([entry], target, String(mode).includes('dislike') ? -1 : 1);
      return true;
    },
    tasteReset: () => {
      state.taste = { tracks: {}, artists: {}, skips: [], revision: (Number(state.taste.revision) || 0) + 1 };
      writeJSON(STORAGE.taste, state.taste);
      invalidateMixes();
      renderHomeMixes();
      if (state.view === 'mixes') renderMixes();
      return true;
    },
    mixes: () => {
      const lists = ensureMixes();
      return MIX_DEFS.map((def) => ({
        id: def.id,
        title: def.title,
        items: (lists[def.id] || []).length,
        titles: (lists[def.id] || []).slice(0, 5).map((entry) => entry.title),
      }));
    },
    mixPlay: (id) => playMix(id, false),
    mixSave: (id) => saveMix(id),
    mixRefresh: () => {
      mixState.nonce += 1;
      invalidateMixes();
      renderHomeMixes();
      if (state.view === 'mixes') renderMixes();
      return true;
    },
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
    visualizerSnapshot: () => visualizerSnapshot(),
    setLayout: (mode) => setLayout(mode),
    setVinyl: (on) => setVinyl(on),
    lyricsEffectTest: (effect, index) => {
      // Self-contained for the smoke test: turn lyrics on and inject two lines.
      const saved = {
        lyrics: state.settings.lyrics,
        effect: state.settings.lyricsEffect,
        mode: state.nowMode,
        data: Object.assign({}, lyricsState),
        hold: lyricsHold,
      };
      lyricsHold = true;
      state.settings.lyrics = true;
      try {
        if (!lyricsState.lines.length) {
          Object.assign(lyricsState, {
            key: 'smoke|lyricvideo',
            lines: [
              { time: 0, text: 'Preaching to the choir' },
              { time: 3, text: 'Get up and go' },
            ],
            plain: '',
            loading: false,
            error: null,
            index: -1,
          });
        }
        state.settings.lyricsEffect = effect;
        state.nowMode = 'plugin';
        renderLyrics();
        showLyricLine(index, true);
        const host = $('#fs-lyrics');
        const stage = host && host.querySelector('.ly-kinetic');
        return {
          effect: host ? host.dataset.fx : '',
          words: host ? host.querySelectorAll('.ly-k-line span, .lv-word').length : 0,
          accent: stage ? stage.querySelectorAll('.lv-accent').length : 0,
          html: stage ? stage.innerHTML : '',
          dur: ((host && host.querySelector(`[data-ly="${index}"]`)) || { style: { getPropertyValue: () => '' } }).style.getPropertyValue('--dur'),
        };
      } finally {
        lyricsHold = saved.hold;
        state.settings.lyrics = saved.lyrics;
        state.settings.lyricsEffect = saved.effect;
        state.nowMode = saved.mode;
        Object.assign(lyricsState, saved.data);
        renderLyrics();
      }
    },
    lyricsModeTest: () => {
      const saved = {
        lyrics: state.settings.lyrics,
        effect: state.settings.lyricsEffect,
        mode: state.nowMode,
        data: Object.assign({}, lyricsState),
      };
      lyricsHold = true;
      try {
        state.settings.lyrics = true;
        state.settings.lyricsEffect = 'pop';
        Object.assign(lyricsState, { key: 'smoke|modus', lines: [{ time: 0, text: 'Eins' }, { time: 2, text: 'Zwei' }, { time: 4, text: 'Drei' }], plain: '', loading: false, error: null, index: -1 });
        const host = $('#fs-lyrics');
        state.nowMode = 'loading';
        renderLyrics();
        const before = host ? host.querySelectorAll('p[data-ly]').length : 0;
        state.nowMode = 'preview';
        updateLyricLine();
        const preview = Boolean(host && host.querySelectorAll('p.static').length === 3 && !host.querySelector('p[data-ly]'));
        state.nowMode = 'plugin';
        updateLyricLine();
        const full = host ? host.querySelectorAll('p[data-ly]').length : 0;
        return { before, preview, full };
      } finally {
        lyricsHold = false;
        state.settings.lyrics = saved.lyrics;
        state.settings.lyricsEffect = saved.effect;
        state.nowMode = saved.mode;
        Object.assign(lyricsState, saved.data);
        renderLyrics();
      }
    },
    lyricsScrollTest: (index) => {
      state.nowMode = 'plugin';
      renderLyrics();
      lyricsState.index = index;
      showLyricLine(index, true);
      const host = $('#fs-lyrics');
      const line = host && host.querySelector(`[data-ly="${index}"]`);
      if (!host || !line) return null;
      const box = host.getBoundingClientRect();
      const rect = line.getBoundingClientRect();
      return { lineCenter: Math.round(rect.top + rect.height / 2 - box.top), boxHeight: Math.round(box.height), lines: host.querySelectorAll('p[data-ly]').length };
    },
    downloadsView: async (query) => {
      dlView.query = query || '';
      showView('downloads');
      await loadDownloads();
      return { files: dlView.files.length, visible: visibleDownloads().length, rows: document.querySelectorAll('#view-downloads .dl-row').length, first: (visibleDownloads()[0] || {}).title || '', credit: Boolean((visibleDownloads()[0] || {}).credit) };
    },
    bpmSynthetic: (bpm) => {
      const rate = 22050;
      const buffer = new AudioBuffer({ length: rate * 40, sampleRate: rate, numberOfChannels: 1 });
      const data = buffer.getChannelData(0);
      const period = Math.round((60 / bpm) * rate);
      for (let at = 0; at < data.length; at += period) {
        for (let k = 0; k < 800 && at + k < data.length; k += 1) data[at + k] = Math.sin(k / 3) * Math.exp(-k / 150);
      }
      return estimateBpm(buffer);
    },
    bpmOf: async (url) => {
      try {
        return estimateBpm(await decodeEntry({ url, kind: 'stream' }));
      } catch (error) {
        return error.message;
      }
    },
    statsTest: (entry, secs) => {
      statsPlay(entry);
      statsListen(entry, secs);
      return true;
    },
    reviewSummary: (period) => {
      const data = reviewData(period || 'month');
      return {
        minutes: Math.round(data.secs / 60),
        plays: data.plays,
        topArtist: data.topArtists[0] ? data.topArtists[0][0] : '',
        topTrack: data.topTracks[0] ? data.topTracks[0].e.title : '',
      };
    },
    setTransition: (mode) => {
      state.settings.transition = mode;
      saveSettings();
    },
    transitionMode: () => transitionMode(),
    wavTest: () => {
      const buffer = new AudioBuffer({ length: 22050, sampleRate: 22050, numberOfChannels: 2 });
      const bytes = wavBytes(buffer, 0.25, 0.75);
      return {
        head: String.fromCharCode(...bytes.slice(0, 4)) + String.fromCharCode(...bytes.slice(8, 12)),
        size: bytes.length,
        expected: 44 + 11025 * 2 * 2,
      };
    },
    wavEffectsTest: () => {
      const buffer = new AudioBuffer({ length: 44100, sampleRate: 44100, numberOfChannels: 1 });
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) samples[index] = 0.2 + 0.3 * Math.sin(index / 29);
      const bytes = wavBytes(buffer, 0, 1, { fadeIn: 0.1, fadeOut: 0.1, normalize: true, loop: true, loopMs: 200 });
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let peak = 0;
      for (let offset = 44; offset < bytes.length; offset += 2) peak = Math.max(peak, Math.abs(view.getInt16(offset, true)) / 32768);
      return { riff: String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF', bytes: bytes.length, fadeStart: view.getInt16(44, true), fadeEnd: view.getInt16(bytes.length - 2, true), peak: Number(peak.toFixed(3)) };
    },
    equalizerState: () => ({ enabled: eqState.enabled, preset: eqState.preset, gains: eqState.gains.slice(), custom: eqState.custom.length }),
    cutProjectSmoke: () => {
      const before = JSON.parse(JSON.stringify(cutProjects));
      cutProjects.projects = [{ id: 'smoke-project', name: 'Smoke Video', created: Date.now(), clips: [] }];
      cutProjects.active = 'smoke-project';
      addEntryToCutProject({ id: 'smoke-a', title: 'Smoke Song', artist: 'Smoke Artist', license: 'CC BY 4.0', credit: 'Smoke Artist – Smoke Song (CC BY 4.0)' }, true);
      addEntryToCutProject({ id: 'smoke-b', title: 'Smoke Song', artist: 'Smoke Artist', license: 'CC BY 4.0', credit: 'Smoke Artist – Smoke Song (CC BY 4.0)' }, true);
      const project = activeCutProject();
      const text = projectCreditsText(project);
      cutProjects.active = before.active;
      cutProjects.projects = before.projects;
      return { count: project.clips.length, deduped: (text.match(/Smoke Artist – Smoke Song/g) || []).length === 1, text };
    },
    studioSmoke: () => {
      const before = JSON.parse(JSON.stringify(cutProjects));
      cutProjects.projects = [{ id: 'smoke-studio', name: 'Smoke Studio', created: Date.now(), clips: [] }];
      cutProjects.active = 'smoke-studio';
      addEntryToCutProject({ id: 'studio-a', title: 'Studio A', artist: 'X', license: 'CC BY 4.0', credit: 'Studio A (CC BY 4.0)', url: 'https://example.com/a.mp3', duration: 5 }, true);
      addEntryToCutProject({ id: 'studio-b', title: 'Studio B', artist: 'Y', license: 'CC0', credit: 'Studio B (CC0)', url: 'https://example.com/b.mp3', duration: 4 }, true);
      const project = activeCutProject();
      project.clips[0].in = 1;
      project.clips[0].out = 4;
      project.clips[1].in = 0;
      project.clips[1].out = 4;
      project.clips[1].transition = 1;
      const layout = CMStudio ? CMStudio.timelineLayout(project.clips) : { rows: [] };
      const safe = CMStudio ? CMStudio.isStreamSafe(project.clips) : false;
      const text = projectCreditsText(project);
      const rate = 44100;
      const make = (seconds) => {
        const len = Math.floor(seconds * rate);
        const data = new Float32Array(len);
        for (let i = 0; i < len; i += 1) data[i] = Math.sin(i * 0.05) * 0.4;
        return { sampleRate: rate, numberOfChannels: 1, length: len, getChannelData: () => data };
      };
      const buffers = new Map();
      project.clips.forEach((clip) => buffers.set(clip.key, make(clip.duration || clip.out)));
      const rendered = renderTimeline(project.clips, buffers, rate);
      const total = rendered.frames;
      const bytes = encodeWav(rendered.channels, rate, total);
      cutProjects.active = before.active;
      cutProjects.projects = before.projects;
      return {
        clips: project.clips.length,
        total,
        safe,
        riff: String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF',
        ordered: layout.rows.length === 2 && layout.rows[0].end === 3 && layout.rows[1].start === 2 && layout.rows[1].overlap === 1,
        changes: /Änderungen/.test(text) && /Studio A/.test(text) && /Studio B/.test(text),
        bytes: bytes.length,
      };
    },
    studioExportSmoke: async (folder) => {
      const before = JSON.parse(JSON.stringify(cutProjects));
      cutProjects.projects = [{ id: 'smoke-studio', name: 'Smoke Studio', created: Date.now(), clips: [] }];
      cutProjects.active = 'smoke-studio';
      addEntryToCutProject({ id: 'studio-a', title: 'Studio A', artist: 'X', license: 'CC BY 4.0', credit: 'Studio A (CC BY 4.0)', url: 'https://example.com/a.mp3', duration: 3 }, true);
      addEntryToCutProject({ id: 'studio-b', title: 'Studio B', artist: 'Y', license: 'CC0', credit: 'Studio B (CC0)', url: 'https://example.com/b.mp3', duration: 2 }, true);
      const project = activeCutProject();
      project.clips[0].in = 0;
      project.clips[0].out = 3;
      project.clips[1].in = 0;
      project.clips[1].out = 2;
      const text = projectCreditsText(project);
      const rate = 44100;
      const make = (seconds) => {
        const len = Math.floor(seconds * rate);
        const data = new Float32Array(len);
        for (let i = 0; i < len; i += 1) data[i] = Math.sin(i * 0.05) * 0.4;
        return { sampleRate: rate, numberOfChannels: 1, length: len, getChannelData: () => data };
      };
      const buffers = new Map();
      project.clips.forEach((clip) => buffers.set(clip.key, make(clip.duration || clip.out)));
      const rendered = renderTimeline(project.clips, buffers, rate);
      const bytes = encodeWav(rendered.channels, rate, rendered.frames);
      const result = bridge.studioExport
        ? await bridge.studioExport({
            bytes,
            name: project.name,
            text,
            clips: project.clips.map((clip) => ({ title: clip.title, artist: clip.artist, license: clip.license, credit: clip.credit, from: clip.in, to: clip.out, changes: CMStudio.clipChanges(clip) })),
            folder: folder || '',
          })
        : { error: 'Kein Bridge' };
      cutProjects.active = before.active;
      cutProjects.projects = before.projects;
      return { ok: Boolean(result && result.ok), name: result && result.name, error: result && result.error, safe: CMStudio.isStreamSafe(project.clips), changes: /Änderungen/.test(text) };
    },
    studioPreviewSmoke: () => {
      const before = { active: cutProjects.active, projects: JSON.parse(JSON.stringify(cutProjects.projects)) };
      cutProjects.projects = [
        CMStudio.normalizeProject({
          id: 'smoke-preview',
          name: 'Smoke Preview',
          created: Date.now(),
          clips: [
            { key: 'p1', title: 'P1', artist: 'X', license: 'CC BY 4.0', credit: 'P1', url: 'https://example.com/p.mp3', in: 0, out: 3, duration: 3 },
            { key: 'p2', title: 'P2', artist: 'Y', license: 'CC0', credit: 'P2', url: 'https://example.com/q.mp3', in: 0, out: 2, duration: 2, transition: 1 },
          ],
        }),
      ];
      cutProjects.active = 'smoke-preview';
      const html = cutProjectPanelHtml();
      cutProjects.active = before.active;
      cutProjects.projects = before.projects;
      return {
        button: /id="studio-preview"/.test(html),
        effects: /data-clip-fx=/.test(html),
        transitions: /data-clip-fx="1:transition"/.test(html),
        total: /0:04/.test(html),
      };
    },
    stateStoreTest: () => {
      const before = state.settings.lyrics;
      let notified = 0;
      const off = store.settings.subscribe(() => {
        notified += 1;
      });
      store.settings.set({ lyrics: !before });
      const changed = state.settings.lyrics === !before;
      store.settings.set({ lyrics: before });
      off();
      return {
        changed,
        notified: notified >= 2,
        theme: CMState.SETTINGS_DEFAULTS.theme,
        normalized: CMState.normalizeSettings({ theme: 'x' }).theme === 'x' && CMState.normalizeSettings({ theme: 'x' }).layout === 'advanced',
        listeners: store.listenerCount(),
      };
    },
    queueSliceTest: () => {
      const backup = state.queue;
      const saved = {
        items: backup.items.slice(),
        index: backup.index,
        kind: backup.kind,
        upcoming: backup.upcoming,
        shuffleBase: backup.shuffleBase,
      };
      try {
        queueSlice.replace([{ id: 'qa', title: 'A' }, { id: 'qb', title: 'B', queued: true }], 0, 'queue');
        const inserted = queueSlice.insert([{ id: 'qc', title: 'C' }], 'end');
        const removed = queueSlice.remove(2);
        const appended = queueSlice.append([{ id: 'qd', title: 'D', autoplay: true }]);
        const cleared = queueSlice.clearAdded();
        const seed = queueSlice.seed((entry) => entry.id === 'qa');
        return {
          inserted: inserted === 2,
          removed,
          appended: appended === 1,
          cleared,
          seed: Boolean(seed && seed.id === 'qa'),
          items: state.queue.items.map((entry) => entry.id),
        };
      } finally {
        backup.items = saved.items;
        backup.index = saved.index;
        backup.kind = saved.kind;
        backup.upcoming = saved.upcoming;
        backup.shuffleBase = saved.shuffleBase;
        state.queue = backup;
      }
    },
    collectionSliceTest: () => {
      const favorites = state.collection.favorites;
      const candidate = { id: 'smoke-collection', title: 'Smoke Collection' };
      const next = CMCollection.prepend(favorites, candidate);
      const without = CMCollection.without(next, candidate.id);
      const historyRows = CMCollection.recordHistory([], { id: 'smoke-history' }, 1000, 5);
      return {
        prepended: next.length === favorites.length + 1 && next[0].id === candidate.id,
        removed: Boolean(without.removed && without.removed.id === candidate.id),
        restored: without.list.length === favorites.length,
        untouched: state.collection.favorites.length === favorites.length,
        fresh: CMCollection.fresh(favorites, [{ id: 'smoke-new' }, { id: 'smoke-new' }]).length === 1,
        history: historyRows.length === 1 && historyRows[0].entry.id === 'smoke-history',
      };
    },
    volumeSliceTest: () => {
      const max = maxVolume();
      return {
        max: max === (state.settings.volumeBoost ? 1.5 : 1),
        curve: CMVolume.gain(0.5, false) === 0.25,
        mute: CMVolume.gain(0.8, true) === 0,
        unmute: CMVolume.unmuteLevel(0) === 0.5,
        clamped: CMVolume.clampLevel(5, max) === max,
        element: CMVolume.elementVolume(0.5, false) === 0.25,
      };
    },
    playbackSliceTest: () => {
      const before = {
        shuffle: state.playback.shuffle,
        repeat: state.playback.repeat,
      };
      try {
        state.playback.repeat = 'off';
        const first = CMPlayback.nextRepeat(state.playback.repeat);
        const second = CMPlayback.nextRepeat(first);
        state.playback.repeat = 'one';
        syncPlaybackButtons();
        const oneActive = $('#btn-repeat').classList.contains('active') && $('#btn-repeat').classList.contains('repeat-one');
        state.playback.shuffle = true;
        syncPlaybackButtons();
        const shuffleActive = $('#btn-shuffle').classList.contains('active');
        return {
          cycle: first === 'all' && second === 'one',
          oneActive,
          shuffleActive,
          label: CMPlayback.repeatLabel('all') === 'Alle wiederholen',
          normalized: CMPlayback.normalize({ repeat: 'quatsch' }).repeat === 'off',
          blocks: CMPlayback.blocksAutoplay('all') === true && CMPlayback.blocksAutoplay('off') === false,
        };
      } finally {
        state.playback.shuffle = before.shuffle;
        state.playback.repeat = before.repeat;
        syncPlaybackButtons();
      }
    },
    statsSliceTest: () => {
      const fixture = {};
      const at = new Date(2026, 10, 25, 21, 30, 0);
      CMStats.listen(fixture, {
        secs: 30,
        id: 'smoke-stats',
        artist: 'Smoke Artist',
        kind: 'preview',
        source: 'Deezer',
        entry: { id: 'smoke-stats', title: 'Smoke', artist: 'Smoke Artist' },
        at,
        weekKey: '2026-W48',
      });
      CMStats.play(fixture, {
        id: 'smoke-stats',
        artist: 'Smoke Artist',
        entry: { id: 'smoke-stats', title: 'Smoke', artist: 'Smoke Artist' },
        at,
        weekKey: '2026-W48',
      });
      const month = fixture.months['2026-11'] || {};
      const review = CMStats.review(fixture.months, { period: 'month', now: at });
      const real = reviewData('year');
      return {
        listened: month.secs === 30 && month.hours[21] === 30,
        played: month.plays === 1 && month.tracks['smoke-stats'].p === 1,
        artist: month.artists['Smoke Artist'].s === 30,
        week: fixture.weeks['2026-W48'].secs === 30,
        review: review.secs === 30 && review.topSource[0] === 'Deezer',
        real: Array.isArray(real.months) && real.months.length === 12 && Array.isArray(real.hours),
        total: CMStats.totalSeconds(fixture.months) === 30,
      };
    },
    shareUrl: (entry) => shareUrl(entry || {}),
    openArtist: (query) => openArtist(query || {}),
    artistPage: () => {
      const page = state.artistPage || {};
      return {
        name: page.name || '',
        error: page.error || null,
        top: page.data ? page.data.top.length : 0,
        albums: page.data ? page.data.albums.length : 0,
        related: page.data ? page.data.related.length : 0,
        view: state.view,
      };
    },
    setBackground: (id) => setBackground(id),
    setFsBackground: (mode) => setFullscreenBackground(mode),
    setPerformance: (id) => setPerformance(id),
    setFsVisualizer: (on) => setFullscreenVisualizer(on),
    performanceInfo: () => {
      const profile = performanceProfile();
      const canvas = $('#fs-viz');
      return {
        id: profile.id,
        fps: profile.fps,
        pixelRatio: profile.pixelRatio,
        liveResolution: profile.liveResolution,
        detail: profile.detail,
        shadow: profile.shadow,
        fsVisualizer: fsVisualizerOn(),
        canvas: canvas ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth } : null,
        fsVizHidden: document.body.classList.contains('fs-viz-off'),
        canvasPerformance: window.CMVisualizer && window.CMVisualizer.performance ? window.CMVisualizer.performance() : null,
      };
    },
    liveBg: () => window.CMLiveBackground ? window.CMLiveBackground.state() : null,
    liveBgRenderTest: (id) => window.CMLiveBackground ? window.CMLiveBackground.renderTestFrame(id) : null,
    setBgMotion: (on) => { state.settings.bgMotion = Boolean(on); saveSettings(); syncVisualizerEngine(); applyBackground(); },
    setBgPulse: (on) => { state.settings.bgPulse = Boolean(on); saveSettings(); syncVisualizerEngine(); syncLiveBackground(); },
    setBgBatteryStop: (on) => { state.settings.bgBatteryStop = Boolean(on); saveSettings(); syncLiveBackground(); },
    reviewImageTest: (format) => reviewImageDataUrl(format || 'story'),
    equalizerTest: async () => {
      const previous = { enabled: eqState.enabled, preset: eqState.preset, gains: eqState.gains.slice() };
      const gains = [5, 4, 3, 2, 1, 0, -1, -2, -3, -4];
      eqState.enabled = true;
      eqState.gains = gains.slice();
      applyVolume();
      if (window.CMVisualizer.setEq) window.CMVisualizer.setEq(gains);
      await new Promise((resolve) => setTimeout(resolve, 140));
      const actual = window.CMVisualizer.engineState();
      eqState.enabled = previous.enabled;
      eqState.preset = previous.preset;
      eqState.gains = previous.gains;
      applyVolume();
      return { enabled: Boolean(actual), bands: actual && actual.eq ? actual.eq.length : 0, matches: Boolean(actual && actual.eq && actual.eq.length === 10 && Math.abs(actual.eq[0] - 5) < 0.2 && Math.abs(actual.eq[9] + 4) < 0.2) };
    },
    projectState: () => ({ active: activeCutProject() ? activeCutProject().name : null, projects: cutProjects.projects.length, items: activeCutProject() ? activeCutProject().clips.length : 0 }),
    projectText: (project) => projectCreditsText(project || activeCutProject()),
    reviewImageTest: (format) => reviewImageDataUrl(format || 'story'),
    setStreamSafe: (on) => setStreamSafe(on),
    creatorForYou: (filter) => creatorForYou(filter || 'mix'),
    guessMood: (entry) => guessMood(entry || {}),
    aiCheck: (text) => aiSuspect({ title: String(text || '') }),
    creatorTabs: () => creatorTabs().map((tab) => tab.id),
    playlistCount: (name) => {
      const playlist = state.collection.playlists.find((item) => item.name === name);
      return playlist ? playlist.items.length : -1;
    },
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
    silenceGuard: (sample) => silenceDecision(sample),
    // Smoke: play a URL for a moment and report whether the analyser sees
    // digital silence (a silent WAV must be flagged, music must not).
    silenceProbe: async (url, options = {}) => {
      const viz = window.CMVisualizer;
      const wasEnabled = viz.isEnabled();
      if (options.visualizerOff) viz.setEnabled(false);
      const previous = audio.src;
      audio.pause();
      audio.loop = true;
      audio.src = url;
      await audio.play().catch(() => {});
      if (options.visualizerOff) {
        // What checkSilence does on every timeupdate while a full title plays
        // (own reason: checkSilence switches 'silence' off for the probe file).
        viz.setWatching(true, 'probe');
        for (let i = 0; i < 11; i += 1) {
          viz.probeSilence();
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        viz.probeSilence();
      } else {
        await new Promise((resolve) => setTimeout(resolve, 2600));
      }
      const result = {
        playing: !audio.paused,
        time: Number(audio.currentTime.toFixed(2)),
        duration: Number.isFinite(audio.duration) ? Number(audio.duration.toFixed(2)) : null,
        readyState: audio.readyState,
        currentSrc: (audio.currentSrc || '').slice(0, 24),
        signal: window.CMVisualizer.signal(),
        silentFor: Math.round(window.CMVisualizer.silentFor()),
      };
      audio.pause();
      audio.loop = false;
      if (previous) audio.src = previous;
      if (options.visualizerOff) {
        viz.setWatching(false, 'probe');
        viz.setEnabled(wasEnabled);
      }
      return result;
    },
    silentRefs: () => Array.from(silentRefs),
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
