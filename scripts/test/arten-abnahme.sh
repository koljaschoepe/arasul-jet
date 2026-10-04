#!/bin/bash
# =============================================================================
# Abnahme M5: Flow-Arten, autonom und Ergebnis bestaetigen, vom Admin geschaltet
# =============================================================================
# Die Abnahme des Auftrags flow-arten-autonom (04.10.2026), Probe-App
# `tests/probe-arten` mit drei Flows:
#
#   texte        erzeugend, kann `autonom` und `ergebnis_bestaetigen`
#   beleg        erkennend (Schritt mit `faehigkeiten.bild`), kann beides
#   nur-autonom  kann nur `autonom`
#
#   SCHALTEN     PUT /api/apps/:id/flows/:name/art: nur zwischen den Arten des
#                Flow-Kopfes (sonst 400), nur Admin (403), unbekannter Flow
#                404; die Wahl gilt ab dem naechsten Lauf und steht in
#                `audit_logs` (mit ARASUL_GERAET, sonst ohne diesen Blick).
#   AUTONOM      Der erzeugende Flow endet `fertig`, ohne Freigabe.
#   BESTAETIGEN  Nach der Umstellung haelt derselbe Flow am Ende an: Freigabe
#                „Ergebnis bestaetigen: texte" mit dem Ergebnis; der Einreicher
#                darf nicht entscheiden (403), eine andere Person bestaetigt,
#                dann `fertig`.
#   ERKENNUNG    Der erkennende Flow legt auch in `autonom` eine Freigabe
#                „Erkennung unsicher: Feld X" an, wenn ein Feld fehlt oder als
#                unsicher gemeldet wird; ist alles erkannt, gibt es keine.
#   BROWSER      `arten-bilder.mjs` (ARASUL_BILDER=1): die Seite der App.
#
# Konten: drei VORHANDENE Probekonten, nie `admin`, keine neuen. Passwoerter
# nur zur Laufzeit:
#
#   ARASUL_URL=https://100.121.244.80 \
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
#   ARASUL_B=probe-j36-b ARASUL_B_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-b')" \
#   ARASUL_GERAET=arasul@<orin> ARASUL_BILDER=1 bash scripts/test/arten-abnahme.sh
#
# WAS ES ANLEGT, RAEUMT ES WEG: die App `probe-arten-<MMDD>` (samt Image und
# Ordner), die Freigaben der App an die drei Konten, den Wegwerf-Schluessel.
# Ob unter /arasul/apps ein Ordner bleibt, prueft der Aufrufer am Geraet.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-arten"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
APP="${ARASUL_ARTEN_APP:-probe-arten-$STEMPEL}"
VERSION="1.0.0"
GEDULD=900
HALT_GEDULD=300
LAUF_GEDULD=600
BEGINN="$(date -u '+%Y-%m-%d %H:%M:%S')"

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
m["name"] = "Probe: Arten (%s)" % kennung.rsplit("-", 1)[-1]
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket.tgz"
}

# Einen Flow als A starten. Setzt $LAUF.
LAUF=""
starten() {
  local abfrage="$1"
  LAUF=""
  ruf "$TOK_A" POST "/apps/$APP/api/starten?$abfrage"
  if [ "$CODE" = "404" ]; then
    sleep 5
    ruf "$TOK_A" POST "/apps/$APP/api/starten?$abfrage"
  fi
  LAUF=$(rumpf | feld lauf)
  [ -n "$LAUF" ] || { echo "        Antwort der App: HTTP $CODE $(rumpf)"; return 1; }
}

# Wartet bis der Lauf einen der Status $1 (durch | getrennt) hat; setzt $STATUS.
STATUS=""
warte_status() {
  local gesucht="$1" geduld="${2:-$HALT_GEDULD}"
  local ende=$((SECONDS + geduld))
  STATUS=""
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$TOK_A" GET "/apps/$APP/api/lauf?lauf=$LAUF"
    STATUS=$(rumpf | feld status)
    case "|$gesucht|" in *"|$STATUS|"*) return 0 ;; esac
    case "$STATUS" in fertig | fehler | abgebrochen | abgelaufen) return 1 ;; esac
    sleep 2
  done
  return 1
}

