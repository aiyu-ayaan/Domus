const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, nativeTheme, safeStorage, shell, session, desktopCapturer } = require('electron')
const { execFileSync } = require('child_process')
const dgram = require('dgram')
const fs = require('fs')
const http = require('http')
const net = require('net')
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

// One window per flavor (the lock follows userData): opening the app again, say while it sits in the tray, shows that window.
if (!app.requestSingleInstanceLock()) app.exit(0)
app.on('second-instance', () => showWindow())

/** servers: origins to try in order. pins: origin -> approved self-signed certificate (SHA-256, AA:BB:..). */
let config = { servers: [], pins: {}, token: null }
let win = null

const configFile = () => path.join(app.getPath('userData'), isDev ? 'domus-dev.json' : 'domus.json')
const save = () => fs.writeFileSync(configFile(), JSON.stringify(config), { mode: 0o600 })

/** The picked language first, then the system's own list: app.getLocale() only names languages Chromium itself is translated into. */
const applyLanguage = () => setLanguage(config.language, app.getPreferredSystemLanguages(), app.getLocale())

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
// The language picked in Settings; '' follows the system. The page reloads itself afterwards.
ipcMain.on('i18n:choice', (event) => {
  event.returnValue = (trusted(event) && config.language) || ''
})
ipcMain.on('i18n:set', (event, tag) => {
  if (!trusted(event) || typeof tag !== 'string') return
  config.language = tag
  save()
  applyLanguage()
  renderTray()
})

// --- Tray: the Windows notification area, the macOS menu bar, the Linux top bar or panel ---
// Linux shows it through StatusNotifierItem (KDE, Cinnamon, XFCE, MATE, Budgie; GNOME with the AppIndicator
// extension, which Ubuntu ships). The page keeps the menu current while the window is hidden, so closing the
// window only hides it when the tray is on.
let tray = null
/** What the page last sent: { heading, title, summary, devices: [{ id, label, on, enabled }] }, or null when signed out. */
let trayState = null
let quitting = false
app.on('before-quit', () => (quitting = true))
// Closing the socket server removes its file, so the GNOME extension doesn't knock on a dead socket.
app.on('will-quit', () => setGnomeBridge(false))

const text = (v) => String(v ?? '').slice(0, 120)

function renderTray() {
  publishToGnome()
  if (!tray) return
  const s = trayState
  const items = []
  if (s?.summary) items.push({ label: s.summary, enabled: false })
  for (const d of s?.devices ?? []) {
    items.push({ label: d.label, type: 'checkbox', checked: d.on, enabled: d.enabled, click: () => win?.webContents.send('tray:toggle', d.id, !d.on) })
  }
  if (s && !s.devices.length) items.push({ label: t('tray.noPurifiers'), enabled: false })
  if (items.length) items.push({ type: 'separator' })
  items.push({ label: t('tray.open'), click: showWindow }, { label: t('tray.quit'), click: () => app.quit() })
  tray.setContextMenu(Menu.buildFromTemplate(items))
  tray.setToolTip(s?.summary || app.getName())
  // Text beside the icon: macOS only. Electron publishes no label on Linux (checked on its StatusNotifierItem).
  if (process.platform === 'darwin') tray.setTitle(s?.title ?? '')
}

function setTray(on) {
  if (on && !tray) {
    const size = process.platform === 'linux' ? 22 : process.platform === 'darwin' ? 18 : 16
    tray = new Tray(nativeImage.createFromPath(appIcon()).resize({ width: size, height: size }))
    // Windows opens the menu on a right click, so a left click opens the app. macOS and Linux open the menu on any click.
    tray.on('click', () => process.platform === 'win32' && showWindow())
    renderTray()
  } else if (!on && tray) {
    tray.destroy()
    tray = null
  }
  setGnomeBridge(on)
}

// --- GNOME Quick Settings ---
// Plain GNOME has no tray, so a small Shell extension (src/gnome-extension, installed from Settings) puts a tile
// in Quick Settings instead. It reads the tray state as JSON lines from this socket and writes back
// {toggle, on} or {open}. The socket sits in the user's own runtime directory (mode 0700), so only this user
// reaches it.
const GNOME_UUID = 'domus@aiyu.dev'
const GNOME_FILES = ['metadata.json', 'extension.js']
const gnomeSocket = path.join(process.env.XDG_RUNTIME_DIR || os.tmpdir(), isDev ? 'domus-dev' : 'domus', 'tray.sock')
const gnomeDir = () => path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'gnome-shell', 'extensions', GNOME_UUID)
const isGnome = () => process.platform === 'linux' && /gnome/i.test(process.env.XDG_CURRENT_DESKTOP || '')
let gnomeServer = null
const gnomeClients = new Set()

