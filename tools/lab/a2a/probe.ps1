$o = New-Object System.Collections.ArrayList
[void]$o.Add('USER=' + $env:USERNAME)
[void]$o.Add('COMP=' + $env:COMPUTERNAME)
[void]$o.Add('SESSION=' + ((query session 2>&1) -join ' / '))
[void]$o.Add('AGENTPROC=' + @(Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue).Count)
[void]$o.Add('EXPLORER=' + @(Get-Process explorer -ErrorAction SilentlyContinue).Count)
Add-Type -AssemblyName System.Windows.Forms
$vs = [System.Windows.Forms.SystemInformation]::VirtualScreen
[void]$o.Add('VIRTUAL=' + $vs.X + ',' + $vs.Y + ' ' + $vs.Width + 'x' + $vs.Height)
[void]$o.Add('SCREENS=' + ([System.Windows.Forms.Screen]::AllScreens | ForEach-Object { $_.DeviceName + ':' + $_.Bounds.Width + 'x' + $_.Bounds.Height + '@' + $_.Bounds.X + ',' + $_.Bounds.Y } ) -join ' | ')
[void]$o.Add('DPI=' + (Get-ItemProperty 'HKCU:\Control Panel\Desktop' -Name LogPixels -ErrorAction SilentlyContinue).LogPixels)
[void]$o.Add('TASKS=' + ((tasklist | Select-String -Pattern 'AiRemote|electron' ) -join ' / '))
$o | Set-Content -Encoding UTF8 C:\Users\admin\probe.out.txt