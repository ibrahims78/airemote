<#
  install-agent-autostart-elevated.ps1
  Registers a logon scheduled task that starts the AiRemote Agent with the highest
  available privileges (RunLevel=HighestAvailable), and removes the medium-integrity
  HKCU Run entry so the agent is not started twice.

  Why: UIPI silently drops injected input to elevated windows (Task Manager, UAC)
  when the agent runs at medium integrity. See docs/DECISIONS-LOG.md (D40) and
  outputs/verify-2026-11-04/control/.

  Usage (must be elevated):
    powershell -NoProfile -ExecutionPolicy Bypass -File install-agent-autostart-elevated.ps1
    powershell ... -File install-agent-autostart-elevated.ps1 -Uninstall

  Reversible: -Uninstall deletes the task and restores the HKCU Run entry.
#>
param(
  [string]$TaskName = 'AiRemote Agent (Elevated)',
  [switch]$Uninstall
)
$ErrorActionPreference = 'Stop'

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error 'This script must run from an elevated PowerShell (Run as administrator).'
  exit 2
}

$exe     = Join-Path $env:LOCALAPPDATA 'Programs\AiRemote Agent\AiRemote Agent.exe'
$runKey  = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runName = 'io.airemote.agent'
$runValue = '"' + $exe + '" --autostart'

function Get-RunValue {
  try { (Get-ItemProperty -Path $runKey -Name $runName -ErrorAction Stop).$runName } catch { $null }
}

if ($Uninstall) {
  & schtasks.exe /Delete /TN $TaskName /F 2>&1 | Out-Null
  Write-Output ('TASK_DELETED=' + ($LASTEXITCODE -eq 0))
  if (-not (Get-RunValue)) {
    New-ItemProperty -Path $runKey -Name $runName -Value $runValue -PropertyType String -Force | Out-Null
    Write-Output 'RUNKEY_RESTORED=True'
  } else {
    Write-Output 'RUNKEY_RESTORED=already-present'
  }
  exit 0
}

if (-not (Test-Path $exe)) { Write-Error ('agent exe not found: ' + $exe); exit 3 }

$user = $env:USERDOMAIN + '\' + $env:USERNAME
$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>AiRemote Agent - elevated autostart (UIPI control of elevated windows)</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>$user</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>$user</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
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
      <Command>$exe</Command>
    </Exec>
  </Actions>
</Task>
"@
$xmlPath = Join-Path $env:TEMP 'airemote-agent-elevated.xml'
[System.IO.File]::WriteAllText($xmlPath, $xml, [System.Text.Encoding]::Unicode)

& schtasks.exe /Create /TN $TaskName /XML $xmlPath /F 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Error 'schtasks /Create failed'; exit 4 }
Write-Output 'TASK_CREATED=True'

# stop any running instance (medium or elevated) before starting the elevated one
Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

& schtasks.exe /Run /TN $TaskName 2>&1 | Out-Null
Write-Output ('TASK_RUN=' + ($LASTEXITCODE -eq 0))
Start-Sleep -Seconds 18

$procs = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)
Write-Output ('AGENT_COUNT=' + $procs.Count)

# elevation of the main process: reading the token succeeds only for same/lower integrity
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class El {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint a, bool i, int pid);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool OpenProcessToken(IntPtr p, uint a, out IntPtr t);
  [DllImport("advapi32.dll", SetLastError=true)] public static extern bool GetTokenInformation(IntPtr t, int c, out int v, int len, out int ret);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
  public static string Kind(int pid) {
    IntPtr p = OpenProcess(0x1000, false, pid);
    if (p == IntPtr.Zero) return "ELEVATED";
    try {
      IntPtr tok;
      if (!OpenProcessToken(p, 0x0008, out tok)) return "ELEVATED";
      try {
        int elev = -1, ret = 0;
        if (!GetTokenInformation(tok, 20, out elev, 4, out ret)) return "ELEVATED";
        return elev == 1 ? "ELEVATED" : "NOT_ELEVATED";
      } finally { CloseHandle(tok); }
    } finally { CloseHandle(p); }
  }
}
'@
foreach ($p in $procs) {
  $kind = 'unknown'
  try { $kind = [El]::Kind($p.Id) } catch {}
  Write-Output ('AGENT pid=' + $p.Id + ' ' + $kind)
}

# only drop the medium autostart when the elevated task actually produced a running agent
if ($procs.Count -gt 0) {
  if (Get-RunValue) {
    Remove-ItemProperty -Path $runKey -Name $runName -ErrorAction SilentlyContinue
    Write-Output 'RUNKEY_REMOVED=True'
  } else {
    Write-Output 'RUNKEY_REMOVED=already-absent'
  }
} else {
  Write-Output 'RUNKEY_REMOVED=False (agent not running; kept Run entry as fallback)'
}
Write-Output 'RESULT=ok'
