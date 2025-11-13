# ARASUL PLATFORM - Deployment Guide

Vollständige Anleitung für das Deployment der Arasul Platform auf NVIDIA Jetson AGX Orin.

---

## Voraussetzungen

### Hardware

- **NVIDIA Jetson AGX Orin Developer Kit**
  - 12-Core ARM Cortex-A78AE CPU
  - 64 GB DDR5 RAM
  - 2048-Core NVIDIA Ampere GPU
  - Mindestens 128 GB NVMe SSD (empfohlen: 256 GB+)

### Software

- **JetPack 6.0+** (Ubuntu 22.04 basiert)
- **Docker Engine** 24.0+
- **Docker Compose** 2.20+
- **NVIDIA Container Runtime**

---

## Schritt 1: Jetson vorbereiten

### 1.1 JetPack installieren

Verwenden Sie den NVIDIA SDK Manager:

```bash
# Auf Host-Rechner (nicht Jetson):
# - SDK Manager herunterladen von developer.nvidia.com
# - Jetson AGX Orin anschließen (USB-C Recovery Mode)
# - JetPack 6.0+ flashen
```

Alternative: SD Card Image verwenden (siehe NVIDIA Dokumentation)

### 1.2 System aktualisieren

```bash
sudo apt update
sudo apt upgrade -y
sudo reboot
```

### 1.3 Docker installieren

**Prüfen, ob Docker bereits installiert ist:**

```bash
docker --version
```

Wenn nicht installiert:

```bash
# Docker installieren
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Benutzer zur Docker-Gruppe hinzufügen
sudo usermod -aG docker $USER

# Neu anmelden für Gruppenänderung
newgrp docker
```

### 1.4 NVIDIA Container Runtime installieren

**Prüfen:**

```bash
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

Wenn Fehler auftritt:

```bash
# NVIDIA Container Runtime installieren
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
    sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt update
sudo apt install -y nvidia-docker2
sudo systemctl restart docker

# Testen
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
```

### 1.5 Docker Compose installieren

```bash
# Docker Compose Plugin (empfohlen)
sudo apt install docker-compose-plugin

# Oder standalone:
sudo curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Testen
docker compose version
```

---

## Schritt 2: Repository vorbereiten

### 2.1 Repository klonen

```bash
cd ~
git clone <repository-url> arasul-platform
cd arasul-platform
```

Oder per USB/SCP übertragen:

```bash
# Auf lokalem Rechner:
scp -r arasul-platform/ jetson@<jetson-ip>:~/

# Auf Jetson:
cd ~/arasul-platform
```

### 2.2 Verzeichnis-Struktur prüfen

```bash
ls -la
# Sollte enthalten:
# - docker-compose.yml
# - .env.template
# - arasul (Bootstrap-Script)
# - services/
# - config/
# - README.md
```

---

## Schritt 3: System initialisieren

### 3.1 Bootstrap ausführen

```bash
./arasul bootstrap
```

**Dieser Befehl:**
1. Prüft alle Voraussetzungen
2. Erstellt notwendige Verzeichnisse
3. Generiert `.env` mit sicheren Passwörtern
4. Lädt/Baut Docker Images
5. Initialisiert die Datenbank
6. Startet alle Services in korrekter Reihenfolge
7. Führt Smoke Tests durch

**Dauer:** 15-30 Minuten (abhängig von Internet-Geschwindigkeit)

### 3.2 Admin-Passwort notieren

Das Bootstrap-Script gibt am Ende aus:

```
[WARNING] IMPORTANT: Admin password: <generiertes-passwort>
Please save this password securely and change it after first login!
```

**Wichtig:** Notieren Sie dieses Passwort!

### 3.3 Bootstrap-Ausgabe prüfen

Am Ende sollten Sie sehen:

```
[SUCCESS] Arasul Platform bootstrap completed!

Dashboard URL: http://localhost
n8n URL: http://localhost/n8n
MinIO Console: http://localhost:9001
```

---

## Schritt 4: Verifizierung

### 4.1 Container-Status prüfen

```bash
./arasul status
```

Alle Services sollten `Up` und `healthy` sein:

```
NAME                    STATUS
postgres-db             Up (healthy)
minio                   Up (healthy)
metrics-collector       Up (healthy)
llm-service            Up (healthy)
embedding-service      Up (healthy)
reverse-proxy          Up
dashboard-backend      Up (healthy)
dashboard-frontend     Up
n8n                    Up (healthy)
self-healing-agent     Up
```

### 4.2 Dashboard testen

1. **Im Browser öffnen:**
   ```
   http://<jetson-ip>
   ```

2. **Sie sollten das Dashboard sehen mit:**
   - System Status: OK
   - Live Metriken (CPU, RAM, GPU, Temp)
   - Performance Chart
   - Service Status

### 4.3 API testen

```bash
# Health Check
curl http://localhost/api/health

