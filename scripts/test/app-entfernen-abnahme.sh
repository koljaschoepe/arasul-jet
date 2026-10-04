#!/bin/bash
# =============================================================================
# Abnahme M5: Eine App entfernen raeumt auf (Auftrag app-entfernen-raeumt-auf)
# =============================================================================
# Der Befund (03./04.10.2026): nach `app.mjs --remove` blieb sechsmal der
# Paketordner unter /arasul/apps/<id> liegen, waehrend Abnahmen mit
# `DELETE ... ?dateien=true` ihren Ordner abraeumten. Die Vorgabe von `dateien`
# war `false`; das Kit haengt den Parameter nicht an. Dazu blieben offene
# Freigaben und wartende Laeufe einer entfernten App stehen.
#
# Je Weg eine Probe-App der Proben-App `tests/probe-freigabe`, mit Test- UND
# Livestand, einer offenen Freigabe je Stand und je einem wartenden Lauf:
#
#   KIT         DELETE /api/v1/external/apps/:id?bestaetigung=<id> -- genau so,
#               ohne `dateien`, mit dem Schluessel (app:deploy).
#   VERWALTUNG  DELETE /api/apps/:id?dateien=true -- der Aufruf der Oberflaeche,
#               mit der Sitzung.
#
# Danach, je Weg: App weg (404), kein Ordner unter /arasul/apps, keine offene
# Freigabe, kein wartender oder laufender Lauf (sie stehen auf `abgebrochen`
# mit dem Grund „App entfernt"), keine Datenbank, kein Container, kein Image.
# Dazu die Gegenprobe: `?dateien=false` laesst den Ordner liegen (die App wird
# danach noch einmal ohne Angabe entfernt).
#
# DIE PRUEFUNG AM GERAET laeuft ueber SSH (ARASUL_GERAET, Voreinstellung
# `jetson`): Ordner, Datenbank, Container, Image und die Tabellen stehen nirgends
# in der API. Ohne SSH werden diese Pruefungen uebersprungen und als solche
# gezaehlt; die Abnahme gilt dann nicht als belegt.
#
# Konten: ein VORHANDENES Probekonto, nie `admin`, kein neues:
#
#   ARASUL_URL=https://100.121.244.80 ARASUL_BENUTZER=probe-admin \
#   ARASUL_PASSWORT="$(geheim get 'Arasul Jet Dashboard, probe-admin (Orin)')" \
#   bash scripts/test/app-entfernen-abnahme.sh
#
# Die Apps heissen `probe-weg-<MMDD>-kit|verw|haelt`; was das Skript anlegt,
# entfernt es am Ende wieder. Alte Probe-Ordner anderer Laeufe fasst es nicht an.
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=scripts/test/anmeldung.sh
source "$WURZEL/scripts/test/anmeldung.sh"

BASIS="$ARASUL_URL"
QUELLE="$WURZEL/tests/probe-freigabe"
STEMPEL="${ARASUL_STEMPEL:-$(date +%m%d)}"
VERSION_A="1.0.0"
VERSION_B="1.0.1"
GEDULD=900
HALT_GEDULD=180
GERAET="${ARASUL_GERAET:-jetson}"
BACKEND="${ARASUL_BACKEND_CONTAINER:-dashboard-backend}"
APPS_IM_BACKEND="/arasul/apps"

gruen=0
rot=0
uebersprungen=0
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
uebergehen() {
  uebersprungen=$((uebersprungen + 1))
  printf '  --   %s%s\n' "$1" "${2:+  ($2)}"
}
ja_wenn() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }

if [ "$ARASUL_BENUTZER" = "admin" ]; then
  echo "Nie das Konto admin: das ist ein echtes Konto. Ein Probekonto nehmen."
  exit 1
fi

RUMPF_DATEI="$(mktemp)"
ARBEIT="$(mktemp -d)"
CODE=""

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

