$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\why-schtasks-3130.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Line ('WHOAMI=' + (whoami 2>&1))
Add-Line ('GROUPS_IL=' + ((whoami /groups 2>&1 | Select-String -Pattern 'Mandatory Label') -join ' '))
Add-Line ('IS_ADMIN=' + ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
Add-Line ('SESSIONNAME=' + $env:SESSIONNAME)
Add-Line ('USERNAME=' + $env:USERNAME)
$netOut = (net session 2>&1 | Out-String).Trim()
Add-Line ('NET_SESSION_EXIT=' + $LASTEXITCODE)
Add-Line ('NET_SESSION=' + ($netOut -replace '\s+', ' ').Substring(0, [Math]::Min(160, ($netOut -replace '\s+', ' ').Length)))
$tr = '"C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe"'
$o1 = (& schtasks.exe /Create /TN 'AiRemoteElevProbe' /TR $tr /SC ONCE /ST 23:59 /RL HIGHEST /IT /F 2>&1 | Out-String).Trim()
Add-Line ('CREATE_EXIT=' + $LASTEXITCODE)
Add-Line ('CREATE_OUT=' + ($o1 -replace '\r?\n', ' | '))
$o2 = (& schtasks.exe /Query /TN 'AiRemoteElevProbe' /FO LIST 2>&1 | Out-String).Trim()
Add-Line ('QUERY_EXIT=' + $LASTEXITCODE)
Add-Line ('QUERY_OUT=' + ($o2 -replace '\r?\n', ' | '))
[void](& schtasks.exe /Delete /TN 'AiRemoteElevProbe' /F 2>&1)
Add-Line ('AUDITKEY=' + ((reg query 'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' /v EnableLUA 2>&1 | Out-String) -replace '\r?\n', ' '))
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