# System Status
curl http://localhost/api/system/status

# Metrics
curl http://localhost/api/metrics/live
```

### 4.4 LLM testen

```bash
curl -X POST http://localhost/api/llm/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "max_tokens": 100
  }'
```

### 4.5 Embedding Service testen

```bash
curl -X POST http://localhost/api/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "texts": ["Hello World"]
  }'
```

---

## Schritt 5: Post-Deployment Konfiguration

### 5.1 Admin-Passwort ändern

1. Im Dashboard einloggen (admin / <generiertes-passwort>)
2. Zu Account-Einstellungen navigieren
3. Neues sicheres Passwort setzen

### 5.2 n8n konfigurieren

1. **n8n öffnen:**
   ```
   http://<jetson-ip>/n8n
   ```

2. **Erster Login:**
   - Username: `admin`
   - Password: (aus `.env`: `N8N_BASIC_AUTH_PASSWORD`)

3. **Credentials hinzufügen** für externe Services (Google, Slack, etc.)

### 5.3 MinIO konfigurieren

1. **MinIO Console öffnen:**
   ```
   http://<jetson-ip>:9001
   ```

2. **Login:**
   - Username: (aus `.env`: `MINIO_ROOT_USER`)
   - Password: (aus `.env`: `MINIO_ROOT_PASSWORD`)

3. **Buckets erstellen:**
   - `documents`
   - `workflow-data`
   - `llm-cache`
   - `embeddings-cache`

### 5.4 LLM-Modell laden

Falls beim Bootstrap nicht automatisch geladen:

```bash
# In Container einloggen
docker-compose exec llm-service bash

# Modell pullen
ollama pull llama3.1:8b

# Oder anderes Modell:
ollama pull mistral
ollama pull codellama

# Modelle auflisten
ollama list
```

### 5.5 System-Konfiguration anpassen

Bearbeiten Sie `.env` nach Bedarf:

```bash
nano .env
```

Wichtige Parameter:

```bash
# LLM Konfiguration
LLM_MODEL=llama3.1:8b        # Modell-Name
LLM_MAX_TOKENS=2048          # Max Tokens pro Anfrage
LLM_MAX_RAM_GB=40            # RAM-Limit

# Resource Limits
CPU_LIMIT_LLM=50             # CPU-Limit für LLM (Prozent)
RAM_LIMIT_LLM=32G            # RAM-Limit für LLM

# Disk Thresholds
DISK_WARNING_PERCENT=80      # Warnung
DISK_CLEANUP_PERCENT=90      # Automatisches Cleanup
DISK_CRITICAL_PERCENT=95     # Kritisch
DISK_REBOOT_PERCENT=97       # Forced Reboot
```

Nach Änderungen Services neu starten:

```bash
./arasul restart
```

---

## Schritt 6: Monitoring & Logs

### 6.1 Dashboard nutzen

Das Dashboard zeigt in Echtzeit:
- System Performance (CPU, RAM, GPU, Temp)
- Disk Usage
- Service Health
- Self-Healing Events
- Workflow Activity

### 6.2 Logs anzeigen

```bash
# Alle Logs
./arasul logs

# Spezifischer Service
./arasul logs dashboard-backend
./arasul logs llm-service
./arasul logs self-healing-agent

# Letzte 100 Zeilen
docker-compose logs --tail=100 llm-service

# Follow Mode (live)
docker-compose logs -f metrics-collector
```

### 6.3 Datenbank-Abfragen

```bash
# In PostgreSQL einloggen
docker-compose exec postgres-db psql -U arasul -d arasul_db

# Metriken abfragen
SELECT * FROM metrics_cpu ORDER BY timestamp DESC LIMIT 10;

# Self-Healing Events
SELECT * FROM self_healing_events ORDER BY timestamp DESC LIMIT 20;

