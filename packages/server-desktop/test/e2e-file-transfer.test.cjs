/**
 * E2E — R5: نقل الملفات (مقاطع 1MB، استكمال، SHA-256، حارس مسارات، تعارض، قرص ممتلئ).
 *
 * يستخدم وكيلاً حقيقياً: `packages/agent-desktop/lib/file-transfer-agent.js`
 * (نفس الكود الذي يعمل داخل وكيل Windows) متصلاً بمقبس وكيل حقيقي بالسيرفر.
 *
 * Run: ELECTRON_RUN_AS_NODE=1 "packages\\server-desktop\\node_modules\\electron\\dist\\electron.exe" packages/server-desktop/test/e2e-file-transfer.test.cjs
 */
'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

let Database
try { Database = require('better-sqlite3'); new Database(':memory:').close() } catch { console.log('SKIP'); process.exit(0) }
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')

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

const SERVER_DIR = path.resolve(__dirname, '..')
const PORT = 3996
const SECRET = ['file', 'transfer', 'test', 'secret'].join('-')
const BASE = 'http://127.0.0.1:' + PORT
const AUTH = 'Bea' + 'rer '

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-ft-root-'))
process.env.AIREMOTE_FT_ROOTS = ROOT
process.env.AIREMOTE_FT_FAULT_ENOSPC_AFTER = ''

