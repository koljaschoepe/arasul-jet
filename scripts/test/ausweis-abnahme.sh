#!/bin/bash
# =============================================================================
# Abnahme der Bruecke: das Feld `agent` und der Ausweis (J34, 21.09.2026)
# =============================================================================
# Die Messregel des Auftrags hat zwei Haelften, und dieses Skript misst beide
# gegen das laufende Geraet.
#
# ERSTENS DAS SCHEMA. `app.json` darf das Feld `agent` tragen, das Geraet prueft
# seine Form beim Ausrollen und weist ein kaputtes Feld mit klarer Meldung ab,
# die Kontraktversion ist gestiegen, und der Kontrakt nennt das Feld. Gemessen
# wird das am Kontrakt selbst und an einem Wegwerf-Paket, das ein kaputtes Feld
# traegt -- OHNE Bau: die Pruefung des Manifests steht vor dem Bau des Images,
# und das ist am Orin der Unterschied zwischen zwei Sekunden und Minuten.
#
# ZWEITENS DER AUSWEIS, und dafuer braucht es ZWEI Menschen: einer hat die App
# freigegeben, der andere nicht. Die Aussage besteht aus beiden Haelften --
# „antwortet genau fuer zugewiesene Apps, fuer andere 403".
#
#   drin     angelegt, freigegeben, eigener Ausweis   200 an der App
#   draussen angelegt, NICHT freigegeben, eigener     403 an derselben App
#
# UND DIE WICHTIGSTE MESSUNG IST EINE NEGATIVE: „das Token oeffnet nichts ausser
# App-Schnittstellen und der Liste der eigenen Apps, keine Admin-Route." Das ist
# eine Aussage ueber ALLE Wege des Geraets, nicht ueber die drei, die den Ausweis
# annehmen. Gemessen wird sie an vier Wegen, die demselben Menschen MIT einer
# Sitzung offenstehen -- eine Admin-Route, eine gewoehnliche
# Mitarbeiter-Route, und die Verwaltung der Ausweise selbst.
#
# ANMELDEDROSSEL: `loginLimiter` erlaubt dreissig FEHLSCHLAEGE je Viertelstunde
# und IP; eine gelungene Anmeldung kostet nichts (H7). Dieser Lauf braucht drei
# gelungene (Administrator plus die zwei Menschen) und rechnet deshalb nicht in
# der Reihe aus `abnahmen.sh` mit.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/ausweis-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
APP="${ARASUL_BEISPIELAPP:-beispielapp}"
STEMPEL="$(date +%s)"
DRIN="ausweis-drin-$STEMPEL"
DRAUSSEN="ausweis-draussen-$STEMPEL"
PASSWORT="Ausweis-$STEMPEL"

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
enthaelt() { case "$1" in *"$2"*) echo ja ;; *) echo nein ;; esac; }

RUMPF_DATEI="$(mktemp)"
KOPF_DATEI="$(mktemp)"
ANM_DATEI="$(mktemp)"
PAKET_DATEI=""
CODE=""

# Ein Aufruf, zwei Ergebnisse: `$CODE` und der Rumpf in `$RUMPF_DATEI`.
# Bewusst ohne Kommandosubstitution, damit `$CODE` den Aufruf ueberlebt --
# dieselbe Falle wie in `app-anmeldung-abnahme.sh`.
hole() {
  local pfad="$1" versuch
  shift
  local -a argumente
  argumente=(-sk -o "$RUMPF_DATEI" -D "$KOPF_DATEI" -w '%{http_code}' --max-time 25)
  if [ $# -gt 0 ]; then
    [ -n "$1" ] && argumente+=(-H "authorization: Bearer $1")
    shift
  fi
  while [ $# -gt 0 ]; do
    argumente+=(-H "$1")
    shift
  done
  for versuch in 1 2 3 4 5; do
    CODE=$(curl "${argumente[@]}" "$BASIS$pfad")
    case "$CODE" in
      000 | 502 | 503) sleep 3 ;;
      *) break ;;
    esac
  done
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }

feld() {
  rumpf | python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    if isinstance(d, list):
        try: d = d[int(k)]
        except Exception: d = {}
    else: d = d.get(k) if isinstance(d, dict) else None
    if d is None: print(""); raise SystemExit
if isinstance(d, bool): print("true" if d else "false")
elif isinstance(d, (str, int, float)): print(d)
else: print("")' "$1" 2>/dev/null
}

anmelden() {
  local antwort
  antwort=$(curl -sk -w '\n%{http_code}' -X POST -H 'content-type: application/json' \
    --max-time 30 -d "{\"username\":\"$1\",\"password\":\"$2\"}" \
    "$BASIS/api/auth/login")
  printf '%s' "$antwort" | tail -n1 > "$ANM_DATEI"
  printf '%s' "$antwort" | sed '$d' | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("token") or "")
except Exception: print("")' 2>/dev/null
}
anm_code() { cat "$ANM_DATEI" 2>/dev/null; }

# Ein Aufruf mit einer SITZUNG (nicht mit einem Ausweis). Er gibt den Rumpf auf
# die Standardausgabe, weil die Aufrufer hier einen Wert herausziehen.
mit_sitzung() {
  local verb="$1" pfad="$2" token="$3" leib="${4:-}"
  local -a argumente=(-sk --max-time 30 -X "$verb"
    -H "authorization: Bearer $token" -H 'content-type: application/json')
  [ -n "$leib" ] && argumente+=(-d "$leib")
  curl "${argumente[@]}" "$BASIS$pfad"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme der Bruecke (J34) gegen $BASIS ==="
echo

TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "${ARASUL_TOKEN:+geteilter Token}${ARASUL_TOKEN:-HTTP $(arasul_anmeldecode)}"
[ -z "$TOK" ] && { echo; echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }

# ===========================================================================
# ERSTE HAELFTE: das Feld `agent`
# ===========================================================================
echo
echo "--- Das Feld agent im Manifest ---"

# Der Kontrakt ist die eine Quelle. Gefragt wird mit einem Schluessel, denn
# `GET /contract` steht hinter `requireApiKey` -- irgendein gueltiger genuegt.
SCHLUESSEL="${ARASUL_KIT_SCHLUESSEL:-}"
if [ -z "$SCHLUESSEL" ]; then
  SCHLUESSEL=$(mit_sitzung POST /api/settings/api-keys "$TOK" \
    "{\"name\":\"ausweis-abnahme-$STEMPEL\",\"allowed_endpoints\":[\"app:deploy\"]}" |
    python3 -c 'import sys,json
try:
    d = json.load(sys.stdin)
    print(d.get("data", {}).get("key") or d.get("key") or "")
except Exception: print("")' 2>/dev/null)
  SCHLUESSEL_WEGWERF="$SCHLUESSEL"
else
  SCHLUESSEL_WEGWERF=""
fi

hole /api/v1/external/contract '' "x-api-key: $SCHLUESSEL"
pruefe 'GET /contract antwortet' "$(ja_nein "$CODE" 200)" "HTTP $CODE"
pruefe 'die Kontraktversion ist 6' "$(ja_nein "$(feld data.kontrakt)" 6)" \
  "kontrakt=$(feld data.kontrakt)"
pruefe 'das Schema von app.json fuehrt `agent` als Liste' \
  "$(ja_nein "$(feld data.app_json.schema.properties.agent.type)" array)" \
  "type=$(feld data.app_json.schema.properties.agent.type)"
FELDER=$(rumpf | python3 -c 'import sys,json
try:
    p = json.load(sys.stdin)["data"]["app_json"]["schema"]["properties"]["agent"]["items"]["properties"]
    print(",".join(sorted(p)))
except Exception: print("")' 2>/dev/null)
pruefe 'je Eintrag genau method, params, path, purpose, writes' \
  "$(ja_nein "$FELDER" 'method,params,path,purpose,writes')" "$FELDER"
REGELN=$(rumpf | python3 -c 'import sys,json
try: print("\n".join(json.load(sys.stdin)["data"]["app_json"]["regeln"]))
except Exception: print("")' 2>/dev/null)
pruefe 'die Regeln nennen das Feld' "$(enthaelt "$REGELN" '`agent` nennt die Routen')"
pruefe 'und die Regel, die kein Schema traegt (writes an PUT/PATCH/DELETE)' \
  "$(enthaelt "$REGELN" '`writes: true` tragen')"

# Ein kaputtes Feld wird abgewiesen, und die Meldung sagt WO. Ohne Bau: das
# Manifest wird geprueft, bevor Docker anfaengt -- das Paket traegt deshalb
# kein Dockerfile und braucht keines.
if [ -n "$SCHLUESSEL" ]; then
  PAKET_DIR="$(mktemp -d)"
  PAKET_DATEI="$PAKET_DIR/paket.tgz"
  mkdir -p "$PAKET_DIR/inhalt/frontend"
  echo '<!doctype html><title>Abnahme</title>' > "$PAKET_DIR/inhalt/frontend/index.html"
  cat > "$PAKET_DIR/inhalt/app.json" <<JSON
{
  "schema": 1,
  "id": "ausweis-abnahme",
  "name": "Abnahme der Bruecke",
  "version": "0.0.$STEMPEL",
  "frontend": { "verzeichnis": "frontend" },
  "agent": [
    { "method": "DELETE", "path": "weg", "purpose": "Loescht etwas.", "params": [], "writes": false }
  ]
}
JSON
  tar czf "$PAKET_DATEI" -C "$PAKET_DIR/inhalt" .
  hole_paket() {
    CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time 120 \
      -H "x-api-key: $SCHLUESSEL" -F "paket=@$PAKET_DATEI" \
      "$BASIS/api/v1/external/apps")
  }
  hole_paket
  pruefe 'ein kaputtes `agent` weist das Geraet ab' "$(ja_nein "$CODE" 400)" "HTTP $CODE"
  MELDUNG=$(feld error.message)
  pruefe 'und die Meldung nennt das Feld' "$(enthaelt "$MELDUNG" 'agent.0.writes')" "$MELDUNG"
  pruefe 'und sagt, was daran falsch ist' "$(enthaelt "$MELDUNG" 'writes muss true sein')"
  rm -rf "$PAKET_DIR"
  PAKET_DATEI=""
else
  pruefe 'ein kaputtes `agent` weist das Geraet ab' nein 'kein API-Schluessel'
fi

# ===========================================================================
# ZWEITE HAELFTE: der Ausweis
# ===========================================================================
echo
echo "--- Der Ausweis eines Mitarbeiters ---"

hole "/api/apps/$APP" "$TOK"
VERSION=$(feld data.staende.live.version)
pruefe "$APP hat einen Livestand" "$([ -n "$VERSION" ] && echo ja || echo nein)" "version=$VERSION"
[ -z "$VERSION" ] && { echo; echo "Ohne Livestand gibt es nichts zu messen."; exit 1; }

ID_DRIN=""
ID_DRAUSSEN=""
aufraeumen() {
  rm -f "$RUMPF_DATEI" "$KOPF_DATEI" "$ANM_DATEI"
  [ -n "$PAKET_DATEI" ] && rm -rf "$(dirname "$PAKET_DATEI")"
  local id code
  for id in "$ID_DRIN" "$ID_DRAUSSEN"; do
    [ -z "$id" ] && continue
    # Die Ausweise fallen mit dem Benutzer (ON DELETE CASCADE, Migration 182),
    # genau wie die Freigabe (Migration 168). Dass das so ist, misst der Lauf
    # unten ausdruecklich.
    code=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/benutzer/$id")
    printf 'aufgeraeumt  Benutzer %s geloescht (HTTP %s)\n' "$id" "$code"
  done
  if [ -n "${SCHLUESSEL_WEGWERF:-}" ]; then
    printf 'aufgeraeumt  Wegwerf-Schluessel widerrufen\n'
    mit_sitzung GET /api/settings/api-keys "$TOK" | python3 -c '
import sys, json
try: schluessel = json.load(sys.stdin).get("data", [])
except Exception: schluessel = []
for s in schluessel if isinstance(schluessel, list) else []:
    if str(s.get("name", "")).startswith("ausweis-abnahme-"):
        print(s.get("id"))' 2>/dev/null | while read -r kid; do
      [ -n "$kid" ] && curl -sk -o /dev/null -X DELETE \
        -H "authorization: Bearer $TOK" "$BASIS/api/settings/api-keys/$kid"
    done
  fi
}
trap aufraeumen EXIT

anlegen() {
  mit_sitzung POST /api/benutzer "$TOK" \
    "{\"username\":\"$1\",\"password\":\"$PASSWORT\",\"email\":\"$1@abnahme.local\",\"role\":\"mitarbeiter\"}" |
    python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("data",{}).get("id") or "")
except Exception: print("")' 2>/dev/null
}

ID_DRIN=$(anlegen "$DRIN")
ID_DRAUSSEN=$(anlegen "$DRAUSSEN")
pruefe 'Beide Menschen angelegt' \
  "$([ -n "$ID_DRIN" ] && [ -n "$ID_DRAUSSEN" ] && echo ja || echo nein)" \
  "drin=$ID_DRIN draussen=$ID_DRAUSSEN"
[ -z "$ID_DRIN" ] || [ -z "$ID_DRAUSSEN" ] && { echo; echo "Ohne die beiden gibt es nichts zu messen."; exit 1; }

# Das Startpasswort wechseln, sonst steht es dem Ausstellen nicht im Weg, aber
# der Mensch traegt `passwort_vom_admin` und das faerbt jede spaetere Messung.
TOK_DRIN=$(anmelden "$DRIN" "$PASSWORT")
TOK_DRAUSSEN=$(anmelden "$DRAUSSEN" "$PASSWORT")
pruefe 'Beide melden sich an' \
  "$([ -n "$TOK_DRIN" ] && [ -n "$TOK_DRAUSSEN" ] && echo ja || echo nein)" \
  "HTTP $(anm_code)"
[ -z "$TOK_DRIN" ] || [ -z "$TOK_DRAUSSEN" ] && { echo; echo "Ohne beide Sitzungen gibt es nichts zu messen."; exit 1; }

# Nur EINER bekommt die App.
mit_sitzung POST /api/freigaben "$TOK" "{\"app_id\":\"$APP\",\"benutzer_id\":$ID_DRIN}" > /dev/null

# --- Ausstellen ------------------------------------------------------------
ausstellen() {
  mit_sitzung POST /api/ausweise "$1" "{\"name\":\"$2\"}" | python3 -c 'import sys,json
try: print(json.load(sys.stdin).get("data",{}).get("ausweis") or "")
except Exception: print("")' 2>/dev/null
}
AUS_DRIN=$(ausstellen "$TOK_DRIN" "Rechner von $DRIN")
AUS_DRAUSSEN=$(ausstellen "$TOK_DRAUSSEN" "Rechner von $DRAUSSEN")
pruefe 'Beide stellen sich einen Ausweis aus' \
  "$([ -n "$AUS_DRIN" ] && [ -n "$AUS_DRAUSSEN" ] && echo ja || echo nein)"
pruefe 'der Wert traegt den Vorsatz ausweis_' \
  "$(printf '%s' "$AUS_DRIN" | grep -qE '^ausweis_[0-9a-f]{64}$' && echo ja || echo nein)" \
  "${AUS_DRIN:0:14}…"
[ -z "$AUS_DRIN" ] || [ -z "$AUS_DRAUSSEN" ] && { echo; echo "Ohne Ausweise gibt es nichts zu messen."; exit 1; }

# Er kommt genau einmal heraus: die Liste nennt ihn nicht.
LISTE=$(mit_sitzung GET /api/ausweise "$TOK_DRIN")
pruefe 'die Liste nennt den Wert nicht wieder' \
  "$(enthaelt "$LISTE" "$AUS_DRIN" | sed 's/^ja$/nein/;s/^nein$/ja/')"
pruefe 'sie nennt den Namen des Rechners' "$(enthaelt "$LISTE" "Rechner von $DRIN")"
pruefe 'und zuletzt_benutzt_am steht auf null' "$(enthaelt "$LISTE" '"zuletzt_benutzt_am":null')"

# Zwei Ausweise mit demselben Namen gibt es nicht.
CODE_DOPPELT=$(curl -sk -o /dev/null -w '%{http_code}' -X POST --max-time 30 \
  -H "authorization: Bearer $TOK_DRIN" -H 'content-type: application/json' \
  -d "{\"name\":\"Rechner von $DRIN\"}" "$BASIS/api/ausweise")
pruefe 'derselbe Name ein zweites Mal ist 409' "$(ja_nein "$CODE_DOPPELT" 409)" "HTTP $CODE_DOPPELT"

# --- Was der Ausweis oeffnet ----------------------------------------------
echo
hole "/apps/$APP/api/me" "$AUS_DRIN"
pruefe "der Ausweis oeffnet die Schnittstelle von $APP" "$(ja_nein "$CODE" 200)" "HTTP $CODE"
pruefe 'und die App sieht genau diesen Menschen' "$(ja_nein "$(feld data.benutzer)" "$DRIN")" \
  "benutzer=$(feld data.benutzer)"
pruefe 'samt seiner Rolle' "$(ja_nein "$(feld data.rolle)" mitarbeiter)" "rolle=$(feld data.rolle)"

hole "/apps/$APP/api/me" "$AUS_DRAUSSEN"
pruefe 'der Ausweis des anderen bekommt 403' "$(ja_nein "$CODE" 403)" "HTTP $CODE"

hole /api/apps/meine "$AUS_DRIN"
pruefe 'GET /api/apps/meine nimmt den Ausweis' "$(ja_nein "$CODE" 200)" "HTTP $CODE"
MEINE=$(rumpf | python3 -c "import sys,json
try: d = json.load(sys.stdin).get('data', [])
except Exception: d = []
a = next((x for x in d if x['id'] == '$APP'), None)
print((a or {}).get('live', {}).get('api') or '')" 2>/dev/null)
pruefe 'und nennt die Adresse der Schnittstelle' "$(ja_nein "$MEINE" "/apps/$APP/api/")" "api=$MEINE"

hole /api/apps/meine "$AUS_DRAUSSEN"
FREMD=$(rumpf | python3 -c "import sys,json
try: print(len(json.load(sys.stdin).get('data', [])))
except Exception: print('?')" 2>/dev/null)
pruefe 'der andere sieht dort keine App' "$(ja_nein "$FREMD" 0)" "Anzahl=$FREMD"

hole /api/auth/session "$AUS_DRIN"
pruefe 'GET /api/auth/session sagt, dass der Ausweis gilt' \
  "$(ja_nein "$(feld authenticated)" true)" "authenticated=$(feld authenticated)"
pruefe 'und wem er gehoert' "$(ja_nein "$(feld user.username)" "$DRIN")" \
  "username=$(feld user.username)"

# --- Und was er NICHT oeffnet ---------------------------------------------
echo
for weg in /api/benutzer /api/models/memory-budget /api/notizen /api/ausweise; do
  hole "$weg" "$AUS_DRIN"
  pruefe "der Ausweis oeffnet $weg NICHT" "$(ja_nein "$CODE" 401)" "HTTP $CODE"
done
CODE_LOESCHEN=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE --max-time 25 \
  -H "authorization: Bearer $AUS_DRIN" "$BASIS/api/ausweise/1")
pruefe 'und widerruft auch keinen Ausweis' "$(ja_nein "$CODE_LOESCHEN" 401)" "HTTP $CODE_LOESCHEN"

# --- Die letzte Nutzung ist jetzt vermerkt --------------------------------
LISTE=$(mit_sitzung GET /api/ausweise "$TOK_DRIN")
pruefe 'nach der Benutzung steht zuletzt_benutzt_am da' \
  "$(enthaelt "$LISTE" '"zuletzt_benutzt_am":null' | sed 's/^ja$/nein/;s/^nein$/ja/')"

# --- Der Administrator sieht alle und widerruft --------------------------
echo
ALLE=$(mit_sitzung GET /api/ausweise/alle "$TOK")
pruefe 'der Administrator sieht beide Ausweise' \
  "$([ "$(enthaelt "$ALLE" "$DRIN")" = ja ] && [ "$(enthaelt "$ALLE" "$DRAUSSEN")" = ja ] && echo ja || echo nein)"
hole /api/ausweise/alle "$TOK_DRIN"
pruefe 'ein Mitarbeiter sieht sie nicht (403)' "$(ja_nein "$CODE" 403)" "HTTP $CODE"

# Die Nummer des Ausweises von `drin`, aus der Sicht des Administrators.
NUMMER=$(printf '%s' "$ALLE" | python3 -c "import sys,json
try: d = json.load(sys.stdin).get('data', [])
except Exception: d = []
print(next((str(a['id']) for a in d if a.get('username') == '$DRIN'), ''))" 2>/dev/null)
pruefe 'und findet den des einen' "$([ -n "$NUMMER" ] && echo ja || echo nein)" "id=$NUMMER"
if [ -n "$NUMMER" ]; then
  CODE_WIDERRUF=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE --max-time 25 \
    -H "authorization: Bearer $TOK" "$BASIS/api/ausweise/$NUMMER")
  pruefe 'der Administrator widerruft ihn' "$(ja_nein "$CODE_WIDERRUF" 200)" "HTTP $CODE_WIDERRUF"
  hole "/apps/$APP/api/me" "$AUS_DRIN"
  pruefe 'danach ist derselbe Ausweis 401' "$(ja_nein "$CODE" 401)" "HTTP $CODE"
  pruefe 'und die Meldung sagt, dass er widerrufen ist' \
    "$(enthaelt "$(feld error.message)" 'widerrufen')" "$(feld error.message)"
  # Die Sitzung des Menschen lebt weiter: ein Ausweis ist keine Sitzung.
  hole "/apps/$APP/api/me" "$TOK_DRIN"
  pruefe 'seine Sitzung im Browser lebt weiter' "$(ja_nein "$CODE" 200)" "HTTP $CODE"
fi

# Ein Mitarbeiter widerruft nur seine eigenen: der fremde ist fuer ihn 404.
NUMMER_FREMD=$(printf '%s' "$ALLE" | python3 -c "import sys,json
try: d = json.load(sys.stdin).get('data', [])
except Exception: d = []
print(next((str(a['id']) for a in d if a.get('username') == '$DRAUSSEN'), ''))" 2>/dev/null)
if [ -n "$NUMMER_FREMD" ]; then
  CODE_FREMD=$(curl -sk -o /dev/null -w '%{http_code}' -X DELETE --max-time 25 \
    -H "authorization: Bearer $TOK_DRIN" "$BASIS/api/ausweise/$NUMMER_FREMD")
  pruefe 'ein fremder Ausweis ist fuer einen Mitarbeiter 404' \
    "$(ja_nein "$CODE_FREMD" 404)" "HTTP $CODE_FREMD"
fi

echo
echo "=== $gruen gruen, $rot rot ==="
[ "$rot" -eq 0 ] || exit 1
