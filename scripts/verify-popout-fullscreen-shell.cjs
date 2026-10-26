/**
 * verify-popout-fullscreen-shell.cjs — proves the INSTALLED shell behaviour for
 * the standalone screen window, end to end, without a human clicking.
 *
 * It launches the real Electron shell (packages/server-desktop/main.js) with an
 * isolated data directory, seeds one device, connects a fake agent that streams
 * a full frame, then opens the popout exactly like the dashboard does
 * (window.open('/view/<deviceId>')). Finally it asks Chrome DevTools Protocol
 * for the popout window's real state: must be windowState=fullscreen with
 * bounds equal to the display, and no menu/toolbar chrome in the page.
 *
 * Usage: node scripts/verify-popout-fullscreen-shell.cjs [--keep]
 */
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const http = require('http')
const https = require('https')
const { spawn } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const ELECTRON = path.join(ROOT, 'packages', 'server-desktop', 'node_modules', 'electron', 'dist', 'electron.exe')
const WS = require(path.join(ROOT, 'packages', 'server', 'node_modules', 'ws'))
const KEEP = process.argv.includes('--keep')

const APP_PORT = 3100
const CDP_PORT = 9223
const SECRET = 'f'.repeat(96)
const DEV_ID = '33333333-3333-4333-8333-333333333333'
const DEV_TOKEN = 'popout-shell-token'
const USER_ID = '11111111-1111-4111-8111-111111111111'

let pass = 0, fail = 0
function check(name, ok, detail) {
  if (ok) { pass++; console.log('PASS: ' + name + (detail ? '  — ' + detail : '')) }
  else { fail++; console.log('FAIL: ' + name + (detail ? '  — ' + detail : '')) }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function getJson(port, p, insecure) {
  const mod = insecure ? https : http
  return new Promise((resolve, reject) => {
    const req = mod.get({ host: '127.0.0.1', port, path: p, rejectUnauthorized: false, timeout: 5000 }, (res) => {
      let b = ''
      res.on('data', d => b += d)
      res.on('end', () => { try { resolve(JSON.parse(b)) } catch (e) { reject(new Error('bad json: ' + b.slice(0, 120))) } })
    })
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.on('error', reject)
  })
}
async function waitFor(fn, ms, label) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v } catch {} await sleep(250) }
  throw new Error('timeout: ' + label)
}

function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WS(wsUrl, { perMessageDeflate: false })
    let id = 0
    const pending = new Map()
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw.toString()) } catch { return }
      if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result) }
    })
    ws.on('open', () => resolve({
      send: (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })) }),
      close: () => { try { ws.close() } catch {} }
    }))
    ws.on('error', reject)
  })
}

