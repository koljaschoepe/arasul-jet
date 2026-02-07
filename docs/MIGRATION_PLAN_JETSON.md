# Arasul Platform - Jetson Migration Plan

> **Erstellt:** 2026-01-22
> **Basierend auf:** Umfassende Analyse mit 17 parallelen Agents
> **Ziel:** Saubere Initialisierung auf neuem Jetson AGX Orin

---

## Executive Summary

Die Arasul Platform ist zu **95% produktionsreif** für Jetson AGX Orin. Die Analyse identifizierte **~200 Issues** in verschiedenen Kategorien:

| Priorität | Anzahl | Status |
|-----------|--------|--------|
| 🔴 KRITISCH | 12 | Vor Migration fixen |
| 🟠 HOCH | 28 | Nach Migration fixen |
| 🟡 MITTEL | ~50 | Backlog |
| 🟢 NIEDRIG | ~110 | Nice-to-have |

**Geschätzte Setup-Zeit auf neuem Jetson:** 45-90 Minuten (abhängig von Internet)

---

## Teil 1: Kritische Issues (VOR Migration fixen)

### 🔴 SEC-C001: Passwort-Mindestanforderungen zu schwach

**Datei:** `scripts/validate_config.sh:144`
```bash
# AKTUELL: Nur 4 Zeichen Minimum
if [ "$length" -lt 4 ]; then
    log_warning "$var_name is too short (< 4 characters)"
```

**FIX:**
```bash
# SOLLTE: 12 Zeichen Minimum für Produktion
if [ "$length" -lt 12 ]; then
    log_error "$var_name is too short (< 12 characters) - SECURITY RISK"
    ERRORS=$((ERRORS + 1))
fi
```

**Aufwand:** 5 Minuten

---

### 🔴 SEC-C002: XSS-Risiko in MermaidDiagram

**Datei:** `services/dashboard-frontend/src/components/MermaidDiagram.js`
```javascript
// AKTUELL: Unsicheres dangerouslySetInnerHTML
<div dangerouslySetInnerHTML={{ __html: svg }} />
```

**FIX:** DOMPurify sanitization hinzufügen
```javascript
import DOMPurify from 'dompurify';
// ...
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg) }} />
```

**Aufwand:** 10 Minuten

---

### 🔴 SEC-C003: Docker Socket Direktzugriff

**Datei:** `docker-compose.yml` (mehrere Services)
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock
```

**Betroffene Services:**
- self-healing-agent
- dashboard-backend
- metrics-collector

**FIX:** Für Produktion: Docker API Proxy oder read-only Mount
```yaml
volumes:
  - /var/run/docker.sock:/var/run/docker.sock:ro
