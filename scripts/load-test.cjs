#!/usr/bin/env node
'use strict'
/**
 * load-test.cjs — R9.1 capacity ceiling for the AiRemote desktop server.
 *
 * Runs a THROWAWAY server (temp DB, random port, no TLS) so the installed
 * production instance is never touched, then measures four phases:
 *
 *   A. HTTP   : concurrent authenticated /api/devices requests
 *   B. VIEWERS: N viewers on one screen session (join + steady state)
 *   C. FANOUT : one viewer broadcasts annotation events to all the others
 *   D. AGENTS : N agents registering + heartbeating
 *
 * Output: JSON (p50/p95/p99, error counts, RSS, event-loop lag) + a table.
 *
 * Usage: node scripts/load-test.cjs [--json out.json] [--quick]
 */
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
const SERVER_DIR = path.join(ROOT, 'packages', 'server-desktop')
const jwt = require(path.join(SERVER_DIR, 'node_modules', 'jsonwebtoken'))
const { createDatabase } = require(path.join(SERVER_DIR, 'lib', 'db-adapter'))

const ARGS = process.argv.slice(2)
const JSON_OUT = ARGS.includes('--json') ? ARGS[ARGS.indexOf('--json') + 1] : null
const QUICK = ARGS.includes('--quick')

const PORT = 3990 + Math.floor(Math.random() * 8)
const BASE = 'http://127.0.0.1:' + PORT
const SECRET = crypto.randomBytes(16).toString('hex')

