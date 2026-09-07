#!/usr/bin/env bash
# Real-service end-to-end test for the delivery targets.
#
# Brings up MinIO, Nextcloud, Paperless-ngx and n8n via
# docker-compose.test.yml, pushes a real sample PDF through the actual
# upload modules (S3/WebDAV/multipart/webhook) and verifies each object
# ended up where it should. Unlike scripts/upload-stub.mjs, this proves
# the code against real servers (S3 signature, WebDAV, paperless API,
# n8n webhook receipt), not against a self-consistent stub.
#
# Usage:
#   pnpm build
#   ./scripts/real-services-test.sh                 # deliveries only
#   SCANNER_IP=192.168.1.10 ./scripts/real-services-test.sh --scanner
#
# Optional: N8N_API_KEY (create an owner and an API key in the n8n UI,
# Settings > API) to also verify the event is received by a real n8n
# workflow; without it the n8n step is skipped.
set -euo pipefail

COMPOSE="docker compose -f docker-compose.test.yml"
FAIL=0
WORK="$(mktemp -d)"

ok()  { echo "OK: $1"; }
bad() { echo "FAIL: $1"; FAIL=1; }
warn(){ echo "WARN: $1"; }

echo "### Bringing up real services (MinIO, Nextcloud, Paperless, n8n)"
$COMPOSE up -d --wait --remove-orphans || { echo "compose up failed" >&2; exit 1; }

echo "### Paperless API token"
PAPERLESS_TOKEN="$($COMPOSE exec -T paperless sh -c \
  "python3 manage.py shell -c \
     \"from rest_framework.authtoken.models import Token; \\
      from django.contrib.auth import get_user_model; \\
      t, _ = Token.objects.get_or_create(user=get_user_model().objects.get(username='admin')); \\
      print(t.key)\" 2>/dev/null | tail -n1")"
if [ -n "$PAPERLESS_TOKEN" ]; then
  ok "token obtained (${#PAPERLESS_TOKEN} chars)"
else
  bad "could not obtain a paperless API token"
fi

export S3_URL="http://localhost:9000"
export S3_REGION="us-east-1"
export S3_BUCKET="scans"
export S3_ACCESS_KEY_ID="miniotest"
export S3_SECRET_ACCESS_KEY="miniotest123"
export S3_PREFIX="test"
export S3_FORCE_PATH_STYLE="1"
export NEXTCLOUD_URL="http://localhost:8081"
export NEXTCLOUD_USERNAME="admin"
export NEXTCLOUD_PASSWORD="adminpass"
export NEXTCLOUD_UPLOAD_FOLDER="scan"
export PAPERLESS_POST_DOCUMENT_URL="http://localhost:8090/api/documents/post_document/"
export WEBHOOK_URL=""

if [ -n "${N8N_API_KEY:-}" ]; then
  echo "### Create the n8n test workflow (path /webhook/scan)"
  WF_JSON="$WORK/wf-create.json"
  cat >"$WORK/wf-body.json" <<'JSON'
{"name":"scan real-services check","active":true,"nodes":[{"parameters":{"path":"scan","responseMode":"onReceived"},"id":"w","name":"Webhook","type":"n8n-nodes-base.webhook","typeVersion":1,"position":[0,0]},{"parameters":{},"id":"n","name":"NoOp","type":"n8n-nodes-base.noOp","typeVersion":1,"position":[200,0]}],"connections":{"Webhook":{"main":[[{"node":"NoOp","type":"main","index":0}]]}}}
JSON
  if curl -s -X POST "http://localhost:5678/api/v1/workflows" \
      -H "X-N8N-API-KEY: $N8N_API_KEY" -H "Content-Type: application/json" \
      --data "@$WORK/wf-body.json" >"$WF_JSON" 2>&1; then
    WF_ID="$(grep -o '"id":[0-9]*' "$WF_JSON" | head -n1 | cut -d: -f2)"
    if [ -n "$WF_ID" ]; then
      ok "workflow created (id=$WF_ID)"
      export WEBHOOK_URL="http://localhost:5678/webhook/scan"
      export WEBHOOK_AUTH="hmac"
      export WEBHOOK_SECRET="s3cr3t"
    else
      bad "n8n did not return a workflow id"
    fi
  else
    bad "could not reach the n8n API (is the key valid?)"
  fi
else
  warn "skip n8n: set N8N_API_KEY (create owner + API key in the n8n UI)"
fi

