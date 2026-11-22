$ErrorActionPreference = 'Stop'
$uninstaller = Join-Path $env:LOCALAPPDATA 'Programs\厚积薄发\Uninstall 厚积薄发.exe'
if (-not (Test-Path $uninstaller)) {
  throw 'Installed uninstaller not found.'
}
Start-Process -FilePath $uninstaller -Wait
