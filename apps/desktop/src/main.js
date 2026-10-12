const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, safeStorage, shell, session, desktopCapturer } = require('electron')
const { execFileSync } = require('child_process')
const dgram = require('dgram')
const fs = require('fs')
const http = require('http')
const https = require('https')
const os = require('os')
const path = require('path')
const { Readable } = require('stream')
const { pipeline } = require('stream/promises')
const { pathToFileURL } = require('url')
const updates = require('./updates')
const { t, setLanguage, getLanguage, messages } = require('./i18n')

// The window shows the web UI served by the Domus server itself. Which server
// is chosen on the connect page (connect.html) and remembered; once signed in,
// the server tells the app its home and remote addresses and the app uses
// whichever answers, home first. See development/docs/DEPLOYMENT.md.

// Development: load this address and skip the connect page, e.g.
//   DOMUS_URL=http://localhost:3000 pnpm dev:desktop
const override = process.env.DOMUS_URL
const CONNECT = path.join(__dirname, 'connect.html')
const BEACON_PORT = 48443 // backend/src/infrastructure/beacon.rs

// App Flavors: 'dev' or 'prod'.
// In development or when explicitly requested, flavor is 'dev'.
// When packaged or when DOMUS_FLAVOR=prod, flavor is 'prod'.
const flavor = process.env.DOMUS_FLAVOR || (!app.isPackaged ? 'dev' : 'prod')
const isDev = flavor === 'dev'

// Set distinct app name and isolate userData per flavor so dev does not overwrite prod
const appData = app.getPath('appData')
const userDataName = isDev ? 'DomusDev' : 'Domus'
app.setPath('userData', path.join(appData, userDataName))
app.setName(isDev ? 'Domus Dev' : 'Domus')
if (app.setAppUserModelId) {
  app.setAppUserModelId(isDev ? 'com.aiyu.domus.dev' : 'com.aiyu.domus')
}

/** servers: origins to try in order. pins: origin -> approved self-signed certificate (SHA-256, AA:BB:..). */
let config = { servers: [], pins: {}, token: null }
let win = null

const configFile = () => path.join(app.getPath('userData'), isDev ? 'domus-dev.json' : 'domus.json')
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
ipcMain.on('theme:get', (event) => {
  event.returnValue = nativeTheme.themeSource
})

function showConnect(message = '') {
  win.loadFile(CONNECT, {
    query: {
      message,
      flavor: isDev ? 'dev' : 'prod',
      theme: nativeTheme.themeSource,
    },
  })
}

/** Opens the saved address that answers first: the home one on the home network, the remote one elsewhere. */
async function start() {
  const urls = override ? [override] : config.servers
  // All at once, so an address that is out of reach doesn't hold the window for its timeout.
  const url = await Promise.any(
    urls.map(async (u) => {
      const p = await probe(u)
      if (!(override ? p.ok : accepts(u, p))) throw new Error(u)
      return u
    }),
  ).catch(() => null)
  if (url) return win.loadURL(url).catch(() => showConnect(t('connect.cannotLoad', { url })))
  const tried = urls.map((u) => new URL(u).host).join(t('connect.hostOr'))
  showConnect(tried ? t('connect.cannotReach', { hosts: tried }) : '')
}

