# Arasul Platform - Skalierungsplan: Multi-Device Deployment

> **Ziel**: Neues Jetson-Geraet in unter 30 Minuten produktionsbereit machen.
> Setup bei dir zu Hause, Versand an Kunden in anderem LAN.
>
> **Randbedingungen**: Semi-automatisch (Techniker fuehrt ein Script aus),
> identisches Software-Setup, unabhaengige Geraete, 20+ Stueck/Jahr.

---

## Ist-Zustand

### Was bereits funktioniert

Die Infrastruktur ist zu 90% deployment-ready:

- **`preconfigure.sh`** (13 idempotente Schritte) - generiert .env, SSH-Keys, TLS-Cert,
  Verzeichnisse, erkennt Hardware, laedt Ollama-Modell
- **`create-deployment-image.sh`** - erstellt versandfaehige Offline-Archive mit Docker-Images
- **`verify-deployment.sh`** - Pre-Shipping-Checklist mit 8 Kategorien
- **`detect-jetson.sh`** - erkennt 8+ Jetson-Varianten, generiert passende Resource-Profile
- **Config-Layering** - `config/base/`, `config/profiles/`, `config/device/`
- **mDNS** - `arasul.local` via Avahi, funktioniert automatisch bei Netzwerkwechsel
- **Docker Secrets** - `resolveSecrets.js` unterstuetzt `_FILE`-Pattern
- **CORS** - erkennt private Netzwerk-Ranges automatisch (192.168._, 10._, etc.)
- **Frontend API-URL** - relativ (`/api`), keine Hostname-Abhaengigkeit

### Was gefixt werden muss

Es gibt genau **zwei Kategorien** von Problemen:

**A) Hardcoded Pfade** - 9 Dateien enthalten `/home/arasul/arasul/arasul-jet`:

| Datei                                  | Zeile | Kontext                                |
| -------------------------------------- | ----- | -------------------------------------- |
| `compose/compose.app.yaml`             | 60    | `COMPOSE_PROJECT_DIR` env-var          |
| `routes/admin/settings.js`             | 73    | Fallback fuer `docker compose restart` |
| `services/app/configService.js`        | 172   | Fallback fuer Workspace-Volumes        |
| `services/app/configService.js`        | 230   | n8n Working-Directory                  |
| `services/app/configService.js`        | 241   | Example-Command mit Claude CLI         |
| `features/claude/ClaudeCode.js`        | 55    | Default-Pfad im Formular               |
| `postgres/init/015_...schema.sql`      | 73    | DB-Seed: Default-Workspace             |
| `scripts/util/start-mcp-server.sh`     | 8     | MCP-Server-Default                     |
| `scripts/util/auto-restart-service.sh` | 42    | Service-Restart Pfad                   |

Dazu Username-Referenzen:

| Datei                            | Zeile | Kontext                             |
| -------------------------------- | ----- | ----------------------------------- |
| `routes/store/workspaces.js`     | 118   | Allowlist: `['/home/arasul/', ...]` |
| `services/app/configService.js`  | 201   | SSH-User Default: `'arasul'`        |
| `scripts/security/harden-ssh.sh` | 62    | `ARASUL_HOME="/home/arasul"`        |

**B) Deployment-Luecken** - fehlendes Tooling:

| Problem                                                          | Impact                                          |
| ---------------------------------------------------------------- | ----------------------------------------------- |
| `COMPOSE_PROJECT_NAME` fehlt in docker-compose.yml               | Volume-Namen haengen vom Ordner ab              |
| Docker-Images nicht version-gepinnt (minio, qdrant, cloudflared) | Unterschiedliche Versionen auf Geraeten         |
| Traefik Middlewares enthalten PLACEHOLDER-Hashes                 | Sicherheitsluecke nach frischer Installation    |
| Kein Factory-Reset Script                                        | Geraet nicht wiederverwendbar fuer neuen Kunden |
| `preconfigure.sh` deckt OS-Pakete nicht ab                       | Manuelle apt-Schritte noetig                    |
| Kein Smoke-Test nach Setup                                       | Keine Garantie, dass alles funktioniert         |
| Kein systemd-Service                                             | Nach Reboot starten Services nicht automatisch  |

### Was NICHT gefixt werden muss

Diese Punkte standen im ersten Plan-Entwurf, sind aber **kein Problem**:

