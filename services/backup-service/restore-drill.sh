#!/bin/bash
# =============================================================================
# Arasul Platform — Backup Restore Drill (Phase 5.2)
# =============================================================================
# Picks the latest postgres backup, restores it into a throw-away container on
# an isolated network, counts rows on every critical table, and writes a report
# to data/backups/restore_drill_report.json. The dashboard Ops-Overview widget
# surfaces this timestamp so operators see at a glance whether DR is current.
#
# Usage (runs inside the backup-service container as /usr/local/bin/restore-drill.sh):
#   docker exec backup-service /usr/local/bin/restore-drill.sh                 # latest backup
#   docker exec backup-service /usr/local/bin/restore-drill.sh --file X.sql.gz # specific file
#   docker exec backup-service /usr/local/bin/restore-drill.sh --dry-run       # report plan, no docker run
#
# Safe-by-design:
#   - Uses a dedicated container name + random host port; does not touch the
#     production postgres-db container or volume.
#   - Runs in a temporary docker network, no link to app services.
#   - Always cleans up the container, even on failure (trap EXIT).
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
# BACKUP_DIR derivation: defaults to repo-relative path for local dev, but
# can be overridden via env when the script is deployed to /usr/local/bin/
# inside the backup-service container (where ${PROJECT_DIR}/data/backups
# resolves to /usr/data/backups, which doesn't exist). The compose mount
# binds the host backups dir to /backups inside the container.
BACKUP_DIR="${BACKUP_DIR:-${PROJECT_DIR}/data/backups}"
POSTGRES_BACKUP_DIR="${BACKUP_DIR}/postgres"
REPORT_PATH="${BACKUP_DIR}/restore_drill_report.json"
LOG_FILE="${BACKUP_DIR}/restore_drill.log"

# Container on a dedicated name so concurrent runs / stale drills are obvious
DRILL_CONTAINER="arasul-restore-drill"
# Pin the image to what prod runs; the drill is meaningless against a newer/older pg.
DRILL_IMAGE="postgres:16-alpine"
DRILL_DB="arasul_drill"
DRILL_USER="arasul"
DRILL_PASSWORD="drill-$(head -c 12 /dev/urandom | base64 | tr -d '/+=' | head -c 16)"

# Tables we insist the restore brings back. Counts must be > 0 for any table
# that is populated in production. The list is intentionally narrow — a drill
# that demands every one of 85 tables is non-zero will flap on legitimately
# unused features.
CRITICAL_TABLES=(
    admin_users
    chat_conversations
    chat_messages
    documents
    document_chunks
    alert_settings
)

# Was der Kunde selbst gebaut hat. Diese sechs oben sind das Geraet; die hier
# sind seine Arbeit: die Flow-Laeufe. (Bis Phase B5 am 26.08.2026 standen hier
# auch die n8n-Automationen und -Zugaenge, bis B4 die Erweiterungen; beides
# ist ausgebaut.)
#
# Warum sie nicht einfach in die Liste oben gehoeren: sie liegen in einem
# eigenen Schema (`arasul`), das erst Migration 090 anlegt. Eine feste Liste
# wuerde auf einer aelteren Datenbank rot, ohne dass etwas kaputt ist.
#
# Deshalb entscheidet die SICHERUNG selbst, was geprueft wird: was im Abzug
# steht, muss nach dem Zurueckspielen auch da sein. Das ist die Frage, die G6
# wirklich stellt — nicht "laesst sich irgendwas zurueckspielen", sondern
# "bekommt der Kunde seine Sachen wieder".
#
# Fund vom 23.08.2026: der Drill prueft sechs Tabellen, alle in `public`. Ein
# Abzug, bei dem das Schema `n8n` fehlgeschlagen waere, haette ihn trotzdem
# bestanden — und der Kunde haette nach dem Zurueckspielen keine einzige
# Automation mehr.
KUNDENTABELLEN=(
    arasul.flow_runs
)

DRY_RUN=false
BACKUP_FILE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --file)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            sed -n '1,25p' "$0"
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            exit 2
            ;;
    esac
done

mkdir -p "$BACKUP_DIR" 2>/dev/null || true
# data/backups is root-owned (backup-service writes it). When the drill is
# invoked as an unprivileged user, fall through to /tmp so the script is still
# useful for ad-hoc local testing. The JSON report is still written to the
# canonical path if possible.
if ! { : >> "$LOG_FILE"; } 2>/dev/null; then
    LOG_FILE="/tmp/arasul_restore_drill.log"
    : >> "$LOG_FILE" 2>/dev/null || LOG_FILE="/dev/stderr"
