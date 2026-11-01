Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$v = [System.Windows.Forms.SystemInformation]::VirtualScreen
$f = New-Object System.Windows.Forms.Form
$f.FormBorderStyle = 'None'
$f.StartPosition = 'Manual'
$f.Location = New-Object System.Drawing.Point($v.X, $v.Y)
$f.Size = New-Object System.Drawing.Size($v.Width, $v.Height)
$f.TopMost = $true
$f.BackColor = [System.Drawing.Color]::FromArgb(18, 24, 36)
$lbl = New-Object System.Windows.Forms.Label
$lbl.Text = 'FULL-SCREEN PROBE ' + $v.Width + 'x' + $v.Height
$lbl.ForeColor = [System.Drawing.Color]::FromArgb(120, 200, 255)
$lbl.Font = New-Object System.Drawing.Font("Segoe UI", 28, [System.Drawing.FontStyle]::Bold)
$lbl.AutoSize = $true
$lbl.Location = New-Object System.Drawing.Point(40, 40)
$f.Controls.Add($lbl)
$log = 'C:\Users\admin\clicks.txt'
$f.Add_MouseDown({ param($s,$e) $p = [System.Windows.Forms.Cursor]::Position; Add-Content -Path $log -Value ('CLICK cursor=' + $p.X + ',' + $p.Y + ' client=' + $e.X + ',' + $e.Y + ' @ ' + (Get-Date -Format 'HH:mm:ss.fff')) })
Set-Content -Path $log -Value ('PROBE_READY ' + $v.Width + 'x' + $v.Height) -Encoding UTF8
$t = New-Object System.Windows.Forms.Timer
$t.Interval = 1000; $script:n = 0
$t.Add_Tick({ $script:n++; if ($script:n -ge 180) { $t.Stop(); $f.Close() } })
$t.Start()
[System.Windows.Forms.Application]::Run($f)