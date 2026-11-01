# place-agent.ps1 â€” ØªÙ…Ø±ÙƒØ² Ù†Ø§ÙØ°Ø© ÙˆÙƒÙŠÙ„ AiRemote ÙˆØªÙƒØ¨ÙŠØ±Ù‡Ø§ Ù„Ù„Ù‚Ø·Ø© Ù…ÙˆØ«Ù‘Ù‚Ø©.
$out = 'C:\Users\admin\place-agent.out.txt'
Set-Content -Path $out -Value @('STARTED') -Encoding UTF8
$lines = New-Object System.Collections.ArrayList
try {
  $sig = 'using System;using System.Runtime.InteropServices;public class Win { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr after, int X, int Y, int cx, int cy, uint flags); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd); }'
  Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
  $p = Get-Process 'AiRemote Agent' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $p) {
    [void]$lines.Add('NO_WINDOW')
  } else {
    [void][Win]::ShowWindow($p.MainWindowHandle, 9)
    Start-Sleep -Milliseconds 400
    [void][Win]::SetWindowPos($p.MainWindowHandle, [IntPtr]::Zero, 10, 10, 700, 620, 0x0040)
    Start-Sleep -Milliseconds 700
    [void]$lines.Add('PLACED pid=' + $p.Id)
  }
} catch {
  [void]$lines.Add('ERR ' + $_.Exception.Message)
}
[void]$lines.Add('DONE')
Set-Content -Path $out -Value $lines -Encoding UTF8
