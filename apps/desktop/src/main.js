const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, safeStorage, shell, session, desktopCapturer } = require('electron')
const dgram = require('dgram')
const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')

// The window shows the web UI served by the Docus server itself. Which server
// is chosen on the connect page (connect.html) and remembered; once signed in,
// the server tells the app its home and remote addresses and the app uses
// whichever answers, home first. See development/docs/DEPLOYMENT.md.

// Development: load this address and skip the connect page, e.g.
//   DOCUS_URL=http://localhost:3000 pnpm dev:desktop
const override = process.env.DOCUS_URL
const CONNECT = path.join(__dirname, 'connect.html')
const BEACON_PORT = 48443 // backend/src/infrastructure/beacon.rs

// App Flavors: 'dev' or 'prod'.
// In development or when explicitly requested, flavor is 'dev'.
// When packaged or when DOCUS_FLAVOR=prod, flavor is 'prod'.
const flavor = process.env.DOCUS_FLAVOR || (!app.isPackaged ? 'dev' : 'prod')
const isDev = flavor === 'dev'

// Set distinct app name and isolate userData per flavor so dev does not overwrite prod
const appData = app.getPath('appData')
const userDataName = isDev ? 'DocusDev' : 'Docus'
app.setPath('userData', path.join(appData, userDataName))
app.setName(isDev ? 'Docus Dev' : 'Docus')
if (app.setAppUserModelId) {
  app.setAppUserModelId(isDev ? 'com.aiyu.domus.dev' : 'com.aiyu.domus')
}

/** servers: origins to try in order. pins: origin -> approved self-signed certificate (SHA-256, AA:BB:..). */
let config = { servers: [], pins: {}, token: null }
let win = null

const configFile = () => path.join(app.getPath('userData'), isDev ? 'docus-dev.json' : 'docus.json')
const save = () => fs.writeFileSync(configFile(), JSON.stringify(config), { mode: 0o600 })

const origin = (url) => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}
const known = (url) => !!origin(url) && (config.servers.includes(origin(url)) || origin(url) === origin(override))
/** IPC is answered for the connect page and for pages of a chosen server only. */
const trusted = (event) => {
  const url = event.senderFrame?.url ?? ''
  return url.startsWith(pathToFileURL(CONNECT).href) || known(url)
}

/** `host:port` or a URL to an origin; null when it is not https (http is accepted for this computer only). */
function normalize(input) {
  const text = String(input ?? '').trim()
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) return url.origin
  } catch {
    /* not an address */
  }
  return null
}

/** Asks `url` for its health. `authorized` is false for a certificate no public authority vouches for. */
function probe(url, timeout = 2500) {
  return new Promise((resolve) => {
    const secure = url.startsWith('https:')
    const request = (secure ? https : http).get(`${url}/api/v1/health`, { rejectUnauthorized: false, timeout }, (res) => {
      resolve({
        ok: res.statusCode === 200,
        authorized: !secure || res.socket.authorized,
        fingerprint: secure ? res.socket.getPeerCertificate().fingerprint256 : null,
      })
      res.resume()
    })
    request.on('timeout', () => request.destroy()).on('error', () => resolve({ ok: false }))
  })
}
const accepts = (url, p) => p.ok && (p.authorized || (!!p.fingerprint && config.pins[url] === p.fingerprint))

// A self-signed server certificate is accepted only when it is one the user approved (or the server
// itself reported over a trusted connection). A verify proc, not `certificate-error`: it also covers
// the live WebSocket.
const chromiumFingerprint = (pin) => 'sha256/' + Buffer.from(pin.replace(/:/g, ''), 'hex').toString('base64')
function verifyCertificate({ hostname, certificate, verificationResult }, callback) {
  const approved =
    verificationResult !== 'net::OK' &&
    (Object.values(config.pins).some((pin) => chromiumFingerprint(pin) === certificate.fingerprint) ||
      (!!override && hostname === new URL(override).hostname))
  callback(approved ? 0 : -3) // -3: keep Chromium's own verdict
}

// No native title bar or menu: the page draws a 36px bar (index.css `html.desktop`, connect.html)
// that drags the window, and the window buttons are overlaid on its right end.
const titleBar = () =>
  nativeTheme.shouldUseDarkColors
    ? { color: '#12140E', symbolColor: '#E2E3D8', height: 35 }
    : { color: '#F9FAEF', symbolColor: '#1A1C16', height: 35 }
nativeTheme.on('updated', () => win?.setTitleBarOverlay(titleBar()))
// The theme chosen in Settings; 'system' follows the desktop.
ipcMain.on('theme:set', (event, theme) => {
  if (trusted(event) && ['system', 'light', 'dark'].includes(theme)) nativeTheme.themeSource = theme
})

function showConnect(message = '') {
  win.loadFile(CONNECT, { query: { message, flavor: isDev ? 'dev' : 'prod' } })
}

/** Opens the first saved address that answers: the home one on the home network, the remote one elsewhere. */
async function start() {
  for (const url of override ? [override] : config.servers) {
    const p = await probe(url)
    if (override ? p.ok : accepts(url, p)) {
      return win.loadURL(url).catch(() => showConnect(`Can't load ${url}.`))
    }
  }
  const tried = (override ? [override] : config.servers).map((u) => new URL(u).host).join(' or ')
  showConnect(tried ? `Can't reach ${tried}.` : '')
}

