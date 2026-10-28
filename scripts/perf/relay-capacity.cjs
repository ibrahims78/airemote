#!/usr/bin/env node
'use strict'
/**
 * R4 — مسبار سعة Relay: يقيس أثر التزامن على زمن تمرير الحزم.
 *
 * يفتح N جلسة وكيل‑بوكيل حقيقية (2N مقبساً) على سيرفر المصدر، يمرّر حزماً
 * بحجم ثابت، ويسجّل p50/p95 للزمن أحادي الاتجاه + نسبة الحزم المفقودة.
 *
 * التشغيل (يحتاج better-sqlite3 المبني لـElectron):
 *   $env:ELECTRON_RUN_AS_NODE='1'
 *   node_modules\.pnpm\electron@28.3.3\node_modules\electron\dist\electron.exe scripts/perf/relay-capacity.cjs --sessions 20
 *
 * الخيارات: --sessions N (افتراضي 20) --frames K (افتراضي 40) --size B (افتراضي 2048) --port P (افتراضي 3999)
 * المخرجات: outputs/perf/r4/relay-capacity-<N>.json + جدول في الطرفية.
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..', '..')
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name)
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt
}
const SESSIONS = Math.max(1, parseInt(arg('sessions', '20'), 10))
const FRAMES = Math.max(5, parseInt(arg('frames', '40'), 10))
const SIZE = Math.max(64, parseInt(arg('size', '2048'), 10))
const PORT = parseInt(arg('port', '3999'), 10)

let Database
try { Database = require(require.resolve('better-sqlite3', { paths: [path.join(ROOT, 'packages', 'server-desktop')] })); new Database(':memory:').close() } catch (e) { console.error('SKIP: better-sqlite3 not usable here — ' + e.message); process.exit(0) }
const fromServer = (m) => require(require.resolve(m, { paths: [path.join(ROOT, 'packages', 'server-desktop')] }))
const jwt = fromServer('jsonwebtoken')
const bcrypt = fromServer('bcryptjs')

function loadWs() {
  try { return require('ws') } catch {}
  const base = path.join(ROOT, 'node_modules', '.pnpm')
  try {
    for (const d of fs.readdirSync(base).filter(x => /^ws@/.test(x))) {
      try { return require(path.join(base, d, 'node_modules', 'ws')) } catch {}
    }
  } catch {}
  return null
}
const WebSocket = loadWs()
if (!WebSocket) { console.error('SKIP: ws not found'); process.exit(0) }

const SECRET = crypto.randomBytes(24).toString('hex')
const BASE = 'http://127.0.0.1:' + PORT

function client() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?agent=1')
    const q = []
    const waiters = []
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw.toString()) } catch { return }
      const i = waiters.findIndex(w => w.type === m.type)
      if (i >= 0) { const w = waiters.splice(i, 1)[0]; clearTimeout(w.t); w.resolve(m) } else q.push(m)
    })
    ws.on('open', () => resolve({
      ws, send: (o) => ws.send(JSON.stringify(o)),
      next(type, ms = 8000) {
        const i = q.findIndex(m => m.type === type)
        if (i >= 0) return Promise.resolve(q.splice(i, 1)[0])
        return new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error('timeout ' + type)), ms)
          waiters.push({ type, resolve: res, t })
        })
      },
    }))
    ws.on('error', reject)
  })
}

const pct = (arr, p) => {
  if (!arr.length) return 0
  const s = arr.slice().sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * s.length) - 1))]
}

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-cap-'))
  const dbPath = path.join(tmp, 'cap.db')
  const srv = require(path.resolve(ROOT, 'packages', 'server-desktop', 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger: { info() {}, warn() {}, error() {}, debug() {} }, desktopCallbacks: {}, tls: false })

  const hash = bcrypt.hashSync('pw', 4)
  const userId = crypto.randomUUID()
  const agents = []   // [{ reqId, tgtId, reqSocket, tgtSocket }]
  {
    const db = new Database(dbPath)
    db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(userId, 'cap@perf', 'Cap', 'manager', hash)
    const ins = db.prepare('INSERT INTO devices (id,name,token,owner_id) VALUES (?,?,?,?)')
    for (let i = 0; i < SESSIONS; i++) {
      const reqId = crypto.randomUUID(), tgtId = crypto.randomUUID()
      const reqTok = crypto.randomUUID(), tgtTok = crypto.randomUUID()
      ins.run(reqId, 'req-' + i, reqTok, userId)
      ins.run(tgtId, 'tgt-' + i, tgtTok, userId)
      agents.push({ reqId, tgtId, reqTok, tgtTok })
    }
    db.close()
  }
  const token = jwt.sign({ userId, email: 'cap@perf', role: 'manager' }, SECRET, { expiresIn: '1h' })
  const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }

  // سجّل كل المقابس
  for (const a of agents) {
    a.reqSocket = await client()
    a.reqSocket.send({ type: 'agent:register', payload: { token: a.reqTok, info: { platform: 'windows' }, capabilities: {} } })
    await a.reqSocket.next('server:registered')
    a.tgtSocket = await client()
    a.tgtSocket.send({ type: 'agent:register', payload: { token: a.tgtTok, info: { platform: 'windows' }, capabilities: {} } })
    await a.tgtSocket.next('server:registered')
  }

  // افتح الجلسات: طلب → موافقة → hello للطرفين
  const t0 = Date.now()
  for (const a of agents) {
    const r = await fetch(BASE + '/api/relay/request', {
      method: 'POST', headers: H,
      body: JSON.stringify({ targetDeviceId: a.tgtId, access: 'control', requesterDeviceId: a.reqId }),
    })
    const body = await r.json()
    if (!r.ok) throw new Error('request failed: ' + r.status + ' ' + JSON.stringify(body))
    a.sessionId = body.sessionId
    await a.tgtSocket.next('session:offer')
    a.tgtSocket.send({ type: 'session:accept', payload: { sessionId: a.sessionId } })
    const tkT = await a.tgtSocket.next('session:token')
    const tkR = await a.reqSocket.next('session:token')
    a.reqSocket.send({ type: 'relay:hello', payload: { sessionId: a.sessionId, token: tkR.payload.token } })
    await a.reqSocket.next('session:ready')
    a.tgtSocket.send({ type: 'relay:hello', payload: { sessionId: a.sessionId, token: tkT.payload.token } })
    await a.tgtSocket.next('session:ready')
  }
  const setupMs = Date.now() - t0

  // مرّر الحزم وقس الزمن أحادي الاتجاه
  const payload = 'x'.repeat(SIZE)
  const latencies = []
  let sent = 0, received = 0
  const t1 = Date.now()
  for (let f = 0; f < FRAMES; f++) {
    const batch = []
    for (const a of agents) {
      const started = process.hrtime.bigint()
      a.reqSocket.send({ type: 'relay:data', payload: { sessionId: a.sessionId, channel: 'control', data: { seq: f, blob: payload } } })
      sent++
      batch.push(a.tgtSocket.next('relay:data', 10000).then(() => {
        received++
        latencies.push(Number(process.hrtime.bigint() - started) / 1e6)
      }).catch(() => { }))
    }
    await Promise.all(batch)
  }
  const elapsed = Date.now() - t1
  const bytes = sent * SIZE

  const report = {
    at: new Date().toISOString(),
    sessions: SESSIONS,
    framesPerSession: FRAMES,
    frameBytes: SIZE,
    setupMs,
    elapsedMs: elapsed,
    sent, received,
    lossPercent: sent ? +(((sent - received) / sent) * 100).toFixed(2) : 0,
    throughputKBps: elapsed ? +((bytes / 1024) / (elapsed / 1000)).toFixed(1) : 0,
    latencyMs: { p50: +pct(latencies, 50).toFixed(2), p95: +pct(latencies, 95).toFixed(2), max: +Math.max(0, ...latencies).toFixed(2) },
  }

  const outDir = path.join(ROOT, 'outputs', 'perf', 'r4')
  fs.mkdirSync(outDir, { recursive: true })
  const outFile = path.join(outDir, 'relay-capacity-' + SESSIONS + '-s' + SIZE + '.json')
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2))

  console.log('R4 relay capacity — sessions=' + SESSIONS + ' frames/session=' + FRAMES + ' frame=' + SIZE + 'B')
  console.log('  setup            ' + setupMs + ' ms')
  console.log('  sent / received  ' + sent + ' / ' + received + '  (loss ' + report.lossPercent + '%)')
  console.log('  throughput       ' + report.throughputKBps + ' KB/s')
  console.log('  latency p50/p95  ' + report.latencyMs.p50 + ' / ' + report.latencyMs.p95 + ' ms  (max ' + report.latencyMs.max + ')')
  console.log('  report           ' + outFile)
  process.exit(report.lossPercent > 0 ? 1 : 0)
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2) })
