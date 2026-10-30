// R8.1 live measurement — one-way clipboard sync on WIN11 (server 3.8.36, agent 3.8.36).
// Prints measured numbers only; clipboard content is reported as length + hash.
const fs = require('fs')
const crypto = require('crypto')
const lab = require('./lab.cjs')
const screen = require('./screen.cjs')
const remote = require('./remote.cjs')

const DEVICE = process.argv[2] || 'WIN11-VM'
const OUT = process.argv[3] || null
const sha = s => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex')
const short = s => sha(s).slice(0, 12)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const pwd = fs.readFileSync(__dirname + '/cp.txt', 'utf8').trim()

const result = { device: DEVICE, at: new Date().toISOString(), steps: [], numbers: {} }
function step(name, detail) {
  result.steps.push({ name, ...detail })
  console.log('- ' + name + ': ' + JSON.stringify(detail))
}

async function state(deviceId) {
  const r = await lab.api('/api/devices/' + deviceId + '/clipboard-sync')
  return r.json || {}
}
async function waitState(deviceId, pred, timeoutMs = 5000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    const s = await state(deviceId)
    if (pred(s)) return { s, ms: Date.now() - t0 }
    await sleep(80)
  }
  return { s: await state(deviceId), ms: null }
}
function waitEvent(c, pred, ms) {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const tick = () => {
      const hit = c.events.slice().reverse().find(pred)
      if (hit) return resolve(hit)
      if (Date.now() - t0 > ms) return resolve(null)
      setTimeout(tick, 40)
    }
    tick()
  })
}

