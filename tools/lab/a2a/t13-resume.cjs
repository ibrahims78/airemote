'use strict'
// T13 — 1GB داخل جلسة Relay Files: تنزيل يتقطع عدة مرات ثم يُستكمل، ومقارنة SHA-256.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const fs = require('fs')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const vg = require('D:/autoclaw projects-new/AiRemote/tools/lab/a2a/vmguest.cjs')
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const WIN11 = 'd147684b-2451-4418-a628-86f11aa66a4e'
const LOCAL = 'C:/Users/admin/AppData/Local/Temp/t13.bin'
const WANT = 1073741824
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const devToken = (id) => {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}
const post = async (p, body, headers = {}) => {
  const r = await fetch('https://127.0.0.1:3001' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body || {}) })
  return { status: r.status, json: await r.json().catch(() => ({})) }
}
;(async () => {
  const out = { slice: '3.11.6', steps: {}, attempts: [], pass: {} }
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(600)
  const rq = await post('/api/relay/request', { targetDeviceId: WIN11, access: 'files', requesterDeviceId: WIN10 }, { 'X-Device-Token': devToken(WIN10) })
  out.steps.request = rq.status
  if (rq.status !== 201) { console.log(JSON.stringify(out, null, 1)); process.exit(1) }
  await sleep(900)
  await lab.api('/api/relay/' + rq.json.sessionId + '/decision', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accept: true }) })
  const vt = await post('/api/relay/' + rq.json.sessionId + '/view-ticket', {}, { 'X-Device-Token': devToken(WIN10) })
  out.steps.ticket = vt.status
  const rt = vt.json && vt.json.ticket
  const target = 'C:/Users/admin/t13.bin'
  const guest = vg.ps('win11', 'D:/autoclaw projects-new/AiRemote/tools/lab/a2a/make-1g.ps1')
  out.guest = String(guest || '').trim().split('\n').filter(x => /SIZE|HASH/.test(x)).map(x => x.trim())
  if (fs.existsSync(LOCAL)) fs.unlinkSync(LOCAL)
  const url = 'https://127.0.0.1:3001/api/devices/' + WIN11 + '/fs/download?path=' + encodeURIComponent(target) + '&rt=' + encodeURIComponent(rt)
  let attempt = 0
  while (attempt < 40) {
    attempt++
    const before = fs.existsSync(LOCAL) ? fs.statSync(LOCAL).size : 0
    try {
      execFileSync('curl.exe', ['-sk', '--max-time', '25', '-C', '-', '-o', LOCAL, url], { stdio: 'ignore', timeout: 40000 })
    } catch (e) { /* قطع متوقع */ }
    const after = fs.existsSync(LOCAL) ? fs.statSync(LOCAL).size : 0
    out.attempts.push({ attempt, startBytes: before, endBytes: after, deltaBytes: after - before, rangeSent: before > 0 })
    if (after >= WANT) break
    await sleep(300)
  }
  const size = fs.existsSync(LOCAL) ? fs.statSync(LOCAL).size : 0
  out.localBytes = size
  out.pass.downloadedFull = size === WANT
  out.pass.resumed = out.attempts.filter(a => a.rangeSent && a.deltaBytes > 0).length > 0
  const hostHash = size ? crypto.createHash('sha256').update(fs.readFileSync(LOCAL)).digest('hex') : ''
  const guestHash = fs.existsSync('C:/Users/admin/AppData/Local/Temp/t13-guest-hash.txt')
    ? fs.readFileSync('C:/Users/admin/AppData/Local/Temp/t13-guest-hash.txt', 'utf8').trim()
    : (out.guest.find(x => /HASH/.test(x)) || '').replace(/^HASH\s+/, '')
  try { vg.copyOut('win11', 'C:\\Users\\admin\\t13-hash.txt', 'C:/Users/admin/AppData/Local/Temp/t13-guest-hash.txt') } catch {}
  const guestHash2 = fs.existsSync('C:/Users/admin/AppData/Local/Temp/t13-guest-hash.txt')
    ? fs.readFileSync('C:/Users/admin/AppData/Local/Temp/t13-guest-hash.txt', 'utf8').trim() : guestHash
  out.hostSha256 = hostHash
  out.guestSha256 = guestHash2
  out.pass.sameHash = !!hostHash && hostHash === guestHash2
  fs.mkdirSync('outputs/verify-2026-11-02/t13', { recursive: true })
  fs.writeFileSync('outputs/verify-2026-11-02/t13/resume.json', JSON.stringify(out, null, 1))
  console.log(JSON.stringify(out, null, 1))
  try { await lab.api('/api/relay/' + rq.json.sessionId + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }) } catch {}
  process.exit(0)
})().catch(e => { console.log(JSON.stringify({ pass: false, error: String(e && e.message || e) })); process.exit(1) })