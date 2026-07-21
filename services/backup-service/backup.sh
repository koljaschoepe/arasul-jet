#!/bin/bash
set -e

# Resolve Docker secrets (_FILE env vars → regular env vars)
[ -f "$POSTGRES_PASSWORD_FILE" ] && POSTGRES_PASSWORD=$(cat "$POSTGRES_PASSWORD_FILE")
[ -f "$MINIO_ROOT_USER_FILE" ] && MINIO_ROOT_USER=$(cat "$MINIO_ROOT_USER_FILE")
[ -f "$MINIO_ROOT_PASSWORD_FILE" ] && MINIO_ROOT_PASSWORD=$(cat "$MINIO_ROOT_PASSWORD_FILE")

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
            echo "[$TIMESTAMP] [WARNING] Encryption failed for $(basename "$src"), keeping unencrypted"
            rm -f "${src}.enc"
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

# MinIO backup — direkt ueber das Backend-Netz mit `mc`.
#
# Frueher lief das ueber `docker exec minio mc mirror` plus `docker cp`. Das war
# aus zwei Gruenden fragil und ist auf dem Geraet ueber einen Monat lang still
# gescheitert: `docker cp` wird vom Socket-Proxy geblockt, und der Umweg haengt
# davon ab, welche Werkzeuge zufaellig im fremden MinIO-Image liegen (`tar` etwa
# gibt es dort nicht). Jetzt spricht der Backup-Dienst MinIO als ganz normaler
# S3-Client an — kein Docker noetig, keine Annahmen ueber fremde Images.
mkdir -p /backups/minio /backups/minio/weekly
MINIO_OK=true
MINIO_TMP=/tmp/minio_backup_$TIMESTAMP
mkdir -p "$MINIO_TMP"
# Zugangsdaten ueber die Umgebung, nicht als Argument — sonst stuenden sie in
# /proc/<pid>/cmdline.
export MC_HOST_arasul="http://${MINIO_ROOT_USER}:${MINIO_ROOT_PASSWORD}@${MINIO_HOST:-minio}:9000"
# Alpine liefert den MinIO-Client als `mcli` aus, nicht als `mc` — der Name `mc`
# ist dort von GNU Midnight Commander belegt. Andere Distributionen und die
# offiziellen Binaries heissen `mc`. Beide Namen akzeptieren, statt sich auf
# einen festzulegen und beim naechsten Basis-Image wieder aufzulaufen.
MC_BIN=$(command -v mcli || command -v mc || true)
if [ -z "$MC_BIN" ]; then
    echo "[$TIMESTAMP] [ERROR] Kein MinIO-Client im Image (weder mcli noch mc) — Dokumente werden NICHT gesichert"
    MINIO_OK=false
    BACKUP_OK=false
elif ! "$MC_BIN" mirror --overwrite --quiet arasul/documents "$MINIO_TMP" >/dev/null 2>&1; then
    echo "[$TIMESTAMP] [ERROR] MinIO mirror failed (MinIO erreichbar? Zugangsdaten?) — Dokumente werden NICHT gesichert"
    MINIO_OK=false
    BACKUP_OK=false
fi
MINIO_FILES=$(find "$MINIO_TMP" -type f 2>/dev/null | wc -l)
if tar -czf /backups/minio/documents_$TIMESTAMP.tar.gz -C /tmp "minio_backup_$TIMESTAMP" 2>/dev/null; then
    if tar -tzf /backups/minio/documents_$TIMESTAMP.tar.gz >/dev/null 2>&1; then
        if [ "$MINIO_OK" = true ]; then
            echo "[$TIMESTAMP] MinIO backup completed and verified (${MINIO_FILES} Dateien)"
        else
            echo "[$TIMESTAMP] [ERROR] MinIO archive written, but the mirror failed — content is INCOMPLETE"
        fi
    else
        echo "[$TIMESTAMP] [ERROR] MinIO backup archive corrupt (tar integrity check failed)"
        MINIO_OK=false
        BACKUP_OK=false
    fi
else
    echo "[$TIMESTAMP] [ERROR] MinIO backup archive creation failed"
    MINIO_OK=false
    BACKUP_OK=false
