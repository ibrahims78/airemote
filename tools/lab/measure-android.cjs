// R8.1 — Android measurement: push always works; pull is refused in the background
// (Android 10+ focus rule) and works while the agent UI is in the foreground.
const fs = require('fs')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const lab = require('./lab.cjs')
const screen = require('./screen.cjs')

const ADB = 'D:\\autoclaw projects\\offline-build-tools\\android-toolchain\\sdk\\platform-tools\\adb.exe'
const SERIAL = process.argv[3] || '12927374CM001019'
const PKG = 'com.airemote.agent'
const DEVICE = process.argv[4] || 'TECNO-KL4'
const OUT = process.argv[2] || null

const sha = s => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex')
const sleep = ms => new Promise(r => setTimeout(r, ms))
function adb(...args) {
  try { return execFileSync(ADB, ['-s', SERIAL, ...args], { encoding: 'utf8', timeout: 20000 }).trim() } catch (e) { return '' }
}
function focusLine() {
  const out = adb('shell', 'dumpsys window')
  const line = String(out).split('\n').filter(l => l.includes('mCurrentFocus'))
  return (line[line.length - 1] || '').trim().slice(0, 160)
}
const home = () => { adb('shell', 'input', 'keyevent', 'KEYCODE_HOME'); }
const foreground = () => {
  adb('shell', 'cmd', 'statusbar', 'collapse')   // a pulled-down shade steals focus
  adb('shell', 'am', 'start', '-n', PKG + '/.MainActivity')
}

const result = { device: DEVICE, at: new Date().toISOString(), steps: [], numbers: {} }
function step(name, detail) { result.steps.push({ name, ...detail }); console.log('- ' + name + ': ' + JSON.stringify(detail)) }

async function state(devId) { const r = await lab.api('/api/devices/' + devId + '/clipboard-sync'); return r.json || {} }
async function waitState(devId, pred, ms = 6000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { const s = await state(devId); if (pred(s)) return { s, ms: Date.now() - t0 }; await sleep(100) }
  return { s: await state(devId), ms: null }
}
function waitEvent(c, pred, ms) {
  return new Promise((res) => {
    const t0 = Date.now()
    const tick = () => {
      const hit = c.events.slice().reverse().find(pred)
      if (hit) return res(hit)
      if (Date.now() - t0 > ms) return res(null)
      setTimeout(tick, 50)
    }
    tick()
  })
}

