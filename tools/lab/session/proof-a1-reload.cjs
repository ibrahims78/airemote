'use strict'
/**
 * 3.9.1 — إثبات حيّ لمفتاح إعادة الاتصال (A1) على ويندوز.
 * طلب WIN10 → WIN11 → محاولة نقر «سماح» → (سقوط إلى مسار المالك POST /decision)
 * → نافذة العرض في WIN10 → F5 (إعادة تحميل حقيقية) → لقطة ثانية + تدقيق.
 *
 * التشغيل: node tools/lab/session/proof-a1-reload.cjs [--xy=878,424]
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const path = require('path')
const fs = require('fs')
const lab = require(path.join(__dirname, '..', 'lab.cjs'))
const remote = require(path.join(__dirname, '..', 'remote.cjs'))

const WIN10 = 'b42175d0-d0c9-428d-ab94-4e66dff56af3'
const WIN11 = 'd147684b-2451-4418-a628-86f11aa66a4e'
const OUT = path.resolve(__dirname, '..', '..', '..', 'outputs', 'verify-2026-11-01', 'session-reconnect')
const xyArg = process.argv.find(a => a.startsWith('--xy='))
const [CX, CY] = (xyArg ? xyArg.split('=')[1] : '878,424').split(',').map(n => parseInt(n, 10))

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log(...a)

const clickScript = (x, y) => [
  "Add-Type -TypeDefinition @'",
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class MH {',
  '  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);',
  '  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);',
  '  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);',
  '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
  '  public struct POINT { public int X, Y; }',
  '}',
  "'@",
  '$pt=New-Object MH+POINT',
  '$pt.X=' + x + '; $pt.Y=' + y,
  '[MH]::SetCursorPos(' + x + ',' + y + ') | Out-Null',
  'Start-Sleep -Milliseconds 250',
  '$h=[MH]::WindowFromPoint($pt)',
  'if($h -ne [IntPtr]::Zero){ [MH]::SetForegroundWindow($h) | Out-Null }',
  'Start-Sleep -Milliseconds 350',
  '[MH]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)',
  'Start-Sleep -Milliseconds 120',
  '[MH]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)',
  'Start-Sleep -Milliseconds 600',
  '[MH]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)',
  'Start-Sleep -Milliseconds 120',
  '[MH]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)',
  '"clicked ' + x + ',' + y + ' twice"',
].join('\r\n')

const reloadScript = [
  'Add-Type -AssemblyName System.Windows.Forms',
  '$ws=New-Object -ComObject WScript.Shell',
  "$titles=@('AiRemote — session','AiRemote - session','AiRemote Agent','airemote-agent-desktop')",
  '$ok=$false',
  'foreach($t in $titles){ if($ws.AppActivate($t)){ Start-Sleep -Milliseconds 500; [System.Windows.Forms.SendKeys]::SendWait("{F5}"); "reloaded:$t"; $ok=$true; break } }',
  'if(-not $ok){ "no-window" }',
].join('\r\n')

const snapScript = [
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Drawing',
  '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
  '$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height',
  '$g=[System.Drawing.Graphics]::FromImage($bmp)',
  '$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)',
  '$ms=New-Object System.IO.MemoryStream',
  '$bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png)',
  '$g.Dispose(); $bmp.Dispose()',
  '[Convert]::ToBase64String($ms.ToArray())',
].join('\r\n')

async function shot (device, file) {
  const r = await remote.run(device, snapScript, 60000)
  const b64 = String(r.stdout || '').replace(/\s+/g, '')
  if (!b64) return 'no-image'
  const buf = Buffer.from(b64, 'base64')
  fs.writeFileSync(file, buf)
  return buf.length
}

async function stateOf (sid) {
  const s = await lab.api('/api/relay/' + sid)
  return s.json && s.json.state
}

async function waitState (sid, want, tries) {
  for (let i = 0; i < tries; i++) {
    await sleep(800)
    const st = await stateOf(sid)
    if (want.includes(st)) return st
  }
  return stateOf(sid)
}

function rowsOf (json) {
  if (Array.isArray(json)) return json
  if (json && typeof json === 'object') {
    for (const k of Object.keys(json)) if (Array.isArray(json[k])) return json[k]
  }
  return []
}
const count = (rows, action) => rowsOf(rows).filter(r => String(r.action || '') === action).length

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const list = await lab.api('/api/relay/sessions')
  for (const s of (list.json && list.json.sessions) || []) {
    if (['requested', 'active', 'suspended'].includes(s.state)) {
      await lab.api('/api/relay/' + s.id + '/close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      log('closed stale', s.id.slice(0, 8), s.state)
    }
  }

  const r = await lab.api('/api/relay/request', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetDeviceId: WIN11, access: 'control', requesterDeviceId: WIN10 }),
  })
  log('request', r.status, r.json && r.json.sessionId, r.json && (r.json.code || ''))
  if (r.status !== 201) process.exit(2)
  const sid = r.json.sessionId

  await sleep(2500)
  const click = await remote.run('WIN11-VM', clickScript(CX, CY), 30000)
  log('click:', (click.stdout || click.stderr || '').trim().slice(0, 80))

  let state = await waitState(sid, ['active', 'denied'], 6)
  let activatedBy = 'click'
  if (state === 'requested') {
    // النقر الصناعي من مضيف المختبر لا يصل إلى renderer الخاص بـChromium على هذا
    // الجهاز (تحقق: الإحداثيات وDPI=96 صحيحة، والمؤشر يُظهر hover). نوافق من مسار
    // المالك الرسمي POST /decision، وهو نفس relayDecide الذي يناديه زر «سماح».
    activatedBy = 'decision-api'
    const d = await lab.api('/api/relay/' + sid + '/decision', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accept: true }),
    })
    log('decision', d.status, d.json && d.json.state, d.json && d.json.code)
    state = await waitState(sid, ['active', 'denied'], 8)
  }
  log('state', state, 'activatedBy=' + activatedBy)

  if (state !== 'active') {
    log('capture win11:', await shot('WIN11-VM', path.join(OUT, 'win11-after-accept.png')))
    log('SID=' + sid, 'NOT ACTIVE')
    process.exit(3)
  }

  await sleep(6000)
  log('capture win10 before:', await shot('WIN10-VM', path.join(OUT, 'win10-viewer-before-reload.png')))
  log('capture win11 target:', await shot('WIN11-VM', path.join(OUT, 'win11-target.png')))

  const a1 = await lab.api('/api/audit?limit=200')
  const rows1 = rowsOf(a1.json)
  const opened1 = count(rows1, 'session_view_opened')
  const reopened1 = count(rows1, 'session_view_reopened')
  log('audit before: opened=' + opened1 + ' reopened=' + reopened1)

  const rel = await remote.run('WIN10-VM', reloadScript, 30000)
  log('reload:', (rel.stdout || rel.stderr || '').trim().slice(0, 80))

  await sleep(7000)
  log('capture win10 after:', await shot('WIN10-VM', path.join(OUT, 'win10-viewer-after-reload.png')))

  const a2 = await lab.api('/api/audit?limit=200')
  const rows2 = rowsOf(a2.json)
  const opened2 = count(rows2, 'session_view_opened')
  const reopened2 = count(rows2, 'session_view_reopened')
  log('audit after: opened=' + opened2 + ' reopened=' + reopened2)

  const s = await lab.api('/api/relay/' + sid)
  log('final state', s.json && s.json.state, 'bytesOut=' + (s.json && s.json.bytesOut))
  log(reopened2 > reopened1 ? 'RESULT: REOPEN PROVEN' : 'RESULT: REOPEN NOT OBSERVED')
  log('ACTIVATED_BY=' + activatedBy)
  log('SID=' + sid)
})()