fi
encrypt_file /backups/minio/documents_$TIMESTAMP.tar.gz
ln -sf documents_$TIMESTAMP.tar.gz /backups/minio/documents_latest.tar.gz
rm -rf "$MINIO_TMP"

# Weekly snapshot for MinIO
if [ "$DAY_OF_WEEK" = "7" ]; then
    cp /backups/minio/documents_$TIMESTAMP.tar.gz /backups/minio/weekly/
    echo "[$TIMESTAMP] Weekly MinIO snapshot saved"
fi

# Monthly snapshot for MinIO
if [ "$DAY_OF_MONTH" = "01" ]; then
    mkdir -p /backups/minio/monthly
    cp /backups/minio/documents_$TIMESTAMP.tar.gz /backups/minio/monthly/
    echo "[$TIMESTAMP] Monthly MinIO snapshot saved"
fi

# Qdrant vector-DB backup (RAG-Index) — ueber die HTTP-API im Backend-Netz.
#
# Frueher via `docker exec qdrant curl ...`. Das konnte NIE funktionieren: im
# Qdrant-Image gibt es gar kein `curl` (exec endet mit 127). Entsprechend gab es
# auf dem Geraet kein einziges Qdrant-Archiv. Der Backup-Dienst ruft die
# Snapshot-API jetzt selbst auf — er haengt ohnehin im selben Netz.
mkdir -p /backups/qdrant /backups/qdrant/weekly
QDRANT_OK=skipped
QDRANT_URL="http://${QDRANT_HOST:-qdrant}:6333"
QDRANT_TMP=/tmp/qdrant_backup_$TIMESTAMP
if curl -sf --max-time 30 -X POST "${QDRANT_URL}/snapshots" -H "Content-Type: application/json" -o /tmp/qdrant_snap_$TIMESTAMP.json 2>/dev/null; then
    QDRANT_SNAPSHOT=$(grep -o '"name":"[^"]*"' /tmp/qdrant_snap_$TIMESTAMP.json | head -1 | cut -d'"' -f4)
    rm -f /tmp/qdrant_snap_$TIMESTAMP.json
    if [ -n "$QDRANT_SNAPSHOT" ]; then
        mkdir -p "$QDRANT_TMP"
        if curl -sf --max-time 300 -o "${QDRANT_TMP}/${QDRANT_SNAPSHOT}" "${QDRANT_URL}/snapshots/${QDRANT_SNAPSHOT}" 2>/dev/null \
           && tar -czf /backups/qdrant/qdrant_$TIMESTAMP.tar.gz -C "$QDRANT_TMP" . 2>/dev/null \
           && tar -tzf /backups/qdrant/qdrant_$TIMESTAMP.tar.gz >/dev/null 2>&1; then
            echo "[$TIMESTAMP] Qdrant backup completed and verified (${QDRANT_SNAPSHOT})"
            encrypt_file /backups/qdrant/qdrant_$TIMESTAMP.tar.gz
            ln -sf qdrant_$TIMESTAMP.tar.gz /backups/qdrant/qdrant_latest.tar.gz
            QDRANT_OK=true
        else
            echo "[$TIMESTAMP] [ERROR] Qdrant snapshot download or archiving failed"
            QDRANT_OK=false
            BACKUP_OK=false
        fi
        rm -rf "$QDRANT_TMP"
        # Snapshot in Qdrant wieder loeschen, sonst sammeln sie sich auf dem Geraet an.
        curl -sf --max-time 30 -X DELETE "${QDRANT_URL}/snapshots/${QDRANT_SNAPSHOT}" >/dev/null 2>&1 || true
    else
        echo "[$TIMESTAMP] [ERROR] Qdrant snapshot created but no name returned by the API"
        QDRANT_OK=false
        BACKUP_OK=false
    fi
else
    echo "[$TIMESTAMP] [ERROR] Qdrant snapshot request failed (${QDRANT_URL}) — vector DB NOT backed up"
    QDRANT_OK=false
    BACKUP_OK=false
fi

