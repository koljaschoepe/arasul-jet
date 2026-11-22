#!/bin/bash
# =============================================================================
# Abnahme: der App-Standard ist Pflicht beim Ausrollen (J45, M7, 20.11.2026)
# =============================================================================
# Die Karte sagt: das Ausrollen (POST /api/v1/external/apps) weist ein Paket
# ab, das (a) die Bibliothek nicht oder in einer nicht mehr getragenen Fassung
# nutzt, (b) keine Tests mitbringt oder (c) den Nachweis des Kit-Ablaufs nicht
# traegt, mit einem Satz je Grund auf Deutsch. Genau das misst dieses Skript,
# ueber die externe API mit einem Schluessel, so wie das Kit es tut:
#
#   1. Der Kontrakt nennt die Pflicht (`paket.nachweis`), Fassung bleibt 14.
#   2. Je Grund ein Paket, das abgewiesen wird, mit 400, dem Code in
#      `details.standard` und dem deutschen Satz in der Meldung.
#   3. Ein Paket mit gueltigem Nachweis geht durch (201, Teststand) und traegt
#      danach `standard.erfuellt`.
#   4. Die Apps, die schon am Geraet liegen, laufen weiter und sagen, was
#      ihnen fehlt (nur Auskunft, kein Rot: die Pruefung ist nicht rueckwirkend).
#
# DER NACHWEIS kommt aus `nachweis-stempeln.mjs` (das Blatt des Kits ein
# zweites Mal gerechnet). Fuer die Faelle, die ein Feld verbiegen, wird er hier
# geaendert und neu gesiegelt, damit genau EIN Grund anschlaegt.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_BENUTZER=probe-admin ARASUL_PASSWORT=... bash scripts/test/standard-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
APP="${ARASUL_STANDARD_APP:-standard-probe}"
STEMPEL="$WURZEL/scripts/test/nachweis-stempeln.mjs"

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

RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""
schluessel_ruf() {
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$1" --max-time 120 \
    -H "x-api-key: $SCHLUESSEL" "$BASIS$2")
}
paket_ruf() {
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time 600 \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$1" "$BASIS/api/v1/external/apps")
  # Das Geraet nimmt hoechstens 20 Uploads je Minute (`uploadLimiter`), und
  # dieses Skript schickt zwoelf. Zwei Laeufe kurz nacheinander reissen die
  # Grenze; dann einmal das Fenster abwarten statt die Drossel zu messen.
  if [ "$CODE" = 429 ]; then
    printf '       (429, warte 65 s auf das Fenster der Upload-Drossel)\n'
    sleep 65
    CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time 600 \
      -H "x-api-key: $SCHLUESSEL" -F "paket=@$1" "$BASIS/api/v1/external/apps")
  fi
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }
feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    if isinstance(d, dict): d = d.get(k)
    elif isinstance(d, list) and k.isdigit() and int(k) < len(d): d = d[int(k)]
    else: d = None
    if d is None: break
# Wahrheitswerte als JSON (`true`), nicht als Python (`True`).
print("" if d is None else (d if isinstance(d,(str,int,float)) and not isinstance(d,bool) else json.dumps(d, ensure_ascii=False)))' "$1" 2>/dev/null
}