const HTTP_CONCURRENCY = QUICK ? 12 : 40
const HTTP_SECONDS = QUICK ? 2 : 5
const VIEWERS = QUICK ? 15 : 60
const FANOUT_EVENTS = QUICK ? 60 : 200
const AGENTS = QUICK ? 8 : 25

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const pct = (arr, p) => {
  if (!arr.length) return null
  const s = arr.slice().sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
const r2 = (n) => n == null ? null : Math.round(n * 100) / 100
const mb = (n) => Math.round(n / 1048576 * 10) / 10

async function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'airemote-load-'))
  const dbPath = path.join(tmpDir, 'load.db')

  const srv = require(path.join(SERVER_DIR, 'server.js'))
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  await srv.start({ port: PORT, jwtSecret: SECRET, dbPath, logger, desktopCallbacks: {}, tls: false })
  await sleep(300)

  const db = createDatabase(dbPath)
  const userId = crypto.randomUUID()
  const deviceIds = []
  db.db ? null : null
  const exec = (sql, ...args) => db.prepare(sql).run(...args)
  exec('INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)', userId, 'load@local', 'Load', 'admin', 'x')
  for (let i = 0; i < AGENTS; i++) {
    const id = crypto.randomUUID()
    deviceIds.push({ id, token: crypto.randomUUID() + '-' + crypto.randomUUID(), name: 'load-dev-' + i })
    exec('INSERT INTO devices (id, name, token, owner_id) VALUES (?,?,?,?)', id, 'load-dev-' + i, deviceIds[i].token, userId)
  }
  db.close()

  const token = jwt.sign({ userId, email: 'load@local', role: 'admin' }, SECRET, { expiresIn: '1h' })
  const auth = { Authorization: 'Bearer ' + token }

  // ── event-loop lag sampler ────────────────────────────────────────────────
  let lagMax = 0
  const lagTimer = setInterval(() => {
    const t0 = Date.now()
    setImmediate(() => { lagMax = Math.max(lagMax, Date.now() - t0) })
  }, 50)
  const rssStart = process.memoryUsage().rss
  const cpuStart = process.cpuUsage()

  const result = { at: new Date().toISOString(), host: os.hostname(), node: process.version, port: PORT, phases: {} }

  // ── A. HTTP ───────────────────────────────────────────────────────────────
  {
    const lat = []
    let errors = 0
    const deadline = Date.now() + HTTP_SECONDS * 1000
    const worker = async () => {
      while (Date.now() < deadline) {
        const t0 = Date.now()
        try {
          const r = await fetch(BASE + '/api/devices', { headers: auth })
          if (!r.ok) errors++
          await r.arrayBuffer()
        } catch { errors++ }
        lat.push(Date.now() - t0)
      }
    }
    await Promise.all(Array.from({ length: HTTP_CONCURRENCY }, worker))
    const secs = HTTP_SECONDS
    result.phases.http = {
      concurrency: HTTP_CONCURRENCY, seconds: secs,
      requests: lat.length, rps: r2(lat.length / secs), errors,
      p50: pct(lat, 50), p95: pct(lat, 95), p99: pct(lat, 99), max: Math.max(...lat)
    }
  }

  // ── B. viewers on one session ─────────────────────────────────────────────
  const target = deviceIds[0]
  const agentSockets = []
  {
    // one fake agent so the session can start
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws')
    const msgs = []
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string') return
      let m; try { m = JSON.parse(e.data) } catch { return }
      msgs.push(m)
      if (m.type === 'server:ping') ws.send(JSON.stringify({ type: 'agent:pong', payload: {}, timestamp: Date.now() }))
    }
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
    ws.send(JSON.stringify({ type: 'agent:register', payload: { token: target.token, info: {}, capabilities: {} }, timestamp: Date.now() }))
    await sleep(300)
    agentSockets.push(ws)

    // /api/auth/ws-ticket is rate limited (30/min). That is a deliberate control,
    // not a capacity limit, so the test records how many tickets were actually
    // issued instead of silently measuring fewer viewers.
    const tickets = []
    let rejected = 0
    for (let i = 0; i < VIEWERS; i++) {
      const res = await fetch(BASE + '/api/auth/ws-ticket', { method: 'POST', headers: auth })
      const r = await res.json().catch(() => ({}))
      if (res.ok && r.ticket) tickets.push(r.ticket)
      else rejected++
    }
    const viewers = []
    const t0 = Date.now()
    for (const t of tickets) {
      const v = new WebSocket('ws://127.0.0.1:' + PORT + '/screen?deviceId=' + target.id + '&ticket=' + t + '&fps=4&quality=30&maxWidth=640')
      viewers.push(v)
    }
    await Promise.all(viewers.map(v => new Promise((res) => {
      v.onopen = res
      v.onerror = res
      setTimeout(res, 5000)
    })))
    result.phases.viewers = {
      requested: VIEWERS,
      issued: tickets.length,
      rejected,
      opened: viewers.filter(v => v.readyState === 1).length,
      joinMs: Date.now() - t0
    }
    // keep the sockets for the fan-out phase
    global.__viewers = viewers
  }

  // ── C. annotation fan-out ─────────────────────────────────────────────────
  {
    const viewers = global.__viewers || []
    const listeners = viewers.slice(1)
    const counts = new Map()
    let firstAt = 0
    const lat = []
    for (const v of listeners) {
      v.addEventListener('message', (e) => {
        if (typeof e.data !== 'string') return
        let m; try { m = JSON.parse(e.data) } catch { return }
        if (m.type !== 'screen:annotate') return
        const key = m.payload && m.payload.id
        counts.set(key, (counts.get(key) || 0) + 1)
        if (firstAt) lat.push(Date.now() - firstAt)
      })
    }
    const sender = viewers[0]
    const t0 = Date.now()
    for (let i = 0; i < FANOUT_EVENTS; i++) {
      firstAt = Date.now()
      sender.send(JSON.stringify({ type: 'screen:annotate', payload: { tool: 'laser', id: 'f' + i, phase: 'move', x: i / FANOUT_EVENTS, y: 0.5 }, timestamp: Date.now() }))
      await sleep(2)
    }
    await sleep(1500)
    const delivered = [...counts.values()].reduce((a, b) => a + b, 0)
    const expected = FANOUT_EVENTS * listeners.length
    result.phases.fanout = {
      viewers: listeners.length, events: FANOUT_EVENTS,
      expected, delivered,
      ratio: r2(delivered / Math.max(1, expected)),
      p50: pct(lat, 50), p95: pct(lat, 95),
      senderMs: Date.now() - t0
    }
    for (const v of viewers) { try { v.close() } catch {} }
  }

  // ── D. agents ─────────────────────────────────────────────────────────────
  {
    const agents = []
    let pongs = 0
    const opens = []
    for (let i = 1; i < deviceIds.length; i++) {
      const d = deviceIds[i]
      const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws')
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string') return
        let m; try { m = JSON.parse(e.data) } catch { return }
        if (m.type === 'server:ping') { ws.send(JSON.stringify({ type: 'agent:pong', payload: {}, timestamp: Date.now() })); pongs++ }
      }
      agents.push(ws)
      opens.push(new Promise((res) => { ws.onopen = res; ws.onerror = res; setTimeout(res, 4000) }))
    }
    await Promise.all(opens)
    for (let i = 1; i < deviceIds.length; i++) {
      agents[i - 1].send(JSON.stringify({ type: 'agent:register', payload: { token: deviceIds[i].token, info: {}, capabilities: {} }, timestamp: Date.now() }))
    }
    await sleep(800)
    const list = await fetch(BASE + '/api/devices', { headers: auth }).then(r => r.json())
    const online = Array.isArray(list) ? list.filter(d => d.status === 'online').length : 0
    result.phases.agents = { attempted: AGENTS, online, pongs }
    for (const a of agents) { try { a.close() } catch {} }
    for (const a of agentSockets) { try { a.close() } catch {} }
  }

  clearInterval(lagTimer)
  const rssEnd = process.memoryUsage().rss
  const cpu = process.cpuUsage(cpuStart)
  result.resources = {
    rssStartMb: mb(rssStart), rssEndMb: mb(rssEnd), rssDeltaMb: mb(rssEnd - rssStart),
    cpuUserMs: Math.round(cpu.user / 1000), cpuSystemMs: Math.round(cpu.system / 1000),
    eventLoopLagMaxMs: lagMax,
    cpus: os.cpus().length, loadAvg: os.loadavg().map(r2)
  }

  await sleep(300)
  await srv.stop()
  try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch {}

  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(result, null, 2), 'utf8')
  console.log(JSON.stringify(result, null, 2))
  console.log('\n=== SUMMARY ===')
  const p = result.phases
  console.log(`HTTP      ${p.http.rps} rps · p50 ${p.http.p50}ms · p95 ${p.http.p95}ms · p99 ${p.http.p99}ms · errors ${p.http.errors}`)
  console.log(`Viewers   ${p.viewers.opened} opened · ${p.viewers.issued}/${p.viewers.requested} tickets issued (${p.viewers.rejected} rate-limited) · ${p.viewers.joinMs}ms`)
  console.log(`Fan-out   ${p.fanout.delivered}/${p.fanout.expected} (${Math.round(p.fanout.ratio * 100)}%) · p95 ${p.fanout.p95}ms`)
  console.log(`Agents    ${p.agents.online}/${p.agents.attempted} online`)
  console.log(`Memory    RSS +${result.resources.rssDeltaMb}MB (${result.resources.rssEndMb}MB) · loop lag max ${result.resources.eventLoopLagMaxMs}ms`)
  process.exit(0)
}

main().catch(e => { console.error('LOAD TEST FAILED:', e && e.stack || e); process.exit(1) })
