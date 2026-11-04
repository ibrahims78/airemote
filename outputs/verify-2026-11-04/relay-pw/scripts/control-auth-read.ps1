$ErrorActionPreference = "Continue"
$cfg = "C:\Users\admin\AppData\Roaming\AiRemote Agent\airemote-config.json"
$bak = "C:\Users\admin\control-auth-backup.json"
$out = "C:\Users\admin\control-auth-read.out.txt"
$lines = @()
if (-not (Test-Path $cfg)) { $lines += "NO_CONFIG"; $lines | Set-Content -Encoding ASCII $out; exit 0 }
$j = Get-Content $cfg -Raw | ConvertFrom-Json
$lines += ("BEFORE_MODE=" + $j.controlAuthMode)
$lines += ("HAS_HASH=" + [bool]$j.controlPasswordHash)
$lines += "RESULT=ok"
$lines | Set-Content -Encoding ASCII $out