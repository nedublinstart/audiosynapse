# Synapse — stop backend/frontend started by START.bat
$ErrorActionPreference = "SilentlyContinue"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PidDir = Join-Path $Root ".run"

Write-Host ""
Write-Host "=== Synapse STOP ===" -ForegroundColor Cyan

foreach ($name in @("backend.pid", "frontend.pid")) {
  $pf = Join-Path $PidDir $name
  if (Test-Path $pf) {
    $procId = (Get-Content $pf | Select-Object -First 1).Trim()
    if ($procId -match "^\d+$") {
      Write-Host "Stopping $name -> PID $procId"
      cmd /c "taskkill /PID $procId /T /F" 2>$null | Out-Null
    }
    Remove-Item $pf -Force -ErrorAction SilentlyContinue
  }
}

foreach ($port in 8000, 3000) {
  $lines = netstat -ano | Select-String ":$port\s+.*LISTENING"
  foreach ($line in $lines) {
    $parts = ($line.ToString() -split "\s+") | Where-Object { $_ -ne "" }
    $procId = $parts[-1]
    if ($procId -match "^\d+$") {
      Write-Host "Free port $port (PID $procId)"
      cmd /c "taskkill /PID $procId /T /F" 2>$null | Out-Null
    }
  }
}

Write-Host "Остановлено." -ForegroundColor Green
Write-Host ""