# --- Pakete ------------------------------------------------------------------
# Eine App nur mit Frontend: kein Bau am Geraet, also schnell, und der Standard
# misst das Paket, nicht den Container.
grundpaket() {
  local name="$1" version="${2:-1.0.0}"
  local ordner="$ARBEIT/$name"
  rm -rf "$ordner"
  mkdir -p "$ordner/frontend"
  printf '<!doctype html><title>Standard-Probe</title><h1>Standard-Probe %s</h1>\n' "$version" \
    >"$ordner/frontend/index.html"
  python3 - "$ordner/app.json" "$APP" "$version" <<'PY'
import json, sys
ziel, kennung, version = sys.argv[1:4]
json.dump({"schema": 1, "id": kennung, "name": "Standard-Probe (J45)", "version": version,
           "marken": "5", "frontend": {"verzeichnis": "frontend"}},
          open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  echo "$ordner"
}

# Ein Feld des Nachweises verbiegen und neu siegeln (kanonisches JSON wie im Blatt).
verbiege() {
  python3 - "$1/nachweis.json" "$2" <<'PY'
import json, sys, hashlib
pfad, ausdruck = sys.argv[1:3]
d = json.load(open(pfad))
exec(ausdruck, {"d": d})
d.pop("siegel", None)
kanon = json.dumps(d, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
d["siegel"] = "sha256:" + hashlib.sha256(kanon.encode("utf-8")).hexdigest()
json.dump(d, open(pfad, "w"), indent=2, ensure_ascii=False)
PY
}

packe() {
  COPYFILE_DISABLE=1 tar czf "$1.tgz" -C "$1" . && echo "$1.tgz"
}

# Ein Fall: Paket schicken, 400 erwarten, Code und Satz pruefen.
abgewiesen() {
  local was="$1" archiv="$2" code="$3" satz="$4"
  paket_ruf "$archiv"
  pruefe "$was: 400" "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
  local codes
  codes=$(rumpf | feld error.details.standard)
  pruefe "  Code $code in details.standard" \
    "$(grep -qF "\"$code\"" <<<"$codes" && echo ja || echo nein)" "$codes"
  pruefe "  Satz auf Deutsch: '$satz'" \
    "$(grep -qF "$satz" <<<"$(rumpf | feld error.message)" && echo ja || echo nein)"
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme App-Standard (J45) gegen $BASIS ==="
echo

# --- 0. Schluessel -----------------------------------------------------------
SCHLUESSEL="${ARASUL_KIT_SCHLUESSEL:-}"
KEY_ID=""
TOK=""
aufraeumen() {
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 60 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  if [ -n "$TOK" ] && [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
    printf 'aufgeraeumt  Probe-App entfernt, Wegwerf-Schluessel widerrufen\n'
  fi
}
trap aufraeumen EXIT

if [ -z "$SCHLUESSEL" ]; then
  TOK=$(arasul_token)
  pruefe 'Anmeldung (nur um einen Wegwerf-Schluessel anzulegen)' \
    "$([ -n "$TOK" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"
  [ -z "$TOK" ] && exit 1
  ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
    -H 'content-type: application/json' \
    -d '{"name":"Abnahme J45 (standard)","allowed_endpoints":["app:deploy"]}' \
    "$BASIS/api/v1/external/api-keys")
  SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
  KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
  pruefe 'Wegwerf-Schluessel mit app:deploy' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
  [ -z "$SCHLUESSEL" ] && exit 1
fi

# --- 1. Kontrakt -------------------------------------------------------------
schluessel_ruf GET /api/v1/external/contract
pruefe 'Kontrakt antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
pruefe 'Kontraktversion bleibt 14' "$(ja_wenn "$(rumpf | feld data.kontrakt)" 14)"
pruefe 'paket.nachweis.pflicht ist true' "$(ja_wenn "$(rumpf | feld data.paket.nachweis.pflicht)" true)"
pruefe 'paket.nachweis nennt nachweis.json' \
  "$(ja_wenn "$(rumpf | feld data.paket.nachweis.datei)" nachweis.json)"
pruefe 'Die Werkstatt ist die einzige Ausnahme' \
  "$(ja_wenn "$(rumpf | feld data.paket.nachweis.ausgenommen)" '["werkstatt"]')"

# --- 2. Abweisungen, je Grund ------------------------------------------------
O=$(grundpaket ohne-nachweis)
abgewiesen '(c) ohne Nachweis' "$(packe "$O")" fehlt 'nicht über den Ablauf des Kits gebaut'

O=$(grundpaket geaendert)
node "$STEMPEL" "$O"
printf '<h1>nach dem Bau geändert</h1>\n' >"$O/frontend/index.html"
abgewiesen '(c) nach dem Bau geändert' "$(packe "$O")" paket-geaendert 'nach dem Bau verändert'

O=$(grundpaket siegel)
node "$STEMPEL" "$O"
python3 - "$O/nachweis.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); d["kit"]["version"] = "von Hand"
json.dump(d, open(sys.argv[1], "w"), indent=2)
PY
abgewiesen '(c) Nachweis von Hand geändert' "$(packe "$O")" siegel 'von Hand verändert'

O=$(grundpaket kennung)
node "$STEMPEL" "$O"
verbiege "$O" 'd["app"] = "eine-andere-app"'
abgewiesen '(c) Nachweis einer anderen App' "$(packe "$O")" kennung 'Der Nachweis gehört zu'

O=$(grundpaket ohne-plan)
node "$STEMPEL" "$O"
verbiege "$O" 'd["schritte"] = [s for s in d["schritte"] if s["name"] != "interview"]'
abgewiesen '(c) ohne Plan (kein interview)' "$(packe "$O")" schritt-fehlt 'Im Ablauf fehlt: interview'

O=$(grundpaket ohne-tests)
node "$STEMPEL" "$O"
verbiege "$O" 'd["tests"] = {"vorhanden": False, "dateien": 0, "faelle": 0}'
abgewiesen '(b) keine Tests' "$(packe "$O")" tests-fehlen 'Die App bringt keine Tests mit.'

O=$(grundpaket tests-rot)
node "$STEMPEL" "$O"
verbiege "$O" 'd["tests"]["lauf"]["gruen"] = False'
abgewiesen '(b) Tests rot' "$(packe "$O")" tests-rot 'Der letzte Testlauf war nicht grün.'

O=$(grundpaket alte-bibliothek)
python3 - "$O/app.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])); m["marken"] = "4.1.0"
json.dump(m, open(sys.argv[1], "w"), indent=2)
PY
node "$STEMPEL" "$O"
abgewiesen '(a) Bibliothek in einer nicht mehr getragenen Fassung' "$(packe "$O")" \
  bibliothek-alt 'Die App steht auf der Bibliothek 4.1.0'

O=$(grundpaket ohne-bibliothek)
python3 - "$O/app.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])); m.pop("marken")
json.dump(m, open(sys.argv[1], "w"), indent=2)
PY
# Ohne den Stempel, der `marken` ergaenzen wuerde: der Nachweis von Hand.
node "$STEMPEL" "$O"
python3 - "$O/app.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])); m.pop("marken")
json.dump(m, open(sys.argv[1], "w"), indent=2)
PY
abgewiesen '(a) Bibliothek nicht genannt' "$(packe "$O")" bibliothek-fehlt \
  'keine Fassung der Bibliothek'

O="$ARBEIT/fremd"
mkdir -p "$O"
python3 - "$O/app.json" "$APP" <<'PY'
import json, sys
json.dump({"schema": 1, "id": sys.argv[2], "name": "Fremder Container", "version": "1.0.0",
           "backend": {"image": "nginx:alpine"}, "ports": {"backend": 80}},
          open(sys.argv[1], "w"), indent=2)
PY
abgewiesen 'Fremder Container (kein Frontend, fertiges Image)' "$(packe "$O")" \
  fremder-container 'fremder Container'

schluessel_ruf GET "/api/v1/external/apps/$APP"
pruefe 'Nach allen Abweisungen gibt es die Probe-App nicht' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"

# --- 3. Ein gueltiges Paket --------------------------------------------------
O=$(grundpaket gueltig)
node "$STEMPEL" "$O"
paket_ruf "$(packe "$O")"
pruefe 'Ein Paket mit gültigem Nachweis geht durch' "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
[ "$CODE" != 201 ] && rumpf && echo
pruefe '  in den Teststand' "$(ja_wenn "$(rumpf | feld data.stand)" test)"
schluessel_ruf GET "/api/v1/external/apps/$APP"
pruefe '  und erfüllt dort den Standard' \
  "$(ja_wenn "$(rumpf | feld data.staende.test.standard.erfuellt)" true)" \
  "$(rumpf | feld data.staende.test.standard)"

# --- 4. Was schon am Geraet liegt --------------------------------------------
# Auskunft, keine Pruefung auf erfuellt: die Pruefung greift beim Ausrollen,
# und was vorher kam, laeuft weiter. Gemessen wird, dass jede App ein Urteil
# traegt und weiter lieferbar ist.
echo
echo '--- Apps am Gerät (Auskunft) ---'
# Die Kennungen kommen vom Geraet (`GET /api/apps` mit der Sitzung), nicht aus
# diesem Skript: es steht keine App eines Kunden in einem oeffentlichen Repo.
AUSKUNFT="${ARASUL_STANDARD_AUSKUNFT:-}"
if [ -z "$AUSKUNFT" ] && [ -n "$TOK" ]; then
  AUSKUNFT=$(curl -sk --max-time 60 -H "authorization: Bearer $TOK" "$BASIS/api/apps" |
    python3 -c 'import sys,json
try: print(" ".join(a["id"] for a in json.load(sys.stdin)["data"] if a["id"] != sys.argv[1]))
except Exception: print("")' "$APP")
fi
pruefe 'Die Liste der Apps am Gerät liegt vor' "$([ -n "$AUSKUNFT" ] && echo ja || echo nein)" \
  "$(wc -w <<<"$AUSKUNFT" | tr -d ' ') Apps"
for app in $AUSKUNFT; do
  schluessel_ruf GET "/api/v1/external/apps/$app"
  [ "$CODE" = 200 ] || { printf '       %-22s nicht da (HTTP %s)\n' "$app" "$CODE"; continue; }
  for stand in live test; do
    urteil=$(rumpf | feld "data.staende.$stand.standard")
    [ -z "$urteil" ] && continue
    lieferbar=$(rumpf | feld "data.staende.$stand.lieferbar")
    printf '       %-22s %-4s %s\n' "$app" "$stand" "$(printf '%s' "$urteil" | python3 -c 'import sys,json
u = json.load(sys.stdin)
print("ausgenommen" if u["ausgenommen"] else "erfüllt den Standard" if u["erfuellt"]
      else "fehlt: " + ", ".join(f["code"] for f in u["funde"]))')"
    pruefe "  $app $stand trägt ein Urteil und bleibt lieferbar" "$(ja_wenn "$lieferbar" true)"
  done
done

echo
echo "=== $gruen grün, $rot rot ==="
[ "$rot" -eq 0 ]
