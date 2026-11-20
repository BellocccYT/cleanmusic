'use strict';

const { contextBridge, ipcRenderer } = require('electron');

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
  onDiscordStatus: (listener) => {
    ipcRenderer.on('discord-status', (_event, status) => listener(status));
  },

  // Optional source plugins (user-installed files in the plugin folder).
  pluginsList: (refresh) => ipcRenderer.invoke('plugins-list', Boolean(refresh)),
  pluginSetEnabled: (id, enabled) => ipcRenderer.invoke('plugin-set-enabled', id, Boolean(enabled)),
  pluginAction: (id, actionId) => ipcRenderer.invoke('plugin-action', id, actionId),
  pluginOpenFolder: () => ipcRenderer.invoke('plugin-open-folder'),
  pluginSearch: (id, query) => ipcRenderer.invoke('plugin-search', id, query),
  pluginResolve: (id, refId, force) => ipcRenderer.invoke('plugin-resolve', id, refId, Boolean(force)),
  pluginMatch: (id, track) => ipcRenderer.invoke('plugin-match', id, track),
});
