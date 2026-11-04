# key-check.ps1 - did key events reach the agent, and is the PowerShell input helper alive?
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\key-check.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }

$ud = Join-Path $env:APPDATA 'airemote-agent-desktop'
$it = Join-Path $ud 'input-trace.log'
if (Test-Path $it) {
  Add-Line ('IT_SIZE=' + (Get-Item $it).Length + ' MTIME=' + (Get-Item $it).LastWriteTime.ToString('HH:mm:ss'))
  $tail = Get-Content $it -Tail 200
  $keys = $tail | Where-Object { $_ -match 'key type=' }
  Add-Line ('KEY_LINES=' + @($keys).Count)
  $keys | Select-Object -Last 10 | ForEach-Object { Add-Line ('K| ' + $_) }
  $tail | Select-Object -Last 5 | ForEach-Object { Add-Line ('T| ' + $_) }
} else { Add-Line 'IT_MISSING' }

# powershell children (the ps input helper is a powershell.exe spawned by the agent)
$ps = @(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue)
Add-Line ('PS_COUNT=' + $ps.Count)
foreach ($p in $ps) {
  $cl = ''
  try { $cl = [string]$p.CommandLine } catch {}
  if ($cl.Length -gt 150) { $cl = $cl.Substring(0, 150) }
  Add-Line ('PS pid=' + $p.ProcessId + ' ppid=' + $p.ParentProcessId + ' cmd=' + $cl)
}

# notepad edit class (is it Edit or RichEditD2DPT?)
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class NX {
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr FindWindow(string c, string w);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr c, string cls, string win);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int WM_GETTEXT(int h, int w, StringBuilder l);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int SendMessage(IntPtr h, int msg, int w, StringBuilder l);
}
'@
$h = [NX]::FindWindow('Notepad', $null)
Add-Line ('NP_HWND=' + $h)
$child = [IntPtr]::Zero
$cls = New-Object System.Text.StringBuilder 128
$guard = 0
while ($guard -lt 20) {
  $child = [NX]::FindWindowEx($h, $child, $null, $null)
  if ($child -eq [IntPtr]::Zero) { break }
  [void][NX]::GetClassName($child, $cls, 128)
  Add-Line ('CHILD cls=' + $cls.ToString())
  $guard++
}
# try RichEdit read
$re = [NX]::FindWindowEx($h, [IntPtr]::Zero, 'RichEditD2DPT', $null)
Add-Line ('RICHEDIT=' + $re)
if ($re -ne [IntPtr]::Zero) {
  $sb = New-Object System.Text.StringBuilder 8192
  [void][NX]::SendMessage($re, 0x000D, 8192, $sb)
  Add-Line ('RICH_TEXT=[' + $sb.ToString() + ']')
}
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
