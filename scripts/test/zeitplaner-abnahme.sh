#!/bin/bash
# =============================================================================
# Abnahme M5: der Zeitplaner im Geraet, Flows nach Zeitplan, Pause je Flow
# =============================================================================
# Die Abnahme des Auftrags zeitplaner-im-geraet (04.10.2026). Probe-App
# `tests/probe-zeitplan` mit sieben Flows, DETERMINISTISCH OHNE MODELL: wo ein
# Flow rechnet, rechnet er ueber den Weg des Administrators mit einem externen
# Modell, das die Probe-App selbst ist und immer „Fertig." antwortet.
#
#   takt        jede Minute (der Zeitplan fuer die Messung)
#   warten      jede Minute, haelt an einer Freigabe: der naechste Termin
#               findet einen laufenden Lauf vor
#   nachholen   sein Termin lag 15 Minuten vor dem Einspielen
#   verpasst    sein Termin lag drei Stunden vor dem Einspielen
#   taeglich    0 6 * * *: die Uhrzeit gilt in der Zeit des Geraets
#   viertel     alle 15 Minuten (mehrere verpasste Termine)
#   von-hand    hat keinen Zeitplan
#
#   ANZEIGE      Der naechste Termin steht in der Liste der Flows, in der
#                Zeitzone des Geraets (Europe/Berlin, 06:00 ist 06:00 Berliner
#                Zeit, Sommerzeit eingerechnet); im Teststand laeuft keiner.
#   EINMAL       Jede Minute ein Lauf, nie zwei in derselben Minute, jeder
#                mit Ausloeser `zeitplan`, im Livestand, ohne Einreicher, und
#                je Lauf genau ein Termin in `flow_zeitplan_termine`.
#   KEIN ZWEITER Haelt ein Lauf an einer Freigabe, startet der naechste Termin
#                keinen zweiten; der Grund steht an der Seite der App.
#   PAUSE        Pausiert startet nichts nach Zeitplan; der Schalter `aktiv`
#                bleibt, der Start von Hand laeuft. Nach dem Fortsetzen kommt
#                genau der naechste Termin, nichts Nachgeholtes. Ein
#                ausgeschalteter Flow startet auch nach Zeitplan nicht.
#   NEUSTART     Das Backend wird neu gestartet (ARASUL_NEUSTART_BEFEHL), die
#                Laeufe gehen danach weiter und kein Termin laeuft doppelt.
#   AUSFALL      Der Zeitplaner sieht vier Stunden zurueck (die Marke
#                `flow_zeitplaner.geprueft_bis` wird zurueckgesetzt, als sei das
#                Geraet so lange aus gewesen): `takt` laeuft einmal (nicht 240
#                Mal), `nachholen` wird einmal nachgeholt, `verpasst` wird
#                uebersprungen und steht mit Grund an der Seite der App.
#   GRENZEN      Eine Pause fuer einen Flow ohne Zeitplan ist 400, fuer einen
#                unbekannten 404; ein Ausdruck, den das Geraet nicht lesen
#                kann, wird beim Einspielen abgewiesen.
#
# Gebraucht wird ein ssh-Zugang zum Geraet (ARASUL_GERAET): die Messung liest
# `flow_runs` und `flow_zeitplan_termine` selbst und startet das Backend neu.
# Konto: das vorhandene `probe-admin`, nie `admin`; Passwort nur zur Laufzeit.
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_GERAET=jetson bash scripts/test/zeitplaner-abnahme.sh
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-zeitplan-<MMDD>` (samt Image und
# Ordner), die Freigabe an probe-admin, den Wegwerf-Schluessel. Vorher werden
# alle Zeitplaene der App pausiert und offene Laeufe abgebrochen.
#
# Dauer: etwa 20 Minuten (es wird auf echte Minuten gewartet).
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-zeitplan"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP="${ARASUL_ZEITPLAN_APP:-probe-zeitplan-$STEMPEL}"
VERSION="1.0.0"
GERAET="${ARASUL_GERAET:-}"
NEUSTART_BEFEHL="${ARASUL_NEUSTART_BEFEHL:-ssh -o BatchMode=yes $GERAET docker restart dashboard-backend}"
ZONE="Europe/Berlin"
GEDULD=900
NEUSTART_GEDULD=240
# Die Flows mit Zeitplan; sie ruhen, bis die Messung sie fortsetzt.
ZEITFLOWS="takt warten nachholen verpasst taeglich viertel"
ANZAHL_ZEITFLOWS=6

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

if [ -z "$GERAET" ]; then
  echo "ARASUL_GERAET fehlt (ssh-Ziel des Geraets, z. B. jetson): die Messung liest die Datenbank und startet das Backend neu."
  exit 1
fi
if [ "$ARASUL_BENUTZER" = "admin" ]; then
  echo "Nie das Konto admin: das ist ein echtes Konto. probe-admin nehmen."
  exit 1
fi

RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""

# ruf <token|schluessel:…> <verb> <pfad> [leib] -- setzt $CODE, Rumpf in $RUMPF_DATEI
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
print("" if d is None else (json.dumps(d, ensure_ascii=False) if isinstance(d,(bool,dict,list)) else d))' "$1" 2>/dev/null
}

# SQL am Geraet, ueber stdin (keine Anfuehrungszeichen-Hoelle). Ausgabe: Spalten mit |.
db() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" \
    "docker exec -i postgres-db psql -U arasul -d arasul_db -At -F '|' -v ON_ERROR_STOP=1" <<<"$1" 2>/dev/null
}

# Anzahl Laeufe eines Flows dieser App, optional mit Ausloeser.
laeufe() { # flow [ausloeser]
  local bed=""
  [ -n "${2:-}" ] && bed="AND ausloeser = '$2'"
  db "SELECT count(*) FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND flow_name = '$1' $bed;"
}
# Der juengste Termin-Eintrag eines Flows: ergebnis|grund.
letzter_eintrag() { # flow
  db "SELECT ergebnis || '|' || coalesce(grund, '') FROM public.flow_zeitplan_termine WHERE app_id = '$APP' AND flow_name = '$1' ORDER BY termin DESC LIMIT 1;"
}

# Der Zeitplan "M H * * *" fuer die Uhrzeit von vor $1 Minuten in der Zeit des Geraets.
ausdruck_vor() {
  python3 - "$1" "$ZONE" <<'PY'
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
t = datetime.now(ZoneInfo(sys.argv[2])) - timedelta(minutes=int(sys.argv[1]))
print(f"{t.minute} {t.hour} * * *")
PY
}

status_von() { db "SELECT status FROM flow_runs WHERE id = $1;"; }
# n mal ' 200' als erwartete Codes
lauter_200() { local s="" i; for ((i = 0; i < $1; i++)); do s="$s 200"; done; printf '%s' "$s"; }

# Sekunden bis zur naechsten vollen Minute (nach der Uhr dieses Rechners).
bis_zur_minute() { echo $((60 - $(date +%s) % 60)); }
# Auf den Beginn der naechsten Minute plus $1 Sekunden warten.
warte_minute_plus() { sleep $(($(bis_zur_minute) + $1)); }

# Wartet, bis der Befehl $2 gelingt (Geduld $1 Sekunden, alle 5 s).
warte_bis() {
  local ende=$((SECONDS + $1))
  while [ "$SECONDS" -lt "$ende" ]; do
    if eval "$2"; then return 0; fi
    sleep 5
  done
  return 1
}

# Ein Flow der App aus der Liste (Stand, Name) als JSON.
flow_json() {
  ruf "$TOK" GET "/api/apps/$APP/flows"
  rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
liste = d.get(sys.argv[1], []) if isinstance(d, dict) else d
f = next((x for x in liste if x["name"] == sys.argv[2]), {})
print(json.dumps(f, ensure_ascii=False))' "$1" "$2" 2>/dev/null
}
zeitplan_feld() { flow_json "$1" "$2" | feld "zeitplan.$3"; } # stand flow feld

pause_setzen() { # flow true|false
  ruf "$TOK" PUT "/api/apps/$APP/flows/$1/zeitplan" "{\"pausiert\":$2}"
}

baue_paket() {
  local ordner="$ARBEIT/paket"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$QUELLE/frontend" "$ordner/"
  sed -i.bak "s|__NACHHOLEN__|$(ausdruck_vor 15)|" "$ordner/flows/nachholen.md"
  sed -i.bak "s|__VERPASST__|$(ausdruck_vor 180)|" "$ordner/flows/verpasst.md"
  rm -f "$ordner"/flows/*.bak
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$VERSION" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Probe: Zeitplan (%s)" % kennung.rsplit("-", 1)[-1]
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket.tgz"
}

# Das Backend neu starten und warten, bis es wieder antwortet.
NEUSTART_DAUER=0
neustart() {
  local ab=$SECONDS
  eval "$NEUSTART_BEFEHL" >/dev/null 2>&1
  local ende=$((SECONDS + NEUSTART_GEDULD))
  sleep 5
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$TOK" GET /api/auth/me
    [ "$CODE" = "200" ] && break
    sleep 3
  done
  NEUSTART_DAUER=$((SECONDS - ab))
  [ "$CODE" = "200" ]
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme M5: Zeitplaner, $APP gegen $BASIS ==="
echo

# --- 1. Zugaenge -----------------------------------------------------------------
TOK=$(arasul_token)
BEGINN=$(db "SELECT now();")
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && exit 1
pruefe 'ssh-Zugang zum Geraet und seine Datenbank' "$(ja_wenn "$(db 'SELECT 1;')" 1)"
[ "$(db 'SELECT 1;')" = 1 ] || exit 1
pruefe 'Migration 203 ist am Geraet angewendet' \
  "$([ "$(db "SELECT count(*) FROM schema_migrations WHERE version = 203 AND success;")" = 1 ] && echo ja || echo nein)"

ruf "$TOK" GET /api/benutzer
ID_ADMIN=$(rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
print(next((str(b["id"]) for b in d if b["username"] == sys.argv[1]), ""))' "$ARASUL_BENUTZER")
pruefe "$ARASUL_BENUTZER ist ein vorhandenes Probekonto" "$([ -n "$ID_ADMIN" ] && echo ja || echo nein)"
[ -z "$ID_ADMIN" ] && exit 1

SCHLUESSEL=""
KEY_ID=""
FREIGEGEBEN=""
ABGESCHLOSSEN=""
aufraeumen() {
  # Erst alles anhalten, was von allein starten wuerde, dann die offenen Laeufe.
  if [ -z "$ABGESCHLOSSEN" ] && [ -n "$TOK" ]; then
    for f in $ZEITFLOWS; do
      curl -sk -o /dev/null --max-time 30 -X PUT -H "authorization: Bearer $TOK" \
        -H 'content-type: application/json' -d '{"pausiert":true}' \
        "$BASIS/api/apps/$APP/flows/$f/zeitplan"
    done
    for id in $(db "SELECT id FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND status IN ('laeuft','wartend');"); do
      curl -sk -o /dev/null --max-time 30 -X POST -H "authorization: Bearer $TOK" \
        "$BASIS/api/laeufe/$id/abbrechen"
    done
    [ -n "$FREIGEGEBEN" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/freigaben/$APP/$FREIGEGEBEN"
    if [ -n "$SCHLUESSEL" ]; then
      curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
        "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
    fi
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme M5 Zeitplaner ($APP)\",\"allowed_endpoints\":[\"app:deploy\",\"flow:run\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# --- 2. Einspielen: ein unlesbarer Ausdruck wird abgewiesen, dann das echte Paket -
# Ein Paket mit "61 * * * *" kommt gar nicht erst an (Zod-Pruefung beim Einspielen).
BOESE="$ARBEIT/boese"
mkdir -p "$BOESE"
cp -R "$QUELLE/backend" "$QUELLE/flows" "$QUELLE/frontend" "$BOESE/"
sed -i.bak "s|__NACHHOLEN__|61 * * * *|; s|__VERPASST__|5 3 * * *|" "$BOESE/flows/nachholen.md" "$BOESE/flows/verpasst.md"
python3 - "$QUELLE/app.json" "$BOESE/app.json" "$APP" "$VERSION" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"], m["version"] = kennung, version
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
rm -f "$BOESE"/flows/*.bak
COPYFILE_DISABLE=1 tar czf "$ARBEIT/boese.tgz" -C "$BOESE" .
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$ARBEIT/boese.tgz" "$BASIS/api/v1/external/apps")
pruefe 'Ein Ausdruck, den das Geraet nicht lesen kann (Minute 61), wird beim Einspielen abgewiesen' \
  "$([ "$CODE" = 400 ] && grep -q 'außerhalb' "$RUMPF_DATEI" && echo ja || echo nein)" "HTTP $CODE $(rumpf | feld error.message | cut -c1-90)"

PAKET=$(baue_paket)
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$PAKET" "$BASIS/api/v1/external/apps")
pruefe "$APP in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }

# Bevor der Livestand steht, ruhen alle Zeitplaene und die Flows rechnen mit der
# festen Antwort: sonst liefe `takt` ab dem Schalten mit dem echten Modell.
codes=""
for f in $ZEITFLOWS; do
  pause_setzen "$f" true
  codes="$codes $CODE"
done
pruefe 'Alle Zeitplaene ruhen, bevor der Livestand steht' "$(ja_wenn "$codes" "$(lauter_200 $ANZAHL_ZEITFLOWS)")" "HTTP$codes"

ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe 'live geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ID_ADMIN}"
[[ "$CODE" =~ ^20[01]$ ]] && FREIGEGEBEN="$ID_ADMIN"
pruefe "Die App ist $ARASUL_BENUTZER freigegeben" "$([ -n "$FREIGEGEBEN" ] && echo ja || echo nein)" "HTTP $CODE"
if arasul_warte_auf_app "/apps/$APP/api/gesund" 240 "$TOK"; then
  pruefe 'Die App antwortet' ja
else
  pruefe 'Die App antwortet' nein 'Zeitgrenze 240s'; exit 1
fi

codes=""
for f in takt nachholen verpasst taeglich viertel; do
  ruf "$TOK" PUT "/api/apps/$APP/flows/$f/modell" \
    "{\"extern\":{\"anbieter\":\"Probe\",\"modell\":\"fest\",\"basis_url\":\"http://arasul-app-$APP-live:8080/v1\"}}"
  codes="$codes $CODE"
done
pruefe 'Die Flows rechnen mit der festen Antwort der Probe-App, ohne Modell' \
  "$(ja_wenn "$codes" "$(lauter_200 5)")" "HTTP$codes"

# --- 3. Anzeige --------------------------------------------------------------------
pruefe 'Pausiert: die Seite sagt es, ohne naechsten Termin' \
  "$([ "$(zeitplan_feld live takt laeuft_nicht)" = pausiert ] && [ "$(zeitplan_feld live takt pausiert)" = true ] && [ -z "$(zeitplan_feld live takt naechster_termin)" ] && echo ja || echo nein)"
pruefe 'Im Teststand laeuft kein Zeitplan' "$(ja_wenn "$(zeitplan_feld test takt laeuft_nicht)" teststand)"
pruefe 'Der Flow ohne Zeitplan hat keine Angabe' "$([ -z "$(flow_json live von-hand | feld zeitplan)" ] && echo ja || echo nein)"
pause_setzen von-hand true
pruefe 'Pause fuer einen Flow ohne Zeitplan: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
pause_setzen gibt-es-nicht true
pruefe 'Pause fuer einen unbekannten Flow: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"

# `taeglich` laeuft nur um 06:00; fuer die Anzeige darf er nicht ruhen.
pause_setzen taeglich false
TAEGLICH=$(zeitplan_feld live taeglich naechster_termin)
BERLIN=$(python3 - "$TAEGLICH" "$ZONE" <<'PY'
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
try:
    t = datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00")).astimezone(ZoneInfo(sys.argv[2]))
    print(t.strftime("%H:%M"))
except Exception:
    print("")
PY
)
pruefe "'0 6 * * *' ist 06:00 in der Zeit des Geraets ($ZONE)" "$(ja_wenn "$BERLIN" 06:00)" "naechster Termin $TAEGLICH = $BERLIN"
pruefe 'Die Seite nennt die Zeitzone des Geraets' "$(ja_wenn "$(zeitplan_feld live taeglich zeitzone)" "$ZONE")" "$(zeitplan_feld live taeglich zeitzone)"

# --- 4. Jede Minute, genau einmal ---------------------------------------------------
pause_setzen takt false
pruefe 'takt: Zeitplan fortgesetzt' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
NAECHSTER=$(zeitplan_feld live takt naechster_termin)
pruefe 'takt: die Seite nennt den naechsten Termin, hoechstens eine Minute entfernt' \
  "$(python3 - "$NAECHSTER" <<'PY'
import sys
from datetime import datetime, timezone
try:
    t = datetime.fromisoformat(sys.argv[1].replace("Z", "+00:00"))
    d = (t - datetime.now(timezone.utc)).total_seconds()
    print("ja" if -5 <= d <= 70 else "nein")
except Exception:
    print("nein")
PY
)" "$NAECHSTER"

# Drei Termine abwarten.
warte_bis 330 '[ "$(laeufe takt zeitplan)" -ge 3 ]'
N=$(laeufe takt zeitplan)
pruefe 'takt: drei Laeufe in drei Minuten' "$([ "${N:-0}" -ge 3 ] && echo ja || echo nein)" "$N Laeufe"
DOPPELT=$(db "SELECT count(*) FROM (SELECT date_trunc('minute', created_at) FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND flow_name = 'takt' AND ausloeser = 'zeitplan' GROUP BY 1 HAVING count(*) > 1) x;")
pruefe 'takt: nie zwei Laeufe in derselben Minute' "$(ja_wenn "$DOPPELT" 0)"
pruefe 'takt: jeder Lauf hat den Ausloeser zeitplan, steht im Livestand und hat keinen Einreicher' \
  "$(ja_wenn "$(db "SELECT count(*) FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND flow_name = 'takt' AND ausloeser = 'zeitplan' AND (stand <> 'live' OR einreicher_id IS NOT NULL);")" 0)"
pruefe 'takt: je Lauf genau ein Termin in flow_zeitplan_termine' \
  "$(ja_wenn "$(db "SELECT count(*) FROM flow_runs r WHERE r.created_at >= '$BEGINN' AND r.app_id = '$APP' AND r.flow_name = 'takt' AND r.ausloeser = 'zeitplan' AND (SELECT count(*) FROM public.flow_zeitplan_termine t WHERE t.app_id = r.app_id AND t.flow_name = r.flow_name AND t.run_id = r.id) <> 1;")" 0)"
SPAET=$(db "SELECT count(*) FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND flow_name = 'takt' AND ausloeser = 'zeitplan' AND extract(second FROM created_at) > 30;")
pruefe 'takt: jeder Lauf entsteht in der ersten halben Minute des Termins' "$(ja_wenn "$SPAET" 0)" "$SPAET spaeter"
sleep 20
pruefe 'takt: die Laeufe enden fertig (feste Antwort, ohne Modell)' \
  "$(ja_wenn "$(db "SELECT count(*) FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND flow_name = 'takt' AND ausloeser = 'zeitplan' AND status NOT IN ('fertig','laeuft');")" 0)"
# Nur die Laeufe seit Beginn: die Liste steht Fehler zuerst, und ohne `von`
# koennten alte Fehlerlaeufe der App die takt-Laeufe aus den 200 draengen.
VON_UTC=$(db "SELECT to_char(timestamptz '$BEGINN' AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"');")
pruefe 'Die Liste der Laeufe nennt den Ausloeser' \
  "$(ruf "$TOK" GET "/api/laeufe?app=$APP&von=$VON_UTC&limit=200" && rumpf | python3 -c 'import sys,json
d = [l for l in json.load(sys.stdin)["data"] if l.get("flow_name") == "takt"]
print("ja" if d and all(l.get("ausloeser") == "zeitplan" for l in d) else "nein")')"

# --- 5. Kein zweiter Lauf ------------------------------------------------------------
pause_setzen warten false
if warte_bis 150 '[ "$(laeufe warten)" -ge 1 ]'; then
  pruefe 'warten: der erste Termin startet einen Lauf' ja
  LAUF_WARTEN=$(db "SELECT id FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND flow_name = 'warten' ORDER BY id LIMIT 1;")
  warte_bis 60 '[ "$(status_von "$LAUF_WARTEN")" = wartend ]'
  pruefe 'warten: der Lauf haelt an der Freigabe' \
    "$(ja_wenn "$(status_von "$LAUF_WARTEN")" wartend)" "Lauf $LAUF_WARTEN"
  # Zwei weitere Termine abwarten.
  warte_minute_plus 25
  warte_minute_plus 25
  pruefe 'warten: zwei Termine spaeter laeuft noch immer nur dieser eine Lauf' \
    "$(ja_wenn "$(laeufe warten)" 1)" "$(laeufe warten) Lauf/Laeufe"
  EINTRAG=$(letzter_eintrag warten)
  pruefe 'warten: der Termin steht als uebersprungen, mit dem Grund' \
    "$([[ "$EINTRAG" == uebersprungen*"läuft noch"* ]] && echo ja || echo nein)" "$EINTRAG"
  pruefe 'warten: die Seite der App zeigt den Grund' \
    "$([[ "$(zeitplan_feld live warten letzter_termin.grund)" == *"läuft noch"* ]] && echo ja || echo nein)"
  pause_setzen warten true
  ruf "$TOK" POST "/api/laeufe/$LAUF_WARTEN/abbrechen"
  pruefe 'warten: Zeitplan pausiert, der haltende Lauf abgebrochen' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
else
  pruefe 'warten: der erste Termin startet einen Lauf' nein 'Zeitgrenze 150s'
fi

# --- 6. Pause trifft nur den Zeitplan -----------------------------------------------
pause_setzen takt true
PAUSE_BEGINN=$(db "SELECT now();")
warte_minute_plus 25
VOR=$(laeufe takt zeitplan)
warte_minute_plus 25
warte_minute_plus 25
NACH=$(laeufe takt zeitplan)
pruefe 'Pausiert: in zwei Minuten kein Lauf nach Zeitplan' "$(ja_wenn "$NACH" "$VOR")" "$VOR vorher, $NACH nachher"
pruefe 'Pausiert: der Schalter aktiv bleibt an' "$(ja_wenn "$(flow_json live takt | feld aktiv)" true)"
ruf "$TOK" POST "/apps/$APP/api/starten?flow=takt"
LAUF_HAND=$(rumpf | feld lauf)
pruefe 'Pausiert: der Start von Hand laeuft' "$([[ "$CODE" =~ ^20[02]$ ]] && [ -n "$LAUF_HAND" ] && echo ja || echo nein)" "HTTP $CODE, Lauf ${LAUF_HAND:-—}"
sleep 10
pruefe 'Der Lauf von Hand hat den Ausloeser hand' \
  "$(ja_wenn "$(db "SELECT ausloeser FROM flow_runs WHERE id = ${LAUF_HAND:-0};")" hand)"
pruefe 'Termine in der Pause stehen nicht in der Tabelle (nichts zum Nachholen)' \
  "$(ja_wenn "$(db "SELECT count(*) FROM public.flow_zeitplan_termine WHERE app_id = '$APP' AND flow_name = 'takt' AND erfasst_am > '$PAUSE_BEGINN';")" 0)"
pause_setzen takt false
pruefe 'takt: Zeitplan fortgesetzt' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
warte_bis 90 '[ "$(laeufe takt zeitplan)" -gt "$NACH" ]'
sleep 5
NEU=$(( $(laeufe takt zeitplan) - NACH ))
pruefe 'Fortgesetzt: genau der naechste Termin laeuft, nichts aus der Pause wird nachgeholt' \
  "$(ja_wenn "$NEU" 1)" "$NEU neue(r) Lauf/Laeufe"

# Ein ausgeschalteter Flow startet auch nach Zeitplan nicht.
ruf "$TOK" PUT "/api/apps/$APP/flows/takt/aktiv" '{"aktiv":false}'
pruefe 'takt ausgeschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
warte_minute_plus 25
VOR=$(laeufe takt zeitplan)
warte_minute_plus 25
NACH=$(laeufe takt zeitplan)
pruefe 'Ausgeschaltet: kein Lauf nach Zeitplan' "$(ja_wenn "$NACH" "$VOR")" "$VOR vorher, $NACH nachher"
pruefe 'Ausgeschaltet: die Seite nennt den Grund' \
  "$(ja_wenn "$(zeitplan_feld live takt laeuft_nicht)" ausgeschaltet)"
ruf "$TOK" PUT "/api/apps/$APP/flows/takt/aktiv" '{"aktiv":true}'
pruefe 'takt wieder eingeschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

# --- 7. Neustart ---------------------------------------------------------------------
warte_bis 90 '[ "$(laeufe takt zeitplan)" -gt "$NACH" ]'
VOR=$(laeufe takt zeitplan)
if neustart; then
  pruefe 'Das Backend startet neu und antwortet wieder' ja "nach ${NEUSTART_DAUER}s"
else
  pruefe 'Das Backend startet neu und antwortet wieder' nein "nach ${NEUSTART_DAUER}s"; exit 1
fi
if warte_bis 150 '[ "$(laeufe takt zeitplan)" -gt "$VOR" ]'; then
  pruefe 'Nach dem Neustart laeuft der Zeitplan weiter' ja "$(laeufe takt zeitplan) Laeufe, vorher $VOR"
else
  pruefe 'Nach dem Neustart laeuft der Zeitplan weiter' nein "$(laeufe takt zeitplan) Laeufe, vorher $VOR"
fi
warte_minute_plus 25
DOPPELT=$(db "SELECT count(*) FROM (SELECT date_trunc('minute', created_at) FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND flow_name = 'takt' AND ausloeser = 'zeitplan' GROUP BY 1 HAVING count(*) > 1) x;")
pruefe 'Auch ueber den Neustart: nie zwei Laeufe in derselben Minute' "$(ja_wenn "$DOPPELT" 0)"
pruefe 'Auch ueber den Neustart: je Lauf genau ein Termin' \
  "$(ja_wenn "$(db "SELECT count(*) FROM flow_runs r WHERE r.created_at >= '$BEGINN' AND r.app_id = '$APP' AND r.flow_name = 'takt' AND r.ausloeser = 'zeitplan' AND (SELECT count(*) FROM public.flow_zeitplan_termine t WHERE t.app_id = r.app_id AND t.flow_name = r.flow_name AND t.run_id = r.id) <> 1;")" 0)"
pruefe 'Nach dem Neustart steht die Anmeldung noch (kein 500)' "$(ja_wenn "$(ruf "$TOK" GET /api/auth/me; echo "$CODE")" 200)"

# --- 8. Das Geraet war aus: verpasste Termine ----------------------------------------
# Die Marke des Zeitplaners vier Stunden zurueck, als waere das Geraet so lange
# aus gewesen. Nur, wenn keine fremde App einen Zeitplan hat: sonst wuerde deren
# Flow mit nachgeholt.
FREMD=$(db "SELECT count(*) FROM public.app_flows WHERE stand = 'live' AND app_id <> '$APP' AND definition->'ausloeser' IS NOT NULL AND definition->'ausloeser' @> '[{\"typ\":\"zeitplan\"}]'::jsonb;")
if [ "$FREMD" != 0 ]; then
  pruefe 'Ausfall-Probe: keine fremde App mit Zeitplan am Geraet' nein "$FREMD fremde Flows: die Probe wuerde sie mit nachholen"
else
  pause_setzen nachholen false
  pause_setzen verpasst false
  pause_setzen viertel false
  VOR_TAKT=$(laeufe takt zeitplan)
  db "UPDATE public.flow_zeitplaner SET geprueft_bis = now() - interval '4 hours' WHERE id = 1;" >/dev/null
  warte_bis 90 '[ "$(laeufe nachholen zeitplan)" -ge 1 ]'
  warte_bis 30 '[ "$(laeufe viertel zeitplan)" -ge 1 ]'
  sleep 10
  pruefe 'nachholen: der Termin von vor etwa einer halben Stunde wird einmal nachgeholt' \
    "$(ja_wenn "$(laeufe nachholen zeitplan)" 1)" "$(letzter_eintrag nachholen)"
  pruefe 'nachholen: der Eintrag sagt nachgeholt' "$([[ "$(letzter_eintrag nachholen)" == nachgeholt* ]] && echo ja || echo nein)"
  pruefe 'verpasst: der Termin von vor drei Stunden laeuft nicht' "$(ja_wenn "$(laeufe verpasst)" 0)"
  EINTRAG=$(letzter_eintrag verpasst)
  pruefe 'verpasst: er steht als uebersprungen, mit Grund' \
    "$([[ "$EINTRAG" == uebersprungen*Verpasst* ]] && echo ja || echo nein)" "$EINTRAG"
  pruefe 'verpasst: die Seite der App zeigt den Grund' \
    "$([[ "$(zeitplan_feld live verpasst letzter_termin.grund)" == *Verpasst* ]] && echo ja || echo nein)"
  pruefe 'viertel: vier Stunden Rueckstand ergeben einen Lauf, nicht 16' \
    "$(ja_wenn "$(laeufe viertel zeitplan)" 1)" "$(laeufe viertel zeitplan) Lauf/Laeufe"
  EINTRAG=$(db "SELECT grund FROM public.flow_zeitplan_termine WHERE app_id = '$APP' AND flow_name = 'viertel' AND ergebnis = 'uebersprungen' ORDER BY termin DESC LIMIT 1;")
  pruefe 'viertel: die uebrigen Termine stehen als ein Eintrag uebersprungen, mit Zahl' \
    "$([[ "$EINTRAG" =~ Verpasst:\ [0-9]+\ Termine ]] && echo ja || echo nein)" "$EINTRAG"
  NEU=$(( $(laeufe takt zeitplan) - VOR_TAKT ))
  pruefe 'takt: was schon lief, laeuft nicht noch einmal (Marke zurueck, hoechstens die neuen Minuten)' \
    "$([ "$NEU" -le 2 ] && echo ja || echo nein)" "$NEU neue Laeufe in dieser Zeit"
  DOPPELT=$(db "SELECT count(*) FROM (SELECT date_trunc('minute', created_at) FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND flow_name = 'takt' AND ausloeser = 'zeitplan' GROUP BY 1 HAVING count(*) > 1) x;")
  pruefe 'Auch nach dem Ausfall: nie zwei Laeufe in derselben Minute' "$(ja_wenn "$DOPPELT" 0)"
fi

# --- 9. Aufraeumen ist Teil der Messung ------------------------------------------------
codes=""
for f in $ZEITFLOWS; do
  pause_setzen "$f" true
  codes="$codes $CODE"
done
pruefe 'Alle Zeitplaene der Probe-App sind pausiert' "$(ja_wenn "$codes" "$(lauter_200 $ANZAHL_ZEITFLOWS)")" "HTTP$codes"
sleep 3
OFFEN=$(db "SELECT id FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND status IN ('laeuft','wartend');")
for id in $OFFEN; do
  ruf "$TOK" POST "/api/laeufe/$id/abbrechen"
done
sleep 5
pruefe 'Offene Laeufe sind abgebrochen' \
  "$(ja_wenn "$(db "SELECT count(*) FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP' AND status IN ('laeuft','wartend');")" 0)" "${OFFEN:+abgebrochen: $OFFEN}"
ruf "$TOK" DELETE "/api/freigaben/$APP/$FREIGEGEBEN"
FREIGEGEBEN=""
pruefe 'Die Freigabe an das Probekonto ist zurueckgenommen' "$([[ "$CODE" =~ ^20[04]$ ]] && echo ja || echo nein)" "HTTP $CODE"
ruf "schluessel:$SCHLUESSEL" DELETE "/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
pruefe 'DELETE entfernt die App samt Ordnern' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
SCHLUESSEL=""
ruf "$TOK" GET "/api/apps/$APP"
pruefe 'Danach kennt das Geraet die App nicht mehr (404)' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
pruefe 'Ihre Termine sind mit der App weg' \
  "$(ja_wenn "$(db "SELECT count(*) FROM public.flow_zeitplan_termine WHERE app_id = '$APP';")" 0)"
ABGESCHLOSSEN=ja

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