# System Snapshots
SELECT * FROM system_snapshots ORDER BY timestamp DESC LIMIT 5;
```

---

## Schritt 7: Produktionsbereitschaft

### 7.1 Firewall konfigurieren

```bash
# UFW installieren (falls nicht vorhanden)
sudo apt install ufw

# Nur HTTP/HTTPS erlauben
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# SSH erlauben (wichtig!)
sudo ufw allow 22/tcp

# Optional: MinIO Console
sudo ufw allow 9001/tcp

# UFW aktivieren
sudo ufw enable
```

### 7.2 HTTPS aktivieren (optional)

Für Let's Encrypt mit Traefik:

1. Bearbeiten Sie `docker-compose.yml`:

```yaml
reverse-proxy:
  command:
    - "--certificatesresolvers.myresolver.acme.email=your@email.com"
    - "--certificatesresolvers.myresolver.acme.storage=/letsencrypt/acme.json"
    - "--certificatesresolvers.myresolver.acme.tlschallenge=true"
```

2. Services neu starten:

```bash
./arasul restart
```

### 7.3 Automatischer Start beim Boot

```bash
# Systemd Service erstellen
sudo nano /etc/systemd/system/arasul.service
```

Inhalt:

```ini
[Unit]
Description=Arasul Platform
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/<username>/arasul-platform
ExecStart=/home/<username>/arasul-platform/arasul start
ExecStop=/home/<username>/arasul-platform/arasul stop
User=<username>

[Install]
WantedBy=multi-user.target
```

Aktivieren:

```bash
sudo systemctl daemon-reload
sudo systemctl enable arasul
sudo systemctl start arasul
```

### 7.4 Backup-Strategie

**Datenbank-Backup:**

```bash
# Backup erstellen
docker-compose exec postgres-db pg_dump -U arasul arasul_db > backup_$(date +%Y%m%d).sql

# Backup wiederherstellen
cat backup_20250115.sql | docker-compose exec -T postgres-db psql -U arasul arasul_db
```

**Volumes-Backup:**

```bash
# Backup aller Volumes
docker run --rm -v arasul_arasul-postgres:/data -v $(pwd)/backups:/backup \
    alpine tar czf /backup/postgres_$(date +%Y%m%d).tar.gz /data

docker run --rm -v arasul_arasul-minio:/data -v $(pwd)/backups:/backup \
    alpine tar czf /backup/minio_$(date +%Y%m%d).tar.gz /data
```

**Konfiguration-Backup:**

```bash
# .env und config/ sichern
tar czf config_backup_$(date +%Y%m%d).tar.gz .env config/
```

---

## Schritt 8: Wartung

### 8.1 Updates durchführen

**Via Git:**

```bash
cd ~/arasul-platform
git pull
./arasul update
```

**Via Dashboard Upload:**

1. `.araupdate` Datei erhalten
2. Dashboard öffnen → Update
3. Datei hochladen
4. Update starten

### 8.2 Log-Rotation

Logs rotieren automatisch (50MB max, 10 Dateien). Manuelles Cleanup:

```bash
# Alte Logs löschen
find logs/ -name "*.log.*" -mtime +30 -delete
```

### 8.3 Disk-Cleanup

```bash
# Docker Cleanup
docker system prune -af

# Alte Metriken löschen
docker-compose exec postgres-db psql -U arasul -d arasul_db \
    -c "SELECT cleanup_old_metrics();"
```

### 8.4 Gesundheits-Check

Regelmäßig prüfen:

```bash
# System Status
./arasul status

# Disk Space
df -h

# Container Logs
./arasul logs | grep ERROR

# Self-Healing Events
docker-compose exec postgres-db psql -U arasul -d arasul_db \
    -c "SELECT * FROM self_healing_events WHERE severity = 'CRITICAL' ORDER BY timestamp DESC LIMIT 10;"
