$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\autostart-3130.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
foreach ($k in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Run', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run')) {
  $p = Get-ItemProperty $k -ErrorAction SilentlyContinue
  if ($p) {
    foreach ($n in $p.PSObject.Properties) {
      if ($n.Name -notlike 'PS*' -and ($n.Value -match 'AiRemote|airemote')) { Add-Line ('RUNKEY ' + $k + ' :: ' + $n.Name + ' = ' + $n.Value) }
    }
  }
}
$t = (& schtasks.exe /Query /FO CSV /NH 2>&1 | Out-String)
$hits = ($t -split "\r?\n") | Where-Object { $_ -match 'AiRemote' }
Add-Line ('TASK_HITS=' + @($hits).Count)
foreach ($h in $hits) { Add-Line ('TASK ' + ($h -replace '"', '')) }
$svc = Get-Service -Name '*AiRemote*' -ErrorAction SilentlyContinue
Add-Line ('SERVICES=' + @($svc).Count)
foreach ($s in $svc) { Add-Line ('SVC ' + $s.Name + ' ' + $s.Status + ' ' + $s.StartType) }
$lnk = @(Get-ChildItem 'C:\Users\admin\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup' -ErrorAction SilentlyContinue)
Add-Line ('STARTUP_DIR=' + $lnk.Count)
foreach ($f in $lnk) { Add-Line ('STARTUP ' + $f.Name) }
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
