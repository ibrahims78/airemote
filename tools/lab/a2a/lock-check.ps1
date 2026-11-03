$ErrorActionPreference='Continue'
$log='C:\Users\admin\lock-check.out.txt'
$l=New-Object System.Collections.ArrayList
[void]$l.Add('LOGONUI=' + @(Get-Process LogonUI -ErrorAction SilentlyContinue).Count)
[void]$l.Add('QUSER=' + ((quser 2>&1) -join ' | '))
[void]$l.Add('EXPLORER=' + @(Get-Process explorer -ErrorAction SilentlyContinue).Count)
[void]$l.Add('RESULT=ok')
$l | Set-Content -Encoding ASCII $log
