# agent-shot.ps1 - bring the AiRemote Agent window to the front and capture the guest screen.
# Output: C:\Users\admin\agent-shot.out.txt + C:\Users\admin\agent-ui.png
$ErrorActionPreference = 'Stop'
$log = 'C:\Users\admin\agent-shot.out.txt'
$png = 'C:\Users\admin\agent-ui.png'
$lines = New-Object System.Collections.ArrayList

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Win {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public struct RECT { public int L, T, R, B; }
}
'@

try {
    $cands = @(Get-Process | Where-Object { $_.ProcessName -eq 'AiRemote Agent' -and $_.MainWindowHandle -ne 0 })
    [void]$lines.Add('CANDIDATES=' + $cands.Count)
    $best = $null; $bestArea = -1
    foreach ($c in $cands) {
        $cr = New-Object Win+RECT
        [Win]::GetWindowRect($c.MainWindowHandle, [ref]$cr) | Out-Null
        $area = ($cr.R - $cr.L) * ($cr.B - $cr.T)
        $isAgent = ($c.MainWindowTitle -match 'airemote')
        [void]$lines.Add('CAND=' + $c.Id + ' area=' + $area + ' agent=' + $isAgent + ' title=' + $c.MainWindowTitle)
        $score = ($(if ($isAgent) { 1e12 } else { 0 })) + $area
        if ($score -gt $bestArea) { $bestArea = $score; $best = $c }
    }
    [void]$lines.Add('WINDOWS=' + $(if ($best) { 1 } else { 0 }))
    if ($best) {
        $h = $best.MainWindowHandle
        [void]$lines.Add('TITLE=' + $best.MainWindowTitle)
        [Win]::ShowWindow($h, 9) | Out-Null
        [Win]::SetWindowPos($h, [IntPtr]::Zero, 0, 0, 1180, 505, 0x0040) | Out-Null
        [Win]::SetForegroundWindow($h) | Out-Null
        [Win]::BringWindowToTop($h) | Out-Null
        Start-Sleep -Milliseconds 1200
        $r = New-Object Win+RECT
        [Win]::GetWindowRect($h, [ref]$r) | Out-Null
        [void]$lines.Add('RECT=' + $r.L + ',' + $r.T + ',' + $r.R + ',' + $r.B)
    }
    Start-Sleep -Milliseconds 600
    $v = [System.Windows.Forms.SystemInformation]::VirtualScreen
    $bmp = New-Object System.Drawing.Bitmap $v.Width, $v.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($v.X, $v.Y, 0, 0, $bmp.Size)
    $bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    [void]$lines.Add('PNG_SIZE=' + (Get-Item $png).Length)
    [void]$lines.Add('RESULT=ok')
} catch {
    [void]$lines.Add('RESULT=ERR ' + $_.Exception.Message)
}
$lines | Set-Content -Encoding UTF8 $log
