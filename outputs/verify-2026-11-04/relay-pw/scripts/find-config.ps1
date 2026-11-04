$o = "C:\Users\admin\find-config.out.txt"
$hits = @()
$hits += Get-ChildItem "C:\Users\admin\AppData\Roaming" -Recurse -Filter "airemote-config.json" -ErrorAction SilentlyContinue | ForEach-Object { "FILE=" + $_.FullName + " mode=" + (((Get-Content $_.FullName -Raw) | ConvertFrom-Json).controlAuthMode) }
$hits | Set-Content -Encoding ASCII $o