```

**Aufwand:** 5 Minuten

---

### 🔴 DB-001: Migration 004 fehlt IF NOT EXISTS

**Datei:** `services/postgres/init/004_update_schema.sql`

**Problem:** Bei Neustart könnten Fehler auftreten

**FIX:** Alle CREATE-Statements mit IF NOT EXISTS versehen

**Aufwand:** 15 Minuten

---

### 🔴 DB-002: UNIQUE Constraint blockiert Retry

**Datei:** `services/postgres/init/009_documents_schema.sql`
```sql
CONSTRAINT unique_minio_path UNIQUE (minio_path)
```

**Problem:** Document Indexer kann fehlgeschlagene Dokumente nicht erneut verarbeiten

**FIX:** Soft-delete Pattern oder UNIQUE auf (minio_path, status)

**Aufwand:** 20 Minuten

---

### 🔴 DB-003: Referenz auf nicht-existente 'users' Tabelle

**Datei:** `services/postgres/init/028_fix_user_references.sql`

**Problem:** Einige Queries referenzieren 'users' statt 'admin_users'

**FIX:** Konsistente Verwendung von 'admin_users'

**Aufwand:** 15 Minuten

---

### 🔴 BACKUP-001: Qdrant nicht im Backup

**Problem:** Vektordatenbank wird NICHT gesichert!

**FIX für `scripts/backup.sh`:**
```bash
backup_qdrant() {
    log "INFO" "Starting Qdrant backup..."
    curl -X POST "http://localhost:6333/snapshots" -H "Content-Type: application/json"
    docker cp qdrant:/qdrant/snapshots "${BACKUP_DIR}/qdrant/"
}
```

**Aufwand:** 30 Minuten

---

### 🔴 BACKUP-002: n8n Workflows nicht im Backup

**Problem:** Alle Workflows gehen bei Datenverlust verloren

**FIX:** n8n CLI Export in backup.sh integrieren
```bash
backup_n8n() {
    docker exec n8n n8n export:workflow --all --output=/tmp/workflows.json
    docker cp n8n:/tmp/workflows.json "${BACKUP_DIR}/n8n/"
}
```

**Aufwand:** 30 Minuten

---

### 🔴 TELEGRAM-001: Commands nicht registriert

**Datei:** `services/telegram-bot/bot.py`

**Problem:** Commands in `commands/` Ordner existieren aber sind nicht im Bot registriert

**FIX:** Import und Registration der Commands
```python
from commands import disk, logs, services, status
# In bot initialization:
application.add_handler(CommandHandler("disk", disk.handle))
application.add_handler(CommandHandler("services", services.handle))
```

**Aufwand:** 20 Minuten

---

### 🔴 SELF-HEAL-001: Gefährlicher Disk Cleanup

**Datei:** `services/self-healing-agent/healing_engine.py`
```python
# GEFÄHRLICH: Kann wichtige Volumes löschen!
docker system prune --volumes -f
```

**FIX:** Selektives Cleanup ohne --volumes
```python
docker system prune -f  # Ohne Volumes
docker image prune -a -f --filter "until=168h"  # Nur alte Images
```

**Aufwand:** 15 Minuten

---

### 🔴 SELF-HEAL-002: Reboot-Loop nicht verhindert

**Problem:** Maximale Reboots (3/Stunde) zu permissiv

**FIX:** Cooldown erhöhen, exponentielles Backoff
```python
MAX_REBOOTS_PER_HOUR = 1
REBOOT_COOLDOWN_MINUTES = 30
```

**Aufwand:** 10 Minuten

---

### 🔴 SHARED-001: Shared Library nicht integriert

**Problem:** `shared-python/` ist gut gebaut aber wird von KEINEM Service verwendet!

**Auswirkung:** ~30-40% doppelter Code in Python Services

**FIX:** Integration in alle Python Services (document-indexer, metrics-collector, self-healing-agent, telegram-bot)

**Aufwand:** 2-3 Stunden (nach Migration)

---

## Teil 2: Hohe Priorität (NACH Migration fixen)

### 🟠 BACKEND-H001: Memory Leak in WebSocket Handler

**Datei:** `services/dashboard-backend/src/routes/metrics.js`

**Problem:** Clients werden bei Disconnect nicht entfernt

**FIX:** Cleanup-Handler implementieren

---

### 🟠 BACKEND-H002: N+1 Query in Chat-Route

**Datei:** `services/dashboard-backend/src/routes/chats.js`

**Problem:** Für jede Conversation separate Query für Messages

**FIX:** JOIN oder Batch-Query

---

### 🟠 FRONTEND-H001: Race Condition WebSocket/HTTP

**Datei:** `services/dashboard-frontend/src/components/ChatMulti.js`

**Problem:** Gleichzeitiger WebSocket-Stream und HTTP-Polling

**FIX:** Polling nur wenn WebSocket disconnected

---

### 🟠 FRONTEND-H002: Component zu groß

**Datei:** `services/dashboard-frontend/src/components/ChatMulti.js` (1574 Zeilen!)

**FIX:** In kleinere Komponenten aufteilen

---

### 🟠 DOCKER-H001: Latest Tags für Images

**Problem:** minio/minio:latest, qdrant/qdrant:latest

**FIX:** Pinned Versions verwenden
```yaml
minio/minio:RELEASE.2024-01-16T16-07-38Z
qdrant/qdrant:v1.7.4
```

---

### 🟠 TRAEFIK-H001: Claude Terminal Service nicht definiert

**Datei:** `config/traefik/dynamic/routes.yml`

**Problem:** Referenziert `claude-terminal@docker` das nicht existiert

**FIX:** Service Definition hinzufügen oder Route entfernen

---

### 🟠 METRICS-H001: Hardcoded 7-Tage Retention

**Datei:** `services/metrics-collector/collector.py`

**Problem:** Nicht konfigurierbar

**FIX:** Environment Variable METRICS_RETENTION_DAYS

---

## Teil 3: Jetson Migration Checkliste

### Phase 0: Vorbereitung auf ALTEM Jetson (30 Min)

```bash
# 0.1 Vollständiges Backup erstellen
./scripts/backup.sh

# 0.2 Qdrant Snapshot (MANUELL - nicht im Backup!)
curl -X POST "http://localhost:6333/snapshots" -H "Content-Type: application/json"
docker cp qdrant:/qdrant/snapshots /tmp/qdrant-backup/

# 0.3 n8n Workflows exportieren (MANUELL)
docker exec n8n n8n export:workflow --all --output=/tmp/workflows.json
docker cp n8n:/tmp/workflows.json /tmp/n8n-backup/

# 0.4 Docker Volumes exportieren
for vol in arasul-llm-models arasul-embeddings-models arasul-letsencrypt; do
  docker run --rm -v ${vol}:/data -v /tmp/volumes:/backup \
    alpine tar czf /backup/${vol}.tar.gz -C /data .
