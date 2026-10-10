const { contextBridge, ipcRenderer } = require('electron')

// The UI is loaded from the Docus server itself, so API calls stay same-origin.
// Typed on the web side as `DesktopBridge` (apps/web/src/lib/api.ts).
contextBridge.exposeInMainWorld('docus', {
  platform: process.platform,
  isDesktop: true,
  flavor: ipcRenderer.sendSync('flavor:get'),
  // The session token lives in the app, not in per-origin web storage, so the
  // home and the remote address share one sign-in.
  token: {
    get: () => ipcRenderer.sendSync('token:get'),
    set: (token) => ipcRenderer.send('token:set', token),
  },
  saveLinks: (links) => ipcRenderer.send('links:save', links),
  chooseServer: () => ipcRenderer.send('server:choose'),
  setTheme: (theme) => ipcRenderer.send('theme:set', theme),
  // Connect page only.
  connect: (address) => ipcRenderer.invoke('server:connect', address),
  discover: () => ipcRenderer.invoke('server:discover'),
  cancel: () => ipcRenderer.send('server:cancel'),
  hasSavedServer: () => ipcRenderer.sendSync('server:hasSaved'),
})
