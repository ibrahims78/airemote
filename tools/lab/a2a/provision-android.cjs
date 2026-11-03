#!/usr/bin/env node
'use strict'
/**
 * provision-android.cjs — تهيئة وكيل أندرويد عبر USB (adb) بلا كتابة يدوية على الجهاز.
 *
 * يفعل ثلاث خطوات:
 *   1) ينشئ سجل جهاز على السيرفر (POST /api/devices) ويحصل على token — لا يُطبع أبداً.
 *   2) يدفع `<externalFilesDir>/airemote-config.json` = {server, token} (مسار التهيئة في Prefs.bootstrap).
 *   3) يعيد تشغيل التطبيق وينتظر ظهوره online في /api/devices.
 *
 * الاستخدام:
 *   node tools/lab/a2a/provision-android.cjs [اسم الجهاز] [server-url]
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const lab = require('D:/autoclaw projects-new/AiRemote/tools/lab/lab.cjs')

const ADB = process.env.ADB || 'D:/autoclaw projects/offline-build-tools/android-toolchain/sdk/platform-tools/adb.exe'
const PKG = 'com.airemote.agent'
const NAME = process.argv[2] || 'TAB16-USB'
const SERVER = process.argv[3] || 'wss://192.168.1.25:3001/ws'

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', timeout: 60000 }).trim()

async function main() {
  console.log('device target :', NAME)
  console.log('server        :', SERVER)

  const before = await lab.devices()
  const dup = before.find(d => String(d.name).toLowerCase() === NAME.toLowerCase())
  if (dup) {
    console.error('ABORT: يوجد جهاز بهذا الاسم مسبقاً:', dup.id, '— احذفه أو استخدم اسماً آخر.')
    process.exit(2)
  }

  const created = await lab.api('/api/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NAME, tags: ['android', 'usb', 'lab'] }),
  })
  if (created.status !== 201 || !created.json || !created.json.token) {
    console.error('ABORT: فشل إنشاء الجهاز:', created.status, JSON.stringify(created.json || created.text.slice(0, 200)))
    process.exit(3)
  }
  const { id, token } = created.json
  console.log('deviceId      :', id)

  const tmp = path.join(os.tmpdir(), 'airemote-config-' + Date.now() + '.json')
  fs.writeFileSync(tmp, JSON.stringify({ server: SERVER, token }, null, 2), { encoding: 'utf8', mode: 0o600 })
  try {
    const remote = '/sdcard/Android/data/' + PKG + '/files/airemote-config.json'
    adb('shell', 'mkdir', '-p', '/sdcard/Android/data/' + PKG + '/files')
    adb('push', tmp, remote)
    console.log('config pushed :', remote)
  } finally {
    try { fs.unlinkSync(tmp) } catch {}
  }

  adb('shell', 'am', 'force-stop', PKG)
  adb('shell', 'am', 'start', '-n', PKG + '/.MainActivity')
  console.log('app restarted')

  const deadline = Date.now() + 45000
  let online = false
  while (Date.now() < deadline) {
    const list = await lab.devices()
    const d = list.find(x => x.id === id)
    if (d && (d.isOnline || d.status === 'online')) { online = true; break }
    await new Promise(r => setTimeout(r, 2000))
  }
  console.log('online        :', online ? 'YES' : 'NO (راجع: adb logcat -s AiRemote)')
  const list = await lab.devices()
  const d = list.find(x => x.id === id)
  if (d) console.log('agentVersion  :', (d.info || {}).agentVersion || '?')
  process.exit(online ? 0 : 4)
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
