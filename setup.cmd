@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.21+ or Node.js 24 LTS, then retry.
  pause
  exit /b 1
)
call npm ci
if errorlevel 1 (
  pause
  exit /b 1
)
call npm run build
if errorlevel 1 (
  pause
  exit /b 1
)
call tools\windows\start-monitor.cmd
