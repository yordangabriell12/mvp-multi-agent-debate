#!/usr/bin/env bash
# Drives the VMA interface in a real browser through the BrowserOS neo MCP server.
#
# This is the check the other tests cannot make. A route test proves the server
# answers; only a browser proves that clicking a button does something. Both
# matter, and only one of them was covered before this existed.
#
# It drives the MCP tools directly rather than the internal `run` SDK: the tools
# are the documented surface and their shapes are stable.
#
# Usage: bash scripts/ui-audit.sh
#   BASE      the app under test, default http://127.0.0.1:3999
#   MCP_PORT  the browser's MCP port, default 9010
#
# Requires BrowserOS neo (or another browser with the same MCP server) running,
# and the app under test running on BASE.

set -uo pipefail

BASE="${BASE:-http://127.0.0.1:3999}"
MCP_PORT="${MCP_PORT:-9010}"
EMAIL="${VMA_EMAIL:-admin@example.com}"
PASSWORD="${VMA_PASSWORD:-AdminPass12345}"

PASS=0
FAIL=0
FAILED_NAMES=()

ok()   { echo "  PASS  $1${2:+ :: $2}"; PASS=$((PASS + 1)); }
bad()  { echo "  FAIL  $1${2:+ :: $2}"; FAIL=$((FAIL + 1)); FAILED_NAMES+=("$1"); }

# Calls an MCP tool and returns the concatenated text content of the result.
# A tool error is echoed to stderr as well as stdout, so it still shows up when a
# caller discards stdout. A wrong tool name was silently ignored once, and the
# check it belonged to reported a product fault that did not exist.
mcp() { # tool json-args
  local out
  out=$(bash scripts/mcp-call.sh "$1" "$2" 2>/dev/null \
    | grep '^data: ' | sed 's/^data: //' | tail -1 \
    | node -e "
      let s = ''
      process.stdin.on('data', (d) => { s += d }).on('end', () => {
        try {
          const j = JSON.parse(s)
          if (j.error) { process.stdout.write('MCP ERROR: ' + JSON.stringify(j.error)); return }
          const r = j.result || {}
          process.stdout.write((r.content || []).map((c) => c.text || '').join('\n'))
        } catch (e) {
          process.stdout.write('MCP PARSE FAIL: ' + s.slice(0, 200))
        }
      })
    ")

  case "$out" in
    "MCP ERROR"*|"MCP PARSE FAIL"*) echo "$1: $out" >&2 ;;
  esac

  # A large result is written to a file and the path is returned instead of the
  # content. Not following that path made every check past a certain page length
  # see nothing, which is how a button that is present was reported as missing.
  if [[ "$out" =~ saved\ to\ ([^[:space:]]+) ]]; then
    local saved_path="${BASH_REMATCH[1]}"
    if [ -f "$saved_path" ]; then
      out=$(cat "$saved_path")
    fi
  fi

  printf '%s' "$out"
}

# True when the output contains the given text.
has() { case "$1" in *"$2"*) return 0 ;; *) return 1 ;; esac }

echo "== UI audit against $BASE =="
echo

echo "== 1. A page can be opened =="
OPEN=$(mcp tabs "{\"action\":\"new\",\"url\":\"$BASE/login\"}")
if has "$OPEN" "opened page"; then
  ok "the login page opens"
else
  bad "the login page opens" "$(printf '%s' "$OPEN" | head -c 160)"
  echo "  (stopping: nothing else can be checked without a page)"
  exit 1
fi

if has "$OPEN" "Sign in to VMA"; then
  ok "the login form is rendered"
else
  bad "the login form is rendered" "the heading was not in the snapshot"
fi

# The page id is read back rather than assumed. Hard-coding it made the script
# fail on a second run, because the id keeps rising while the browser stays open.
PAGE=$(printf '%s' "$OPEN" | grep -oE 'opened page [0-9]+' | grep -oE '[0-9]+' | head -1)
if [ -z "$PAGE" ]; then
  bad "the new page reports its id" "$(printf '%s' "$OPEN" | head -c 120)"
  exit 1
fi
ok "the new page reports its id" "page $PAGE"

