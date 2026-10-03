#!/bin/bash
# =============================================================================
# Die naechtliche Sicherung (Phase C9 des Umbaus vom 26.08.2026, Staende seit M5)
# =============================================================================
# Vier Dinge werden gesichert, und die Frage dahinter ist jedes Mal dieselbe:
# WAS BEKOMMT DER KUNDE NACH EINEM GERAETEVERLUST NICHT ZURUECK, WENN ES HIER
# FEHLT?
#
#   postgres   Nutzer und Rollen, Apps und ihre Staende, Freigaben, Schluessel,
#              Flow-Laeufe mit Schritten, Freigabe-Anfragen, die Einstellungen
#              des Administrators je Flow, das Migrationsbuch. Das ganze
#              Datenmodell aus den Phasen B bis C8 steckt darin -- `pg_dump`
#              nimmt jedes Schema mit, es steht keine Tabellenliste im Weg.
#              DAZU JEDE APP-DATENBANK (Phase H7): seit H7 bekommt jede App je
#              Stand eine eigene Datenbank im selben Cluster, und `pg_dump` des
#              Plattform-Abzugs sieht sie nicht -- er nimmt eine Datenbank, und
#              das ist `arasul_db`. Was ein Partner in seiner App ablegt, waere
#              sonst das Einzige, was ein Geraeteverlust wirklich vernichtet.
#   apps       Die PAKETE der Apps (`/arasul/apps/<id>/<version>/`): Manifest,
#              fertiges Frontend, Dockerfile mit Kontext. Die Images werden
#              NICHT gesichert -- sie werden aus dem Paket neu gebaut, am
#              Geraet, fuer das Geraet (`services/app/appPaket.js`).
#   flows      Die Flow-Dateien unter `/arasul/flows`, die ein Mensch am Geraet
#              geschrieben hat. Die Flows, die eine App MITBRINGT, liegen im
#              App-Paket und kommen mit `apps`.
#   firmenordner
#              Die Dateien der Firma (J33, 22.09.2026). Von den vier der
#              einzige, in dem AUSSCHLIESSLICH Dinge liegen, die es nirgendwo
#              sonst gibt. Gesichert wird der BAUM der Ablage `posix` samt
#              `.oc-nodes` (die Rechte des Dienstes), nicht der Dienst.
#   config     `.env`, Zertifikate, Traefik, Geheimnisse. Ohne sie faehrt auf
#              einem leeren Geraet kein einziger Container hoch.
#
# Dazu die WAL-Segmente unter /backups/wal (Archiv von Postgres).
#
# WIE (M5, 03.10.2026): ALLES ZUSAMMEN IST EIN STAND, und ein Stand schreibt
# nur, was sich seit dem letzten geaendert hat. Werkzeug und Begruendung
# stehen in `staende.sh`. Bis M5 schrieb jede Nacht je Ziel ein ganzes `tar`
# in einen Tagesordner (`/backups/<ziel>/<ziel>_<zeit>.tar.gz`), dazu Kopien
# fuer Woche und Monat und ein `tar` des ganzen WAL-Ordners; am Orin waren das
# 17,8 GB fuer 48 Naechte. Diese Ordner werden SEIT M5 WEDER BESCHRIEBEN NOCH
# GELOESCHT: sie bleiben lesbar (`wiederherstellen.sh --datei`), bis jemand
# entscheidet, sie wegzuraeumen.
#
# Die Aufbewahrung der Staende: 7 taegliche, 12 woechentliche, 60 monatliche.
# Ist das Ziel voll, faellt der aelteste Stand, und der Bericht sagt es.
#
# DER SICHERUNGSSCHLUESSEL IST NICHT IM STAND. `config/secrets/backup_encryption_key`
# wird ausgenommen, und zwar nicht aus Vorsicht, sondern weil es sonst sinnlos
# waere: wer den Stand oeffnen will, braucht den Schluessel VORHER. Er ist der
# Wiederherstellungscode und gehoert ausserhalb des Geraets aufbewahrt
# (docs/ops/BACKUP_SYSTEM.md, Abschnitt 5a).
#
# Zurueckgespielt wird mit `wiederherstellen.sh` in diesem Ordner -- ein Weg,
# nicht drei.
# =============================================================================
set -e

# Resolve Docker secrets (_FILE env vars → regular env vars)
[ -f "$POSTGRES_PASSWORD_FILE" ] && POSTGRES_PASSWORD=$(cat "$POSTGRES_PASSWORD_FILE")

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
# Fuer das Aufraeumen der WAL-Segmente (nicht der Staende, siehe staende.sh).
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}

BACKUP_ENCRYPT=${BACKUP_ENCRYPT:-false}
BACKUP_ENCRYPT_KEY_FILE=${BACKUP_ENCRYPT_KEY_FILE:-/run/secrets/backup_encryption_key}

# EIN LAUF ZUR ZEIT. Die Nacht (cron) und „Jetzt sichern“ (Backend) wissen
# nichts voneinander; zwei Laeufe zugleich raeumten sich gegenseitig die
# Datenbankabzuege weg, waehrend der andere sie noch sichert. Der zweite
# wartet, bis der erste fertig ist (hoechstens 55 Minuten), und sichert dann
# selbst -- ein „Jetzt sichern“ soll einen Stand von JETZT ergeben.
exec 9>/backups/.sicherung.sperre
if ! timeout 3300 flock 9; then
    echo "[$TIMESTAMP] [ERROR] Eine andere Sicherung laeuft seit ueber 55 Minuten -- diese hier unterbleibt"
    exit 1
fi

STAENDE_SKRIPT="${STAENDE_SKRIPT:-/usr/local/bin/staende.sh}"
# shellcheck source=staende.sh
source "$STAENDE_SKRIPT"

# Ein Stand ist IMMER verschluesselt (restic kennt keinen Klartext). Ohne
# Schluessel gibt es deshalb keinen, und das ist ein Fehlschlag, kein stiller
# Rueckfall auf Klartext.
VERSCHLUESSELUNG_ERFOLGT=true
if [ ! -f "$BACKUP_ENCRYPT_KEY_FILE" ]; then
    echo "[$TIMESTAMP] [ERROR] Der Sicherungsschluessel fehlt (${BACKUP_ENCRYPT_KEY_FILE}) -- ohne ihn entsteht kein Stand"
    VERSCHLUESSELUNG_ERFOLGT=false
fi

