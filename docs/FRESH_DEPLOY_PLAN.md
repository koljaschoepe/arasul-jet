# Arasul Platform — Fresh Deploy & Skalierbarkeits-Plan

> Erstellt: 2026-03-07 | Basierend auf: 11-Agent-Codebase-Analyse

---

## Zusammenfassung der Probleme

Beim letzten Neustart wurden **3 kritische Fehler** entdeckt, die eine frische Installation komplett unbenutzbar machen:

| #   | Problem                                     | Root Cause                                                                          | Auswirkung                                           |
| --- | ------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | **Traefik 404 auf allen Routen**            | YAML-Strukturfehler in middlewares.yml (serversTransports verschluckte Middlewares) | Server nicht erreichbar                              |
| 2   | **DB-Migrationen 005-047 nicht ausgeführt** | Datei-Permissions 600 statt 644 → PostgreSQL-Container kann Dateien nicht lesen     | Fehlende Tabellen (Chats, Dokumente, Settings, etc.) |
| 3   | **Login unmöglich**                         | admin_users-Tabelle leer, kein Bootstrap-Mechanismus existiert                      | System komplett unbenutzbar                          |

Diese Fehler wurden **von keinem Test abgefangen**, weil End-to-End-Tests für den Fresh-Deploy-Flow fehlen.

---

## Plan-Übersicht (5 Phasen)

| Phase | Titel                                  | Prio     | Aufwand |
| ----- | -------------------------------------- | -------- | ------- |
| **1** | Sofort-Fix: DB Reset + Admin-Bootstrap | ERLEDIGT | 2-3h    |
| **2** | Migrations-System härten               | ERLEDIGT | 3-4h    |
| **3** | Provisioning für Skalierbarkeit        | ERLEDIGT | 4-5h    |
| **4** | Deployment-Validierung (Tests)         | ERLEDIGT | 3-4h    |
| **5** | Produktions-Hardening                  | ERLEDIGT | 3-4h    |

**Gesamt: ~15-20h**

---

## Phase 1: Sofort-Fix — DB Reset + Admin-Bootstrap

> Ziel: System wieder funktionsfähig machen. Admin-User automatisch erstellen bei Fresh Deploy.

### 1.1 Datei-Permissions fixen

```bash
chmod 644 services/postgres/init/*.sql
chmod 755 services/postgres/init/*.sh
```

**Warum**: PostgreSQL Docker-Container läuft als `postgres`-User und kann Dateien mit `600` (owner-only) nicht lesen. Alle SQL-Dateien brauchen `644`.

### 1.2 Admin-User-Bootstrap im Backend

**Das Chicken-and-egg Problem**: Login erfordert Admin-User → Admin-User existiert nicht → Setup-Wizard erfordert Login → Deadlock.

**Lösung: Backend-Startup-Bootstrap**

Neue Datei: `apps/dashboard-backend/src/bootstrap.js`

```javascript
// Beim Backend-Start: Prüfe ob admin_users leer ist
// Falls ja: Erstelle Admin-User aus ADMIN_PASSWORD env var
// Falls ADMIN_PASSWORD nicht gesetzt: Generiere zufälliges Passwort, logge es
async function ensureAdminUser() {
  const result = await db.query('SELECT COUNT(*) FROM admin_users');
  if (parseInt(result.rows[0].count) === 0) {
    const password = process.env.ADMIN_PASSWORD || generateSecurePassword();
    const hash = await hashPassword(password);
    await db.query('INSERT INTO admin_users (username, password_hash, email) VALUES ($1, $2, $3)', [
      'admin',
      hash,
      'admin@arasul.local',
    ]);
    logger.info('=== INITIAL ADMIN USER CREATED ===');
    if (!process.env.ADMIN_PASSWORD) {
      logger.info(`Generated admin password: ${password}`);
      logger.info('Change this password immediately via Setup Wizard!');
    }
  }
}
```

**Integration**: Aufrufen in `src/index.js` vor `app.listen()`, nach DB-Verbindung.

### 1.3 Datenbank komplett neu aufsetzen

```bash
# 1. Backend stoppen (verhindert Reconnect-Fehler)
docker compose stop dashboard-backend

# 2. Postgres-Volume löschen und Container neu starten
docker compose down postgres-db
docker volume rm arasul-platform_arasul-postgres arasul-platform_arasul-data-db
docker compose up -d postgres-db

# 3. Warten bis Migrationen durch sind
docker compose logs -f postgres-db  # Warten bis "database system is ready"

# 4. Backend mit Bootstrap starten
docker compose up -d dashboard-backend
```

