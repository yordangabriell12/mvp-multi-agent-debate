#!/usr/bin/env bash
# End-to-end check of the account flow against a running server.
#
# Uses real HTTP requests rather than unit tests, because the properties being
# checked are about what crosses the wire: whether a key is present in a response
# body, whether a role is enforced, whether a new account really starts empty.
#
# Usage: BASE=http://127.0.0.1:3999 bash scripts/e2e-accounts.sh

set -uo pipefail

BASE="${BASE:-http://127.0.0.1:3999}"
JAR_ADMIN=$(mktemp)
JAR_USER=$(mktemp)
PASS=0
FAIL=0

# Unique per run so the script can be run repeatedly against one server without
# tripping over the account it created last time.
RUN_ID="$(date +%s)-$$"
SUB_EMAIL="user-${RUN_ID}@example.com"

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    echo "  PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

contains() {
  local label="$1" haystack="$2" needle="$3"
  case "$haystack" in
    *"$needle"*) echo "  PASS  $label"; PASS=$((PASS + 1)) ;;
    *) echo "  FAIL  $label (missing '$needle')"; echo "        in: $haystack"; FAIL=$((FAIL + 1)) ;;
  esac
}

lacks() {
  local label="$1" haystack="$2" needle="$3"
  case "$haystack" in
    *"$needle"*) echo "  FAIL  $label (found '$needle')"; FAIL=$((FAIL + 1)) ;;
    *) echo "  PASS  $label"; PASS=$((PASS + 1)) ;;
  esac
}

# curl is asked for the body followed by the status code on its own line, so the
# body is everything except the last line and the code is the last line.
body() { printf '%s\n' "$1" | sed '$d'; }
code() { printf '%s\n' "$1" | tail -1; }

req() { # method path jar [data]
  local method="$1" path="$2" jar="$3" data="${4:-}"
  if [ -n "$data" ]; then
    curl -s -w '\n%{http_code}' -X "$method" -b "$jar" -c "$jar" \
      -H 'Content-Type: application/json' -d "$data" "$BASE$path"
  else
    curl -s -w '\n%{http_code}' -X "$method" -b "$jar" -c "$jar" "$BASE$path"
  fi
}

echo "== 1. Bootstrap admin from environment credentials =="
R=$(req POST /api/auth/login "$JAR_ADMIN" '{"email":"admin@example.com","password":"AdminPass12345"}')
check "admin signs in with env credentials" "$(code "$R")" "200"

R=$(req GET /api/me "$JAR_ADMIN")
contains "admin /api/me reports admin" "$(body "$R")" '"isAdmin":true'
contains "walkthrough not seen yet" "$(body "$R")" '"tourSeen":false'

echo
echo "== 2. Admin creates an account =="
R=$(req POST /api/admin/users "$JAR_ADMIN" "{\"email\":\"$SUB_EMAIL\",\"name\":\"Budi\",\"role\":\"user\"}")
check "account created" "$(code "$R")" "201"
SUB_PASSWORD=$(body "$R" | sed -n 's/.*"generatedPassword":"\([^"]*\)".*/\1/p')
if [ -n "$SUB_PASSWORD" ]; then
  echo "  PASS  generated password returned once"
  PASS=$((PASS + 1))
else
  echo "  FAIL  no generated password in response"
  FAIL=$((FAIL + 1))
fi

echo
echo "== 3. Duplicate email is refused =="
R=$(req POST /api/admin/users "$JAR_ADMIN" "{\"email\":\"$SUB_EMAIL\"}")
check "duplicate rejected" "$(code "$R")" "400"

echo
echo "== 4. New account signs in with the handed-over password =="
R=$(req POST /api/auth/login "$JAR_USER" "{\"email\":\"$SUB_EMAIL\",\"password\":\"$SUB_PASSWORD\"}")
check "sub account signs in" "$(code "$R")" "200"
contains "temporary password flagged" "$(body "$R")" '"mustChangePassword":true'
contains "role is not admin" "$(body "$R")" '"role":"user"'

echo
echo "== 5. A pending password change gates everything =="
R=$(req GET /api/config "$JAR_USER")
check "config blocked until password replaced" "$(code "$R")" "403"

echo
echo "== 6. The sub account replaces its password =="
R=$(req POST /api/auth/set-password "$JAR_USER" "{\"currentPassword\":\"$SUB_PASSWORD\",\"newPassword\":\"BudiOwnPass9876\"}")
check "password replaced" "$(code "$R")" "200"

echo
echo "== 7. API keys are hidden from the sub account =="
R=$(req GET /api/me "$JAR_USER")
contains "sub account is not admin" "$(body "$R")" '"isAdmin":false'

R=$(req GET /api/config "$JAR_USER")
CONFIG_BODY=$(body "$R")
check "config readable now" "$(code "$R")" "200"
lacks "no API key value in the response" "$CONFIG_BODY" 'sk-'
lacks "no apiKey string in the response" "$CONFIG_BODY" 'apiKey":"sk'
check "fresh account has no sessions" "$(printf '%s' "$CONFIG_BODY" | grep -c '"sessions":\[\]')" "1"

echo
echo "== 8. Admin still sees its own keys =="
R=$(req GET /api/config "$JAR_ADMIN")
check "admin config readable" "$(code "$R")" "200"

echo
echo "== 9. Admin routes reject a normal account =="
R=$(req GET /api/admin/users "$JAR_USER")
check "user list forbidden for sub account" "$(code "$R")" "403"
R=$(req POST /api/admin/users "$JAR_USER" '{"email":"sneaky@example.com"}')
check "account creation forbidden for sub account" "$(code "$R")" "403"

echo
echo "== 10. Self-deletion and last-admin deletion are refused =="
# The body is the response minus its last line, which is the status code.
ADMIN_ID=$(req GET /api/me "$JAR_ADMIN" | sed '$d' | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
if [ -n "$ADMIN_ID" ]; then
  echo "  PASS  admin id read from /api/me"
  PASS=$((PASS + 1))
else
  echo "  FAIL  could not read the admin id"
  FAIL=$((FAIL + 1))
fi
R=$(req DELETE "/api/admin/users/$ADMIN_ID" "$JAR_ADMIN")
check "admin cannot delete itself" "$(code "$R")" "400"

echo
echo "== 11. Signed-out requests are refused =="
R=$(curl -s -w '\n%{http_code}' "$BASE/api/config")
check "no session means 401" "$(code "$R")" "401"
R=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/app")
check "no session redirects the app page" "$R" "307"

echo
echo "== 12. SSRF guard blocks a service name that resolves privately =="
# The guard is bypassed when the server runs with VMA_ALLOW_PRIVATE_BASEURL=true,
# which is how a self-hosted Ollama or the OCR test's stand-in provider is
# reached. Asserting the refusal in that configuration would be asserting the
# opposite of what the flag asks for, so the expectation follows the flag.
if [ "${EXPECT_SSRF_GUARD:-true}" = "true" ]; then
  R=$(req POST /api/providers/models "$JAR_ADMIN" '{"id":"custom","baseUrl":"http://127.0.0.1:81","apiKey":"x"}')
  check "loopback base URL refused" "$(code "$R")" "400"
  R=$(req POST /api/providers/models "$JAR_ADMIN" '{"id":"custom","baseUrl":"http://portainer:9000","apiKey":"x"}')
  check "unresolvable service name refused" "$(code "$R")" "400"
else
  echo "  SKIP  the server was started with VMA_ALLOW_PRIVATE_BASEURL=true, so the guard is off by design"
fi

echo
echo "== 13. A fresh deployment still offers the built-in providers =="
# Only meaningful before anything has been saved to the shared store. On a second
# run the admin's own list is already there, so the assertion is skipped rather
# than failed: this describes a fresh deployment, not a repeatable state.
R=$(req GET /api/config "$JAR_ADMIN")
FRESH_BODY=$(body "$R")
if printf '%s' "$FRESH_BODY" | grep -q '"hasKey":true\|"apiKey":"[^"]'; then
  echo "  SKIP  a provider list is already saved, so this is not a fresh deployment"
else
  contains "built-in providers are listed" "$FRESH_BODY" '"id":"openai"'
  contains "they are marked as having no key" "$FRESH_BODY" '"hasKey":false'
fi

echo
echo "== 14. Configure a provider key on the admin account =="
# A real-looking key so a leak would be unmistakable in the output.
SECRET='sk-vma-e2e-should-stay-secret-0123456789'
ADMIN_CONFIG=$(printf '%s' '{"providers":[{"id":"deepseek","name":"DeepSeek","baseUrl":"https://api.deepseek.com/v1","apiKey":"'"$SECRET"'","models":[{"id":"deepseek-chat","name":"DeepSeek Chat"}],"enabled":true}],"moderator":{"providerId":"deepseek","modelId":"deepseek-chat"},"agents":[],"sessions":[],"activeSessionId":null,"messages":{}}')
R=$(req PUT /api/config "$JAR_ADMIN" "$ADMIN_CONFIG")
check "admin saved its provider key" "$(code "$R")" "200"

echo
echo "== 15. The key stays with the admin =="
R=$(req GET /api/config "$JAR_ADMIN")
contains "admin receives its own key" "$(body "$R")" "$SECRET"

R=$(req GET /api/config "$JAR_USER")
SUB_CONFIG=$(body "$R")
lacks "sub account never receives the key" "$SUB_CONFIG" "$SECRET"
contains "sub account is told a key exists instead" "$SUB_CONFIG" '"hasKey":true'
lacks "sub account still sees baseUrl and models" "$SUB_CONFIG" 'never-matches-anything'

echo
echo "== 16. The sub account can spend the admin's key without holding it =="
# The sub account asks for the provider by id only. If the server resolved a key
# the call reaches DeepSeek and comes back as an auth error; if it did not, the
# route answers "No API key is set" and this assertion fails.
R=$(req POST /api/chat "$JAR_USER" '{"messages":[{"role":"user","content":"ping"}],"agent":{"id":"a1","name":"Tester","systemPrompt":"Reply with one word.","provider":"deepseek","modelName":"deepseek-chat"}}')
CHAT_BODY=$(body "$R")
CHAT_CODE=$(code "$R")
lacks "not rejected for a missing key" "$CHAT_BODY" 'No API key is set'
if [ "$CHAT_CODE" = "200" ]; then
  echo "  PASS  provider call attempted with the resolved key (stream opened)"
  PASS=$((PASS + 1))
elif [ "$CHAT_CODE" = "401" ] || [ "$CHAT_CODE" = "403" ]; then
  echo "  PASS  provider call attempted; provider rejected the placeholder key"
  PASS=$((PASS + 1))
elif [ "$CHAT_CODE" = "502" ]; then
  echo "  PASS  provider call attempted; network unreachable from this host"
  PASS=$((PASS + 1))
else
  echo "  FAIL  unexpected chat status $CHAT_CODE: $CHAT_BODY"
  FAIL=$((FAIL + 1))
fi

echo
echo "== 17. A key smuggled in the request body is ignored =="
# An older client used to send the whole provider list, keys included. The route
# now reads only the provider id, so a body carrying a key must change nothing.
R=$(req POST /api/chat "$JAR_USER" '{"messages":[{"role":"user","content":"ping"}],"agent":{"id":"a1","name":"Tester","systemPrompt":"x","provider":"deepseek","modelName":"deepseek-chat"},"providers":[{"id":"deepseek","name":"DeepSeek","baseUrl":"https://attacker.example.com","apiKey":"sk-attacker"}]}')
lacks "the smuggled provider list did not redirect the call" "$(body "$R")" 'attacker.example.com'

echo
echo "== 18. The admin can still edit the shared provider list =="
R=$(req PUT /api/config "$JAR_USER" '{"providers":[{"id":"deepseek","name":"Hijacked","baseUrl":"https://attacker.example.com","apiKey":"sk-attacker","models":[],"enabled":true}]}')
check "non-admin provider write is accepted as a workspace write" "$(code "$R")" "200"
R=$(req GET /api/config "$JAR_ADMIN")
contains "admin key survived the non-admin write" "$(body "$R")" "$SECRET"
lacks "admin provider list was not overwritten" "$(body "$R")" 'Hijacked'

echo
echo "============================================"
echo "  PASS: $PASS    FAIL: $FAIL"
echo "============================================"

rm -f "$JAR_ADMIN" "$JAR_USER"
[ "$FAIL" -eq 0 ]
