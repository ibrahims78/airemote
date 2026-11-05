$o = "C:\Users\admin\read-hash.out.txt"
$cfg = "C:\Users\admin\AppData\Roaming\airemote-agent-desktop\airemote-config.json"
(Get-Content $cfg -Raw | ConvertFrom-Json).controlPasswordHash | Set-Content -Encoding ASCII $o