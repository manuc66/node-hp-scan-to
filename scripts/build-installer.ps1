# Build the Windows installer locally, end to end:
#   1. compile src/index.ts into a self-contained bun binary
#   2. fetch WinSW if not already staged
#   3. assemble the NSIS installer into release/
#
# Usage:
#   ./scripts/build-installer.ps1 [-Version 1.10.0-local] [-SkipBinary] [-SkipNpmInstall]
#
# Prerequisites: bun + NSIS (winget install Oven-sh.Bun NSIS.NSIS), pnpm deps installed.
[CmdletBinding()]
param(
    [string]$Version = "1.10.0-local",
    [switch]$SkipBinary,
    [switch]$SkipNpmInstall
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

# locate bun (winget install does not always refresh the current session PATH)
$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
    $bunCandidate = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Oven-sh.Bun_*" `
        -Filter bun.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($bunCandidate) { $bun = $bunCandidate }
}
if (-not $bun) { throw "bun not found - run: winget install Oven-sh.Bun" }
$bunExe = if ($bun.Source) { $bun.Source } else { $bun.FullName }

# locate makensis
$nsis = "C:\Program Files (x86)\NSIS\makensis.exe"
if (-not (Test-Path $nsis)) {
    $nsis = (Get-Command makensis -ErrorAction SilentlyContinue).Source
}
if (-not (Test-Path $nsis)) { throw "makensis not found - run: winget install NSIS.NSIS" }

Push-Location $repoRoot
try {
    # npm dependencies are required for bun to resolve imports
    if (-not (Test-Path node_modules) -and -not $SkipNpmInstall) {
        Write-Host "==> installing npm dependencies (pnpm)"
        & pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }
    }

    # commit id baked into --version output (mirrors build-binaries.sh)
    Write-Host "==> baking commit id"
    & node getCommitId.js
    if ($LASTEXITCODE -ne 0) { throw "getCommitId.js failed" }

    if (-not $SkipBinary) {
        Write-Host "==> compiling binary with bun ($bunExe)"
        New-Item -ItemType Directory -Force -Path packaging\windows\staging | Out-Null
        $ver = $Version.TrimStart("v")
        & $bunExe build --compile --target=bun-windows-x64 `
            --windows-icon (Join-Path $repoRoot "assets\icon.ico") `
            --windows-title "node-hp-scan-to" `
            --windows-publisher "manuc66" `
            --windows-version "$ver.0" `
            --windows-description "Scan document to Computer from your printer" `
            --windows-copyright "Copyright 2026 manuc66" `
            --outfile packaging\windows\staging\node-hp-scan-to.exe src/index.ts
        if ($LASTEXITCODE -ne 0) { throw "bun build failed" }
    }

    # WinSW only needed by system mode, fetched once
    $winsw = "packaging\windows\staging\WinSW-x64.exe"
    if (-not (Test-Path $winsw)) {
        Write-Host "==> downloading WinSW-x64.exe"
        Invoke-WebRequest `
            -Uri "https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe" `
            -OutFile $winsw
    }

    $releaseDir = Join-Path $repoRoot "release"
    New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

    Write-Host "==> building installer (NSIS)"
    & $nsis "-DVERSION=$Version" packaging\windows\installer.nsi
    if ($LASTEXITCODE -ne 0) { throw "makensis failed" }

    $out = Join-Path $releaseDir "setup-node-hp-scan-to-v$Version.exe"
    Write-Host ""
    Write-Host "OK: $out ($([math]::Round((Get-Item $out).Length / 1MB, 1)) MB)"
} finally {
    Pop-Location
}
