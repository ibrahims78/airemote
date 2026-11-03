# setpos-test.ps1 - why SetCursorPos fails, and whether binding to the input desktop fixes it.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\setpos-test.out.txt'
$lines = New-Object System.Collections.ArrayList
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices; public class P2 { [DllImport("user32.dll", SetLastError=true)] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr OpenInputDesktop(int flags, bool inherit, int access); [DllImport("user32.dll", SetLastError=true)] public static extern bool SetThreadDesktop(IntPtr h); [DllImport("user32.dll", SetLastError=true)] public static extern IntPtr GetThreadDesktop(int id); [DllImport("kernel32.dll")] public static extern int GetCurrentThreadId(); }'
[void]$lines.Add('SESSION=' + (Get-Process -Id $PID).SessionId)
$ok = [P2]::SetCursorPos(500, 400)
[void]$lines.Add('SETPOS_BEFORE=' + $ok + ' ERR=' + [System.Runtime.InteropServices.Marshal]::GetLastWin32Error())
$d = [P2]::OpenInputDesktop(0, $false, 0x0100)
[void]$lines.Add('INPUT_DESKTOP=' + $d)
$st = [P2]::SetThreadDesktop($d)
[void]$lines.Add('SET_THREAD_DESKTOP=' + $st + ' ERR=' + [System.Runtime.InteropServices.Marshal]::GetLastWin32Error())
$ok2 = [P2]::SetCursorPos(500, 400)
[void]$lines.Add('SETPOS_AFTER=' + $ok2 + ' ERR=' + [System.Runtime.InteropServices.Marshal]::GetLastWin32Error())
[void]$lines.Add('RESULT=ok')
$lines | Set-Content -Encoding ASCII $log
