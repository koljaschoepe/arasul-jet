#!/bin/bash
# =============================================================================
# Abnahme des Deploy-Endpunkts, Phase C5 des Umbaus vom 26.08.2026
# =============================================================================
# Die Messregel der Phase: "curl deployt die Beispielapp, Version erscheint in
# apps." Genau das misst dieses Skript, und zwar VOLLSTAENDIG UEBER DIE EXTERNE
# API -- mit einem Schluessel und ohne Sitzung, so wie das Ara-Kit es tut:
#
#   GET    /api/v1/external/contract          was dieses Geraet verspricht
#   POST   /api/v1/external/apps              Paket rein, rollt in den Teststand
#   GET    /api/v1/external/apps/<id>         welche Version wo steht
#   POST   /api/v1/external/apps/<id>/schalten   live, und wieder zurueck
#   DELETE /api/v1/external/apps/<id>         weg, nach Rueckfrage
#
# ES WIRD NICHT DIE BEISPIELAPP SELBST EINGESPIELT, sondern ihr Inhalt unter
# einer eigenen Kennung (`beispielapp-deploy`). Zwei Gruende, und beide sind
# praktisch: die C3/C4-Abnahmen brauchen `beispielapp` eingespielt und laufend,
# und dieses Skript raeumt am Ende alles weg, was es angelegt hat -- unter
# derselben Kennung waere das ihr Ende. Ausserdem weist der Deploy eine
# Version ab, die gerade LIVE ist (neue Fassung, neue Nummer), und genau das
# waere `beispielapp 1.0.0` nach der C3-Abnahme.
#
# DER SCHLUESSEL. Vorzugsweise steckt er in `ARASUL_KIT_SCHLUESSEL` -- dann
# geht dieses Skript keinen einzigen Schritt ueber eine Sitzung, so wie das Kit
# im Feld. Ohne ihn meldet es sich einmal als Administrator an, legt sich einen
# Wegwerf-Schluessel an und widerruft ihn am Ende; das ist derselbe Weg, den
# `scripts/util/kit-schluessel.sh` am Geraet geht, nur ueber die Schnittstelle.
#
# Aufruf vom Arbeitsrechner ueber einen SSH-Tunnel:
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_PASSWORT=... bash scripts/test/deploy-abnahme.sh
#
# Auf dem Geraet:
#   ARASUL_URL=https://localhost bash scripts/test/deploy-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/beispielapp"
APP="${ARASUL_DEPLOY_APP:-beispielapp-deploy}"
V1="1.0.0"
V2="1.0.1"

# Der Bau des Images passiert AM GERAET und haengt an dem einen Aufruf, der das
# Paket schickt. Beim ersten Mal laedt Docker dafuer ein Basis-Image; auf einem
# Jetson an einer maessigen Leitung ist alles unter zehn Minuten geraten.
GEDULD=900

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

# Ein Aufruf, zwei Ergebnisse: `$CODE` und der Rumpf in `$RUMPF_DATEI`.
# Bewusst ohne Rueckgabe ueber die Standardausgabe -- eine Kommandosubstitution
# waere eine Subshell, und `$CODE` waere beim naechsten Befehl wieder weg
# (Falle aus der Messung zu C2).
RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""
schluessel_ruf() {
  local verb="$1" pfad="$2" leib="${3:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD"
    -H "x-api-key: $SCHLUESSEL")
  if [ -n "$leib" ]; then
    argumente+=(-H 'content-type: application/json' -d "$leib")
  fi
  CODE=$(curl "${argumente[@]}" "$BASIS$pfad")
}
paket_ruf() {
  local pfad="$1" datei="$2"
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$datei" "$BASIS$pfad")
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }

feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    if isinstance(d, dict): d = d.get(k)
    else: d = None
    if d is None: break
print("" if d is None else (d if isinstance(d,(str,int,float)) else json.dumps(d)))' "$1" 2>/dev/null
}

# --- Das Paket bauen ---------------------------------------------------------
# Der Inhalt der Beispielapp, mit getauschter Kennung, Version und Image-Name.
# Der Image-Name muss mit: sonst baute das Geraet unter `arasul-beispielapp:1.0.0`
# und ueberschriebe das Image der App, die die C3-Abnahme laufen laesst.
baue_paket() {
  local version="$1" ordner="$ARBEIT/paket-$version"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/frontend" "$QUELLE/backend" "$ordner/"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$version" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Beispielapp (Deploy-Abnahme)"
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  # COPYFILE_DISABLE: BSD-tar auf macOS legt sonst zu jeder Datei einen
  # `._`-Begleiter mit erweiterten Attributen ins Archiv. Das Geraet weist ihn
  # nicht ab (es sind gewoehnliche Dateien), aber sie landen im Frontend und
  # werden ausgeliefert.
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket-$version.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/paket-$version.tgz"
}

if ! nc -z "$(echo "$BASIS" | sed -E 's#https?://##; s#:.*##')" "$(echo "$BASIS" | sed -E 's#.*:##')" 2>/dev/null; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme des Deploy-Endpunkts (Phase C5) gegen $BASIS ==="
echo

