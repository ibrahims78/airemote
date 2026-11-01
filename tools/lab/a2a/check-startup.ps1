# check-startup.ps1 — إعدادات الوكيل ومصادر التشغيل التلقائي
$out = 'C:\Users\admin\startup.out.txt'
$L = New-Object System.Collections.ArrayList
function A($t) { [void]$L.Add($t); $L | Set-Content -Encoding UTF8 $out }

foreach ($d in @('AiRemote Agent', 'airemote-agent-desktop')) {
    $cfg = Join-Path $env:APPDATA ($d + '\airemote-config.json')
    if (Test-Path $cfg) {
        try {
            $j = Get-Content $cfg -Raw -Encoding UTF8 | ConvertFrom-Json
            A ('CFG ' + $d + ' server=' + $j.serverUrl + ' autoStart=' + $j.autoStart + ' mode=' + $j.controlAuthMode)
        } catch { A ('CFG ' + $d + ' parse-error') }
    } else { A ('CFG ' + $d + ' MISSING') }
}

$run = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
if ($run) { $names = ($run.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $_.Name }); A ('RUN_KEYS=' + ($names -join ',')) } else { A 'RUN_KEYS=none' }

$startup = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup'
if (Test-Path $startup) { $f = Get-ChildItem $startup -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }; A ('STARTUP_DIR=' + ($f -join ',')) } else { A 'STARTUP_DIR=none' }

$tasks = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match 'AiRemote' } | ForEach-Object { $_.TaskName + ':' + $_.State }
A ('TASKS=' + ($tasks -join ','))

A ('AGENT_PROCS=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
