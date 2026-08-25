# Synapse — one-time setup for Windows 11
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

Write-Host ""
Write-Host "=== Synapse SETUP ===" -ForegroundColor Cyan
Write-Host "Root: $Root"
Write-Host ""

function Find-Python {
  $cmds = @("py -3", "python", "python3")
  foreach ($c in $cmds) {
    try {
      $parts = $c -split " "
      $exe = $parts[0]
      $args = @()
      if ($parts.Length -gt 1) { $args = $parts[1..($parts.Length - 1)] }
      $args += @("--version")
      $out = & $exe @args 2>&1 | Out-String
      if ($LASTEXITCODE -eq 0 -or $out -match "Python 3") {
        return $c
      }
    } catch { }
  }
  return $null
}

function Assert-Cmd($Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Не найден '$Name'. Установи и перезапусти SETUP.bat"
  }
}

$py = Find-Python
if (-not $py) {
  throw "Python 3 не найден. Поставь с https://www.python.org/downloads/ (галочка Add to PATH)"
}
Assert-Cmd "npm"
Assert-Cmd "node"

Write-Host "[1/4] Python: " -NoNewline
Invoke-Expression "$py --version"
Write-Host "[1/4] Node:  " -NoNewline
node --version
Write-Host ""

# Backend venv + deps
$Backend = Join-Path $Root "backend"
$Venv = Join-Path $Backend ".venv"
$PyExe = Join-Path $Venv "Scripts\python.exe"
$PipExe = Join-Path $Venv "Scripts\pip.exe"

Write-Host "[2/4] Backend venv + зависимости..." -ForegroundColor Yellow
if (-not (Test-Path $PyExe)) {
  Invoke-Expression "$py -m venv `"$Venv`""
}
& $PyExe -m pip install --upgrade pip
& $PipExe install -r (Join-Path $Backend "requirements.txt")

$EnvExample = Join-Path $Backend ".env.example"
$EnvFile = Join-Path $Backend ".env"
if (-not (Test-Path $EnvFile)) {
  Copy-Item $EnvExample $EnvFile
  Write-Host "  создан backend\.env"
}

# Frontend deps
$Frontend = Join-Path $Root "frontend"
$EnvLocal = Join-Path $Frontend ".env.local"
if (-not (Test-Path $EnvLocal)) {
  Set-Content -Path $EnvLocal -Value "NEXT_PUBLIC_API_URL=" -Encoding UTF8
  Write-Host "  создан frontend\.env.local"
}

Write-Host "[3/4] Frontend npm install..." -ForegroundColor Yellow
Push-Location $Frontend
try {
  npm config set fetch-retries 5 | Out-Null
  npm config set fetch-retry-mintimeout 20000 | Out-Null
  npm config set fetch-retry-maxtimeout 120000 | Out-Null
  if (Test-Path "node_modules") {
    Write-Host "  node_modules уже есть — делаю npm install (докачка/проверка)"
  }
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  npm install упал, пробую зеркало npmmirror..." -ForegroundColor DarkYellow
    npm install --registry=https://registry.npmmirror.com
  }
  if ($LASTEXITCODE -ne 0) {
    throw "npm install не удался. Проверь интернет / VPN / антивирус и запусти SETUP.bat ещё раз."
  }
} finally {
  Pop-Location
}

Write-Host "[4/4] Проверка импорта backend..." -ForegroundColor Yellow
$env:PYTHONPATH = $Backend
& $PyExe -c "from app.main import app; print('Synapse OK:', app.title)"

Write-Host ""
Write-Host "=== Установка завершена ===" -ForegroundColor Green
Write-Host "Дальше дважды кликни START.bat"
Write-Host ""
