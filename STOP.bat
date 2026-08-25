@echo off
cd /d "%~dp0"
echo Synapse STOP
echo.
npm run stop
pause
