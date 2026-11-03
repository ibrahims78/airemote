# restore-worker.ps1 - remove the deny ACE and restart the agent on the precompiled worker.
# Output: C:\Users\admin\restore-worker.out.txt
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\restore-worker.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }

$exe = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
$dir = Join-Path $env:APPDATA 'AiRemote Agent'

Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
foreach ($p in @(Get-CimInstance Win32_Process -Filter "Name LIKE 'capture-gdi-worker%'")) {
    try { & taskkill.exe /T /F /PID $p.ProcessId 2>$null | Out-Null } catch {}
}
foreach ($p in @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*capture-gdi.ps1*' })) {
    try { & taskkill.exe /T /F /PID $p.ProcessId 2>$null | Out-Null } catch {}
}
Start-Sleep -Milliseconds 500

foreach ($f in @(Get-ChildItem $dir -Filter 'capture-gdi-worker-*.exe' -ErrorAction SilentlyContinue)) {
    $out = & icacls.exe $f.FullName /remove:d $env:USERNAME 2>&1
    Add-Line ('UNDENY=' + $f.Name + ' :: ' + ($out -join ' '))
}

Start-Process $exe
Start-Sleep -Seconds 12

Add-Line ('RUNNING=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
Add-Line ('WORKER_PROCS=' + @(Get-Process -Name 'capture-gdi-worker*' -ErrorAction SilentlyContinue).Count)
Add-Line ('PS1_PROCS=' + @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*capture-gdi.ps1*' }).Count)
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
