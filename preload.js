const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getCredentials: () => ipcRenderer.invoke('get-credentials'),
  saveCredentials: (creds) => ipcRenderer.invoke('save-credentials', creds),
  deleteCredentials: () => ipcRenderer.invoke('delete-credentials'),
  validateSessionKey: (key) => ipcRenderer.invoke('validate-session-key', key),
  detectSessionKey: () => ipcRenderer.invoke('detect-session-key'),
  fetchUsageData: () => ipcRenderer.invoke('fetch-usage-data'),
  listAccounts: () => ipcRenderer.invoke('list-accounts'),
  fetchAllUsage: () => ipcRenderer.invoke('fetch-all-usage'),
  addAccount: () => ipcRenderer.invoke('add-account'),
  removeAccount: (id) => ipcRenderer.invoke('remove-account', id),
  renameAccount: (id, label) => ipcRenderer.invoke('rename-account', { id, label }),
  enrichAccountName: (id) => ipcRenderer.invoke('enrich-account-name', id),
  toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  getLaunchAtLogin: () => ipcRenderer.invoke('get-launch-at-login'),
  setLaunchAtLogin: (v) => ipcRenderer.invoke('set-launch-at-login', v),
  quitApp: () => ipcRenderer.send('quit-app'),
  getMediaInfo: () => ipcRenderer.invoke('get-media-info'),
  fetchAlbumArt: (title, artist) => ipcRenderer.invoke('fetch-album-art', title, artist)
});
