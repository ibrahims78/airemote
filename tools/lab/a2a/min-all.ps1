# يجعل سطح مكتب الضيف ساكناً قبل قياس الأداء: يُصغّر كل النوافذ.
# خط الأساس (docs/perf-baseline.json) قيس بلا واجهة، ووجود نافذة الوكيل
# يبثّ تغيّرات صغيرة (عدّاد/مؤشر) فتُفسد قياس الوضع الساكن.
# ملاحظة: vmguest.ps يتوقّع أن يكتب السكربت ملف <name>.out.txt بجانبه في مجلد الضيف.
$out = Join-Path $env:USERPROFILE 'min-all.out.txt'
$lines = New-Object System.Collections.ArrayList
try {
  $shell = New-Object -ComObject Shell.Application
  $shell.MinimizeAll()
  Start-Sleep -Milliseconds 800
  [void]$lines.Add('MINIMIZED ok')
} catch {
  [void]$lines.Add('MINIMIZE_FAILED ' + $_.Exception.Message)
}
$visible = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 }).Count
[void]$lines.Add('visible-window-processes=' + $visible)
[void]$lines.Add('agent=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
Set-Content -Path $out -Value $lines -Encoding UTF8
