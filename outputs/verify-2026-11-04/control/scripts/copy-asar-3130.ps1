$ErrorActionPreference = "Continue"
$src = "C:\Users\admin\new-app.asar"
$dst = "C:\Users\admin\AppData\Local\Programs\AiRemote Agent\resources\app.asar"
$o = "C:\Users\admin\copy-asar.out.txt"
$lines = @()
try { Copy-Item $src $dst -Force -ErrorAction Stop; $lines += ("COPIED=" + (Get-Item $dst).Length) } catch { $lines += ("ERR=" + $_.Exception.Message) }
$lines += ("SRC=" + (Get-Item $src).Length)
$lines | Set-Content -Encoding ASCII $o