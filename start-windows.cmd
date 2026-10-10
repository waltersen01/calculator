@echo off
rem Finanzkompass starten (Docker Desktop fuer Windows). Doppelklick genuegt.
setlocal
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker wurde nicht gefunden. Bitte Docker Desktop installieren: https://www.docker.com/products/docker-desktop/
  pause
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo Docker Desktop laeuft nicht. Bitte Docker Desktop starten und das Skript erneut ausfuehren.
  pause
  exit /b 1
)

rem Live-Verbindung nur starten, wenn .env und Schluessel vorhanden sind
set "PROFILE="
if exist ".env" if exist "secrets\enablebanking.pem" set "PROFILE=--profile live"

echo Finanzkompass wird gebaut und gestartet ...
docker compose %PROFILE% up -d --build
if errorlevel 1 (
  echo Start fehlgeschlagen. Die Meldungen oben zeigen den Grund.
  pause
  exit /b 1
)

set "PORT=8080"
if exist ".env" for /f "tokens=2 delims==" %%a in ('findstr /b /c:"APP_PORT=" ".env"') do set "PORT=%%a"

echo.
echo Finanzkompass laeuft: http://localhost:%PORT%
echo Beenden mit stop-windows.cmd
start "" "http://localhost:%PORT%"
endlocal
