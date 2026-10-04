#!/bin/bash
# =============================================================================
# live-schalten-abnahme.sh — Live schalten mit Sicherung und Rueckfall, am Orin
# =============================================================================
# Auftrag live-schalten-mit-sicherung (M5, 04.10.2026). Die Frage: schaltet
# probe-admin eine Fassung live, deren Strukturaenderung auf den Live-Daten
# mittendrin scheitert, und
#
#   (a) sichert das Geraet vorher die Live-Datenbank der App (ein Stand mit
#       `fuer:live:<id>`),
#   (b) erkennt es den Fehler und schaltet selbst auf Fassung UND Daten von
#       vorher zurueck -- die halbe Strukturaenderung ist danach weg,
#   (c) sagt es das dem Admin in einem Satz, mit einem zweiten, was er tun
#       kann, und der Technik nur aufgeklappt,
#   (d) steht der Aenderungstext des Entwicklers beim Live-Schalten da,
#   (e) bleiben danach mit einer guten Fassung alle Live-Daten erhalten
#       (Zeilen vorher und nachher gezaehlt, Text fuer Text),
#   (f) laeuft die Testfassung die ganze Zeit weiter und bekommt nie Live-Daten?
#
# ANGEFASST WIRD NUR, WAS DIESER LAUF SELBST ANLEGT: die Probe-App
# `tests/probe-live` unter der Kennung probe-live-<MMTT>, ein Wegwerf-Schluessel
# und die Staende, die das Live-Schalten dieser App anlegt (am Ende einzeln mit
# restic forget). Nie eine andere App, nie ein fremder Stand. Angemeldet wird
# als probe-admin, nie als admin:
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_GERAET=jetson bash scripts/test/live-schalten-abnahme.sh
#
# Ablauf:
#   1. Probe-App 1.0.0 einspielen (Test), live schalten (das erste Mal: nichts
#      zu sichern). Sieben Eintraege live, darunter ein Text zweimal; zwei
#      verschiedene im Test.
#   2. 2.0.0 in den Test, mit Aenderungstext. Ihre Strukturaenderung legt eine
#      Spalte und eine Tabelle an und will dann `text` eindeutig machen: im
#      Test gelingt das, live scheitert es am doppelten Text, und der Prozess
#      beendet sich (Exit 1).
#   3. Im Browser (live-schalten-bilder.mjs kaputt): Dialog mit Text, live
#      schalten, das Geraet faellt zurueck, Satz, zweiter Satz, Technik.
#   4. Nachgemessen ueber die Schnittstelle und in der Datenbank: Livestand
#      1.0.0, sieben Eintraege Text fuer Text, keine Spalte `kostenstelle`,
#      keine Tabelle `halb_angelegt`, der Stand davor steht in der Liste.
#      Der Teststand laeuft auf 2.0.0 mit seinen zwei Eintraegen.
#   5. 3.0.0 (die richtige Strukturaenderung) in den Test und im Browser live
#      (gut): sieben Eintraege Text fuer Text, die neue Spalte ist da, der
#      Teststand hat weiter nur seine zwei.
#   6. Aufraeumen: App, Schluessel, die Staende dieses Laufs (einzeln), und
#      nachsehen, dass kein fremder Stand fehlt und unter /arasul/apps kein
#      Ordner der Probe-App bleibt.
#
# Rueckgabe 0, wenn jede Pruefung gruen war. ARASUL_OHNE_BROWSER=1 schaltet
# ueber die Schnittstelle statt im Browser (dann ohne Bilder).
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
QUELLE="$WURZEL/tests/probe-live"
APP="${ARASUL_PROBE_APP:-probe-live-$(date +%m%d)}"
APPDB="${APP//-/_}"
LIVE_DB="arasul_app_${APPDB}_live"
TEST_DB="arasul_app_${APPDB}_test"
GEDULD=1800
ARBEIT="$(mktemp -d)"
RUMPF="$ARBEIT/rumpf"
EIGENE_STAENDE=()
TEXT_KAPUTT="Neu: Kostenstelle je Eintrag, und kein Text darf doppelt vorkommen."
TEXT_GUT="Neu: Kostenstelle je Eintrag. Doppelte Texte bleiben erlaubt."

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

