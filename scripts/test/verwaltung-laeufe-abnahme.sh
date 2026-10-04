#!/bin/bash
# =============================================================================
# Abnahme M5: Verwaltung Läufe (Läufe über alle Apps mit Filtern)
# =============================================================================
# Die Abnahme des Auftrags verwaltung-laeufe (04.10.2026). Zwei Probe-Apps
# `probe-laeufe-<stempel>-a` und `-b` aus `tests/probe-laeufe`, DETERMINISTISCH
# OHNE MODELL: wo ein Flow rechnet, rechnet er mit einem externen Modell, das die
# Probe-App selbst ist und immer „Fertig." antwortet. Gemessen wird mit Läufen,
# die diese Abnahme selbst erzeugt, und nur ab der Uhr des Geräts (`BEGINN`).
#
#   von-hand    Lauf von Hand, mit Person (a: das zweite Probekonto, b: das
#               Verwaltungskonto) und ohne Person
#   bei-signal  Lauf auf ein Ereignis, mit und ohne Person
#   takt        jede Minute nach Zeitplan, ohne Person
#   warten      jede Minute nach Zeitplan, hält an einer Freigabe: ein Lauf
#               ohne Person, den die Abnahme als Verwaltung abbricht
#   kaputt      endet als Fehler (Route, die der Kopf nicht nennt)
#   dazu ein eingefügter Lauf „nicht übergeben" (nur so lässt er sich ohne
#   eine App mit Abschluss-Route erzeugen; er wird am Ende wieder gelöscht)
#
#   LISTE        `GET /api/laeufe` nennt Läufe BEIDER Apps; ein Filter nach App
#                nennt nur die dieser App; die Zahl `gesamt` ist die der
#                Datenbank.
#   OBEN         Fehler und „nicht übergeben" stehen vor allem anderen.
#   ERGEBNIS     Filter nach Ergebnis nennt nur dieses Ergebnis.
#   PERSON       Filter nach Person nennt nur ihre Läufe, „ohne" nur die
#                ohne Person (Zeitplan, Ereignis ohne Person, Hand ohne Person).
#   ZEITRAUM     von/bis trennen die Läufe vor und nach einer Marke der Uhr des
#                Geräts; ein Zeitraum in der Zukunft ist leer.
#   EIN LAUF     `GET /api/laeufe/:id` zeigt Auslöser, Ereignis, Person,
#                Schritte mit Ein- und Ausgabe und den Grund des Fehlers; ein
#                Lauf, den es nicht gibt, ist 404; ein schlechter Filter 400.
#   ABBRECHEN    Die Verwaltung bricht einen Lauf OHNE PERSON ab (der Fund vom
#                04.10.2026: probe-admin sah ihn nicht und konnte ihn nicht
#                abbrechen); ein zweites Mal ist 404; `GET /api/flows/laeufe/:id`
#                zeigt der Verwaltung jetzt jeden Lauf.
#   RECHTE       Ein Mitarbeiter bekommt 403 auf Liste, Lauf und Abbrechen und
#                sieht fremde Läufe nicht unter `/api/flows/laeufe/:id`.
#   BROWSER      `verwaltung-laeufe-bilder.mjs` läuft gegen dieselben Läufe
#                (Bilder vom Gerät, Filter, Link, Aufklappen).
#
# Konten: nur die VORHANDENEN Probekonten, nie `admin`; Passwörter nur zur
# Laufzeit aus Bitwarden:
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_GERAET=jetson ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
#   bash scripts/test/verwaltung-laeufe-abnahme.sh
#
# Am Ende: Zeitpläne pausiert, Läufe abgebrochen, der eingefügte Lauf gelöscht,
# Freigaben zurückgenommen, beide Apps samt Ordnern entfernt, Wegwerf-Schlüssel
# widerrufen. Nie angefasst: die Apps, die nicht von dieser Abnahme stammen.
#
# Dauer: etwa fünf Minuten (es wird auf einen Zeitplan-Lauf gewartet).
# Rückgabe 0, wenn jede Prüfung grün war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-laeufe"
STEMPEL="${ARASUL_STEMPEL:-1004}"
APP_A="probe-laeufe-$STEMPEL-a"
APP_B="probe-laeufe-$STEMPEL-b"
VERSION="1.0.0"
GERAET="${ARASUL_GERAET:-}"
GEDULD=900
FLOWS_MIT_MODELL="von-hand takt warten bei-signal"
A="${ARASUL_A:-}"
A_PASS="${ARASUL_A_PASSWORT:-}"
BILDER="${ARASUL_BILDER_SKRIPT:-ja}"

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
enthaelt() { case "$1" in *"$2"*) echo ja ;; *) echo nein ;; esac; }
# enthaelt_wort <liste> <wort>: steht das Wort in der Liste (durch Leerzeichen getrennt)?
im() { case " $2 " in *" $1 "*) echo ja ;; *) echo nein ;; esac; }

