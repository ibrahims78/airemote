# swap-debug.ps1 — تبديل app.asar ثم تشغيل الوكيل مع سجل الإدخال (داخل الضيف)
$ErrorActionPreference = 'Stop'
$log = 'C:\Users\admin\swap-debug.out.txt'
$lines = New-Object System.Collections.ArrayList

try {
    $exe    = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
    $target = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\resources\app.asar'
    $src    = 'C:\Users\admin\new-app.asar'
    $trace  = 'C:\Users\admin\AppData\Roaming\AiRemote Agent\input-trace.log'

    Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Copy-Item $src $target -Force
    if (Test-Path $trace) { Remove-Item $trace -Force -ErrorAction SilentlyContinue }

    $env:AIRREMOTE_INPUT_DEBUG = '1'
    Start-Process $exe
    Start-Sleep -Seconds 8

    [void]$lines.Add('TARGET_SIZE=' + (Get-Item $target).Length)
    [void]$lines.Add('RUNNING=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
    [void]$lines.Add('TRACE_EXISTS=' + (Test-Path $trace))
    [void]$lines.Add('RESULT=ok')
} catch {
    [void]$lines.Add('RESULT=ERR ' + $_.Exception.Message)
}
$lines | Set-Content -Encoding UTF8 $log
