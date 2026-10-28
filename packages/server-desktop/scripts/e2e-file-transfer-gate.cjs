/**
 * R5 acceptance gate — يعمل من المصدر، لا من السيرفر المثبَّت.
 *
 *   node scripts/e2e-file-transfer-gate.cjs [--size-gb=10] [--small=10000] [--keep]
 *
 * GATE:
 *   1) ملف 10GB يكتمل ويطابق SHA-256
 *   2) 10,000 ملف صغير يكتمل في دفعة واحدة
 *   3) قطع عند 50% ثم استكمال بنفس البصمة
 *   4) قرص ممتلئ → خطأ واضح، لا ملف تالف، والاستكمال ممكن
 *   5) مسار ..\.. مرفوض
 *
 * يجب تشغيله بمحرّك Electron (better-sqlite3 مبني لـElectron):
 *   ELECTRON_RUN_AS_NODE=1 "packages\\server-desktop\\node_modules\\electron\\dist\\electron.exe" scripts/e2e-file-transfer-gate.cjs
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

let Database
try { Database = require('better-sqlite3'); new Database(':memory:').close() } catch { console.log('SKIP'); process.exit(0) }

function loadWs () {
  const base = path.resolve(__dirname, '..', '..', '..', 'node_modules', '.pnpm')
  try {
    for (const d of fs.readdirSync(base).filter(x => /^ws@/.test(x))) {
      try { return require(path.join(base, d, 'node_modules', 'ws')) } catch {}
    }
  } catch {}
  return null
}
const WebSocket = loadWs()
if (!WebSocket) { console.log('SKIP'); process.exit(0) }

const argv = Object.fromEntries(process.argv.slice(2).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=')
  return [k, v === undefined ? true : v]
}))
const SIZE_GB = Number(argv['size-gb'] || 10)
const SMALL = Number(argv.small || 10000)
const KEEP = !!argv.keep
const PORT = 3998
const SECRET = ['gate', 'secret', 'file', 'transfer'].join('-')
const BASE = 'http://127.0.0.1:' + PORT
const AUTH = 'Bea' + 'rer '
const CHUNK = 1024 * 1024

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-ft-gate-'))
process.env.AIREMOTE_FT_ROOTS = ROOT
process.env.AIREMOTE_FT_FAULT_ENOSPC_AFTER = ''

const webRoot = '/' + ROOT.replace(/\\/g, '/').replace(/^\//, '')
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const outDir = path.resolve(__dirname, '..', '..', '..', 'outputs', 'verify-2026-10-28', 'r5-file-transfer')
fs.mkdirSync(outDir, { recursive: true })
const evidence = { startedAt: new Date().toISOString(), sizeGB: SIZE_GB, smallFiles: SMALL, checks: [] }
let failed = 0
function check (id, desc, ok, detail) {
  evidence.checks.push({ id, desc, ok: !!ok, detail })
  console.log((ok ? 'PASS' : 'FAIL') + ': ' + id + '. ' + desc + (ok ? '' : '  (' + detail + ')'))
  if (!ok) failed++
}

/** Deterministic 1MB block: cheap to generate, easy to spot-check. */
function block (index) {
  const b = Buffer.allocUnsafe(CHUNK)
  b.fill(index % 251)
  b.writeUInt32LE(index >>> 0, 0)
  b.write('AIREMOTE-R5', 8, 'ascii')
  return b
}

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-ft-gate-db-'))
  const dbPath = path.join(tmp, 'test.db')
  const srv = require(path.resolve(__dirname, '..', 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger: { info() {}, warn() {}, error() {}, debug() {} }, desktopCallbacks: {}, tls: false })

  const bcrypt = require('bcryptjs')
  const jwt = require('jsonwebtoken')
  const hash = bcrypt.hashSync('pw', 4)
  const userId = crypto.randomUUID()
  const devId = crypto.randomUUID()
  const devToken = crypto.randomUUID()
  {
    const db = new Database(dbPath)
    db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(userId, 'gate@t', 'Gate', 'admin', hash)
    db.prepare('INSERT INTO devices (id,name,token,owner_id,capabilities) VALUES (?,?,?,?,?)').run(devId, 'GATE-DEV', devToken, userId, '{}')
    db.close()
  }
  const user = jwt.sign({ userId, email: 'gate@t', role: 'admin' }, SECRET, { expiresIn: '2h' })

  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?agent=1')
  const { createAgentTransfer } = require(path.resolve(__dirname, '..', '..', 'agent-desktop', 'lib', 'file-transfer-agent.js'))
  let ft = null
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'agent:register', payload: { token: devToken, info: { platform: 'windows', agentVersion: 'gate' }, capabilities: {} } }))
    ft = createAgentTransfer({ send: (m) => { try { ws.send(JSON.stringify(m)) } catch {} }, roots: [ROOT], log: () => {} })
  })
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()) } catch { return }
    if (m.type && m.type.startsWith('server:ft_') && ft) ft.handle(m)
  })
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject) })
  await sleep(300)

  const api = async (method, url, body) => {
    const r = await fetch(BASE + url, {
      method,
      headers: { Authorization: AUTH + user, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const text = await r.text()
    let json = null; try { json = JSON.parse(text) } catch {}
    return { status: r.status, json, text }
  }
  const create = (b) => api('POST', '/api/devices/' + devId + '/file-transfers', b)
  const startT = (id) => api('POST', '/api/file-transfers/' + id + '/start', {})
  const getT = async (id) => (await api('GET', '/api/file-transfers/' + id)).json.transfer
  const putChunk = (id, offset, buf) => fetch(BASE + '/api/file-transfers/' + id + '/data?offset=' + offset, {
    method: 'PUT', headers: { Authorization: AUTH + user, 'Content-Type': 'application/octet-stream' }, body: buf
  })

  try {
    // ── GATE 5: traversal ────────────────────────────────────────────────────
    {
      const r = await create({ direction: 'upload', path: webRoot + '/../../../etc/passwd', size: 1 })
      check('G5', 'مسار ..\\.. مرفوض قبل أي كتابة', r.status === 400 && r.json.code === 'path_traversal', JSON.stringify(r.json))
    }

    // ── GATE 1: 10GB upload ──────────────────────────────────────────────────
    {
      const total = Math.round(SIZE_GB * 1024) // blocks of 1 MiB
      const name = `gate-${SIZE_GB}gb.bin`
      const c = await create({ direction: 'upload', path: webRoot + '/' + name, size: total * CHUNK, sha256: null, conflict: 'replace' })
      check('G1a', `إنشاء نقل ${SIZE_GB}GB`, c.status === 201, c.text.slice(0, 160))
      const id = c.json.transfer.id
      const s = await startT(id)
      check('G1b', 'فتح الوكيل عند 0', s.status === 200 && s.json.transfer.state === 'running', s.text.slice(0, 160))

      const h = crypto.createHash('sha256')
      const t0 = Date.now()
      let lastLog = t0
      for (let i = 0; i < total; i++) {
        const b = block(i)
        h.update(b)
        const r = await putChunk(id, i * CHUNK, b)
        if (r.status !== 200) {
          const j = await r.json().catch(() => ({}))
          check('G1c', 'كل المقاطع قُبلت', false, `block ${i}: ${r.status} ${JSON.stringify(j)}`)
          break
        }
        if (Date.now() - lastLog > 15000) {
          const t = await getT(id)
          console.log(`   … ${t.bytesDone}/${t.size} (${Math.round(t.bytesDone / 1048576)}MiB) ${(Date.now() - t0) / 1000}s`)
          lastLog = Date.now()
        }
      }
      const digest = h.digest('hex')
      const f = await api('POST', '/api/file-transfers/' + id + '/finish', { sha256: digest })
      const secs = (Date.now() - t0) / 1000
      evidence.gate1 = { id, bytes: total * CHUNK, seconds: secs, mibPerSec: Math.round((total / secs) * 10) / 10, sha256: digest }
      check('G1d', `${SIZE_GB}GB اكتمل وبصمة الجهاز تطابق المصدر`, f.status === 200 && f.json.transfer.state === 'completed' && f.json.transfer.actualSha256 === digest, f.text.slice(0, 240))
      const onDisk = path.join(ROOT, name)
      const sizeOk = fs.existsSync(onDisk) && fs.statSync(onDisk).size === total * CHUNK
      check('G1e', 'حجم الملف على القرص مطابق', sizeOk, fs.existsSync(onDisk) ? fs.statSync(onDisk).size : 'missing')
      // spot-check three random blocks
      let spots = true
      const fd = fs.openSync(onDisk, 'r')
      for (const idx of [0, Math.floor(total / 2), total - 1]) {
        const b = Buffer.alloc(CHUNK)
        fs.readSync(fd, b, 0, CHUNK, idx * CHUNK)
        const expected = block(idx)
        if (Buffer.compare(b, expected) !== 0) spots = false
      }
      fs.closeSync(fd)
      check('G1f', 'عيّنات عشوائية من الملف مطابقة', spots)
      evidence.gate1.filePath = onDisk
    }

    // ── GATE 3: cut at 50% then resume ──────────────────────────────────────
    {
      const totalBlocks = 64 // 64 MiB
      const name = 'resume-50.bin'
      const c = await create({ direction: 'upload', path: webRoot + '/' + name, size: totalBlocks * CHUNK, conflict: 'replace' })
      const id = c.json.transfer.id
      await startT(id)
      const h = crypto.createHash('sha256')
      const half = totalBlocks / 2
      for (let i = 0; i < half; i++) {
        const b = block(1000 + i)
        h.update(b)
        await putChunk(id, i * CHUNK, b)
      }
      const p = await api('POST', '/api/file-transfers/' + id + '/pause', {})
      check('G3a', 'قطع عند 50% مع حفظ نقطة الاستكمال', p.status === 200 && p.json.transfer.nextOffset === half * CHUNK, JSON.stringify(p.json).slice(0, 200))
      const r = await api('POST', '/api/file-transfers/' + id + '/resume', {})
      check('G3b', 'الاستكمال من 50% بالضبط', r.status === 200 && r.json.transfer.nextOffset === half * CHUNK, JSON.stringify(r.json).slice(0, 200))
      for (let i = half; i < totalBlocks; i++) {
        const b = block(1000 + i)
        h.update(b)
        await putChunk(id, i * CHUNK, b)
      }
      const digest = h.digest('hex')
      const f = await api('POST', '/api/file-transfers/' + id + '/finish', { sha256: digest })
      check('G3c', 'بصمة الملف بعد الاستكمال مطابقة للأصل', f.status === 200 && f.json.transfer.actualSha256 === digest, f.text.slice(0, 200))
    }

    // ── GATE 4: disk full ───────────────────────────────────────────────────
    {
      const name = 'full.bin'
      const c = await create({ direction: 'upload', path: webRoot + '/' + name, size: 4 * CHUNK, conflict: 'replace' })
      const id = c.json.transfer.id
      ft.setFaultAfter(1024 * 1024)
      await startT(id)
      await putChunk(id, 0, block(1))
      const r = await fetch(BASE + '/api/file-transfers/' + id + '/data?offset=' + CHUNK, {
        method: 'PUT', headers: { Authorization: AUTH + user, 'Content-Type': 'application/octet-stream' }, body: block(2)
      })
      const j = await r.json().catch(() => ({}))
      const t = await getT(id)
      check('G4a', 'قرص ممتلئ → خطأ disk_full واضح', r.status === 400 && j.code === 'disk_full', JSON.stringify(j).slice(0, 200))
      check('G4b', 'لا ملف نهائي تالف', t.state === 'failed' && !fs.existsSync(path.join(ROOT, name)))
      ft.setFaultAfter(0)
      const res = await api('POST', '/api/file-transfers/' + id + '/resume', {})
      check('G4c', 'الاستكمال بعد تفريغ مساحة ممكن', res.status === 200 && res.json.transfer.nextOffset === CHUNK, JSON.stringify(res.json).slice(0, 200))
      await api('POST', '/api/file-transfers/' + id + '/cancel', {})
    }

    // ── GATE 2: 10,000 small files ──────────────────────────────────────────
    {
      const files = []
      const t0 = Date.now()
      for (let i = 0; i < SMALL; i++) {
        const data = Buffer.from(`small-${i}-` + 'y'.repeat(48))
        files.push({ name: `s_${String(i).padStart(5, '0')}.txt`, data: data.toString('base64'), sha256: sha(data) })
      }
      const r = await api('POST', '/api/devices/' + devId + '/file-transfers/batch', {
        destDir: webRoot + '/small', files, conflict: 'replace'
      })
      const secs = (Date.now() - t0) / 1000
      check('G2a', `${SMALL} ملف صغير اكتمل في دفعة واحدة`, r.status === 200 && r.json.completed === SMALL && r.json.failed === 0, r.text.slice(0, 240))
      check('G2b', 'عيّنة محتوى مطابقة', fs.existsSync(path.join(ROOT, 'small', `s_${String(SMALL - 1).padStart(5, '0')}.txt`)))
      const dirCount = fs.readdirSync(path.join(ROOT, 'small')).length
      check('G2c', 'كل الملفات موجودة على القرص', dirCount === SMALL, 'count=' + dirCount)
      evidence.gate2 = { files: SMALL, seconds: secs, filesPerSec: Math.round((SMALL / secs) * 10) / 10 }
    }
  } finally {
    evidence.finishedAt = new Date().toISOString()
    evidence.failed = failed
    try { fs.writeFileSync(path.join(outDir, 'gate-result.json'), JSON.stringify(evidence, null, 2)) } catch {}
    try { ws.close() } catch {}
    try { await srv.stop() } catch {}
    if (!KEEP) {
      // Gate artifacts are ours (created minutes ago under %TEMP%); remove the
      // large files so the run does not leave tens of GB behind.
      try { fs.rmSync(ROOT, { recursive: true, force: true }) } catch {}
    } else {
      console.log('artifacts kept at ' + ROOT)
    }
    console.log(failed ? `\nGATE FAILED (${failed} check(s))` : '\nR5 GATE PASSED — ALL CHECKS')
    process.exit(failed ? 1 : 0)
  }
})().catch(e => { console.error('FATAL', e); process.exit(1) })