# -----------------------------------------------------------------------------
# Passt der Schluessel zu dem, was schon da ist? (J37, 02.10.2026)
# -----------------------------------------------------------------------------
# Anlass: Koljas Sicherung der Belege-App auf den Mac fiel vom 26.09. bis
# 01.10.2026 still aus, 146 Ausfaelle im Log. Die Neuinstallation hatte einen
# NEUEN Schluessel erzeugt (`config/secrets/` wird beim Werksreset geloescht);
# was danach lief, war mit dem neuen Schluessel verschluesselt, was auf dem
# Stick lag, mit dem alten -- und nichts hat das gesagt.
#
# SEIT M5 hat jeder Schluessel sein eigenes Repo (`staende-<abdruck>`). Die
# Frage lautet deshalb: liegt neben dem Repo dieses Schluessels eines mit
# einem ANDEREN Schluessel, das neuer ist? Dann passt der Schluessel nicht zur
# letzten Sicherung. Ohne Repo auf einer Seite gilt dort wie bisher der
# neueste Datenbankabzug der Tagesordner.
#
# GEPRUEFT WIRD VOR DER NEUEN SICHERUNG, denn danach waere das neueste Repo
# immer das mit dem jetzigen Schluessel und die Pruefung immer gruen.
#
# Das Ergebnis steht in `/backups/schluessel_pruefung.json`; das Dashboard
# zeigt es im Admin-Bereich, und das Backend schickt dem Admin eine Mitteilung
# (`services/betrieb/schluesselWaechter.js`). Diese Pruefung bricht die
# Sicherung NICHT ab: ein neuer Stand mit dem jetzigen Schluessel ist besser
# als keiner.
EXTERN_ZIEL=${BACKUP_EXTERN_ZIEL:-/arasul/extern}
EXTERN_AN=${BACKUP_EXTERN_AN:-auto}

abdruck_des_schluessels() {
    stand_abdruck "$BACKUP_ENCRYPT_KEY_FILE" 2>/dev/null || printf ''
}

ist_verschluesselt() {
    [ "$(head -c 8 "$1" 2>/dev/null)" = "Salted__" ]
}

passt_zum_schluessel() {
    [ -f "$BACKUP_ENCRYPT_KEY_FILE" ] || return 1
    [ "$(openssl enc -d -aes-256-cbc -pbkdf2 -in "$1" -pass "file:${BACKUP_ENCRYPT_KEY_FILE}" 2>/dev/null \
        | head -c 2 | od -An -tx1 | tr -d ' \n')" = "1f8b" ]
}

# Liegt das Ziel wirklich ausserhalb? (Geraetenummer, siehe sichere_nach_aussen.)
extern_ist_draussen() {
    [ "$EXTERN_AN" = "false" ] && return 1
    [ -d "$EXTERN_ZIEL" ] || return 1
    local dev_ziel dev_hier
    dev_ziel=$(stat -c %d "$EXTERN_ZIEL" 2>/dev/null || echo "")
    dev_hier=$(stat -c %d /backups 2>/dev/null || echo "")
    [ -n "$dev_ziel" ] && [ "$dev_ziel" != "$dev_hier" ]
}

# Die juengste Aenderung unter `snapshots/` eines Repos, Sekunden seit 1970.
# Lesbar auch OHNE dessen Schluessel -- genau dafuer: ein fremdes Repo laesst
# sich nicht oeffnen, aber man sieht, wann zuletzt hineingeschrieben wurde.
repo_zuletzt() {
    find "$1/snapshots" -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -n1 | cut -d. -f1
}

# $1 = Wurzel mit `staende-*`. Setzt BEWERTUNG_* wie bewerte_sicherungen.
bewerte_repos() {
    local wurzel="$1" eigenes repo zeit eigene_zeit=0 fremd_zeit=0 fremd_name=""
    BEWERTUNG_NEUESTE=""
    BEWERTUNG_PASST=null
    BEWERTUNG_LESBAR=0
    BEWERTUNG_UNLESBAR=0
    eigenes=$(stand_repo "$wurzel" "$BACKUP_ENCRYPT_KEY_FILE" 2>/dev/null || echo "")
    while IFS= read -r repo; do
        [ -n "$repo" ] || continue
        zeit=$(repo_zuletzt "$repo")
        zeit=${zeit:-0}
        if [ "$repo" = "$eigenes" ] && stand_oeffnet "$repo" "$BACKUP_ENCRYPT_KEY_FILE"; then
            BEWERTUNG_LESBAR=$(find "$repo/snapshots" -type f 2>/dev/null | wc -l)
            eigene_zeit=$zeit
        else
            BEWERTUNG_UNLESBAR=$((BEWERTUNG_UNLESBAR + $(find "$repo/snapshots" -type f 2>/dev/null | wc -l)))
            if [ "$zeit" -gt "$fremd_zeit" ]; then
                fremd_zeit=$zeit
                fremd_name=$(basename "$repo")
            fi
        fi
    done <<<"$(stand_repos "$wurzel")"
    if [ "$fremd_zeit" -gt "$eigene_zeit" ]; then
        BEWERTUNG_PASST=false
        BEWERTUNG_NEUESTE="$fremd_name"
    elif [ "$BEWERTUNG_LESBAR" -gt 0 ]; then
        BEWERTUNG_PASST=true
        BEWERTUNG_NEUESTE="$(basename "$eigenes")"
    fi
}

# $1 = Dateien, eine Zeile je Datei, aelteste zuerst. Setzt BEWERTUNG_* .
# (Die Tagesordner von vor M5.)
bewerte_sicherungen() {
    BEWERTUNG_NEUESTE=""
    BEWERTUNG_PASST=null
    BEWERTUNG_LESBAR=0
    BEWERTUNG_UNLESBAR=0
    local datei
    while IFS= read -r datei; do
        [ -n "$datei" ] && [ -f "$datei" ] || continue
        BEWERTUNG_NEUESTE="$(basename "$datei")"
        if ! ist_verschluesselt "$datei" || passt_zum_schluessel "$datei"; then
            BEWERTUNG_LESBAR=$((BEWERTUNG_LESBAR + 1))
            BEWERTUNG_PASST=true
        else
            BEWERTUNG_UNLESBAR=$((BEWERTUNG_UNLESBAR + 1))
            BEWERTUNG_PASST=false
        fi
    done <<<"$1"
}

