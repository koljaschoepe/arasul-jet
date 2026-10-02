#!/bin/bash
# =============================================================================
# Abnahme der Stufe „am Geraet" (J33, 02.10.2026)
# =============================================================================
# Die Zusage: ein Ordner der Stufe am Geraet VERLAESST DAS GERAET NICHT. Gemessen
# wird sie am laufenden Geraet, mit einer Datei darin, an drei Stellen, die ein
# Mensch oder sein Rechner fragen kann -- fuer ZWEI Konten, einen Administrator
# und einen Mitarbeiter:
#
#   1. `GET /api/firmenordner` nennt ihn nicht.
#   2. `GET /api/firmenordner/sicht` (die `sicht.md`) nennt ihn nicht.
#   3. `sync --plan` des CLI (`arasul.mjs`, eigener ARASUL_CONFIG_DIR, Wegwerf-
#      Ziel) bewegt nichts von ihm und nennt ihn nicht.
#   4. Der Dateidienst (WebDAV) antwortet beiden auf den Raum mit 404 -- und
#      auf `firma` zur Gegenprobe mit 207, sonst waere das 404 nur ein Tippfehler
#      in der Adresse.
#   5. Der Dienst nennt ihn in `me/drives` keinem der beiden.
#   6. DAGEGEN ERREICHT IHN, wer am Geraet laeuft: das Backend liest die Datei
#      ueber seinen Mount, und die Pfadsperre der Flows (`resolveRealWithinRoots`)
#      laesst sie durch.
#
# DER PROBE-ORDNER ist ein eigener Bereich auf Ebene 1 mit Stempel, nie unter
# `firma`, und der Administrator bekommt KEIN Recht darauf (er bekommt auf
# `art = am_geraet` ohnehin keins). Danach werden Ordner und Datei weggeworfen;
# `--nur-aufraeumen` raeumt nach einem Abbruch nach.
#
# KONTEN: nie `admin`. Der Aufrufer reicht beide Passwoerter ueber die Umgebung
# (`geheim get ...`); ein Passwort landet nie in einer Datei.
#
#   ssh -f -N -L 8443:localhost:443 -L 18443:localhost:8443 jetson
#   ARASUL_URL=https://localhost:8443 ARASUL_FIRMENORDNER=https://localhost:18443 \
#   ARASUL_ADMIN=probe-admin ARASUL_ADMIN_PASSWORT="$(geheim get '...')" \
#   ARASUL_MITARBEITER=probe-j36-a ARASUL_MITARBEITER_PASSWORT="$(geheim get '...')" \
#   ARASUL_CLI=~/Code/arasul/arasul.mjs \
#     bash scripts/test/am-geraet-abnahme.sh
#
# Rueckgabe 0, wenn jede Pruefung gruen war, sonst 1.
# =============================================================================
set -uo pipefail

BASIS="${ARASUL_URL:-https://localhost:8443}"
DIENST="${ARASUL_FIRMENORDNER:-https://localhost:18443}"
GERAET="${ARASUL_GERAET:-jetson}"
CLI="${ARASUL_CLI:-}"
ADMIN="${ARASUL_ADMIN:-}"
MITARBEITER="${ARASUL_MITARBEITER:-}"
BACKEND="${ARASUL_BACKEND_CONTAINER:-dashboard-backend}"
# Die Ablage am Geraet, aus dem Mount des Backends gelesen -- nicht geraten.
ABLAGE_IM_BACKEND="/arasul/firmenordner"

STEMPEL="$(date +%s)"
KENNUNG="j33am-$STEMPEL"
DATEI="probe-$STEMPEL.txt"
INHALT="am-geraet-$STEMPEL"
ZIEL="$(mktemp -d)"
RUMPF="$(mktemp)"
CODE=""
ID_ORDNER=""
TOK_A=""
NUR_AUFRAEUMEN=false
[ "${1:-}" = "--nur-aufraeumen" ] && NUR_AUFRAEUMEN=true

