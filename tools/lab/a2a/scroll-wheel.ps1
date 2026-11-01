# scroll-wheel.ps1 — تمرير عجلة الفأرة داخل نافذة الوكيل لعرض قسمَي الأجهزة والجلسات.
$out = 'C:\Users\admin\scroll-wheel.out.txt'
$lines = New-Object System.Collections.ArrayList
try {
  $sig = 'using System;using System.Runtime.InteropServices;public class M { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint dx,uint dy,int d,IntPtr e); public const uint WHEEL=0x0800; }'
  Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
  [void][M]::SetCursorPos(700, 420)
  Start-Sleep -Milliseconds 300
  for ($i = 0; $i -lt 10; $i++) {
    [M]::mouse_event([M]::WHEEL, 0, 0, -120, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 120
  }
  [void]$lines.Add('wheel=-1200')
} catch { [void]$lines.Add('ERR ' + $_.Exception.Message) }
[void]$lines.Add('DONE')
Set-Content -Path $out -Value $lines -Encoding UTF8
