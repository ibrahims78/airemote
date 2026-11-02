# reveal-toolbar.ps1 â€” ÙŠØ­Ø±Ù‘Ùƒ Ù…Ø¤Ø´Ù‘Ø± Ø§Ù„Ø¶ÙŠÙ Ø¥Ù„Ù‰ Ø£Ø¹Ù„Ù‰ Ø§Ù„Ù†Ø§ÙØ°Ø© Ù„Ø¥Ø¸Ù‡Ø§Ø± Ø´Ø±ÙŠØ· Ø£Ø¯ÙˆØ§Øª Ø§Ù„Ø¹Ø§Ø±Ø¶.
$out = 'C:\Users\admin\reveal.out.txt'
$sig = 'using System;using System.Runtime.InteropServices;public class P { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); }'
Add-Type -TypeDefinition $sig -ErrorAction SilentlyContinue
[P]::SetCursorPos(640, 46)
Start-Sleep -Milliseconds 400
[P]::SetCursorPos(632, 54)
Start-Sleep -Milliseconds 600
Set-Content -Path $out -Value @('cursor=640,18', 'DONE') -Encoding UTF8
