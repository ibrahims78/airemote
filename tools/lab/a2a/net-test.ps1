# net-test.ps1 - can this guest reach the phone's LAN address and pairing port?
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\net-test.out.txt'
$lines = New-Object System.Collections.ArrayList
function T($ip, $port) {
  $c = New-Object System.Net.Sockets.TcpClient
  try {
    $r = $c.BeginConnect($ip, $port, $null, $null)
    $ok = $r.AsyncWaitHandle.WaitOne(2500)
    if ($ok) { $c.EndConnect($r); return "OK $ip : $port" }
    return "TIMEOUT $ip : $port"
  } catch { return "ERR $ip : $port :: " + $_.Exception.Message } finally { $c.Close() }
}
[void]$lines.Add((T '192.168.1.100' 42081))
[void]$lines.Add((T '192.168.1.100' 5555))
[void]$lines.Add((T '192.168.1.25' 3001))
[void]$lines.Add('PING=' + ((Test-Connection -ComputerName 192.168.1.100 -Count 1 -Quiet) -as [string]))
[void]$lines.Add('RESULT=ok')
$lines | Set-Content -Encoding ASCII $log
