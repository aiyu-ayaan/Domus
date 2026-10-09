const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('docusDesktop', {
  platform: process.platform,
  version: '0.1.0',
});
