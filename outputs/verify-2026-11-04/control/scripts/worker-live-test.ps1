# worker-live-test.ps1 - does the NEWEST deployed GDI worker move the cursor? (direct spawn, no agent)
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\worker-live-test.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices; public class WL { [DllImport("user32.dll")] public static extern bool GetCursorPos(out P p); public struct P { public int X; public int Y; } }'
Add-Type -AssemblyName System.Windows.Forms
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
Add-Line ('VIRTUAL=' + $vs.X + ',' + $vs.Y + ' ' + $vs.Width + 'x' + $vs.Height)
$exe = Get-ChildItem (Join-Path $env:APPDATA 'AiRemote Agent') -Filter 'capture-gdi-worker-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Add-Line ('EXE=' + $exe.Name + ' ' + $exe.Length + ' ' + $exe.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))
$p = New-Object System.Diagnostics.Process
$p.StartInfo.FileName = $exe.FullName
$p.StartInfo.Arguments = '-Fps 12 -Quality 60 -MaxWidth 1600'
$p.StartInfo.UseShellExecute = $false
$p.StartInfo.RedirectStandardInput = $true
$p.StartInfo.RedirectStandardOutput = $true
$p.StartInfo.CreateNoWindow = $true
$p.Start() | Out-Null
Start-Sleep -Milliseconds 1500
function Pos($tag) {
  $q = New-Object WL+P; [void][WL]::GetCursorPos([ref]$q)
  Add-Line ($tag + '=' + $q.X + ',' + $q.Y)
  Add-Line ($tag + '_EXPECT_NORM_ABS=see M cmd')
}
Pos 'BEFORE'
$p.StandardInput.WriteLine('M 32767 32767'); $p.StandardInput.Flush(); Start-Sleep -Milliseconds 500; Pos 'CENTER'
$p.StandardInput.WriteLine('M 9830 9830');   $p.StandardInput.Flush(); Start-Sleep -Milliseconds 500; Pos 'Q15'
$p.StandardInput.WriteLine('M 60000 60000'); $p.StandardInput.Flush(); Start-Sleep -Milliseconds 500; Pos 'HIGH'
$p.StandardInput.WriteLine('M 0 0');         $p.StandardInput.Flush(); Start-Sleep -Milliseconds 500; Pos 'TOPLEFT'
$p.StandardInput.WriteLine('C L 32767 32767'); $p.StandardInput.Flush(); Start-Sleep -Milliseconds 400; Pos 'AFTER_CLICK'
Add-Line ('EXITED=' + $p.HasExited)
$p.StandardInput.Close()
try { if (-not $p.HasExited) { $p.Kill() } } catch {}
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