# Auf dem Geraet. Gibt nichts aus und liefert 255, wenn SSH nicht geht.
geraet() { ssh -o BatchMode=yes -o ConnectTimeout=10 "$GERAET" "$@" 2>/dev/null; }
SSH_GEHT=nein
if [ "$(geraet echo ok)" = "ok" ]; then SSH_GEHT=ja; fi
sql() {
  geraet "docker exec postgres-db psql -U arasul -d arasul_db -tA -c \"$1\"" | tr -d '[:space:]'
}

baue_paket() {
  local kennung="$1" version="$2" ordner="$ARBEIT/paket-$1-$2"
  rm -rf "$ordner"
  mkdir -p "$ordner"
  cp -R "$QUELLE/backend" "$QUELLE/flows" "$ordner/"
  # Ein statisches Frontend genuegt: gemessen wird das Entfernen, nicht die Seite.
  mkdir -p "$ordner/frontend"
  printf '<!doctype html><meta charset="utf-8"><title>Probe: Entfernen</title><p>Probe</p>\n' \
    >"$ordner/frontend/index.html"
  python3 - "$QUELLE/app.json" "$ordner/app.json" "$kennung" "$version" <<'PY'
import json, sys
quelle, ziel, kennung, version = sys.argv[1:5]
m = json.load(open(quelle))
m["id"] = kennung
m["version"] = version
m["name"] = "Probe: Entfernen (%s)" % kennung.rsplit("-", 1)[-1]
m["backend"]["image"] = "arasul-%s:%s" % (kennung, version)
m["backend"]["umgebung"]["PROBE_VERSION"] = version
json.dump(m, open(ziel, "w"), indent=2, ensure_ascii=False)
PY
  local paket="$ARBEIT/$kennung-$version.tgz"
  COPYFILE_DISABLE=1 tar czf "$paket" -C "$ordner" . || return 1
  echo "$paket"
}

paket_ruf() {
  CODE=$(curl -sk -o "$RUMPF_DATEI" -w '%{http_code}' --max-time "$GEDULD" \
    -H "x-api-key: $SCHLUESSEL" -F "paket=@$2" "$BASIS$1")
}

kit_entfernen() { # Der Aufruf, den das Kit macht: nur die Rueckfrage, sonst nichts.
  ruf "schluessel:$SCHLUESSEL" DELETE "/api/v1/external/apps/$1?bestaetigung=$1"
}

APPS=()
SCHLUESSEL=""
KEY_ID=""
aufraeumen() {
  for a in "${APPS[@]:-}"; do
    [ -n "$a" ] && [ -n "$SCHLUESSEL" ] && curl -sk -o /dev/null --max-time 300 -X DELETE \
      -H "x-api-key: $SCHLUESSEL" "$BASIS/api/v1/external/apps/$a?bestaetigung=$a&dateien=true"
  done
  if [ -n "$KEY_ID" ]; then
    curl -sk -o /dev/null --max-time 30 -X DELETE -H "authorization: Bearer $TOK" \
      "$BASIS/api/v1/external/api-keys/$KEY_ID"
  fi
  rm -f "$RUMPF_DATEI"
  rm -rf "$ARBEIT"
  printf 'aufgeraeumt  Probe-Apps entfernt, Wegwerf-Schluessel widerrufen\n'
}
trap aufraeumen EXIT

if ! arasul_geraet_erreichbar "$BASIS"; then
  echo "Kein Geraet unter $BASIS."
  exit 1
fi

echo "=== Abnahme: App entfernen raeumt auf (M5) gegen $BASIS ==="
echo "    Pruefung am Geraet ueber SSH ($GERAET): $SSH_GEHT"
echo

TOK=$(arasul_token)
pruefe "Anmeldung als $ARASUL_BENUTZER" "$([ -n "$TOK" ] && echo ja || echo nein)"
[ -z "$TOK" ] && { echo "Ohne Anmeldung gibt es nichts zu messen."; exit 1; }

