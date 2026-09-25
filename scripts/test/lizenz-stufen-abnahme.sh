#!/bin/bash
# =============================================================================
# Abnahme der Lizenzstufen und der Freischaltung per SSH (Auftrag J35)
# =============================================================================
# Die Zusage (Beschluss vom 25.09.2026): ohne Lizenz traegt das Geraet drei
# Konten und drei Apps, und beides ist durchgesetzt; mit `professional` gibt es
# keine Grenze, `enterprise` gilt wie `professional`; und eine Lizenz laesst
# sich per SSH ohne das Passwort des Kunden einspielen.
#
# DIE ZAHLEN KOMMEN AUS DEM GERAET, nicht aus diesem Skript: belegt und Grenze
# aus `lizenz-geraet.sh status`. Was schon belegt ist, bleibt stehen; die
# Abnahme fuellt bis zur Grenze mit gestempelten Wegwerf-Konten und
# Wegwerf-Apps auf (Frontend-only, kein Image) und nimmt am Ende alles wieder
# weg, was sie angelegt hat -- auch nach einem Fehler.
#
# DER ABLAUF
#   1. SSH: `lizenz-geraet.sh fingerabdruck` und `status` geben je eine Zeile
#      JSON aus, dieselben Werte wie die Schnittstelle. Das Geraet steht auf
#      community -- sonst Abbruch: eine Abnahme, die eine gekaufte Lizenz
#      ueberschreibt, waere der teuerste Fehler, den sie machen kann.
#   2. community: bis zur Grenze auffuellen, das naechste Konto und die
#      naechste App werden mit 409 abgewiesen, und die Meldung zeigt auf die
#      Lizenz.
#   3. SSH: eine falsche Lizenz wird abgelehnt ({"ok":false}, Rueckgabe 1),
#      eine professional-Lizenz aus `lizenz-signieren.js` (an DIESES Geraet
#      gebunden, einen Tag gueltig) angenommen. Das laufende Backend sieht sie
#      sofort: Konto 4 und 5 und App 4 gehen durch.
#   4. SSH: enterprise, dasselbe -- noch ein Konto geht durch.
#   5. Lizenz weg (`DELETE /api/license`), wieder community: die Wegwerf-Konten
#      stillgelegt, und `status` zaehlt sie nicht mehr; eines wieder zulassen
#      geht nicht, solange die Grenze voll ist.
#   6. Aufraeumen: Konten geloescht, Apps entfernt, Schluessel widerrufen,
#      Lizenz weg -- gemessen: `status` wie vorher.
#
# Aufruf (vom Mac, der den Schluesselbund traegt):
#   ARASUL_URL=https://100.121.244.80 ARASUL_GERAET=arasul@192.168.0.197 \
#   ARASUL_FASSUNGSORDNER='~/arasul-0.8.0' ARASUL_BENUTZER=... ARASUL_PASSWORT=... \
#     bash scripts/test/lizenz-stufen-abnahme.sh
#
# ARASUL_FASSUNGSORDNER ist der Ordner am Geraet, aus dem das Skript gerufen
# wird (Vorgabe: der, aus dem dashboard-backend laeuft).
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
GERAET="${ARASUL_GERAET:?ARASUL_GERAET fehlt (z. B. arasul@192.168.0.197)}"
STEMPEL="j35-$(date +%H%M%S)"
GEDULD=120

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
enthaelt() { case "$1" in *"$2"*) echo ja ;; *) echo nein ;; esac; }

RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""
ruf() {
  local verb="$1" pfad="$2" daten="${3:-}"
  if [ -n "$daten" ]; then
    CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD" \
      -H "authorization: Bearer $TOK" -H 'content-type: application/json' \
      --data-binary @- "$BASIS$pfad" <<<"$daten")
  else
    CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' -X "$verb" --max-time "$GEDULD" \
      -H "authorization: Bearer $TOK" "$BASIS$pfad")
  fi
}
rumpf() { cat "$RUMPF_DATEI" 2>/dev/null; }
feld() {
  python3 -c 'import sys,json
try: d = json.load(sys.stdin)
except Exception: print(""); raise SystemExit
for k in sys.argv[1].split("."):
    d = d.get(k) if isinstance(d, dict) else None
    if d is None: break
print("" if d is None else (d if isinstance(d,(str,int,float)) else json.dumps(d, ensure_ascii=False)))' "$1" 2>/dev/null
}

