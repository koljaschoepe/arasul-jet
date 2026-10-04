#!/bin/bash
# =============================================================================
# Abnahme M5: Verwaltung Firmenordner (Baum, Stufen je Person, Anleitung)
# =============================================================================
# Die Abnahme des Auftrags verwaltung-firmenordner (04.10.2026), am Gerät.
#
# SICHERHEIT: der Firmenordner ist der echte Arbeitsordner. Diese Abnahme
# legt EINEN Bereich mit Stempel an (`probe-ordner-<stempel>`, Standard 1004)
# und ein Projekt darunter, gibt dem Probekonto `lesen` auf dem Bereich,
# misst und entfernt Rechte und Ordner am Ende wieder. Nichts, was nicht den
# Stempel trägt, wird angefasst; die Rechte des Kontos `admin` ebenso wenig.
#
#   ZAHL         `GET /api/firmenordner/ordner` nennt am Bereich 2 Personen
#                (die Verwaltung, die ihn anlegte, und das Probekonto).
#   STUFEN       `GET /api/firmenordner/rechte`: das Probekonto `lesen`, die
#                Verwaltung `schreiben`; das Projekt hat keine eigene Zeile.
#   KEINE ADRESSE Die Antworten des Browsers (Teil 2) zeigen in keinem Zustand
#                eine URL, IP oder WebDAV-Adresse.
#   BROWSER      `verwaltung-firmenordner-bilder.mjs`: Baum, Aufklappen,
#                Abgleich, 390 px, Personen ohne Ordnerrechte, die Anleitung
#                in den Einstellungen (Verwaltung und Mitarbeiter).
#   AUFGERÄUMT   Kein Ordner, keine Rechte-Zeile und kein Papierkorb nennt den
#                Stempel danach.
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
#   bash scripts/test/verwaltung-firmenordner-abnahme.sh
#
# Wer den Lauf abbricht, räumt mit `--nur-aufraeumen` nach.
# Rückgabe 0, wenn jede Prüfung grün war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
STEMPEL="${ARASUL_STEMPEL:-1004}"
BEREICH="probe-ordner-$STEMPEL"
PROJEKT="$BEREICH-p"
A="${ARASUL_A:-}"
A_PASS="${ARASUL_A_PASSWORT:-}"

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

for wer in "$ARASUL_BENUTZER" "$A"; do
  if [ "$wer" = "admin" ]; then
    echo "Nie das Konto admin: das ist ein echtes Konto. Probekonten nehmen."
    exit 1
  fi
done
if [ -z "$A" ] || [ -z "$A_PASS" ]; then
  echo "ARASUL_A und ARASUL_A_PASSWORT fehlen (vorhandenes Probekonto, z. B. probe-j36-a)."
  exit 1
fi

