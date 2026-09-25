#!/bin/bash
# =============================================================================
# Abnahme „KI-Aufrufe einer App im Protokoll" (J35, 26.09.2026)
# =============================================================================
# Eine Kanzlei muss nachweisen, welches Modell welchen Vorschlag gemacht hat.
# Ein Flow hinterlaesst dafuer einen Lauf; `document/extract-structured` ist
# keiner und stand bis hierher nur im Protokoll der App. Gemessen wird:
#
#   Ein Mitarbeiter laesst ueber die Proben-App (`tests/probe-ki`) einen Beleg
#   auslesen. Danach steht der Aufruf unter `GET /api/apps/:id/ki-aufrufe`
#   mit App, Stand, Mensch, Modell, Dauer und Auftrag -- und OHNE Inhalt:
#   weder der Text der Datei noch ihr Name noch die Antwort.
#
#   Gegenproben: ohne Kopfzeile steht der Aufruf ohne Menschen da; ein Name,
#   dem die App nicht freigegeben ist, ist ein 400 und hinterlaesst keinen
#   Aufruf. Und das Protokoll ueberlebt das Entfernen der App.
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-ki` (samt Image), einen
# Mitarbeiter mit Stempel, einen Wegwerf-Schluessel. Die Zeilen im Protokoll
# BLEIBEN -- das ist die Zusage, die hier gemessen wird.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/ki-aufrufe-abnahme.sh
# Optional ARASUL_PROBE_MODELL=gemma4:e4b (schneller als das Standardmodell).
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-ki"
APP="${ARASUL_PROBE_APP:-probe-ki}"
MODELL="${ARASUL_PROBE_MODELL:-}"
STEMPEL="$(date +%H%M%S)"
M1="abnahme-ki-$STEMPEL"
PASS="Abnahme-$STEMPEL!"
# Was in der Datei steht und wie sie heisst -- beides darf im Protokoll nie
# auftauchen.
INHALT="Honorarnote-Geheim-$STEMPEL ueber 12,00 EUR"
DATEINAME="mandant-mueller-$STEMPEL.txt"
GEDULD=900

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
fehlt() { if grep -q -- "$2" <<<"$1"; then echo nein; else echo ja; fi; }

RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""

ruf() {
  local wer="$1" verb="$2" pfad="$3" leib="${4:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD")
  case "$wer" in
    schluessel:*) argumente+=(-H "x-api-key: ${wer#schluessel:}") ;;
    *) argumente+=(-H "authorization: Bearer $wer") ;;
  esac
  [ -n "$leib" ] && argumente+=(-H 'content-type: application/json' -d "$leib")
  CODE=$(curl "${argumente[@]}" "$BASIS$pfad")
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }

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
    if d is None: break
print("" if d is None else (json.dumps(d) if isinstance(d,(bool,dict,list)) else d))' "$1" 2>/dev/null
}

# Die Zeile des Protokolls zu einem Auftrag, als JSON (leer, wenn es keine gibt).
zeile_zu() {
  python3 -c 'import sys,json
job = sys.argv[1]
try: liste = json.load(sys.stdin)["data"]
except Exception: print(""); raise SystemExit
for z in liste:
    if z.get("job_id") == job:
        print(json.dumps(z)); raise SystemExit
print("")' "$1" 2>/dev/null
}

anmelden() {
  curl -sk -X POST -H 'content-type: application/json' --max-time 30 \
    -d "{\"username\":\"$1\",\"password\":\"$PASS\"}" "$BASIS/api/auth/login" | feld token
}

baue_paket() {
  local ordner="$ARBEIT/paket"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" <<'PY'
import json, sys
quelle, ziel, kennung = sys.argv[1:4]
m = json.load(open(quelle))
m["id"] = kennung
m["backend"]["image"] = "arasul-%s:%s" % (kennung, m["version"])
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket.tgz"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme KI-Aufrufe im Protokoll (J35) gegen $BASIS ==="
echo

# --- 1. Zugaenge -------------------------------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }

SCHLUESSEL=""
KEY_ID=""
ID_M1=""
aufraeumen() {
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  [ -n "$ID_M1" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
    -H "authorization: Bearer $TOK" "$BASIS/api/benutzer/$ID_M1"
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  %s entfernt, Mitarbeiter geloescht, Wegwerf-Schluessel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme J35 (ki-aufrufe)","allowed_endpoints":["app:deploy"]}' \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

ruf "$TOK" POST /api/benutzer \
  "{\"username\":\"$M1\",\"password\":\"$PASS\",\"email\":\"$M1@abnahme.local\",\"rolle\":\"mitarbeiter\"}"
ID_M1=$(rumpf | feld data.id)
pruefe 'Wegwerf-Mitarbeiter angelegt' "$([ -n "$ID_M1" ] && echo ja || echo nein)" "$M1=$ID_M1"
TOK_M1=$(anmelden "$M1")
pruefe 'und meldet sich an' "$([ -n "$TOK_M1" ] && echo ja || echo nein)"
[ -z "$TOK_M1" ] && exit 1

# --- 2. Der Kontrakt nennt das Protokoll -------------------------------------
ruf "schluessel:$SCHLUESSEL" GET /api/v1/external/contract
pruefe 'Der Kontrakt nennt das Protokoll und den Kopf' \
  "$(ja_wenn "$(rumpf | feld data.protokoll.einreicher.kopf)" X-Arasul-User)" \
  "kontrakt=$(rumpf | feld data.kontrakt)"

# --- 3. Einspielen und freigeben ---------------------------------------------
PAKET=$(baue_paket)
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$PAKET" "$BASIS/api/v1/external/apps")
pruefe "$APP in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe 'live geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ID_M1}"
pruefe 'Dem Mitarbeiter freigegeben' "$([[ "$CODE" =~ ^20[01]$ ]] && echo ja || echo nein)" \
  "HTTP $CODE"

LIVE="/apps/$APP/api"
ende=$((SECONDS + 180))
while [ "$SECONDS" -lt "$ende" ]; do
  ruf "$TOK_M1" GET "$LIVE/gesund"
  [ "$CODE" = "200" ] && break
  sleep 3
done
pruefe 'Die App antwortet dem Mitarbeiter' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

# --- 4. Ein Beleg, ausgelesen fuer den Mitarbeiter ----------------------------
TEXT_Q=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$INHALT")
MODELL_Q="${MODELL:+&modell=$MODELL}"
echo "        (das Modell liest den Beleg, am Jetson bis zu einigen Minuten)"
ruf "$TOK_M1" POST "$LIVE/beleg?text=$TEXT_Q&datei=$DATEINAME$MODELL_Q"
JOB=$(rumpf | feld job_id)
MODELL_ANTWORT=$(rumpf | feld modell)
pruefe 'document/extract-structured antwortet (kein Flow)' \
  "$([ "$CODE" = "200" ] && [ -n "$JOB" ] && echo ja || echo nein)" \
  "HTTP $CODE job=${JOB:-—} modell=${MODELL_ANTWORT:-—} $(rumpf | feld fehler)"

# Die Zeile schliesst der Dienst, sobald er den fertigen Auftrag sieht
# (Takt eine Sekunde); ein paar Sekunden Geduld.
ZEILE=""
ende=$((SECONDS + 30))
while [ "$SECONDS" -lt "$ende" ]; do
  ruf "$TOK" GET "/api/apps/$APP/ki-aufrufe"
  ALLES="$(rumpf)"
  ZEILE=$(printf '%s' "$ALLES" | zeile_zu "$JOB")
  [ -n "$ZEILE" ] && [ "$(printf '%s' "$ZEILE" | feld status)" != "laeuft" ] && break
  sleep 2
done
pruefe 'Der Aufruf steht im Protokoll des Geraets' "$([ -n "$ZEILE" ] && echo ja || echo nein)" \
  "HTTP $CODE"
if [ -n "$ZEILE" ]; then
  z() { printf '%s' "$ZEILE" | feld "$1"; }
  pruefe 'mit der App und dem Stand' \
    "$([ "$(z app_id)" = "$APP" ] && [ "$(z stand)" = live ] && echo ja || echo nein)" \
    "app=$(z app_id) stand=$(z stand)"
  pruefe 'mit dem Menschen, fuer den die App fragte' "$(ja_wenn "$(z benutzer_name)" "$M1")" \
    "benutzer=$(z benutzer_name)"
  pruefe 'mit dem Modell, das geantwortet hat' \
    "$([ -n "$(z modell)" ] && [ "$(z modell)" = "$MODELL_ANTWORT" ] && echo ja || echo nein)" \
    "modell=$(z modell)"
  DAUER=$(z dauer_ms)
  pruefe 'mit Dauer und Ausgang' \
    "$([ "$(z status)" = fertig ] && [ "${DAUER:-0}" -gt 0 ] && echo ja || echo nein)" \
    "status=$(z status) dauer_ms=${DAUER:-—}"
  pruefe 'mit dem Weg' "$(ja_wenn "$(z endpunkt)" document/extract-structured)"
  SHA=$(z antwort_sha256)
  pruefe 'mit dem sha256 der Antwort' "$([[ "$SHA" =~ ^[0-9a-f]{64}$ ]] && echo ja || echo nein)"
  pruefe 'mit Art der Datei, aber nicht ihrem Namen' \
    "$([ "$(z datei_typ)" = text/plain ] && [ "$(fehlt "$ALLES" "$DATEINAME")" = ja ] && echo ja || echo nein)" \
    "typ=$(z datei_typ)"
  pruefe 'und ohne den Inhalt der Datei' "$(fehlt "$ALLES" "Honorarnote-Geheim-$STEMPEL")"
fi

# --- 5. Gegenproben ----------------------------------------------------------
ruf "$TOK" GET "/api/apps/$APP/ki-aufrufe"
VORHER=$(rumpf | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))' 2>/dev/null)
ruf "$TOK_M1" POST "$LIVE/beleg?als=niemand-$STEMPEL$MODELL_Q"
pruefe 'Ein Name ohne Freigabe: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
ruf "$TOK" GET "/api/apps/$APP/ki-aufrufe"
NACHHER=$(rumpf | python3 -c 'import sys,json;print(len(json.load(sys.stdin)["data"]))' 2>/dev/null)
pruefe 'und kein Aufruf im Protokoll' "$(ja_wenn "$VORHER" "$NACHHER")" "$VORHER -> $NACHHER"

ruf "$TOK_M1" POST "$LIVE/beleg?ohne_kopf=1$MODELL_Q"
JOB2=$(rumpf | feld job_id)
pruefe 'Ohne Kopfzeile laeuft der Aufruf' "$([ "$CODE" = "200" ] && [ -n "$JOB2" ] && echo ja || echo nein)" \
  "HTTP $CODE"
ruf "$TOK" GET "/api/apps/$APP/ki-aufrufe"
ZEILE2=$(rumpf | zeile_zu "$JOB2")
pruefe 'und steht ohne Menschen im Protokoll' \
  "$([ -n "$ZEILE2" ] && [ -z "$(printf '%s' "$ZEILE2" | feld benutzer_name)" ] && echo ja || echo nein)"

ruf "$TOK_M1" GET "/api/apps/$APP/ki-aufrufe"
pruefe 'Ein Mitarbeiter liest das Protokoll nicht: 403' "$(ja_wenn "$CODE" 403)" "HTTP $CODE"

# --- 6. Im Browser des Administrators ----------------------------------------
# Solange die App noch da ist: die Verwaltung oeffnet sie ueber ihre Liste.
SITZUNG_A="${TMPDIR:-/tmp}/arasul-ki-aufrufe-sitzung.json"
(
  # shellcheck disable=SC2034  # von `arasul_sitzung_bauen` aus der Umgebung gelesen
  ARASUL_SITZUNG="$SITZUNG_A"
  arasul_sitzung_bauen "$TOK"
)
if ! node -e "require.resolve('playwright')" 2>/dev/null; then
  pruefe 'Im Browser: der Aufruf in Einstellungen -> Apps' nein \
    'playwright fehlt: npm install --no-save playwright'
elif ARASUL_URL="$BASIS" ARASUL_SITZUNG_ADMIN="$SITZUNG_A" ARASUL_APP="$APP" \
  ARASUL_JOB="$JOB" ARASUL_MENSCH="$M1" ARASUL_MODELL="$MODELL_ANTWORT" \
  ARASUL_VERBOTEN="Honorarnote-Geheim-$STEMPEL|$DATEINAME" \
  node "$WURZEL/scripts/test/ki-aufrufe-bilder.mjs"; then
  pruefe 'Im Browser: der Aufruf in Einstellungen -> Apps' ja 'docs/plans/audits/'
else
  pruefe 'Im Browser: der Aufruf in Einstellungen -> Apps' nein 'ki-aufrufe-bilder.mjs war rot'
fi
rm -f "$SITZUNG_A"

# --- 7. Das Protokoll ueberlebt die App --------------------------------------
ruf "schluessel:$SCHLUESSEL" DELETE "/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
pruefe 'Die App wird entfernt' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK" GET "/api/apps/$APP/ki-aufrufe"
pruefe 'und ihr Protokoll ist weiter da' \
  "$([ -n "$(rumpf | zeile_zu "$JOB")" ] && echo ja || echo nein)" "HTTP $CODE"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