# Das Skript am Geraet, per SSH, wie es das Ara-Kit ruft. `$SSH_CODE` ist
# seine Rueckgabe, die Ausgabe die eine Zeile JSON.
SSH_CODE=""
am_geraet() {
  local ausgabe
  ausgabe=$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$GERAET" \
    "$ORDNER/scripts/util/lizenz-geraet.sh $*" </dev/null 2>/dev/null)
  SSH_CODE=$?
  printf '%s' "$ausgabe"
}
einspielen_am_geraet() {
  local ausgabe
  ausgabe=$(printf '%s' "$1" | ssh -o BatchMode=yes -o ConnectTimeout=10 "$GERAET" \
    "$ORDNER/scripts/util/lizenz-geraet.sh einspielen" 2>/dev/null)
  SSH_CODE=$?
  printf '%s' "$ausgabe"
}
eine_zeile_json() {
  python3 -c 'import sys,json
t = sys.stdin.read()
ok = t.count("\n") <= 1 and isinstance(json.loads(t), dict)
print("ja" if ok else "nein")' 2>/dev/null <<<"$1" || echo nein
}

# --- Wegwerf-Apps: ein Manifest und eine Seite, kein Image ----------------------
baue_probe() {
  local kennung="$1"
  local ordner="$ARBEIT/$kennung"
  mkdir -p "$ordner/frontend"
  printf '<!doctype html><title>%s</title><p>Wegwerf-App der Abnahme J35.\n' \
    "$kennung" >"$ordner/frontend/index.html"
  python3 - "$ordner/app.json" "$kennung" <<'PY'
import json, sys
ziel, kennung = sys.argv[1:3]
json.dump({"schema": 1, "id": kennung, "name": "Abnahme J35 (%s)" % kennung,
           "beschreibung": "Wegwerf-App. Wird von scripts/test/lizenz-stufen-abnahme.sh entfernt.",
           "version": "1.0.0", "frontend": {"verzeichnis": "frontend"}},
          open(ziel, "w"), indent=2)
PY
  COPYFILE_DISABLE=1 tar czf "$ARBEIT/$kennung.tgz" -C "$ordner" . || return 1
  echo "$ARBEIT/$kennung.tgz"
}
APPS_ANGELEGT=""
spiele_app() {
  local kennung="$1" paket
  paket=$(baue_probe "$kennung")
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$paket" "$BASIS/api/v1/external/apps")
  case "$CODE" in 2*) APPS_ANGELEGT="$APPS_ANGELEGT $kennung" ;; esac
}
KONTEN_ANGELEGT=""
lege_konto_an() {
  local name="$1" koerper
  koerper=$(printf '{"username":"%s","password":"Wegwerf-%s-1!","rolle":"mitarbeiter"}' "$name" "$STEMPEL")
  ruf POST /api/benutzer "$koerper"
  if [ "$CODE" = "201" ]; then
    KONTEN_ANGELEGT="$KONTEN_ANGELEGT $(rumpf | feld data.id)"
  fi
}

# -----------------------------------------------------------------------------
if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS."
  exit 1
fi
echo "=== Abnahme der Lizenzstufen (J35) gegen $BASIS, SSH $GERAET, Stempel $STEMPEL ==="
echo

ORDNER="${ARASUL_FASSUNGSORDNER:-$(ssh -o BatchMode=yes "$GERAET" \
  "docker inspect dashboard-backend --format '{{index .Config.Labels \"com.docker.compose.project.working_dir\"}}'" 2>/dev/null)}"
pruefe 'Der Fassungsordner am Geraet ist bekannt' "$([ -n "$ORDNER" ] && echo ja || echo nein)" "$ORDNER"
[ -z "$ORDNER" ] && exit 1

TOK=$(arasul_token)
pruefe 'Anmeldung als Administrator' "$([ -n "$TOK" ] && echo ja || echo nein)" \
  "$(if [ -n "${ARASUL_TOKEN:-}" ]; then echo 'geteilter Token'; else echo "HTTP $(arasul_anmeldecode)"; fi)"
[ -z "$TOK" ] && exit 1

# --- 1. SSH: fingerabdruck und status -----------------------------------------
echo "--- 1. lizenz-geraet.sh per SSH"
FP_SSH=$(am_geraet fingerabdruck)
pruefe 'fingerabdruck: eine Zeile JSON, Rueckgabe 0' \
  "$([ "$(eine_zeile_json "$FP_SSH")" = ja ] && [ "$SSH_CODE" = 0 ] && echo ja || echo nein)" "$FP_SSH"
ruf GET /api/license/fingerprint
FP_API=$(rumpf | feld hardwareFingerprint)
pruefe 'derselbe Wert wie GET /api/license/fingerprint' \
  "$(ja_wenn "$(printf '%s' "$FP_SSH" | feld fingerabdruck)" "$FP_API")" "$FP_API"

