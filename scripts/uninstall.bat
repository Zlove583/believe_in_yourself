@echo off
set "UNINSTALL=%LOCALAPPDATA%\Programs\厚积薄发\Uninstall 厚积薄发.exe"
if not exist "%UNINSTALL%" (
  echo 未找到已安装的厚积薄发。
  pause
  exit /b 1
)
start "卸载厚积薄发" "%UNINSTALL%"