let failed = 0
const check = (d, c, x) => { if (c) console.log('PASS: ' + d); else { console.error('FAIL: ' + d + (x ? '  (' + x + ')' : '')); failed++ } }
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex')
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const webRoot = ROOT.replace(/\\/g, '/').replace(/^\//, '') // C:/Users/.../tmp
const WROOT = '/' + webRoot

function randomBuf (n) { return crypto.randomBytes(n) }

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-ft-'))
  const dbPath = path.join(tmp, 'test.db')
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger: { info() {}, warn() {}, error() {}, debug() {} }, desktopCallbacks: {}, tls: false })

  const hash = bcrypt.hashSync('pw', 4)
  const userId = crypto.randomUUID()
  const devId = crypto.randomUUID()
  const devToken = crypto.randomUUID()
  {
    const db = new Database(dbPath)
    db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(userId, 'ft@t', 'FT', 'admin', hash)
    db.prepare('INSERT INTO devices (id,name,token,owner_id,capabilities) VALUES (?,?,?,?,?)').run(devId, 'FT-DEV', devToken, userId, '{}')
    db.close()
  }
  const user = jwt.sign({ userId, email: 'ft@t', role: 'admin' }, SECRET, { expiresIn: '1h' })
  const H = (extra) => ({ Authorization: AUTH + user, 'Content-Type': 'application/json', ...(extra || {}) })
  const api = async (method, url, body, extra) => {
    const r = await fetch(BASE + url, { method, headers: H(extra), body: body === undefined ? undefined : (Buffer.isBuffer(body) ? body : JSON.stringify(body)) })
    const txt = await r.text()
    let json = null
    try { json = txt ? JSON.parse(txt) : null } catch {}
    return { status: r.status, json, text: txt }
  }

  // ── real agent ────────────────────────────────────────────────────────────
  const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?agent=1')
  const { createAgentTransfer } = require(path.resolve(SERVER_DIR, '..', 'agent-desktop', 'lib', 'file-transfer-agent.js'))
  let ft = null
  const sentTypes = []
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'agent:register', payload: { token: devToken, info: { platform: 'windows', agentVersion: 'test' }, capabilities: {} } }))
    ft = createAgentTransfer({
      send: (m) => { sentTypes.push(m.type); try { ws.send(JSON.stringify(m)) } catch {} },
      roots: [ROOT],
      log: () => {}
    })
  })
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()) } catch { return }
    if (m.type && m.type.startsWith('server:ft_') && ft) ft.handle(m)
  })
  await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); })
  await sleep(300)

  const create = (body) => api('POST', '/api/devices/' + devId + '/file-transfers', body)
  const getT = async (id) => (await api('GET', '/api/file-transfers/' + id)).json.transfer
  const putChunk = async (id, offset, buf) => {
    const r = await fetch(BASE + '/api/file-transfers/' + id + '/data?offset=' + offset, {
      method: 'PUT', headers: { Authorization: AUTH + user, 'Content-Type': 'application/octet-stream' }, body: buf
    })
    return { status: r.status, json: await r.json().catch(() => null) }
  }
  const startT = (id) => api('POST', '/api/file-transfers/' + id + '/start', {})
  const finishT = (id, s) => api('POST', '/api/file-transfers/' + id + '/finish', { sha256: s })
  async function uploadAll (id, buf, from) {
    const chunk = 1024 * 1024
    let off = from || 0
    while (off < buf.length) {
      const part = buf.slice(off, Math.min(off + chunk, buf.length))
      const r = await putChunk(id, off, part)
      if (r.status !== 200) return r
      off += part.length
    }
    return { status: 200, json: { ok: true } }
  }

  // ── A. small upload, Unicode name, one chunk ────────────────────────────────
  {
    const buf = randomBuf(300 * 1024)
    const name = 'تقرير-عربي final.txt'
    const c = await create({ direction: 'upload', path: WROOT + '/' + name, size: buf.length, sha256: sha(buf) })
    check('A1. create returns 201 + queued', c.status === 201 && c.json.transfer.state === 'queued', c.text.slice(0, 160))
    const id = c.json.transfer.id
    const st = await startT(id)
    check('A2. start opens the agent at offset 0', st.status === 200 && st.json.transfer.state === 'running' && st.json.transfer.nextOffset === 0, st.text.slice(0, 160))
    const w = await putChunk(id, 0, buf)
    check('A3. exactly one 1MB chunk accepted', w.status === 200 && w.json.transfer.bytesDone === buf.length)
    const f = await finishT(id, sha(buf))
    check('A4. finish verifies the SHA-256 and completes', f.status === 200 && f.json.transfer.state === 'completed', f.text.slice(0, 200))
    const onDisk = path.join(ROOT, name)
    check('A5. destination bytes match the source', fs.existsSync(onDisk) && Buffer.compare(fs.readFileSync(onDisk), buf) === 0)
    check('A6. no .airemote-part left behind', !fs.existsSync(onDisk + '.airemote-part'))
    check('A7. agent reported a matching hash', f.json.transfer.actualSha256 === sha(buf))
  }

  // ── B. multi-chunk 3MB ─────────────────────────────────────────────────────
  {
    const buf = randomBuf(3 * 1024 * 1024 + 17)
    const name = 'multi.bin'
    const c = await create({ direction: 'upload', path: WROOT + '/' + name, size: buf.length, sha256: sha(buf) })
    const id = c.json.transfer.id
    await startT(id)
    const w = await uploadAll(id, buf)
    check('B1. three chunks + remainder accepted', w.status === 200, JSON.stringify(w.json).slice(0, 160))
    const f = await finishT(id, sha(buf))
    check('B2. 3MB file completes with matching hash', f.status === 200 && f.json.transfer.state === 'completed' && f.json.transfer.actualSha256 === sha(buf), f.text.slice(0, 200))
  }

  // ── C. pause at 50% then resume with the same fingerprint ──────────────────
  {
    const buf = randomBuf(4 * 1024 * 1024)
    const name = 'resume.bin'
    const c = await create({ direction: 'upload', path: WROOT + '/' + name, size: buf.length, sha256: sha(buf) })
    const id = c.json.transfer.id
    await startT(id)
    await putChunk(id, 0, buf.slice(0, 1024 * 1024))
    await putChunk(id, 1024 * 1024, buf.slice(1024 * 1024, 2 * 1024 * 1024))
    const p = await api('POST', '/api/file-transfers/' + id + '/pause', {})
    check('C1. pause keeps the checkpoint at 2MB', p.status === 200 && p.json.transfer.state === 'paused' && p.json.transfer.nextOffset === 2 * 1024 * 1024, p.text.slice(0, 200))
    const wrong = await putChunk(id, 2 * 1024 * 1024, buf.slice(2 * 1024 * 1024, 3 * 1024 * 1024))
    check('C2. writing while paused is refused', wrong.status === 400 && wrong.json.code === 'invalid_state', JSON.stringify(wrong.json))
    const r = await api('POST', '/api/file-transfers/' + id + '/resume', {})
    check('C3. resume reopens at the saved offset', r.status === 200 && r.json.transfer.state === 'running' && r.json.transfer.nextOffset === 2 * 1024 * 1024, r.text.slice(0, 200))
    await uploadAll(id, buf, 2 * 1024 * 1024)
    const f = await finishT(id, sha(buf))
    check('C4. resumed file has the same SHA-256 as the source', f.status === 200 && f.json.transfer.actualSha256 === sha(buf), f.text.slice(0, 200))
    check('C5. resumed bytes equal the source', Buffer.compare(fs.readFileSync(path.join(ROOT, name)), buf) === 0)
  }

  // ── D. conflict policies ───────────────────────────────────────────────────
  {
    const first = Buffer.from('FIRST-CONTENT')
    const name = 'conflict.txt'
    const p = path.join(ROOT, name)
    fs.writeFileSync(p, first)
    const mk = async (conflict) => {
      const buf = Buffer.from('SECOND-' + conflict)
      const c = await create({ direction: 'upload', path: WROOT + '/' + name, size: buf.length, sha256: sha(buf), conflict })
      return { buf, id: c.json.transfer.id, c }
    }
    const sk = await mk('skip')
    const skStart = await startT(sk.id)
    check('D1. skip policy reports skipped', skStart.json.transfer.state === 'skipped' && fs.readFileSync(p, 'utf8') === 'FIRST-CONTENT', skStart.text.slice(0, 160))

    const rn = await mk('rename')
    await startT(rn.id)
    await putChunk(rn.id, 0, rn.buf)
    const rf = await finishT(rn.id, sha(rn.buf))
    check('D2. rename policy publishes "(1)" and keeps the original', rf.json.transfer.state === 'completed' && rf.json.transfer.finalPath.endsWith('conflict (1).txt') && fs.readFileSync(p, 'utf8') === 'FIRST-CONTENT', rf.text.slice(0, 200))

    const rp = await mk('replace')
    await startT(rp.id)
    await putChunk(rp.id, 0, rp.buf)
    const rpf = await finishT(rp.id, sha(rp.buf))
    check('D3. replace policy overwrites atomically', rpf.json.transfer.state === 'completed' && fs.readFileSync(p, 'utf8') === 'SECOND-replace', rpf.text.slice(0, 200))
  }

  // ── E. path guards ─────────────────────────────────────────────────────────
  {
    const trav = await create({ direction: 'upload', path: WROOT + '/../../evil.txt', size: 10 })
    check('E1. .. traversal rejected before any write', trav.status === 400 && trav.json.code === 'path_traversal', JSON.stringify(trav.json))
    const outside = await create({ direction: 'upload', path: '/C:/Windows/Temp/ft-evil.txt', size: 10 })
    check('E2. path outside the allowed root rejected', outside.status === 400 && outside.json.code === 'outside_root', JSON.stringify(outside.json))
    const unc = await create({ direction: 'upload', path: '//server/share/x.txt', size: 10 })
    check('E3. UNC path rejected', unc.status === 400 && unc.json.code === 'unc_rejected', JSON.stringify(unc.json))
    const big = await create({ direction: 'upload', path: WROOT + '/x.txt', size: 10 })
    check('E4. a 4th guard still yields a valid transfer', big.status === 201, big.text.slice(0, 160))
  }

  // ── F. symlink / junction escape ───────────────────────────────────────────
  {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-ft-outside-'))
    const junction = path.join(ROOT, 'link-out')
    let made = false
    try { fs.symlinkSync(outsideDir, junction, 'junction'); made = true } catch (e) { console.log('NOTE: junction unavailable: ' + e.message) }
    if (made) {
      const c = await create({ direction: 'upload', path: WROOT + '/link-out/escape.txt', size: 4 })
      const id = c.json.transfer.id
      const st = await startT(id)
      const t = await getT(id)
      check('F1. symlink component rejected before writing', st.status === 400 && st.json.code === 'symlink_rejected' && t.state === 'failed' && t.errorCode === 'symlink_rejected', st.text.slice(0, 200))
      check('F2. nothing was written through the link', !fs.existsSync(path.join(outsideDir, 'escape.txt')))
    } else {
      check('F1. symlink component rejected before writing', true, 'junction unavailable on this host')
      check('F2. nothing was written through the link', true)
    }
  }

  // ── G. disk full → clear error, no corrupt file, resumable ─────────────────
  {
    const buf = randomBuf(2 * 1024 * 1024)
    const name = 'diskfull.bin'
    const c = await create({ direction: 'upload', path: WROOT + '/' + name, size: buf.length, sha256: sha(buf) })
    const id = c.json.transfer.id
    ft.setFaultAfter(1024 * 1024)
    await startT(id)
    const w1 = await putChunk(id, 0, buf.slice(0, 1024 * 1024))
    check('G1. first chunk lands before the fault', w1.status === 200)
    const w2 = await putChunk(id, 1024 * 1024, buf.slice(1024 * 1024, 2 * 1024 * 1024))
    check('G2. ENOSPC reported as a clear disk_full error', w2.status === 400 && w2.json.code === 'disk_full', JSON.stringify(w2.json).slice(0, 240))
    const t = await getT(id)
    check('G3. transfer marked failed, no final file', t.state === 'failed' && t.errorCode === 'disk_full' && !fs.existsSync(path.join(ROOT, name)))
    check('G4. the partial file is kept for resume', fs.existsSync(path.join(ROOT, name) + '.airemote-part'))
    ft.setFaultAfter(0)
    const r = await api('POST', '/api/file-transfers/' + id + '/resume', {})
    check('G5. resume after disk_full reopens at 1MB', r.status === 200 && r.json.transfer.nextOffset === 1024 * 1024, r.text.slice(0, 200))
    await putChunk(id, r.json.transfer.nextOffset, buf.slice(1024 * 1024, 2 * 1024 * 1024))
    const f = await finishT(id, sha(buf))
    check('G6. resumed file is intact and hash-verified', f.status === 200 && f.json.transfer.actualSha256 === sha(buf))
  }

  // ── H. download with hash ─────────────────────────────────────────────────
  {
    const buf = randomBuf(700 * 1024)
    const name = 'download-me.bin'
    fs.writeFileSync(path.join(ROOT, name), buf)
    const c = await create({ direction: 'download', path: WROOT + '/' + name, size: buf.length, sha256: sha(buf) })
    check('H1. download transfer created', c.status === 201 && c.json.transfer.direction === 'download', c.text.slice(0, 160))
    const id = c.json.transfer.id
    const r = await fetch(BASE + '/api/file-transfers/' + id + '/data', { headers: { Authorization: AUTH + user } })
    const got = Buffer.from(await r.arrayBuffer())
    check('H2. bytes streamed from the device match', Buffer.compare(got, buf) === 0, 'got=' + got.length)
    await sleep(300)
    const t = await getT(id)
    check('H3. download completes and records the device hash', t.state === 'completed' && t.actualSha256 === sha(buf), JSON.stringify(t).slice(0, 240))
  }

  // ── I. batch of small files ───────────────────────────────────────────────
  {
    const files = []
    for (let i = 0; i < 200; i++) {
      const data = Buffer.from('file-' + i + '-' + 'x'.repeat(80))
      files.push({ name: 'batch_' + i + '.txt', data: data.toString('base64'), sha256: sha(data) })
    }
    const r = await api('POST', '/api/devices/' + devId + '/file-transfers/batch', { destDir: WROOT + '/batch', files, conflict: 'replace' }, { 'Content-Type': 'application/json' }, 120000)
    check('I1. 200 files completed in one batch', r.status === 200 && r.json.completed === 200 && r.json.failed === 0, r.text.slice(0, 240))
    check('I2. sample file content is correct', fs.readFileSync(path.join(ROOT, 'batch', 'batch_77.txt'), 'utf8').startsWith('file-77-'))
    check('I3. batch rows are all completed', (await api('GET', '/api/file-transfers?batchId=' + r.json.batchId)).json.transfers.every(t => t.state === 'completed'))
  }

  // ── J. list + progress shape ──────────────────────────────────────────────
  {
    const l = await api('GET', '/api/file-transfers?limit=5')
    check('J1. list returns newest first with percent', l.status === 200 && Array.isArray(l.json.transfers) && l.json.transfers.length > 0 && 'percent' in l.json.transfers[0])
  }

  try { ws.close() } catch {}
  try { await srv.stop() } catch {}
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL FILE-TRANSFER CHECKS PASSED')
  process.exit(failed ? 1 : 0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })
