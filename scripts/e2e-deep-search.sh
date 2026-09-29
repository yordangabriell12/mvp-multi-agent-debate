#!/usr/bin/env bash
# Checks the behaviour Deep Search was asked for: the toggle can be switched on
# and off freely, at any time, without disturbing the session.
#
# The important properties are checked against a real server rather than only in
# unit tests, because they are about a stored setting and a route, not about a
# pure function:
#
#   1. The setting persists per session, so switching it changes what the next
#      turn does and nothing else.
#   2. Switching it repeatedly is harmless and ends in the state it was last set
#      to, with no residue from the intermediate flips.
#   3. The search route works on its own, so an agent can search for whatever its
#      own role needs rather than a single shared query.
#
# Usage: BASE=http://127.0.0.1:3999 bash scripts/e2e-deep-search.sh

set -uo pipefail

BASE="${BASE:-http://127.0.0.1:3999}"
JAR=$(mktemp)
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

contains() {
  local label="$1" haystack="$2" needle="$3"
  case "$haystack" in
    *"$needle"*) echo "  PASS  $label"; PASS=$((PASS + 1)) ;;
    *) echo "  FAIL  $label (missing '$needle')"; echo "        in: ${haystack:0:250}"; FAIL=$((FAIL + 1)) ;;
  esac
}

code() { printf '%s\n' "$1" | tail -1; }
body() { printf '%s\n' "$1" | sed '$d'; }

api() { # method path [json]
  local method="$1" path="$2" data="${3:-}"
  if [ -n "$data" ]; then
    curl -s -w '\n%{http_code}' -X "$method" -b "$JAR" -c "$JAR" \
      -H 'Content-Type: application/json' -d "$data" "$BASE$path"
  else
    curl -s -w '\n%{http_code}' -X "$method" -b "$JAR" -c "$JAR" "$BASE$path"
  fi
}

# Puts the whole configuration, with the session's deep search flag set as asked.
set_deep_search() { # on|off
  local want="$1"
  api PUT /api/config "{\"agents\":[],\"sessions\":[{\"id\":\"s1\",\"name\":\"Test\",\"agentIds\":[],\"presetMode\":\"boardroom\",\"settings\":{\"loopSpeed\":\"normal\",\"maxRounds\":1,\"moderatorEnabled\":false,\"deepSearch\":$want,\"deepSearchMaxQueries\":2},\"status\":\"idle\",\"currentRound\":0,\"responseMode\":\"tag\",\"createdAt\":1,\"updatedAt\":1}],\"activeSessionId\":\"s1\",\"messages\":{}}"
}

read_flag() {
  api GET /api/config | sed '$d' | grep -o '"deepSearch":[a-z]*' | head -1
}

echo "== 1. Sign in =="
R=$(api POST /api/auth/login "{\"email\":\"${VMA_EMAIL:-admin@example.com}\",\"password\":\"${VMA_PASSWORD:-AdminPass12345}\"}")
check "signed in" "$(code "$R")" "200"

echo
echo "== 2. Deep Search starts off =="
R=$(set_deep_search false)
check "configuration saved" "$(code "$R")" "200"
check "the flag reads back as off" "$(read_flag)" '"deepSearch":false'

echo
echo "== 3. Switching it on takes effect and persists =="
set_deep_search true > /dev/null
check "the flag reads back as on" "$(read_flag)" '"deepSearch":true'

echo
echo "== 4. Switching it on and off repeatedly is harmless =="
# The behaviour the feature was asked for: flip it as often as you like, and the
# session ends in exactly the state you last chose, with nothing left over.
for state in false true false true false true false; do
  set_deep_search "$state" > /dev/null
done
check "after seven flips the last one holds" "$(read_flag)" '"deepSearch":false'

set_deep_search true > /dev/null
check "and again in the other direction" "$(read_flag)" '"deepSearch":true'

echo
echo "== 5. A search runs on its own, so an agent can research its own angle =="
R=$(api POST /api/deep-search '{"query":"unit economics of SaaS startups"}')
check "search succeeded" "$(code "$R")" "200"
contains "the results name their source" "$(body "$R")" '"sources"'

SEARCH_BODY=$(body "$R")
case "$SEARCH_BODY" in
  *'"results":[]'*)
    echo "  SKIP  no results came back, which this environment cannot control"
    ;;
  *)
    echo "  PASS  results came back"
    PASS=$((PASS + 1))
    ;;
esac

echo
echo "== 6. A second, different search also works =="
# Two searches in a row is the normal case with deep search on: each agent asks
# its own question, so the route is called several times per turn.
R=$(api POST /api/deep-search '{"query":"GDPR data retention requirements"}')
check "the second search also succeeded" "$(code "$R")" "200"

echo
echo "== 7. An empty query is refused =="
R=$(api POST /api/deep-search '{"query":"   "}')
check "refused" "$(code "$R")" "400"

echo
echo "== 8. An absurdly long query is refused =="
LONG=$(printf 'x%.0s' $(seq 1 400))
R=$(api POST /api/deep-search "{\"query\":\"$LONG\"}")
check "refused" "$(code "$R")" "400"

echo
echo "== 9. Signed-out access is refused =="
R=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"query":"anything"}' "$BASE/api/deep-search")
check "401 without a session" "$R" "401"

echo
echo "============================================"
echo "  PASS: $PASS    FAIL: $FAIL"
echo "============================================"

rm -f "$JAR"
[ "$FAIL" -eq 0 ]
