#!/usr/bin/env bash
# =============================================================================
# sicherung-am-mac.sh: der Puller am Mac, ohne Gerät (Karte
# sicherung-belege-wieder-weg-vom-geraet, M5, 20.11.2026)
# =============================================================================
# Prüft `scripts/ops/sicherung-am-mac.mjs` mit echtem restic und rsync an
# Wegwerfordnern. Das „Gerät“ ist ein lokaler Ordner mit einem Repo
# `staende-<abdruck>`, gebaut wie backup.sh es baut; der Schlüssel kommt aus
# einer Datei statt aus dem Schlüsselbund. Jede Prüfung kann rot werden:
#
#   1. Erster Zug: das Repo steht am Mac, restic check ohne Fehler, der
#      neueste Stand und die App-Datenbanken darin stehen in STAENDE.json,
#      eine AUSFALL.txt von vorher ist weg.
#   2. Zweiter Zug nach einer Nacht mit forget und prune am Gerät: was dort
#      wegfiel, liegt am Mac im Papierkorb, nicht im Nichts, und die Kopie
#      ist weiter heil.
#   3. Ein Stand älter als 26 Stunden ist kein Erfolg (veraltet).
#   4. Ein Repo, das am Gerät auf weniger als die Hälfte geschrumpft ist,
#      wird nicht gespiegelt: AUSFALL sofort, die Kopie am Mac bleibt heil.
#   5. Wiederherstellung in ein Wegwerf-Postgres, wenn eines da ist (CI:
#      /usr/lib/postgresql/16/bin), sonst mit Begründung übersprungen.
#
# Braucht restic, rsync, node. Aufruf: bash scripts/test/sicherung-am-mac.sh
# (BEHALTEN=1 lässt den Ordner stehen)
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PULLER="$WURZEL/scripts/ops/sicherung-am-mac.mjs"

for w in restic rsync node; do
  command -v "$w" >/dev/null || { echo "FEHLT: $w"; exit 2; }
done

T=$(mktemp -d "${TMPDIR:-/tmp}/sicherung-am-mac.XXXXXX")
T=$(cd "$T" && pwd -P) # restic hält Pfade ohne doppelte Schrägstriche fest
[ "${BEHALTEN:-0}" = 1 ] || trap 'rm -rf "$T"' EXIT
GRUEN=0
ROT=0
ok() { echo "  ok    $*"; GRUEN=$((GRUEN + 1)); }
rot() { echo "  ROT   $*"; ROT=$((ROT + 1)); }

# --- Das Gerät nachstellen ------------------------------------------------------
GERAET="$T/geraet/backups"
mkdir -p "$GERAET" "$T/geheim"
head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' >"$T/geheim/schluessel"
ABDRUCK=$(printf 'arasul-sicherung:%s' "$(cat "$T/geheim/schluessel")" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-16)
REPO="$GERAET/staende-$ABDRUCK"
QUELLE="$T/arasul/datenbank"
mkdir -p "$QUELLE/apps"
export RESTIC_PASSWORD_FILE="$T/geheim/schluessel" RESTIC_PROGRESS_FPS=0 RESTIC_CACHE_DIR="$T/cache"
restic -r "$REPO" init --repository-version 2 >/dev/null

nacht() { # stempel inhalt
  printf -- '-- PostgreSQL database dump\ncreate table beleg (id int primary key, dateiname text, datei bytea, sha256 text, groesse_bytes int);\ninsert into beleg values (1, %s, %s, %s, 5);\ncreate function sperre() returns trigger language plpgsql as $$ begin raise exception %s; end $$;\ncreate trigger beleg_sperre before update or delete on beleg for each row execute function sperre();\ncreate table nacht (wert text);\ninsert into nacht values (%s);\n-- PostgreSQL database dump complete\n' \
    "'a.pdf'" "'\\x68616c6c6f'" "'d3751d33f9cd5049c4af2b462735457e4d3baf130bcbb87f389e349fbaeb20b9'" "'unveraenderlich'" "'$2'" \
    >"$QUELLE/apps/arasul_app_belege_live.sql"
  head -c 3000000 /dev/urandom >"$QUELLE/arasul_db.sql"
  restic -r "$REPO" backup --tag arasul --host arasul --time "$1" "$QUELLE" >/dev/null
}
nacht "$(date -u -d '-3 hours' '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -u -v-3H '+%Y-%m-%d %H:%M:%S')" eins

