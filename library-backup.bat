@echo off
cd /d "%~dp0"
git add -A
for /f %%i in ('powershell -NoProfile -Command "Get-Date -Format ""yyyy-MM-dd HH:mm"""') do set DT=%%i
git commit -m "backup %DT%"
git push
pause
