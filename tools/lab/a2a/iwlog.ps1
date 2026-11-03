# iwlog.ps1 - print the input worker diagnostic log.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\iwlog.out.txt'
$lines = New-Object System.Collections.ArrayList
$p = Join-Path $env:USERPROFILE 'input-worker.log'
if (Test-Path $p) {
  [void]$lines.Add('EXISTS=True')
  foreach ($l in (Get-Content $p -Encoding UTF8 | Select-Object -Last 30)) { [void]$lines.Add($l) }
} else { [void]$lines.Add('EXISTS=False') }
[void]$lines.Add('RESULT=ok')
$lines | Set-Content -Encoding UTF8 $log
