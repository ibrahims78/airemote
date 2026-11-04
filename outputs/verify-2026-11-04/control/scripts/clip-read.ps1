# clip-read.ps1 - read Notepad content via Ctrl+A / Ctrl+C, then test direct Unicode typing.
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\admin\clip-read.out.txt'
$lines = New-Object System.Collections.ArrayList
function Add-Line($s) { [void]$lines.Add($s) }
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class KB {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte sc, uint f, IntPtr e);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out P p);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, System.Text.StringBuilder s, int n);
  public struct P { public int X; public int Y; }
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint n, INPUT[] inputs, int cb);
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public U U; }
  [StructLayout(LayoutKind.Explicit)] public struct U { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
  public static uint Uni(int code) {
    INPUT[] a = new INPUT[2];
    a[0].type = 1; a[0].U.ki.wScan = (ushort)code; a[0].U.ki.dwFlags = 4;
    a[1].type = 1; a[1].U.ki.wScan = (ushort)code; a[1].U.ki.dwFlags = 6;
    return SendInput(2, a, Marshal.SizeOf(typeof(INPUT)));
  }
}
'@
$np = @(Get-Process notepad -ErrorAction SilentlyContinue)
$h = if ($np.Count -gt 0) { $np[0].MainWindowHandle } else { [IntPtr]::Zero }
Add-Line ('NP_HANDLE=' + $h)
[void][KB]::ShowWindow($h, 9)
[void][KB]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 400
$sb = New-Object System.Text.StringBuilder 256; [void][KB]::GetWindowText([KB]::GetForegroundWindow(), $sb, 256)
Add-Line ('FG_BEFORE=' + $sb.ToString())

# Ctrl+A, Ctrl+C
[void][KB]::keybd_event(0x11, 0, 0, [IntPtr]::Zero)
[void][KB]::keybd_event(0x41, 0, 0, [IntPtr]::Zero)
[void][KB]::keybd_event(0x41, 0, 2, [IntPtr]::Zero)
[void][KB]::keybd_event(0x11, 0, 2, [IntPtr]::Zero)
Start-Sleep -Milliseconds 150
[void][KB]::keybd_event(0x11, 0, 0, [IntPtr]::Zero)
[void][KB]::keybd_event(0x43, 0, 0, [IntPtr]::Zero)
[void][KB]::keybd_event(0x43, 0, 2, [IntPtr]::Zero)
[void][KB]::keybd_event(0x11, 0, 2, [IntPtr]::Zero)
Start-Sleep -Milliseconds 500
try { $cb = Get-Clipboard -Raw -ErrorAction Stop; Add-Line ('CLIP_LEN=' + ([string]$cb).Length); Add-Line ('CLIP=[' + ([string]$cb) + ']') } catch { Add-Line ('CLIP_ERR=' + $_.Exception.Message) }

# direct Unicode typing test: XYZ
[void][KB]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 300
foreach ($ch in 'XYZ') { $r = [KB]::Uni([int][char]$ch) ; Add-Line ('UNI ' + $ch + ' ret=' + $r) ; Start-Sleep -Milliseconds 120 }
Start-Sleep -Milliseconds 400
$sb2 = New-Object System.Text.StringBuilder 256; [void][KB]::GetWindowText([KB]::GetForegroundWindow(), $sb2, 256)
Add-Line ('FG_AFTER=' + $sb2.ToString())

# read back via clipboard again
[void][KB]::keybd_event(0x11, 0, 0, [IntPtr]::Zero)
[void][KB]::keybd_event(0x41, 0, 0, [IntPtr]::Zero)
[void][KB]::keybd_event(0x41, 0, 2, [IntPtr]::Zero)
[void][KB]::keybd_event(0x11, 0, 2, [IntPtr]::Zero)
Start-Sleep -Milliseconds 150
[void][KB]::keybd_event(0x11, 0, 0, [IntPtr]::Zero)
[void][KB]::keybd_event(0x43, 0, 0, [IntPtr]::Zero)
[void][KB]::keybd_event(0x43, 0, 2, [IntPtr]::Zero)
[void][KB]::keybd_event(0x11, 0, 2, [IntPtr]::Zero)
Start-Sleep -Milliseconds 500
try { $cb2 = Get-Clipboard -Raw -ErrorAction Stop; Add-Line ('CLIP2_LEN=' + ([string]$cb2).Length); Add-Line ('CLIP2=[' + ([string]$cb2) + ']') } catch { Add-Line ('CLIP2_ERR=' + $_.Exception.Message) }
Add-Line 'RESULT=ok'
$lines | Set-Content -Encoding ASCII $log
