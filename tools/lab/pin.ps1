$p = "$env:APPDATA\airemote-agent-desktop\session-cert-pin.txt"
if (Test-Path $p) { "pin=" + (Get-Content $p -Raw).Trim() } else { "no-pin" }
Get-ChildItem "$env:APPDATA\airemote-agent-desktop" -Filter '*cert*' -Force | ForEach-Object { "file=" + $_.Name }
