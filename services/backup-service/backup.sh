#!/bin/bash
# =============================================================================
# Die naechtliche Sicherung (Phase C9 des Umbaus vom 26.08.2026)
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
#   apps       Die PAKETE der Apps (`/arasul/apps/<id>/<version>/`): Manifest,
#              fertiges Frontend, Dockerfile mit Kontext. Bis Phase C9 stand
#              das in keinem Archiv, und das war das groesste Loch: die
#              Datenbank haette nach der Wiederherstellung `app_staende` mit
#              Versionen genannt, deren Dateien es nicht mehr gibt. Die Images
#              werden NICHT gesichert -- sie werden aus dem Paket neu gebaut,
#              am Geraet, fuer das Geraet (dieselbe Entscheidung wie beim
#              Deploy, siehe `services/app/appPaket.js`).
#   flows      Die Flow-Dateien unter `/arasul/flows`, die ein Mensch am Geraet
#              geschrieben hat. Die Flows, die eine App MITBRINGT, liegen im
#              App-Paket und kommen mit `apps`.
#   config     `.env`, Zertifikate, Traefik, Geheimnisse. Ohne sie faehrt auf
#              einem leeren Geraet kein einziger Container hoch.
#
# NICHT gesichert werden App-Volumes: es gibt keine. Eine App bekommt weder
# Bind-Mount noch benanntes Volume (`services/app/appContainer.js`); ein
# abgeschirmter Datenordner je App kommt mit den D-Phasen. Wer diese Zeile
# aendert, aendert dort etwas.
#
# DER SICHERUNGSSCHLUESSEL IST NICHT IM ARCHIV. `config/secrets/backup_encryption_key`
# wird ausgenommen, und zwar nicht aus Vorsicht, sondern weil es sonst sinnlos
# waere: wer das Archiv oeffnen will, braucht den Schluessel VORHER. Er gehoert
# ausserhalb des Geraets aufbewahrt, sonst ist jede Sicherung Papier.
#
# Zurueckgespielt wird mit `wiederherstellen.sh` in diesem Ordner -- ein Weg,
# nicht drei.
# =============================================================================
set -e

# Resolve Docker secrets (_FILE env vars → regular env vars)
[ -f "$POSTGRES_PASSWORD_FILE" ] && POSTGRES_PASSWORD=$(cat "$POSTGRES_PASSWORD_FILE")

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u) # 1=Monday, 7=Sunday
DAY_OF_MONTH=$(date +%d)
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
WEEKLY_RETENTION_WEEKS=${BACKUP_WEEKLY_RETENTION_WEEKS:-52}
WEEKLY_RETENTION_DAYS=$((WEEKLY_RETENTION_WEEKS * 7))
MONTHLY_RETENTION_MONTHS=${BACKUP_MONTHLY_RETENTION_MONTHS:-60}
MONTHLY_RETENTION_DAYS=$((MONTHLY_RETENTION_MONTHS * 30))

# Backup encryption (AES-256-CBC via openssl)
BACKUP_ENCRYPT=${BACKUP_ENCRYPT:-false}
BACKUP_ENCRYPT_KEY_FILE=${BACKUP_ENCRYPT_KEY_FILE:-/run/secrets/backup_encryption_key}

# Meldet der Bericht die Absicht oder das Ergebnis? Frueher die Absicht:
# `"encrypted": "$BACKUP_ENCRYPT"`. Faellt encrypt_file durch, weil openssl
# fehlt oder der Schluessel nicht da ist, stand im Bericht trotzdem
# verschluesselt, waehrend jede Datei im Klartext lag. Genau diese Sorte Zusage
# hat Gate G6 aufgemacht. Deshalb wird jetzt mitgezaehlt, was wirklich passiert
# ist (Plan 023 S3).
VERSCHLUESSELUNG_ERFOLGT=true
if [ "$BACKUP_ENCRYPT" = "true" ] && [ ! -f "$BACKUP_ENCRYPT_KEY_FILE" ]; then
    echo "[$TIMESTAMP] [ERROR] BACKUP_ENCRYPT=true, aber der Schluessel fehlt (${BACKUP_ENCRYPT_KEY_FILE})"
    VERSCHLUESSELUNG_ERFOLGT=false
