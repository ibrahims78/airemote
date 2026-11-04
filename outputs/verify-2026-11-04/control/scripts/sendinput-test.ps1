# sendinput-test.ps1 - does SendInput (absolute move + click) work where SetCursorPos failed?
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\sendinput-test.out.txt'
$lines = New-Object System.Collections.ArrayList
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class SI {
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint n, INPUT[] inputs, int cb);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out P p);
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
  public struct P { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public U U; }
  [StructLayout(LayoutKind.Explicit)] public struct U { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  public const uint MOVE=0x0001, ABS=0x8000, LD=0x0002, LU=0x0004, RD=0x0008, RU=0x0010;
  public static uint MoveAbs(int x, int y, int sw, int sh) {
    INPUT[] a = new INPUT[1];
    a[0].type = 0; a[0].U.mi.dx = (int)Math.Round(x * 65535.0 / (sw - 1));
    a[0].U.mi.dy = (int)Math.Round(y * 65535.0 / (sh - 1));
    a[0].U.mi.dwFlags = MOVE | ABS;
    return SendInput(1, a, Marshal.SizeOf(typeof(INPUT)));
  }
  public static uint Click(bool right) {
    INPUT[] a = new INPUT[2];
    a[0].type = 0; a[0].U.mi.dwFlags = right ? RD : LD;
    a[1].type = 0; a[1].U.mi.dwFlags = right ? RU : LU;
    return SendInput(2, a, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
$sw = [SI]::GetSystemMetrics(0); $sh = [SI]::GetSystemMetrics(1)
[void]$lines.Add('SCREEN=' + $sw + 'x' + $sh)
$n = [SI]::MoveAbs(500, 400, $sw, $sh)
[void]$lines.Add('SENDINPUT_MOVE=' + $n + ' ERR=' + [System.Runtime.InteropServices.Marshal]::GetLastWin32Error())
Start-Sleep -Milliseconds 200
$q = New-Object SI+P; [void][SI]::GetCursorPos([ref]$q)
[void]$lines.Add('POS_AFTER=' + $q.X + ',' + $q.Y)
[void]$lines.Add('MATCH=' + ($q.X -eq 500 -and $q.Y -eq 400))
$c = [SI]::Click($false)
[void]$lines.Add('SENDINPUT_CLICK=' + $c)
[void]$lines.Add('RESULT=ok')
$lines | Set-Content -Encoding ASCII $log