if [ -z "$GERAET" ]; then
  echo "ARASUL_GERAET fehlt (ssh-Ziel des Geraets, z. B. jetson): die Messung liest die Datenbank des Geraets."
  exit 1
fi
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

# SQL am Geraet, ueber stdin. Ausgabe: Spalten mit |.
# Die Leitung zum Geraet verliert zeitweise Pakete: ein gescheiterter Aufruf wird
# zweimal wiederholt, bevor seine leere Antwort zaehlt.
db() {
  local versuch aus
  for versuch in 1 2 3; do
    if aus=$(ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" \
      "docker exec -i postgres-db psql -U arasul -d arasul_db -At -F '|' -v ON_ERROR_STOP=1" <<<"$1" 2>/dev/null); then
      printf '%s\n' "$aus"
      return 0
    fi
    sleep 2
  done
  return 1
}
# Die Uhr des Geraets als Zeitpunkt mit Zone (UTC), auf die Millisekunde.
geraetezeit() { db "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"');"; }

# Die Laeufe einer Abfrage als "id:status" in der Reihenfolge des Geraets (Code in $CODE).
liste() { # abfrage
  ruf "$TOK" GET "/api/laeufe?$1"
  rumpf | python3 -c 'import sys,json
try: d = json.load(sys.stdin)["data"]
except Exception: raise SystemExit
print(" ".join("%s:%s" % (l["id"], l["status"]) for l in d))' 2>/dev/null
}
ids_von() { # "id:status …" -> "id …"
  for p in $1; do printf '%s ' "${p%%:*}"; done
}
gesamt() { rumpf | feld gesamt; }

# baue_paket <kennung>
baue_paket() {
  local kennung="$1" ordner="$ARBEIT/$1"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$QUELLE/frontend" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$kennung" "$VERSION" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Probe: Läufe (%s)" % kennung.rsplit("-", 1)[-1]
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
m["backend"]["umgebung"]["PROBE_APP"] = kennung
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/$kennung.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/$kennung.tgz"
}

# Wartet, bis der Lauf $1 nicht mehr laeuft oder wartet (hoechstens $2 Sekunden).
warte_lauf() {
  local ende=$((SECONDS + ${2:-180})) st=""
  while [ "$SECONDS" -lt "$ende" ]; do
    st=$(db "SELECT status FROM flow_runs WHERE id = $1;")
    case "$st" in laeuft | wartend | "") sleep 3 ;; *) STATUS="$st"; return 0 ;; esac
  done
  STATUS="$st"
  return 1
}

