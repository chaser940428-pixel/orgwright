@echo off
title ForcePlay Studio - Salesforce Playwright Platform
cd /d "%~dp0"
echo ====================================================================
echo   ForcePlay Studio - Salesforce Playwright Test Platform
echo ====================================================================
echo.
echo [1/2] Opening Studio in default browser: http://localhost:5173
start http://localhost:5173
echo [2/2] Starting ForcePlay Vite Frontend and Backend API Server...
echo.
pnpm --prefix forceplay --filter @kplay/studio start
pause