### 1.4 Traefik-Fix verifizieren

Der YAML-Fix in `middlewares.yml` wurde bereits angewendet (serversTransports ans Ende verschoben). Verifizieren:

```bash
docker compose restart reverse-proxy
curl -s -o /dev/null -w "%{http_code}" http://localhost  # Muss 200 sein
```

### 1.5 Traefik Placeholder-Credentials ersetzen

`preconfigure.sh` Step 6 generiert htpasswd-Hashes, aber wurde nie ausgeführt. Fix:

```bash
# In preconfigure.sh: Step 6 auch bei Re-Run ausführen wenn PLACEHOLDER noch drin ist
# Oder: In den Bootstrap-Prozess integrieren
```

---

## Phase 2: Migrations-System härten

> Ziel: Nie wieder fehlende Migrationen. Tracking, Transaktionen, Validierung.

### 2.1 Schema-Migrations-Tracking-Tabelle

Neue Migration `000_schema_migrations.sql` (wird VOR allen anderen ausgeführt):

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    checksum VARCHAR(64),
    success BOOLEAN DEFAULT true
);
```

### 2.2 Migration-Runner-Skript

Neues Skript: `scripts/setup/run-migrations.sh`

Statt PostgreSQL-Docker-Init-Skripte (die nur beim **allerersten** Start laufen) einen eigenen Runner:

```bash
#!/bin/bash
# Für jede .sql Datei in services/postgres/init/:
#   1. Prüfe ob Version bereits in schema_migrations
#   2. Falls nein: Führe aus, tracke Ergebnis
#   3. Falls Fehler: Logge und stoppe
```

**Integration**: Aufrufen im Backend-Startup (`bootstrap.js`) oder als separater Init-Container in docker-compose.

### 2.3 Alle Migrationen in Transaktionen wrappen

Aktuell nutzen nur 2 von 47 Migrationen explizite Transaktionen. Für jede Migration:

```sql
BEGIN;
-- Migration-Inhalt
INSERT INTO schema_migrations (version, filename, checksum)
VALUES (5, '005_chat_schema.sql', 'sha256...');
COMMIT;
```

### 2.4 Init-Skript-Permissions in Docker-Build sicherstellen

In `compose/compose.core.yaml` oder via Dockerfile sicherstellen, dass Permissions korrekt sind:

```yaml
volumes:
  - type: bind
    source: ../services/postgres/init
    target: /docker-entrypoint-initdb.d
    read_only: true
    # Permissions müssen im Host-Filesystem korrekt sein
