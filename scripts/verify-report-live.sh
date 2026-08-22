#!/usr/bin/env bash
set -euo pipefail

GATEWAY_PORT="${GATEWAY_PORT:-80}"
BASE="http://localhost:${GATEWAY_PORT}"
USERNAME="${TEST_USERNAME:-mikhmon}"
PASSWORD="${TEST_PASSWORD:-1234}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

login_json=$(curl -fsS -c "$COOKIE_JAR" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${USERNAME}\",\"password\":\"${PASSWORD}\"}" \
  "$BASE/api/auth/login")

echo "$login_json" | grep -q '"success":true' || {
  echo "ERROR: BFF login failed: $(echo "$login_json" | head -c 300)" >&2
  exit 1
}

sessions_json=$(curl -fsS -b "$COOKIE_JAR" "$BASE/api/sessions")
session_id=$(python3 -c 'import json,sys; d=json.load(sys.stdin); rows=d.get("sessions") if isinstance(d,dict) else d; rows=rows or []; print(rows[0].get("id", "") if rows else "")' <<<"$sessions_json")

if [ -z "$session_id" ]; then
  echo "ERROR: no router session available for live-report smoke test" >&2
  exit 1
fi

body_file=$(mktemp)
trap 'rm -f "$COOKIE_JAR" "$body_file"' EXIT
code=$(curl -sS -o "$body_file" -w '%{http_code}' -b "$COOKIE_JAR" "$BASE/api/report/${session_id}/live")

if [ "$code" != "200" ]; then
  echo "ERROR: /api/report/${session_id}/live returned HTTP $code" >&2
  cat "$body_file" >&2
  exit 1
fi

grep -q '"today"' "$body_file" || {
  echo "ERROR: live report response missing today payload" >&2
  cat "$body_file" >&2
  exit 1
}

echo "✔ report live smoke passed for session ${session_id}"