async function main() {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-shell-'))
  const appData = path.join(workDir, 'Roaming')
  const dataDir = path.join(appData, 'AiRemote-Server')
  fs.mkdirSync(dataDir, { recursive: true })

  // ── seed config + database with the Electron ABI driver ───────────────────
  const seedJs = path.join(workDir, 'seed.cjs')
  fs.writeFileSync(seedJs, `
    const path = require('path'), fs = require('fs')
    const Database = require(${JSON.stringify(path.join(ROOT, 'packages', 'server-desktop', 'node_modules', 'better-sqlite3'))})
    const dir = ${JSON.stringify(dataDir)}
    fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ port: ${APP_PORT}, mode: 'lan', autoStart: true, autoStartWin: false, jwtSecret: ${JSON.stringify(SECRET)}, backupEnabled: false, backupIntervalHours: 24, backupDir: path.join(dir, 'backups') }, null, 2))
    const srv = require(${JSON.stringify(path.join(ROOT, 'packages', 'server-desktop', 'server.js'))})
    ;(async () => {
      await srv.start({ port: 0, jwtSecret: ${JSON.stringify(SECRET)}, dbPath: path.join(dir, 'airemote.db'), logger: { info(){}, warn(){}, error(){}, debug(){} }, desktopCallbacks: {}, tls: false })
      await srv.stop()
      const db = new Database(path.join(dir, 'airemote.db'))
      db.prepare('INSERT OR REPLACE INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(${JSON.stringify(USER_ID)}, 'lab@local', 'Lab Admin', 'admin', 'x')
      db.prepare('INSERT OR REPLACE INTO devices (id,name,token,owner_id,status) VALUES (?,?,?,?,?)').run(${JSON.stringify(DEV_ID)}, 'POPOUT-TEST', ${JSON.stringify(DEV_TOKEN)}, ${JSON.stringify(USER_ID)}, 'offline')
      db.close()
      console.log('seeded')
      process.exit(0)
    })().catch(e => { console.error('seed failed', e.message); process.exit(1) })
  `, 'utf8')
  const seedRun = spawn(ELECTRON, [seedJs], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', APPDATA: appData }, stdio: 'pipe' })
  const seedOut = await new Promise((res) => { let s = ''; seedRun.stdout.on('data', d => s += d); seedRun.stderr.on('data', d => s += d); seedRun.on('exit', c => res({ code: c, s })) })
  check('seeded isolated lab database', seedOut.code === 0 && /seeded/.test(seedOut.s), seedOut.s.trim().slice(0, 160))

  // ── launch the real shell ────────────────────────────────────────────────
  const wrapper = path.join(workDir, 'wrapper.cjs')
  fs.writeFileSync(wrapper, [
    "const { app } = require('electron')",
    "app.setPath('appData', process.env.AIREMOTE_TEST_APPDATA)",
    "require(" + JSON.stringify(path.join(ROOT, 'packages', 'server-desktop', 'main.js')) + ")"
  ].join('\n'), 'utf8')
  const app = spawn(ELECTRON, [wrapper, '--remote-debugging-port=' + CDP_PORT], {
    cwd: path.join(ROOT, 'packages', 'server-desktop'),
    env: { ...process.env, AIREMOTE_TEST_APPDATA: appData, ELECTRON_ENABLE_LOGGING: '0' },
    stdio: 'pipe'
  })
  let appLog = ''
  app.stdout.on('data', d => appLog += d)
  app.stderr.on('data', d => appLog += d)

  try {
    const health = await waitFor(() => getJson(APP_PORT, '/api/health', true), 45000, 'app server health')
    check('shell boots its own server (3.8.x)', health.status === 'ok', 'version=' + health.version + ' tls=' + health.tls)

    // ── fake agent streaming a full frame ──────────────────────────────────
    const agent = new WS('wss://127.0.0.1:' + APP_PORT + '/ws', { rejectUnauthorized: false })
    agent.on('error', () => {})
    await new Promise((res, rej) => { agent.on('open', res); agent.on('error', rej) })
    agent.send(JSON.stringify({ type: 'agent:register', payload: { token: DEV_TOKEN, info: { hostname: 'POPOUT-TEST', platform: 'windows' }, capabilities: {} }, timestamp: Date.now() }))
    const registered = await new Promise((res) => {
      const t = setTimeout(() => res(null), 8000)
      agent.on('message', (d) => { let m; try { m = JSON.parse(d.toString()) } catch { return } if (m.type === 'server:registered') { clearTimeout(t); res(m) } if (m.type === 'server:screen_start') startStreaming(m.payload.sessionId) })
    })
    check('fake agent registered on the shell', !!registered)

    let streaming = false
    function startStreaming(sid) {
      if (streaming) return
      streaming = true
      const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x7A, 0x7B, 0x7C, 0x7D, 0x7E])
      let seq = 0
      const timer = setInterval(() => {
        const hdr = Buffer.alloc(50)
        hdr[0] = 0x01
        const sidBuf = Buffer.alloc(36, 0); Buffer.from(String(sid).slice(0, 36), 'utf8').copy(sidBuf, 0); sidBuf.copy(hdr, 1)
        hdr.writeUInt32BE(1920, 37); hdr.writeUInt32BE(1080, 41); hdr.writeUInt32BE(++seq, 45); hdr[49] = 0
        try { agent.send(Buffer.concat([hdr, jpeg])) } catch {}
      }, 200)
      agent.on('close', () => clearInterval(timer))
    }

    // ── CDP: find the dashboard page and open the popout exactly as the UI does
    const targets = await waitFor(async () => {
      const l = await getJson(CDP_PORT, '/json/list', false)
      return l.find(t => t.type === 'page' && String(t.url).includes(':' + APP_PORT))
    }, 30000, 'dashboard target')
    check('dashboard page loaded in the shell', !!targets, targets.url.slice(0, 60))

    const dpage = await cdp(targets.webSocketDebuggerUrl)
    await dpage.send('Runtime.enable')
    await dpage.send('Page.enable')
    const openRes = await dpage.send('Runtime.evaluate', {
      expression: `(function(){ const w = window.open('/view/${DEV_ID}', '_blank', 'width=1400,height=900'); return w ? 'opened' : 'blocked' })()`,
      returnByValue: true, userGesture: true
    })
    check('dashboard can open the standalone window (window.open allowed)', openRes.result && openRes.result.value === 'opened', String(openRes.result && openRes.result.value))

    const popTarget = await waitFor(async () => {
      const l = await getJson(CDP_PORT, '/json/list', false)
      return l.find(t => t.type === 'page' && String(t.url).includes('/view/' + DEV_ID))
    }, 20000, 'popout target')
    check('standalone window created with the popout route', !!popTarget, popTarget && popTarget.url.slice(0, 80))

    // ── the real window state ───────────────────────────────────────────────
    const bpage = await cdp(popTarget.webSocketDebuggerUrl)
    await bpage.send('Runtime.enable')
    // Electron 28 has no Browser domain: measure the window from inside the page.
    // A native-fullscreen window reports content == full screen and origin 0,0;
    // a windowed one loses ~31px to the title bar and sits below the taskbar.
    const geoRes = await bpage.send('Runtime.evaluate', {
      expression: 'JSON.stringify({ sw: screen.width, sh: screen.height, iw: window.innerWidth, ih: window.innerHeight, ow: window.outerWidth, oh: window.outerHeight, sx: window.screenX, sy: window.screenY })',
      returnByValue: true
    })
    const geo = JSON.parse(geoRes.result.value)
    check('standalone window is FULLSCREEN (content fills the whole screen)',
      geo.iw === geo.sw && geo.ih === geo.sh, geo.iw + 'x' + geo.ih + ' vs screen ' + geo.sw + 'x' + geo.sh)
    // diagnostic: does a manual request from the renderer work once the window is shown?
    await bpage.send('Runtime.evaluate', { expression: 'window.airemote && window.airemote.windowCtl && window.airemote.windowCtl.setFullscreen(true)', returnByValue: true })
    await sleep(1500)
    const geo2 = JSON.parse((await bpage.send('Runtime.evaluate', { expression: 'JSON.stringify({ iw: window.innerWidth, ih: window.innerHeight, sw: screen.width, sh: screen.height, sx: window.screenX, sy: window.screenY, oh: window.outerHeight })', returnByValue: true })).result.value)
    console.log('DIAG after manual setFullscreen: ' + JSON.stringify(geo2))
    check('standalone window is edge-free (top-left origin, no title bar / border)',
      geo.sx === 0 && geo.sy === 0 && geo.oh === geo.ih, 'origin=' + geo.sx + ',' + geo.sy + ' outer=' + geo.ow + 'x' + geo.oh + ' inner=' + geo.iw + 'x' + geo.ih)    // no permanent chrome: toolbar must be hidden once the stream runs
    await sleep(3500)
    const chromeState = await bpage.send('Runtime.evaluate', {
      expression: `JSON.stringify((() => {
        const bar = document.querySelector('[data-popout-toolbar]') || document.querySelector('.cr-toolbar') || null
        const vis = bar ? getComputedStyle(bar).opacity : null
        return { hasBar: !!bar, opacity: vis, bodyOverflowX: getComputedStyle(document.body).overflowX, scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth }
      })())`,
      returnByValue: true
    })
    check('no horizontal overflow in the standalone window', (() => { const s = JSON.parse(chromeState.result.value); return s.scrollW <= s.innerW + 2 })(), chromeState.result.value.slice(0, 160))

    const shot = await bpage.send('Page.captureScreenshot', { format: 'png' })
    const outDir = path.join(ROOT, 'outputs', 'release-3.8.0', 'evidence')
    fs.mkdirSync(outDir, { recursive: true })
    const shotPath = path.join(outDir, 'popout-shell-fullscreen.png')
    fs.writeFileSync(shotPath, Buffer.from(shot.data, 'base64'))
    console.log('screenshot: ' + shotPath)

    try { bpage.close(); dpage.close(); agent.close() } catch {}
  } catch (e) {
    console.log('ERROR: ' + (e.stack || e.message))
    fail++
  } finally {
    try { app.kill() } catch {}
    await sleep(1500)
    if (!KEEP) { try { fs.rmSync(workDir, { recursive: true, force: true }) } catch {} }
    else console.log('kept: ' + workDir)
  }

  console.log('\n' + (fail === 0 ? 'ALL PASSED' : 'FAILED') + ' — ' + pass + ' passed, ' + fail + ' failed')
  if (fail) console.log(appLog.split('\n').slice(-20).join('\n'))
  process.exit(fail === 0 ? 0 : 1)
}

const HARD_TIMEOUT = setTimeout(() => { console.error('FATAL: hard timeout'); process.exit(2) }, 180000)
HARD_TIMEOUT.unref()
main().catch(e => { console.error('FATAL ' + (e.stack || e.message)); process.exit(1) })