fi

encrypt_file() {
    local src="$1"
    if [ "$BACKUP_ENCRYPT" = "true" ] && [ -f "$BACKUP_ENCRYPT_KEY_FILE" ]; then
        # Use -pass file: instead of pass:$KEY so the secret is not visible in
        # /proc/<pid>/cmdline to other processes on the host while openssl runs.
        if openssl enc -aes-256-cbc -salt -pbkdf2 -in "$src" -out "${src}.enc" -pass "file:${BACKUP_ENCRYPT_KEY_FILE}" 2>/dev/null; then
            mv "${src}.enc" "$src"
            echo "[$TIMESTAMP] Encrypted: $(basename "$src")"
            return 0
        else
            echo "[$TIMESTAMP] [ERROR] Verschluesselung fehlgeschlagen fuer $(basename "$src"), Datei bleibt im Klartext"
            rm -f "${src}.enc"
            VERSCHLUESSELUNG_ERFOLGT=false
            return 1
        fi
    fi
    return 0
}

echo "[$TIMESTAMP] Starting backup..."
BACKUP_OK=true

# PostgreSQL backup (use .pgpass to avoid password in process listing)
mkdir -p /backups/postgres /backups/postgres/weekly
echo "$POSTGRES_HOST:${POSTGRES_PORT:-5432}:$POSTGRES_DB:$POSTGRES_USER:$POSTGRES_PASSWORD" > ~/.pgpass
chmod 600 ~/.pgpass
if pg_dump \
  -h "$POSTGRES_HOST" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  --no-owner --no-acl --clean --if-exists \
  | gzip > /backups/postgres/arasul_db_$TIMESTAMP.sql.gz; then
    # Verify backup integrity
    if gunzip -t /backups/postgres/arasul_db_$TIMESTAMP.sql.gz 2>/dev/null; then
        PG_BYTES=$(stat -c%s /backups/postgres/arasul_db_$TIMESTAMP.sql.gz 2>/dev/null || echo "0")
        if [ "$PG_BYTES" -gt 100 ] 2>/dev/null; then
            echo "[$TIMESTAMP] PostgreSQL backup completed and verified (${PG_BYTES} bytes)"
        else
            echo "[$TIMESTAMP] [ERROR] PostgreSQL backup too small (${PG_BYTES} bytes) — likely empty"
            BACKUP_OK=false
        fi
    else
        echo "[$TIMESTAMP] [ERROR] PostgreSQL backup corrupt (gunzip integrity check failed)"
        BACKUP_OK=false
    fi
else
    echo "[$TIMESTAMP] [ERROR] PostgreSQL backup failed"
    BACKUP_OK=false
fi
rm -f ~/.pgpass
# `|| true`, weil `set -e` sonst genau hier aussteigt: `encrypt_file` gibt bei
# fehlgeschlagener Verschluesselung 1 zurueck, und dieser Aufruf steht am
# Zeilenanfang. Das Skript waere ohne Bericht abgebrochen -- und der
# Healthcheck haette einen veralteten `backup_report.json` gefunden und rot
# gemeldet, ohne zu sagen, woran es lag. Der Fehlschlag ist nicht verschwunden:
# `VERSCHLUESSELUNG_ERFOLGT` steht auf false, und der Block weiter unten legt
# BACKUP_OK dafuer um.
encrypt_file /backups/postgres/arasul_db_$TIMESTAMP.sql.gz || true
ln -sf arasul_db_$TIMESTAMP.sql.gz /backups/postgres/arasul_db_latest.sql.gz

# Weekly snapshot: copy Sunday's backup to weekly dir (kept longer)
if [ "$DAY_OF_WEEK" = "7" ]; then
    cp /backups/postgres/arasul_db_$TIMESTAMP.sql.gz /backups/postgres/weekly/
    echo "[$TIMESTAMP] Weekly PostgreSQL snapshot saved"
fi

