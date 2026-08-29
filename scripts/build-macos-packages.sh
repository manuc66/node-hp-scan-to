#!/usr/bin/env bash
#
# Build macOS distribution artifacts from the cross-compiled darwin binaries
# produced by scripts/build-binaries.sh:
#   - a universal2 .app bundle (Intel + Apple Silicon via lipo)
#   - a signed (optional) .pkg installer
#   - a signed (optional) and notarized (optional) .dmg
#
# Must run on macOS (uses lipo, pkgbuild, productbuild, hdiutil, iconutil,
# sips, qlmanage, codesign, notarytool).
#
# Usage:
#   ./scripts/build-macos-packages.sh <version>
#
# Environment:
#   OUT_DIR                 output directory (default: release)
#   MACOS_SIGNING_IDENTITY  "Developer ID Application: ..." name. When set, the
#                           .app, .pkg and .dmg are signed (no notarization).
#   MACOS_INSTALLER_IDENTITY "Developer ID Installer: ..." name used to sign the
#                           .pkg. Defaults to MACOS_SIGNING_IDENTITY.
#   MACOS_NOTARY_APPLE_ID / MACOS_NOTARY_APPLE_PASSWORD / MACOS_NOTARY_TEAM_ID
#                           when set (all three), artifacts are submitted to
#                           Apple notarization and stapled.
#
# Inputs (created by build-binaries.sh):
#   release/.staging/darwin-x64/node-hp-scan-to
#   release/.staging/darwin-arm64/node-hp-scan-to
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="${1:?usage: build-macos-packages.sh <version>}"
VERSION="${VERSION#v}"
# CFBundleVersion / pkgbuild only accept numeric versions, so strip any
# pre-release suffix (e.g. "1.11.0-rc.1" -> "1.11.0", "0.0.0-dispatch" -> "0.0.0").
PKG_VERSION="${VERSION%%-*}"
OUT_DIR="${OUT_DIR:-release}"
STAGE="$OUT_DIR/.staging"

SIGNING_IDENTITY="${MACOS_SIGNING_IDENTITY:-}"
INSTALLER_IDENTITY="${MACOS_INSTALLER_IDENTITY:-$SIGNING_IDENTITY}"
NOTARY_APPLE_ID="${MACOS_NOTARY_APPLE_ID:-}"
NOTARY_PASSWORD="${MACOS_NOTARY_APPLE_PASSWORD:-}"
NOTARY_TEAM_ID="${MACOS_NOTARY_TEAM_ID:-}"

[ "$(uname -s)" = Darwin ] || { echo "error: this script must run on macOS" >&2; exit 1; }

X64_BIN="$STAGE/darwin-x64/node-hp-scan-to"
ARM64_BIN="$STAGE/darwin-arm64/node-hp-scan-to"
for b in "$X64_BIN" "$ARM64_BIN"; do
  [ -f "$b" ] || { echo "error: missing $b, run build-binaries.sh first" >&2; exit 1; }
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

APP_NAME="node-hp-scan-to.app"
APP="$TMP/$APP_NAME"
UNIVERSAL="$TMP/node-hp-scan-to"

echo "==> merging darwin binaries into universal2 ($(file "$X64_BIN" | sed 's/.*: //'))"
lipo -create "$X64_BIN" "$ARM64_BIN" -output "$UNIVERSAL"

echo "==> assembling $APP_NAME bundle"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
sed -e "s/__VERSION__/$PKG_VERSION/g" -e "s/__SHORT_VERSION__/$PKG_VERSION/g" \
  packaging/macos/Info.plist > "$APP/Contents/Info.plist"
cp "$UNIVERSAL" "$APP/Contents/MacOS/node-hp-scan-to"
chmod +x "$APP/Contents/MacOS/node-hp-scan-to"
# the binary resolves the config directory next to itself (see src/index.ts),
# so default.json must live in Contents/MacOS/config
mkdir -p "$APP/Contents/MacOS/config"
cp config/default.json "$APP/Contents/MacOS/config/default.json"
cp packaging/io.github.manuc66.node-hp-scan-to.plist "$APP/Contents/Resources/"
cp README.md SUPPORTED_DEVICES.md LICENSE "$APP/Contents/Resources/"

