# Sign a locally built Windows installer with a self-signed Certificate
# Authority cert so Windows Defender Application Control (WDAC) stops
# blocking it on this machine.
#
# This is for DEVELOPMENT ONLY: the certificate is self-signed, valid here
# only, and NOT suitable for distribution. Releases must be signed via
# SignPath (see .github/workflows/publish.yml) or a real code-signing cert.
#
# Usage:
#   ./scripts/sign-local.ps1 [-InstallerPath <path to setup exe>]
#
# Defaults to the latest setup-*.exe in release/.
[CmdletBinding()]
param(
    [string]$CertSubject = "CN=node-hp-scan-to Local Test",
    [string]$InstallerPath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

# locate signtool (Windows SDK)
$signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*" `
    -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -match "x64" } |
    Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) {
    throw "signtool.exe not found - install the Windows SDK (winget install Microsoft.WindowsSDK.10.0)"
}

# find installer to sign
if (-not $InstallerPath) {
    $candidate = Get-ChildItem -Path (Join-Path $repoRoot "release") `
        -Filter "setup-*.exe" -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($candidate) { $InstallerPath = $candidate.FullName }
}
if (-not $InstallerPath) {
    throw "no installer found in release/ - build one first (scripts/build-installer.ps1)"
}
# ensure a full path regardless of how it was supplied
$InstallerPath = (Resolve-Path -LiteralPath $InstallerPath).Path

# reuse an existing cert if still valid, otherwise create a new one
$existing = Get-ChildItem Cert:\CurrentUser\My | Where-Object {
    $_.Subject -eq $CertSubject -and $_.NotAfter -gt (Get-Date).AddDays(1) -and $_.Issuer -ne $_.Subject
} | Select-Object -First 1
if (-not $existing) {
    # build a proper CA (root) -> leaf (code-signing) chain: WDAC "Enterprise
    # signing level" requires the leaf's issuer to be a trusted root, so a
    # plain self-issued leaf is not enough on strict machines.
    Write-Host "==> creating CA root + code-signing leaf certificate"

    $rootSubject = "CN=node-hp-scan-to Local Test CA"

    # root CA
    $root = New-SelfSignedCertificate `
        -Subject $rootSubject `
        -Type Custom `
        -KeyUsage CertSign, CRLSign, DigitalSignature `
        -TextExtension @("2.5.29.19={critical}{text}ca=1&pathlength=0") `
        -CertStoreLocation Cert:\CurrentUser\My `
        -KeySpec KeyExchange `
        -KeyExportPolicy Exportable `
        -NotAfter (Get-Date).AddYears(3)

    # leaf code-signing cert signed by the root
    $existing = New-SelfSignedCertificate `
        -Subject $CertSubject `
        -Type CodeSigningCert `
        -Signer $root `
        -KeyUsage DigitalSignature `
        -KeySpec Signature `
        -CertStoreLocation Cert:\CurrentUser\My `
        -NotAfter (Get-Date).AddDays(30)
}

# trust the signing chain at CurrentUser level so WDAC on this box stops
# blocking the exe: leaf -> TrustedPublisher, its issuer -> Root
$TrustRoot = Get-Item "Cert:\CurrentUser\My\$($existing.Issuer.Substring(3))" -ErrorAction SilentlyContinue
if (-not $TrustRoot) {
    # resolve issuer by subject (issuer string is CN=<name>)
    $issuerCN = $existing.Issuer -replace '^CN=', ''
    $TrustRoot = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -eq "CN=$issuerCN" } | Select-Object -First 1
}
foreach ($pair in @(
        @{ Store = "TrustedPublisher"; Cert = $existing },
        @{ Store = "Root"; Cert = $TrustRoot }
    )) {
    if (-not $pair.Cert) { continue }
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($pair.Store, "CurrentUser")
    $store.Open("ReadWrite")
    try {
        $already = $store.Certificates | Where-Object { $_.Thumbprint -eq $pair.Cert.Thumbprint }
        if (-not $already) {
            $store.Add($pair.Cert)
            Write-Host "==> added $($pair.Cert.Subject) to $($pair.Store) (CurrentUser)"
        } else {
            Write-Host "==> $($pair.Store) already trusts $($pair.Cert.Subject)"
        }
    } finally {
        $store.Close()
    }
}

# sign with the leaf (code-signing) cert
Write-Host "==> signing (leaf: $($existing.Subject))"
& $signtool.FullName sign /fd SHA256 /sha1 $existing.Thumbprint `
    /tr "http://timestamp.digicert.com" /td SHA256 $InstallerPath
if ($LASTEXITCODE -ne 0) { throw "signtool failed" }
Write-Host "OK: signed $InstallerPath"