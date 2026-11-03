# abs-test.ps1 - send absolute 0..65535 moves to the worker and read the cursor.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\abs-test.out.txt'
$lines = New-Object System.Collections.ArrayList
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices; public class C3 { [DllImport("user32.dll")] public static extern bool GetCursorPos(out P p); public struct P { public int X; public int Y; } }'
$exe = Get-Item 'C:\Users\admin\iw.exe'
$p = New-Object System.Diagnostics.Process
$p.StartInfo.FileName = $exe.FullName
$p.StartInfo.Arguments = '-Fps 12 -Quality 60 -MaxWidth 1600'
$p.StartInfo.UseShellExecute = $false
$p.StartInfo.RedirectStandardInput = $true
$p.StartInfo.RedirectStandardOutput = $true
$p.StartInfo.CreateNoWindow = $true
$p.Start() | Out-Null
Start-Sleep -Milliseconds 1200
function Pos($tag) { $q = New-Object C3+P; [void][C3]::GetCursorPos([ref]$q); [void]$lines.Add($tag + '=' + $q.X + ',' + $q.Y) }
Pos 'AFTER_CALIB'
$p.StandardInput.WriteLine('M 32767 32767'); $p.StandardInput.Flush(); Start-Sleep -Milliseconds 400
Pos 'CENTER'
$p.StandardInput.WriteLine('M 0 0'); $p.StandardInput.Flush(); Start-Sleep -Milliseconds 400
Pos 'TOPLEFT'
$p.StandardInput.WriteLine('M 65535 65535'); $p.StandardInput.Flush(); Start-Sleep -Milliseconds 400
Pos 'BOTTOMRIGHT'
[void]$lines.Add('EXITED=' + $p.HasExited)
$p.StandardInput.Close()
try { if (-not $p.HasExited) { $p.Kill() } } catch {}
[void]$lines.Add('RESULT=ok')
$lines | Set-Content -Encoding ASCII $log
