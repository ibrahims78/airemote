@echo off
taskkill /IM "AiRemote Agent.exe" /F
timeout /t 2 /nobreak >nul
schtasks /Create /TN r22ag /TR "\"C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe\" --autostart" /SC ONCE /ST 23:59 /IT /F
schtasks /Run /TN r22ag
timeout /t 5 /nobreak >nul
schtasks /Delete /TN r22ag /F
