'use strict'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const { execFileSync } = require('child_process')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const SERIAL = '12927374CM001019'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

;(async () => {
  // close any active session first
  const list = await lab.api('/api/relay/sessions')
  for (const s of (list.json && list.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      console.log('closed', s.id, s.state)
    }
  }
  const r = await lab.api('/api/relay/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetDeviceId: '07f8ae91-5b64-41d9-97df-ce649772b0d3', access: 'control', requesterDeviceId: 'b42175d0-d0c9-428d-ab94-4e66dff56af3' })
  })
  console.log('request', r.status, r.json && r.json.sessionId, r.json && r.json.code)
  if (r.status !== 201) return
  await sleep(2500)
  try {
    const n = execFileSync(ADB, ['-s', SERIAL, 'shell', 'dumpsys', 'notification', '--noredact'], { encoding: 'utf8' })
    const has = n.includes('طلب اتصال بجهازك') || n.includes('com.airemote.agent')
    console.log('notification-present', has)
    const lock = execFileSync(ADB, ['-s', SERIAL, 'shell', 'dumpsys', 'window'], { encoding: 'utf8' })
    const m = /mDreamingLockscreen=(\w+)/.exec(lock)
    console.log('locked', m && m[1])
    execFileSync(ADB, ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { encoding: 'buffer' })
  } catch (e) { console.log('adb-err', e.message.split('\n')[0]) }
  console.log('SID=' + r.json.sessionId)
})()