```

**Zusätzlich**: Git-Hook oder CI-Check der Permissions validiert:

```bash
# In scripts/validate/ oder CI:
find services/postgres/init/ -name "*.sql" ! -perm 644 -exec echo "FEHLER: Falsche Permission: {}" \;
find services/postgres/init/ -name "*.sh" ! -perm 755 -exec echo "FEHLER: Falsche Permission: {}" \;
```

### 2.5 032a_create_data_database.sh executable machen

```bash
chmod 755 services/postgres/init/032a_create_data_database.sh
```

---

## Phase 3: Provisioning für Skalierbarkeit

> Ziel: `preconfigure.sh` einmal ausführen → System ist komplett ready. Funktioniert auf jedem Jetson.

### 3.1 Config-Layer-Merge implementieren

Die Verzeichnisse `config/base/`, `config/profiles/`, `config/device/` existieren, werden aber nie zusammengeführt. Neuer Merge-Step in `preconfigure.sh`:

```bash
# Step 2 erweitern: Merge-Logik
merge_env_layers() {
  local merged=$(mktemp)

  # Layer 1: Base defaults
  [ -f config/base/base.env ] && cat config/base/base.env > "$merged"

  # Layer 2: Hardware-Profil
  [ -f config/profiles/jetson.env ] && cat config/profiles/jetson.env >> "$merged"

  # Layer 3: Device-spezifisch
  [ -f config/device/device.env ] && cat config/device/device.env >> "$merged"

  # Layer 4: Existierende .env (Credentials bleiben erhalten)
  # Neue Vars aus Layers hinzufügen, existierende nicht überschreiben
  while IFS='=' read -r key value; do
    [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
    if ! grep -q "^${key}=" .env 2>/dev/null; then
      echo "${key}=${value}" >> .env
    fi
  done < "$merged"

  rm "$merged"
}
```

### 3.2 Hardcoded Pfade entfernen

**9 Dateien** referenzieren `/home/arasul/arasul/arasul-jet` direkt. Ersetzen durch `${COMPOSE_PROJECT_DIR:-.}`:

| Datei                                                       | Änderung                              |
| ----------------------------------------------------------- | ------------------------------------- |
| `compose/compose.app.yaml`                                  | `COMPOSE_PROJECT_DIR` Variable nutzen |
| `apps/dashboard-backend/src/routes/admin/settings.js`       | Env-Variable statt Pfad               |
| `apps/dashboard-backend/src/routes/system/system.js`        | Env-Variable statt Pfad               |
| `apps/dashboard-frontend/src/features/claude/ClaudeCode.js` | Relativ machen                        |
| Weitere 5 Dateien                                           | Analog                                |

### 3.3 systemd-Service portabel machen

```ini
[Service]
WorkingDirectory=%h/arasul  # Oder: via Environment= dynamisch
# Besser: preconfigure.sh schreibt den tatsächlichen Pfad
```

### 3.4 .env Permissions sichern

```bash
# In preconfigure.sh nach .env-Erstellung:
chmod 600 "$ENV_FILE"
```

### 3.5 Traefik-Credentials automatisch generieren

Step 6 in `preconfigure.sh` erweitern: Immer Placeholder ersetzen wenn sie noch da sind, auch bei Re-Runs.

### 3.6 Factory-Image-Skript erstellen

Neues Skript `scripts/deploy/create-factory-image.sh`:

```bash
#!/bin/bash
# 1. Alle Docker-Images bauen
docker compose build --parallel

# 2. Images exportieren
docker save $(docker compose config --images) | gzip > arasul-factory-images.tar.gz

# 3. Manifest erstellen (Versionen, Checksums)
# 4. Deployment-Archiv erstellen (Code + Images + Scripts)
```

Damit kann ein neues Gerät offline provisioniert werden:

```bash
# Auf neuem Gerät:
docker load < arasul-factory-images.tar.gz
./scripts/setup/preconfigure.sh --skip-pull
docker compose up -d
```

---

## Phase 4: Deployment-Validierung (Tests)

> Ziel: Nie wieder einen kaputten Fresh-Deploy ausliefern.

### 4.1 Fresh-Deploy Smoke-Test

Neues Skript `scripts/test/fresh-deploy-test.sh`:

```bash
#!/bin/bash
# Simuliert einen kompletten Fresh-Deploy und validiert:

# 1. DB-Migration-Vollständigkeit
echo "Prüfe Tabellen..."
EXPECTED_TABLES=55  # Alle erwarteten Tabellen
ACTUAL=$(docker exec postgres-db psql -U arasul -d arasul_db -t -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")
[ "$ACTUAL" -ge "$EXPECTED_TABLES" ] || fail "Nur $ACTUAL/$EXPECTED_TABLES Tabellen"

# 2. Admin-User existiert
ADMIN_EXISTS=$(docker exec postgres-db psql -U arasul -d arasul_db -t -c \
  "SELECT COUNT(*) FROM admin_users WHERE username='admin'")
[ "$ADMIN_EXISTS" -ge 1 ] || fail "Kein Admin-User!"

# 3. system_settings existiert mit Default-Row
SETTINGS=$(docker exec postgres-db psql -U arasul -d arasul_db -t -c \
  "SELECT COUNT(*) FROM system_settings")
[ "$SETTINGS" -ge 1 ] || fail "Keine system_settings!"

# 4. Traefik-Routing funktioniert
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost)
[ "$HTTP_CODE" = "200" ] || fail "Frontend gibt $HTTP_CODE statt 200"

# 5. API erreichbar
API_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health)
[ "$API_CODE" = "200" ] || fail "API gibt $API_CODE statt 200"

# 6. Login funktioniert
LOGIN=$(curl -s -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"'$ADMIN_PASSWORD'"}')
echo "$LOGIN" | grep -q "token" || fail "Login fehlgeschlagen"

