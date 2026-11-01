Add-Type -AssemblyName System.Windows.Forms
$v = [System.Windows.Forms.SystemInformation]::VirtualScreen
$s = $v.Width.ToString() + 'x' + $v.Height.ToString() + ' @' + $v.X + ',' + $v.Y
Set-Content -Encoding UTF8 C:\Users\admin\dims.out.txt $s