fi
if ! { : >> "$REPORT_PATH"; } 2>/dev/null; then
    REPORT_PATH="/tmp/arasul_restore_drill_report.json"
fi

# Schreibt EINMAL. Frueher stand hier `| tee -a "$LOG_FILE"`, und weil die
# Crontab die Standardausgabe zusaetzlich in dieselbe Datei umleitet
# (`>> /backups/restore_drill.log`), landete jede Zeile doppelt. Von 28478
# Zeilen war damit die Haelfte Rauschen.
log() {
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    if [[ "$LOG_FILE" == "/dev/stderr" ]]; then
        echo "[${ts}] $*" >&2
    else
        echo "[${ts}] $*" >> "$LOG_FILE"
    fi
}

json_escape() {
    # Escape \ " and control chars for JSON string use. Good enough for the
    # small, ASCII-only payloads this script produces.
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    printf '%s' "$s"
}

# Entschluesselung (Plan 023 S2).
#
# `encrypt_file` in backup.sh schreibt das Chiffrat unter DEMSELBEN Dateinamen
# zurueck (`mv "${src}.enc" "$src"`). Eine Sicherung heisst also weiter
# `.sql.gz`, ist aber keine mehr. Ohne diese Erkennung wuerde `zcat` darauf
# scheitern und der Test bei eingeschalteter Verschluesselung DAUERHAFT
# fehlschlagen. Deshalb muss S2 vor S3 stehen.
BACKUP_ENCRYPT_KEY_FILE="${BACKUP_ENCRYPT_KEY_FILE:-/run/secrets/backup_encryption_key}"

# 0 = gzip (Klartext), 1 = etwas anderes (erwartet: verschluesselt)
ist_gzip() {
    local datei="$1"
    local magic
    magic=$(head -c 2 "$datei" | od -An -tx1 | tr -d ' \n')
    [[ "$magic" == "1f8b" ]]
}

# Gibt den Inhalt der Sicherung als gzip auf die Standardausgabe, egal ob sie
# verschluesselt ist. Fehlender Schluessel ist ein Fehler, kein stiller Erfolg:
# eine Sicherung, die niemand lesen kann, ist keine.
sicherung_lesen() {
    local datei="$1"
    if ist_gzip "$datei"; then
        cat "$datei"
        return 0
    fi
    if [[ ! -f "$BACKUP_ENCRYPT_KEY_FILE" ]]; then
        log "FAIL: ${datei##*/} ist verschluesselt, aber der Schluessel fehlt (${BACKUP_ENCRYPT_KEY_FILE})"
        return 1
    fi
    if ! openssl enc -d -aes-256-cbc -pbkdf2 -in "$datei" \
            -pass "file:${BACKUP_ENCRYPT_KEY_FILE}" 2>/dev/null; then
        log "FAIL: ${datei##*/} liess sich mit dem hinterlegten Schluessel nicht entschluesseln"
        return 1
    fi
    return 0
}

# Flow-Archiv pruefen (Plan 011). Die Flows liegen in KEINER Datenbank, der
# Postgres-Drill sagt ueber sie also nichts aus. Geprueft wird deshalb separat:
# existiert das Archiv, ist es lesbar, und enthaelt es .md-Dateien?
#
# Wichtig: Bei BACKUP_ENCRYPT=true ist das Archiv AES-verschluesselt und damit
# kein gueltiges gzip mehr. Ein blindes `tar -tzf` wuerde dann "korrupt" melden,
# obwohl alles in Ordnung ist. Deshalb erst die gzip-Magic-Bytes pruefen und
# verschluesselte Archive als "encrypted" (ungeprueft) ausweisen, statt zu luegen.
FLOWS_ARCHIVE="${BACKUP_DIR}/flows/flows_latest.tar.gz"
flows_status="absent"
flows_files=0