APP_ZEILEN=""
SCHLUESSEL_PASST=null
pruefe_schluessel() {
    local lokal_liste extern_liste
    if [ -n "$(stand_repos /backups)" ]; then
        bewerte_repos /backups
    else
        lokal_liste=$(find /backups/postgres -maxdepth 1 -name 'arasul_db_*.sql.gz' ! -name '*latest*' 2>/dev/null | sort | tail -n 60)
        bewerte_sicherungen "$lokal_liste"
    fi
    local l_neueste="$BEWERTUNG_NEUESTE" l_passt="$BEWERTUNG_PASST" l_lesbar="$BEWERTUNG_LESBAR" l_unlesbar="$BEWERTUNG_UNLESBAR"

    local e_neueste="" e_passt=null e_lesbar=0 e_unlesbar=0
    if extern_ist_draussen; then
        if [ -n "$(stand_repos "$EXTERN_ZIEL/arasul-sicherung")" ]; then
            bewerte_repos "$EXTERN_ZIEL/arasul-sicherung"
        else
            extern_liste=$(find "$EXTERN_ZIEL/arasul-sicherung" -mindepth 2 -maxdepth 2 -name 'arasul_db_*.sql.gz' 2>/dev/null \
                | awk -F/ '{print $(NF-1) "/" $NF "\t" $0}' | sort | tail -n 60 | cut -f2)
            bewerte_sicherungen "$extern_liste"
        fi
        e_neueste="$BEWERTUNG_NEUESTE"; e_passt="$BEWERTUNG_PASST"; e_lesbar="$BEWERTUNG_LESBAR"; e_unlesbar="$BEWERTUNG_UNLESBAR"
    fi

    local passt=null grund=""
    if [ "$l_passt" = false ] || [ "$e_passt" = false ]; then
        passt=false
        if [ ! -f "$BACKUP_ENCRYPT_KEY_FILE" ]; then
            grund="Der Sicherungsschluessel dieses Geraets fehlt."
        elif [ "$e_passt" = false ]; then
            grund="Der Schluessel dieses Geraets passt nicht zur letzten Sicherung auf dem Datentraeger (${e_neueste})."
        else
            grund="Der Schluessel dieses Geraets passt nicht zur letzten Sicherung (${l_neueste})."
        fi
    elif [ "$l_passt" = true ] || [ "$e_passt" = true ]; then
        passt=true
    fi
    SCHLUESSEL_PASST="$passt"
    # Wird der Stick nicht gelesen (nicht angesteckt), steht das als `null`,
    # nicht als `true`: „nicht geprueft" ist keine Zusage.

    jq -n \
        --arg zeitpunkt "$(date -Iseconds)" \
        --arg abdruck "$(abdruck_des_schluessels)" \
        --argjson passt "$passt" \
        --arg grund "$grund" \
        --arg l_neueste "$l_neueste" --argjson l_passt "$l_passt" \
        --argjson l_lesbar "$l_lesbar" --argjson l_unlesbar "$l_unlesbar" \
        --arg e_neueste "$e_neueste" --argjson e_passt "$e_passt" \
        --argjson e_lesbar "$e_lesbar" --argjson e_unlesbar "$e_unlesbar" \
        '{zeitpunkt:$zeitpunkt, abdruck:$abdruck, passt:$passt, grund:$grund,
          lokal:{neueste:(if $l_neueste=="" then null else $l_neueste end), passt:$l_passt, lesbar:$l_lesbar, unlesbar:$l_unlesbar},
          extern:{neueste:(if $e_neueste=="" then null else $e_neueste end), passt:$e_passt, lesbar:$e_lesbar, unlesbar:$e_unlesbar},
          aeltere_unlesbar:($l_unlesbar + $e_unlesbar)}' \
        > /backups/schluessel_pruefung.json.neu \
        && mv -f /backups/schluessel_pruefung.json.neu /backups/schluessel_pruefung.json
    if [ "$passt" = false ]; then
        echo "[$TIMESTAMP] [ERROR] ${grund}"
    fi
}
pruefe_schluessel || echo "[$TIMESTAMP] [WARNING] Schluesselpruefung selbst ist gescheitert"

echo "[$TIMESTAMP] Starting backup..."
BACKUP_OK=true

# -----------------------------------------------------------------------------
# Die Datenbanken, als Abzug in die Quelle des Stands
# -----------------------------------------------------------------------------
# UNKOMPRIMIERT und unter festem Namen (`arasul_db.sql`, `apps/<db>.sql`): so
# erkennt restic jede Nacht die Bloecke wieder, die sich nicht geaendert haben.
# Ein gzip davor machte aus einer geaenderten Zeile eine ganz neue Datei.
# Die Abzuege liegen nur waehrend des Laufs hier und gehen am Ende weg.
rm -rf "$STAND_DB_QUELLE"
mkdir -p "$STAND_DB_QUELLE/apps"
# `*` als Datenbank und nicht `$POSTGRES_DB`: seit H7 wird auch je App eine
# Datenbank im selben Cluster abgezogen, und ein Eintrag, der nur `arasul_db`
# nennt, gaebe dort kein Passwort her.
echo "$POSTGRES_HOST:${POSTGRES_PORT:-5432}:*:$POSTGRES_USER:$POSTGRES_PASSWORD" > ~/.pgpass
chmod 600 ~/.pgpass
PG_BYTES=0
# Ein vollstaendiger Abzug endet mit dieser Zeile; ein abgebrochener nicht.
# `<<<` und nicht `| grep -q`: siehe scripts/test/rohrbruch.py.
abzug_vollstaendig() {
    grep -q 'PostgreSQL database dump complete' <<<"$(tail -n 10 "$1")"
}
if pg_dump \
  -h "$POSTGRES_HOST" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner --no-acl --clean --if-exists \
  > "$STAND_DB_QUELLE/arasul_db.sql"; then
    PG_BYTES=$(stat -c%s "$STAND_DB_QUELLE/arasul_db.sql" 2>/dev/null || echo "0")
    if [ "$PG_BYTES" -gt 100 ] 2>/dev/null && abzug_vollstaendig "$STAND_DB_QUELLE/arasul_db.sql"; then
        echo "[$TIMESTAMP] PostgreSQL-Abzug vollstaendig (${PG_BYTES} Bytes)"
    else
        echo "[$TIMESTAMP] [ERROR] PostgreSQL-Abzug unvollstaendig (${PG_BYTES} Bytes)"
        BACKUP_OK=false
    fi
else
    echo "[$TIMESTAMP] [ERROR] PostgreSQL backup failed"
    BACKUP_OK=false
fi

# -----------------------------------------------------------------------------
# Die Datenbanken der Apps (Phase H7)
# -----------------------------------------------------------------------------
# GEFRAGT WIRD DER CLUSTER, NICHT DIE TABELLE. Die Namen stuenden auch in
# `app_datenbanken`, aber eine Sicherung, die eine Tabelle fragt, sichert nur,
# was dort steht -- und eine Datenbank, deren Zeile jemand verloren hat, waere
# unsichtbar UND unwiederbringlich. Der Praefix ist die Wahrheit; er ist
# dieselbe Zeichenkette wie `PRAEFIX` in `services/app/appDatenbank.js`.
#
# EIN FEHLSCHLAG HIER IST EIN FEHLSCHLAG. Eine Datenbank, die der Cluster gerade
# genannt hat, muss sich auch abziehen lassen. Ein Geraet ohne Apps hat null
# davon und laeuft still durch.
APP_DBS=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
  "SELECT datname FROM pg_database WHERE datname LIKE 'arasul\\_app\\_%' ORDER BY datname" \
  2>/dev/null || true)
APP_DB_ANZAHL=0
for APP_DB in $APP_DBS; do
    ZIEL="$STAND_DB_QUELLE/apps/${APP_DB}.sql"
    if pg_dump -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$APP_DB" \
         --no-owner --no-acl --clean --if-exists > "$ZIEL" \
       && abzug_vollstaendig "$ZIEL"; then
        APP_DB_ANZAHL=$((APP_DB_ANZAHL + 1))
    else
        echo "[$TIMESTAMP] [ERROR] App-Datenbank ${APP_DB} liess sich nicht sichern"
        rm -f "$ZIEL"
        BACKUP_OK=false
    fi
