#!/bin/bash
# =============================================================================
# sicherung-zurueckholen-abnahme.sh — einen frueheren Stand zurueckholen, am Orin
# =============================================================================
# Auftrag sicherung-zurueckholen (M5, 04.10.2026). Die Frage: holt ein
# Administrator in der Verwaltung einen frueheren Stand zurueck,
#
#   (a) fuer EINE App (ihre Datenbank und ihr Paket),
#   (b) fuer EINEN Bereich des Firmenordners,
#
# bestaetigt mit seinem Passwort, und sichert das Geraet vorher den jetzigen
# Stand, sodass sich das Zurueckholen selbst rueckgaengig machen laesst?
# Und (c): der Weg fuer das GANZE Geraet, gemessen NUR in einer
# Wegwerf-Umgebung (eigene Datenbank, eigener Schluessel, eigene Ordner), nie
# am laufenden Geraet.
#
# ZURUECKGEHOLT WIRD NUR, WAS DIESER LAUF SELBST ANLEGT: eine Probe-App
# (`tests/probe-daten` unter der Kennung probe-rueck-<MMTT>) und ein
# Probe-Bereich gleichen Namens. Nie eine andere App, nie ein anderer Bereich,
# nie der ganze Firmenordner, nie die Hauptdatenbank. Angemeldet wird als
# probe-admin, nie als admin:
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_GERAET=jetson bash scripts/test/sicherung-zurueckholen-abnahme.sh
#
# Ablauf:
#   1. Probe-App einspielen, drei Eintraege (Stand A). Probe-Bereich anlegen,
#      probe-admin bekommt `schreiben`, zwei Dateien ueber WebDAV.
#   2. Jetzt sichern -> Stand A. Dann aendern (zwei Eintraege mehr, das Paket
#      geaendert, eine Datei geaendert, eine weg, eine neu) und sichern ->
#      Stand B.
#   3. Ohne Passwort und mit falschem: abgewiesen, nichts angefasst.
#   4. Im Browser (scripts/test/sicherung-zurueckholen-bilder.mjs) App und
#      Bereich auf Stand A, mit Passwort. Danach: drei Eintraege, das Paket
#      Byte fuer Byte von A, die Dateien ueber WebDAV wie in A.
#   5. Je ein Stand davor (`vorher`, `fuer`) steht in der Liste; mit ihm wird
#      beides rueckgaengig gemacht -> wieder Zustand B.
#   6. Das ganze Geraet in einer Wegwerf-Umgebung: Stand A, aendern, Stand
#      davor, zurueck auf A, und mit dem Stand davor wieder zurueck.
#   7. Aufraeumen: App, Bereich, Recht, Schluessel, die eigenen Staende (restic
#      forget einzeln, nur die Kennungen dieses Laufs), und nachsehen, dass
#      unter /arasul/apps kein Ordner der Probe-App bleibt.
#
# Rueckgabe 0, wenn jede Pruefung gruen war. ARASUL_STAENDE_BEHALTEN=1 laesst
# die eigenen Staende stehen; ARASUL_OHNE_BROWSER=1 geht den Weg ueber die
# Schnittstelle.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

if [ -z "${ARASUL_BENUTZER:-}" ] || [ "${ARASUL_BENUTZER}" = "admin" ]; then
  echo "Nie als admin: das ist Koljas Konto. ARASUL_BENUTZER=probe-admin und das Passwort aus Bitwarden." >&2
  exit 2
fi

BASIS="$ARASUL_URL"
GERAET="${ARASUL_GERAET:-jetson}"
QUELLE="$WURZEL/tests/probe-daten"
TAG="$(date +%m%d)"
STEMPEL="probe-rueck-$(date +%m%d%H%M%S)"
APP="${ARASUL_PROBE_APP:-probe-rueck-$TAG}"
APPDB="${APP//-/_}"
BEREICH="${ARASUL_PROBE_BEREICH:-probe-rueck-$TAG}"
GEDULD=1800
ARBEIT="$(mktemp -d)"
RUMPF="$ARBEIT/rumpf"
EIGENE_STAENDE=()

gruen=0
rot=0
pruefe() {
  local was="$1" ok="$2" detail="${3:-}"
  if [ "$ok" = "ja" ]; then
    gruen=$((gruen + 1)); printf 'gruen  %s%s\n' "$was" "${detail:+  ($detail)}"
  else
    rot=$((rot + 1)); printf 'ROT    %s%s\n' "$was" "${detail:+  ($detail)}"
  fi
}
ja_wenn() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }
am_geraet() { ssh -o BatchMode=yes "$GERAET" "$@"; }
zahl() { printf '%s' "${1:-0}" | tr -cd '0-9'; }

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
zaehle_eintraege() {
  python3 -c 'import sys,json
try: print(len(json.load(sys.stdin)["eintraege"]))
except Exception: print("?")' 2>/dev/null
}

