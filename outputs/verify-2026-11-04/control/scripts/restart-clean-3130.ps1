# restart-clean-3130.ps1 - stop agent + stale GDI workers, then start the agent on the 3.13.0 asar.
# Output: C:\Users\admin\restart-clean-3130.out.txt (output name = script name - lab rule).
$ErrorActionPreference = 'Stop'
$log = 'C:\Users\admin\restart-clean-3130.out.txt'
$lines = New-Object System.Collections.ArrayList
try {
    $exe = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
    Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $stale = @(Get-Process -Name 'capture-gdi-worker*' -ErrorAction SilentlyContinue)
    [void]$lines.Add('STALE_WORKERS=' + $stale.Count)
    foreach ($pr in $stale) { [void]$lines.Add('KILLED=' + $pr.ProcessName + ' ' + $pr.Id); Stop-Process -Id $pr.Id -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Seconds 2
    Start-Process $exe
    Start-Sleep -Seconds 20
    [void]$lines.Add('RUNNING=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
    $w = @(Get-Process -Name 'capture-gdi-worker*' -ErrorAction SilentlyContinue)
    [void]$lines.Add('WORKER_PROCS=' + $w.Count)
    foreach ($pr in $w) { [void]$lines.Add('WORKER=' + $pr.ProcessName) }
    [void]$lines.Add('RESULT=ok')
} catch {
    [void]$lines.Add('RESULT=ERR ' + $_.Exception.Message)
}
$lines | Set-Content -Encoding UTF8 $log
