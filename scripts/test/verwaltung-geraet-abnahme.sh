#!/bin/bash
# =============================================================================
# Abnahme M5: Verwaltung Gerät und System
# =============================================================================
# Die Abnahme des Auftrags verwaltung-geraet-und-system (04.10.2026). Gemessen
# wird am laufenden Geraet, was die Wege hinter den Bereichen System und Geraet
# tun (der Browser-Teil steht in `verwaltung-geraet-bilder.mjs`):
#
#   SYSTEM       `GET /api/ops/overview` liefert Zustand, Saetze und die drei
#                Zahlen (Prozessor, Speicher, Platte), aus denen die Seite ihren
#                Satz und ihre Kennzahlen baut.
#   UNTERNEHMEN  Name und Logo werden VORHER gelesen, fuer die Messung geaendert
#                und danach EXAKT zurueckgesetzt (auch bei Abbruch, `trap`):
#                Name ueber `PUT /api/settings/firmenname`, Logo ueber
#                `PUT/DELETE /api/settings/logo`. Gemessen: `needs-setup` nennt
#                Name und Stand des Logos, `GET /api/darstellung/logo` liefert
#                dieselben Bytes als image/png mit `nosniff`, ohne Anmeldung;
#                SVG, ein falsches PNG und mehr als 256 KB sind 400; ohne
#                Anmeldung schreibt niemand.
#   KI           `GET/PATCH /api/settings/sprachmodell` gibt es nicht mehr (404);
#                der Basis-Prompt in der Datenbank ist unberuehrt.
#   LIZENZ       wird NIE eingespielt oder geaendert. Gelesen: Stufe, Personen,
#                Fingerabdruck. Eine offensichtlich ungueltige Zeile wird
#                abgelehnt (400), und danach ist die Lizenz dieselbe wie vorher.
#   AKTUALISIERUNG wird NIE ausgeloest. Gelesen: `GET /api/update/fassung`; ein
#                Einspielen ohne Anmeldung wird abgewiesen.
#   FERNZUGRIFF  wird NIE aus- oder umgeschaltet (der Zugang zum Orin laeuft
#                darueber). Gelesen: verbunden, mit Adresse.
#
# Konten: nur das VORHANDENE Probekonto, nie `admin`:
#
#   ssh -f -N -L 8443:localhost:443 jetson
#   ARASUL_GERAET=jetson ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   bash scripts/test/verwaltung-geraet-abnahme.sh
#
# Dauer: unter einer Minute. Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
GERAET="${ARASUL_GERAET:-}"
STEMPEL="${ARASUL_STEMPEL:-$(date +%H%M%S)}"
PROBE_NAME="Probe Gerät 1004-$STEMPEL"

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

if [ -z "$GERAET" ]; then
  echo "ARASUL_GERAET fehlt (ssh-Ziel des Geraets, z. B. jetson): die Messung liest die Datenbank des Geraets."
  exit 1
fi
if [ "$ARASUL_BENUTZER" = "admin" ]; then
  echo "Nie das Konto admin: das ist ein echtes Konto. probe-admin nehmen."
  exit 1
fi

ARBEIT="$(mktemp -d)"
RUMPF_DATEI="$ARBEIT/rumpf"
KOPF_DATEI="$ARBEIT/kopf"
CODE=""

# ruf <token|ohne> <verb> <pfad> [leib-datei] -- setzt $CODE, Rumpf in $RUMPF_DATEI
ruf() {
  local wer="$1" verb="$2" pfad="$3" leib="${4:-}"
  local -a argumente=(-sk -o "$RUMPF_DATEI" -D "$KOPF_DATEI" -w '%{http_code}' -X "$verb" --max-time 60)
  case "$wer" in
    ohne) ;;
    *) argumente+=(-H "authorization: Bearer $wer") ;;
  esac
  [ -n "$leib" ] && argumente+=(-H 'content-type: application/json' --data-binary "@$leib")
  CODE=$(curl "${argumente[@]}" "$BASIS$pfad")
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }
kopf() { grep -i "^$1:" "$KOPF_DATEI" | head -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'; }
leib() { printf '%s' "$1" >"$ARBEIT/leib.json"; echo "$ARBEIT/leib.json"; }

feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k) if isinstance(d, dict) else None
    if d is None: break
print("" if d is None else (json.dumps(d, ensure_ascii=False) if isinstance(d,(bool,dict,list)) else d))' "$1" 2>/dev/null
}

db() {
  ssh -o BatchMode=yes -o ConnectTimeout=15 "$GERAET" \
    "docker exec -i postgres-db psql -U arasul -d arasul_db -At -F '|' -v ON_ERROR_STOP=1" <<<"$1" 2>/dev/null
}

