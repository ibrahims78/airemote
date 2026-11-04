# tm-open.ps1 - open Task Manager (elevated), report rect + elevation.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\tm-open.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class TM {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint a, bool i, int pid);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr p, uint a, out IntPtr t);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr t, int c, out int v, int len, out int ret);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public static string Elev(int pid) {
    IntPtr p = OpenProcess(0x1000, false, pid);
    if (p == IntPtr.Zero) return "openprocess_err=" + Marshal.GetLastWin32Error();
    try {
      IntPtr tok;
      if (!OpenProcessToken(p, 0x0008, out tok)) return "token_err=" + Marshal.GetLastWin32Error();
      try {
        int elev = -1, ret = 0;
        if (!GetTokenInformation(tok, 20, out elev, 4, out ret)) return "info_err=" + Marshal.GetLastWin32Error();
        return elev == 1 ? "ELEVATED" : "NOT_ELEVATED";
      } finally { CloseHandle(tok); }
    } finally { CloseHandle(p); }
  }
}
'@
$tm = @(Get-Process Taskmgr -ErrorAction SilentlyContinue)
if ($tm.Count -eq 0) { Start-Process taskmgr.exe | Out-Null; Start-Sleep -Seconds 4 }
$tm = @(Get-Process Taskmgr -ErrorAction SilentlyContinue)
Add-Line ('TM_COUNT=' + $tm.Count)
if ($tm.Count -gt 0) {
  $h = $tm[0].MainWindowHandle
  [void][TM]::ShowWindow($h, 9)
  Start-Sleep -Milliseconds 400
  [void][TM]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 600
  $r = New-Object TM+RECT; [void][TM]::GetWindowRect($h, [ref]$r)
  Add-Line ('TM_RECT=' + $r.Left + ',' + $r.Top + ',' + $r.Right + ',' + $r.Bottom)
  Add-Line ('TM_ELEV=' + [TM]::Elev($tm[0].Id))
}
$fh = [TM]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256; [void][TM]::GetWindowText($fh, $sb, 256)
Add-Line ('FG_TITLE=' + $sb.ToString())
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
