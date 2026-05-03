#!/bin/bash
# Phase 2 Setup — Verschlüsselungs-Schlüssel für MinIO-KMS und Backup
# generieren. Idempotent: bestehende Keys werden NICHT überschrieben.
#
# Aufruf:
#   ./scripts/setup/init-encryption-keys.sh
#
# Anschließend:
#   docker compose -f docker-compose.yml \
#                  -f compose/compose.encryption.yaml up -d minio backup-service

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SECRET_DIR="$PROJECT_ROOT/config/secrets"

mkdir -p "$SECRET_DIR"

# 1. MinIO KMS Master-Key (Format: <key-name>:<base64-key>)
KMS_FILE="$SECRET_DIR/minio_kms_key"
if [ -f "$KMS_FILE" ] && [ -s "$KMS_FILE" ]; then
    echo "[OK] MinIO KMS Master-Key existiert bereits: $KMS_FILE"
else
    KEY_NAME="arasul-master-key"
    KEY_VALUE="$(openssl rand -base64 32 | tr -d '\n')"
    printf '%s:%s' "$KEY_NAME" "$KEY_VALUE" > "$KMS_FILE"
    chmod 600 "$KMS_FILE"
    echo "[NEW] MinIO KMS Master-Key erstellt: $KMS_FILE ($(wc -c < "$KMS_FILE") Bytes)"
fi

# 2. Backup-Encryption-Key (Hex 64 Zeichen)
BACKUP_KEY_FILE="$SECRET_DIR/backup_encryption_key"
if [ -f "$BACKUP_KEY_FILE" ] && [ -s "$BACKUP_KEY_FILE" ]; then
    echo "[OK] Backup-Encryption-Key existiert bereits: $BACKUP_KEY_FILE"
else
    openssl rand -hex 32 > "$BACKUP_KEY_FILE"
    chmod 600 "$BACKUP_KEY_FILE"
    echo "[NEW] Backup-Encryption-Key erstellt: $BACKUP_KEY_FILE ($(wc -c < "$BACKUP_KEY_FILE") Bytes)"
fi

echo
echo "Nächste Schritte:"
echo "  1. Compose-Encryption-Override aktivieren:"
echo "     docker compose -f docker-compose.yml -f compose/compose.encryption.yaml up -d minio backup-service"
echo
echo "  2. Bestehende MinIO-Daten re-encrypten:"
echo "     ./scripts/maintenance/reencrypt-minio.sh"
echo
echo "  3. Backup-Restore-Drill prüfen:"
echo "     docker exec backup-service /restore-drill.sh"
echo
echo "WICHTIG: Beide Keys MÜSSEN gesichert werden (config/secrets/* ist im"
echo "         Backup enthalten). Bei Verlust → Daten unwiederherstellbar!"
