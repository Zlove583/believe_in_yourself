Unicode true
!define ROOT "D:\Users\believe_in_yourself-main\believe_in_yourself-main"
Name "厚积薄发"
OutFile "${ROOT}\release\HouJiBoFa-Setup.exe"
InstallDir "$LOCALAPPDATA\Programs\厚积薄发"
InstallDirRegKey HKCU "Software\厚积薄发" "InstallDir"
RequestExecutionLevel user

Page directory
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "厚积薄发"
  SetOutPath "$INSTDIR"
  File /r "${ROOT}\release\win-unpacked\*"

  WriteRegStr HKCU "Software\厚积薄发" "InstallDir" "$INSTDIR"
  CreateDirectory "$SMPROGRAMS\厚积薄发"
  CreateShortcut "$DESKTOP\厚积薄发.lnk" "$INSTDIR\厚积薄发.exe"
  CreateShortcut "$SMPROGRAMS\厚积薄发\厚积薄发.lnk" "$INSTDIR\厚积薄发.exe"
  WriteUninstaller "$INSTDIR\Uninstall 厚积薄发.exe"
SectionEnd

Section "Uninstall"
  Delete "$DESKTOP\厚积薄发.lnk"
  Delete "$SMPROGRAMS\厚积薄发\厚积薄发.lnk"
  RMDir "$SMPROGRAMS\厚积薄发"
  DeleteRegKey HKCU "Software\厚积薄发"
  RMDir /r "$INSTDIR"
SectionEnd