- **Container-Pfade** (`/arasul/logs`, `/arasul/updates`, etc.) - diese sind Docker-intern,
  werden ueber Volume-Mounts in den Compose-Dateien kontrolliert. Hardcoded ist hier korrekt.
- **Netzwerkwechsel-Handling** - mDNS (Avahi) broadcastet automatisch die neue IP.
  `arasul.local` funktioniert in jedem LAN ohne Eingriff.
- **TLS-Cert bei Netzwerkwechsel** - selbstsignierte Certs zeigen sowieso Warnungen.
  Die meisten Kunden werden HTTP im LAN nutzen (Port 80 ist bereits offen).
  Ein NetworkManager-Dispatcher waere Over-Engineering.

---

## Der Plan

### Designprinzipien

1. **Minimaler Impact** - Nur aendern, was tatsaechlich bricht. Kein Refactoring um des
   Refactorings willen.
2. **Eine Variable, ein Zweck** - `COMPOSE_PROJECT_DIR` ist die einzige Pfad-Variable.
   Kein `ARASUL_HOME`, kein `PROJECT_ROOT`. Weniger Variablen = weniger Verwirrung.
3. **Sensible Defaults** - Alle Fallbacks zeigen auf `/opt/arasul` (der Standard-
   Installationspfad fuer Kunden). Dev-Pfade kommen aus der .env.
4. **Erweitern statt ersetzen** - `preconfigure.sh` wird erweitert, nicht durch ein
   neues `provision.sh` ersetzt. Ein Script, ein Einstiegspunkt.
5. **Zukunftssicher by Design** - Neue Features (Services, Migrations, Compose-Dateien)
   fliessen automatisch ins Deployment, ohne den Skalierungscode anzufassen.

---

### Phase 1: Pfad-Portabilitaet

**Aufwand**: ~2h | **Risiko**: Gering (nur Defaults aendern, kein Logik-Umbau)

#### 1.1 COMPOSE_PROJECT_DIR ueberall nutzen

Das env-var existiert bereits. Es muss nur konsequent verwendet werden.

**compose/compose.app.yaml** (Zeile 60):

```yaml
# vorher:
COMPOSE_PROJECT_DIR: /home/arasul/arasul/arasul-jet
# nachher:
COMPOSE_PROJECT_DIR: ${COMPOSE_PROJECT_DIR:-.}
```

**Backend-Code** - Fallback auf `/opt/arasul` statt hardcoded Dev-Pfad:

```javascript
// settings.js:73
const composeDir = process.env.COMPOSE_PROJECT_DIR || '/opt/arasul';

// configService.js:172 (Fallback-Workspace-Volumes)
const homeDir = os.homedir();
return [
  { hostPath: process.env.COMPOSE_PROJECT_DIR || '/opt/arasul', containerPath: '/workspace/arasul' },
  { hostPath: path.join(homeDir, 'workspace'), containerPath: '/workspace/custom' },
];

// configService.js:230 (n8n Working-Directory)
workingDirectory: manifest.n8nIntegration.workingDirectory || process.env.COMPOSE_PROJECT_DIR || '/opt/arasul',

// configService.js:241 (Example-Command)
// Dynamisch zusammenbauen statt hardcoded
const projectDir = process.env.COMPOSE_PROJECT_DIR || '/opt/arasul';
const claudePath = process.env.CLAUDE_CLI_PATH || 'claude';
exampleCommand: `cd ${projectDir} && echo "Dein Prompt hier" | ${claudePath} -p --dangerously-skip-permissions`,
```

**Frontend** (ClaudeCode.js:55):

```javascript
// vorher:
const [newPath, setNewPath] = useState('/home/arasul/');
// nachher:  Leer lassen - User soll bewusst eingeben
const [newPath, setNewPath] = useState('');
```

**SQL Seed** (015_claude_workspaces_schema.sql):

```sql
-- Die System-Workspaces werden NICHT mehr mit hardcoded Pfaden geseeded.
-- Stattdessen erstellt preconfigure.sh oder der Setup-Wizard die Workspaces
-- zur Laufzeit mit dem korrekten COMPOSE_PROJECT_DIR.
```

Dafuer: neuer API-Endpunkt oder preconfigure.sh-Schritt, der die Workspaces
mit dem richtigen Pfad per SQL INSERT erstellt.