# --- Der Mac ---------------------------------------------------------------------
SUPPORT="$T/mac/support"
DATEN="$T/mac/Sicherungen"
mkdir -p "$SUPPORT" "$DATEN"
cat >"$SUPPORT/config.json" <<EOF
{ "quelle": "$GERAET", "daten": "$DATEN", "passwortBefehl": "cat $T/geheim/schluessel", "dbPfad": "$QUELLE/apps" }
EOF
echo "AUSFALL von einem früheren Lauf" >"$DATEN/AUSFALL.txt"
export ARASUL_SICHERUNG_SUPPORT="$SUPPORT" ARASUL_SICHERUNG_LOG="$T/mac/sicherung.log" ARASUL_SICHERUNG_NAME=de.arasul.sicherung.probe
ziehen() { (unset RESTIC_PASSWORD_FILE RESTIC_CACHE_DIR; node "$PULLER" --ziehen --jetzt >"$T/mac/lauf.txt" 2>&1); }
feld() { node -e 'const z=JSON.parse(require("fs").readFileSync(process.argv[1]));console.log(process.argv[2].split(".").reduce((o,k)=>o?.[k],z) ?? "")' "$1" "$2"; }

echo "1. Erster Zug"
if ziehen; then ok "Lauf gelungen (Code 0)"; else rot "Lauf fehlgeschlagen: $(tail -3 "$T/mac/lauf.txt")"; fi
[ -f "$DATEN/staende/staende-$ABDRUCK/config" ] && ok "Repo staende-$ABDRUCK steht am Mac" || rot "Repo fehlt am Mac"
grep -q "restic check ohne Fehler" "$T/mac/lauf.txt" && ok "restic check auf der Kopie ohne Fehler" || rot "kein restic check im Protokoll"
[ "$(feld "$DATEN/STAENDE.json" repos.0.appDatenbanken.0.db)" = arasul_app_belege_live ] && ok "STAENDE.json nennt arasul_app_belege_live" || rot "STAENDE.json ohne App-Datenbank"
[ ! -f "$DATEN/AUSFALL.txt" ] && ok "AUSFALL.txt ist weg" || rot "AUSFALL.txt steht noch"
restic -r "$DATEN/staende/staende-$ABDRUCK" --no-lock snapshots --json | grep -q '"short_id"' && ok "der Schlüssel öffnet die Kopie" || rot "Kopie lässt sich nicht öffnen"

echo "2. Eine Nacht mit forget und prune am Gerät"
nacht "$(date -u -d '-1 hours' '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -u -v-1H '+%Y-%m-%d %H:%M:%S')" zwei
restic -r "$REPO" forget --keep-last 1 --prune >/dev/null 2>&1
if ziehen; then ok "zweiter Lauf gelungen"; else rot "zweiter Lauf: $(tail -3 "$T/mac/lauf.txt")"; fi
KORB=$(find "$DATEN/papierkorb" -type f 2>/dev/null | wc -l | tr -d ' ')
[ "$KORB" -gt 0 ] && ok "$KORB weggefallene Datei(en) im Papierkorb" || rot "Papierkorb leer, obwohl am Gerät gelöscht wurde"
N_GERAET=$(find "$REPO" -type f -not -path '*/locks/*' | wc -l | tr -d ' ')
N_MAC=$(find "$DATEN/staende/staende-$ABDRUCK" -type f -not -path '*/locks/*' | wc -l | tr -d ' ')
[ "$N_GERAET" = "$N_MAC" ] && ok "Mac spiegelt das Gerät ($N_MAC Dateien)" || rot "Gerät $N_GERAET Dateien, Mac $N_MAC"
[ "$(feld "$DATEN/STAENDE.json" repos.0.staende)" = 1 ] && ok "ein Stand nach forget, wie am Gerät" || rot "Zahl der Stände stimmt nicht"
[ "$(feld "$DATEN/zustand.json" erfolge.length)" = 2 ] && ok "zwei Erfolge im Zustand" || rot "Erfolge im Zustand: $(feld "$DATEN/zustand.json" erfolge.length)"

