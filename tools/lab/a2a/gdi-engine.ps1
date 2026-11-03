# gdi-engine.ps1 - proves which GDI worker the agent actually runs (ASCII only).
# A) capture-gdi-worker-* must exist and its parent must be AiRemote Agent.exe
# B) no powershell.exe may be running with capture-gdi.ps1 in its command line
# Output: C:\Users\admin\gdi-engine.out.txt
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\gdi-engine.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }

$agent = Get-CimInstance Win32_Process -Filter "Name='AiRemote Agent.exe'" | Select-Object -First 1
Add-Line ('AGENT_PID=' + $agent.ProcessId)

$workers = @(Get-CimInstance Win32_Process -Filter "Name LIKE 'capture-gdi-worker%'")
Add-Line ('WORKER_COUNT=' + $workers.Count)
foreach ($w in $workers) {
    $parent = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $w.ParentProcessId) -ErrorAction SilentlyContinue
    Add-Line ('WORKER pid=' + $w.ProcessId + ' name=' + $w.Name + ' parentPid=' + $w.ParentProcessId + ' parentName=' + $parent.Name)
    Add-Line ('WORKER_CMD=' + $w.CommandLine)
    Add-Line ('WORKER_START=' + $w.CreationDate)
}

$ps = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*capture-gdi.ps1*' })
Add-Line ('PS1_WORKERS=' + $ps.Count)

$dir = Join-Path $env:APPDATA 'AiRemote Agent'
foreach ($f in @(Get-ChildItem $dir -Filter 'capture-gdi*' -ErrorAction SilentlyContinue)) {
    $h = (Get-FileHash $f.FullName -Algorithm SHA256).Hash.Substring(0, 16)
    Add-Line ('FILE=' + $f.Name + ' bytes=' + $f.Length + ' sha16=' + $h)
}
Add-Line ('SCREEN=' + (Get-CimInstance Win32_VideoController | Select-Object -First 1).CurrentHorizontalResolution + 'x' + (Get-CimInstance Win32_VideoController | Select-Object -First 1).CurrentVerticalResolution)
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
