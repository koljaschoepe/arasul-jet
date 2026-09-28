#!/bin/bash
# =============================================================================
# Abnahme: die Groessengrenze eines Bereichs (J33, 28.09.2026)
# =============================================================================
# Befund des Kit-Workers vom 28.09.2026: ein Abgleich scheiterte mit
# „exceeds the quota for the folder", weil jeder Bereich still 1 GB hatte.
# Gegen das laufende Geraet gemessen, mit einem Probe-Bereich mit Stempel:
#
#   1. VORGABE. Ein neuer Bereich hat in `GET /platz` die Grenze 100 GB, und
#      `GET /api/firmenordner` nennt an ihm `platz` mit belegt und Grenze.
#   2. GRENZE 50 MB. `PUT /ordner/:id/grenze` setzt sie; `GET /platz` sagt
#      danach 50 MB.
#   3. ABGEWIESEN. `GET /passt` mit 60 MB antwortet `409 GRENZE_ERREICHT`
#      mit einem Satz in Kundensprache, und ein echter Upload von 60 MB ueber
#      WebDAV an den Firmenordner antwortet `507` -- die Grenze gilt im
#      Dienst, nicht nur in der Auskunft.
#   4. BROWSER (`bereich-quote-bilder.mjs`): 390, 1024 (mit Notizspalte) und
#      1440 px, die Spalte Platz nennt 50 MB, seitlich rollt nichts ausser der
#      Rechte-Matrix, und der Administrator hebt die Grenze im Dialog auf
#      200 MB.
#   5. NACH DEM ANHEBEN geht beides durch: `passt` `200`, der Upload `201`.
#   6. AUFGERAEUMT OHNE REST: kein Probe-Bereich, keine Rechte-Zeile, kein
#      Papierkorb nennt den Stempel.
#
# Der Raum `firma` und die Bereiche des Kunden werden nicht angefasst. Die
# Konten des Kunden auch nicht. Angemeldet wird mit einem Token
# (`anmeldung.sh`), der Browser bekommt die Sitzung als Datei -- er sieht nie
# ein Passwortfeld. Das Passwort fuer WebDAV geht als curl-Konfiguration ueber
# STDIN, nie als Argument.
#
# Aufruf vom Arbeitsrechner:
#   ARASUL_URL=https://192.168.0.197 ARASUL_BENUTZER=admin \
#   ARASUL_PASSWORT="$(security find-generic-password -s 'Arasul Orin Admin' -a admin -w)" \
#   ARASUL_BILDER=<ordner> bash scripts/test/bereich-quote-abnahme.sh
#
# Wer den Lauf abbricht, raeumt mit `--nur-aufraeumen <stempel>` nach.
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
# Der Firmenordner hat seinen eigenen Einstiegspunkt auf 8443.
DAV="${ARASUL_FIRMENORDNER:-$(printf '%s' "$BASIS" | sed -E 's#^(https?://[^/:]+).*#\1#'):8443}"
STEMPEL="$(date +%s)"
if [ "${1:-}" = "--nur-aufraeumen" ]; then
  STEMPEL="${2:?Stempel fehlt}"
fi
PRAEFIX="j33q-$STEMPEL"
KENNUNG="$PRAEFIX-akten"
BILDER="${ARASUL_BILDER:-${TMPDIR:-/tmp}/bereich-quote-$STEMPEL}"
SITZUNG="${TMPDIR:-/tmp}/arasul-j33q-admin.json"
MB=1000000

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
ja() { [ "$1" = "$2" ] && echo ja || echo nein; }