STATUS_VORHER=$(am_geraet status)
pruefe 'status: eine Zeile JSON, Rueckgabe 0' \
  "$([ "$(eine_zeile_json "$STATUS_VORHER")" = ja ] && [ "$SSH_CODE" = 0 ] && echo ja || echo nein)" \
  "$STATUS_VORHER"
ruf GET /api/license/info
pruefe 'und dieselben Zahlen wie nutzung in GET /api/license/info' \
  "$(ja_wenn "$(printf '%s' "$STATUS_VORHER" | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin),sort_keys=True))')" \
    "$(rumpf | python3 -c 'import sys,json; print(json.dumps(json.load(sys.stdin)["nutzung"],sort_keys=True))')")"
STUFE=$(printf '%s' "$STATUS_VORHER" | feld stufe)
if [ "$STUFE" != community ]; then
  pruefe 'Vorher steht das Geraet auf community' nein "Stufe=$STUFE"
  echo "Am Geraet liegt eine Lizenz ($STUFE). Diese Abnahme ueberschreibt keine."
  exit 1
fi
K_BELEGT=$(printf '%s' "$STATUS_VORHER" | feld konten.belegt)
K_GRENZE=$(printf '%s' "$STATUS_VORHER" | feld konten.grenze)
A_BELEGT=$(printf '%s' "$STATUS_VORHER" | feld apps.belegt)
A_GRENZE=$(printf '%s' "$STATUS_VORHER" | feld apps.grenze)
pruefe 'community traegt drei Konten und drei Apps' \
  "$([ "$K_GRENZE" = 3 ] && [ "$A_GRENZE" = 3 ] && echo ja || echo nein)" \
  "Konten $K_BELEGT von $K_GRENZE, Apps $A_BELEGT von $A_GRENZE"

# --- Aufraeumen, immer --------------------------------------------------------
SCHLUESSEL=""
KEY_ID=""
aufraeumen() {
  local id app
  echo
  echo "--- Aufraeumen"
  ruf DELETE /api/license
  for id in $KONTEN_ANGELEGT; do
    ruf DELETE "/api/benutzer/$id"
  done
  if [ -n "$SCHLUESSEL" ]; then
    for app in $APPS_ANGELEGT; do
      curl -sk -o /dev/null --max-time 60 -X DELETE -H "x-api-key: $SCHLUESSEL" \
        "$BASIS/api/v1/external/apps/$app?bestaetigung=$app&dateien=true"
    done
  fi
  [ -n "$KEY_ID" ] && curl -sk -o /dev/null --max-time 30 -X DELETE \
    -H "authorization: Bearer $TOK" "$BASIS/api/v1/external/api-keys/$KEY_ID"
  local nachher
  nachher=$(am_geraet status)
  pruefe 'Danach steht das Geraet wie vorher' "$(ja_wenn "$nachher" "$STATUS_VORHER")" "$nachher"
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  echo
  if [ "$rot" = 0 ]; then
    echo "$gruen von $gruen gruen"
  else
    echo "$gruen von $((gruen + rot)) gruen, $rot rot"
    exit 1
  fi
}
trap aufraeumen EXIT

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d "{\"name\":\"Abnahme J35 $STEMPEL\",\"allowed_endpoints\":[\"app:deploy\"]}" \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Ein Wegwerf-Schluessel mit app:deploy' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && exit 1

# --- 2. community: bis zur Grenze, dann 409 ---------------------------------------
echo
echo "--- 2. community"
n=0
while [ "$K_BELEGT" -lt "$K_GRENZE" ]; do
  n=$((n + 1))
  lege_konto_an "$STEMPEL-auf$n"
  pruefe "Unter der Grenze geht ein Konto durch ($((K_BELEGT + 1)) von $K_GRENZE)" "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
  [ "$CODE" = 201 ] || break
  K_BELEGT=$((K_BELEGT + 1))
done
lege_konto_an "$STEMPEL-zuviel"
MELDUNG=$(rumpf | feld error.message)
pruefe "Das naechste Konto wird abgewiesen (409), $K_BELEGT von $K_GRENZE belegt" "$(ja_wenn "$CODE" 409)" "HTTP $CODE"
pruefe 'und die Meldung zeigt auf die Lizenz' "$(enthaelt "$MELDUNG" 'Einstellungen -> Lizenz')" "$MELDUNG"

n=0
while [ "$A_BELEGT" -lt "$A_GRENZE" ]; do
  n=$((n + 1))
  spiele_app "$STEMPEL-app$n"
  pruefe "Unter der Grenze geht eine App durch ($((A_BELEGT + 1)) von $A_GRENZE)" "$(enthaelt "$CODE" 20)" "HTTP $CODE"
  case "$CODE" in 2*) ;; *) break ;; esac
  A_BELEGT=$((A_BELEGT + 1))
