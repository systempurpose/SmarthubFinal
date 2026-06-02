param(
  [ValidateSet('Debug','Release')] [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'

Push-Location $PSScriptRoot
try {
  if ($Configuration -eq 'Release') {
    cargo build --release
  } else {
    cargo build
  }
} finally {
  Pop-Location
}