RUMPF="$(mktemp)"
GROSS="$(mktemp)"
CODE=""
ruf() {
  local verb="$1" pfad="$2" leib="${3:-}"
  local -a a=(-sk -o "$RUMPF" -w '%{http_code}' --max-time 1200
    -X "$verb" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json')
  [ -n "$leib" ] && a+=(-d "$leib")
  CODE=$(curl "${a[@]}" "$BASIS$pfad")
}
lies() {
  python3 -c "import sys,json
try: d = json.load(open(sys.argv[1]))
except Exception: d = None
print($1)" "$RUMPF" 2>/dev/null
}
# Ein Upload von 60 MB in den Raum des Probe-Bereichs, als der Administrator.
# Das Passwort steht in der Konfiguration auf STDIN; die Datei kommt ueber -T
# (STDIN ist schon vergeben).
hochladen() {
  local datei="$1"
  printf 'user = "%s:%s"\n' "$ARASUL_BENUTZER" "$ARASUL_PASSWORT" |
    curl -sk -K - -o /dev/null -w '%{http_code}' --max-time 600 \
      -T "$GROSS" "$DAV/dav/spaces/$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe="!"))' "$RAUM")/$datei"
}

TOKEN="$(arasul_token)"
if [ -z "$TOKEN" ]; then
  echo "ROT    keine Anmeldung ($(arasul_anmeldecode))"
  exit 1
fi
ruf GET /api/auth/me
ICH="$(lies "(d.get('user') or d).get('username','')")"

probeOrdner() {
  ruf GET /api/firmenordner/ordner
  lies "'\n'.join(f\"{o['id']} {o['kennung']} {o.get('raum_id') or ''}\" for o in (d.get('data') or []) if o['kennung'].startswith('$PRAEFIX'))"
}
aufraeumen() {
  local id kennung
  while read -r id kennung _; do
    [ -n "$id" ] || continue
    ruf DELETE "/api/firmenordner/ordner/$id?kennung=$kennung&rechte=entziehen"
    echo "       weggeworfen: $kennung ($CODE)"
  done < <(probeOrdner)
}
if [ "${1:-}" = "--nur-aufraeumen" ]; then
  aufraeumen
  exit 0
fi

echo "--- Stempel $STEMPEL, angemeldet als $ICH, Firmenordner unter $DAV ---"

# 1. Vorgabe ------------------------------------------------------------------
echo "--- 1. Vorgabe ---"
ruf POST /api/firmenordner/ordner \
  "{\"kennung\":\"$KENNUNG\",\"name\":\"Probe Akten $STEMPEL\",\"ebene\":1,\"art\":\"geteilt\"}"
pruefe "Probe-Bereich $KENNUNG angelegt" "$(ja "$CODE" 201)" "$CODE"
read -r ID _ RAUM < <(probeOrdner)
pruefe "und im Firmenordner angekommen" "$([ -n "${RAUM:-}" ] && echo ja || echo nein)"
ruf GET /api/firmenordner/platz
GRENZE="$(lies "next((o['grenze'] for o in d['data']['ordner'] if o['kennung']=='$KENNUNG'), 'fehlt')")"
pruefe "ein neuer Bereich hat die Vorgabe 100 GB" "$(ja "$GRENZE" 100000000000)" "$GRENZE"
VORGABE="$(lies "d['data']['vorgabe']")"
pruefe "GET /platz nennt die Vorgabe" "$(ja "$VORGABE" 100000000000)" "$VORGABE"
ruf GET /api/firmenordner
PLATZ="$(lies "next((sorted(o['platz']) for o in d['data']['ordner'] if o['pfad']=='$KENNUNG' and o.get('platz')), 'fehlt')")"
pruefe "GET /api/firmenordner nennt am Bereich belegt, Grenze und frei" \
  "$([[ "$PLATZ" == *belegt*frei*grenze* ]] && echo ja || echo nein)" "$PLATZ"

# 2. Grenze 50 MB --------------------------------------------------------------
echo "--- 2. Grenze 50 MB ---"
ruf PUT "/api/firmenordner/ordner/$ID/grenze" "{\"grenze\":$((50 * MB))}"
pruefe "PUT grenze 50 MB" "$(ja "$CODE" 200)" "$CODE $(lies "d.get('data',{}).get('grenze')")"
ruf GET /api/firmenordner/platz
GRENZE="$(lies "next((o['grenze'] for o in d['data']['ordner'] if o['kennung']=='$KENNUNG'), 'fehlt')")"
pruefe "GET /platz sagt danach 50 MB" "$(ja "$GRENZE" $((50 * MB)))" "$GRENZE"

# 3. Ueber der Grenze abgewiesen ------------------------------------------------
echo "--- 3. Ueber der Grenze ---"
dd if=/dev/zero of="$GROSS" bs=1000000 count=60 2>/dev/null
ruf GET "/api/firmenordner/passt?pfad=$KENNUNG&bytes=$((60 * MB))"
SATZ="$(lies "d['error']['message']")"
FEHLERCODE="$(lies "d['error']['code']")"
pruefe "passt mit 60 MB: 409 GRENZE_ERREICHT" \
  "$([ "$CODE" = 409 ] && [ "$FEHLERCODE" = GRENZE_ERREICHT ] && echo ja || echo nein)" "$CODE $FEHLERCODE"
pruefe "mit einem Satz in Kundensprache" \
  "$([[ "$SATZ" == *"ist zu voll: frei sind noch 50 MB, gebraucht werden 60 MB"* ]] && echo ja || echo nein)" "$SATZ"
echo "       Satz: $SATZ"
CODE_DAV="$(hochladen "$PRAEFIX-gross.bin")"
pruefe "ein Upload von 60 MB an den Firmenordner wird abgewiesen" "$(ja "$CODE_DAV" 507)" "$CODE_DAV"

# 4. Browser ------------------------------------------------------------------
echo "--- 4. Browser ---"
mkdir -p "$BILDER"
ARASUL_SITZUNG="$SITZUNG" arasul_sitzung_bauen "$TOKEN"
if ARASUL_URL="$BASIS" ARASUL_SITZUNG="$SITZUNG" ARASUL_KENNUNG="$KENNUNG" \
  ARASUL_BILDER="$BILDER" node "$WURZEL/scripts/test/bereich-quote-bilder.mjs"; then
  pruefe "Browser: Spalte Platz, kein seitliches Rollen, Grenze im Dialog angehoben" ja
else
  pruefe "Browser: Spalte Platz, kein seitliches Rollen, Grenze im Dialog angehoben" nein "siehe oben"
fi
rm -f "$SITZUNG"

# 5. Nach dem Anheben --------------------------------------------------------
echo "--- 5. Nach dem Anheben ---"
ruf GET /api/firmenordner/platz
GRENZE="$(lies "next((o['grenze'] for o in d['data']['ordner'] if o['kennung']=='$KENNUNG'), 'fehlt')")"
pruefe "die Grenze steht auf 200 MB (aus dem Dialog)" "$(ja "$GRENZE" $((200 * MB)))" "$GRENZE"
ruf GET "/api/firmenordner/passt?pfad=$KENNUNG&bytes=$((60 * MB))"
pruefe "passt mit 60 MB: jetzt 200" "$(ja "$CODE" 200)" "$CODE"
CODE_DAV="$(hochladen "$PRAEFIX-gross.bin")"
pruefe "und der Upload von 60 MB geht durch" \
  "$([ "$CODE_DAV" = 201 ] || [ "$CODE_DAV" = 204 ] && echo ja || echo nein)" "$CODE_DAV"
sleep 3
ruf GET /api/firmenordner/platz
BELEGT="$(lies "next((o['belegt'] for o in d['data']['ordner'] if o['kennung']=='$KENNUNG'), 0)")"
pruefe "und zaehlt danach als belegt" "$([ "${BELEGT:-0}" -ge $((60 * MB)) ] && echo ja || echo nein)" "$BELEGT"

# 6. Aufraeumen ---------------------------------------------------------------
echo "--- 6. Aufraeumen ---"
aufraeumen
ruf GET /api/firmenordner/ordner
UEBRIG="$(lies "sum(1 for o in d['data'] if o['kennung'].startswith('$PRAEFIX'))")"
pruefe "kein Probe-Bereich mehr am Geraet" "$(ja "$UEBRIG" 0)" "$UEBRIG"
ruf GET /api/firmenordner/rechte
UEBRIG="$(lies "sum(1 for r in d['data'] if r['ordner_kennung'].startswith('$PRAEFIX'))")"
pruefe "keine Rechte-Zeile mehr mit dem Stempel" "$(ja "$UEBRIG" 0)" "$UEBRIG"
ruf GET /api/firmenordner/papierkorb
IDS="$(lies "' '.join(str(p['ordner_id']) for p in d['data'])")"
RESTE=0
for id in $IDS; do
  ruf GET "/api/firmenordner/ordner/$id/papierkorb"
  n="$(lies "sum(1 for e in d['data']['eintraege'] if '$PRAEFIX' in (e.get('name','')+e.get('ort','')))")"
  RESTE=$((RESTE + ${n:-0}))
done
pruefe "kein Papierkorb nennt den Stempel" "$(ja "$RESTE" 0)" "$RESTE"

rm -f "$RUMPF" "$GROSS"
echo "--- $gruen gruen, $rot rot · Bilder: $BILDER ---"
[ "$rot" -eq 0 ]
