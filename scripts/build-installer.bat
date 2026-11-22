@echo off
setlocal
set "ROOT=%~dp0.."
set "MAKENSIS=D:\NSIS\makensis.exe"
if exist "%MAKENSIS%" goto build
set "MAKENSIS=%ProgramFiles(x86)%\NSIS\makensis.exe"
if not exist "%MAKENSIS%" set "MAKENSIS=%ProgramFiles%\NSIS\makensis.exe"
if exist "%MAKENSIS%" goto build
echo 未找到 makensis.exe，请先安装 NSIS。
exit /b 1
:build
pushd "%ROOT%"
"%MAKENSIS%" "installer\installer.nsi"
popd
