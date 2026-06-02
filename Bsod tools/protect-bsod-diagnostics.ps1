[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,

    # Optional additional files/patterns to protect.
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

$protected = @()
$missing = @()

foreach ($rel in $allRelativePaths) {
    $full = Join-Path $RepoRoot $rel
    if (-not (Test-Path -LiteralPath $full)) {
        $missing += $rel
        continue
    }

    $item = Get-Item -LiteralPath $full -Force
    if (-not $item.PSIsContainer) {
        $protected += $rel
        if ($PSCmdlet.ShouldProcess($item.FullName, 'Set file read-only')) {
            $item.IsReadOnly = $true
        }
    }
}

if ($WhatIfPreference) {
    Write-Host "Would protect (read-only):" -ForegroundColor Cyan
} else {
    Write-Host "Protected (read-only):" -ForegroundColor Cyan
}
if ($protected.Count -eq 0) {
    Write-Host "  (none)"
} else {
    $protected | ForEach-Object { Write-Host "  $_" }
}

if ($missing.Count -gt 0) {
    Write-Host "Missing (skipped):" -ForegroundColor Yellow
    $missing | ForEach-Object { Write-Host "  $_" }
}

Write-Host "\nTip: To undo, run: .\\Bsod tools\\unprotect-bsod-diagnostics.ps1" -ForegroundColor DarkGray
