$o = New-Object System.Collections.ArrayList
$boot = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
[void]$o.Add('BOOT=' + $boot.ToString('HH:mm:ss'))
$p = Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Sort-Object StartTime | Select-Object -First 1
if ($p) { [void]$o.Add('AGENT_START=' + $p.StartTime.ToString('HH:mm:ss')); [void]$o.Add('AGENT_PROCS=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count) } else { [void]$o.Add('AGENT=none') }
$run = (Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue).'io.airemote.agent'
[void]$o.Add('RUNKEY=' + $run)
$o | Set-Content -Encoding UTF8 C:\Users\admin\boot.out.txt