# Ein Bild als Daten-Adresse in eine Leib-Datei: <art> <bytes-datei> <ziel>
bild_leib() {
  python3 - "$1" "$2" "$3" <<'PY'
import base64, json, sys
art, quelle, ziel = sys.argv[1:4]
inhalt = open(quelle, 'rb').read()
json.dump({"bild": f"data:{art};base64,{base64.b64encode(inhalt).decode()}"}, open(ziel, 'w'))
PY
}

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS. Erst: ssh -f -N -L 8443:localhost:443 jetson"
  exit 1
fi

echo "=== Abnahme M5: Verwaltung Gerät und System gegen $BASIS ==="
echo

# --- 1. Zugaenge -------------------------------------------------------------------
TOK=$(arasul_token)
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)" "HTTP $(arasul_anmeldecode)"
[ -z "$TOK" ] && exit 1
[ "$(db 'SELECT 1;')" = 1 ] || { pruefe 'ssh-Zugang zum Geraet und seine Datenbank' nein; exit 1; }

pruefe 'Migration 207 ist gelaufen (drei Spalten fuer das Logo)' \
  "$(ja_wenn "$(db "SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='system_settings' AND column_name IN ('company_logo','company_logo_typ','company_logo_stand');")" 3)"

# --- 2. Vorher lesen (fuer das exakte Zuruecksetzen) ---------------------------------
# Gelesen ueber needs-setup: `GET /api/settings/firmenname` ist am 06.10.2026
# gefallen, needs-setup traegt denselben Wert (company_name oder null).
ruf ohne GET /api/auth/needs-setup
NAME_VORHER=$(rumpf | feld firmenname)
LOGO_VORHER_TYP=$(db "SELECT coalesce(company_logo_typ, '') FROM system_settings WHERE id = 1;")
LOGO_VORHER_STAND=$(db "SELECT coalesce(company_logo_stand::text, '') FROM system_settings WHERE id = 1;")
if [ -n "$LOGO_VORHER_TYP" ]; then
  db "SELECT encode(company_logo, 'base64') FROM system_settings WHERE id = 1;" | tr -d '\n' | base64 -d >"$ARBEIT/logo-vorher" 2>/dev/null
fi
PROMPT_VORHER=$(db "SELECT md5(coalesce(llm_base_system_prompt, '<null>')) FROM system_settings WHERE id = 1;")
echo "vorher: Name »${NAME_VORHER:-<keiner>}«, Logo ${LOGO_VORHER_TYP:-<keines>} ${LOGO_VORHER_STAND}"

zuruecksetzen() {
  [ -z "${TOK:-}" ] && return
  # Logo: war keines da, wieder keines; war eines da, dieselben Bytes und derselbe Stand.
  if [ -z "$LOGO_VORHER_TYP" ]; then
    ruf "$TOK" DELETE /api/settings/logo
  else
    bild_leib "$LOGO_VORHER_TYP" "$ARBEIT/logo-vorher" "$ARBEIT/zurueck.json"
    ruf "$TOK" PUT /api/settings/logo "$ARBEIT/zurueck.json"
    db "UPDATE system_settings SET company_logo_stand = '$LOGO_VORHER_STAND' WHERE id = 1;" >/dev/null
  fi
  # Der Name zuletzt: sein PUT laedt den Zwischenspeicher neu, auch den Stand des Logos.
  ruf "$TOK" PUT /api/settings/firmenname "$(leib "$(python3 -c 'import json,sys; print(json.dumps({"firmenname": sys.argv[1]}))' "$NAME_VORHER")")"
  printf 'zurueckgesetzt  Name »%s«, Logo %s\n' "${NAME_VORHER:-<keiner>}" "${LOGO_VORHER_TYP:-<keines>}"
}
aufraeumen() {
  zuruecksetzen
  rm -rf "$ARBEIT"
}
trap aufraeumen EXIT

# --- 3. System: ein Satz, drei Zahlen ----------------------------------------------------
ruf "$TOK" GET /api/ops/overview
pruefe 'System: /api/ops/overview antwortet' "$(ja_wenn "$CODE" 200)" "HTTP $CODE, Zustand $(rumpf | feld status)"
pruefe 'System: Prozessor, Speicher und Platte sind Zahlen' \
  "$(rumpf | python3 -c 'import sys,json
m=json.load(sys.stdin).get("metrics",{})
print("ja" if all(isinstance(m.get(k),(int,float)) for k in ("cpu_percent","ram_percent","disk_percent")) else "nein")')" \
  "$(rumpf | feld metrics)"
pruefe 'System: Saetze fuer Menschen, als Listen' \
  "$(rumpf | python3 -c 'import sys,json
