#!/bin/bash
# =============================================================================
# Die ganze Migrationskette gegen eine LEERE Datenbank (Entscheidung 27.08.2026)
# =============================================================================
# WARUM ES DIESE PRUEFUNG GIBT
#
# Migration 169 ist am 27.08.2026 am Orin gescheitert: sie liess einen Typ
# fallen, an dem eine Funktion aus Migration 014 hing. Die CI war dabei gruen —
# sie hat die Migrationen nie ausgefuehrt, sondern nur die Dateien danebenliegen
# sehen. Der Fehler kam beim Deploy heraus, und auf einem FRISCHEN Geraet waere
# er schlimmer gewesen als auf dem gewachsenen: der Postgres-Einstiegspunkt
# faehrt mit ON_ERROR_STOP=1, ein Fehler bricht die ganze Initialisierung ab,
# und der Container kommt gar nicht erst hoch.
#
# Genau das misst dieses Skript, und zwar auf BEIDEN Wegen, die
# `services/postgres/CLAUDE.md` als Vertrag nennt:
#
#   1. Der Erstlauf.   postgres:16-alpine mit `services/postgres/init` als
#                      /docker-entrypoint-initdb.d. Der Einstiegspunkt arbeitet
#                      alle Dateien alphabetisch ab, .sql wie .sh — also auch
#                      `168a_appstore_funktion_vor_169.sh` und die Schlussnotiz
#                      `zzz_migrationsbuch_fuellen.sh`. Kommt der Container
#                      hoch, ist die Kette durchgelaufen.
#
#   2. Der Runner.     `migrationRunner.js` des Backends gegen dieselbe frisch
#                      initialisierte Datenbank. Er darf danach NICHTS mehr
#                      anzuwenden haben und keine Schattentabelle finden. Fasst
#                      er hier zu, widerspricht das Migrationsbuch dem Schema —
#                      der Schaden vom 20.08.2026, 47 Schattentabellen aus
#                      einem einzigen Neustart.
#
# Was hier NICHT gemessen wird: die WAL-Archivierung (`entrypoint-wal.sh`) und
# die eigene postgresql.conf. Beide gehoeren zum Betrieb, nicht zur Kette, und
# ein CI-Lauf ohne Backup-Ziel wuerde nur ueber sich selbst berichten.
#
# Aufruf
#   npm ci                                  (einmal, fuer den Runner in Teil 2)
#   bash scripts/test/migrationskette.sh
#
# Rueckgabe 0, wenn beide Wege sauber sind, sonst 1.
# =============================================================================
set -uo pipefail
WURZEL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

INIT="$WURZEL/services/postgres/init"
BILD="${ARASUL_PG_BILD:-postgres:16-alpine}"
BEHAELTER="${ARASUL_PG_BEHAELTER:-arasul-migrationskette}"
HAFEN="${ARASUL_PG_HAFEN:-55432}"
NUTZER="arasul"
DATENBANK="arasul_db"
# Nur fuer diesen Behaelter, der nach dem Lauf weg ist. Kein Geheimnis, das
# irgendwo bleibt — deshalb steht es hier und nicht in einer Datei.
PASSWORT="migrationskette"

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

aufraeumen() {
  docker rm -f "$BEHAELTER" >/dev/null 2>&1
}
trap aufraeumen EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo "Kein docker. Diese Pruefung startet eine echte Postgres-Instanz."
  exit 1
fi
if [ ! -d "$INIT" ]; then
  echo "Kein $INIT. Falscher Ordner?"
  exit 1
fi

echo "=== Die Migrationskette gegen eine leere Datenbank ==="
echo

# --- 1. Der Erstlauf ---------------------------------------------------------
# Genau die Montage aus `compose/compose.core.yaml`, Zeile
# `../services/postgres/init:/docker-entrypoint-initdb.d`. Ohne Volume fuer
# /var/lib/postgresql/data: die Datenbank soll leer sein, das ist der Punkt.
aufraeumen
docker run -d --name "$BEHAELTER" \
  -e POSTGRES_USER="$NUTZER" \
  -e POSTGRES_DB="$DATENBANK" \
  -e POSTGRES_PASSWORD="$PASSWORT" \
  -v "$INIT:/docker-entrypoint-initdb.d:ro" \
  -p "127.0.0.1:$HAFEN:5432" \
  "$BILD" >/dev/null 2>&1
