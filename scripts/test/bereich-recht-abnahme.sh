#!/bin/bash
# =============================================================================
# Abnahme: wer einen Bereich anlegt, schreibt darin (J34, 28.09.2026)
# =============================================================================
# Befund E der zweiten Generalprobe, gegen das laufende Geraet gemessen:
#
#   1. ANLEGEN GIBT RECHT. Acht Probe-Bereiche mit Stempel; nach jedem hat
#      der anlegende Administrator in `GET /api/firmenordner/rechte` eine
#      Zeile `schreiben` -- ohne dass jemand sie vergeben haette.
#   2. DIE MATRIX HAELT ACHT ORDNER AUS (Browser, `bereich-recht-bilder.mjs`):
#      bei 390 und 1440 px steht jeder Name ganz oder umgebrochen, und
#      seitlich rollt nur die Matrix selbst. Dazu zeigt die Matrix die Zelle
#      des Administrators auf jedem Probe-Bereich als `schreiben`.
#   3. WEGWERFEN IN EINEM SCHRITT (Browser): die Rueckfrage nennt den, der ein
#      Recht hat, die Kennung wird abgetippt, der Bereich ist weg -- und mit
#      ihm seine Rechte. Ohne `rechte=entziehen` bleibt es ein 409.
#   4. `sicht.md` TRAEGT DAS DATUM IN ORTSZEIT (Europe/Berlin).
#   5. AUFGERAEUMT OHNE REST: kein Probe-Bereich, keine Rechte-Zeile und kein
#      Eintrag im Papierkorb eines Raums nennt den Stempel.
#
# KEINE ZWEITE PERSON. Rechte bekommt nur der anlegende Administrator selbst;
# die Konten des Kunden am Geraet werden nicht angefasst. Angemeldet wird mit
# einem Token (`anmeldung.sh`), der Browser bekommt die Sitzung als Datei --
# er sieht nie ein Passwortfeld.
#
# Aufruf vom Arbeitsrechner:
#   ARASUL_URL=https://192.168.0.197 ARASUL_BENUTZER=admin \
#   ARASUL_PASSWORT="$(security find-generic-password -s 'Arasul Orin Admin' -a admin -w)" \
#   ARASUL_BILDER=<ordner> bash scripts/test/bereich-recht-abnahme.sh
#
# Wer den Lauf abbricht, raeumt mit `--nur-aufraeumen <stempel>` nach.
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
STEMPEL="$(date +%s)"
if [ "${1:-}" = "--nur-aufraeumen" ]; then
  STEMPEL="${2:?Stempel fehlt}"
fi
PRAEFIX="j34r-$STEMPEL"
# Acht Namen, zwei davon lang -- die Matrix soll an ihnen umbrechen, nicht
# abschneiden. Mit dem Praefix (16 Zeichen) bleibt jede Kennung unter den 40,
# die das Schema erlaubt.
NAMEN=(kunden company buchhaltung projekte personal-und-vertraege marketing
  einkauf-und-lieferanten geschaeftsleitung)
BILDER="${ARASUL_BILDER:-${TMPDIR:-/tmp}/bereich-recht-$STEMPEL}"
SITZUNG="${TMPDIR:-/tmp}/arasul-j34r-admin.json"

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