# Monthly snapshot: copy 1st of month to monthly dir (5-year retention)
if [ "$DAY_OF_MONTH" = "01" ]; then
    mkdir -p /backups/postgres/monthly
    cp /backups/postgres/arasul_db_$TIMESTAMP.sql.gz /backups/postgres/monthly/
    echo "[$TIMESTAMP] Monthly PostgreSQL snapshot saved"
fi

# Bis zum 26.08.2026 stand hier die MinIO-Sicherung (Phase B4 des Rueckbaus:
# der Objektspeicher ist weg, kein Dienst schreibt mehr hinein). Kritisch ist
# seitdem nur noch Postgres; ein Ausfall dort setzt BACKUP_OK auf false.

# -----------------------------------------------------------------------------
# Ordner sichern: apps, flows, config
# -----------------------------------------------------------------------------
# EINE Funktion fuer alle drei. Bis Phase C9 stand der Flow-Block dreissig
# Zeilen lang von Hand da; die Apps daneben zu stellen haette ihn ein zweites
# und die Konfiguration ein drittes Mal bedeutet -- drei Stellen, an denen der
# naechste Verschluesselungs- oder Aufbewahrungsfehler je einzeln zu suchen
# waere.
#
# EIN FEHLENDER ORDNER IST EINE WARNUNG, KEIN FEHLSCHLAG: aeltere Staende haben
# den Mount nicht, und ein Geraet ohne eine einzige App hat kein
# `/arasul/apps`. BACKUP_OK dort umzulegen hiesse, den Healthcheck auf einem
# gesunden Geraet rot zu faerben.
#
# EIN LEERER ORDNER IST KEIN FEHLER. `tar` schreibt dann ein gueltiges Archiv
# mit einem Eintrag, und genau das ist die richtige Antwort auf "es gibt hier
# nichts": naechste Nacht steht vielleicht etwas drin.
#
# Setzt $ARCHIV_STATUS auf true | false | skipped.
ARCHIV_STATUS=skipped
sichere_ordner() {
    local name="$1" quelle="$2"
    shift 2
    local ziel="/backups/${name}/${name}_${TIMESTAMP}.tar.gz"
    ARCHIV_STATUS=skipped

    if [ ! -d "$quelle" ]; then
        echo "[$TIMESTAMP] [WARNING] ${name}: ${quelle} nicht eingehaengt — uebersprungen"
        return 0
    fi

    mkdir -p "/backups/${name}" "/backups/${name}/weekly"
    # Erst packen, dann GEGENLESEN. Ein `tar`, das ohne Fehler zurueckkommt,
    # sagt nichts darueber, ob sich das Archiv wieder oeffnen laesst.
    if tar -czf "$ziel" -C "$quelle" "$@" . 2>/dev/null \
       && tar -tzf "$ziel" >/dev/null 2>&1; then
        local bytes
        bytes=$(stat -c%s "$ziel" 2>/dev/null || echo "0")
        echo "[$TIMESTAMP] ${name}: gesichert und gegengelesen (${bytes} Bytes)"
        encrypt_file "$ziel"
        ln -sf "$(basename "$ziel")" "/backups/${name}/${name}_latest.tar.gz"
        [ "$DAY_OF_WEEK" = "7" ] && cp "$ziel" "/backups/${name}/weekly/"
        if [ "$DAY_OF_MONTH" = "01" ]; then
            mkdir -p "/backups/${name}/monthly"
            cp "$ziel" "/backups/${name}/monthly/"
        fi
        ARCHIV_STATUS=true
        return 0
    fi

    echo "[$TIMESTAMP] [ERROR] ${name}: Archiv liess sich nicht anlegen oder nicht wieder oeffnen"
    rm -f "$ziel"
    ARCHIV_STATUS=false
    BACKUP_OK=false
    return 1
}

# Die Pakete der Apps. `.eingang` bleibt draussen: dort liegt, was ein Deploy
# gerade auspackt oder als Bruchstueck hinterlassen hat -- nie etwas, das eine
# Wiederherstellung braucht (`services/app/appPaket.js`).
APPS_SRC=${APPS_BACKUP_DIR:-/arasul/apps}
sichere_ordner apps "$APPS_SRC" --exclude=./.eingang || true
APPS_OK="$ARCHIV_STATUS"

