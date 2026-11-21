'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('cm', {
  isElectron: true,
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  getInfo: () => ipcRenderer.invoke('get-info'),
  clearServiceData: (id) => ipcRenderer.invoke('clear-service-data', id),
  openMusickit: () => ipcRenderer.invoke('open-musickit'),
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
  onPlayerCommand: (listener) => {
    ipcRenderer.on('player-command', (_event, command) => listener(command));
  },
  pluginSettingsSet: (id, patch) => ipcRenderer.invoke('plugin-settings-set', id, patch),
  pluginPickFolder: () => ipcRenderer.invoke('plugin-pick-folder'),
  newReleases: () => ipcRenderer.invoke('new-releases'),
  pluginCharts: (id, limit) => ipcRenderer.invoke('plugin-charts', id, limit),
  cuttingDefaultFolder: () => ipcRenderer.invoke('cutting-default-folder'),
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
  pluginSearch: (id, query) => ipcRenderer.invoke('plugin-search', id, query),
  pluginResolve: (id, refId, force) => ipcRenderer.invoke('plugin-resolve', id, refId, Boolean(force)),
  pluginMatch: (id, track) => ipcRenderer.invoke('plugin-match', id, track),
});
