// Reusable screen-session client for lab probes.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const lab = require('./lab.cjs')

async function open(device, opts = {}) {
  const id = await lab.deviceId(device)
  const t = await lab.ticket()
  const q = new URLSearchParams({
    deviceId: id, ticket: t,
    fps: String(opts.fps || 4), quality: String(opts.quality || 40), maxWidth: String(opts.maxWidth || 640)
  })
  const ws = new WebSocket('wss://127.0.0.1:3001/screen?' + q.toString())
  const events = []
  const waiters = []
  const frames = { count: 0, lastAt: 0, lastSize: 0 }

  ws.onmessage = (ev) => {
    if (typeof ev.data !== 'string') { frames.count++; frames.lastAt = Date.now(); frames.lastSize = ev.data.byteLength || ev.data.size || 0; return }
    let msg
    try { msg = JSON.parse(ev.data) } catch { return }
    const rec = { ...msg, at: Date.now() }
    events.push(rec)
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i]
      if (w.match(rec)) { waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(rec) }
    }
  }

  const client = {
    deviceId: id,
    ws,
    events,
    frames,
    send(type, payload) { ws.send(JSON.stringify({ type, payload: payload || {}, timestamp: Date.now() })) },
    waitFor(type, ms = 8000) {
      const hit = events.find(e => e.type === type)
      if (hit) return Promise.resolve(hit)
      return new Promise((resolve) => {
        const w = { match: e => e.type === type, resolve }
        w.timer = setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); resolve(null) }, ms)
        waiters.push(w)
      })
    },
    open(ms = 8000) {
      if (ws.readyState === 1) return Promise.resolve(true)
      return new Promise((resolve) => {
        const t = setTimeout(() => resolve(false), ms)
        ws.onopen = () => { clearTimeout(t); resolve(true) }
        ws.onerror = () => { clearTimeout(t); resolve(false) }
      })
    },
    close() { try { ws.close() } catch {} },
    summary() {
      return events.map(e => e.type + (e.payload && e.payload.text != null ? ':' + e.payload.text.length : ''))
    }
  }
  return client
}

module.exports = { open }