# Flow definitions (Plan 011): Markdown files under data/flows, mounted here
# read-only. They are small but USER-AUTHORED and reproducible from nowhere else
# — Postgres does not contain them. A device loss without this would
# silently take every self-built flow with it.
FLOWS_SRC=${FLOWS_BACKUP_DIR:-/arasul/flows}
sichere_ordner flows "$FLOWS_SRC" || true
FLOWS_OK="$ARCHIV_STATUS"

# Die Konfiguration: `.env`, Zertifikate, Traefik, Geheimnisse. Ohne sie faehrt
# auf einem leeren Geraet nichts hoch.
#
# OHNE DEN SICHERUNGSSCHLUESSEL, siehe Kopf dieser Datei. Bis Phase C9 sicherte
# das ein zweites Skript auf dem Host (`scripts/backup/backup.sh`), das der
# Zeitplan nie aufrief -- die Konfiguration war damit auf keinem Geraet
# gesichert, auf dem niemand von Hand nachgeholfen hat.
CONFIG_SRC=${CONFIG_BACKUP_DIR:-/arasul/konfiguration}
sichere_ordner config "$CONFIG_SRC" --exclude=./config/secrets/backup_encryption_key || true
CONFIG_OK="$ARCHIV_STATUS"

# WAL archive backup: include in daily backup for PITR
WAL_COUNT=0
if [ -d /backups/wal ] && [ "$(ls -A /backups/wal 2>/dev/null)" ]; then
    mkdir -p /backups/wal-archive
    tar -czf /backups/wal-archive/wal_$TIMESTAMP.tar.gz -C /backups/wal . 2>/dev/null || true
    WAL_COUNT=$(ls /backups/wal/ 2>/dev/null | wc -l)
    echo "[$TIMESTAMP] WAL archive backup completed ($WAL_COUNT files)"
fi

# Wer Verschluesselung verlangt und Klartext bekommt, hat keine Sicherung nach
# Zusage. Das muss laut sein, nicht als Warnung im Protokoll verschwinden.
if [ "$BACKUP_ENCRYPT" = "true" ] && [ "$VERSCHLUESSELUNG_ERFOLGT" != true ]; then
    echo "[$TIMESTAMP] [ERROR] Verschluesselung war verlangt, ist aber nicht durchgehend erfolgt"
    BACKUP_OK=false
fi

# -----------------------------------------------------------------------------
# Die Kopie ausserhalb des Geraets (Entscheidung Kolja, 27.08.2026)
# -----------------------------------------------------------------------------
# Eine Sicherung, die auf derselben Platte liegt wie das Original, ueberlebt
# genau die Faelle nicht, fuer die es sie gibt: Diebstahl, Feuer, Platte tot.
# Deshalb ein Ziel AUSSERHALB -- ein USB-Datentraeger oder eine SMB-Freigabe im
# Kundennetz, eingehaengt vom Betriebssystem und hier nur als Ordner sichtbar.
#
# KEIN CLOUD-ZIEL. Nicht aus Bequemlichkeit weggelassen: das Geraet steht beim
# Kunden, die Daten bleiben dort, und ein Ziel, das eine Zugangskennung zu
# einem fremden Rechenzentrum braucht, waere genau der Bruch, den die
# Datenschutzzusage dieses Produkts nicht macht.
#
# EINGEHAENGT WIRD NICHT HIER. Ob der Stick steckt oder die Freigabe verbunden
# ist, entscheidet das Betriebssystem des Geraets. Dieser Dienst schaut nach,
# ob unter dem Ziel etwas Beschreibbares liegt, und sagt sonst, dass es fehlt.
#
# WAS BEIM MISSLINGEN PASSIERT: nichts Rotes. Ein abgezogener Stick ist der
# Normalfall im Alltag und darf die naechtliche Sicherung nicht als
# fehlgeschlagen melden -- sonst faerbt sich der Healthcheck rot, waehrend
# lokal alles vollstaendig gesichert ist. Sichtbar bleibt es trotzdem: der
# Bericht sagt, wann die letzte Kopie ausserhalb entstanden ist, und ueber
# `/api/backup/status` liest das jeder.
EXTERN_ZIEL=${BACKUP_EXTERN_ZIEL:-/arasul/extern}
EXTERN_AN=${BACKUP_EXTERN_AN:-auto}
EXTERN_STATUS=kein_ziel
EXTERN_KOPIERT=0
EXTERN_BYTES=0

