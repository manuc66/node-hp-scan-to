#!/usr/bin/env bash
#
# Verify a tagged release end-to-end:
#   CI green (npm, binaries, AUR, winget), release artifacts present,
#   checksums consistent, Sigstore attestations verifiable, AUR and npm
#   actually updated.
#
# Usage:
#   ./scripts/verify-release.sh <version>      # e.g. 1.11.0 (or v1.11.0)
#
# Requirements: gh (authenticated), curl, sha256sum.
set -euo pipefail

VERSION="${1:?usage: verify-release.sh <version>}"
VERSION="${VERSION#v}"
TAG="v${VERSION}"
REPO="manuc66/node-hp-scan-to"

EXPECTED_ASSETS=(
  "node-hp-scan-to-v${VERSION}-windows-x64.zip"
  "node-hp-scan-to-v${VERSION}-darwin-x64.zip"
  "node-hp-scan-to-v${VERSION}-darwin-arm64.zip"
  "node-hp-scan-to-v${VERSION}-linux-x64.tar.gz"
  "node-hp-scan-to-v${VERSION}-linux-arm64.tar.gz"
  "node-hp-scan-to-v${VERSION}-linux-x64-musl.tar.gz"
  "node-hp-scan-to-v${VERSION}-linux-arm64-musl.tar.gz"
  "setup-node-hp-scan-to-v${VERSION}.exe"
  "node-hp-scan-to_${VERSION}-1_amd64.deb"
  "node-hp-scan-to_${VERSION}-1_arm64.deb"
  "node-hp-scan-to-${VERSION}-1.x86_64.rpm"
  "node-hp-scan-to-${VERSION}-1.aarch64.rpm"
  "node-hp-scan-to_${VERSION}-r1_x86_64.apk"
  "node-hp-scan-to_${VERSION}-r1_aarch64.apk"
  "node-hp-scan-to.sbom.json"
  "SHA256SUMS.txt"
)

fail() { echo "✗ $*" >&2; exit 1; }
ok()   { echo "✓ $*"; }

[ -x "$(command -v gh)" ] || fail "gh not installed"
gh auth status >/dev/null 2>&1 || fail "gh not authenticated"

echo "==> 1/6 waiting for the Publish workflow on tag ${TAG}..."
RUN=$(gh run list --workflow=Publish --json databaseId,headBranch,event,conclusion \
      --limit 30 | python3 -c "
import json,sys
for r in json.load(sys.stdin):
    if r['headBranch'] == '${TAG}' and r['event'] == 'push':
        print(r['databaseId']); break
")
[ -n "$RUN" ] || fail "no Publish workflow run found for tag ${TAG}"
gh run watch "$RUN" --exit-status --interval 30 >/dev/null 2>&1 \
  || fail "workflow run ${RUN} failed"

echo "==> 2/6 job conclusions..."
JOB_IDS=$(gh run view "$RUN" --json jobs -q '.jobs[].databaseId')
FAILED=0
for j in $JOB_IDS; do
  NAME=$(gh api "repos/${REPO}/actions/jobs/${j}" -q .name)
  CONC=$(gh api "repos/${REPO}/actions/jobs/${j}" -q .conclusion)
  case "$CONC" in
    success) ok "$NAME: $CONC" ;;
    skipped) ok "$NAME: $CONC (skipped)" ;;
    *)       fail "$NAME: $CONC"; FAILED=1 ;;
  esac
done

echo "==> 3/6 release assets on ${TAG}..."
ASSETS=$(gh release view "$TAG" --json assets -q '.assets[].name')
for a in "${EXPECTED_ASSETS[@]}"; do
  printf '%s' "$ASSETS" | grep -qx "$a" && ok "$a" || fail "missing asset: $a"
done

echo "==> 4/6 checksums spot-check..."
TMP=$(mktemp -d)
gh release download "$TAG" --pattern 'SHA256SUMS.txt' --dir "$TMP" >/dev/null
gh release download "$TAG" --pattern "setup-node-hp-scan-to-v${VERSION}.exe" --dir "$TMP" >/dev/null
ACTUAL=$(sha256sum "$TMP/setup-node-hp-scan-to-v${VERSION}.exe" | awk '{print $1}')
EXPECTED=$(grep "setup-node-hp-scan-to-v${VERSION}.exe" "$TMP/SHA256SUMS.txt" | awk '{print $1}')
[ "$ACTUAL" = "$EXPECTED" ] && ok "setup.exe sha256 matches SHA256SUMS.txt" \
  || fail "checksum mismatch: got $ACTUAL expected $EXPECTED"

echo "==> 5/6 attestations..."
gh attestation verify "$TMP/setup-node-hp-scan-to-v${VERSION}.exe" -R "$REPO" \
  >/dev/null 2>&1 && ok "build provenance attestation verifies for setup.exe" \
  || fail "build provenance attestation verification failed"
gh attestation verify "$TMP/node-hp-scan-to.sbom.json" -R "$REPO" \
  --predicate-type https://cyclonedx.org/bom >/dev/null 2>&1 \
  && ok "SBOM attestation verifies" || fail "SBOM attestation verification failed"

echo "==> 6/6 registries..."
AUR_V=$(curl -s "https://aur.archlinux.org/rpc/?v=5&type=info&arg[]=node-hp-scan-to" \
        | python3 -c "import json,sys; print(json.load(sys.stdin)['results'][0]['Version'])")
[ "$AUR_V" = "${VERSION}-1" ] && ok "AUR at ${AUR_V}" || fail "AUR at ${AUR_V}, expected ${VERSION}-1"
NPM_V=$(npm view "node-hp-scan-to@${VERSION}" version 2>/dev/null || true)
[ "$NPM_V" = "$VERSION" ] && ok "npm at ${NPM_V}" || fail "npm at '${NPM_V}', expected ${VERSION}"

echo
echo "=============================================="
echo "  Release v${VERSION}: TOUT EST VERT"
echo "=============================================="
echo
echo "Remaining manual step (first submission only):"
echo "  ./scripts/winget-submit.sh ${VERSION}"
rm -rf "$TMP"