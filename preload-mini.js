'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mini', {
  onState: (listener) => {
    if (typeof listener !== 'function') return;
    ipcRenderer.on('mini-state', (_event, state) => listener(state));
  },
  command: (command, value) => ipcRenderer.send('mini-command', { command, value }),
});
