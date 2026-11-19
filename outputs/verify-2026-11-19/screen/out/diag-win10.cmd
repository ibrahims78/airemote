@echo off
(
echo === processes ===
tasklist | findstr /I "AiRemote capture-gdi"
echo === asar ===
dir /b "C:\Users\admin\AppData\Local\Programs\AiRemote Agent\resources\app.asar"
echo === gdi dir ===
dir /b "C:\Users\admin\AppData\Roaming\AiRemote Agent"
echo === display ===
wmic path Win32_VideoController get CurrentHorizontalResolution,CurrentVerticalResolution
) > C:\r22-diag.txt 2>&1
