#!/usr/bin/env bash
#
# Build .deb and .rpm packages from the linux binaries produced by
# scripts/build-binaries.sh, using nfpm.
#
# Usage:
#   ./scripts/build-packages.sh <version>
#
# Environment:
#   NFPM_BIN  path to the nfpm binary (default: nfpm from PATH)
#   OUT_DIR   directory that contains .staging/ and receives packages
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:?usage: build-packages.sh <version>}"
VERSION="${VERSION#v}"
NFPM_BIN="${NFPM_BIN:-nfpm}"
OUT_DIR="${OUT_DIR:-release}"

command -v "$NFPM_BIN" >/dev/null 2>&1 || { echo "error: nfpm not found (set NFPM_BIN)" >&2; exit 1; }

mkdir -p "$OUT_DIR/.staging/current"

for pair in "amd64 x64 x86_64" "arm64 arm64 aarch64"; do
  set -- $pair
  deb_arch="$1"
  bun_arch="$2"
  apk_arch="$3"
  binary="$OUT_DIR/.staging/linux-$bun_arch/node-hp-scan-to"

  [ -f "$binary" ] || { echo "error: missing $binary, run build-binaries.sh first" >&2; exit 1; }

  echo "==> packaging linux-$deb_arch (deb + rpm + apk)"
  cp "$binary" "$OUT_DIR/.staging/current/node-hp-scan-to"
  DEB_ARCH="$deb_arch" VERSION="$VERSION" "$NFPM_BIN" package \
    -f packaging/nfpm.yaml -p deb -t "$OUT_DIR/"
  DEB_ARCH="$deb_arch" VERSION="$VERSION" "$NFPM_BIN" package \
    -f packaging/nfpm.yaml -p rpm -t "$OUT_DIR/"
  DEB_ARCH="$apk_arch" VERSION="$VERSION" "$NFPM_BIN" package \
    -f packaging/nfpm.yaml -p apk -t "$OUT_DIR/"
done
