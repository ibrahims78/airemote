# cmd2.ps1 - ensure a visible cmd window exists in the guest, focus it, report rect.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\cmd2.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class C2 {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  public struct RECT { public int Left, Top, Right, Bottom; }
}
'@
$c = @(Get-Process cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
if ($c.Count -eq 0) {
  Start-Process cmd.exe -ArgumentList '/k', 'echo AIREMOTE-TEST' | Out-Null
  Start-Sleep -Seconds 4
  $c = @(Get-Process cmd -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 })
}
Add-Line ('CMD_WITH_WINDOW=' + $c.Count)
$idx = 0
foreach ($p in $c) {
  $hh = $p.MainWindowHandle
  $r0 = New-Object C2+RECT; [void][C2]::GetWindowRect($hh, [ref]$r0)
  Add-Line ('CMD ' + $idx + ' pid=' + $p.Id + ' rect=' + $r0.Left + ',' + $r0.Top + ',' + $r0.Right + ',' + $r0.Bottom + ' title=' + $p.MainWindowTitle)
  $idx++
}
if ($c.Count -gt 0) {
  $h = $c[0].MainWindowHandle
  [void][C2]::ShowWindow($h, 9)
  Start-Sleep -Milliseconds 300
  [void][C2]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 400
  $r = New-Object C2+RECT; [void][C2]::GetWindowRect($h, [ref]$r)
  Add-Line ('FOCUSED_RECT=' + $r.Left + ',' + $r.Top + ',' + $r.Right + ',' + $r.Bottom)
}
$fh = [C2]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256; [void][C2]::GetWindowText($fh, $sb, 256)
Add-Line ('FG_TITLE=' + $sb.ToString())
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
