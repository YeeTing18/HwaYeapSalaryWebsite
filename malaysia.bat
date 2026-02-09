@echo off
cd /d "%~dp0"  REM Change to the directory of the .bat file
echo Starting Node.js server...
start cmd /k "node server.js"