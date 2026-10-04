#!/bin/bash
# =============================================================================
# Abnahme M5: Ereignis der App als Ausloeser, Routen von Apps als Werkzeug
# =============================================================================
# Die Abnahme des Auftrags ereignis-und-app-routen (04.10.2026, Kontrakt 13).
# Zwei Probe-Apps aus `tests/probe-ereignis`, DETERMINISTISCH OHNE MODELL: wo
# ein Flow rechnet, rechnet er mit dem externen Modell, das die Probe-App a
# selbst ist und immer „Fertig." antwortet.
#
#   a  probe-ereignis-<MMDD>-a  meldet Ereignisse (`/melden`), ihre Flows:
#        bei-eingang  hoert auf beleg.eingegangen, ruft GET /info der eigenen
#                     App, POST /eintrag und GET /kunden/{nummer} von b
#        zweiter      hoert auch auf beleg.eingegangen (ein Ereignis, zwei Laeufe)
#        pflicht      hoert auch darauf, braucht aber `kunde` (startet nicht)
#        fremd        hoert auf beleg.fremd, ruft POST /loeschen von b, das sein
#                     Kopf nicht nennt
#        von-hand     hoert auf nichts
#   b  probe-ereignis-<MMDD>-b  wird gerufen und schreibt mit, was kam
#
#   EREIGNIS   a meldet ueber ihren Schluessel; das Geraet startet genau die
#              Flows mit `ausloeser: ereignis` dieses Namens, mit den Daten als
#              Argumenten; am Lauf steht Ausloeser `ereignis` und der Name.
#   ZUGANG     Hat der Mensch des Laufs b nicht, weist das Geraet die Route ab,
#              mit Grund im Lauf, und b bekommt nichts. Nach der Freigabe von b
#              geht derselbe Weg durch, und b sieht den Menschen, den Lauf und
#              die rufende App, aber kein Geheimnis.
#   OHNE MENSCH Ohne Einreicher ruft das Geraet im Namen des Besitzers.
#   GENANNT    Eine Route, die der Kopf nicht nennt, wird abgewiesen, mit Grund
#              im Lauf; b bekommt nichts.
#   GRENZEN    Kein hoerender Flow: 200, nichts gestartet. Ein Name in falscher
#              Form: 400. Der Schluessel eines Menschen: 403.
#
# ZAEHLT NUR EIGENES: Laeufe ab dem eigenen Start (`BEGINN`) und mit den
# Nummern, die die eigenen Ereignisse zurueckgeben; Protokolleintraege von b nur
# zu diesen Nummern. Eine frueher entfernte App mit gleicher Kennung stoert
# nicht.
#
# Konten: zwei VORHANDENE Probekonten, nie `admin`, keine neuen. Passwoerter nur
# zur Laufzeit:
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
#   bash scripts/test/ereignis-und-routen-abnahme.sh
#
# WAS ES ANLEGT, RAEUMT ES WEG: die Apps `probe-ereignis-<MMDD>-a` und `-b` (samt
# Image und Ordner), ihre Freigaben, offene Laeufe ab dem eigenen Start, den
# Wegwerf-Schluessel.
#
# Dauer: etwa 5 Minuten. Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-ereignis"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP_A="${ARASUL_EREIGNIS_APP:-probe-ereignis-$STEMPEL}-a"
APP_B="${ARASUL_EREIGNIS_APP:-probe-ereignis-$STEMPEL}-b"
VERSION="1.0.0"
GEDULD=900
LAUF_GEDULD=240
# Die Uhr des Geraets ist die, gegen die `created_at` zaehlt; ein paar Sekunden
# Spiel fuer eine Uhr, die vorgeht.
BEGINN="$(date -u -v-30S '+%Y-%m-%dT%H:%M:%S' 2>/dev/null || date -u -d '-30 seconds' '+%Y-%m-%dT%H:%M:%S')"

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
mind_wenn() { if [ "${1:-}" -ge "$2" ] 2>/dev/null; then echo ja; else echo nein; fi; }
enthaelt() { case "$1" in *"$2"*) echo ja ;; *) echo nein ;; esac; }

if [ -z "$A" ] || [ -z "$A_PASS" ]; then
  echo "ARASUL_A und ARASUL_A_PASSWORT fehlen (vorhandenes Probekonto, z. B. probe-j36-a)."
  exit 1
