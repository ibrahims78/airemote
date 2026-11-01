'use strict'
// يتحقق من دورة حياة حوار الطلب على TECNO: يظهر عند الطلب، ويختفي عند الإغلاق.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const { execFileSync } = require('child_process')
const fs = require('fs')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const TECNO = '12927374CM001019'
const TECNO_ID = '07f8ae91-5b64-41d9-97df-ce649772b0d3'
const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const OUT = 'D:/autoclaw projects-new/AiRemote/outputs/verify-2026-11-01/offer-lifecycle'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const adb = (...a) => execFileSync(ADB, ['-s', TECNO, ...a], { encoding: 'utf8', timeout: 60000 })
const hasOfferDialog = () => {
  try { adb('shell', 'uiautomator', 'dump', '/sdcard/ol.xml'); const x = adb('shell', 'cat', '/sdcard/ol.xml'); return x.includes('طلب اتصال بجهازك') } catch { return false }
}
const devToken = (id) => {
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync('C:/Users/admin/AppData/Roaming/AiRemote-Server/airemote.db', { readOnly: true })
  const t = db.prepare('SELECT token FROM devices WHERE id=?').get(id).token
  db.close(); return t
}
;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const res = {}
  const l = await lab.api('/api/relay/sessions')
  for (const s of (l.json && l.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  }
  await sleep(1500)
  res.beforeRequest = hasOfferDialog()

  const r = await fetch('https://127.0.0.1:3001/api/relay/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Token': devToken(WIN10) },
    body: JSON.stringify({ targetDeviceId: TECNO_ID, access: 'control', requesterDeviceId: WIN10 }),
  })
  const j = await r.json()
  res.request = r.status; res.sid = j.sessionId
  await sleep(2500)
  res.dialogWhilePending = hasOfferDialog()

  await lab.api('/api/relay/' + res.sid + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  await sleep(2500)
  res.dialogAfterClose = hasOfferDialog()

  res.pass = {
    appears: res.dialogWhilePending === true,
    disappears: res.dialogAfterClose === false,
  }
  fs.writeFileSync(OUT + '/verify.json', JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
  process.exit(Object.values(res.pass).every(Boolean) ? 0 : 1)
})().catch(e => { console.error('ERR ' + (e && e.stack || e)); process.exit(1) })
