@echo off
title Orgwright Studio - Salesforce Playwright Platform
cd /d "%~dp0"
echo ====================================================================
echo   Orgwright Studio - Salesforce Playwright Test Platform
echo ====================================================================
echo.
echo [1/2] Opening Studio in default browser: http://localhost:5173
start http://localhost:5173
echo [2/2] Starting Orgwright Vite Frontend and Backend API Server...
echo.
pnpm --prefix orgwright --filter @orgwright/studio start
pause
