#!/usr/bin/env bash
# Reaches every API route and reports what it answers.
#
# The point is not to check happy paths that other scripts already cover. It is to
# find routes that are unreachable, that answer 500 on a plain request, or that
# accept a shape they should refuse. A route nobody can call is a feature that
# does not exist, and that is worth catching automatically rather than by hand.
#
# Usage: BASE=http://127.0.0.1:3999 bash scripts/e2e-route-audit.sh

set -uo pipefail

BASE="${BASE:-http://127.0.0.1:3999}"
JAR=$(mktemp)
ANON=$(mktemp)
PASS=0
FAIL=0
NOTE=0

# Records a route that answered as expected.
ok() {
  echo "  PASS  $1"; PASS=$((PASS + 1))
}

# Records a route that did not.
bad() {
  echo "  FAIL  $1"; echo "        $2"; FAIL=$((FAIL + 1))
}

# Records something worth knowing that is not a failure.
note() {
  echo "  NOTE  $1"; NOTE=$((NOTE + 1))
}

# Calls a route and returns "status code" on stdout, body in $BODY_FILE.
call() { # method path jar [json]
  local method="$1" path="$2" jar="$3" data="${4:-}"
  if [ -n "$data" ]; then
    curl -s -o "$BODY_FILE" -w '%{http_code}' -X "$method" -b "$jar" -c "$jar" \
      -H 'Content-Type: application/json' -d "$data" "$BASE$path"
  else
    curl -s -o "$BODY_FILE" -w '%{http_code}' -X "$method" -b "$jar" -c "$jar" "$BASE$path"
  fi
}

BODY_FILE=$(mktemp)
body() { cat "$BODY_FILE"; }

# Checks a route answers one of the acceptable codes, and never 500.
expect() { # label path code... 
  local label="$1" code="$2"; shift 2
  local acceptable=("$@")

  if [ "$code" = "500" ]; then
    bad "$label" "answered 500, which means an unhandled error"
    return
  fi
  for wanted in "${acceptable[@]}"; do
    if [ "$code" = "$wanted" ]; then
      ok "$label (HTTP $code)"
      return
    fi
  done
  bad "$label" "expected one of ${acceptable[*]}, got $code. Body: $(head -c 200 "$BODY_FILE")"
}

echo "== Sign in =="
CODE=$(call POST /api/auth/login "$JAR" "{\"email\":\"${VMA_EMAIL:-admin@example.com}\",\"password\":\"${VMA_PASSWORD:-AdminPass12345}\"}")
expect "POST /api/auth/login" "$CODE" 200

echo
echo "== Every page loads =="
for page in / /login /app /app/admin/users /change-password; do
  CODE=$(curl -s -o "$BODY_FILE" -w '%{http_code}' -b "$JAR" "$BASE$page")
  expect "GET $page" "$CODE" 200 307
done

echo
echo "== Every API route answers =="
CODE=$(call GET /api/me "$JAR");            expect "GET  /api/me" "$CODE" 200
CODE=$(call GET /api/config "$JAR");        expect "GET  /api/config" "$CODE" 200
CODE=$(call GET /api/admin/users "$JAR");   expect "GET  /api/admin/users" "$CODE" 200
CODE=$(call GET /api/ocr/settings "$JAR");  expect "GET  /api/ocr/settings" "$CODE" 200
CODE=$(call POST /api/deep-search "$JAR" '{"query":"test"}'); expect "POST /api/deep-search" "$CODE" 200
CODE=$(call POST /api/search "$JAR" '{"query":"test"}');      expect "POST /api/search" "$CODE" 200

echo
echo "== Routes reject what they should =="
CODE=$(call PATCH /api/config "$JAR" '{}');                 expect "PATCH /api/config is not allowed" "$CODE" 405
CODE=$(call GET /api/chat "$JAR");                          expect "GET  /api/chat is not allowed" "$CODE" 405
CODE=$(call POST /api/ocr "$JAR" '{}');                     expect "POST /api/ocr without a file" "$CODE" 400 415
CODE=$(call POST /api/deep-search "$JAR" '{"query":""}');   expect "POST /api/deep-search with no query" "$CODE" 400
CODE=$(call POST /api/admin/users "$JAR" '{"email":"nope"}'); expect "POST /api/admin/users with a bad email" "$CODE" 400

echo
echo "== Routes do not leak keys to a non-admin =="
SUB="audit-$(date +%s)-$$@example.com"
CREATE=$(call POST /api/admin/users "$JAR" "{\"email\":\"$SUB\",\"name\":\"Audit\",\"role\":\"user\"}")
SUB_PASSWORD=$(body | sed -n 's/.*"generatedPassword":"\([^"]*\)".*/\1/p')
if [ -z "$SUB_PASSWORD" ]; then
  note "could not create a test account, skipping the non-admin checks"
else
  curl -s -o /dev/null -c "$ANON" -X POST -H 'Content-Type: application/json' \
    -d "{\"email\":\"$SUB\",\"password\":\"$SUB_PASSWORD\"}" "$BASE/api/auth/login"
  curl -s -o /dev/null -b "$ANON" -c "$ANON" -X POST -H 'Content-Type: application/json' \
    -d "{\"currentPassword\":\"$SUB_PASSWORD\",\"newPassword\":\"AuditOwnPass9876\"}" \
    "$BASE/api/auth/set-password"

  CODE=$(call GET /api/config "$ANON")
  expect "GET /api/config as a non-admin" "$CODE" 200
  if grep -q '"apiKey":"[^"]' "$BODY_FILE"; then
    bad "a non-admin config must not contain a key" "$(head -c 200 "$BODY_FILE")"
  else
    ok "a non-admin config contains no API key"
  fi
fi

echo
echo "== Signed out, nothing but the login page is reachable =="
for route in /api/config /api/me /api/admin/users /api/ocr /api/ocr/settings /api/deep-search /api/chat /api/improve /api/providers/models; do
  CODE=$(curl -s -o "$BODY_FILE" -w '%{http_code}' -X POST "$BASE$route")
  expect "signed out: $route" "$CODE" 401 403 405
done
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/app")
expect "signed out: /app" "$CODE" 307

echo
echo "============================================"
echo "  PASS: $PASS    FAIL: $FAIL    NOTE: $NOTE"
echo "============================================"

rm -f "$BODY_FILE" "$JAR" "$ANON"
[ "$FAIL" -eq 0 ]
