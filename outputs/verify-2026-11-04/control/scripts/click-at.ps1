# click-at.ps1 — نقرة يسرى في إحداثيات مطلقة داخل الضيف (لاختبار زر التحديث).
param([int]$X = 90, [int]$Y = 268)
$out = 'C:\Users\admin\click-at.out.txt'
$sig = 'using System;using System.Runtime.InteropServices;public class C { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint dx,uint dy,uint d,IntPtr e); public const uint LD=2; public const uint LU=4; }'
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
[C]::SetCursorPos($X, $Y)
Start-Sleep -Milliseconds 250
[C]::mouse_event([C]::LD, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 90
[C]::mouse_event([C]::LU, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 1200
Set-Content -Path $out -Value @("clicked $X,$Y", 'DONE') -Encoding UTF8