```

---

## Troubleshooting

### Problem: Bootstrap schlägt fehl

**Lösung:**

1. Logs prüfen:
   ```bash
   ./arasul logs
   ```

2. Einzelne Services starten:
   ```bash
   docker-compose up -d postgres-db
   docker-compose logs postgres-db
   ```

3. Neustart:
   ```bash
   ./arasul stop
   ./arasul start
   ```

### Problem: LLM Service startet nicht

**Ursache:** GPU nicht verfügbar oder zu wenig RAM

**Lösung:**

1. GPU prüfen:
   ```bash
   nvidia-smi
   ```

2. RAM anpassen in `.env`:
   ```bash
   RAM_LIMIT_LLM=24G  # Statt 32G
   ```

3. Service neu starten:
   ```bash
   docker-compose restart llm-service
   ```

### Problem: Dashboard lädt nicht

**Lösung:**

1. Reverse Proxy prüfen:
   ```bash
   docker-compose logs reverse-proxy
   ```

2. Backend prüfen:
   ```bash
   curl http://localhost/api/health
   ```

3. Ports prüfen:
   ```bash
   sudo netstat -tulpn | grep :80
   ```

### Problem: Disk voll

**Lösung:**

Self-Healing triggert automatisch Cleanup. Manuell:

```bash
# Docker bereinigen
docker system prune -af --volumes

# Alte Logs löschen
find logs/ -name "*.log.*" -mtime +7 -delete

# DB bereinigen
docker-compose exec postgres-db psql -U arasul -d arasul_db \
    -c "SELECT cleanup_old_metrics();"
```

---

## Schritt 9: Self-Healing Engine Konfiguration

### 9.1 Self-Healing Überblick

Die Self-Healing Engine überwacht alle Services und reagiert automatisch auf Fehler:

**Kategorie A - Service Down:**
- 1. Versuch: Container Restart
- 2. Versuch: Stop + Start
- 3. Versuch: Eskalation zu Kategorie C

**Kategorie B - Überlast:**
- CPU > 90% → LLM Cache Clear
- RAM > 90% → n8n Restart
- GPU > 95% → GPU Session Reset
- Temp > 83°C → GPU Throttling
- Temp > 85°C → Service Restart

**Kategorie C - Kritisch:**
- Hard Restart aller Application Services
- Disk Cleanup (Docker Prune, Logs, Cache)
- Database VACUUM
- GPU Reset

**Kategorie D - Ultima Ratio:**
- System Reboot bei Disk > 97% oder 3+ kritische Events in 30min
- Nur wenn `SELF_HEALING_REBOOT_ENABLED=true`

### 9.2 Self-Healing aktivieren/deaktivieren

**Monitoring-Only Modus:**

```bash
# In .env setzen:
SELF_HEALING_ENABLED=false
```

Container wird weiterhin alle Events loggen, aber keine Recovery Actions durchführen.

**System-Reboot aktivieren:**

```bash
# In .env setzen:
SELF_HEALING_REBOOT_ENABLED=true
```

⚠️ **WARNUNG:** Dies erlaubt dem System automatische Reboots! Nur in produktionsreifen Umgebungen aktivieren.

### 9.3 Self-Healing Events monitoren

**Via Dashboard:**
- Self-Healing Events werden im Dashboard angezeigt
- Severity: INFO, WARNING, CRITICAL, EMERGENCY

**Via Datenbank:**

```bash
# Letzte 20 Events anzeigen
docker-compose exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT timestamp, event_type, severity, description, action_taken, success
   FROM self_healing_events
   ORDER BY timestamp DESC
   LIMIT 20;"

# Kritische Events (letzte 24h)
docker-compose exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT * FROM self_healing_events
   WHERE severity IN ('CRITICAL', 'EMERGENCY')
   AND timestamp > NOW() - INTERVAL '24 hours'
   ORDER BY timestamp DESC;"
```

**Via Logs:**

```bash
# Self-Healing Logs live anzeigen
docker-compose logs -f self-healing-agent

# Letzte 100 Zeilen
docker-compose logs --tail=100 self-healing-agent
```

### 9.4 Recovery Action Historie

```bash
# Alle Recovery Actions der letzten 24h
docker-compose exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT timestamp, action_type, service_name, reason, success, duration_ms
   FROM recovery_actions
   WHERE timestamp > NOW() - INTERVAL '24 hours'
   ORDER BY timestamp DESC;"

# Failed Recovery Actions
docker-compose exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT * FROM recovery_actions
   WHERE success = false
   ORDER BY timestamp DESC
   LIMIT 10;"
```

### 9.5 Service Failure Tracking

```bash
# Service Failures der letzten Stunde
docker-compose exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT * FROM v_service_failure_summary;"

# Failure Details für bestimmten Service
docker-compose exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT * FROM service_failures
   WHERE service_name = 'llm-service'
   AND timestamp > NOW() - INTERVAL '1 hour'
   ORDER BY timestamp DESC;"
