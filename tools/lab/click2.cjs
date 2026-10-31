'use strict'
// Slower, more reliable click for Chromium/Electron inside a lab VM.
// usage: node tools/lab/click2.cjs <DEVICE> <x> <y>
const path = require('path')
const remote = require(path.join(__dirname, 'remote.cjs'))

const PS = [
  "Add-Type -TypeDefinition @'",
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class MC {',
  '  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);',
  '  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);',
  '  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);',
  '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
  '  public struct POINT { public int X, Y; }',
  '}',
  "'@",
  '$p=New-Object MC+POINT',
  '$p.X=__X__; $p.Y=__Y__',
  '[MC]::SetCursorPos(__X__,__Y__) | Out-Null',
  'Start-Sleep -Milliseconds 200',
  '$h=[MC]::WindowFromPoint($p)',
  'if($h -ne [IntPtr]::Zero){ [MC]::SetForegroundWindow($h) | Out-Null }',
  'Start-Sleep -Milliseconds 300',
  '[MC]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)',
  'Start-Sleep -Milliseconds 110',
  '[MC]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)',
  'Start-Sleep -Milliseconds 500',
  '[MC]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)',
  'Start-Sleep -Milliseconds 110',
  '[MC]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)',
  '"clicked __X__,__Y__ twice"',
].join('\r\n')

;(async () => {
  const [device, x, y] = process.argv.slice(2)
  if (!device || !x || !y) { console.error('usage: node click2.cjs <DEVICE> <x> <y>'); process.exit(1) }
  const ps = PS.split('__X__').join(String(parseInt(x, 10))).split('__Y__').join(String(parseInt(y, 10)))
  const r = await remote.run(device, ps, 30000)
  console.log(r.ok ? String(r.stdout || 'ok') : 'ERR ' + String(r.stderr || '').slice(0, 200))
})()