done
# `|| true`: unter `set -e` beendet ein `[ ] && echo` mit falschem Test das
# Skript -- und null App-Datenbanken sind der Normalfall auf einem neuen Geraet.
[ "$APP_DB_ANZAHL" -gt 0 ] && echo "[$TIMESTAMP] ${APP_DB_ANZAHL} App-Datenbank(en) abgezogen" || true
# Welche App welche Datenbank hat (J37): das Manifest auf dem Datentraeger
# braucht die Zuordnung, weil sich aus dem Namen der Datenbank die Kennung der
# App nicht sicher zurueckrechnen laesst (Bindestrich, langer Name mit Abdruck).
APP_ZEILEN=$(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAF'|' -c \
  "SELECT app_id, stand, datenbank FROM public.app_datenbanken ORDER BY app_id, stand" \
  2>/dev/null || true)
rm -f ~/.pgpass

# Bis zum 26.08.2026 stand hier die MinIO-Sicherung (Phase B4 des Rueckbaus:
# der Objektspeicher ist weg, kein Dienst schreibt mehr hinein).

# -----------------------------------------------------------------------------
# Was in den Stand geht
# -----------------------------------------------------------------------------
# EIN FEHLENDER ORDNER IST EINE WARNUNG, KEIN FEHLSCHLAG: aeltere Staende haben
# den Mount nicht, und ein Geraet ohne eine einzige App hat kein
# `/arasul/apps`. BACKUP_OK dort umzulegen hiesse, den Healthcheck auf einem
# gesunden Geraet rot zu faerben. Der Bericht sagt je Ziel `skipped`.
APPS_SRC=${APPS_BACKUP_DIR:-/arasul/apps}
FLOWS_SRC=${FLOWS_BACKUP_DIR:-/arasul/flows}
FIRMENORDNER_SRC=${FIRMENORDNER_BACKUP_DIR:-/arasul/firmenordner}
CONFIG_SRC=${CONFIG_BACKUP_DIR:-/arasul/konfiguration}
WAL_SRC=/backups/wal

QUELLEN=("$STAND_DB_QUELLE")
APPS_OK=skipped
FLOWS_OK=skipped
FIRMENORDNER_OK=skipped
CONFIG_OK=skipped
for paar in "apps:$APPS_SRC" "flows:$FLOWS_SRC" "firmenordner:$FIRMENORDNER_SRC" "config:$CONFIG_SRC"; do
    name="${paar%%:*}"
    quelle="${paar#*:}"
    if [ -d "$quelle" ]; then
        QUELLEN+=("$quelle")
        printf -v "$(printf '%s' "$name" | tr '[:lower:]' '[:upper:]')_OK" '%s' dabei
    else
        echo "[$TIMESTAMP] [WARNING] ${name}: ${quelle} nicht eingehaengt — uebersprungen"
    fi
done
WAL_COUNT=0
if [ -d "$WAL_SRC" ] && [ -n "$(ls -A "$WAL_SRC" 2>/dev/null)" ]; then
    QUELLEN+=("$WAL_SRC")
    WAL_COUNT=$(find "$WAL_SRC" -maxdepth 1 -type f | wc -l)
fi

# Nicht in den Stand:
#   - `.eingang` unter den Apps: dort liegt, was ein Deploy gerade auspackt
#     oder als Bruchstueck hinterlassen hat (`services/app/appPaket.js`).
#   - der Sicherungsschluessel (siehe Kopf).
STAND_AUSSCHLUESSE=(
    "${APPS_SRC}/.eingang"
    "${CONFIG_SRC}/config/secrets/backup_encryption_key"
)

# EIN STAND VOR DEM ZURUECKHOLEN (Auftrag sicherung-zurueckholen, M5). Das
# Backend ruft diesen Lauf vor jedem Zurueckholen mit
# ARASUL_STAND_ANLASS=vorher und ARASUL_STAND_FUER=app:<id>|bereich:<k>|geraet
# auf. Es ist ein ganz normaler Stand, nur mit zwei Tags mehr: `vorher` haelt
# ihn aus der Aufbewahrung 7/12/60 heraus (staende.sh, stand_aufbewahren), und
# `fuer:…` sagt der Oberflaeche, wovor er entstand. Mit ihm laesst sich das
# Zurueckholen selbst rueckgaengig machen -- auf demselben Weg.
STAND_EXTRA_TAGS=()
if [ "${ARASUL_STAND_ANLASS:-}" = vorher ]; then
    STAND_EXTRA_TAGS+=(vorher)
    if [[ "${ARASUL_STAND_FUER:-}" =~ ^(app:[a-z0-9][a-z0-9-]{0,63}|bereich:[a-z0-9][a-z0-9-]{0,63}|geraet)$ ]]; then
        STAND_EXTRA_TAGS+=("fuer:${ARASUL_STAND_FUER}")
    fi
    echo "[$TIMESTAMP] Stand vor dem Zurueckholen (${ARASUL_STAND_FUER:-ohne Angabe})"
fi

# -----------------------------------------------------------------------------
# Der Stand auf diesem Geraet
# -----------------------------------------------------------------------------
# WER WAEHREND DES LAUFS SCHREIBT, LAESST DIE SICHERUNG NICHT SCHEITERN (J35,
# 27.09.2026). Am Orin schrieb der Abgleich eines Rechners knapp tausend Dateien
# in den Firmenordner, waehrend gesichert wurde. restic liest jede Datei so,
# wie sie in dem Moment ist; eine, die verschwindet, waehrend es liest, macht
# Rueckgabe 3 („Stand steht, einzelne Dateien nicht gelesen"), und das ist
# hier kein Fehlschlag. WAS sich bewegt hat, steht im Bericht
# (`firmenordner_geaendert`, `firmenordner_geaendert_dateien`) -- eine Datei,
# die erst waehrend des Laufs kam, ist vielleicht nicht im Stand, und das muss
# man sehen koennen, statt es zu vermuten.
#
# Gefragt wird nach der CTIME und nicht nach der mtime: der Abgleichsklient
# setzt die mtime einer Datei auf die seines Rechners, eine gerade abgelegte
# Datei kann also "von gestern" sein. Die ctime setzt nur der Kern.
STAND_REPO=""
STAND_STATUS=fehler
STAND_HINWEIS=""
STAND_LOKAL_ID=""
STAND_LOKAL_GESCHRIEBEN=0
STAND_LOKAL_GELESEN=0
STAND_LOKAL_ENTFALLEN=0
STAND_LOKAL_PLATZ=""
FIRMENORDNER_GEAENDERT=0
FIRMENORDNER_GEAENDERT_DATEIEN='[]'

