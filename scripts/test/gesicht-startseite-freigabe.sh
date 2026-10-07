#!/bin/bash
# =============================================================================
# Eine offene Freigabe für die Bilder der Startseite (M5, jet-gesicht-startseite)
# =============================================================================
# Das Band der Startseite zeigt „Eine Freigabe wartet auf Sie" nur, wenn eine
# wartet. Dieses Skript legt dafür eine Wegwerf-Probe an, lässt den Befehl in
# `ARASUL_ZWISCHEN` laufen (die Bilder) und räumt danach alles wieder weg:
#
#   1. Wegwerf-Schlüssel (app:deploy) für probe-admin, Paket aus
#      `tests/probe-zeitplan` mit NUR dem Flow `warten` (jede Minute, hält an
#      einer Freigabe), live schalten.
#   2. Die App probe-admin und dem Mitarbeiter freigeben, so liegt die
#      Freigabe bei beiden.
#   3. Auf den ersten Lauf warten, der an der Freigabe hält, dann den Zeitplan
#      pausieren: es bleibt genau eine.
#   4. ARASUL_ZWISCHEN ausführen.
#   5. Lauf abbrechen, App samt Image und Ordner entfernen, Schlüssel
#      widerrufen (auch bei Abbruch, `trap`).
#
# Der Lauf gehört dem Konto, das den Schlüssel des Livestands angelegt hat,
# also probe-admin; nie `admin`, das ist ein echtes Konto.
#
#   ARASUL_URL=https://100.121.244.80 ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   ARASUL_MITARBEITER=probe-j36-a ARASUL_GERAET=arasul@100.121.244.80 \
#   ARASUL_ZWISCHEN='node scripts/test/gesicht-startseite-bilder.mjs' \
#     bash scripts/test/gesicht-startseite-freigabe.sh
#
# Rückgabe: die von ARASUL_ZWISCHEN, oder 1, wenn die Probe nicht zustande kam.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-zeitplan"
APP="${ARASUL_GESICHT_APP:-probe-gesicht-fg-$(date +%m%d)}"
VERSION="1.0.0"
GERAET="${ARASUL_GERAET:-}"
MITARBEITER="${ARASUL_MITARBEITER:-probe-j36-a}"
ZWISCHEN="${ARASUL_ZWISCHEN:-true}"

if [ "${ARASUL_BENUTZER:-}" = "admin" ] || [ "$MITARBEITER" = "admin" ]; then
  echo "Nie das Konto admin: das ist ein echtes Konto."
  exit 1
fi
[ -z "$GERAET" ] && { echo "ARASUL_GERAET fehlt (ssh-Ziel, um den Lauf zu finden)."; exit 1; }

RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""
ruf() {
  local wer="$1" verb="$2" pfad="$3" leib="${4:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time 600)
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
    d = d.get(k) if isinstance(d, dict) else None
    if d is None: break
print("" if d is None else d)' "$1" 2>/dev/null
}
db() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" \
    "docker exec -i postgres-db psql -U arasul -d arasul_db -At -v ON_ERROR_STOP=1" <<<"$1" 2>/dev/null
}
benutzer_id() {
  ruf "$TOK" GET /api/benutzer
  rumpf | python3 -c 'import sys,json; print(next((str(b["id"]) for b in json.load(sys.stdin)["data"] if b["username"]==sys.argv[1]), ""))' "$1"
}

TOK=$(arasul_token)
[ -z "$TOK" ] && { echo "Anmeldung als ${ARASUL_BENUTZER:-?} gescheitert."; exit 1; }
SCHLUESSEL=""
KEY_ID=""
FREIGEGEBEN=""
aufraeumen() {
  if [ -n "$SCHLUESSEL" ]; then
    curl -sk -o /dev/null --max-time 30 -X PUT -H "authorization: Bearer $TOK" \
      -H 'content-type: application/json' -d '{"pausiert":true}' \
      "$BASIS/api/apps/$APP/flows/warten/zeitplan"
    for id in $(db "SELECT id FROM flow_runs WHERE app_id = '$APP' AND status IN ('laeuft','wartend');"); do
      curl -sk -o /dev/null --max-time 30 -X POST -H "authorization: Bearer $TOK" \
        "$BASIS/api/laeufe/$id/abbrechen"
    done
    for b in $FREIGEGEBEN; do
      curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
        "$BASIS/api/freigaben/$APP/$b"
    done
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$APP?bestaetigung=$APP&dateien=true"
    echo "aufgeräumt: $APP entfernt"
  fi
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Bilder Startseite ($APP)\",\"allowed_endpoints\":[\"app:deploy\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
[ -z "$SCHLUESSEL" ] && { echo "kein Schlüssel: $ANTWORT"; exit 1; }

ordner="$ARBEIT/paket"
mkdir -p "$ordner/flows"
cp -R "$QUELLE/backend" "$QUELLE/frontend" "$ordner/"
cat >"$ordner/flows/warten.md" <<'FLOW'
---
name: warten
beschreibung: Hält jede Minute an einer Freigabe, damit die Startseite eine offene zeigt.
ausloeser:
  - typ: zeitplan
    zeitplan: '* * * * *'
werkzeuge: [freigabe_anfordern]
schritte:
  - name: freigeben
    typ: werkzeug
    werkzeug: freigabe_anfordern
    parameter:
      titel: Rechnung Bürobedarf freigeben
      zusammenhang: Die Rechnung über 184,20 Euro liegt über der Grenze für Bestellungen ohne Freigabe.
      frist_minuten: 60
grenzen:
  zeitlimit_s: 120
---

Die Rechnung ist freigegeben worden. Schreibe genau einen Satz.
FLOW
python3 - "$QUELLE/app.json" "$ordner/app.json" "$APP" "$VERSION" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"], m["version"] = kennung, version
m["name"] = "Einkauf"
m["beschreibung"] = "Probe für die Bilder der Startseite: hält an einer Freigabe."
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
COPYFILE_DISABLE=1 tar czf "$ARBEIT/paket.tgz" -C "$ordner" .
CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time 900 \
  -H "x-api-key: $SCHLUESSEL" -F "paket=@$ARBEIT/paket.tgz" "$BASIS/api/v1/external/apps")
echo "eingespielt: HTTP $CODE"
[ "$CODE" != 201 ] && { rumpf; echo; exit 1; }
ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$APP/schalten" '{"ziel":"live"}'
echo "live: HTTP $CODE"

for name in "$ARASUL_BENUTZER" "$MITARBEITER"; do
  id=$(benutzer_id "$name")
  [ -z "$id" ] && { echo "$name nicht gefunden"; exit 1; }
  ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$APP\",\"benutzer_id\":$id}"
  [[ "$CODE" =~ ^20[01]$ ]] && FREIGEGEBEN="$FREIGEGEBEN $id"
  echo "freigegeben für $name: HTTP $CODE"
done

ende=$((SECONDS + 300))
LAUF=""
while [ "$SECONDS" -lt "$ende" ]; do
  LAUF=$(db "SELECT id FROM flow_runs WHERE app_id = '$APP' AND status = 'wartend' ORDER BY id LIMIT 1;")
  [ -n "$LAUF" ] && break
  sleep 10
done
[ -z "$LAUF" ] && { echo "kein Lauf hält an der Freigabe (5 Minuten gewartet)"; exit 1; }
ruf "$TOK" PUT "/api/apps/$APP/flows/warten/zeitplan" '{"pausiert":true}'
echo "Lauf $LAUF wartet auf eine Freigabe, Zeitplan pausiert: HTTP $CODE"

bash -c "$ZWISCHEN"
ergebnis=$?
exit "$ergebnis"
