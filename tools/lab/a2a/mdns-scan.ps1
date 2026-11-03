# mdns-scan.ps1 - ask for Android wireless-debugging service records on the LAN.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\mdns-scan.out.txt'
$lines = New-Object System.Collections.ArrayList

function QName($name) {
  $ms = New-Object System.IO.MemoryStream
  foreach ($p in $name.Split('.')) {
    $b = [Text.Encoding]::ASCII.GetBytes($p)
    $ms.WriteByte([byte]$b.Length); $ms.Write($b, 0, $b.Length)
  }
  $ms.WriteByte(0)
  $ms.WriteByte(0); $ms.WriteByte(12)   # PTR
  $ms.WriteByte(0); $ms.WriteByte(1)    # IN
  return $ms.ToArray()
}

$ms = New-Object System.IO.MemoryStream
$hdr = [byte[]](0,0, 0,0, 0,1, 0,0, 0,0, 0,0)
$ms.Write($hdr, 0, $hdr.Length)
$q1 = QName '_adb-tls-connect._tcp.local'
$ms.Write($q1, 0, $q1.Length)
$q2 = QName '_adb-tls-pairing._tcp.local'
$ms.Write($q2, 0, $q2.Length)
$payload = $ms.ToArray()

$u = New-Object System.Net.Sockets.UdpClient
$u.Client.SetSocketOption([System.Net.Sockets.SocketOptionLevel]::Socket, [System.Net.Sockets.SocketOptionName]::ReuseAddress, $true)
$u.Client.Bind((New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 5353)))
$u.JoinMulticastGroup([System.Net.IPAddress]::Parse('224.0.0.251'))
$ep = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse('224.0.0.251'), 5353)
[void]$u.Send($payload, $payload.Length, $ep)
[void]$u.Send($payload, $payload.Length, $ep)

$u.Client.ReceiveTimeout = 1500
$end = (Get-Date).AddSeconds(6)
while ((Get-Date) -lt $end) {
  try {
    $remote = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
    $data = $u.Receive([ref]$remote)
  } catch { continue }
  $txt = [Text.Encoding]::ASCII.GetString($data)
  $printable = ($txt.ToCharArray() | Where-Object { [int]$_ -ge 32 -and [int]$_ -lt 127 }) -join ''
  [void]$lines.Add('FROM=' + $remote.Address + ' LEN=' + $data.Length + ' TXT=' + $printable)
  for ($i = 0; $i -lt $data.Length - 1; $i++) {
    if ($data[$i] -eq 0 -and $data[$i+1] -eq 33 -and ($i + 8) -lt $data.Length) {
      $port = ($data[$i+6] * 256) + $data[$i+7]
      [void]$lines.Add('SRV_PORT=' + $port + ' AT=' + $i + ' FROM=' + $remote.Address)
    }
  }
}
$u.Close()
[void]$lines.Add('RESULT=ok')
$lines | Set-Content -Encoding ASCII $log
