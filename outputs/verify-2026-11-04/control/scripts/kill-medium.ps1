# kill-medium.ps1 - stop only the NON-elevated agent processes (keep the elevated one).
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\kill-medium.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class KM {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint a, bool i, int pid);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr p, uint a, out IntPtr t);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr t, int c, out int v, int len, out int ret);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  // true = token readable and not elevated (i.e. we may kill it)
  public static int Kind(int pid) {
    IntPtr p = OpenProcess(0x1000, false, pid);
    if (p == IntPtr.Zero) return 2; // denied => elevated, leave it
    try {
      IntPtr tok;
      if (!OpenProcessToken(p, 0x0008, out tok)) return 2;
      try {
        int elev = -1, ret = 0;
        if (!GetTokenInformation(tok, 20, out elev, 4, out ret)) return 2;
        return elev == 1 ? 2 : 0; // 0 = medium (kill), 2 = elevated (keep)
      } finally { CloseHandle(tok); }
    } finally { CloseHandle(p); }
  }
}
'@
$killed = @()
$kept = @()
foreach ($p in @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)) {
  $k = 2
  try { $k = [KM]::Kind($p.Id) } catch { $k = 2 }
  if ($k -eq 0) {
    try { Stop-Process -Id $p.Id -Force -ErrorAction Stop; $killed += $p.Id } catch { Add-Line ('KILL_FAIL ' + $p.Id + ' :: ' + $_.Exception.Message) }
  } else {
    $kept += $p.Id
  }
}
Start-Sleep -Seconds 3
Add-Line ('KILLED=' + ($killed -join ','))
Add-Line ('KEPT=' + ($kept -join ','))
$ap = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)
Add-Line ('AGENT_COUNT_AFTER=' + $ap.Count)
foreach ($p in $ap) { Add-Line ('LEFT pid=' + $p.Id + ' kind=' + [KM]::Kind($p.Id)) }
$wp = @(Get-Process -Name 'capture-gdi-worker-*' -ErrorAction SilentlyContinue)
Add-Line ('WORKER_COUNT=' + $wp.Count)
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