check_flows_archive() {
    if [[ ! -f "$FLOWS_ARCHIVE" ]]; then
        log "SKIP: kein Flow-Archiv unter ${FLOWS_ARCHIVE}"
        flows_status="absent"
        return 0
    fi
    # Verschluesselte Archive werden jetzt entschluesselt statt als "nicht
    # pruefbar" durchgewunken. Ein Archiv, dessen Inhalt niemand geprueft hat,
    # ist genau die Sorte Zusage, wegen der Gate G6 aufgemacht wurde.
    # Ueber eine temporaere Datei, NICHT ueber eine Variable: gzip ist binaer,
    # und Kommandosubstitution verliert NUL-Bytes und abschliessende Zeilenumbrueche.
    local klartext
    klartext=$(mktemp)
    if ! sicherung_lesen "$FLOWS_ARCHIVE" > "$klartext"; then
        rm -f "$klartext"
        flows_status="unreadable"
        return 1
    fi
    if ! tar -tzf "$klartext" >/dev/null 2>&1; then
        log "FAIL: Flow-Archiv ist beschaedigt (${FLOWS_ARCHIVE})"
        rm -f "$klartext"
        flows_status="corrupt"
        return 1
    fi
    flows_files=$(tar -tzf "$klartext" 2>/dev/null | grep -c '\.md$' || true)
    rm -f "$klartext"
    log "OK:   Flow-Archiv lesbar (${flows_files} Flow-Dateien)"
    flows_status="ok"
    return 0
}

write_report() {
    local status="$1"
    local detail="$2"
    local verified="${3:-0}"
    local duration="${4:-0}"
    local basename
    basename="$(basename "$BACKUP_FILE" 2>/dev/null || echo "")"
    local ts
    ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    cat > "$REPORT_PATH" <<EOF
{
  "status": "$(json_escape "$status")",
  "detail": "$(json_escape "$detail")",
  "verified_tables": ${verified},
  "duration_seconds": ${duration},
  "backup_file": "$(json_escape "$basename")",
  "flows_status": "$(json_escape "$flows_status")",
  "flows_files": ${flows_files},
  "timestamp": "${ts}"
}
EOF
    log "Report written: status=${status} verified=${verified} duration=${duration}s"
}

cleanup() {
    if docker ps -a --format '{{.Names}}' | grep -qx "$DRILL_CONTAINER"; then
        docker rm -f "$DRILL_CONTAINER" >/dev/null 2>&1 || true
    fi
}
trap cleanup EXIT

if [[ -z "$BACKUP_FILE" ]]; then
    BACKUP_FILE="${POSTGRES_BACKUP_DIR}/arasul_db_latest.sql.gz"
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
    log "ERROR: backup file not found: $BACKUP_FILE"
    write_report "error" "backup_not_found: ${BACKUP_FILE}" 0 0
    exit 1
fi

# Resolve symlink to the real file so the report is unambiguous
BACKUP_FILE="$(readlink -f "$BACKUP_FILE")"
log "Drill starting. Backup file: $BACKUP_FILE"

if [[ "$DRY_RUN" == "true" ]]; then
    log "DRY-RUN: would start $DRILL_IMAGE, load $BACKUP_FILE, verify ${#CRITICAL_TABLES[@]} tables"
    write_report "dry_run" "no container started" 0 0
    exit 0
fi

if ! command -v docker >/dev/null 2>&1; then
    log "ERROR: docker not available"
    write_report "error" "docker_not_available" 0 0
    exit 1
fi

DRILL_START=$(date +%s)

cleanup   # clear any stale container from a previous failed run

log "Starting $DRILL_IMAGE as $DRILL_CONTAINER"
docker run -d --rm \
    --name "$DRILL_CONTAINER" \
    -e POSTGRES_PASSWORD="$DRILL_PASSWORD" \
    -e POSTGRES_USER="$DRILL_USER" \
    -e POSTGRES_DB="$DRILL_DB" \
    "$DRILL_IMAGE" >/dev/null

# Warten, bis die ZIELDATENBANK antwortet, nicht bis der Server pingt.
#
# Hier stand `pg_isready -d "$DRILL_DB"`. Das prueft nur, ob ein Server auf dem
# Socket antwortet, NICHT ob die Datenbank existiert: das Postgres-Image startet
# waehrend seiner Initialisierung einen temporaeren Server, bevor `POSTGRES_DB`
# angelegt ist. Der Wettlauf ging lange gut und kippte am 16.08.2026 — zwei
# Sekunden nach dem Start meldete pg_isready bereit, und das Einspielen brach ab
# mit `FATAL: database "arasul_drill" does not exist`. Der Test meldete
# fehlgeschlagen, drei Tage lang bemerkte es niemand.
#
# `SELECT 1` gegen die Zieldatenbank ist erst dann erfolgreich, wenn der
# Einstieg fertig ist und die Datenbank wirklich steht.
ready=false
for i in $(seq 1 45); do
    if docker exec "$DRILL_CONTAINER" \
            psql -U "$DRILL_USER" -d "$DRILL_DB" -tAc "SELECT 1" >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != "true" ]]; then
    log "ERROR: drill container not ready after 45s"
    write_report "error" "container_start_timeout" 0 $(( $(date +%s) - DRILL_START ))
    exit 1
