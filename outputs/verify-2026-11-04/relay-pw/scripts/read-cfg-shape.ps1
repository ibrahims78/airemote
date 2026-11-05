$o = "C:\Users\admin\read-cfg-shape.out.txt"
$cfg = "C:\Users\admin\AppData\Roaming\airemote-agent-desktop\airemote-config.json"
$lines = @()
if (-not (Test-Path $cfg)) { "NO_CONFIG" | Set-Content -Encoding ASCII $o; exit 0 }
$j = Get-Content $cfg -Raw | ConvertFrom-Json
$lines += ("MODE=" + $j.controlAuthMode)
$lines += ("SALT=" + $j.controlPasswordSalt)
$lines += ("HASHLEN=" + ("" + $j.controlPasswordHash).Length)
$lines += ("PREFIX=" + ("" + $j.controlPasswordHash).Substring(0, [Math]::Min(7, ("" + $j.controlPasswordHash).Length)))
$lines | Set-Content -Encoding ASCII $o