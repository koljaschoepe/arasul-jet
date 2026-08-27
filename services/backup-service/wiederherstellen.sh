#!/bin/bash
# =============================================================================
# wiederherstellen.sh — der Weg zurueck (Phase C9 des Umbaus vom 26.08.2026)
# =============================================================================
# EIN Weg, nicht drei. Bis Phase C9 gab es `scripts/backup/restore.sh`,
# `scripts/recovery/restore-from-backup.sh` und den Zweig im
# Wiederherstellungstest -- drei Fassungen derselben Sache, von denen zwei
# nachweislich nicht liefen: die eine suchte `postgres_*.sql.gz` (die Dateien
# heissen `postgres/arasul_db_*.sql.gz`) und sprach Container
# `arasul-platform-postgres-db-1` an (sie heissen `postgres-db`), die andere
# entschluesselte die Konfiguration, aber nicht den Datenbankabzug -- und bei
# `BACKUP_ENCRYPT=true`, der Vorgabe, ist jeder Abzug verschluesselt.
#
# DIESES SKRIPT LAEUFT IM SICHERUNGS-CONTAINER, weil dort alles liegt, was der
# Weg zurueck braucht: die Archive, der Schluessel als Docker-Secret, `psql`,
# `openssl`. Ein Weg von aussen muesste sich all das noch einmal besorgen.
#
# WAS ES ZURUECKHOLT
#
#   Datenbank   das ganze Datenmodell: Nutzer und Rollen, Apps und Staende,
#               Freigaben, Schluessel je App, Flow-Laeufe mit Schritten,
#               Freigabe-Anfragen, die Modell-Ueberschreibungen des
#               Administrators, das Migrationsbuch.
#   apps        die Pakete unter /arasul/apps -- daraus baut das Backend die
#               Container neu (`POST /api/backup/wiederherstellung`).
#   flows       die Flow-Dateien unter /arasul/flows.
#
# WAS ES NICHT ANFASST: die Konfiguration (`.env`, Zertifikate, Geheimnisse).
# Sie WIRD gesichert, aber sie zurueckzuspielen heisst, einem laufenden Geraet
# unter den Fuessen die Zugangsdaten zu tauschen -- danach passt das Passwort
# im Container nicht mehr zu dem in der Datenbank. Auf ein LEERES Geraet gehoert
# sie vor den ersten Start, von Hand; der Weg steht in
# `docs/ops/DISASTER_RECOVERY.md`.
#
# WAS VORHER DA WAR, GEHT NICHT VERLOREN. Vor dem Einspielen entsteht ein
# Abzug des jetzigen Standes unter `/backups/vor_wiederherstellung/`. Wer die
# falsche Sicherung erwischt hat, kommt damit zurueck.
#
# Aufruf (im Container):
#   /usr/local/bin/wiederherstellen.sh                  neueste Sicherung
#   /usr/local/bin/wiederherstellen.sh --datei <name>   eine bestimmte
#   /usr/local/bin/wiederherstellen.sh --nur-datenbank  ohne apps und flows
#   /usr/local/bin/wiederherstellen.sh --probe          nur pruefen, nichts tun
#
# Rueckgabe 0, wenn alles zurueckgekommen ist, sonst 1. Der Bericht steht in
# `/backups/wiederherstellung_bericht.json`.
# =============================================================================
set -uo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
POSTGRES_DIR="${BACKUP_DIR}/postgres"
BERICHT="${BACKUP_DIR}/wiederherstellung_bericht.json"
PROTOKOLL="${BACKUP_DIR}/wiederherstellung.log"
BACKUP_ENCRYPT_KEY_FILE="${BACKUP_ENCRYPT_KEY_FILE:-/run/secrets/backup_encryption_key}"

APPS_ZIEL="${APPS_BACKUP_DIR:-/arasul/apps}"
FLOWS_ZIEL="${FLOWS_BACKUP_DIR:-/arasul/flows}"

DATEI=""
NUR_DATENBANK=false
PROBE=false

