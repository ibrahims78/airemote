@echo off
rem Recovery: reinstall a good agent build from the copy at C:\Users\admin\ag-fix.exe
timeout /t 1 /nobreak >nul
taskkill /f /im "AiRemote Agent.exe" >nul 2>&1
timeout /t 3 /nobreak >nul
start /wait "" "C:\Users\admin\ag-fix.exe" /S
timeout /t 8 /nobreak >nul
start "" "%LOCALAPPDATA%\Programs\AiRemote Agent\AiRemote Agent.exe"
exit /b 0
