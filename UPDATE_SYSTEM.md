# ARASUL Update System - Complete Documentation

**Status**: 100% Implementiert ✅ PRODUKTIONSREIF
**Datum**: 2025-11-11
**PRD Referenz**: §33

---

## 🎯 Übersicht

Das Update-System ermöglicht sichere, automatische und rollback-fähige System-Updates über zwei Kanäle:
1. **Dashboard Upload** - Manuelle Uploads durch Admin über Web-UI
2. **USB Auto-Update** - Automatische Erkennung von Updates auf USB-Sticks

**Implementierte Features:**
- ✅ OpenSSL-basierte Signaturprüfung (RSA-SHA256)
- ✅ Automatisches Backup vor jedem Update
- ✅ Atomare Update-Anwendung mit Rollback
- ✅ USB Auto-Detection und -Verarbeitung
- ✅ Vollständiges Update-Tracking in PostgreSQL
- ✅ Heartbeat & State Recovery nach Stromausfall

---

## 📦 Update Package Format (.araupdate)

Ein `.araupdate` File ist ein komprimiertes Tar-Archiv mit folgender Struktur:

```
update_v1.2.0.araupdate (tar.gz)
├── manifest.json              # Update Metadata
├── payload/
│   ├── docker_images/
│   │   ├── llm-service.tar    # Docker image tar export
│   │   ├── dashboard-backend.tar
│   │   └── ...
│   ├── migrations/
│   │   ├── 005_new_feature.sql
│   │   └── 006_schema_change.sql
│   ├── frontend/
│   │   └── dashboard-bundle.tar.gz
│   └── config/
│       └── env_changes.json
└── signature.sig              # Separate RSA signature file
```

### manifest.json Format

```json
{
  "version": "1.2.0",
  "min_version": "1.0.0",
  "release_date": "2025-11-11T12:00:00Z",
  "requires_reboot": false,
  "components": [
    {
      "name": "llm-service",
      "type": "docker_image",
      "file": "docker_images/llm-service.tar",
      "service": "llm-service",
      "version_from": "1.1.0",
      "version_to": "1.2.0"
    },
    {
      "name": "database_migration",
      "type": "migration",
      "file": "migrations/005_new_feature.sql",
      "requires": ["postgres-db"]
    }
  ],
  "changelog": "- Added GPU temperature monitoring\n- Fixed memory leak in LLM service",
  "checksum": "sha256:abc123..."
}
```

---

## 🔐 Signaturprüfung

### Öffentlicher Schlüssel Setup

Der öffentliche Schlüssel muss in `/arasul/config/public_update_key.pem` liegen:

```bash
# Generate key pair (nur für Entwicklung)
openssl genrsa -out private_key.pem 4096
openssl rsa -in private_key.pem -pubout -out public_update_key.pem

# Place public key on device
cp public_update_key.pem /arasul/config/
chmod 644 /arasul/config/public_update_key.pem
```

### Signatur erstellen (Build-Server)

```bash
# Sign update package
openssl dgst -sha256 -sign private_key.pem \
  -out update_v1.2.0.araupdate.sig \
  update_v1.2.0.araupdate
```

### Signaturprüfung (Automatisch)

Die Signatur wird automatisch beim Upload/USB-Erkennung geprüft:

```javascript
// UpdateService.verifySignature()
const verify = crypto.createVerify('RSA-SHA256');
verify.update(updateData);
verify.end();
const isValid = verify.verify(publicKey, signature);
```

**Validierung schlägt fehl bei:**
- Signatur-File fehlt (`.araupdate.sig` nicht vorhanden)
- Signatur ungültig (Datei wurde manipuliert)
- Public Key nicht gefunden
- Manifest-Struktur ungültig
- Version nicht kompatibel

---

## 🌐 Dashboard Upload

### API Endpoints

#### 1. Upload Update Package

```http
POST /api/update/upload
Authorization: Bearer <JWT_TOKEN>
Content-Type: multipart/form-data

Body:
  file: <.araupdate file>
  signature: <.araupdate.sig file> (optional, can be separate)
```

**Response (Success):**
```json
{
  "status": "validated",
  "version": "1.2.0",
  "size": 1073741824,
  "components": [...],
  "requires_reboot": false,
  "timestamp": "2025-11-11T12:00:00.000Z",
  "message": "Update package validated successfully. Use /api/update/apply to install.",
  "file_path": "/arasul/updates/update_20251111_120000_v1.2.0.araupdate"
}
```