RUMPF="$(mktemp)"
CODE=""
ruf() {
  local verb="$1" pfad="$2" leib="${3:-}"
  local -a a=(-sk -o "$RUMPF" -w '%{http_code}' --max-time 120
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

TOKEN="$(arasul_token)"
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOKEN" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"
[ -n "$TOKEN" ] || exit 1

# Entfernt, was den Stempel trägt: erst das Projekt, dann den Bereich.
aufraeumen() {
  local id
  for kennung in "$PROJEKT" "$BEREICH"; do
    ruf GET /api/firmenordner/ordner
    id="$(lies "next((o['id'] for o in (d.get('data') or []) if o['kennung']=='$kennung'), '')")"
    [ -n "$id" ] || continue
    ruf DELETE "/api/firmenordner/ordner/$id?kennung=$kennung&rechte=entziehen"
    echo "       weggeworfen: $kennung ($CODE)"
  done
}

if [ "${1:-}" = "--nur-aufraeumen" ]; then
  aufraeumen
  exit 0
fi

# Von früher übrig? Dann zuerst weg, damit die Zahlen stimmen.
aufraeumen >/dev/null 2>&1

echo "--- Anlegen ---"
ruf POST /api/firmenordner/ordner \
  "{\"kennung\":\"$BEREICH\",\"name\":\"Probe Ordner $STEMPEL\",\"ebene\":1,\"art\":\"geteilt\"}"
pruefe "Bereich $BEREICH angelegt" "$(ja_wenn "$CODE" 201)" "$CODE $(head -c 160 "$RUMPF")"
ruf POST /api/firmenordner/ordner \
  "{\"kennung\":\"$PROJEKT\",\"name\":\"Probe Projekt $STEMPEL\",\"ebene\":2,\"art\":\"geteilt\",\"eltern\":\"$BEREICH\"}"
pruefe "Projekt $PROJEKT darunter angelegt" "$(ja_wenn "$CODE" 201)" "$CODE $(head -c 160 "$RUMPF")"

ruf GET /api/benutzer
ID_A="$(lies "next((str(b['id']) for b in (d.get('data') or d) if b['username']=='$A'), '')")"
pruefe "Probekonto $A gefunden" "$([ -n "$ID_A" ] && echo ja || echo nein)"
ruf GET /api/firmenordner/ordner
ID_BEREICH="$(lies "next((str(o['id']) for o in d['data'] if o['kennung']=='$BEREICH'), '')")"
ruf POST /api/firmenordner/rechte "{\"ordner_id\":\"$ID_BEREICH\",\"benutzer_id\":\"$ID_A\",\"recht\":\"lesen\"}"
pruefe "$A bekommt lesen auf dem Bereich" "$(case "$CODE" in 200|201) echo ja ;; *) echo nein ;; esac)" "$CODE"

echo "--- Zahl und Stufen am Gerät ---"
ruf GET /api/firmenordner/ordner
ZAHL="$(lies "next((o['rechte_anzahl'] for o in d['data'] if o['kennung']=='$BEREICH'), -1)")"
pruefe "Der Bereich nennt 2 Personen" "$(ja_wenn "$ZAHL" 2)" "$ZAHL"
ruf GET /api/firmenordner/rechte
STUFE_A="$(lies "next((r['recht'] for r in d['data'] if r['ordner_kennung']=='$BEREICH' and r['username']=='$A'), '')")"
STUFE_ICH="$(lies "next((r['recht'] for r in d['data'] if r['ordner_kennung']=='$BEREICH' and r['username']=='$ARASUL_BENUTZER'), '')")"
EIGENE_PROJEKT="$(lies "sum(1 for r in d['data'] if r['ordner_kennung']=='$PROJEKT')")"
pruefe "$A hat lesen" "$(ja_wenn "$STUFE_A" lesen)" "$STUFE_A"
pruefe "$ARASUL_BENUTZER hat schreiben (Anlegen gibt Recht)" "$(ja_wenn "$STUFE_ICH" schreiben)" "$STUFE_ICH"
ruf GET /api/firmenordner/ordner
ANGEKOMMEN="$(lies "sum(1 for o in d['data'] if o['kennung'] in ('$BEREICH','$PROJEKT') and o.get('raum_id'))")"
pruefe "Bereich und Projekt sind im Firmenordner angekommen" "$(ja_wenn "$ANGEKOMMEN" 2)" "$ANGEKOMMEN von 2"
pruefe "Das Projekt hat keine eigene Zeile (es erbt)" "$(ja_wenn "$EIGENE_PROJEKT" 0)" "$EIGENE_PROJEKT"

echo "--- Browser: scripts/test/verwaltung-firmenordner-bilder.mjs ---"
ARASUL_URL="$BASIS" ARASUL_BENUTZER="$ARASUL_BENUTZER" ARASUL_PASSWORT="$ARASUL_PASSWORT" \
  ARASUL_A="$A" ARASUL_A_PASSWORT="$A_PASS" FO_BEREICH="$BEREICH" FO_PROJEKT="$PROJEKT" \
  node "$WURZEL/scripts/test/verwaltung-firmenordner-bilder.mjs"
pruefe "Der Browser-Teil ist grün" "$([ $? -eq 0 ] && echo ja || echo nein)"

echo "--- Aufräumen ---"
aufraeumen
ruf GET /api/firmenordner/ordner
UEBRIG="$(lies "sum(1 for o in d['data'] if o['kennung'].startswith('$BEREICH'))")"
pruefe "Kein Ordner mit dem Stempel mehr" "$(ja_wenn "$UEBRIG" 0)" "$UEBRIG"
ruf GET /api/firmenordner/rechte
UEBRIG="$(lies "sum(1 for r in d['data'] if r['ordner_kennung'].startswith('$BEREICH'))")"
pruefe "Keine Rechte-Zeile mehr mit dem Stempel" "$(ja_wenn "$UEBRIG" 0)" "$UEBRIG"
ruf GET /api/firmenordner/papierkorb
IDS="$(lies "' '.join(str(p['ordner_id']) for p in d['data'])")"
RESTE=0
for id in $IDS; do
  ruf GET "/api/firmenordner/ordner/$id/papierkorb"
  n="$(lies "sum(1 for e in d['data']['eintraege'] if '$BEREICH' in (e.get('name','')+e.get('ort','')))")"
  RESTE=$((RESTE + ${n:-0}))
done
pruefe "Kein Papierkorb nennt den Stempel" "$(ja_wenn "$RESTE" 0)" "$RESTE"

rm -f "$RUMPF"
echo
echo "gruen: $gruen, ROT: $rot"
[ "$rot" -eq 0 ]
