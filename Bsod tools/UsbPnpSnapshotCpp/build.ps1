param(
  [int]$MaxDevices = 250
)

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $here
try {
  # Requires running inside a Visual Studio Developer PowerShell/Command Prompt
  # where `cl.exe` is available.
  cl /nologo /std:c++17 /EHsc UsbPnpSnapshot.cpp /link setupapi.lib cfgmgr32.lib /out:UsbPnpSnapshot.exe

  Write-Host "Built: $here\UsbPnpSnapshot.exe"
  Write-Host "Test run:" 
  .\UsbPnpSnapshot.exe --max $MaxDevices | Out-Host
} finally {
  Pop-Location
}
