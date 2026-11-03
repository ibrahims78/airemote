$d='C:\Users\admin\pt'
if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d | Out-Null }
Set-Content -Encoding ASCII 'C:\Users\admin\mkpt.out.txt' ('DIR_OK=' + (Test-Path $d))
