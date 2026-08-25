# Synapse — start backend + frontend on Windows 11
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "frontend"
$VenvPy = Join-Path $Backend ".venv\Scripts\python.exe"
$PidDir = Join-Path $Root ".run"
New-Item -ItemType Directory -Force -Path $PidDir | Out-Null

function Test-Port([int]$Port) {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(400, $false)
    if (-not $ok) { $client.Close(); return $false }
    $client.EndConnect($iar) | Out-Null
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Wait-Http([string]$Url, [int]$Seconds = 90) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
    } catch { }
    Start-Sleep -Milliseconds 700
  }
  return $false
}

function Start-CmdWindow([string]$Title, [string]$WorkDir, [string]$CommandLine) {
  # UTF-8 BOM bat so Cyrillic paths work on Win11
  $safe = ($Title -replace "[^a-zA-Z0-9_-]", "_")
  $bat = Join-Path $PidDir ("run-" + $safe + ".bat")
  $content = @"
@echo off
chcp 65001 >nul
title $Title
cd /d "$WorkDir"
$CommandLine
echo.
echo [$Title] процесс завершился. Окно можно закрыть.
pause
"@
  $utf8bom = New-Object System.Text.UTF8Encoding $true
  [System.IO.File]::WriteAllText($bat, $content, $utf8bom)
  $proc = Start-Process -FilePath "cmd.exe" -ArgumentList @("/k", "`"$bat`"") -WorkingDirectory $WorkDir -PassThru -WindowStyle Normal
  return $proc
}

Write-Host ""
Write-Host "=== Synapse START ===" -ForegroundColor Cyan
Write-Host "Root: $Root"
Write-Host ""

if (-not (Test-Path $VenvPy)) {
  Write-Host "Сначала один раз запусти SETUP.bat" -ForegroundColor Red
  Read-Host "Enter"
  exit 1
}
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) {
  Write-Host "Нет frontend\node_modules — сначала SETUP.bat" -ForegroundColor Red
  Read-Host "Enter"
  exit 1
}

if (-not (Test-Path (Join-Path $Backend ".env"))) {
  Copy-Item (Join-Path $Backend ".env.example") (Join-Path $Backend ".env")
}
if (-not (Test-Path (Join-Path $Frontend ".env.local"))) {
  Set-Content -Path (Join-Path $Frontend ".env.local") -Value "NEXT_PUBLIC_API_URL=" -Encoding UTF8
}

# Stop previous launcher-owned processes
foreach ($name in @("backend.pid", "frontend.pid")) {
  $pf = Join-Path $PidDir $name
  if (Test-Path $pf) {
    $oldId = Get-Content $pf -ErrorAction SilentlyContinue
    if ($oldId) {
      cmd /c "taskkill /PID $oldId /T /F" 2>$null | Out-Null
    }
    Remove-Item $pf -Force -ErrorAction SilentlyContinue
  }
}

# 8787 — не 8000: на Win11 порт 8000 часто в excludedportrange (WinError 10013)
$ApiPort = 8787
if (Test-Port $ApiPort) {
  Write-Host "Порт $ApiPort уже занят — backend, похоже, уже запущен." -ForegroundColor DarkYellow
} else {
  Write-Host "Стартую backend :$ApiPort ..." -ForegroundColor Yellow
  $backendLine = "set PYTHONPATH=. && `"$VenvPy`" -m uvicorn app.main:app --reload --host 127.0.0.1 --port $ApiPort"
  $bp = Start-CmdWindow "Synapse Backend" $Backend $backendLine
  Set-Content -Path (Join-Path $PidDir "backend.pid") -Value $bp.Id
}

if (Test-Port 3000) {
  Write-Host "Порт 3000 уже занят — frontend, похоже, уже запущен." -ForegroundColor DarkYellow
} else {
  Write-Host "Стартую frontend :3000 ..." -ForegroundColor Yellow
  $frontLine = "set API_PROXY_TARGET=http://127.0.0.1:$ApiPort&& npm run dev -- --hostname 127.0.0.1 --port 3000"
  $fp = Start-CmdWindow "Synapse Frontend" $Frontend $frontLine
  Set-Content -Path (Join-Path $PidDir "frontend.pid") -Value $fp.Id
}

Write-Host "Жду готовности..." -ForegroundColor Yellow
$okApi = Wait-Http "http://127.0.0.1:$ApiPort/api/health" 120
$okWeb = Wait-Http "http://127.0.0.1:3000/" 180

if ($okApi) { Write-Host "API  OK   http://127.0.0.1:$ApiPort/docs" -ForegroundColor Green }
else { Write-Host "API ещё не поднялся — смотри окно Synapse Backend" -ForegroundColor DarkYellow }

if ($okWeb) { Write-Host "WEB  OK   http://127.0.0.1:3000" -ForegroundColor Green }
else { Write-Host "WEB ещё не поднялся — смотри окно Synapse Frontend" -ForegroundColor DarkYellow }

Start-Process "http://127.0.0.1:3000"
Write-Host ""
Write-Host "Готово. Оставь окна Backend/Frontend открытыми." -ForegroundColor Green
Write-Host "Остановка: STOP.bat"
Write-Host ""
Start-Sleep -Seconds 2