# Weekly snapshot for Qdrant
if [ "$QDRANT_OK" = true ] && [ "$DAY_OF_WEEK" = "7" ]; then
    cp /backups/qdrant/qdrant_$TIMESTAMP.tar.gz /backups/qdrant/weekly/
    echo "[$TIMESTAMP] Weekly Qdrant snapshot saved"
fi

# Monthly snapshot for Qdrant
if [ "$QDRANT_OK" = true ] && [ "$DAY_OF_MONTH" = "01" ]; then
    mkdir -p /backups/qdrant/monthly
    cp /backups/qdrant/qdrant_$TIMESTAMP.tar.gz /backups/qdrant/monthly/
    echo "[$TIMESTAMP] Monthly Qdrant snapshot saved"
fi

# Skill definitions (Plan 011): Markdown files under data/skills, mounted here
# read-only. They are small but USER-AUTHORED and reproducible from nowhere else
# — Postgres/MinIO/Qdrant do not contain them. A device loss without this would
# silently take every self-built skill with it.
#
# A missing directory is a WARNING, not a failure: older deployments have no
# such mount, and flipping BACKUP_OK there would make the healthcheck report a
# broken backup on a perfectly healthy box.
mkdir -p /backups/skills /backups/skills/weekly
SKILLS_SRC=${SKILLS_BACKUP_DIR:-/arasul/skills}
SKILLS_OK=skipped
if [ -d "$SKILLS_SRC" ]; then
    if tar -czf /backups/skills/skills_$TIMESTAMP.tar.gz -C "$SKILLS_SRC" . 2>/dev/null \
       && tar -tzf /backups/skills/skills_$TIMESTAMP.tar.gz >/dev/null 2>&1; then
        echo "[$TIMESTAMP] Skills backup completed and verified"
        encrypt_file /backups/skills/skills_$TIMESTAMP.tar.gz
        ln -sf skills_$TIMESTAMP.tar.gz /backups/skills/skills_latest.tar.gz
        SKILLS_OK=true
    else
        echo "[$TIMESTAMP] [ERROR] Skills backup archive creation/verify failed"
        SKILLS_OK=false
        BACKUP_OK=false
    fi
else
    echo "[$TIMESTAMP] [WARNING] Skills directory ($SKILLS_SRC) not mounted — skipping"
fi

# Weekly snapshot for skills
if [ "$SKILLS_OK" = true ] && [ "$DAY_OF_WEEK" = "7" ]; then
    cp /backups/skills/skills_$TIMESTAMP.tar.gz /backups/skills/weekly/
    echo "[$TIMESTAMP] Weekly skills snapshot saved"
fi

# Monthly snapshot for skills
if [ "$SKILLS_OK" = true ] && [ "$DAY_OF_MONTH" = "01" ]; then
    mkdir -p /backups/skills/monthly
    cp /backups/skills/skills_$TIMESTAMP.tar.gz /backups/skills/monthly/
    echo "[$TIMESTAMP] Monthly skills snapshot saved"
fi

# WAL archive backup: include in daily backup for PITR
WAL_COUNT=0
if [ -d /backups/wal ] && [ "$(ls -A /backups/wal 2>/dev/null)" ]; then
    mkdir -p /backups/wal-archive
    tar -czf /backups/wal-archive/wal_$TIMESTAMP.tar.gz -C /backups/wal . 2>/dev/null || true
    WAL_COUNT=$(ls /backups/wal/ 2>/dev/null | wc -l)
    echo "[$TIMESTAMP] WAL archive backup completed ($WAL_COUNT files)"
fi