ANTWORT=$(curl -sk --max-time 30 -X POST -H "authorization: Bearer $TOK" \
  -H 'content-type: application/json' \
  -d '{"name":"Abnahme M5 (app entfernen)","allowed_endpoints":["app:deploy","flow:run"]}' \
  "$BASIS/api/v1/external/api-keys")
SCHLUESSEL=$(printf '%s' "$ANTWORT" | feld api_key)
KEY_ID=$(printf '%s' "$ANTWORT" | feld key_id)
pruefe 'Wegwerf-Schluessel mit app:deploy und flow:run' "$([ -n "$SCHLUESSEL" ] && echo ja || echo nein)"
[ -z "$SCHLUESSEL" ] && { echo "$ANTWORT"; exit 1; }

ruf "$TOK" GET /api/auth/me
ICH=$(rumpf | feld user.id)
# Die Proben-App verlangt vier Augen: ohne einen zweiten Menschen im Kreis lehnt
# das Geraet das Einreichen ab. Dafuer ein VORHANDENES Probekonto, nur als
# Freigabe -- sein Passwort braucht die Abnahme nicht.
ZWEITER="${ARASUL_A:-probe-j36-a}"
if [ "$ZWEITER" = "admin" ]; then echo "Nie das Konto admin."; exit 1; fi
ruf "$TOK" GET /api/benutzer
ID_ZWEITER=$(rumpf | python3 -c 'import sys,json; print(next((str(b["id"]) for b in json.load(sys.stdin)["data"] if b["username"]==sys.argv[1]), ""))' "$ZWEITER")
pruefe "Zweiter Mensch fuer den Kreis: $ZWEITER (vorhanden)" "$([ -n "$ID_ZWEITER" ] && echo ja || echo nein)"
[ -z "$ID_ZWEITER" ] && exit 1

# Eine Probe-App mit Test- und Livestand, einer offenen Freigabe und einem
# wartenden Lauf je Stand. Setzt $LAEUFE (Nummern, durch Leerzeichen getrennt).
LAEUFE=""
lege_an() {
  local kennung="$1" paket
  APPS+=("$kennung")
  LAEUFE=""
  paket=$(baue_paket "$kennung" "$VERSION_A") || return 1
  paket_ruf /api/v1/external/apps "$paket"
  [ "$CODE" = "201" ] || { echo "        $(rumpf)"; return 1; }
  ruf "schluessel:$SCHLUESSEL" POST "/api/v1/external/apps/$kennung/schalten" '{"ziel":"live"}'
  [ "$CODE" = "200" ] || { echo "        $(rumpf)"; return 1; }
  paket=$(baue_paket "$kennung" "$VERSION_B") || return 1
  paket_ruf /api/v1/external/apps "$paket"
  [ "$CODE" = "201" ] || { echo "        $(rumpf)"; return 1; }
  ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$kennung\",\"benutzer_id\":$ICH,\"stand\":\"test\"}"
  case "$CODE" in 200 | 201) ;; *) echo "        Freigabe: HTTP $CODE $(rumpf)"; return 1 ;; esac
  ruf "$TOK" POST /api/freigaben "{\"app_id\":\"$kennung\",\"benutzer_id\":$ID_ZWEITER,\"stand\":\"test\"}"
  case "$CODE" in 200 | 201) ;; *) echo "        Freigabe zweiter: HTTP $CODE $(rumpf)"; return 1 ;; esac
  arasul_warte_auf_app "/apps/$kennung/api/gesund" 180 "$TOK" || return 1
  arasul_warte_auf_app "/apps/$kennung/test/api/gesund" 180 "$TOK" || return 1
  local pfad lauf ende
  for pfad in "/apps/$kennung/api" "/apps/$kennung/test/api"; do
    ruf "$TOK" POST "$pfad/einreichen"
    if [ "$CODE" = "404" ]; then sleep 5; ruf "$TOK" POST "$pfad/einreichen"; fi
    lauf=$(rumpf | feld lauf)
    [ -n "$lauf" ] || { echo "        Einreichen $pfad: HTTP $CODE $(rumpf)"; return 1; }
    ende=$((SECONDS + HALT_GEDULD))
    while [ "$SECONDS" -lt "$ende" ]; do
      ruf "$TOK" GET "$pfad/lauf?lauf=$lauf"
      [ "$(rumpf | feld status)" = "wartend" ] && break
      sleep 2
    done
    [ "$(rumpf | feld status)" = "wartend" ] || return 1
    LAEUFE="$LAEUFE $lauf"
  done
  LAEUFE="${LAEUFE# }"
}

