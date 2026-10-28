'use strict'

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog, screen, clipboard, desktopCapturer, powerSaveBlocker } = require('electron')
const path   = require('path')
const os     = require('os')
const fs     = require('fs')
const https  = require('https')
const crypto = require('crypto')
const { exec, spawn } = require('child_process')
const WebSocket = require('ws')

// v3.3.0 — software rendering for reliable screen capture: the GPU-accelerated
// capture path returned black frames after display-mode changes on virtual GPUs
// (observed on VMware SVGA); the software path is robust and measured faster there.
try { app.disableHardwareAcceleration() } catch {}

// v3.5 — Chromium throttles an occluded/background window's screen-capture track
// to ~1 fps. Disable occlusion detection and backgrounding for the capture window.
try {
  app.commandLine.appendSwitch('disable-background-timer-throttling')
  app.commandLine.appendSwitch('disable-renderer-backgrounding')
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
} catch {}


// ─── Single Instance Lock ──────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); process.exit(0) }
app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})
try { app.setAppUserModelId('io.airemote.agent') } catch {}

// ─── Constants ────────────────────────────────────────────────────────────
const HEARTBEAT_MS   = 10_000
const RECONNECT_BASE = 2_000
const RECONNECT_MAX  = 30_000
const CONFIG_FILE    = path.join(app.getPath('userData'), 'airemote-config.json')
const LOG_MAX        = 300
const AGENT_VERSION  = '3.8.7'

// v3.7.0 — TLS policy for the relay connection.
//   AGENT_CA_CERT       path to a PEM certificate to trust (self-signed servers)
//   AGENT_PIN_SHA256    pin the server certificate (sha256 fingerprint, hex)
//   AGENT_INSECURE_TLS  1 = skip verification — lab only, off by default
function buildWsOptions(url) {
  const opts = { rejectUnauthorized: true }
  try {
    if (process.env.AGENT_CA_CERT) {
      opts.ca = require('fs').readFileSync(process.env.AGENT_CA_CERT)
    }
    if (process.env.AGENT_INSECURE_TLS === '1') {
      opts.rejectUnauthorized = false
    }
    if (process.env.AGENT_PIN_SHA256) {
      const pin = String(process.env.AGENT_PIN_SHA256).replace(/:/g, '').toLowerCase()
      opts.checkServerIdentity = (_host, cert) => {
        const fp = String((cert && cert.fingerprint256) || '').replace(/:/g, '').toLowerCase()
        return fp === pin ? undefined : new Error('server certificate pin mismatch')
      }
    }
  } catch (e) {
    addLog('error', 'TLS configuration error: ' + e.message)
  }
  if (String(url).startsWith('ws://') && process.env.AGENT_ALLOW_INSECURE_WS !== '1') {
    addLog('warn', 'اتصال غير مشفّر (ws://) — الإنتاج يتطلب wss://')
  }
  return opts
}

// ─── State ────────────────────────────────────────────────────────────────
let win            = null
let chatWin        = null
let chatToastWin   = null
let chatToastTimer = null
let chatHistory    = []
let tray           = null
let ws             = null
let agentState     = 'stopped'
let deviceId       = null
let heartbeatTimer = null
let reconnectTimer = null
let reconnectDelay = RECONNECT_BASE
let lastRegisterPayload = null
let lastReRegisterAt = 0
const grantedSessions = new Set()
let ctrlAuthAttempts = []
let currentMonitorId = 0
let lastCaptureRestartAt = 0
let sessionStart   = null
let config         = loadConfig()
let logEntries     = []
let quitting       = false
let lastStats      = null
let cachedPublicIp = ''
let boundsTimer    = null

/** @type {Map<string, import('child_process').ChildProcess>} */
const ptyProcs = new Map()

// ─── Screen Capture State ──────────────────────────────────────────────────
let capWin         = null
let screenSessions = new Map()
let screenSleepBlockerId = null   // sessionId → { fps, quality }
let psInputProc    = null
let psInputReady   = false
let capScreenW     = 1920   // updated from captured frame dimensions (used for abs coords)
let capScreenH     = 1080

// ─── FPS & Frame Tracking ─────────────────────────────────────────────────
const sessionFrameCounts  = new Map()   // sessionId → total frames sent
const sessionFrameTimes   = new Map()   // sessionId → [recent timestamps]
const SESSION_FPS_WINDOW  = 30          // rolling window for FPS calculation

function recordFrame(sessionId) {
  const now = Date.now()
  let times = sessionFrameTimes.get(sessionId) || []
  times.push(now)
  if (times.length > SESSION_FPS_WINDOW) times = times.slice(-SESSION_FPS_WINDOW)
  sessionFrameTimes.set(sessionId, times)
  const count = (sessionFrameCounts.get(sessionId) || 0) + 1
  sessionFrameCounts.set(sessionId, count)
  return count
}

function getSessionFps(sessionId) {
  const times = sessionFrameTimes.get(sessionId) || []
  if (times.length < 2) return 0
  const elapsed = (times[times.length - 1] - times[0]) / 1000
  return elapsed > 0 ? ((times.length - 1) / elapsed).toFixed(1) : 0
}

function clearSessionStats(sessionId) {
  sessionFrameCounts.delete(sessionId)
  sessionFrameTimes.delete(sessionId)
}

// ─── v3.0.0 State ─────────────────────────────────────────────────────────
let dockerAvailable  = false
/** @type {Map<string, {chunks: Map<number, Buffer>, total: number, path: string}>} */
const writeChunkBufs = new Map()  // opId → accumulator for chunked file uploads

// ─── Config ───────────────────────────────────────────────────────────────
function defaultConfig() {
  return {
    serverUrl: '', token: '', autoStart: false, startMinimized: false,
    _winBounds: null
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      // v3.2.2 — tolerate UTF-8 BOM written by external tools
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8').replace(/^\uFEFF/, '')
      return { ...defaultConfig(), ...JSON.parse(raw) }
    }
  } catch {}
  return defaultConfig()
}

function saveConfig(updates) {
  config = { ...config, ...updates }
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8') } catch {}
}

function controlAuthCapability() {
  return (config.controlAuthMode === 'password' && config.controlPasswordHash) ? 'password' : 'consent'
}
function hashControlPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(salt + ':' + String(pw)).digest('hex')
  return { salt, hash }
}
function verifyControlPassword(pw) {
  try {
    if (!config.controlPasswordSalt || !config.controlPasswordHash) return false
    const h = crypto.createHash('sha256').update(config.controlPasswordSalt + ':' + String(pw || '')).digest('hex')
    const a = Buffer.from(h, 'hex'); const b = Buffer.from(config.controlPasswordHash, 'hex')
    return a.length === b.length && crypto.timingSafeEqual(a, b)
  } catch { return false }
}

// ─── Public IP ────────────────────────────────────────────────────────────
function fetchPublicIp() {
  return new Promise(resolve => {
    const req = https.get('https://api.ipify.org?format=json', { timeout: 6000 }, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try {
          const ip = JSON.parse(data).ip || ''
          cachedPublicIp = ip
          if (win && !win.isDestroyed()) win.webContents.send('public-ip', ip)
          resolve(ip)
        } catch { resolve('') }
      })
    })
    req.on('error', () => {
      cachedPublicIp = ''
      if (win && !win.isDestroyed()) win.webContents.send('public-ip', '')
      resolve('')
    })
    req.on('timeout', () => {
      req.destroy()
      cachedPublicIp = ''
      if (win && !win.isDestroyed()) win.webContents.send('public-ip', '')
      resolve('')
    })
  })
}

// ─── Logging ──────────────────────────────────────────────────────────────
function addLog(level, msg) {
  const ts    = new Date()
  const clock = ts.toLocaleTimeString('en', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const ms    = String(ts.getMilliseconds()).padStart(3, '0')
  const entry = { t: `${clock}.${ms}`, level, msg }
  logEntries.push(entry)
  if (logEntries.length > LOG_MAX) logEntries.shift()
  if (win && !win.isDestroyed()) win.webContents.send('log', entry)
  // Mirror to console so Electron DevTools / --inspect sees everything
  if (level === 'error') console.error(`[${entry.t}] ${msg}`)
  else if (level === 'warn')  console.warn(`[${entry.t}] ${msg}`)
  else                        console.log(`[${entry.t}] ${msg}`)
}

// ─── Tray Balloon Notification ─────────────────────────────────────────────
function notify(title, body, icon = 'info') {
  if (!tray) return
  try {
    tray.displayBalloon({ title, content: body, iconType: icon, largeIcon: false, respectQuietTime: false })
  } catch { /* displayBalloon not available on all platforms */ }
}

// ─── Viewer chat toast (non-intrusive, only when the agent is in the background) ──
function closeChatToast() {
  if (chatToastTimer) { clearTimeout(chatToastTimer); chatToastTimer = null }
  if (chatToastWin && !chatToastWin.isDestroyed()) chatToastWin.close()
  chatToastWin = null
}

function showChatToast({ text, sender, ts }) {
  try {
    // Do not interrupt the operator when the main window or the chat window is focused.
    if (win && !win.isDestroyed() && win.isFocused()) return
    if (chatWin && !chatWin.isDestroyed() && chatWin.isFocused()) return
    const payload = { text: String(text || '').slice(0, 240), sender: sender === 'viewer' ? 'مشاهد' : (sender || 'مشاهد'), ts: ts || Date.now() }

    if (chatToastWin && !chatToastWin.isDestroyed()) {
      chatToastWin.webContents.send('chat-toast-update', payload)
      if (chatToastTimer) clearTimeout(chatToastTimer)
      chatToastTimer = setTimeout(closeChatToast, 6500)
      return
    }

    chatToastWin = new BrowserWindow({
      width: 360, height: 112, show: false, frame: false, transparent: true,
      resizable: false, movable: false, minimizable: false, maximizable: false,
      skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
      webPreferences: { preload: path.join(__dirname, 'chat-toast-preload.js'), contextIsolation: true, nodeIntegration: false },
    })
    chatToastWin.setAlwaysOnTop(true, 'screen-saver')
    chatToastWin.loadFile(path.join(__dirname, 'renderer', 'chat-toast.html'))
    let toastShown = false
    const showToastWindow = () => {
      if (toastShown || !chatToastWin || chatToastWin.isDestroyed()) return
      toastShown = true
      const area = screen.getPrimaryDisplay().workArea
      chatToastWin.setPosition(area.x + area.width - 376, area.y + 24)
      chatToastWin.showInactive()
    }
    chatToastWin.once('ready-to-show', showToastWindow)
    chatToastWin.webContents.once('did-finish-load', () => {
      try { chatToastWin.webContents.send('chat-toast-update', payload) } catch {}
      setTimeout(showToastWindow, 120)
    })
    chatToastWin.on('closed', () => { chatToastWin = null })
    if (win && !win.isDestroyed()) { try { win.flashFrame(true) } catch {} }
    chatToastTimer = setTimeout(closeChatToast, 6500)
  } catch (e) {
    try { notify('AiRemote — رسالة دردشة', (sender || 'viewer') + ': ' + String(text || '').slice(0, 120)) } catch {}
  }
}

// ─── Status ───────────────────────────────────────────────────────────────
function setState(state, extra) {
  agentState = state
  const uptime = sessionStart ? Math.floor((Date.now() - sessionStart) / 1000) : 0
  const payload = { state, deviceId, serverUrl: config.serverUrl, uptime, ...extra }
  if (win && !win.isDestroyed()) win.webContents.send('state', payload)
  refreshTray()
}

// ─── System Info ──────────────────────────────────────────────────────────
function getIpLocal() {
  const nets = os.networkInterfaces()
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (!iface.internal && iface.family === 'IPv4') return iface.address
    }
  }
  return '127.0.0.1'
}

function getDeviceInfo() {
  return {
    hostname:     os.hostname(),
    platform:     'windows',
    arch:         os.arch(),
    osVersion:    `${os.type()} ${os.release()}`,
    ipLocal:      getIpLocal(),
    ipPublic:     cachedPublicIp,
    agentVersion: AGENT_VERSION
  }
}

function getCpuPercent() {
  return new Promise(resolve => {
    const c1 = os.cpus()
    setTimeout(() => {
      const c2 = os.cpus()
      let idle = 0, total = 0
      for (let i = 0; i < c1.length; i++) {
        idle  += c2[i].times.idle  - c1[i].times.idle
        total += Object.values(c2[i].times).reduce((a, b) => a + b, 0)
               - Object.values(c1[i].times).reduce((a, b) => a + b, 0)
      }
      resolve(total === 0 ? 0 : Math.round((1 - idle / total) * 100))
    }, 150)
  })
}

