#!/bin/bash
# =============================================================================
# Abnahme „Die Bibliothek misst den Behaelter" (J35, 26.09.2026)
# =============================================================================
# Eine App im Rahmen des Geraets teilt ihr Fenster mit der eigenen
# Seitenleiste. Bis 5.0.1 fragte die Datenliste das Fenster, und
# `SidebarInset` wuchs mit seinem Inhalt: am Orin stand eine Tabelle bei
# 1052 px Rahmen 100 px ueber dem Rand. Gemessen wird mit einer App aus der
# VORLAGE DES ARA-KITS, denn dort baut ein Partner seine erste App:
#
#   BAUEN    die Vorlage aus `$ARASUL_KIT/.ara/templates/app`, der Spiegel
#            `src/marken` ersetzt durch `packages/marken/src` dieses Stands --
#            und mit ARASUL_VORHER=<git-ref> eine zweite App aus dem Stand
#            davor, damit das Vorher im selben Lauf danebensteht
#   EINSPIELEN  ueber den Deploy-Weg aus C5, live, dem Administrator
#            freigegeben; acht Vorgaenge mit langen, unteilbaren Woertern
#            (ein Dateiname mit Unterstrichen, eine Adresse) direkt in die
#            Datenbank der App -- ueber die App eingereicht, starteten sie
#            den Flow `freigabe` und legten Anfragen auf die Uebersicht
#   MESSEN   `behaelter-bilder.mjs`: Rahmenbreiten 900, 1000 und 1150 px,
#            je mit und ohne Notizspalte -- im Rahmen scrollWidth gegen
#            clientWidth, Bilder fuer den PR
#
# WAS ES ANLEGT, RAEUMT ES WEG: die Probe-Apps (samt Datenbank, Freigaben und
# Image) und den Wegwerf-Schluessel. Andere Apps am Geraet fasst es nicht an.
#
# Aufruf:
#   ARASUL_URL=https://192.168.0.197 ARASUL_BENUTZER=admin ARASUL_PASSWORT=... \
#   ARASUL_GERAET=arasul@192.168.0.197 ARASUL_VORHER=origin/main \
#   bash scripts/test/behaelter-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung des NACHHER gruen war, sonst 1. Das Vorher
# darf rot sein, dafuer steht es da.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
KIT="${ARASUL_KIT:-$HOME/Code/arasul/ara-kit}"
VORLAGE="$KIT/.ara/templates/app"
GERAET="${ARASUL_GERAET:-}"
VORHER="${ARASUL_VORHER:-}"
GEDULD=900

APP_NEU="probe-behaelter-neu"
APP_ALT="probe-behaelter-alt"

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

feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k) if isinstance(d, dict) else None
    if d is None: break
print("" if d is None else d)' "$1" 2>/dev/null
}

[ -d "$VORLAGE" ] || { echo "Keine Vorlage unter $VORLAGE (ARASUL_KIT setzen)."; exit 1; }
[ -n "$GERAET" ] || { echo "ARASUL_GERAET fehlt -- die Vorgaenge kommen ueber SSH in die Datenbank."; exit 1; }
arasul_geraet_erreichbar "$BASIS" || { echo "Kein Geraet unter $BASIS."; exit 1; }

ARBEIT="$(mktemp -d)"
RUMPF="$ARBEIT/rumpf"
SCHLUESSEL=""
KEY_ID=""
APPS=()

# baue <app-id> <marken-quelle> -> Pfad des Pakets
baue() {
  local id="$1" marken="$2" ordner="$ARBEIT/$1"
  local fassung
  fassung=$(sed -n "s/^export const FASSUNG = '\(.*\)';/\1/p" "$marken/fassung.ts")
  cp -R "$VORLAGE" "$ordner"
  find "$ordner" -type f \( -name '*.json' -o -name '*.ts' -o -name '*.tsx' -o -name '*.md' -o -name '*.mjs' -o -name '*.html' \) \
    -not -path '*/node_modules/*' -print0 |
    xargs -0 perl -pi -e "s/\{\{id\}\}/$id/g; s/\{\{name\}\}/Probe Behaelter ${id##*-}/g; s/\{\{beschreibung\}\}/Messung J35/g; s/\{\{marken\}\}/$fassung/g; s/\{\{datum\}\}/$(date +%d.%m.%Y)/g"
  rm -rf "$ordner/frontend/src/marken"
  mkdir -p "$ordner/frontend/src/marken"
  (cd "$marken" && tar cf - --exclude __tests__ .) | (cd "$ordner/frontend/src/marken" && tar xf -)
  # Seit 5.0.0 liegt das Diagramm unter `@marken/diagramm`; die Vorlage kennt
  # nur `@marken`. Der Vite-Alias deckt beides, `tsc` braucht den Pfad.
  python3 - "$ordner/frontend/tsconfig.json" <<'PY'
import re, sys
p = sys.argv[1]
s = open(p).read()
s = s.replace('"paths": { "@marken": ["./src/marken/index.ts"] }',
              '"paths": { "@marken": ["./src/marken/index.ts"], "@marken/*": ["./src/marken/*"] }')
open(p, "w").write(s)
PY
  if [ -d "$ARBEIT/node_modules" ]; then
    ln -s "$ARBEIT/node_modules" "$ordner/frontend/node_modules"
  else
    (cd "$ordner/frontend" && npm install --no-audit --no-fund --loglevel=error >/dev/null) || return 1
    mv "$ordner/frontend/node_modules" "$ARBEIT/node_modules"
    ln -s "$ARBEIT/node_modules" "$ordner/frontend/node_modules"
  fi
  (cd "$ordner/frontend" && npm run build --silent >"$ARBEIT/$id-bau.log" 2>&1) || {
    tail -20 "$ARBEIT/$id-bau.log" >&2
    return 1
  }
  local paket="$ARBEIT/$id-paket"
  mkdir -p "$paket"
  cp "$ordner/app.json" "$paket/"
  cp -R "$ordner/flows" "$paket/"
  cp -R "$ordner/frontend/dist" "$paket/frontend"
  (cd "$ordner/backend" && tar cf - --exclude node_modules .) | (mkdir -p "$paket/backend" && cd "$paket/backend" && tar xf -)
  cp "$ordner/app.json" "$paket/backend/app.json"
  echo "$paket"
}

