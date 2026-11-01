# نافذة متحركة داخل الضيف: تُنتج تغيّراً مرئياً محكوماً لقياس الوضع النشِط (T18).
# تُغلق نفسها بعد 70 ثانية. تُطلق مفصولة (noWait) قبل القياس مباشرة.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = 'motion'
$form.Width = 520
$form.Height = 360
$form.StartPosition = 'Manual'
$form.Left = 120
$form.Top = 120
$form.BackColor = [System.Drawing.Color]::FromArgb(24, 24, 32)
$form.FormBorderStyle = 'None'

$box = New-Object System.Windows.Forms.Panel
$box.Width = 90
$box.Height = 60
$box.BackColor = [System.Drawing.Color]::FromArgb(80, 160, 255)
$form.Controls.Add($box)

$script:x = 10
$script:dir = 6
$script:started = Get-Date
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 60
$timer.Add_Tick({
  $script:x += $script:dir
  if ($script:x -gt 400 -or $script:x -lt 5) { $script:dir = -$script:dir }
  $box.Left = $script:x
  $box.Top = 40 + [int](30 * [Math]::Sin($script:x / 24))
  if (((Get-Date) - $script:started).TotalSeconds -gt 70) { $timer.Stop(); $form.Close() }
})
$timer.Start()
[void]$form.ShowDialog()
