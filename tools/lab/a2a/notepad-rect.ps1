# notepad-rect.ps1 - open Notepad and report its window rect + screen size (for click tests).
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\notepad-rect.out.txt'
$lines = New-Object System.Collections.ArrayList
Get-Process notepad -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 400
Start-Process notepad.exe
Start-Sleep -Seconds 2
$p = Get-Process notepad -ErrorAction SilentlyContinue | Select-Object -First 1
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices; public class WR { [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i); public struct R { public int L; public int T; public int Rt; public int B; } }'
if ($p) {
  $h = $p.MainWindowHandle
  [void][WR]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 300
  $r = New-Object WR+R
  [void][WR]::GetWindowRect($h, [ref]$r)
  [void]$lines.Add('HANDLE=' + $h)
  [void]$lines.Add('RECT=' + $r.L + ',' + $r.T + ',' + $r.Rt + ',' + $r.B)
  [void]$lines.Add('CENTER=' + [int](($r.L + $r.Rt) / 2) + ',' + [int](($r.T + $r.B) / 2))
} else { [void]$lines.Add('NO_NOTEPAD') }
[void]$lines.Add('SCREEN=' + [WR]::GetSystemMetrics(0) + 'x' + [WR]::GetSystemMetrics(1))
[void]$lines.Add('RESULT=ok')
$lines | Set-Content -Encoding ASCII $log
