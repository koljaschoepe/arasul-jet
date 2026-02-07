# n8n "credentialTypes.reduce is not a function" - Fix Plan

## Problem Summary

**Fehlermeldung:** `There was a problem loading init data: credentialTypes.reduce is not a function`

**Root Cause:** Version Mismatch - Das n8n Docker-Image läuft mit Version 2.3.3, obwohl das Dockerfile Version 1.70.0 spezifiziert. Die Custom Nodes und Datenbank sind mit dieser Version inkompatibel.

---

## Sofort-Fix (Option A - Empfohlen)

### Schritt 1: n8n auf eine stabile Version pinnen

**Datei:** `services/n8n/Dockerfile`

```dockerfile
# VORHER (Zeile 24-25):
ARG N8N_VERSION=1.70.0
FROM n8nio/n8n:${N8N_VERSION}

# NACHHER - Explizit Version pinnen:
ARG N8N_VERSION=1.76.3
FROM n8nio/n8n:${N8N_VERSION}
```

**Warum 1.76.3?** Das ist die letzte stabile 1.x Version vor dem 2.x Breaking Change. Die Custom Nodes sind damit kompatibel.

### Schritt 2: n8n Datenbank-Backup erstellen

```bash
# Backup der SQLite-Datenbank
docker exec n8n cp /home/node/.n8n/database.sqlite /home/node/.n8n/database.sqlite.backup
docker cp n8n:/home/node/.n8n/database.sqlite ./data/backups/n8n-database-$(date +%Y%m%d).sqlite
```

### Schritt 3: n8n Image neu bauen (ohne Cache)

```bash
# Stoppe n8n
docker compose stop n8n

# Lösche altes Image
docker rmi arasul-jet-n8n:latest

# Rebuild ohne Cache
docker compose build --no-cache n8n

# Starte n8n
docker compose up -d n8n
```

### Schritt 4: Verifizieren

```bash
# Version prüfen
docker exec n8n cat /usr/local/lib/node_modules/n8n/package.json | grep version
# Erwartete Ausgabe: "version": "1.76.3"

# Logs prüfen
docker compose logs -f n8n
```

---

## Langzeit-Fix (Option B - Vollständige Migration zu n8n 2.x)

Falls du n8n 2.x nutzen möchtest, sind folgende Schritte erforderlich:

### Schritt 1: Custom Nodes für n8n 2.x aktualisieren

**Datei:** `services/n8n/custom-nodes/n8n-nodes-arasul-llm/package.json`

```json
{
  "n8n": {
    "n8nNodesApiVersion": 2,  // GEÄNDERT von 1
    ...
  },
  "devDependencies": {
    "n8n-workflow": "^2.0.0",  // GEÄNDERT von ^1.0.0
    ...
  },
  "peerDependencies": {
    "n8n-workflow": "^2.0.0"  // GEÄNDERT von ^1.0.0
  }
}
```

### Schritt 2: TypeScript-Anpassungen in Custom Nodes

n8n 2.x hat Breaking Changes in der API. Typische Anpassungen:

```typescript
// VORHER (n8n 1.x):
import { IExecuteFunctions } from 'n8n-core';

// NACHHER (n8n 2.x):
import { IExecuteFunctions } from 'n8n-workflow';
```

### Schritt 3: Dockerfile für n8n 2.x

```dockerfile
ARG N8N_VERSION=2.3.3
FROM n8nio/n8n:${N8N_VERSION}

USER root

# Python für Task Runner installieren (n8n 2.x Feature)
RUN apk add --no-cache python3 py3-pip

# Custom Nodes...
```

### Schritt 4: Trust Proxy konfigurieren

**Datei:** `docker-compose.yml` (n8n environment)

```yaml
n8n:
  environment:
    # Neu hinzufügen:
    N8N_TRUST_PROXY: "true"
    N8N_PUSH_BACKEND: "websocket"
```

### Schritt 5: Datenbank-Migration

