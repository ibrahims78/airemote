# elevate-now.ps1 - restart the agent elevated via Start-Process -Verb RunAs (UAC prompt).
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\elevate-now.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class EN {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint a, bool i, int pid);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr p, uint a, out IntPtr t);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr t, int c, out int v, int len, out int ret);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
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
$exe = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Add-Line ('KILLED=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)

$ok = $false
try {
  $p = Start-Process -FilePath $exe -Verb RunAs -PassThru -ErrorAction Stop
  Add-Line ('RUNAS_PID=' + $p.Id)
  $ok = $true
} catch {
  Add-Line ('RUNAS_ERR=' + $_.Exception.Message)
}
Start-Sleep -Seconds 20
$ap = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)
Add-Line ('AGENT_COUNT=' + $ap.Count)
foreach ($x in $ap) { try { Add-Line ('ELEV pid=' + $x.Id + ' = ' + [EN]::Elev($x.Id)) } catch {} }
$wp = @(Get-Process -Name 'capture-gdi-worker-*' -ErrorAction SilentlyContinue)
Add-Line ('WORKER_COUNT=' + $wp.Count)
$fh = [EN]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256; [void][EN]::GetWindowText($fh, $sb, 256)
Add-Line ('FG_TITLE=' + $sb.ToString())
if ($ap.Count -eq 0) {
  # fallback: never leave the guest without an agent
  Start-Process -FilePath $exe | Out-Null
  Start-Sleep -Seconds 12
  Add-Line ('FALLBACK_AGENT=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
}
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
