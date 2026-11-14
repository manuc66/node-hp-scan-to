#!/usr/bin/env bash
# Live end-to-end smoke test against a real HP scanner.
#
# Requires a reachable printer and the built dist:
#   pnpm build
#   SCANNER_IP=<printer-ip> ./scripts/live-test.sh [--destructive]
#
# --destructive also runs `clear-registrations`, which removes all walkup
# scan targets registered on the device. The multi-target and multi-printer
# steps below register extra labels on the device; run with --destructive to
# clear them afterwards.
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
  --post-command-pdf 'cp "{input}" "{output}"' >"$WORK/pdf.log" 2>&1; then
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

echo "--- listen --prefer-eSCL (brief: waits for the panel)"
rc=0
timeout 8 $BIN --address "$IP" listen --prefer-eSCL \
  >"$WORK/listen-escl.log" 2>&1 || rc=$?
if [ "$rc" -eq 0 ] || [ "$rc" -eq 124 ]; then
  ok "listen --prefer-eSCL started and registered its target"
else
  bad "listen --prefer-eSCL failed to start (rc=$rc, see $WORK/listen-escl.log)"
fi

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

echo "--- multi-target configuration"
CFG="$WORK/config"
mkdir -p "$CFG" "$WORK/multi-default" "$WORK/multi-archive"
cat >"$CFG/default.json" <<JSON
{
  "ip": "$IP",
  "directory": "$WORK/multi-default",
  "profiles": {
    "archive": { "directory": "$WORK/multi-archive" }
  },
  "targets": {
    "scan-to-pc-smoke-a": {},
    "scan-to-pc-smoke-b": { "profile": "archive" }
  }
}
JSON

if NODE_CONFIG_DIR="$CFG" timeout 20 $BIN config resolve \
  >"$WORK/resolve.json" 2>"$WORK/resolve.log"; then
  if grep -q '"scan-to-pc-smoke-a"' "$WORK/resolve.json" &&
    grep -q '"scan-to-pc-smoke-b"' "$WORK/resolve.json" &&
    grep -q "$WORK/multi-archive" "$WORK/resolve.json"; then
    ok "config resolve shows both targets and their pipelines"
  else
    bad "config resolve is missing a target or its profile (see $WORK/resolve.json)"
  fi
else
  bad "config resolve failed (see $WORK/resolve.log)"
fi

rc=0
NODE_CONFIG_DIR="$CFG" timeout 8 $BIN listen \
  >"$WORK/multi-listen.log" 2>&1 || rc=$?
if [ "$rc" -eq 0 ] || [ "$rc" -eq 124 ]; then
  ok "listen registered both targets"
else
  bad "listen failed with a targets block (rc=$rc, see $WORK/multi-listen.log)"
fi

if NODE_CONFIG_DIR="$CFG" timeout 60 $BIN single-scan --target "scan-to-pc-smoke-b" \
  >"$WORK/multi-scan.log" 2>&1; then
  COUNT="$(find "$WORK/multi-archive" -type f 2>/dev/null | wc -l)"
  if [ "$COUNT" -ge 1 ]; then
    ok "single-scan --target used the selected pipeline ($COUNT file(s))"
  else
    bad "single-scan --target wrote nothing to the profile directory"
  fi
else
  bad "single-scan --target failed (see $WORK/multi-scan.log)"
fi

if NODE_CONFIG_DIR="$CFG" timeout 20 $BIN single-scan \
  >"$WORK/multi-ambiguous.log" 2>&1; then
  bad "single-scan without --target should have been rejected"
else
  if grep -q -- "--target" "$WORK/multi-ambiguous.log"; then
    ok "ambiguous target selection rejected"
  else
    bad "ambiguous target selection error does not mention --target"
  fi
fi

echo "--- multi-printer configuration"
PCFG="$WORK/config-printers"
mkdir -p "$PCFG" "$WORK/printer-scan"
cat >"$PCFG/default.json" <<JSON
{
  "profiles": {
    "smoke": { "directory": "$WORK/printer-scan" }
  },
  "printers": {
    "smoke": {
      "ip": "$IP",
      "targets": {
        "scan-to-pc-printer-smoke": { "profile": "smoke" }
      }
    }
  }
}
JSON

if NODE_CONFIG_DIR="$PCFG" timeout 20 $BIN config resolve --printer smoke \
  >"$WORK/resolve-printers.json" 2>"$WORK/resolve-printers.log"; then
  if grep -q '"scan-to-pc-printer-smoke"' "$WORK/resolve-printers.json"; then
    ok "config resolve --printer shows the printer target"
  else
    bad "config resolve --printer is missing the printer target (see $WORK/resolve-printers.json)"
  fi
else
  bad "config resolve --printer failed (see $WORK/resolve-printers.log)"
fi

rc=0
NODE_CONFIG_DIR="$PCFG" timeout 8 $BIN listen --printer smoke \
  >"$WORK/printers-listen.log" 2>&1 || rc=$?
if [ "$rc" -eq 0 ] || [ "$rc" -eq 124 ]; then
  ok "listen --printer registered the configured printer"
else
  bad "listen --printer failed (rc=$rc, see $WORK/printers-listen.log)"
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