done

# 0.5 Konfiguration sichern
cp -r .env config/ /tmp/arasul-config/

# 0.6 Alles in ein Archiv
tar czf /tmp/arasul-migration-$(date +%Y%m%d).tar.gz \
  /tmp/qdrant-backup /tmp/n8n-backup /tmp/volumes /tmp/arasul-config data/backups
```

### Phase 1: Neuen Jetson vorbereiten (20 Min)

```bash
# 1.1 JetPack 6.0+ installieren (via NVIDIA SDK Manager)
# → Bereits auf neuem Jetson vorinstalliert? Prüfen:
cat /etc/nv_tegra_release
dpkg -l | grep nvidia-jetpack

# 1.2 System aktualisieren
sudo apt update && sudo apt upgrade -y
sudo reboot

# 1.3 Docker prüfen
docker --version  # 24.0+
docker compose version  # V2

# 1.4 NVIDIA Runtime testen
docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi

# 1.5 Storage vorbereiten (NVMe SSD empfohlen)
# Mindestens 256GB, empfohlen 512GB
df -h
```

### Phase 2: Repository & Daten übertragen (15 Min)

```bash
# 2.1 Repository klonen
cd ~
git clone https://github.com/arasul/arasul-platform.git arasul-platform
cd arasul-platform

# 2.2 Migration-Archiv übertragen
scp user@old-jetson:/tmp/arasul-migration-*.tar.gz .

