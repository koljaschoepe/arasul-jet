# Disaster Recovery & Runbooks

> **RTO**: 30 Minuten | **RPO**: 4 Stunden (mit WAL) / 24 Stunden (ohne WAL)

---

## 1. Recovery-Szenarien

### 1.1 Stromausfall

**Symptom**: Alle Container gestoppt, System bootet neu.

**Automatische Recovery**:

1. Systemd startet `arasul-platform.service` automatisch
2. `ordered-startup.sh` startet Services in 4 Phasen
3. PostgreSQL replayed WAL-Logs automatisch
4. Self-Healing-Agent validiert alle Services nach Start

**Manuelle Prüfung** (falls nötig):

```bash
# Status prüfen
docker compose ps

# Falls nicht alle Services laufen:
./scripts/system/ordered-startup.sh --skip-pull

# Datenbank-Integrität prüfen
docker exec postgres-db pg_isready -U arasul
docker exec postgres-db psql -U arasul -d arasul_db -c "SELECT count(*) FROM users;"
```

**Erwartete Recovery-Zeit**: < 5 Minuten (automatisch)

---

### 1.2 Disk-Corruption / Datenbank-Fehler

**Symptom**: PostgreSQL startet nicht, Backend meldet DB-Fehler.

**Recovery mit Backup**:

```bash
# Verfügbare Backups anzeigen
./scripts/recovery/restore-from-backup.sh --list

# Letztes Backup wiederherstellen
./scripts/recovery/restore-from-backup.sh

# Oder spezifisches Backup
./scripts/recovery/restore-from-backup.sh 2026-03-14_02-00

# Nur Datenbank wiederherstellen (MinIO/Qdrant intakt)
./scripts/recovery/restore-from-backup.sh --db-only
```

**Recovery mit WAL (Point-in-Time Recovery)**:

```bash
# 1. PostgreSQL stoppen
docker compose stop postgres-db

# 2. WAL-Archive einspielen
docker exec postgres-db pg_ctl stop -D /var/lib/postgresql/data

# 3. recovery.conf erstellen
docker exec postgres-db bash -c 'cat > /var/lib/postgresql/data/recovery.conf << EOF
restore_command = '\''cp /backups/wal/%f %p'\''
recovery_target_time = '\''2026-03-14 10:00:00'\''
EOF'

# 4. PostgreSQL neu starten
docker compose up -d postgres-db
```

**Erwartete Recovery-Zeit**: 10-30 Minuten

---

### 1.3 Hardware-Ausfall (Jetson defekt)

**Symptom**: Gerät bootet nicht mehr.

**Recovery auf neuem Gerät**:

```bash
# 1. JetPack auf neuem Jetson flashen (NVIDIA SDK Manager)

# 2a. Factory-Image verwenden (wenn vorhanden):
sudo ./factory-install.sh

# 2b. Manuelle Installation:
git clone <repo-url> /opt/arasul
cd /opt/arasul
./arasul setup
./arasul bootstrap

# 3. Backup von altem Gerät einspielen
# (Backup-Festplatte oder S3-Backup)
./scripts/recovery/restore-from-backup.sh

# 4. Modelle erneut pullen
docker exec llm-service ollama pull qwen3:14b-q8
```

**Erwartete Recovery-Zeit**: 1-2 Stunden (inkl. Model-Download)

---

### 1.4 GPU-Hang / CUDA-Fehler

**Symptom**: LLM-Service antwortet nicht, nvidia-smi hängt.

**Automatische Recovery** (wenn `SELF_HEALING_REBOOT_ENABLED=true`):

- Self-Healing-Agent erkennt GPU-Hang → Reboot

**Manuelle Recovery**:

```bash
# GPU-Status prüfen
nvidia-smi

# Falls nvidia-smi hängt (GPU-Hang):
# Option A: LLM-Service neustarten
docker compose restart llm-service

# Option B: NVIDIA Kernel-Module neuladen (kein Reboot nötig)
sudo systemctl stop arasul-platform
sudo rmmod nvidia_uvm nvidia_modeset nvidia
sudo modprobe nvidia
sudo systemctl start arasul-platform

# Option C: System-Reboot (letztes Mittel)
sudo reboot
```

---

### 1.5 Disk voll (> 95%)

**Symptom**: Services starten nicht, Schreibfehler in Logs.

**Sofort-Maßnahmen**:

```bash
# Plattenverbrauch analysieren
df -h /
du -sh /opt/arasul/data/* | sort -rh | head -10

# Docker Cleanup (gestoppte Container, ungenutzte Images)
docker system prune -f

# Alte Backups löschen
find /opt/arasul/data/backups -name "*.gz" -mtime +3 -delete

# Ungenutzte Modelle löschen
docker exec llm-service ollama list
docker exec llm-service ollama rm <unused-model>

# Docker-Logs bereinigen
truncate -s 0 /var/lib/docker/containers/*/*-json.log

# WAL-Archive bereinigen
find /opt/arasul/data/wal -type f -mtime +3 -delete
```

---

## 2. Runbooks

### 2.1 Service-Restart

```bash
# Einzelnen Service neustarten
docker compose restart <service-name>

# Service mit neuem Image
docker compose up -d --build <service-name>

# Alle Services neustarten (geordnet)
./scripts/system/ordered-startup.sh --skip-pull
```

### 2.2 Datenbank-Wartung

```bash
# VACUUM (Speicher freigeben)
docker exec postgres-db psql -U arasul -d arasul_db -c "VACUUM ANALYZE;"

# VACUUM FULL (komprimiert Tabellen, sperrt sie temporär)
docker exec postgres-db psql -U arasul -d arasul_db -c "VACUUM FULL;"

# Cleanup-Funktionen ausführen
docker exec postgres-db psql -U arasul -d arasul_db -c "SELECT run_all_cleanups();"

# Tabellen-Größen anzeigen
docker exec postgres-db psql -U arasul -d arasul_db -c "
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 20;"

# WAL-Status prüfen
docker exec postgres-db psql -U arasul -d arasul_db -c "SELECT * FROM pg_stat_archiver;"
```

### 2.3 GPU-Reset

```bash
# Status prüfen
nvidia-smi

# GPU-Prozesse auflisten
nvidia-smi pmon -c 1

# LLM-Service (Hauptnutzer der GPU) neustarten
docker compose restart llm-service embedding-service

# Warten bis Models geladen (5 Min)
sleep 300

# Prüfen ob Services gesund
curl -s http://localhost:11436/api/tags | python3 -m json.tool
curl -s http://localhost:11435/health | python3 -m json.tool
```

### 2.4 Manuelles Backup

```bash
# Manuelles Backup aller Komponenten
docker exec backup-service /app/backup.sh

# Nur Datenbank
docker exec postgres-db pg_dump -U arasul arasul_db | gzip > backup_manual.sql.gz

# Backup-Report anzeigen
docker exec backup-service cat /backups/backup_report.json | python3 -m json.tool
```

### 2.5 Netzwerk-Diagnose

```bash
# DNS prüfen
docker exec dashboard-backend nslookup dns.google

# Interne Service-Kommunikation prüfen
docker exec dashboard-backend curl -sf http://llm-service:11436/api/tags
docker exec dashboard-backend curl -sf http://embedding-service:11435/health
docker exec dashboard-backend curl -sf http://qdrant:6333/collections
docker exec dashboard-backend curl -sf http://metrics-collector:9100/health

# Reverse-Proxy Status
docker exec reverse-proxy traefik healthcheck
```

---

## 3. Wartungsplan

| Intervall     | Aktion                                 | Automatisch? |
| ------------- | -------------------------------------- | ------------ |
| Alle 4h       | DB-Cleanup (`run_all_cleanups()`)      | Ja           |
| Täglich 02:00 | Full Backup (DB + MinIO + Qdrant)      | Ja           |
| Alle 10s      | Self-Healing Check                     | Ja           |
| Alle 30s      | Docker-Watchdog                        | Ja (systemd) |
| Alle 30s      | Deadman-Switch für Self-Healing        | Ja (systemd) |
| Wöchentlich   | Sonntags-Backup (12 Wochen aufbewahrt) | Ja           |
| Monatlich     | VACUUM FULL (manuell, bei Bedarf)      | Nein         |
| Quartalsweise | DR-Drill (Restore testen)              | Nein         |

---

## 4. Kontakt & Eskalation

| Stufe | Trigger                         | Aktion                               |
| ----- | ------------------------------- | ------------------------------------ |
| L1    | Service unhealthy               | Automatischer Restart (Self-Healing) |
| L2    | Mehrfach-Restart fehlgeschlagen | GPU-Reset oder Container-Neubau      |
| L3    | System nicht recoverable        | Restore aus Backup                   |
| L4    | Hardware-Defekt                 | Factory-Image auf neuem Gerät        |