kopiere_nach_aussen() {
    if [ "$EXTERN_AN" = "false" ]; then
        EXTERN_STATUS=abgeschaltet
        return 0
    fi
    if [ ! -d "$EXTERN_ZIEL" ]; then
        EXTERN_STATUS=kein_ziel
        echo "[$TIMESTAMP] Kein Ziel ausserhalb unter ${EXTERN_ZIEL} — nur lokal gesichert"
        return 0
    fi
    # LIEGT DAS ZIEL WIRKLICH AUSSERHALB? Das ist keine Formalie, sondern die
    # ganze Zusage dieses Abschnitts. Ein Bind-Mount auf einen Host-Pfad, den
    # niemand eingehaengt hat, legt Docker als leeren Ordner an -- er ist da,
    # er nimmt Dateien an, und die Kopie laege auf derselben Platte wie das
    # Original. Der Bericht wuerde "ausserhalb gesichert" melden, waehrend ein
    # Plattenausfall beides mitnimmt.
    #
    # Erkannt wird an der GERAETENUMMER des Dateisystems: gleiche Nummer wie
    # der Sicherungsordner heisst dieselbe Platte, also kein Ziel ausserhalb.
    # `mountpoint` gibt es in busybox nicht, `stat -c %d` schon.
    local dev_ziel dev_hier
    dev_ziel=$(stat -c %d "$EXTERN_ZIEL" 2>/dev/null || echo "")
    dev_hier=$(stat -c %d /backups 2>/dev/null || echo "")
    if [ -n "$dev_ziel" ] && [ "$dev_ziel" = "$dev_hier" ]; then
        EXTERN_STATUS=nicht_eingehaengt
        echo "[$TIMESTAMP] [WARNING] ${EXTERN_ZIEL} liegt auf derselben Platte wie das Geraet — das ist kein Ziel ausserhalb"
        return 0
    fi

    # Ein Ordner, der da ist, aber nichts annimmt, ist kein Ziel. Genau so
    # sieht ein Mountpunkt aus, dessen Datentraeger abgezogen wurde: der
    # Ordner bleibt, das Schreiben schlaegt fehl.
    if ! touch "${EXTERN_ZIEL}/.arasul_schreibprobe" 2>/dev/null; then
        EXTERN_STATUS=nicht_beschreibbar
        echo "[$TIMESTAMP] [WARNING] ${EXTERN_ZIEL} nimmt nichts an (Datentraeger abgezogen?)"
        return 0
    fi
    rm -f "${EXTERN_ZIEL}/.arasul_schreibprobe"

    local ordner
    ordner="${EXTERN_ZIEL}/arasul-sicherung/$(date +%Y%m%d)"
    mkdir -p "$ordner" || { EXTERN_STATUS=fehler; return 0; }

    local fehler=0
    for quelle in \
        /backups/postgres/arasul_db_latest.sql.gz \
        /backups/apps/apps_latest.tar.gz \
        /backups/flows/flows_latest.tar.gz \
        /backups/config/config_latest.tar.gz; do
        [ -e "$quelle" ] || continue
        # Ueber den Link hinweg auf die echte Datei: ein Symlink auf dem Stick
        # zeigt ins Leere, sobald er woanders steckt.
        local echt
        echt=$(readlink -f "$quelle" 2>/dev/null || echo "$quelle")
        if cp -f "$echt" "$ordner/"; then
            EXTERN_KOPIERT=$((EXTERN_KOPIERT + 1))
            EXTERN_BYTES=$((EXTERN_BYTES + $(stat -c%s "$echt" 2>/dev/null || echo 0)))
        else
            fehler=1
        fi
    done
    # `sync`, bevor der Bericht behauptet, die Kopie liege draussen. Ohne das
    # steht sie im Schreibpuffer des Geraets, und wer den Stick jetzt abzieht,
    # nimmt eine halbe Datei mit.
    sync

    if [ "$fehler" = "1" ] || [ "$EXTERN_KOPIERT" = "0" ]; then
        EXTERN_STATUS=fehler
        echo "[$TIMESTAMP] [WARNING] Kopie ausserhalb unvollstaendig (${EXTERN_KOPIERT} Dateien)"
        return 0
    fi

    EXTERN_STATUS=kopiert
    echo "[$TIMESTAMP] Kopie ausserhalb: ${EXTERN_KOPIERT} Dateien, ${EXTERN_BYTES} Bytes -> ${ordner}"

    # Der Merker steht in einer EIGENEN Datei und nicht nur im Tagesbericht.
    # Grund: die Frage lautet "wann lag zuletzt eine Kopie ausserhalb", und die
    # Antwort darf nicht verschwinden, sobald der Stick eine Nacht abgezogen
    # ist. Der Tagesbericht wird jede Nacht ueberschrieben, diese Datei nur
    # dann, wenn wirklich kopiert wurde.
    cat > /backups/extern_bericht.json <<EOF
{
  "zeitpunkt": "$(date -Iseconds)",
  "ziel": "${EXTERN_ZIEL}",
  "ordner": "${ordner}",
  "dateien": ${EXTERN_KOPIERT},
  "bytes": ${EXTERN_BYTES}
}
EOF
}
kopiere_nach_aussen

