'use strict'
// Move + raise every AiRemote window on a lab VM so the offer card is fully visible.
// usage: node tools/lab/focus-agent.cjs <DEVICE_NAME>
const path = require('path')
const remote = require(path.join(__dirname, 'remote.cjs'))

const PS = [
  "Add-Type -TypeDefinition @'",
  'using System;',
  'using System.Runtime.InteropServices;',
  'public class Wi {',
  '  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);',
  '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);',
  '  public struct RECT { public int Left, Top, Right, Bottom; }',
  '}',
  "'@",
  'Add-Type -AssemblyName System.Windows.Forms',
  '$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
  '$done=@()',
  'Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object {',
  "  try { if ($_.MainWindowTitle -match 'AiRemote') {",
  '    $h=$_.MainWindowHandle',
  '    $r=New-Object Wi+RECT',
  '    [Wi]::GetWindowRect($h,[ref]$r) | Out-Null',
  '    $w=[Math]::Min($b.Width-20, 1200); $ht=[Math]::Min($b.Height-20, 620)',
  '    [Wi]::SetWindowPos($h,[IntPtr]::Zero,5,5,$w,$ht,0x40) | Out-Null',
  '    [Wi]::SetForegroundWindow($h) | Out-Null',
  '    $done += ($_.MainWindowTitle + " @ " + $r.Left + "," + $r.Top + " -> 5,5 " + $w + "x" + $ht)',
  '  } } catch {}',
  '}',
  "if ($done.Count -eq 0) { 'no-window' } else { $done -join ' | ' }",
].join('\r\n')

;(async () => {
  const device = process.argv[2]
  if (!device) { console.error('usage: node focus-agent.cjs <DEVICE_NAME>'); process.exit(1) }
  const r = await remote.run(device, PS, 30000)
  console.log(r.ok ? String(r.stdout || '(no output)') : 'ERR ' + String(r.stderr || '').slice(0, 200))
})()
