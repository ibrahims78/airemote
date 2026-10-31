$ErrorActionPreference = 'Stop'
$cfgs = @('C:\Users\admin\AppData\Roaming\airemote-agent-desktop\airemote-config.json', 'C:\Users\admin\AppData\Roaming\AiRemote Agent\airemote-config.json')
$pwFile = 'C:\Users\admin\cp.txt'
$exe = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
$log = 'C:\Users\admin\apply-cp.log'

function W($m) { Add-Content -Path $log -Value ((Get-Date -Format 'HH:mm:ss') + ' ' + $m) -Encoding UTF8 }

try {
  Set-Content -Path $log -Value 'start' -Encoding UTF8
  $pw = (Get-Content $pwFile -Raw).Trim()
  if (-not $pw) { throw 'empty password file' }

  Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force
  Start-Sleep -Seconds 3

  $salt = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($salt + ':' + $pw)
  $hash = -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') })

  foreach ($cfg in $cfgs) {
    if (-not (Test-Path $cfg)) { continue }
    $j = Get-Content $cfg -Raw | ConvertFrom-Json
    $j | Add-Member -NotePropertyName controlAuthMode -NotePropertyValue 'password' -Force
    $j | Add-Member -NotePropertyName controlPasswordSalt -NotePropertyValue $salt -Force
    $j | Add-Member -NotePropertyName controlPasswordHash -NotePropertyValue $hash -Force
    $out = $j | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText($cfg, $out, (New-Object System.Text.UTF8Encoding($false)))
    W ('config-written ' + $cfg + ' mode=' + $j.controlAuthMode)
  }

  Remove-Item $pwFile -Force
  Start-Process -FilePath $exe -WindowStyle Minimized
  Start-Sleep -Seconds 6
  $p = Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Select-Object -First 1
  W ('agent-running=' + [bool]$p)
  W 'done'
} catch {
  W ('ERROR ' + $_.Exception.Message)
}
