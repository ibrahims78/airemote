Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$v = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bmp = New-Object System.Drawing.Bitmap $v.Width, $v.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen($v.X, $v.Y, 0, 0, $bmp.Size)
$bmp.Save('C:\Users\admin\t1-shot.png', [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Set-Content -Encoding UTF8 C:\Users\admin\guestshot.out.txt 'ok'