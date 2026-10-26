/**
 * probe-android-control.cjs — proves the control path on a live device without
 * the dashboard GUI: ws-ticket -> /screen socket -> control request -> injected
 * tap -> frame accounting.
 *
 * Why: the dashboard harness only proves that frames arrive. Control is a
 * different path (role check -> ticket -> control gate -> agent accessibility
 * gesture). This probe exercises exactly that path and prints the message
 * types the server answers with, so a failure names its own stage.
 *
 * Auth is deliberately outside this file: the caller logs in (see
 * scripts/lab-api.cjs) and exports the session token as LAB_TOKEN, so no
 * credential handling lives here. This probe is consent-only by design: a
 * device that has a control password answers screen:control_denied with
 * reason=bad_password, which is the expected result on such a device (proven
 * 2026-10-26 on the LDPlayer agent).
 *
 * Usage: node scripts/probe-android-control.cjs   (LAB_TOKEN already exported)
 *
 * Env:
 *   LAB_TOKEN      required — bearer token from POST /api/auth/login
 *   LAB_HOST       default 192.168.0.175
 *   LAB_PORT       default 3001
 *   LAB_DEVICE     device-name substring, default "Android"
 *   TAP_X TAP_Y    normalized tap target (0..1), default 0.871 / 0.088
 *   SKIP_CONTROL   1 = stream only, never request control
 *   BUDGET_MS      wait budget, default 45000
 *
 * Exit codes: 0 = control granted and tap sent, 2 = frames but no control,
 *             1 = setup/auth failure.
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const HOST = process.env.LAB_HOST || '192.168.0.175'
const PORT = process.env.LAB_PORT || '3001'
const BASE = `https://${HOST}:${PORT}`
const BEARER = process.env.LAB_TOKEN
const WANT = process.env.LAB_DEVICE || 'Android'
const TAP_X = Number(process.env.TAP_X || '0.871')
const TAP_Y = Number(process.env.TAP_Y || '0.088')
const SKIP_CONTROL = process.env.SKIP_CONTROL === '1'
const BUDGET_MS = Number(process.env.BUDGET_MS || '45000')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const say = (...a) => console.log('[ctl]', ...a)
const redact = (u) => String(u).replace(/ticket=[^&]+/g, 'ticket=<redacted>')

async function jsonFetch(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let body = null
  try { body = text ? JSON.parse(text) : null } catch { body = { raw: text.slice(0, 200) } }
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${url} -> ${res.status} ${text.slice(0, 180)}`)
  return body
}

async function main() {
  if (!BEARER) throw new Error('LAB_TOKEN is required (log in first and export the session token)')
  const auth = { Authorization: `Bearer ${BEARER}` }
  say('token present in environment (not printed)')

  const devicesRaw = await jsonFetch(`${BASE}/api/devices`, { headers: auth })
  const list = Array.isArray(devicesRaw) ? devicesRaw : (devicesRaw.devices || devicesRaw.data || [])
  const target = list.find((d) => String(d.name || d.hostname || '').toLowerCase().includes(WANT.toLowerCase()))
    || list.find((d) => String(d.platform || '').toLowerCase().includes('android'))
  if (!target) throw new Error('device not found: ' + WANT)
  const deviceId = target.id || target.deviceId
  say(`device ${target.name} id=${deviceId} status=${target.status || target.online}`)

  const { ticket } = await jsonFetch(`${BASE}/api/auth/ws-ticket`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: '{}'
  })
  if (!ticket) throw new Error('no ws ticket')

  const url = `wss://${HOST}:${PORT}/screen?ticket=${encodeURIComponent(ticket)}&deviceId=${encodeURIComponent(deviceId)}&fps=5&quality=50&maxWidth=640`
  const ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  const state = {
    opened: false,
    frames: 0,
    frameBytes: 0,
    firstFrame: null,
    text: [],
    control: 'idle',
    controlReason: null,
    tapSentAt: null,
    errors: []
  }
  const t0 = Date.now()

  ws.onopen = () => {
    state.opened = true
    say('screen socket open ' + redact(url))
    setTimeout(() => {
      if (SKIP_CONTROL) { say('SKIP_CONTROL=1 — stream only'); return }
      const requestId = Math.random().toString(36).slice(2, 10)
      ws.send(JSON.stringify({ type: 'screen:request_control', payload: { requestId } }))
      state.control = 'requested'
      say('CONTROL_REQUESTED — waiting for the device-side consent dialog')
    }, 900)
  }

  ws.onmessage = (ev) => {
    const d = ev.data
    if (typeof d !== 'string') {
      const buf = Buffer.from(d)
      state.frames++
      state.frameBytes += buf.length
      if (!state.firstFrame && buf.length >= 13) {
        state.firstFrame = { w: buf.readUInt32BE(0), h: buf.readUInt32BE(4), bytes: buf.length }
      }
      return
    }
    let msg = null
    try { msg = JSON.parse(d) } catch { return }
    if (state.text.length < 40) state.text.push(msg.type)
    if (msg.type === 'screen:frame') {
      // this server may deliver frames as JSON (base64) instead of binary
      const p = msg.payload || {}
      state.frames++
      state.frameBytes += Math.ceil(((p.data && p.data.length) || 0) * 3 / 4)
      if (!state.firstFrame) state.firstFrame = { w: p.width, h: p.height, keyframe: !!p.keyframe }
    }
    if (msg.type === 'screen:control_granted') {
      state.control = 'granted'
      say('CONTROL GRANTED')
      ws.send(JSON.stringify({ type: 'screen:mouse_event', payload: { type: 'down', x: TAP_X, y: TAP_Y, button: 0 } }))
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'screen:mouse_event', payload: { type: 'up', x: TAP_X, y: TAP_Y, button: 0 } }))
        state.tapSentAt = Date.now()
        say(`TAP SENT at ${TAP_X},${TAP_Y}`)
      }, 90)
    }
    if (msg.type === 'screen:control_denied') {
      state.control = 'denied'
      state.controlReason = (msg.payload && msg.payload.reason) || 'unknown'
      say('CONTROL DENIED: ' + state.controlReason)
    }
    if (msg.type === 'screen:error' || msg.type === 'screen:unavailable') {
      state.errors.push(msg.payload && msg.payload.message)
      say(`${msg.type}: ${(msg.payload && msg.payload.message) || ''}`)
    }
  }
  ws.onerror = (e) => { state.errors.push(String((e && e.message) || 'ws error')) }
  ws.onclose = () => { say('screen socket closed') }

  const deadline = t0 + BUDGET_MS
  while (Date.now() < deadline) {
    await sleep(500)
    if (state.tapSentAt) break
    if (state.control === 'denied') break
  }
  try { ws.send(JSON.stringify({ type: 'screen:stop', payload: {} })) } catch {}
  await sleep(400)
  try { ws.close() } catch {}

  const summary = {
    device: target.name,
    deviceId,
    opened: state.opened,
    frames: state.frames,
    frameBytes: state.frameBytes,
    firstFrame: state.firstFrame,
    control: state.control,
    controlReason: state.controlReason,
    tapSent: !!state.tapSentAt,
    tapTarget: { x: TAP_X, y: TAP_Y },
    seenTypes: Array.from(new Set(state.text)),
    errors: state.errors,
    ms: Date.now() - t0
  }
  console.log('RESULT ' + JSON.stringify(summary))
  return summary
}

main()
  .then((s) => process.exit(s.tapSent ? 0 : (s.frames > 0 ? 2 : 1)))
  .catch((e) => { console.log('RESULT ' + JSON.stringify({ error: String((e && e.message) || e) })); process.exit(1) })