echo "3. Ein Stand älter als 26 Stunden"
cp -R "$GERAET" "$T/geraet-alt"
ALT="$T/geraet-alt/staende-$ABDRUCK"
for s in $(restic -r "$ALT" snapshots --json | node -e 'for (const s of JSON.parse(require("fs").readFileSync(0))) console.log(s.id)'); do restic -r "$ALT" forget "$s" >/dev/null; done
restic -r "$ALT" backup --tag arasul --host arasul --time "2026-01-01 02:00:00" "$QUELLE" >/dev/null
cat >"$SUPPORT/config.json" <<EOF
{ "quelle": "$T/geraet-alt", "daten": "$T/mac/alt", "passwortBefehl": "cat $T/geheim/schluessel", "dbPfad": "$QUELLE/apps" }
EOF
if ziehen; then rot "ein alter Stand galt als Erfolg"; else ok "Lauf mit altem Stand ist kein Erfolg"; fi
[ "$(feld "$T/mac/alt/zustand.json" fehler.art)" = veraltet ] && ok "Grund: veraltet" || rot "Grund: $(feld "$T/mac/alt/zustand.json" fehler.art)"
[ -f "$T/mac/alt/AUSFALL.txt" ] && ok "ohne je einen Erfolg steht AUSFALL.txt" || rot "keine AUSFALL.txt"

echo "4. Das Repo am Gerät ist geschrumpft"
cat >"$SUPPORT/config.json" <<EOF
{ "quelle": "$GERAET", "daten": "$DATEN", "passwortBefehl": "cat $T/geheim/schluessel", "dbPfad": "$QUELLE/apps" }
EOF
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22; do
  printf 'x%s' "$i" >"$QUELLE/datei-$i"
  restic -r "$REPO" backup --tag arasul --host arasul "$QUELLE" >/dev/null
done
ziehen >/dev/null || true
VORHER=$(find "$DATEN/staende/staende-$ABDRUCK" -type f | wc -l | tr -d ' ')
find "$REPO/data" -type f | head -n "$(( $(find "$REPO/data" -type f | wc -l) - 1 ))" | xargs rm -f
find "$REPO/snapshots" -type f | tail -n +2 | xargs rm -f
find "$REPO/index" -type f | tail -n +2 | xargs rm -f
if ziehen; then rot "ein geschrumpftes Repo galt als Erfolg"; else ok "Lauf gegen ein geschrumpftes Repo schlägt fehl"; fi
[ "$(feld "$DATEN/zustand.json" fehler.art)" = geschrumpft ] && ok "Grund: geschrumpft" || rot "Grund: $(feld "$DATEN/zustand.json" fehler.art)"
[ -f "$DATEN/AUSFALL.txt" ] && ok "AUSFALL.txt sofort, nicht erst nach 27 Stunden" || rot "keine AUSFALL.txt"
NACHHER=$(find "$DATEN/staende/staende-$ABDRUCK" -type f | wc -l | tr -d ' ')
[ "$VORHER" = "$NACHHER" ] && ok "Kopie am Mac unverändert ($NACHHER Dateien)" || rot "Kopie am Mac: vorher $VORHER, nachher $NACHHER"
restic -r "$DATEN/staende/staende-$ABDRUCK" --no-lock check >/dev/null 2>&1 && ok "Kopie am Mac weiter heil (restic check)" || rot "Kopie am Mac kaputt"

echo "5. Wiederherstellung in ein Wegwerf-Postgres"
PGBIN=""
for o in "${ARASUL_PG_BIN:-}" /usr/lib/postgresql/16/bin /opt/homebrew/opt/postgresql@16/bin "${TMPDIR:-/tmp}/pgtest/node_modules/@embedded-postgres/darwin-arm64/native/bin"; do
  [ -n "$o" ] && [ -x "$o/postgres" ] && { PGBIN="$o"; break; }
done
if [ -z "$PGBIN" ] || [ "$(id -u)" = 0 ]; then
  echo "  übersprungen: kein Postgres am Rechner (oder als root, das initdb nicht erlaubt)"
else
  if (unset RESTIC_PASSWORD_FILE; node "$PULLER" --wiederherstellen --pg-bin "$PGBIN" >"$T/mac/wieder.txt" 2>&1); then
    ok "Wiederherstellung gelungen"
  else
    rot "Wiederherstellung: $(tail -5 "$T/mac/wieder.txt")"
  fi
  grep -q "1 von 1 gleich" "$T/mac/wieder.txt" && ok "der Beleg kommt mit richtigem SHA-256 zurück" || rot "Beleg-Abdruck nicht belegt"
  grep -q "wird abgewiesen" "$T/mac/wieder.txt" && ok "die Sperre gegen Ändern kommt mit zurück" || rot "Sperre nicht belegt"
  grep -q "vorhanden: nein" "$T/mac/wieder.txt" && ok "Wegwerf-Postgres abgebaut" || rot "Wegwerf-Postgres steht noch"
fi

echo
echo "sicherung-am-mac: $GRUEN grün, $ROT rot"
[ "$ROT" = 0 ]
