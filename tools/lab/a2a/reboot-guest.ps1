# reboot-guest.ps1 - reboot WIN11 so it picks up svga.numDisplays="2" from the vmx.
# Output is written BEFORE the reboot is scheduled.
# Output: C:\Users\admin\reboot-guest.out.txt
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\reboot-guest.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }

Add-Type -AssemblyName System.Windows.Forms
Add-Line ('BEFORE_SCREENS=' + [System.Windows.Forms.Screen]::AllScreens.Count)
Add-Line ('BOOTED_AT=' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))
Add-Line 'RESULT=rebooting'
$lines | Set-Content -Encoding ASCII $log

& shutdown.exe /r /t 8 /f /d p:4:1 2>&1 | Out-Null
Start-Sleep -Seconds 2