# Was das Kit beim Einspielen tut: `backend/arasul.json` aus dem Kontrakt des
# Geraets fuellen. Ohne `umgebung.datenbank` schriebe die Vorlage in eine
# SQLite-Datei im Container, und die Vorgaenge landeten nie in der Datenbank.
packe() {
  local paket="$1"
  python3 - "$paket/backend/arasul.json" "$KONTRAKT" <<'PY' || return 1
import json, sys
p, kontrakt = sys.argv[1], json.loads(open(sys.argv[2]).read())["data"]
d = json.load(open(p))
u = kontrakt.get("umgebung") or {}
for feld in ("basis", "schluessel", "datenbank", "praefix"):
    if feld in u:
        d["umgebung"][feld] = u[feld]
k = kontrakt.get("koepfe") or {}
d["koepfe"] = {"benutzer": k.get("benutzer"), "rolle": k.get("rolle"), "rollen": k.get("rollen") or []}
d["kontrakt"] = kontrakt.get("version")
json.dump(d, open(p, "w"), ensure_ascii=False, indent=2)
PY
  COPYFILE_DISABLE=1 tar czf "$paket.tgz" -C "$paket" . || return 1
  echo "$paket.tgz"
}

aufraeumen() {
  for id in "${APPS[@]}"; do
    curl -sk -o /dev/null --max-time 300 -X DELETE -H "x-api-key: $SCHLUESSEL" \
      "$BASIS/api/v1/external/apps/$id?bestaetigung=$id&dateien=true"
  done
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  %s entfernt, Wegwerf-Schluessel widerrufen\n' "${APPS[*]:-keine App}"
}

echo "=== Abnahme Bibliothek misst den Behaelter (J35) gegen $BASIS ==="
echo

# --- 1. Bauen ------------------------------------------------------------------
PAKET_NEU=$(baue "$APP_NEU" "$WURZEL/packages/marken/src")
pruefe "$APP_NEU aus der Kit-Vorlage gebaut" "$([ -d "$PAKET_NEU" ] && echo ja || echo nein)"
[ -d "$PAKET_NEU" ] || { rm -rf "$ARBEIT"; exit 1; }
PAKET_ALT=""
if [ -n "$VORHER" ]; then
  mkdir -p "$ARBEIT/vorher"
  git -C "$WURZEL" archive "$VORHER" packages/marken/src | tar xf - -C "$ARBEIT/vorher"
  PAKET_ALT=$(baue "$APP_ALT" "$ARBEIT/vorher/packages/marken/src")
  pruefe "$APP_ALT aus $VORHER gebaut" "$([ -d "$PAKET_ALT" ] && echo ja || echo nein)"
fi

# --- 2. Zugaenge ---------------------------------------------------------------
TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)"
[ -z "$TOK" ] && { rm -rf "$ARBEIT"; exit 1; }
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme J35 (Bibliothek misst den Behaelter)","allowed_endpoints":["app:deploy"]}' \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && exit 1
KONTRAKT="$ARBEIT/kontrakt.json"
curl -sk --max-time 30 -H "x-api-key: $SCHLUESSEL" "$BASIS/api/v1/external/contract" >"$KONTRAKT"
pruefe 'Kontrakt gelesen (umgebung.datenbank)' \
  "$([ -n "$(feld data.umgebung.datenbank <"$KONTRAKT")" ] && echo ja || echo nein)" "$(feld data.umgebung.datenbank <"$KONTRAKT")"

ICH=$(curl -sk --max-time 30 -H "authorization: Bearer $TOK" "$BASIS/api/benutzer" |
  python3 -c 'import sys,json; print(next((str(b["id"]) for b in json.load(sys.stdin)["data"] if b["username"]==sys.argv[1]), ""))' "$ARASUL_BENUTZER")