/** Docus servers on this network: each answers the broadcast probe with its port. */
function discover(wait = 1200) {
  return new Promise((resolve) => {
    const found = new Map()
    const socket = dgram.createSocket('udp4')
    socket.on('error', () => {})
    socket.on('message', (message, from) => {
      try {
        const reply = JSON.parse(message)
        if (reply.service === 'domus' && reply.tls === true) found.set(`https://${from.address}:${reply.port}`, String(reply.name || 'Docus'))
      } catch {
        /* not ours */
      }
    })
    socket.bind(() => {
      socket.setBroadcast(true)
      const broadcasts = Object.values(os.networkInterfaces())
        .flat()
        .filter((a) => a.family === 'IPv4' && !a.internal)
        .map((a) => {
          const ip = a.address.split('.').map(Number)
          const mask = a.netmask.split('.').map(Number)
          return ip.map((part, i) => part | (~mask[i] & 255)).join('.')
        })
      for (const address of new Set([...broadcasts, '255.255.255.255'])) socket.send('DOMUS_DISCOVER', BEACON_PORT, address, () => {})
    })
    setTimeout(() => {
      socket.close()
      resolve([...found].map(([url, name]) => ({ url, name })))
    }, wait)
  })
}

ipcMain.handle('server:discover', (event) => (trusted(event) ? discover() : []))

// Returns the reason it failed, or '' (connected, or the user declined the certificate).
ipcMain.handle('server:connect', async (event, address) => {
  if (!trusted(event)) return ''
  const url = normalize(address)
  if (!url) return 'Enter an address like 192.168.1.10:8443 or home.example.com. Only https is supported.'
  const p = await probe(url, 6000)
  if (!p.ok) return `No Docus server answers at ${new URL(url).host}.`
  if (!accepts(url, p)) {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: ['Cancel', 'Trust this server'],
      defaultId: 0,
      cancelId: 0,
      message: 'This server uses its own certificate',
      detail: `No public authority vouches for ${new URL(url).host}. Compare this fingerprint with the one in the server log before you trust it.\n\n${p.fingerprint}`,
    })
    if (response !== 1) return ''
    config.pins[url] = p.fingerprint
  }
  // Another server has its own accounts; an address of the current one keeps the session.
  if (!config.servers.includes(url)) config = { ...config, servers: [url], token: null }
  save()
  win.loadURL(url).catch(() => showConnect(`Can't load ${url}.`))
  return ''
})

ipcMain.on('server:choose', (event) => trusted(event) && showConnect())
ipcMain.on('server:cancel', (event) => trusted(event) && start())
ipcMain.on('server:hasSaved', (event) => {
  event.returnValue = trusted(event) && (config.servers.length > 0 || !!override)
})

// The signed-in server's addresses (GET /api/v1/server/links). Its certificate
// fingerprint arrives over a connection that is already trusted.
ipcMain.on('links:save', (event, links) => {
  if (!trusted(event) || override) return
  const local = normalize(links?.local_url)
  const remote = normalize(links?.remote_url)
  config.servers = [...new Set([local, remote, origin(event.senderFrame.url)].filter(Boolean))]
  if (local && typeof links.fingerprint === 'string') config.pins[local] = links.fingerprint
  save()
})

// One session token for every address of the server (web storage is per origin).
// Encrypted with the OS keyring when there is one.
ipcMain.on('token:get', (event) => {
  let token = null
  try {
    const stored = trusted(event) ? config.token : null
    if (stored) token = stored.sealed ? safeStorage.decryptString(Buffer.from(stored.sealed, 'base64')) : stored.plain
  } catch {
    /* keyring changed: sign in again */
  }
  event.returnValue = token ?? null
})
ipcMain.on('token:set', (event, token) => {
  if (!trusted(event)) return
  config.token = typeof token !== 'string' ? null : (safeStorage.isEncryptionAvailable() ? { sealed: safeStorage.encryptString(token).toString('base64') } : { plain: token })
  save()
})
ipcMain.on('flavor:get', (event) => {
  event.returnValue = isDev ? 'dev' : 'prod'
})

function createWindow() {
  const iconPath = isDev
    ? (app.isPackaged ? path.join(process.resourcesPath, 'icon-dev.png') : path.join(__dirname, '../build/icon-dev.png'))
    : (app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '../build/icon.png'))
  const defaultIcon = app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '../build/icon.png')
  const iconToUse = fs.existsSync(iconPath) ? iconPath : defaultIcon

  win = new BrowserWindow({
    title: isDev ? 'Docus (Dev)' : 'Docus',
    width: 1320,
    height: 860,
    minWidth: 380,
    minHeight: 600,
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBar(),
    backgroundColor: titleBar().color,
    // Installed builds get their icon from the desktop entry; this one is for the window itself.
    icon: iconToUse,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  if (isDev) {
    win.on('page-title-updated', (event, title) => {
      event.preventDefault()
      win.setTitle(title ? `${title} (Dev)` : 'Docus (Dev)')
    })
  }

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => (win = null))

  // Keep the app on the Docus server; open anything else in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (!known(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  // Left home or came back: move to the address that answers now. The session carries over.
  let checking = false
  win.on('focus', async () => {
    const current = origin(win.webContents.getURL())
    if (checking || override || !config.servers.includes(current)) return
    checking = true
    for (const url of config.servers) {
      if (accepts(url, await probe(url))) {
        if (url !== current && win) win.loadURL(url)
        break
      }
    }
    checking = false
  })

  start()
}

app.whenReady().then(() => {
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configFile(), 'utf8')) }
  } catch {
    /* first run */
  }

  Menu.setApplicationMenu(null)
  session.defaultSession.setCertificateVerifyProc(verifyCertificate)

  if (session.defaultSession && session.defaultSession.setDisplayMediaRequestHandler) {
    session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] })
        if (sources.length > 0) {
          callback({ video: sources[0] })
        } else {
          callback({})
        }
      } catch {
        callback({})
      }
    })
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
