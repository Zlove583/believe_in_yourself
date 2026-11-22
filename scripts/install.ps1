$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$installer = Get-ChildItem (Join-Path $root 'release') -Filter '*Setup.exe' -File | Select-Object -First 1
if (-not $installer) {
  throw 'NSIS installer not found. Run scripts\\build-installer.bat first.'
}
Start-Process -FilePath $installer.FullName -Wait