async function getDiskPercent() {
  try {
    const out = await runCmd('powershell -NoProfile -Command "Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json"', 4000)
    const d = JSON.parse(out.trim())
    const used = d.Used || 0, free = d.Free || 1
    return { pct: Math.round(used / (used + free) * 100), usedGb: Math.round(used / 1073741824), totalGb: Math.round((used + free) / 1073741824) }
  } catch { return { pct: 0, usedGb: 0, totalGb: 0 } }
}

function runCmd(cmd, timeout = 10000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout)
    })
  })
}

// ─── Network Stats ────────────────────────────────────────────────────────
let lastNetBytes = { rx: 0, tx: 0, time: Date.now() }
let netInit = false

function readRawNetBytes() {
  return new Promise(resolve => {
    // Try netstat -e first (fast, works on English Windows)
    exec('netstat -e', { timeout: 3000 }, (err, out) => {
      if (!err && out) {
        const line = out.split('\n').find(l => /^\s*bytes\s+\d/i.test(l))
        if (line) {
          const p = line.trim().split(/\s+/)
          const rx = parseInt(p[1]) || 0
          const tx = parseInt(p[2]) || 0
          if (rx > 0 || tx > 0) return resolve({ rx, tx })
        }
      }
      // Fallback: PowerShell WMI (locale-independent)
      const ps = `$a=Get-CimInstance Win32_PerfRawData_Tcpip_NetworkInterface;$a|ForEach-Object{$_.BytesReceivedPersec,$_.BytesSentPersec}`
      exec(`powershell -NoProfile -Command "${ps}"`, { timeout: 5000 }, (err2, out2) => {
        if (!err2 && out2) {
          const nums = out2.trim().split(/\s+/).map(n => parseInt(n) || 0)
          let rx = 0, tx = 0
          for (let i = 0; i + 1 < nums.length; i += 2) { rx += nums[i]; tx += nums[i + 1] }
          if (rx > 0 || tx > 0) return resolve({ rx, tx })
        }
        resolve({ rx: 0, tx: 0 })
      })
    })
  })
}

async function computeNetKbps() {
  const now = Date.now()
  const bytes = await readRawNetBytes()
  if (!netInit) {
    netInit = true
    lastNetBytes = { rx: bytes.rx, tx: bytes.tx, time: now }
    return { downKbps: 0, upKbps: 0 }
  }
  const elapsed = (now - lastNetBytes.time) / 1000
  let downKbps = 0, upKbps = 0
  if (elapsed > 0 && bytes.rx >= lastNetBytes.rx && bytes.tx >= lastNetBytes.tx) {
    downKbps = Math.round((bytes.rx - lastNetBytes.rx) / elapsed / 1024 * 100) / 100
    upKbps   = Math.round((bytes.tx - lastNetBytes.tx) / elapsed / 1024 * 100) / 100
  }
  lastNetBytes = { rx: bytes.rx, tx: bytes.tx, time: now }
  return { downKbps: Math.max(0, downKbps), upKbps: Math.max(0, upKbps) }
}

async function getStats() {
  const cpuPercent = await getCpuPercent()
  const total = os.totalmem(), free = os.freemem()
  const ramTotalMb  = Math.round(total / 1048576)
  const ramUsedMb   = Math.round((total - free) / 1048576)
  const ramPercent  = Math.round(ramUsedMb / ramTotalMb * 100)
  const disk        = await getDiskPercent()
  const net         = await computeNetKbps()
  const stats = {
    cpuPercent, ramPercent, ramUsedMb, ramTotalMb,
    diskPercent: disk.pct, diskUsedGb: disk.usedGb, diskTotalGb: disk.totalGb,
    networkUpKbps: net.upKbps, networkDownKbps: net.downKbps,
    uptime: Math.floor(os.uptime())
  }
  lastStats = stats
  return stats
}

// ─── T005: Docker detection ────────────────────────────────────────────────
function detectDocker() {
  return new Promise(resolve => {
    exec('docker --version', { timeout: 3000, windowsHide: true }, (err) => {
      resolve(!err)
    })
  })
}

// ─── Agent WebSocket Logic ─────────────────────────────────────────────────
function startAgent() {
  if (agentState !== 'stopped') return
  if (!config.serverUrl || !config.token) {
    addLog('error', '⚠ أدخل عنوان الخادم والـ Token أولاً')
    return
  }
  reconnectDelay = RECONNECT_BASE
  sessionStart   = Date.now()
  setState('connecting')
  doConnect()
}

function stopAgent() {
  if (agentState === 'stopped') return
  clearTimers()
  for (const [, proc] of ptyProcs) { try { proc.kill() } catch {} }
  ptyProcs.clear()
  screenSessions.clear()
  destroyCaptureWindow()
  if (psInputProc) { try { psInputProc.kill() } catch {} psInputProc = null; psInputReady = false }
  if (ws) { try { ws.close() } catch {} ws = null }
  deviceId     = null
  sessionStart = null
  setState('stopped')
  addLog('info', '🛑 تم إيقاف الـ Agent')
}

function doConnect() {
  if (agentState === 'stopped') return
  const url = config.serverUrl.trim()
  addLog('info', `🔌 الاتصال بـ ${url} ...`)

  // Fetch public IP in parallel
  fetchPublicIp().catch(() => {})

  try {
    ws = new WebSocket(url, buildWsOptions(url))
  } catch (e) {
    addLog('error', `❌ فشل إنشاء الاتصال: ${e.message}`)
    scheduleReconnect()
    return
  }

  ws.on('open', async () => {
    reconnectDelay = RECONNECT_BASE
    addLog('info', `✅ [ws] اتصل بالخادم — جاري التسجيل... (v${AGENT_VERSION})`)
    notify('AiRemote — متصل', `🔗 متصل بالخادم (v${AGENT_VERSION})`)
    try {
      dockerAvailable = await detectDocker()
      if (dockerAvailable) addLog('info', '🐳 [docker] متاح على هذا الجهاز')

      const info  = getDeviceInfo()
      const stats = await getStats()
      const shell = process.platform === 'win32' ? 'powershell' : (process.env.SHELL || '/bin/bash')
      addLog('info', `📋 [register] hostname=${info.hostname} os=${info.osVersion} shell=${shell}`)
      lastRegisterPayload = {
        token:        config.token.trim(),
        info:         { ...info, agentVersion: AGENT_VERSION, elevated: isRunningElevated() },
        stats,
        tunnelLayer:  'relay',
        capabilities: {
          pty: true, shell, fs: true,
          screenControl: true, clipboard: true, multiMonitor: true,
          docker: dockerAvailable,
          controlAuth: controlAuthCapability()
        }
      }
      send({
        type: 'agent:register',
        payload: lastRegisterPayload,
        timestamp: Date.now()
      })
      startHeartbeat()
      addLog('info', `🖥️ [caps] PTY=${shell} · Screen=مفعّل · Clipboard=مفعّل · Docker=${dockerAvailable}`)
    } catch (e) {
      addLog('error', `❌ [register] خطأ في التسجيل: ${e.message}`)
    }
  })

  ws.on('message', data => {
    try { handleMsg(JSON.parse(data.toString())) } catch {}
  })

  ws.on('close', (code, reason) => {
    clearTimers()
    if (agentState !== 'stopped') {
      const why = reason?.toString() || `code=${code}`
      addLog('warn', `📴 [ws] انقطع الاتصال — ${why} — إعادة المحاولة خلال ${(reconnectDelay / 1000).toFixed(0)}ث`)
      notify('AiRemote — انقطع الاتصال', `📴 ${why}`, 'warning')
      setState('connecting')
      scheduleReconnect()
    }
  })

  ws.on('error', err => {
    addLog('error', `🔴 [ws] ${err.message}`)
  })
}

function handleMsg(msg) {
  switch (msg.type) {
    case 'server:registered': {
      deviceId = msg.payload?.deviceId
      try { if (win && !win.isDestroyed()) win.webContents.send('ai-ready') } catch {}
      setState('connected')
      addLog('info', `✅ [server] مسجل بنجاح — Device ID: ${deviceId}`)
      notify('AiRemote — تم التسجيل', `✅ Device: ${deviceId?.slice(0, 12)}...`)
      // Pre-warm the capture window so the first screen session starts instantly
      setTimeout(() => { try { createCaptureWindow() } catch {} }, 1500)
      break
    }
    case 'server:command': {
      if (msg.payload?.type === 'pty_input') {
        handlePtyData({ sessionId: msg.payload.sessionId, data: Buffer.from(String(msg.payload.data || ''), 'utf8').toString('base64') })
        break
      }
      executeCommand(msg.payload)
      break
    }
    case 'server:error': {
      {
        const errMsg = String(msg.payload?.message || '')
        const lastPayload = lastRegisterPayload
        // Self-healing: re-register when the server rejects our heartbeat
        // (this socket was replaced / no longer recognised).
        if (errMsg.includes('Heartbeat rejected') && lastPayload && Date.now() - lastReRegisterAt > 30000) {
          lastReRegisterAt = Date.now()
          addLog('warn', 'Heartbeat rejected - re-registering with server...')
          send({ type: 'agent:register', payload: lastPayload, timestamp: Date.now() })
        }
      }
      addLog('error', `❌ خطأ من الخادم: ${msg.payload?.message}`)
      break
    }
    case 'server:ping': {
      send({ type: 'agent:pong', payload: {}, timestamp: Date.now() })
      break
    }
    case 'server:pty_open':
    case 'server:pty_start':
      handlePtyOpen(msg.payload)
      break
    case 'server:pty_data':
      handlePtyData(msg.payload)
      break
    case 'server:pty_resize':
      handlePtyResize(msg.payload)
      break
    case 'server:pty_close':
    case 'server:pty_stop':
      handlePtyClose(msg.payload)
      break
    case 'server:fs_request':
      handleFsRequest(msg.payload)
      break

    // ── Screen Capture ─────────────────────────────────────────────────────
    case 'server:screen_start':
      handleScreenStart(msg.payload)
      break
    case 'server:screen_stop':
      handleScreenStop(msg.payload)
      break
    case 'server:force_keyframe':
      // v3.8.12 — السيرفر يطلب إطاراً كاملاً فورياً (مشاهد جديد التحق بجلسة قائمة)
      if (capWin && !capWin.isDestroyed()) {
        try { capWin.webContents.send('force-keyframe') } catch {}
      }
      break
    case 'server:audio_control':
      if (capWin && !capWin.isDestroyed()) {
        capWin.webContents.send('audio-control', { sessionId: msg.payload?.sessionId, enabled: !!msg.payload?.enabled })
      }
      break
    case 'server:screen_mouse':
      // Consent enforcement: input requires a granted control session.
      if (grantedSessions.has(msg.payload?.sessionId)) injectMouse(msg.payload)
      break
    case 'server:screen_key':
      if (grantedSessions.has(msg.payload?.sessionId)) injectKey(msg.payload)
      break
    case 'server:screen_clipboard_read': {
      if (!grantedSessions.has(msg.payload?.sessionId)) break
      const clipText = clipboard.readText()
      send({ type: 'agent:screen_clipboard', payload: { sessionId: msg.payload?.sessionId, text: clipText }, timestamp: Date.now() })
      break
    }
    case 'server:screen_clipboard_write':
      if (!grantedSessions.has(msg.payload?.sessionId)) break
      if (msg.payload?.text != null) clipboard.writeText(String(msg.payload.text))
      break
    case 'server:screen_get_monitors':
      if (capWin && !capWin.isDestroyed()) capWin.webContents.send('get-monitors', { sessionId: msg.payload?.sessionId })
      break
    case 'server:screen_set_monitor':
      updateCapSize(msg.payload?.monitorId)
      if (capWin && !capWin.isDestroyed()) capWin.webContents.send('set-monitor', msg.payload)
      break
    case 'server:screen_set_quality':
      if (capWin && !capWin.isDestroyed()) capWin.webContents.send('set-quality', msg.payload)
      break
    case 'server:screen_control_request': {
      const { sessionId: scSid, requestId, requesterName, password } = msg.payload || {}
      if (controlAuthCapability() === 'password') {
        const nowTs = Date.now()
        ctrlAuthAttempts = ctrlAuthAttempts.filter(t => nowTs - t < 60000)
        if (ctrlAuthAttempts.length >= 10) {
          send({ type: 'agent:screen_control_denied', payload: { sessionId: scSid, requestId, reason: 'rate_limited' }, timestamp: Date.now() })
          break
        }
        ctrlAuthAttempts.push(nowTs)
        if (verifyControlPassword(password)) {
          if (scSid) grantedSessions.add(scSid)
          send({ type: 'agent:screen_control_granted', payload: { sessionId: scSid, requestId, via: 'password' }, timestamp: Date.now() })
          addLog('info', '[control] granted via password')
        } else {
          send({ type: 'agent:screen_control_denied', payload: { sessionId: scSid, requestId, reason: 'bad_password' }, timestamp: Date.now() })
          addLog('warn', '[control] denied - wrong password')
        }
        break
      }
      // v3.2.2 - ensure window visible so the consent dialog can never be hidden (tray/minimized)
      try { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); if (!win.isVisible()) win.show() } } catch {}
      const parentWin = (win && !win.isDestroyed()) ? win : null
      dialog.showMessageBox(parentWin, {
        type:      'question',
        buttons:   ['السماح / Allow', 'رفض / Deny'],
        defaultId: 1,
        title:     'طلب التحكم / Remote Control Request',
        message:   `${requesterName || 'شخص ما'} يطلب التحكم في شاشتك`,
        detail:    'هل تسمح بالتحكم الكامل بالفأرة ولوحة المفاتيح؟\nAllow full mouse & keyboard control?'
      }).then(({ response }) => {
        const type = response === 0 ? 'agent:screen_control_granted' : 'agent:screen_control_denied'
        if (response === 0 && scSid) grantedSessions.add(scSid)
        send({ type, payload: { sessionId: scSid, requestId }, timestamp: Date.now() })
        addLog('info', response === 0 ? '✅ منحت إذن التحكم' : '❌ رفضت طلب التحكم')
      }).catch(() => {
        send({ type: 'agent:screen_control_denied', payload: { sessionId: scSid, requestId }, timestamp: Date.now() })
      })
      break
    }
    case 'server:screen_brightness': {
      const value = Math.max(0, Math.min(255, Number(msg.payload && msg.payload.value) || 0))
      const percent = Math.round((value / 255) * 100)
      try {
        const { execFile } = require('child_process')
        execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          `(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods).WmiSetBrightness(1,${percent})`],
          { windowsHide: true, timeout: 8000 },
          (err) => {
            send({ type: 'agent:screen_brightness_status', payload: { value, ok: !err }, timestamp: Date.now() })
          })
      } catch {
        send({ type: 'agent:screen_brightness_status', payload: { value, ok: false }, timestamp: Date.now() })
      }
      break
    }

    case 'server:screen_rotate':
    case 'server:screen_rotate_auto': {
      // Windows does not expose per-application display rotation to a normal
      // process. Answer explicitly so the dashboard can grey the control out.
      send({ type: 'agent:screen_rotate_result', payload: { ok: false, reason: 'rotation is not supported by the Windows desktop agent' }, timestamp: Date.now() })
      break
    }

    case 'server:screen_privacy': {
      const privEnabled = !!(msg.payload?.enable ?? msg.payload?.enabled)
      setPrivacyOverlays(privEnabled)
      if (win && !win.isDestroyed()) win.webContents.send('screen-privacy', { enabled: privEnabled })
      addLog('info', privEnabled ? '🔒 وضع الخصوصية مُفعَّل' : '🔓 وضع الخصوصية مُلغى')
      break
    }

    // ── T006: In-session text chat ──────────────────────────────────────────
    case 'server:screen_chat': {
      const { text, sender } = msg.payload || {}
      if (!text) break
      addLog('info', `💬 [chat] ${sender || 'viewer'}: ${text}`)
      showChatToast({ text, sender, ts: msg.payload?.ts })
      // Show a native notification so the operator knows a message arrived
      {
        const chatPayload = { text, sender: sender || 'viewer', ts: msg.payload?.ts || Date.now() }
      chatHistory.push(chatPayload)
      if (chatHistory.length > 300) chatHistory.shift()
        if (win && !win.isDestroyed()) win.webContents.send('screen-chat', chatPayload)
        if (!chatWin || chatWin.isDestroyed()) {
          openChatWindow({ silent: true })
          // deliver after load — avoid losing the first message that opened the window
          if (chatWin && !chatWin.isDestroyed()) {
            chatWin.webContents.once('did-finish-load', () => { try { if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('screen-chat', chatPayload) } catch {} })
          }
        } else {
          chatWin.webContents.send('screen-chat', chatPayload)
        }
      }
      break
    }

    // ── T002: Chunked file write (v3.0.0) ──────────────────────────────────
    case 'server:fs_write_chunk': {
      handleFsWriteChunk(msg.payload)
      break
    }
  }
}

