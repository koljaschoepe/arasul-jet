#!/bin/bash
# =============================================================================
# Abnahme M5: Freigaben in benannten Stufen mit Standardperson je App
# =============================================================================
# Die Abnahme des Auftrags flow-stufen-standardperson (04.10.2026):
#
#   VERWALTUNG  Der Admin setzt je App und Stufe eine Standardperson
#               (GET/PUT /api/apps/:id/stufen). Nur wer Zugang hat (sonst 400).
#   STUFEN      Ein Flow mit zwei Stufen (`tests/probe-stufen`, Pruefung, dann
#               Leitung) legt nacheinander je eine Freigabe an; jede liegt
#               zuerst bei der Standardperson ihrer Stufe.
#   UEBERGABE   Eine andere Person mit Zugang uebernimmt sie oder gibt sie an
#               eine Person mit Zugang weiter; nie an den Einreicher (400).
#   VIER AUGEN  Wer eingereicht hat, bekommt beim Entscheiden 403 -- vom
#               Backend, ohne dass die App `ohne_einreicher` setzt.
#   OHNE        Ohne Standardperson liegt die Freigabe bei allen mit Zugang,
#               und der Admin sieht einen Hinweis.
#   LISTEN      GET /api/freigabe-anfragen (Startseite 'Für Sie" und die Zahl am
#               Haus lesen genau diese Liste) zeigt jedem nur, was bei ihm liegt.
#   BROWSER     `stufen-standardperson-bilder.mjs` an drei Stellen (ARASUL_BILDER=1).
#
# Konten: drei VORHANDENE Probekonten, nie `admin`, keine neuen. Passwoerter
# nur zur Laufzeit, z. B. aus Bitwarden:
#
#   ARASUL_URL=https://100.121.244.80 \
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
#   ARASUL_B=probe-j36-b ARASUL_B_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-b')" \
#   ARASUL_BILDER=1 bash scripts/test/stufen-standardperson-abnahme.sh
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-stufen-<MMDD>` (samt Image und
# Ordner unter /arasul/apps), die Freigaben der App an die drei Konten, den
# Wegwerf-Schluessel. Ob unter /arasul/apps ein Ordner bleibt, prueft der
# Aufrufer am Geraet (`docker exec dashboard-backend ls /arasul/apps`).
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-stufen"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP="${ARASUL_STUFEN_APP:-probe-stufen-$STEMPEL}"
VERSION="1.0.0"
GEDULD=900
HALT_GEDULD=240
LAUF_GEDULD=600

A="${ARASUL_A:-}"
A_PASS="${ARASUL_A_PASSWORT:-}"
B="${ARASUL_B:-}"
B_PASS="${ARASUL_B_PASSWORT:-}"

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

if [ -z "$A" ] || [ -z "$A_PASS" ] || [ -z "$B" ] || [ -z "$B_PASS" ]; then
  echo "ARASUL_A, ARASUL_A_PASSWORT, ARASUL_B, ARASUL_B_PASSWORT fehlen (vorhandene Probekonten)."
  exit 1
fi
for wer in "$ARASUL_BENUTZER" "$A" "$B"; do
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

# Die offene Anfrage eines Laufs aus einer Liste `data`, als JSON, oder leer.
anfrage_zu_lauf() {
  python3 -c 'import sys,json
lauf = int(sys.argv[1])
try: liste = json.load(sys.stdin)["data"]
except Exception: print(""); raise SystemExit
for a in liste:
    if int(a.get("run_id", -1)) == lauf:
        print(json.dumps(a, ensure_ascii=False)); raise SystemExit
print("")' "$1" 2>/dev/null
}

anzahl() { python3 -c 'import sys,json
try: print(len(json.load(sys.stdin)["data"]))
except Exception: print("")' 2>/dev/null; }

anmelden() {
  curl -sk -X POST -H 'content-type: application/json' --max-time 30 \
    -d "$(python3 -c 'import json,sys; print(json.dumps({"username":sys.argv[1],"password":sys.argv[2]}))' "$1" "$2")" \
    "$BASIS/api/auth/login" | feld token
}

baue_paket() {
  local ordner="$ARBEIT/paket"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$QUELLE/frontend" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$VERSION" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Probe: Stufen (%s)" % kennung.rsplit("-", 1)[-1]
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket.tgz"
}

# Einen Vorgang als A einreichen und warten, bis sein Lauf anhaelt. Setzt $LAUF.
LAUF=""
einreichen_und_warten() {
  local beleg="$1"
  LAUF=""
  ruf "$TOK_A" POST "/apps/$APP/api/einreichen?beleg=$beleg"
  if [ "$CODE" = "404" ]; then
    sleep 5
    ruf "$TOK_A" POST "/apps/$APP/api/einreichen?beleg=$beleg"
  fi
  LAUF=$(rumpf | feld lauf)
  [ -n "$LAUF" ] || { echo "        Antwort der App: HTTP $CODE $(rumpf)"; return 1; }
  warte_auf_wartend
}

warte_auf_wartend() {
  local ende=$((SECONDS + HALT_GEDULD))
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$TOK_A" GET "/apps/$APP/api/lauf?lauf=$LAUF"
    case "$(rumpf | feld status)" in
      wartend) return 0 ;;
      fertig | fehler | abgebrochen | abgelaufen) return 1 ;;
    esac
    sleep 2
  done
  return 1
}

# Wartet, bis zum Lauf eine offene Anfrage der Stufe $2 in der Liste von $1
# (`offen` = /api/freigabe-anfragen, `andere` = …/bei-anderen) steht. Setzt $ANFRAGE.
ANFRAGE=""
warte_auf_anfrage() {
  local tok="$1" stufe="$2" liste="${3:-}"
  local ende=$((SECONDS + HALT_GEDULD)) a=""
  ANFRAGE=""
  while [ "$SECONDS" -lt "$ende" ]; do
    for pfad in /api/freigabe-anfragen /api/freigabe-anfragen/bei-anderen; do
      [ -n "$liste" ] && [ "$pfad" != "$liste" ] && continue
      ruf "$tok" GET "$pfad"
      a=$(rumpf | anfrage_zu_lauf "$LAUF")
      if [ -n "$a" ] && [ "$(printf '%s' "$a" | feld stufe)" = "$stufe" ]; then
        ANFRAGE=$(printf '%s' "$a" | feld id)
        return 0
      fi
    done
    sleep 3
  done
  return 1
}

# Liegt die Anfrage zum Lauf in der Liste? Setzt $HAT (ja/nein) und $ZEILE
# (das JSON) -- ohne Kommandosubstitution, sonst waeren beide danach weg.
ZEILE=""
HAT=""
liste() {
  local tok="$1" pfad="$2"
  ruf "$tok" GET "$pfad"
  ZEILE=$(rumpf | anfrage_zu_lauf "$LAUF")
  if [ -n "$ZEILE" ]; then HAT=ja; else HAT=nein; fi
}
nicht() { if [ "$1" = ja ]; then echo nein; else echo ja; fi; }
liegt_bei() { printf '%s' "$ZEILE" | feld liegt_bei; }

bilder() {
  [ "${ARASUL_BILDER:-}" = "1" ] || return 0
  ARASUL_A="$A" ARASUL_A_PASSWORT="$A_PASS" ARASUL_B="$B" ARASUL_B_PASSWORT="$B_PASS" \
    ARASUL_B_ROLLE="$ROLLE_B" ARASUL_STUFEN_APP="$APP" ARASUL_STUFEN_TITEL="$1" \
    node "$WURZEL/scripts/test/stufen-standardperson-bilder.mjs" "$2" | sed 's/^/  bild /'
  local ergebnis="${PIPESTATUS[0]}"
  pruefe "Bilder: $2" "$(ja_wenn "$ergebnis" 0)"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS."
  exit 1
fi

echo "=== Abnahme M5: Stufen mit Standardperson, $APP gegen $BASIS ==="
echo

# --- 1. Zugaenge ---------------------------------------------------------------
TOK=$(arasul_token)
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && exit 1
TOK_A=$(anmelden "$A" "$A_PASS")
TOK_B=$(anmelden "$B" "$B_PASS")
pruefe "$A und $B melden sich an" "$([ -n "$TOK_A" ] && [ -n "$TOK_B" ] && echo ja || echo nein)"
{ [ -z "$TOK_A" ] || [ -z "$TOK_B" ]; } && exit 1

ruf "$TOK" GET /api/benutzer
benutzer_feld() {
  rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
print(next((str(b[sys.argv[2]]) for b in d if b["username"] == sys.argv[1]), ""))' "$1" "$2"
}
ID_ADMIN=$(benutzer_feld "$ARASUL_BENUTZER" id)
ID_A=$(benutzer_feld "$A" id)
ID_B=$(benutzer_feld "$B" id)
ROLLE_B=$(benutzer_feld "$B" role)
pruefe 'Drei vorhandene Probekonten, keine neuen' \
  "$([ -n "$ID_ADMIN" ] && [ -n "$ID_A" ] && [ -n "$ID_B" ] && echo ja || echo nein)" \
  "$ARASUL_BENUTZER=$ID_ADMIN $A=$ID_A $B=$ID_B"

SCHLUESSEL=""
KEY_ID=""
FREIGEGEBEN=()
aufraeumen() {
  # Die Freigaben, die dieses Skript vergeben hat, zuerst einzeln zuruecknehmen
  # -- nicht nur der App-Entfernung ueberlassen.
  for id in "${FREIGEGEBEN[@]:-}"; do
    [ -n "$id" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
      -H "authorization: Bearer $TOK" "$BASIS/api/freigaben/$APP/$id"
  done
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  Freigaben zurueckgenommen, %s entfernt (mit Ordnern), Wegwerf-Schluessel widerrufen\n' "$APP"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme M5 Stufen ($APP)\",\"allowed_endpoints\":[\"app:deploy\",\"flow:run\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# --- 2. Einspielen, live, drei Freigaben ------------------------------------------
PAKET=$(baue_paket)
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$PAKET" "$BASIS/api/v1/external/apps")
pruefe "$APP in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe 'live geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

codes=""
for id in "$ID_ADMIN" "$ID_A" "$ID_B"; do
  ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$id}"
  codes="$codes $CODE"
  [[ "$CODE" =~ ^20[01]$ ]] && FREIGEGEBEN+=("$id")
done
pruefe "Die App ist $ARASUL_BENUTZER, $A und $B freigegeben" \
  "$([ "${#FREIGEGEBEN[@]}" = 3 ] && echo ja || echo nein)" "HTTP$codes"

if arasul_warte_auf_app "/apps/$APP/api/gesund" 180 "$TOK_A"; then
  pruefe 'Die App antwortet' ja
else
  pruefe 'Die App antwortet' nein 'Zeitgrenze 180s'; exit 1
fi

# --- 3. Verwaltung: Stufen und Standardperson ------------------------------------
ruf "$TOK" GET "/api/apps/$APP/stufen"
STUFEN=$(rumpf | python3 -c 'import sys,json; print(",".join(s["stufe"] for s in json.load(sys.stdin)["data"]["stufen"]))' 2>/dev/null)
pruefe 'GET /stufen nennt die zwei Stufen des Flows' "$(ja_wenn "$STUFEN" 'pruefung,leitung')" "$STUFEN"
pruefe 'ohne Standardperson steht je Stufe der Hinweis' \
  "$(rumpf | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]["stufen"]; print("ja" if all(s["person"] is None and "bei allen mit Zugang" in (s["hinweis"] or "") for s in d) else "nein")' 2>/dev/null)"

ruf "$TOK_B" GET "/api/apps/$APP/stufen"
if [ "$ROLLE_B" != admin ]; then
  pruefe "$B (Mitarbeiter) darf die Stufen nicht setzen oder lesen (403)" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
fi
ruf "$TOK" PUT "/api/apps/$APP/stufen/pruefung" '{"benutzer_id":999999}'
pruefe 'Standardperson ohne Zugang zur App: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
ruf "$TOK" PUT "/api/apps/$APP/stufen/erfunden" "{\"benutzer_id\":$ID_B}"
pruefe 'Eine Stufe, die kein Flow nennt: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
ruf "$TOK" PUT "/api/apps/$APP/stufen/pruefung" "{\"benutzer_id\":$ID_B}"
pruefe "Prüfung: Standardperson $B" "$(ja_wenn "$(rumpf | feld data.person.username)" "$B")" "HTTP $CODE"
ruf "$TOK" PUT "/api/apps/$APP/stufen/leitung" "{\"benutzer_id\":$ID_ADMIN}"
pruefe "Leitung: Standardperson $ARASUL_BENUTZER" "$(ja_wenn "$(rumpf | feld data.person.username)" "$ARASUL_BENUTZER")" "HTTP $CODE"

# --- 4. Erster Lauf: Stufe Pruefung liegt bei B -----------------------------------
if einreichen_und_warten 1004; then
  pruefe "$A reicht ein, der Lauf haelt an (wartend)" ja "lauf=$LAUF"
else
  pruefe "$A reicht ein, der Lauf haelt an (wartend)" nein "lauf=${LAUF:-—}"; exit 1
fi
LAUF_1="$LAUF"
warte_auf_anfrage "$TOK_B" pruefung /api/freigabe-anfragen
pruefe "Die Freigabe der Stufe Prüfung liegt bei $B (in seiner Liste)" \
  "$([ -n "$ANFRAGE" ] && echo ja || echo nein)" "anfrage=${ANFRAGE:-—}"
P1="$ANFRAGE"
liste "$TOK_B" /api/freigabe-anfragen
pruefe 'mit liegt_bei, Stufe und Bezeichnung' \
  "$([ "$(liegt_bei)" = "$B" ] && [ "$(printf '%s' "$ZEILE" | feld stufe_bezeichnung)" = 'Prüfung' ] && echo ja || echo nein)" \
  "liegt_bei=$(liegt_bei)"
TITEL_1=$(printf '%s' "$ZEILE" | feld titel)
liste "$TOK" /api/freigabe-anfragen
pruefe "$ARASUL_BENUTZER sieht sie nicht unter 'Für Sie'" "$(nicht "$HAT")"
liste "$TOK" /api/freigabe-anfragen/bei-anderen
pruefe "… aber unter 'bei anderen', liegt bei $B" \
  "$([ "$HAT" = ja ] && [ "$(liegt_bei)" = "$B" ] && echo ja || echo nein)"
liste "$TOK_A" /api/freigabe-anfragen
H1="$HAT"
liste "$TOK_A" /api/freigabe-anfragen/bei-anderen
pruefe "$A (Einreicher) sieht sie weder unter 'Für Sie' noch 'bei anderen'" \
  "$([ "$H1" = nein ] && [ "$HAT" = nein ] && echo ja || echo nein)"
ruf "$TOK_A" GET /api/freigabe-anfragen/eingereicht
pruefe "$A liest unter /eingereicht, bei wem sie liegt" \
  "$(ja_wenn "$(rumpf | anfrage_zu_lauf "$LAUF" | feld liegt_bei)" "$B")"
ruf "$TOK_A" GET "/apps/$APP/api/lauf?lauf=$LAUF"
pruefe 'Die App liest am Lauf liegt_bei und einen Satz' \
  "$([ "$(rumpf | feld freigabe.liegt_bei)" = "$B" ] && grep -q "Liegt bei $B" <<<"$(rumpf | feld freigabe.satz)" && echo ja || echo nein)" \
  "$(rumpf | feld freigabe.satz | cut -c1-80)"

bilder "$TITEL_1" pruefung

ruf "$TOK_A" POST "/api/freigabe-anfragen/$P1/bestaetigen" '{}'
pruefe "$A (Einreicher) bestaetigt: 403 vom Backend" "$(ja_wenn "$CODE" 403)" "HTTP $CODE $(rumpf | feld error.message | cut -c1-60)"
ruf "$TOK_A" POST "/api/freigabe-anfragen/$P1/uebernehmen" '{}'
pruefe "$A (Einreicher) uebernimmt: 403" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
ruf "$TOK" POST "/api/freigabe-anfragen/$P1/bestaetigen" '{}'
pruefe "$ARASUL_BENUTZER entscheidet, solange sie bei $B liegt: 409" "$(ja_wenn "$CODE" 409)" "HTTP $CODE $(rumpf | feld error.message | cut -c1-60)"
ruf "$TOK" POST "/api/freigabe-anfragen/$P1/uebernehmen" '{}'
pruefe "$ARASUL_BENUTZER uebernimmt" "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.liegt_bei)" = "$ARASUL_BENUTZER" ] && echo ja || echo nein)" "HTTP $CODE"
liste "$TOK" /api/freigabe-anfragen
pruefe "… danach steht sie in seiner Liste" "$HAT"
liste "$TOK_B" /api/freigabe-anfragen
pruefe "… und nicht mehr in der von $B" "$(nicht "$HAT")"
ruf "$TOK" POST "/api/freigabe-anfragen/$P1/weitergeben" "{\"an\":\"$A\"}"
pruefe "Weitergeben an $A (Einreicher): 400" "$(ja_wenn "$CODE" 400)" "HTTP $CODE $(rumpf | feld error.message | cut -c1-60)"
ruf "$TOK" POST "/api/freigabe-anfragen/$P1/weitergeben" "{\"an\":\"$B\"}"
pruefe "Weitergeben an $B" "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.liegt_bei)" = "$B" ] && echo ja || echo nein)" "HTTP $CODE"
liste "$TOK_B" /api/freigabe-anfragen
pruefe "… danach wieder in der Liste von $B" "$HAT"
ruf "$TOK_B" POST "/api/freigabe-anfragen/$P1/bestaetigen" '{}'
pruefe "$B bestaetigt die Stufe Prüfung" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

# --- 5. Erster Lauf: Stufe Leitung liegt beim Admin -------------------------------
warte_auf_anfrage "$TOK" leitung /api/freigabe-anfragen
pruefe "Danach legt der Lauf die Freigabe der Stufe Leitung an, sie liegt bei $ARASUL_BENUTZER" \
  "$([ -n "$ANFRAGE" ] && echo ja || echo nein)" "anfrage=${ANFRAGE:-—}"
L1="$ANFRAGE"
liste "$TOK_B" /api/freigabe-anfragen
H1="$HAT"
liste "$TOK_B" /api/freigabe-anfragen/bei-anderen
pruefe "$B sieht sie nicht unter 'Für Sie', aber 'bei anderen'" \
  "$([ "$H1" = nein ] && [ "$HAT" = ja ] && echo ja || echo nein)"
ruf "$TOK_A" POST "/api/freigabe-anfragen/$L1/bestaetigen" '{}'
pruefe "$A (Einreicher) bestaetigt die Leitung: 403" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
ruf "$TOK" POST "/api/freigabe-anfragen/$L1/bestaetigen" '{}'
pruefe "$ARASUL_BENUTZER bestaetigt die Stufe Leitung" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ende=$((SECONDS + LAUF_GEDULD))
STATUS=""
while [ "$SECONDS" -lt "$ende" ]; do
  ruf "$TOK_A" GET "/apps/$APP/api/lauf?lauf=$LAUF_1"
  STATUS=$(rumpf | feld status)
  case "$STATUS" in fertig | fehler | abgebrochen | abgelaufen) break ;; esac
  sleep 3
done
pruefe 'Der Lauf mit zwei Stufen endet fertig' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"

# --- 6. Ohne Standardperson: bei allen mit Zugang, Hinweis --------------------------
ruf "$TOK" PUT "/api/apps/$APP/stufen/leitung" '{"benutzer_id":null}'
pruefe 'Leitung: Standardperson zurueckgenommen' "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.person)" = "" ] && echo ja || echo nein)" "HTTP $CODE"
ruf "$TOK" GET "/api/apps/$APP/stufen"
pruefe 'Der Admin sieht zur Stufe Leitung den Hinweis' \
  "$(rumpf | python3 -c 'import sys,json; d={s["stufe"]: s for s in json.load(sys.stdin)["data"]["stufen"]}; print("ja" if "bei allen mit Zugang" in (d["leitung"]["hinweis"] or "") and d["pruefung"]["hinweis"] is None else "nein")' 2>/dev/null)"
bilder "$TITEL_1" verwaltung

if einreichen_und_warten 1005; then
  pruefe "Zweiter Lauf: $A reicht ein" ja "lauf=$LAUF"
  warte_auf_anfrage "$TOK_B" pruefung /api/freigabe-anfragen
  ruf "$TOK_B" POST "/api/freigabe-anfragen/$ANFRAGE/bestaetigen" '{}'
  pruefe "$B bestaetigt die Prüfung" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  warte_auf_anfrage "$TOK" leitung /api/freigabe-anfragen
  L2="$ANFRAGE"
  liste "$TOK" /api/freigabe-anfragen
  pruefe "Leitung ohne Standardperson: liegt bei allen (liegt_bei null), $ARASUL_BENUTZER sieht sie" \
    "$([ -n "$L2" ] && [ "$HAT" = ja ] && [ "$(liegt_bei)" = "" ] && echo ja || echo nein)"
  TITEL_2=$(printf '%s' "$ZEILE" | feld titel)
  liste "$TOK_B" /api/freigabe-anfragen
  pruefe "… $B sieht sie ebenso unter 'Für Sie'" "$HAT"
  liste "$TOK_A" /api/freigabe-anfragen
  pruefe "… $A (Einreicher) nicht" "$(nicht "$HAT")"
  bilder "$TITEL_2" alle
  ruf "$TOK_A" POST "/api/freigabe-anfragen/$L2/ablehnen" '{"begruendung":"Abnahme"}'
  pruefe "$A (Einreicher) lehnt ab: 403" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
  ruf "$TOK_B" POST "/api/freigabe-anfragen/$L2/ablehnen" '{"begruendung":"Abnahme M5 Stufen: zweiter Lauf wird nicht gebraucht"}'
  pruefe "$B lehnt ab, der Lauf endet" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
else
  pruefe 'Zweiter Lauf: haelt an' nein "lauf=${LAUF:-—}"
fi

# --- 7. Aufraeumen ist Teil der Messung --------------------------------------------
fehl=""
for id in "${FREIGEGEBEN[@]}"; do
  ruf "$TOK" DELETE "/api/freigaben/$APP/$id"
  [[ "$CODE" =~ ^20[04]$ ]] || fehl="$fehl $id:$CODE"
done
FREIGEGEBEN=()
pruefe 'Die vergebenen Freigaben sind zurueckgenommen' "$([ -z "$fehl" ] && echo ja || echo nein)" "${fehl:-alle drei}"
ruf "schluessel:$SCHLUESSEL" DELETE "/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
pruefe 'DELETE entfernt die App samt Ordnern' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK" GET "/api/apps/$APP"
pruefe 'Danach kennt das Geraet die App nicht mehr (404)' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
# Der Schluessel geht im EXIT-Trap; ein zweites DELETE der App dort trifft nichts.

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
