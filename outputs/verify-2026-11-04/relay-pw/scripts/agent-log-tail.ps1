$ErrorActionPreference = "Continue"
$o = "C:\Users\admin\agent-log-tail.out.txt"
$p = "C:\Users\admin\AppData\Roaming\airemote-agent-desktop\agent.log"
if (Test-Path $p) { Get-Content $p -Tail 12 | Set-Content -Encoding ASCII $o } else { "NO_LOG=$p" | Set-Content -Encoding ASCII $o }