fi
for wer in "$ARASUL_BENUTZER" "$A"; do
  if [ "$wer" = "admin" ]; then
    echo "Nie das Konto admin: das ist ein echtes Konto. Probekonten nehmen."
    exit 1
  fi
done

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

anmelden() {
  curl -sk -X POST -H 'content-type: application/json' --max-time 30 \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))' "$1" "$2")" \
    "$BASIS/api/auth/login" | feld token
}

# baue_paket <kennung> <mit_flows: ja|nein>
baue_paket() {
  local kennung="$1" mit_flows="$2" ordner="$ARBEIT/$1"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/frontend" "$ordner/"
  if [ "$mit_flows" = ja ]; then
    cp -R "$QUELLE/flows" "$ordner/"
    sed -i.bak "s|__APP_B__|$APP_B|g" "$ordner"/flows/*.md
    rm -f "$ordner"/flows/*.bak
  fi
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$kennung" "$VERSION" "$mit_flows" <<'PY'
import json, sys
quelle, ziel, kennung, version, mit_flows = sys.argv[1:6]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Probe: Ereignis (%s)" % kennung.split("-", 2)[-1]
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
m["backend"]["umgebung"]["PROBE_APP"] = kennung
if mit_flows != "ja":
    m.pop("flows", None)
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/$kennung.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/$kennung.tgz"
}

# melden <token> <ereignis> <daten-json> [ohne_einreicher] -- setzt $CODE, $GERAET_CODE
GERAET_CODE=""
melden() {
  local tok="$1" name="$2" daten="$3" ohne="${4:-}"
  ruf "$tok" POST "/apps/$APP_A/api/melden?ereignis=$name${ohne:+&ohne_einreicher=1}" "$daten"
  GERAET_CODE=$(rumpf | feld antwort)
}
# Der Lauf eines Flows aus der letzten Antwort des Geraets, oder leer.
lauf_von() {
  rumpf | python3 -c 'import sys,json
try: g = json.load(sys.stdin)["geraet"]
except Exception: print(""); raise SystemExit
print(next((str(l["run_id"]) for l in g.get("laeufe", []) if l["flow"] == sys.argv[1]), ""))' "$1" 2>/dev/null
}
flows_gestartet() {
  rumpf | python3 -c 'import sys,json
try: g = json.load(sys.stdin)["geraet"]
except Exception: print(""); raise SystemExit
print(" ".join(sorted(l["flow"] for l in g.get("laeufe", []))))' 2>/dev/null
}
grund_nicht_gestartet() {
  rumpf | python3 -c 'import sys,json
try: g = json.load(sys.stdin)["geraet"]
except Exception: print(""); raise SystemExit
print(next((l["grund"] for l in g.get("nicht_gestartet", []) if l["flow"] == sys.argv[1]), ""))' "$1" 2>/dev/null
}

EIGENE_LAEUFE=()
# Wartet, bis der Lauf $1 von App a nicht mehr laeuft; setzt $STATUS, $FEHLER.
STATUS=""
FEHLER=""
warte_lauf() {
  local lauf="$1" ende=$((SECONDS + LAUF_GEDULD))
  STATUS=""
  FEHLER=""
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$TOK" GET "/api/apps/$APP_A/laeufe/$lauf"
    STATUS=$(rumpf | feld data.status)
    FEHLER=$(rumpf | feld data.error)
    case "$STATUS" in laeuft | wartend | "") sleep 2 ;; *) return 0 ;; esac
  done
  return 1
}
lauf_feld() { # lauf feld
  ruf "$TOK" GET "/api/apps/$APP_A/laeufe/$1"
  rumpf | feld "data.$2"
}
# Ausgabe und Status eines Schritts (nach Name) eines Laufs: "status|ausgabe".
schritt() { # lauf name
  ruf "$TOK" GET "/api/apps/$APP_A/laeufe/$1"
  rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
s = [x for x in d.get("steps", []) if x.get("name") == "route_aufrufen"]
i = int(sys.argv[1])
if i < len(s):
    print("%s|%s" % (s[i].get("status"), (s[i].get("output") or "").replace("\n", " ")[:400]))' "$2" 2>/dev/null
}
# Die Aufrufe, die b zu einem Lauf mitgeschrieben hat, als JSON-Liste.
bei_b() { # lauf
  ruf "$TOK" GET "/apps/$APP_B/api/protokoll"
  rumpf | python3 -c 'import sys,json
try: d = json.load(sys.stdin)["aufrufe"]
except Exception: print("[]"); raise SystemExit
print(json.dumps([a for a in d if a.get("lauf") == sys.argv[1]], ensure_ascii=False))' "$1" 2>/dev/null
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme M5: Ereignis und Routen, $APP_A und $APP_B gegen $BASIS ==="
echo

# --- 1. Zugaenge -----------------------------------------------------------------
TOK=$(arasul_token)
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && exit 1
TOK_A=$(anmelden "$A" "$A_PASS")
pruefe "$A meldet sich an" "$([ -n "$TOK_A" ] && echo ja || echo nein)"
[ -z "$TOK_A" ] && exit 1

ruf "$TOK" GET /api/benutzer
benutzer_feld() {
  rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
print(next((str(b[sys.argv[2]]) for b in d if b["username"] == sys.argv[1]), ""))' "$1" "$2"
}
ID_ADMIN=$(benutzer_feld "$ARASUL_BENUTZER" id)
ID_A=$(benutzer_feld "$A" id)
ROLLE_A=$(benutzer_feld "$A" role)
pruefe 'Zwei vorhandene Probekonten, keine neuen' \
  "$([ -n "$ID_ADMIN" ] && [ -n "$ID_A" ] && echo ja || echo nein)" "$A ist $ROLLE_A"

SCHLUESSEL=""
KEY_ID=""
FREIGEGEBEN=()
aufraeumen() {
  # Offene Laeufe ab dem eigenen Start, dann Freigaben, dann die Apps.
  if [ -n "$TOK" ]; then
    for app in "$APP_A" "$APP_B"; do
      for id in $(curl -sk --max-time 30 -H "authorization: Bearer $TOK" \
        "$BASIS/api/apps/$app/laeufe?limit=200" | python3 -c 'import sys,json
try: d = json.load(sys.stdin)["data"]
except Exception: raise SystemExit
for l in d:
    if l["status"] in ("laeuft", "wartend") and l["created_at"][:19] >= sys.argv[1]:
        print(l["id"])' "$BEGINN" 2>/dev/null); do
        curl -sk -o /dev/null --max-time 30 -X POST -H "authorization: Bearer $TOK" \
          "$BASIS/api/flows/laeufe/$id/abbrechen"
      done
    done
  fi
  for eintrag in "${FREIGEGEBEN[@]:-}"; do
    [ -n "$eintrag" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/freigaben/${eintrag%%:*}/${eintrag##*:}"
  done
  if [ -n "$SCHLUESSEL" ]; then
    for app in "$APP_A" "$APP_B"; do
      curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
        "$BASIS/api/v1/external/apps/$app?bestaetigung=$app&dateien=true"
    done
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  offene Laeufe abgebrochen, Freigaben zurueckgenommen, %s und %s entfernt (mit Ordnern), Wegwerf-Schluessel widerrufen\n' "$APP_A" "$APP_B"
}
trap aufraeumen EXIT

freigeben() { # app id
  ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$1\",\"benutzer_id\":$2}"
  [[ "$CODE" =~ ^20[01]$ ]] && FREIGEGEBEN+=("$1:$2")
}

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme M5 Ereignis ($APP_A)\",\"allowed_endpoints\":[\"app:deploy\",\"flow:run\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# --- 2. Kontrakt 13 ---------------------------------------------------------------
ruf "schluessel:$SCHLUESSEL" GET /api/v1/external/contract
KONTRAKT=$(rumpf | feld data.kontrakt)
[ -z "$KONTRAKT" ] && KONTRAKT=$(rumpf | feld kontrakt)
pruefe 'Der Kontrakt hat mindestens Fassung 13' "$(mind_wenn "$KONTRAKT" 13)" "kontrakt=${KONTRAKT:-—}"
pruefe 'Der Kontrakt nennt ereignisse/:name, routen und route_aufrufen' \
  "$(grep -q '/api/v1/external/ereignisse/:name' "$RUMPF_DATEI" && grep -q '`routen` nennt die Routen' "$RUMPF_DATEI" && grep -q 'route_aufrufen' "$RUMPF_DATEI" && echo ja || echo nein)"

# --- 3. Einspielen, live, Freigaben, feste Antwort -------------------------------
for paar in "$APP_B:nein" "$APP_A:ja"; do
  app="${paar%%:*}"
  PAKET=$(baue_paket "$app" "${paar##*:}")
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$PAKET" "$BASIS/api/v1/external/apps")
  pruefe "$app in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
  [ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
  ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$app/schalten" '{"ziel":"live"}'
  pruefe "$app live geschaltet" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
done

freigeben "$APP_A" "$ID_ADMIN"
freigeben "$APP_A" "$ID_A"
freigeben "$APP_B" "$ID_ADMIN"
pruefe "a ist $ARASUL_BENUTZER und $A freigegeben, b nur $ARASUL_BENUTZER" \
  "$([ "${#FREIGEGEBEN[@]}" = 3 ] && echo ja || echo nein)" "${FREIGEGEBEN[*]}"

for app in "$APP_A" "$APP_B"; do
  if arasul_warte_auf_app "/apps/$app/api/gesund" 240 "$TOK"; then
    pruefe "$app antwortet" ja
  else
    pruefe "$app antwortet" nein 'Zeitgrenze 240s'; exit 1
  fi
done
ruf "$TOK_A" GET "/apps/$APP_B/api/gesund"
pruefe "$A kommt an b nicht heran (403 vor der App)" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"

codes=""
for f in bei-eingang zweiter fremd von-hand; do
  ruf "$TOK" PUT "/api/apps/$APP_A/flows/$f/modell" \
    "{\"extern\":{\"anbieter\":\"Probe\",\"modell\":\"fest\",\"basis_url\":\"http://arasul-app-$APP_A-live:8080/v1\"}}"
  codes="$codes $CODE"
done
pruefe 'Die Flows rechnen mit der festen Antwort der Probe-App, ohne Modell' \
  "$(ja_wenn "$codes" ' 200 200 200 200')" "HTTP$codes"

ruf "$TOK" GET "/api/apps/$APP_A/flows/bei-eingang?stand=live"
pruefe 'Der Kopf von bei-eingang nennt drei Routen, zwei davon von b' \
  "$(rumpf | python3 -c 'import sys,json
r = json.load(sys.stdin)["data"].get("routen") or []
print("ja" if len(r) == 3 and sum(1 for x in r if x.get("app") == sys.argv[1]) == 2 else "nein")' "$APP_B" 2>/dev/null)"

# --- 4. Ein Ereignis, ein Mensch ohne Zugang zu b ---------------------------------
NR1="R-$STEMPEL-1"
melden "$TOK_A" beleg.eingegangen "{\"nummer\":\"$NR1\",\"betrag\":\"42.50\",\"fremd\":\"faellt weg\"}"
pruefe 'a meldet beleg.eingegangen ueber ihren Schluessel: 202' "$(ja_wenn "$GERAET_CODE" 202)" "HTTP $CODE, Geraet $GERAET_CODE"
pruefe 'Gestartet: genau die Flows, die auf beleg.eingegangen hoeren (nicht von-hand, nicht fremd)' \
  "$(ja_wenn "$(flows_gestartet)" 'bei-eingang zweiter')" "$(flows_gestartet)"
GRUND=$(grund_nicht_gestartet pflicht)
pruefe 'pflicht startet nicht, mit Grund' "$(enthaelt "$GRUND" 'Pflicht-Argument "kunde" fehlt')" "$GRUND"
L1=$(lauf_von bei-eingang)
L1Z=$(lauf_von zweiter)
EIGENE_LAEUFE+=("$L1" "$L1Z")

warte_lauf "$L1Z"
pruefe 'zweiter: der Lauf endet fertig' "$(ja_wenn "$STATUS" fertig)" "Lauf $L1Z $STATUS"
warte_lauf "$L1"
pruefe "bei-eingang: Lauf $L1 endet als fehler, weil $A b nicht hat" "$(ja_wenn "$STATUS" fehler)" "$STATUS"
pruefe '… mit Grund im Lauf' \
  "$(enthaelt "$FEHLER" "Route abgewiesen: $A hat keinen Zugang zur App $APP_B")" "$(printf '%s' "$FEHLER" | cut -c1-140)"
pruefe 'Am Lauf: Ausloeser ereignis, Name beleg.eingegangen, Livestand' \
  "$([ "$(lauf_feld "$L1" ausloeser)" = ereignis ] && [ "$(lauf_feld "$L1" ereignis)" = beleg.eingegangen ] && [ "$(lauf_feld "$L1" stand)" = live ] && echo ja || echo nein)"
ARGS=$(lauf_feld "$L1" arguments)
pruefe 'Die Daten des Ereignisses sind die Argumente (undeklariertes faellt weg)' \
  "$(printf '%s' "$ARGS" | python3 -c 'import sys,json
a = json.load(sys.stdin)
print("ja" if a == {"nummer": sys.argv[1], "betrag": "42.50"} else "nein")' "$NR1" 2>/dev/null)" "$ARGS"
pruefe "Einreicher ist $A" "$(ja_wenn "$(lauf_feld "$L1" einreicher_id)" "$ID_A")"
EIGEN=$(schritt "$L1" 0)
pruefe 'Die Route der eigenen App lief, im Namen des Einreichers' \
  "$([ "${EIGEN%%|*}" = fertig ] && [ "$(enthaelt "$EIGEN" "\"benutzer\":\"$A\"")" = ja ] && echo ja || echo nein)" "$(printf '%s' "$EIGEN" | cut -c1-120)"
pruefe 'b hat zu diesem Lauf nichts bekommen' "$(ja_wenn "$(bei_b "$L1")" '[]')"

# --- 5. Nach der Freigabe von b: derselbe Weg geht durch --------------------------
freigeben "$APP_B" "$ID_A"
pruefe "b ist jetzt auch $A freigegeben" "$(enthaelt "${FREIGEGEBEN[*]}" "$APP_B:$ID_A")"
NR2="R-$STEMPEL-2"
melden "$TOK_A" beleg.eingegangen "{\"nummer\":\"$NR2\",\"betrag\":\"7\"}"
L2=$(lauf_von bei-eingang)
EIGENE_LAEUFE+=("$L2" "$(lauf_von zweiter)")
warte_lauf "$L2"
pruefe "bei-eingang: Lauf $L2 endet fertig" "$(ja_wenn "$STATUS" fertig)" "$STATUS ${FEHLER:+$(printf '%s' "$FEHLER" | cut -c1-120)}"
B2=$(bei_b "$L2")
pruefe 'b bekam POST /eintrag und GET /kunden/<nummer>, je einmal' \
  "$(printf '%s' "$B2" | python3 -c 'import sys,json
d = json.load(sys.stdin)
w = sorted((a["methode"], a["pfad"]) for a in d)
print("ja" if w == [("GET", "/kunden/" + sys.argv[1]), ("POST", "/eintrag")] else "nein")' "$NR2" 2>/dev/null)" "$(printf '%s' "$B2" | cut -c1-160)"
pruefe "b sah $A ($ROLLE_A), den Lauf und die rufende App, kein Geheimnis" \
  "$(printf '%s' "$B2" | python3 -c 'import sys,json
d = json.load(sys.stdin)
ok = d and all(a["benutzer"] == sys.argv[1] and a["rolle"] == sys.argv[2] and a["von_app"] == sys.argv[3] and not a["mit_geheimnis"] for a in d)
print("ja" if ok else "nein")' "$A" "$ROLLE_A" "$APP_A" 2>/dev/null)"
pruefe 'Der Koerper an b traegt die Daten des Ereignisses' \
  "$(printf '%s' "$B2" | python3 -c 'import sys,json
d = json.load(sys.stdin)
p = next((a for a in d if a["methode"] == "POST"), {})
print("ja" if p.get("koerper") == {"nummer": sys.argv[1], "betrag": "7"} else "nein")' "$NR2" 2>/dev/null)"
NACH=$(schritt "$L2" 2)
pruefe 'Die Antwort von b ist die Ausgabe des Schritts' "$(enthaelt "$NACH" "Probe-Kunde $NR2")" "$(printf '%s' "$NACH" | cut -c1-120)"

# --- 6. Ohne Einreicher: im Namen des Besitzers ------------------------------------
NR3="R-$STEMPEL-3"
melden "$TOK" beleg.eingegangen "{\"nummer\":\"$NR3\"}" ohne
L3=$(lauf_von bei-eingang)
EIGENE_LAEUFE+=("$L3" "$(lauf_von zweiter)")
warte_lauf "$L3"
pruefe "Ohne Einreicher: Lauf $L3 endet fertig" "$(ja_wenn "$STATUS" fertig)" "$STATUS"
pruefe '… ohne Einreicher am Lauf' "$([ -z "$(lauf_feld "$L3" einreicher_id)" ] && echo ja || echo nein)"
pruefe "… und b sah den Besitzer des Schluessels ($ARASUL_BENUTZER)" \
  "$(bei_b "$L3" | python3 -c 'import sys,json
d = json.load(sys.stdin)
print("ja" if len(d) == 2 and all(a["benutzer"] == sys.argv[1] for a in d) else "nein")' "$ARASUL_BENUTZER" 2>/dev/null)"

# --- 7. Eine Route, die der Kopf nicht nennt -----------------------------------------
melden "$TOK_A" beleg.fremd '{}'
pruefe 'beleg.fremd startet genau fremd' "$(ja_wenn "$(flows_gestartet)" fremd)" "Geraet $GERAET_CODE"
L4=$(lauf_von fremd)
EIGENE_LAEUFE+=("$L4")
warte_lauf "$L4"
pruefe "fremd: Lauf $L4 endet als fehler" "$(ja_wenn "$STATUS" fehler)" "$STATUS"
pruefe '… mit Grund im Lauf: nicht unter routen' \
  "$(enthaelt "$FEHLER" "Route abgewiesen: POST /loeschen der App $APP_B steht nicht unter \"routen\" im Kopf des Flows")" \
  "$(printf '%s' "$FEHLER" | cut -c1-140)"
pruefe '… und am Schritt' "$(enthaelt "$(schritt "$L4" 0)" 'fehler|Fehler: Route abgewiesen')"
pruefe 'b hat zu diesem Lauf nichts bekommen' "$(ja_wenn "$(bei_b "$L4")" '[]')"

# --- 8. Grenzen ---------------------------------------------------------------------
melden "$TOK_A" beleg.niemand '{"nummer":"x"}'
pruefe 'Ein Ereignis, auf das kein Flow hoert: 200, nichts gestartet' \
  "$([ "$GERAET_CODE" = 200 ] && [ -z "$(flows_gestartet)" ] && echo ja || echo nein)" "Geraet $GERAET_CODE"
melden "$TOK_A" Beleg.Gross '{}'
pruefe 'Ein Name in falscher Form: 400' "$(ja_wenn "$GERAET_CODE" 400)" "Geraet $GERAET_CODE"
ruf "schluessel:$SCHLUESSEL" POST /api/v1/external/ereignisse/beleg.eingegangen '{"daten":{"nummer":"x"}}'
pruefe 'Der Schluessel eines Menschen meldet kein Ereignis: 403' "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
ruf "$TOK" GET "/api/apps/$APP_A/laeufe?limit=200"
VONHAND=$(rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
print(sum(1 for l in d if l["flow_name"] in ("von-hand", "pflicht") and l["created_at"][:19] >= sys.argv[1]))' "$BEGINN" 2>/dev/null)
pruefe 'von-hand und pflicht haben seit dem Start keinen Lauf' "$(ja_wenn "$VONHAND" 0)" "$VONHAND"
EREIGNISLAEUFE=$(rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
eigene = set(sys.argv[2].split())
seit = [l for l in d if l["created_at"][:19] >= sys.argv[1]]
print("ja" if seit and all(str(l["id"]) in eigene and l.get("ausloeser") == "ereignis" for l in seit) else "nein")' "$BEGINN" "${EIGENE_LAEUFE[*]}" 2>/dev/null)
pruefe 'Jeder Lauf von a seit dem Start ist einer der eigenen und hat den Ausloeser ereignis' "$EREIGNISLAEUFE"
pruefe 'Die Liste der Laeufe nennt das Ereignis' \
  "$(rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
print("ja" if any(l.get("ereignis") == "beleg.fremd" for l in d) else "nein")' 2>/dev/null)"

# --- 9. Die Anmeldung steht noch ------------------------------------------------------
ruf "$TOK" GET /api/auth/me
pruefe 'Die Anmeldung am Geraet steht (kein 500)' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

echo
echo "=== $gruen gruen, $rot rot ==="
[ "$rot" -eq 0 ]
