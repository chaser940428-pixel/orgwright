@echo off
REM KPlay nightly regression — runs the tests tagged in .kplay\nightly.json (headless)
REM and writes test-results\nightly-<date>.md. Register it once with schedule-nightly.bat.
cd /d "%~dp0forceplay\apps\studio"
call npx tsx server\cli\run-suite.ts %* >> "%~dp0test-results\nightly.log" 2>&1
