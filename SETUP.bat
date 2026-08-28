@echo off
cd /d "%~dp0"
echo Synapse SETUP
echo.
npm run setup
echo.
echo Next: npm run dev
echo Or double-click START.bat
pause