# --- 1. Der Schluessel -------------------------------------------------------
SCHLUESSEL="${ARASUL_KIT_SCHLUESSEL:-}"
ENG_SCHLUESSEL=""   # einer OHNE app:deploy, fuer die Gegenprobe
KEY_ID=""
ENG_KEY_ID=""
TOK=""

aufraeumen() {
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  # Die App weg, falls eine Pruefung vor dem DELETE gescheitert ist. Ohne
  # Rueckfrage geht das nicht -- auch fuer dieses Skript nicht.
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 60 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
  fi
  [ -z "$TOK" ] && return
  local k
  for k in $KEY_ID $ENG_KEY_ID; do
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$k"
  done
  printf 'aufgeraeumt  App entfernt, Wegwerf-Schluessel widerrufen\n'
}
trap aufraeumen EXIT

if [ -n "$SCHLUESSEL" ]; then
  pruefe 'Schluessel aus ARASUL_KIT_SCHLUESSEL' ja "${SCHLUESSEL:0:12}…"
else
  TOK=$(arasul_token)
  pruefe 'Anmeldung als Administrator (nur um Schluessel anzulegen)' \
    "$([ -n "$TOK" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"
  [ -z "$TOK" ] && { echo; echo "Ohne Anmeldung und ohne ARASUL_KIT_SCHLUESSEL gibt es nichts zu messen."; exit 1; }

  neuer_schluessel() {
    curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
      -H 'content-type: application/json' -d "$1" "$BASIS/api/v1/external/api-keys"
  }
  ANTWORT=$(neuer_schluessel '{"name":"Abnahme C5 (deploy)","allowed_endpoints":["app:deploy"]}')
  SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
  KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
  pruefe 'Ein Schluessel mit dem Bereich app:deploy entsteht' \
    "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)" "${SCHLUESSEL:0:12}…"
  [ -z "$SCHLUESSEL" ] && { echo; echo "Ohne Schluessel gibt es nichts zu messen."; echo "$ANTWORT"; exit 1; }

  ANTWORT=$(neuer_schluessel '{"name":"Abnahme C5 (eng)","allowed_endpoints":["llm:status"]}')
  ENG_SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
  ENG_KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
fi

# --- 2. Der Kontrakt ---------------------------------------------------------
schluessel_ruf GET /api/v1/external/contract
pruefe 'GET /contract antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
KONTRAKT=$(rumpf | feld data.kontrakt)
pruefe 'Er traegt eine Kontraktversion' "$([ -n "$KONTRAKT" ] && echo ja || echo nein)" "kontrakt=$KONTRAKT"
SCHEMA_TYP=$(rumpf | feld data.app_json.schema.type)
pruefe 'app.json steht darin als JSON-Schema' "$(ja_wenn "$SCHEMA_TYP" object)" "type=$SCHEMA_TYP"
FLOW_TYP=$(rumpf | feld data.flow_frontmatter.schema.type)
pruefe 'Das Flow-Frontmatter ebenso' "$(ja_wenn "$FLOW_TYP" object)" "type=$FLOW_TYP"
KOPF=$(rumpf | feld data.koepfe.benutzer)
pruefe 'Die Kopfzeilennamen stehen darin' "$(ja_wenn "$KOPF" X-Arasul-User)" "benutzer=$KOPF"
ANZAHL=$(rumpf | python3 -c 'import sys,json
try: print(len(json.load(sys.stdin)["data"]["endpunkte"]))
except Exception: print(0)' 2>/dev/null)
pruefe 'Und die Endpunktliste ist nicht leer' \
  "$([ "${ANZAHL:-0}" -gt 0 ] && echo ja || echo nein)" "$ANZAHL Endpunkte"

# --- 3. Wer NICHT deployen darf ---------------------------------------------
# Die Zusage der Phase: ein Schluessel ohne `app:deploy` kommt hier nicht durch.
# Das gilt insbesondere fuer die Schluessel, die das Geraet den Apps selbst
# mitgibt (C4) -- keine App ersetzt eine andere.
if [ -n "$ENG_SCHLUESSEL" ]; then
  ENG_CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 -X DELETE \
    -H "x-api-key: $ENG_SCHLUESSEL" "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP")
  pruefe 'Ein Schluessel ohne app:deploy bekommt 403' "$(ja_wenn "$ENG_CODE" 403)" "HTTP $ENG_CODE"
fi

OHNE_CODE=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 30 \
  "$BASIS/api/v1/external/contract")
pruefe 'Ohne Schluessel gibt es auch keinen Kontrakt' "$(ja_wenn "$OHNE_CODE" 401)" "HTTP $OHNE_CODE"

# --- 4. Das Paket -----------------------------------------------------------
PAKET1=$(baue_paket "$V1")
pruefe "Paket $V1 gebaut" "$([ -n "$PAKET1" ] && echo ja || echo nein)" "$(basename "${PAKET1:-—}")"
[ -z "$PAKET1" ] && { echo; echo "Ohne Paket gibt es nichts zu schicken."; exit 1; }

