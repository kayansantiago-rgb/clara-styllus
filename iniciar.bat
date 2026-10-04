@echo off
title Clara Styllus PDV
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e tente de novo.
  pause
  exit /b 1
)
start "" /b cmd /c "timeout /t 2 >nul & start http://localhost:3456"
node --disable-warning=ExperimentalWarning server.js
pause