# In der Datenbank selbst nachsehen, nicht nur ueber die App: eine App, die
# nach dem Rueckfall auf eine andere Datenbank zeigte, saehe sonst gesund aus.
sql() { # datenbank abfrage
  am_geraet "docker exec postgres-db psql -U arasul -d '$1' -tAc \"$2\"" 2>/dev/null | tr -d '\r'
}

# Nur die Kennungen dieses Laufs, einzeln (restic forget <id>), danach
# aufraeumen wie nach jeder Aufbewahrung, und dieselben Zeilen aus
# staende.json -- unter der Sperre der Sicherung, damit keine Nacht
# dazwischenkommt. Laeuft auch beim Abbruch (trap): ein Stand davor faellt
# sonst erst, wenn das Ziel voll ist.
STAENDE_WEG=nein
UEBRIG=""
staende_vergessen() {
  STAENDE_WEG=ja
  # Dazu jeder Stand, der vor dem Live-Schalten DIESER Probe-App entstand
  # (`fuer:live:<app>`) -- auch einer, dessen Kennung der Lauf nicht mehr las.
  local id
  ruf "$TOK" GET /api/backup/staende
  for id in $(rumpf | python3 -c 'import sys,json
try: d=json.load(sys.stdin)["data"]
except Exception: d=[]
print(" ".join(x["id"] for x in d if (x.get("fuer") or {}) == {"art":"live","id":sys.argv[1]}))' "$APP"); do
    [[ " ${EIGENE_STAENDE[*]} " == *" $id "* ]] || EIGENE_STAENDE+=("$id")
  done
  [ "${#EIGENE_STAENDE[@]}" -gt 0 ] || { UEBRIG=0; return 0; }
  local weg_json
  weg_json="$(printf '%s\n' "${EIGENE_STAENDE[@]}" | python3 -c 'import sys,json; print(json.dumps(sorted(set(l.strip() for l in sys.stdin if l.strip()))))')"
  am_geraet "docker exec backup-service bash -c $(printf '%q' "exec 9>/backups/.sicherung.sperre; timeout 3300 flock 9
    source /usr/local/bin/staende.sh
    R=\$(stand_repo /backups); K=\$STAND_SCHLUESSEL
    stand_restic \$R \$K forget $(printf '%s ' "${EIGENE_STAENDE[@]}") >/dev/null 2>&1 && stand_aufraeumen \$R \$K
    jq --argjson weg '$weg_json' '.staende |= map(select(.id as \$i | (\$weg | index(\$i)) | not))' /backups/staende.json > /backups/staende.json.neu && mv -f /backups/staende.json.neu /backups/staende.json")" >"$ARBEIT/forget.log" 2>&1
  ruf "$TOK" GET /api/backup/staende
  UEBRIG="$(rumpf | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]; w=set(json.loads(sys.argv[1])); print(sum(1 for x in d if x["id"] in w))' "$weg_json")"
}

SCHLUESSEL=""
KEY_ID=""
TOK=""
ICH=""
APP_WEG=nein
aufraeumen() {
  if [ -n "$SCHLUESSEL" ] && [ "$APP_WEG" != ja ]; then
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  # Abgebrochen: auch die Staende, die das Live-Schalten dieser App anlegte.
  if [ "$STAENDE_WEG" != ja ] && [ -n "$TOK" ]; then
    staende_vergessen
    echo "aufgeraeumt  ${#EIGENE_STAENDE[@]} eigene Staende (Abbruch)"
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -rf "$ARBEIT"
  echo "aufgeraeumt  Wegwerf-Schluessel, Arbeitsordner"
}
trap aufraeumen EXIT

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 $GERAET"
  exit 1
fi
echo "=== Live schalten mit Sicherung am Orin: App ${APP}, gegen $BASIS ==="
echo

TOK=$(arasul_token)
pruefe "Anmeldung als ${ARASUL_BENUTZER}" "$([ -n "$TOK" ] && echo ja || echo nein)"
[ -z "$TOK" ] && exit 1
ruf "$TOK" GET /api/auth/me
ICH="$(rumpf | feld user.id)"
pruefe "probe-admin ist Administrator" "$(ja_wenn "$(rumpf | feld user.role)" admin)"

ruf "$TOK" GET /api/backup/staende
ANFANG_STAENDE="$(rumpf | python3 -c 'import sys,json; print(" ".join(x["id"] for x in json.load(sys.stdin)["data"]))' 2>/dev/null)"

# --- 1. Die Probe-App, live ---------------------------------------------------------
ruf "$TOK" GET "/api/apps/$APP"
if [ "$CODE" = 200 ]; then
  echo "Die App $APP gibt es schon. Nicht anfassen; ARASUL_PROBE_APP=<andere Kennung>."
  exit 2
fi
ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
  -d '{"name":"Abnahme Live schalten (M5)","allowed_endpoints":["app:deploy"]}' "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld data.api_key); [ -z "$SCHLUESSEL" ] && SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld data.key_id); [ -z "$KEY_ID" ] && KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe "Wegwerf-Schluessel mit app:deploy" "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && exit 1

ausrollen() { # version struktur aenderungstext
  local version="$1" struktur="$2" text="$3" ordner="$ARBEIT/paket-$1"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$version" "$struktur" <<'PY'
import json, sys
quelle, ziel, kennung, version, struktur = sys.argv[1:6]
m = json.load(open(quelle))
m["id"] = kennung; m["name"] = "Probe Live schalten"; m["version"] = version
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
m["backend"]["umgebung"] = {"PROBE_VERSION": version, "PROBE_STRUKTUR": struktur}
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket-$version.tgz" -C "$ordner" .
  local -a mit_text=()
  [ -n "$text" ] && mit_text=(-F "aenderungstext=$text")
  CODE=$(curl -sk -o "$RUMPF" -w '%{http_code}' --max-time "$GEDULD" -H "x-api-key: $SCHLUESSEL" \
    "${mit_text[@]}" -F "paket=@$ARBEIT/paket-$version.tgz" "$BASIS/api/v1/external/apps")
}
eintraege() { # live|test -> die Texte, einer je Zeile
  local weg="/apps/$APP/api"
  [ "$1" = test ] && weg="/apps/$APP/test/api"
  ruf "$TOK" GET "$weg/eintraege"
  rumpf | python3 -c 'import sys,json
try: print("\n".join(json.load(sys.stdin)["eintraege"]))
except Exception: print("?")'
}
struktur() { # live|test -> "spalten=… tabellen=…"
  local db="$LIVE_DB"
  [ "$1" = test ] && db="$TEST_DB"
  printf 'spalten=%s tabellen=%s' \
    "$(sql "$db" "SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='eintraege'")" \
    "$(sql "$db" "SELECT string_agg(table_name, ',' ORDER BY table_name) FROM information_schema.tables WHERE table_schema='public'")"
}

ausrollen 1.0.0 1 "Erste Fassung."
pruefe "$APP 1.0.0 in den Test" "$([ "$CODE" = 201 ] || [ "$CODE" = 200 ] && echo ja || echo nein)" "HTTP $CODE"
ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$ICH,\"stand\":\"test\"}"
pruefe "Die Probe-App ist probe-admin freigegeben (Live und Test)" "$([ "$CODE" = 200 ] || [ "$CODE" = 201 ] && echo ja || echo nein)" "HTTP $CODE"
arasul_warte_auf_app "/apps/$APP/test/api/gesund" 300 "$TOK"
ruf "$TOK" POST "/api/apps/$APP/schalten" '{"ziel":"live"}'
pruefe "1.0.0 live (das erste Mal, ohne Live-Daten: nichts zu sichern)" \
  "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.schaltung.ergebnis)" = live ] && [ -z "$(rumpf | feld data.schaltung.sicherung_id)" ] && echo ja || echo nein)" \
  "HTTP $CODE $(rumpf | feld data.schaltung.ergebnis)"
