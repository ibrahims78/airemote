@echo off
timeout /t 2 /nobreak >nul
taskkill /f /im "AiRemote Agent.exe" >nul 2>&1
timeout /t 3 /nobreak >nul
start /wait "" "%~dp0ag3825.exe" /S
timeout /t 6 /nobreak >nul
start "" "%LOCALAPPDATA%\Programs\AiRemote Agent\AiRemote Agent.exe"
exit /b 0
