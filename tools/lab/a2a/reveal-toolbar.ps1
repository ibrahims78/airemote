# reveal-toolbar.ps1 — يحرّك مؤشّر الضيف إلى أعلى النافذة لإظهار شريط أدوات العارض.
$out = 'C:\Users\admin\reveal.out.txt'
$sig = 'using System;using System.Runtime.InteropServices;public class P { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); }'
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
[P]::SetCursorPos(640, 18)
Start-Sleep -Milliseconds 400
[P]::SetCursorPos(620, 26)
Start-Sleep -Milliseconds 600
Set-Content -Path $out -Value @('cursor=640,18', 'DONE') -Encoding UTF8