arasul_warte_auf_app "/apps/$APP/api/gesund" 120 "$TOK"

for t in "Angebot Mueller" "Rechnung 4711" "Rechnung 4711" "Lieferschein 12" "Gutschrift 3" "Mahnung 1" "Auftrag 88"; do
  ruf "$TOK" POST "/apps/$APP/api/eintrag?text=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$t")"
done
for t in "Test eins" "Test zwei"; do
  ruf "$TOK" POST "/apps/$APP/test/api/eintrag?text=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$t")"
done
LIVE_VORHER="$(eintraege live)"
TEST_VORHER="$(eintraege test)"
ZEILEN_VORHER="$(sql "$LIVE_DB" 'SELECT count(*) FROM eintraege')"
pruefe "Sieben Eintraege live (einer doppelt), zwei im Test" \
  "$([ "$(printf '%s\n' "$LIVE_VORHER" | grep -c .)" = 7 ] && [ "$ZEILEN_VORHER" = 7 ] && [ "$(printf '%s\n' "$TEST_VORHER" | grep -c .)" = 2 ] && echo ja || echo nein)" \
  "live ${ZEILEN_VORHER} Zeilen in ${LIVE_DB}"
STRUKTUR_VORHER="$(struktur live)"

# --- 2. Die kaputte Fassung in den Test ---------------------------------------------
ausrollen 2.0.0 2 "$TEXT_KAPUTT"
pruefe "2.0.0 in den Test, mit Aenderungstext" "$([ "$CODE" = 201 ] || [ "$CODE" = 200 ] && echo ja || echo nein)" "HTTP $CODE"
arasul_warte_auf_app "/apps/$APP/test/api/gesund" 300 "$TOK"
ruf "$TOK" GET "/apps/$APP/test/api/gesund"
pruefe "Im Test laeuft 2.0.0 (die Strukturaenderung gelingt auf den Testdaten)" "$(ja_wenn "$(rumpf | feld version)" 2.0.0)"
ruf "$TOK" GET "/api/apps/$APP"
pruefe "GET /api/apps/:id nennt den Aenderungstext am Teststand" "$(ja_wenn "$(rumpf | feld data.staende.test.aenderungstext)" "$TEXT_KAPUTT")"