fi

log "Restoring backup into drill container"
# P5.7: ON_ERROR_STOP=1 — previously the restore swallowed errors and the
# 6-table count check below could pass while 80 other tables silently failed
# to load. A broken backup must produce a non-zero exit so the drill
# correctly reports failure.
restore_ok=true
if ! sicherung_lesen "$BACKUP_FILE" | zcat | docker exec -i "$DRILL_CONTAINER" \
        psql -U "$DRILL_USER" -d "$DRILL_DB" -v ON_ERROR_STOP=1 \
        >>"$LOG_FILE" 2>&1; then
    log "FAIL: psql aborted on first error — backup is not cleanly restorable"
    restore_ok=false
fi

verified=0
failed_tables=()
for tbl in "${CRITICAL_TABLES[@]}"; do
    # Table may not exist if migrations didn't all replay; treat as failure
    if ! count=$(docker exec "$DRILL_CONTAINER" \
            psql -U "$DRILL_USER" -d "$DRILL_DB" -tAc "SELECT COUNT(*) FROM $tbl" 2>/dev/null); then
        log "FAIL: $tbl — relation missing or query error"
        failed_tables+=("$tbl")
        continue
    fi
    if [[ -z "$count" || "$count" -lt 0 ]]; then
        failed_tables+=("$tbl")
        continue
    fi
    log "OK:   $tbl = $count rows"
    verified=$((verified + 1))
done

# Die Sachen des Kunden. Geprueft wird nur, was im Abzug ueberhaupt steht.
kunden_geprueft=0
kunden_fehlen=()
kunden_uebersprungen=()
# Einmal lesen, nicht je Tabelle: der Abzug ist verschluesselt und einige
# zehn Megabyte gross.
im_abzug=$(sicherung_lesen "$BACKUP_FILE" | zcat 2>/dev/null \
    | grep -oE '^CREATE TABLE [a-z0-9_]+\.[a-z0-9_]+ ' | awk '{print $3}' | sort -u)
for tbl in "${KUNDENTABELLEN[@]}"; do
    if ! printf '%s\n' "$im_abzug" | grep -qx "$tbl"; then
        log "----: $tbl steht nicht im Abzug, nicht geprueft"
        kunden_uebersprungen+=("$tbl")
        continue
    fi
    if ! count=$(docker exec "$DRILL_CONTAINER" \
            psql -U "$DRILL_USER" -d "$DRILL_DB" -tAc "SELECT COUNT(*) FROM $tbl" 2>/dev/null); then
        log "FAIL: $tbl steht im Abzug, kam aber nicht zurueck"
        kunden_fehlen+=("$tbl")
        continue
    fi
    log "OK:   $tbl = $count rows"
    kunden_geprueft=$((kunden_geprueft + 1))