d=json.load(sys.stdin); print("ja" if isinstance(d.get("warnings"),list) and isinstance(d.get("criticals"),list) else "nein")')"
ruf ohne GET /api/ops/overview
pruefe 'System: ohne Anmeldung 401' "$(ja_wenn "$CODE" 401)" "HTTP $CODE"

# --- 4. KI ist weg -----------------------------------------------------------------------
ruf "$TOK" GET /api/settings/sprachmodell
pruefe 'KI: GET /api/settings/sprachmodell gibt es nicht mehr (404)' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
ruf "$TOK" PATCH /api/settings/sprachmodell "$(leib '{"llm_base_system_prompt":"Probe"}')"
pruefe 'KI: PATCH /api/settings/sprachmodell gibt es nicht mehr (404)' "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
pruefe 'KI: der Basis-Prompt in der Datenbank ist unberuehrt' \
  "$(ja_wenn "$(db "SELECT md5(coalesce(llm_base_system_prompt, '<null>')) FROM system_settings WHERE id = 1;")" "$PROMPT_VORHER")"

# --- 5. Unternehmen: Name ------------------------------------------------------------------
ruf "$TOK" PUT /api/settings/firmenname "$(leib "{\"firmenname\":\"$PROBE_NAME\"}")"
pruefe 'Unternehmen: Name setzen' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ruf ohne GET /api/auth/needs-setup
pruefe 'Unternehmen: needs-setup nennt den Namen (ohne Anmeldung)' "$(ja_wenn "$(rumpf | feld firmenname)" "$PROBE_NAME")" "$(rumpf | feld firmenname)"

# --- 6. Unternehmen: Logo ------------------------------------------------------------------
python3 - "$ARBEIT/probe.png" <<'PY'
import struct, sys, zlib
def stueck(art, daten):
    return struct.pack('>I', len(daten)) + art + daten + struct.pack('>I', zlib.crc32(art + daten) & 0xffffffff)
breite = hoehe = 32
zeilen = b''.join(b'\x00' + bytes([0x25, 0x63, 0xeb, 0xff]) * breite for _ in range(hoehe))
png = (b'\x89PNG\r\n\x1a\n' + stueck(b'IHDR', struct.pack('>IIBBBBB', breite, hoehe, 8, 6, 0, 0, 0))
       + stueck(b'IDAT', zlib.compress(zeilen)) + stueck(b'IEND', b''))
open(sys.argv[1], 'wb').write(png)
PY
bild_leib image/png "$ARBEIT/probe.png" "$ARBEIT/probe.json"

ruf ohne PUT /api/settings/logo "$ARBEIT/probe.json"
pruefe 'Logo: ohne Anmeldung schreibt niemand (401 oder 403)' \
  "$([ "$CODE" = 401 ] || [ "$CODE" = 403 ] && echo ja || echo nein)" "HTTP $CODE"

ruf "$TOK" PUT /api/settings/logo "$ARBEIT/probe.json"
STAND=$(rumpf | feld data.logo)
pruefe 'Logo: ein PNG setzen' "$([ "$CODE" = 200 ] && [ -n "$STAND" ] && echo ja || echo nein)" "HTTP $CODE, Stand $STAND"
ruf ohne GET /api/auth/needs-setup
pruefe 'Logo: needs-setup nennt den Stand' "$(ja_wenn "$(rumpf | feld logo)" "$STAND")" "$(rumpf | feld logo)"

ruf ohne GET "/api/darstellung/logo?stand=$STAND"
cp "$RUMPF_DATEI" "$ARBEIT/geholt.png"
pruefe 'Logo: ohne Anmeldung als Bild abrufbar (200)' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
pruefe 'Logo: Medientyp image/png' "$(ja_wenn "$(kopf content-type)" image/png)" "$(kopf content-type)"
pruefe 'Logo: nosniff' "$(ja_wenn "$(kopf x-content-type-options)" nosniff)"
pruefe 'Logo: mit Stand lange im Zwischenspeicher' \
  "$(grep -q immutable <<<"$(kopf cache-control)" && echo ja || echo nein)" "$(kopf cache-control)"
pruefe 'Logo: dieselben Bytes wie hochgeladen' \
  "$(cmp -s "$ARBEIT/probe.png" "$ARBEIT/geholt.png" && echo ja || echo nein)"

