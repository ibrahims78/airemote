# displays.ps1 - what the guest actually sees (monitors, bounds, virtual screen). ASCII only.
# Output: C:\Users\admin\displays.out.txt
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\displays.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }

Add-Type -AssemblyName System.Windows.Forms
$screens = [System.Windows.Forms.Screen]::AllScreens
Add-Line ('SCREEN_COUNT=' + $screens.Count)
foreach ($s in $screens) {
    Add-Line ('SCREEN device=' + $s.DeviceName + ' primary=' + $s.Primary + ' bounds=' + $s.Bounds.X + ',' + $s.Bounds.Y + ' ' + $s.Bounds.Width + 'x' + $s.Bounds.Height)
}

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class Disp {
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[Disp]::SetProcessDPIAware() | Out-Null
Add-Line ('SM_CMONITORS=' + [Disp]::GetSystemMetrics(80))
Add-Line ('SM_XVIRTUALSCREEN=' + [Disp]::GetSystemMetrics(76) + ' SM_YVIRTUALSCREEN=' + [Disp]::GetSystemMetrics(77))
Add-Line ('SM_CXVIRTUALSCREEN=' + [Disp]::GetSystemMetrics(78) + ' SM_CYVIRTUALSCREEN=' + [Disp]::GetSystemMetrics(79))
Add-Line ('PRIMARY=' + [Disp]::GetSystemMetrics(0) + 'x' + [Disp]::GetSystemMetrics(1))

foreach ($v in @(Get-CimInstance Win32_VideoController)) {
    Add-Line ('VC name=' + $v.Name + ' current=' + $v.CurrentHorizontalResolution + 'x' + $v.CurrentVerticalResolution + ' status=' + $v.Status + ' configManagerError=' + $v.ConfigManagerErrorCode)
}
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