# Was nach dem Entfernen NICHT mehr da sein darf. $1 Kennung, $2 Laeufe, $3 Weg.
pruefe_danach() {
  local kennung="$1" laeufe="$2" weg="$3" kern="${1//-/_}" ids="${2// /,}"
  ruf "$TOK" GET "/api/apps/$kennung"
  pruefe "[$weg] Die App ist weg (GET /api/apps/:id gibt 404)" "$(ja_wenn "$CODE" 404)" "HTTP $CODE"
  if [ "$SSH_GEHT" != ja ]; then
    uebergehen "[$weg] Ordner, Freigaben, Laeufe, Datenbank, Container, Image" "kein SSH zu $GERAET"
    return
  fi
  local ordner
  ordner=$(geraet "docker exec $BACKEND sh -c 'ls -d $APPS_IM_BACKEND/$kennung 2>/dev/null | wc -l'" | tr -d '[:space:]')
  pruefe "[$weg] Kein Ordner unter data/apps ($APPS_IM_BACKEND/$kennung)" "$(ja_wenn "$ordner" 0)" "gefunden=$ordner"
  local n
  n=$(sql "SELECT count(*) FROM public.approvals WHERE app_id='$kennung' AND status='offen'")
  pruefe "[$weg] Keine offene Freigabe" "$(ja_wenn "$n" 0)" "offen=$n"
  n=$(sql "SELECT count(*) FROM flow_runs WHERE app_id='$kennung' AND status IN ('wartend','laeuft')")
  pruefe "[$weg] Kein wartender oder laufender Lauf" "$(ja_wenn "$n" 0)" "wartend=$n"
  n=$(sql "SELECT count(*) FROM flow_runs WHERE id IN ($ids) AND status='abgebrochen' AND error='App entfernt'")
  pruefe "[$weg] Beide Laeufe stehen auf abgebrochen mit dem Grund „App entfernt“" "$(ja_wenn "$n" 2)" "treffer=$n"
  n=$(sql "SELECT count(*) FROM public.approvals WHERE run_id IN ($ids) AND status='verfallen'")
  pruefe "[$weg] Beide Freigaben stehen auf verfallen" "$(ja_wenn "$n" 2)" "treffer=$n"
  n=$(sql "SELECT count(*) FROM pg_database WHERE datname LIKE 'arasul_app_${kern}%'")
  pruefe "[$weg] Keine Datenbank" "$(ja_wenn "$n" 0)" "gefunden=$n"
  n=$(geraet "docker ps -a --filter name=arasul-app-$kennung --format '{{.Names}}' | wc -l" | tr -d '[:space:]')
  pruefe "[$weg] Kein Container" "$(ja_wenn "$n" 0)" "gefunden=$n"
  n=$(geraet "docker images --format '{{.Repository}}' | grep -c '^arasul-$kennung\$'" | tr -d '[:space:]')
  pruefe "[$weg] Kein Image" "$(ja_wenn "${n:-0}" 0)" "gefunden=${n:-0}"
}