;(async () => {
  const devId = await lab.deviceId(DEVICE)
  const list = await lab.devices()
  const dev = list.find(d => d.id === devId)
  result.numbers.agentVersion = (dev && dev.info && dev.info.agentVersion) || '?'

  foreground(); await sleep(1500)
  const c = await screen.open(DEVICE)
  if (!await c.open()) throw new Error('screen ws did not open')

  // Warm-up: a fresh capture session takes a moment on this device. Enabling sync
  // before the first frame lands would measure the capture start, not the sync.
  const tWarm = Date.now()
  for (let i = 0; i < 40; i++) {
    if (c.frames.count > 0) break
    await sleep(500)
  }
  await sleep(1200)
  step('screen session warm', { frames: c.frames.count, warmupMs: Date.now() - tWarm, monitors: c.events.filter(e => e.type === 'screen:monitors').length })

  // ── 1) enable push (background) ─────────────────────────────────────────
  home(); await sleep(1200)
  const t0 = Date.now()
  const on = await lab.api('/api/devices/' + devId + '/clipboard-sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, direction: 'to-device' })
  })
  const st1 = await waitState(devId, s => s.enabled && s.agentWatching, 15000)
  step('enable (to-device, app in background)', {
    http: on.status, agentWatching: st1.s.agentWatching, reason: st1.s.lastReason, ms: st1.ms
  })
  // Measured inside waitState: from the REST response to the agent's ack, so a
  // slow token refresh in the harness cannot inflate it.
  result.numbers.enableAckMs = st1.ms

  // ── 2) push ASCII + Arabic, verified by a foreground read ───────────────
  const pushText = 'R8-ANDROID-' + Date.now() + '-ascii'
  const beforeSent = (await state(devId)).sent || 0
  c.send('screen:clipboard_local', { text: pushText })
  const pushed = await waitState(devId, s => (s.sent || 0) > beforeSent, 6000)
  result.numbers.pushMs = pushed.ms
  await sleep(500)
  foreground(); await sleep(1800)
  c.send('screen:clipboard_read', {})
  const read1 = await waitEvent(c, e => e.type === 'screen:clipboard', 8000)
  const got1 = read1 ? String(read1.payload.text || '') : null
  step('push ASCII → device clipboard', { ms: pushed.ms, focus: focusLine(), len: got1 == null ? null : got1.length, match: got1 === pushText })
  result.numbers.pushMatch = got1 === pushText

  const arabic = 'مزامنة الحافظة — TECNO ' + Date.now()
  const before2 = (await state(devId)).sent || 0
  c.send('screen:clipboard_local', { text: arabic })
  await waitState(devId, s => (s.sent || 0) > before2, 6000)
  await sleep(500)
  c.send('screen:clipboard_read', {})
  const read2 = await waitEvent(c, e => e.type === 'screen:clipboard' && String(e.payload.text || '') === arabic, 8000)
  step('push UTF-8 Arabic → device clipboard', { match: !!read2, len: read2 ? arabic.length : null })
  result.numbers.pushArabicMatch = !!read2

  // ── 3) pull in the background is refused, with an explicit reason ───────
  home(); await sleep(1400)
  const appliesBefore = c.events.filter(e => e.type === 'screen:clipboard_apply').length
  c.send('screen:clipboard_sync_direction', { direction: 'to-viewer' })
  const st2 = await waitState(devId, s => s.direction === 'to-viewer' && s.lastReason === 'background-denied', 6000)
  await sleep(2500)
  const appliesAfter = c.events.filter(e => e.type === 'screen:clipboard_apply').length
  step('pull while the app is in the background', {
    direction: st2.s.direction, agentWatching: st2.s.agentWatching,
    reason: st2.s.lastReason, applies: appliesAfter - appliesBefore
  })
  result.numbers.bgPullApplies = appliesAfter - appliesBefore
  result.numbers.bgPullReason = st2.s.lastReason

  // ── 4) pull works while the agent UI is in front ────────────────────────
  foreground(); await sleep(2200)
  const focus = focusLine()
  c.send('screen:clipboard_sync_direction', { direction: 'to-device' })
  await sleep(500)
  const tFg = Date.now()
  c.send('screen:clipboard_sync_direction', { direction: 'to-viewer' })
  const st3 = await waitState(devId, s => s.direction === 'to-viewer' && s.agentWatching, 8000)
  const snap = await waitEvent(c, e => e.type === 'screen:clipboard_apply' && String(e.payload.text || '') === arabic, 10000)
  step('pull with the agent UI in front', {
    focus, agentWatching: st3.s.agentWatching, reason: st3.s.lastReason, snapshot: !!snap,
    len: snap ? snap.payload.len : null, ms: snap ? snap.at - tFg : null
  })
  result.numbers.fgPullSnapshot = !!snap
  result.numbers.fgPullMs = snap ? snap.at - tFg : null
  result.numbers.fgPullFocus = focus

  // ── 5) reverse key returns to push ──────────────────────────────────────
  const tRev = Date.now()
  c.send('screen:clipboard_sync_reverse', {})
  const rev = await waitEvent(c, e => e.type === 'screen:clipboard_sync' && e.payload && e.payload.direction === 'to-device' && e.at >= tRev, 5000)
  step('reverse key', { ms: rev ? rev.at - tRev : null, direction: rev ? rev.payload.direction : null })
  result.numbers.reverseMs = rev ? rev.at - tRev : null

  // ── 6) disable ──────────────────────────────────────────────────────────
  const tOff = Date.now()
  c.send('screen:clipboard_sync_enable', { enabled: false })
  const off = await waitEvent(c, e => e.type === 'screen:clipboard_sync' && e.payload && e.payload.enabled === false && e.at >= tOff, 5000)
  const stOff = await state(devId)
  step('disable', { ms: off ? off.at - tOff : null, enabled: stOff.enabled, agentWatching: stOff.agentWatching, reason: stOff.lastReason })
  result.numbers.disableMs = off ? off.at - tOff : null

  home()
  result.numbers.finalState = stOff
  c.close()
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8')
  console.log('\nNUMBERS ' + JSON.stringify(result.numbers))
})().catch(e => { console.error('ANDROID MEASURE FAILED:', e.message); process.exit(1) })
