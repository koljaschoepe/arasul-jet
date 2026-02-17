# ARASUL PLATFORM

**Version 1.0.0** - Autonomous Edge AI Appliance for NVIDIA Jetson AGX Orin

---

## Executive Summary

Die Arasul Platform ist eine vollständig autonome Edge-AI-Lösung, die auf NVIDIA Jetson AGX Orin Developer Kit (12-Core ARM, 64 GB DDR5) läuft. Das System ist für mehrjährigen wartungsfreien Betrieb konzipiert und bietet:

- **Lokales LLM** - Ollama mit GPU-Beschleunigung (mehrere Modelle parallel)
- **RAG-System** - Dokumentensuche mit Vektordatenbank (Qdrant)
- **Embedding-Modell** - Text-Vektorisierung (Sentence Transformers)
- **Workflow-Engine** - n8n mit externen Integrationen
- **Dynamische Datenbanken** - Benutzerdefinierte Tabellen mit KI-Abfragen
- **Telegram-Integration** - Multi-Bot-System mit LLM-Chat & Benachrichtigungen
- **Self-Healing System** - Automatische Fehlerbehebung & Recovery
- **Single-Page Dashboard** - React mit Live-Metriken via WebSocket
- **Telemetrie & Monitoring** - PostgreSQL mit 7-Tage-Retention + Loki Logging
- **Offline-First** - Internet optional, USB-Updates möglich

---

## Quick Start

### Voraussetzungen

- **Hardware**: NVIDIA Jetson AGX Orin Developer Kit
- **OS**: Ubuntu 22.04 mit JetPack 6+
- **Software**: Docker & Docker Compose, NVIDIA Container Runtime
- **Speicher**: Mindestens 50 GB verfügbar
- **Netzwerk**: Optional (nur für n8n externe Integrationen)

### Installation

1. **Repository klonen:**

   ```bash
   git clone <repository-url>
   cd arasul-platform
   ```

2. **System initialisieren:**

   ```bash
   ./arasul bootstrap
   ```

   Dieser Befehl führt folgende Schritte aus:
   - ✓ System-Anforderungen prüfen
   - ✓ Verzeichnisstruktur erstellen
   - ✓ .env Datei generieren (mit sicheren Passwörtern)
   - ✓ Docker Images bauen
   - ✓ Datenbank initialisieren
   - ✓ Alle Services starten
   - ✓ Smoke Tests ausführen

3. **Dashboard öffnen:**

   ```
   http://localhost
   ```

   Oder per mDNS:

   ```
   http://arasul.local
   ```

**Wichtig:** Das Bootstrap-Script generiert automatisch sichere Passwörter. Bitte notieren Sie das Admin-Passwort aus der Ausgabe!

---

## Architektur

### System-Layers

```
┌─────────────────────────────────────────────┐
│          Dashboard Frontend (SPA)            │
├─────────────────────────────────────────────┤
│          Dashboard Backend API               │
├──────────────┬──────────────┬───────────────┤
│   AI Layer   │  Automation  │   Storage     │
│   (LLM +     │    (n8n)     │   (MinIO)     │
│  Embeddings) │              │               │
├──────────────┴──────────────┴───────────────┤
│      System Services (Monitoring, DB)        │
├─────────────────────────────────────────────┤
│    Docker Engine + NVIDIA Container Runtime  │
├─────────────────────────────────────────────┤
│         Jetson AGX Orin + JetPack 6          │
└─────────────────────────────────────────────┘
```

### Container-Übersicht (17 Services)

| Container            | Beschreibung                                |
| -------------------- | ------------------------------------------- |
| `reverse-proxy`      | Traefik - Routing, TLS & Security Headers   |
| `dashboard-frontend` | React SPA (Web-Dashboard)                   |
| `dashboard-backend`  | REST + WebSocket + SSE API                  |
| `postgres-db`        | PostgreSQL 16 - Telemetrie & Konfiguration  |
| `metrics-collector`  | System-Metriken (CPU, RAM, GPU, Temp, Disk) |
| `llm-service`        | Ollama LLM (GPU-beschleunigt)               |
| `embedding-service`  | Text-Vektorisierung (GPU-beschleunigt)      |
| `document-indexer`   | RAG-Dokumentenverarbeitung & Indexierung    |
| `qdrant`             | Vektordatenbank für RAG-Suche               |
| `n8n`                | Workflow-Engine mit externen Integrationen  |
| `minio`              | S3-kompatibler Objektspeicher               |
| `self-healing-agent` | Autonome Überwachung & Recovery             |
| `telegram-bot`       | Telegram-Benachrichtigungen & LLM-Chat      |
| `backup-service`     | Automatisierte tägliche Backups             |
| `loki`               | Log-Aggregation                             |
| `promtail`           | Log-Collector für alle Services             |
| `cloudflared`        | Cloudflare Tunnel für OAuth (optional)      |

