"host=$env:COMPUTERNAME"
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' } | Select-Object -First 1).IPAddress
Add-Type -AssemblyName System.Windows.Forms
$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
"bounds=$($b.Width)x$($b.Height)"
