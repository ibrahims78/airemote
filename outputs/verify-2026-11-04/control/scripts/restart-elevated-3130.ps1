# restart-elevated-3130.ps1 - kill a surviving ELEVATED agent + stale GDI worker, then relaunch elevated (HIGHEST task).
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\restart-elevated-3130.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
$exe = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
$bat = 'C:\Users\admin\kill-agent.bat'
$b = @()
$b += 'taskkill /F /T /IM "AiRemote Agent.exe"'
$b += 'powershell -NoProfile -Command "Get-Process -Name ''capture-gdi-worker*'' -ErrorAction SilentlyContinue | Stop-Process -Force"'
$b += 'exit /b 0'
Set-Content -Path $bat -Value $b -Encoding ASCII
Add-Line ('BAT_WRITTEN=' + (Test-Path $bat))
Add-Line ('AGENT_BEFORE=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
& schtasks.exe /Create /TN 'AiRemoteKill' /TR $bat /SC ONCE /ST 23:59 /RL HIGHEST /IT /F | Out-Null
Add-Line ('KILL_TASK_CREATE=' + $LASTEXITCODE)
& schtasks.exe /Run /TN 'AiRemoteKill' | Out-Null
Add-Line ('KILL_TASK_RUN=' + $LASTEXITCODE)
Start-Sleep -Seconds 8
Add-Line ('AGENT_AFTER_KILL=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
Add-Line ('WORKER_AFTER_KILL=' + @(Get-Process -Name 'capture-gdi-worker-*' -ErrorAction SilentlyContinue).Count)
$tr = '"' + $exe + '"'
& schtasks.exe /Create /TN 'AiRemoteElev' /TR $tr /SC ONCE /ST 23:59 /RL HIGHEST /IT /F | Out-Null
Add-Line ('ELEV_TASK_CREATE=' + $LASTEXITCODE)
& schtasks.exe /Run /TN 'AiRemoteElev' | Out-Null
Add-Line ('ELEV_TASK_RUN=' + $LASTEXITCODE)
Start-Sleep -Seconds 22
$ap = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)
Add-Line ('AGENT_COUNT=' + $ap.Count)
foreach ($x in $ap) { Add-Line ('AGENT pid=' + $x.Id + ' start=' + $x.StartTime.ToString('s')) }
$wp = @(Get-Process -Name 'capture-gdi-worker-*' -ErrorAction SilentlyContinue)
Add-Line ('WORKER_COUNT=' + $wp.Count)
foreach ($x in $wp) { Add-Line ('WORKER ' + $x.ProcessName + ' start=' + $x.StartTime.ToString('s')) }
Add-Line ('NOW=' + (Get-Date).ToString('s'))
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