# starten <token> <app> <flow> [ohne_einreicher] -- Lauf von Hand ueber die App; Nummer in $LAUF
LAUF=""
starten() {
  local tok="$1" app="$2" flow="$3" ohne="${4:-}"
  ruf "$tok" POST "/apps/$app/api/starten?flow=$flow${ohne:+&ohne_einreicher=1}" '{}'
  LAUF=$(rumpf | feld geraet.run_id)
}
# melden <token> <app> <ereignis> [ohne_einreicher] -- Ereignis ueber die App; Nummer des ersten Laufs in $LAUF
melden() {
  local tok="$1" app="$2" name="$3" ohne="${4:-}"
  ruf "$tok" POST "/apps/$app/api/melden?ereignis=$name${ohne:+&ohne_einreicher=1}" '{}'
  LAUF=$(rumpf | python3 -c 'import sys,json
try: g = json.load(sys.stdin)["geraet"]
except Exception: print(""); raise SystemExit
print(next((str(l["run_id"]) for l in g.get("laeufe", [])), ""))' 2>/dev/null)
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

# Ab wann gezaehlt wird: die UHR DES GERAETS, nicht die dieses Rechners.
BEGINN=$(geraetezeit)
if [ -z "$BEGINN" ]; then
  echo "Das Geraet nennt keine Uhrzeit (ssh oder Datenbank antwortet nicht); ohne sie zaehlt die Abnahme nicht nur Eigenes."
  exit 1
fi

echo "=== Abnahme M5: Verwaltung Läufe, $APP_A und $APP_B gegen $BASIS ==="
echo "gezaehlt ab $BEGINN (Uhr des Geraets, UTC)"
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
[ -z "$ID_ADMIN" ] || [ -z "$ID_A" ] && exit 1

SCHLUESSEL=""
KEY_ID=""
FREIGEGEBEN=()
EINGEFUEGT=""
BILDER_LAEUFT=""
aufraeumen() {
  if [ -n "$TOK" ]; then
    # Erst alles anhalten, was von allein starten wuerde, dann die offenen Laeufe.
    for app in "$APP_A" "$APP_B"; do
      for f in takt warten; do
        curl -sk -o /dev/null --max-time 30 -X PUT -H "authorization: Bearer $TOK" \
          -H 'content-type: application/json' -d '{"pausiert":true}' \
          "$BASIS/api/apps/$app/flows/$f/zeitplan"
      done
      for id in $(db "SELECT id FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$app' AND status IN ('laeuft','wartend');"); do
        curl -sk -o /dev/null --max-time 30 -X POST -H "authorization: Bearer $TOK" \
          "$BASIS/api/laeufe/$id/abbrechen"
      done
    done
  fi
  [ -n "$EINGEFUEGT" ] && db "DELETE FROM flow_runs WHERE id = $EINGEFUEGT AND app_id = '$APP_A';" >/dev/null
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
  printf 'aufgeraeumt  Zeitplaene pausiert, offene Laeufe abgebrochen, eingefuegter Lauf geloescht, Freigaben zurueckgenommen, %s und %s entfernt (mit Ordnern), Wegwerf-Schluessel widerrufen\n' "$APP_A" "$APP_B"
}
trap aufraeumen EXIT

freigeben() { # app id
  ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$1\",\"benutzer_id\":$2}"
  [[ "$CODE" =~ ^20[01]$ ]] && FREIGEGEBEN+=("$1:$2")
}

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme M5 Laeufe ($APP_A)\",\"allowed_endpoints\":[\"app:deploy\",\"flow:run\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# --- 2. Einspielen, live, Freigaben, feste Antwort --------------------------------
for app in "$APP_B" "$APP_A"; do
  PAKET=$(baue_paket "$app")
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$PAKET" "$BASIS/api/v1/external/apps")
  pruefe "$app in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
  [ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
  # Bevor der Livestand steht, ruhen die Zeitplaene: der erste Termin kaeme sonst
  # mit dem echten Modell. Die Flows rechnen danach mit der festen Antwort.
  for f in takt warten; do
    ruf "$TOK" PUT "/api/apps/$app/flows/$f/zeitplan" '{"pausiert":true}'
  done
  ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$app/schalten" '{"ziel":"live"}'
  pruefe "$app live geschaltet" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
done

freigeben "$APP_A" "$ID_ADMIN"
freigeben "$APP_A" "$ID_A"
freigeben "$APP_B" "$ID_ADMIN"
freigeben "$APP_B" "$ID_A"
pruefe "Beide Apps sind $ARASUL_BENUTZER und $A freigegeben" \
  "$([ "${#FREIGEGEBEN[@]}" = 4 ] && echo ja || echo nein)" "${FREIGEGEBEN[*]}"

for app in "$APP_A" "$APP_B"; do
  if arasul_warte_auf_app "/apps/$app/api/gesund" 240 "$TOK"; then
    pruefe "$app antwortet" ja
  else
    pruefe "$app antwortet" nein 'Zeitgrenze 240s'; exit 1
  fi
  codes=""
  for f in $FLOWS_MIT_MODELL; do
    ruf "$TOK" PUT "/api/apps/$app/flows/$f/modell" \
      "{\"extern\":{\"anbieter\":\"Probe\",\"modell\":\"fest\",\"basis_url\":\"http://arasul-app-$app-live:8080/v1\"}}"
    codes="$codes $CODE"
  done
  pruefe "$app: die Flows rechnen mit der festen Antwort, ohne Modell" \
    "$(ja_wenn "$codes" " 200 200 200 200")" "HTTP$codes"
done

# --- 3. Laeufe erzeugen ------------------------------------------------------------
# Zuerst, was vor der Marke T_MITTE liegen soll (nur a), dann, was danach kommt.
starten "$TOK_A" "$APP_A" von-hand
L_HAND_A=$LAUF
starten "$TOK" "$APP_A" von-hand ohne
L_HAND_OHNE=$LAUF
starten "$TOK_A" "$APP_A" kaputt
L_KAPUTT=$LAUF
pruefe 'Drei Laeufe von Hand auf a: mit Person, ohne Person, kaputt' \
  "$([ -n "$L_HAND_A" ] && [ -n "$L_HAND_OHNE" ] && [ -n "$L_KAPUTT" ] && echo ja || echo nein)" \
  "$L_HAND_A $L_HAND_OHNE $L_KAPUTT"
[ -z "$L_HAND_A" ] || [ -z "$L_HAND_OHNE" ] || [ -z "$L_KAPUTT" ] && { rumpf; echo; exit 1; }

EINGEFUEGT=$(db "INSERT INTO flow_runs (user_id, flow_name, app_id, stand, status, error, finished_at, ausloeser)
  SELECT id, 'von-hand', '$APP_A', 'live', 'nicht_uebergeben', 'Die App antwortete 503 (von der Abnahme eingefuegt)', now(), 'hand'
    FROM public.admin_users WHERE username = '$ARASUL_BENUTZER' RETURNING id;" | head -1)
pruefe 'Ein Lauf „nicht uebergeben" eingefuegt (wird am Ende geloescht)' "$([ -n "$EINGEFUEGT" ] && echo ja || echo nein)" "$EINGEFUEGT"
[ -z "$EINGEFUEGT" ] && exit 1

for l in "$L_HAND_A" "$L_HAND_OHNE" "$L_KAPUTT"; do warte_lauf "$l" 180; done
sleep 2
T_MITTE=$(geraetezeit)
sleep 2

starten "$TOK" "$APP_B" von-hand
L_HAND_B=$LAUF
melden "$TOK_A" "$APP_A" laeufe.signal
L_EREIGNIS_A=$LAUF
melden "$TOK" "$APP_B" laeufe.signal ohne
L_EREIGNIS_B_OHNE=$LAUF
pruefe 'Laeufe nach der Marke: von Hand auf b, Ereignis mit Person auf a, Ereignis ohne Person auf b' \
  "$([ -n "$L_HAND_B" ] && [ -n "$L_EREIGNIS_A" ] && [ -n "$L_EREIGNIS_B_OHNE" ] && echo ja || echo nein)" \
  "$L_HAND_B $L_EREIGNIS_A $L_EREIGNIS_B_OHNE"
[ -z "$L_HAND_B" ] || [ -z "$L_EREIGNIS_A" ] || [ -z "$L_EREIGNIS_B_OHNE" ] && { rumpf; echo; exit 1; }
for l in "$L_HAND_B" "$L_EREIGNIS_A" "$L_EREIGNIS_B_OHNE"; do warte_lauf "$l" 180; done
ENDEN=$(db "SELECT string_agg(id || '=' || status, ' ' ORDER BY id) FROM flow_runs WHERE id IN ($L_HAND_A, $L_HAND_OHNE, $L_KAPUTT, $L_HAND_B, $L_EREIGNIS_A, $L_EREIGNIS_B_OHNE);")
pruefe 'Von Hand und auf Ereignis enden die Laeufe als fertig, kaputt als Fehler' \
  "$([ "$ENDEN" = "$L_HAND_A=fertig $L_HAND_OHNE=fertig $L_KAPUTT=fehler $L_HAND_B=fertig $L_EREIGNIS_A=fertig $L_EREIGNIS_B_OHNE=fertig" ] && echo ja || echo nein)" "$ENDEN"

# Zeitplan: nur a, ein Lauf `warten` ohne Person, der an der Freigabe haengt, und `takt`.
ruf "$TOK" PUT "/api/apps/$APP_A/flows/warten/zeitplan" '{"pausiert":false}'
ruf "$TOK" PUT "/api/apps/$APP_A/flows/takt/zeitplan" '{"pausiert":false}'
L_WARTEN=""
ende=$((SECONDS + 200))
while [ "$SECONDS" -lt "$ende" ]; do
  L_WARTEN=$(db "SELECT id FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP_A' AND flow_name = 'warten' AND status = 'wartend' ORDER BY id LIMIT 1;")
  [ -n "$L_WARTEN" ] && break
  sleep 5
done
pruefe 'Der Zeitplan startet auf a einen Lauf, der an einer Freigabe wartet' "$([ -n "$L_WARTEN" ] && echo ja || echo nein)" "Lauf ${L_WARTEN:-—}"
[ -z "$L_WARTEN" ] && exit 1
L_TAKT=""
ende=$((SECONDS + 90))
while [ "$SECONDS" -lt "$ende" ]; do
  L_TAKT=$(db "SELECT id FROM flow_runs WHERE created_at >= '$BEGINN' AND app_id = '$APP_A' AND flow_name = 'takt' ORDER BY id LIMIT 1;")
  [ -n "$L_TAKT" ] && break
  sleep 3
done
# Ab hier kommt nichts mehr von allein dazu.
ruf "$TOK" PUT "/api/apps/$APP_A/flows/takt/zeitplan" '{"pausiert":true}'
ruf "$TOK" PUT "/api/apps/$APP_A/flows/warten/zeitplan" '{"pausiert":true}'
pruefe 'Der Zeitplan-Lauf hat keine Person und den Ausloeser zeitplan' \
  "$([ "$(db "SELECT coalesce(einreicher_id::text, '') || '|' || ausloeser FROM flow_runs WHERE id = $L_WARTEN;")" = "|zeitplan" ] && echo ja || echo nein)"

# --- 4. Liste: alle Apps, ein Filter nach App ---------------------------------------
ALLE=$(liste "von=$BEGINN&limit=200")
pruefe 'GET /api/laeufe: 200' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
IDS_ALLE=" $(ids_von "$ALLE")"
pruefe 'Die Liste nennt Laeufe BEIDER Apps' \
  "$([ "$(im "$L_HAND_A" "$IDS_ALLE")" = ja ] && [ "$(im "$L_HAND_B" "$IDS_ALLE")" = ja ] && [ "$(im "$L_EREIGNIS_B_OHNE" "$IDS_ALLE")" = ja ] && [ "$(im "$L_WARTEN" "$IDS_ALLE")" = ja ] && echo ja || echo nein)"
pruefe 'Die Zahl `gesamt` ist die der Datenbank' \
  "$(ja_wenn "$(gesamt)" "$(db "SELECT count(*) FROM flow_runs WHERE created_at >= '$BEGINN'::timestamptz;")")" "$(gesamt)"

NUR_A=$(liste "app=$APP_A&von=$BEGINN&limit=200")
IDS_A=" $(ids_von "$NUR_A")"
pruefe 'Filter App a nennt nur Laeufe von a' \
  "$(ja_wenn "$(db "SELECT count(*) FROM flow_runs WHERE id IN ($(ids_von "$NUR_A" | sed 's/ $//; s/ /,/g')) AND app_id <> '$APP_A';")" 0)"
pruefe '… mit allen Laeufen von a und keinem von b' \
  "$([ "$(im "$L_HAND_A" "$IDS_A")" = ja ] && [ "$(im "$L_KAPUTT" "$IDS_A")" = ja ] && [ "$(im "$L_EREIGNIS_A" "$IDS_A")" = ja ] && [ "$(im "$L_WARTEN" "$IDS_A")" = ja ] && [ "$(im "$EINGEFUEGT" "$IDS_A")" = ja ] && [ "$(im "$L_HAND_B" "$IDS_A")" = nein ] && [ "$(im "$L_EREIGNIS_B_OHNE" "$IDS_A")" = nein ] && echo ja || echo nein)"
NUR_B=$(liste "app=$APP_B&von=$BEGINN&limit=200")
IDS_B=" $(ids_von "$NUR_B")"
pruefe 'Filter App b nennt die zwei Laeufe von b und keinen von a' \
  "$([ "$(im "$L_HAND_B" "$IDS_B")" = ja ] && [ "$(im "$L_EREIGNIS_B_OHNE" "$IDS_B")" = ja ] && [ "$(im "$L_HAND_A" "$IDS_B")" = nein ] && [ "$(im "$L_WARTEN" "$IDS_B")" = nein ] && echo ja || echo nein)" "$(echo $IDS_B)"
liste "app=nichtda-$STEMPEL" >/dev/null
pruefe 'Eine App, die es nicht gibt, hat keine Laeufe (leer, kein Fehler)' "$([ "$CODE" = 200 ] && [ "$(gesamt)" = 0 ] && echo ja || echo nein)" "HTTP $CODE gesamt $(gesamt)"

# --- 5. Oben: Fehler und „nicht uebergeben" -------------------------------------------
pruefe 'Fehler und „nicht uebergeben" stehen vor allem anderen' \
  "$(python3 - "$NUR_A" <<'PY'
import sys
st = [p.split(":")[1] for p in sys.argv[1].split()]
schlecht = [s in ("fehler", "nicht_uebergeben") for s in st]
erster_gut = next((i for i, s in enumerate(schlecht) if not s), len(schlecht))
print("ja" if any(schlecht) and not any(schlecht[erster_gut:]) else "nein")
PY
)" "$(echo "$NUR_A" | cut -c1-120)"
pruefe '… also stehen der Fehler und der eingefuegte Lauf ganz oben' \
  "$(python3 - "$NUR_A" "$L_KAPUTT" "$EINGEFUEGT" <<'PY'
import sys
erste = [p.split(":")[0] for p in sys.argv[1].split()][:2]
print("ja" if set(erste) == {sys.argv[2], sys.argv[3]} else "nein")
PY
)"

# --- 6. Ergebnis ----------------------------------------------------------------------
FEHLER=$(liste "app=$APP_A&status=fehler&von=$BEGINN")
pruefe 'Filter Ergebnis „fehler" nennt nur Fehler, darunter kaputt' \
  "$([ "$FEHLER" = "$L_KAPUTT:fehler" ] && echo ja || echo nein)" "$FEHLER"
NUE=$(liste "app=$APP_A&status=nicht_uebergeben&von=$BEGINN")
pruefe 'Filter Ergebnis „nicht_uebergeben" nennt den eingefuegten Lauf' \
  "$([ "$NUE" = "$EINGEFUEGT:nicht_uebergeben" ] && echo ja || echo nein)" "$NUE"
WART=$(liste "app=$APP_A&status=wartend&von=$BEGINN")
pruefe 'Filter Ergebnis „wartend" nennt den Zeitplan-Lauf' \
  "$([ "$(im "$L_WARTEN" " $(ids_von "$WART")")" = ja ] && [ -z "$(echo "$WART" | tr ' ' '\n' | grep -v ':wartend$')" ] && echo ja || echo nein)" "$(echo "$WART" | cut -c1-100)"
liste "status=gibtesnicht" >/dev/null
pruefe 'Ein Ergebnis, das es nicht gibt: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"

# --- 7. Person ---------------------------------------------------------------------------
P_A=$(liste "app=$APP_A&person=$ID_A&von=$BEGINN")
IDS_PA=" $(ids_von "$P_A")"
pruefe "Filter Person $A nennt seine Laeufe auf a: von Hand, kaputt, Ereignis" \
  "$([ "$(im "$L_HAND_A" "$IDS_PA")" = ja ] && [ "$(im "$L_KAPUTT" "$IDS_PA")" = ja ] && [ "$(im "$L_EREIGNIS_A" "$IDS_PA")" = ja ] && [ "$(im "$L_HAND_OHNE" "$IDS_PA")" = nein ] && [ "$(im "$L_WARTEN" "$IDS_PA")" = nein ] && echo ja || echo nein)" "$(echo $IDS_PA)"
P_ADMIN=$(liste "person=$ID_ADMIN&von=$BEGINN&limit=200")
pruefe "Filter Person $ARASUL_BENUTZER nennt seinen Lauf auf b, aber keinen ohne Person" \
  "$([ "$(im "$L_HAND_B" " $(ids_von "$P_ADMIN")")" = ja ] && [ "$(im "$L_HAND_OHNE" " $(ids_von "$P_ADMIN")")" = nein ] && echo ja || echo nein)"
P_OHNE=$(liste "person=ohne&von=$BEGINN&limit=200")
IDS_OHNE=" $(ids_von "$P_OHNE")"
pruefe 'Filter „ohne Person" nennt Zeitplan, Ereignis ohne Person und Hand ohne Person' \
  "$([ "$(im "$L_WARTEN" "$IDS_OHNE")" = ja ] && [ "$(im "$L_TAKT" "$IDS_OHNE")" = ja ] && [ "$(im "$L_EREIGNIS_B_OHNE" "$IDS_OHNE")" = ja ] && [ "$(im "$L_HAND_OHNE" "$IDS_OHNE")" = ja ] && echo ja || echo nein)"
pruefe '… und keinen Lauf mit Person' \
  "$([ "$(im "$L_HAND_A" "$IDS_OHNE")" = nein ] && [ "$(im "$L_HAND_B" "$IDS_OHNE")" = nein ] && [ "$(im "$L_EREIGNIS_A" "$IDS_OHNE")" = nein ] && echo ja || echo nein)"
liste "person=abc" >/dev/null
pruefe 'Eine Person, die keine Nummer ist: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"

# --- 8. Zeitraum ----------------------------------------------------------------------------
VOR=$(liste "von=$BEGINN&bis=$T_MITTE&limit=200")
NACH=$(liste "von=$T_MITTE&limit=200")
IDS_VOR=" $(ids_von "$VOR")"
IDS_NACH=" $(ids_von "$NACH")"
pruefe 'Zeitraum bis zur Marke nennt die ersten drei Laeufe von a, keinen danach' \
  "$([ "$(im "$L_HAND_A" "$IDS_VOR")" = ja ] && [ "$(im "$L_KAPUTT" "$IDS_VOR")" = ja ] && [ "$(im "$L_HAND_B" "$IDS_VOR")" = nein ] && [ "$(im "$L_EREIGNIS_A" "$IDS_VOR")" = nein ] && echo ja || echo nein)" "Marke $T_MITTE"
pruefe 'Zeitraum ab der Marke nennt die Laeufe danach, keinen davor' \
  "$([ "$(im "$L_HAND_B" "$IDS_NACH")" = ja ] && [ "$(im "$L_EREIGNIS_A" "$IDS_NACH")" = ja ] && [ "$(im "$L_WARTEN" "$IDS_NACH")" = ja ] && [ "$(im "$L_HAND_A" "$IDS_NACH")" = nein ] && [ "$(im "$L_KAPUTT" "$IDS_NACH")" = nein ] && echo ja || echo nein)"
ZUKUNFT=$(liste "von=2099-01-01T00:00:00Z")
pruefe 'Ein Zeitraum in der Zukunft ist leer' "$([ -z "$ZUKUNFT" ] && [ "$(gesamt)" = 0 ] && echo ja || echo nein)" "gesamt $(gesamt)"
liste "von=gestern" >/dev/null
pruefe 'Ein Zeitpunkt, der keiner ist: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
liste "app=$APP_A&status=fehler&person=$ID_A&von=$BEGINN&bis=2099-01-01T00:00:00Z" >/dev/null
pruefe 'Alle Filter zugleich gelten zusammen: der Fehler von a mit Person' "$([ "$(gesamt)" = 1 ] && echo ja || echo nein)" "gesamt $(gesamt)"

# --- 9. Ein Lauf ----------------------------------------------------------------------------
ruf "$TOK" GET "/api/laeufe/$L_EREIGNIS_A"
pruefe 'GET /api/laeufe/:id (Ereignis mit Person): Ausloeser, Ereignis, Person' \
  "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.ausloeser)" = ereignis ] && [ "$(rumpf | feld data.ereignis)" = laeufe.signal ] && [ "$(rumpf | feld data.person_id)" = "$ID_A" ] && [ "$(rumpf | feld data.app_id)" = "$APP_A" ] && echo ja || echo nein)" \
  "HTTP $CODE $(rumpf | feld data.ausloeser) $(rumpf | feld data.ereignis) person $(rumpf | feld data.person_id)"
ruf "$TOK" GET "/api/laeufe/$L_EREIGNIS_B_OHNE"
pruefe '… ein Ereignis ohne Person hat keine Person' \
  "$([ "$CODE" = 200 ] && [ -z "$(rumpf | feld data.person_id)" ] && [ "$(rumpf | feld data.ausloeser)" = ereignis ] && echo ja || echo nein)"
ruf "$TOK" GET "/api/laeufe/$L_HAND_A"
pruefe '… ein Lauf von Hand zeigt einen Schritt mit Eingabe und Ausgabe, Freigaben als Liste und das Ergebnis' \
  "$([ "$(rumpf | feld data.steps | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d))')" -ge 1 ] && [ -n "$(rumpf | feld data.steps.0.input)" ] && [ -n "$(rumpf | feld data.steps.0.output)" ] && [ "$(rumpf | feld data.freigaben)" = "[]" ] && [ -n "$(rumpf | feld data.result)" ] && echo ja || echo nein)" \
  "$(rumpf | feld data.steps | python3 -c 'import sys,json; d=json.load(sys.stdin); print(len(d), "Schritt(e)")')"