/** Domus servers on this network: each answers the broadcast probe with its port. */
function discover(wait = 1200) {
  return new Promise((resolve) => {
    const found = new Map()
    const socket = dgram.createSocket('udp4')
    socket.on('error', () => {})
    socket.on('message', (message, from) => {
      try {
        const reply = JSON.parse(message)
        if (reply.service === 'domus' && reply.tls === true) found.set(`https://${from.address}:${reply.port}`, String(reply.name || 'Domus'))
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
  if (!url) return t('connect.addressInvalid')
  const p = await probe(url, 6000)
  const host = new URL(url).host
  if (!p.ok) return t('connect.noAnswer', { host })
  if (!accepts(url, p)) {
    const { response } = await dialog.showMessageBox(win, {
      type: 'question',
      buttons: [t('cert.cancel'), t('cert.trust')],
      defaultId: 0,
      cancelId: 0,
      message: t('cert.title'),
      detail: t('cert.detail', { host, fingerprint: p.fingerprint }),
    })
    if (response !== 1) return ''
    config.pins[url] = p.fingerprint
  }
  // Another server has its own accounts; an address of the current one keeps the session.
  if (!config.servers.includes(url)) config = { ...config, servers: [url], token: null }
  save()
  win.loadURL(url).catch(() => showConnect(t('connect.cannotLoad', { url })))
  return ''
})

ipcMain.on('server:choose', (event) => trusted(event) && showConnect())
ipcMain.on('server:cancel', (event) => trusted(event) && start())
ipcMain.on('server:hasSaved', (event) => {
  event.returnValue = trusted(event) && (config.servers.length > 0 || !!override)
})
ipcMain.on('i18n:get', (event) => {
  event.returnValue = trusted(event) ? messages() : {}
})
ipcMain.on('i18n:language', (event) => {
  event.returnValue = trusted(event) ? getLanguage() : 'en'
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
ipcMain.on('clock:hour12', (event) => {
  try {
    if (process.platform === 'linux') {
      const out = execFileSync('gsettings', ['get', 'org.gnome.desktop.interface', 'clock-format'], {
        encoding: 'utf8',
        timeout: 500,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      if (out.includes('12h')) return void (event.returnValue = true)
      if (out.includes('24h')) return void (event.returnValue = false)
    } else if (process.platform === 'darwin') {
      const out = execFileSync('defaults', ['read', '-g', 'AppleICUForce24HourTime'], {
        encoding: 'utf8',
        timeout: 500,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()
      if (out === '1' || out === 'true') return void (event.returnValue = false)
      if (out === '0' || out === 'false') return void (event.returnValue = true)
    }
  } catch {
    /* fall back to Intl locale default */
  }
  event.returnValue = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12
})

// --- Updates: GitHub releases on a channel (alpha / beta / stable). See development/docs/RELEASE.md.
// An AppImage replaces its own file and restarts; a .deb or Windows installer is downloaded and opened.
// The page offers it at start and shows the progress (apps/web/src/components/UpdatePrompt.tsx).
let offer = null // the last check's answer; install takes it from here, never from the page
const updateChannel = () => (config.channel in updates.STAGE ? config.channel : updates.channelOf(app.getVersion()))

async function checkForUpdate() {
  // A dev build updates by rebuilding it.
  if (!app.isPackaged || isDev) return (offer = null)
  const res = await fetch(updates.RELEASES, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(t('update.githubAnswered', { status: res.status }))
  // What this install can take: its own AppImage, else the installer for the platform.
  const suffix = process.env.APPIMAGE ? '.AppImage' : process.platform === 'win32' ? '-Setup.exe' : '.deb'
  offer = updates.pick(await res.json(), app.getVersion(), updateChannel(), suffix)
  return offer
}

/** Download progress for the page and the taskbar: 0..1, null once it is over. */
function report(fraction) {
  if (!win || win.isDestroyed()) return
  win.setProgressBar(fraction ?? -1)
  win.webContents.send('update:progress', fraction)
}

let installing = false
/** Returns the reason it failed, or '' (the app restarts, or the installer was opened from Downloads). */
async function installUpdate() {
  if (!offer) return t('update.none')
  if (installing) return ''
  installing = true
  const appImage = process.env.APPIMAGE
  const target = appImage ?? path.join(app.getPath('downloads'), path.basename(new URL(offer.url).pathname))
  const part = `${target}.part`
  try {
    report(0)
    const res = await fetch(offer.url)
    if (!res.ok) throw new Error(t('update.downloadAnswered', { status: res.status }))
    // shortcut: without a Content-Length the bar stays at 0; GitHub's release assets always send one.
    const total = Number(res.headers.get('content-length')) || 0
    let done = 0
    let shown = 0
    await pipeline(
      Readable.fromWeb(res.body),
      async function* (chunks) {
        for await (const chunk of chunks) {
          done += chunk.length
          const percent = total ? Math.floor((done * 100) / total) : 0
          if (percent !== shown) report((shown = percent) / 100)
          yield chunk
        }
      },
      fs.createWriteStream(part, { mode: appImage ? 0o755 : 0o644 }),
    )
    if (appImage) {
      // An error page saved under the right name must not become the app.
      const head = Buffer.alloc(4)
      const fd = fs.openSync(part, 'r')
      fs.readSync(fd, head, 0, 4, 0)
      fs.closeSync(fd)
      if (head.toString('latin1') !== '\x7fELF') throw new Error(t('update.notAppImage'))
    }
    // A rename within one directory: a failure before it leaves the old build in place.
    fs.renameSync(part, target)
  } catch (error) {
    fs.rmSync(part, { force: true })
    return t('update.failed', { reason: error.message })
  } finally {
    installing = false
    report(null)
  }
  if (appImage) {
    app.relaunch({ execPath: target })
    app.quit()
  } else if (await shell.openPath(target)) {
    // Nothing on this computer opens the installer: show where it is.
    shell.showItemInFolder(target)
  }
  return ''
}

ipcMain.handle('update:info', (event) => (trusted(event) ? { version: app.getVersion(), channel: updateChannel(), selfInstall: !!process.env.APPIMAGE, skipped: config.skipped ?? null } : null))
ipcMain.handle('update:check', (event) => (trusted(event) ? checkForUpdate() : null))
ipcMain.handle('update:install', (event) => (trusted(event) ? installUpdate() : ''))
// "Later" on the offer at start (the web UI's UpdatePrompt) is remembered for that version.
ipcMain.handle('update:skip', (event) => {
  if (!trusted(event) || !offer) return
  config.skipped = offer.version
  save()
})
ipcMain.handle('update:setChannel', (event, channel) => {
  if (!trusted(event) || !(channel in updates.STAGE)) return
  config.channel = channel
  save()
})

function createWindow() {
  const iconPath = isDev
    ? (app.isPackaged ? path.join(process.resourcesPath, 'icon-dev.png') : path.join(__dirname, '../build/icon-dev.png'))
    : (app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '../build/icon.png'))
  const defaultIcon = app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '../build/icon.png')
  const iconToUse = fs.existsSync(iconPath) ? iconPath : defaultIcon

  win = new BrowserWindow({
    title: isDev ? 'Domus (Dev)' : 'Domus',
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
      win.setTitle(title ? `${title} (Dev)` : 'Domus (Dev)')
    })
  }

  win.once('ready-to-show', () => win.show())
  win.on('closed', () => (win = null))

  // Keep the app on the Domus server; open anything else in the browser.
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
  // The system's own list first: app.getLocale() only names languages Chromium itself is translated into.
  setLanguage(app.getPreferredSystemLanguages(), app.getLocale())
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
