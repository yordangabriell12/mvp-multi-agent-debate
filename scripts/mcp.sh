#!/usr/bin/env bash
# Wrapper around mcp-call.sh that prints only the useful text.
#
# The MCP client that the assistant normally drives kept a dead session and could not
# be revived, while a fresh handshake from the shell worked every time. So the browser
# is driven through this instead: same server, same tools, one transport hop fewer.
#
# Usage: mcp.sh <tool> '<json args>'
#   Prints the tool's text content, with the SSE framing stripped.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RAW="$(bash "$HERE/mcp-call.sh" "$1" "${2:-{\}}")"

printf '%s' "$RAW" | python3 -c '
import json, sys, re

raw = sys.stdin.read()
# The transport frames each response as an SSE event: "data: {...}". Anything that is
# not a data line (id, retry, blank) carries no payload.
payload = None
for line in raw.splitlines():
    line = line.strip()
    if line.startswith("data:"):
        body = line[5:].strip()
        if not body:
            continue
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            continue

if payload is None:
    print("(tidak ada payload JSON. Mentah:)")
    print(raw[:800])
    sys.exit(1)

if "error" in payload:
    print("GALAT JSON-RPC:", json.dumps(payload["error"])[:500])
    sys.exit(1)

result = payload.get("result", {})
for block in result.get("content", []):
    if block.get("type") == "text":
        print(block.get("text", ""))
    else:
        print(json.dumps(block)[:400])
'