```

### 9.6 Post-Reboot Validation

Nach einem System-Reboot validiert die Engine automatisch:

1. ✅ Alle kritischen Services laufen
2. ✅ Database erreichbar
3. ✅ Metrics Collector antwortet
4. ✅ Disk Space akzeptabel
5. ✅ GPU verfügbar

**Reboot Events prüfen:**

```bash
docker-compose exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT id, timestamp, reason, reboot_completed, validation_passed
   FROM reboot_events
   ORDER BY timestamp DESC
   LIMIT 5;"

# Post-Reboot State Details
docker-compose exec postgres-db psql -U arasul -d arasul_db -c \
  "SELECT id, reason,
          pre_reboot_state->>'disk_usage' as disk_before,
          post_reboot_state->>'disk_usage' as disk_after,
          post_reboot_state->>'validation_summary' as validation
   FROM reboot_events
   WHERE id = 1;"  # Ersetze 1 mit gewünschter ID
```

### 9.7 Thresholds anpassen

In `.env` können alle Schwellenwerte angepasst werden:

```bash
# Disk Thresholds
DISK_WARNING_PERCENT=80      # Log Warning
DISK_CLEANUP_PERCENT=90      # Trigger Cleanup
DISK_CRITICAL_PERCENT=95     # Critical Event
DISK_REBOOT_PERCENT=97       # Trigger Reboot

# Self-Healing Interval
SELF_HEALING_INTERVAL=10     # Sekunden zwischen Checks

# Resource Limits (in healing_engine.py)
# CPU_OVERLOAD_THRESHOLD = 90
# RAM_OVERLOAD_THRESHOLD = 90
# GPU_OVERLOAD_THRESHOLD = 95
# TEMP_THROTTLE_THRESHOLD = 83
# TEMP_RESTART_THRESHOLD = 85
```

Nach Änderungen Self-Healing Agent neu starten:

```bash
docker-compose restart self-healing-agent
```

### 9.8 Manuelles Testing

**Test Service Recovery:**

```bash
# Service manuell stoppen
docker stop llm-service

# Self-Healing sollte nach 3 Failed Health Checks (ca. 30-60s) reagieren
# Logs beobachten:
docker-compose logs -f self-healing-agent

# Service sollte automatisch neu gestartet werden
docker-compose ps llm-service
```

**Test Disk Cleanup:**

```bash
# Aktuellen Disk Usage prüfen
df -h /

# Wenn > 90%, sollte Cleanup automatisch triggern
# Manuell triggern:
docker-compose exec self-healing-agent python3 -c "
from healing_engine import SelfHealingEngine
engine = SelfHealingEngine()
engine.perform_disk_cleanup()
"
```

**Test GPU Throttling:**

```bash
# Aktuell nicht einfach testbar ohne echte GPU-Last
# Logs zeigen GPU-bezogene Events:
docker-compose logs self-healing-agent | grep -i gpu
```

### 9.9 Troubleshooting

**Self-Healing Agent startet nicht:**

```bash
# Logs prüfen
docker-compose logs self-healing-agent

# Häufige Ursachen:
# 1. PostgreSQL nicht erreichbar
# 2. Docker Socket nicht gemountet
# 3. Privileged Mode fehlt
```

**Recovery Actions schlagen fehl:**

```bash
# Prüfe ob Container privileged ist
docker inspect self-healing-agent | grep -i privileged

# Sollte "Privileged": true sein

# Prüfe Docker Socket Mount
docker inspect self-healing-agent | grep docker.sock
```

**Reboot funktioniert nicht:**

```bash
# 1. Prüfe ob SELF_HEALING_REBOOT_ENABLED=true
grep REBOOT_ENABLED .env

# 2. Prüfe sudo-Konfiguration im Container
docker-compose exec self-healing-agent cat /etc/sudoers.d/arasul-reboot

# 3. Test Reboot Command (ACHTUNG: System wird rebooten!)
docker-compose exec self-healing-agent sudo reboot
```

---

## Nächste Schritte

Nach erfolgreichem Deployment:

1. ✅ Dashboard erkunden
2. ✅ n8n Workflows erstellen
3. ✅ LLM API in Workflows integrieren
4. ✅ Embeddings für RAG nutzen
5. ✅ Self-Healing Events monitoren
6. ✅ Backup-Strategie implementieren

---

**Support:** Siehe README.md für weitere Dokumentation und Support-Kontakte.
