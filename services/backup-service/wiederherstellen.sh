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
#   firmenordner die Dateien der Firma unter /arasul/firmenordner (J33). Der
#               Dienst muss dafuer STEHEN -- `entpacke_nach` raeumt das Ziel
#               leer, bevor es den Baum zurueckschreibt, und ein laufender
#               OpenCloud sieht dabei mit `inotify` zu, wie ihm der Boden
#               weggezogen wird. Der Weg steht in docs/ops/DISASTER_RECOVERY.md
#               und in docs/features/FIRMENORDNER.md.
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
#   /usr/local/bin/wiederherstellen.sh --nur-datenbank  ohne die Ordner
#   /usr/local/bin/wiederherstellen.sh --probe          nur pruefen, nichts tun
#   /usr/local/bin/wiederherstellen.sh --app-datenbank <name> [--datei <name>]
#                                                       NUR die Daten EINER
#                                                       App und eines Standes
#                                                       (J35, siehe unten)
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
FIRMENORDNER_ZIEL="${FIRMENORDNER_BACKUP_DIR:-/arasul/firmenordner}"

DATEI=""
NUR_DATENBANK=false
PROBE=false
APP_DATENBANK=""

while [ $# -gt 0 ]; do
    case "$1" in
        --datei) DATEI="$2"; shift 2 ;;
        --nur-datenbank) NUR_DATENBANK=true; shift ;;
        --probe) PROBE=true; shift ;;
        --app-datenbank) APP_DATENBANK="$2"; shift 2 ;;
        -h|--help) sed -n '1,55p' "$0"; exit 0 ;;
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
FIRMENORDNER_STATUS=uebersprungen
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
  "firmenordner": "$(json_text "$FIRMENORDNER_STATUS")",
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

# --- Zugang zur Datenbank ----------------------------------------------------
# Mit Vorgaben, obwohl Compose alle drei setzt: unter `set -u` waere eine
# fehlende Variable ein "unbound variable" mitten im Lauf -- ohne Bericht, ohne
# Zeile im Protokoll, und wer danach sucht, findet eine Wiederherstellung, die
# scheinbar nichts getan hat. Ein sprechender Fehlschlag ist besser als ein
# stummer Abbruch.
[ -f "${POSTGRES_PASSWORD_FILE:-}" ] && POSTGRES_PASSWORD=$(cat "$POSTGRES_PASSWORD_FILE")
export PGPASSWORD="${POSTGRES_PASSWORD:-}"
PGH=(-h "${POSTGRES_HOST:-postgres-db}" -U "${POSTGRES_USER:-arasul}")
POSTGRES_DB="${POSTGRES_DB:-arasul_db}"

# --- Rolle und Datenbank einer App (Phase H7) --------------------------------
# Legt an, was fehlt, mit einem Zufallswert als Passwort: ein Shell-Skript kann
# das verschluesselte aus `app_datenbanken` nicht lesen. Das richtige setzt das
# Backend danach (`appDatenbank.sorgeFuer`).
lege_app_an() {
    local db="$1" rolle="$2" wort
    wort=$(head -c 24 /dev/urandom | base64 | tr -d '+/=')
    psql "${PGH[@]}" -d postgres -v ON_ERROR_STOP=1 >>"$PROTOKOLL" 2>&1 <<SQL || true
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${rolle}') THEN
    EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L',
                   '${rolle}', '${wort}');
  END IF;