# Ein Aufruf der Schnittstelle. Der Rumpf geht ueber STDIN und nie als
# Argument: in ihm steht das Passwort, und Argumente stehen in `ps`.
CODE=""
ruf() { # token|schluessel:… verb pfad [leib]
  local wer="$1" verb="$2" pfad="$3" leib="${4:-}"
  local -a a=(-sk -o "$RUMPF" -w '%{http_code}' -X "$verb" --max-time "$GEDULD")
  case "$wer" in
    schluessel:*) a+=(-H "x-api-key: ${wer#schluessel:}") ;;
    *) a+=(-H "authorization: Bearer $wer") ;;
  esac
  if [ -n "$leib" ]; then
    CODE=$(curl "${a[@]}" -H 'content-type: application/json' --data-binary @- "$BASIS$pfad" <<<"$leib")
  else
    CODE=$(curl "${a[@]}" "$BASIS$pfad")
  fi
}
rumpf() { cat "$RUMPF" 2>/dev/null; }
# Einen JSON-Rumpf um das Passwort ergaenzen -- aus der Umgebung, nie als Argument.
mit_passwort() {
  python3 -c 'import json,os,sys; d=json.loads(sys.argv[1]); d["passwort"]=os.environ["ARASUL_PASSWORT"]; print(json.dumps(d))' "$1"
}

quelle_von() { # Container, Ziel im Container
  am_geraet "docker inspect $1 -f '{{range .Mounts}}{{if eq .Destination \"$2\"}}{{.Source}}{{end}}{{end}}'"
}

# WebDAV als probe-admin, mit seinem Passwort (derselbe Weg wie sein Klient).
# Die Anmeldung geht ueber eine Konfiguration auf STDIN, nicht als Argument.
DIENST=""
RAUM_URL=""
dav() {
  local verb="$1" weg="$2"
  shift 2
  printf 'user = "%s:%s"\n' "$ARASUL_BENUTZER" "$ARASUL_PASSWORT" |
    curl -sk -K - -o "$RUMPF" -w '%{http_code}' --max-time 60 -X "$verb" "$@" "$DIENST/dav/spaces/$RAUM_URL/$weg"
}
hochladen() { # weg inhalt
  local datei
  datei="$(mktemp)"
  printf '%s\n' "$2" >"$datei"
  dav PUT "$1" --data-binary "@$datei"
  rm -f "$datei"
}
inhalt_von() { # weg -> "<code> <inhalt>"
  local code
  code=$(dav GET "$1")
  printf '%s %s' "$code" "$(head -c 200 "$RUMPF" | tr -d '\n')"
}

