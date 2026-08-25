#!/usr/bin/env bash
#
# Build self-contained executables for multiple platforms using Bun's
# single-file compilation. Produces ready-to-attach release archives in
# release/ and keeps raw linux binaries under release/.staging/ so they
# can be packaged into .deb/.rpm by nfpm.
#
# Usage:
#   ./scripts/build-binaries.sh [version]
#
# Environment:
#   TARGETS   space separated bun targets to build
#             (default: all supported targets)
#   OUT_DIR   output directory (default: release)
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:-$(git describe --tags --always 2>/dev/null || echo dev)}"
VERSION="${VERSION#v}"
TARGETS=(${TARGETS:-bun-windows-x64 bun-darwin-x64 bun-darwin-arm64 bun-linux-x64 bun-linux-arm64})
OUT_DIR="${OUT_DIR:-release}"

command -v bun >/dev/null 2>&1 || { echo "error: bun is not installed" >&2; exit 1; }

node getCommitId.js

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR/.staging"

for target in "${TARGETS[@]}"; do
  case "$target" in
    bun-windows-x64)    os=windows; arch=x64;  ext=.exe; archive=zip ;;
    bun-darwin-x64)     os=darwin;  arch=x64;  ext="";   archive=zip ;;
    bun-darwin-arm64)   os=darwin;  arch=arm64; ext="";  archive=zip ;;
    bun-linux-x64)      os=linux;   arch=x64;  ext="";   archive=targz ;;
    bun-linux-arm64)    os=linux;   arch=arm64; ext="";  archive=targz ;;
    *) echo "error: unsupported target '$target'" >&2; exit 1 ;;
  esac

  name="node-hp-scan-to"
  stage="$OUT_DIR/.staging/$os-$arch"
  echo "==> building $target -> $stage/$name$ext"

  mkdir -p "$stage"
  bun build --compile \
    --target="$target" \
    --outfile "$stage/$name" \
    src/index.ts

  mkdir -p "$stage/config"
  cp config/default.json "$stage/config/default.json"
  cp README.md SUPPORTED_DEVICES.md LICENSE "$stage/"
  if [ "$os" = windows ]; then
    cp packaging/winsw.xml "$stage/"
  elif [ "$os" = darwin ]; then
    cp packaging/io.github.manuc66.node-hp-scan-to.plist "$stage/"
  fi

  if [ "$archive" = zip ]; then
    (cd "$stage" && zip -q -r "../../$name-v$VERSION-$os-$arch.zip" .)
  else
    tar -czf "$OUT_DIR/$name-v$VERSION-$os-$arch.tar.gz" -C "$stage" .
  fi
done

echo "==> done, artifacts in $OUT_DIR:"
ls -lh "$OUT_DIR" | grep -v '^total\|.staging'
