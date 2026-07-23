#!/usr/bin/env bash
set -euo pipefail

PORT=6124
SERVER_PID=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOC_TYPE="${1:-all}"

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    echo ""
    echo "--- Stopping server (PID $SERVER_PID) ---"
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "=== Building server (bazel) ==="
cd "$SCRIPT_DIR"
bazel build //apps/server:dev 2>&1 | tail -5

echo "=== Starting server on port $PORT ==="
export PORT
bazel run //apps/server:dev &
SERVER_PID=$!

echo "=== Waiting for server to be ready ==="
for i in $(seq 1 60); do
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT/auth/login" -X POST -H 'Content-Type: application/json' -d '{}' 2>/dev/null | grep -qE '^[0-9]{3}$'; then
    echo "Server is ready (took ${i}s)"
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "ERROR: Server process died"
    exit 1
  fi
  sleep 1
done

if ! echo "" | nc -w1 localhost $PORT >/dev/null 2>&1; then
  echo "ERROR: Server did not start within 60s"
  exit 1
fi

# Wait a moment for NestJS to finish route mapping
sleep 2

echo "=== Logging in as admin ==="
LOGIN_RESP=$(curl -s "http://localhost:$PORT/auth/login" \
  -H 'Content-Type: application/json' \
  --data-raw '{"username":"admin","pin":"1234"}')

echo "Login response: $LOGIN_RESP"

TOKEN=$(echo "$LOGIN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])" 2>/dev/null || echo "")

if [[ -z "$TOKEN" ]]; then
  echo "ERROR: Failed to get JWT token. Login response:"
  echo "$LOGIN_RESP"
  exit 1
fi

echo "Token: ${TOKEN:0:30}..."

run_check() {
  local doc_type="$1"
  echo ""
  echo "=== Compliance check: $doc_type ==="
  local resp
  resp=$(curl -s "http://localhost:$PORT/zatca/onboard/compliance-check" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    --data-raw "{\"documentType\":\"$doc_type\",\"debug\":true}")
  echo "$resp" | python3 -m json.tool 2>/dev/null || echo "$resp"

  # Extract and save signed XML for debugging
  local xml_file="$SCRIPT_DIR/debug-${doc_type}-signed.xml"
  echo "$resp" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if 'debug' in d and 'signedXml' in d['debug']:
        with open('$xml_file', 'w') as f:
            f.write(d['debug']['signedXml'])
        print(f'Saved signed XML to $xml_file')
        print(f'Invoice hash: {d[\"debug\"][\"invoiceHash\"][:40]}...')
except: pass
" 2>/dev/null || true
}

if [[ "$DOC_TYPE" == "all" ]]; then
  for t in invoice credit_note debit_note; do
    run_check "$t"
  done
else
  run_check "$DOC_TYPE"
fi

echo ""
echo "=== Done ==="
