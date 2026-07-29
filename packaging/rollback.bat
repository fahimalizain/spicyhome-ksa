@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0spicyhome.ps1" -Rollback %*
