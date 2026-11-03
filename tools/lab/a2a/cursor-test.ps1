# cursor-test.ps1 - proves native input inside the GDI worker (physical pixels via GetCursorPos).
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\cursor-test.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices; public class Cur { [DllImport("user32.dll")] public static extern bool GetCursorPos(out P p); public struct P { public int X; public int Y; } }'

$exe = Get-Item 'C:\Users\admin\iw.exe' -ErrorAction SilentlyContinue; if (-not $exe) { $exe = Get-ChildItem (Join-Path $env:APPDATA 'AiRemote Agent') -Filter 'capture-gdi-worker-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1 }
Add-Line ('EXE=' + $exe.Name + ' ' + $exe.Length)
$p = New-Object System.Diagnostics.Process
$p.StartInfo.FileName = $exe.FullName
$p.StartInfo.Arguments = '-Fps 12 -Quality 60 -MaxWidth 1600'
$p.StartInfo.UseShellExecute = $false
$p.StartInfo.RedirectStandardInput = $true
$p.StartInfo.RedirectStandardOutput = $true
$p.StartInfo.CreateNoWindow = $true
$p.Start() | Out-Null
Start-Sleep -Milliseconds 800

function Pos($tag) {
  $q = New-Object Cur+P
  [void][Cur]::GetCursorPos([ref]$q)
  Add-Line ($tag + '=' + $q.X + ',' + $q.Y)
  return (,@($q.X, $q.Y))
}

$b = Pos 'BEFORE'
$p.StandardInput.WriteLine('M 400 300'); $p.StandardInput.Flush(); Start-Sleep -Milliseconds 250
$a = Pos 'AFTER_M1'; Add-Line ('MATCH_M1=' + ($a[0] -eq 400 -and $a[1] -eq 300))
$p.StandardInput.WriteLine('M 1200 700'); $p.StandardInput.Flush(); Start-Sleep -Milliseconds 250
$c = Pos 'AFTER_M2'; Add-Line ('MATCH_M2=' + ($c[0] -eq 1200 -and $c[1] -eq 700))
$p.StandardInput.WriteLine('C L 640 480'); $p.StandardInput.Flush(); Start-Sleep -Milliseconds 250
$d = Pos 'AFTER_CLICK'; Add-Line ('MATCH_CLICK=' + ($d[0] -eq 640 -and $d[1] -eq 480))
$p.StandardInput.WriteLine('P'); $p.StandardInput.Close()
Start-Sleep -Milliseconds 300
try { if (-not $p.HasExited) { $p.Kill() } } catch {}
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log

