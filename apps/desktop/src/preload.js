const { contextBridge, ipcRenderer } = require('electron')

// The UI is loaded from the Domus server itself, so API calls stay same-origin.
// Typed on the web side as `DesktopBridge` (apps/web/src/lib/api.ts).
contextBridge.exposeInMainWorld('domus', {
  platform: process.platform,
  isDesktop: true,
  flavor: ipcRenderer.sendSync('flavor:get'),
  hour12: ipcRenderer.sendSync('clock:hour12'),
  // The session token lives in the app, not in per-origin web storage, so the
  // home and the remote address share one sign-in.
  token: {
    get: () => ipcRenderer.sendSync('token:get'),
    set: (token) => ipcRenderer.send('token:set', token),
  },
  saveLinks: (links) => ipcRenderer.send('links:save', links),
  chooseServer: () => ipcRenderer.send('server:choose'),
  setTheme: (theme) => ipcRenderer.send('theme:set', theme),
  // This app's own releases (main.js, updates.js).
  updates: {
    info: () => ipcRenderer.invoke('update:info'),
    check: () => ipcRenderer.invoke('update:check'),
    install: () => ipcRenderer.invoke('update:install'),
    setChannel: (channel) => ipcRenderer.invoke('update:setChannel', channel),
    skip: () => ipcRenderer.invoke('update:skip'),
    // Download progress, 0..1, then null. Returns the function that stops listening.
    onProgress: (listener) => {
      const heard = (_event, fraction) => listener(fraction)
      ipcRenderer.on('update:progress', heard)
      return () => ipcRenderer.removeListener('update:progress', heard)
    },
  },
  // Connect page only.
  connect: (address) => ipcRenderer.invoke('server:connect', address),
  discover: () => ipcRenderer.invoke('server:discover'),
  cancel: () => ipcRenderer.send('server:cancel'),
  hasSavedServer: () => ipcRenderer.sendSync('server:hasSaved'),
  getTheme: () => ipcRenderer.sendSync('theme:get'),
})
