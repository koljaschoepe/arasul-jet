#!/bin/bash
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
encrypt_file /backups/postgres/arasul_db_$TIMESTAMP.sql.gz
ln -sf arasul_db_$TIMESTAMP.sql.gz /backups/postgres/arasul_db_latest.sql.gz

# n8n encryption-key escrow: the DB dump above contains the encrypted
# credentials, but they are useless without the encryption key. Write a copy
# of the key alongside the dump — but ONLY if BACKUP_ENCRYPT is on, otherwise
# we'd be storing the key in plaintext on the same disk as the data, which
# is worse than not escrowing at all.
mkdir -p /backups/escrow
N8N_KEY_FILE="${N8N_ENCRYPTION_KEY_FILE:-/run/secrets/n8n_encryption_key}"
if [ -r "$N8N_KEY_FILE" ]; then
    if [ "$BACKUP_ENCRYPT" = "true" ] && [ -f "$BACKUP_ENCRYPT_KEY_FILE" ]; then
        cp "$N8N_KEY_FILE" "/backups/escrow/n8n_encryption_key_${TIMESTAMP}"
        chmod 600 "/backups/escrow/n8n_encryption_key_${TIMESTAMP}"
        encrypt_file "/backups/escrow/n8n_encryption_key_${TIMESTAMP}"
        ln -sf "n8n_encryption_key_${TIMESTAMP}" /backups/escrow/n8n_encryption_key_latest
        # Store a SHA-256 fingerprint in plaintext so an operator can verify
        # restore matches without decrypting.
        sha256sum "$N8N_KEY_FILE" | awk '{print $1}' > "/backups/escrow/n8n_encryption_key_${TIMESTAMP}.sha256"
        echo "[$TIMESTAMP] n8n encryption-key escrow written (encrypted)"
    else
        echo "[$TIMESTAMP] [WARNING] BACKUP_ENCRYPT is off — n8n_encryption_key NOT escrowed."
        echo "[$TIMESTAMP] [WARNING] Back up /run/secrets/n8n_encryption_key OUT-OF-BAND (1Password, GPG, customer escrow)."
    fi
else
    echo "[$TIMESTAMP] [INFO] n8n encryption-key not mounted — skipping escrow"
fi

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

# Flow definitions (Plan 011): Markdown files under data/flows, mounted here
# read-only. They are small but USER-AUTHORED and reproducible from nowhere else
# — Postgres does not contain them. A device loss without this would
# silently take every self-built flow with it.
#
# A missing directory is a WARNING, not a failure: older deployments have no
# such mount, and flipping BACKUP_OK there would make the healthcheck report a
# broken backup on a perfectly healthy box.
mkdir -p /backups/flows /backups/flows/weekly
FLOWS_SRC=${FLOWS_BACKUP_DIR:-/arasul/flows}
FLOWS_OK=skipped
if [ -d "$FLOWS_SRC" ]; then
    if tar -czf /backups/flows/flows_$TIMESTAMP.tar.gz -C "$FLOWS_SRC" . 2>/dev/null \
       && tar -tzf /backups/flows/flows_$TIMESTAMP.tar.gz >/dev/null 2>&1; then
        echo "[$TIMESTAMP] Flows backup completed and verified"
        encrypt_file /backups/flows/flows_$TIMESTAMP.tar.gz
        ln -sf flows_$TIMESTAMP.tar.gz /backups/flows/flows_latest.tar.gz
        FLOWS_OK=true
    else
        echo "[$TIMESTAMP] [ERROR] Flows backup archive creation/verify failed"
        FLOWS_OK=false
        BACKUP_OK=false
    fi
else
    echo "[$TIMESTAMP] [WARNING] Flows directory ($FLOWS_SRC) not mounted — skipping"
fi

# Weekly snapshot for flows
if [ "$FLOWS_OK" = true ] && [ "$DAY_OF_WEEK" = "7" ]; then
    cp /backups/flows/flows_$TIMESTAMP.tar.gz /backups/flows/weekly/
    echo "[$TIMESTAMP] Weekly flows snapshot saved"
fi

# Monthly snapshot for flows
if [ "$FLOWS_OK" = true ] && [ "$DAY_OF_MONTH" = "01" ]; then
    mkdir -p /backups/flows/monthly
    cp /backups/flows/flows_$TIMESTAMP.tar.gz /backups/flows/monthly/
    echo "[$TIMESTAMP] Monthly flows snapshot saved"
fi

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

# Cleanup: only run if backup succeeded (don't purge WAL if we might need it for recovery)
if [ "$BACKUP_OK" = true ]; then
    # Cleanup: daily backups (short retention)
    find /backups/postgres -maxdepth 1 -name "*.sql.gz" ! -name "*latest*" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/flows -maxdepth 1 -name "*.tar.gz" ! -name "*latest*" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

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

    # WAL segment cleanup: delete raw segments older than retention (already archived above)
    WAL_SEGMENTS_DELETED=$(find /backups/wal -maxdepth 1 -type f -mtime +$RETENTION_DAYS -print 2>/dev/null | wc -l)
    find /backups/wal -maxdepth 1 -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    [ "$WAL_SEGMENTS_DELETED" -gt 0 ] && echo "[$TIMESTAMP] WAL segment cleanup: removed $WAL_SEGMENTS_DELETED file(s) older than ${RETENTION_DAYS}d"

    # Cleanup: weekly backups (longer retention)
    find /backups/postgres/weekly -name "*.sql.gz" -mtime +$WEEKLY_RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/flows/weekly -name "*.tar.gz" -mtime +$WEEKLY_RETENTION_DAYS -delete 2>/dev/null || true

    # Cleanup: monthly backups (5-year retention)
    find /backups/postgres/monthly -name "*.sql.gz" -mtime +$MONTHLY_RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/flows/monthly -name "*.tar.gz" -mtime +$MONTHLY_RETENTION_DAYS -delete 2>/dev/null || true
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

# Generate report
cat > /backups/backup_report.json << EOF
{
  "timestamp": "$(date -Iseconds)",
  "status": "$([ "$BACKUP_OK" = true ] && echo completed || echo partial_failure)",
  "postgres_backups": $(ls /backups/postgres/*.sql.gz 2>/dev/null | grep -v latest | wc -l),
  "postgres_weekly": $(ls /backups/postgres/weekly/*.sql.gz 2>/dev/null | wc -l),
  "postgres_monthly": $(ls /backups/postgres/monthly/*.sql.gz 2>/dev/null | wc -l),
  "flows_status": "$FLOWS_OK",
  "flows_backups": $(find /backups/flows -maxdepth 1 -name '*.tar.gz' ! -name '*latest*' 2>/dev/null | wc -l),
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