if [ "$VERSCHLUESSELUNG_ERFOLGT" = true ]; then
    STAND_REPO=$(stand_repo /backups "$BACKUP_ENCRYPT_KEY_FILE")
    STEMPEL=$(mktemp)
    STAND_ENTFALLEN_PLATZ=""
    if stand_sichern "$STAND_REPO" "$BACKUP_ENCRYPT_KEY_FILE" "${QUELLEN[@]}"; then
        STAND_STATUS=ok
        STAND_LOKAL_ID="$STAND_ID"
        STAND_LOKAL_GESCHRIEBEN="$STAND_GESCHRIEBEN"
        STAND_LOKAL_GELESEN="$STAND_GELESEN"
        echo "[$TIMESTAMP] Stand ${STAND_ID:0:8}: ${STAND_GELESEN} Bytes gelesen, ${STAND_GESCHRIEBEN} Bytes neu geschrieben"
        stand_aufbewahren "$STAND_REPO" "$BACKUP_ENCRYPT_KEY_FILE" || echo "[$TIMESTAMP] [WARNING] Aufbewahrung liess sich nicht anwenden"
        STAND_LOKAL_ENTFALLEN="${STAND_ENTFALLEN:-0}"
        [ "$STAND_LOKAL_ENTFALLEN" -gt 0 ] && echo "[$TIMESTAMP] Aufbewahrung: ${STAND_LOKAL_ENTFALLEN} Stand/Staende entfallen (${STAND_TAGE} Tage, ${STAND_WOCHEN} Wochen, ${STAND_MONATE} Monate)" || true
    else
        echo "[$TIMESTAMP] [ERROR] Der Stand liess sich nicht anlegen: ${STAND_FEHLER}"
        [ "$STAND_VOLL" = true ] && STAND_STATUS=voll
        BACKUP_OK=false
    fi
    STAND_LOKAL_PLATZ="$STAND_ENTFALLEN_PLATZ"
    if [ -d "$FIRMENORDNER_SRC" ]; then
        GEAENDERT=$(find "$FIRMENORDNER_SRC" -mindepth 1 -type f -cnewer "$STEMPEL" -printf './%P\n' 2>/dev/null | sort -u || true)
        if [ -n "$GEAENDERT" ]; then
            FIRMENORDNER_GEAENDERT=$(printf '%s\n' "$GEAENDERT" | wc -l)
            FIRMENORDNER_GEAENDERT_DATEIEN=$(printf '%s\n' "$GEAENDERT" | head -n 100 | jq -R . | jq -sc .)
            echo "[$TIMESTAMP] firmenordner: ${FIRMENORDNER_GEAENDERT} Datei(en) haben sich waehrend des Laufs geaendert"
        fi
    fi
    rm -f "$STEMPEL"
else
    BACKUP_OK=false
fi

# Je Ziel: war es dabei, und steht der Stand?
for name in APPS FLOWS FIRMENORDNER CONFIG; do
    feld="${name}_OK"
    if [ "${!feld}" = dabei ]; then
        if [ "$STAND_STATUS" = ok ]; then
            printf -v "$feld" '%s' true
        else
            printf -v "$feld" '%s' false
        fi
    fi
done
if [ -n "$STAND_LOKAL_PLATZ" ]; then
    STAND_HINWEIS="Auf diesem Geraet war kein Platz mehr: $(printf '%s' "$STAND_LOKAL_PLATZ" | grep -c .) aelteste(r) Stand/Staende sind entfallen."
fi

# -----------------------------------------------------------------------------
# Der Stand ausserhalb des Geraets (Entscheidung Kolja, 27.08.2026; M5)
# -----------------------------------------------------------------------------
# Eine Sicherung, die auf derselben Platte liegt wie das Original, ueberlebt
# genau die Faelle nicht, fuer die es sie gibt: Diebstahl, Feuer, Platte tot.
# Deshalb ein Ziel AUSSERHALB -- eine SSD, ein USB-Stick oder eine SMB-Freigabe
# im Kundennetz, eingehaengt vom Betriebssystem und hier nur als Ordner sichtbar.
#
# KEIN CLOUD-ZIEL. Nicht aus Bequemlichkeit weggelassen: das Geraet steht beim
# Kunden, die Daten bleiben dort, und ein Ziel, das eine Zugangskennung zu
# einem fremden Rechenzentrum braucht, waere genau der Bruch, den die
# Datenschutzzusage dieses Produkts nicht macht.
#
# EINGEHAENGT WIRD NICHT HIER. Ob der Datentraeger steckt, entscheidet das
# Betriebssystem des Geraets. Dieser Dienst schaut nach, ob unter dem Ziel
# etwas Beschreibbares liegt, und sagt sonst, dass es fehlt.
#
# WAS BEIM MISSLINGEN PASSIERT: nichts Rotes. Ein abgezogener Stick ist der
# Normalfall im Alltag und darf die naechtliche Sicherung nicht als
# fehlgeschlagen melden. Sichtbar bleibt es trotzdem: der Bericht sagt, wann
# der letzte Stand ausserhalb entstanden ist (`/api/backup/status`).
#
# SEIT M5 IST AUCH DAS EIN STAND, kein Tagesordner mit Kopien: dasselbe
# Repo-Format, dieselbe Aufbewahrung, und je Nacht wandert nur, was sich
# geaendert hat, auf den Datentraeger. Aufbau dort:
#
#   arasul-sicherung/staende-<abdruck>/   das Repo (restic, nur Chiffrat)
#   arasul-sicherung/MANIFEST.json        Klartext: Apps, Staende mit Zeit,
#                                         Abdruck des Schluessels, Groesse
#   arasul-sicherung/<JJJJMMTT>/          Tagesordner von vor M5, unangetastet
#
# Das Manifest erlaubt dem Dashboard, dem Admin die Apps auf dem Datentraeger
# zu zeigen, ohne den Schluessel zu haben.
#
# NUR VERSCHLUESSELTES LIEGT AUF DEM DATENTRAEGER (J37). Nach jedem Lauf wird
# jede Datei unter `arasul-sicherung/` geprueft (`stand_klartext`); jede, die
# nicht nach Chiffrat aussieht, zaehlt in `extern_klartext`, und eine Zahl
# ueber null ist ein Fehlschlag der ganzen Sicherung.
#
# IST DER DATENTRAEGER VOLL, faellt dort der aelteste Stand, mit Hinweis. Nur
# im Repo des jetzigen Schluessels: ein Repo eines frueheren Schluessels ist
# vielleicht das Einzige, was sich mit dem frueheren Code noch oeffnen laesst,
# und bleibt unangetastet.
EXTERN_STATUS=kein_ziel
EXTERN_KOPIERT=0
EXTERN_BYTES=0
EXTERN_KLARTEXT=0
EXTERN_FREI=0
EXTERN_STAND_ID=""
EXTERN_GESCHRIEBEN=0
EXTERN_PLATZ=""

art_der_datei() {
    case "$(basename "$1")" in
        arasul_db*) echo postgres ;;
        arasul_app_*) echo app-datenbank ;;
        apps_*) echo apps ;;
        flows_*) echo flows ;;
        firmenordner_*) echo firmenordner ;;
        config_*) echo config ;;
        *) echo sonstiges ;;
    esac
}

# Die Apps: aus der Tabelle (id, Stand, Datenbank) UND aus den Ordnern unter
# /arasul/apps -- eine App ohne Datenbank gibt es auch.
apps_als_json() {
    local ids
    ids=$(find "${APPS_SRC:-/arasul/apps}" -mindepth 1 -maxdepth 1 -type d ! -name '.*' -printf '%f\n' 2>/dev/null | sort)
    {
        printf '%s\n' "$APP_ZEILEN" | awk -F'|' 'NF==3 {print "z\t" $1 "\t" $2 "\t" $3}'
        printf '%s\n' "$ids" | awk 'NF {print "i\t" $1 "\t\t"}'
    } | jq -R -s -c '
        split("\n") | map(select(length>0) | split("\t")) as $z
        | ($z | map(.[1]) | unique) as $ids
        | $ids | map(. as $id | {
            id: $id,
            staende: [$z[] | select(.[0]=="z" and .[1]==$id) | .[2]],
            datenbanken: [$z[] | select(.[0]=="z" and .[1]==$id) | .[3]]
          })'
}