# Ein Archiv mit einem Symlink darf nicht durchgehen: er koennte aus dem
# Zielordner herauszeigen, und Arasul liefert das Frontend anschliessend jedem
# Freigegebenen aus. Das Manifest darin traegt DIESE Kennung -- sollte die
# Pruefung eines Tages nicht mehr greifen, faellt der Fehlschlag auf die App
# dieser Abnahme und nicht auf eine fremde.
mkdir -p "$ARBEIT/boese"
cp "$ARBEIT/paket-$V1/app.json" "$ARBEIT/boese/app.json"
ln -sf /etc/hostname "$ARBEIT/boese/verweis"
COPYFILE_DISABLE=1 tar czf "$ARBEIT/boese.tgz" -C "$ARBEIT/boese" . 2>/dev/null
paket_ruf /api/v1/external/apps "$ARBEIT/boese.tgz"
pruefe 'Ein Paket mit einem Symlink wird abgewiesen' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"

# --- 5. Der Deploy -----------------------------------------------------------
paket_ruf /api/v1/external/apps "$PAKET1"
pruefe "POST /apps spielt $APP $V1 ein" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
if [ "$CODE" != "201" ]; then
  echo
  echo "Antwort des Geraets:"
  rumpf
  echo
fi
pruefe 'und zwar in den Teststand, ungefragt' "$(ja_wenn "$(rumpf | feld data.stand)" test)" \
  "stand=$(rumpf | feld data.stand)"

schluessel_ruf GET "/api/v1/external/apps/$APP"
pruefe "GET /apps/$APP antwortet" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
pruefe "Die Version steht im Teststand" "$(ja_wenn "$(rumpf | feld data.staende.test.version)" "$V1")" \
  "test=$(rumpf | feld data.staende.test.version)"
pruefe 'Der Livestand ist noch leer' \
  "$(ja_wenn "$(rumpf | feld data.staende.live.version)" '')" \
  "live=$(rumpf | feld data.staende.live.version)"
LAEUFT=$(rumpf | python3 -c 'import sys,json
try:
    d = json.load(sys.stdin)["data"]["staende"]["test"]["backend"] or {}
    print("ja" if d.get("laeuft") else "nein")
except Exception: print("nein")' 2>/dev/null)
pruefe 'Das am Geraet gebaute Backend laeuft' "${LAEUFT:-nein}" "laeuft=$LAEUFT"

# --- 6. Der Schalter ---------------------------------------------------------
schluessel_ruf POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe 'Schalten nach live' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
schluessel_ruf GET "/api/v1/external/apps/$APP"
pruefe "Livestand ist jetzt $V1" "$(ja_wenn "$(rumpf | feld data.staende.live.version)" "$V1")" \
  "live=$(rumpf | feld data.staende.live.version)"

schluessel_ruf POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"zurueck"}'
pruefe 'Zurueck ohne vorige Version ist ein sauberes Nein' "$(ja_wenn "$CODE" 409)" "HTTP $CODE"

# --- 7. Die zweite Fassung, und der Weg zurueck ------------------------------
PAKET2=$(baue_paket "$V2")
paket_ruf /api/v1/external/apps "$PAKET2"
pruefe "POST /apps spielt $V2 ein" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"

schluessel_ruf POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
pruefe "Schalten nach live ($V2)" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
schluessel_ruf GET "/api/v1/external/apps/$APP"
pruefe "Livestand ist $V2" "$(ja_wenn "$(rumpf | feld data.staende.live.version)" "$V2")" \
  "live=$(rumpf | feld data.staende.live.version)"
pruefe "Und das Geraet weiss, dass vorher $V1 lief" \
  "$(ja_wenn "$(rumpf | feld data.staende.live.vorige_version)" "$V1")" \
  "vorige=$(rumpf | feld data.staende.live.vorige_version)"

schluessel_ruf POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"zurueck"}'
pruefe 'Schalten zurueck' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
schluessel_ruf GET "/api/v1/external/apps/$APP"
pruefe "Livestand ist wieder $V1" "$(ja_wenn "$(rumpf | feld data.staende.live.version)" "$V1")" \
  "live=$(rumpf | feld data.staende.live.version)"

# Eine Version, die gerade live ist, wird nicht ueberschrieben: neue Fassung,
# neue Nummer. Sonst tauschte ein Deploy die Seite, mit der gerade jemand
# arbeitet, ohne dass ein Mensch geschaltet haette.
paket_ruf /api/v1/external/apps "$PAKET1"
pruefe 'Dieselbe Nummer noch einmal, waehrend sie live ist: 409' "$(ja_wenn "$CODE" 409)" "HTTP $CODE"

# --- 8. Die Rueckfrage vor dem Entfernen ------------------------------------
schluessel_ruf DELETE "/api/v1/external/apps/$APP"
pruefe 'DELETE ohne Rueckfrage wird abgewiesen' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"

schluessel_ruf DELETE "/api/v1/external/apps/$APP?bestaetigung=falsch"
pruefe 'DELETE mit falscher Rueckfrage ebenso' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"

schluessel_ruf DELETE "/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
pruefe 'DELETE mit Rueckfrage entfernt die App' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"

schluessel_ruf GET "/api/v1/external/apps/$APP"
pruefe 'Danach kennt das Geraet sie nicht mehr' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