# Cleanup: only run if backup succeeded (don't purge WAL if we might need it for recovery)
if [ "$BACKUP_OK" = true ]; then
    # Was `*_latest` gerade zeigt, wird NIE weggeraeumt.
    #
    # Die Aufbewahrung loescht nach Alter (`-mtime`), und der Name des neuesten
    # Archivs steht nicht auf der Ausnahmeliste -- nur der Symlink `*_latest`
    # tut das, und der ist nicht die Datei. Solange jede Nacht ein neues Archiv
    # entsteht, faellt das nicht auf. Sobald eines fehlt (Ordner nicht
    # eingehaengt, Platte voll, Dienst stand still), altert das letzte
    # vorhandene ueber die Frist hinaus und wird geloescht -- und dann gibt es
    # gar keines mehr. Auf einem Geraet, das fuenf Jahre unbeaufsichtigt
    # laufen soll, ist das kein Randfall.
    schuetze_neueste() {
        local ordner="$1" muster="$2"
        local echt
        echt=$(readlink -f "${ordner}/${3}" 2>/dev/null || true)
        local datei
        find "$ordner" -maxdepth 1 -name "$muster" ! -name "*latest*" \
             -mtime +$RETENTION_DAYS 2>/dev/null | while IFS= read -r datei; do
            if [ "$datei" != "$echt" ]; then
                rm -f "$datei"
            fi
        done
    }

    schuetze_neueste /backups/postgres "*.sql.gz" arasul_db_latest.sql.gz
    for name in apps flows config; do
        [ -d "/backups/${name}" ] && schuetze_neueste "/backups/${name}" "*.tar.gz" "${name}_latest.tar.gz"
    done

    # WAL archive cleanup: keep only retention period worth
    WAL_ARCHIVE_DELETED=$(find /backups/wal-archive -name "*.tar.gz" -mtime +$RETENTION_DAYS -print 2>/dev/null | wc -l)
    find /backups/wal-archive -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

    # Plan 023 S5: die Segmente selbst wurden bisher NIE geloescht. Solange
    # archive_mode aus war, fiel das nicht auf, weil nichts ankam. Mit
    # eingeschalteter Archivierung waere /backups/wal unbegrenzt gewachsen —
    # auf einem Geraet, das fuenf Jahre unbeaufsichtigt laufen soll, ist das
    # eine Zeitbombe. Geloescht wird nur, was aelter als die Aufbewahrungsfrist
    # der taeglichen Sicherungen ist: aelter zurueck als die aelteste
    # Basissicherung braucht niemand.
    WAL_DELETED=$(find /backups/wal -type f -mtime +$RETENTION_DAYS -print 2>/dev/null | wc -l)
    find /backups/wal -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    if [ "$WAL_DELETED" -gt 0 ] 2>/dev/null; then
        echo "[$TIMESTAMP] WAL-Segmente aufgeraeumt: $WAL_DELETED aelter als ${RETENTION_DAYS} Tage"
    fi
    [ "$WAL_ARCHIVE_DELETED" -gt 0 ] && echo "[$TIMESTAMP] WAL archive cleanup: removed $WAL_ARCHIVE_DELETED archive(s) older than ${RETENTION_DAYS}d"

    # Cleanup: weekly backups (longer retention)
    find /backups/postgres/weekly -name "*.sql.gz" -mtime +$WEEKLY_RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/postgres/monthly -name "*.sql.gz" -mtime +$MONTHLY_RETENTION_DAYS -delete 2>/dev/null || true
    for name in apps flows config; do
        find "/backups/${name}/weekly" -name "*.tar.gz" -mtime +$WEEKLY_RETENTION_DAYS -delete 2>/dev/null || true
        find "/backups/${name}/monthly" -name "*.tar.gz" -mtime +$MONTHLY_RETENTION_DAYS -delete 2>/dev/null || true
    done
    echo "[$TIMESTAMP] Cleanup completed (daily: ${RETENTION_DAYS}d, weekly: ${WEEKLY_RETENTION_WEEKS}w, monthly: ${MONTHLY_RETENTION_MONTHS}mo)"