SCHLUESSEL=""
KEY_ID=""
TOK=""
ICH=""
ORDNER_ID=""
APP_WEG=nein
BEREICH_WEG=nein
WEGWERF=""
aufraeumen() {
  # Nur, was nicht schon im Lauf aufgeraeumt (und gemessen) wurde.
  if [ -n "$SCHLUESSEL" ] && [ "$APP_WEG" != ja ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  if [ -n "$ORDNER_ID" ] && [ "$BEREICH_WEG" != ja ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/firmenordner/ordner/$ORDNER_ID?kennung=$BEREICH&rechte=entziehen"
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  if [ -n "$WEGWERF" ]; then
    am_geraet "docker rm -f ${STEMPEL}-pg ${STEMPEL}-dienst >/dev/null 2>&1; docker network rm ${STEMPEL}-netz >/dev/null 2>&1; docker run --rm -v /home/arasul:/h alpine:3.19 rm -rf '/h/${STEMPEL}'" >/dev/null 2>&1
  fi
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  Wegwerf-Schluessel, Arbeitsordner%s\n' "${WEGWERF:+, Wegwerf-Umgebung ${STEMPEL}}"
}
trap aufraeumen EXIT

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 $GERAET"
  exit 1
fi
echo "=== Zurueckholen am Orin: App ${APP}, Bereich ${BEREICH}, gegen $BASIS ==="
echo

TOK=$(arasul_token)
pruefe "Anmeldung als ${ARASUL_BENUTZER}" "$([ -n "$TOK" ] && echo ja || echo nein)"
[ -z "$TOK" ] && exit 1
ruf "$TOK" GET /api/auth/me
ICH="$(rumpf | feld user.id)"
pruefe "probe-admin ist Administrator" "$(ja_wenn "$(rumpf | feld user.role)" admin)"

# Die Staende vom Anfang: diese Abnahme legt an einem Tag mehrere an, und die
# Aufbewahrung (die fuenf neuesten, einer je Tag) nimmt dafuer womoeglich einen
# fremden Stand desselben Tages. Am Ende wird das gesagt und ein frischer Stand
# des Geraets angelegt (erster Lauf am 04.10.2026: der Stand vom Dienststart fiel).
ruf "$TOK" GET /api/backup/staende
ANFANG_STAENDE="$(rumpf | python3 -c 'import sys,json; print(" ".join(x["id"] for x in json.load(sys.stdin)["data"]))' 2>/dev/null)"

# --- 1. Die Probe-App ------------------------------------------------------------
ruf "$TOK" GET "/api/apps/$APP"
if [ "$CODE" = 200 ]; then
  echo "Die App $APP gibt es schon. Nicht anfassen; ARASUL_PROBE_APP=<andere Kennung>."
  exit 2
fi
ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d '{"name":"Abnahme Zurueckholen (M5)","allowed_endpoints":["app:deploy"]}' "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld data.api_key); [ -z "$SCHLUESSEL" ] && SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld data.key_id); [ -z "$KEY_ID" ] && KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe "Wegwerf-Schluessel mit app:deploy" "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && exit 1
mkdir -p "$ARBEIT/paket"
cp -R "$QUELLE/backend" "$QUELLE/flows" "$ARBEIT/paket/"
python3 - "$QUELLE/app.json" "$ARBEIT/paket/app.json" "$APP" <<'PY'
import json, sys
quelle, ziel, kennung = sys.argv[1:4]
m = json.load(open(quelle)); m["id"] = kennung; m["name"] = "Probe Zurückholen"
m["backend"]["image"] = "arasul-%s:%s" % (kennung, m["version"])
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ARBEIT/paket" .
CODE=$(curl -sk -o "$RUMPF" -w '%{http_code}' --max-time "$GEDULD" -H "x-api-key: $SCHLUESSEL" -F "paket=@$ARBEIT/paket.tgz" "$BASIS/api/v1/external/apps")
pruefe "$APP eingespielt" "$([ "$CODE" = 201 ] || [ "$CODE" = 200 ] && echo ja || echo nein)" "HTTP $CODE"
ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ICH,\"stand\":\"test\"}"
pruefe "Die Probe-App ist probe-admin im Teststand freigegeben" "$([ "$CODE" = 200 ] || [ "$CODE" = 201 ] && echo ja || echo nein)" "HTTP $CODE"
TEST="/apps/$APP/test/api"
arasul_warte_auf_app "$TEST/gesund" 300 "$TOK"
ruf "$TOK" GET "$TEST/gesund"
pruefe "Die Probe-App antwortet" "$(ja_wenn "$CODE" 200)"
for i in 1 2 3; do ruf "$TOK" POST "$TEST/eintrag?text=stand-a-$i"; done
ruf "$TOK" GET "$TEST/eintraege"
pruefe "Drei Eintraege (Stand A)" "$(ja_wenn "$(rumpf | zaehle_eintraege)" 3)"
APPS_QUELLE="$(quelle_von dashboard-backend /arasul/apps)"
PAKET_PFAD="${APPS_QUELLE}/${APP}/1.0.0/backend/server.js"
SUMME_A="$(am_geraet "sha256sum '$PAKET_PFAD' | cut -d' ' -f1")"
pruefe "Das Paket der Probe-App liegt am Geraet" "$([ -n "$SUMME_A" ] && echo ja || echo nein)" "$PAKET_PFAD"

# --- 1b. Der Probe-Bereich -------------------------------------------------------
ruf "$TOK" GET /api/firmenordner/ordner
if rumpf | python3 -c 'import sys,json; d=json.load(sys.stdin); sys.exit(0 if any(o.get("kennung")==sys.argv[1] for o in d.get("data",[])) else 1)' "$BEREICH" 2>/dev/null; then
  echo "Den Bereich $BEREICH gibt es schon. Nicht anfassen; ARASUL_PROBE_BEREICH=<andere Kennung>."
  exit 2
fi
ruf "$TOK" POST /api/firmenordner/ordner "{\"kennung\":\"$BEREICH\",\"name\":\"Probe Zurückholen $TAG\",\"ebene\":1}"
ORDNER_ID="$(rumpf | feld data.id)"
RAUM="$(rumpf | feld data.raum_id)"
pruefe "Probe-Bereich ${BEREICH} angelegt" "$([ "$CODE" = 201 ] && [ -n "$ORDNER_ID" ] && echo ja || echo nein)" "HTTP $CODE, Raum ${RAUM:-?}"
if [ -z "$RAUM" ]; then
  ruf "$TOK" POST /api/firmenordner/abgleich '{}'
  ruf "$TOK" GET /api/firmenordner/ordner
  RAUM="$(rumpf | python3 -c 'import sys,json; d=json.load(sys.stdin); print(next((o.get("raum_id") or "" for o in d.get("data",[]) if o.get("kennung")==sys.argv[1]), ""))' "$BEREICH")"
fi
ruf "$TOK" POST /api/firmenordner/rechte "{\"ordner_id\":$ORDNER_ID,\"benutzer_id\":$ICH,\"recht\":\"schreiben\"}"
pruefe "probe-admin hat schreiben auf dem Probe-Bereich (sonst niemand)" "$([ "$CODE" = 200 ] || [ "$CODE" = 201 ] && echo ja || echo nein)" "HTTP $CODE"
ruf "$TOK" GET /api/firmenordner
DIENST="${ARASUL_FIRMENORDNER:-$(rumpf | feld data.adresse)}"
RAUM_URL="$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe=""))' "$RAUM")"
ende=$((SECONDS + 90)); code=""
while [ "$SECONDS" -lt "$ende" ]; do
  code=$(hochladen angebot.txt 'Stand A: Angebot an Mueller')
  case "$code" in 201|204) break ;; esac
  sleep 3
done
pruefe "WebDAV: angebot.txt angelegt (als probe-admin)" "$([ "$code" = 201 ] || [ "$code" = 204 ] && echo ja || echo nein)" "HTTP $code an $DIENST"
dav MKCOL unterordner >/dev/null
code=$(hochladen unterordner/notiz.txt 'Stand A: Notiz')
pruefe "WebDAV: unterordner/notiz.txt angelegt" "$([ "$code" = 201 ] || [ "$code" = 204 ] && echo ja || echo nein)" "HTTP $code"

# --- 2. Stand A, aendern, Stand B ----------------------------------------------------
sichern() { # -> setzt STAND_JETZT und DAUER
  local t0=$SECONDS
  ruf "$TOK" POST /api/backup/sicherung
  DAUER=$((SECONDS - t0))
  STAND_JETZT="$(rumpf | feld data.bericht.stand_id)"
}
sichern
ID_A="$STAND_JETZT"; EIGENE_STAENDE+=("$ID_A"); DAUER_A=$DAUER
pruefe "Jetzt sichern -> Stand A" "$([ "$CODE" = 200 ] && [ -n "$ID_A" ] && echo ja || echo nein)" "${ID_A:0:8}, ${DAUER_A} s"

for i in 1 2; do ruf "$TOK" POST "$TEST/eintrag?text=stand-b-$i"; done
am_geraet "printf '\n// nach Stand A geaendert ($STEMPEL)\n' >> '$PAKET_PFAD'"
SUMME_B="$(am_geraet "sha256sum '$PAKET_PFAD' | cut -d' ' -f1")"
hochladen angebot.txt 'Stand B: Angebot an Meier, neu verhandelt' >/dev/null
dav DELETE unterordner/notiz.txt >/dev/null
hochladen neu-nach-a.txt 'erst nach Stand A' >/dev/null
ruf "$TOK" GET "$TEST/eintraege"
pruefe "Nach A geaendert: fuenf Eintraege, Paket anders, eine Datei anders, eine weg, eine neu" \
  "$([ "$(rumpf | zaehle_eintraege)" = 5 ] && [ "$SUMME_B" != "$SUMME_A" ] && [ "$(inhalt_von neu-nach-a.txt | cut -d' ' -f1)" = 200 ] && [ "$(inhalt_von unterordner/notiz.txt | cut -d' ' -f1)" = 404 ] && echo ja || echo nein)"
sichern
ID_B="$STAND_JETZT"; EIGENE_STAENDE+=("$ID_B"); DAUER_B=$DAUER
pruefe "Jetzt sichern -> Stand B" "$([ "$CODE" = 200 ] && [ -n "$ID_B" ] && echo ja || echo nein)" "${ID_B:0:8}, ${DAUER_B} s"

ruf "$TOK" GET /api/backup/staende
INHALT_A="$(rumpf | python3 -c 'import sys,json
d=json.load(sys.stdin)["data"]; s=[x for x in d if x["id"]==sys.argv[1]]
if not s: print("fehlt"); raise SystemExit
s=s[0]; print("app=%s bereich=%s" % (any(a["id"]==sys.argv[2] for a in s["apps"]), any(b["kennung"]==sys.argv[3] and b["vorhanden"] for b in s["bereiche"])))' "$ID_A" "$APP" "$BEREICH")"
pruefe "GET /api/backup/staende: Stand A nennt die Probe-App und den Probe-Bereich" "$(ja_wenn "$INHALT_A" "app=True bereich=True")" "$INHALT_A"
ANZAHL_VOR="$(rumpf | feld anzahl)"

# --- 3. Ohne Passwort, mit falschem ------------------------------------------------
ruf "$TOK" POST "/api/backup/wiederherstellung/app/$APP" "{\"stand_id\":\"$ID_A\"}"
pruefe "App zurueckholen ohne Passwort: 400" "$(ja_wenn "$CODE" 400)"
ruf "$TOK" POST "/api/backup/wiederherstellung/bereich/$BEREICH" "{\"stand_id\":\"$ID_A\",\"passwort\":\"falsch-$STEMPEL\"}"
pruefe "Bereich zurueckholen mit falschem Passwort: 403 PASSWORT_FALSCH" \
  "$([ "$CODE" = 403 ] && [ "$(rumpf | feld error.code)" = PASSWORT_FALSCH ] && echo ja || echo nein)" "HTTP $CODE $(rumpf | feld error.code)"
ruf "$TOK" GET "$TEST/eintraege"; E=$(rumpf | zaehle_eintraege)
ruf "$TOK" GET /api/backup/staende
pruefe "... und nichts wurde angefasst (fuenf Eintraege, kein neuer Stand, neu-nach-a.txt da)" \
  "$([ "$E" = 5 ] && [ "$(rumpf | feld anzahl)" = "$ANZAHL_VOR" ] && [ "$(inhalt_von neu-nach-a.txt | cut -d' ' -f1)" = 200 ] && echo ja || echo nein)"

# --- 4. Zurueck auf A: im Browser ----------------------------------------------------
DAUER_APP=""; DAUER_BEREICH=""
if command -v node >/dev/null 2>&1 && [ -z "${ARASUL_OHNE_BROWSER:-}" ]; then
  arasul_sitzung_bauen "$TOK" >/dev/null 2>&1
  ARASUL_URL="$BASIS" ARASUL_SITZUNG="$ARASUL_SITZUNG" ARASUL_PROBE_APP="$APP" ARASUL_PROBE_BEREICH="$BEREICH" \
    ARASUL_STAND="$ID_A" node "$WURZEL/scripts/test/sicherung-zurueckholen-bilder.mjs" | tee "$ARBEIT/browser.txt"
  ROTE=$(grep -c '^ROT' "$ARBEIT/browser.txt" || true)
  pruefe "Im Browser: App und Bereich auf Stand A, mit Passwort, Bericht mit Stand davor" \
    "$([ "$ROTE" = 0 ] && grep -q '^gruen' "$ARBEIT/browser.txt" && echo ja || echo nein)"
  DAUER_APP="$(sed -n 's/^DAUER app=//p' "$ARBEIT/browser.txt")"
  DAUER_BEREICH="$(sed -n 's/^DAUER bereich=//p' "$ARBEIT/browser.txt")"
else
  t0=$SECONDS
  ruf "$TOK" POST "/api/backup/wiederherstellung/app/$APP" "$(mit_passwort "{\"stand_id\":\"$ID_A\"}")"
  DAUER_APP=$((SECONDS - t0))
  pruefe "App ueber die Schnittstelle auf Stand A: erfolg" "$(ja_wenn "$(rumpf | feld data.erfolg)" true)" "HTTP $CODE, ${DAUER_APP} s"
  t0=$SECONDS
  ruf "$TOK" POST "/api/backup/wiederherstellung/bereich/$BEREICH" "$(mit_passwort "{\"stand_id\":\"$ID_A\"}")"
  DAUER_BEREICH=$((SECONDS - t0))
  pruefe "Bereich ueber die Schnittstelle auf Stand A: erfolg" "$(ja_wenn "$(rumpf | feld data.erfolg)" true)" "HTTP $CODE, ${DAUER_BEREICH} s"
fi

arasul_warte_auf_app "$TEST/eintraege" 300 "$TOK"
ruf "$TOK" GET "$TEST/eintraege"
pruefe "(a) App: wieder genau die drei Eintraege von Stand A" "$(ja_wenn "$(rumpf | zaehle_eintraege)" 3)" "$(rumpf | head -c 160)"
pruefe "(a) App: das Paket Byte fuer Byte von Stand A" "$(ja_wenn "$(am_geraet "sha256sum '$PAKET_PFAD' 2>/dev/null | cut -d' ' -f1")" "$SUMME_A")"
sleep 3   # der Dateidienst nimmt Aenderungen von aussen nach etwa einer Sekunde auf
pruefe "(b) Bereich ueber WebDAV: angebot.txt hat den Inhalt von Stand A" "$(ja_wenn "$(inhalt_von angebot.txt)" '200 Stand A: Angebot an Mueller')" "$(inhalt_von angebot.txt)"
pruefe "(b) Bereich ueber WebDAV: unterordner/notiz.txt ist wieder da" "$(ja_wenn "$(inhalt_von unterordner/notiz.txt)" '200 Stand A: Notiz')"
pruefe "(b) Bereich ueber WebDAV: neu-nach-a.txt ist weg" "$(ja_wenn "$(inhalt_von neu-nach-a.txt | cut -d' ' -f1)" 404)"

# --- 5. Der Stand davor, und rueckgaengig ------------------------------------------
ruf "$TOK" GET /api/backup/staende
vorher_fuer() { rumpf | python3 -c 'import sys,json
d=json.load(sys.stdin)["data"]
s=[x for x in d if x["vorher"] and x.get("fuer") and x["fuer"]["art"]==sys.argv[1] and x["fuer"]["id"]==sys.argv[2]]
print(s[0]["id"] if s else "")' "$1" "$2"; }
VORHER_APP="$(vorher_fuer app "$APP")"
VORHER_BEREICH="$(vorher_fuer bereich "$BEREICH")"
[ -n "$VORHER_APP" ] && EIGENE_STAENDE+=("$VORHER_APP")
[ -n "$VORHER_BEREICH" ] && EIGENE_STAENDE+=("$VORHER_BEREICH")
pruefe "Vor jedem Zurueckholen entstand ein Stand davor, mit vorher und wofuer" \
  "$([ -n "$VORHER_APP" ] && [ -n "$VORHER_BEREICH" ] && echo ja || echo nein)" "app ${VORHER_APP:0:8}, bereich ${VORHER_BEREICH:0:8}"
VORHER_GESCHRIEBEN="$(rumpf | python3 -c 'import sys,json
d=json.load(sys.stdin)["data"]; print(next((x.get("geschrieben") or 0 for x in d if x["id"]==sys.argv[1]), 0))' "$VORHER_BEREICH")"

t0=$SECONDS
ruf "$TOK" POST "/api/backup/wiederherstellung/bereich/$BEREICH" "$(mit_passwort "{\"stand_id\":\"$VORHER_BEREICH\"}")"
DAUER_RUECK_B=$((SECONDS - t0))
V="$(rumpf | feld data.vorher.id)"; [ -n "$V" ] && EIGENE_STAENDE+=("$V")
pruefe "Rueckgaengig (b): Bereich mit dem Stand davor zurueckgeholt" "$(ja_wenn "$(rumpf | feld data.erfolg)" true)" "HTTP $CODE, ${DAUER_RUECK_B} s"
sleep 3
pruefe "... angebot.txt wieder wie in B, neu-nach-a.txt wieder da, notiz.txt wieder weg" \
  "$([ "$(inhalt_von angebot.txt)" = '200 Stand B: Angebot an Meier, neu verhandelt' ] && [ "$(inhalt_von neu-nach-a.txt | cut -d' ' -f1)" = 200 ] && [ "$(inhalt_von unterordner/notiz.txt | cut -d' ' -f1)" = 404 ] && echo ja || echo nein)" \
  "$(inhalt_von angebot.txt)"
t0=$SECONDS
ruf "$TOK" POST "/api/backup/wiederherstellung/app/$APP" "$(mit_passwort "{\"stand_id\":\"$VORHER_APP\"}")"
DAUER_RUECK_A=$((SECONDS - t0))
V="$(rumpf | feld data.vorher.id)"; [ -n "$V" ] && EIGENE_STAENDE+=("$V")
pruefe "Rueckgaengig (a): App mit dem Stand davor zurueckgeholt" "$(ja_wenn "$(rumpf | feld data.erfolg)" true)" "HTTP $CODE, ${DAUER_RUECK_A} s"
arasul_warte_auf_app "$TEST/eintraege" 300 "$TOK"
ruf "$TOK" GET "$TEST/eintraege"
pruefe "... wieder fuenf Eintraege, und das Paket wie in B" \
  "$([ "$(rumpf | zaehle_eintraege)" = 5 ] && [ "$(am_geraet "sha256sum '$PAKET_PFAD' 2>/dev/null | cut -d' ' -f1")" = "$SUMME_B" ] && echo ja || echo nein)"

# --- 6. Das ganze Geraet, in einer Wegwerf-Umgebung ----------------------------------
# Eigene Postgres-Instanz in einem eigenen internen Netz, eigener Schluessel,
# eigene Ordner unter /home/arasul/<stempel>, dasselbe Image wie der laufende
# Sicherungsdienst. Geprueft wird die Folge, die das Backend beim ganzen Geraet
# geht (sicherungsdienst.stelleWiederHer mit vorherSichern): Stand festhalten,
# Stand davor, zurueck auf A -- und mit dem Stand davor wieder zurueck.
echo
echo "-- (c) Das ganze Geraet, Wegwerf-Umgebung ${STEMPEL}"
WEGWERF=ja
WZ="/home/arasul/${STEMPEL}"
PG="${STEMPEL}-pg"
WD="${STEMPEL}-dienst"
BILD="$(am_geraet "docker inspect backup-service -f '{{.Config.Image}}'")"
am_geraet "mkdir -p $WZ/lokal $WZ/apps/probe $WZ/flows $WZ/firma/posix/projects/eins \
  && head -c 18 /dev/urandom | base64 | tr -d '/+=' > $WZ/pg-wort \
  && head -c 32 /dev/urandom | base64 | tr -d '/+=' > $WZ/schluessel \
  && docker network create --internal ${STEMPEL}-netz >/dev/null \
  && docker run -d --name $PG --network ${STEMPEL}-netz -e POSTGRES_USER=arasul -e POSTGRES_DB=arasul_db \
       -e POSTGRES_PASSWORD_FILE=/run/secrets/pw -v $WZ/pg-wort:/run/secrets/pw:ro postgres:16-alpine >/dev/null \
  && docker run -d --name $WD --network ${STEMPEL}-netz \
       -v $WZ/lokal:/backups -v $WZ/apps:/arasul/apps -v $WZ/flows:/arasul/flows -v $WZ/firma:/arasul/firmenordner \
       -v $WZ/pg-wort:/run/secrets/postgres_password:ro -v $WZ/schluessel:/run/secrets/backup_encryption_key:ro \
       -e POSTGRES_HOST=$PG -e POSTGRES_USER=arasul -e POSTGRES_DB=arasul_db \
       -e POSTGRES_PASSWORD_FILE=/run/secrets/postgres_password -e BACKUP_EXTERN_AN=false -e TZ=Europe/Berlin \
       --entrypoint sleep $BILD infinity >/dev/null"
drin() { am_geraet "docker exec $WD bash -c $(printf '%q' "$*")"; }
sql() { drin "PGPASSWORD=\$(cat /run/secrets/postgres_password) psql -h $PG -U arasul -d ${2:-arasul_db} -tAc \"$1\""; }
drin "for i in \$(seq 1 60); do PGPASSWORD=\$(cat /run/secrets/postgres_password) psql -h $PG -U arasul -d arasul_db -tAc 'select 1' >/dev/null 2>&1 && break; sleep 1; done"
pruefe "Wegwerf-Umgebung steht (eigene Datenbank, eigener Schluessel, ${BILD})" "$(ja_wenn "$(sql 'select 1')" 1)"
# Einzeln: `psql -c` mit mehreren Befehlen ist EINE Transaktion, und
# CREATE DATABASE geht darin nicht (erster Lauf am 04.10.2026).
for befehl in "create table personen (name text)" "insert into personen values ('Anna')" \
  "create table app_datenbanken (app_id text, stand text, datenbank text, rolle text)" \
  "insert into app_datenbanken values ('probe','test','arasul_app_probe_test','arasul_app_probe_test')" \
  "create role arasul_app_probe_test login password 'x'" \
  "create database arasul_app_probe_test owner arasul_app_probe_test"; do
  sql "$befehl" >/dev/null 2>&1
done
drin "PGPASSWORD=\$(cat /run/secrets/postgres_password) psql -h $PG -U arasul -d arasul_app_probe_test -c \"set role arasul_app_probe_test; create table eintraege (text text); insert into eintraege values ('A');\"" >/dev/null 2>&1
drin "echo A > /arasul/apps/probe/app.txt; echo A > /arasul/flows/a.md; echo A > /arasul/firmenordner/posix/projects/eins/datei.txt"
drin 'backup.sh' >"$ARBEIT/w-a.log" 2>&1
W_A="$(drin 'jq -r .stand_id /backups/backup_report.json')"
pruefe "(c) Stand A in der Wegwerf-Umgebung, mit Datenbank und App-Datenbank" \
  "$([ -n "$W_A" ] && [ "$W_A" != null ] && [ "$(sql 'select count(*) from personen')" = 1 ] && [ "$(sql 'select count(*) from eintraege' arasul_app_probe_test)" = 1 ] && echo ja || echo nein)" "${W_A:0:8}"
sql "insert into personen values ('Bruno')" >/dev/null
drin "PGPASSWORD=\$(cat /run/secrets/postgres_password) psql -h $PG -U arasul -d arasul_app_probe_test -c \"insert into eintraege values ('B')\"" >/dev/null 2>&1
drin "echo B > /arasul/apps/probe/app.txt; echo B > /arasul/firmenordner/posix/projects/eins/datei.txt; echo neu > /arasul/firmenordner/posix/projects/eins/neu.txt"
zustand() {
  printf 'personen=%s app=%s paket=%s firma=%s neu=%s' \
    "$(sql 'select string_agg(name, chr(44) order by name) from personen')" \
    "$(sql 'select string_agg(text, chr(44) order by text) from eintraege' arasul_app_probe_test)" \
    "$(drin 'cat /arasul/apps/probe/app.txt')" \
    "$(drin 'cat /arasul/firmenordner/posix/projects/eins/datei.txt')" \
    "$(drin 'test -f /arasul/firmenordner/posix/projects/eins/neu.txt && echo ja || echo nein')"
}
VOR_ZURUECK="$(zustand)"
t0=$SECONDS
drin 'ARASUL_STAND_ANLASS=vorher ARASUL_STAND_FUER=geraet backup.sh' >"$ARBEIT/w-vorher.log" 2>&1
W_VORHER="$(drin 'jq -r .stand_id /backups/backup_report.json')"
pruefe "(c) Stand davor (vorher, fuer geraet), nur auf dem Geraet" \
  "$([ "$(drin "jq -r --arg id '$W_VORHER' '.staende[] | select(.id == \$id) | [.vorher, .fuer] | join(\" \")' /backups/staende.json")" = 'true geraet' ] && echo ja || echo nein)" "${W_VORHER:0:8}"
drin "wiederherstellen.sh --stand $W_A" >"$ARBEIT/w-zurueck.log" 2>&1
RC=$?
DAUER_GERAET=$((SECONDS - t0))
pruefe "(c) das ganze Geraet auf Stand A" \
  "$([ "$RC" = 0 ] && [ "$(zustand)" = 'personen=Anna app=A paket=A firma=A neu=nein' ] && echo ja || echo nein)" "$(zustand), ${DAUER_GERAET} s"
[ "$RC" = 0 ] || tail -n 8 "$ARBEIT/w-zurueck.log" | sed 's/^/      /'
drin "wiederherstellen.sh --stand $W_VORHER" >"$ARBEIT/w-rueck.log" 2>&1
pruefe "(c) rueckgaengig mit dem Stand davor: alles wie vor dem Zurueckholen" "$(ja_wenn "$(zustand)" "$VOR_ZURUECK")" "$(zustand)"

# --- 7. Aufraeumen, gemessen -----------------------------------------------------------
echo
echo "-- Aufraeumen"
ruf "$TOK" DELETE "/api/firmenordner/rechte/$ORDNER_ID/$ICH"
pruefe "Recht von probe-admin auf dem Probe-Bereich entfernt" "$([ "$CODE" = 200 ] || [ "$CODE" = 204 ] && echo ja || echo nein)" "HTTP $CODE"
ruf "$TOK" DELETE "/api/firmenordner/ordner/$ORDNER_ID?kennung=$BEREICH"
[ "$CODE" = 200 ] && BEREICH_WEG=ja
pruefe "Probe-Bereich weggeworfen" "$BEREICH_WEG" "HTTP $CODE"
CODE=$(curl -sk -o "$RUMPF" -w '%{http_code}' --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
  "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true")
[ "$CODE" = 200 ] && APP_WEG=ja
pruefe "Probe-App entfernt (samt Datenbanken und Dateien)" "$APP_WEG" "HTTP $CODE"
pruefe "Im Container dashboard-backend liegt unter /arasul/apps kein Ordner der Probe-App" \
  "$(ja_wenn "$(am_geraet "docker exec dashboard-backend sh -c 'ls -A /arasul/apps | grep -cx $APP'")" 0)"
pruefe "Kein Ordner des Probe-Bereichs mehr in der Ablage" \
  "$(ja_wenn "$(am_geraet "docker exec backup-service sh -c 'test -e /arasul/firmenordner/posix/projects/$BEREICH && echo da || echo weg'")" weg)"
SICH="$(quelle_von backup-service /backups)"
am_geraet "cd '$SICH' && rm -f vor_wiederherstellung/arasul_app_${APPDB}_* vor_wiederherstellung/paket_${APP}_*" >/dev/null 2>&1

if [ -z "${ARASUL_STAENDE_BEHALTEN:-}" ] && [ "${#EIGENE_STAENDE[@]}" -gt 0 ]; then
  # Nur die Kennungen dieses Laufs, einzeln (restic forget <id>), danach
  # aufraeumen wie nach jeder Aufbewahrung, und dieselben Zeilen aus
  # staende.json -- unter der Sperre der Sicherung, damit keine Nacht dazwischenkommt.
  WEG_JSON="$(printf '%s\n' "${EIGENE_STAENDE[@]}" | python3 -c 'import sys,json; print(json.dumps(sorted(set(l.strip() for l in sys.stdin if l.strip()))))')"
  am_geraet "docker exec backup-service bash -c $(printf '%q' "exec 9>/backups/.sicherung.sperre; timeout 3300 flock 9
    source /usr/local/bin/staende.sh
    R=\$(stand_repo /backups); K=\$STAND_SCHLUESSEL
    stand_restic \$R \$K forget $(printf '%s ' "${EIGENE_STAENDE[@]}") >/dev/null 2>&1 && stand_aufraeumen \$R \$K
    jq --argjson weg '$WEG_JSON' '.staende |= map(select(.id as \$i | (\$weg | index(\$i)) | not))' /backups/staende.json > /backups/staende.json.neu && mv -f /backups/staende.json.neu /backups/staende.json")" >"$ARBEIT/forget.log" 2>&1
  ruf "$TOK" GET /api/backup/staende
  UEBRIG="$(rumpf | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]; w=set(json.loads(sys.argv[1])); print(sum(1 for x in d if x["id"] in w))' "$WEG_JSON")"
  pruefe "Die ${#EIGENE_STAENDE[@]} eigenen Staende einzeln entfernt (restic forget), fremde unberuehrt" "$(ja_wenn "$UEBRIG" 0)" "$(rumpf | feld anzahl) Staende bleiben"
fi
if [ -z "${ARASUL_STAENDE_BEHALTEN:-}" ]; then
  ruf "$TOK" GET /api/backup/staende
  FORT="$(rumpf | python3 -c 'import sys,json
jetzt=set(x["id"] for x in json.load(sys.stdin)["data"])
print(" ".join(i[:8] for i in sys.argv[1].split() if i not in jetzt))' "$ANFANG_STAENDE")"
  [ -n "$FORT" ] && printf 'info   die Aufbewahrung nahm waehrend des Laufs fremde Staende desselben Tages: %s\n' "$FORT"
  ruf "$TOK" POST /api/backup/sicherung
  pruefe "Zum Schluss ein frischer Stand des Geraets (ohne Probe-App und Probe-Bereich)" \
    "$(ja_wenn "$(rumpf | feld data.erfolg)" true)" "$(rumpf | feld data.bericht.stand_id | cut -c1-8)"
fi
am_geraet "docker rm -f $PG $WD >/dev/null 2>&1; docker network rm ${STEMPEL}-netz >/dev/null 2>&1; docker run --rm -v /home/arasul:/h alpine:3.19 rm -rf '/h/${STEMPEL}'" >/dev/null 2>&1
pruefe "Wegwerf-Umgebung weg" "$(ja_wenn "$(am_geraet "test -e '$WZ' && echo da || echo weg")" weg)"
WEGWERF=""

echo
echo "Zahlen fuer den PR:"
echo "  Jetzt sichern (Stand A / Stand B):        ${DAUER_A} s / ${DAUER_B} s"
echo "  App zurueck auf A, mit Stand davor:       ${DAUER_APP:-?} s (Browser bis Bericht)"
echo "  Bereich zurueck auf A, mit Stand davor:   ${DAUER_BEREICH:-?} s (Browser bis Bericht)"
echo "  Rueckgaengig, Bereich / App:              ${DAUER_RUECK_B} s / ${DAUER_RUECK_A} s"
echo "  Stand davor (Bereich) schrieb neu:        $(( $(zahl "$VORHER_GESCHRIEBEN") / 1024 )) KiB"
echo "  Ganzes Geraet (Wegwerf): davor + zurueck: ${DAUER_GERAET} s"
echo
echo "$gruen gruen, $rot rot"
[ "$rot" -eq 0 ]
