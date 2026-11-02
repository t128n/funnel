@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -Sta -ExecutionPolicy Bypass -File "%~dp0setup.ps1"
if errorlevel 1 pause
endlocal
