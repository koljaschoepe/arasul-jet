#!/bin/bash
# =============================================================================
# Abnahme „Auslesen im Kontrakt, Bilder an ein Bildmodell" (J35, 26.09.2026)
# =============================================================================
# Das Kit hat am 25.09.2026 zwei offene Stellen gemeldet (K21): die Antwort von
# `document/extract-structured` steht nicht im Kontrakt, und die aeussere
# Schnittstelle kann kein Bild an ein Modell geben. Gemessen wird:
#
#   1. `GET contract` nennt `auslesen` (Anfrage, Antwort, Fehlschlag als
#      JSON-Schema) und `bilder`.
#   2. Ein echter Aufruf von `document/extract-structured` hat GENAU die Form
#      von `auslesen.antwort`: jedes Pflichtfeld da, kein Feld dazu.
#   3. `llm/chat` mit einem PNG und ohne `model` antwortet, und zwar von einem
#      Modell, das laut `GET models` Bilder liest.
#   4. Dasselbe mit einem Textmodell ist ein 400, das die Bildmodelle nennt.
#
# WAS ES ANLEGT, RAEUMT ES WEG: einen Wegwerf-Schluessel. Keine App, kein
# Container, kein Konto. Die Zeilen im Protokoll der Modellaufrufe bleiben --
# das ist dessen Zusage, nicht ein Rest dieser Abnahme.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 arasul@192.168.0.197
#   ARASUL_PASSWORT=... bash scripts/test/bilder-abnahme.sh
# Optional ARASUL_TEXTMODELL (Vorgabe gemma4:e4b, fuer das Auslesen -- schneller
# als das Standardmodell) und ARASUL_GEGENPROBE_MODELL (Vorgabe das
# Standardmodell der Flows; gemma4 liest auch Bilder und taugt dafuer nicht).
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
AUSLESE_MODELL="${ARASUL_TEXTMODELL:-gemma4:e4b}"
GEDULD=600

gruen=0
rot=0
pruefe() {
  local was="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "ja" ]; then
    gruen=$((gruen + 1))
    printf 'gruen  %s%s\n' "$was" "${detail:+  ($detail)}"
  else
    rot=$((rot + 1))
    printf 'ROT    %s%s\n' "$was" "${detail:+  ($detail)}"
  fi
}
ja_wenn() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }

RUMPF_DATEI="$(mktemp)"
KONTRAKT_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""

ruf() {
  local verb="$1" pfad="$2" leib="${3:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD"
    -H "x-api-key: $SCHLUESSEL")
  [ -n "$leib" ] && argumente+=(-H 'content-type: application/json' --data-binary "@$leib")
  CODE=$(curl "${argumente[@]}" "$BASIS/api/v1/external$pfad")
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }

feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k) if isinstance(d, dict) else None
    if d is None: break
print("" if d is None else (json.dumps(d) if isinstance(d,(bool,dict,list)) else d))' "$1" 2>/dev/null
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 arasul@192.168.0.197"
  exit 1
fi

echo "=== Abnahme Auslesen im Kontrakt und Bilder (J35) gegen $BASIS ==="
echo

# --- 1. Zugang ---------------------------------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }

SCHLUESSEL=""
KEY_ID=""
aufraeumen() {
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI" "$KONTRAKT_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  Wegwerf-Schluessel widerrufen\n'
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme J35 (bilder)","allowed_endpoints":["llm:chat","llm:status","document:extract"]}' \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit llm:chat, llm:status, document:extract' \
  "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# --- 2. Der Kontrakt ---------------------------------------------------------
ruf GET /contract
cp "$RUMPF_DATEI" "$KONTRAKT_DATEI"
pruefe 'Der Kontrakt nennt das Auslesen' \
  "$(ja_wenn "$(rumpf | feld data.auslesen.weg)" document/extract-structured)" \
  "kontrakt=$(rumpf | feld data.kontrakt)"
pruefe '… mit dem Antwortschema samt data' \
  "$([ -n "$(rumpf | feld data.auslesen.antwort.properties.data)" ] && echo ja || echo nein)"
pruefe '… und wie ein Bild an ein Modell geht' \
  "$(ja_wenn "$(rumpf | feld data.bilder.feld)" images)"

# --- 3. Eine echte Antwort hat die Form des Kontrakts ------------------------
printf 'Tankquittung\nDatum: 24.09.2026\nSumme: 42,17 EUR\n' >"$ARBEIT/quittung.txt"
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" \
  -F 'schema={"type":"object","properties":{"datum":{"type":"string"},"summe":{"type":"number"}}}' \
  -F "model=$AUSLESE_MODELL" -F "file=@$ARBEIT/quittung.txt" \
  "$BASIS/api/v1/external/document/extract-structured")
pruefe 'document/extract-structured antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
FORM=$(python3 - "$KONTRAKT_DATEI" "$RUMPF_DATEI" <<'PY'
import json, sys
schema = json.load(open(sys.argv[1]))["data"]["auslesen"]["antwort"]
antwort = json.load(open(sys.argv[2]))
fehlt = [k for k in schema["required"] if k not in antwort]
dazu = [k for k in antwort if k not in schema["properties"]]
typen = {"string": str, "integer": int, "object": dict, "boolean": bool}
falsch = []
for k, v in antwort.items():
    t = schema["properties"].get(k, {}).get("type")
    if t in typen and not isinstance(v, typen[t]):
        falsch.append(k)
print("ok" if not (fehlt or dazu or falsch) else
      "fehlt=%s dazu=%s falscher_typ=%s" % (fehlt, dazu, falsch))
PY
)
pruefe '… in genau der Form von auslesen.antwort' "$(ja_wenn "$FORM" ok)" \
  "$FORM; data=$(rumpf | feld data)"

# --- 4. Ein Bild an ein Bildmodell -------------------------------------------
# Ein PNG ohne Hilfsbibliothek: links rot, rechts blau, 64 x 64.
python3 - "$ARBEIT/bild.png" <<'PY'
import struct, sys, zlib
b, h = 64, 64
zeilen = b"".join(b"\x00" + b"".join(
    (b"\xff\x00\x00" if x < b // 2 else b"\x00\x00\xff") for x in range(b)) for _ in range(h))
def stueck(art, daten):
    return struct.pack(">I", len(daten)) + art + daten + struct.pack(">I", zlib.crc32(art + daten))
png = (b"\x89PNG\r\n\x1a\n" + stueck(b"IHDR", struct.pack(">IIBBBBB", b, h, 8, 2, 0, 0, 0))
       + stueck(b"IDAT", zlib.compress(zeilen)) + stueck(b"IEND", b""))
open(sys.argv[1], "wb").write(png)
PY
python3 - "$ARBEIT/bild.png" "$ARBEIT/mit-bild.json" <<'PY'
import base64, json, sys
bild = base64.b64encode(open(sys.argv[1], "rb").read()).decode()
json.dump({"prompt": "Which two colors does this image show? Answer in one short sentence.",
           "images": ["data:image/png;base64," + bild], "timeout_seconds": 300},
          open(sys.argv[2], "w"))
PY

ruf GET /models
BILDMODELLE=$(rumpf | python3 -c 'import sys,json
print(" ".join(m["id"] for m in json.load(sys.stdin).get("models", []) if m.get("supports_vision_input")))' 2>/dev/null)
pruefe 'GET models nennt die Bildmodelle' "$([ -n "$BILDMODELLE" ] && echo ja || echo nein)" \
  "$BILDMODELLE"

beginn=$SECONDS
ruf POST /llm/chat "$ARBEIT/mit-bild.json"
MODELL=$(rumpf | feld model)
TEXT=$(rumpf | feld response)
pruefe 'llm/chat mit einem PNG antwortet' \
  "$([ "$CODE" = "200" ] && [ -n "$TEXT" ] && echo ja || echo nein)" \
  "HTTP $CODE, $((SECONDS - beginn)) s"
pruefe '… von einem Bildmodell, das das Geraet selbst gewaehlt hat' \
  "$([ -n "$MODELL" ] && grep -qw -- "$MODELL" <<<"$BILDMODELLE" && echo ja || echo nein)" \
  "model=$MODELL"
printf '       Antwort: %s\n' "$(printf '%s' "$TEXT" | tr '\n' ' ' | cut -c1-200)"
pruefe '… und sie hat das Bild gesehen (rot und blau)' \
  "$(grep -qi 'red' <<<"$TEXT" && grep -qi 'blue' <<<"$TEXT" && echo ja || echo nein)"

# --- 5. Gegenprobe: ein Textmodell nimmt kein Bild ---------------------------
# Abgewiesen wird vor dem Einreihen: die Gegenprobe kostet keine Rechenzeit.
TEXTMODELL="${ARASUL_GEGENPROBE_MODELL:-qwen3.8:27b-q4_K_M}"
python3 - "$ARBEIT/mit-bild.json" "$ARBEIT/textmodell.json" "$TEXTMODELL" <<'PY'
import json, sys
leib = json.load(open(sys.argv[1]))
leib["model"] = sys.argv[3]
json.dump(leib, open(sys.argv[2], "w"))
PY
ruf POST /llm/chat "$ARBEIT/textmodell.json"
pruefe "Ein Textmodell ($TEXTMODELL) mit Bild ist ein 400" "$(ja_wenn "$CODE" 400)" \
  "$(rumpf | feld error.message | cut -c1-160)"

echo
echo "=== $gruen gruen, $rot rot ==="
[ "$rot" -eq 0 ]