;(async () => {
  const devId = await lab.deviceId(DEVICE)
  const list = await lab.devices()
  const dev = list.find(d => d.id === devId)
  result.numbers.agentVersion = (dev && dev.info && dev.info.agentVersion) || (dev && dev.agentVersion) || '?'

  const c = await screen.open(DEVICE)
  if (!await c.open()) throw new Error('screen ws did not open')
  await c.waitFor('screen:monitors', 4000)

  const tGrant = Date.now()
  c.send('screen:request_control', { requestId: 'r8-measure', password: pwd })
  const granted = await c.waitFor('screen:control_granted', 8000)
  step('control granted (consent gate)', { ok: !!granted, ms: granted ? granted.at - tGrant : null })
  if (!granted) throw new Error('control not granted — clipboard stays gated')

  await remote.setClipboard(DEVICE, 'baseline-' + Date.now())
  await sleep(300)

  // ── 1) enable, push direction; wait for the agent to confirm it watches ──
  const t0 = Date.now()
  const enabled = await lab.api('/api/devices/' + devId + '/clipboard-sync', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: true, direction: 'to-device' })
  })
  const on = await waitState(devId, s => s.enabled && s.agentWatching, 5000)
  step('enable (to-device)', { http: enabled.status, agentWatchingMs: on.ms, direction: on.s.direction })
  result.numbers.enableAckMs = on.ms

  // ── 2) push: ASCII, then UTF-8 Arabic ───────────────────────────────────
  const pushText = 'R8-PUSH-' + Date.now() + '-payload'
  const tPush = Date.now()
  c.send('screen:clipboard_local', { text: pushText })
  const sent1 = await waitState(devId, s => s.sent >= 1, 5000)
  const visible = await remote.getClipboard(DEVICE)
  step('push viewer→device (ASCII)', {
    ms: sent1.ms, deviceLen: visible == null ? null : visible.length,
    deviceHash: visible == null ? null : short(visible), match: visible === pushText
  })
  result.numbers.pushMs = sent1.ms
  result.numbers.pushMatch = visible === pushText

  const arabic = 'مزامنة الحافظة — اتجاه واحد ' + Date.now()
  c.send('screen:clipboard_local', { text: arabic })
  await waitState(devId, s => s.sent >= 2, 5000)
  const visibleAr = await remote.getClipboard(DEVICE)
  step('push viewer→device (UTF-8 Arabic)', {
    deviceLen: visibleAr == null ? null : visibleAr.length,
    match: visibleAr === arabic
  })
  result.numbers.pushArabicMatch = visibleAr === arabic

  // ── 3) one-way guard while pushing: device-side change must stay there ──
  const appliesBefore = c.events.filter(e => e.type === 'screen:clipboard_apply').length
  const devText = 'R8-DEVICE-ONLY-' + Date.now()
  await remote.setClipboard(DEVICE, devText)
  await sleep(2200)
  const appliesAfter = c.events.filter(e => e.type === 'screen:clipboard_apply').length
  step('device change while pushing', { appliesForwarded: appliesAfter - appliesBefore, note: 'agent does not read the clipboard in this direction' })
  result.numbers.pushLeak = appliesAfter - appliesBefore

  // ── 4) reverse key ──────────────────────────────────────────────────────
  const tRev = Date.now()
  c.send('screen:clipboard_sync_reverse', {})
  const rev = await waitEvent(c, e => e.type === 'screen:clipboard_sync' && e.payload && e.payload.direction === 'to-viewer' && e.at >= tRev, 4000)
  step('reverse key', { ms: rev ? rev.at - tRev : null, direction: rev ? rev.payload.direction : null })
  result.numbers.reverseMs = rev ? rev.at - tRev : null

  // The first apply after switching to pull is the current device clipboard
  // (initial sync). Record it, then measure a real change.
  const initialApply = await waitEvent(c, e => e.type === 'screen:clipboard_apply' && e.payload && e.payload.text === devText, 5000)
  step('pull initial snapshot', { ok: !!initialApply, match: !!initialApply })

  const pullText = 'R8-PULL-' + Date.now() + '-payload'
  await remote.setClipboard(DEVICE, pullText)
  const tPull = Date.now()
  const applied = await waitEvent(c, e => e.type === 'screen:clipboard_apply' && e.payload && e.payload.text === pullText, 8000)
  step('pull device→viewer', {
    ms: applied ? applied.at - tPull : null, match: !!applied,
    hash: applied ? applied.payload.hash : null, len: applied ? applied.payload.len : null
  })
  result.numbers.pullMs = applied ? applied.at - tPull : null
  result.numbers.pullMatch = !!applied

  const pullArabic = 'سحب من الجهاز — نص عربي ' + Date.now()
  await remote.setClipboard(DEVICE, pullArabic)
  const tPullAr = Date.now()
  const appliedAr = await waitEvent(c, e => e.type === 'screen:clipboard_apply' && e.payload && e.payload.text === pullArabic, 8000)
  step('pull device→viewer (UTF-8 Arabic)', { ms: appliedAr ? appliedAr.at - tPullAr : null, match: !!appliedAr })
  result.numbers.pullArabicMs = appliedAr ? appliedAr.at - tPullAr : null

  // ── 5) one-way guard while pulling: viewer change must not travel ──────
  const beforeSent = (await state(devId)).sent || 0
  const beforeBlocked = (await state(devId)).blocked || 0
  c.send('screen:clipboard_local', { text: 'R8-SHOULD-NOT-TRAVEL-' + Date.now() })
  await sleep(1200)
  const afterSent = (await state(devId)).sent || 0
  const afterBlocked = (await state(devId)).blocked || 0
  const stillThere = await remote.getClipboard(DEVICE)
  step('viewer change while pulling', {
    sentDelta: afterSent - beforeSent, blockedDelta: afterBlocked - beforeBlocked,
    deviceUnchanged: stillThere === pullArabic
  })
  result.numbers.pullLeak = afterSent - beforeSent
  result.numbers.pullBlocked = afterBlocked - beforeBlocked

  // ── 6) off ──────────────────────────────────────────────────────────────
  const tOff = Date.now()
  c.send('screen:clipboard_sync_enable', { enabled: false })
  const off = await waitEvent(c, e => e.type === 'screen:clipboard_sync' && e.payload && e.payload.enabled === false && e.at >= tOff, 4000)
  const offState = await state(devId)
  const afterOffText = 'R8-AFTER-OFF-' + Date.now()
  await remote.setClipboard(DEVICE, afterOffText)
  await sleep(1600)
  const appliesOff = c.events.filter(e => e.type === 'screen:clipboard_apply' && e.payload && e.payload.text === afterOffText).length
  step('disable', { ms: off ? off.at - tOff : null, enabled: offState.enabled, agentWatching: offState.agentWatching, appliesAfterOff: appliesOff })
  result.numbers.disableMs = off ? off.at - tOff : null

  result.numbers.finalState = offState
  result.numbers.events = c.events.filter(e => String(e.type).startsWith('screen:clipboard')).map(e => e.type)
  c.close()

  if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 2), 'utf8')
  console.log('\nNUMBERS ' + JSON.stringify(result.numbers))
})().catch(e => { console.error('MEASURE FAILED:', e.message); process.exit(1) })
