# start-agent.ps1 — تشغيل الوكيل مع بيئة تحتوي متغيّر السجل
$o = New-Object System.Collections.ArrayList
$env:AIRREMOTE_INPUT_DEBUG = '1'
$exe = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Start-Process -FilePath $exe -NoNewWindow
Start-Sleep -Seconds 14
$o.Add('RUNNING=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count) | Out-Null
$o | Set-Content -Encoding UTF8 C:\Users\admin\start-agent.out.txt
