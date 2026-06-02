[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,

    # Optional additional files/patterns to unprotect.
    [string[]]$ExtraPaths = @()
)

$ErrorActionPreference = 'Stop'

$defaultRelativePaths = @(
    'AI support/ai_diagnose.py',
    'js/ui.js',
    'bsod-diagnostic/bsod_diag.py',
    'bsod-diagnostic/bsod_gui.py',
    'bsod-diagnostic/phone_screen_diag.py'
)

$allRelativePaths = @($defaultRelativePaths + $ExtraPaths) | Where-Object { $_ -and $_.Trim() -ne '' } | Select-Object -Unique

$unprotected = @()
$missing = @()

foreach ($rel in $allRelativePaths) {
    $full = Join-Path $RepoRoot $rel
    if (-not (Test-Path -LiteralPath $full)) {
        $missing += $rel
        continue
    }

    $item = Get-Item -LiteralPath $full -Force
    if (-not $item.PSIsContainer) {
        $unprotected += $rel
        if ($PSCmdlet.ShouldProcess($item.FullName, 'Remove file read-only')) {
            $item.IsReadOnly = $false
        }
    }
}

if ($WhatIfPreference) {
    Write-Host "Would unprotect (read-only removed):" -ForegroundColor Cyan
} else {
    Write-Host "Unprotected (read-only removed):" -ForegroundColor Cyan
}
if ($unprotected.Count -eq 0) {
    Write-Host "  (none)"
} else {
    $unprotected | ForEach-Object { Write-Host "  $_" }
}

if ($missing.Count -gt 0) {
    Write-Host "Missing (skipped):" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  $_" }
}
