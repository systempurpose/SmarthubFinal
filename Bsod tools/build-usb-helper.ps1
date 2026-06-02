$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$proj = Join-Path $root 'UsbEvidenceHelper\UsbEvidenceHelper.csproj'
$outDir = Join-Path $root 'bin'

if (!(Test-Path $proj)) {
  throw "Project not found: $proj"
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Single-file publish (win-x64). If you want a smaller output and you know .NET runtime is present,
# you can set --self-contained false.
dotnet publish $proj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $outDir

$exe = Join-Path $outDir 'UsbEvidenceHelper.exe'
if (!(Test-Path $exe)) {
  throw "Publish failed; missing $exe"
}

Write-Host "Published: $exe" -ForegroundColor Green