ruf "$TOK" GET "/api/laeufe/$L_KAPUTT"
pruefe '… der Fehler nennt seinen Grund und den Schritt, der ihn trug' \
  "$([ "$(rumpf | feld data.status)" = fehler ] && [[ "$(rumpf | feld data.error)" == *"Route abgewiesen"* ]] && [ "$(rumpf | feld data.steps.0.status)" != "" ] && echo ja || echo nein)" \
  "$(rumpf | feld data.error | cut -c1-90)"
ruf "$TOK" GET "/api/laeufe/$L_WARTEN?raw=1"
pruefe '… ?raw=1 geht, der Zeitplan-Lauf zeigt den Ausloeser zeitplan' \
  "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.ausloeser)" = zeitplan ] && echo ja || echo nein)" "HTTP $CODE"
ruf "$TOK" GET /api/laeufe/999999999
pruefe 'Ein Lauf, den es nicht gibt: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
ruf "$TOK" GET /api/laeufe/abc
pruefe 'Eine Nummer, die keine ist: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"

# --- 10. Abbrechen: auch ein Lauf ohne Person ----------------------------------------------
ruf "$TOK" GET "/api/flows/laeufe/$L_WARTEN"
pruefe 'GET /api/flows/laeufe/:id zeigt der Verwaltung auch den Zeitplan-Lauf (vorher 404)' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK_A" GET "/api/flows/laeufe/$L_WARTEN"
pruefe "Ein Mitarbeiter sieht den Lauf eines anderen dort weiterhin nicht" "$([ "$ROLLE_A" = admin ] && echo ja || ja_wenn "$CODE" 404)" "$A ist $ROLLE_A, HTTP $CODE"
ruf "$TOK" POST "/api/laeufe/$L_WARTEN/abbrechen"
pruefe 'Die Verwaltung bricht den Lauf OHNE PERSON ab' \
  "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.status)" = abgebrochen ] && echo ja || echo nein)" "HTTP $CODE $(rumpf | feld data.status)"