echo "==> rendering icon.icns from assets/icon.svg"
ICONSET="$TMP/icon.iconset"
mkdir -p "$ICONSET"
# Render the SVG to a 1024px PNG. Quick Look is available on every macOS;
# rsvg-convert is a fallback when present (e.g. via brew install librsvg).
render_svg() {
  qlmanage -t -s 1024 -o "$TMP" assets/icon.svg >/dev/null 2>&1 && \
    mv "$TMP/icon.svg.png" "$TMP/icon-1024.png"
}
render_svg || {
  if command -v rsvg-convert >/dev/null 2>&1; then
    rsvg-convert -w 1024 -h 1024 -o "$TMP/icon-1024.png" assets/icon.svg
  else
    echo "error: could not render assets/icon.svg (qlmanage and rsvg-convert both unavailable)" >&2
    exit 1
  fi
}
[ -f "$TMP/icon-1024.png" ] || { echo "error: icon rendering produced no PNG" >&2; exit 1; }
for size in 16 32 128 256 512; do
  sips -z "$size" "$size" "$TMP/icon-1024.png" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -z "$((size * 2))" "$((size * 2))" "$TMP/icon-1024.png" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/icon.icns"
echo "==> done building $APP_NAME"

if [ -n "$SIGNING_IDENTITY" ]; then
  echo "==> signing .app with $SIGNING_IDENTITY"
  codesign --force --options runtime --timestamp \
    --sign "$SIGNING_IDENTITY" "$APP"
  codesign --verify --strict --deep "$APP" || { echo "error: codesign verification failed" >&2; exit 1; }
fi

PKG_UNSIGNED="$TMP/node-hp-scan-to.pkg"
PKG="$OUT_DIR/node-hp-scan-to-v$VERSION-macos.pkg"
DMG="$OUT_DIR/node-hp-scan-to-v$VERSION-macos.dmg"

echo "==> building .pkg"
pkgbuild --identifier "io.github.manuc66.node-hp-scan-to" \
  --version "$PKG_VERSION" \
  --root "$APP" \
  --install-location "/Applications/$APP_NAME" \
  "$PKG_UNSIGNED"
if [ -n "$INSTALLER_IDENTITY" ]; then
  echo "==> signing .pkg with $INSTALLER_IDENTITY"
  PKG_TMP="$TMP/node-hp-scan-to-signed.pkg"
  productbuild --package "$PKG_UNSIGNED" --sign "$INSTALLER_IDENTITY" \
    --identifier "io.github.manuc66.node-hp-scan-to" \
    --version "$PKG_VERSION" "$PKG_TMP"
  mv "$PKG_TMP" "$PKG"
else
  mv "$PKG_UNSIGNED" "$PKG"
fi

echo "==> building .dmg"
DMG_STAGE="$TMP/dmg"
mkdir -p "$DMG_STAGE"
cp -R "$APP" "$DMG_STAGE/"
ln -s /Applications "$DMG_STAGE/Applications"
hdiutil create -volname "node-hp-scan-to" -srcfolder "$DMG_STAGE" \
  -ov -format UDZO "$DMG" >/dev/null
if [ -n "$SIGNING_IDENTITY" ]; then
  echo "==> signing .dmg with $SIGNING_IDENTITY"
  codesign --force --sign "$SIGNING_IDENTITY" "$DMG"
fi

if [ -n "$NOTARY_APPLE_ID" ] && [ -n "$NOTARY_PASSWORD" ] && [ -n "$NOTARY_TEAM_ID" ]; then
  if [ -z "$SIGNING_IDENTITY" ] || [ -z "$INSTALLER_IDENTITY" ]; then
    echo "error: notarization requires both a Developer ID Application identity (for .app/.dmg) and a Developer ID Installer identity (for .pkg)" >&2
    exit 1
  fi
  echo "==> notarizing and stapling .pkg and .dmg"
  for f in "$PKG" "$DMG"; do
    xcrun notarytool submit "$f" \
      --apple-id "$NOTARY_APPLE_ID" \
      --password "$NOTARY_PASSWORD" \
      --team-id "$NOTARY_TEAM_ID" \
      --wait
    xcrun stapler staple "$f"
  done
else
  echo "==> skipping notarization (no Apple notarization credentials)"
fi

echo "==> done, artifacts in $OUT_DIR:"
ls -lh "$PKG" "$DMG"