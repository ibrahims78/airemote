# agent-when.ps1 - agent pid/start time + worker count (ASCII only).
# Output: C:\Users\admin\agent-when.out.txt
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\agent-when.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }

$a = Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($a) {
    Add-Line ('AGENT_PID=' + $a.Id)
    Add-Line ('AGENT_START=' + $a.StartTime.ToString('yyyy-MM-dd HH:mm:ss'))
} else {
    Add-Line 'AGENT_PID=none'
}
$w = @(Get-CimInstance Win32_Process -Filter "Name LIKE 'capture-gdi-worker%'")
Add-Line ('WORKERS=' + $w.Count)
foreach ($p in $w) { Add-Line ('WORKER=' + $p.ProcessId + ' parent=' + $p.ParentProcessId + ' start=' + $p.CreationDate) }
Add-Line ('NOW=' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