# --- 3. Live schalten: das Geraet faellt zurueck ----------------------------------------
DAUER_KAPUTT=""
if command -v node >/dev/null 2>&1 && [ -z "${ARASUL_OHNE_BROWSER:-}" ]; then
  arasul_sitzung_bauen "$TOK" >/dev/null 2>&1
  ARASUL_URL="$BASIS" ARASUL_SITZUNG="$ARASUL_SITZUNG" ARASUL_PROBE_APP="$APP" ARASUL_NEU=2.0.0 ARASUL_ALT=1.0.0 \
    ARASUL_TEXT="$TEXT_KAPUTT" node "$WURZEL/scripts/test/live-schalten-bilder.mjs" kaputt | tee "$ARBEIT/kaputt.txt"
  pruefe "Im Browser: Dialog mit Text, live schalten, Rueckfall in einem Satz, Technik aufgeklappt" \
    "$([ "$(grep -c '^ROT' "$ARBEIT/kaputt.txt")" = 0 ] && grep -q '^gruen' "$ARBEIT/kaputt.txt" && echo ja || echo nein)"
  DAUER_KAPUTT="$(sed -n 's/^DAUER kaputt=//p' "$ARBEIT/kaputt.txt")"
else
  t0=$SECONDS
  ruf "$TOK" POST "/api/apps/$APP/schalten" '{"ziel":"live"}'
  DAUER_KAPUTT=$((SECONDS - t0))
  pruefe "Live schalten: 409 LIVE_ZURUECKGESCHALTET" \
    "$([ "$CODE" = 409 ] && [ "$(rumpf | feld error.code)" = LIVE_ZURUECKGESCHALTET ] && echo ja || echo nein)" "HTTP $CODE, ${DAUER_KAPUTT} s"
fi

