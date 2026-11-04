// The only bridge between pages and the desktop: a few narrow, argument-checked calls.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  savePdf: (title) => ipcRenderer.invoke('pdf:save', String(title || '')),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
  composeEmail: (url) => ipcRenderer.invoke('app:compose-email', String(url || '')),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  installUpdate: (adminToken) => ipcRenderer.invoke('update:install', String(adminToken || '')),
  onUpdateProgress: (callback) => {
    const listener = (_event, percent) => callback(Number(percent));
    ipcRenderer.on('update:progress', listener);
    return () => ipcRenderer.removeListener('update:progress', listener);
  }
});
