@echo off
taskkill /IM "AiRemote Agent.exe" /F
timeout /t 3 /nobreak
start "" "C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe" --autostart
