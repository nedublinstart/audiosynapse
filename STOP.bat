@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Synapse — остановка
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\win\stop.ps1"
echo.
pause
