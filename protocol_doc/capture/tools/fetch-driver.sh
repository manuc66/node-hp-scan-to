#!/bin/bash
# fetch-driver.sh — copy an HP Windows DriverStore tree for inspection.
#
# The HP Windows drivers bundle the "scan engine" DLLs in a DriverStore
# folder (e.g. ...\HP Scan\DriverStore\NGScanDriver and
# ...\HP Smart Tank Plus 570 series\DriverStore). These contain the code
# that actually talks to the printer (e.g. HPScanTEDrv_x64.dll exposes the
# WalkupScanToComp / ScanJob / eSCL endpoints). This script copies the WHOLE
# DriverStore tree passed as argument so nothing is lost.
#
# Usage:
#   fetch-driver.sh <path-to-DriverStore> [destination]
#
# Examples:
#   fetch-driver.sh "/mnt/win/Program Files/HP/HP Smart Tank Plus 570 series/DriverStore"
#   fetch-driver.sh "/mnt/win/Program Files/HP/HP Scan/DriverStore" ./driver-store
#
# Default destination is ./driver-store (git-ignored, never committed).
set -euo pipefail

SRC="${1:?usage: fetch-driver.sh <path-to-DriverStore> [destination]}"
BASE_DEST="${2:-$(dirname "$0")/driver-store}"

if [ ! -d "$SRC" ]; then
  echo "error: source directory does not exist: $SRC" >&2
  exit 1
fi

# Name the sub-folder after the DriverStore's parent product folder so that
# multiple DriverStore trees can be copied side by side without overwriting.
PRODUCT="$(basename "$(dirname "$SRC")")"
DEST="$BASE_DEST/$PRODUCT"

mkdir -p "$DEST"
cp -a "$SRC"/. "$DEST"/

echo "Copied DriverStore from:"
echo "  $SRC"
echo "to:"
echo "  $DEST"
echo
echo "Files copied: $(find "$DEST" -type f | wc -l)"
echo "Total size:   $(du -sh "$DEST" | cut -f1)"