$ErrorActionPreference = "Continue"
$cfg = "C:\Users\admin\AppData\Roaming\airemote-agent-desktop\airemote-config.json"
$bak = "C:\Users\admin\agent-mode-backup.json"
$out = "C:\Users\admin\agent-mode-consent.out.txt"
$lines = @()
if (-not (Test-Path $cfg)) { $lines += "NO_CONFIG"; $lines | Set-Content -Encoding ASCII $out; exit 0 }
$j = Get-Content $cfg -Raw | ConvertFrom-Json
$lines += ("BEFORE=" + $j.controlAuthMode)
if (-not (Test-Path $bak)) { Copy-Item $cfg $bak -Force }
$j.controlAuthMode = "consent"
($j | ConvertTo-Json -Depth 20) | Set-Content -Encoding UTF8 $cfg
$lines += "SET=consent"
Get-Process "AiRemote Agent" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
Start-Process "C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe"
Start-Sleep -Seconds 18
$lines += ("AGENT_COUNT=" + @(Get-Process "AiRemote Agent" -ErrorAction SilentlyContinue).Count)
$lines += "RESULT=ok"
$lines | Set-Content -Encoding ASCII $out