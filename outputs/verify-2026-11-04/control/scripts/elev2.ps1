# elev2.ps1 - restart agent as HIGHEST via scheduled-task XML (UIPI proof, step 2).
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\elev2.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class E2 {
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
# keep Task Manager minimized while we swap the agent
$tm = @(Get-Process Taskmgr -ErrorAction SilentlyContinue)
if ($tm.Count -gt 0) { [void][E2]::ShowWindow($tm[0].MainWindowHandle, 6) }
Start-Sleep -Milliseconds 300

Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3
Add-Line ('AGENT_AFTER_KILL=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)

$user = "$env:USERDOMAIN\$env:USERNAME"
$xml = @'
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>AiRemote elevated agent (lab UIPI test)</Description>
  </RegistrationInfo>
  <Triggers />
  <Principals>
    <Principal id="Author">
      <UserId>__USER__</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe</Command>
    </Exec>
  </Actions>
</Task>
'@
$xml = $xml.Replace('__USER__', $user)
$path = 'C:\Users\admin\airemote-elev.xml'
[System.IO.File]::WriteAllText($path, $xml, [System.Text.Encoding]::Unicode)

$out = & schtasks.exe /Create /TN 'AiRemoteElev' /XML $path /F 2>&1 | Out-String
Add-Line ('CREATE=' + $LASTEXITCODE + ' :: ' + $out.Replace("`r", ' ').Replace("`n", ' ').Trim())
$out2 = & schtasks.exe /Run /TN 'AiRemoteElev' 2>&1 | Out-String
Add-Line ('RUN=' + $LASTEXITCODE + ' :: ' + $out2.Replace("`r", ' ').Replace("`n", ' ').Trim())
Start-Sleep -Seconds 20

$ap = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)
Add-Line ('AGENT_COUNT=' + $ap.Count)
foreach ($p in $ap) { try { Add-Line ('ELEV pid=' + $p.Id + ' = ' + [E2]::Elev($p.Id)) } catch {} }
$wp = @(Get-Process -Name 'capture-gdi-worker-*' -ErrorAction SilentlyContinue)
Add-Line ('WORKER_COUNT=' + $wp.Count)
$fh = [E2]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 256; [void][E2]::GetWindowText($fh, $sb, 256)
Add-Line ('FG_TITLE=' + $sb.ToString())
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
