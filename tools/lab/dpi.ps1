Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
"bounds=$($b.Width)x$($b.Height)"
$k = Get-ItemProperty -Path 'HKCU:\Control Panel\Desktop\WindowMetrics' -Name AppliedDPI -ErrorAction SilentlyContinue
"appliedDPI=$($k.AppliedDPI)"
$g = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
"dpiX=$($g.DpiX) dpiY=$($g.DpiY)"
$g.Dispose()
Get-Process -Name 'AiRemote Agent' -ErrorAction SilentlyContinue | ForEach-Object {
  "proc=$($_.ProcessName) path=$($_.Path)"
}
