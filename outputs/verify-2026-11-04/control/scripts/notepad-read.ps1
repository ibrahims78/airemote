# notepad-read.ps1 - read Notepad's edit text and the cursor position (proof of typed input).
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\notepad-read.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class NP {
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr FindWindow(string cls, string win);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern IntPtr FindWindowEx(IntPtr p, IntPtr c, string cls, string win);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int SendMessage(IntPtr h, int msg, int w, StringBuilder l);
  [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern int GetWindowTextLength(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out P p);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  public struct P { public int X; public int Y; }
}
'@
$h = [NP]::FindWindow('Notepad', $null)
$e = [NP]::FindWindowEx($h, [IntPtr]::Zero, 'Edit', $null)
$sb = New-Object System.Text.StringBuilder 8192
[void][NP]::SendMessage($e, 0x000D, 8192, $sb)   # WM_GETTEXT
Add-Line ('NOTEPAD_TEXT=[' + $sb.ToString() + ']')
Add-Line ('EDIT_LEN=' + [NP]::GetWindowTextLength($e))
$q = New-Object NP+P; [void][NP]::GetCursorPos([ref]$q)
Add-Line ('CURSOR=' + $q.X + ',' + $q.Y)
$fh = [NP]::GetForegroundWindow()
$fs = New-Object System.Text.StringBuilder 256; [void][NP]::GetWindowText($fh, $fs, 256)
Add-Line ('FG_TITLE=' + $fs.ToString())
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
