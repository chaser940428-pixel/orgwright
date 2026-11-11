@echo off
REM Registers a daily Windows scheduled task that runs run-nightly.bat.
REM Usage: schedule-nightly.bat [HH:mm]   (default 02:00)  — the PC must be on and logged in.
set RUNAT=%1
if "%RUNAT%"=="" set RUNAT=02:00
schtasks /Create /F /SC DAILY /ST %RUNAT% /TN "KPlay Nightly Regression" /TR "\"%~dp0run-nightly.bat\""
echo.
echo Scheduled "KPlay Nightly Regression" daily at %RUNAT%.
echo Remove it with: schtasks /Delete /F /TN "KPlay Nightly Regression"
