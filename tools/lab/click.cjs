'use strict'
// Click at absolute screen coordinates inside a lab VM (real input, not UIA).
// usage: node tools/lab/click.cjs <DEVICE_NAME> <x> <y>
const path = require('path')
const remote = require(path.join(__dirname, 'remote.cjs'))

const PS = [
  "Add-Type -TypeDefinition @'",
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class MH {',
  '  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);',
  '  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);',
  '}',
  "'@",
  'Start-Sleep -Milliseconds 150',
  '[MH]::SetCursorPos(__X__,__Y__) | Out-Null',
  'Start-Sleep -Milliseconds 120',
  '[MH]::mouse_event(0x0002,0,0,0,[UIntPtr]::Zero)',
  '[MH]::mouse_event(0x0004,0,0,0,[UIntPtr]::Zero)',
  '"clicked __X__,__Y__"',
].join('\r\n')

;(async () => {
  const [device, x, y] = process.argv.slice(2)
  if (!device || !x || !y) { console.error('usage: node click.cjs <DEVICE> <x> <y>'); process.exit(1) }
  const ps = PS.replace('__X__', String(parseInt(x, 10))).replace('__Y__', String(parseInt(y, 10)))
  const r = await remote.run(device, ps, 30000)
  console.log(r.ok ? String(r.stdout || 'ok') : 'ERR ' + String(r.stderr || '').slice(0, 200))
})()