while [ $# -gt 0 ]; do
    case "$1" in
        --datei) DATEI="$2"; shift 2 ;;
        --nur-datenbank) NUR_DATENBANK=true; shift ;;
        --probe) PROBE=true; shift ;;
        -h|--help) sed -n '1,50p' "$0"; exit 0 ;;
        *) echo "Unbekanntes Argument: $1" >&2; exit 2 ;;
    esac
done

protokoll() {
    printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$PROTOKOLL"
}

json_text() {
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    printf '%s' "$s"
}

DB_ZEILEN=0
APPS_STATUS=uebersprungen
FLOWS_STATUS=uebersprungen
VOR_ABZUG=""

schreibe_bericht() {
    local status="$1" grund="$2" dauer="${3:-0}"
    cat > "$BERICHT" <<EOF
{
  "status": "$(json_text "$status")",
  "grund": "$(json_text "$grund")",
  "sicherung": "$(json_text "$(basename "${DATEI:-}" 2>/dev/null || echo '')")",
  "tabellen": ${DB_ZEILEN},
  "apps": "$(json_text "$APPS_STATUS")",
  "flows": "$(json_text "$FLOWS_STATUS")",
  "vorher_gesichert": "$(json_text "$(basename "${VOR_ABZUG:-}" 2>/dev/null || echo '')")",
  "dauer_sekunden": ${dauer},
  "zeitpunkt": "$(date -Iseconds)"
}
EOF
    protokoll "Bericht: status=${status} ${grund}"
}

# --- Lesen, egal ob verschluesselt ------------------------------------------
# `encrypt_file` in backup.sh schreibt das Chiffrat unter DEMSELBEN Dateinamen
# zurueck. Eine Sicherung heisst also weiter `.sql.gz`, ist aber keine mehr.
# Ohne diese Erkennung liefe `zcat` darauf auf und der Weg zurueck waere bei
# eingeschalteter Verschluesselung dauerhaft versperrt -- genau der Fehler, den
# `scripts/backup/restore.sh` hatte.
ist_gzip() {
    [ "$(head -c 2 "$1" | od -An -tx1 | tr -d ' \n')" = "1f8b" ]
}

lies_sicherung() {
    local datei="$1"
    if ist_gzip "$datei"; then
        cat "$datei"
        return 0
    fi
    if [ ! -f "$BACKUP_ENCRYPT_KEY_FILE" ]; then
        protokoll "FEHLER: ${datei##*/} ist verschluesselt, der Schluessel fehlt (${BACKUP_ENCRYPT_KEY_FILE})"
        return 1
    fi
    openssl enc -d -aes-256-cbc -pbkdf2 -in "$datei" \
        -pass "file:${BACKUP_ENCRYPT_KEY_FILE}" 2>/dev/null
}

START=$(date +%s)
mkdir -p "$BACKUP_DIR"

# --- Welche Sicherung? -------------------------------------------------------
if [ -z "$DATEI" ]; then
    DATEI="${POSTGRES_DIR}/arasul_db_latest.sql.gz"
elif [ "${DATEI#/}" = "$DATEI" ]; then
    # Ein blosser Name gilt als Name IM Sicherungsordner. Ein Pfad von aussen
    # hat hier nichts verloren: er koennte auf alles zeigen, was der Container
    # sieht, und das Ergebnis waere eine Datenbank aus unbekannter Quelle.
    DATEI="${POSTGRES_DIR}/${DATEI}"
fi
case "$DATEI" in
    "${POSTGRES_DIR}/"*) : ;;
    *) protokoll "FEHLER: ${DATEI} liegt nicht in ${POSTGRES_DIR}"
       schreibe_bericht fehler "sicherung_ausserhalb_des_ordners"
       exit 1 ;;
esac
if [ ! -f "$DATEI" ]; then
    protokoll "FEHLER: Sicherung nicht gefunden: $DATEI"
    schreibe_bericht fehler "sicherung_nicht_gefunden"
    exit 1
fi
DATEI="$(readlink -f "$DATEI")"
protokoll "Wiederherstellung aus $(basename "$DATEI")"

