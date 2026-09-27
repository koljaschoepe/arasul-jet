#!/bin/bash
# =============================================================================
# Abnahme: Papierkorb und Adresse des Firmenordners (J34, 27.09.2026)
# =============================================================================
# Gemessen wird gegen das laufende Geraet, was der Auftrag
# papierkorb-und-adresse-des-firmenordners zusagt:
#
#   1. DIE ADRESSE. `GET /api/firmenordner` nennt als `adresse` den Namen, unter
#      dem dieser Lauf das Geraet erreicht, und unter `adressen` daneben den
#      mDNS-Namen -- und jede genannte Adresse antwortet vom Rechner dieses
#      Laufs aus (der Dienst sagt `401` ohne Anmeldung, also ist er es).
#   2. DER PAPIERKORB. Gestempelte Probe-Eintraege im Hauptordner, als
#      Administrator ueber WebDAV angelegt und geloescht: die Verwaltung zaehlt
#      sie, holt einen zurueck (und verweigert es, wenn am alten Ort etwas
#      liegt), entfernt einen einzeln und leert den Rest -- vorher n, nachher 0,
#      gemessen mit PROPFIND auf `trash-bin` und nicht nur mit der Antwort.
#   3. DAS PROTOKOLL. Leeren, Zurueckholen und Entfernen stehen in
#      `audit_logs` (ueber SSH, wenn `ARASUL_GERAET` gesetzt ist).
#
# SIE LEERT NUR, WAS IHR GEHOERT. Liegt im Papierkorb des Hauptordners vorher
# schon etwas Fremdes, bricht sie ab, bevor sie etwas anlegt: das Leeren nimmt
# den ganzen Papierkorb, und ein fremder Eintrag ist womoeglich das, was ein
# Mensch morgen zurueckholen will.
#
# Aufruf vom Arbeitsrechner, direkt ueber das LAN (kein Tunnel noetig -- das
# ist gerade die Frage):
#   ARASUL_URL=https://192.168.0.197 ARASUL_PASSWORT=... \
#     ARASUL_GERAET=arasul@192.168.0.197 bash scripts/test/papierkorb-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
STEMPEL="pk-$(date +%Y%m%d-%H%M%S)"
BEGINN="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

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
ja_nein() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }

RUMPF="$(mktemp)"
trap 'rm -f "$RUMPF"' EXIT
CODE=""

ruf() {
  local verb="$1" pfad="$2" leib="${3:-}"
  local -a a=(-sk -o "$RUMPF" -w '%{http_code}' --max-time 600 -X "$verb"
    -H "authorization: Bearer $TOKEN" -H 'content-type: application/json')
  [ -n "$leib" ] && a+=(-d "$leib")
  CODE=$(curl "${a[@]}" "$BASIS$pfad")
}

# Ein Feld aus der letzten Antwort, mit Punkten fuer die Tiefe.
feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    if isinstance(d, list):
        try: d = d[int(k)]
        except Exception: d = None
    elif isinstance(d, dict): d = d.get(k)
    else: d = None
    if d is None: print(""); raise SystemExit
print(json.dumps(d) if isinstance(d,(list,dict)) else ("true" if d is True else "false" if d is False else d))' \
    "$1" < "$RUMPF" 2>/dev/null
}

# WebDAV als Administrator, mit seinem Passwort -- derselbe Weg wie sein
# Klient. Das Passwort geht ueber eine Konfigurationsdatei auf STDIN und nicht
# als Argument, sonst stuende es in `ps`.
dav() {
  local verb="$1" weg="$2"
  shift 2
  printf 'user = "%s:%s"\n' "$ARASUL_BENUTZER" "$ARASUL_PASSWORT" |
    curl -sk -K - -o "$RUMPF" -w '%{http_code}' --max-time 60 -X "$verb" "$@" "$DIENST$weg"
}

# Wie viele Eintraege der Papierkorb eines Raums im PROPFIND traegt (ohne ihn selbst).
papierkorb_zahl() {
  dav PROPFIND "/dav/spaces/trash-bin/$RAUM_URL" -H 'Depth: 1' > /dev/null
  python3 -c 'import sys,re
t = sys.stdin.read()
print(len(re.findall(r"<[a-z0-9]*:?trashbin-original-location[^>]*>[^<]+<", t)))' < "$RUMPF"
}

echo "== Papierkorb und Adresse des Firmenordners, Stempel $STEMPEL, gegen $BASIS"

if ! arasul_geraet_erreichbar; then
  echo "Kein Geraet unter $BASIS."
  exit 1
fi
TOKEN="$(arasul_token)"
if [ -z "$TOKEN" ]; then
  echo "Anmeldung als $ARASUL_BENUTZER ging nicht (HTTP $(arasul_anmeldecode))."
  exit 1
fi