durchlauf() {
  local weg="$1" kennung="probe-weg-$STEMPEL-$1"
  echo "--- $weg: $kennung ---"
  if lege_an "$kennung"; then
    pruefe "[$weg] Test- und Livestand laufen, je ein Lauf wartet auf eine Freigabe" ja "laeufe=$LAEUFE"
  else
    pruefe "[$weg] Test- und Livestand laufen, je ein Lauf wartet auf eine Freigabe" nein "Aufbau gescheitert"
    return 1
  fi
  if [ "$SSH_GEHT" = ja ]; then
    local vorher
    vorher=$(geraet "docker exec $BACKEND sh -c 'ls -d $APPS_IM_BACKEND/$kennung 2>/dev/null | wc -l'" | tr -d '[:space:]')
    pruefe "[$weg] Vorher: der Ordner liegt da (sonst misst die Probe nichts)" "$(ja_wenn "$vorher" 1)"
    local offen
    offen=$(sql "SELECT count(*) FROM public.approvals WHERE app_id='$kennung' AND status='offen'")
    pruefe "[$weg] Vorher: zwei offene Freigaben" "$(ja_wenn "$offen" 2)" "offen=$offen"
  fi
  case "$weg" in
    kit) kit_entfernen "$kennung" ;;
    verw) ruf "$TOK" DELETE "/api/apps/$kennung?dateien=true" ;;
  esac
  pruefe "[$weg] Entfernen gelingt" "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
  pruefe "[$weg] Die Antwort nennt zwei abgebrochene Laeufe und zwei geschlossene Freigaben" \
    "$([ "$(rumpf | feld data.laeufe_abgebrochen)" = 2 ] && [ "$(rumpf | feld data.freigaben_geschlossen)" = 2 ] && echo ja || echo nein)" \
    "$(rumpf | feld data.laeufe_abgebrochen)/$(rumpf | feld data.freigaben_geschlossen)"
  pruefe_danach "$kennung" "$LAEUFE" "$weg"
  echo
}

durchlauf kit
durchlauf verw

# --- Gegenprobe: ?dateien=false haelt den Ordner, danach geht er doch --------
echo "--- haelt: ?dateien=false ---"
KENNUNG="probe-weg-$STEMPEL-haelt"
APPS+=("$KENNUNG")
PAKET=$(baue_paket "$KENNUNG" "$VERSION_A")
paket_ruf /api/v1/external/apps "$PAKET"
pruefe '[haelt] Einspielen' "$(ja_wenn "$CODE" 201)" "HTTP $CODE"
if [ "$CODE" != "201" ]; then rumpf; echo; exit 1; fi
ruf "schluessel:$SCHLUESSEL" DELETE "/api/v1/external/apps/$KENNUNG?bestaetigung=$KENNUNG&dateien=false"
pruefe '[haelt] Entfernen mit dateien=false gelingt' "$(ja_wenn "$CODE" 200)" "HTTP $CODE"
if [ "$SSH_GEHT" = ja ]; then
  n=$(geraet "docker exec $BACKEND sh -c 'ls -d $APPS_IM_BACKEND/$KENNUNG 2>/dev/null | wc -l'" | tr -d '[:space:]')
  pruefe '[haelt] Der Ordner bleibt auf ausdruecklichen Wunsch liegen' "$(ja_wenn "$n" 1)" "gefunden=$n"
else
  uebergehen '[haelt] Der Ordner bleibt liegen' "kein SSH zu $GERAET"
fi
# Der Rest dieser Probe (Ordner ohne App) geht beim Aufraeumen weg: das Skript
# spielt dazu dasselbe Paket noch einmal ein und entfernt es ohne Angabe.
paket_ruf /api/v1/external/apps "$PAKET"
kit_entfernen "$KENNUNG"
if [ "$SSH_GEHT" = ja ]; then
  n=$(geraet "docker exec $BACKEND sh -c 'ls -d $APPS_IM_BACKEND/$KENNUNG 2>/dev/null | wc -l'" | tr -d '[:space:]')
  pruefe '[haelt] Ohne Angabe entfernt, danach ist auch dieser Ordner weg' "$(ja_wenn "$n" 0)" "gefunden=$n"
fi

echo
echo "=== $gruen gruen, $rot rot, $uebersprungen uebersprungen ==="
[ "$rot" -eq 0 ] && [ "$uebersprungen" -eq 0 ]
