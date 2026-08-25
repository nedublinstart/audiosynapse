@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Synapse — запуск
echo.
echo  === Synapse START ===
echo  Сейчас подниму backend + frontend и открою браузер.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\win\start.ps1"