# --- Ist sie lesbar? ---------------------------------------------------------
# ERST pruefen, DANN etwas anfassen. Eine Sicherung, die sich nicht oeffnen
# laesst, darf keine halb geleerte Datenbank hinterlassen.
if ! lies_sicherung "$DATEI" | gunzip -t 2>/dev/null; then
    protokoll "FEHLER: die Sicherung laesst sich nicht lesen (Schluessel falsch oder Datei beschaedigt)"
    schreibe_bericht fehler "sicherung_unlesbar"
    exit 1
fi
protokoll "Sicherung lesbar."

if [ "$PROBE" = "true" ]; then
    schreibe_bericht probe "nichts_angefasst" $(( $(date +%s) - START ))
    exit 0
fi

# --- Zugang zur Datenbank ----------------------------------------------------
[ -f "${POSTGRES_PASSWORD_FILE:-}" ] && POSTGRES_PASSWORD=$(cat "$POSTGRES_PASSWORD_FILE")
export PGPASSWORD="${POSTGRES_PASSWORD:-}"
PGH=(-h "$POSTGRES_HOST" -U "$POSTGRES_USER")

if ! psql "${PGH[@]}" -d "$POSTGRES_DB" -tAc 'SELECT 1' >/dev/null 2>&1; then
    protokoll "FEHLER: die Datenbank antwortet nicht"
    schreibe_bericht fehler "datenbank_nicht_erreichbar"
    exit 1
fi

# --- Der Stand von jetzt, bevor er weg ist -----------------------------------
mkdir -p "${BACKUP_DIR}/vor_wiederherstellung"
VOR_ABZUG="${BACKUP_DIR}/vor_wiederherstellung/vorher_$(date +%Y%m%d_%H%M%S).sql.gz"
if pg_dump "${PGH[@]}" -d "$POSTGRES_DB" --no-owner --no-acl --clean --if-exists \
      | gzip > "$VOR_ABZUG" && gunzip -t "$VOR_ABZUG" 2>/dev/null; then
    protokoll "Stand von jetzt gesichert: $(basename "$VOR_ABZUG")"
else
    # Das ist kein Abbruch: auf einem leeren Geraet gibt es nichts zu sichern,
    # und genau dort wird am haeufigsten wiederhergestellt.
    protokoll "Hinweis: der Stand von jetzt liess sich nicht sichern (leeres Geraet?)"
    rm -f "$VOR_ABZUG"
    VOR_ABZUG=""
fi

# --- Einspielen --------------------------------------------------------------
# Fremde Verbindungen werden vorher getrennt. `DROP TABLE` wartet sonst auf
# jede offene Abfrage, und das Backend haelt einen Verbindungspool. Es baut
# ihn danach von selbst wieder auf; wer waehrend dieser Sekunden auf der
# Oberflaeche klickt, bekommt einen Fehler und beim naechsten Klick nicht mehr.
psql "${PGH[@]}" -d postgres -tAc \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
    WHERE datname = '${POSTGRES_DB}' AND pid <> pg_backend_pid()" >/dev/null 2>&1

# ON_ERROR_STOP=1: ein Abzug, der auf halber Strecke scheitert, muss laut
# scheitern. Ohne das laeuft der Rest weiter und am Ende steht eine Datenbank,
# der die Haelfte fehlt, waehrend der Bericht Erfolg meldet.
if ! lies_sicherung "$DATEI" | zcat | psql "${PGH[@]}" -d "$POSTGRES_DB" \
        -v ON_ERROR_STOP=1 >>"$PROTOKOLL" 2>&1; then
    protokoll "FEHLER: das Einspielen ist abgebrochen. Der vorige Stand liegt in ${VOR_ABZUG:-(keiner)}"
    schreibe_bericht fehler "einspielen_abgebrochen" $(( $(date +%s) - START ))
    exit 1
fi

