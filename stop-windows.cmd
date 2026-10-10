@echo off
rem Finanzkompass beenden. Deine Daten liegen im Browser und bleiben erhalten.
setlocal
cd /d "%~dp0"
docker compose --profile live down
echo Finanzkompass wurde beendet.
pause
endlocal
