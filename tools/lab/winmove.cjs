'use strict'
// Move every visible top-level window of an AiRemote process to the top-left.
// usage: node tools/lab/winmove.cjs <DEVICE_NAME> [width] [height]
const path = require('path')
const remote = require(path.join(__dirname, 'remote.cjs'))

const PS = [
  "Add-Type -TypeDefinition @'",
  'using System;',
  'using System.Text;',
  'using System.Collections.Generic;',
  'using System.Runtime.InteropServices;',
  'public class WE {',
  '  public delegate bool EnumProc(IntPtr h, IntPtr p);',
  '  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);',
  '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
  '  [DllImport("user32.dll")] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);',
  '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);',
  '  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);',
  '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
  '  public static List<IntPtr> All() {',
  '    var list = new List<IntPtr>();',
  '    EnumWindows((h, p) => { if (IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);',
  '    return list;',
  '  }',
  '}',
  "'@",
  '$names=@()',
  'Get-Process | Where-Object { $_.ProcessName -match "airemote|AiRemote" } | ForEach-Object { $names += $_.Id }',
  '$out=@()',
  'foreach($h in [WE]::All()){',
  '  $pid2=0',
  '  [WE]::GetWindowThreadProcessId($h,[ref]$pid2) | Out-Null',
  '  if($names -notcontains [int]$pid2){ continue }',
  '  $sb=New-Object System.Text.StringBuilder 512',
  '  [WE]::GetWindowTextW($h,$sb,512) | Out-Null',
  '  $t=$sb.ToString()',
  '  [WE]::SetWindowPos($h,[IntPtr]::Zero,5,5,__W__,__H__,0x40) | Out-Null',
  '  [WE]::SetForegroundWindow($h) | Out-Null',
  '  $out += ("pid=" + $pid2 + " title=" + $t)',
  '}',
  "if ($out.Count -eq 0) { 'no-window' } else { $out -join ' | ' }",
].join('\r\n')

;(async () => {
  const [device, w, h] = process.argv.slice(2)
  if (!device) { console.error('usage: node winmove.cjs <DEVICE_NAME> [w] [h]'); process.exit(1) }
  const ps = PS.replace('__W__', String(w || 1200)).replace('__H__', String(h || 600))
  const r = await remote.run(device, ps, 30000)
  console.log(r.ok ? String(r.stdout || '(no output)') : 'ERR ' + String(r.stderr || '').slice(0, 300))
})()
