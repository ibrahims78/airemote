# notepad-and-elev.ps1 - open Notepad, report its rect, and check agent elevation (UIPI).
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\notepad-and-elev.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class EZ {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint a, bool i, int pid);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr p, uint a, out IntPtr t);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr t, int c, out int v, int len, out int ret);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  public struct RECT { public int Left, Top, Right, Bottom; }
  public static string Elev(int pid) {
    IntPtr p = OpenProcess(0x1000, false, pid); // PROCESS_QUERY_LIMITED_INFORMATION
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

# 1) Notepad
$np = @(Get-Process notepad -ErrorAction SilentlyContinue)
if ($np.Count -eq 0) { Start-Process notepad.exe | Out-Null; Start-Sleep -Seconds 3 }
$np = @(Get-Process notepad -ErrorAction SilentlyContinue)
Add-Line ('NOTEPAD_COUNT=' + $np.Count)
if ($np.Count -gt 0) {
  foreach ($n in $np) { try { Add-Line ('NOTEPAD pid=' + $n.Id + ' title=' + $n.MainWindowTitle) } catch {} }
}
Start-Sleep -Milliseconds 500
$h = [EZ]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256; [void][EZ]::GetWindowText($h, $sb, 256)
$r = New-Object EZ+RECT; [void][EZ]::GetWindowRect($h, [ref]$r)
Add-Line ('FG_TITLE=' + $sb.ToString())
Add-Line ('FG_RECT=' + $r.Left + ',' + $r.Top + ',' + $r.Right + ',' + $r.Bottom)

# 2) Agent elevation
$ap = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)
Add-Line ('AGENT_COUNT=' + $ap.Count)
foreach ($p in $ap) { try { Add-Line ('AGENT_ELEV pid=' + $p.Id + ' = ' + [EZ]::Elev($p.Id)) } catch {} }
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