# 7. Setup-Wizard erreichbar
SETUP=$(curl -s http://localhost/api/system/setup-status)
echo "$SETUP" | grep -q "setupComplete" || fail "Setup-Status nicht abrufbar"

echo "✓ Alle Fresh-Deploy-Checks bestanden!"
```

### 4.2 Traefik-Config-Validierung

Neues Skript `scripts/validate/validate-traefik.sh`:

```bash
#!/bin/bash
# 1. YAML-Syntax prüfen (python3 -c "import yaml; yaml.safe_load(...)")
# 2. Placeholder-Check (grep PLACEHOLDER)
# 3. Middleware-Referenzen validieren (referenzierte Middlewares müssen existieren)
# 4. Service-Referenzen validieren
# 5. Priority-Konflikte erkennen
```

### 4.3 Migration-Permissions-Check

In CI/pre-commit:

```bash
# Alle .sql Dateien müssen 644 sein
# Alle .sh Dateien müssen 755 sein
find services/postgres/init/ -name "*.sql" ! -perm -o=r -print
find services/postgres/init/ -name "*.sh" ! -perm -o=x -print
```

### 4.4 Backend-Bootstrap-Tests

Neue Testdatei `__tests__/unit/bootstrap.test.js`:

```javascript
// Test: ensureAdminUser erstellt User wenn Tabelle leer
// Test: ensureAdminUser erstellt keinen User wenn bereits vorhanden
// Test: ensureAdminUser nutzt ADMIN_PASSWORD aus env wenn gesetzt
// Test: ensureAdminUser generiert Passwort wenn env nicht gesetzt
```

---

## Phase 5: Produktions-Hardening

> Ziel: Sicher, robust, wartbar für Kunden-Deployments.

### 5.1 Docker-Image-Versionen pinnen

```yaml
# Statt:
FROM node:20-alpine
# Besser:
FROM node:20.11.1-alpine3.19
```

Betrifft: `node:20-alpine`, `nginx:alpine`, `python:3.11-slim` in allen Dockerfiles.

### 5.2 Backup-Service erweitern

Der Backup-Service-Container (`services/backup-service/backup.sh`, 49 Zeilen) ist vereinfacht gegenüber dem Hauptskript (`scripts/backup/backup.sh`, 525 Zeilen).

**Lösung**: Backup-Service soll das Hauptskript nutzen:

```dockerfile
# Im Backup-Service Dockerfile:
COPY ../../scripts/backup/backup.sh /usr/local/bin/backup.sh
```

Oder: Hauptskript als Volume mounten.

### 5.3 Unused Traefik-Middlewares aufräumen

Definiert aber nie referenziert:

- `retry`, `circuit-breaker`, `admin-whitelist`
- `redirect-https`, `add-trailing-slash`
- `strip-terminal-prefix`, `strip-minio-prefix`
- `n8n-root-to-signin`

**Aktion**: Entfernen oder dokumentieren warum sie da sind.

### 5.4 WebSocket-Routen absichern

`dashboard-websocket` und `telegram-websocket` fehlt der `Headers('Upgrade', 'websocket')` Check:

```yaml
# Statt:
rule: "PathPrefix(`/api/metrics/live-stream`)"
# Besser:
rule: "PathPrefix(`/api/metrics/live-stream`) && Headers(`Upgrade`, `websocket`)"
```

### 5.5 Let's Encrypt deaktivieren (LAN-only)

ACME-Fehler in Traefik-Logs (`arasul.local` ist keine öffentliche Domain). Sauber deaktivieren:

```yaml
# In traefik.yml: certResolver komplett entfernen oder auskommentieren
# In routes.yml: Alle tls.certResolver: letsencrypt Referenzen entfernen
```

### 5.6 Multi-Device mDNS-Konflikt verhindern

Wenn mehrere Arasul-Geräte im selben Netzwerk:

```bash
# In setup_mdns.sh: Device-spezifischen Hostnamen verwenden
MDNS_HOSTNAME="${MDNS_NAME:-arasul-$(cat config/device/device-id | cut -c1-8)}"
# Ergebnis: arasul-b1f3e6e3.local
```

---

## Ausführungsreihenfolge

### Sofort (Phase 1) — System wieder funktionsfähig machen:

```bash
# 1. Permissions fixen
chmod 644 services/postgres/init/*.sql
chmod 755 services/postgres/init/032a_create_data_database.sh

# 2. Admin-Bootstrap-Code schreiben (bootstrap.js)
# 3. In index.js integrieren

# 4. DB-Volume löschen und neu aufsetzen
docker compose stop dashboard-backend
docker compose down postgres-db
docker volume rm arasul-platform_arasul-postgres arasul-platform_arasul-data-db 2>/dev/null
docker compose up -d postgres-db
# Warten bis ready...
docker compose up -d --build dashboard-backend

# 5. Verifizieren
curl http://192.168.0.197/api/health
curl http://192.168.0.197/
```

### Danach (Phase 2-5) — Iterativ verbessern:

| Schritt | Was                       | Abhängig von       |
| ------- | ------------------------- | ------------------ |
| 2.1     | schema_migrations Tabelle | Phase 1 (DB läuft) |
| 2.2     | Migration-Runner          | 2.1                |
| 2.4     | Permission-Validierung    | —                  |
| 3.1     | Config-Layer-Merge        | —                  |
| 3.2     | Pfade portabel machen     | —                  |
| 4.1     | Fresh-Deploy-Test         | Phase 1+2          |
| 4.2     | Traefik-Validierung       | —                  |
| 5.1-5.6 | Hardening                 | Unabhängig         |

---

## Scorecard: Aktueller Stand vs. Ziel

| Bereich                   | Aktuell         | Nach Plan  | Quelle     |
| ------------------------- | --------------- | ---------- | ---------- |
| DB-Migrationen            | 3/10            | 9/10       | Agent 1    |
| Provisioning              | 7.6/10          | 9.5/10     | Agent 2    |
| Docker Compose            | 8.8/10          | 9.5/10     | Agent 3    |
| Traefik                   | 7/10 (nach Fix) | 9/10       | Agent 4    |
| Auth & Bootstrap          | 2/10            | 9/10       | Agent 5+10 |
| Security                  | 8.5/10          | 9.5/10     | Agent 6    |
| Backup & Persistence      | 7/10            | 8.5/10     | Agent 7    |
| Test-Infrastruktur        | 6/10            | 9/10       | Agent 8    |
| Config Management         | 7/10            | 9/10       | Agent 9    |
| **Fresh-Deploy-Erlebnis** | **0/10**        | **9.5/10** | Alle       |

---

## Anhang: Agent-Analyse-Zusammenfassung

### Agent 1: DB-Migrationen

- 47 SQL-Dateien, 95% idempotent
- **KEIN** Migration-Tracking (schema_migrations)
- **KEINE** Transaktionen (nur 2/47)
- File-Permissions 600 statt 644 → Kaskadierende Fehler
- 032a_create_data_database.sh nicht executable

### Agent 2: Provisioning

- preconfigure.sh: 15 Schritte, 95% idempotent
- Config-Layer (base/profiles/device) erstellt aber **nie gemerged**
- 9 Dateien mit hardcoded `/home/arasul/...`
- systemd-Service WorkingDirectory nicht portabel

### Agent 3: Docker Compose

- 8.8/10 Gesamtscore
- Health Checks: alle 15 Services konfiguriert
- Resource Limits: Jetson-optimiert, konfigurierbar
- Image-Pinning: node/nginx/python nicht auf Patch-Level

### Agent 4: Traefik

- YAML-Strukturfehler war Root Cause für 404
- 2 basicAuth-Middlewares haben PLACEHOLDER-Hashes
- 8 unused Middlewares definiert
- Let's Encrypt Fehler (arasul.local nicht öffentlich)

### Agent 5 + 10: Auth & Bootstrap

- admin_users Tabelle immer leer nach Fresh Deploy
- SQL-Kommentar: "bootstrap script" → existiert nicht
- Setup-Wizard erfordert Login → Deadlock
- Login-Seite sagt "Default: admin" aber User existiert nicht

### Agent 6: Security

- Insgesamt "Production-Ready" (Low Risk)
- Secrets: Docker Secrets Support vorhanden (\_FILE Pattern)
- .env mit 644 statt 600 (world-readable)
- Telegram Token encrypted (AES-256-GCM)

### Agent 7: Backup

- PostgreSQL + MinIO: automatisiert (täglich 2 AM)
- Backup-Service-Container: vereinfachte Version (49 vs 525 Zeilen)
- Qdrant/n8n nur im Hauptskript, nicht im Container
- Factory-Reset: bewahrt AI-Modelle

### Agent 8: Tests

- 40 Backend-Suites (1011 Tests), 16 Frontend-Suites (463 Tests)
- **KEINE** Migration-Tests
- **KEINE** Bootstrap-Tests
- **KEINE** Setup-Wizard E2E-Tests
- **KEINE** Traefik-Config-Validierung

### Agent 9: Config Management

- 185 Env Vars, umfassend dokumentiert (675 Zeilen)
- 17 Jetson-Hardware-Profile
- Docker Secrets Support (resolveSecrets.js)
- validate_config.sh vorhanden

### Agent 11: Best Practices Research

- Empfehlung: SOPS+age für Secrets auf Edge-Devices
- Migration-Runner statt Docker-Init-Skripte
- Factory-Image als tar.gz für Offline-Deployment
- DNS-SD für Service-Discovery neben mDNS
- Jetson fTPM für Hardware-backed Secrets (Zukunft)
