@echo off
REM Orgwright nightly regression — runs the tests tagged in .orgwright\nightly.json (headless)
REM and writes test-results\nightly-<date>.md. Register it once with schedule-nightly.bat.
cd /d "%~dp0orgwright\apps\studio"
call npx tsx server\cli\run-suite.ts %* >> "%~dp0test-results\nightly.log" 2>&1
