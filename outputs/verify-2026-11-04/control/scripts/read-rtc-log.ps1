# read-rtc-log.ps1 - print the RTC bridge log (agent side).
# Output: C:\Users\admin\read-rtc-log.out.txt
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\read-rtc-log.out.txt'
$src = Join-Path $env:APPDATA 'AiRemote Agent\rtc.log'
$lines = New-Object System.Collections.ArrayList
if (Test-Path $src) {
    [void]$lines.Add('EXISTS=True')
    foreach ($l in (Get-Content $src -Encoding UTF8 | Select-Object -Last 40)) { [void]$lines.Add($l) }
} else {
    [void]$lines.Add('EXISTS=False')
}
[void]$lines.Add('RESULT=ok')
$lines | Set-Content -Encoding UTF8 $log
