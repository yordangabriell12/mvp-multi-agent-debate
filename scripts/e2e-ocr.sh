#!/usr/bin/env bash
# End-to-end check of the OCR flow against a running server.
#
# Uses a stand-in vision provider (scripts/mock-vision-provider.mjs) so the paths
# that matter can be checked without a real API key: that a PDF with a text layer
# is read without calling a model at all, that a scanned page is sent to the model
# as a real image, and that an unconfigured deployment says so instead of failing
# obscurely.
#
# Usage: BASE=http://127.0.0.1:3999 bash scripts/e2e-ocr.sh

set -uo pipefail

BASE="${BASE:-http://127.0.0.1:3999}"
JAR=$(mktemp)
WORK=$(mktemp -d)
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

lacks() {
  local label="$1" haystack="$2" needle="$3"
  case "$haystack" in
    *"$needle"*) echo "  FAIL  $label (found '$needle')"; FAIL=$((FAIL + 1)) ;;
    *) echo "  PASS  $label"; PASS=$((PASS + 1)) ;;
  esac
}

code() { printf '%s\n' "$1" | tail -1; }
body() { printf '%s\n' "$1" | sed '$d'; }

api() { # method path [json] -> body, then status code on the last line
  local method="$1" path="$2" data="${3:-}" jar="${4:-$JAR}"
  if [ -n "$data" ]; then
    curl -s -w '\n%{http_code}' -X "$method" -b "$jar" -c "$jar" \
      -H 'Content-Type: application/json' -d "$data" "$BASE$path"
  else
    curl -s -w '\n%{http_code}' -X "$method" -b "$jar" -c "$jar" "$BASE$path"
  fi
}

upload() { # file [jar]
  curl -s -w '\n%{http_code}' -b "${2:-$JAR}" -c "${2:-$JAR}" -F "file=@$1" "$BASE/api/ocr"
}

# Builds a test PDF with the same generator the unit tests use. Hand-writing one
# would risk a wrong xref offset, which would make the test prove nothing.
build_pdf() { # <kind: text|scan> <outfile>
  local kind="$1" out="$2"
  node --experimental-strip-types --input-type=module -e "
    import { buildMinimalPdf } from './src/lib/testPdf.ts'
    import { writeFileSync } from 'node:fs'
    const pdf = buildMinimalPdf(
      '$kind' === 'scan'
        ? { lines: ['scanned page placeholder'], imageOnly: true }
        : { lines: ['Contract clause 42 applies'] }
    )
    writeFileSync('$out', pdf)
  " 2>&1 | tail -2
}

# Builds a real PNG, so the size check has honest bytes to read.
#
# A signature followed by padding is no longer enough to stand in for an image. The
# route now reads the declared pixel dimensions, and a made-up header cannot be
# measured, so it is refused. These fixtures therefore have to be real PNGs.
build_png() { # <width> <height> <outfile>
  node --input-type=module -e "
    import { deflateSync } from 'node:zlib'
    import { writeFileSync } from 'node:fs'

    const chunk = (type, data) => {
      const length = Buffer.alloc(4)
      length.writeUInt32BE(data.length)
      // The CRC is not verified by the reader, so a zero keeps this free of a CRC
      // implementation while leaving the byte layout correct.
      return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)])
    }

    const width = Number('$1')
    const height = Number('$2')
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(width, 0)
    ihdr.writeUInt32BE(height, 4)
    ihdr[8] = 8
    ihdr[9] = 0

    // One filter byte then one byte per pixel, all zero: a flat black image. The
    // flatness is deliberate, since that is what keeps the large fixture small.
    const idat = deflateSync(Buffer.alloc(height * (1 + width)), { level: 9 })
    writeFileSync('$3', Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', idat),
      chunk('IEND', Buffer.alloc(0)),
    ]))
  " 2>&1 | tail -2
}


echo "== 1. Sign in as the super admin =="
R=$(api POST /api/auth/login "{\"email\":\"${VMA_EMAIL:-admin@example.com}\",\"password\":\"${VMA_PASSWORD:-AdminPass12345}\"}")
check "signed in" "$(code "$R")" "200"

echo
echo "== 2. With OCR switched off, an image is refused with a clear reason =="
# The deployment is reset to its initial state first. OCR settings live on the
# server, so a run that left a model selected would make every check below that
# depends on "not configured yet" pass or fail for the wrong reason: the script
# would report the state it found rather than the state it set up.
R=$(api PUT /api/ocr/settings '{"providerId":"","modelId":"","enabled":false,"maxPdfPages":20}')
check "reset to unconfigured" "$(code "$R")" "200"
contains "settings read back as off" "$(body "$R")" '"enabled":false'

build_png 320 240 "$WORK/tiny.png"
R=$(upload "$WORK/tiny.png")
check "refused as a conflict, not a server error" "$(code "$R")" "409"
contains "the reason names what to do" "$(body "$R")" 'super admin'
contains "flagged so the UI can explain it" "$(body "$R")" '"notConfigured":true'