pruefe '… in der Datenbank steht er als abgebrochen, mit Ende' \
  "$([ "$(db "SELECT status || '|' || (finished_at IS NOT NULL)::text FROM flow_runs WHERE id = $L_WARTEN;")" = "abgebrochen|true" ] && echo ja || echo nein)"
pruefe '… und seine Freigabe-Anfrage ist geschlossen' \
  "$([ "$(db "SELECT count(*) FROM public.approvals WHERE run_id = $L_WARTEN AND status = 'offen';")" = 0 ] && echo ja || echo nein)"
ruf "$TOK" POST "/api/laeufe/$L_WARTEN/abbrechen"
pruefe 'Ein zweites Mal: 404, er laeuft nicht mehr' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
ruf "$TOK" POST "/api/laeufe/$L_HAND_A/abbrechen"
pruefe 'Ein fertiger Lauf laesst sich nicht abbrechen: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
pruefe 'Das Sicherheitsprotokoll nennt den Abbruch' \
  "$([ "$(db "SELECT count(*) FROM audit_logs WHERE action = 'lauf_abgebrochen' AND details->>'run_id' = '$L_WARTEN';")" -ge 1 ] && echo ja || echo nein)"

# --- 11. Rechte ---------------------------------------------------------------------------------
if [ "$ROLLE_A" = admin ]; then
  echo "       (uebersprungen: $A ist selbst ein Administrator, die Rechte-Pruefung braucht einen Mitarbeiter)"
