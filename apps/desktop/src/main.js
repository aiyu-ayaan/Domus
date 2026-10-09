const { app, BrowserWindow, shell } = require('electron')
const path = require('path')

// Where the Docus server lives. In development the Vite dev server proxies the
// API; in production point this at your home server, e.g.
//   DOCUS_URL=https://homeserver.local:8443 pnpm dev:desktop
const isDev = !app.isPackaged
const DOCUS_URL = process.env.DOCUS_URL || (isDev ? 'http://localhost:3000' : 'https://localhost:8443')
const docusOrigin = new URL(DOCUS_URL).origin

// The server ships a self-signed certificate. Trust it for the Docus origin
// only — every other site keeps normal certificate validation.
app.on('certificate-error', (event, _webContents, url, _error, _cert, callback) => {
  if (new URL(url).origin === docusOrigin) {
    event.preventDefault()
    callback(true)
  } else {
    callback(false)
  }
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#080c1a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  win.once('ready-to-show', () => win.show())

  // Keep the app on the Docus origin; open anything else in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== docusOrigin) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  win.loadURL(DOCUS_URL).catch(() => {
    win.loadURL(
      'data:text/html,' +
        encodeURIComponent(
          `<body style="background:#080c1a;color:#e2e8f0;font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">
            <div style="text-align:center"><h2>Cannot reach Docus</h2><p>Is the server running at ${DOCUS_URL}?</p></div></body>`,
        ),
    )
  })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