# --- 1. Die Adresse ---------------------------------------------------------
echo "-- 1. Die Adresse"
ruf GET /api/firmenordner
pruefe "GET /api/firmenordner antwortet" "$(ja_nein "$CODE" 200)" "$CODE"
ADRESSE="$(feld data.adresse)"
ADRESSEN="$(feld data.adressen)"
AUFRUFER_HOST="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.urlsplit(sys.argv[1]).hostname or "")' "$BASIS")"
pruefe "adresse folgt dem Namen dieses Laufs ($AUFRUFER_HOST)" \
  "$(python3 -c 'import sys,urllib.parse; print("ja" if urllib.parse.urlsplit(sys.argv[1]).hostname==sys.argv[2] else "nein")' "$ADRESSE" "$AUFRUFER_HOST")" \
  "$ADRESSE"
pruefe "adressen nennt den mDNS-Namen" \
  "$(case "$ADRESSEN" in *'.local:'*) echo ja ;; *) echo nein ;; esac)" "$ADRESSEN"
for a in $(python3 -c 'import sys,json; print(" ".join(json.loads(sys.argv[1] or "[]")))' "$ADRESSEN"); do
  code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 -X PROPFIND "$a/dav/spaces/")
  # 401 heisst: der Dateidienst selbst hat geantwortet (Traefik kennt auf 8443
  # nur ihn). 000 heisst: der Name loest nicht auf oder nichts antwortet.
  pruefe "von hier erreichbar: $a" "$(ja_nein "$code" 401)" "$code"
done
DIENST="${ARASUL_FIRMENORDNER:-$ADRESSE}"

# --- 2. Der Papierkorb --------------------------------------------------------
echo "-- 2. Der Papierkorb"
ruf GET /api/firmenordner/ordner
WURZEL_ID="$(python3 -c 'import sys,json
d=json.load(sys.stdin)
w=[o for o in d.get("data",[]) if o.get("art")=="wurzel"]
print(w[0]["id"] if w else "")' < "$RUMPF")"
RAUM="$(python3 -c 'import sys,json
d=json.load(sys.stdin)
w=[o for o in d.get("data",[]) if o.get("art")=="wurzel"]
print(w[0]["raum_id"] or "" if w else "")' < "$RUMPF")"
if [ -z "$WURZEL_ID" ] || [ -z "$RAUM" ]; then
  pruefe "Hauptordner vorhanden und im Firmenordner bekannt" nein
  exit 1
fi
RAUM_URL="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$RAUM")"

VORHER_FREMD="$(papierkorb_zahl)"
if [ "$VORHER_FREMD" != "0" ]; then
  echo "Im Papierkorb des Hauptordners liegen schon $VORHER_FREMD fremde Eintraege."
  echo "Diese Abnahme leert den ganzen Papierkorb und bricht deshalb hier ab."
  exit 1
fi
pruefe "Papierkorb vorher ohne fremde Eintraege" ja "PROPFIND 0"

# Drei Dateien und ein Ordner mit einer Datei, alle mit Stempel, alle geloescht.
N=0
for i in 1 2 3; do
  code=$(printf 'Probe %s\n' "$STEMPEL" | dav PUT "/dav/spaces/$RAUM_URL/$STEMPEL-$i.txt" --data-binary @-)
  pruefe "PUT $STEMPEL-$i.txt als $ARASUL_BENUTZER" "$(ja_nein "$code" 201)" "$code"
done
code=$(dav MKCOL "/dav/spaces/$RAUM_URL/$STEMPEL-ordner")
pruefe "MKCOL $STEMPEL-ordner" "$(ja_nein "$code" 201)" "$code"
code=$(printf 'drin\n' | dav PUT "/dav/spaces/$RAUM_URL/$STEMPEL-ordner/drin.txt" --data-binary @-)
for w in "$STEMPEL-1.txt" "$STEMPEL-2.txt" "$STEMPEL-3.txt" "$STEMPEL-ordner"; do
  code=$(dav DELETE "/dav/spaces/$RAUM_URL/$w")
  [ "$code" = "204" ] && N=$((N + 1))
done
pruefe "vier Probe-Eintraege geloescht" "$(ja_nein "$N" 4)" "$N"

ZAHL="$(papierkorb_zahl)"
pruefe "PROPFIND auf trash-bin zaehlt n = 4" "$(ja_nein "$ZAHL" 4)" "$ZAHL"
ruf GET /api/firmenordner/papierkorb
UEBERSICHT="$(python3 -c 'import sys,json
d=json.load(sys.stdin)
print(next((str(p.get("anzahl")) for p in d.get("data",[]) if str(p.get("ordner_id"))==sys.argv[1]), ""))' "$WURZEL_ID" < "$RUMPF")"
pruefe "die Verwaltung zaehlt dieselben 4" "$(ja_nein "$UEBERSICHT" 4)" "$UEBERSICHT"

