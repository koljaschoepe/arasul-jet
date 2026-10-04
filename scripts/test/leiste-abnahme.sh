#!/bin/bash
# =============================================================================
# leiste-abnahme.sh — Apps im Hintergrund, Sortieren, Symbol, am Orin (M5)
# =============================================================================
# Auftrag apps-im-hintergrund-und-sortieren (04.10.2026). Gemessen wird:
#
#   SYMBOL        `symbol` aus app.json kommt über GET /api/apps/meine an; die
#                 Leiste zeigt ein Lucide-Bild, ein Kürzel, ohne Symbol und bei
#                 unbekanntem Namen das Kürzel aus dem Namen.
#   HINTERGRUND   Die offene und die letzten drei geöffneten Apps behalten
#                 Eingabe und Scrollstand beim Wechsel (kein Neuladen); die
#                 vierte fällt heraus. Wechsel unter 200 ms (Zahl in der
#                 Ausgabe); Speicher des Browsers mit drei Apps im Hintergrund.
#   SORTIEREN     Ziehen und Alt+Pfeil ordnen die Leiste je Person; die
#                 Reihenfolge liegt am Gerät (zweite Sitzung sieht sie, ein
#                 anderer Mensch nicht). In einem niedrigen Fenster scrollt die
#                 Leiste.
#
# Vier Probe-Apps `probe-leiste-<STEMPEL>-1` bis `-4` aus `tests/probe-leiste`
# (nur Frontend, nie `abschluss`, `belege` oder deren Probe). Konten: zwei
# VORHANDENE Probekonten, nie `admin`, keine neuen. Passwörter nur zur
# Laufzeit, nie in Dateien:
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_A=probe-j36-a ARASUL_A_PASSWORT="$(geheim get 'Arasul Orin Probe-Konto probe-j36-a')" \
#   ARASUL_GERAET=jetson ARASUL_STEMPEL=1004 \
#   bash scripts/test/leiste-abnahme.sh
#
# VORAUSSETZUNG für den Browser-Teil: `playwright` steht in keinem Lockfile.
# `npm i --no-save playwright` im Wurzelordner (ändert das Lockfile nicht) oder
# ARASUL_PLAYWRIGHT=<Ordner mit node_modules/playwright>; Details im Kopf von
# `leiste-bilder.mjs`. Bilder: ARASUL_BILDER=1 (docs/plans/audits/<tag>-leiste/).
#
# WAS ES ANLEGT, RÄUMT ES WEG: die vier Apps (samt Ordnern), ihre Freigaben, den
# Wegwerf-Schlüssel — und die Reihenfolge der Leiste von A und probe-admin wird
# auf leer zurückgesetzt.
#
# Rückgabe 0, wenn jede Prüfung grün war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
GERAET="${ARASUL_GERAET:-jetson}"
QUELLE="$WURZEL/tests/probe-leiste"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
GEDULD=900
A="${ARASUL_A:-}"
A_PASS="${ARASUL_A_PASSWORT:-}"

# Kennung | Name | Symbol (leer = keins). Namen ergeben die Kürzel AL, BL, GL, DL.
APPS=("probe-leiste-$STEMPEL-1" "probe-leiste-$STEMPEL-2" "probe-leiste-$STEMPEL-3" "probe-leiste-$STEMPEL-4")
NAMEN=("Alpha Leiste $STEMPEL" "Beta Leiste $STEMPEL" "Gamma Leiste $STEMPEL" "Delta Leiste $STEMPEL")
SYMBOLE=("file-text" "Q7" "" "kein-solches-symbol-xyz")
KUERZEL=("AL" "Q7" "GL" "DL")

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

if [ -z "$A" ] || [ -z "$A_PASS" ]; then
  echo "ARASUL_A und ARASUL_A_PASSWORT fehlen (vorhandenes Probekonto)."
  exit 2
fi
for wer in "$ARASUL_BENUTZER" "$A"; do
  if [ "$wer" = "admin" ]; then
    echo "Nie das Konto admin: das ist Koljas Konto. Probekonten nehmen."
    exit 2
  fi
done

RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""

