@echo off
setlocal
"%~dp0funnel.exe" setup %*
if errorlevel 1 pause
endlocal
