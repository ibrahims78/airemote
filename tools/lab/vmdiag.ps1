$out = 'C:\Users\admin\vmdiag.txt'
"time=$(Get-Date -Format o)" | Out-File $out -Encoding UTF8
$exe = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
"exeExists=$(Test-Path $exe)" | Out-File $out -Append -Encoding UTF8
if (Test-Path $exe) { "exeSize=$((Get-Item $exe).Length)" | Out-File $out -Append -Encoding UTF8 }
"procs=" | Out-File $out -Append -Encoding UTF8
Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Select-Object Id, StartTime | Format-Table -AutoSize | Out-String | Out-File $out -Append -Encoding UTF8
"dir=" | Out-File $out -Append -Encoding UTF8
Get-ChildItem 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent' -ErrorAction SilentlyContinue | Select-Object Name, Length | Format-Table -AutoSize | Out-String | Out-File $out -Append -Encoding UTF8
"resources=" | Out-File $out -Append -Encoding UTF8
Get-ChildItem 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\resources' -ErrorAction SilentlyContinue | Select-Object Name, Length | Format-Table -AutoSize | Out-String | Out-File $out -Append -Encoding UTF8
"eventlog=" | Out-File $out -Append -Encoding UTF8
try {
  Get-WinEvent -FilterHashtable @{ LogName = 'Application'; StartTime = (Get-Date).AddMinutes(-30) } -MaxEvents 12 -ErrorAction SilentlyContinue |
    Where-Object { $_.Message -match 'AiRemote' } | Select-Object TimeCreated, Id, LevelDisplayName, @{n = 'Msg'; e = { $_.Message.Substring(0, [Math]::Min(300, $_.Message.Length)) } } |
    Format-List | Out-String | Out-File $out -Append -Encoding UTF8
} catch { "eventlog-error" | Out-File $out -Append -Encoding UTF8 }
"done" | Out-File $out -Append -Encoding UTF8
