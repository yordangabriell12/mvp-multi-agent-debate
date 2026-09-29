#!/usr/bin/env bash
# Calls a tool on the BrowserOS neo MCP server and prints the result.
#
# Kept in the repository so the UI checks can be re-run by anyone without
# re-deriving the handshake. The server speaks the streamable HTTP transport:
# every response is a `data:` framed event stream, so the body has to be unwrapped
# before it is JSON.
#
# Usage: mcp-call.sh <tool> '<json arguments>'
#   MCP_PORT  debugging port of the browser, default 9010

set -uo pipefail

PORT="${MCP_PORT:-9010}"
URL="http://127.0.0.1:${PORT}/mcp"
TOOL="${1:?usage: mcp-call.sh <tool> <json args>}"
ARGS="${2:-{\}}"

SESSION_FILE="/tmp/browseros-mcp-session"

# The session is established once and then reused, because each call would otherwise
# pay for a full handshake. Reuse is what breaks: the server drops a session after a
# period of inactivity, and a stale id in the session file makes every later call come
# back as a plain-text error rather than JSON. That looked like a broken application
# on the first audit of the day, twice. So a call that does not return JSON is retried
# once on a fresh session, which is the fix rather than the workaround of remembering
# to delete the session file by hand.
handshake() {
  curl -s --max-time 10 -X POST "$URL" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"vma-audit","version":"1.0"}}}' \
    -D /tmp/browseros-mcp-init-headers \
    > /dev/null

  # `head -1`: the header can appear more than once, and a session id with a
  # newline in it is not a session id. Writing it to the file verbatim produced
  # two lines and every later call was rejected as unauthenticated.
  sed -n 's/^mcp-session-id: *//p' /tmp/browseros-mcp-init-headers | tr -d '\r' | head -1 > "$SESSION_FILE"

  # The handshake has to be confirmed or the server refuses later calls.
  curl -s --max-time 5 -X POST "$URL" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "mcp-session-id: $(head -1 "$SESSION_FILE")" \
    -d '{"jsonrpc":"2.0","method":"notifications/initialized"}' > /dev/null
}

call() {
  curl -s --max-time 120 -X POST "$URL" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -H "mcp-session-id: $(head -1 "$SESSION_FILE")" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"$TOOL\",\"arguments\":$ARGS}}"
}

if [ ! -s "$SESSION_FILE" ]; then handshake; fi

OUT="$(call)"

# A dead session answers with an error sentence, not with JSON. One fresh handshake
# and one retry is enough: if the server is unreachable, retrying forever would just
# turn a clear error into a hang.
if ! printf '%s' "$OUT" | grep -q '^data: '; then
  handshake
  OUT="$(call)"
fi

printf '%s\n' "$OUT"
