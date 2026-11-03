# restart-agent.ps1 - start the agent after a guest boot (rule: any guest boot => restart the agent).
# Output: C:\Users\admin\restart-agent.out.txt
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\restart-agent.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }

$exe = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-Process $exe
Start-Sleep -Seconds 12

Add-Line ('RUNNING=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
Add-Line ('WORKER_PROCS=' + @(Get-Process -Name 'capture-gdi-worker*' -ErrorAction SilentlyContinue).Count)
Add-Line ('PS1_PROCS=' + @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*capture-gdi.ps1*' }).Count)
Add-Line ('EXE_PRESENT=' + @(Get-ChildItem (Join-Path $env:APPDATA 'AiRemote Agent') -Filter 'capture-gdi-worker-*.exe' -ErrorAction SilentlyContinue).Count)
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