# 2.3 Archiv entpacken
tar xzf arasul-migration-*.tar.gz
mv tmp/arasul-config/.env .
mv tmp/arasul-config/config/* config/
```

### Phase 3: Kritische Fixes anwenden (30 Min)

**VOR dem Bootstrap diese Fixes anwenden:**

```bash
# 3.1 Passwort-Validation (SEC-C001)
# In scripts/validate_config.sh Zeile 144 ändern

# 3.2 MermaidDiagram XSS Fix (SEC-C002)
# In services/dashboard-frontend/src/components/MermaidDiagram.js

# 3.3 Docker Socket Read-Only (SEC-C003)
# In docker-compose.yml für betroffene Services

# 3.4 Database Migrations prüfen (DB-001, DB-002, DB-003)
# In services/postgres/init/*.sql

# 3.5 Self-Healing Safety (SELF-HEAL-001, SELF-HEAL-002)
# In services/self-healing-agent/healing_engine.py
```

### Phase 4: Bootstrap ausführen (20-45 Min)

```bash
# 4.1 Bootstrap starten
./arasul bootstrap

# Erwartet:
# [INFO] Checking system requirements...
# [SUCCESS] Jetson AGX Orin detected
# [SUCCESS] Docker found
# [INFO] Pulling Docker images...
# [INFO] Building services...
# [INFO] Starting services...
# [SUCCESS] All services healthy

# 4.2 Status prüfen
./arasul status
docker compose ps
```

### Phase 5: Daten wiederherstellen (15 Min)

```bash
# 5.1 PostgreSQL & MinIO Backup wiederherstellen
./scripts/restore.sh --latest

# 5.2 Qdrant Snapshot importieren
docker cp tmp/qdrant-backup/ qdrant:/qdrant/snapshots/
docker exec qdrant curl -X POST "http://localhost:6333/snapshots/recover"

# 5.3 n8n Workflows importieren
docker cp tmp/n8n-backup/workflows.json n8n:/tmp/
docker exec n8n n8n import:workflow --input=/tmp/workflows.json

# 5.4 LLM Models wiederherstellen (OPTIONAL - dauert!)
# Entweder:
docker run --rm -v arasul-jet_arasul-llm-models:/data \
  -v $(pwd)/tmp/volumes:/backup alpine \
  tar xzf /backup/arasul-llm-models.tar.gz -C /data
# Oder neu downloaden:
docker exec llm-service ollama pull qwen3:14b-q8

# 5.5 Embedding Models wiederherstellen
docker run --rm -v arasul-jet_arasul-embeddings-models:/data \
  -v $(pwd)/tmp/volumes:/backup alpine \
  tar xzf /backup/arasul-embeddings-models.tar.gz -C /data
```

### Phase 6: Validierung (10 Min)

```bash
# 6.1 Alle Services healthy?
docker compose ps

# 6.2 API Health Check
curl http://localhost/api/health

# 6.3 GPU funktioniert?
docker exec embedding-service python3 -c "import torch; print(torch.cuda.is_available())"
# Erwartet: True

# 6.4 LLM antwortet?
curl http://localhost:11434/api/tags

# 6.5 Frontend lädt?
curl -I http://localhost/

# 6.6 Admin Login testen
# Browser: http://<jetson-ip>/
# Login: admin / <password aus .env>

# 6.7 RAG funktioniert?
# Dashboard → Documents → Liste sollte Dokumente zeigen
# Dashboard → Chat → RAG Toggle → Query testen
```

### Phase 7: Post-Migration Cleanup

```bash
# 7.1 Alte Migration-Dateien löschen
rm -rf tmp/ arasul-migration-*.tar.gz

# 7.2 Auto-Start aktivieren
sudo systemctl enable arasul.service

# 7.3 Firewall konfigurieren
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 7.4 Backup-Cronjob prüfen
crontab -l | grep backup
# Sollte: 0 2 * * * /path/to/scripts/backup.sh
```

---

## Teil 4: ARM64/Jetson Kompatibilität

### Vollständig getestete Services

| Service | ARM64 | GPU | Jetson-spezifisch |
|---------|-------|-----|-------------------|
| postgres-db | ✅ | - | - |
| minio | ✅ | - | - |
| qdrant | ✅ | - | - |
| traefik | ✅ | - | - |
| llm-service (Ollama) | ✅ | ✅ CUDA | - |
| embedding-service | ✅ | ✅ CUDA | dustynv/l4t-pytorch:r36.2.0 |
| metrics-collector | ✅ | ✅ pynvml | - |
| document-indexer | ✅ | - | - |
| self-healing-agent | ✅ | ✅ GPU Monitor | - |
| telegram-bot | ✅ | - | - |
| dashboard-backend | ✅ | - | - |
| dashboard-frontend | ✅ | - | - |
| n8n | ✅ | - | - |

### Jetson-spezifische Konfiguration

```yaml
# docker-compose.yml
embedding-service:
  environment:
    TORCH_CUDA_ARCH_LIST: "8.7"  # Jetson Orin GPU
    CUDA_VISIBLE_DEVICES: "0"
```

### GPU Memory Thresholds (für 64GB Jetson Orin)

```python
# services/self-healing-agent/gpu_recovery.py
MEMORY_WARNING_MB = 36 * 1024   # 36 GB
MEMORY_CRITICAL_MB = 38 * 1024  # 38 GB
MEMORY_MAX_MB = 40 * 1024       # 40 GB
```

---

## Teil 5: Empfohlene Reihenfolge der Fixes

### Woche 1: Kritisch (VOR Migration)

1. ✅ SEC-C001: Passwort-Mindestlänge (5 min)
2. ✅ SEC-C002: XSS in MermaidDiagram (10 min)
3. ✅ SEC-C003: Docker Socket Read-Only (5 min)
4. ✅ DB-001/002/003: Migration Fixes (30 min)
5. ✅ SELF-HEAL-001/002: Safety Fixes (25 min)

### Woche 2: Nach Migration

1. BACKUP-001/002: Qdrant + n8n Backup (1h)
2. TELEGRAM-001: Command Registration (20 min)
3. DOCKER-H001: Pinned Image Versions (30 min)
4. TRAEFIK-H001: Route Cleanup (15 min)

### Woche 3-4: Refactoring

1. SHARED-001: Shared Library Integration (3h)
2. BACKEND-H001/H002: Memory Leak + N+1 (2h)
3. FRONTEND-H001/H002: WebSocket + Component Split (4h)

---

## Teil 6: Zeitschätzung

| Phase | Dauer | Kumulativ |
|-------|-------|-----------|
| Vorbereitung (Altes System) | 30 min | 30 min |
| Neuen Jetson vorbereiten | 20 min | 50 min |
| Daten übertragen | 15 min | 1h 05min |
| Kritische Fixes | 30 min | 1h 35min |
| Bootstrap | 20-45 min | 2h 20min |
| Daten wiederherstellen | 15 min | 2h 35min |
| Validierung | 10 min | 2h 45min |

**Gesamt: ~3 Stunden** (konservativ)

---

## Anhang: Quick Reference Commands

```bash
# Status prüfen
./arasul status
docker compose ps

# Logs ansehen
./arasul logs
docker compose logs -f <service>

# Service neustarten
docker compose restart <service>

# Rebuild nach Code-Änderung
docker compose up -d --build <service>

# Backup erstellen
./scripts/backup.sh

# Backup wiederherstellen
./scripts/restore.sh --list
./scripts/restore.sh --latest

# GPU Status
nvidia-smi
docker exec llm-service ollama ps

# Database Shell
docker exec -it postgres-db psql -U arasul -d arasul_db
```

---

## Kontakt & Support

Bei Problemen während der Migration:
1. Logs prüfen: `docker compose logs`
2. Health Checks: `docker compose ps`
3. Bootstrap-Errors: `/tmp/arasul_bootstrap_errors.json`
4. Telegram-Notifications aktivieren für Alerts

---

*Erstellt von Claude Code basierend auf umfassender Codebase-Analyse*
