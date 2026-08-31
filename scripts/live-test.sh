#!/usr/bin/env bash
# Live end-to-end smoke test against a real HP scanner.
#
# Requires a reachable printer and the built dist:
#   pnpm build
#   SCANNER_IP=<printer-ip> ./scripts/live-test.sh [--destructive]
#
# --destructive also runs `clear-registrations`, which removes all walkup
# scan targets registered on the device.
set -euo pipefail

IP="${SCANNER_IP:-}"
if [ -z "$IP" ]; then
  echo "SCANNER_IP is required (e.g. SCANNER_IP=192.168.1.10)" >&2
  exit 2
fi

BIN="node dist/index.js"
WORK="$(mktemp -d)"
export LOG_FORMAT="${LOG_FORMAT:-json}"
FAIL=0

ok()  { echo "OK: $1"; }
bad() { echo "FAIL: $1"; FAIL=1; }
warn() { echo "WARN: $1"; }

echo "### E2E against $IP"

echo "--- single-scan"
mkdir -p "$WORK/single"
if timeout 60 $BIN --address "$IP" single-scan -d "$WORK/single" >"$WORK/single.log" 2>&1; then
  ok "single-scan ran"
else
  bad "single-scan failed (see $WORK/single.log)"
fi
JPEGS="$(find "$WORK/single" -name '*.jpg' 2>/dev/null | wc -l)"
if [ "$JPEGS" -ge 1 ]; then
  ok "$JPEGS jpeg(s) produced"
else
  bad "no jpeg produced"
fi

echo "--- single-scan --pdf with pdf post-command"
mkdir -p "$WORK/pdf"
PDFS=0
if timeout 60 $BIN --address "$IP" single-scan -d "$WORK/pdf" --pdf \
  --post-command 'cp "{input}" "{output}"' >"$WORK/pdf.log" 2>&1; then
  PDFS="$(find "$WORK/pdf" -name '*.pdf' 2>/dev/null | wc -l)"
  if [ "$PDFS" -ge 1 ]; then
    ok "$PDFS pdf(s) produced and post-processed"
  else
    bad "no pdf produced by --pdf flow (see $WORK/pdf.log)"
  fi
else
  bad "single-scan --pdf failed (see $WORK/pdf.log)"
fi

echo "--- discover"
found=0
for _ in 1 2 3; do
  if timeout 30 $BIN discover --timeout 8 2>/dev/null | grep -q "$IP"; then
    found=1
    break
  fi
done
if [ "$found" -eq 1 ]; then
  ok "discover found $IP"
else
  # mDNS/bonjour is environment-dependent; not fatal.
  warn "discover did not find $IP (mDNS can be flaky)"
fi

echo "--- healthcheck"
$BIN --address "$IP" listen --health-check --health-check-port 3999 \
  >"$WORK/health.log" 2>&1 &
HPID=$!
sleep 4
if curl -sf http://localhost:3999/health | grep -q '"status":"healthy"'; then
  ok "healthcheck /health"
else
  bad "healthcheck did not respond"
fi
kill "$HPID" 2>/dev/null || true

echo "--- adf-autoscan (brief: waits for the feeder)"
mkdir -p "$WORK/adf"
# exit 124 = killed by timeout while waiting for the feeder: expected.
rc=0
timeout 8 $BIN --address "$IP" adf-autoscan -d "$WORK/adf" \
  >"$WORK/adf.log" 2>&1 || rc=$?
if [ "$rc" -eq 0 ] || [ "$rc" -eq 124 ]; then
  ok "adf-autoscan started (waiting for feeder)"
else
  bad "adf-autoscan failed to start (rc=$rc, see $WORK/adf.log)"
fi

echo "--- json output"
mkdir -p "$WORK/json"
timeout 20 $BIN --address "$IP" single-scan -d "$WORK/json" \
  >"$WORK/json.log" 2>&1 || true
if grep -Eq '^\{"level":' "$WORK/json.log"; then
  ok "LOG_FORMAT=json emits JSON lines"
else
  bad "LOG_FORMAT=json did not emit JSON lines"
fi

if [ "${1:-}" = "--destructive" ]; then
  echo "--- clear-registrations (destructive)"
  if timeout 30 $BIN --address "$IP" clear-registrations \
    >"$WORK/clear.log" 2>&1; then
    ok "clear-registrations ran"
  else
    bad "clear-registrations failed (see $WORK/clear.log)"
  fi
fi

rm -rf "$WORK"
if [ "$FAIL" -ne 0 ]; then
  echo "### E2E FAILED"
  exit 1
fi
echo "### E2E OK"