**Response (Validation Fehler):**
```json
{
  "error": "Invalid signature",
  "timestamp": "2025-11-11T12:00:00.000Z"
}
```

#### 2. Apply Update

```http
POST /api/update/apply
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Body:
{
  "file_path": "/arasul/updates/update_20251111_120000_v1.2.0.araupdate"
}
```

**Response:**
```json
{
  "status": "started",
  "message": "Update process started. Use /api/update/status to monitor progress.",
  "timestamp": "2025-11-11T12:00:00.000Z"
}
```

#### 3. Check Update Status

```http
GET /api/update/status
Authorization: Bearer <JWT_TOKEN>
```

**Response (In Progress):**
```json
{
  "status": "in_progress",
  "version": "1.2.0",
  "currentStep": "loading_images",
  "startTime": "2025-11-11T12:00:00.000Z",
  "lastUpdate": "2025-11-11T12:02:00.000Z"
}
```

**Response (Completed):**
```json
{
  "status": "completed",
  "version": "1.2.0",
  "currentStep": "done",
  "startTime": "2025-11-11T12:00:00.000Z",
  "endTime": "2025-11-11T12:05:00.000Z",
  "timestamp": "2025-11-11T12:05:00.000Z"
}
```

**Response (Failed):**
```json
{
  "status": "failed",
  "error": "Service llm-service did not become healthy within 60s",
  "currentStep": "updating_services",
  "startTime": "2025-11-11T12:00:00.000Z",
  "endTime": "2025-11-11T12:03:00.000Z"
}
```

#### 4. Update History

```http
GET /api/update/history
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "updates": [
    {
      "id": 5,
      "version_from": "1.1.0",
      "version_to": "1.2.0",
      "status": "completed",
      "source": "dashboard",
      "started_at": "2025-11-11T12:00:00.000Z",
      "completed_at": "2025-11-11T12:05:00.000Z",
      "duration_seconds": 300
    }
  ],
  "timestamp": "2025-11-11T12:10:00.000Z"
}
```

---

## 💾 USB Auto-Update

### Funktionsweise

1. **USB-Stick wird eingesteckt** → udev Rule triggert
2. **USB Monitor** (`usb_monitor.py`) scannt nach `.araupdate` Files
3. **Automatische Validierung** (Signatur, Version, Manifest)
4. **Automatisches Kopieren** nach `/arasul/updates/usb/`
5. **Automatische Installation** via Dashboard Backend API
6. **Logging** in `/arasul/logs/update_usb.log`

### USB-Stick Vorbereitung

```bash
# USB-Stick formatieren (FAT32 für Kompatibilität)
sudo mkfs.vfat -F 32 /dev/sdX1

# Mount
sudo mount /dev/sdX1 /mnt/usb

# Update Files kopieren
cp update_v1.2.0.araupdate /mnt/usb/
cp update_v1.2.0.araupdate.sig /mnt/usb/

# Unmount
sudo umount /mnt/usb
```

### Installation der udev Rule

```bash
# Copy udev rule
sudo cp config/udev/99-arasul-usb.rules /etc/udev/rules.d/

# Copy trigger script
sudo cp scripts/arasul-usb-trigger.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/arasul-usb-trigger.sh

# Reload udev rules
sudo udevadm control --reload-rules
sudo udevadm trigger
```

### USB Monitor Logs

```bash
# Echtzeit-Logs
docker logs -f self-healing-agent | grep -i usb

# USB Update Log
tail -f /arasul/logs/update_usb.log
```

**Log Format:**
```json
{"timestamp": "2025-11-11T12:00:00.000Z", "filename": "update_v1.2.0.araupdate", "version": "1.2.0", "status": "started"}
{"timestamp": "2025-11-11T12:05:00.000Z", "filename": "update_v1.2.0.araupdate", "version": "1.2.0", "status": "completed"}
```

---

## 🔄 Update Process Flow

### 1. Validation Phase

```
Upload/USB Detection
  ↓
Check Signature File Exists
  ↓
Verify RSA-SHA256 Signature
  ↓
Extract manifest.json
  ↓
Validate Manifest Structure
  ↓
Check Version Compatibility
  ↓
Save to update_files table
```

### 2. Application Phase

```
Pre-Update Backup
  ├── Database Dump (pg_dump)
  ├── Docker Images (docker save)
  ├── docker-compose.yml
  ├── .env file
  └── Current version.txt
     ↓
Load New Docker Images
  ↓
Stop Affected Services (reverse order)
  ↓
Run Database Migrations
  ↓
Start Services (correct order)
  ↓
Healthcheck Validation (60s timeout)
  ↓
Update System Version
  ↓
Mark as Completed
```

