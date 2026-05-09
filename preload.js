const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getCredentials: () => ipcRenderer.invoke('get-credentials'),
  saveCredentials: (creds) => ipcRenderer.invoke('save-credentials', creds),
  deleteCredentials: () => ipcRenderer.invoke('delete-credentials'),
  validateSessionKey: (key) => ipcRenderer.invoke('validate-session-key', key),
  detectSessionKey: () => ipcRenderer.invoke('detect-session-key'),
  fetchUsageData: () => ipcRenderer.invoke('fetch-usage-data'),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  quitApp: () => ipcRenderer.send('quit-app'),
  getMediaInfo: () => ipcRenderer.invoke('get-media-info'),
  fetchAlbumArt: (title, artist) => ipcRenderer.invoke('fetch-album-art', title, artist)
});