ruf() { # <token|schluessel:…> <verb> <pfad> [leib] -- setzt $CODE
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

baue_paket() { # index
  local i="$1" ordner="$ARBEIT/paket-$1"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/frontend" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "${APPS[$i]}" "${NAMEN[$i]}" "${SYMBOLE[$i]}" <<'PY'
import json, sys
quelle, ziel, kennung, name, symbol = sys.argv[1:6]
m = json.load(open(quelle))
m["id"] = kennung
m["name"] = name
if symbol:
    m["symbol"] = symbol
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket-$i.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket-$i.tgz"
}

ausrollen() { # index
  local paket
  paket=$(baue_paket "$1") || return 1
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$paket" "$BASIS/api/v1/external/apps")
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Gerät unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 $GERAET"
  exit 1
fi

echo "=== Abnahme M5: Apps im Hintergrund und Sortieren, probe-leiste-$STEMPEL-* gegen $BASIS ==="
echo

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
pruefe 'Zwei vorhandene Probekonten, keine neuen' "$([ -n "$ID_ADMIN" ] && [ -n "$ID_A" ] && echo ja || echo nein)" "$ARASUL_BENUTZER=$ID_ADMIN $A=$ID_A"

SCHLUESSEL=""
KEY_ID=""
FREIGEGEBEN=()
aufraeumen() {
  local id app
  for app in "${APPS[@]}"; do
    for id in "$ID_ADMIN" "$ID_A"; do
      [ -n "$id" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
        -H "authorization: Bearer $TOK" "$BASIS/api/freigaben/$app/$id"
    done
    if [ -n "$SCHLUESSEL" ]; then
      curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
        "$BASIS/api/v1/external/apps/$app?bestaetigung=$app&dateien=true"
    fi
  done
  # Die Sortierung der Probekonten zurück auf leer.
  curl -sk -o /dev/null --max-time 30 -X PUT -H "authorization: Bearer $TOK_A" \
    -H 'content-type: application/json' -d '{"reihenfolge":[]}' "$BASIS/api/apps/reihenfolge"
  curl -sk -o /dev/null --max-time 30 -X PUT -H "authorization: Bearer $TOK" \
    -H 'content-type: application/json' -d '{"reihenfolge":[]}' "$BASIS/api/apps/reihenfolge"
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  Freigaben zurückgenommen, vier Probe-Apps entfernt, Sortierung von %s und %s zurückgesetzt, Schlüssel widerrufen\n' "$A" "$ARASUL_BENUTZER"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme M5 Leiste ($STEMPEL)\",\"allowed_endpoints\":[\"app:deploy\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schlüssel mit app:deploy' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

# Ausgangslage: die Reihenfolge der beiden Konten ist leer.
for wer in "$TOK" "$TOK_A"; do
  ruf "$wer" PUT /api/apps/reihenfolge '{"reihenfolge":[]}'
done

# --- 1. Vier Probe-Apps live, A und probe-admin freigegeben ---------------------
for i in 0 1 2 3; do
  ausrollen "$i"
  pruefe "${APPS[$i]} in den Teststand" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
  [ "$CODE" != "201" ] && { rumpf; echo; exit 1; }
  ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/${APPS[$i]}/schalten" '{"ziel":"live"}'
  pruefe "${APPS[$i]} live geschaltet" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  for id in "$ID_ADMIN" "$ID_A"; do
    ruf "$TOK" POST /api/freigaben "{\"app_id\":\"${APPS[$i]}\",\"benutzer_id\":$id,\"stand\":\"live\"}"
  done
  code_seite=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 -H "authorization: Bearer $TOK_A" "$BASIS/apps/${APPS[$i]}/")
  pruefe "${APPS[$i]}: die Seite kommt für $A (200)" "$(ja_wenn "$code_seite" 200)" "HTTP $code_seite"
done

# --- 2. Im Browser ----------------------------------------------------------------
export ARASUL_URL ARASUL_PASSWORT ARASUL_BENUTZER
export ARASUL_A="$A" ARASUL_A_PASSWORT="$A_PASS"
export ARASUL_LEISTE_APPS="${APPS[0]}:${KUERZEL[0]},${APPS[1]}:${KUERZEL[1]},${APPS[2]}:${KUERZEL[2]},${APPS[3]}:${KUERZEL[3]}"
for phase in symbol hintergrund sortieren; do
  node "$WURZEL/scripts/test/leiste-bilder.mjs" "$phase" | sed 's/^/  /'
  pruefe "Browser: $phase" "$(ja_wenn "${PIPESTATUS[0]}" 0)"
done

# --- 3. Aufräumen und nachsehen ---------------------------------------------------
trap - EXIT
aufraeumen
RUMPF_DATEI="$(mktemp)"
for app in "${APPS[@]}"; do
  ruf "$TOK" GET "/api/apps/$app"
  pruefe "$app ist entfernt (404)" "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
done
ruf "$TOK_A" GET /api/apps/reihenfolge
pruefe "Die Sortierung von $A ist zurückgesetzt" "$(ja_wenn "$(rumpf | feld data)" '[]')"
rm -f "$RUMPF_DATEI"

echo
echo "$gruen grün, $rot rot"
[ "$rot" -eq 0 ]
