#!/bin/bash
# Phase 2.1 — Re-Encrypt aller bestehenden MinIO-Objekte unter KMS-SSE.
#
# MinIO verschlüsselt nach Aktivierung von MINIO_KMS_AUTO_ENCRYPTION nur
# NEU eingestellte Objekte. Bestehende Objekte bleiben Plaintext, bis sie
# einmal re-uploaded werden. Dieses Skript kopiert jeden Bucket-Eintrag
# in sich selbst — der Copy-Befehl triggert die Verschlüsselung.
#
# Aufruf:
#   ./scripts/maintenance/reencrypt-minio.sh [bucket]   # default: alle Buckets
#
# Sicherheit: idempotent (mehrfaches Ausführen ist OK), preserves
# user-metadata. Funktioniert während laufendem Betrieb.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

BUCKETS="${1:-}"

# Configure mc client to talk to local MinIO.
docker exec minio sh -c '
  mc alias set local http://localhost:9000 \
    "$(cat /run/secrets/minio_root_user)" \
    "$(cat /run/secrets/minio_root_password)" >/dev/null 2>&1
'

if [ -z "$BUCKETS" ]; then
  BUCKETS="$(docker exec minio mc ls local --json | grep -oE '"key": *"[^"/]+/' | sed -E 's/"key": *"([^/]+)\//\1/' | sort -u)"
fi

echo "Re-encrypting buckets: $BUCKETS"

for bucket in $BUCKETS; do
  echo
  echo "[BUCKET] $bucket"
  # Set bucket-level encryption policy first (covers future PUTs).
  docker exec minio mc encrypt set sse-s3 local/"$bucket" 2>/dev/null || true

  # Force re-write of all existing objects to apply encryption.
  # mc cp from bucket to itself is the documented MinIO trick.
  docker exec minio mc mirror --overwrite --quiet local/"$bucket" local/"$bucket"
  echo "  done."
done

echo
echo "[OK] Re-Encrypt fertig. Verifikation:"
docker exec minio mc encrypt info local/"$bucket" 2>/dev/null || true
