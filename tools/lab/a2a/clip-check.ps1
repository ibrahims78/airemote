# clip-check.ps1 - is the cursor confined by ClipCursor?
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\clip-check.out.txt'
$lines = New-Object System.Collections.ArrayList
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices; public class CL { [DllImport("user32.dll")] public static extern bool GetClipCursor(out R r); [DllImport("user32.dll")] public static extern bool GetCursorPos(out R r); [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i); public struct R { public int L; public int T; public int Rt; public int B; } }'
$r = New-Object CL+R
[void][CL]::GetClipCursor([ref]$r)
[void]$lines.Add('CLIP=' + $r.L + ',' + $r.T + ',' + $r.Rt + ',' + $r.B)
$q = New-Object CL+R
[void][CL]::GetCursorPos([ref]$q)
[void]$lines.Add('CURSOR=' + $q.L + ',' + $q.T)
[void]$lines.Add('SCREEN=' + [CL]::GetSystemMetrics(0) + 'x' + [CL]::GetSystemMetrics(1))
[void]$lines.Add('FG=' + ((Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 3 | ForEach-Object { $_.ProcessName }) -join ','))
[void]$lines.Add('RESULT=ok')
$lines | Set-Content -Encoding ASCII $log
