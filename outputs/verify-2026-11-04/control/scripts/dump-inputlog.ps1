$ErrorActionPreference = "Continue"
$p = "C:\Users\admin\input-worker.log"
$o = "C:\Users\admin\dump-inputlog.out.txt"
$out = @()
if (Test-Path $p) { $all = @(Get-Content $p); $out += ("COUNT=" + $all.Count); $out += ($all | Select-Object -Last 6) } else { $out += "MISSING" }
$out | Set-Content -Encoding ASCII $o