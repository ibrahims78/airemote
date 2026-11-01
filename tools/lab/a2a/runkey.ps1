$o = New-Object System.Collections.ArrayList
$run = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue
if ($run) { $run.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' } | ForEach-Object { [void]$o.Add('RUN ' + $_.Name + ' = ' + $_.Value) } }
[void]$o.Add('PROCS=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
$tr = 'C:\Users\admin\AppData\Roaming\airemote-agent-desktop\input-trace.log'
if (Test-Path $tr) { [void]$o.Add('TRACE_TAIL=' + ((Get-Content $tr -Tail 2) -join ' | ')) }
$o | Set-Content -Encoding UTF8 C:\Users\admin\runkey.out.txt