DB_ZEILEN=$(psql "${PGH[@]}" -d "$POSTGRES_DB" -tAc \
  "SELECT count(*) FROM information_schema.tables
    WHERE table_type='BASE TABLE'
      AND table_schema NOT IN ('pg_catalog','information_schema')" 2>/dev/null | tr -d ' ')
DB_ZEILEN="${DB_ZEILEN:-0}"
protokoll "Datenbank zurueck: ${DB_ZEILEN} Tabellen"

# --- Die Dateien -------------------------------------------------------------
# Ein Archiv wird ueber eine ZWISCHENDATEI ausgepackt und nicht ueber eine
# Variable: es ist binaer, und eine Kommandosubstitution verliert NUL-Bytes.
#
# Das Ergebnis kommt ueber $ERGEBNIS zurueck und NICHT ueber die
# Standardausgabe: `protokoll` schreibt selbst dorthin, und eine
# Kommandosubstitution haette jede Protokollzeile mit in den Status gepackt.
ERGEBNIS=""
entpacke_nach() {
    local name="$1" ziel="$2"
    local archiv="${BACKUP_DIR}/${name}/${name}_latest.tar.gz"
    ERGEBNIS=""

    if [ ! -e "$archiv" ]; then
        protokoll "${name}: kein Archiv vorhanden — uebersprungen"
        ERGEBNIS="kein_archiv"
        return 0
    fi
    if [ ! -d "$ziel" ]; then
        protokoll "${name}: ${ziel} ist nicht eingehaengt — uebersprungen"
        ERGEBNIS="nicht_eingehaengt"
        return 0
    fi

    local klartext vorlauf
    klartext="$(mktemp)"
    if ! lies_sicherung "$(readlink -f "$archiv")" > "$klartext" \
         || ! tar -tzf "$klartext" >/dev/null 2>&1; then
        rm -f "$klartext"
        protokoll "FEHLER: ${name}: Archiv unlesbar oder beschaedigt"
        ERGEBNIS="unlesbar"
        return 1
    fi

    # ERST vollstaendig auspacken, DANN das Alte wegnehmen. Andersherum
    # hinterliesse ein Auspacken, das auf halber Strecke abbricht, einen
    # leeren Ordner -- und damit ein Geraet ohne Apps, das vorher welche hatte.
    vorlauf="$(mktemp -d)"
    if ! tar -xzf "$klartext" -C "$vorlauf" 2>/dev/null; then
        rm -rf "$klartext" "$vorlauf"
        protokoll "FEHLER: ${name}: Auspacken fehlgeschlagen"
        ERGEBNIS="fehler"
        return 1
    fi
    rm -f "$klartext"

    # Der Ordner selbst BLEIBT: er ist ein Mountpunkt, ihn zu loeschen ginge
    # nicht und wuerde die Verbindung zum Host kappen. Geleert wird der Inhalt.
    find "$ziel" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null
    if ! cp -a "$vorlauf/." "$ziel/"; then
        rm -rf "$vorlauf"
        protokoll "FEHLER: ${name}: liess sich nicht nach ${ziel} legen"
        ERGEBNIS="fehler"
        return 1
    fi
    rm -rf "$vorlauf"
    local anzahl
    anzahl=$(find "$ziel" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')
    protokoll "${name}: zurueck (${anzahl} Eintraege in ${ziel})"
    ERGEBNIS="ok"
    return 0
}

DATEI_FEHLER=0
if [ "$NUR_DATENBANK" = "false" ]; then
    entpacke_nach apps "$APPS_ZIEL" || DATEI_FEHLER=1
    APPS_STATUS="$ERGEBNIS"
    entpacke_nach flows "$FLOWS_ZIEL" || DATEI_FEHLER=1
    FLOWS_STATUS="$ERGEBNIS"
fi

DAUER=$(( $(date +%s) - START ))
if [ "$DATEI_FEHLER" = "1" ]; then
    schreibe_bericht teilweise "datenbank zurueck, Dateien nicht vollstaendig" "$DAUER"
    exit 1
fi

# „fertig" heisst hier: die Datenbank und die Dateien sind zurueck. Ob die
# App-Container daraus wieder hochkommen, entscheidet das Backend im naechsten
# Schritt -- es baut die Images aus den eben zurueckgeholten Paketen neu. Diese
# Datei sagt darueber bewusst nichts; sie kann es nicht wissen.
schreibe_bericht fertig "datenbank und dateien zurueck" "$DAUER"
protokoll "Fertig in ${DAUER}s. Die App-Container baut das Backend neu."
exit 0
