/**
 * E2E — R4: جلسة وكيل‑بوكيل عبر Relay (سيرفر وسيط، بلا منفذ وارد).
 *
 * يثبت:
 *   A. طلب جلسة يُسلَّم كـ`session:offer` إلى الوكيل الهدف فقط بعد فحص الصلاحية
 *   B. لا تمرير حزم قبل `accept` (not_active)، ولا إشعار لجهاز غير مصرح له
 *   C. `accept` يُصدر رمزاً واحداً للطرفين (`session:token`)
 *   D. `relay:hello` يربط المقبس، و`relay:data` يمرّ إلى الطرف الآخر
 *   E. إعادة استخدام الرمز من طرف ثالث تُرفض (token_consumed)
 *   F. الإغلاق من طرف يُسجَّل في `sessions` و`audit_log` ويُبلَّغ الطرف الآخر
 *   G. الرفض الصريح، وسياسة الصلاحية قبل الإشعار، والتعارض، وسقف السعة
 *   H. انتهاء العرض بالمهلة، وقطع الشبكة يُغلق الجلسة بسبب network
 *
 * Run: ELECTRON_RUN_AS_NODE=1 "packages\\server-desktop\\node_modules\\electron\\dist\\electron.exe" packages/server-desktop/test/e2e-agent-session.test.cjs
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

// ws ليست اعتمادية مباشرة لهذه الحزمة (pnpm معزول) — نحمّلها من مخزن .pnpm.
function loadWs() {
  try { return require('ws') } catch {}
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
const PORT = 3997
const SECRET = ['agent', 'session', 'test', 'secret'].join('-')
const BASE = 'http://127.0.0.1:' + PORT

process.env.RELAY_MAX_SESSIONS = '2'
process.env.RELAY_OFFER_TTL_MS = '4000'
process.env.RELAY_TOKEN_TTL_MS = '60000'
process.env.RELAY_SESSION_KBPS = '64'

let failed = 0
const check = (d, c, x) => { if (c) console.log('PASS: ' + d); else { console.error('FAIL: ' + d + (x ? '  (' + x + ')' : '')); failed++ } }

function mkClient(ws) {
  const queue = []
  const waiters = []
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw.toString()) } catch { return }
    const i = waiters.findIndex(w => w.type === m.type)
    if (i >= 0) { const w = waiters.splice(i, 1)[0]; clearTimeout(w.t); w.resolve(m) } else queue.push(m)
  })
  return {
    ws, queue,
    send(o) { ws.send(JSON.stringify(o)) },
    drain() { queue.length = 0 },
    next(type, ms = 6000) {
      const i = queue.findIndex(m => m.type === type)
      if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0])
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout waiting for ' + type)), ms)
        waiters.push({ type, resolve, t })
      })
    },
    count(type) { return queue.filter(m => m.type === type).length },
  }
}

function connectAgent() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?agent=1')
    ws.on('open', () => resolve(mkClient(ws)))
    ws.on('error', reject)
  })
}

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-relay-'))
  const dbPath = path.join(tmp, 'test.db')
  const srv = require(path.resolve(SERVER_DIR, 'server.js'))
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger: { info() {}, warn() {}, error() {}, debug() {} }, desktopCallbacks: {}, tls: false })

  const hash = bcrypt.hashSync('pw', 4)
  const ownerId = crypto.randomUUID()
  const strangerId = crypto.randomUUID()
  const devA = crypto.randomUUID(), devB = crypto.randomUUID(), devC = crypto.randomUUID(), devD = crypto.randomUUID()
  const tok = {}
  {
    const db = new Database(dbPath)
    const u = db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)')
    u.run(ownerId, 'owner@s', 'Owner', 'manager', hash)
    u.run(strangerId, 'stranger@s', 'Stranger', 'manager', hash)
    const d = db.prepare('INSERT INTO devices (id,name,token,owner_id) VALUES (?,?,?,?)')
    for (const [id, name] of [[devA, 'requester'], [devB, 'target-B'], [devC, 'target-C'], [devD, 'target-D']]) {
      tok[id] = crypto.randomUUID()
      d.run(id, name, tok[id], ownerId)
    }
    db.close()
  }
  const H = (t) => ({ Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' })
  const tokOwner = jwt.sign({ userId: ownerId, email: 'owner@s', role: 'manager' }, SECRET, { expiresIn: '1h' })
  const tokStranger = jwt.sign({ userId: strangerId, email: 'stranger@s', role: 'manager' }, SECRET, { expiresIn: '1h' })

  const cA = await connectAgent()
  const cB = await connectAgent()
  const cC = await connectAgent()
  const cD = await connectAgent()
  for (const [c, id] of [[cA, devA], [cB, devB], [cC, devC], [cD, devD]]) {
    c.send({ type: 'agent:register', payload: { token: tok[id], info: { platform: 'windows' }, capabilities: {} } })
    await c.next('server:registered')
  }

  const request = (t, body) => fetch(BASE + '/api/relay/request', { method: 'POST', headers: H(t), body: JSON.stringify(body) })
  const getSession = (t, id) => fetch(BASE + '/api/relay/' + id, { headers: H(t) })
  const waitState = async (id, want, ms = 6000) => {
    const t0 = Date.now()
    let s = null
    while (Date.now() - t0 < ms) {
      s = await getSession(tokOwner, id).then(r => r.json())
      if (s && s.state === want) return s
      await new Promise(r => setTimeout(r, 120))
    }
    return s
  }

  // ── A. offer only after the policy check ───────────────────────────────────
  const r1 = await request(tokOwner, { targetDeviceId: devB, access: 'control', requesterDeviceId: devA })
  const r1Body = await r1.json()
  check('A1. owner requests a session (201)', r1.status === 201 && r1Body.state === 'requested', 'status=' + r1.status + ' ' + JSON.stringify(r1Body))
  const offer = await cB.next('session:offer')
  check('A2. target agent receives session:offer', offer.payload.sessionId === r1Body.sessionId)
  check('A3. offer carries the requester identity', offer.payload.requester.name === 'requester' && offer.payload.requester.deviceId === devA, JSON.stringify(offer.payload.requester))

  // ── B. nothing flows before accept ─────────────────────────────────────────
  cA.send({ type: 'relay:data', payload: { sessionId: r1Body.sessionId, channel: 'control', data: { op: 'mousemove', x: 1, y: 2 } } })
  const errEarly = await cA.next('session:error')
  check('B1. relay before accept is refused (not_active)', errEarly.payload.code === 'not_active', JSON.stringify(errEarly.payload))
  await new Promise(r => setTimeout(r, 150))
  check('B2. target received no relay frame', cB.count('relay:data') === 0)

  // ── C. accept issues one token to both parties ─────────────────────────────
  cB.send({ type: 'session:accept', payload: { sessionId: r1Body.sessionId } })
  const tokenB = await cB.next('session:token')
  const tokenA = await cA.next('session:token')
  check('C1. both parties receive session:token', !!tokenB.payload.token && tokenB.payload.token === tokenA.payload.token, 'len=' + String(tokenB.payload.token || '').length)
  check('C2. token is single-use material (64 hex chars)', /^[0-9a-f]{64}$/.test(String(tokenB.payload.token)), String(tokenB.payload.token).slice(0, 12))
  check('C3. token declares its lifetime', !!tokenB.payload.tokenExpiresAt && tokenB.payload.access === 'control')

  // ── D. hello binds the sockets, data is relayed ────────────────────────────
  cA.send({ type: 'relay:hello', payload: { sessionId: r1Body.sessionId, token: tokenA.payload.token } })
  const readyA = await cA.next('session:ready')
  check('D1. requester binds with the token', readyA.payload.peerDeviceId === devB, JSON.stringify(readyA.payload))
  cB.send({ type: 'relay:hello', payload: { sessionId: r1Body.sessionId, token: tokenB.payload.token } })
  const readyB = await cB.next('session:ready')
  check('D2. target binds on the same session', readyB.payload.peerDeviceId === devA)

  cA.send({ type: 'relay:data', payload: { sessionId: r1Body.sessionId, channel: 'control', data: { op: 'click', x: 5, y: 6 } } })
  const fwd = await cB.next('relay:data')
  check('D3. relay frame reaches the peer', fwd.payload.data && fwd.payload.data.op === 'click' && fwd.payload.channel === 'control', JSON.stringify(fwd.payload))

  cB.send({ type: 'relay:data', payload: { sessionId: r1Body.sessionId, channel: 'screen', data: { frame: 'abc' } } })
  const back = await cA.next('relay:data')
  check('D4. relay is bidirectional', back.payload.data && back.payload.data.frame === 'abc')

  // ── E. a third device cannot reuse the token ───────────────────────────────
  cC.send({ type: 'relay:hello', payload: { sessionId: r1Body.sessionId, token: tokenA.payload.token } })
  const errC = await cC.next('session:error')
  check('E1. third device is refused (not_party)', errC.payload.code === 'not_party' || errC.payload.code === 'token_consumed', JSON.stringify(errC.payload))
  cD.send({ type: 'relay:hello', payload: { sessionId: r1Body.sessionId, token: tokenA.payload.token } })
  const errD = await cD.next('session:error')
  check('E2. any other device is refused too', errD.payload.code === 'not_party' || errD.payload.code === 'token_consumed', JSON.stringify(errD.payload))

  const st1 = await getSession(tokOwner, r1Body.sessionId).then(r => r.json())
  check('E3. session is active with counted bytes', st1.state === 'active' && st1.bytesIn > 0 && st1.bytesOut > 0, JSON.stringify({ state: st1.state, bytesIn: st1.bytesIn, bytesOut: st1.bytesOut }))

  // ── F. close from a party ──────────────────────────────────────────────────
  cA.send({ type: 'session:close', payload: { sessionId: r1Body.sessionId, reason: 'user' } })
  const closeB = await cB.next('session:close')
  check('F1. peer is notified of the close', closeB.payload.reason === 'user', JSON.stringify(closeB.payload))
  const st2 = await getSession(tokOwner, r1Body.sessionId).then(r => r.json())
  check('F2. session is closed with a reason', st2.state === 'closed' && st2.reason === 'user', JSON.stringify({ state: st2.state, reason: st2.reason }))
  const db1 = new Database(dbPath)
  const rowS = db1.prepare('SELECT ended_at, duration_sec FROM sessions WHERE id=?').get(r1Body.sessionId)
  db1.close()
  check('F3. sessions row is finished with a duration', !!rowS && !!rowS.ended_at && rowS.duration_sec !== null, JSON.stringify(rowS))

  // ── G1. explicit deny ──────────────────────────────────────────────────────
  const r2 = await request(tokOwner, { targetDeviceId: devB, access: 'control', requesterDeviceId: devA }).then(r => r.json())
  await cB.next('session:offer')
  cB.send({ type: 'session:deny', payload: { sessionId: r2.sessionId, reason: 'busy' } })
  const denied = await cA.next('session:denied')
  check('G1. deny reaches the requester with its reason', denied.payload.reason === 'busy', JSON.stringify(denied.payload))
  const stDenied = await getSession(tokOwner, r2.sessionId).then(r => r.json())
  check('G2. session state is denied', stDenied.state === 'denied', stDenied.state)

  // ── G2. policy before notification ─────────────────────────────────────────
  const offersBefore = cB.count('session:offer')
  const deniedByPolicy = await request(tokStranger, { targetDeviceId: devB, access: 'control' })
  const deniedBody = await deniedByPolicy.json()
  check('G3. user without capability is refused (403)', deniedByPolicy.status === 403 && deniedBody.code === 'session_policy_denied', 'status=' + deniedByPolicy.status)
  await new Promise(r => setTimeout(r, 200))
  check('G4. the target never saw an offer for it', cB.count('session:offer') === offersBefore)

  // ── G3. conflict + capacity ────────────────────────────────────────────────
  const r3 = await request(tokOwner, { targetDeviceId: devB, access: 'view', requesterDeviceId: devA }).then(r => r.json())
  const conflict = await request(tokOwner, { targetDeviceId: devB, access: 'control', requesterDeviceId: devA })
  const conflictBody = await conflict.json()
  check('G5. a second request to a busy device is 409', conflict.status === 409 && conflictBody.code === 'session_conflict', 'status=' + conflict.status)
  const r4 = await request(tokOwner, { targetDeviceId: devC, access: 'view', requesterDeviceId: devA })
  check('G6. second concurrent session is accepted', r4.status === 201, 'status=' + r4.status)
  const r4Body = await r4.json()
  const capacity = await request(tokOwner, { targetDeviceId: devD, access: 'view', requesterDeviceId: devA })
  const capacityBody = await capacity.json()
  check('G7. third session hits the cap (503 relay_capacity)', capacity.status === 503 && capacityBody.code === 'relay_capacity' && capacityBody.max === 2, 'status=' + capacity.status + ' ' + JSON.stringify(capacityBody))
  // free the slots
  await fetch(BASE + '/api/relay/' + r3.sessionId + '/close', { method: 'POST', headers: H(tokOwner), body: JSON.stringify({ reason: 'user' }) })
  await fetch(BASE + '/api/relay/' + r4Body.sessionId + '/close', { method: 'POST', headers: H(tokOwner), body: JSON.stringify({ reason: 'user' }) })

  // ── H1. offer timeout ──────────────────────────────────────────────────────
  const r5 = await request(tokOwner, { targetDeviceId: devB, access: 'view', requesterDeviceId: devA }).then(r => r.json())
  await cB.next('session:offer')
  const expired = await cA.next('session:expired', 8000)
  check('H1. unanswered offer expires', expired.payload.sessionId === r5.sessionId)
  const stExpired = await getSession(tokOwner, r5.sessionId).then(r => r.json())
  check('H2. session state is expired', stExpired.state === 'expired', stExpired.state)

  // ── H2. network drop closes the session ────────────────────────────────────
  cA.drain(); cB.drain()
  const r6 = await request(tokOwner, { targetDeviceId: devB, access: 'control', requesterDeviceId: devA }).then(r => r.json())
  await cB.next('session:offer')
  cB.send({ type: 'session:accept', payload: { sessionId: r6.sessionId } })
  const tk6 = await cA.next('session:token')
  cA.send({ type: 'relay:hello', payload: { sessionId: r6.sessionId, token: tk6.payload.token } })
  await cA.next('session:ready')
  cB.ws.close()
  const netClose = await cA.next('session:close', 8000)
  check('H3. a dropped peer closes the session with reason=network', netClose.payload.reason === 'network' && netClose.payload.sessionId === r6.sessionId, JSON.stringify(netClose.payload))
  const stNet = await waitState(r6.sessionId, 'closed')
  check('H4. state is closed after the drop', stNet.state === 'closed' && stNet.reason === 'network', JSON.stringify({ state: stNet.state, reason: stNet.reason }))

  // ── I. audit + token ledger ────────────────────────────────────────────────
  const db2 = new Database(dbPath)
  const count = (a) => db2.prepare('SELECT COUNT(*) c FROM audit_log WHERE action=?').get(a).c
  const tokens = db2.prepare('SELECT COUNT(*) c, SUM(CASE WHEN consumed_at IS NOT NULL THEN 1 ELSE 0 END) used FROM session_tokens').get()
  const n = {
    requested: count('session_requested'), accepted: count('session_accepted'), denied: count('session_denied'),
    closed: count('session_closed'), expired: count('session_expired'), policy: count('session_policy_denied'),
    conflict: count('session_conflict'), capacity: count('session_capacity_rejected'), rejected: count('session_token_rejected'),
  }
  db2.close()
  check('I1. request/accept/deny/close/expire all audited', n.requested >= 6 && n.accepted >= 2 && n.denied >= 1 && n.closed >= 2 && n.expired >= 1, JSON.stringify(n))
  check('I2. policy, conflict and capacity refusals audited', n.policy >= 1 && n.conflict >= 1 && n.capacity >= 1, JSON.stringify(n))
  check('I3. token ledger records the single use', tokens.c >= 2 && tokens.used >= 1, JSON.stringify(tokens))

  console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nALL AGENT SESSION CHECKS PASSED')
  process.exit(failed ? 1 : 0)
})().catch(e => { console.error('ERROR: ' + (e && e.stack || e)); process.exit(2) })
