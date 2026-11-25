'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('cm', {
  isElectron: true,
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getInfo: () => ipcRenderer.invoke('get-info'),
  clearServiceData: (id) => ipcRenderer.invoke('clear-service-data', id),
  openMusickit: () => ipcRenderer.invoke('open-musickit'),
  spotifyPlaylistLink: (url) => ipcRenderer.invoke('spotify-playlist-link', url),
  playlistImportFile: () => ipcRenderer.invoke('playlist-import-file'),
  playlistMatch: (tracks) => ipcRenderer.invoke('playlist-match', tracks),
  searchCatalog: (query) => ipcRenderer.invoke('search-catalog', query),
  topTracks: () => ipcRenderer.invoke('top-tracks'),
  radioStations: (options) => ipcRenderer.invoke('radio-stations', options),
  refreshPreview: (id, meta) => ipcRenderer.invoke('refresh-preview', id, meta),
  recommendations: (seeds) => ipcRenderer.invoke('recommendations', seeds),

  // Cutter mode
  creatorPlaylist: (id) => ipcRenderer.invoke('creator-playlist', id),
  creatorOpenverse: (options) => ipcRenderer.invoke('creator-openverse', options),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),

  // Optional Discord Rich Presence
  discordGet: () => ipcRenderer.invoke('discord-get'),
  discordSet: (patch) => ipcRenderer.invoke('discord-set', patch),
  discordUpdate: (track) => ipcRenderer.send('discord-update', track || null),
  setTitleBar: (colors) => ipcRenderer.send('set-titlebar', colors || null),
  playerState: (snapshot) => ipcRenderer.send('player-state', snapshot || null),
  visualizerState: (snapshot) => ipcRenderer.send('visualizer-state', snapshot || null),
  onVisualizerWatch: (listener) => {
    ipcRenderer.on('visualizer-watch', (_event, on) => listener(Boolean(on)));
  },
  onPlayerCommand: (listener) => {
    ipcRenderer.on('player-command', (_event, command) => listener(command));
  },
  playerCommandResult: (callId, result) => ipcRenderer.send('player-command-result', { callId, result }),
  pluginSettingsSet: (id, patch) => ipcRenderer.invoke('plugin-settings-set', id, patch),
  pluginPickFolder: () => ipcRenderer.invoke('plugin-pick-folder'),
  newReleases: () => ipcRenderer.invoke('new-releases'),
  backupSave: (text) => ipcRenderer.invoke('backup-save', text),
  trayGet: () => ipcRenderer.invoke('tray-get'),
  updateGet: () => ipcRenderer.invoke('update-get'),
  updateCheck: () => ipcRenderer.invoke('update-check'),
  updateDownload: () => ipcRenderer.invoke('update-download'),
  updateInstall: () => ipcRenderer.invoke('update-install'),
  updateOpen: () => ipcRenderer.invoke('update-open'),
  updateSet: (patch) => ipcRenderer.invoke('update-set', patch),
  onUpdateState: (listener) => {
    ipcRenderer.on('update-state', (_event, info) => listener(info));
  },
  traySet: (patch) => ipcRenderer.invoke('tray-set', patch),
  miniOpen: () => ipcRenderer.invoke('mini-open'),
  taskbarGet: () => ipcRenderer.invoke('taskbar-get'),
  taskbarSet: (patch) => ipcRenderer.invoke('taskbar-set', patch),
  shortcutsGet: () => ipcRenderer.invoke('shortcuts-get'),
  shortcutsSet: (patch) => ipcRenderer.invoke('shortcuts-set', patch),
  loginGet: () => ipcRenderer.invoke('login-get'),
  loginSet: (patch) => ipcRenderer.invoke('login-set', patch),
  remoteGet: () => ipcRenderer.invoke('remote-get'),
  remoteSet: (patch) => ipcRenderer.invoke('remote-set', patch),
  remoteRotate: () => ipcRenderer.invoke('remote-rotate'),
  tvPairSend: (input) => ipcRenderer.invoke('tv-pair-send', input),
  diagnosticCopy: () => ipcRenderer.invoke('diagnostic-copy'),
  diagnosticError: (message) => ipcRenderer.send('diagnostic-error', { message: String(message || '') }),
  diagnosticState: (snapshot) => ipcRenderer.send('diagnostic-state', snapshot || {}),
  backupOpen: () => ipcRenderer.invoke('backup-open'),
  // Called synchronously by renderer/core/migrations.js before a schema migration.
  migrationBackupSync: (text, meta) => ipcRenderer.sendSync('migration-backup', { text, meta }),
  backupFolderPick: () => ipcRenderer.invoke('backup-folder-pick'),
  backupAutoSave: (input) => ipcRenderer.invoke('backup-auto-save', input),
  projectCreditsSave: (input) => ipcRenderer.invoke('project-credits-save', input),
  savePng: (dataUrl) => ipcRenderer.invoke('save-png', dataUrl),
  copyPng: (dataUrl) => ipcRenderer.invoke('copy-png', dataUrl),
  liveBgPick: () => ipcRenderer.invoke('live-bg-pick'),
  liveBgGet: () => ipcRenderer.invoke('live-bg-get'),
  creditsSave: (text) => ipcRenderer.invoke('credits-save', text),
  pluginCharts: (id, limit) => ipcRenderer.invoke('plugin-charts', id, limit),
  pluginPlaylist: (id, url) => ipcRenderer.invoke('plugin-playlist', id, url),
  cuttingDefaultFolder: () => ipcRenderer.invoke('cutting-default-folder'),
  creatorDownloadsConfig: (config) => ipcRenderer.invoke('creator-downloads-config', config),
  onCreatorDownload: (listener) => {
    ipcRenderer.on('creator-download', (_event, info) => listener(info));
  },
  cuttingDownload: (item) => ipcRenderer.invoke('cutting-download', item),
  cuttingDrag: (file) => ipcRenderer.send('cutting-drag', file),
  cuttingReveal: (file) => ipcRenderer.invoke('cutting-reveal', file),
  cuttingExists: (files) => ipcRenderer.invoke('cutting-exists', files),
  cuttingOpenFolder: (folder) => ipcRenderer.invoke('cutting-open-folder', folder),
  onPluginNotify: (listener) => {
    ipcRenderer.on('plugin-notify', (_event, message) => listener(message));
  },
  onPluginsChanged: (listener) => {
    ipcRenderer.on('plugins-changed', (_event, info) => listener(info));
  },
  onDiscordStatus: (listener) => {
    ipcRenderer.on('discord-status', (_event, status) => listener(status));
  },

  // Optional source plugins (user-installed files in the plugin folder).
  pluginsList: (refresh) => ipcRenderer.invoke('plugins-list', Boolean(refresh)),
  pluginSetEnabled: (id, enabled) => ipcRenderer.invoke('plugin-set-enabled', id, Boolean(enabled)),
  pluginAction: (id, actionId) => ipcRenderer.invoke('plugin-action', id, actionId),
  pluginOpenFolder: () => ipcRenderer.invoke('plugin-open-folder'),
  pluginAddFile: () => ipcRenderer.invoke('plugin-add-file'),
  pluginImportDropped: (file) => {
    try {
      return ipcRenderer.invoke('plugin-import-dropped', webUtils.getPathForFile(file));
    } catch {
      return Promise.resolve({ error: 'Der Dateipfad konnte nicht gelesen werden.' });
    }
  },
  pluginSearch: (id, query, options) => ipcRenderer.invoke('plugin-search', id, query, options || null),
  pluginLookup: (id, url) => ipcRenderer.invoke('plugin-lookup', id, url),
  requestLink: (url) => ipcRenderer.invoke('request-link', url),
  lyricsGet: (query) => ipcRenderer.invoke('lyrics-get', query),
  artistPage: (query) => ipcRenderer.invoke('artist-page', query),
  albumTracks: (id) => ipcRenderer.invoke('album-tracks', id),
  audioBytes: (url, options) => ipcRenderer.invoke('audio-bytes', url, options || null),
  cutSave: (item) => ipcRenderer.invoke('cut-save', item),
  downloadsList: (folder) => ipcRenderer.invoke('downloads-list', folder || ''),
  onDeepLink: (listener) => {
    ipcRenderer.on('deep-link', (_event, link) => listener(link));
  },
  pluginDownload: (id, item) => ipcRenderer.invoke('plugin-download', id, item),
  pluginResolve: (id, refId, force) => ipcRenderer.invoke('plugin-resolve', id, refId, Boolean(force)),
  pluginMatch: (id, track) => ipcRenderer.invoke('plugin-match', id, track),

  // Social (Weg B): the main process holds the key and signs every request.
  socialInfo: () => ipcRenderer.invoke('social-info'),
  socialServerSet: (url) => ipcRenderer.invoke('social-server-set', String(url || '')),
  socialNameCheck: (name) => ipcRenderer.invoke('social-name-check', String(name || '')),
  socialSetup: () => ipcRenderer.invoke('social-setup'),
  socialRequest: (method, path, body) => ipcRenderer.invoke('social-request', { method, path, body: body || null }),
});
