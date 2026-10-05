@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0First-Start-Amadeus.ps1"
if errorlevel 1 pause
