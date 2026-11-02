$p = 'C:\Users\admin\t13.bin'
$want = 1073741824
if (!(Test-Path $p) -or (Get-Item $p).Length -ne $want) {
  if (Test-Path $p) { Remove-Item $p -Force }
  fsutil file createnew $p $want | Out-Null
}
$h = (Get-FileHash -Algorithm SHA256 $p).Hash.ToLower()
Set-Content -Encoding UTF8 'C:\Users\admin\t13-hash.txt' $h
'SIZE ' + (Get-Item $p).Length
'HASH ' + $h