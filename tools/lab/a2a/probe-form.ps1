# probe-form.ps1 — نافذة قياس لنقرات التحكم عن بُعد (تعمل داخل الضيف)
# تسجّل موضع المؤشّر الفعلي عند كل ضغطة، لتُقارَن بالإحداثي المطلوب.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$log = 'C:\Users\admin\clicks.txt'
$form = New-Object System.Windows.Forms.Form
$form.Text = 'AiRemote Click Probe'
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(100, 100)
$form.Size = New-Object System.Drawing.Size(400, 300)
$form.TopMost = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(24, 32, 48)

$lbl = New-Object System.Windows.Forms.Label
$lbl.Text = 'AIREMOTE CLICK PROBE'
$lbl.ForeColor = [System.Drawing.Color]::White
$lbl.Font = New-Object System.Drawing.Font('Segoe UI', 12, [System.Drawing.FontStyle]::Bold)
$lbl.AutoSize = $true
$lbl.Location = New-Object System.Drawing.Point(20, 20)
$form.Controls.Add($lbl)

Set-Content -Path $log -Value ('FORM_READY ' + (Get-Date -Format 'HH:mm:ss.fff')) -Encoding UTF8

$handler = {
    param($s, $e)
    $p = [System.Windows.Forms.Cursor]::Position
    Add-Content -Path $log -Value ('CLICK cursor=' + $p.X + ',' + $p.Y + ' @ ' + (Get-Date -Format 'HH:mm:ss.fff'))
}
$form.Add_MouseDown($handler)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 1000
$script:ticks = 0
$timer.Add_Tick({
    $script:ticks++
    if ($script:ticks -ge 150) { $timer.Stop(); $form.Close() }
})
$timer.Start()

[System.Windows.Forms.Application]::Run($form)
Add-Content -Path $log -Value 'FORM_CLOSED' -Encoding UTF8