echo "### Pump: push a real sample PDF through the real modules"
if npx tsx scripts/real-services-pump.ts >"$WORK/pump.log" 2>&1; then
  ok "pump ran"
  grep -E '^(ARTIFACT|uploadPdf|sendScanEvent|PUMF_OK)' "$WORK/pump.log" | sed 's/^/  /'
else
  bad "pump failed (see $WORK/pump.log)"
  cat "$WORK/pump.log"
fi
FILE="$(sed -n 's/^ARTIFACT=//p' "$WORK/pump.log" | head -n1 || true)"

echo "### Verify S3 (MinIO)"
if $COMPOSE run --rm --no-deps --entrypoint /bin/sh minio-init -c \
  "mc alias set minio http://minio:9000 miniotest miniotest123 >/dev/null && \
   mc stat minio/scans/test/$FILE >/dev/null"; then
  ok "object s3://scans/test/$FILE present"
else
  bad "object missing on MinIO (s3://scans/test/$FILE)"
fi

echo "### Verify Nextcloud WebDAV"
if curl -s -u admin:adminpass -X PROPFIND -H "Depth: 1" \
  "http://localhost:8081/remote.php/dav/files/admin/scan/" \
  | grep -q "$FILE"; then
  ok "file present on Nextcloud (admin/scan/$FILE)"
else
  bad "file missing on Nextcloud (admin/scan/$FILE)"
fi

echo "### Verify Paperless-ngx"
found=0
if [ -n "$PAPERLESS_TOKEN" ]; then
  for _ in $(seq 1 30); do
    if curl -s -H "Authorization: Token $PAPERLESS_TOKEN" \
      "http://localhost:8090/api/documents/?title__icontains=$FILE" \
      | grep -q '"count":1'; then
      found=1
      break
    fi
    sleep 2
  done
fi
if [ "$found" -eq 1 ]; then
  ok "document indexed in paperless-ngx"
else
  bad "document not found in paperless-ngx (waited 60s)"
fi

if [ -n "${N8N_API_KEY:-}" ] && [ -n "${WF_ID:-}" ]; then
  echo "### Verify the n8n workflow executed (webhook received the event)"
  ok2=0
  for _ in $(seq 1 20); do
    if curl -s -H "X-N8N-API-KEY: $N8N_API_KEY" \
      "http://localhost:5678/api/v1/executions?workflowId=$WF_ID" \
      | grep -q '"finished":true'; then
      ok2=1
      break
    fi
    sleep 2
  done
  if [ "$ok2" -eq 1 ]; then
    ok "n8n received the webhook event (execution finished)"
    warn "manual: enable HMAC auth on the webhook node (secret 's3cr3t', header 'x-webhook-signature') to validate n8n's signature computation"
  else
    bad "no successful n8n execution for the webhook event"
  fi
fi

if [ "${1:-}" = "--scanner" ] && [ -n "${SCANNER_IP:-}" ]; then
  echo "### Full chain with the real printer ($SCANNER_IP)"
  SCAN_DIR="$WORK/scans"
  mkdir -p "$SCAN_DIR"
  if timeout 90 node dist/index.js --address "$SCANNER_IP" single-scan \
      -d "$SCAN_DIR" --pdf -k \
      --s3-url "$S3_URL" --s3-region "$S3_REGION" --s3-bucket "$S3_BUCKET" \
      --s3-access-key-id "$S3_ACCESS_KEY_ID" --s3-secret-access-key "$S3_SECRET_ACCESS_KEY" \
      --s3-prefix "$S3_PREFIX" --s3-force-path-style \
      --nextcloud-url "$NEXTCLOUD_URL" --nextcloud-username "$NEXTCLOUD_USERNAME" \
      --nextcloud-password "$NEXTCLOUD_PASSWORD" --nextcloud-upload-folder "$NEXTCLOUD_UPLOAD_FOLDER" \
      --paperless-post-document-url "$PAPERLESS_POST_DOCUMENT_URL" --paperless-token "$PAPERLESS_TOKEN" \
      ${WEBHOOK_URL:+"--webhook-url $WEBHOOK_URL --webhook-secret s3cr3t --webhook-auth hmac"} \
      >"$WORK/scan.log" 2>&1; then
    ok "real printer single-scan ran with all targets"
  else
    bad "real printer single-scan failed (see $WORK/scan.log)"
    tail -n 40 "$WORK/scan.log"
  fi
fi

rm -rf "$WORK"
if [ "$FAIL" -ne 0 ]; then
  echo "### REAL-SERVICES TEST FAILED"
  exit 1
fi
echo "### REAL-SERVICES TEST OK"