done
spiele_app "$STEMPEL-appzuviel"
MELDUNG=$(rumpf | feld error.message)
pruefe "Die naechste App wird abgewiesen (409), $A_BELEGT von $A_GRENZE belegt" "$(ja_wenn "$CODE" 409)" "HTTP $CODE"
pruefe 'und die Meldung zeigt auf die Lizenz' "$(enthaelt "$MELDUNG" 'Lizenz')" "$MELDUNG"

# --- 3. SSH: professional -----------------------------------------------------------
echo
echo "--- 3. professional, per SSH eingespielt"
AUSGABE=$(einspielen_am_geraet 'eyJmYWxzY2giOnRydWV9.ZmFsc2No')
pruefe 'Eine falsche Lizenz: {"ok":false,...}, Rueckgabe 1' \
  "$([ "$(printf '%s' "$AUSGABE" | feld ok)" = False ] && [ "$SSH_CODE" = 1 ] && echo ja || echo nein)" "$AUSGABE"
LIZENZ=$(node "$WURZEL/scripts/util/lizenz-signieren.js" --kunde "$STEMPEL" \
  --stufe professional --tage 1 --geraet "$FP_API" 2>/dev/null)
pruefe 'lizenz-signieren.js signiert professional, gebunden an dieses Geraet' "$([ -n "$LIZENZ" ] && echo ja || echo nein)"
AUSGABE=$(einspielen_am_geraet "$LIZENZ")
pruefe 'lizenz-geraet.sh einspielen: {"ok":true,"stufe":"professional"}' \
  "$(ja_wenn "$AUSGABE" '{"ok":true,"stufe":"professional"}')" "$AUSGABE, Rueckgabe $SSH_CODE"
ruf GET /api/license/info
pruefe 'Das laufende Backend sieht sie sofort' "$(ja_wenn "$(rumpf | feld tier)" professional)" \
  "$(rumpf | feld nutzung)"
lege_konto_an "$STEMPEL-k4"
pruefe 'Konto 4 geht durch' "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
lege_konto_an "$STEMPEL-k5"
pruefe 'Konto 5 geht durch' "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
spiele_app "$STEMPEL-app4"
pruefe 'App 4 geht durch' "$(enthaelt "$CODE" 20)" "HTTP $CODE"

# --- 4. SSH: enterprise ---------------------------------------------------------
echo
echo "--- 4. enterprise, per SSH eingespielt"
LIZENZ=$(node "$WURZEL/scripts/util/lizenz-signieren.js" --kunde "$STEMPEL" \
  --stufe enterprise --tage 1 --geraet "$FP_API" 2>/dev/null)
AUSGABE=$(einspielen_am_geraet "$LIZENZ")
unset LIZENZ
pruefe 'enterprise: {"ok":true,"stufe":"enterprise"}' \
  "$(ja_wenn "$AUSGABE" '{"ok":true,"stufe":"enterprise"}')" "$AUSGABE"
STATUS=$(am_geraet status)
pruefe 'status: Konten und Apps ohne Grenze' \
  "$([ "$(printf '%s' "$STATUS" | feld konten.grenze)" = -1 ] && [ "$(printf '%s' "$STATUS" | feld apps.grenze)" = -1 ] && echo ja || echo nein)" "$STATUS"
lege_konto_an "$STEMPEL-k6"
pruefe 'Noch ein Konto geht durch' "$(ja_wenn "$CODE" 201)" "HTTP $CODE"

# --- 5. Zurueck auf community: stillgelegte zaehlen nicht --------------------------
echo
echo "--- 5. wieder community"
ruf DELETE /api/license
pruefe 'DELETE /api/license' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
ERSTES=""
for id in $KONTEN_ANGELEGT; do
  [ -z "$ERSTES" ] && ERSTES="$id"
  ruf PUT "/api/benutzer/$id/aktiv" '{"aktiv":false}'
done
STATUS=$(am_geraet status)
pruefe 'Stillgelegte Konten zaehlt die Lizenz nicht' \
  "$(ja_wenn "$(printf '%s' "$STATUS" | feld konten.belegt)" "$(printf '%s' "$STATUS_VORHER" | feld konten.belegt)")" \
  "$STATUS"
if [ -n "$ERSTES" ] && [ "$(printf '%s' "$STATUS" | feld konten.belegt)" -ge 3 ]; then
  ruf PUT "/api/benutzer/$ERSTES/aktiv" '{"aktiv":true}'
  pruefe 'Wieder zulassen geht nicht, solange drei aktiv sind (409)' "$(ja_wenn "$CODE" 409)" \
    "HTTP $CODE, $(rumpf | feld error.message)"
fi

trap - EXIT
aufraeumen