# Die offene Anfrage zum Lauf aus der Liste von $1 (Pfad), oder leer. Setzt
# $ANFRAGE (id) und $TITEL.
ANFRAGE=""
TITEL=""
warte_auf_anfrage() {
  local tok="$1" ende=$((SECONDS + HALT_GEDULD)) a=""
  ANFRAGE=""
  TITEL=""
  while [ "$SECONDS" -lt "$ende" ]; do
    ruf "$tok" GET /api/freigabe-anfragen
    a=$(rumpf | anfrage_zu_lauf "$LAUF")
    if [ -n "$a" ]; then
      ANFRAGE=$(printf '%s' "$a" | feld id)
      TITEL=$(printf '%s' "$a" | feld titel)
      return 0
    fi
    sleep 3
  done
  return 1
}

# Offen am Lauf: gibt es (jetzt) eine offene Anfrage in der Liste des Admins
# oder von B? Fuer "keine Freigabe": der Lauf ist fertig UND nie angehalten.
art_setzen() { # flow art|null
  local wert="$2"
  [ "$wert" != null ] && wert="\"$wert\""
  ruf "$TOK" PUT "/api/apps/$APP/flows/$1/art" "{\"art\":$wert}"
}
flow_feld() { # flow feld
  ruf "$TOK" GET "/api/apps/$APP/flows"
  rumpf | python3 -c 'import sys,json
d = json.load(sys.stdin)["data"]
liste = d["live"] if isinstance(d, dict) and "live" in d else d
f = next((x for x in (liste.get("flows", liste) if isinstance(liste, dict) else liste) if x["name"] == sys.argv[1]), {})
v = f.get(sys.argv[2])
print(json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict, bool)) else ("" if v is None else v))' "$1" "$2" 2>/dev/null
}

bilder() {
  [ "${ARASUL_BILDER:-}" = "1" ] || return 0
  ARASUL_A="$A" ARASUL_A_PASSWORT="$A_PASS" ARASUL_B="$B" ARASUL_B_PASSWORT="$B_PASS" \
    ARASUL_ARTEN_APP="$APP" node "$WURZEL/scripts/test/arten-bilder.mjs" "$1" | sed 's/^/  bild /'
  local ergebnis="${PIPESTATUS[0]}"
  pruefe "Bilder: $1" "$(ja_wenn "$ergebnis" 0)"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS."
  exit 1
fi

echo "=== Abnahme M5: Flow-Arten, $APP gegen $BASIS ==="
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
  "$([ -n "$ID_ADMIN" ] && [ -n "$ID_A" ] && [ -n "$ID_B" ] && echo ja || echo nein)"

SCHLUESSEL=""
KEY_ID=""
FREIGEGEBEN=()
aufraeumen() {
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
  -d "{\"name\":\"Abnahme M5 Arten ($APP)\",\"allowed_endpoints\":[\"app:deploy\",\"flow:run\"]}" \
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

# --- 3. Schalten: nur, was der Kopf nennt -----------------------------------------
pruefe 'texte nennt beide Arten' \
  "$(ja_wenn "$(flow_feld texte arten)" '["autonom", "ergebnis_bestaetigen"]')" "$(flow_feld texte arten)"
pruefe 'ohne Wahl gilt die erste Art des Pakets: autonom' \
  "$([ "$(flow_feld texte art)" = autonom ] && [ "$(flow_feld texte art_ueberschrieben)" = false ] && echo ja || echo nein)"
pruefe 'nur-autonom nennt nur autonom' "$(ja_wenn "$(flow_feld nur-autonom arten)" '["autonom"]')"

art_setzen nur-autonom ergebnis_bestaetigen
pruefe 'Eine Art, die der Kopf nicht nennt: 400, mit Grund' \
  "$([ "$CODE" = 400 ] && grep -q 'kann die Art' "$RUMPF_DATEI" && echo ja || echo nein)" "HTTP $CODE $(rumpf | feld error.message | cut -c1-70)"
art_setzen texte erfunden
pruefe 'Eine Art, die es nicht gibt: 400' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
art_setzen gibt-es-nicht autonom
pruefe 'Ein Flow, den die App nicht hat: 404' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
if [ "$ROLLE_B" != admin ]; then
  ruf "$TOK_B" PUT "/api/apps/$APP/flows/texte/art" '{"art":"autonom"}'
  pruefe "$B (Mitarbeiter) darf die Art nicht schalten (403)" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
fi
pruefe 'Die abgewiesenen Versuche haben nichts veraendert' \
  "$([ "$(flow_feld nur-autonom art)" = autonom ] && [ "$(flow_feld nur-autonom art_ueberschrieben)" = false ] && echo ja || echo nein)"

# --- 4. autonom: der erzeugende Flow endet ohne Freigabe --------------------------
art_setzen texte autonom
pruefe 'texte auf autonom geschaltet' "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.art)" = autonom ] && echo ja || echo nein)" "HTTP $CODE"
if starten 'flow=texte&thema=Wartung'; then
  warte_status 'fertig|fehler|abgebrochen|abgelaufen' "$LAUF_GEDULD"
  pruefe 'autonom: der Lauf endet fertig, ohne anzuhalten' "$(ja_wenn "$STATUS" fertig)" "lauf=$LAUF status=${STATUS:-—}"
  ruf "$TOK_B" GET /api/freigabe-anfragen
  pruefe 'autonom: keine Freigabe zu diesem Lauf' "$([ -z "$(rumpf | anfrage_zu_lauf "$LAUF")" ] && echo ja || echo nein)"