else
    echo "[$TIMESTAMP] [WARNING] Skipping cleanup — backup had errors (WAL files preserved for recovery)"
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

zaehle() { find "$1" -maxdepth 1 -name "$2" ! -name '*latest*' 2>/dev/null | wc -l; }

# Generate report
cat > /backups/backup_report.json << EOF
{
  "timestamp": "$(date -Iseconds)",
  "status": "$([ "$BACKUP_OK" = true ] && echo completed || echo partial_failure)",
  "postgres_backups": $(ls /backups/postgres/*.sql.gz 2>/dev/null | grep -v latest | wc -l),
  "postgres_weekly": $(ls /backups/postgres/weekly/*.sql.gz 2>/dev/null | wc -l),
  "postgres_monthly": $(ls /backups/postgres/monthly/*.sql.gz 2>/dev/null | wc -l),
  "apps_status": "$APPS_OK",
  "apps_backups": $(zaehle /backups/apps '*.tar.gz'),
  "flows_status": "$FLOWS_OK",
  "flows_backups": $(zaehle /backups/flows '*.tar.gz'),
  "config_status": "$CONFIG_OK",
  "config_backups": $(zaehle /backups/config '*.tar.gz'),
  "extern_status": "$EXTERN_STATUS",
  "extern_dateien": $EXTERN_KOPIERT,
  "extern_bytes": $EXTERN_BYTES,
  "retention_days": $RETENTION_DAYS,
  "weekly_retention_weeks": $WEEKLY_RETENTION_WEEKS,
  "monthly_retention_months": $MONTHLY_RETENTION_MONTHS,
  "encrypted": "$([ "$BACKUP_ENCRYPT" = "true" ] && [ "$VERSCHLUESSELUNG_ERFOLGT" = true ] && echo true || echo false)",
  "encryption_requested": "$BACKUP_ENCRYPT",
  "postgres_size": "$PG_SIZE",
  "wal_size": "$WAL_SIZE",
  "wal_segments": $WAL_COUNT,
  "total_size": "$TOTAL_SIZE"
}
EOF
if [ "$BACKUP_OK" = true ]; then
    echo "[$TIMESTAMP] Backup completed successfully (total: ${TOTAL_SIZE})"
else
    echo "[$TIMESTAMP] Backup completed with errors (total: ${TOTAL_SIZE})"
fi
