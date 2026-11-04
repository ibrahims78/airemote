# diag-agent-3130.ps1 - installed asar fingerprint + agent/worker process start times.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\diag-agent-3130.out.txt'
$lines = New-Object System.Collections.ArrayList
$asar = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\resources\app.asar'
if (Test-Path $asar) { $fi = Get-Item $asar; [void]$lines.Add('ASAR_LEN=' + $fi.Length); [void]$lines.Add('ASAR_WRITE=' + $fi.LastWriteTime.ToString('s')); [void]$lines.Add('ASAR_SHA=' + (Get-FileHash $asar -Algorithm SHA256).Hash.ToLower()) } else { [void]$lines.Add('ASAR_MISSING=1') }
$ap = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)
[void]$lines.Add('AGENT_COUNT=' + $ap.Count)
foreach ($x in $ap) { [void]$lines.Add('AGENT pid=' + $x.Id + ' start=' + $x.StartTime.ToString('s')) }
$wp = @(Get-Process -Name 'capture-gdi-worker-*' -ErrorAction SilentlyContinue)
[void]$lines.Add('WORKER_COUNT=' + $wp.Count)
foreach ($x in $wp) { [void]$lines.Add('WORKER ' + $x.ProcessName + ' pid=' + $x.Id + ' start=' + $x.StartTime.ToString('s')) }
[void]$lines.Add('NOW=' + (Get-Date).ToString('s'))
[void]$lines.Add('RESULT=ok')
$lines | Set-Content -Encoding ASCII $log
