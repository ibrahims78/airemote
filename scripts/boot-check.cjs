// Boot the real server on a given Electron runtime and a throwaway DB copy,
// hit /health and one authenticated endpoint, then stop. Used to prove the engine switch.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path')
const fs = require('fs')

const srv = require(path.resolve(__dirname, '..', 'packages', 'server-desktop', 'server.js'))
const PORT = parseInt(process.env.BOOT_PORT || '3013', 10)
const DB = process.env.BOOT_DB
const BASE = process.env.BOOT_SCHEME === 'http' ? 'http://127.0.0.1:' + PORT : 'https://127.0.0.1:' + PORT

;(async () => {
  if (!DB || !fs.existsSync(DB)) throw new Error('BOOT_DB missing')
  const dir = path.join(path.dirname(DB), 'boot-' + Date.now())
  fs.mkdirSync(dir, { recursive: true })
  const dbCopy = path.join(dir, 'test.db')
  fs.copyFileSync(DB, dbCopy)

  await srv.start({ port: PORT, jwtSecret: 'boot-test', dbPath: dbCopy, tls: process.env.BOOT_SCHEME === 'http' ? false : undefined, logger: { info(){}, warn(){}, error(){} }, desktopCallbacks: {} })
  const h = await fetch(BASE + '/health').then(r => r.json())
  console.log('HEALTH ' + JSON.stringify(h))

  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.BOOT_EMAIL, password: process.env.BOOT_PASS })
  }).then(r => r.json())
  console.log('LOGIN ' + (login.token ? 'ok' : 'failed ' + JSON.stringify(login).slice(0, 120)))

  if (login.token) {
    const devs = await fetch(BASE + '/api/devices', { headers: { Authorization: 'Bearer ' + login.token } }).then(r => r.json())
    const arr = Array.isArray(devs) ? devs : (devs.devices || [])
    console.log('DEVICES ' + arr.length + ' -> ' + arr.map(d => d.name).join(','))
    const recs = await fetch(BASE + '/api/recordings', { headers: { Authorization: 'Bearer ' + login.token } }).then(r => r.json())
    const r2 = Array.isArray(recs) ? recs : (recs.recordings || [])
    console.log('RECORDINGS ' + r2.length)
  }

  await srv.stop()
  console.log('STOPPED')
  process.exit(0)
})().catch(e => { console.error('BOOT FAILED:', e.message); process.exit(1) })