else
  ruf "$TOK_A" GET "/api/laeufe?limit=5"
  pruefe "Ein Mitarbeiter bekommt die Liste nicht: 403" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
  ruf "$TOK_A" GET "/api/laeufe/$L_HAND_B"
  pruefe '… den Lauf nicht: 403' "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
  ruf "$TOK_A" POST "/api/laeufe/$L_HAND_B/abbrechen"
  pruefe '… und kein Abbrechen: 403' "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
fi
CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 "$BASIS/api/laeufe")
pruefe 'Ohne Anmeldung: 401' "$(ja_wenn "$CODE" 401)" "HTTP $CODE"
ruf "schluessel:$SCHLUESSEL" GET "/api/laeufe"
pruefe 'Mit dem Schluessel einer App oder eines Menschen: nicht zugaenglich (401 oder 403)' \
  "$([ "$CODE" = 401 ] || [ "$CODE" = 403 ] && echo ja || echo nein)" "HTTP $CODE"

# --- 12. Die Seite der App zeigt keine zweite Liste, die alte Route bleibt ------------------
ruf "$TOK" GET "/api/apps/$APP_A/laeufe?limit=200"
pruefe 'GET /api/apps/:id/laeufe antwortet weiter (Ereignis und Zeitplan stehen darin)' \
  "$([ "$CODE" = 200 ] && [ "$(rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
print(sum(1 for l in d if l["ausloeser"] in ("zeitplan", "ereignis")))')" -ge 2 ] && echo ja || echo nein)"

# --- 13. Browser: Bilder vom Geraet -----------------------------------------------------------
if [ "$BILDER" = ja ]; then
  echo
  echo "--- Browser: scripts/test/verwaltung-laeufe-bilder.mjs ---"
  ARASUL_URL="$BASIS" ARASUL_BENUTZER="$ARASUL_BENUTZER" ARASUL_PASSWORT="$ARASUL_PASSWORT" \
    LAEUFE_APP_A="$APP_A" LAEUFE_APP_B="$APP_B" LAEUFE_ID_A="$ID_A" \
    LAEUFE_HAND_A="$L_HAND_A" LAEUFE_HAND_OHNE="$L_HAND_OHNE" LAEUFE_KAPUTT="$L_KAPUTT" \
    LAEUFE_EINGEFUEGT="$EINGEFUEGT" LAEUFE_HAND_B="$L_HAND_B" LAEUFE_EREIGNIS_A="$L_EREIGNIS_A" \
    LAEUFE_EREIGNIS_B_OHNE="$L_EREIGNIS_B_OHNE" LAEUFE_ZEITPLAN="$L_TAKT" LAEUFE_BEGINN="$BEGINN" \
    node "$WURZEL/scripts/test/verwaltung-laeufe-bilder.mjs"
  pruefe 'Der Browser-Teil ist gruen' "$([ $? -eq 0 ] && echo ja || echo nein)"
fi

echo
echo "gruen: $gruen, ROT: $rot"
[ "$rot" -eq 0 ]