#### 1.2 Workspace-Allowlist dynamisch

```javascript
// workspaces.js:118
const homeDir = os.homedir();
const projectDir = process.env.COMPOSE_PROJECT_DIR || '/opt/arasul';
const allowedPrefixes = [homeDir + '/', projectDir + '/', '/workspace/', '/tmp/'];
```

#### 1.3 Scripts fixen

```bash
# start-mcp-server.sh
WORKSPACE=${WORKSPACE:-${COMPOSE_PROJECT_DIR:-/opt/arasul}}

# auto-restart-service.sh
PROJECT_DIR="${COMPOSE_PROJECT_DIR:-/opt/arasul}"

# harden-ssh.sh
ARASUL_HOME="${HOME:-/home/arasul}"
```

#### 1.4 preconfigure.sh: COMPOSE_PROJECT_DIR setzen

```bash
# In Step 2 (.env generieren) hinzufuegen:
echo "COMPOSE_PROJECT_DIR=${PROJECT_ROOT}" >> "$ENV_FILE"
```

---

### Phase 2: Deployment-Stabilitaet

**Aufwand**: ~2h | **Risiko**: Minimal (Konfigurationsaenderungen, kein Code)

#### 2.1 COMPOSE_PROJECT_NAME festlegen

```yaml
# docker-compose.yml - hinzufuegen:
name: arasul-platform

include:
  - path: ./compose/compose.core.yaml
  # ...
```

Damit heissen Docker-Volumes immer `arasul-platform_arasul-postgres` etc.,
egal in welchem Ordner das Projekt liegt.

#### 2.2 Docker-Images version-pinnen

Direkt in den Compose-Dateien (kein versions.env, kein zusaetzlicher Layer):

```yaml
# compose.core.yaml
minio:
  image: minio/minio:RELEASE.2025-02-28T09-55-16Z # aktuell installierte Version

# compose.ai.yaml
qdrant:
  image: qdrant/qdrant:v1.13.2 # aktuell installierte Version

# compose.external.yaml
cloudflared:
  image: cloudflare/cloudflared:2025.2.1 # aktuell installierte Version
```

Zum Updaten spaeter: Version in Compose-Datei aendern, `docker compose pull`, fertig.
Kein indirektes versions.env noetig.

#### 2.3 Traefik-Credentials automatisch generieren

`preconfigure.sh` erweitern (neuer Step nach TLS-Cert):

```bash
# Step 5b: Traefik Basic Auth generieren
MIDDLEWARES_FILE="${PROJECT_ROOT}/config/traefik/dynamic/middlewares.yml"
if grep -q "PLACEHOLDER" "$MIDDLEWARES_FILE" 2>/dev/null; then
  TRAEFIK_HASH=$(echo "$ADMIN_PASSWORD" | htpasswd -niB admin | sed 's/\$/\$\$/g')
  sed -i "s|admin:\$apr1\$PLACEHOLDER.*|${TRAEFIK_HASH}|" "$MIDDLEWARES_FILE"
  log_info "Traefik Basic Auth generiert"
fi
```

#### 2.4 systemd-Service fuer Auto-Start nach Reboot

```bash
# preconfigure.sh: neuer Step
cat > /etc/systemd/system/arasul.service << EOF
[Unit]
Description=Arasul Platform
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${PROJECT_ROOT}
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
User=$(whoami)

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable arasul.service
```

---

### Phase 3: Provisioning (OS-Level)

**Aufwand**: ~3h | **Risiko**: Gering (erweitert bestehendes Script)

#### 3.1 preconfigure.sh um OS-Schritte erweitern

Statt ein neues `provision.sh` zu erstellen, bekommt `preconfigure.sh`
einen `--full` Modus:

```bash
# Neuer Flag:
# ./scripts/setup/preconfigure.sh --full   (inkl. OS-Pakete)
# ./scripts/setup/preconfigure.sh          (wie bisher, ohne OS)

if [ "$FULL_MODE" = true ]; then
  # Step 0a: System-Pakete
  sudo apt-get update -qq
  sudo apt-get install -y -qq \
    docker.io docker-compose-plugin nvidia-container-toolkit \
    avahi-daemon avahi-utils libnss-mdns \
    jq openssl curl htpasswd

  # Step 0b: Docker NVIDIA Runtime als Default
  sudo nvidia-ctk runtime configure --runtime=docker --set-as-default
  sudo systemctl restart docker

  # Step 0c: AppArmor-Profile laden
  for profile in "${PROJECT_ROOT}/config/apparmor/"*; do
    sudo apparmor_parser -r "$profile" 2>/dev/null || true
  done
fi

# ... dann weiter wie bisher mit Step 1-13
```

