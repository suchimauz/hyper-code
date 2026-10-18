'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// This bridge is installed ONLY in the packaged, local setup window.
contextBridge.exposeInMainWorld('desktopSetup', {
  getState: () => ipcRenderer.invoke('setup:state'),
  connect: url => ipcRenderer.invoke('setup:connect', url),
  onState: callback => ipcRenderer.on('setup:state', (_event, state) => callback(state))
});
