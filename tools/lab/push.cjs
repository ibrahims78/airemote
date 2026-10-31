// Push a file using the product file-transfer API (reuses cached token).
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const path = require('path')
const lab = require('./lab.cjs')

const BASE = lab.BASE

;(async () => {
  const target = process.argv[2]
  const local = process.argv[3]
  const remote = process.argv[4]
  if (!target || !local || !remote) { console.error('usage: push <device> <local> <remote>'); process.exit(2) }
  const buf = fs.readFileSync(local)
  const id = await lab.deviceId(target)

  const created = await lab.api(`/api/devices/${id}/file-transfers`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction: 'upload', path: remote, size: buf.length, name: path.basename(remote), conflict: 'replace' })
  })
  if (!created.json || !created.json.transfer) throw new Error('create failed: ' + created.text.slice(0, 300))
  const tid = created.json.transfer.id
  const CHUNK = created.json.transfer.chunkSize || 1048576
  await lab.api(`/api/file-transfers/${tid}/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })

  let offset = 0
  while (offset < buf.length) {
    const slice = buf.subarray(offset, Math.min(buf.length, offset + CHUNK))
    const r = await lab.api(`/api/file-transfers/${tid}/data?offset=${offset}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: slice
    })
    if (r.status >= 300) throw new Error('chunk failed at ' + offset + ': ' + r.text.slice(0, 200))
    offset = r.json && r.json.transfer && r.json.transfer.bytes_done != null ? r.json.transfer.bytes_done : offset + slice.length
    if (offset % (8 * 1048576) < CHUNK) console.log('  ' + (offset / 1048576).toFixed(1) + 'MB / ' + (buf.length / 1048576).toFixed(1) + 'MB')
  }
  const fin = await lab.api(`/api/file-transfers/${tid}/finish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  console.log('pushed', remote, buf.length, 'bytes ->', JSON.stringify(fin.json && (fin.json.transfer || fin.json)).slice(0, 200))
})().catch(e => { console.error('PUSH FAILED:', e.message); process.exit(1) })
