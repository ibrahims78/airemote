# click-test.ps1 - click the Notepad "Format" menu via the worker's SendInput path.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\click-test.out.txt'
$lines = New-Object System.Collections.ArrayList
$exe = Get-ChildItem (Join-Path $env:APPDATA 'AiRemote Agent') -Filter 'capture-gdi-worker-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
[void]$lines.Add('EXE=' + $exe.Name)
$p = New-Object System.Diagnostics.Process
$p.StartInfo.FileName = $exe.FullName
$p.StartInfo.Arguments = '-Fps 12 -Quality 60 -MaxWidth 1600'
$p.StartInfo.UseShellExecute = $false
$p.StartInfo.RedirectStandardInput = $true
$p.StartInfo.RedirectStandardOutput = $true
$p.StartInfo.CreateNoWindow = $true
$p.Start() | Out-Null
Start-Sleep -Milliseconds 900
$p.StandardInput.WriteLine('M 346 253'); $p.StandardInput.Flush(); Start-Sleep -Milliseconds 250
$p.StandardInput.WriteLine('C L 346 253'); $p.StandardInput.Flush(); Start-Sleep -Milliseconds 400
[void]$lines.Add('CLICKED=346,253')
$p.StandardInput.WriteLine('P'); $p.StandardInput.Close()
Start-Sleep -Milliseconds 300
try { if (-not $p.HasExited) { $p.Kill() } } catch {}
[void]$lines.Add('RESULT=ok')
$lines | Set-Content -Encoding ASCII $log
