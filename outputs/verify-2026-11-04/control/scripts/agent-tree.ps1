# agent-tree.ps1 - parent/child tree of agent processes (detect real duplicate instances).
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\agent-tree.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
$all = @(Get-CimInstance Win32_Process -Filter "Name='AiRemote Agent.exe'" -ErrorAction SilentlyContinue)
Add-Line ('COUNT=' + $all.Count)
foreach ($p in $all) {
  $cl = [string]$p.CommandLine
  $kind = if ($cl -match '--type=([a-z-]+)') { $Matches[1] } else { 'main' }
  Add-Line ('pid=' + $p.ProcessId + ' ppid=' + $p.ParentProcessId + ' kind=' + $kind)
}
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
