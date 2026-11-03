# typing-load.ps1 - realistic desktop load: open Notepad and type for N seconds.
# GDI deltas this produces are what a user actually generates (small text edits).
# Output: C:\Users\admin\typing-load.out.txt
param()
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\typing-load.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }

Add-Type -AssemblyName System.Windows.Forms
Start-Process notepad.exe
Start-Sleep -Seconds 2
Add-Line ('NOTEPAD_STARTED=' + (Get-Date).ToString('HH:mm:ss'))
$words = @('alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel','india','juliet')
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$i = 0
while ($sw.Elapsed.TotalSeconds -lt 22) {
    $w = $words[$i % $words.Count]
    [System.Windows.Forms.SendKeys]::SendWait($w + ' ')
    $i++
    Start-Sleep -Milliseconds 70
}
Add-Line ('WORDS=' + $i)
Add-Line ('DURATION_S=' + [math]::Round($sw.Elapsed.TotalSeconds, 1))
Add-Line ('NOTEPAD_RUNNING=' + @(Get-Process notepad -ErrorAction SilentlyContinue).Count)
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