END
\$\$;
SQL
    # `grep -q <<<"$(…)"` und nicht `… | grep -q`: grep steigt beim ersten
    # Treffer aus, der Erzeuger schreibt weiter, und unter `pipefail` ist
    # das Rohr danach zerrissen (`scripts/test/rohrbruch.py`).
    if ! grep -q 1 <<<"$(psql "${PGH[@]}" -d postgres -tAc \
         "SELECT 1 FROM pg_database WHERE datname = '${db}'" 2>/dev/null)"; then
        psql "${PGH[@]}" -d postgres -v ON_ERROR_STOP=1 \
             -c "CREATE DATABASE \"${db}\" OWNER \"${rolle}\"" >>"$PROTOKOLL" 2>&1 || true
        psql "${PGH[@]}" -d postgres -v ON_ERROR_STOP=1 \
             -c "REVOKE ALL ON DATABASE \"${db}\" FROM PUBLIC" >>"$PROTOKOLL" 2>&1 || true
        psql "${PGH[@]}" -d postgres -v ON_ERROR_STOP=1 \
             -c "GRANT CONNECT, TEMPORARY ON DATABASE \"${db}\" TO \"${rolle}\"" \
             >>"$PROTOKOLL" 2>&1 || true
    fi
}

# Einen Abzug ALS DIE ROLLE DER APP einspielen.
#
# Der Abzug ist mit `--no-owner` gezogen und nennt keinen Eigentuemer. Spielt
# ihn `arasul` ein, gehoert danach jede Tabelle `arasul` -- und die App, deren
# Rolle kein Superuser ist, bekommt auf ihre eigenen Daten
# „permission denied". Bis J35 war das der Zustand nach jedem Weg zurueck:
# die Daten waren da, und die App kam nicht heran.
# `SET ROLE` vor dem Abzug macht die Rolle zum Eigentuemer von allem, was er
# anlegt, und das ist dieselbe Lage wie vor der Sicherung.
spiele_app_ein() {
    local db="$1" rolle="$2" abzug="$3"
    { printf 'SET ROLE "%s";\n' "$rolle"; lies_sicherung "$abzug" | zcat; } \
        | psql "${PGH[@]}" -d "$db" -v ON_ERROR_STOP=1 >>"$PROTOKOLL" 2>&1
}