if [ -z "$ADMIN" ] || [ -z "${ARASUL_ADMIN_PASSWORT:-}" ]; then
  echo "ARASUL_ADMIN und ARASUL_ADMIN_PASSWORT fehlen (probe-admin, nie admin)." >&2
  exit 2
fi
if ! $NUR_AUFRAEUMEN && { [ -z "$MITARBEITER" ] || [ -z "${ARASUL_MITARBEITER_PASSWORT:-}" ]; }; then
  echo "ARASUL_MITARBEITER und ARASUL_MITARBEITER_PASSWORT fehlen." >&2
  exit 2
fi
if [ "$ADMIN" = "admin" ]; then
  echo "Proben laufen nie als admin." >&2
  exit 2
fi

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
ja_nein() { if [ "$1" = "$2" ]; then echo ja; else echo nein; fi; }
enthaelt() { case "$1" in *"$2"*) echo ja ;; *) echo nein ;; esac; }
nicht_enthalten() { case "$1" in *"$2"*) echo nein ;; *) echo ja ;; esac; }

feld() {
  python3 -c '
import json, sys
try:
    wert = json.load(open(sys.argv[1]))
    for teil in sys.argv[2].split("."):
        wert = wert[int(teil)] if isinstance(wert, list) else wert[teil]
    print("" if wert is None else wert)
except Exception:
    print("")
' "$RUMPF" "$1"
}

ruf() {
  local verb="$1" pfad="$2" token="$3" leib="${4:-}"
  local -a a=(-sk -o "$RUMPF" -w '%{http_code}' --max-time 60 -X "$verb"
    -H "Authorization: Bearer $token")
  [ -n "$leib" ] && a+=(-H 'Content-Type: application/json' -d "$leib")
  CODE=$(curl "${a[@]}" "$BASIS$pfad" 2>/dev/null)
}

anmelden() {
  local name="$1" passwort="$2"
  local leib
  leib=$(python3 -c 'import json,sys; print(json.dumps({"username": sys.argv[1], "password": sys.argv[2]}))' "$name" "$passwort")
  curl -sk --max-time 30 -X POST -H 'Content-Type: application/json' -d "$leib" \
    "$BASIS/api/auth/login" 2>/dev/null |
    python3 -c 'import json,sys; print(json.load(sys.stdin).get("token",""))' 2>/dev/null
}

dav_code() { # <konto> <passwort> <pfad>
  curl -sk -o /dev/null -w '%{http_code}' --max-time 30 -X PROPFIND -H 'Depth: 0' \
    -u "$1:$2" "$DIENST$3" 2>/dev/null
}

aufraeumen() {
  if [ -n "$TOK_A" ] && [ -n "$ID_ORDNER" ]; then
    ruf DELETE "/api/firmenordner/ordner/$ID_ORDNER?kennung=$KENNUNG" "$TOK_A"
    echo "aufgeraeumt: Ordner $KENNUNG, HTTP $CODE"
  fi
  rm -rf "$ZIEL" "$RUMPF"
}

TOK_A=$(anmelden "$ADMIN" "$ARASUL_ADMIN_PASSWORT")
[ -n "$TOK_A" ] || { echo "Anmeldung von $ADMIN scheitert." >&2; rm -rf "$ZIEL" "$RUMPF"; exit 2; }

if $NUR_AUFRAEUMEN; then
  ruf GET "/api/firmenordner/ordner" "$TOK_A"
  python3 - "$RUMPF" <<'PY' | while read -r id kennung; do
import json, sys
for o in json.load(open(sys.argv[1]))["data"]:
    if o["kennung"].startswith("j33am-"):
        print(o["id"], o["kennung"])
PY
    ruf DELETE "/api/firmenordner/ordner/$id?kennung=$kennung" "$TOK_A"
    echo "weggeworfen: $kennung, HTTP $CODE"
  done
  rm -rf "$ZIEL" "$RUMPF"
  exit 0
