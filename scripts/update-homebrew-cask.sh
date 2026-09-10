#!/usr/bin/env bash
#
# Bump the version in the Homebrew cask to match a release.
#
# Usage:
#   ./scripts/update-homebrew-cask.sh <version>   # e.g. 1.11.1 (or v1.11.1)
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:?usage: $0 <version>}"
VERSION="${VERSION#v}"
CASK_FILE="packaging/homebrew/node-hp-scan-to.rb"

if [ ! -f "$CASK_FILE" ]; then
  echo "error: $CASK_FILE not found" >&2
  exit 1
fi

echo "==> Bumping Homebrew cask to $VERSION in $CASK_FILE"
sed -i -E "s|^(  version \").*(\")$|\1$VERSION\2|" "$CASK_FILE"
grep -q "^  version \"$VERSION\"$" "$CASK_FILE" \
  || { echo "error: version bump failed" >&2; exit 1; }

# Pin the checksum to the DMG attached to the release. The file uploaded to
# the GitHub release is bit-identical to the local one, so hashing it here
# is equivalent to hashing the download.
DMG_FILE="release/node-hp-scan-to-v$VERSION-macos.dmg"
if [ -f "$DMG_FILE" ]; then
  echo "==> Pinning Homebrew cask checksum from $DMG_FILE"
  SHA=$(sha256sum "$DMG_FILE" | awk '{print $1}')
  sed -i -E "s|^  sha256 .*|  sha256 \"$SHA\"|" "$CASK_FILE"
  grep -q "^  sha256 \"$SHA\"$" "$CASK_FILE" \
    || { echo "error: checksum pinning failed" >&2; exit 1; }
else
  echo "warning: $DMG_FILE not found, keeping existing sha256" >&2
fi
echo "==> Done"