# Cleanup: only run if backup succeeded (don't purge WAL if we might need it for recovery)
if [ "$BACKUP_OK" = true ]; then
    # Cleanup: daily backups (short retention)
    find /backups/postgres -maxdepth 1 -name "*.sql.gz" ! -name "*latest*" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/minio -maxdepth 1 -name "*.tar.gz" ! -name "*latest*" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/qdrant -maxdepth 1 -name "*.tar.gz" ! -name "*latest*" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/skills -maxdepth 1 -name "*.tar.gz" ! -name "*latest*" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true

    # WAL archive cleanup: keep only retention period worth
    WAL_ARCHIVE_DELETED=$(find /backups/wal-archive -name "*.tar.gz" -mtime +$RETENTION_DAYS -print 2>/dev/null | wc -l)
    find /backups/wal-archive -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    [ "$WAL_ARCHIVE_DELETED" -gt 0 ] && echo "[$TIMESTAMP] WAL archive cleanup: removed $WAL_ARCHIVE_DELETED archive(s) older than ${RETENTION_DAYS}d"

    # WAL segment cleanup: delete raw segments older than retention (already archived above)
    WAL_SEGMENTS_DELETED=$(find /backups/wal -maxdepth 1 -type f -mtime +$RETENTION_DAYS -print 2>/dev/null | wc -l)
    find /backups/wal -maxdepth 1 -type f -mtime +$RETENTION_DAYS -delete 2>/dev/null || true
    [ "$WAL_SEGMENTS_DELETED" -gt 0 ] && echo "[$TIMESTAMP] WAL segment cleanup: removed $WAL_SEGMENTS_DELETED file(s) older than ${RETENTION_DAYS}d"

    # Cleanup: weekly backups (longer retention)
    find /backups/postgres/weekly -name "*.sql.gz" -mtime +$WEEKLY_RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/minio/weekly -name "*.tar.gz" -mtime +$WEEKLY_RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/qdrant/weekly -name "*.tar.gz" -mtime +$WEEKLY_RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/skills/weekly -name "*.tar.gz" -mtime +$WEEKLY_RETENTION_DAYS -delete 2>/dev/null || true

    # Cleanup: monthly backups (5-year retention)
    find /backups/postgres/monthly -name "*.sql.gz" -mtime +$MONTHLY_RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/minio/monthly -name "*.tar.gz" -mtime +$MONTHLY_RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/qdrant/monthly -name "*.tar.gz" -mtime +$MONTHLY_RETENTION_DAYS -delete 2>/dev/null || true
    find /backups/skills/monthly -name "*.tar.gz" -mtime +$MONTHLY_RETENTION_DAYS -delete 2>/dev/null || true
    echo "[$TIMESTAMP] Cleanup completed (daily: ${RETENTION_DAYS}d, weekly: ${WEEKLY_RETENTION_WEEKS}w, monthly: ${MONTHLY_RETENTION_MONTHS}mo)"
else
    echo "[$TIMESTAMP] [WARNING] Skipping cleanup — backup had errors (WAL files preserved for recovery)"
fi

# Calculate backup sizes
PG_SIZE=$(du -sh /backups/postgres/ 2>/dev/null | cut -f1 || echo "0")
MINIO_SIZE=$(du -sh /backups/minio/ 2>/dev/null | cut -f1 || echo "0")
QDRANT_SIZE=$(du -sh /backups/qdrant/ 2>/dev/null | cut -f1 || echo "0")
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
  "minio_backups": $(ls /backups/minio/*.tar.gz 2>/dev/null | grep -v latest | wc -l),
  "minio_weekly": $(ls /backups/minio/weekly/*.tar.gz 2>/dev/null | wc -l),
  "minio_monthly": $(ls /backups/minio/monthly/*.tar.gz 2>/dev/null | wc -l),
  "minio_status": "$MINIO_OK",
  "qdrant_status": "$QDRANT_OK",
  "skills_status": "$SKILLS_OK",
  "skills_backups": $(find /backups/skills -maxdepth 1 -name '*.tar.gz' ! -name '*latest*' 2>/dev/null | wc -l),
  "qdrant_backups": $(find /backups/qdrant -maxdepth 1 -name '*.tar.gz' ! -name '*latest*' 2>/dev/null | wc -l),
  "qdrant_size": "$QDRANT_SIZE",
  "retention_days": $RETENTION_DAYS,
  "weekly_retention_weeks": $WEEKLY_RETENTION_WEEKS,
  "monthly_retention_months": $MONTHLY_RETENTION_MONTHS,
  "encrypted": "$BACKUP_ENCRYPT",
  "postgres_size": "$PG_SIZE",
  "minio_size": "$MINIO_SIZE",
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
