#!/usr/bin/env bash
#
# Submit a new node-hp-scan-to version to microsoft/winget-pkgs without
# wingetcreate (which is a Windows/.NET-only tool). Writes the three YAML
# manifests by hand, computes the installer SHA256, and opens a pull request
# through the GitHub CLI.
#
# Usage:
#   ./scripts/winget-submit.sh <version>          # e.g. 1.10.1
#
# Environment:
#   INSTALLER_URL    override the installer URL (default: GitHub release asset)
#   LOCAL_INSTALLER  path to a local setup exe to hash instead of downloading
#   PKG_ID           package identifier (default: manuc66.node-hp-scan-to)
#   WORKDIR          temp dir for the winget-pkgs clone (default: mktemp)
#   DRY_RUN=1        write the manifests and stop (no fork/commit/PR)
#
# Requirements: git, gh (authenticated), curl, sha256sum.
# First run forks microsoft/winget-pkgs under the authenticated account.
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:?usage: winget-submit.sh <version>}"
VERSION="${VERSION#v}"
PKG_ID="${PKG_ID:-manuc66.node-hp-scan-to}"
REPO="manuc66/node-hp-scan-to"
PUBLISHER="Emmanuel Counasse"
PUBLISHER_USER="manuc66"

# winget-pkgs layout: manifests/<first-letter>/<publisher>/<package>/<version>/
ID_PUB="${PKG_ID%%.*}"
ID_PKG="${PKG_ID#*.}"
MANIFEST_DIR="manifests/${ID_PUB:0:1}/${ID_PUB}/${ID_PKG}/${VERSION}"

INSTALLER_URL="${INSTALLER_URL:-https://github.com/${REPO}/releases/download/v${VERSION}/setup-node-hp-scan-to-v${VERSION}.exe}"

if [ -n "${LOCAL_INSTALLER:-}" ]; then
    INSTALLER_PATH="$LOCAL_INSTALLER"
else
    TMP="$(mktemp -d)"
    INSTALLER_PATH="$TMP/setup.exe"
    echo "==> downloading installer..."
    curl -fsSL -o "$INSTALLER_PATH" "$INSTALLER_URL"
fi

SHA="$(sha256sum "$INSTALLER_PATH" | awk '{print $1}')"
echo "==> ${INSTALLER_URL}"
echo "    sha256: ${SHA}"

WORK="${WORKDIR:-$(mktemp -d)}"
mkdir -p "$WORK/$MANIFEST_DIR"

# ---------------------------------------------------------------------------
# manifests
# ---------------------------------------------------------------------------
cat > "$WORK/$MANIFEST_DIR/${PKG_ID}.installer.yaml" <<EOF
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.installer.1.6.0.schema.json
PackageIdentifier: ${PKG_ID}
PackageVersion: ${VERSION}
InstallerType: nullsoft
Installers:
- Architecture: x64
  InstallerUrl: ${INSTALLER_URL}
  InstallerSha256: ${SHA}
ManifestType: installer
ManifestVersion: 1.6.0
EOF

cat > "$WORK/$MANIFEST_DIR/${PKG_ID}.locale.en-US.yaml" <<EOF
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.locale.1.6.0.schema.json
PackageIdentifier: ${PKG_ID}
PackageVersion: ${VERSION}
PackageLocale: en-US
Publisher: ${PUBLISHER}
PublisherUrl: https://github.com/${PUBLISHER_USER}
Author: ${PUBLISHER}
PackageName: node-hp-scan-to
PackageUrl: https://github.com/${REPO}
License: MIT
LicenseUrl: https://github.com/${REPO}/blob/master/LICENSE
ShortDescription: Scan document to Computer for HP All-in-One Printers
Moniker: node-hp-scan-to
Tags:
- hp
- scan
- printer
- officejet
- all-in-one
ManifestType: defaultLocale
ManifestVersion: 1.6.0
EOF

cat > "$WORK/$MANIFEST_DIR/${PKG_ID}.yaml" <<EOF
# yaml-language-server: \$schema=https://aka.ms/winget-manifest.version.1.6.0.schema.json
PackageIdentifier: ${PKG_ID}
PackageVersion: ${VERSION}
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
EOF

echo "==> manifests written to ${WORK}/${MANIFEST_DIR}:"
ls -1 "$WORK/$MANIFEST_DIR"

if [ "${DRY_RUN:-0}" = "1" ]; then
    echo "==> DRY RUN - not forking or opening a PR. Manifests kept in ${WORK}/${MANIFEST_DIR}"
    exit 0
fi

# ---------------------------------------------------------------------------
# fork, commit, push, PR
# ---------------------------------------------------------------------------
cd "$WORK"
echo "==> partial-cloning winget-pkgs..."
git clone --quiet --filter=blob:none --no-checkout \
    https://github.com/microsoft/winget-pkgs.git upstream
cd upstream
git config user.name "$(gh api user -q .login)"
git config user.email "$(gh api user -q .email 2>/dev/null || gh api user -q .login)@users.noreply.github.com"

git sparse-checkout init --cone
git sparse-checkout set "manifests/${ID_PUB:0:1}/${ID_PUB}"
git checkout -b "node-hp-scan-to-${VERSION}"

mkdir -p "$MANIFEST_DIR"
cp "$WORK/$MANIFEST_DIR/"* "$MANIFEST_DIR/"
git add "$MANIFEST_DIR"
git commit -q -m "New version: ${PKG_ID} ${VERSION}" || { echo "nothing to commit" >&2; exit 1; }

GH_USER="$(gh api user -q .login)"
gh repo fork microsoft/winget-pkgs --remote >/dev/null 2>&1 || true
git push -q "${GH_USER}" HEAD

gh pr create --repo microsoft/winget-pkgs \
    --head "${GH_USER}:node-hp-scan-to-${VERSION}" \
    --title "New version: ${PKG_ID} ${VERSION}" \
    --body "Submits ${PKG_ID} ${VERSION}.

Installer: ${INSTALLER_URL}
Sha256: ${SHA}

Built automatically from https://github.com/${REPO} with Sigstore build provenance attached to the release."