### 3. Rollback (on Failure)

```
Detect Critical Failure
  ↓
Stop All Services
  ↓
Restore Database (psql < backup.sql)
  ↓
Restore docker-compose.yml
  ↓
Restore .env
  ↓
Restart Services
  ↓
Verify Health
  ↓
Log Rollback Event
```

---

## 📊 Database Schema

### update_events
Tracks all update attempts:
```sql
- id, version_from, version_to, status
- source (dashboard/usb/automatic)
- components_updated (JSONB)
- started_at, completed_at, duration_seconds
- requires_reboot, reboot_completed
```

### update_files
Registry of uploaded/detected files:
```sql
- id, filename, file_path
- checksum_sha256, file_size_bytes
- source, uploaded_at
- signature_verified, manifest (JSONB)
- applied, applied_at
```

### update_backups
Backup tracking:
```sql
- id, backup_path, update_event_id
- created_at, backup_size_mb
- components (JSONB)
- restoration_tested
```

### update_rollbacks
Rollback history:
```sql
- id, original_update_event_id, backup_id
- rollback_reason, initiated_by
- started_at, completed_at, success
- services_restored, database_restored
```

### component_updates
Per-component tracking:
```sql
- id, update_event_id, component_name
- component_type (docker_image/migration/config)
- version_from, version_to, status
- started_at, completed_at, error_message
```

---

## 🛡️ Safety Mechanisms

### 1. Atomicity
- Alle Changes werden in Transaktion durchgeführt
- Bei Fehler: Automatischer Rollback
- State wird in `update_state.json` persistiert

### 2. Healthchecks
Nach jedem Update werden kritische Services validiert:
```javascript
const criticalServices = [
  'postgres-db',
  'metrics-collector',
  'llm-service',
  'dashboard-backend',
  'dashboard-frontend'
];

// Wait max 60s for each service
await waitForServiceHealth(service, 60);
```

### 3. Backup Strategy
Vor jedem Update wird ein vollständiges Backup erstellt:
- Database: `pg_dump > backup.sql`
- Container Versions: `docker ps --format json`
- Config Files: `docker-compose.yml`, `.env`
- System Version: `version.txt`

Backups werden in `/arasul/backups/backup_TIMESTAMP/` gespeichert.

### 4. Version Compatibility
```javascript
// Update muss neuer sein als aktuelle Version
if (compareVersions(manifest.version, currentVersion) <= 0) {
  throw new Error('Not newer than current version');
}

// Aktuelle Version muss min_version erfüllen
if (compareVersions(currentVersion, manifest.min_version) < 0) {
  throw new Error('Current version too old');
}
```

### 5. Rollback Triggers
Automatischer Rollback bei:
- Healthcheck Failure nach Update
- Service startet nicht innerhalb 60s
- Database Migration schlägt fehl
- Docker Image Loading fehlgeschlagen

---

## 🔧 Troubleshooting

### Update schlägt fehl: "Signature verification failed"

**Ursache:** Public Key fehlt oder Signatur ungültig

**Lösung:**
```bash
# Check if public key exists
ls -la /arasul/config/public_update_key.pem

# Verify signature manually
openssl dgst -sha256 -verify /arasul/config/public_update_key.pem \
  -signature update.araupdate.sig update.araupdate
```

### Update hängt bei "loading_images"

**Ursache:** Docker Image zu groß oder Disk voll

**Lösung:**
```bash
# Check disk space
df -h /var/lib/docker

# Clean up old images
docker system prune -a --volumes
```

### Rollback schlägt fehl

**Ursache:** Backup korrupt oder fehlt

**Lösung:**
```bash
# List available backups
ls -la /arasul/backups/

# Manually restore from backup
cd /arasul/backups/backup_TIMESTAMP/
docker-compose -f docker-compose.yml down
cp docker-compose.yml /arasul/
docker exec postgres-db psql -U arasul -d arasul_db < database.sql
docker-compose -f /arasul/docker-compose.yml up -d
```

### USB wird nicht erkannt

**Ursache:** udev Rule nicht aktiv oder USB Monitor nicht laufend

