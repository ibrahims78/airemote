# elevate-agent.ps1 - restart the agent with HIGHEST privileges via a scheduled task (UIPI test).
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\elevate-agent.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class EA {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
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
# 1) minimize Task Manager, restore cmd focus
$tm = @(Get-Process Taskmgr -ErrorAction SilentlyContinue)
if ($tm.Count -gt 0) { [void][EA]::ShowWindow($tm[0].MainWindowHandle, 6); Add-Line 'TM_MINIMIZED=1' }
Start-Sleep -Milliseconds 400
$c = @(Get-Process cmd -ErrorAction SilentlyContinue)
if ($c.Count -gt 0) { [void][EA]::SetForegroundWindow($c[0].MainWindowHandle) }
Start-Sleep -Milliseconds 400

# 2) stop current agent
Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Add-Line ('AGENT_AFTER_KILL=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)

# 3) create + run a HIGHEST scheduled task that launches the agent in the user session
$exe = 'C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe'
$tr = '"' + $exe + '"'
& schtasks.exe /Create /TN 'AiRemoteElev' /TR $tr /SC ONCE /ST 23:59 /RL HIGHEST /IT /F | Out-Null
Add-Line ('TASK_CREATE_EXIT=' + $LASTEXITCODE)
& schtasks.exe /Run /TN 'AiRemoteElev' | Out-Null
Add-Line ('TASK_RUN_EXIT=' + $LASTEXITCODE)
Start-Sleep -Seconds 18

# 4) report
$ap = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)
Add-Line ('AGENT_COUNT=' + $ap.Count)
foreach ($p in $ap) { try { Add-Line ('ELEV pid=' + $p.Id + ' = ' + [EA]::Elev($p.Id)) } catch {} }
$wp = @(Get-Process -Name 'capture-gdi-worker-*' -ErrorAction SilentlyContinue)
Add-Line ('WORKER_COUNT=' + $wp.Count)
$fh = [EA]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256; [void][EA]::GetWindowText($fh, $sb, 256)
Add-Line ('FG_TITLE=' + $sb.ToString())
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