# --- 4. Nachgemessen ---------------------------------------------------------------
ruf "$TOK" GET "/api/apps/$APP"
cp "$RUMPF" "$ARBEIT/nach-kaputt.json"
SATZ="$(feld data.letzte_schaltung.satz <"$ARBEIT/nach-kaputt.json")"
STAND_KAPUTT="$(feld data.letzte_schaltung.sicherung_id <"$ARBEIT/nach-kaputt.json")"
[ -n "$STAND_KAPUTT" ] && EIGENE_STAENDE+=("$STAND_KAPUTT")
pruefe "Ergebnis zurueckgeschaltet, von 1.0.0 nach 2.0.0" \
  "$([ "$(feld data.letzte_schaltung.ergebnis <"$ARBEIT/nach-kaputt.json")" = zurueckgeschaltet ] && [ "$(feld data.letzte_schaltung.von_version <"$ARBEIT/nach-kaputt.json")" = 1.0.0 ] && [ "$(feld data.letzte_schaltung.nach_version <"$ARBEIT/nach-kaputt.json")" = 2.0.0 ] && echo ja || echo nein)"
pruefe "Ein Satz an den Admin, der beide Fassungen nennt" \
  "$([[ "$SATZ" == *2.0.0*1.0.0*"Daten von vorher." ]] && [ "$(grep -o '\. ' <<<"$SATZ" | wc -l | tr -d ' ')" = 0 ] && echo ja || echo nein)" "$SATZ"
pruefe "Der zweite Satz sagt, was er tun kann" "$([ -n "$(feld data.letzte_schaltung.hilfe <"$ARBEIT/nach-kaputt.json")" ] && echo ja || echo nein)" \
  "$(feld data.letzte_schaltung.hilfe <"$ARBEIT/nach-kaputt.json")"
pruefe "Die Technik nennt den Grund und die letzten Zeilen der Fassung" \
  "$(grep -q 'gescheitert' <<<"$(feld data.letzte_schaltung.technik.letzte_zeilen <"$ARBEIT/nach-kaputt.json")" && [ -n "$(feld data.letzte_schaltung.technik.grund <"$ARBEIT/nach-kaputt.json")" ] && echo ja || echo nein)" \
  "$(feld data.letzte_schaltung.technik.grund <"$ARBEIT/nach-kaputt.json"), Exit $(feld data.letzte_schaltung.technik.exit_code <"$ARBEIT/nach-kaputt.json")"
ruf "$TOK" GET /api/backup/staende
pruefe "Vorher gesichert: der Stand steht in der Liste, mit fuer live:${APP}" \
  "$(rumpf | python3 -c 'import sys,json
d=json.load(sys.stdin)["data"]; s=[x for x in d if x["id"]==sys.argv[1]]
print("ja" if s and s[0]["vorher"] and s[0]["fuer"]=={"art":"live","id":sys.argv[2]} and sys.argv[3] in s[0]["appDatenbanken"] else "nein")' "$STAND_KAPUTT" "$APP" "$LIVE_DB")" \
  "${STAND_KAPUTT:0:8}"
pruefe "Der Livestand steht wieder auf 1.0.0, ohne voriger Fassung 2.0.0" \
  "$([ "$(feld data.staende.live.version <"$ARBEIT/nach-kaputt.json")" = 1.0.0 ] && [ "$(feld data.staende.live.vorige_version <"$ARBEIT/nach-kaputt.json")" != 2.0.0 ] && echo ja || echo nein)" \
  "live $(feld data.staende.live.version <"$ARBEIT/nach-kaputt.json"), davor '$(feld data.staende.live.vorige_version <"$ARBEIT/nach-kaputt.json")'"
arasul_warte_auf_app "/apps/$APP/api/gesund" 120 "$TOK"
ruf "$TOK" GET "/apps/$APP/api/gesund"
pruefe "Die App antwortet live mit 1.0.0" "$([ "$CODE" = 200 ] && [ "$(rumpf | feld version)" = 1.0.0 ] && echo ja || echo nein)" "HTTP $CODE"
LIVE_NACH_KAPUTT="$(eintraege live)"
ZEILEN_NACH_KAPUTT="$(sql "$LIVE_DB" 'SELECT count(*) FROM eintraege')"
pruefe "Live-Daten von vorher: ${ZEILEN_VORHER} Zeilen vorher, ${ZEILEN_NACH_KAPUTT} nachher, Text fuer Text gleich" \
  "$([ "$LIVE_NACH_KAPUTT" = "$LIVE_VORHER" ] && [ "$ZEILEN_NACH_KAPUTT" = "$ZEILEN_VORHER" ] && echo ja || echo nein)"