#### 3.2 Factory-Reset Script

Neues Script: `scripts/setup/factory-reset.sh`

Einfach und klar - loescht Kundendaten, behaelt Software + AI-Modelle:

```bash
#!/bin/bash
# Setzt Geraet fuer neuen Kunden zurueck.
# Behaelt: Docker Images, Ollama-Modelle, Embedding-Modelle
# Loescht: Datenbank, Dokumente, Chats, Configs, Secrets

set -euo pipefail

echo "WARNUNG: Alle Kundendaten werden geloescht!"
read -rp "Fortfahren? (ja/NEIN): " CONFIRM
[ "$CONFIRM" = "ja" ] || exit 1

docker compose down -v --remove-orphans  # Stoppt alles, loescht Volumes

# AI-Modelle behalten (separate Volumes)
# arasul-platform_arasul-llm-models und arasul-platform_arasul-embeddings-models
# werden NICHT geloescht (docker compose down -v loescht sie aber)
# Deshalb: vorher sichern, nachher wiederherstellen
BACKUP_LLM=$(mktemp -d)
docker volume inspect arasul-platform_arasul-llm-models &>/dev/null && \
  docker run --rm -v arasul-platform_arasul-llm-models:/data -v "$BACKUP_LLM":/backup \
    alpine tar cf /backup/models.tar /data

docker compose down -v --remove-orphans

# Modelle wiederherstellen
if [ -f "$BACKUP_LLM/models.tar" ]; then
  docker volume create arasul-platform_arasul-llm-models
  docker run --rm -v arasul-platform_arasul-llm-models:/data -v "$BACKUP_LLM":/backup \
    alpine tar xf /backup/models.tar -C /
  rm -rf "$BACKUP_LLM"
fi

# Config zuruecksetzen
rm -f .env
rm -rf config/device/ config/secrets/ config/certs/ config/ssh/
rm -rf data/ logs/ cache/ updates/

# Neu initialisieren
./scripts/setup/preconfigure.sh

echo "Factory Reset abgeschlossen. Admin-Passwort oben notieren!"
```

#### 3.3 Smoke-Test

Neues Script: `scripts/test/smoke-test.sh` - schnell und fokussiert:

```bash
#!/bin/bash
# Prueft ob alle Services laufen und erreichbar sind.
# Aufruf: nach Setup, nach Reboot, nach Netzwerkwechsel.

PASS=0; FAIL=0
check() { if "$@" &>/dev/null; then echo "  OK  $1"; PASS=$((PASS+1));
           else echo "  FAIL $1"; FAIL=$((FAIL+1)); fi; }

echo "Arasul Smoke Test"
echo "=================="

check docker compose ps --status running | grep -c "" | grep -q "^1[0-9]"  # 10+ services
check curl -sf http://localhost/api/health
check curl -sf http://localhost/
check docker compose exec -T postgres-db pg_isready -U arasul
check docker compose exec -T llm-service ollama list | grep -q .
check curl -sf http://localhost:9100/health   # metrics
check avahi-resolve -n arasul.local

echo ""
echo "Ergebnis: $PASS OK, $FAIL FAIL"
[ "$FAIL" -eq 0 ] && echo "BEREIT" || echo "PROBLEME GEFUNDEN"
```

---

### Phase 4: Dokumentation

**Aufwand**: ~1h | **Risiko**: Null

Zwei kurze Dokumente:

#### 4.1 Techniker-Checkliste (`docs/DEPLOYMENT_CHECKLIST.md`)

```
Setup (bei dir zu Hause):
  1. JetPack 6.2.1 flashen (SDK Manager)
  2. SSH-Verbindung: ssh arasul@<jetson-ip>
  3. git clone git@github.com:arasul/arasul-jet.git /opt/arasul
  4. cd /opt/arasul && ./scripts/setup/preconfigure.sh --full
  5. Admin-Passwort notieren!
  6. ./scripts/test/smoke-test.sh
  7. ./scripts/deploy/verify-deployment.sh
  8. Geraet herunterfahren, verpacken, versenden

Beim Kunden:
  - Ethernet anschliessen, Strom anschliessen
  - Browser: http://arasul.local (oder IP aus Router)
  - Login mit Admin-Passwort
```