else
  pruefe 'autonom: Lauf gestartet' nein
fi

# --- 5. Ergebnis bestaetigen -------------------------------------------------------
art_setzen texte ergebnis_bestaetigen
pruefe 'texte auf "Ergebnis bestaetigen" geschaltet' \
  "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.art)" = ergebnis_bestaetigen ] && echo ja || echo nein)" "HTTP $CODE"
pruefe 'GET nennt die Wahl: art_ueberschrieben' "$(ja_wenn "$(flow_feld texte art_ueberschrieben)" true)"
if starten 'flow=texte&thema=Wartung'; then
  if warte_status wartend; then
    pruefe 'Der Lauf haelt am Ende an (wartend)' ja "lauf=$LAUF"
  else
    pruefe 'Der Lauf haelt am Ende an (wartend)' nein "status=${STATUS:-—}"
  fi
  warte_auf_anfrage "$TOK_B"
  pruefe 'Die Freigabe heisst "Ergebnis bestätigen: texte"' "$(ja_wenn "$TITEL" 'Ergebnis bestätigen: texte')" "anfrage=${ANFRAGE:-—}"
  ruf "$TOK_B" GET /api/freigabe-anfragen
  pruefe 'Das Ergebnis steht als Zusammenhang dabei' \
    "$([ -n "$(rumpf | anfrage_zu_lauf "$LAUF" | feld zusammenhang)" ] && echo ja || echo nein)" "$(rumpf | anfrage_zu_lauf "$LAUF" | feld zusammenhang | cut -c1-70)"
  P1="$ANFRAGE"
  bilder bestaetigen
  ruf "$TOK_A" POST "/api/freigabe-anfragen/$P1/bestaetigen" '{}'
  pruefe "$A (Einreicher) bestaetigt sein Ergebnis nicht: 403" "$(ja_wenn "$CODE" 403)" "HTTP $CODE"
  ruf "$TOK_B" POST "/api/freigabe-anfragen/$P1/bestaetigen" '{}'
  pruefe "$B bestaetigt das Ergebnis" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  warte_status 'fertig' "$LAUF_GEDULD"
  pruefe 'Danach ist der Lauf fertig' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"
else
  pruefe 'Ergebnis bestaetigen: Lauf gestartet' nein
fi

# Eine Ablehnung beendet den Lauf, er wird nie fertig.
if starten 'flow=texte&thema=Ablehnung' && warte_status wartend && warte_auf_anfrage "$TOK_B"; then
  ruf "$TOK_B" POST "/api/freigabe-anfragen/$ANFRAGE/ablehnen" '{"begruendung":"Abnahme M5 Arten: abgelehnt"}'
  pruefe "$B lehnt das Ergebnis ab" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  warte_status 'abgebrochen|fehler|fertig' 60
  pruefe 'Der Lauf endet abgebrochen, nicht fertig' "$(ja_wenn "$STATUS" abgebrochen)" "status=${STATUS:-—}"
else
  pruefe 'Ablehnung: Lauf angehalten' nein
fi

# --- 6. Erkennung: auch in autonom ------------------------------------------------
art_setzen beleg autonom
pruefe 'beleg auf autonom geschaltet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
if starten 'flow=beleg&datum=&unsicher='; then
  warte_status wartend
  pruefe 'beleg, autonom, Datum fehlt: der Lauf haelt an' "$(ja_wenn "$STATUS" wartend)" "lauf=$LAUF status=${STATUS:-—}"
  warte_auf_anfrage "$TOK_B"
  pruefe 'Grund: "Erkennung unsicher: Feld datum"' "$(ja_wenn "$TITEL" 'Erkennung unsicher: Feld datum')" "titel=${TITEL:-—}"
  bilder erkennung
  ruf "$TOK_B" POST "/api/freigabe-anfragen/$ANFRAGE/bestaetigen" '{}'
  pruefe "$B bestaetigt, der Lauf geht weiter" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  warte_status fertig "$LAUF_GEDULD"
  pruefe 'beleg endet fertig, ohne zweite Freigabe (autonom)' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"
