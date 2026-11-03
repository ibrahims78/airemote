# swap-31112.ps1 — تبديل app.asar (3.11.10: عامل GDI مُترجم مسبقاً) ثم تشغيل الوكيل.
# المخرج: C:\Users\admin\swap-31112.out.txt (اسم الخرج = اسم السكربت — قاعدة الأدوات).
$ErrorActionPreference = 'Stop'
$log = 'C:\Users\admin\swap-31112.out.txt'
$lines = New-Object System.Collections.ArrayList

try {
    $exe    = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
    $target = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\resources\app.asar'
    $src    = 'C:\Users\admin\new-app.asar'
    $dataDir = 'C:\Users\admin\AppData\Roaming\AiRemote Agent'

    if (-not (Test-Path $src)) { throw "source asar missing: $src" }
    $srcSize = (Get-Item $src).Length

    Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3

    Copy-Item $src $target -Force
    $dstSize = (Get-Item $target).Length

    Start-Process $exe
    Start-Sleep -Seconds 9

    [void]$lines.Add('SRC_SIZE=' + $srcSize)
    [void]$lines.Add('TARGET_SIZE=' + $dstSize)
    [void]$lines.Add('SIZE_MATCH=' + ($srcSize -eq $dstSize))
    [void]$lines.Add('RUNNING=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
    $w = @(Get-Process -Name 'capture-gdi-worker*' -ErrorAction SilentlyContinue)
    [void]$lines.Add('WORKER_PROCS=' + $w.Count)
    foreach ($p in $w) { [void]$lines.Add('WORKER_PID=' + $p.Id + ' NAME=' + $p.ProcessName) }
    $files = @(Get-ChildItem $dataDir -Filter 'capture-gdi*' -ErrorAction SilentlyContinue)
    [void]$lines.Add('DATA_FILES=' + $files.Count)
    foreach ($f in $files) { [void]$lines.Add('DATA_FILE=' + $f.Name + ' ' + $f.Length) }
    [void]$lines.Add('RESULT=ok')
} catch {
    [void]$lines.Add('RESULT=ERR ' + $_.Exception.Message)
}
$lines | Set-Content -Encoding UTF8 $log