# Das Manifest auf dem Datentraeger: was WIRKLICH im Repo steht (die Staende)
# und welche Apps es kennt.
schreibe_manifest() {
    local wurzel="$1" repo="$2" staende apps_json dateien_json
    # Mit dem Inhalt je Stand: was die vorige Fassung schon wusste, bleibt.
    staende=$(stand_liste_mit_inhalt "$repo" "$BACKUP_ENCRYPT_KEY_FILE" \
        "$(jq -c '.staende // []' "${wurzel}/MANIFEST.json" 2>/dev/null || echo '[]')" 2>/dev/null || echo '[]')
    apps_json=$(apps_als_json)
    dateien_json=$(
        for datei in "$STAND_DB_QUELLE"/arasul_db.sql "$STAND_DB_QUELLE"/apps/*.sql; do
            [ -f "$datei" ] || continue
            printf '%s\t%s\t%s\n' "$(basename "$datei")" "$(stat -c%s "$datei" 2>/dev/null || echo 0)" "$(art_der_datei "$datei")"
        done | jq -R -s -c 'split("\n") | map(select(length>0) | split("\t") | {name:.[0], bytes:(.[1]|tonumber), art:.[2]})'
    )
    jq -n \
        --arg zeitpunkt "$(date -Iseconds)" \
        --arg abdruck "$(abdruck_des_schluessels)" \
        --arg repo "$(basename "$repo")" \
        --argjson staende "${staende:-[]}" \
        --argjson apps "${apps_json:-[]}" \
        --argjson dateien "${dateien_json:-[]}" \
        --argjson bytes "$(( $(stand_groesse_kb "$repo") * 1024 ))" \
        '{zeitpunkt:$zeitpunkt, abdruck:$abdruck, repo:$repo, apps:$apps, dateien:$dateien, bytes:$bytes,
          staende:($staende | map({id, kurz, zeit, vorher, fuer, inhalt}))}' \
        > "${wurzel}/.MANIFEST.neu" && mv -f "${wurzel}/.MANIFEST.neu" "${wurzel}/MANIFEST.json"
}

sichere_nach_aussen() {
    # Der Stand vor einem Zurueckholen bleibt auf dem Geraet: er ist der Weg,
    # das Zurueckholen rueckgaengig zu machen, und der geht von hier. Auf dem
    # Datentraeger waere er ausserdem der neueste Stand -- und ein Zurueckholen
    # vom Datentraeger ohne genannten Stand naehme dann ihn statt der Sicherung.
    if [ "${ARASUL_STAND_ANLASS:-}" = vorher ]; then
        EXTERN_STATUS=vorher
        return 0
    fi
    if [ "$EXTERN_AN" = "false" ]; then
        EXTERN_STATUS=abgeschaltet
        return 0
    fi
    if [ ! -d "$EXTERN_ZIEL" ]; then
        EXTERN_STATUS=kein_ziel
        echo "[$TIMESTAMP] Kein Ziel ausserhalb eingehaengt — nur lokal gesichert"
        return 0
    fi
    # LIEGT DAS ZIEL WIRKLICH AUSSERHALB? Das ist keine Formalie, sondern die
    # ganze Zusage dieses Abschnitts. Ein Bind-Mount auf einen Host-Pfad, den
    # niemand eingehaengt hat, legt Docker als leeren Ordner an -- er ist da,
    # er nimmt Dateien an, und die Kopie laege auf derselben Platte wie das
    # Original. Erkannt wird an der GERAETENUMMER des Dateisystems.
    if ! extern_ist_draussen; then
        EXTERN_STATUS=nicht_eingehaengt
        echo "[$TIMESTAMP] Kein Datentraeger angesteckt (das Ziel liegt auf derselben Platte wie das Geraet) — nur lokal gesichert"
        return 0
    fi
    # Ein Ordner, der da ist, aber nichts annimmt, ist kein Ziel. Genau so
    # sieht ein Mountpunkt aus, dessen Datentraeger abgezogen wurde (oder ein
    # schreibgeschuetzter): der Ordner bleibt, das Schreiben schlaegt fehl.
    if ! touch "${EXTERN_ZIEL}/.arasul_schreibprobe" 2>/dev/null; then
        EXTERN_STATUS=nicht_beschreibbar
        echo "[$TIMESTAMP] [WARNING] Der Datentraeger nimmt nichts an (schreibgeschuetzt oder abgezogen?)"
        return 0
    fi
    rm -f "${EXTERN_ZIEL}/.arasul_schreibprobe"
    if [ "$VERSCHLUESSELUNG_ERFOLGT" != true ]; then
        EXTERN_STATUS=nur_verschluesselt
        echo "[$TIMESTAMP] [ERROR] Ohne Schluessel kein Stand -- der Datentraeger bleibt, wie er ist"
        return 0
    fi

    local wurzel="${EXTERN_ZIEL}/arasul-sicherung" repo
    mkdir -p "$wurzel" || { EXTERN_STATUS=fehler; return 0; }
    repo=$(stand_repo "$wurzel" "$BACKUP_ENCRYPT_KEY_FILE")
    STAND_ENTFALLEN_PLATZ=""
    if stand_sichern "$repo" "$BACKUP_ENCRYPT_KEY_FILE" "${QUELLEN[@]}"; then
        EXTERN_STAND_ID="$STAND_ID"
        EXTERN_GESCHRIEBEN="$STAND_GESCHRIEBEN"
        stand_aufbewahren "$repo" "$BACKUP_ENCRYPT_KEY_FILE" || true
        EXTERN_STATUS=kopiert
    elif [ "$STAND_VOLL" = true ]; then
        EXTERN_STATUS=zu_wenig_platz
        echo "[$TIMESTAMP] [ERROR] Auf dem Datentraeger ist zu wenig Platz: ${STAND_FEHLER}"
    else
        EXTERN_STATUS=fehler
        echo "[$TIMESTAMP] [WARNING] Stand ausserhalb nicht angelegt: ${STAND_FEHLER}"
    fi
    EXTERN_PLATZ="$STAND_ENTFALLEN_PLATZ"
    # `sync`, bevor der Bericht behauptet, der Stand liege draussen. Ohne das
    # steht er im Schreibpuffer des Geraets, und wer den Stick jetzt abzieht,
    # nimmt eine halbe Datei mit.
    sync
    schreibe_manifest "$wurzel" "$repo" || true

    # DIE PROBE, DIE DIE ZUSAGE BELEGT.
    stand_klartext "$wurzel"
    EXTERN_KLARTEXT=$STAND_KLARTEXT
    if [ "$EXTERN_KLARTEXT" -gt 0 ]; then
        printf '%s' "$STAND_KLARTEXT_DATEIEN" | head -n 20 | while IFS= read -r datei; do
            echo "[$TIMESTAMP] [ERROR] ${datei#"$EXTERN_ZIEL"/} auf dem Datentraeger ist NICHT verschluesselt"
        done
        EXTERN_STATUS=fehler
        BACKUP_OK=false
    fi
    local frei_kb groesse_kb
    frei_kb=$(stand_frei_kb "$wurzel")
    groesse_kb=$(stand_groesse_kb "$repo")
    EXTERN_FREI=$(( ${frei_kb:-0} * 1024 ))
    EXTERN_BYTES=$(( ${groesse_kb:-0} * 1024 ))
    [ "$EXTERN_STATUS" = kopiert ] || return 0

    EXTERN_KOPIERT=$(jq '.staende | length' "${wurzel}/MANIFEST.json" 2>/dev/null || echo 0)
    echo "[$TIMESTAMP] Stand ausserhalb ${EXTERN_STAND_ID:0:8}: ${EXTERN_GESCHRIEBEN} Bytes neu geschrieben, ${EXTERN_KOPIERT} Staende, alle verschluesselt -> arasul-sicherung/$(basename "$repo")"

    # Der Merker steht in einer EIGENEN Datei und nicht nur im Tagesbericht.
    # Grund: die Frage lautet "wann lag zuletzt ein Stand ausserhalb", und die
    # Antwort darf nicht verschwinden, sobald der Stick eine Nacht abgezogen
    # ist. Der Tagesbericht wird jede Nacht ueberschrieben, diese Datei nur
    # dann, wenn wirklich gesichert wurde.
    jq -n \
        --arg zeitpunkt "$(date -Iseconds)" \
        --arg ziel "arasul-sicherung/$(basename "$repo")" \
        --argjson dateien "$EXTERN_KOPIERT" \
        --argjson bytes "$EXTERN_BYTES" \
        --argjson geschrieben "$EXTERN_GESCHRIEBEN" \
        --arg stand "$EXTERN_STAND_ID" \
        --slurpfile manifest "${wurzel}/MANIFEST.json" \
        '{zeitpunkt:$zeitpunkt, ziel:$ziel, ordner:$ziel, dateien:$dateien, staende:$dateien, bytes:$bytes,
          geschrieben:$geschrieben, stand:$stand, apps:($manifest[0].apps | map(.id))}' \
        > /backups/extern_bericht.json.neu && mv -f /backups/extern_bericht.json.neu /backups/extern_bericht.json
}
sichere_nach_aussen
if [ -n "$EXTERN_PLATZ" ]; then
    STAND_HINWEIS="${STAND_HINWEIS:+$STAND_HINWEIS }Auf dem Datentraeger war kein Platz mehr: $(printf '%s' "$EXTERN_PLATZ" | grep -c .) aelteste(r) Stand/Staende sind entfallen."
fi

# Die Abzuege waren nur die Quelle des Stands.
rm -rf "$STAND_DB_QUELLE"

# -----------------------------------------------------------------------------
# Was die Staende fuer das Dashboard wissen muessen: `/backups/staende.json`
# -----------------------------------------------------------------------------
# Das Backend hat keinen Schluessel und kein restic; es liest diese Datei.
# Neu geschrieben wird sie nach jedem Lauf aus dem Repo selbst (was restic
# auflistet, ist zurueckholbar). Die Byte-Zahlen je Stand kennt nur der Lauf,
# der ihn angelegt hat; sie werden aus der vorigen Fassung uebernommen.
STAENDE_JSON=/backups/staende.json
if [ -n "$STAND_REPO" ] && stand_oeffnet "$STAND_REPO" "$BACKUP_ENCRYPT_KEY_FILE"; then
    VORHER=$(cat "$STAENDE_JSON" 2>/dev/null || echo '{}')
    # Je Stand, was darin steht (Apps, App-Datenbanken, Bereiche des
    # Firmenordners): danach waehlt die Oberflaeche beim Zurueckholen.
    LISTE=$(stand_liste_mit_inhalt "$STAND_REPO" "$BACKUP_ENCRYPT_KEY_FILE" \
        "$(jq -c '.staende // []' <<<"$VORHER" 2>/dev/null || echo '[]')" || echo '[]')
    jq -n \
        --arg zeitpunkt "$(date -Iseconds)" \
        --arg repo "$(basename "$STAND_REPO")" \
        --arg abdruck "$(abdruck_des_schluessels)" \
        --argjson liste "${LISTE:-[]}" \
        --argjson vorher "$(jq -c '.' <<<"$VORHER" 2>/dev/null || echo '{}')" \
        --arg neu "$STAND_LOKAL_ID" \
        --argjson geschrieben "${STAND_LOKAL_GESCHRIEBEN:-0}" \
        --argjson gelesen "${STAND_LOKAL_GELESEN:-0}" \
        --argjson bytes "$(( $(stand_groesse_kb "$STAND_REPO") * 1024 ))" \
        --argjson app_dbs "$(printf '%s\n' $APP_DBS | jq -R . | jq -sc 'map(select(length>0))')" \
        --argjson apps "$(apps_als_json)" \
        --arg hinweis "$STAND_HINWEIS" \
        --argjson entfallen "$(printf '%s' "${STAND_LOKAL_PLATZ}${EXTERN_PLATZ}" | jq -R . | jq -sc 'map(select(length>0))')" \
        --argjson tage "$STAND_TAGE" --argjson wochen "$STAND_WOCHEN" --argjson monate "$STAND_MONATE" \
        '(($vorher.staende // []) | map({key: .id, value: .}) | from_entries) as $alt
         | {zeitpunkt:$zeitpunkt, repo:$repo, abdruck:$abdruck, bytes:$bytes,
            aufbewahrung:{tage:$tage, wochen:$wochen, monate:$monate},
            hinweis:(if $hinweis=="" then null else $hinweis end),
            entfallen_wegen_platz:$entfallen,
            staende:($liste | map(. as $s
              | if $s.id == $neu then $s + {geschrieben:$geschrieben, gelesen:$gelesen}
                else $s + {geschrieben:($alt[$s.id].geschrieben // null), gelesen:($alt[$s.id].gelesen // null)} end
              | del(.pfade))),
            neuester:(if $neu=="" then ($vorher.neuester // null)
                      else {id:$neu, app_datenbanken:$app_dbs, apps:($apps | map(.id))} end)}' \
        > "${STAENDE_JSON}.neu" && mv -f "${STAENDE_JSON}.neu" "$STAENDE_JSON"
fi
STAENDE_ANZAHL=$(jq '.staende | length' "$STAENDE_JSON" 2>/dev/null || echo 0)
STAENDE_BYTES=$(jq '.bytes // 0' "$STAENDE_JSON" 2>/dev/null || echo 0)
LOKAL_KLARTEXT=0
if [ -n "$STAND_REPO" ] && [ -d "$STAND_REPO" ]; then
    stand_klartext "$STAND_REPO"
    LOKAL_KLARTEXT=$STAND_KLARTEXT
fi

# -----------------------------------------------------------------------------
# Aufraeumen: nur noch die WAL-Segmente
# -----------------------------------------------------------------------------
# Die Tagesordner von vor M5 (postgres/, apps/, flows/, firmenordner/,
# config/, je mit weekly/ und monthly/, dazu wal-archive/) werden NICHT mehr
# aufgeraeumt. Wer sie nicht mehr braucht, entscheidet das; bis dahin bleiben
# sie lesbar. Die Aufbewahrung der Staende macht `stand_aufbewahren`.
#
# Plan 023 S5: die Segmente selbst wurden bis dahin NIE geloescht. Mit
# eingeschalteter Archivierung waere /backups/wal unbegrenzt gewachsen. Sie
# stehen jetzt in jedem Stand; geloescht wird nur, was aelter als
# BACKUP_RETENTION_DAYS ist, und nur, wenn der Stand dieser Nacht steht.
if [ "$BACKUP_OK" = true ]; then
    WAL_DELETED=$(find /backups/wal -type f -mtime +$RETENTION_DAYS -print 2>/dev/null | wc -l)
    find /backups/wal -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    if [ "$WAL_DELETED" -gt 0 ] 2>/dev/null; then
        echo "[$TIMESTAMP] WAL-Segmente aufgeraeumt: $WAL_DELETED aelter als ${RETENTION_DAYS} Tage"
    fi
else
    echo "[$TIMESTAMP] [WARNING] WAL-Segmente bleiben -- die Sicherung hatte Fehler"
fi

# Calculate backup sizes
PG_SIZE=$(du -sh /backups/postgres/ 2>/dev/null | cut -f1 || echo "0")
WAL_SIZE=$(du -sh /backups/wal/ 2>/dev/null | cut -f1 || echo "0")
TOTAL_SIZE=$(du -sh /backups/ 2>/dev/null | cut -f1 || echo "0")

# Disk usage warning (>10% of total disk)
DISK_TOTAL_KB=$(df /backups | awk 'NR==2 {print $2}')
BACKUP_KB=$(du -sk /backups/ 2>/dev/null | cut -f1 || echo "0")
if [ "$DISK_TOTAL_KB" -gt 0 ] 2>/dev/null; then
    BACKUP_PERCENT=$((BACKUP_KB * 100 / DISK_TOTAL_KB))
    if [ "$BACKUP_PERCENT" -gt 10 ]; then
        echo "[WARNING] Backups use ${BACKUP_PERCENT}% of disk (${TOTAL_SIZE}). Consider reducing retention."
    fi
fi

# Generate report
#
# Die Felder `*_backups` zaehlen seit M5 die STAENDE (jeder Stand enthaelt
# jedes Ziel); `postgres_weekly`/`postgres_monthly` gibt es nicht mehr als
# eigene Dateien und stehen auf 0. Neu: `stand_*` und `staende_*`.
cat > /backups/backup_report.json << EOF
{
  "timestamp": "$(date -Iseconds)",
  "status": "$([ "$BACKUP_OK" = true ] && echo completed || echo partial_failure)",
  "postgres_backups": $STAENDE_ANZAHL,
  "postgres_weekly": 0,
  "postgres_monthly": 0,
  "apps_status": "$APPS_OK",
  "apps_backups": $STAENDE_ANZAHL,
  "flows_status": "$FLOWS_OK",
  "flows_backups": $STAENDE_ANZAHL,
  "firmenordner_status": "$FIRMENORDNER_OK",
  "firmenordner_backups": $STAENDE_ANZAHL,
  "firmenordner_geaendert": $FIRMENORDNER_GEAENDERT,
  "firmenordner_geaendert_dateien": $FIRMENORDNER_GEAENDERT_DATEIEN,
  "config_status": "$CONFIG_OK",
  "config_backups": $STAENDE_ANZAHL,
  "stand_status": "$STAND_STATUS",
  "stand_id": "$STAND_LOKAL_ID",
  "stand_geschrieben_bytes": ${STAND_LOKAL_GESCHRIEBEN:-0},
  "stand_gelesen_bytes": ${STAND_LOKAL_GELESEN:-0},
  "stand_klartext": $LOKAL_KLARTEXT,
  "staende_anzahl": $STAENDE_ANZAHL,
  "staende_bytes": $STAENDE_BYTES,
  "staende_entfallen": ${STAND_LOKAL_ENTFALLEN:-0},
  "stand_hinweis": $(jq -Rn --arg h "$STAND_HINWEIS" 'if $h=="" then null else $h end'),
  "extern_status": "$EXTERN_STATUS",
  "extern_dateien": $EXTERN_KOPIERT,
  "extern_bytes": $EXTERN_BYTES,
  "extern_geschrieben_bytes": ${EXTERN_GESCHRIEBEN:-0},
  "extern_stand_id": "$EXTERN_STAND_ID",
  "extern_klartext": $EXTERN_KLARTEXT,
  "extern_frei_bytes": $EXTERN_FREI,
  "schluessel_passt": $SCHLUESSEL_PASST,
  "retention_days": $STAND_TAGE,
  "weekly_retention_weeks": $STAND_WOCHEN,
  "monthly_retention_months": $STAND_MONATE,
  "encrypted": "$([ "$VERSCHLUESSELUNG_ERFOLGT" = true ] && [ "$STAND_STATUS" = ok ] && echo true || echo false)",
  "encryption_requested": "$BACKUP_ENCRYPT",
  "postgres_size": "$PG_SIZE",
  "wal_size": "$WAL_SIZE",
  "wal_segments": $WAL_COUNT,
  "total_size": "$TOTAL_SIZE"
}
EOF
# DIE SICHERUNGEN GEHOEREN DEM, DEM `data/backups` GEHOERT (J35). Dieser
# Dienst laeuft als root, und alles, was er anlegt, gehoerte bis dahin root --
# auch die Sicherung, die er beim Start zieht, also mitten im Bootstrap einer
# Aktualisierung, NACH `gib_data_dem_benutzer` in `arasul`. Der Mensch, der das
# Geraet installiert hat, konnte seine eigenen Sicherungen danach nicht
# wegraeumen oder mitnehmen. Gefragt wird der Eigentuemer des Ordners selbst:
# gehoert er root (ein Geraet ohne Menschen dahinter), aendert sich nichts.
# `/backups/wal` bleibt draussen -- das ist das Volume von Postgres, und dessen
# Dateien gehoeren Postgres.
BACKUP_EIGNER=$(stat -c '%u:%g' /backups 2>/dev/null || echo "0:0")
if [ "$BACKUP_EIGNER" != "0:0" ]; then
    find /backups -path /backups/wal -prune -o ! -user "${BACKUP_EIGNER%%:*}" \
        -exec chown -h "$BACKUP_EIGNER" {} + 2>/dev/null || true
fi

if [ "$BACKUP_OK" = true ]; then
    echo "[$TIMESTAMP] Backup completed successfully (total: ${TOTAL_SIZE})"
else
    echo "[$TIMESTAMP] Backup completed with errors (total: ${TOTAL_SIZE})"
fi
