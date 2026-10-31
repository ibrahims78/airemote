Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class M {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, UIntPtr e);
}
'@
Start-Sleep -Milliseconds 200
[M]::SetCursorPos(1067, 336) | Out-Null
Start-Sleep -Milliseconds 150
[M]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
[M]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
'clicked 1067,336' | Set-Content -Path 'C:\Users\admin\click-result.txt' -Encoding UTF8
