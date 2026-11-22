@echo off
set "ROOT=%~dp0.."
for %%F in ("%ROOT%\release\*Setup.exe") do set "SETUP=%%~fF"
if not exist "%SETUP%" (
  echo 未找到 NSIS 安装包，请先运行 scripts\build-installer.bat。
  pause
  exit /b 1
)
start "厚积薄发安装程序" "%SETUP%"
