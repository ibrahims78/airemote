# agent-list.ps1 - list agent processes with start time + elevation (detect duplicates).
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\agent-list.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class AL {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint a, bool i, int pid);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr p, uint a, out IntPtr t);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr t, int c, out int v, int len, out int ret);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  public static string Elev(int pid) {
    IntPtr p = OpenProcess(0x1000, false, pid);
    if (p == IntPtr.Zero) return "ELEVATED(denied=" + Marshal.GetLastWin32Error() + ")";
    try {
      IntPtr tok;
      if (!OpenProcessToken(p, 0x0008, out tok)) return "ELEVATED(denied=" + Marshal.GetLastWin32Error() + ")";
      try {
        int elev = -1, ret = 0;
        if (!GetTokenInformation(tok, 20, out elev, 4, out ret)) return "info_err=" + Marshal.GetLastWin32Error();
        return elev == 1 ? "ELEVATED" : "NOT_ELEVATED";
      } finally { CloseHandle(tok); }
    } finally { CloseHandle(p); }
  }
}
'@
$ap = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)
Add-Line ('AGENT_COUNT=' + $ap.Count)
foreach ($p in $ap) {
  $st = ''
  try { $st = $p.StartTime.ToString('HH:mm:ss') } catch {}
  $el = ''
  try { $el = [AL]::Elev($p.Id) } catch { $el = 'err' }
  Add-Line ('AGENT pid=' + $p.Id + ' start=' + $st + ' elev=' + $el + ' ws=' + [math]::Round($p.WorkingSet64/1MB) + 'MB')
}
$wp = @(Get-Process -Name 'capture-gdi-worker-*' -ErrorAction SilentlyContinue)
Add-Line ('WORKER_COUNT=' + $wp.Count)
foreach ($w in $wp) { Add-Line ('WORKER pid=' + $w.Id + ' name=' + $w.Name) }
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
