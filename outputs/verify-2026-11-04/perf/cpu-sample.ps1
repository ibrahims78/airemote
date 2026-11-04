$ErrorActionPreference = "Continue"
$o = "C:\Users\admin\cpu-sample.out.txt"
$cores = [Environment]::ProcessorCount
$names = @("AiRemote Agent", "capture-gdi-worker")
$a = @{}
Get-Process -Name "AiRemote Agent" -ErrorAction SilentlyContinue | ForEach-Object { $a[$_.Id] = $_.CPU }
Get-Process -Name "capture-gdi-worker*" -ErrorAction SilentlyContinue | ForEach-Object { $a[$_.Id] = $_.CPU }
$t0 = Get-Date
Start-Sleep -Seconds 10
$dt = ((Get-Date) - $t0).TotalSeconds
$out = @()
$out += ("CORES=" + $cores)
$out += ("WINDOW_S=" + [math]::Round($dt, 1))
Get-Process -Name "AiRemote Agent" -ErrorAction SilentlyContinue | ForEach-Object {
  if ($a.ContainsKey($_.Id)) { $pct = (($_.CPU - $a[$_.Id]) / $dt / $cores) * 100; $out += ("AGENT pid=" + $_.Id + " cpu=" + [math]::Round($pct, 1) + "%") }
}
Get-Process -Name "capture-gdi-worker*" -ErrorAction SilentlyContinue | ForEach-Object {
  if ($a.ContainsKey($_.Id)) { $pct = (($_.CPU - $a[$_.Id]) / $dt / $cores) * 100; $out += ("WORKER " + $_.ProcessName + " cpu=" + [math]::Round($pct, 1) + "%") }
}
$out | Set-Content -Encoding ASCII $o