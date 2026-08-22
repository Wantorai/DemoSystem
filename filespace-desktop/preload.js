const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('orderSpace', {
  bootstrap: () => ipcRenderer.invoke('app:bootstrap'),
  login: (payload) => ipcRenderer.invoke('auth:login', payload),
  logout: () => ipcRenderer.invoke('auth:logout'),
  chooseFolder: () => ipcRenderer.invoke('sync:choose-folder'),
  start: () => ipcRenderer.invoke('sync:start'),
  stop: () => ipcRenderer.invoke('sync:stop'),
  now: () => ipcRenderer.invoke('sync:now'),
  openFolder: () => ipcRenderer.invoke('sync:open-folder'),
  setAutoStart: (enabled) => ipcRenderer.invoke('settings:auto-start', enabled),
  checkUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onStatus: (listener) => {
    const handler = (_event, value) => listener(value);
    ipcRenderer.on('sync:status', handler);
    return () => ipcRenderer.removeListener('sync:status', handler);
  },
  onLog: (listener) => {
    const handler = (_event, value) => listener(value);
    ipcRenderer.on('sync:log', handler);
    return () => ipcRenderer.removeListener('sync:log', handler);
  },
  onUpdate: (listener) => {
    const handler = (_event, value) => listener(value);
    ipcRenderer.on('update:state', handler);
    return () => ipcRenderer.removeListener('update:state', handler);
  },
});