gestartet=$?
pruefe "Postgres-Behaelter gestartet ($BILD)" "$([ "$gestartet" = "0" ] && echo ja || echo nein)"
if [ "$gestartet" != "0" ]; then
  echo
  echo "Ohne Behaelter gibt es nichts zu messen."
  exit 1
fi

# Warten, bis die Initialisierung durch ist. Die Kette ist lang; drei Minuten
# sind reichlich und trotzdem eine Grenze.
#
# Zwei Abbruchgruende, und der zweite ist der eigentliche Fund: der Behaelter
# ist NICHT MEHR DA. Der Einstiegspunkt beendet sich bei jedem Fehler in einer
# Init-Datei, und dann ist das Ergebnis dieses Laufs schon entschieden.
bereit="nein"
for _ in $(seq 1 180); do
  if ! docker ps -q --filter "name=^${BEHAELTER}$" | grep -q .; then
    break
  fi
  # Der Einstiegspunkt faehrt Postgres waehrend der Initialisierung auf einem
  # Unix-Socket ohne TCP hoch. `pg_isready` ueber den Socket antwortet deshalb
  # schon, bevor die Init-Dateien durch sind; die Zeile im Protokoll erst
  # danach. Sie ist das Signal, nicht der Socket.
  if docker logs "$BEHAELTER" 2>&1 | grep -q 'database system is ready to accept connections'; then
    if docker logs "$BEHAELTER" 2>&1 | grep -q 'PostgreSQL init process complete'; then
      bereit="ja"
      break
    fi
  fi
  sleep 1
done

pruefe 'Die Initialisierung laeuft durch (000 bis heute, .sql und .sh)' "$bereit"
if [ "$bereit" != "ja" ]; then
  echo
  echo "--- Die letzten 40 Zeilen des Behaelters -----------------------------"
  docker logs "$BEHAELTER" 2>&1 | tail -40
  echo "---------------------------------------------------------------------"
  echo
  echo "Eine Init-Datei ist gescheitert. Der Einstiegspunkt faehrt mit"
  echo "ON_ERROR_STOP=1: auf einem frischen Geraet kaeme Postgres so nicht hoch."
  exit 1
fi

# Der Beleg, dass die beiden .sh wirklich gelaufen sind und nicht nur die .sql.
# Ohne ihn koennte die Kette gruen aussehen, waehrend `zzz` beim ersten Befehl
# ausgestiegen ist — genau der Fehlschlag vom 20.08.2026.
protokoll=$(docker logs "$BEHAELTER" 2>&1)
case "$protokoll" in
  *"168a: check_app_dependencies entfernt"*) v168a=ja ;;
  *) v168a=nein ;;
esac
pruefe '168a hat 169 den Weg frei geraeumt' "$v168a"
case "$protokoll" in
  *"zzz: Migrationsbuch in "*) vzzz=ja ;;
  *) vzzz=nein ;;
esac
pruefe 'zzz hat das Migrationsbuch gefuellt' "$vzzz"

psql_im() {
  docker exec "$BEHAELTER" psql -v ON_ERROR_STOP=1 -tA \
    --username "$NUTZER" --dbname "$DATENBANK" -c "$1" 2>/dev/null | tr -d '[:space:]'
}

