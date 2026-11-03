# kill-worker.ps1 - kill only the GDI worker (agent stays alive) to force a cold worker spawn
# on the next session. Simulates "session arrives before prewarm finished".
# Output: C:\Users\admin\kill-worker.out.txt
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\kill-worker.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }

$w = @(Get-CimInstance Win32_Process -Filter "Name LIKE 'capture-gdi-worker%'")
Add-Line ('BEFORE=' + $w.Count)
foreach ($p in $w) {
    try {
        & taskkill.exe /T /F /PID $p.ProcessId 2>$null | Out-Null
        Add-Line ('KILLED=' + $p.ProcessId + ' ' + $p.Name)
    } catch {
        Add-Line ('KILL_ERR=' + $p.ProcessId + ' ' + $_.Exception.Message)
    }
}
Start-Sleep -Milliseconds 500
$w2 = @(Get-CimInstance Win32_Process -Filter "Name LIKE 'capture-gdi-worker%'")
Add-Line ('AFTER=' + $w2.Count)
$agent = @(Get-CimInstance Win32_Process -Filter "Name='AiRemote Agent.exe'")
Add-Line ('AGENT_ALIVE=' + $agent.Count)
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