echo
echo "== 3. A PDF with a text layer is read with no model at all =="
# A vision model is deliberately not configured yet, so a successful read proves
# this path never waited on a provider.
build_pdf text "$WORK/text.pdf" >/dev/null
if [ ! -s "$WORK/text.pdf" ]; then
  echo "  FAIL  could not build the test PDF"; FAIL=$((FAIL + 1))
else
  R=$(upload "$WORK/text.pdf")
  check "text PDF read" "$(code "$R")" "200"
  contains "the text came through" "$(body "$R")" 'Contract clause 42 applies'
  contains "reported as a text read" "$(body "$R")" '"method":"pdf-text"'
  lacks "no model was called" "$(body "$R")" '"viaVision":true'
fi

echo
echo "== 4. A scanned PDF reports which page it could not read =="
build_pdf scan "$WORK/scan.pdf" >/dev/null
if [ ! -s "$WORK/scan.pdf" ]; then
  echo "  FAIL  could not build the scanned test PDF"; FAIL=$((FAIL + 1))
else
  R=$(upload "$WORK/scan.pdf")
  check "scanned PDF handled" "$(code "$R")" "200"
  contains "the unreadable page is named" "$(body "$R")" '"unreadablePages":[1]'
  contains "a warning explains why" "$(body "$R")" 'no vision model is set up'
fi

echo
echo "== 5. A super admin registers a vision provider and chooses its model =="
# The stand-in provider lives on loopback, which the SSRF guard blocks by design,
# so this run happens with VMA_ALLOW_PRIVATE_BASEURL=true on the server. That is
# the same switch a self-hosted Ollama needs, and it is off in production.
MOCK_URL="${MOCK:-http://127.0.0.1:4599}"
R=$(api PUT /api/config "{\"providers\":[{\"id\":\"mockvision\",\"name\":\"Mock Vision\",\"baseUrl\":\"$MOCK_URL/v1\",\"apiKey\":\"test-key\",\"models\":[{\"id\":\"mock-vision\",\"name\":\"Mock Vision\"}],\"enabled\":true}]}")
check "provider registered" "$(code "$R")" "200"

R=$(api PUT /api/ocr/settings '{"providerId":"mockvision","modelId":"mock-vision","enabled":true,"maxPdfPages":20}')
check "vision model selected and switched on" "$(code "$R")" "200"

R=$(api GET /api/ocr/settings)
contains "the model is stored" "$(body "$R")" 'mock-vision'
contains "and the feature is on" "$(body "$R")" '"enabled":true'

echo
echo "== 6. Switching OCR on without a model is refused =="
R=$(api PUT /api/ocr/settings '{"providerId":"","modelId":"","enabled":true}')
check "refused with an explanation" "$(code "$R")" "400"
# Restored, so the following steps can still read pages.
R=$(api PUT /api/ocr/settings '{"providerId":"mockvision","modelId":"mock-vision","enabled":true,"maxPdfPages":20}')
check "restored" "$(code "$R")" "200"

echo
echo "== 7. The scanned page is now sent to the model as a real image =="
R=$(upload "$WORK/scan.pdf")
check "read with the model" "$(code "$R")" "200"
contains "a vision read is reported" "$(body "$R")" '"viaVision":true'
contains "the model received an actual image" "$(body "$R")" 'image=received'
lacks "not an absent image" "$(body "$R")" 'image=MISSING'
lacks "nor a zero-byte one" "$(body "$R")" 'bytes=0'
contains "the instruction travelled with it" "$(body "$R")" 'instruction=present'
contains "the configured model was used" "$(body "$R")" 'model=mock-vision'

echo
echo "== 8. A standalone image goes to the model too =="
R=$(upload "$WORK/tiny.png")
check "image read" "$(code "$R")" "200"
contains "reported as an image read" "$(body "$R")" '"method":"image-vision"'
contains "the model saw the image" "$(body "$R")" 'image=received'

echo
echo "== 9. A file that is neither is refused by type =="
printf 'just plain text, no image and no pdf' > "$WORK/notes.txt"
R=$(upload "$WORK/notes.txt")
check "unsupported type refused" "$(code "$R")" "415"

echo
echo "== 10. An image too large to read is refused before it is sent =="
# 20000 by 20000 is 400 megapixels, and because the test image is a single flat
# colour it compresses to a few hundred kilobytes, so it passes any byte limit.
# This is the case a size check exists for, and it is checked here rather than only
# in the unit tests because the bytes have to travel through the whole route.
build_png 20000 20000 "$WORK/bomb.png"
BOMB_KB=$(( $(wc -c < "$WORK/bomb.png") / 1024 ))
R=$(upload "$WORK/bomb.png")
check "refused as too large" "$(code "$R")" "413"
contains "the reason states the limit" "$(body "$R")" 'too large to read'
contains "the reason says what to do" "$(body "$R")" 'resize'
echo "  note  the file was ${BOMB_KB} KB on disk, which a byte limit alone would accept"

echo
echo "============================================"
echo "  PASS: $PASS    FAIL: $FAIL"
echo "============================================"

rm -rf "$WORK" "$JAR"
[ "$FAIL" -eq 0 ]