ruf GET "/api/firmenordner/ordner/$WURZEL_ID/papierkorb"
eintrag_von() {
  python3 -c 'import sys,json
d=json.load(sys.stdin)
print(next((e["id"] for e in d["data"]["eintraege"] if e["ort"]==sys.argv[1]), ""))' "$1" < "$RUMPF"
}
E1="$(eintrag_von "$STEMPEL-1.txt")"
E2="$(eintrag_von "$STEMPEL-2.txt")"
E3="$(eintrag_von "$STEMPEL-3.txt")"
pruefe "die Liste nennt jeden Eintrag mit seinem Ort" \
  "$([ -n "$E1" ] && [ -n "$E2" ] && [ -n "$E3" ] && echo ja || echo nein)"

# Zurueckholen: an den alten Ort, und danach liegt die Datei wieder da.
ruf POST "/api/firmenordner/ordner/$WURZEL_ID/papierkorb/$E1/wiederherstellen" '{}'
pruefe "Zurueckholen antwortet 200" "$(ja_nein "$CODE" 200)" "$CODE"
code=$(dav GET "/dav/spaces/$RAUM_URL/$STEMPEL-1.txt")
pruefe "die Datei liegt wieder an ihrer Stelle" "$(ja_nein "$code" 200)" "$code"
code=$(dav DELETE "/dav/spaces/$RAUM_URL/$STEMPEL-1.txt")

# Ueberschrieben wird nie: liegt am alten Ort etwas, ist es 409.
code=$(printf 'neu\n' | dav PUT "/dav/spaces/$RAUM_URL/$STEMPEL-2.txt" --data-binary @-)
ruf POST "/api/firmenordner/ordner/$WURZEL_ID/papierkorb/$E2/wiederherstellen" '{}'
pruefe "Zurueckholen auf einen besetzten Ort ist 409" "$(ja_nein "$CODE" 409)" "$CODE $(feld error.message)"
code=$(dav DELETE "/dav/spaces/$RAUM_URL/$STEMPEL-2.txt")

# Einen einzeln entfernen.
VOR_EINZELN="$(papierkorb_zahl)"
ruf DELETE "/api/firmenordner/ordner/$WURZEL_ID/papierkorb/$E3"
pruefe "einen Eintrag endgueltig entfernen antwortet 200" "$(ja_nein "$CODE" 200)" "$CODE"
NACH_EINZELN="$(papierkorb_zahl)"
pruefe "danach einer weniger" "$(ja_nein "$NACH_EINZELN" "$((VOR_EINZELN - 1))")" "$VOR_EINZELN -> $NACH_EINZELN"

# Leeren: vorher n, nachher 0 -- in der Antwort UND im PROPFIND.
VOR_LEEREN="$(papierkorb_zahl)"
ruf DELETE "/api/firmenordner/ordner/$WURZEL_ID/papierkorb"
pruefe "Leeren antwortet 200" "$(ja_nein "$CODE" 200)" "$CODE"
pruefe "die Antwort nennt vorher n = $VOR_LEEREN" "$(ja_nein "$(feld data.vorher)" "$VOR_LEEREN")" "$(feld data.vorher)"
pruefe "die Antwort nennt nachher 0" "$(ja_nein "$(feld data.nachher)" 0)" "$(feld data.nachher)"
NACHHER="$(papierkorb_zahl)"
pruefe "PROPFIND auf trash-bin danach: 0" "$(ja_nein "$NACHHER" 0)" "vorher $VOR_LEEREN, nachher $NACHHER"

# Ohne Anmeldung kommt niemand an den Papierkorb.
code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$BASIS/api/firmenordner/papierkorb")
pruefe "ohne Anmeldung 401" "$(ja_nein "$code" 401)" "$code"

# --- 3. Das Protokoll ---------------------------------------------------------
echo "-- 3. Das Protokoll"
if [ -n "${ARASUL_GERAET:-}" ]; then
  ZEILEN="$(ssh -o BatchMode=yes "$ARASUL_GERAET" \
    "docker exec postgres-db psql -U arasul -d arasul_db -At -c \"SELECT action FROM audit_logs WHERE action LIKE 'firmenordner_papierkorb_%' AND timestamp >= '$BEGINN' ORDER BY timestamp\"" 2>/dev/null)"
  for a in firmenordner_papierkorb_wiederhergestellt firmenordner_papierkorb_eintrag_entfernt firmenordner_papierkorb_geleert; do
    pruefe "audit_logs: $a" "$(case "$ZEILEN" in *"$a"*) echo ja ;; *) echo nein ;; esac)"
  done
else
  echo "(ohne ARASUL_GERAET kein Blick in audit_logs)"
fi

echo "== $gruen gruen, $rot rot"
[ "$rot" -eq 0 ]
