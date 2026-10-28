#!/usr/bin/env node
'use strict'
/**
 * AiRemote — مسبار الأداء الموحّد (R0)
 *
 * يقيس مؤشرات §1.4 على جهاز حقيقي عبر /screen الثنائي، ويُخرج JSON موحّداً.
 * يدعم تكرار نوافذ القياس (--runs) وأخذ الوسيط لتفادي ضجيج سطح المكتب الساكن،
 * وبوابة انحدار بتفاوتات لكل مؤشر + أرضية ضجيج مطلقة (لا 10% موحّدة على قياس متغيّر).
 *
 * أمثلة:
 *   node scripts/perf/measure.cjs --device WIN10 --mode idle --seconds 10 --runs 3
 *   node scripts/perf/measure.cjs --device WIN10 --mode active --seconds 15
 *   node scripts/perf/measure.cjs --device WIN10 --mode idle --baseline docs/perf-baseline.json
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const CREDS_PATH = process.env.LAB_CREDS || 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name)
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

const HOST = arg('host', process.env.LAB_HOST || '127.0.0.1')
const PORT = arg('port', process.env.LAB_PORT || '3001')
const DEVICE = arg('device', process.env.LAB_DEVICE || 'WIN10')
const MODE = arg('mode', 'idle')
const SECONDS = parseInt(arg('seconds', process.env.LAB_SECONDS || '15'), 10)
const RUNS = parseInt(arg('runs', '1'), 10)
const WARMUP_MS = parseInt(arg('warmup', '2000'), 10)
const BASELINE = arg('baseline', null)
const OUT = arg('out', path.join('outputs', 'perf', `measure-${MODE}-${Date.now()}.json`))
const BASE = `https://${HOST}:${PORT}`

// تفاوتات افتراضية لكل مؤشر (نسبة) + أرضية ضجيج مطلقة.
// السبب: سطح المكتب الساكن يتراوح بين 1.1 و1.5 fps؛ نسبة 10% تعني فشلاً دائماً.
const DEFAULT_TOLERANCES = {
  idle:   { fps: 0.60, kbps: 0.25, avgFrameKB: 0.25, firstFrameMs: 0.50 },
  active: { fps: 0.25, kbps: 0.25, avgFrameKB: 0.30, firstFrameMs: 0.50 },
}
const DEFAULT_FLOORS = { fps: 0.5, kbps: 20, avgFrameKB: 5, firstFrameMs: 300 }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const median = (a) => {
  if (!a.length) return null
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const pct = (arr, p) => {
  if (!arr.length) return null
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const r2 = (n) => (typeof n === 'number' ? +n.toFixed(2) : n)

function die(msg) {
  console.error('ERROR: ' + msg)
  process.exit(2)
}

;(async () => {
  if (!fs.existsSync(CREDS_PATH)) die('ملف بيانات المختبر غير موجود: ' + CREDS_PATH)
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'))

  let health
  try {
    health = await fetch(BASE + '/health').then((r) => r.json())
  } catch (e) {
    die('السيرفر غير متاح على ' + BASE + ' — ' + e.message)
  }

  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
  }).then((r) => r.json())
  if (!login.token) die('فشل تسجيل الدخول بمستخدم المختبر')

  const auth = { Authorization: 'Bearer ' + login.token }
  const devicesRaw = await fetch(BASE + '/api/devices', { headers: auth }).then((r) => r.json())
  const devices = Array.isArray(devicesRaw) ? devicesRaw : devicesRaw.devices || []
  const dev = devices.find((d) => String(d.name).toLowerCase().includes(DEVICE.toLowerCase()))
  if (!dev) die(`الجهاز غير موجود: ${DEVICE}`)
  if (String(dev.status).toLowerCase() !== 'online') {
    die(`الجهاز ${dev.name} ليس online (الحالة: ${dev.status}) — شغّل الوكيل أولاً؛ لا أرقام من جهاز نائم.`)
  }
  let devInfo = {}
  try { devInfo = typeof dev.info === 'string' ? JSON.parse(dev.info) : (dev.info || {}) } catch {}

  const { ticket } = await fetch(BASE + '/api/auth/ws-ticket', {
    method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: '{}',
  }).then((r) => r.json())

  const url = `wss://${HOST}:${PORT}/screen?ticket=${ticket}&deviceId=${dev.id}&binary=1&fps=18&quality=60&maxWidth=1600`
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  const st = { frames: 0, bytes: 0, key: 0, delta: 0, webp: 0, jpeg: 0, dims: new Map(), gaps: [], last: 0, errors: [], firstFrameMs: null, t0: 0 }

  ws.onmessage = (ev) => {
    if (typeof ev.data === 'string') {
      try { const m = JSON.parse(ev.data); if (m.type && /error|denied/.test(m.type)) st.errors.push(m.type) } catch {}
      return
    }
    const b = Buffer.from(ev.data)
    if (b.length < 13) return
    if (st.firstFrameMs === null) st.firstFrameMs = Date.now() - st.t0
    st.frames++; st.bytes += b.length
    const flags = b[12]
    if (flags & 1) st.key++
    if (flags & 2) st.delta++
    const off = flags & 2 ? 21 : 13
    const magic = b.slice(off, off + 12).toString('ascii')
    if (magic.startsWith('RIFF') && magic.includes('WEBP')) st.webp++
    else if (b[off] === 0xff && b[off + 1] === 0xd8) st.jpeg++
    const dim = `${b.readUInt32BE(0)}x${b.readUInt32BE(4)}`
    st.dims.set(dim, (st.dims.get(dim) || 0) + 1)
    const now = Date.now()
    if (st.last) st.gaps.push(now - st.last)
    st.last = now
  }
  ws.onerror = (e) => st.errors.push(String((e && e.message) || 'ws error'))

  await new Promise((res, rej) => {
    ws.onopen = res
    setTimeout(() => rej(new Error('انتهت مهلة فتح السوكِت')), 10000)
  })
  st.t0 = Date.now()
  await sleep(WARMUP_MS)

  const windows = []
  for (let i = 0; i < RUNS; i++) {
    const f0 = st.frames, b0 = st.bytes, k0 = st.key, d0 = st.delta, g0 = st.gaps.length
    const t0 = Date.now()
    await sleep(SECONDS * 1000)
    const dt = (Date.now() - t0) / 1000
    const frames = st.frames - f0, bytes = st.bytes - b0
    if (frames === 0) die('لم تُستلم أي إطارات في نافذة القياس — تحقق من الجلسة والبث قبل تسجيل رقم.')
    windows.push({
      seconds: +dt.toFixed(2), frames, bytes,
      fps: frames / dt, kbps: bytes / 1024 / dt, avgFrameKB: bytes / frames / 1024,
      key: st.key - k0, delta: st.delta - d0,
      gaps: st.gaps.slice(g0),
    })
    if (i < RUNS - 1) await sleep(500)
  }
  try { ws.close() } catch {}

  const pool = windows.flatMap((w) => w.gaps)
  const totalFrames = windows.reduce((a, w) => a + w.frames, 0)
  const totalKey = windows.reduce((a, w) => a + w.key, 0)

  const metrics = {
    fps: r2(median(windows.map((w) => w.fps))),
    kbps: r2(median(windows.map((w) => w.kbps))),
    avgFrameKB: r2(median(windows.map((w) => w.avgFrameKB))),
    frameGapP50ms: pct(pool, 50),
    frameGapP95ms: pct(pool, 95),
    fullFrameRatio: totalFrames ? +(totalKey / totalFrames).toFixed(3) : null,
    firstFrameMs: st.firstFrameMs,
    payload: { webp: st.webp, jpeg: st.jpeg },
    dimsSeen: [...st.dims.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`),
  }

  const record = {
    tool: 'scripts/perf/measure.cjs', schema: 2,
    measuredAt: new Date().toISOString(),
    mode: MODE, runs: RUNS, durationSec: +windows.reduce((a, w) => a + w.seconds, 0).toFixed(2),
    server: { version: health.version, port: health.port, tls: !!health.tls },
    device: { name: dev.name, id: dev.id, agentVersion: devInfo.agentVersion || null, platform: devInfo.platform || null },
    station: { host: HOST, port: PORT, requestedFps: 18, quality: 60, maxWidth: 1600, binary: true },
    windows: windows.map((w) => ({ seconds: w.seconds, frames: w.frames, fps: r2(w.fps), kbps: r2(w.kbps), avgFrameKB: r2(w.avgFrameKB) })),
    metrics, verdict: null,
  }

  if (BASELINE) {
    if (!fs.existsSync(BASELINE)) die('ملف خط الأساس غير موجود: ' + BASELINE)
    const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'))
    const bm = (base.benchmarks || {})[MODE]
    if (!bm) die(`لا يوجد خط أساس للوضع "${MODE}" في ${BASELINE}`)
    const tol = { ...(DEFAULT_TOLERANCES[MODE] || DEFAULT_TOLERANCES.idle), ...((base.tolerances || {})[MODE] || {}) }
    const floors = { ...DEFAULT_FLOORS, ...(base.floors || {}) }

    const checks = []
    const cmp = (name, cur, ref, higherIsBetter) => {
      if (typeof cur !== 'number' || typeof ref !== 'number' || ref === 0) return
      const diff = cur - ref
      const abs = Math.abs(diff)
      const floor = floors[name] ?? 0
      const rel = diff / Math.abs(ref)
      const beyondTol = higherIsBetter ? rel < -tol[name] : rel > tol[name]
      const beyondFloor = abs > floor
      checks.push({
        name, current: cur, baseline: ref,
        deltaPct: +(rel * 100).toFixed(1),
        tolerancePct: +((tol[name] || 0) * 100).toFixed(0),
        noiseFloor: floor,
        regression: !!(beyondTol && beyondFloor),
      })
    }
    cmp('fps', metrics.fps, bm.fps, true)
    cmp('avgFrameKB', metrics.avgFrameKB, bm.avgFrameKB, false)
    cmp('kbps', metrics.kbps, bm.kbps, false)
    cmp('firstFrameMs', metrics.firstFrameMs, bm.firstFrameMs, false)

    record.verdict = {
      baseline: BASELINE, mode: MODE,
      rule: 'انحدار = تجاوز التفاوت النسبي AND تجاوز أرضية الضجيج المطلقة',
      checks, failed: checks.filter((c) => c.regression).length,
    }
  }

  const outPath = path.isAbsolute(OUT) ? OUT : path.join(ROOT, OUT)
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(record, null, 2), 'utf8')

  console.log(JSON.stringify(record, null, 2))
  console.log('\n📄 ' + outPath)

  if (record.verdict && record.verdict.failed > 0) {
    console.error(`\nFAIL: ${record.verdict.failed} مؤشر(ات) تدهورت خارج التفاوت المسموح`)
    process.exit(1)
  }
})().catch((e) => die(e && e.message ? e.message : String(e)))
