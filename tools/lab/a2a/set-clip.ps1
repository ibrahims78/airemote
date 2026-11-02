# set-clip.ps1 — يضع نصاً مميّزاً في حافظة الضيف ويكتب العلامة إلى ملف للتحقق.
$m = 'AR-CLIP-' + (Get-Date -Format 'HHmmss')
Set-Clipboard -Value $m
Set-Content -Encoding UTF8 'C:\Users\admin\clip-marker.txt' $m
'OK ' + $m