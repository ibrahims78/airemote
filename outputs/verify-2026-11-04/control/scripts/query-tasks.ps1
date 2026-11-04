# query-tasks.ps1 - UAC state + any AiRemote scheduled tasks / run entries.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\query-tasks.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
$u = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System' -ErrorAction SilentlyContinue
Add-Line ('ENABLE_LUA=' + $u.EnableLUA + ' CONSENT=' + $u.ConsentPromptBehaviorAdmin + ' SECURE_PROMPT=' + $u.PromptOnSecureDesktop)
$t = @(Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match 'AiRemote|aiRemote' })
Add-Line ('AIREMOTE_TASKS=' + $t.Count)
foreach ($x in $t) {
  $run = ''
  try { $run = $x.Principal.RunLevel } catch {}
  Add-Line ('TASK ' + $x.TaskPath + $x.TaskName + ' state=' + $x.State + ' runlevel=' + $run)
}
$rk = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
Add-Line ('HKCU_RUN=' + (($rk.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $_.Name + '=' + $_.Value }) -join ' | '))
$rk2 = Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
Add-Line ('HKLM_RUN=' + (($rk2.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { $_.Name + '=' + $_.Value }) -join ' | '))
$who = & whoami.exe /groups 2>&1 | Out-String
Add-Line ('INTEGRITY_HIGH=' + ($who -match 'S-1-16-12288'))
Add-Line ('INTEGRITY_MEDIUM=' + ($who -match 'S-1-16-8192'))
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
