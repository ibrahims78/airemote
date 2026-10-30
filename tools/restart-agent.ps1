Start-Sleep -Seconds 2
Get-Process AiRemote* -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 3
$root = Join-Path $env:LOCALAPPDATA Programs
$exe = Get-ChildItem $root -Recurse -Filter *.exe -ErrorAction SilentlyContinue |
       Sort-Object Length -Descending | Select-Object -First 1
if ($exe) { Start-Process -FilePath $exe.FullName }
