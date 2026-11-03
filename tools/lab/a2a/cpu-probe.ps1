# cpu-probe.ps1 - per-process CPU load snapshot (3s delta) + rtc/gdi state. ASCII only.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\cpu-probe.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }

$cores = [Environment]::ProcessorCount
Add-Line ('CORES=' + $cores)
$snap1 = @{}
foreach ($p in Get-Process) { try { $snap1[$p.Id] = $p.TotalProcessorTime.TotalMilliseconds } catch {} }
Start-Sleep -Seconds 3
$rows = New-Object System.Collections.ArrayList
foreach ($p in Get-Process) {
    $t1 = 0
    try { $t1 = $p.TotalProcessorTime.TotalMilliseconds } catch { continue }
    if (-not $snap1.ContainsKey($p.Id)) { continue }
    $pct = (($t1 - $snap1[$p.Id]) / 3000.0 / $cores) * 100
    if ($pct -lt 1) { continue }
    $name = $p.ProcessName
    $ws = [math]::Round($p.WorkingSet64 / 1MB, 0)
    [void]$rows.Add([pscustomobject]@{ Pct = [math]::Round($pct, 1); Name = $name; Pid = $p.Id; MB = $ws })
}
foreach ($r in ($rows | Sort-Object Pct -Descending | Select-Object -First 12)) {
    Add-Line ('CPU ' + $r.Pct + '% ' + $r.Name + ' pid=' + $r.Pid + ' ws=' + $r.MB + 'MB')
}

$rtc = Join-Path $env:APPDATA 'AiRemote Agent\rtc.log'
if (Test-Path $rtc) {
    Add-Line '--- rtc.log tail ---'
    foreach ($l in (Get-Content $rtc -Encoding UTF8 | Select-Object -Last 12)) { Add-Line $l }
} else { Add-Line 'rtc.log missing' }

$w = @(Get-CimInstance Win32_Process -Filter "Name LIKE 'capture-gdi-worker%'")
Add-Line ('GDI_WORKERS=' + $w.Count)
foreach ($x in $w) { Add-Line ('GDI pid=' + $x.ProcessId + ' cmd=' + $x.CommandLine) }
$ps1w = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*capture-gdi.ps1*' })
Add-Line ('PS1_WORKERS=' + $ps1w.Count)
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