n8n 2.x führt automatisch Migrationen durch. Falls Probleme auftreten:

```bash
# Frische Installation (verliert Workflows!)
docker volume rm arasul-n8n
docker compose up -d n8n
```

---

## Empfohlene Lösung

**Option A (Sofort-Fix)** ist empfohlen, weil:
1. Minimale Änderungen erforderlich
2. Custom Nodes funktionieren ohne Modifikation
3. Kein Datenverlust
4. Schnell umsetzbar (~10 Minuten)

**Option B** nur wenn n8n 2.x Features benötigt werden (AI Workflow Builder, Python Task Runner, etc.)

---

## Implementierungsschritte (Copy-Paste Ready)

### 1. Backup erstellen

```bash
cd /home/arasul/arasul/arasul-jet

# n8n Datenbank sichern
mkdir -p data/backups
docker cp n8n:/home/node/.n8n/database.sqlite ./data/backups/n8n-database-$(date +%Y%m%d).sqlite
echo "Backup erstellt: ./data/backups/n8n-database-$(date +%Y%m%d).sqlite"
```

### 2. Dockerfile anpassen

```bash
# Dockerfile editieren
sed -i 's/ARG N8N_VERSION=1.70.0/ARG N8N_VERSION=1.76.3/' services/n8n/Dockerfile

# Änderung prüfen
grep "N8N_VERSION" services/n8n/Dockerfile
```

### 3. Rebuild und Restart

```bash
# n8n stoppen und Image entfernen
docker compose stop n8n
docker rmi arasul-jet-n8n:latest 2>/dev/null || true

# Neu bauen ohne Cache
docker compose build --no-cache n8n

# Starten
docker compose up -d n8n

# Logs verfolgen
docker compose logs -f n8n
```

### 4. Testen

```bash
# Warte bis n8n healthy ist
docker compose ps n8n

# Version prüfen
docker exec n8n cat /usr/local/lib/node_modules/n8n/package.json | grep '"version"'

# Browser öffnen: http://<IP>/n8n
```

---

## Präventive Maßnahmen (Langfristig)

### 1. Version Pinning im CI/CD

```yaml
# .github/workflows/build.yml
- name: Build n8n
  run: |
    docker compose build --no-cache --build-arg N8N_VERSION=1.76.3 n8n
```

### 2. Healthcheck verbessern

Der aktuelle Healthcheck prüft nur `/healthz`. Ergänze einen Test für die Frontend-Initialisierung:

```yaml
# docker-compose.yml
n8n:
  healthcheck:
    test: ["CMD-SHELL", "wget -qO- http://localhost:5678/healthz && wget -qO- http://localhost:5678/rest/settings | grep -q 'data'"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 60s
```

### 3. Automatisches Backup vor Updates

```bash
# scripts/n8n-backup.sh
#!/bin/bash
BACKUP_DIR="/home/arasul/arasul/arasul-jet/data/backups"
DATE=$(date +%Y%m%d_%H%M%S)

docker cp n8n:/home/node/.n8n/database.sqlite "$BACKUP_DIR/n8n-$DATE.sqlite"
echo "n8n backup: $BACKUP_DIR/n8n-$DATE.sqlite"
```

---

## Referenzen

- [n8n Issue #18225](https://github.com/n8n-io/n8n/issues/18225) - Ähnlicher Fehler
- [n8n 2.0 Migration Guide](https://docs.n8n.io/2.0-migration-guide/)
- [n8n Docker Tags](https://hub.docker.com/r/n8nio/n8n/tags)

---

## Zeitaufwand

| Schritt | Zeit |
|---------|------|
| Backup | 2 min |
| Dockerfile ändern | 1 min |
| Rebuild | 5-10 min |
| Test | 2 min |
| **Gesamt (Option A)** | **~15 min** |

---

**Erstellt:** 2026-01-23
**Autor:** Claude Code
**Status:** ✅ IMPLEMENTED - n8n 2.4.6 running successfully
