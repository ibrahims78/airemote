# bring-notepad-front.ps1 - bring Notepad to foreground and report its rect + screen size.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\bring-notepad-front.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class FG {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
$np = @(Get-Process notepad -ErrorAction SilentlyContinue)
Add-Line ('NOTEPAD_COUNT=' + $np.Count)
if ($np.Count -gt 0) {
  $h = $np[0].MainWindowHandle
  [void][FG]::ShowWindow($h, 9)   # SW_RESTORE
  Start-Sleep -Milliseconds 300
  [void][FG]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 500
  $r = New-Object FG+RECT; [void][FG]::GetWindowRect($h, [ref]$r)
  Add-Line ('NOTEPAD_RECT=' + $r.Left + ',' + $r.Top + ',' + $r.Right + ',' + $r.Bottom)
}
$fh = [FG]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256; [void][FG]::GetWindowText($fh, $sb, 256)
Add-Line ('FG_TITLE=' + $sb.ToString())
Add-Type -AssemblyName System.Windows.Forms
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
Add-Line ('SCREEN=' + $vs.Width + 'x' + $vs.Height)
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
