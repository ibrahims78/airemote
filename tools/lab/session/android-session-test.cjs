'use strict'
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const { execFileSync } = require('child_process')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')
const ADB = 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function dump () {
  execFileSync(ADB, ['-s', 'emulator-5554', 'shell', 'uiautomator', 'dump', '/sdcard/ui.xml'], { encoding: 'utf8' })
  const xml = execFileSync(ADB, ['-s', 'emulator-5554', 'shell', 'cat', '/sdcard/ui.xml'], { encoding: 'utf8' })
  return xml
}
function findNode (xml, text) {
  const re = new RegExp('<node[^>]*text="' + text + '"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"')
  const m = re.exec(xml)
  if (!m) return null
  const [x1, y1, x2, y2] = m.slice(1).map(Number)
  return { x: Math.round((x1 + x2) / 2), y: Math.round((y1 + y2) / 2) }
}

;(async () => {
  const r = await lab.api('/api/relay/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetDeviceId: '9b5eeaf9-b30d-449c-875e-1e21e56ac041', access: 'control', requesterDeviceId: 'b42175d0-d0c9-428d-ab94-4e66dff56af3' })
  })
  console.log('request', r.status, r.json && r.json.sessionId, r.json && r.json.code)
  if (r.status !== 201) return
  const sid = r.json.sessionId
  await sleep(2500)
  const xml = dump()
  console.log('has-offer', xml.includes('طلب اتصال بجهازك'))
  const btn = findNode(xml, 'سماح')
  console.log('allow', JSON.stringify(btn))
  if (btn) {
    execFileSync(ADB, ['-s', 'emulator-5554', 'shell', 'input', 'tap', String(btn.x), String(btn.y)], { encoding: 'utf8' })
    console.log('tapped')
  }
  for (let i = 0; i < 6; i++) {
    await sleep(1000)
    const s = await lab.api('/api/relay/' + sid)
    console.log('state', s.json && s.json.state)
    if (s.json && s.json.state === 'active') break
  }
  console.log('SID=' + sid)
})()