printf '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' >"$ARBEIT/probe.svg"
bild_leib image/svg+xml "$ARBEIT/probe.svg" "$ARBEIT/svg.json"
ruf "$TOK" PUT /api/settings/logo "$ARBEIT/svg.json"
pruefe 'Logo: ein SVG wird abgewiesen (400)' "$(ja_wenn "$CODE" 400)" "HTTP $CODE $(rumpf | feld error.message)"
printf '<html>kein Bild</html>' >"$ARBEIT/falsch.png"
bild_leib image/png "$ARBEIT/falsch.png" "$ARBEIT/falsch.json"
ruf "$TOK" PUT /api/settings/logo "$ARBEIT/falsch.json"
pruefe 'Logo: eine Datei, die nur behauptet, PNG zu sein (400)' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
{ cat "$ARBEIT/probe.png"; head -c 270000 /dev/zero; } >"$ARBEIT/gross.png"
bild_leib image/png "$ARBEIT/gross.png" "$ARBEIT/gross.json"
ruf "$TOK" PUT /api/settings/logo "$ARBEIT/gross.json"
pruefe 'Logo: mehr als 256 KB (400)' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
ruf ohne GET "/api/darstellung/logo?stand=$STAND"
pruefe 'Logo: nach den Abweisungen steht weiter das Probe-Logo' \
  "$(cmp -s "$ARBEIT/probe.png" "$RUMPF_DATEI" && echo ja || echo nein)"

# --- 7. Lizenz: nur lesen, Ablehnung ohne Wirkung ---------------------------------------------
ruf "$TOK" GET /api/license/info
LIZENZ_VORHER=$(rumpf | python3 -c 'import sys,json
d=json.load(sys.stdin); print(d.get("tier"), d.get("valid"), d.get("expiresAt"), d.get("hardwareFingerprint"))')
pruefe 'Lizenz: Stufe, Personen und Fingerabdruck lesbar' \
  "$([ "$CODE" = 200 ] && [ -n "$(rumpf | feld nutzung.konten.belegt)" ] && [ -n "$(rumpf | feld hardwareFingerprint)" ] && echo ja || echo nein)" \
  "$(rumpf | feld tier), Personen $(rumpf | feld nutzung.konten.belegt)"
ruf "$TOK" POST /api/license/activate "$(leib '{"licenseKey":"keine-lizenz-nur-eine-probe-der-abnahme-1004"}')"
pruefe 'Lizenz: eine ungueltige Zeile wird abgelehnt (400)' "$(ja_wenn "$CODE" 400)" "HTTP $CODE"
ruf "$TOK" GET /api/license/info
pruefe 'Lizenz: danach dieselbe wie vorher' "$(ja_wenn "$(rumpf | python3 -c 'import sys,json
d=json.load(sys.stdin); print(d.get("tier"), d.get("valid"), d.get("expiresAt"), d.get("hardwareFingerprint"))')" "$LIZENZ_VORHER")" "$LIZENZ_VORHER"

# --- 8. Aktualisierung: nur lesen -----------------------------------------------------------
ruf "$TOK" GET /api/update/fassung
pruefe 'Aktualisierung: Stand lesbar, kein Lauf aktiv' \
  "$([ "$CODE" = 200 ] && [ "$(rumpf | feld data.laeuft)" = false ] && echo ja || echo nein)" \
  "Fassung $(rumpf | feld data.fassung.nummer)"
ruf ohne POST /api/update/fassung/einspielen "$(leib '{}')"
pruefe 'Aktualisierung: ohne Anmeldung startet nichts (401 oder 403)' \
  "$([ "$CODE" = 401 ] || [ "$CODE" = 403 ] && echo ja || echo nein)" "HTTP $CODE"

# --- 9. Fernzugriff: nur lesen ----------------------------------------------------------------
ruf "$TOK" GET /api/tailscale/status
pruefe 'Fernzugriff: verbunden, mit Adresse' \
  "$([ "$(rumpf | feld connected)" = true ] && [ -n "$(rumpf | feld dnsName)" ] && echo ja || echo nein)" \
  "$(rumpf | feld dnsName)"

# --- 10. Zuruecksetzen und nachsehen ------------------------------------------------------------
trap - EXIT
zuruecksetzen
ruf ohne GET /api/auth/needs-setup
pruefe 'Zurueckgesetzt: Name wie vorher' "$(ja_wenn "$(rumpf | feld firmenname)" "$NAME_VORHER")" "»$(rumpf | feld firmenname)«"
pruefe 'Zurueckgesetzt: Logo wie vorher (Art und Stand)' \
  "$([ "$(db "SELECT coalesce(company_logo_typ, '') FROM system_settings WHERE id = 1;")" = "$LOGO_VORHER_TYP" ] && [ "$(db "SELECT coalesce(company_logo_stand::text, '') FROM system_settings WHERE id = 1;")" = "$LOGO_VORHER_STAND" ] && echo ja || echo nein)" \
  "${LOGO_VORHER_TYP:-<keines>}"

ruf "$TOK" GET /api/auth/me
pruefe 'Die Anmeldung am Geraet steht (kein 500)' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
rm -rf "$ARBEIT"

echo
echo "=== $gruen gruen, $rot rot ==="
[ "$rot" -eq 0 ]
