'use strict'
const { WebSocket } = require(String.raw`D:\autoclaw projects-new\AiRemote\node_modules\.pnpm\ws@8.21.0\node_modules\ws`)
const rt = process.argv[2]
const deviceId = process.argv[3] || '7fc54b40-e7c1-4db6-9f55-78f377c4f4ad'
if (!rt) { console.error('usage: node a2a-ws.cjs <rt> [deviceId]'); process.exit(2) }
const url = 'wss://127.0.0.1:3001/screen?rt=' + encodeURIComponent(rt) + '&deviceId=' + deviceId + '&binary=1&fps=15&quality=60&maxWidth=1280'
const ws = new WebSocket(url, { rejectUnauthorized: false })
let n = 0, bytes = 0, w = 0, h = 0, opened = false, closed = false
ws.on('open', () => { opened = true; console.log('open') })
ws.on('message', (d, isB) => {
  if (!isB) return
  n++; bytes += d.length
  if (d.length >= 13) { w = d.readUInt32BE(0); h = d.readUInt32BE(4) }
})
ws.on('error', e => console.log('err', e.message))
ws.on('close', c => { closed = true; console.log('close', c, 'frames', n, 'kbps', (bytes / 1024).toFixed(1), 'res', w + 'x' + h) })
setTimeout(() => {
  try { ws.close() } catch {}
  console.log('RESULT frames=' + n + ' bytes=' + bytes + ' ' + w + 'x' + h + ' open=' + opened)
  process.exit(0)
}, 8000)
