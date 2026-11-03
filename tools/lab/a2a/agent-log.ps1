$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\agent-log.out.txt'
$lines = New-Object System.Collections.ArrayList
$dir = Join-Path $env:APPDATA 'AiRemote Agent'
[void]$lines.Add('DIR=' + $dir)
Get-ChildItem $dir -File -ErrorAction SilentlyContinue | ForEach-Object { [void]$lines.Add('FILE ' + $_.Name + ' ' + $_.Length) }
$logs = Join-Path $dir 'logs'
if (Test-Path $logs) {
  $f = Get-ChildItem $logs -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($f) {
    [void]$lines.Add('TAIL ' + $f.Name)
    foreach ($l in (Get-Content $f.FullName -Encoding UTF8 | Select-Object -Last 40)) { [void]$lines.Add($l) }
  }
} else { [void]$lines.Add('NO_LOGS_DIR') }
$lines | Set-Content -Encoding UTF8 $log
