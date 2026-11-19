@echo off
taskkill /IM "AiRemote Agent.exe" /F
C:\r22-agent-setup.exe /S
timeout /t 18 /nobreak
start "" "C:\Users\admin\AppData\Local\Programs\AiRemote Agent\AiRemote Agent.exe"
