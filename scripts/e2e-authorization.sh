#!/usr/bin/env bash
# Checks that a normal account cannot reach the places only the super admin may.
#
# This exists because a review found the second authorization layer broken: every
# admin route tested `!check.user`, but `requireAdmin()` returns a user for a
# non-admin too, so the role check never fired. The proxy still blocked `/api/admin/*`,
# which hid the fault, but `/api/providers/models` is not under that prefix and
# could reach the server's own network. The test drives a real non-admin session
# against those routes rather than reading the code.
#
# Usage: BASE=http://127.0.0.1:3999 bash scripts/e2e-authorization.sh

set -uo pipefail

BASE="${BASE:-http://127.0.0.1:3999}"
JAR_ADMIN=$(mktemp)
JAR_USER=$(mktemp)
PASS=0
FAIL=0

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS  $label"; PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (expected '$expected', got '$actual')"; FAIL=$((FAIL + 1))
  fi
}

code() { printf '%s\n' "$1" | tail -1; }
body() { printf '%s\n' "$1" | sed '$d'; }

api() { # method path jar [json]
  local method="$1" path="$2" jar="$3" data="${4:-}"
  if [ -n "$data" ]; then
    curl -s -w '\n%{http_code}' -X "$method" -b "$jar" -c "$jar" \
      -H 'Content-Type: application/json' -d "$data" "$BASE$path"
  else
    curl -s -w '\n%{http_code}' -X "$method" -b "$jar" -c "$jar" "$BASE$path"
  fi
}

R=$(api POST /api/auth/login "$JAR_ADMIN" "{\"email\":\"${VMA_EMAIL:-admin@example.com}\",\"password\":\"${VMA_PASSWORD:-AdminPass12345}\"}")
check "super admin signed in" "$(code "$R")" "200"

SUB_EMAIL="authz-$(date +%s)-$$@example.com"
CREATE=$(api POST /api/admin/users "$JAR_ADMIN" "{\"email\":\"$SUB_EMAIL\",\"name\":\"Authz Tester\",\"role\":\"user\"}")
SUB_PASSWORD=$(body "$CREATE" | sed -n 's/.*"generatedPassword":"\([^"]*\)".*/\1/p')
if [ -z "$SUB_PASSWORD" ]; then
  echo "  FAIL  could not create the test account"; exit 1
fi

curl -s -o /dev/null -c "$JAR_USER" -X POST -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SUB_EMAIL\",\"password\":\"$SUB_PASSWORD\"}" "$BASE/api/auth/login"
# A temporary password keeps the API closed until it is replaced, so that has to
# happen first or every later assertion would pass for the wrong reason.
curl -s -o /dev/null -b "$JAR_USER" -c "$JAR_USER" -X POST -H 'Content-Type: application/json' \
  -d "{\"currentPassword\":\"$SUB_PASSWORD\",\"newPassword\":\"SubOwnPass9876\"}" "$BASE/api/auth/set-password"

echo "== A normal account must not reach the admin surface =="

R=$(api GET /api/admin/users "$JAR_USER")
check "cannot list accounts" "$(code "$R")" "403"

R=$(api POST /api/admin/users "$JAR_USER" '{"email":"sneaky@example.com"}')
check "cannot create accounts" "$(code "$R")" "403"

SELF=$(body "$(api GET /api/me "$JAR_USER")" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
R=$(api DELETE "/api/admin/users/$SELF" "$JAR_USER")
check "cannot delete accounts" "$(code "$R")" "403"

R=$(api PATCH "/api/admin/users/$SELF" "$JAR_USER" '{"action":"set-role","role":"admin"}')
check "cannot promote itself to admin" "$(code "$R")" "403"

R=$(api GET /api/ocr/settings "$JAR_USER")
check "may read OCR settings, to know if the feature exists" "$(code "$R")" "200"

R=$(api PUT /api/ocr/settings "$JAR_USER" '{"enabled":false}')
check "cannot change OCR settings" "$(code "$R")" "403"

echo
echo "== The provider probe must not become an SSRF door =="
# This route is not under /api/admin, so the proxy does not cover it. The role
# check inside the route is the only thing standing between a normal account and
# the server's own network.
R=$(api POST /api/providers/models "$JAR_USER" '{"id":"custom","baseUrl":"http://127.0.0.1:81","apiKey":"x"}')
check "cannot make the server fetch a loopback URL" "$(code "$R")" "403"
case "$(body "$R")" in
  *"Resolver"*|*"127.0.0.1"*|*"private"*)
    echo "  FAIL  the refusal leaked whether the host is reachable"; FAIL=$((FAIL + 1)) ;;
  *) echo "  PASS  the refusal says nothing about the target"; PASS=$((PASS + 1)) ;;
esac

R=$(api POST /api/providers/models "$JAR_USER" '{"id":"custom","baseUrl":"http://169.254.169.254/latest/meta-data","apiKey":"x"}')
check "nor a cloud metadata address" "$(code "$R")" "403"

echo
echo "== The super admin keeps full access =="
R=$(api GET /api/admin/users "$JAR_ADMIN")
check "can still list accounts" "$(code "$R")" "200"

R=$(api POST /api/providers/models "$JAR_ADMIN" '{"id":"custom","baseUrl":"http://127.0.0.1:81","apiKey":"x"}')
# With the guard off, the request proceeds and fails on the connection instead.
if [ "${EXPECT_SSRF_GUARD:-true}" = "true" ]; then
  check "the guard still refuses the private URL for the super admin too" "$(code "$R")" "400"
else
  check "the guard is off by configuration, so the request proceeds" "$(code "$R")" "502"
fi

echo
echo "============================================"
echo "  PASS: $PASS    FAIL: $FAIL"
echo "============================================"

rm -f "$JAR_ADMIN" "$JAR_USER"
[ "$FAIL" -eq 0 ]
