@echo off
setlocal
cd /d "%~dp0"

if not exist "node_modules\electron" (
  echo Abhaengigkeiten werden installiert...
  call npm.cmd install
  if errorlevel 1 goto :error
)

echo Starte CleanMusic...
call npm.cmd start
if errorlevel 1 goto :error
exit /b 0

:error
echo.
echo CleanMusic konnte nicht gestartet werden.
echo Fehlercode: %errorlevel%
pause
exit /b 1