function enabledExtensions() {
  const list = execFileSync('gsettings', ['get', 'org.gnome.shell', 'enabled-extensions'], { timeout: 2000 }).toString().trim()
  // "@as []" when empty, else "['a', 'b']". Anything else is refused: writing back a misread list would turn off
  // every other extension the person has.
  if (list === '@as []') return []
  const names = [...list.matchAll(/'([^']*)'/g)].map((m) => m[1])
  if (!/^\[.*\]$/.test(list) || names.length === 0) throw new Error(`unexpected enabled-extensions: ${list.slice(0, 80)}`)
  return names
}

function gnomeStatus() {
  let enabled = false
  try {
    enabled = enabledExtensions().includes(GNOME_UUID)
  } catch {
    /* no gsettings */
  }
  return { gnome: isGnome(), installed: enabled && fs.existsSync(path.join(gnomeDir(), 'extension.js')), connected: gnomeClients.size > 0 }
}

/** Copies the extension in (also to update it after an app update) and lists it as enabled; GNOME loads it at the next login. */
function installGnome(enable) {
  const dir = gnomeDir()
  fs.mkdirSync(dir, { recursive: true })
  for (const f of GNOME_FILES) {
    // Read through Electron's fs, which also reads inside the packaged app.asar.
    const bundled = fs.readFileSync(path.join(__dirname, 'gnome-extension', f))
    const target = path.join(dir, f)
    if (!fs.existsSync(target) || !bundled.equals(fs.readFileSync(target))) fs.writeFileSync(target, bundled)
  }
  if (enable) {
    const names = enabledExtensions()
    if (!names.includes(GNOME_UUID)) execFileSync('gsettings', ['set', 'org.gnome.shell', 'enabled-extensions', JSON.stringify([...names, GNOME_UUID])], { timeout: 2000 })
    // A shell that already knows the extension (installed before) turns it on now; a new one waits for the next login.
    try {
      execFileSync('gnome-extensions', ['enable', GNOME_UUID], { timeout: 3000, stdio: 'ignore' })
    } catch {
      /* not loaded by the running shell yet */
    }
  }
}

function gnomePayload() {
  const s = trayState ?? { heading: '', title: '', summary: '', devices: [] }
  return `${JSON.stringify({ ...s, open: t('tray.open') })}\n`
}

function publishToGnome() {
  const line = gnomePayload()
  for (const c of gnomeClients) c.write(line)
}

function onGnomeCommand(line) {
  let cmd
  try {
    cmd = JSON.parse(line)
  } catch {
    return
  }
  if (cmd?.open === true) return showWindow()
  // Only a purifier the menu offers, and only while it may be switched.
  const device = trayState?.devices.find((d) => d.id === cmd?.toggle)
  if (device?.enabled && typeof cmd.on === 'boolean') win?.webContents.send('tray:toggle', device.id, cmd.on)
}

function setGnomeBridge(on) {
  if (process.platform !== 'linux') return
  if (on && !gnomeServer) {
    if (fs.existsSync(path.join(gnomeDir(), 'extension.js'))) {
      try {
        installGnome(false)
      } catch {
        /* keep the installed copy */
      }
    }
    fs.mkdirSync(path.dirname(gnomeSocket), { recursive: true, mode: 0o700 })
    // A socket left by a crash; the single-instance lock means no other Domus of this flavor is listening.
    fs.rmSync(gnomeSocket, { force: true })
    gnomeServer = net.createServer((socket) => {
      gnomeClients.add(socket)
      socket.setEncoding('utf8')
      socket.write(gnomePayload())
      let pending = ''
      socket.on('data', (chunk) => {
        pending += chunk
        let end
        while ((end = pending.indexOf('\n')) >= 0) {
          onGnomeCommand(pending.slice(0, end))
          pending = pending.slice(end + 1)
        }
        if (pending.length > 4096) socket.destroy()
      })
      socket.on('close', () => gnomeClients.delete(socket))
      socket.on('error', () => gnomeClients.delete(socket))
    })
    gnomeServer.on('error', (e) => console.error('GNOME Quick Settings socket:', e.message))
    gnomeServer.listen(gnomeSocket, () => fs.chmodSync(gnomeSocket, 0o600))
  } else if (!on && gnomeServer) {
    for (const c of gnomeClients) c.destroy()
    gnomeClients.clear()
    gnomeServer.close()
    gnomeServer = null
  }
}

/** Somewhere to bring a hidden window back from: a tray the desktop shows, or the GNOME Quick Settings tile. */
const canHide = () => !!tray && (trayHost() !== false || gnomeClients.size > 0 || gnomeStatus().installed)

// --- Start with the computer ---
// Windows and macOS keep login items themselves; Linux desktops read an XDG autostart entry (KDE, GNOME, XFCE,
// Cinnamon, MATE, Budgie and LXQt all do). A start at login opens in the background when there is a tray or
// tile to come back from, else with its window as usual.
const autostartFile = () => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', isDev ? 'domus-dev.desktop' : 'domus.desktop')

function autostartEnabled() {
  if (process.platform === 'linux') return fs.existsSync(autostartFile())
  return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin
}

