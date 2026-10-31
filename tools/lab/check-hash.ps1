$cfg = 'C:\Users\admin\AppData\Roaming\AiRemote Agent\airemote-config.json'
$pw = (Get-Content 'C:\Users\admin\cp2.txt' -Raw)
$j = Get-Content $cfg -Raw | ConvertFrom-Json
$sha = [System.Security.Cryptography.SHA256]::Create()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($j.controlPasswordSalt + ':' + $pw.Trim())
$hash = -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })
Write-Output ('pwlen=' + $pw.Length + ' trimmed=' + $pw.Trim().Length)
Write-Output ('saltlen=' + $j.controlPasswordSalt.Length)
Write-Output ('hashlen=' + $j.controlPasswordHash.Length)
Write-Output ('match=' + ($hash -eq $j.controlPasswordHash))
