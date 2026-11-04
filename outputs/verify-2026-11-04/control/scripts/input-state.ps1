# input-state.ps1 - current control-path state inside the guest (read-only).
# Output: C:\Users\admin\input-state.out.txt
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\input-state.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices; public class ST { [DllImport("user32.dll")] public static extern bool GetCursorPos(out P p); public struct P { public int X; public int Y; } [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr h, out int pid); [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n); }'

# 1) agent processes
$ap = @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue)
Add-Line ('AGENT_COUNT=' + $ap.Count)
if ($ap.Count -gt 0) {
  try { Add-Line ('AGENT_PATH=' + $ap[0].Path) } catch {}
  try { Add-Line ('AGENT_START=' + $ap[0].StartTime.ToString('yyyy-MM-dd HH:mm:ss')) } catch {}
}

# 2) GDI worker processes (engine==='exe' means one is alive while streaming)
$wp = @(Get-Process -Name 'capture-gdi-worker-*' -ErrorAction SilentlyContinue)
Add-Line ('WORKER_COUNT=' + $wp.Count)
foreach ($w in $wp) { try { Add-Line ('WORKER pid=' + $w.Id + ' name=' + $w.Name + ' start=' + $w.StartTime.ToString('HH:mm:ss')) } catch {} }

# 3) extracted agent dir (worker exe + config)
$agdir = Join-Path $env:APPDATA 'AiRemote Agent'
if (Test-Path $agdir) {
  foreach ($f in (Get-ChildItem $agdir -File)) { Add-Line ('FILE ' + $f.Name + ' ' + $f.Length + ' ' + $f.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss')) }
} else { Add-Line 'AGENTDIR_MISSING' }

# 4) input-worker.log (commands that reached the worker)
$iw = Join-Path $env:USERPROFILE 'input-worker.log'
if (Test-Path $iw) {
  Add-Line ('IW_SIZE=' + (Get-Item $iw).Length + ' MTIME=' + (Get-Item $iw).LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))
  Get-Content $iw -Tail 40 | ForEach-Object { Add-Line ('IW| ' + $_) }
} else { Add-Line 'IW_MISSING' }

# 5) agent userData (input-trace.log / rtc.log)
$ud = Join-Path $env:APPDATA 'airemote-agent-desktop'
if (Test-Path $ud) {
  foreach ($f in (Get-ChildItem $ud -File | Sort-Object LastWriteTime -Descending | Select-Object -First 12)) { Add-Line ('UD ' + $f.Name + ' ' + $f.Length + ' ' + $f.LastWriteTime.ToString('MM-dd HH:mm:ss')) }
  $it = Join-Path $ud 'input-trace.log'
  if (Test-Path $it) { Get-Content $it -Tail 25 | ForEach-Object { Add-Line ('IT| ' + $_) } } else { Add-Line 'IT_MISSING' }
  $rl = Join-Path $ud 'rtc.log'
  if (Test-Path $rl) { Get-Content $rl -Tail 15 | ForEach-Object { Add-Line ('RTC| ' + $_) } } else { Add-Line 'RTC_MISSING' }
} else { Add-Line 'UD_MISSING' }

# 6) cursor + foreground window (UIPI risk)
$q = New-Object ST+P; [void][ST]::GetCursorPos([ref]$q); Add-Line ('CURSOR=' + $q.X + ',' + $q.Y)
$h = [ST]::GetForegroundWindow(); $fp2 = 0; [void][ST]::GetWindowThreadProcessId($h, [ref]$fp2)
$sb = New-Object System.Text.StringBuilder 256; [void][ST]::GetWindowText($h, $sb, 256)
$fpn = '?'; try { $fpn = (Get-Process -Id $fp2 -ErrorAction SilentlyContinue).Name } catch {}
Add-Line ('FG_WINDOW=' + $sb.ToString() + ' | pid=' + $fp2 + ' proc=' + $fpn)

# 7) screen geometry + DPI
Add-Type -AssemblyName System.Windows.Forms
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
Add-Line ('VIRTUAL=' + $vs.X + ',' + $vs.Y + ' ' + $vs.Width + 'x' + $vs.Height)
Add-Line ('DPI=' + (Get-ItemProperty 'HKCU:\Control Panel\Desktop' -Name LogPixels -ErrorAction SilentlyContinue).LogPixels)
Add-Line ('SESSION=' + $env:SESSIONNAME)
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
