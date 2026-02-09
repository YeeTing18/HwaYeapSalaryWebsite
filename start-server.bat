@echo off
echo Starting Salary System Email Server...
cd /d %~dp0
title Salary System Email Server
color 0A
echo Server is starting... Please do not close this window!
echo.
node server.js
pause 