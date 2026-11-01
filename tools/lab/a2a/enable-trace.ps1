# enable-trace.ps1 — يثبّت متغيّر سجل الإدخال على مستوى المستخدم ويعيد تشغيل الوكيل
$o = New-Object System.Collections.ArrayList
try {
    [Environment]::SetEnvironmentVariable('AIRREMOTE_INPUT_DEBUG', '1', 'User')
    $o.Add('USER_ENV=' + [Environment]::GetEnvironmentVariable('AIRREMOTE_INPUT_DEBUG', 'User')) | Out-Null

    $exe = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
    $trace = 'C:\Users\admin\AppData\Roaming\airemote-agent-desktop\input-trace.log'
    Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    if (Test-Path $trace) { Remove-Item $trace -Force -ErrorAction SilentlyContinue }

    # نبدأ عبر cmd حتى تُورَّث بيئة المستخدم المحدَّثة
    Start-Process 'C:\Windows\System32\cmd.exe' -ArgumentList '/c', 'start', '', '"' + $exe + '"'
    Start-Sleep -Seconds 12
    $o.Add('RUNNING=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count) | Out-Null
    $o.Add('TRACE_EXISTS=' + (Test-Path $trace)) | Out-Null
} catch {
    $o.Add('ERR=' + $_.Exception.Message) | Out-Null
}
$o | Set-Content -Encoding UTF8 C:\Users\admin\enable-trace.out.txt
