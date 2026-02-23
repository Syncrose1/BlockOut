const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // OAuth - open URL in browser
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Start OAuth server
  startOAuthServer: () => ipcRenderer.invoke('start-oauth-server'),
  
  // Listen for OAuth code
  onOAuthCode: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('oauth-code', listener);
    // Return cleanup function
    return () => ipcRenderer.removeListener('oauth-code', listener);
  },
  
  // File dialogs
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // Check if running in Electron
  isElectron: true
});