done
verified=$((verified + kunden_geprueft))
if (( ${#kunden_fehlen[@]} > 0 )); then
    failed_tables+=("${kunden_fehlen[@]}")
fi
if (( ${#kunden_uebersprungen[@]} > 0 )); then
    log "Hinweis: nicht im Abzug und daher nicht geprueft: ${kunden_uebersprungen[*]}"
fi

# --- Kommt jedes Schema mit? -------------------------------------------------
# `ON_ERROR_STOP=1` faengt jeden Fehler BEIM Einspielen. Es faengt nicht, was
# gar nicht erst im Abzug steht: ein `pg_dump --schema=public` wuerde ohne eine
# einzige Fehlermeldung 127 Tabellen weglassen, und der Drill haette weiter
# "all 11 critical tables verified" gemeldet — die elf liegen alle in `public`.
#
# Am 24.08.2026 auf dem Orin gezaehlt: public 79, n8n 111, arasul 16. Das
# Schema `arasul` legt Migration 090 an, und genau daran ist am 20.08.2026 ein
# fabrikneues Geraet gescheitert; ein Abzug ohne dieses Schema waere still
# unbrauchbar.
#
# Verglichen werden SCHEMAS, nicht Tabellenzahlen. Zwischen Sicherung und
# Drill kann eine Migration gelaufen sein, dann weicht die Zahl zu Recht ab.
# Ein fehlendes Schema weicht nie zu Recht ab.
#
# Gegengeprobt am 24.08.2026, weil eine Pruefung, die nur im guten Fall
# gelaufen ist, nichts beweist. Ein Abzug mit `--exclude-schema=arasul`,
# darauf `restore-drill.sh --file`:
#
#   Schemas im Betrieb: arasul n8n public
#   Schemas im Abzug:   n8n public
#   FAIL: im Abzug fehlt ganz: arasul
#
# Ehrlich dazu: in diesem Versuch hat auch `ON_ERROR_STOP=1` angeschlagen, weil
# `pg_dump --clean` Verweise auf Objekte des fehlenden Schemas mitschreibt. Ein
# Abzug ohne solche Verweise waere sauber eingelaufen und ohne diese Pruefung
# gruen gewesen. Der Unterschied bleibt auch im gemeinsamen Fall nuetzlich:
# ON_ERROR_STOP sagt "not cleanly restorable", diese Zeilen sagen, WAS fehlt.
schemas_abzug=$(printf '%s\n' "$im_abzug" | cut -d. -f1 | sort -u | tr '\n' ' ')
schemas_fehlen=()
if [ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_DB:-}" ] \
   && schemas_betrieb=$(docker exec "${POSTGRES_CONTAINER:-postgres-db}" \
        psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
        "SELECT DISTINCT table_schema FROM information_schema.tables
         WHERE table_type='BASE TABLE'
           AND table_schema NOT IN ('pg_catalog','information_schema')" 2>/dev/null); then
    for schema in $schemas_betrieb; do
        if ! printf '%s\n' $schemas_abzug | grep -qx "$schema"; then
            schemas_fehlen+=("$schema")
        fi
    done
    log "Schemas im Betrieb: $(printf '%s ' $schemas_betrieb)"
    log "Schemas im Abzug:   ${schemas_abzug}"
    if (( ${#schemas_fehlen[@]} > 0 )); then
        log "FAIL: im Abzug fehlt ganz: ${schemas_fehlen[*]}"
        failed_tables+=("schema:${schemas_fehlen[*]}")
    fi
else
    # Kein Zugriff auf die laufende Datenbank ist kein Fehlschlag des Drills,
    # aber auch kein Freispruch. Es wird gesagt statt verschwiegen.
    log "Hinweis: Schemas nicht vergleichbar, laufende Datenbank nicht erreichbar"
fi

# Flow-Archiv mitpruefen. Ein beschaedigtes Archiv laesst den Drill scheitern —
# ein fehlendes nicht, denn auf Geraeten ohne Flows gibt es schlicht keines.
flows_ok=true
check_flows_archive || flows_ok=false

duration=$(( $(date +%s) - DRILL_START ))

# P5.7: also fail the drill if the restore itself errored out, even if the
# 6-table check happens to find rows from a partial restore.
if [[ "$restore_ok" != "true" ]]; then
    write_report "failed" "psql restore aborted on error (see drill log)" "$verified" "$duration"
    log "Drill FAILED after ${duration}s — restore step did not complete cleanly"
    exit 1
fi

if (( ${#failed_tables[@]} > 0 )); then
    write_report "failed" "missing: ${failed_tables[*]}" "$verified" "$duration"
    log "Drill FAILED after ${duration}s (verified=${verified}, failed=${#failed_tables[@]})"
    exit 1
fi

# Ein beschaedigtes Flow-Archiv darf den DATENBANK-Befund nicht ueberschreiben.
# Der Drill beantwortet in erster Linie die Frage "laesst sich die DB
# zurueckspielen?" — diese Antwort muss sauber bleiben, sonst loest ein Problem
# mit ein paar Textdateien einen DR-Fehlalarm aus und entwertet das Signal.
# Das Flow-Problem bleibt sichtbar: im Log und als `flows_status` im Report,
# den das Ops-Widget anzeigt.
if [[ "$flows_ok" != "true" ]]; then
    write_report "ok" "all ${verified} critical tables verified; WARNUNG: Flow-Archiv beschaedigt (${FLOWS_ARCHIVE})" "$verified" "$duration"
    log "Drill OK in ${duration}s (DB verified=${verified}) — ABER: Flow-Archiv beschaedigt, bitte pruefen"
    exit 0
fi

write_report "ok" "all ${verified} critical tables verified (flows: ${flows_status})" "$verified" "$duration"
log "Drill OK in ${duration}s (verified=${verified}, flows=${flows_status})"