fi
trap aufraeumen EXIT

TOK_M=$(anmelden "$MITARBEITER" "$ARASUL_MITARBEITER_PASSWORT")
pruefe "beide Konten melden sich an" "$([ -n "$TOK_M" ] && echo ja || echo nein)"

# ===========================================================================
# Vorher: was es gibt, damit die Zaehlung am Ende etwas sagt
# ===========================================================================
ruf GET "/api/firmenordner/ordner" "$TOK_A"
VORHER=$(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(d["zustand"].get("am_geraet",""), len(d["data"]))' "$RUMPF")
echo "vorher (am_geraet, Ordner): $VORHER"

# ===========================================================================
# Der Probe-Ordner und seine Datei
# ===========================================================================
echo
echo "--- Probe-Ordner ---"
ruf POST "/api/firmenordner/ordner" "$TOK_A" \
  "{\"kennung\":\"$KENNUNG\",\"name\":\"Probe am Geraet $STEMPEL\",\"ebene\":1,\"art\":\"am_geraet\"}"
pruefe "ein Ordner der Stufe am Geraet entsteht (Ebene 1, nie unter firma)" \
  "$(ja_nein "$CODE" 201)" "HTTP $CODE"
ID_ORDNER=$(feld data.id)
RAUM=$(feld data.raum_id)
NAME=$(feld data.name)

ruf GET "/api/firmenordner/ordner" "$TOK_A"
pruefe "und zaehlt als am_geraet" \
  "$(enthaelt "$(feld zustand.am_geraet)" "$(( ${VORHER%% *} + 1 ))")" "zustand.am_geraet=$(feld zustand.am_geraet)"

# Die Datei liegt als echte Datei in der Ablage, unter dem Namen des Raums.
PFAD_PLATTE=$(ssh "$GERAET" "docker exec $BACKEND sh -c 'ls -d $ABLAGE_IM_BACKEND/posix/projects/* 2>/dev/null'" 2>/dev/null |
  grep -F -- "$NAME" | head -1)
if [ -z "$PFAD_PLATTE" ]; then
  # Der Raum heisst auf der Platte nach dem Namen, bei Abweichung nach der Kennung.
  PFAD_PLATTE=$(ssh "$GERAET" "docker exec $BACKEND sh -c 'ls -d $ABLAGE_IM_BACKEND/posix/projects/* 2>/dev/null'" 2>/dev/null |
    grep -F -- "$KENNUNG" | head -1)
fi
pruefe "der Raum liegt in der Ablage" "$([ -n "$PFAD_PLATTE" ] && echo ja || echo nein)" "$PFAD_PLATTE"
HOST_ABLAGE=$(ssh "$GERAET" "docker inspect $BACKEND --format '{{range .Mounts}}{{if eq .Destination \"$ABLAGE_IM_BACKEND\"}}{{.Source}}{{end}}{{end}}'" 2>/dev/null)
PFAD_HOST="$HOST_ABLAGE${PFAD_PLATTE#"$ABLAGE_IM_BACKEND"}"
ssh "$GERAET" "printf '%s' '$INHALT' > '$PFAD_HOST/$DATEI' && ls -l '$PFAD_HOST/$DATEI'" >/dev/null 2>&1
DA=$(ssh "$GERAET" "cat '$PFAD_HOST/$DATEI'" 2>/dev/null)
pruefe "eine Datei liegt darin" "$(ja_nein "$DA" "$INHALT")" "$PFAD_HOST/$DATEI"

# ===========================================================================
# Was die Konten sehen -- die negativen Messungen
# ===========================================================================
echo
echo "--- Fuer jedes Konto ---"
for KONTO in "$ADMIN:$ARASUL_ADMIN_PASSWORT:$TOK_A" "$MITARBEITER:$ARASUL_MITARBEITER_PASSWORT:$TOK_M"; do
  K="${KONTO%%:*}"; REST="${KONTO#*:}"; PW="${REST%%:*}"; TOK="${REST#*:}"

  ruf GET "/api/firmenordner" "$TOK"
  ANTWORT=$(cat "$RUMPF")
  ZAHL=$(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))["data"]["ordner"]))' "$RUMPF" 2>/dev/null)
  pruefe "$K: GET /api/firmenordner (200) nennt ihn nicht" \
    "$([ "$CODE" = 200 ] && nicht_enthalten "$ANTWORT" "$KENNUNG" || echo nein)" "HTTP $CODE, $ZAHL Ordner"
  pruefe "$K: und auch seinen Namen nicht" "$(nicht_enthalten "$ANTWORT" "Probe am Geraet")"

  ruf GET "/api/firmenordner/sicht" "$TOK"
  SICHT=$(cat "$RUMPF")
  pruefe "$K: sicht.md nennt ihn nicht" \
    "$([ "$CODE" = 200 ] && nicht_enthalten "$SICHT" "$KENNUNG" || echo nein)" "HTTP $CODE, $(printf '%s' "$SICHT" | wc -c | tr -d ' ') Zeichen"
  pruefe "$K: und seinen Namen nicht" "$(nicht_enthalten "$SICHT" "Probe am Geraet")"

  C_RAUM=$(dav_code "$K" "$PW" "/dav/spaces/$RAUM")
  pruefe "$K: WebDAV auf den Raum antwortet 404" "$(ja_nein "$C_RAUM" 404)" "HTTP $C_RAUM"
  C_DATEI=$(dav_code "$K" "$PW" "/dav/spaces/$RAUM/$DATEI")
  pruefe "$K: WebDAV auf die Datei darin ebenso" "$(ja_nein "$C_DATEI" 404)" "HTTP $C_DATEI"

  # Gegenprobe: dasselbe Konto erreicht `firma` -- das 404 oben ist also keine
  # Folge eines falschen Pfads oder eines nicht erreichbaren Dienstes.
  FIRMA=$(curl -sk --max-time 30 -u "$K:$PW" "$DIENST/graph/v1.0/me/drives" 2>/dev/null)
  FIRMA_ID=$(printf '%s' "$FIRMA" | python3 -c '
import json, sys
try:
    for d in json.load(sys.stdin)["value"]:
        if d.get("name") == "firma":
            print(d["id"]); break
except Exception:
    pass')
  C_GEGEN=$(dav_code "$K" "$PW" "/dav/spaces/$FIRMA_ID")
  pruefe "$K: Gegenprobe, WebDAV auf firma antwortet 207" "$(ja_nein "$C_GEGEN" 207)" "HTTP $C_GEGEN"
  pruefe "$K: me/drives nennt den Probe-Raum nicht" "$(nicht_enthalten "$FIRMA" "$RAUM")"
done

# ===========================================================================
# sync --plan, mit eigenem Config-Ordner in ein Wegwerfziel
# ===========================================================================
echo
echo "--- sync --plan ---"
if [ -z "$CLI" ] || [ ! -f "$CLI" ]; then
  echo "ROT: ARASUL_CLI zeigt nicht auf arasul.mjs, sync --plan ist nicht gemessen"
  rot=$((rot + 1))
else
  for KONTO in "$ADMIN:$ARASUL_ADMIN_PASSWORT:$TOK_A" "$MITARBEITER:$ARASUL_MITARBEITER_PASSWORT:$TOK_M"; do
    K="${KONTO%%:*}"; REST="${KONTO#*:}"; PW="${REST%%:*}"; TOK="${REST#*:}"
    # Die Wurzel des CLI ist der Ort von arasul.mjs. Ohne Kopie in einen
    # Wegwerfordner plante der erste Lauf gegen den echten Firmenordner des
    # Aufrufers (821 Dateien hoch) -- nur ein Plan, aber das falsche Ziel.
    WURZEL_K="$ZIEL/$K"
    mkdir -p "$WURZEL_K/config" "$WURZEL_K/.claude"
    cp "$CLI" "$WURZEL_K/arasul.mjs"
    # Ohne diese Datei ist der Ordner keine Wurzel und login weigert sich.
    printf '{"name":"Probe am Geraet","language":"de"}\n' >"$WURZEL_K/.claude/root.json"
    NAME_AUSWEIS="am-geraet-$STEMPEL-$K"
    ( cd "$WURZEL_K" && printf '%s\n' "$PW" |
      ARASUL_CONFIG_DIR="$WURZEL_K/config" node arasul.mjs login "$BASIS" --user "$K" --password-stdin --insecure \
        --name "$NAME_AUSWEIS" --credential-name "$NAME_AUSWEIS" >"$WURZEL_K/login.log" 2>&1 )
    pruefe "$K: das CLI meldet sich in der Wegwerfwurzel an" \
      "$(enthaelt "$(cat "$WURZEL_K/login.log")" 'Angemeldet an')" "$(head -c 200 "$WURZEL_K/login.log" | head -1)"
    ( cd "$WURZEL_K" && printf '%s\n' "$PW" |
      ARASUL_CONFIG_DIR="$WURZEL_K/config" node arasul.mjs sync --plan --insecure --password-stdin --fetch-client \
        >"$WURZEL_K/plan.log" 2>&1 )
    PLAN=$(cat "$WURZEL_K/plan.log")
    # Ein Plan, der gar nicht zustande kam, darf nicht als „nennt ihn nicht"
    # gruen werden: er muss seine Summenzeile tragen.
    pruefe "$K: sync --plan liefert einen Plan" "$(enthaelt "$PLAN" 'Insgesamt:')" \
      "$(printf '%s' "$PLAN" | grep -c 'Ebene')  Ordner im Plan"
    pruefe "$K: und nennt den Probe-Ordner nicht" "$(nicht_enthalten "$PLAN" "$KENNUNG")"
    pruefe "$K: und die Datei nicht" "$(nicht_enthalten "$PLAN" "$DATEI")"
    printf '    %s\n' "$(printf '%s' "$PLAN" | grep 'Insgesamt:')"
    # Den Ausweis wieder vom Geraet nehmen, den dieser Lauf ausgestellt hat.
    ruf GET "/api/ausweise" "$TOK"
    AUSWEIS=$(python3 -c '
import json, sys
for a in json.load(open(sys.argv[1]))["data"]:
    if a["name"] == sys.argv[2]:
        print(a["id"])' "$RUMPF" "$NAME_AUSWEIS")
    if [ -n "$AUSWEIS" ]; then
      ruf DELETE "/api/ausweise/$AUSWEIS" "$TOK"
      echo "    Ausweis $AUSWEIS widerrufen, HTTP $CODE"
    fi
  done
fi

# ===========================================================================
# Wer am Geraet laeuft, erreicht ihn
# ===========================================================================
echo
echo "--- Am Geraet ---"
GELESEN=$(ssh "$GERAET" "docker exec $BACKEND cat '$PFAD_PLATTE/$DATEI'" 2>/dev/null)
pruefe "das Backend liest die Datei ueber seinen Mount" "$(ja_nein "$GELESEN" "$INHALT")" "$GELESEN"
SPERRE=$(ssh "$GERAET" "docker exec $BACKEND node -e \"
const { resolveRealWithinRoots } = require('./src/services/flows/pathSafe');
const fs = require('fs');
const p = resolveRealWithinRoots(['$PFAD_PLATTE'], '$PFAD_PLATTE/$DATEI');
process.stdout.write(fs.readFileSync(p.resolved || p, 'utf8'));
\"" 2>&1)
pruefe "und die Pfadsperre der Flows laesst sie durch" "$(ja_nein "$SPERRE" "$INHALT")" "$SPERRE"

echo
echo "gruen $gruen, rot $rot"
[ "$rot" -eq 0 ]
