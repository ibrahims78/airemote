$o = "C:\Users\admin\both-cfg.out.txt"
$paths = @("C:\Users\admin\AppData\Roaming\AiRemote Agent\airemote-config.json", "C:\Users\admin\AppData\Roaming\airemote-agent-desktop\airemote-config.json")
$lines = @()
foreach ($p in $paths) {
  if (Test-Path $p) {
    $j = Get-Content $p -Raw | ConvertFrom-Json
    $h = "" + $j.controlPasswordHash
    $lines += ("PATH=" + $p)
    $lines += ("  MODE=" + $j.controlAuthMode + " SALT=" + $j.controlPasswordSalt + " HASHLEN=" + $h.Length + " PREFIX=" + $h.Substring(0, [Math]::Min(7, $h.Length)))
    $lines += ("  WRITTEN=" + (Get-Item $p).LastWriteTime.ToString("s"))
  } else { $lines += ("MISSING=" + $p) }
}
$lines | Set-Content -Encoding ASCII $o