STRUKTUR_NACH_KAPUTT="$(struktur live)"
pruefe "Die halbe Strukturaenderung ist weg (keine Spalte kostenstelle, keine Tabelle halb_angelegt)" \
  "$([ "$STRUKTUR_NACH_KAPUTT" = "$STRUKTUR_VORHER" ] && ! grep -q 'kostenstelle\|halb_angelegt' <<<"$STRUKTUR_NACH_KAPUTT" && echo ja || echo nein)" \
  "$STRUKTUR_NACH_KAPUTT"
ruf "$TOK" GET "/apps/$APP/test/api/gesund"
pruefe "Die Testfassung laeuft weiter (2.0.0)" "$([ "$CODE" = 200 ] && [ "$(rumpf | feld version)" = 2.0.0 ] && echo ja || echo nein)"
pruefe "Der Test hat seine zwei Eintraege, keinen aus Live" \
  "$(ja_wenn "$(eintraege test)" "$TEST_VORHER")" "$(eintraege test | tr '\n' '|')"

# --- 5. Die gute Fassung --------------------------------------------------------------
ausrollen 3.0.0 3 "$TEXT_GUT"
pruefe "3.0.0 in den Test, mit Aenderungstext" "$([ "$CODE" = 201 ] || [ "$CODE" = 200 ] && echo ja || echo nein)" "HTTP $CODE"
arasul_warte_auf_app "/apps/$APP/test/api/gesund" 300 "$TOK"
DAUER_GUT=""
if command -v node >/dev/null 2>&1 && [ -z "${ARASUL_OHNE_BROWSER:-}" ]; then
  ARASUL_URL="$BASIS" ARASUL_SITZUNG="$ARASUL_SITZUNG" ARASUL_PROBE_APP="$APP" ARASUL_NEU=3.0.0 ARASUL_ALT=1.0.0 \
    ARASUL_TEXT="$TEXT_GUT" node "$WURZEL/scripts/test/live-schalten-bilder.mjs" gut | tee "$ARBEIT/gut.txt"
  pruefe "Im Browser: Dialog mit Text, live, kein Hinweis" \
    "$([ "$(grep -c '^ROT' "$ARBEIT/gut.txt")" = 0 ] && grep -q '^gruen' "$ARBEIT/gut.txt" && echo ja || echo nein)"
  DAUER_GUT="$(sed -n 's/^DAUER gut=//p' "$ARBEIT/gut.txt")"
else
  t0=$SECONDS
  ruf "$TOK" POST "/api/apps/$APP/schalten" '{"ziel":"live"}'
  DAUER_GUT=$((SECONDS - t0))
  pruefe "Live schalten: 200" "$(ja_wenn "$CODE" 200)" "${DAUER_GUT} s"
fi
ruf "$TOK" GET "/api/apps/$APP"
cp "$RUMPF" "$ARBEIT/nach-gut.json"
STAND_GUT="$(feld data.letzte_schaltung.sicherung_id <"$ARBEIT/nach-gut.json")"
[ -n "$STAND_GUT" ] && EIGENE_STAENDE+=("$STAND_GUT")
pruefe "3.0.0 ist live, davor 1.0.0, vorher gesichert (ein eigener Stand)" \
  "$([ "$(feld data.staende.live.version <"$ARBEIT/nach-gut.json")" = 3.0.0 ] && [ "$(feld data.staende.live.vorige_version <"$ARBEIT/nach-gut.json")" = 1.0.0 ] && [ "$(feld data.letzte_schaltung.ergebnis <"$ARBEIT/nach-gut.json")" = live ] && [ -n "$STAND_GUT" ] && [ "$STAND_GUT" != "$STAND_KAPUTT" ] && echo ja || echo nein)" \
  "Stand ${STAND_GUT:0:8}"
