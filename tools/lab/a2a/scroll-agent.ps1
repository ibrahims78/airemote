# scroll-agent.ps1 — تنشيط نافذة الوكيل والتمرير للأسفل لعرض قسمَي الأجهزة والجلسات.
$out = 'C:\Users\admin\scroll-agent.out.txt'
$lines = New-Object System.Collections.ArrayList
try {
  $ws = New-Object -ComObject WScript.Shell
  $ok = $ws.AppActivate('AiRemote Agent')
  Start-Sleep -Milliseconds 500
  [void]$lines.Add('activate=' + $ok)
  for ($i = 0; $i -lt 6; $i++) { $ws.SendKeys('{PGDN}'); Start-Sleep -Milliseconds 350 }
  [void]$lines.Add('scrolled=6')
} catch { [void]$lines.Add('ERR ' + $_.Exception.Message) }
[void]$lines.Add('DONE')
Set-Content -Path $out -Value $lines -Encoding UTF8