else
  pruefe 'beleg gestartet' nein
fi
if starten 'flow=beleg&datum=01.10.2026&unsicher=%22betrag%22'; then
  warte_status wartend
  warte_auf_anfrage "$TOK_B"
  pruefe 'Ein als unsicher gemeldetes Feld: "Erkennung unsicher: Feld betrag"' "$(ja_wenn "$TITEL" 'Erkennung unsicher: Feld betrag')" "titel=${TITEL:-—}"
  ruf "$TOK_B" POST "/api/freigabe-anfragen/$ANFRAGE/bestaetigen" '{}'
  warte_status fertig "$LAUF_GEDULD"
fi
if starten 'flow=beleg&datum=01.10.2026&unsicher='; then
  warte_status 'fertig|fehler|abgebrochen|abgelaufen|wartend' "$LAUF_GEDULD"
  pruefe 'Alles erkannt, autonom: fertig ohne Freigabe' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"
fi

# --- 7. Erkennung und Ergebnis bestaetigen: beide Freigaben nacheinander ----------
art_setzen beleg ergebnis_bestaetigen
if starten 'flow=beleg&datum=01.10.2026&unsicher='; then
  warte_status wartend
  warte_auf_anfrage "$TOK_B"
  pruefe 'beleg, bestaetigen, alles erkannt: nur die Freigabe am Ende' "$(ja_wenn "$TITEL" 'Ergebnis bestätigen: beleg')" "titel=${TITEL:-—}"
  ruf "$TOK_B" POST "/api/freigabe-anfragen/$ANFRAGE/bestaetigen" '{}'
  warte_status fertig "$LAUF_GEDULD"
  pruefe 'beleg endet nach der Bestaetigung fertig' "$(ja_wenn "$STATUS" fertig)" "status=${STATUS:-—}"
fi

# --- 8. Zurueck zum Paket, Sicherheitsprotokoll ------------------------------------
art_setzen texte null
pruefe 'null nimmt die Wahl zurueck' \
  "$([ "$CODE" = 200 ] && [ "$(flow_feld texte art)" = autonom ] && [ "$(flow_feld texte art_ueberschrieben)" = false ] && echo ja || echo nein)"
bilder verwaltung
if [ -n "${ARASUL_GERAET:-}" ]; then
  ZEILEN="$(ssh -o BatchMode=yes "$ARASUL_GERAET" \
    "docker exec postgres-db psql -U arasul -d arasul_db -At -c \"SELECT details FROM audit_logs WHERE action = 'flow_art_gesetzt' AND timestamp >= '$BEGINN' ORDER BY timestamp\"" 2>/dev/null)"
  pruefe 'audit_logs: flow_art_gesetzt mit App, Flow und Art' \
    "$(grep -q "\"flow\": *\"texte\"" <<<"$ZEILEN" && grep -q "ergebnis_bestaetigen" <<<"$ZEILEN" && grep -q "$APP" <<<"$ZEILEN" && echo ja || echo nein)" \
    "$(printf '%s\n' "$ZEILEN" | wc -l | tr -d ' ') Zeilen"
else
  echo "(ohne ARASUL_GERAET kein Blick in audit_logs)"
fi

# --- 9. Aufraeumen ist Teil der Messung --------------------------------------------
fehl=""
for id in "${FREIGEGEBEN[@]:-}"; do
  [ -n "$id" ] || continue
  ruf "$TOK" DELETE "/api/freigaben/$APP/$id"
  [[ "$CODE" =~ ^20[04]$ ]] || fehl="$fehl $id:$CODE"
done
FREIGEGEBEN=()
pruefe 'Die vergebenen Freigaben sind zurueckgenommen' "$([ -z "$fehl" ] && echo ja || echo nein)" "${fehl:-alle drei}"
ruf "schluessel:$SCHLUESSEL" DELETE "/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
pruefe 'DELETE entfernt die App samt Ordnern' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf "$TOK" GET "/api/apps/$APP"
pruefe 'Danach kennt das Geraet die App nicht mehr (404)' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