function setAutostart(on) {
  if (process.platform !== 'linux') return app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] })
  if (!on) return fs.rmSync(autostartFile(), { force: true })
  // Desktop Entry quoting: \ " ` $ escaped inside quotes, and % doubled.
  const quote = (a) => `"${a.replace(/(["\\`$])/g, '\\$1').replace(/%/g, '%%')}"`
  // The AppImage moves to a new mount each run, so its own file is what starts; a development run needs the app path.
  const command = process.env.APPIMAGE ? [process.env.APPIMAGE] : app.isPackaged ? [process.execPath] : [process.execPath, app.getAppPath()]
  // The same flavor as this run, when it was chosen by the environment.
  if (process.env.DOMUS_FLAVOR) command.unshift('env', `DOMUS_FLAVOR=${flavor}`)
  // Carried over: where Chromium's sandbox is unavailable the app starts only with it (DEPLOYMENT.md, Linux).
  if (process.argv.includes('--no-sandbox')) command.push('--no-sandbox')
  command.push('--hidden')
  fs.mkdirSync(path.dirname(autostartFile()), { recursive: true })
  const lines = [
    '[Desktop Entry]',
    'Type=Application',
    `Name=${app.getName()}`,
    `Exec=${command.map(quote).join(' ')}`,
    `Icon=${appIcon()}`,
    'X-GNOME-Autostart-enabled=true',
    'NoDisplay=true',
  ]
  fs.writeFileSync(autostartFile(), `${lines.join('\n')}\n`)
}

/** Started by the login item or autostart entry rather than by the person. */
const startedAtLogin = () => process.argv.includes('--hidden') || (process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin)

ipcMain.on('autostart:get', (event) => {
  event.returnValue = trusted(event) ? autostartEnabled() : null
})
ipcMain.on('autostart:set', (event, on) => {
  if (!trusted(event)) return
  try {
    setAutostart(!!on)
  } catch (e) {
    console.error('autostart:', e.message)
  }
})

ipcMain.on('tray:gnome', (event) => {
  event.returnValue = trusted(event) ? gnomeStatus() : null
})
// '' when installed, else the reason it failed.
ipcMain.handle('tray:installGnome', (event) => {
  if (!trusted(event) || !isGnome()) return 'not GNOME'
  try {
    installGnome(true)
    return ''
  } catch (e) {
    return e.message
  }
})

ipcMain.on('tray:get', (event) => {
  event.returnValue = !!config.tray
})
/** False when Linux has nothing to show the tray in (GNOME without the AppIndicator extension); null when unknown. */
let host
function trayHost() {
  if (host !== undefined) return host
  if (process.platform !== 'linux') return (host = true)
  try {
    const args = ['call', '--session', '--dest', 'org.freedesktop.DBus', '--object-path', '/org/freedesktop/DBus', '--method', 'org.freedesktop.DBus.NameHasOwner', 'org.kde.StatusNotifierWatcher']
    host = execFileSync('gdbus', args, { timeout: 2000 }).toString().includes('true')
  } catch {
    host = null
  }
  return host
}
ipcMain.on('tray:host', (event) => {
  event.returnValue = trayHost()
})
ipcMain.on('tray:set', (event, on) => {
  if (!trusted(event)) return
  config.tray = !!on
  save()
  setTray(config.tray)
})
ipcMain.on('tray:update', (event, state) => {
  if (!trusted(event)) return
  trayState =
    state && typeof state === 'object'
      ? {
          heading: text(state.heading),
          title: text(state.title),
          summary: text(state.summary),
          devices: (Array.isArray(state.devices) ? state.devices : [])
            .slice(0, 20)
            .map((d) => ({ id: text(d?.id), label: text(d?.label), on: !!d?.on, enabled: !!d?.enabled })),
        }
      : null
  renderTray()
})
ipcMain.on('tray:show', (event) => trusted(event) && showWindow())

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

function appIcon() {
  const iconPath = isDev
    ? (app.isPackaged ? path.join(process.resourcesPath, 'icon-dev.png') : path.join(__dirname, '../build/icon-dev.png'))
    : (app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '../build/icon.png'))
  const defaultIcon = app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '../build/icon.png')
  return fs.existsSync(iconPath) ? iconPath : defaultIcon
}

function showWindow() {
  if (!app.isReady()) return
  if (!win) return createWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow() {
  const iconToUse = appIcon()

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

  // Started at login: stays in the tray or tile; the page still loads, so they stay current.
  win.once('ready-to-show', () => (startedAtLogin() && canHide() ? null : win.show()))
  win.on('closed', () => (win = null))
  // With the tray on, closing hides the window so the tray stays live; Quit in the tray menu ends the app.
  win.on('close', (event) => {
    // Without a tray or a Quick Settings tile to come back from, closing quits as before.
    if (!quitting && canHide()) {
      event.preventDefault()
      win.hide()
    }
  })

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
  try {
    config = { ...config, ...JSON.parse(fs.readFileSync(configFile(), 'utf8')) }
  } catch {
    /* first run */
  }
  applyLanguage()

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
  setTray(!!config.tray)
  app.on('activate', () => showWindow())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
