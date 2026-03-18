@echo off

call :colored Updating... Green
git pull
echo ---

@pause

:colored
set "text=%~1"
set "color=%~2"
%Windir%\System32\WindowsPowerShell\v1.0\powershell.exe -Command "Write-Host '%text%' -ForegroundColor %color%"
exit /b
