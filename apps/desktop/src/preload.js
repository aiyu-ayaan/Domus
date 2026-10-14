const { contextBridge, ipcRenderer } = require('electron')

// The UI is loaded from the Domus server itself, so API calls stay same-origin.
// Typed on the web side as `DesktopBridge` (apps/web/src/lib/api.ts).
contextBridge.exposeInMainWorld('domus', {
  platform: process.platform,
  isDesktop: true,
  flavor: ipcRenderer.sendSync('flavor:get'),
  hour12: ipcRenderer.sendSync('clock:hour12'),
  // This app's language, the one picked in Settings and its setter, so the page matches this app (apps/web/src/lib/i18n.ts).
  language: ipcRenderer.sendSync('i18n:language'),
  languageChoice: ipcRenderer.sendSync('i18n:choice'),
  setLanguage: (tag) => ipcRenderer.send('i18n:set', tag),
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
  // The tray (main.js): on or off, the page's summary for its menu, and a purifier switched from the menu.
  tray: {
    enabled: () => ipcRenderer.sendSync('tray:get'),
    hasHost: () => ipcRenderer.sendSync('tray:host'),
    setEnabled: (on) => ipcRenderer.send('tray:set', on),
    update: (state) => ipcRenderer.send('tray:update', state),
    show: () => ipcRenderer.send('tray:show'),
    // GNOME Quick Settings (main.js): whether it is GNOME, the extension is installed, and it is connected now.
    gnome: () => ipcRenderer.sendSync('tray:gnome'),
    installGnome: () => ipcRenderer.invoke('tray:installGnome'),
    // Returns the function that stops listening.
    onToggle: (listener) => {
      const heard = (_event, id, on) => listener(id, on)
      ipcRenderer.on('tray:toggle', heard)
      return () => ipcRenderer.removeListener('tray:toggle', heard)
    },
  },
  // Connect page only.
  connect: (address) => ipcRenderer.invoke('server:connect', address),
  discover: () => ipcRenderer.invoke('server:discover'),
  cancel: () => ipcRenderer.send('server:cancel'),
  hasSavedServer: () => ipcRenderer.sendSync('server:hasSaved'),
  getTheme: () => ipcRenderer.sendSync('theme:get'),
  getMessages: () => ipcRenderer.sendSync('i18n:get'),
})
