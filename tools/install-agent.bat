@echo off
rem install-agent.bat - silent in-place upgrade of the AiRemote Windows agent.
rem usage: install-agent.bat [package.exe]   (default: ag3827.exe, pushed next to this file)
setlocal
set "AGENT_EXE=%~1"
if "%AGENT_EXE%"=="" set "AGENT_EXE=ag3827.exe"
timeout /t 2 /nobreak >nul
taskkill /f /im "AiRemote Agent.exe" >nul 2>&1
timeout /t 3 /nobreak >nul
start /wait "" "%~dp0%AGENT_EXE%" /S
timeout /t 6 /nobreak >nul
start "" "%LOCALAPPDATA%\Programs\AiRemote Agent\AiRemote Agent.exe"
exit /b 0
