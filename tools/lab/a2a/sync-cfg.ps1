$o = New-Object System.Collections.ArrayList
$src = 'C:\Users\admin\AppData\Roaming\airemote-agent-desktop\airemote-config.json'
$dst = 'C:\Users\admin\AppData\Roaming\AiRemote Agent\airemote-config.json'
try {
  $j = Get-Content $src -Raw -Encoding UTF8 | ConvertFrom-Json
  $o2 = [ordered]@{}
  foreach ($p in $j.PSObject.Properties) { $o2[$p.Name] = $p.Value }
  $json = $o2 | ConvertTo-Json -Depth 6
  Set-Content -Path $dst -Value $json -Encoding UTF8
  [void]$o.Add('SYNCED=' + (Test-Path $dst))
  $a = (Get-Content $src -Raw | ConvertFrom-Json).serverUrl
  $b = (Get-Content $dst -Raw | ConvertFrom-Json).serverUrl
  [void]$o.Add('SRC=' + $a)
  [void]$o.Add('DST=' + $b)
  [void]$o.Add('EQUAL=' + ($a -eq $b))
} catch { [void]$o.Add('ERR=' + $_.Exception.Message) }
$o | Set-Content -Encoding UTF8 C:\Users\admin\sync.out.txt
