const { contextBridge } = require('electron')

// The UI is loaded from the Docus server itself, so API calls stay same-origin.
contextBridge.exposeInMainWorld('docus', {
  platform: process.platform,
  isDesktop: true,
})