**Lösung:**
```bash
# Check if udev rule is installed
ls -la /etc/udev/rules.d/99-arasul-usb.rules

# Reload udev
sudo udevadm control --reload-rules
sudo udevadm trigger

# Check if USB monitor is running
docker exec self-healing-agent pgrep -f usb_monitor.py

# Check USB logs
tail -f /arasul/logs/usb_trigger.log
```

---

## 📝 Update Package Erstellen (Build Server)

### 1. Prepare Docker Images

```bash
# Export updated images
docker save llm-service:1.2.0 -o llm-service.tar
docker save dashboard-backend:1.2.0 -o dashboard-backend.tar
```

### 2. Create Manifest

```bash
cat > manifest.json <<EOF
{
  "version": "1.2.0",
  "min_version": "1.0.0",
  "release_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "requires_reboot": false,
  "components": [
    {
      "name": "llm-service",
      "type": "docker_image",
      "file": "payload/docker_images/llm-service.tar",
      "service": "llm-service",
      "version_to": "1.2.0"
    }
  ]
}
EOF
```

### 3. Create Package Structure

```bash
mkdir -p update_v1.2.0/payload/docker_images
mkdir -p update_v1.2.0/payload/migrations

cp llm-service.tar update_v1.2.0/payload/docker_images/
cp manifest.json update_v1.2.0/
cp migrations/*.sql update_v1.2.0/payload/migrations/
```

### 4. Create Archive

```bash
tar -czf update_v1.2.0.araupdate -C update_v1.2.0 .
```

### 5. Sign Package

```bash
openssl dgst -sha256 -sign private_key.pem \
  -out update_v1.2.0.araupdate.sig \
  update_v1.2.0.araupdate
```

### 6. Verify (Test)

```bash
openssl dgst -sha256 -verify public_update_key.pem \
  -signature update_v1.2.0.araupdate.sig \
  update_v1.2.0.araupdate
```

---

## ✅ Testing Checklist

### Dashboard Upload Test
- [ ] Upload .araupdate File (mit Signatur)
- [ ] Validation erfolgreich
- [ ] Apply Update
- [ ] Monitor Status bis "completed"
- [ ] Verify new version: `GET /api/system/info`
- [ ] Check update history: `GET /api/update/history`

### USB Auto-Update Test
- [ ] Copy .araupdate + .sig auf USB-Stick
- [ ] Einstecken
- [ ] Check USB logs: `tail -f /arasul/logs/usb_trigger.log`
- [ ] Check Update Status: `GET /api/update/status`
- [ ] Verify Update completed

### Rollback Test
- [ ] Upload defektes Update (z.B. fehlerhafte Migration)
- [ ] Apply Update
- [ ] Verify automatic rollback
- [ ] Check rollback log in `update_rollbacks` table
- [ ] Verify services healthy nach Rollback

### Signature Failure Test
- [ ] Upload .araupdate ohne .sig File
- [ ] Verify validation fails
- [ ] Upload mit ungültiger Signatur
- [ ] Verify validation fails

---

## 🚀 Production Deployment

### Initial Setup

```bash
# Generate key pair (secure environment)
openssl genrsa -out private_key.pem 4096
openssl rsa -in private_key.pem -pubout -out public_update_key.pem

# Copy public key to device
scp public_update_key.pem jetson@arasul.local:/arasul/config/

# Install udev rule
ssh jetson@arasul.local
sudo cp /arasul/config/udev/99-arasul-usb.rules /etc/udev/rules.d/
sudo cp /arasul/scripts/arasul-usb-trigger.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/arasul-usb-trigger.sh
sudo udevadm control --reload-rules
```

### Environment Variables

```bash
# .env.template
UPDATE_PUBLIC_KEY_PATH=/arasul/config/public_update_key.pem
DASHBOARD_BACKEND_URL=http://dashboard-backend:3001
SYSTEM_VERSION=1.0.0
BUILD_HASH=abc123def456
```

---

## 📈 Monitoring

### Key Metrics

```sql
-- Update success rate (last 30 days)
SELECT
  COUNT(*) as total,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
  ROUND(100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM update_events
WHERE started_at > NOW() - INTERVAL '30 days';

-- Average update duration
SELECT AVG(duration_seconds) as avg_duration_sec
FROM update_events
WHERE status = 'completed'
AND started_at > NOW() - INTERVAL '30 days';

-- Failed updates (investigate)
SELECT version_to, error_message, started_at
FROM update_events
WHERE status = 'failed'
ORDER BY started_at DESC;
```

---

**Ende der Dokumentation**

*Generiert am 2025-11-11 | Update System v1.0*
