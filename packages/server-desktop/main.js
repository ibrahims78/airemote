'use strict'
/**
 * main.js — AiRemote Server Desktop (Electron Main Process)
 * Version: v3.7.0
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog, Notification, nativeImage, session, clipboard } = require('electron')
const path  = require('path')
const fs    = require('fs')
const os    = require('os')
const http  = require('http')
const crypto = require('crypto')

const server  = require('./server.bundle')

// v3.7.0 — the desktop server terminates TLS with a self-signed certificate.
// Trust exactly that one certificate (compared by SHA-256 fingerprint) and
// nothing else; every other certificate error is still rejected.
let OWN_CERT_FP = null
function ownCertFingerprint() {
  if (OWN_CERT_FP !== null) return OWN_CERT_FP
  try {
    const certPath = server.getTlsCertPath && server.getTlsCertPath()
    if (!certPath || !fs.existsSync(certPath)) return (OWN_CERT_FP = '')
    const pem = fs.readFileSync(certPath, 'utf8')
    const der = Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64')
    const b64 = crypto.createHash('sha256').update(der).digest('base64')
    return (OWN_CERT_FP = 'sha256/' + b64)
  } catch {
    return (OWN_CERT_FP = '')
  }
}

function installCertificateTrust() {
  // v3.7.1 — certificate-error only covers page/subresource loads. WebSocket
  // handshakes go through the network service and are rejected before that
  // handler runs, which made the dashboard unable to open /screen or /ws on a
  // self-signed deployment. The session-level hook covers every request.
  try {
    session.defaultSession.setCertificateVerifyProc((request, callback) => {
      try {
        const expected = ownCertFingerprint()
        const host = String(request.hostname || '').toLowerCase()
        const isLoopback = host === '127.0.0.1' || host === 'localhost'
        const fp = request.certificate && request.certificate.fingerprint
        if (expected && isLoopback && fp === expected) { callback(0); return }
      } catch {}
      callback(-3) // fall back to Chromium's own verification
    })
  } catch (e) {
    logger.warn('main', 'setCertificateVerifyProc unavailable: ' + e.message)
  }

  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    try {
      const expected = ownCertFingerprint()
      const isLoopback = url.startsWith('https://127.0.0.1:') || url.startsWith('https://localhost:')
      if (expected && isLoopback && certificate && certificate.fingerprint === expected) {
        event.preventDefault()
        callback(true)
        return
      }
    } catch {}
    callback(false)
  })
}
const tunnel  = require('./tunnel.bundle')
const logger  = require('./logger.bundle')

// Prevent Electron's uncaught-exception dialog on shutdown (window destroyed during agent close).
process.on('uncaughtException', (e) => {
  try { logger.error('main', 'uncaughtException: ' + ((e && e.stack) || e)) } catch {}
})
const backup  = require('./backup.bundle')

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const APP_VERSION  = require('./package.json').version
const APP_NAME     = 'AiRemote Server'
const DATA_DIR     = path.join(app.getPath('appData'), 'AiRemote-Server')
const CONFIG_PATH  = path.join(DATA_DIR, 'config.json')
const DB_PATH      = path.join(DATA_DIR, 'airemote.db')
const ICON_PATH    = path.join(__dirname, 'build', 'icon.ico')

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  port:         3001,
  mode:         'lan',       // 'lan' | 'cloudflare'
  autoStart:    true,
  autoStartWin: false,
  jwtSecret:    null,        // generated on first run
  backupEnabled: false,
  backupIntervalHours: 24,
  backupDir:    path.join(DATA_DIR, 'backups'),
}

let config = { ...DEFAULT_CONFIG }

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
      config = { ...DEFAULT_CONFIG, ...raw }
    }
  } catch (e) { logger.warn('config', 'Failed to load config: ' + e.message) }

  // Generate JWT secret on first run
  if (!config.jwtSecret) {
    config.jwtSecret = crypto.randomBytes(64).toString('hex')
    saveConfig()
    logger.info('config', '🔐 JWT Secret generated automatically')
  }
}

function saveConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let mainWindow  = null
let tray        = null
let serverRunning = false
let tunnelUrl   = null
let startedAt   = null
let watchdogTimer = null
let watchdogFails = 0

// ─────────────────────────────────────────────────────────────────────────────
// Server lifecycle
// ─────────────────────────────────────────────────────────────────────────────
async function startServer() {
  if (serverRunning) return
  try {
    await server.start({
      port:      config.port,
      jwtSecret: config.jwtSecret,
      dbPath:    DB_PATH,
      logger,
      desktopCallbacks: {
        getStatus:           getServerStatus,
        stopServer:          stopServer,
        restartServer:       async () => { await stopServer(); await startServer() },
        startTunnel:         startTunnel,
        stopTunnel:          () => { tunnel.stopTunnel(logger); tunnelUrl = null; broadcastStatus() },
        getLogs:             (n) => logger.getRecent(n),
        getDesktopSettings:  () => ({
          port: config.port, mode: config.mode, autoStart: config.autoStart,
          autoStartWin: config.autoStartWin, backupEnabled: config.backupEnabled,
          backupInterval: config.backupIntervalHours, backupDir: config.backupDir, dataDir: DATA_DIR,
        }),
        setDesktopSettings:  async (data) => {
          if (data.port        !== undefined) config.port         = Number(data.port)        || 3001
          if (data.mode        !== undefined) config.mode         = data.mode
          if (data.autoStart   !== undefined) config.autoStart    = !!data.autoStart
          if (data.autoStartWin !== undefined) { config.autoStartWin = !!data.autoStartWin; setWindowsAutoStart(config.autoStartWin) }
          if (data.backupEnabled  !== undefined) config.backupEnabled       = !!data.backupEnabled
          if (data.backupInterval !== undefined) config.backupIntervalHours = Number(data.backupInterval) || 24
          if (data.backupDir      !== undefined) config.backupDir           = data.backupDir
          saveConfig()
          if (data.mode === 'cloudflare' && serverRunning && !tunnelUrl) startTunnel()
          if (data.mode === 'lan' && tunnelUrl) tunnel.stopTunnel(logger)
        },
        createBackup: async () => {
          const dest = path.join(config.backupDir, `airemote-backup-${Date.now()}.zip`)
          return backup.exportBackup(dest)
        },
      },
    })
    serverRunning = true
    startedAt     = Date.now()
    watchdogFails = 0
    broadcastStatus()
    startWatchdog()
    logger.info('main', `✅ Server started on port ${config.port}`)
    notify('AiRemote Server', `Server started on port ${config.port}`)
    updateTrayMenu()
    // Load React Dashboard in the main window once server is ready
    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        const scheme  = (server.isTls && server.isTls()) ? 'https' : 'http'
        const dashUrl = `${scheme}://127.0.0.1:${config.port}`
        mainWindow.loadURL(dashUrl).catch(() => {
          // fallback: stay on splash screen
        })
      }, 600)
    }
  } catch (e) {
    logger.error('main', 'Failed to start server: ' + e.message + (String((e && e.message) || '').includes('EADDRINUSE') ? (' (port ' + config.port + ' is busy - close other instances or change the port)') : ''))
    serverRunning = false
    broadcastStatus()
  }
}

async function stopServer() {
  stopWatchdog()
  if (!serverRunning) return
  if (config.mode === 'cloudflare') tunnel.stopTunnel(logger)
  await server.stop()
  serverRunning = false
  tunnelUrl     = null
  startedAt     = null
  broadcastStatus()
  updateTrayMenu()
  logger.info('main', '🛑 Server stopped')
}

// ─────────────────────────────────────────────────────────────────────────────
// Tunnel
// ─────────────────────────────────────────────────────────────────────────────
function startTunnel() {
  if (tunnelUrl) return
  tunnel.startTunnel(config.port, logger)
}

tunnel.emitter.on('url', (url) => {
  tunnelUrl = url
  logger.info('tunnel', `Public URL: ${url}`)
  broadcastEvent('tunnel:url', url)
  notify('Cloudflare Tunnel', `Active: ${url}`)
  updateTrayMenu()
})

tunnel.emitter.on('stopped', () => {
  tunnelUrl = null
  broadcastEvent('tunnel:stopped', null)
  updateTrayMenu()
})

tunnel.emitter.on('error', (err) => {
  logger.error('tunnel', err.message)
  broadcastEvent('tunnel:stopped', null)
})

// ─────────────────────────────────────────────────────────────────────────────
// Watchdog — polls /api/health every 10s
// ─────────────────────────────────────────────────────────────────────────────
function startWatchdog() {
  stopWatchdog()
  watchdogTimer = setInterval(async () => {
    if (!serverRunning) return
    try {
      await checkHealth()
      watchdogFails = 0
    } catch {
      watchdogFails++
      logger.warn('watchdog', `Health check failed (${watchdogFails}/3)`)
      if (watchdogFails >= 3) {
        logger.error('watchdog', 'Server unresponsive — restarting...')
        serverRunning = false
        try { await server.stop() } catch {}
        await new Promise(r => setTimeout(r, 2000))
        await startServer()
      }
    }
  }, 10000)
}

function stopWatchdog() {
  if (watchdogTimer) { clearInterval(watchdogTimer); watchdogTimer = null }
}

function checkHealth() {
  return new Promise((resolve, reject) => {
    // v3.7.0 — the server may terminate TLS; probe the matching scheme.
    const tlsOn = !!(server.isTls && server.isTls())
    const mod = tlsOn ? require('https') : http
    const url = `${tlsOn ? 'https' : 'http'}://127.0.0.1:${config.port}/api/health`
    const opts = { timeout: 5000, ...(tlsOn ? { rejectUnauthorized: false } : {}) }
    const req = mod.get(url, opts, (res) => {
      res.resume()
      if (res.statusCode === 200) resolve()
      else reject(new Error('Status ' + res.statusCode))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC helpers
// ─────────────────────────────────────────────────────────────────────────────
function broadcastStatus() {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents) return
  try { mainWindow.webContents.send('server:status', getServerStatus()) } catch {}
}

function broadcastEvent(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.webContents) return
  try { mainWindow.webContents.send(channel, payload) } catch {}
}

function getServerStatus() {
  const localIp = getLocalIp()
  return {
    running:     serverRunning,
    port:        config.port,
    localIp,
    localUrl:    serverRunning ? `http://${localIp}:${config.port}` : null,
    tunnelUrl:   tunnelUrl || null,
    mode:        config.mode,
    startedAt,
    devicesOnline: server.getStatus().devicesOnline,
    version:     APP_VERSION,
  }
}

function getLocalIp() {
  const nets = os.networkInterfaces()
  for (const n of Object.values(nets)) {
    for (const i of n) {
      if (!i.internal && i.family === 'IPv4') return i.address
    }
  }
  return '127.0.0.1'
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('server:start',   async () => { await startServer(); return getServerStatus() })
ipcMain.handle('server:stop',    async () => { await stopServer();  return getServerStatus() })
ipcMain.handle('server:status',  async () => getServerStatus())
ipcMain.handle('server:restart', async () => { await stopServer(); await startServer(); return getServerStatus() })
ipcMain.handle('desktop:status', async () => ({
  ...getServerStatus(),
  isDesktop:    true,
  tunnelRunning: tunnel.isRunning(),
  tunnelUrl:    tunnel.getUrl() || tunnelUrl,
  dataDir:      DATA_DIR,
}))

ipcMain.handle('server:openDashboard', () => {
  const url = `http://localhost:${config.port}`
  shell.openExternal(url)
})

ipcMain.handle('tunnel:start',  () => { startTunnel(); return { starting: true } })
ipcMain.handle('tunnel:stop',   () => { tunnel.stopTunnel(logger); tunnelUrl = null; broadcastStatus(); return { ok: true } })
ipcMain.handle('tunnel:status', () => ({
  running: tunnel.isRunning(),
  url:     tunnel.getUrl(),
}))

ipcMain.handle('devices:list', () => {
  try { return server.getAllDevices() } catch { return [] }
})

ipcMain.handle('logs:recent', (_e, n = 200) => logger.getRecent(n))

// v3.8.36 (R8) — clipboard bridge for the embedded dashboard. The dashboard
// runs in a plain browser too, so this is an optional accelerator: without it
// the panel falls back to an explicit "send my clipboard" button.
let clipWatchTimer = null
let clipWatchHash = ''

ipcMain.handle('clipboard:read', () => {
  try { return clipboard.readText() } catch { return '' }
})

ipcMain.handle('clipboard:write', (_e, text) => {
  try { clipboard.writeText(String(text == null ? '' : text)); return true } catch { return false }
})

ipcMain.on('clipboard:watch', (event, enabled) => {
  if (clipWatchTimer) { clearInterval(clipWatchTimer); clipWatchTimer = null }
  if (!enabled) return
  const sender = event.sender
  clipWatchHash = ''
  clipWatchTimer = setInterval(() => {
    let text = ''
    try { text = clipboard.readText() || '' } catch { return }
    if (!text) return
    const hash = crypto.createHash('sha256').update(text, 'utf8').digest('hex')
    if (hash === clipWatchHash) return
    clipWatchHash = hash
    try { if (!sender.isDestroyed()) sender.send('clipboard:change', text) } catch {}
  }, 600)
})
ipcMain.handle('logs:export', async (_e, dest) => {
  try { await logger.exportAllLogs(dest); return { ok: true, dest } }
  catch (e) { return { ok: false, error: e.message } }
})

ipcMain.handle('settings:get', () => ({
  port:           config.port,
  mode:           config.mode,
  autoStart:      config.autoStart,
  autoStartWin:   config.autoStartWin,
  backupEnabled:  config.backupEnabled,
  backupInterval: config.backupIntervalHours,
  backupDir:      config.backupDir,
  dataDir:        DATA_DIR,
}))

ipcMain.handle('settings:set', async (_e, data) => {
  const old = { ...config }
  if (data.port        !== undefined) config.port         = Number(data.port)        || 3001
  if (data.mode        !== undefined) config.mode         = data.mode
  if (data.autoStart   !== undefined) config.autoStart    = !!data.autoStart
  if (data.autoStartWin !== undefined) {
    config.autoStartWin = !!data.autoStartWin
    setWindowsAutoStart(config.autoStartWin)
  }
  if (data.backupEnabled  !== undefined) config.backupEnabled        = !!data.backupEnabled
  if (data.backupInterval !== undefined) config.backupIntervalHours  = Number(data.backupInterval) || 24
  if (data.backupDir      !== undefined) config.backupDir            = data.backupDir
  saveConfig()

  // Apply tunnel change
  if (data.mode === 'cloudflare' && serverRunning && !tunnelUrl) startTunnel()
  if (data.mode === 'lan' && tunnelUrl) tunnel.stopTunnel(logger)

  // Apply backup schedule
  backup.scheduleBackup({
    enabled:       config.backupEnabled,
    intervalHours: config.backupIntervalHours,
    destDir:       config.backupDir,
  }, logger)

  // If port changed, need restart
  if (old.port !== config.port && serverRunning) {
    await stopServer()
    await startServer()
  }

  return { ok: true }
})

ipcMain.handle('backup:export', async (_e, dest) => {
  try {
    const result = await backup.exportBackup(dest)
    logger.info('backup', `Export: ${dest} (${result.sizeMb} MB)`)
    return { ok: true, ...result }
  } catch (e) {
    logger.error('backup', e.message)
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('backup:import', async (_e, src) => {
  try {
    await stopServer()
    const result = await backup.importBackup(src, logger)
    await startServer()
    return { ok: true, ...result }
  } catch (e) {
    logger.error('backup', e.message)
    return { ok: false, error: e.message }
  }
})

ipcMain.handle('backup:schedule', (_e, cfg) => {
  backup.scheduleBackup(cfg, logger)
  return { ok: true }
})

ipcMain.handle('system:getLocalIp', () => getLocalIp())
ipcMain.handle('system:openBrowser', (_e, url) => shell.openExternal(url))
ipcMain.handle('system:openFolder', (_e, p)   => shell.openPath(p))
ipcMain.handle('system:version', () => APP_VERSION)

ipcMain.handle('system:pickFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    filters: [{ name: 'ZIP Files', extensions: ['zip'] }],
    properties: ['openFile'],
  })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('system:pickFolder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  })
  return canceled ? null : filePaths[0]
})

// ─────────────────────────────────────────────────────────────────────────────
// Windows Auto-Start (Registry)
// ─────────────────────────────────────────────────────────────────────────────
function setWindowsAutoStart(enable) {
  if (process.platform !== 'win32') return
  try {
    const { execSync } = require('child_process')
    const exePath = process.execPath.replace(/\\/g, '\\\\')
    const key     = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
    if (enable) {
      execSync(`reg add "${key}" /v "AiRemoteServer" /t REG_SZ /d "${exePath}" /f`)
    } else {
      execSync(`reg delete "${key}" /v "AiRemoteServer" /f`)
    }
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────
function notify(title, body) {
  if (!Notification.isSupported()) return
  try {
    const n = new Notification({ title, body, silent: false })
    n.show()
  } catch {}
}

// Device connect/disconnect notifications
server.events.on('device:connected', (deviceId, name) => {
  try { broadcastEvent('device:connected', { deviceId, name }) } catch {}
  try { notify('Device Connected', `${name} is now online`) } catch {}
  try { updateTrayMenu() } catch {}
})

server.events.on('device:disconnected', (deviceId) => {
  try { broadcastEvent('device:disconnected', { deviceId }) } catch {}
  try { updateTrayMenu() } catch {}
})

// ─────────────────────────────────────────────────────────────────────────────
// Tray Icon
// ─────────────────────────────────────────────────────────────────────────────
function createTray() {
  const iconFile = fs.existsSync(ICON_PATH) ? ICON_PATH : null
  const image    = iconFile ? nativeImage.createFromPath(iconFile) : nativeImage.createEmpty()
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image)
  tray.setToolTip(APP_NAME + ' v' + APP_VERSION)
  updateTrayMenu()

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.show() : mainWindow.show()
      mainWindow.focus()
    }
  })
}

function updateTrayMenu() {
  if (!tray) return
  const status = serverRunning ? `● Running on :${config.port}` : '○ Stopped'
  const menu = Menu.buildFromTemplate([
    { label: APP_NAME + ' v' + APP_VERSION, enabled: false },
    { label: status, enabled: false },
    tunnelUrl ? { label: `🌐 ${tunnelUrl}`, click: () => shell.openExternal('https://' + tunnelUrl.replace('wss://', '')) } : { label: 'Cloudflare: OFF', enabled: false },
    { type: 'separator' },
    {
      label: serverRunning ? 'Stop Server' : 'Start Server',
      click: () => serverRunning ? stopServer() : startServer(),
    },
    {
      label: tunnel.isRunning() ? 'Stop Tunnel' : 'Start Cloudflare Tunnel',
      click: () => tunnel.isRunning() ? tunnel.stopTunnel(logger) : startTunnel(),
    },
    { type: 'separator' },
    { label: 'Open Dashboard', click: () => shell.openExternal(`http://localhost:${config.port}`) },
    { label: 'Show Window', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit() } },
  ])
  tray.setContextMenu(menu)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Window
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.on('window:fullscreen', (e, on) => {
  try { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.setFullScreen(!!on) } catch {}
})
ipcMain.on('window:minimize', (e) => {
  try { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.minimize() } catch {}
})
ipcMain.on('window:close', (e) => {
  try { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close() } catch {}
})
ipcMain.on('window:maximize', (e) => {
  try {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    w.isMaximized() ? w.unmaximize() : w.maximize()
  } catch {}
})
ipcMain.handle('window:isMaximized', (e) => {
  try { const w = BrowserWindow.fromWebContents(e.sender); return !!w?.isMaximized() } catch { return false }
})

function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1000,
    height:          660,
    minWidth:        820,
    minHeight:       580,
    title:           APP_NAME,
    frame:            false,
    autoHideMenuBar:  true,
    backgroundColor: '#0d1117',
    icon:            fs.existsSync(ICON_PATH) ? ICON_PATH : undefined,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
    },
    show: false,
  })

  try { mainWindow.setMenu(null) } catch {}
  mainWindow.on('maximize', () => { try { mainWindow.webContents.send('window:maximized', true) } catch {} })
  mainWindow.on('unmaximize', () => { try { mainWindow.webContents.send('window:maximized', false) } catch {} })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  // v3.5 — standalone screen window: no File/Edit/View/Windows/Help menu,
  // native-sized like Remote Desktop Connection.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/\/view\//.test(url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1400, height: 900, minWidth: 900, minHeight: 600,
          autoHideMenuBar: true, backgroundColor: '#000000',
          show: false, fullscreenable: true,
          // v3.8.1 — the window must be BORN fullscreen. The renderer requests
          // fullscreen on mount, but the window is still hidden at that moment
          // and Windows ignores setFullScreen on a hidden window: the standalone
          // window then appeared with a title bar and borders, 37px short of the
          // screen. Creating it fullscreen fixes the OS state from the first
          // paint; the renderer IPC still toggles it afterwards (Esc / F11).
          fullscreen: true,
          webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
          },
        },
      }
    }
    return { action: 'allow' }
  })
  mainWindow.webContents.on('did-create-window', (child) => {
    try { child.setMenu(null); child.setMenuBarVisibility(false); child.setAutoHideMenuBar(true) } catch {}

    // v3.8.0 — the standalone screen window must be an edge-free fullscreen
    // surface: no white flash while loading, and Esc/F11 must work even when
    // the canvas (not the toolbar) owns the keyboard focus.
    try { child.once('ready-to-show', () => { try { child.show(); child.focus() } catch {} }) } catch {}
    try {
      child.webContents.on('before-input-event', (ev, input) => {
        if (!input || input.type !== 'keyDown') return
        try {
          if (input.key === 'Escape' && child.isFullScreen()) { child.setFullScreen(false); ev.preventDefault() }
          else if (input.key === 'F11') { child.setFullScreen(!child.isFullScreen()); ev.preventDefault() }
        } catch {}
      })
    } catch {}
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      mainWindow.hide()
      tray?.displayBalloon?.({ title: APP_NAME, content: 'Running in tray. Right-click the tray icon to quit.' })
    }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    // Push status to newly loaded renderer
    setTimeout(() => broadcastStatus(), 500)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// App Lifecycle
// ─────────────────────────────────────────────────────────────────────────────
app.on('ready', async () => {
  installCertificateTrust()
  // Init data directory
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(path.join(DATA_DIR, 'logs'),    { recursive: true })
  fs.mkdirSync(path.join(DATA_DIR, 'backups'), { recursive: true })

  // Init subsystems
  logger.init(DATA_DIR)
  backup.init(DATA_DIR)
  loadConfig()

  // Subscribe logger to forward entries to renderer in real-time
  logger.subscribe((entry) => broadcastEvent('log:entry', entry))

  logger.info('main', `🚀 AiRemote Server Desktop v${APP_VERSION} starting...`)
  logger.info('main', `📂 Data directory: ${DATA_DIR}`)

  createWindow()
  createTray()

  // Schedule auto-backup
  if (config.backupEnabled) {
    backup.scheduleBackup({
      enabled:       true,
      intervalHours: config.backupIntervalHours,
      destDir:       config.backupDir,
    }, logger)
  }

  // Auto-start server
  if (config.autoStart) {
    await startServer()
    // Start tunnel if Cloudflare mode
    if (config.mode === 'cloudflare') {
      setTimeout(() => startTunnel(), 1000)
    }
  }
})

app.on('window-all-closed', (e) => {
  // Keep running in tray (prevent default quit)
  e.preventDefault?.()
})

app.on('activate', () => {
  mainWindow?.show()
})

app.on('before-quit', async () => {
  app.isQuitting = true
  logger.info('main', '🛑 Application quitting...')
  stopWatchdog()
  tunnel.stopTunnel(logger)
  try { await server.stop() } catch {}
})

// Handle second instance
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.exit(0)
} else {
  app.on('second-instance', () => {
    if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus() }
  })
}