# Jede Migration steht im Buch, und zwar genau einmal je Version. Gezaehlt wird
# gegen die Dateien auf der Platte: 108 und 108a teilen sich eine Version, also
# gegen die VERSCHIEDENEN Nummern und nicht gegen die Zahl der Dateien.
#
# In Python und nicht in der Shell, und das hat denselben Grund wie `ist_html`
# in `apps-abnahme.sh`: ein `case` INNERHALB einer Kommandosubstitution laeuft
# unter bash 3.2 nicht, und macOS liefert bis heute bash 3.2 aus.
auf_platte=$(python3 -c '
import re, sys, pathlib
nummern = set()
for datei in pathlib.Path(sys.argv[1]).glob("*.sql"):
    treffer = re.match(r"^(\d+)[a-z]?_", datei.name)
    if treffer:
        nummern.add(int(treffer.group(1)))
print(len(nummern))' "$INIT")
im_buch=$(psql_im 'SELECT count(*) FROM public.schema_migrations')
pruefe 'Jede Migration steht im Buch' \
  "$([ -n "$im_buch" ] && [ "$im_buch" = "$auf_platte" ] && echo ja || echo nein)" \
  "$im_buch Eintraege, $auf_platte Versionen auf der Platte"

gescheitert=$(psql_im 'SELECT count(*) FROM public.schema_migrations WHERE success = false')
pruefe 'Keine Migration steht als gescheitert im Buch' \
  "$([ "$gescheitert" = "0" ] && echo ja || echo nein)" "$gescheitert gescheitert"

# Die Falle aus `services/postgres/CLAUDE.md`: eine Tabelle in `arasul` UND in
# `public`. `search_path` ist `"$user", public`, der Nutzer heisst arasul, also
# verdeckt die in `arasul` die gefuellte in `public` vollstaendig.
schatten=$(psql_im "SELECT count(*) FROM (
  SELECT table_name FROM information_schema.tables WHERE table_schema = 'arasul'
  INTERSECT
  SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
) t WHERE table_name <> 'schema_migrations'")
pruefe 'Keine Tabelle liegt doppelt in arasul und public' \
  "$([ "$schatten" = "0" ] && echo ja || echo nein)" "$schatten Schattentabelle(n)"

# --- 2. Der Runner -----------------------------------------------------------
# Derselbe Code, der beim Start des Backends laeuft, gegen dieselbe frisch
# initialisierte Datenbank. Er darf nichts mehr anzuwenden haben.
if [ ! -d "$WURZEL/apps/dashboard-backend/node_modules" ] && [ ! -d "$WURZEL/node_modules/pg" ]; then
  echo
  echo "ROT    Der Migrations-Runner braucht die Abhaengigkeiten. Erst: npm ci"
  exit 1
fi

echo
ERGEBNIS=$(
  cd "$WURZEL/apps/dashboard-backend" &&
    MIGRATIONS_DIR="$INIT" \
      POSTGRES_HOST=127.0.0.1 POSTGRES_PORT="$HAFEN" \
      POSTGRES_USER="$NUTZER" POSTGRES_DB="$DATENBANK" POSTGRES_PASSWORD="$PASSWORT" \
      LOG_LEVEL=warn \
      node -e '
const { Pool } = require("pg");
const { runMigrations } = require("./src/migrationRunner");
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT),
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DB,
});
runMigrations(pool)
  .then(e => { process.stdout.write(JSON.stringify(e)); return pool.end(); })
  .catch(f => { process.stdout.write(JSON.stringify({ fehler: f.message })); process.exitCode = 1; });
' 2>&1
)
laeufer_code=$?

lies() {
  printf '%s' "$ERGEBNIS" | python3 -c '
import sys, json, re
roh = sys.stdin.read()
# Der Runner schreibt sein Ergebnis als letztes; davor koennen Warnungen von
# winston stehen. Genommen wird das letzte JSON-Objekt in der Ausgabe.
treffer = re.findall(r"\{.*\}", roh)
try: d = json.loads(treffer[-1]) if treffer else {}
except Exception: d = {}
w = d.get(sys.argv[1])
print("" if w is None else (len(w) if isinstance(w, list) else w))' "$1" 2>/dev/null
}

pruefe 'Der Migrations-Runner laeuft durch' \
  "$([ "$laeufer_code" = "0" ] && echo ja || echo nein)" "Rueckgabe $laeufer_code"
if [ "$laeufer_code" != "0" ]; then
  printf '%s\n' "$ERGEBNIS" | tail -20
fi

angewendet=$(lies applied)
pruefe 'Er hat nach dem Erstlauf nichts mehr anzuwenden' \
  "$([ "$angewendet" = "0" ] && echo ja || echo nein)" "applied=${angewendet:-?}"

uebersprungen=$(lies skipped)
pruefe 'und kennt die ganze Kette als erledigt' \
  "$([ -n "$uebersprungen" ] && [ "$uebersprungen" -gt 0 ] 2>/dev/null && echo ja || echo nein)" \
  "skipped=${uebersprungen:-?}"

gefallen=$(lies failed)
pruefe 'Keine Migration ist ihm um die Ohren geflogen' \
  "$([ -z "$gefallen" ] && echo ja || echo nein)" "failed=${gefallen:-null}"

runner_schatten=$(lies schatten)
pruefe 'Auch er findet keine Schattentabelle' \
  "$([ "$runner_schatten" = "0" ] && echo ja || echo nein)" "${runner_schatten:-?} Stueck"

echo
echo "$gruen von $((gruen + rot)) gruen"
[ "$rot" -eq 0 ] || exit 1