// ─── File System (proxy FS) ────────────────────────────────────────────────
const fsPromises = require('fs').promises

// ── v3.8.12 / R2 — كشف التشغيل بصلاحيات مرتفعة ────────────────────────────────
// التصميم يبقى asInvoker (لا طلب رفع ذاتي). لكن كثيراً ما يشغّل المستخدم أدوات
// الوصول عن بُعد «كمسؤول»، فتنتقل الصلاحية إلى كل أمر يُنفَّذ عن بُعد. لا نمنع
// ذلك (يكسر حالات مشروعة)، بل نُبلّغ به للسيرفر واللوحة ليكون مرئياً.
function isRunningElevated () {
  // فحص ACL عبر fs.accessSync أعطى نتيجة موجبة خاطئة على عملية Medium integrity،
  // لذا نستخدم اختباراً قاطعاً: `net session` ينجح فقط بصلاحيات إدارية.
  try {
    const { execFileSync } = require('child_process')
    execFileSync('net', ['session'], { stdio: 'ignore', windowsHide: true, timeout: 3000 })
    return true
  } catch { return false }
}

function toOsPath(p) {
  if (process.platform !== 'win32') return p
  // Already a Windows drive path like "D:/path" or "D:\path" — normalise slashes
  if (/^[A-Za-z]:/.test(p)) return p.replace(/\//g, '\\')
  if (p === '/' || p === '') return null
  // /C:       → C:\
  // /C:/path  → C:\path
  const m = p.match(/^\/([A-Za-z]:)(\/.*)?$/)
  if (m) return m[1] + (m[2] ? m[2].replace(/\//g, '\\') : '\\')
  return p.replace(/\//g, '\\')
}

async function handleFsRequest(payload) {
  const { path: reqPath, newPath, content, encoding } = payload || {}
  const opId = (payload && (payload.opId || payload.requestId))
  const op = (payload && (payload.op || payload.action))
  const respond = (data) => send({
    type: 'agent:fs_response',
    payload: { requestId: opId, opId, ...data },
    timestamp: Date.now()
  })

  try {
    switch (op) {
      case 'list': {
        if (reqPath === '/' || reqPath === '') {
          if (process.platform === 'win32') {
            const checkDrive = async (letter) => {
              try {
                await Promise.race([
                  fsPromises.access(letter + ':\\'),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
                ])
                return { name: letter + ':', path: '/' + letter + ':', isDirectory: true, size: 0, modified: new Date().toISOString(), permissions: '755' }
              } catch { return null }
            }
            const drives = (await Promise.all('CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(checkDrive))).filter(Boolean)
            return respond({ data: drives })
          }
          return respond({ data: [{ name: '/', path: '/', isDirectory: true, size: 0, modified: new Date().toISOString(), permissions: '755' }] })
        }
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        const entries = await fsPromises.readdir(osp, { withFileTypes: true })
        // Convert OS path back to web path for response
        // Always add a leading "/" so paths are uniform: /D:/folder/file
        const toWebPath = (osFullPath) => {
          if (process.platform !== 'win32') return osFullPath
          const web = osFullPath.replace(/\\/g, '/')
          return web.startsWith('/') ? web : '/' + web
        }
        const settled = await Promise.allSettled(entries.map(async e => {
          const full = require('path').join(osp, e.name)
          const st = await Promise.race([
            fsPromises.lstat(full),
            new Promise((_, rej) => setTimeout(() => rej(new Error('stat timeout')), 3000))
          ])
          return {
            name: e.name,
            path: toWebPath(full),
            isDirectory: e.isDirectory() || st.isDirectory(),
            size: st.size,
            modified: st.mtime.toISOString(),
            permissions: '755'
          }
        }))
        const data = settled.map((r, i) => {
          if (r.status === 'fulfilled') return r.value
          const full = require('path').join(osp, entries[i].name)
          return { name: entries[i].name, path: toWebPath(full), isDirectory: entries[i].isDirectory(), size: 0, modified: new Date().toISOString(), permissions: '755' }
        })
        respond({ data })
        break
      }
      case 'read': {
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        const buf = await fsPromises.readFile(osp)
        respond({ data: { base64: buf.toString('base64') }, base64: buf.toString('base64'), encoding: 'base64' })
        break
      }
      case 'read_chunked': {
        // v3.5 — stream the file instead of loading it fully into memory.
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        const stream = require('fs').createReadStream(osp, { highWaterMark: 512 * 1024 })
        let seq = 0
        try {
          for await (const chunk of stream) {
            send({
              type:    'agent:fs_chunk',
              payload: { opId, seq: seq++, data: Buffer.from(chunk).toString('base64'), done: false },
              timestamp: Date.now()
            })
            await new Promise(r => setImmediate(r))
          }
          send({ type: 'agent:fs_chunk', payload: { opId, seq: seq, data: '', done: true }, timestamp: Date.now() })
        } catch (e) {
          try { stream.destroy() } catch {}
          respond({ error: e.message || 'read failed' })
        }
        return
      }
      case 'write': {
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        const writeData = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content || '')
        await fsPromises.writeFile(osp, writeData)
        respond({ data: { ok: true } })
        break
      }
      case 'delete': {
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        await fsPromises.rm(osp, { recursive: true, force: true })
        respond({ data: { ok: true } })
        break
      }
      case 'mkdir': {
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        await fsPromises.mkdir(osp, { recursive: true })
        respond({ data: { ok: true } })
        break
      }
      case 'rename': {
        const osp = toOsPath(reqPath)
        const osp2 = toOsPath(newPath)
        if (!osp || !osp2) return respond({ error: 'Invalid path' })
        await fsPromises.rename(osp, osp2)
        respond({ data: { ok: true } })
        break
      }
      case 'stat': {
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        const st = await fsPromises.stat(osp)
        respond({ data: { size: st.size, modified: st.mtime.toISOString(), isDirectory: st.isDirectory() } })
        break
      }
      default:
        respond({ error: `Unknown op: ${op}` })
    }
  } catch (e) {
    respond({ error: e.message })
  }
}

// ─── T002: Chunked file write handler (v3.0.0) ───────────────────────────
function handleFsWriteChunk(payload) {
  const { opId, path: filePath, data, seq, total, isLast } = payload || {}
  if (!opId || !filePath) return

  let accum = writeChunkBufs.get(opId)
  if (!accum) {
    accum = { chunks: new Map(), total: total || 1, path: filePath }
    writeChunkBufs.set(opId, accum)
  }
  accum.chunks.set(seq || 0, Buffer.from(data || '', 'base64'))

  if (isLast) {
    writeChunkBufs.delete(opId)
    const parts = []
    for (let i = 0; i < accum.total; i++) {
      const c = accum.chunks.get(i)
      if (c) parts.push(c)
    }
    const fileData = Buffer.concat(parts)
    const osp = toOsPath(accum.path)
    if (!osp) {
      send({ type: 'agent:fs_response', payload: { requestId: opId, opId, error: 'مسار غير صالح' }, timestamp: Date.now() })
      return
    }
    const dir = require('path').dirname(osp)
    fsPromises.mkdir(dir, { recursive: true })
      .then(() => fsPromises.writeFile(osp, fileData))
      .then(() => {
        addLog('info', `✅ رُفع الملف: ${accum.path} (${(fileData.length / 1024 / 1024).toFixed(1)} MB)`)
        send({ type: 'agent:fs_response', payload: { requestId: opId, opId, data: { ok: true, size: fileData.length } }, timestamp: Date.now() })
      })
      .catch(e => {
        addLog('error', `❌ فشل رفع الملف: ${e.message}`)
        send({ type: 'agent:fs_response', payload: { requestId: opId, opId, error: e.message }, timestamp: Date.now() })
      })
  }
}

// ─── PTY (Direct Shell) ───────────────────────────────────────────────────
// Windows software-PTY: buffer chars per session, echo locally, send lines to shell
/** @type {Map<string, {buf: string, tmpScript: string|null}>} */
const winPtyBufs = new Map()

// PowerShell wrapper: reads stdin line-by-line, shows CWD prompt, executes commands
const WIN_PS_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Continue'
function Show-Prompt { [Console]::Write("PS " + (Get-Location).Path + "> ") }
Show-Prompt
while ($true) {
  $line = [Console]::ReadLine()
  if ($null -eq $line) { break }
  $line = $line.Trim()
  if ($line -eq "exit" -or $line -eq "quit") { break }
  if ($line.Length -gt 0) {
    try { Invoke-Expression $line 2>&1 | ForEach-Object { [Console]::WriteLine([string]$_) } }
    catch { [Console]::WriteLine("Error: " + $_.Exception.Message) }
  }
  Show-Prompt
}
`.trim()

const WIN_CMD_WRAPPER = `@echo off
setlocal enabledelayedexpansion
:loop
set /p "cmd=> "
if "!cmd!"=="exit" goto end
if "!cmd!"=="quit" goto end
if not "!cmd!"=="" (
  cmd /c !cmd! 2>&1
)
goto loop
:end
`.trim()

function handlePtyOpen(payload) {
  const { sessionId, rows = 24, cols = 80, shell: hint = 'auto' } = payload
  addLog('info', `🖥️ [pty] فُتح — session=${sessionId.slice(0, 8)} shell=${hint} ${cols}×${rows}`)

  let cmd, args, tmpScript = null

  if (process.platform === 'win32') {
    const useCmdShell = (hint === 'cmd')
    if (useCmdShell) {
      tmpScript = path.join(os.tmpdir(), `airemote-pty-${sessionId}.bat`)
      fs.writeFileSync(tmpScript, WIN_CMD_WRAPPER, 'utf8')
      cmd = 'cmd.exe'
      args = ['/Q', '/C', tmpScript]
    } else {
      tmpScript = path.join(os.tmpdir(), `airemote-pty-${sessionId}.ps1`)
      fs.writeFileSync(tmpScript, WIN_PS_SCRIPT, 'utf8')
      cmd = 'powershell.exe'
      args = ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpScript]
    }
    winPtyBufs.set(sessionId, { buf: '', tmpScript })
  } else if (process.platform === 'linux') {
    cmd = '/bin/bash'
    args = []
    // Use `script` to allocate a real PTY so line discipline works
    try {
      const inner = `${process.env.SHELL || '/bin/bash'} --login`
      cmd = 'script'
      args = ['-q', '-c', inner, '/dev/null']
    } catch {}
  } else if (process.platform === 'darwin') {
    cmd = 'script'
    args = ['-q', '/dev/null', process.env.SHELL || '/bin/bash', '--login']
  } else {
    cmd = process.env.SHELL || '/bin/bash'
    args = ['--login']
  }

  try {
    const proc = spawn(cmd, args, {
      env: { ...process.env, TERM: 'xterm-256color', COLUMNS: String(cols), LINES: String(rows), COLORTERM: 'truecolor' },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: false
    })
    ptyProcs.set(sessionId, proc)
    send({ type: 'agent:pty_opened', payload: { sessionId }, timestamp: Date.now() })
    if (win && !win.isDestroyed()) win.webContents.send('pty-state', { active: true, sessionId })

    proc.stdout.on('data', data => {
      send({ type: 'agent:pty_output', payload: { sessionId, data: data.toString('base64') }, timestamp: Date.now() })
    })
    proc.stderr.on('data', data => {
      send({ type: 'agent:pty_output', payload: { sessionId, data: data.toString('base64') }, timestamp: Date.now() })
    })
    proc.on('close', () => {
      send({ type: 'agent:pty_closed', payload: { sessionId }, timestamp: Date.now() })
      ptyProcs.delete(sessionId)
      _cleanWinBuf(sessionId)
      if (win && !win.isDestroyed()) win.webContents.send('pty-state', { active: false, sessionId })
      addLog('info', `🖥️ [pty] أُغلق — session=${sessionId.slice(0, 8)}`)
    })
    proc.on('error', err => {
      send({ type: 'agent:pty_error', payload: { sessionId, message: err.message }, timestamp: Date.now() })
      ptyProcs.delete(sessionId)
      _cleanWinBuf(sessionId)
      addLog('error', `🖥️ [pty] خطأ — ${err.message}`)
    })
  } catch (e) {
    _cleanWinBuf(sessionId)
    send({ type: 'agent:pty_error', payload: { sessionId, message: `فشل تشغيل Shell: ${e.message}` }, timestamp: Date.now() })
    addLog('error', `PTY spawn failed: ${e.message}`)
  }
}

function _cleanWinBuf(sessionId) {
  const state = winPtyBufs.get(sessionId)
  if (state?.tmpScript) { try { fs.unlinkSync(state.tmpScript) } catch {} }
  winPtyBufs.delete(sessionId)
}

function _sendPtyData(sessionId, str) {
  send({ type: 'agent:pty_output', payload: { sessionId, data: Buffer.from(str).toString('base64') }, timestamp: Date.now() })
}

function handlePtyData(payload) {
  const proc = ptyProcs.get(payload.sessionId)
  if (!proc?.stdin?.writable) return

  if (process.platform === 'win32') {
    // Software PTY: echo chars locally, buffer until Enter, then send full line
    const state = winPtyBufs.get(payload.sessionId)
    if (!state) return
    // v3.2.2 — decode as UTF-8 and iterate CODE POINTS (fixes Arabic/Unicode typing)
    const raw = Buffer.from(payload.data, 'base64').toString('utf8')
    let escSkip = 0
    for (const ch of raw) {
      const code = ch.codePointAt(0)
      if (escSkip > 0) { escSkip--; continue }
      if (code === 0x1b) { escSkip = 2; continue }
      if (ch === '\r' || ch === '\n') {
        _sendPtyData(payload.sessionId, '\r\n')
        proc.stdin.write(state.buf + '\n', 'utf8')
        state.buf = ''
      } else if (code === 0x7f || code === 0x08) {
        if (state.buf.length > 0) {
          state.buf = state.buf.slice(0, -1)
          _sendPtyData(payload.sessionId, '\x08 \x08')
        }
      } else if (code === 0x03) {
        state.buf = ''
        _sendPtyData(payload.sessionId, '^C\r\n')
        proc.stdin.write('\x03', 'binary')
      } else if (code >= 0x20) {
        state.buf += ch
        _sendPtyData(payload.sessionId, ch)
      }
    }
    return
  }

  // Linux/macOS: pass through directly (script handles echo/line discipline)
  proc.stdin.write(Buffer.from(payload.data, 'base64'))
}

function handlePtyResize(payload) {
  const { sessionId, rows, cols } = payload || {}
  if (process.platform !== 'win32') {
    const proc = ptyProcs.get(sessionId)
    if (proc) { try { proc.kill('SIGWINCH') } catch {} }
  } else {
    // T003: Windows PTY resize — send VT100 resize hint back to xterm.js so the
    // viewport resizes even though the underlying shell can't be resized without
    // node-pty. The stored rows/cols will be used by the next PTY open.
    const proc = ptyProcs.get(sessionId)
    if (proc) {
      // Send resize escape sequence so xterm.js adjusts its viewport
      const hint = Buffer.from(`\x1b[8;${rows};${cols}t`).toString('base64')
      send({ type: 'agent:pty_output', payload: { sessionId, data: hint }, timestamp: Date.now() })
    }
    // Update winPtyBufs so next PTY open uses the new size
    const state = winPtyBufs.get(sessionId)
    if (state) { state.rows = rows; state.cols = cols }
  }
}

function handlePtyClose(payload) {
  const proc = ptyProcs.get(payload.sessionId)
  if (proc) {
    try { proc.kill() } catch {}
    ptyProcs.delete(payload.sessionId)
  }
  _cleanWinBuf(payload.sessionId)
}

// ─── Screen Capture (Electron desktopCapturer) ─────────────────────────────

function createCaptureWindow() {
  if (capWin && !capWin.isDestroyed()) return capWin
  capWin = new BrowserWindow({
    // v3.5 — Chromium throttles a fully hidden/occluded capture window to ~1 fps
    // on Windows. Keep it visible but parked far off-screen instead.
    show:        true,
    x:           0,
    y:           0,
    width:       2,
    height:      2,
    skipTaskbar: true,
    focusable:   false,
    opacity:     0.01,
    webPreferences: {
      nodeIntegration:      true,
      contextIsolation:     false,
      offscreen:            false,
      webSecurity:          false,
      backgroundThrottling: false   // prevent Chromium from throttling setInterval
    }
  })

  // Electron 21+: allow getUserMedia with desktop source without showing picker
  capWin.webContents.session.setDisplayMediaRequestHandler((_, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(sources => {
      callback({ video: sources[0], audio: 'loopback' })
    }).catch(() => callback({}))
  })

  capWin.loadFile(path.join(__dirname, 'renderer', 'capture.html'))
  capWin.on('closed', () => { capWin = null })
  return capWin
}

function destroyCaptureWindow() {
  if (capWin && !capWin.isDestroyed()) { try { capWin.destroy() } catch {} capWin = null }
  screenSessions.clear()
  broadcastScreenSessions()
  // v3.3.1: privacy must not outlive the stream — restore the local screen when streaming stops
  if (privacyActive) {
    privacyActive = false
    hidePrivacyOverlays()
    addLog('info', '\uD83D\uDD12 [privacy] \u0623\u064F\u0648\u0642\u0641\u062A \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B (\u0627\u0646\u062A\u0647\u0627\u0621 \u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0628\u062B)')
  }
  try { refreshTray() } catch {}
}

function broadcastScreenSessions() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('screen-sessions', { count: screenSessions.size })
  }
}

// ── Privacy overlays (v3.3.0) — blank the LOCAL screen with capture-excluded windows ──
let privacyWins = []
let privacyActive = false
function showPrivacyOverlays() {
  hidePrivacyOverlays()
  try {
    for (const dsp of screen.getAllDisplays()) {
      try {
        const w = new BrowserWindow({
          x: dsp.bounds.x, y: dsp.bounds.y, width: dsp.bounds.width, height: dsp.bounds.height,
          frame: false, resizable: false, movable: false, minimizable: false, maximizable: false,
          skipTaskbar: true, focusable: false, alwaysOnTop: true, show: false,
          backgroundColor: '#020204', hasShadow: false,
          webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
        })
        try { w.setContentProtection(true) } catch {}
        try { w.setIgnoreMouseEvents(true) } catch {}
        try { w.setAlwaysOnTop(true, 'screen-saver') } catch {}
        w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(
          '<body style="margin:0;background:#020204;height:100vh;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,Arial">' +
          '<div style="text-align:center;color:#39415a"><div style="font-size:15px;font-weight:600">AiRemote</div>' +
          '<div style="font-size:11px;margin-top:6px">Privacy mode — screen hidden by the operator</div></div></body>'
        ))
        w.once('ready-to-show', () => { try { w.showInactive() } catch { try { w.show() } catch {} } })
        w.on('closed', () => { privacyWins = privacyWins.filter(x => x !== w) })
        privacyWins.push(w)
      } catch {}
    }
  } catch {}
}
function hidePrivacyOverlays() {
  for (const w of privacyWins) { try { if (!w.isDestroyed()) w.destroy() } catch {} }
  privacyWins = []
}
function setPrivacyOverlays(enabled) {
  privacyActive = !!enabled
  if (privacyActive) showPrivacyOverlays(); else hidePrivacyOverlays()
}

function updateCapSize(monitorId) {
  try {
    const displays = screen.getAllDisplays()
    const idx = Number(monitorId || 0)
    const dsp = displays[idx] || screen.getPrimaryDisplay()
    const sf  = dsp.scaleFactor || 1
    capScreenW = Math.round(dsp.size.width  * sf)
    capScreenH = Math.round(dsp.size.height * sf)
  } catch {}
}

function handleDisplayMetricsChanged() {
  try {
    updateCapSize(currentMonitorId)
    if (privacyActive) showPrivacyOverlays()
    if (capWin && !capWin.isDestroyed()) capWin.webContents.send('display-changed', {})
  } catch {}
}
try { screen.on('display-metrics-changed', handleDisplayMetricsChanged) } catch {}
try { screen.on('display-added', handleDisplayMetricsChanged) } catch {}
try { screen.on('display-removed', handleDisplayMetricsChanged) } catch {}

function keepScreenAwakeForStream() {
  try {
    if (screenSleepBlockerId === null || !powerSaveBlocker.isStarted(screenSleepBlockerId)) {
      screenSleepBlockerId = powerSaveBlocker.start('prevent-display-sleep')
    }
  } catch {}
}

function releaseScreenAwakeForStream() {
  try {
    if (screenSleepBlockerId !== null && powerSaveBlocker.isStarted(screenSleepBlockerId)) powerSaveBlocker.stop(screenSleepBlockerId)
  } catch {}
  screenSleepBlockerId = null
}

function handleScreenStart(payload) {
  const { sessionId, fps, quality, monitorId, maxWidth } = payload
  const sid8 = sessionId.slice(0, 8)
  addLog('info', `🖥️ [screen] بدء البث — session=${sid8} fps=${fps} quality=${quality}% monitor=${monitorId ?? 0}`)
  currentMonitorId = Number(monitorId || 0)
  keepScreenAwakeForStream()
  screenSessions.set(sessionId, { fps, quality, maxWidth, startedAt: Date.now() })
  updateCapSize(currentMonitorId)
  sessionFrameCounts.delete(sessionId)
  sessionFrameTimes.delete(sessionId)
  broadcastScreenSessions()
  refreshTray()
  notify('AiRemote — بث الشاشة', `📡 بدأ البث (${fps} fps · جودة ${quality}%)`)
  const cw     = createCaptureWindow()
  const doSend = () => cw.webContents.send('start-capture', { sessionId, fps, quality, monitorIndex: monitorId || 0, maxWidth })
  if (cw.webContents.isLoading()) cw.webContents.once('did-finish-load', doSend)
  else doSend()
  if (process.platform === 'win32') ensurePsInput()
}

function handleScreenStop(payload) {
  const { sessionId } = payload
  const sid8   = sessionId.slice(0, 8)
  const info   = screenSessions.get(sessionId)
  const total  = sessionFrameCounts.get(sessionId) || 0
  const dur    = info?.startedAt ? ((Date.now() - info.startedAt) / 1000).toFixed(1) : '?'
  const avgFps = dur > 0 && total > 0 ? (total / Number(dur)).toFixed(1) : '?'
  addLog('info', `🖥️ [screen] إيقاف البث — session=${sid8} frames=${total} duration=${dur}s avgFps=${avgFps}`)
  clearSessionStats(sessionId)
  screenSessions.delete(sessionId)
  broadcastScreenSessions()
  refreshTray()
  notify('AiRemote — انتهى البث', `⏹️ انتهت الجلسة (${total} إطار · ${dur}s)`, 'none')
  if (capWin && !capWin.isDestroyed()) capWin.webContents.send('stop-capture', { sessionId })
  send({ type: 'agent:screen_closed', payload: { sessionId }, timestamp: Date.now() })
  if (screenSessions.size === 0) { releaseScreenAwakeForStream(); destroyCaptureWindow() }
}

// ─── Persistent PowerShell process for mouse/keyboard injection ────────────
const psAckQueue = []
function sendPsCmdAck(cmd, cb) {
  ensurePsInput()
  const run = () => {
    let settled = false
    const done = () => { if (settled) return; settled = true; cb() }
    psAckQueue.push(done)
    setTimeout(done, 800)
    try { psInputProc.stdin.write(cmd + ";Write-Output '~ACK~'\n") } catch { done() }
  }
  if (psInputProc && !psInputProc.killed && psInputReady) return run()
  const deadline = Date.now() + 4000
  const t = setInterval(() => {
    if (psInputReady && psInputProc && !psInputProc.killed) { clearInterval(t); run() }
    else if (Date.now() > deadline) { clearInterval(t); cb() }
  }, 40)
}

function ensurePsInput() {
  if (process.platform !== 'win32') return
  if (psInputProc && !psInputProc.killed) return
  psInputReady = false
  psInputProc  = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-NoLogo', '-Command', '-'], {
    stdio:       ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  })
  const init = `
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class WinUI{
  [DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")]public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")]public static extern void mouse_event(uint f,int x,int y,int d,IntPtr e);
  [DllImport("user32.dll")]public static extern void keybd_event(byte vk,byte sc,uint f,IntPtr e);
  [DllImport("user32.dll")]public static extern uint SendInput(uint n,INPUT[] inputs,int cb);
  [StructLayout(LayoutKind.Sequential)] public struct INPUT{ public uint type; public InputUnion U; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT{ public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion{ [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT{ public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  public const uint LD=2,LU=4,RD=8,RU=16,MD=32,MU=64,WH=2048,KU=2;
  public static void SendUnicode(int code){
    INPUT[] a=new INPUT[2];
    a[0].type=1; a[0].U.ki.wScan=(ushort)code; a[0].U.ki.dwFlags=4;
    a[1].type=1; a[1].U.ki.wScan=(ushort)code; a[1].U.ki.dwFlags=6;
    SendInput(2,a,Marshal.SizeOf(typeof(INPUT)));
  }
}
'@ -Language CSharp
Add-Type -AssemblyName System.Windows.Forms
try{[void][WinUI]::SetProcessDPIAware()}catch{}
Write-Host 'PSINPUT_READY'
`
  psInputProc.stdin.write(init + '\n')
  psInputProc.stdout.on('data', d => {
    const str = d.toString()
    if (str.includes('PSINPUT_READY')) psInputReady = true
    const ackCount = (str.match(/~ACK~/g) || []).length
    for (let i = 0; i < ackCount; i++) {
      const cb = psAckQueue.shift()
      if (cb) { try { cb() } catch {} }
    }
  })
  psInputProc.stderr.on('data', () => {})
  psInputProc.on('exit', () => { psInputProc = null; psInputReady = false })
}

function sendPsCmd(cmd) {
  if (process.platform !== 'win32') return
  ensurePsInput()
  if (psInputProc && !psInputProc.killed && psInputReady) {
    try { psInputProc.stdin.write(cmd + '\n') } catch {}
    return
  }
  const deadline = Date.now() + 5000
  const poll = setInterval(() => {
    if (psInputReady && psInputProc && !psInputProc.killed) {
      clearInterval(poll); try { psInputProc.stdin.write(cmd + '\n') } catch {}
    } else if (Date.now() > deadline) clearInterval(poll)
  }, 80)
}

// ─── Mouse injection ────────────────────────────────────────────────────────
let pendingMove = null
let moveBusy = false
function queueMouseMove(xi, yi) {
  // v3.5 — only one SetCursorPos command may be in flight. Keep the newest
  // position and send it as soon as PowerShell acknowledges the previous one.
  pendingMove = { xi, yi }
  pumpMove()
}
function pumpMove() {
  if (moveBusy || !pendingMove) return
  const p = pendingMove
  pendingMove = null
  moveBusy = true
  sendPsCmdAck('[WinUI]::SetCursorPos(' + p.xi + ',' + p.yi + ')', () => {
    moveBusy = false
    if (pendingMove) pumpMove()
  })
}

function injectMouse(payload) {
  if (process.platform !== 'win32') return
  // x,y are relative (0.0–1.0) — convert to absolute screen pixels
  const { type, button, deltaY } = payload
  const xi = Math.round((payload.x || 0) * capScreenW)
  const yi = Math.round((payload.y || 0) * capScreenH)
  const btn = button === 2 ? 'R' : button === 1 ? 'M' : 'L'

  if (type === 'move') {
    queueMouseMove(xi, yi)
  } else if (type === 'click') {
    pendingMove = null
    const ld = `[WinUI]::${btn}D`, lu = `[WinUI]::${btn}U`
    sendPsCmd(`[WinUI]::SetCursorPos(${xi},${yi});[WinUI]::mouse_event(${ld},0,0,0,[IntPtr]::Zero);[WinUI]::mouse_event(${lu},0,0,0,[IntPtr]::Zero)`)
  } else if (type === 'down') {
    sendPsCmd(`[WinUI]::SetCursorPos(${xi},${yi});[WinUI]::mouse_event([WinUI]::${btn}D,0,0,0,[IntPtr]::Zero)`)
  } else if (type === 'up') {
    sendPsCmd(`[WinUI]::SetCursorPos(${xi},${yi});[WinUI]::mouse_event([WinUI]::${btn}U,0,0,0,[IntPtr]::Zero)`)
  } else if (type === 'dblclick') {
    sendPsCmd(`[WinUI]::SetCursorPos(${xi},${yi});[WinUI]::mouse_event([WinUI]::LD,0,0,0,[IntPtr]::Zero);[WinUI]::mouse_event([WinUI]::LU,0,0,0,[IntPtr]::Zero);Start-Sleep -Milliseconds 40;[WinUI]::mouse_event([WinUI]::LD,0,0,0,[IntPtr]::Zero);[WinUI]::mouse_event([WinUI]::LU,0,0,0,[IntPtr]::Zero)`)
  } else if (type === 'scroll' || type === 'wheel') {
    const wd = Math.round((deltaY || 0) * -120)
    sendPsCmd(`[WinUI]::SetCursorPos(${xi},${yi});[WinUI]::mouse_event([WinUI]::WH,0,0,${wd},[IntPtr]::Zero)`)
  }
}

// ─── Key injection ──────────────────────────────────────────────────────────
const KEY_TO_SENDKEYS = {
  Enter: '{ENTER}', Backspace: '{BACKSPACE}', Delete: '{DELETE}', Tab: '{TAB}', Escape: '{ESC}',
  ' ': ' ', ArrowUp: '{UP}', ArrowDown: '{DOWN}', ArrowLeft: '{LEFT}', ArrowRight: '{RIGHT}',
  Home: '{HOME}', End: '{END}', PageUp: '{PGUP}', PageDown: '{PGDN}', Insert: '{INSERT}',
  F1: '{F1}', F2: '{F2}', F3: '{F3}', F4: '{F4}', F5: '{F5}', F6: '{F6}',
  F7: '{F7}', F8: '{F8}', F9: '{F9}', F10: '{F10}', F11: '{F11}', F12: '{F12}',
  '+': '{+}', '^': '{^}', '%': '{%}', '~': '{~}',
  '(': '{(}', ')': '{)}', '{': '{{}', '}': '{}}', '[': '{[}', ']': '{]}'
}

// VK codes for keybd_event (held-key support: Ctrl+drag, Shift+select, etc.)
const WIN_VK_MAP = {
  'Backspace':0x08,'Tab':0x09,'Enter':0x0D,'Shift':0x10,'Control':0x11,'Alt':0x12,
  'Escape':0x1B,' ':0x20,'PageUp':0x21,'PageDown':0x22,'End':0x23,'Home':0x24,
  'ArrowLeft':0x25,'ArrowUp':0x26,'ArrowRight':0x27,'ArrowDown':0x28,
  'Insert':0x2D,'Delete':0x2E,'Meta':0x5B,
  'F1':0x70,'F2':0x71,'F3':0x72,'F4':0x73,'F5':0x74,'F6':0x75,
  'F7':0x76,'F8':0x77,'F9':0x78,'F10':0x79,'F11':0x7A,'F12':0x7B,
}

function injectKey(payload) {
  if (process.platform !== 'win32') return
  const { key, modifiers, type } = payload
  const isSingleChar = typeof key === 'string' && key.length === 1
  const modsArr      = Array.isArray(modifiers) ? modifiers : []
  const hasAccel     = modsArr.includes('ctrl') || modsArr.includes('alt') || modsArr.includes('meta') ||
                       !!(modifiers && (modifiers.ctrl || modifiers.alt || modifiers.meta))

  if (type === 'press') {
    if (isSingleChar && !hasAccel) {
      // Layout-independent Unicode input — types the exact character once
      // (Arabic, symbols, any layout) via SendInput KEYEVENTF_UNICODE.
      const code = key.codePointAt(0)
      if (code) { sendPsCmd(`[WinUI]::SendUnicode(${code})`); return }
    }
    // Legacy: older dashboards sent 'press' for special keys too. The down/up
    // path is authoritative now — ignoring this avoids duplicated input.
    return
  }

  // 'down' / 'up' — keybd_event for held keys, modifiers, accelerators and
  // special keys. Plain printable chars are typed via 'press' only.
  if (isSingleChar && !hasAccel) return

  const vk = WIN_VK_MAP[key] ?? (isSingleChar ? key.toUpperCase().charCodeAt(0) : null)
  if (!vk) return

  const isUp   = type === 'up'
  const kflag  = isUp ? '[WinUI]::KU' : '0'
  const mods   = Array.isArray(modifiers) ? modifiers : []
  const modVks = []
  if (mods.includes('ctrl')  || modifiers?.ctrl)  modVks.push(0x11)
  if (mods.includes('alt')   || modifiers?.alt)   modVks.push(0x12)
  if (mods.includes('shift') || modifiers?.shift) modVks.push(0x10)
  if (mods.includes('meta')  || modifiers?.meta)  modVks.push(0x5B)

  const cmds = []
  if (!isUp) {
    modVks.forEach(mv => cmds.push(`[WinUI]::keybd_event(${mv},0,0,[IntPtr]::Zero)`))
    cmds.push(`[WinUI]::keybd_event(${vk},0,0,[IntPtr]::Zero)`)
  } else {
    cmds.push(`[WinUI]::keybd_event(${vk},0,${kflag},[IntPtr]::Zero)`)
    modVks.reverse().forEach(mv => cmds.push(`[WinUI]::keybd_event(${mv},0,[WinUI]::KU,[IntPtr]::Zero)`))
  }
  if (cmds.length) sendPsCmd(cmds.join(';'))
}

function executeCommand(payload) {
  if (payload.type !== 'shell' || !payload.command) return
  const cmd = payload.command
  addLog('info', `▶ [cmd] تنفيذ: ${cmd}`)
  const t0 = Date.now()
  exec(cmd, { shell: 'cmd.exe', timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    const dur     = Date.now() - t0
    const preview = (stdout || stderr || '').trim().slice(0, 120)
    const level   = err ? 'error' : 'info'
    addLog(level, `${err ? '✖' : '✔'} [cmd] exitCode=${err?.code ?? 0} dur=${dur}ms${preview ? ' → ' + preview : ''}`)
    send({
      type: 'agent:command_result',
      payload: {
        commandId: payload.commandId,
        stdout:    stdout || '',
        stderr:    stderr || (err?.message || ''),
        exitCode:  err?.code ?? 0,
        duration:  dur
      },
      timestamp: Date.now()
    })
  })
}

async function startHeartbeat() {
  heartbeatTimer = setInterval(async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !deviceId) return
    try {
      const stats = await getStats()
      send({
        type: 'agent:heartbeat',
        payload: {
          deviceId, stats, tunnelLayer: 'relay', timestamp: Date.now(),
          capabilities: {
            pty: true, fs: true, screenControl: true,
            clipboard: true, multiMonitor: true,
            docker: dockerAvailable,
            controlAuth: controlAuthCapability()
          }
        },
        timestamp: Date.now()
      })
      if (win && !win.isDestroyed()) win.webContents.send('stats', stats)
    } catch {}
  }, HEARTBEAT_MS)
}

function scheduleReconnect() {
  if (agentState === 'stopped') return
  addLog('info', `🔄 إعادة الاتصال خلال ${(reconnectDelay / 1000).toFixed(0)}ث...`)
  reconnectTimer = setTimeout(() => doConnect(), reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 1.5, RECONNECT_MAX)
}

function clearTimers() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  if (reconnectTimer) { clearTimeout(reconnectTimer);  reconnectTimer = null }
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(msg)) } catch {}
  }
}

// ─── Tray ─────────────────────────────────────────────────────────────────
function getTrayIcon() {
  const pngPath = path.join(__dirname, 'build', 'icon.png')
  if (fs.existsSync(pngPath)) return nativeImage.createFromPath(pngPath).resize({ width: 16, height: 16 })
  const icoPath = path.join(__dirname, 'build', 'icon.ico')
  if (fs.existsSync(icoPath)) return nativeImage.createFromPath(icoPath).resize({ width: 16, height: 16 })
  return nativeImage.createEmpty()
}

function createTray() {
  tray = new Tray(getTrayIcon())
  refreshTray()
  tray.on('double-click', showWindow)
  tray.on('click', showWindow)
}

function refreshTray() {
  if (!tray) return
  const activeSessions = screenSessions.size
  const streaming      = activeSessions > 0
  const streamingLabel = streaming ? ` · 📡 بث (${activeSessions} جلسة)` : ''
  const labels = {
    stopped:    'Stopped / متوقف',
    connecting: 'Connecting... / جاري الاتصال',
    connected:  `Connected — ${os.hostname()}`,
    error:      'Error / خطأ'
  }
  const statusLabel = labels[agentState] || agentState
  tray.setToolTip(`AiRemote Agent v${AGENT_VERSION}  ·  ${statusLabel}${streamingLabel}`)

  const sessionItems = []
  for (const [sid, info] of screenSessions) {
    const fps   = getSessionFps(sid)
    const total = sessionFrameCounts.get(sid) || 0
    sessionItems.push({ label: `  📸 ${sid.slice(0,8)} — ${fps} fps · ${total} إطار`, enabled: false })
  }

  const menu = Menu.buildFromTemplate([
    { label: `AiRemote Agent  v${AGENT_VERSION}`, enabled: false },
    { label: statusLabel + streamingLabel, enabled: false },
    ...(sessionItems.length ? [{ type: 'separator' }, ...sessionItems] : []),
    { type: 'separator' },
    { label: 'Open / فتح', click: showWindow },
    { type: 'separator' },
    {
      label: agentState === 'stopped' ? 'Start / تشغيل' : 'Stop / إيقاف',
      click: () => { agentState === 'stopped' ? startAgent() : stopAgent() }
    },
    { type: 'separator' },
    { type: 'separator' },
    { label: `حول AiRemote — v${AGENT_VERSION}`, click: () => { try { dialog.showMessageBox({ type: 'info', title: 'حول AiRemote', message: `AiRemote Agent v${AGENT_VERSION}`, detail: 'Remote Access + AI\n© 2026 AiRemote', buttons: ['إغلاق'] }) } catch {} } },
    { label: 'Quit / إغلاق', click: () => { quitting = true; app.quit() } }
  ])
  tray.setContextMenu(menu)
}

// ─── Window ───────────────────────────────────────────────────────────────
function showWindow() {
  if (!win || win.isDestroyed()) createWindow()
  else { win.show(); win.focus() }
}

function saveBounds() {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isMinimized()) return
  clearTimeout(boundsTimer)
  boundsTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return
    saveConfig({ _winBounds: win.getBounds() })
  }, 500)
}

function createWindow() {
  const saved = (config._winBounds && config._winBounds.width > 300) ? config._winBounds : {}
  win = new BrowserWindow({
    width:     saved.width  || 480,
    height:    saved.height || 740,
    x:         saved.x,
    y:         saved.y,
    minWidth:  440,
    minHeight: 560,
    resizable: true,
    frame:     false,
    transparent: false,
    backgroundColor: '#0f172a',
    title: 'AiRemote Agent',
    show:   false,
    center: !saved.x,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          false
    }
  })

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  win.on('resize', saveBounds)
  win.on('move',   saveBounds)
    win.on('focus',  () => { try { win.flashFrame(false) } catch {} })

  win.once('ready-to-show', () => {
    if (!config.startMinimized) win.show()
    const info = getDeviceInfo()
    win.webContents.send('init', {
      config: {
        serverUrl:      config.serverUrl,
        token:          config.token,
        autoStart:      config.autoStart,
        startMinimized: config.startMinimized
      },
      logs:      logEntries,
      state:     agentState,
      deviceId,
      serverUrl: config.serverUrl,
      hostname:  info.hostname,
      ipLocal:   info.ipLocal,
      ipPublic:  cachedPublicIp,
      platform:  info.osVersion,
      arch:      info.arch
    })
    if (config.autoStart && config.serverUrl && config.token && agentState === 'stopped') {
      setTimeout(startAgent, 800)
    }
    // Try to fetch public IP
    fetchPublicIp().catch(() => {})
  })

  win.on('close', e => {
    if (!quitting) {
      e.preventDefault()
      win.hide()
      if (!tray) createTray()
    }
  })

  win.on('closed', () => { win = null })
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────
ipcMain.on('chat-toast-open', () => {
  closeChatToast()
  showWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('open-chat-section')
    try { win.flashFrame(false) } catch {}
  }
})
ipcMain.on('chat-toast-close', () => closeChatToast())

ipcMain.on('minimize-chat-win', () => { if (chatWin && !chatWin.isDestroyed()) chatWin.minimize() })
ipcMain.on('close-chat-win',   () => { if (chatWin && !chatWin.isDestroyed()) chatWin.close() })

ipcMain.on('start-agent', (_, cfg) => {
  if (cfg && (cfg.serverUrl || cfg.token)) saveConfig(cfg)
  startAgent()
})
ipcMain.on('stop-agent',   () => stopAgent())
ipcMain.on('minimize-win', () => win?.minimize())
ipcMain.on('hide-win',     () => win?.hide())
ipcMain.on('close-app',    () => { quitting = true; app.quit() })

ipcMain.on('save-control-auth', (_, { mode, password } = {}) => {
  const m = mode === 'password' ? 'password' : 'consent'
  if (m === 'password') {
    const pw = String(password || '')
    if (pw.length < 4) {
      if (win && !win.isDestroyed()) win.webContents.send('control-auth-state', { mode: config.controlAuthMode || 'consent', hasPassword: !!config.controlPasswordHash, error: 'short_password' })
      return
    }
    const h = hashControlPassword(pw)
    saveConfig({ controlAuthMode: 'password', controlPasswordSalt: h.salt, controlPasswordHash: h.hash })
  } else {
    saveConfig({ controlAuthMode: 'consent', controlPasswordSalt: '', controlPasswordHash: '' })
  }
  addLog('info', '[control] auth mode = ' + (config.controlAuthMode || 'consent'))
  if (lastRegisterPayload) {
    lastRegisterPayload.capabilities = { ...(lastRegisterPayload.capabilities || { pty: true, fs: true, screenControl: true }), controlAuth: controlAuthCapability() }
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { send({ type: 'agent:capabilities_update', payload: { capabilities: { ...(lastRegisterPayload && lastRegisterPayload.capabilities) || { pty: true, fs: true, screenControl: true }, controlAuth: controlAuthCapability() } }, timestamp: Date.now() }) } catch {}
  }
  if (win && !win.isDestroyed()) win.webContents.send('control-auth-state', { mode: config.controlAuthMode || 'consent', hasPassword: !!config.controlPasswordHash, ok: true })
})

ipcMain.on('save-config', (_, cfg) => {
  saveConfig(cfg)
  addLog('info', '💾 تم حفظ الإعدادات')
})

// ── Chat Pop-out Window ────────────────────────────────────────────────────
function openChatWindow(opts = {}) {
  if (chatWin && !chatWin.isDestroyed()) { if (!opts.silent) chatWin.focus(); return }
  chatWin = new BrowserWindow({
    width:     380,
    height:    520,
    minWidth:  320,
    minHeight: 380,
    title:     'AiRemote — دردشة المشاهدين',
    frame:     false,
    transparent: false,
    backgroundColor: '#0f172a',
    resizable: true,
    webPreferences: {
      preload:          path.join(__dirname, 'chat-preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          false
    }
  })
  chatWin.loadFile(path.join(__dirname, 'renderer', 'chat.html'))
  chatWin.webContents.once('did-finish-load', () => {
    chatWin.webContents.send('chat-init', { theme: opts.theme || 'dark', history: chatHistory.slice(-200) })
  })
  chatWin.on('closed', () => {
    chatWin = null
    if (win && !win.isDestroyed()) win.webContents.send('chat-win-status', { open: false })
  })
  if (opts.silent !== true) { try { chatWin.focus() } catch {} }
  if (win && !win.isDestroyed()) win.webContents.send('chat-win-status', { open: true })
}
ipcMain.on('open-chat-window', (_, opts = {}) => openChatWindow(opts))

// ── T006: Host-side chat send ──────────────────────────────────────────────
ipcMain.on('send-chat', (_, { text }) => {
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return
  // Pick the first active screen session — agent-desktop runs one at a time
  const sessionId = [...screenSessions.keys()][0] || undefined
  const chatPayload = { text: String(text).trim(), sender: 'host', ts: Date.now() }
  chatHistory.push(chatPayload)
  if (chatHistory.length > 300) chatHistory.shift()
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('screen-chat', chatPayload)
  if (win && !win.isDestroyed()) win.webContents.send('screen-chat', chatPayload)
  send({
    type:      'agent:screen_chat',
    payload:   { sessionId, ...chatPayload },
    timestamp: Date.now()
  })
  addLog('info', `💬 [chat sent] ${text}`)
})

// ── v3.4.0 — On-device AI assistant ── (see block below)
// ── v3.4.0 — On-device AI assistant (agent-window chat) ─────────────────────
const fsAI = require('fs')
const osAI = require('os')

let aiConvId = ''
const AI_CONV_FILE = path.join(app.getPath('userData'), 'airemote-ai-conv.json')
function loadAiConv() { try { aiConvId = JSON.parse(fsAI.readFileSync(AI_CONV_FILE, 'utf8')).id || '' } catch {} }
function saveAiConv() { try { fsAI.writeFileSync(AI_CONV_FILE, JSON.stringify({ id: aiConvId })) } catch {} }
loadAiConv()

let aiAbort = null
function aiBase() {
  try {
    const raw = String(config.serverUrl || '').trim()
    // ws(s)://host:port/ws?agent=1  →  http(s)://host:port
    const u = new URL(raw.replace(/^ws/, 'http'))
    let path = u.pathname.replace(/\/ws\/?$/, '').replace(/\/+$/, '')
    return u.origin + path
  } catch { return '' }
}

async function aiChatSend(text) {
  const wref = win
  const sendEvt = (ch, d) => { try { if (wref && !wref.isDestroyed()) wref.webContents.send(ch, d) } catch {} }
  addLog('info', '[ai] send: ' + String(text || '').slice(0, 60))
  const base = aiBase()
  if (!base || !config.token) { addLog('error', '[ai] serverUrl/token missing'); sendEvt('ai-error', { error: 'المخدم أو الـ Token غير مهيأ' }); return }
  const ctrl = new AbortController()
  aiAbort = ctrl
  try {
    const res = await fetch(base + '/api/ai/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Device-Token': String(config.token || '') },
      signal: ctrl.signal,
      body: JSON.stringify({ message: String(text || ''), conversationId: aiConvId || undefined, deviceId })
    })
    if (!res.ok || !res.body) {
      let e = ''
      try { e = (await res.text()).slice(0, 300) } catch {}
      addLog('error', '[ai] HTTP ' + res.status + ' ' + String(e).slice(0, 120))
      sendEvt('ai-error', { error: 'HTTP ' + res.status + (e ? ' — ' + e : '') })
      return
    }
    const reader = res.body.getReader()
    const dec = new TextDecoder()
    let buf = ''
    for (;;) {
      const r2 = await reader.read()
      if (r2.done) break
      buf += dec.decode(r2.value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line.startsWith('data: ')) continue
        const j = line.slice(6)
        if (j === '[DONE]') continue
        try {
          const o = JSON.parse(j)
          if (o.conversationId && o.conversationId !== aiConvId) { aiConvId = o.conversationId; saveAiConv() }
          if (o.delta) sendEvt('ai-delta', { delta: o.delta })
          if (o.error) sendEvt('ai-error', { error: String(o.error) })
        } catch {}
      }
    }
    sendEvt('ai-done', { conversationId: aiConvId })
  } catch (e) {
    if (e && e.name === 'AbortError') sendEvt('ai-done', { aborted: true })
    else { addLog('error', '[ai] ' + String((e && e.message) || e)); sendEvt('ai-error', { error: String((e && e.message) || e) }) }
  } finally { aiAbort = null }
}

function aiPsRun(script, timeoutMs) {
  return new Promise((resolve) => {
    let tmpFile = ''
    try {
      tmpFile = path.join(osAI.tmpdir(), 'airemote-ai-' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.ps1')
      fsAI.writeFileSync(tmpFile, String.fromCharCode(65279) + script, 'utf8')
    } catch (e) { resolve({ ok: false, out: '', err: 'write fail: ' + e.message, code: -1 }); return }
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', tmpFile], { windowsHide: true })
    let out = '', err = ''
    const t = setTimeout(() => { try { child.kill() } catch {} }, timeoutMs || 120000)
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { err += d.toString() })
    child.on('exit', (code) => { clearTimeout(t); resolve({ ok: code === 0, out: out.slice(0, 20000), err: err.slice(0, 4000), code: code == null ? -1 : code }) })
    child.on('error', (e) => { clearTimeout(t); resolve({ ok: false, out, err: String((e && e.message) || e), code: -1 }) })
  })
}

const AI_KEY_VK = { 'enter': 0x0D, 'return': 0x0D, 'backspace': 0x08, 'delete': 0x2E, 'tab': 0x09, 'escape': 0x1B, 'esc': 0x1B, 'up': 0x26, 'down': 0x28, 'left': 0x25, 'right': 0x27, 'home': 0x24, 'end': 0x23, 'pageup': 0x21, 'pagedown': 0x22, 'space': 0x20, 'insert': 0x2D }
const AI_FKEYS = { f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75, f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7A, f12: 0x7B }

async function aiRunControl(content) {
  const lines = String(content || '').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))
  const log = []
  let okAll = true
  for (const ln of lines) {
    try {
      const m = /^([a-zA-Z]+)\s*([\s\S]*)$/.exec(ln)
      if (!m) { log.push('?! ' + ln); okAll = false; continue }
      let action = m[1].toLowerCase()
      let rest = (m[2] || '').trim()
      const KNOWN = ['clickname', 'rclick', 'dclick', 'drag', 'click', 'move', 'scroll', 'focus', 'type', 'key', 'wait', 'info']
      if (!KNOWN.includes(action)) {
        for (const k of KNOWN) { if (action.startsWith(k) && action.length > k.length) { rest = (action.slice(k.length) + (rest ? ' ' + rest : '')).trim(); action = k; break } }
      }
      if (action === 'wait') {
        const s2 = Math.min(Math.max(parseInt(rest) || 2, 1), 30)
        await new Promise(r => setTimeout(r, s2 * 1000))
        log.push('wait ' + s2 + ' -> ok')
        continue
      }
      if (action === 'info') {
        const r = await aiPsRun('Add-Type -AssemblyName System.Windows.Forms; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; Write-Output ("screen: " + $b.Width + "x" + $b.Height); (Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object -First 8 | ForEach-Object { $_.MainWindowTitle }) -join " | "', 30000)
        log.push('info -> ' + String((r.out || r.err) || '').trim().slice(0, 400))
        continue
      }
      if (action === 'type') {
        const codes = []
        for (const ch of rest) { let cp = ch.codePointAt(0); if (cp === 10 || cp === 13) cp = 13; codes.push(cp) }
        for (let i = 0; i < codes.length; i += 40) {
          const chunk = codes.slice(i, i + 40).map(c2 => '[WinUI]::SendUnicode(' + c2 + ')').join(';')
          sendPsCmd(chunk + ';Start-Sleep -Milliseconds 20')
          await new Promise(r => setTimeout(r, 450))
        }
        log.push('type ' + rest.length + ' chars -> ok')
        continue
      }
      if (action === 'key') {
        const tokens = rest.toLowerCase().split('+').map(s => s.trim()).filter(Boolean)
        const mods = tokens.filter(t => ['ctrl', 'alt', 'shift'].includes(t))
        const keyTok = tokens.filter(t => !['ctrl', 'alt', 'shift'].includes(t))[0] || ''
        const MODVK = { ctrl: 0x11, alt: 0x12, shift: 0x10 }
        let vk = AI_KEY_VK[keyTok]
        if (vk == null && AI_FKEYS[keyTok] != null) vk = AI_FKEYS[keyTok]
        if (vk == null && keyTok.length === 1) vk = keyTok.toUpperCase().charCodeAt(0)
        if (vk == null) { log.push('key ' + rest + ' -> unknown'); okAll = false; continue }
        let ps = ''
        for (const md of mods) ps += '[WinUI]::keybd_event(' + MODVK[md] + ',0,0,[IntPtr]::Zero);'
        ps += '[WinUI]::keybd_event(' + vk + ',0,0,[IntPtr]::Zero);[WinUI]::keybd_event(' + vk + ',0,2,[IntPtr]::Zero);'
        for (const md of mods.slice().reverse()) ps += '[WinUI]::keybd_event(' + MODVK[md] + ',0,2,[IntPtr]::Zero);'
        sendPsCmd(ps)
        await new Promise(r => setTimeout(r, 140))
        log.push('key ' + rest + ' -> ok')
        continue
      }
      if (action === 'focus') {
        const tEsc = rest.replace(/'/g, "''")
        const ps = "$wsh=New-Object -ComObject WScript.Shell;$ok=$wsh.AppActivate('" + tEsc + "');if($ok){'focused'}else{Add-Type -AssemblyName UIAutomationClient;Add-Type -AssemblyName UIAutomationTypes;$root=[System.Windows.Automation.AutomationElement]::RootElement;$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition);$hit=$null;$needle='" + tEsc + "'.ToLower();foreach($wn in $wins){try{$nm=$wn.Current.Name;if($nm -and $nm.ToLower().Contains($needle)){$hit=$nm;break}}catch{}};if($hit){$ok2=$wsh.AppActivate($hit);if($ok2){'focused-full'}else{'focus-not-found'}}else{'focus-not-found'}}"
        const r = await aiPsRun(ps, 30000)
        const o = String(r.out || '').trim()
        log.push('focus ' + rest + ' -> ' + (o || String(r.err || '').trim()).slice(0, 120))
        if (o.indexOf('focused') !== 0) okAll = false
        continue
      }
      if (action === 'clickname') {
        const script = CLICKNAME_PS_AGENT.replace('__NAME_B64__', Buffer.from(rest, 'utf8').toString('base64'))
        const r = await aiPsRun(script, 60000)
        const o = String(r.out || '').trim()
        log.push('clickname ' + rest + ' -> ' + (o.slice(0, 140) || String(r.err || '').slice(0, 140)))
        if (!/invoked|clicked/.test(o)) okAll = false
        continue
      }
      const nums = rest.split(/[\s,]+/).map(Number)
      if (['move', 'click', 'rclick', 'dclick'].includes(action)) {
        if (nums.length < 2 || !isFinite(nums[0]) || !isFinite(nums[1])) { log.push(action + ' -> bad coords'); okAll = false; continue }
        const x = Math.round(nums[0]), y = Math.round(nums[1])
        const dn = action === 'rclick' ? 'RD' : 'LD'
        const up = action === 'rclick' ? 'RU' : 'LU'
        let ps = '[WinUI]::SetCursorPos(' + x + ',' + y + ');Start-Sleep -Milliseconds 60;'
        if (action === 'dclick') ps += '[WinUI]::mouse_event([WinUI]::LD,0,0,0,[IntPtr]::Zero);[WinUI]::mouse_event([WinUI]::LU,0,0,0,[IntPtr]::Zero);Start-Sleep -Milliseconds 40;[WinUI]::mouse_event([WinUI]::LD,0,0,0,[IntPtr]::Zero);[WinUI]::mouse_event([WinUI]::LU,0,0,0,[IntPtr]::Zero)'
        else ps += '[WinUI]::mouse_event([WinUI]::' + dn + ',0,0,0,[IntPtr]::Zero);[WinUI]::mouse_event([WinUI]::' + up + ',0,0,0,[IntPtr]::Zero)'
        sendPsCmd(ps)
        await new Promise(r => setTimeout(r, 170))
        log.push(action + ' ' + x + ' ' + y + ' -> ok')
        continue
      }
      if (action === 'drag') {
        if (nums.length < 4) { log.push('drag -> bad coords'); okAll = false; continue }
        const ps = '[WinUI]::SetCursorPos(' + Math.round(nums[0]) + ',' + Math.round(nums[1]) + ');[WinUI]::mouse_event([WinUI]::LD,0,0,0,[IntPtr]::Zero);Start-Sleep -Milliseconds 80;[WinUI]::SetCursorPos(' + Math.round(nums[2]) + ',' + Math.round(nums[3]) + ');Start-Sleep -Milliseconds 80;[WinUI]::mouse_event([WinUI]::LU,0,0,0,[IntPtr]::Zero)'
        sendPsCmd(ps)
        await new Promise(r => setTimeout(r, 320))
        log.push('drag -> ok')
        continue
      }
      if (action === 'scroll') {
        const amt = parseInt(rest) || -3
        sendPsCmd('[WinUI]::mouse_event([WinUI]::WH,0,0,' + (amt * 120) + ',[IntPtr]::Zero)')
        await new Promise(r => setTimeout(r, 170))
        log.push('scroll ' + amt + ' -> ok')
        continue
      }
      log.push('? ' + ln)
      okAll = false
    } catch (e) { log.push(ln + ' -> error ' + ((e && e.message) || e)); okAll = false }
  }
  return { ok: okAll, out: log.join('\n'), err: '', code: okAll ? 0 : 1 }
}

async function aiScreenshot() {
  const shotPath = path.join(osAI.tmpdir(), 'airemote-ai-shot-' + Date.now() + '.jpg')
  const ps = "try { $cs = 'using System;using System.Runtime.InteropServices;public class DpiAw { [DllImport(' + [char]34 + 'user32.dll' + [char]34 + ')] public static extern bool SetProcessDPIAware(); }'; Add-Type -TypeDefinition $cs -ErrorAction SilentlyContinue; [DpiAw]::SetProcessDPIAware() | Out-Null } catch {}; Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $vb=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap($vb.Width,$vb.Height); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($vb.Location,[System.Drawing.Point]::Empty,$vb.Size); $bmp.Save('" + shotPath.replace(/\\/g, '\\\\') + "',[System.Drawing.Imaging.ImageFormat]::Jpeg); $g.Dispose(); $bmp.Dispose(); Write-Output 'shot-ok'"
  const r = await aiPsRun(ps, 30000)
  try {
    const buf = fsAI.readFileSync(shotPath)
    try { fsAI.unlinkSync(shotPath) } catch {}
    return { ok: true, out: 'screenshot-ok', err: '', code: 0, image: 'data:image/jpeg;base64,' + buf.toString('base64') }
  } catch (e) {
    return { ok: false, out: String((r && r.out) || '').trim(), err: 'capture failed: ' + ((e && e.message) || e), code: 1 }
  }
}

async function aiRunBlock(payload) {
  const lang = String((payload && payload.lang) || '').toLowerCase()
  const content = String((payload && payload.content) || '')
  if (['powershell', 'ps1', 'powershell.exe', 'pwsh'].includes(lang)) return await aiPsRun(content, 120000)
  if (['bash', 'cmd', 'shell', 'sh', 'bat', ''].includes(lang)) return await aiPsRun(content, 120000)
  if (lang === 'control') return await aiRunControl(content)
  if (lang === 'screenshot') return await aiScreenshot()
  if (lang === 'record') return { ok: false, out: '', err: 'تسجيل الفيديو متاح من لوحة التحكم حالياً', code: 1 }
  return { ok: false, out: '', err: 'نوع كتلة غير معروف: ' + lang, code: 1 }
}

const CLICKNAME_PS_AGENT = `
$ProgressPreference = 'SilentlyContinue'
$n = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__NAME_B64__')).ToLower()
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]
$CT = [System.Windows.Automation.ControlType]
$root = $AE::RootElement
function ScanWin($win, $n) {
  $types = @($CT::Hyperlink, $CT::Button, $CT::ListItem, $CT::TabItem)
  foreach ($ct in $types) {
    try {
      $cond = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, $ct)
      $els = $win.FindAll($TS::Descendants, $cond)
      $i = 0
      foreach ($x in $els) { $i++; if ($i -gt 6000) { break }; try { $nm = $x.Current.Name; if ($nm -and $nm.ToLower().Contains($n) -and $x.Current.IsEnabled -and -not $x.Current.IsOffscreen) { return $x } } catch {} }
    } catch {}
  }
  try {
    $els = $win.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
    $i = 0
    foreach ($x in $els) { $i++; if ($i -gt 4000) { break }; try { $nm = $x.Current.Name; if ($nm -and $nm.ToLower().Contains($n) -and $x.Current.IsEnabled -and -not $x.Current.IsOffscreen) { return $x } } catch {} }
  } catch {}
  return $null
}
$target = $null
try {
  $cs = 'using System;using System.Runtime.InteropServices;public class Fg { [DllImport(' + [char]34 + 'user32.dll' + [char]34 + ')] public static extern IntPtr GetForegroundWindow(); }'
  Add-Type -TypeDefinition $cs -ErrorAction SilentlyContinue
  $fg = [Fg]::GetForegroundWindow()
  if ($fg -ne [IntPtr]::Zero) { $fw = $AE::FromHandle($fg); if ($fw -ne $null) { $target = ScanWin $fw $n } }
} catch {}
if ($target -eq $null) {
  $wins = $root.FindAll($TS::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($win in $wins) { try { if ($win.Current.ClassName -match 'Shell_TrayWnd|Progman|WorkerW') { continue } } catch { continue }; $target = ScanWin $win $n; if ($target -ne $null) { break } }
}
if ($target -eq $null) { 'name-not-found' } else {
  try { $target.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke(); 'invoked' }
  catch {
    $r = $target.Current.BoundingRectangle
    $cx = [int]($r.X + $r.Width / 2)
    $cy = [int]($r.Y + $r.Height / 2)
    $cc = 'using System;using System.Runtime.InteropServices;public class Mu2 { [DllImport(' + [char]34 + 'user32.dll' + [char]34 + ')] public static extern bool SetCursorPos(int x,int y); [DllImport(' + [char]34 + 'user32.dll' + [char]34 + ')] public static extern void mouse_event(uint f,uint dx,uint dy,uint d,IntPtr e); }'
    Add-Type -TypeDefinition $cc -ErrorAction SilentlyContinue
    [Mu2]::SetCursorPos($cx, $cy)
    Start-Sleep -Milliseconds 150
    [Mu2]::mouse_event(2,0,0,0,[IntPtr]::Zero)
    [Mu2]::mouse_event(4,0,0,0,[IntPtr]::Zero)
    'clicked-center'
  }
}`

ipcMain.on('ai-send', (_, d = {}) => { if (d && d.text) aiChatSend(d.text) })
ipcMain.on('ai-stop', () => { try { if (aiAbort) aiAbort.abort() } catch {} })
ipcMain.on('ai-new-conversation', () => { aiConvId = ''; saveAiConv() })
ipcMain.handle('ai-run-block', async (_, payload = {}) => {
  try { return await aiRunBlock(payload) } catch (e) { return { ok: false, out: '', err: String((e && e.message) || e), code: -1 } }
})

// ── v3.4.3 — conversation history for the on-device AI chat ──────────────
async function aiApi(method, apiPath, body) {
  const base = aiBase()
  if (!base || !config.token) throw new Error('المخدم أو الـ Token غير مهيأ')
  const opts = { method: method, headers: { 'X-Device-Token': String(config.token || '') } }
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
  const res = await fetch(base + apiPath, opts)
  const txt = await res.text()
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + String(txt).slice(0, 120))
  try { return JSON.parse(txt) } catch (e) { return null }
}
ipcMain.handle('ai-list-conversations', async () => {
  // v3.5 — before registration deviceId is null; returning the user's global
  // history made every agent show the same (most recent) conversation.
  if (!deviceId) return { ok: true, conversations: [] }
  try { return { ok: true, conversations: await aiApi('GET', '/api/ai/conversations?deviceId=' + encodeURIComponent(deviceId)) } }
  catch (e) { return { ok: false, error: String((e && e.message) || e) } }
})
ipcMain.handle('ai-load-conversation', async (_, id) => {
  if (!deviceId) return { ok: false, error: 'device-not-ready' }
  try { const r = await aiApi('GET', '/api/ai/history?conversationId=' + encodeURIComponent(String(id || '')) + '&deviceId=' + encodeURIComponent(deviceId)); return { ok: true, conversationId: (r && r.conversationId) || '', messages: (r && r.messages) || [] } }
  catch (e) { return { ok: false, error: String((e && e.message) || e) } }
})
ipcMain.handle('ai-delete-conversation', async (_, id) => {
  try { await aiApi('DELETE', '/api/ai/conversations/' + encodeURIComponent(String(id || ''))); return { ok: true } }
  catch (e) { return { ok: false, error: String((e && e.message) || e) } }
})
ipcMain.handle('ai-set-conversation', (_, id) => { aiConvId = String(id || ''); saveAiConv(); return { ok: true } })

ipcMain.handle('get-state', () => ({
  state:     agentState,
  deviceId,
  serverUrl: config.serverUrl,
  uptime:    sessionStart ? Math.floor((Date.now() - sessionStart) / 1000) : 0,
  config: {
    serverUrl:      config.serverUrl,
    token:          config.token,
    autoStart:      config.autoStart,
    startMinimized: config.startMinimized,
    controlAuthMode: config.controlAuthMode || 'consent',
    hasControlPassword: !!config.controlPasswordHash
  },
  logs: logEntries
}))

ipcMain.handle('get-stats-now', async () => {
  try { return await getStats() } catch { return lastStats }
})

ipcMain.handle('get-device-info', () => {
  const info = getDeviceInfo()
  return { ...info, uptime: Math.floor(os.uptime()) }
})

// ── Capture Window IPC ─────────────────────────────────────────────────────

// desktopCapturer is main-process-only in Electron 20+
ipcMain.handle('get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types:         ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    })
    return sources.map((s, i) => ({ id: s.id, name: s.name, index: i }))
  } catch (e) {
    return []
  }
})

ipcMain.on('screen-frame', (_, p) => {
  // Legacy JSON path — kept as fallback; new agents use screen-frame-binary.
  // v3.3.0 — capScreenW/H come from display metrics; frames may be scaled (do not overwrite)
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type: 'agent:screen_frame', payload: p, timestamp: Date.now() })) } catch {}
  }
})

// ── Binary screen frame (v3.1+) ────────────────────────────────────────────
// Packet layout: [0x01][sessionId:36B][width:4B][height:4B][seq:4B][flags:1B][JPEG...]
// Total header: 50 bytes. No JSON/base64 → 3-4× lower CPU + network overhead.
// v3.5 — system audio (WASAPI loopback) relayed with the screen stream
ipcMain.on('audio-chunk', (_, { sessionId, data, seq, format, sampleRate, channels }) => {
  if (!ws || ws.readyState !== WebSocket.OPEN || !data) return
  if (!screenSessions.has(sessionId)) return
  try {
    ws.send(JSON.stringify({
      type: 'agent:audio_chunk',
      payload: {
        sessionId,
        seq: seq || 0,
        data: Buffer.from(data).toString('base64'),
        format: format || 'pcm16',
        sampleRate: sampleRate || 0,
        channels: channels || 0
      },
      timestamp: Date.now()
    }))
  } catch {}
})
ipcMain.on('audio-status', (_, p) => { addLog(p && p.ok ? 'info' : 'warn', '[audio] ' + (p && p.ok ? 'تم تفعيل صوت النظام' : 'صوت النظام غير متاح')) })

ipcMain.on('audio-status', (_, p) => {
  addLog(p && p.ok ? 'info' : 'warn', '[audio] ' + (p && p.ok ? 'system audio is on' : 'system audio is unavailable'))
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'agent:audio_status', payload: {
        ok: !!(p && p.ok), enabled: p && p.enabled !== undefined ? !!p.enabled : !!(p && p.ok), reason: (p && p.reason) || '', format: (p && p.format) || 'pcm16', sampleRate: (p && p.sampleRate) || 0, channels: (p && p.channels) || 0
      }, timestamp: Date.now() }))
    }
  } catch {}
})

ipcMain.on('screen-frame-binary', (_, { sessionId, width, height, seq, buffer, flags, x, y }) => {
  // v3.3.0 — capScreenW/H come from display metrics; frames may be scaled (do not overwrite)
  if (!ws || ws.readyState !== WebSocket.OPEN) return

  const f = (flags || 0) & 0xff
  const extra = (f & 2) ? 8 : 0   // v3.3.2: delta frames carry x,y
  const sidBuf = Buffer.allocUnsafe(36)
  sidBuf.fill(0)
  Buffer.from(sessionId, 'utf8').copy(sidBuf)

  const header = Buffer.allocUnsafe(50 + extra)
  header[0] = 0x01
  sidBuf.copy(header, 1)
  header.writeUInt32BE(width  >>> 0, 37)
  header.writeUInt32BE(height >>> 0, 41)
  header.writeUInt32BE(seq    >>> 0, 45)
  header[49] = f
  if (extra) {
    header.writeUInt32BE((x || 0) >>> 0, 50)
    header.writeUInt32BE((y || 0) >>> 0, 54)
  }

  const jpegBuf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)

  // v3.8.7 — never let a slow link build a queue: a dropped frame keeps latency
  // flat, while a queued frame delays every frame after it (the cursor feels laggy).
  if (ws.bufferedAmount > 1_200_000) {
    framesDropped++
    if (framesDropped === 1 || framesDropped % 100 === 0) {
      addLog('warn', `\u{1F5A5}\u{FE0F} [screen] \u062a\u0645 \u0625\u0633\u0642\u0627\u0637 ${framesDropped} \u0625\u0637\u0627\u0631\u0627\u064b \u2014 \u0627\u0644\u0634\u0628\u0643\u0629 \u0623\u0628\u0637\u0623 \u0645\u0646 \u0627\u0644\u0627\u0644\u062a\u0642\u0627\u0637`)
    }
    return
  }

  try { ws.send(Buffer.concat([header, jpegBuf])) } catch { /* ws closing */ }

  // Track FPS & log milestones
  const count = recordFrame(sessionId)
  if (count === 1 || count % 100 === 0) {
    const fps  = getSessionFps(sessionId)
    const kb   = (jpegBuf.length / 1024).toFixed(1)
    addLog('info', `📸 [screen] frame=${count} fps=${fps} size=${kb}KB ${width}×${height} session=${sessionId.slice(0,8)}`)
  }
})

ipcMain.on('screen-error', (_, p) => {
  addLog('warn', `🖥️ [screen] خطأ في البث — ${p.message}`)
  notify('AiRemote — خطأ في البث', `⚠️ ${p.message}`, 'warning')
  send({ type: 'agent:screen_error', payload: p, timestamp: Date.now() })
  clearSessionStats(p.sessionId)
  screenSessions.delete(p.sessionId)
  broadcastScreenSessions()
  refreshTray()
  if (screenSessions.size === 0) { releaseScreenAwakeForStream(); destroyCaptureWindow() }
})

ipcMain.on('screen-monitors', (_, p) => {
  send({ type: 'agent:screen_monitors', payload: p, timestamp: Date.now() })
})

ipcMain.on('screen-resized', (_, p) => {
  // Video intrinsic size changed (e.g. VM resolution switch) — refresh real display metrics
  try { updateCapSize(currentMonitorId) } catch {}
})

ipcMain.on('screen-track-ended', () => {
  // Capture source died (resolution change etc.) — restart capture for the active session
  const entry = [...screenSessions.entries()][0]
  if (!entry) return
  const [sid, info] = entry
  if (Date.now() - (lastCaptureRestartAt || 0) < 3000) return
  lastCaptureRestartAt = Date.now()
  addLog('warn', '[screen] capture stream ended — restarting')
  const cw = createCaptureWindow()
  const doSend = () => cw.webContents.send('start-capture', { sessionId: sid, fps: info.fps, quality: info.quality, monitorIndex: currentMonitorId, maxWidth: info.maxWidth })
  if (cw.webContents.isLoading()) cw.webContents.once('did-finish-load', doSend); else doSend()
})

// ─── App Lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
  createTray()
  // v3.2.2 — safety: auto-connect shortly after launch when configured
  setTimeout(() => { try { if (config.autoStart && config.serverUrl && config.token && agentState === 'stopped') startAgent() } catch {} }, 4000)
  setTimeout(() => { try { if (config.autoStart && config.serverUrl && config.token && agentState === 'stopped') startAgent() } catch {} }, 12000)
  app.on('activate', () => { if (!win || win.isDestroyed()) createWindow() })
})

app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  quitting = true
  stopAgent()
})
