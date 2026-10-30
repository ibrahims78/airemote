// Push a local file to a device through the product's file-transfer API.
// usage: node scripts/push-file.cjs <deviceId|name> <localFile> <remotePath>
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const fs = require('fs')
const path = require('path')

const BASE = 'https://127.0.0.1:3001'
const CREDS = 'C:\\Users\\admin\\AppData\\Roaming\\AiRemote\\lab-probe.json'
let CHUNK = 1024 * 1024

;(async () => {
  const target = process.argv[2]
  const local = process.argv[3]
  const remote = process.argv[4]
  if (!target || !local || !remote) { console.error('usage: push-file <device> <local> <remote>'); process.exit(2) }
  if (!fs.existsSync(local)) throw new Error('missing local file ' + local)
  const buf = fs.readFileSync(local)

  const c = JSON.parse(fs.readFileSync(CREDS, 'utf8'))
  const l = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password })
  }).then(r => r.json())
  const auth = { Authorization: 'Bearer ' + l.token, 'Content-Type': 'application/json' }

  const list = await fetch(BASE + '/api/devices', { headers: auth }).then(r => r.json())
  const arr = Array.isArray(list) ? list : (list.devices || [])
  const dev = arr.find(d => d.id === target) || arr.find(d => String(d.name).toLowerCase().includes(String(target).toLowerCase()))
  if (!dev) throw new Error('device not found')

  const created = await fetch(`${BASE}/api/devices/${dev.id}/file-transfers`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ direction: 'upload', path: remote, size: buf.length, name: path.basename(remote), conflict: 'replace' })
  }).then(r => r.json())
  if (!created.transfer) throw new Error('create failed: ' + JSON.stringify(created).slice(0, 300))
  const tid = created.transfer.id
  if (created.transfer.chunkSize) CHUNK = created.transfer.chunkSize
  console.log('transfer', tid, '->', remote, buf.length, 'bytes')

  await fetch(`${BASE}/api/file-transfers/${tid}/start`, { method: 'POST', headers: auth, body: '{}' })

  let offset = 0
  while (offset < buf.length) {
    const slice = buf.subarray(offset, Math.min(buf.length, offset + CHUNK))
    const r = await fetch(`${BASE}/api/file-transfers/${tid}/data?offset=${offset}`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + l.token, 'Content-Type': 'application/octet-stream' },
      body: slice
    })
    if (!r.ok) throw new Error('chunk failed at ' + offset + ': ' + (await r.text()).slice(0, 200))
    const js = await r.json()
    offset = js.transfer && js.transfer.bytes_done != null ? js.transfer.bytes_done : offset + slice.length
    process.stdout.write(`  ${(offset / 1048576).toFixed(1)}MB\r`)
  }

  const fin = await fetch(`${BASE}/api/file-transfers/${tid}/finish`, { method: 'POST', headers: auth, body: '{}' }).then(r => r.json())
  console.log('\nfinish:', JSON.stringify(fin.transfer || fin).slice(0, 300))
})().catch(e => { console.error('PUSH FAILED:', e.message); process.exit(1) })
