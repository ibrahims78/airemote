$ErrorActionPreference = 'Stop'
$cfgs = @('C:\Users\admin\AppData\Roaming\airemote-agent-desktop\airemote-config.json', 'C:\Users\admin\AppData\Roaming\AiRemote Agent\airemote-config.json')
$exe = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
$log = 'C:\Users\admin\restore-consent.log'
function W($m) { Add-Content -Path $log -Value ((Get-Date -Format 'HH:mm:ss') + ' ' + $m) -Encoding UTF8 }
try {
  Set-Content -Path $log -Value 'start' -Encoding UTF8
  Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 3
  foreach ($cfg in $cfgs) {
    if (-not (Test-Path $cfg)) { continue }
    $j = Get-Content $cfg -Raw | ConvertFrom-Json
    $j | Add-Member -NotePropertyName controlAuthMode -NotePropertyValue 'consent' -Force
    $j | Add-Member -NotePropertyName controlPasswordSalt -NotePropertyValue '' -Force
    $j | Add-Member -NotePropertyName controlPasswordHash -NotePropertyValue '' -Force
    [System.IO.File]::WriteAllText($cfg, ($j | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
    W ('restored ' + $cfg)
  }
  Start-Process -FilePath $exe -WindowStyle Minimized
  Start-Sleep -Seconds 6
  W ('agent-running=' + [bool](Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Select-Object -First 1))
  W 'done'
} catch { W ('ERROR ' + $_.Exception.Message) }
