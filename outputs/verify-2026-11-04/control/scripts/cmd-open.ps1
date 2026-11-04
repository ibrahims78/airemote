# cmd-open.ps1 - open cmd.exe, focus it, report its rect.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\cmd-open.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class CW {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
$c = @(Get-Process cmd -ErrorAction SilentlyContinue)
if ($c.Count -eq 0) { Start-Process cmd.exe | Out-Null; Start-Sleep -Seconds 2 }
$c = @(Get-Process cmd -ErrorAction SilentlyContinue)
Add-Line ('CMD_COUNT=' + $c.Count)
if ($c.Count -gt 0) {
  $h = $c[0].MainWindowHandle
  [void][CW]::ShowWindow($h, 9)
  Start-Sleep -Milliseconds 250
  [void][CW]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 400
  $r = New-Object CW+RECT; [void][CW]::GetWindowRect($h, [ref]$r)
  Add-Line ('CMD_RECT=' + $r.Left + ',' + $r.Top + ',' + $r.Right + ',' + $r.Bottom)
}
$fh = [CW]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256; [void][CW]::GetWindowText($fh, $sb, 256)
Add-Line ('FG_TITLE=' + $sb.ToString())
Add-Type -AssemblyName System.Windows.Forms
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
Add-Line ('SCREEN=' + $vs.Width + 'x' + $vs.Height)
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