# --- 3. Einspielen, live, freigeben, fuellen -----------------------------------
# Die Vorgaenge: lange Titel, und je einer mit einem Wort, das nicht bricht --
# ein Dateiname und eine Adresse, wie sie in einer Kanzlei wirklich stehen.
FUELLUNG="INSERT INTO vorgaenge (titel, text, von, gestellt, status) VALUES
 ('Scan_Eingangsrechnung_Telekom_2026_09_Kanzlei_Schmidt_und_Partner.pdf', 'Beleg', 'buchhaltung.schmidt-partner@kanzlei-beispiel.de', '2026-09-26T08:12:00Z', 'wartet'),
 ('Reisekostenabrechnung Mandantentermin Muenchen mit Hotel und Bahn', 'Beleg', 'probe-0925-mitarbeiter', '2026-09-25T15:40:00Z', 'genehmigt'),
 ('Anschaffung eines hoehenverstellbaren Schreibtisches fuer das Sekretariat', 'Antrag', 'probe-0925-zwei', '2026-09-25T09:05:00Z', 'abgelehnt'),
 ('Fortbildung Umsatzsteuer_Update_2027_Seminar_Steuerberaterkammer', 'Antrag', 'probe-0925-mitarbeiter', '2026-09-24T11:30:00Z', 'wartet'),
 ('Softwarelizenz Verlaengerung', 'Antrag', 'admin', '2026-09-23T10:00:00Z', 'abgelaufen'),
 ('Druckerpapier', 'Antrag', 'probe-0925-zwei', '2026-09-22T13:15:00Z', 'genehmigt'),
 ('Mandantenakte_Archivierung_2019_bis_2021_Einlagerung_Aktenlager_Nord', 'Antrag', 'sekretariat.empfang@kanzlei-beispiel.de', '2026-09-21T16:45:00Z', 'ohne entscheidung'),
 ('Neue Telefonanlage', 'Antrag', 'admin', '2026-09-20T08:00:00Z', 'wartet');"

spiele_ein() {
  local id="$1" paket code db
  paket=$(packe "$2") || { pruefe "$id gepackt" nein; return 1; }
  code=$(curl -sk -o "$RUMPF" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$paket" "$BASIS/api/v1/external/apps")
  pruefe "$id in den Teststand" "$(ja_wenn "$code" 201)" "HTTP $code"
  [ "$code" = "201" ] || { cat "$RUMPF"; echo; return 1; }
  APPS+=("$id")
  code=$(curl -sk -o "$RUMPF" -w '%{http_code}' --max-time 300 -X POST -H "x-api-key: $SCHLUESSEL" \
    -H 'content-type: application/json' -d '{"ziel":"live"}' "$BASIS/api/v1/external/apps/$id/schalten")
  pruefe "$id live" "$(ja_wenn "$code" 200)" "HTTP $code"
  code=$(curl -sk -o "$RUMPF" -w '%{http_code}' --max-time 30 -X POST -H "authorization: Bearer $TOK" \
    -H 'content-type: application/json' -d "{\"app_id\":\"$id\",\"benutzer_id\":$ICH}" "$BASIS/api/freigaben")
  pruefe "$id dem Administrator freigegeben" "$([[ "$code" =~ ^20[01]$ ]] && echo ja || echo nein)" "HTTP $code"
  local ende=$((SECONDS + 180))
  while [ "$SECONDS" -lt "$ende" ]; do
    code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 -H "authorization: Bearer $TOK" \
      "$BASIS/apps/$id/api/vorgaenge")
    [ "$code" = "200" ] && break
    sleep 3
  done
  pruefe "$id antwortet (die Tabelle steht)" "$(ja_wenn "$code" 200)" "HTTP $code"
  db="arasul_app_${id//-/_}_live"
  ssh -o BatchMode=yes -o ConnectTimeout=10 "$GERAET" \
    "docker exec -i postgres-db psql -q -v ON_ERROR_STOP=1 -U arasul -d $db" <<<"$FUELLUNG" >/dev/null
  local gefuellt=$?
  pruefe "$id mit acht Vorgaengen gefuellt" "$(ja_wenn "$gefuellt" 0)" "$db"
}

spiele_ein "$APP_NEU" "$PAKET_NEU" || exit 1
[ -n "$PAKET_ALT" ] && spiele_ein "$APP_ALT" "$PAKET_ALT"

# --- 4. Messen im Browser --------------------------------------------------------
ARASUL_URL="$BASIS" ARASUL_BENUTZER="$ARASUL_BENUTZER" ARASUL_PASSWORT="$ARASUL_PASSWORT" \
  ARASUL_APPS="$APP_NEU${PAKET_ALT:+ $APP_ALT}" ARASUL_PFLICHT="$APP_NEU" \
  node "$WURZEL/scripts/test/behaelter-bilder.mjs"
BROWSER=$?
pruefe 'Browser: jeder Rahmen des Nachher ohne Abschneiden' "$(ja_wenn "$BROWSER" 0)"

echo
echo "Ergebnis: $gruen gruen, $rot rot"
[ "$rot" -eq 0 ]
