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
echo "==> Done"
