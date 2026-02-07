# N8N Fix Plan: "credentialTypes.reduce is not a function"

## Problem

Beim Öffnen eines Workflows in n8n erscheint:
```
There was a problem loading init data: credentialTypes.reduce is not a function
```

## Root Cause Analyse

### 1. Version Mismatch (HAUPTURSACHE)

| Komponente | Version |
|------------|---------|
| Datenbank erstellt mit | n8n **1.120.4** |
| Aktuelle n8n Version | n8n **2.4.6** |

Die SQLite-Datenbank wurde mit n8n 1.x erstellt. Das Upgrade auf n8n 2.x hat möglicherweise nicht alle Migrationen korrekt durchgeführt.

### 2. Express Trust Proxy Warnung

```
ValidationError: The 'X-Forwarded-For' header is set but the Express
'trust proxy' setting is false (default).
```

Obwohl `N8N_TRUST_PROXY=true` gesetzt ist, meldet Express einen Fehler. Dies kann API-Authentifizierung beeinflussen.

### 3. Betroffene Komponenten

- **User:** `kol.schoepe@gmail.com` (Owner)
- **Credentials:** 2 Ollama-Credentials
- **Workflows:** 2 Workflows
- **Project:** 1 Personal Project

---

## Fix-Strategien

### Option A: Datenbank Reset (Empfohlen für Development)

**Vorteile:** Sauberer Neustart, keine Legacy-Probleme
**Nachteile:** Verlust aller Workflows und Credentials

```bash
# 1. Backup der aktuellen Daten
docker cp n8n:/home/node/.n8n/database.sqlite ./n8n_backup_$(date +%Y%m%d).sqlite

# 2. n8n stoppen
docker compose stop n8n

# 3. Datenbank löschen
docker volume rm arasul-jet_arasul-n8n

# 4. n8n neu starten (erstellt neue DB)
docker compose up -d n8n

# 5. Neuen Admin-User erstellen via UI
# http://172.30.0.1/n8n
```

### Option B: Datenbank Migration reparieren

**Vorteile:** Behält bestehende Workflows
**Nachteile:** Komplexer, möglicherweise nicht vollständig

```bash
# 1. Backup
docker cp n8n:/home/node/.n8n/database.sqlite ./n8n_backup_$(date +%Y%m%d).sqlite

# 2. n8n mit Debug starten
docker compose stop n8n
docker compose run --rm -e N8N_LOG_LEVEL=debug n8n n8n db:revert

# 3. Migrationen neu ausführen
docker compose run --rm n8n n8n db:migrate
```

### Option C: Downgrade auf n8n 1.x (Temporär)

**Vorteile:** Schnelle Lösung, keine Datenverluste
**Nachteile:** Verpasst Sicherheitsupdates

```yaml
# In docker-compose.yml oder Dockerfile
ARG N8N_VERSION=1.120.4  # statt 2.4.6
```

---

## Empfohlene Lösung: Option A (Datenbank Reset)

Da nur 2 Workflows und 2 Credentials existieren, ist ein sauberer Neustart am einfachsten.

### Schritt-für-Schritt Anleitung

#### Phase 1: Backup

```bash
# 1. Workflows exportieren (falls möglich über CLI)
docker exec n8n n8n export:workflow --all --output=/tmp/workflows.json 2>/dev/null || echo "Export failed - manual backup needed"

# 2. Datenbank-Backup
docker cp n8n:/home/node/.n8n/database.sqlite ~/n8n_backup_$(date +%Y%m%d).sqlite
echo "Backup gespeichert in ~/n8n_backup_$(date +%Y%m%d).sqlite"
```

#### Phase 2: Reset

```bash
# 1. n8n stoppen
docker compose stop n8n

# 2. Volume entfernen
docker volume rm arasul-jet_arasul-n8n

# 3. n8n Container entfernen (um sicherzustellen dass neues Volume erstellt wird)
docker compose rm -f n8n

# 4. n8n neu starten
docker compose up -d n8n

# 5. Logs prüfen
docker compose logs -f n8n
```

#### Phase 3: Neu einrichten

1. **Browser:** `http://172.30.0.1/n8n` öffnen
2. **Owner Account erstellen** (gleiche Email verwenden)
3. **Credentials neu anlegen** für Ollama
4. **Workflows importieren** (falls Export funktioniert hat)

---

## Validierung

Nach dem Fix sollten folgende Tests erfolgreich sein:

```bash
# 1. n8n Health Check
curl -s http://localhost:5678/healthz
# Erwartete Antwort: {"status":"ok"}

# 2. Keine Fehler in Logs
docker compose logs n8n 2>&1 | grep -i "error\|fail" | grep -v "Python task runner"
# Sollte leer sein

# 3. UI Test
# - Browser öffnen: http://172.30.0.1/n8n
# - Einloggen
# - Neuen Workflow erstellen
# - Node hinzufügen (z.B. HTTP Request)
# - KEIN "credentialTypes.reduce" Fehler
```

---

## Präventionsmaßnahmen

### 1. Version Pinning

In `docker-compose.yml` oder `Dockerfile`:
```dockerfile
# Immer spezifische Version verwenden
ARG N8N_VERSION=2.4.6
```

### 2. Regelmäßige Backups

```bash
# Cron Job für tägliche n8n Backups
0 2 * * * docker cp n8n:/home/node/.n8n/database.sqlite /backup/n8n/db_$(date +\%Y\%m\%d).sqlite
```

### 3. Upgrade-Prozedur

Bei n8n Updates:
1. **Backup erstellen**
2. **Release Notes lesen** (breaking changes)
3. **In Staging testen**
4. **Erst dann Production updaten**

---

## Zusammenfassung

| Problem | Lösung |
|---------|--------|
| DB Version Mismatch (1.x → 2.x) | Datenbank Reset |
| Trust Proxy Warning | Wird mit neuer DB behoben |
| credentialTypes.reduce Error | Wird mit neuer DB behoben |

**Empfohlene Aktion:** Option A - Datenbank Reset durchführen

**Geschätzte Ausfallzeit:** 5-10 Minuten

**Risiko:** Niedrig (nur 2 einfache Workflows betroffen)
