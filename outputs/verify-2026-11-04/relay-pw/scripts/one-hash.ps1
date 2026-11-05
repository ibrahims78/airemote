$o = "C:\Users\admin\one-hash.out.txt"
$p = "C:\\Users\\admin\\AppData\\Roaming\\airemote-agent-desktop\\airemote-config.json"
(Get-Content $p -Raw | ConvertFrom-Json).controlPasswordHash | Set-Content -Encoding ASCII $o