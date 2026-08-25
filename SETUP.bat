@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Synapse — установка
echo.
echo  === Synapse SETUP ===
echo  Папка: %cd%
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\win\setup.ps1"
echo.
echo  Готово. Дальше дважды кликни START.bat
echo.
pause
