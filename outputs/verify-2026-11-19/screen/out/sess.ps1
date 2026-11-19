Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Select-Object Id,SessionId,ProcessName | Format-Table -AutoSize | Out-File C:\r22-sess.txt
Get-Process | Where-Object { $_.ProcessName -match 'capture-gdi' } | Select-Object Id,SessionId,ProcessName | Format-Table -AutoSize | Out-File C:\r22-sess.txt -Append