pruefe "Der Aenderungstext ist mit in den Livestand gewandert" "$(ja_wenn "$(feld data.staende.live.aenderungstext <"$ARBEIT/nach-gut.json")" "$TEXT_GUT")"
arasul_warte_auf_app "/apps/$APP/api/gesund" 120 "$TOK"
LIVE_NACH_GUT="$(eintraege live)"
ZEILEN_NACH_GUT="$(sql "$LIVE_DB" 'SELECT count(*) FROM eintraege')"
pruefe "Live-Daten vollstaendig: ${ZEILEN_VORHER} Zeilen vorher, ${ZEILEN_NACH_GUT} nachher, Text fuer Text gleich" \
  "$([ "$LIVE_NACH_GUT" = "$LIVE_VORHER" ] && [ "$ZEILEN_NACH_GUT" = "$ZEILEN_VORHER" ] && echo ja || echo nein)"
pruefe "Die Strukturaenderung von 3.0.0 ist da (Spalte kostenstelle), nichts Halbes von 2.0.0" \
  "$(S="$(struktur live)"; grep -q 'kostenstelle' <<<"$S" && ! grep -q 'halb_angelegt' <<<"$S" && echo ja || echo nein)" "$(struktur live)"
pruefe "Der Test hat weiter nur seine zwei Eintraege" "$(ja_wenn "$(eintraege test)" "$TEST_VORHER")"
pruefe "Keine Live-Zeile in der Testdatenbank" \
  "$(ja_wenn "$(sql "$TEST_DB" "SELECT count(*) FROM eintraege WHERE text IN ('Angebot Mueller','Rechnung 4711','Auftrag 88')")" 0)"

# --- 6. Aufraeumen ------------------------------------------------------------------
echo
echo "-- Aufraeumen"
CODE=$(curl -sk -o "$RUMPF" -w '%{http_code}' --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
  "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true")
[ "$CODE" = 200 ] && APP_WEG=ja
pruefe "Probe-App entfernt (samt Datenbanken und Dateien)" "$APP_WEG" "HTTP $CODE"
pruefe "Im Container dashboard-backend liegt unter /arasul/apps kein Ordner der Probe-App" \
  "$(ja_wenn "$(am_geraet "docker exec dashboard-backend sh -c 'ls -A /arasul/apps | grep -cx $APP'")" 0)"
pruefe "Beide Datenbanken der Probe-App sind weg" \
  "$(ja_wenn "$(sql postgres "SELECT count(*) FROM pg_database WHERE datname IN ('$LIVE_DB','$TEST_DB')")" 0)"
# Der Abzug, den wiederherstellen.sh vor dem Einspielen von der kaputten
# Live-Datenbank zog -- nur der dieser App.
am_geraet "docker exec backup-service sh -c 'rm -f /backups/vor_wiederherstellung/${LIVE_DB}_vorher_*'" >/dev/null 2>&1

staende_vergessen
pruefe "Die ${#EIGENE_STAENDE[@]} eigenen Staende einzeln entfernt (restic forget)" "$(ja_wenn "$UEBRIG" 0)" "$(rumpf | feld anzahl) Staende bleiben"
ruf "$TOK" GET /api/backup/staende
FORT="$(rumpf | python3 -c 'import sys,json
jetzt=set(x["id"] for x in json.load(sys.stdin)["data"])
print(" ".join(i[:8] for i in sys.argv[1].split() if i not in jetzt))' "$ANFANG_STAENDE")"
pruefe "Kein fremder Stand ist entfallen (alle Staende vom Anfang sind noch da)" "$([ -z "$FORT" ] && echo ja || echo nein)" "${FORT:-keiner fehlt}"

echo
echo "Zahlen fuer den PR:"
echo "  Live schalten, kaputt (sichern, scheitern, zurueck): ${DAUER_KAPUTT:-?} s"
echo "  Live schalten, gut (sichern, schalten, gesund):      ${DAUER_GUT:-?} s"
echo "  Live-Zeilen vorher / nach Rueckfall / nach gut:      ${ZEILEN_VORHER} / ${ZEILEN_NACH_KAPUTT} / ${ZEILEN_NACH_GUT}"
echo
echo "$gruen gruen, $rot rot"
[ "$rot" -eq 0 ]