#### 4.2 Feature-Erweiterbarkeit dokumentieren

Ein Abschnitt in `docs/DEVELOPMENT.md`:

```
## Neues Feature deployen

Die Skalierungsarchitektur ist so aufgebaut, dass neue Features
automatisch auf allen Geraeten landen:

- **Neuer Docker-Service**: In compose/*.yaml hinzufuegen.
  Wird automatisch gebaut/gepullt bei `docker compose up -d`.

- **Neue DB-Migration**: SQL-Datei in services/postgres/init/ ablegen.
  Wird automatisch beim naechsten frischen Setup angewendet.
  Fuer bestehende Geraete: Migration manuell oder via Update-Paket.

- **Neue env-Variable**: In .env.template dokumentieren.
  In preconfigure.sh Default setzen.
  In der relevanten Compose-Datei referenzieren.

- **Neues Frontend-Feature**: Normaler Build-Prozess.
  `docker compose up -d --build dashboard-frontend` aktualisiert.

Kein separater "Skalierungscode" noetig. Git pull + docker compose up
beinhaltet automatisch alle Aenderungen.
```

---

## Zusammenfassung

### Was wir aendern (minimal, clean, vorhersagbar)

| #   | Aufgabe                                                           | Dateien                    | Aufwand |
| --- | ----------------------------------------------------------------- | -------------------------- | ------- |
| 1   | Hardcoded Pfade → `COMPOSE_PROJECT_DIR` mit Default `/opt/arasul` | 9 Backend/Frontend-Dateien | 1h      |
| 2   | Workspace-Allowlist dynamisch machen                              | 1 Datei                    | 15min   |
| 3   | Scripts: Pfade via env-var                                        | 3 Scripts                  | 15min   |
| 4   | `preconfigure.sh`: `COMPOSE_PROJECT_DIR` in .env schreiben        | 1 Datei                    | 10min   |
| 5   | `COMPOSE_PROJECT_NAME: arasul-platform` in docker-compose.yml     | 1 Datei                    | 5min    |
| 6   | Docker-Images version-pinnen (minio, qdrant, cloudflared)         | 3 Compose-Dateien          | 15min   |
| 7   | Traefik PLACEHOLDER-Hashes automatisch generieren                 | preconfigure.sh            | 30min   |
| 8   | systemd-Service fuer Auto-Start nach Reboot                       | preconfigure.sh            | 20min   |
| 9   | `preconfigure.sh --full` mit OS-Paket-Installation                | preconfigure.sh            | 1h      |
| 10  | `factory-reset.sh`                                                | Neues Script               | 1h      |
| 11  | `smoke-test.sh`                                                   | Neues Script               | 30min   |
| 12  | Techniker-Checkliste + Feature-Erweiterbarkeit Docs               | 2 Docs                     | 30min   |

### Was wir NICHT aendern

- Container-Pfade (`/arasul/logs` etc.) - sind Docker-intern, korrekt hardcoded
- Kein `ARASUL_HOME` env-var - `COMPOSE_PROJECT_DIR` reicht
- Kein `versions.env` - Versionen direkt in Compose-Dateien
- Kein `provision.sh` Wrapper - `preconfigure.sh --full` stattdessen
- Kein NetworkManager-Dispatcher - mDNS handelt Netzwerkwechsel automatisch
- Kein TLS-Cert-Regenerierung bei Netzwerkwechsel - HTTP funktioniert im LAN

### Gesamt-Aufwand: ~6-8h (statt 15-20h im ersten Entwurf)

### Ergebnis

```
Workflow:
  JetPack flashen
  → git clone /opt/arasul
  → ./scripts/setup/preconfigure.sh --full
  → Admin-Passwort notieren
  → smoke-test.sh
  → Geraet versenden
  = 20-30 Minuten, reproduzierbar, skalierbar

Spaeter Geraet wiederverwenden:
  → ./scripts/setup/factory-reset.sh
  → 5 Minuten (AI-Modelle bleiben erhalten)
```
