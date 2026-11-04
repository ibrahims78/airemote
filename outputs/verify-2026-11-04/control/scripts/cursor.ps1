Add-Type -AssemblyName System.Windows.Forms
$p = [System.Windows.Forms.Cursor]::Position
$s = $p.X.ToString() + ',' + $p.Y.ToString()
Set-Content -Encoding UTF8 C:\Users\admin\cursor.out.txt $s