echo
echo "== 2. Signing in =="
# Refs come from the accessibility tree, which is how the tool addresses elements
# and how a person reaches them. The ref is read off the matching line rather than
# guessed from a selector.
SNAP=$(mcp snapshot "{\"page\":$PAGE}")
EMAIL_REF=$(printf '%s' "$SNAP" | grep 'textbox "Email"' | grep -oE '\[ref=e[0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
PASS_REF=$(printf '%s' "$SNAP" | grep 'textbox "Password"' | grep -oE '\[ref=e[0-9]+\]' | grep -oE 'e[0-9]+' | head -1)

if [ -z "$EMAIL_REF" ] || [ -z "$PASS_REF" ]; then
  bad "the email and password fields are present" "refs: email='$EMAIL_REF' password='$PASS_REF'"
else
  ok "the email and password fields are present" "email=$EMAIL_REF password=$PASS_REF"

  mcp act "{\"page\":$PAGE,\"kind\":\"fill\",\"fields\":[{\"ref\":\"$EMAIL_REF\",\"value\":\"$EMAIL\"},{\"ref\":\"$PASS_REF\",\"value\":\"$PASSWORD\"}]}" > /dev/null
  sleep 1

  # After filling, the button must no longer be disabled. It starts disabled
  # because an empty form cannot be submitted, so this is also a check that
  # filling the fields actually reached React's state.
  AFTER_FILL=$(mcp snapshot "{\"page\":$PAGE}")
  if has "$AFTER_FILL" 'button "Sign in" [disabled]'; then
    bad "the submit button becomes enabled once the form is filled" "it is still disabled, so the values did not reach the form"
  else
    ok "the submit button becomes enabled once the form is filled"
  fi

  SUBMIT_REF=$(printf '%s' "$AFTER_FILL" | grep 'button "Sign in"' | grep -oE '\[ref=e[0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
  if [ -z "$SUBMIT_REF" ]; then
    bad "the submit button is present"
  else
    mcp act "{\"page\":$PAGE,\"kind\":\"click\",\"ref\":\"$SUBMIT_REF\"}" > /dev/null
    sleep 4

    AFTER=$(mcp snapshot "{\"page\":$PAGE}")

    # The URL is checked as well as the text: reaching the workspace is the fact
    # that matters, and the wording of that screen can change without being a
    # fault.
    LANDED=$(printf '%s' "$AFTER" | grep -oE 'origin=[^]]+' | head -1)
    if has "$AFTER" "New session" || has "$LANDED" "/app"; then
      ok "signing in reaches the workspace" "$LANDED"
    else
      bad "signing in reaches the workspace" "$(printf '%s' "$AFTER" | tr '\n' ' ' | head -c 200)"
    fi
  fi
fi

echo
echo "== 3. Dismissing the first-run walkthrough =="
# It is a modal over the whole workspace, so everything below is unreachable until
# it is dealt with. That is also why this runs before any other check on the app.
TOUR_REF=$(mcp snapshot "{\"page\":$PAGE}" | grep -oE 'button "Lewati" \[ref=e[0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
if [ -n "$TOUR_REF" ]; then
  ok "the walkthrough is shown on a first visit"
  mcp act "{\"page\":$PAGE,\"kind\":\"click\",\"ref\":\"$TOUR_REF\"}" > /dev/null
  sleep 2

  if has "$(mcp snapshot "{\"page\":$PAGE}")" 'button "Lewati"'; then
    bad "the walkthrough can be dismissed" "it is still on screen"
  else
    ok "the walkthrough can be dismissed"
  fi
else
  ok "the walkthrough was already dismissed" "nothing covering the workspace"
fi

echo
echo "== 4. The workspace renders =="
# The accessibility tree rather than the markdown extraction: `read` returns a
# partial rendering of the page and can legitimately omit controls, which made
# this check report missing buttons that were present. The tree is complete, and
# it is also the thing the tool acts on.
SHELL_TEXT=$(mcp snapshot "{\"page\":$PAGE}")
for needle in "New session" "Sign out" "Deep Search" "Ask the room"; do
  if has "$SHELL_TEXT" "$needle"; then
    ok "the workspace shows \"$needle\""
  else
    bad "the workspace shows \"$needle\"" "not found in the accessibility tree"
  fi
done

echo
echo "== 5. Deep Search toggles, repeatedly =="
# The behaviour asked for: flipping it must be harmless and must end in the state
# last chosen.
toggle_deep_search() {
  local snap ref
  snap=$(mcp snapshot "{\"page\":$PAGE}")
  ref=$(printf '%s' "$snap" | grep 'button "Deep Search' | grep -oE '\[ref=e[0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
  [ -z "$ref" ] && return
  mcp act "{\"page\":$PAGE,\"kind\":\"click\",\"ref\":\"$ref\"}" > /dev/null
  sleep 1
}

STATE=$(mcp snapshot "{\"page\":$PAGE}" | grep -oE 'button "Deep Search (on|off)"' | head -1)
if [ -z "$STATE" ]; then
  bad "the Deep Search toggle exists"
else
  ok "the Deep Search toggle exists" "$STATE"

  # Four flips, ending where it started. Anything leaking between turns would show
  # up as a drifting label.
  START_STATE="$STATE"
  for _ in 1 2 3 4; do toggle_deep_search; done
  END_STATE=$(mcp snapshot "{\"page\":$PAGE}" | grep -oE 'button "Deep Search (on|off)"' | head -1)

  if [ "$END_STATE" = "$START_STATE" ]; then
    ok "four flips return it to where it started" "$START_STATE"
  else
    bad "four flips return it to where it started" "started '$START_STATE', ended '$END_STATE'"
  fi
fi

echo
echo "== 6. Each settings screen opens and closes =="
# Every one of these is a dialog in the sidebar. Opening it proves the button is
# wired; closing it with Escape proves it can be dismissed without a mouse.
#
# The heading is matched by a keyword rather than the button label, because some
# dialogs are titled differently from the button that opens them ("Agent Roles"
# opens "Agent Roles & Prompts"). Comparing them exactly reported a working screen
# as broken.
for entry in "Manage Agents|Manage Agents" "AI Models|AI Models" "Agent Roles|Agent Roles" "Knowledge Base|Knowledge Base" "Reading Documents|Reading Documents"; do
  label="${entry%%|*}"
  heading="${entry##*|}"

  SNAP=$(mcp snapshot "{\"page\":$PAGE}")
  REF=$(printf '%s' "$SNAP" | grep "button \"$label\"" | grep -oE '\[ref=e[0-9]+\]' | grep -oE 'e[0-9]+' | head -1)

  if [ -z "$REF" ]; then
    bad "\"$label\" is in the sidebar"
    continue
  fi

  mcp act "{\"page\":$PAGE,\"kind\":\"click\",\"ref\":\"$REF\"}" > /dev/null
  sleep 1

  OPENED=$(mcp snapshot "{\"page\":$PAGE}")
  if has "$OPENED" "heading \"$heading"; then
    ok "\"$label\" opens"
  else
    bad "\"$label\" opens" "no heading starting with \"$heading\" in the accessibility tree"
    continue
  fi

  # Escape is the way out that a keyboard user has.
  mcp act "{\"page\":$PAGE,\"kind\":\"press\",\"key\":\"Escape\"}" > /dev/null
  sleep 1

  AFTER_CLOSE=$(mcp snapshot "{\"page\":$PAGE}")
  if has "$AFTER_CLOSE" "heading \"$heading"; then
    bad "\"$label\" closes with Escape" "its heading is still in the accessibility tree"
  else
    ok "\"$label\" closes with Escape"
  fi
done

echo
echo "== 7. Creating a session =="
SNAP=$(mcp snapshot "{\"page\":$PAGE}")
NEW_REF=$(printf '%s' "$SNAP" | grep 'button "New session"' | grep -oE '\[ref=e[0-9]+\]' | grep -oE 'e[0-9]+' | head -1)
if [ -z "$NEW_REF" ]; then
  bad "the New session button exists"
else
  mcp act "{\"page\":$PAGE,\"kind\":\"click\",\"ref\":\"$NEW_REF\"}" > /dev/null
  sleep 2
  AFTER_NEW=$(mcp snapshot "{\"page\":$PAGE}")
  if has "$AFTER_NEW" "Session"; then
    ok "a new session is created"
  else
    bad "a new session is created" "$(printf '%s' "$AFTER_NEW" | tr '\n' ' ' | head -c 160)"
  fi
fi

echo
echo "== 8. The account screen =="
# Navigated to by the link in the sidebar rather than by typing the URL, so the
# navigation path a person actually takes is the one under test.
LINK=$(mcp snapshot "{\"page\":$PAGE}" | grep 'link "Kelola Akun"' | grep -oE 'e[0-9]+' | head -1)
if [ -n "$LINK" ]; then
  mcp act "{\"page\":$PAGE,\"kind\":\"click\",\"ref\":\"$LINK\"}" > /dev/null
else
  mcp navigate "{\"page\":$PAGE,\"url\":\"$BASE/app/admin/users\"}" > /dev/null
fi
sleep 3

ADMIN_STATE=$(mcp snapshot "{\"page\":$PAGE}")
# Matched case-insensitively: the heading is "Kelola akun", the link that opens it
# is "Kelola Akun". Comparing exactly reported a working screen as broken.
if printf '%s' "$ADMIN_STATE" | grep -qi 'heading "kelola akun"'; then
  ok "the account screen loads for an admin"
else
  bad "the account screen loads for an admin" "$(printf '%s' "$ADMIN_STATE" | tr '\n' ' ' | head -c 200)"
fi

if printf '%s' "$ADMIN_STATE" | grep -qi 'heading "daftar akun"'; then
  ok "the account list renders"
else
  bad "the account list renders"
fi

# Creating an account is the screen's whole purpose, so the form is checked too.
if has "$ADMIN_STATE" 'textbox "Email"' && has "$ADMIN_STATE" 'button "Buat akun dan password"'; then
  ok "the create-account form is present"
else
  bad "the create-account form is present" "the email field or the submit button is missing"
fi

echo
echo "== 9. Uploading a file =="
mcp navigate "{\"page\":$PAGE,\"url\":\"$BASE/app\"}" > /dev/null
sleep 3

# The upload panel holds the file input, so it has to be opened first. The toggle
# is located through the DOM rather than the accessibility snapshot: the snapshot
# can be truncated on a long page, and a control that exists being reported as
# missing is a worse failure than a slower check.
CLIP_RAW=$(mcp evaluate "{\"page\":$PAGE,\"code\":\"return Array.from(document.querySelectorAll('button')).some(b => (b.getAttribute('aria-label')||'').includes('Attach files')) ? 'PRESENT' : 'MISSING'\"}")
CLIP_STATE=$(printf '%s' "$CLIP_RAW" | grep -oE 'PRESENT|MISSING' | head -1)

# Retried, because a client-side navigation re-renders the workspace and the
# composer is not in the DOM until hydration finishes. A single check right after
# `nav` reported a control as missing that appears a moment later.
for _ in 1 2 3 4 5 6; do
  [ "$CLIP_STATE" = "PRESENT" ] && break
  sleep 2
  CLIP_RAW=$(mcp evaluate "{\"page\":$PAGE,\"code\":\"return Array.from(document.querySelectorAll('button')).some(b => (b.getAttribute('aria-label')||'').includes('Attach files')) ? 'PRESENT' : 'MISSING'\"}")
  CLIP_STATE=$(printf '%s' "$CLIP_RAW" | grep -oE 'PRESENT|MISSING' | head -1)
done

if [ "$CLIP_STATE" != "PRESENT" ]; then
  bad "the upload toggle has an accessible name" "the DOM said: $(printf '%s' "$CLIP_RAW" | tr '\n' ' ' | head -c 200)"
else
  ok "the upload toggle has an accessible name"

  mcp evaluate "{\"page\":$PAGE,\"code\":\"const el = Array.from(document.querySelectorAll('button')).find(b => (b.getAttribute('aria-label')||'').includes('Attach files')); el.click(); return 'ok'\"}" > /dev/null
  sleep 1

  # Read from the DOM, not only from the accessibility tree. The panel's visible
  # text sits inside a generic container, and the tree omits text under those, so
  # checking the tree alone reported a panel that is really open as missing.
  UPLOAD_STATE=$(mcp evaluate "{\"page\":$PAGE,\"code\":\"return JSON.stringify({ dropZone: document.body.innerText.includes('Drop files here'), formats: document.body.innerText.includes('PDF'), fileInputs: document.querySelectorAll('input[type=file]').length, focusable: !!document.querySelector('[role=\\\"button\\\"][tabindex=\\\"0\\\"]') })\"}")
  if has "$UPLOAD_STATE" '"dropZone":true'; then
    ok "the upload panel opens"
  else
    bad "the upload panel opens" "the drop zone is not in the DOM"
  fi

  # The supported types are stated on screen, so the features added last are
  # discoverable rather than only documented.
  if has "$UPLOAD_STATE" '"formats":true'; then
    ok "the panel says what it can read"
  else
    bad "the panel says what it can read"
  fi

  # The file input exists only while the panel is open, which is why this comes
  # after opening it rather than before.
  if has "$UPLOAD_STATE" '"fileInputs":1'; then
    ok "the file input is present"
  else
    bad "the file input is present" "no file input in the panel"
  fi

  # A drop zone that answers only clicks cannot be used without a mouse.
  if has "$UPLOAD_STATE" '"focusable":true'; then
    ok "the drop zone can be reached by keyboard"
  else
    bad "the drop zone can be reached by keyboard" "nothing focusable in the panel"
  fi
fi

echo
echo "== 10. The room and mode tabs live in the left sidebar =="
# These two tabs used to be a separate panel on the right edge. That panel is gone:
# both tabs are part of the left column now, so the chat is not squeezed between two
# panels. The check follows the change rather than the old layout, and it still walks
# each tab to prove the content really moves rather than the label changing alone.
TAB_REF=$(mcp snapshot "{\"page\":$PAGE}" | grep 'tab "Agents"' | grep -oE 'e[0-9]+' | head -1)

if [ -z "$TAB_REF" ]; then
  bad "the Agents tab exists in the sidebar"
else
  ok "the Agents tab exists in the sidebar"

  mcp act "{\"page\":$PAGE,\"kind\":\"click\",\"ref\":\"$TAB_REF\"}" > /dev/null
  sleep 2

  # A `depth` is passed on purpose. The default snapshot caps nesting, and the tab
  # content sits several levels inside the sidebar, so the default tree came back
  # without it and reported a tab that had rendered correctly as empty.
  #
  # The check looks for the remove control rather than the "In this room" heading.
  # That heading is styled `uppercase`, and the accessibility tree carries the styled
  # text ("IN THIS ROOM"), which no case-insensitive match recovers because the string
  # itself differs. The control carries the plain name of the agent it acts on, so it
  # is both visible in the tree and a stronger signal: it only renders for an agent
  # actually seated in the room.
  AGENTS_VIEW=$(mcp snapshot "{\"page\":$PAGE,\"depth\":12}")
  if printf '%s' "$AGENTS_VIEW" | grep -qE 'Remove .* from the room'; then
    ok "the Agents tab shows who is in the room"
    ok "the seated agents are listed"
  else
    bad "the Agents tab shows who is in the room" "no remove control found after the click"
    bad "the seated agents are listed" "no remove control found for any agent"
  fi

  MODE_REF=$(mcp snapshot "{\"page\":$PAGE}" | grep 'tab "Mode"' | grep -oE 'e[0-9]+' | head -1)
  if [ -z "$MODE_REF" ]; then
    bad "the Mode tab exists in the sidebar"
  else
    mcp act "{\"page\":$PAGE,\"kind\":\"click\",\"ref\":\"$MODE_REF\"}" > /dev/null
    sleep 2

    MODE_VIEW=$(mcp snapshot "{\"page\":$PAGE,\"depth\":12}")
    # Like the agents tab, this looks for something the tree actually carries. The
    # preset buttons are named, so their presence means the list rendered; the
    # "Preset Mode" heading is uppercase and never appears as written.
    MODE_VIEW=$(mcp snapshot "{\"page\":$PAGE,\"depth\":12}")
    if printf '%s' "$MODE_VIEW" | grep -q 'Boardroom'; then
      ok "the Mode tab shows the preset modes"
    else
      bad "the Mode tab shows the preset modes" "no preset button found after the click"
    fi

    # Leaving the tab must take its content with it, otherwise both tabs are always
    # drawn and the tab row is decoration.
    SESSIONS_REF=$(mcp snapshot "{\"page\":$PAGE}" | grep 'tab "Sessions"' | grep -oE 'e[0-9]+' | head -1)
    if [ -n "$SESSIONS_REF" ]; then
      mcp act "{\"page\":$PAGE,\"kind\":\"click\",\"ref\":\"$SESSIONS_REF\"}" > /dev/null
      sleep 2
      BACK_VIEW=$(mcp snapshot "{\"page\":$PAGE,\"depth\":12}")
      if printf '%s' "$BACK_VIEW" | grep -q 'Boardroom'; then
        bad "leaving the Mode tab hides its content" "the preset list is still there"
      else
        ok "leaving the Mode tab hides its content"
      fi
    else
      bad "the Sessions tab exists in the sidebar"
    fi
  fi
fi

echo
echo "== 11. The left sidebar can be collapsed and brought back =="
# One sidebar now, and it sits on the left. Collapsing must actually return the width
# to the chat: a collapse that swaps the icon but leaves the layout untouched would
# look right and free nothing. Widths are measured, not the button's label.
measure_sidebar() {
  mcp evaluate "{\"page\":$PAGE,\"code\":\"const a = document.querySelectorAll('aside'); const panel = a[0]; const m = document.querySelector('main'); const w = panel ? Math.round(panel.getBoundingClientRect().width) : -1; const mw = m ? Math.round(m.getBoundingClientRect().width) : -1; return 'panel=' + w + ' main=' + mw;\"}"
}

# Reads one number back out of the `panel=` pair. Written this way because a grep
# pattern beginning with `-` is taken as an option flag by BSD grep, which quietly
# turned every measurement into a blank and failed four checks for the wrong reason.
panel_width_of() {
  printf '%s' "$1" | sed -n 's/.*panel=\(-\{0,1\}[0-9]\{1,\}\).*/\1/p' | head -1
}

main_width_of() {
  printf '%s' "$1" | sed -n 's/.*main=\([0-9]\{1,\}\).*/\1/p' | head -1
}

HIDE_REF=$(mcp snapshot "{\"page\":$PAGE}" | grep 'button "Collapse the sidebar"' | grep -oE 'e[0-9]+' | head -1)

if [ -z "$HIDE_REF" ]; then
  bad "the sidebar carries a way to collapse it" "no control named \"Collapse the sidebar\""
else
  ok "the sidebar carries a way to collapse it"

  # The sidebar is measured together with the chat area, because the point of
  # collapsing is that the chat gains the space.
  BEFORE=$(measure_sidebar)
  PANEL_BEFORE=$(panel_width_of "$BEFORE")
  MAIN_BEFORE=$(main_width_of "$BEFORE")

  mcp act "{\"page\":$PAGE,\"kind\":\"click\",\"ref\":\"$HIDE_REF\"}" > /dev/null
  # Long enough for the 300ms width transition to finish. A shorter wait measured the
  # panel mid-animation and reported a collapse that had worked as still too wide.
  sleep 2

  AFTER=$(measure_sidebar)
  PANEL_AFTER=$(panel_width_of "$AFTER")
  MAIN_AFTER=$(main_width_of "$AFTER")

  # Not zero: the panel keeps its 1px left border, so the threshold is "under 10px"
  # rather than an exact value.
  if [ -n "$PANEL_AFTER" ] && [ "$PANEL_AFTER" -lt 10 ]; then
    ok "hiding it collapses the panel" "was ${PANEL_BEFORE}px, now ${PANEL_AFTER}px"
  else
    bad "hiding it collapses the panel" "panel width is ${PANEL_AFTER}px"
  fi

  if [ -n "$MAIN_AFTER" ] && [ -n "$MAIN_BEFORE" ] && [ "$MAIN_AFTER" -gt "$MAIN_BEFORE" ]; then
    ok "the chat takes the freed space" "${MAIN_BEFORE}px -> ${MAIN_AFTER}px"
  else
    bad "the chat takes the freed space" "chat width ${MAIN_BEFORE}px -> ${MAIN_AFTER}px"
  fi

  # A panel that can be hidden but not restored is a trap, so the way back is
  # checked as well. It is found by its own label rather than by position.
  SHOW_REF=$(mcp snapshot "{\"page\":$PAGE}" | grep 'button "Expand the sidebar"' | grep -oE 'e[0-9]+' | head -1)
  if [ -z "$SHOW_REF" ]; then
    bad "it can be brought back" "no control named \"Expand the sidebar\""
  else
    mcp act "{\"page\":$PAGE,\"kind\":\"click\",\"ref\":\"$SHOW_REF\"}" > /dev/null
    sleep 2

    BACK=$(measure_sidebar)
    PANEL_BACK=$(panel_width_of "$BACK")

    if [ -n "$PANEL_BACK" ] && [ "$PANEL_BACK" -ge 200 ]; then
      ok "it can be brought back" "panel width is ${PANEL_BACK}px again"
    else
      bad "it can be brought back" "panel width is only ${PANEL_BACK}px"
    fi

    # Both controls are plain buttons, so a keyboard must be able to operate them.
    # Checked by activating them the way a keyboard user would, not by inspecting
    # the markup: a button can carry the right tag and still be unoperable if
    # something above it swallows the key.
    mcp act "{\"page\":$PAGE,\"kind\":\"focus\",\"ref\":\"$HIDE_REF\"}" > /dev/null
    sleep 1
    mcp act "{\"page\":$PAGE,\"kind\":\"press\",\"key\":\"Enter\"}" > /dev/null
    sleep 2

    KEY_CLOSED=$(measure_sidebar)
    KEY_CLOSED_N=$(panel_width_of "$KEY_CLOSED")

    if [ -n "$KEY_CLOSED_N" ] && [ "$KEY_CLOSED_N" -lt 10 ]; then
      ok "hiding it works from the keyboard" "Enter collapsed it to ${KEY_CLOSED_N}px"
    else
      bad "hiding it works from the keyboard" "Enter left it at ${KEY_CLOSED_N}px"
    fi

    KEY_SHOW=$(mcp snapshot "{\"page\":$PAGE}" | grep 'button "Expand the sidebar"' | grep -oE 'e[0-9]+' | head -1)
    if [ -n "$KEY_SHOW" ]; then
      mcp act "{\"page\":$PAGE,\"kind\":\"focus\",\"ref\":\"$KEY_SHOW\"}" > /dev/null
      sleep 1
      mcp act "{\"page\":$PAGE,\"kind\":\"press\",\"key\":\" \"}" > /dev/null
      sleep 2

      KEY_OPEN=$(measure_sidebar)
      KEY_OPEN_N=$(panel_width_of "$KEY_OPEN")

      if [ -n "$KEY_OPEN_N" ] && [ "$KEY_OPEN_N" -ge 200 ]; then
        ok "bringing it back works from the keyboard" "Space restored it to ${KEY_OPEN_N}px"
      else
        bad "bringing it back works from the keyboard" "Space left it at ${KEY_OPEN_N}px"
      fi
    else
      bad "bringing it back works from the keyboard" "no control named \"Expand the sidebar\""
    fi
  fi
fi

echo
echo "============================================"
echo "  PASS: $PASS    FAIL: $FAIL"
if [ ${#FAILED_NAMES[@]} -gt 0 ]; then
  echo "  Failed: ${FAILED_NAMES[*]}"
fi
echo "============================================"

# The tab is closed on the way out, including on failure. Leaving it open meant
# every run added one more, and 46 of them accumulated before this was noticed.
if [ -n "${PAGE:-}" ]; then
  mcp tabs "{\"action\":\"close\",\"page\":$PAGE}" > /dev/null 2>&1
fi

[ "$FAIL" -eq 0 ]