RUMPF="$(mktemp)"
CODE=""
ruf() {
  local verb="$1" pfad="$2" leib="${3:-}"
  local -a a=(-sk -o "$RUMPF" -w '%{http_code}' --max-time "${ARASUL_WEGWERF_GRENZE:-1200}"
    -X "$verb" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json')
  [ -n "$leib" ] && a+=(-d "$leib")
  CODE=$(curl "${a[@]}" "$BASIS$pfad")
}
# Liest aus dem letzten Rumpf per Python-Ausdruck ueber `d` (das JSON).
lies() {
  python3 -c "import sys,json
try: d = json.load(open(sys.argv[1]))
except Exception: d = None
print($1)" "$RUMPF" 2>/dev/null
}

TOKEN="$(arasul_token)"
if [ -z "$TOKEN" ]; then
  echo "ROT    keine Anmeldung ($(arasul_anmeldecode))"
  exit 1
fi
ruf GET /api/auth/me
ICH_ID="$(lies "(d.get('user') or d).get('id','')")"
ICH="$(lies "(d.get('user') or d).get('username','')")"

# Die Ordner-Zeilen dieses Laufs: "id kennung" je Zeile.
probeOrdner() {
  ruf GET /api/firmenordner/ordner
  lies "'\n'.join(f\"{o['id']} {o['kennung']}\" for o in (d.get('data') or []) if o['kennung'].startswith('$PRAEFIX'))"
}

aufraeumen() {
  local id kennung
  while read -r id kennung; do
    [ -n "$id" ] || continue
    ruf DELETE "/api/firmenordner/ordner/$id?kennung=$kennung&rechte=entziehen"
    echo "       weggeworfen: $kennung ($CODE)"
  done < <(probeOrdner)
}

if [ "${1:-}" = "--nur-aufraeumen" ]; then
  aufraeumen
  exit 0
fi

echo "--- Stempel $STEMPEL, angemeldet als $ICH ($ICH_ID) ---"

# 1. Anlegen gibt Recht --------------------------------------------------------
echo "--- 1. Anlegen ---"
for n in "${NAMEN[@]}"; do
  ruf POST /api/firmenordner/ordner \
    "{\"kennung\":\"$PRAEFIX-$n\",\"name\":\"Probe $n\",\"ebene\":1,\"art\":\"geteilt\"}"
  [ "$CODE" = "201" ] || pruefe "$PRAEFIX-$n anlegen" nein "$CODE $(head -c 200 "$RUMPF")"
done
ruf GET /api/firmenordner/rechte
MIT_SCHREIBEN="$(lies "sum(1 for r in d['data'] if r['ordner_kennung'].startswith('$PRAEFIX') and str(r['user_id'])=='$ICH_ID' and r['recht']=='schreiben')")"
ANDERE="$(lies "sum(1 for r in d['data'] if r['ordner_kennung'].startswith('$PRAEFIX') and str(r['user_id'])!='$ICH_ID')")"
pruefe "der anlegende Administrator schreibt auf allen acht Probe-Bereichen" \
  "$([ "$MIT_SCHREIBEN" = "8" ] && echo ja || echo nein)" "$MIT_SCHREIBEN von 8"
pruefe "und niemand sonst bekam ein Recht" "$([ "$ANDERE" = "0" ] && echo ja || echo nein)" "$ANDERE"
ruf GET /api/firmenordner/ordner
ANGEKOMMEN="$(lies "sum(1 for o in d['data'] if o['kennung'].startswith('$PRAEFIX') and o.get('raum_id'))")"
pruefe "alle acht sind im Firmenordner angekommen" \
  "$([ "$ANGEKOMMEN" = "8" ] && echo ja || echo nein)" "$ANGEKOMMEN von 8"

# 3a. Ohne rechte=entziehen bleibt es 409 --------------------------------------
read -r ERSTER_ID ERSTER < <(probeOrdner | head -1)
ruf DELETE "/api/firmenordner/ordner/$ERSTER_ID?kennung=$ERSTER"
pruefe "ohne rechte=entziehen wirft das Geraet einen Bereich mit Rechten nicht weg" \
  "$([ "$CODE" = "409" ] && echo ja || echo nein)" "$CODE"

# 2. und 3.: der Browser --------------------------------------------------------
echo "--- 2./3. Browser ---"
mkdir -p "$BILDER"
ARASUL_SITZUNG="$SITZUNG" arasul_sitzung_bauen "$TOKEN"
if ARASUL_URL="$BASIS" ARASUL_SITZUNG="$SITZUNG" ARASUL_PRAEFIX="$PRAEFIX" \
  ARASUL_ICH="$ICH" ARASUL_WEGWERFEN="$PRAEFIX-kunden" ARASUL_BILDER="$BILDER" \
  node "$WURZEL/scripts/test/bereich-recht-bilder.mjs"; then
  pruefe "Browser: Matrix und Wegwerfen" ja
else
  pruefe "Browser: Matrix und Wegwerfen" nein "siehe oben"
fi
rm -f "$SITZUNG"
ruf GET /api/firmenordner/ordner
WEG="$(lies "all(o['kennung']!='$PRAEFIX-kunden' for o in d['data'])")"
pruefe "$PRAEFIX-kunden ist am Geraet weg" "$([ "$WEG" = "True" ] && echo ja || echo nein)"
ruf GET /api/firmenordner/rechte
REST="$(lies "sum(1 for r in d['data'] if r['ordner_kennung']=='$PRAEFIX-kunden')")"
pruefe "und mit ihm seine Rechte" "$([ "$REST" = "0" ] && echo ja || echo nein)" "$REST"

# 4. sicht.md in Ortszeit ------------------------------------------------------
echo "--- 4. sicht.md ---"
ruf GET /api/firmenordner/sicht
HEUTE="$(TZ=Europe/Berlin date +%F)"
ZEILE="$(grep -m1 'Erzeugt vom Gerät am' "$RUMPF")"
# `[[ ]]` statt `case` in einer Kommandosubstitution: Bash 3.2 am Mac liest
# das `)` des Musters als Ende der Substitution. Und keine Pipe in `grep -q`:
# unter `pipefail` zerreisst sie beim ersten Treffer (`rohrbruch.py`).
pruefe "sicht.md traegt das Datum in Ortszeit ($HEUTE)" \
  "$([[ "$ZEILE" == *"am $HEUTE "* ]] && echo ja || echo nein)" "${ZEILE:0:60}"
PROBE_IN_SICHT="$(grep -c "$PRAEFIX-company/" "$RUMPF")"
pruefe "und nennt dem Administrator seinen neuen Bereich" \
  "$([ "$PROBE_IN_SICHT" -ge 1 ] && echo ja || echo nein)"

# 5. Aufraeumen ---------------------------------------------------------------
echo "--- 5. Aufraeumen ---"
aufraeumen
ruf GET /api/firmenordner/ordner
UEBRIG="$(lies "sum(1 for o in d['data'] if o['kennung'].startswith('$PRAEFIX'))")"
pruefe "kein Probe-Bereich mehr am Geraet" "$([ "$UEBRIG" = "0" ] && echo ja || echo nein)" "$UEBRIG"
ruf GET /api/firmenordner/rechte
UEBRIG="$(lies "sum(1 for r in d['data'] if r['ordner_kennung'].startswith('$PRAEFIX'))")"
pruefe "keine Rechte-Zeile mehr mit dem Stempel" "$([ "$UEBRIG" = "0" ] && echo ja || echo nein)" "$UEBRIG"
# Jeder Papierkorb, der antwortet: kein Eintrag nennt den Stempel.
ruf GET /api/firmenordner/papierkorb
IDS="$(lies "' '.join(str(p['ordner_id']) for p in d['data'])")"
RESTE=0
for id in $IDS; do
  ruf GET "/api/firmenordner/ordner/$id/papierkorb"
  n="$(lies "sum(1 for e in d['data']['eintraege'] if '$PRAEFIX' in (e.get('name','')+e.get('ort','')))")"
  RESTE=$((RESTE + ${n:-0}))
done
pruefe "kein Papierkorb nennt den Stempel" "$([ "$RESTE" = "0" ] && echo ja || echo nein)" "$RESTE"

rm -f "$RUMPF"
echo "--- $gruen gruen, $rot rot · Bilder: $BILDER ---"
[ "$rot" -eq 0 ]
