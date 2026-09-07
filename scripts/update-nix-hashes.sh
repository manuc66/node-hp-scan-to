#!/usr/bin/env bash
#
# Update Nix Flake hashes in packaging/nix/package.nix based on built tarballs.
#
# Usage:
#   ./scripts/update-nix-hashes.sh [version]
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:?usage: $0 <version>}"
VERSION="${VERSION#v}"
NIX_FILE="packaging/nix/package.nix"
RELEASE_DIR="release"

if [ ! -f "$NIX_FILE" ]; then
  echo "error: $NIX_FILE not found" >&2
  exit 1
fi

calculate_sri() {
  local file=$1
  local hash
  if command -v openssl >/dev/null 2>&1; then
    hash=$(openssl dgst -sha256 -binary "$file" | openssl base64)
  elif command -v xxd >/dev/null 2>&1; then
    hash=$(sha256sum "$file" | cut -d' ' -f1 | xxd -r -p | base64)
  else
    echo "error: neither openssl nor xxd found" >&2
    exit 1
  fi
  echo "sha256-$hash"
}

FILE_X64="$RELEASE_DIR/node-hp-scan-to-v$VERSION-linux-x64.tar.gz"
FILE_ARM64="$RELEASE_DIR/node-hp-scan-to-v$VERSION-linux-arm64.tar.gz"

for f in "$FILE_X64" "$FILE_ARM64"; do
  if [ ! -f "$f" ]; then
    echo "error: artifact $f not found. Build Linux binaries first." >&2
    exit 1
  fi
done

HASH_X64=$(calculate_sri "$FILE_X64")
HASH_ARM64=$(calculate_sri "$FILE_ARM64")

echo "==> Updating Nix hashes in $NIX_FILE"
echo "    x86_64-linux: $HASH_X64"
echo "    aarch64-linux: $HASH_ARM64"

sed -i -E "s|(x86_64-linux = \")sha256-[^\"]+(\";)|\1$HASH_X64\2|" "$NIX_FILE"
sed -i -E "s|(aarch64-linux = \")sha256-[^\"]+(\";)|\1$HASH_ARM64\2|" "$NIX_FILE"

echo "==> Done"