**Netzwerk:** Alle Container laufen im isolierten `arasul-net` (172.30.0.0/24). Nur Port 80 ist extern erreichbar.

---

## Dashboard

### Features

Das Single-Page Dashboard zeigt:

1. **System-Status**: OK / WARNING / CRITICAL
2. **Live-Metriken**: CPU, RAM, GPU, Temperatur, Disk
3. **24h Performance-Chart**: Historische Daten
4. **AI-Services Status**: LLM & Embeddings
5. **Workflow-Aktivität**: n8n Statistiken
6. **Netzwerk-Info**: IP, mDNS, Internet-Status
7. **Self-Healing Status**: Aktiv/Inaktiv

### Screenshots

Das Dashboard aktualisiert sich automatisch über WebSocket-Verbindung alle 5 Sekunden.

---

## API-Endpunkte

### System

- `GET /api/system/status` - Gesamtstatus
- `GET /api/system/info` - Versionsinformationen
- `GET /api/system/network` - Netzwerk-Details

### Metriken

- `GET /api/metrics/live` - Aktuelle Metriken
- `GET /api/metrics/history?range=24h` - Historische Daten
- `WS /api/metrics/live-stream` - WebSocket Live-Stream

### Services

- `GET /api/services` - Status aller Services
- `GET /api/services/ai` - Details zu AI-Services

### Workflows

- `GET /api/workflows/activity` - n8n Aktivitäts-Statistik

### AI

- `POST /api/llm/chat` - LLM Chat-Anfrage
- `POST /api/embeddings` - Text-Vektorisierung

### Updates

- `POST /api/update/upload` - Update-Paket hochladen
- `GET /api/update/history` - Update-Historie

**Vollständige API-Dokumentation:** Siehe `CLAUDE.md` Abschnitt 25.

---

## Self-Healing System

Das Self-Healing System überwacht alle Services und reagiert automatisch auf Fehler:

### Recovery-Kategorien

**Kategorie A - Service Down:**

- 1. Versuch: Container Restart
- 2. Versuch: Stop + Start
- 3. Versuch: Eskalation zu Kategorie C

**Kategorie B - Überlast:**

- CPU > 90% für 5 Min
- RAM > 90% für 2 Min
- GPU > 95% für 2 Min
- Temperatur > 83°C für 1 Min

**Kategorie C - Kritisch:**

- Datenbankausfall
- Disk > 95%
- 3+ Service-Fehler in 10 Min
- Maßnahmen: Cleanup, Vakuum, GPU-Reset

**Kategorie D - Ultima Ratio:**

- Disk > 97%
- 3+ kritische Events in 30 Min
- **System-Reboot**

### Monitoring

Alle Self-Healing Events werden in der Datenbank (`self_healing_events`) protokolliert und sind im Dashboard sichtbar.

---

## CLI-Management

### Befehle

```bash
# System starten
./arasul start

# System stoppen
./arasul stop

# System neustarten
./arasul restart

# Status anzeigen
./arasul status

# Logs anzeigen
./arasul logs [service-name]

# System aktualisieren
./arasul update

# Hilfe
./arasul help
```

### Beispiele

```bash
# Logs vom Dashboard Backend
./arasul logs dashboard-backend

# Logs von allen Services (live)
./arasul logs

# Nur LLM Service neu starten
docker-compose restart llm-service
```

---

## Konfiguration

### Environment-Variablen

Alle Konfigurationen befinden sich in `.env`. Wichtige Parameter:

```bash
# Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<generiert>

# LLM
LLM_MODEL=llama3.1:8b
LLM_MAX_TOKENS=2048
LLM_MAX_RAM_GB=40

# Embedding
EMBEDDING_MODEL=nomic-embed-text
EMBEDDING_VECTOR_SIZE=768

# Ressourcen-Limits
CPU_LIMIT_LLM=50          # Prozent
RAM_LIMIT_LLM=32G
DISK_CRITICAL_PERCENT=95
```

### Modell-Konfiguration

**LLM-Modelle** werden beim ersten Start automatisch heruntergeladen:

```bash
docker-compose exec llm-service ollama pull llama3.1:8b
```

**Embedding-Modell** wird beim Start des Embedding-Service geladen.

---

## Update-System

### Dashboard-Upload

1. Update-Paket (`.araupdate`) erstellen
2. Im Dashboard auf "Update" klicken
3. Datei hochladen
4. System validiert Signatur und Version
5. Update installieren

### USB-Update

1. `.araupdate` Datei auf USB-Stick kopieren (unter `/updates/`)
2. USB-Stick einstecken
3. Self-Healing Agent erkennt automatisch
4. Update wird validiert und installiert

**Rollback:** Bei Fehlern erfolgt automatischer Rollback zur vorherigen Version.

---

## Datenbank

### Schema

Haupttabellen:

- `metrics_cpu`, `metrics_ram`, `metrics_gpu`, `metrics_temperature`, `metrics_disk`
- `self_healing_events`
- `workflow_activity`
- `update_events`
- `service_restarts`

### Retention

- **Metriken**: 7 Tage (automatische Bereinigung)
- **Self-Healing Events**: 30 Tage
- **Updates**: Permanent

### Wartung

Automatisches Vakuum und Cleanup aktiviert. Manuelle Bereinigung:

```bash
docker-compose exec postgres-db psql -U arasul -d arasul_db -c "SELECT cleanup_old_metrics();"
```

---

## Sicherheit

### Authentifizierung

- **Dashboard**: Basic Auth (admin / generiertes Passwort)
- **API**: JWT Tokens (24h Gültigkeit)
- **n8n**: Basic Auth (konfigurierbar in .env)
- **MinIO**: Access Key + Secret Key

### Netzwerk

- Nur Ports **80** und **443** (optional) extern erreichbar
- Alle Services in isoliertem Docker-Netzwerk
- Rate Limiting auf allen Endpoints

### Secrets

Alle Geheimnisse in `/arasul/config/.env`:

- `ADMIN_HASH`
- `JWT_SECRET`
- `MINIO_ROOT_PASSWORD`
- `N8N_ENCRYPTION_KEY`
- `UPDATE_PUBLIC_KEY`

**Wichtig:** Ändern Sie alle Standard-Passwörter nach dem ersten Start!

---

## Troubleshooting

### Service startet nicht

```bash
# Logs prüfen
./arasul logs <service-name>

# Service neu starten
docker-compose restart <service-name>

# Alle Container prüfen
docker-compose ps
```

### Dashboard nicht erreichbar

1. Prüfen Sie den Reverse Proxy:

   ```bash
   docker-compose logs reverse-proxy
   ```

2. Prüfen Sie das Dashboard Backend:

   ```bash
   curl http://localhost/api/health
   ```

3. Firewall-Regeln prüfen

### LLM antwortet nicht

1. GPU verfügbar?

   ```bash
   docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
   ```

2. Modell geladen?

   ```bash
   docker-compose exec llm-service ollama list
   ```

3. Logs prüfen:
   ```bash
   ./arasul logs llm-service
   ```

### Disk voll

Self-Healing triggert automatisch Cleanup bei 90%. Manuelles Cleanup:

```bash
# Docker Cleanup
docker system prune -af --volumes

# Alte Logs löschen
find logs/ -name "*.log.*" -mtime +7 -delete

# Datenbank bereinigen
docker-compose exec postgres-db psql -U arasul -d arasul_db -c "SELECT cleanup_old_metrics();"
```

---

## Performance-Tuning

### LLM Optimierung

```bash
# In .env anpassen:
LLM_GPU_LAYERS=-1          # Alle Layers auf GPU
LLM_CONTEXT_SIZE=4096      # Context-Größe
LLM_MAX_RAM_GB=40          # RAM-Limit
```

### Embedding Optimierung

```bash
# Batch-Größe erhöhen für besseren Durchsatz
EMBEDDING_BATCH_SIZE=32
```

### Dashboard Optimierung

```bash
# Metrics-Intervalle anpassen
METRICS_INTERVAL_LIVE=5      # Live-Intervall (Sekunden)
METRICS_INTERVAL_PERSIST=30  # Persistierung (Sekunden)
```

---

## Dokumentation

| Dokument                                                  | Beschreibung                           |
| --------------------------------------------------------- | -------------------------------------- |
| [ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) | Alle Umgebungsvariablen mit Defaults   |
| [API_REFERENCE.md](docs/API_REFERENCE.md)                 | Vollständige API-Dokumentation         |
| [DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md)             | Datenbankschema (37 Migrationen)       |
| [JETSON_COMPATIBILITY.md](docs/JETSON_COMPATIBILITY.md)   | Kompatibilitätsguide für Jetson-Geräte |

## Support

**Fehlerberichte** sollten folgende Informationen enthalten:

- System-Info (`docker compose ps`)
- Logs (`docker compose logs <service-name>`)
- Fehler-Beschreibung mit Schritten zur Reproduktion

---

## Lizenz

Proprietary - Arasul Platform

---

## Changelog

### Version 1.0.0

- Vollständige Offline-Funktionalität
- Self-Healing System mit 4-stufiger Recovery
- Dashboard mit Live-Metriken (WebSocket)
- LLM & Embedding Services (GPU-beschleunigt)
- RAG-System mit Dokumentensuche
- Telegram Multi-Bot Integration
- Dynamische Datenbanken (Datentabellen)
- n8n Workflow-Integration
- Update-System (Dashboard + USB)
- Loki/Promtail Log-Aggregation
- Automatische Backups

---

**Built with ❤️ for Edge AI**
