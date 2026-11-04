# agent-procs.ps1 - count agent processes and list renderer command lines (to see if an rtc window opened).
# Output: C:\Users\admin\agent-procs.out.txt
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\agent-procs.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }

$procs = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)
Add-Line ('COUNT=' + $procs.Count)
$i = 0
foreach ($p in $procs) {
    $i++
    $cl = ''
    try { $cl = (Get-CimInstance Win32_Process -Filter ("ProcessId=" + $p.Id)).CommandLine } catch {}
    if ($cl -and $cl.Length -gt 220) { $cl = $cl.Substring(0, 220) }
    Add-Line ('P' + $i + ' pid=' + $p.Id + ' cmd=' + $cl)
}
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