# --- Nur eine App (J35, 25.09.2026) ------------------------------------------
# Der ganze Weg zurueck ersetzt die GANZE Datenbank des Geraets. Wer die Daten
# einer einzigen App zurueckhaben will -- weil sie entfernt wurde, weil ein
# Update sie verdorben hat --, nimmt damit jedem anderen Menschen und jeder
# anderen App alles, was seit der Sicherung geschah. Dieser Zweig fasst genau
# EINE App-Datenbank an und sonst nichts: keine Plattform-Tabelle, keinen
# Ordner, keinen Bericht des ganzen Weges.
#
# Die Datenbank wird VORHER abgezogen (vor_wiederherstellung/) und dann neu
# angelegt statt ueberschrieben: `--clean` im Abzug raeumt nur weg, was er
# selbst kennt, und eine Tabelle, die erst nach der Sicherung dazukam, bliebe
# sonst stehen -- ein Stand, den es nie gab.
if [ -n "$APP_DATENBANK" ]; then
    if ! [[ "$APP_DATENBANK" =~ ^arasul_app_[a-z0-9_]+$ ]] || [ "${#APP_DATENBANK}" -gt 63 ]; then
        protokoll "FEHLER: ${APP_DATENBANK} ist kein Name einer App-Datenbank"
        exit 2
    fi
    APP_ORDNER="${POSTGRES_DIR}/apps"
    if [ -z "$DATEI" ]; then
        ABZUG="${APP_ORDNER}/${APP_DATENBANK}_latest.sql.gz"
    else
        case "$DATEI" in
            "${APP_DATENBANK}_"*.sql.gz) ABZUG="${APP_ORDNER}/${DATEI}" ;;
            *) protokoll "FEHLER: ${DATEI} ist keine Sicherung von ${APP_DATENBANK}"
               exit 2 ;;
        esac
    fi
    if [ ! -e "$ABZUG" ]; then
        protokoll "FEHLER: keine Sicherung von ${APP_DATENBANK} (${ABZUG##*/})"
        exit 1
    fi
    ABZUG="$(readlink -f "$ABZUG")"
    if ! lies_sicherung "$ABZUG" | gunzip -t 2>/dev/null; then
        protokoll "FEHLER: ${ABZUG##*/} laesst sich nicht lesen"
        exit 1
    fi
    if [ "$PROBE" = "true" ]; then
        protokoll "Probe: ${ABZUG##*/} ist lesbar, nichts angefasst"
        exit 0
    fi
    if ! psql "${PGH[@]}" -d postgres -tAc 'SELECT 1' >/dev/null 2>&1; then
        protokoll "FEHLER: die Datenbank antwortet nicht"
        exit 1
    fi
    protokoll "Nur ${APP_DATENBANK} aus ${ABZUG##*/}"

    if grep -q 1 <<<"$(psql "${PGH[@]}" -d postgres -tAc \
         "SELECT 1 FROM pg_database WHERE datname = '${APP_DATENBANK}'" 2>/dev/null)"; then
        mkdir -p "${BACKUP_DIR}/vor_wiederherstellung"
        VOR_ABZUG="${BACKUP_DIR}/vor_wiederherstellung/${APP_DATENBANK}_vorher_$(date +%Y%m%d_%H%M%S).sql.gz"
        if pg_dump "${PGH[@]}" -d "$APP_DATENBANK" --no-owner --no-acl --clean --if-exists \
              | gzip > "$VOR_ABZUG" && gunzip -t "$VOR_ABZUG" 2>/dev/null; then
            protokoll "Stand von jetzt gesichert: $(basename "$VOR_ABZUG")"
        else
            # Hier IST es ein Abbruch, anders als beim ganzen Weg: die Datenbank
            # gibt es, sie hat Daten, und gleich faellt sie. Ohne Kopie davon
            # waere ein falscher Aufruf nicht mehr gutzumachen.
            rm -f "$VOR_ABZUG"
            protokoll "FEHLER: der Stand von jetzt liess sich nicht sichern -- nichts angefasst"
            exit 1
        fi
        psql "${PGH[@]}" -d postgres -v ON_ERROR_STOP=1 \
             -c "DROP DATABASE IF EXISTS \"${APP_DATENBANK}\" WITH (FORCE)" >>"$PROTOKOLL" 2>&1 || {
            protokoll "FEHLER: ${APP_DATENBANK} liess sich nicht neu anlegen"
            exit 1
        }
    fi
    lege_app_an "$APP_DATENBANK" "$APP_DATENBANK"
    if spiele_app_ein "$APP_DATENBANK" "$APP_DATENBANK" "$ABZUG"; then
        TABELLEN=$(psql "${PGH[@]}" -d "$APP_DATENBANK" -tAc \
          "SELECT count(*) FROM information_schema.tables
            WHERE table_type='BASE TABLE'
              AND table_schema NOT IN ('pg_catalog','information_schema')" 2>/dev/null | tr -d ' ')
        protokoll "${APP_DATENBANK}: zurueck (${TABELLEN:-?} Tabellen) in $(( $(date +%s) - START ))s"
        exit 0
    fi
    protokoll "FEHLER: ${APP_DATENBANK} liess sich nicht einspielen. Der vorige Stand liegt in ${VOR_ABZUG:-(keiner)}"
    exit 1
fi

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

# --- Erreicht? ----------------------------------------------------------------
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

# --- Die Datenbanken der Apps (Phase H7) -------------------------------------
# Seit H7 hat jede App je Stand eine eigene Datenbank im selben Cluster. Die
# NAMEN stehen im Klartext in `app_datenbanken` und sind eben zurueckgekommen;
# das PASSWORT steht daneben verschluesselt, und ein Shell-Skript kann es nicht
# lesen -- der Schluessel steckt in `JWT_SECRET` und die Verschluesselung in
# `utils/tokenCrypto.js`.
#
# Deshalb die Arbeitsteilung: hier entstehen Rolle und Datenbank mit einem
# Zufallswert, damit die Daten hineinpassen. Das RICHTIGE Passwort setzt das
# Backend beim naechsten Start (`appDatenbank.heileAlle`) -- die App im
# Container traegt noch die alte Adresse, und die soll wieder stimmen.
#
# Eine fehlende Sicherung ist hier kein Abbruch: eine App, die seit der letzten
# Nacht dazugekommen ist, hat noch keine. Sie steht dann leer da, und das ist
# richtiger als ein Weg zurueck, der an ihr scheitert.
APP_DB_ZURUECK=0
APP_DB_FEHLER=0
if [ "$DB_ZEILEN" -gt 0 ]; then
    while IFS='|' read -r APP_DB APP_ROLLE; do
        [ -n "$APP_DB" ] || continue
        lege_app_an "$APP_DB" "$APP_ROLLE"
        APP_ABZUG="${BACKUP_DIR}/postgres/apps/${APP_DB}_latest.sql.gz"
        if [ ! -e "$APP_ABZUG" ]; then
            protokoll "${APP_DB}: keine Sicherung vorhanden — leer angelegt"
            continue
        fi
        if spiele_app_ein "$APP_DB" "$APP_ROLLE" "$(readlink -f "$APP_ABZUG")"; then
            APP_DB_ZURUECK=$((APP_DB_ZURUECK + 1))
        else
            protokoll "FEHLER: ${APP_DB} liess sich nicht einspielen"
            APP_DB_FEHLER=$((APP_DB_FEHLER + 1))
        fi
    done < <(psql "${PGH[@]}" -d "$POSTGRES_DB" -tAF'|' -c \
             'SELECT datenbank, rolle FROM public.app_datenbanken ORDER BY datenbank' 2>/dev/null)
fi
if [ "$APP_DB_ZURUECK" -gt 0 ] || [ "$APP_DB_FEHLER" -gt 0 ]; then
    protokoll "App-Datenbanken: ${APP_DB_ZURUECK} zurueck, ${APP_DB_FEHLER} fehlgeschlagen"
fi

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

    # WEM GEHOEREN DIE DATEIEN JETZT?
    #
    # Dieser Dienst laeuft als root, das Backend als `node` (uid 1000). `tar`
    # legt als root die Eigentuemer aus dem Archiv wieder an, und die stimmen --
    # solange das Archiv sie kennt. Wo es sie nicht kennt (neu angelegte
    # Zwischenordner), bliebe root stehen, und der naechste Deploy derselben App
    # scheiterte beim Loeschen des Versionsordners mit EACCES: ein Fehler, der
    # Wochen spaeter auftritt und nach allem aussieht ausser nach der
    # Wiederherstellung.
    #
    # Deshalb die Regel, die ohnehin gilt: alles unter dem Ordner gehoert dem,
    # dem der Ordner gehoert.
    local eigner
    eigner=$(stat -c '%u:%g' "$ziel" 2>/dev/null)
    [ -n "$eigner" ] && chown -R "$eigner" "$ziel" 2>/dev/null

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
    entpacke_nach firmenordner "$FIRMENORDNER_ZIEL" || DATEI_FEHLER=1
    FIRMENORDNER_STATUS="$ERGEBNIS"
fi

DAUER=$(( $(date +%s) - START ))
if [ "$DATEI_FEHLER" = "1" ]; then
    schreibe_bericht teilweise "datenbank zurueck, Dateien nicht vollstaendig" "$DAUER"
    exit 1
fi
if [ "$APP_DB_FEHLER" -gt 0 ]; then
    schreibe_bericht teilweise \
        "datenbank und dateien zurueck, ${APP_DB_FEHLER} App-Datenbank(en) nicht" "$DAUER"
    exit 1
fi

# „fertig" heisst hier: die Datenbank und die Dateien sind zurueck. Ob die
# App-Container daraus wieder hochkommen, entscheidet das Backend im naechsten
# Schritt -- es baut die Images aus den eben zurueckgeholten Paketen neu. Diese
# Datei sagt darueber bewusst nichts; sie kann es nicht wissen.
schreibe_bericht fertig "datenbank und dateien zurueck" "$DAUER"
protokoll "Fertig in ${DAUER}s. Die App-Container baut das Backend neu."
exit 0
