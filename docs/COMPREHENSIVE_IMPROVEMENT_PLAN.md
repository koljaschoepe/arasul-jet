# Arasul Platform — Ultimativer Improvement Plan

> Erstellt am 2026-04-09 durch 20 Analyse-Agents + 12 Challenge-Agents.
> Validiert gegen: Balena.io, Azure IoT Edge, AWS Greengrass, NVIDIA Fleet Command, Home Assistant, Umbrel, Frigate NVR, CasaOS.
> Ziel: Kommerzielles Edge-AI-Produkt, das 3-5 Jahre autonom beim Kunden laeuft.

---

## Gesamtbewertung: 7.5/10

Die Plattform hat eine **solide Basis** fuer ein kommerzielles Produkt. Die Architektur ist gut, die Security-Patterns sind stark, und die Infrastruktur ist enterprise-grade. Aber fuer ein Produkt, das 3+ Jahre autonom laeuft und an Unternehmen verkauft wird, fehlen noch kritische Bereiche.

### Bewertung nach Bereichen

| Bereich               | Note | Zusammenfassung                                                     |
| --------------------- | ---- | ------------------------------------------------------------------- |
| **Backend API**       | A+   | 326 Endpoints, 100% asyncHandler, keine SQL-Injection               |
| **Security**          | A    | Docker Secrets, CSP, HSTS, Rate Limiting, Netzwerk-Segmentierung    |
| **Docker/Infra**      | A    | Memory/CPU Limits, Health Checks, read-only Container, cap_drop     |
| **Setup/Bootstrap**   | A-   | Hardware-Erkennung, interaktives Setup, Factory Reset               |
| **Self-Healing**      | A-   | Category A-D Eskalation, GPU Recovery, Deadman Switch               |
| **Database**          | B+   | Gutes Autovacuum-Tuning, aber WAL-Archivierung fehlt                |
| **Backup/DR**         | B+   | PG+MinIO+Qdrant+n8n Backup, aber keine Verschluesselung             |
| **Frontend**          | B+   | Gute Hooks/Patterns, aber zu grosse Komponenten                     |
| **Python Services**   | B    | Funktional, SQL-Injection im Indexer, keine Tests                   |
| **Langzeit-Betrieb**  | B-   | Kein Hardware-Watchdog, kein NVMe-Monitoring, kein Boot-Loop-Schutz |
| **Produkt-Lifecycle** | C+   | Kein OTA-Update, kein Lizenzierung, kein Fleet Management           |
| **Tests**             | C+   | ~30-35% Coverage, Python-Services 0 Tests                           |

---

## Phase 0: Showstopper fuer Produktverkauf

**Prioritaet: VOR VERKAUF | Aufwand: 3-5 Tage**

Diese Items machen den Unterschied zwischen "funktionierendem Projekt" und "verkaufbarem Produkt".

### 0.1 Hardware-Watchdog aktivieren (KRITISCH)

**Problem:** Kein Hardware-Watchdog. Bei Kernel-Hang, I/O-Stall oder systemd-Deadlock startet nichts das System neu. Jetson AGX Orin hat einen Tegra Hardware Watchdog (`tegra_wdt`).

**Fix:** Systemd RuntimeWatchdog konfigurieren und Setup-Script anpassen:

```bash
# In scripts/setup/preconfigure.sh oder bootstrap:
cat > /etc/systemd/system.conf.d/watchdog.conf << 'EOF'
[Manager]
RuntimeWatchdogSec=30
ShutdownWatchdogSec=10min
EOF

# Kernel-Panic auto-reboot in /etc/sysctl.d/99-arasul.conf:
kernel.panic=10
kernel.panic_on_oops=1
```

**Datei:** `scripts/setup/preconfigure.sh` (erweitern)

### 0.2 Boot-Loop-Schutz (KRITISCH)

**Problem:** Kein Schutz gegen endlose Reboot-Loops. Ein korruptes Docker-Image oder defekte Config kann unendlich Neustarts ausloesen.

**Fix:** Boot-Counter in systemd-Service:

```bash
# /etc/systemd/system/arasul-boot-guard.service
# Zaehlt Boots in /var/lib/arasul/boot_count
# Nach 5 Fehlstarts in 1h: Recovery-Modus (nur SSH, kein Docker)
# Reset nach erfolgreichem Health-Check
```

**Datei:** Neu: `scripts/system/boot-guard.sh`

### 0.3 NVMe/eMMC Wear Monitoring (KRITISCH fuer 3-5 Jahre)

**Problem:** Kein Disk-Verschleiss-Monitoring. NVMe/eMMC haben endliche Schreibzyklen. Nach 3 Jahren ohne Monitoring kann die Disk ohne Vorwarnung ausfallen.

**Fix:** In `services/metrics-collector/` SMART-Daten auslesen:

```python
# smartctl -a /dev/nvme0n1 --json
# Tracke: Percentage Used, Available Spare, Media Errors, Critical Warning
# Alert wenn Available Spare < 10% oder Percentage Used > 80%
```

**Dateien:** `services/metrics-collector/collectors/disk_health.py` (neu), `compose/compose.monitoring.yaml` (Devices: /dev/nvme0n1)

### 0.4 Sysctl-Tuning fuer Langzeit-Betrieb

**Problem:** Keine Kernel-Parameter-Optimierung. Defaults sind fuer Desktops, nicht fuer 5-Jahre-Appliances.

**Fix:** `/etc/sysctl.d/99-arasul.conf`:

```ini
# Filesystem
vm.dirty_ratio = 10
vm.dirty_background_ratio = 5
fs.inotify.max_user_watches = 524288

# Network (fuer Docker)
net.core.somaxconn = 1024
net.ipv4.ip_local_port_range = 1024 65535

# OOM
vm.overcommit_memory = 0
vm.panic_on_oom = 0

# Kernel panic recovery
kernel.panic = 10
kernel.panic_on_oops = 1
```

**Datei:** `scripts/setup/preconfigure.sh` (erweitern)

### 0.5 Filesystem-Schutz

**Problem:** Kein Schutz gegen Filesystem-Korruption bei Stromausfall. `ext4` ohne `noatime` verschleisst die Disk schneller.

**Fix:** Mount-Optionen optimieren:

```bash
# In /etc/fstab: Daten-Partition mit noatime,commit=60
# fsck -y in initramfs aktivieren
# Alternativ: overlayroot fuer Read-Only rootfs evaluieren
```

**Datei:** `scripts/setup/preconfigure.sh` (erweitern)

### 0.6 Self-Signed TLS-Zertifikat mit langer Laufzeit

**Problem:** Self-signed Cert hat Standard-Laufzeit. Nach Ablauf wird Dashboard unzugaenglich. Kein automatischer Renewal-Mechanismus.

**Fix:** 10-Jahres-Self-Signed-Cert bei Setup generieren + automatischer Renewal-Check im Self-Healing-Agent:

```bash
# Beim Setup: 10 Jahre Laufzeit
openssl req -x509 -nodes -days 3650 -newkey rsa:4096 ...

# Self-Healing: Cert-Ablauf pruefen, bei < 90 Tagen erneuern
```

**Datei:** `services/self-healing-agent/` (Cert-Expiry-Check), `arasul` Bootstrap (10-Jahres-Cert)

### 0.7 NTP/Zeitsynchronisation fuer Offline-Betrieb

**Problem:** Keine chrony/NTP-Konfiguration. Bei Offline-Betrieb driftet die RTC. TLS-Validation, PostgreSQL-Timestamps und Cron-Jobs brechen.

**Fix:**

```bash
# chrony mit Offline-Resilienz installieren
apt install chrony
# Config: makestep 1 -1 (grosse Spruenge erlauben nach Offline-Phase)
# RTC-Drift-Check im Self-Healing-Agent
```

**Datei:** `scripts/setup/preconfigure.sh` (chrony installieren), Self-Healing-Agent (RTC-Check)

---

## Phase 1: Kritische Fixes (Security & Bugs)

**Prioritaet: SOFORT | Aufwand: 1-2 Tage**

### 1.1 SQL Injection im Document Indexer

**Datei:** `services/document-indexer/api_server.py`
**Problem:** `order_by` und `order_dir` Parameter werden nicht validiert.
**Fix:**

```python
ALLOWED_ORDER_BY = {'uploaded_at', 'title', 'file_size', 'status'}
ALLOWED_ORDER_DIR = {'ASC', 'DESC'}
order_by = request.args.get('order_by', 'uploaded_at')
order_dir = request.args.get('order_dir', 'DESC')
if order_by not in ALLOWED_ORDER_BY:
    return jsonify({'error': 'Invalid order_by'}), 400
if order_dir.upper() not in ALLOWED_ORDER_DIR:
    return jsonify({'error': 'Invalid order_dir'}), 400
```

### 1.2 Backup-Script Bug

**Datei:** `scripts/backup/backup.sh` (Zeile 347, 356, 365, 374, 384)
**Problem:** `((deleted_count++))` schlaegt unter `set -e` fehl wenn `deleted_count=0`.
**Fix:** Alle `((deleted_count++))` ersetzen durch `deleted_count=$((deleted_count + 1))`

### 1.3 Memory-Akkumulation im Document Indexer

**Datei:** `services/document-indexer/document_processor.py`
**Problem:** `all_points`-Liste akkumuliert im RAM. Bei grossen Dokumenten: OOM.
**Fix:** Upsert in Batches:

```python
UPSERT_BATCH_SIZE = 100
for i in range(0, len(all_points), UPSERT_BATCH_SIZE):
    batch = all_points[i:i+UPSERT_BATCH_SIZE]
    qdrant_manager.upsert_points(batch)
all_points.clear()  # RAM sofort freigeben
```

### 1.4 Synchrone File-I/O im Telegram-Service

**Datei:** `apps/dashboard-backend/src/services/telegram/telegramIntegrationService.js`
**Problem:** `fs.writeFileSync()`, `fs.readFileSync()` blockieren den Event Loop.
**Fix:** Durch `fs.promises.*` ersetzen:

- Zeile 872: `fs.writeFileSync` -> `await fs.promises.writeFile`
- Zeile 891: `fs.readFileSync` -> `await fs.promises.readFile`
- Zeile 65: `fs.readdirSync` -> `await fs.promises.readdir`

### 1.5 Env-Backup-Dateien entfernen

```bash
rm -f .env.bak .env.backup.* arasul.backup config/traefik/traefik.yml.backup
echo "*.backup*" >> .gitignore
echo "*.bak" >> .gitignore
```

### 1.6 `set -euo pipefail` in allen Entrypoints

**Dateien:**

- `arasul` (Zeile 7): nur `set -e` -> `set -euo pipefail`
- `services/self-healing-agent/start.sh`
- `services/llm-service/entrypoint.sh`
- `services/backup-service/entrypoint.sh`

### 1.7 `trust proxy` auf `1` setzen (Security)

**Datei:** `apps/dashboard-backend/src/index.js` (Zeile 91)
**Problem:** `app.set('trust proxy', true)` vertraut beliebig vielen Proxies -> IP-Spoofing moeglich.
**Fix:** `app.set('trust proxy', 1)` — nur ein Hop (Traefik).

### 1.8 `docker-socket-proxy` Image pinnen

**Datei:** `compose/compose.core.yaml` (Zeile 89)
**Problem:** `image: tecnativa/docker-socket-proxy:latest` — unkontrollierte Updates.
**Fix:** `image: tecnativa/docker-socket-proxy:0.3.0` (oder aktuellste spezifische Version)

---

## Phase 2: Backend-Hardening fuer Langzeit-Betrieb

**Prioritaet: HOCH | Aufwand: 2-3 Tage**

### 2.1 V8 Heap-Limit setzen

**Datei:** `apps/dashboard-backend/Dockerfile` (Zeile 27)
**Problem:** Kein `--max-old-space-size`. Auf 32GB Jetson mit GPU-Services kann der Heap unbegrenzt wachsen und andere Services per OOM killen.
**Fix:**

```dockerfile
CMD ["node", "--max-old-space-size=512", "src/index.js"]
```

### 2.2 Event Loop Monitoring

**Problem:** Kein Detection fuer blockierende Operationen. Ein synchroner PDF-Parse oder grosses JSON.stringify blockiert alles.
**Fix:** In `apps/dashboard-backend/src/index.js`:

```javascript
const { monitorEventLoopDelay } = require('perf_hooks');
const h = monitorEventLoopDelay({ resolution: 50 });
h.enable();
// Im Health-Endpoint: p99 event loop delay exponieren
// Warnung wenn p99 > 100ms
```

### 2.3 PostgreSQL Pool maxUses + maxLifetimeMillis

**Datei:** `apps/dashboard-backend/src/database.js`
**Problem:** Connections leben ewig. PostgreSQL akkumuliert pro Connection Speicher.
**Fix:**

```javascript
const poolConfig = {
  // ... bestehende Config ...
  maxUses: 7500, // Connection nach 7500 Queries recyceln
  maxLifetimeMillis: 1800000, // Connection nach 30min recyceln
};
```

### 2.4 Request Correlation IDs

**Datei:** `apps/dashboard-backend/src/index.js`
**Problem:** Kein Request-Tracing moeglich.
**Fix:**

```javascript
const { v4: uuidv4 } = require('uuid');
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || uuidv4();
  res.setHeader('x-request-id', req.id);
  next();
});
```

### 2.5 `stop_grace_period` fuer Backend und GPU-Services

**Dateien:** `compose/compose.app.yaml`, `compose/compose.ai.yaml`
**Problem:** Docker default `stop_timeout=10s`, aber Backend-Shutdown-Handler wartet 30s. Docker SIGKILL-ed den Prozess mitten im Shutdown.
**Fix:**

```yaml
# compose.app.yaml - dashboard-backend:
stop_grace_period: 35s

# compose.ai.yaml - llm-service + embedding-service:
stop_grace_period: 30s
```

### 2.6 SSE Keepalive fuer LLM-Streaming

**Problem:** SSE-Connections durch Traefik werden bei Idle-Timeout gekillt waehrend langsamer LLM-Generierung.
**Fix:** SSE-Comment als Keepalive alle 15s senden:

```javascript
// In SSE-Helper: periodisch `: keepalive\n\n` senden
const keepaliveInterval = setInterval(() => {
  res.write(': keepalive\n\n');
}, 15000);
```

### 2.7 WebSocket Backpressure

**Problem:** Wenn Client-Netzwerk stalled, buffert `ws.send()` unbegrenzt.
**Fix:** `ws.bufferedAmount` pruefen vor dem Senden; bei > 64KB ueberspringen oder Connection trennen.

### 2.8 Request Timeout Middleware

**Problem:** Kein Overall-Timeout fuer HTTP-Requests. `statement_timeout` schuetzt nur PG, nicht Ollama-Calls.
**Fix:**

```javascript
app.use((req, res, next) => {
  req.setTimeout(60000, () => {
    if (!res.headersSent) res.status(408).json({ error: 'Request timeout' });
  });
  next();
});
```

---

## Phase 3: PostgreSQL Langzeit-Tuning

**Prioritaet: HOCH | Aufwand: 1 Tag**

### 3.1 WAL-Archivierung aktivieren (KRITISCH)

**Datei:** `config/postgres/postgresql.conf` (Zeile 12-14)
**Problem:** `archive_mode = off`. Ein Crash zwischen taeglichen Backups verliert ALLE Daten seit dem letzten Dump.
**Fix:**

```ini
archive_mode = on
archive_command = 'test ! -f /backups/wal/%f && cp %p /backups/wal/%f'
archive_timeout = 300
```

### 3.2 pg_stat_statements aktivieren

**Problem:** Keine Query-Performance-Analyse moeglich.
**Fix:** In `postgresql.conf`:

```ini
shared_preload_libraries = 'pg_stat_statements'
pg_stat_statements.max = 5000
pg_stat_statements.track = top
```

### 3.3 Index-Bloat-Monitoring

**Problem:** Indexes koennen ueber Jahre aufblaahen und Queries verlangsamen.
**Fix:** Woechentlicher Job in n8n oder Self-Healing:

```sql
-- Bloat-Check: Tabellen mit > 20% Bloat identifizieren
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Bei > 30% Bloat: REINDEX CONCURRENTLY
```

### 3.4 Temp-Files und Work-Mem Monitoring

**Problem:** `work_mem = 64MB` kann bei vielen parallelen Queries zu exzessivem Temp-File-Usage fuehren.
**Fix:** Monitoring in Metrics Collector:

```sql
SELECT temp_files, temp_bytes FROM pg_stat_database WHERE datname = 'arasul_db';
```

### 3.5 Connection Count Monitoring

**Problem:** `max_connections = 200` kann bei Connection-Leaks erschoepft werden.
**Fix:** Alert bei > 80% Connection-Usage in Self-Healing-Agent.

---

## Phase 4: Backup & Disaster Recovery Haertung

**Prioritaet: HOCH | Aufwand: 2-3 Tage**

### 4.1 Backup-Verschluesselung

**Problem:** Backups liegen unverschluesselt auf Disk. Bei Enterprise-Kunden mit sensiblen Dokumenten ein Compliance-Problem.
**Fix:**

```bash
# In backup.sh: GPG-Verschluesselung nach Backup
gpg --symmetric --batch --passphrase-file /run/secrets/backup_key \
    --output "${backup_file}.gpg" "${backup_file}"
rm "${backup_file}"
```

### 4.2 Config-Backup (.env, Zertifikate, Docker Secrets)

**Problem:** Backup sichert Daten (PG, MinIO, Qdrant, n8n) aber NICHT die Konfiguration. Bei Disk-Ausfall sind .env, TLS-Certs und Docker Secrets weg.
**Fix:** In `backup.sh` ergaenzen:

```bash
backup_config() {
    tar -czf "${BACKUP_DIR}/config/config_${TIMESTAMP}.tar.gz" \
        --exclude='*.backup*' \
        .env config/secrets/ config/traefik/certs/ config/traefik/dynamic/
}
```

### 4.3 Restore-Script vervollstaendigen

**Datei:** `scripts/backup/restore.sh`
**Problem:** Qdrant- und n8n-Restore fehlen im Script. Config-Restore fehlt.
**Fix:** `restore_qdrant()`, `restore_n8n()` und `restore_config()` Funktionen ergaenzen.

### 4.4 USB-Backup-Target

**Problem:** Backups liegen nur auf dem gleichen Geraet. Bei Disk-Ausfall sind Daten UND Backups weg.
**Fix:** USB-Stick/SSD-Erkennung in Self-Healing (USB-Monitor existiert bereits):

```bash
# Wenn USB-Storage erkannt: letzte Backups dorthin kopieren
# Konfigurierbar via .env: BACKUP_USB_ENABLED=true
```

### 4.5 Automatischer Restore-Test

**Problem:** Backups werden nie auf Wiederherstellbarkeit geprueft.
**Fix:** Monatlicher automatischer Test:

```bash
# 1. PostgreSQL-Backup in temporaeren Container restoren
# 2. Pruefen ob Tabellen-Count und Row-Count plausibel
# 3. Ergebnis in DB loggen
```

**Datei:** Neu: `scripts/backup/verify-backup.sh`

---

## Phase 5: Docker & Infrastruktur

**Prioritaet: MITTEL | Aufwand: 1-2 Tage**

### 5.1 Docker Data Pruning automatisieren

**Problem:** `/var/lib/docker` waechst durch dangling Images, Build Cache und tote Container. Ueber Jahre kritisch.
**Fix:** Im Self-Healing-Agent oder Cron:

```bash
docker system prune --force --filter "until=720h"  # > 30 Tage alte Artefakte
docker image prune --force --filter "dangling=true"
```

### 5.2 `pids_limit` fuer alle Container

**Problem:** Kein Fork-Bomb-Schutz. Ein entlaufener Prozess kann das System lahmlegen.
**Fix:** In allen Services: `pids_limit: 256` (oder passend pro Service).

### 5.3 Docker Daemon Log-Rotation (Host)

**Datei:** `/etc/docker/daemon.json`
**Problem:** Compose-Level Logging ist konfiguriert, aber kein Host-Level-Fallback.
**Fix:**

```json
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "50m", "max-file": "5" },
  "default-runtime": "nvidia",
  "storage-driver": "overlay2"
}
```

### 5.4 Traefik-Kompression nutzen

**Problem:** Traefik hat `compress` Middleware definiert (middlewares.yml:142-146), aber sie wird wahrscheinlich nicht in allen Routen verwendet.
**Fix:** `compress` Middleware in alle API-Routen einbinden (in `config/traefik/dynamic/routers.yml`).

---

## Phase 6: Self-Healing & Monitoring erweitern

**Prioritaet: MITTEL | Aufwand: 2-3 Tage**

### 6.1 Zertifikats-Ablauf-Monitoring

**Problem:** Self-signed Certs haben ein Ablaufdatum. Kein Alert bevor sie ablaufen.
**Fix:** Im Self-Healing-Agent:

```python
import ssl, datetime
cert = ssl.get_server_certificate(('localhost', 443))
x509 = ssl.PEM_cert_to_DER_cert(cert)
# Pruefe: Ablauf in < 90 Tagen -> Warning, < 30 Tagen -> Renew
```

### 6.2 Memory-Trend-Analyse

**Problem:** Container-Memory-Limits existieren, aber kein Trending. Ein langsamer Leak ueber Monate wird erst beim OOM-Kill bemerkt.
**Fix:** Per-Container RSS alle 5min tracken, Alert bei steigendem Trend ueber 7 Tage.

### 6.3 PostgreSQL Health erweitern

**Problem:** Health-Check ist nur `pg_isready`. Das prueft ob PostgreSQL Connections annimmt, nicht ob es performt.
**Fix:** Erweiterter Health-Check:

```sql
-- Aktive Connections, Lock-Waits, Replication Lag
SELECT count(*) FROM pg_stat_activity;
SELECT count(*) FROM pg_locks WHERE NOT granted;
```

### 6.4 Docker-Pruning als Self-Healing-Aktion

**Datei:** `services/self-healing-agent/category_handlers.py`
**Problem:** Bei Disk-Warnungen wird nur geloggt, Docker wird nicht aufgeraeumt.
**Fix:** In Category B (Overload) bei Disk > 80%: `docker system prune` ausfuehren.

### 6.5 External Heartbeat / Dead Man's Switch

**Problem:** Die gesamte Monitoring-Infrastruktur laeuft AUF dem Geraet. Wenn das Geraet komplett ausfaellt, bemerkt es niemand bis der Kunde anruft.
**Fix:** Optionaler externer Heartbeat-Service:

```bash
# Alle 5 Min: HTTP POST an externen Endpoint (konfigurierbar)
# Wenn Endpoint 3x keine Antwort bekommt -> Alert an Betreiber
# Konfigurierbar: HEARTBEAT_URL=https://uptime.arasul.de/ping/<device-id>
```

---

## Phase 7: Code-Qualitaet & Architektur

**Prioritaet: MITTEL | Aufwand: 5-7 Tage**

### 7.1 Grosse Telegram-Services aufteilen

**Dateien:**

- `telegramIngressService.js` (1902 Zeilen)
- `telegramIntegrationService.js` (1381 Zeilen)
- `telegramOrchestratorService.js` (1038 Zeilen)

**Ziel:** Jede Datei < 500 Zeilen:

- Message Processing
- Voice/Media Handling
- Session Management
- Response Formatting

### 7.2 Grosse Frontend-Komponenten refactoren

| Komponente            | Zeilen | Aktion                                                     |
| --------------------- | ------ | ---------------------------------------------------------- |
| `DocumentManager.tsx` | 1991   | 32 useState -> useReducer; Upload/Liste/Filter extrahieren |
| `ClaudeCode.tsx`      | 1525   | Wizard-Steps in eigene Komponenten                         |
| `SetupWizard.tsx`     | 1281   | Steps extrahieren                                          |
| `App.tsx`             | 1111   | DashboardHome in eigene Datei                              |

### 7.3 ChatContext aufteilen

**Datei:** `apps/dashboard-frontend/src/contexts/ChatContext.tsx`
**Problem:** 25-Dependency useMemo -> jede Aenderung re-rendert alle Consumer.
**Fix:** In 3-4 kleinere Kontexte:

- `ChatJobsContext` (activeJobIds, globalQueue, cancelJob)
- `ChatModelsContext` (installedModels, loadModels, setDefault)
- `ChatFunctionsContext` (sendMessage, reconnectToJob)

### 7.4 Race Condition in reconnectToJob fixen

**Datei:** `ChatContext.tsx` (Zeilen 542-548)
**Fix:** Queue/Mutex fuer reconnect-Operationen.

### 7.5 TypeScript `any` eliminieren

**Betroffene Dateien:** `App.tsx`, `CellEditor.tsx`, `TipTapEditor.tsx`, `useModelStatus.ts`
**Fix:** `any` -> `unknown` mit Type Narrowing.

### 7.6 TypeScript strict mode verschaerfen

**Datei:** `apps/dashboard-frontend/tsconfig.json`

```json
{
  "compilerOptions": {
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### 7.7 Circular Dependencies beseitigen

**Datei:** `llmQueueService.js` (Zeilen 40-47)
**Fix:** Event-basierte Entkopplung statt Lazy-Loading.

### 7.8 Hardcoded Config-Werte zentralisieren

**Dateien:** `llmQueueService.js`, `memoryService.js`, `ragCore.js`
**Fix:** Environment-Variablen oder zentrale `config/constants.js`.

### 7.9 `eval` aus Scripts entfernen

**Dateien:** `arasul` (Zeile 156), `scripts/test/load-test.sh`, `scripts/test/stress-test.sh`
**Fix:** Direkte Command-Execution.

---

## Phase 8: Frontend-Optimierung

**Prioritaet: MITTEL | Aufwand: 2-3 Tage**

### 8.1 Vite Code Splitting

**Datei:** `apps/dashboard-frontend/vite.config.ts`

```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        if (id.includes('react-dom') || id.includes('react/')) return 'react-vendor';
        if (id.includes('recharts') || id.includes('d3-')) return 'charts-vendor';
        if (id.includes('@tiptap') || id.includes('prosemirror')) return 'editor-vendor';
        if (id.includes('lucide-react')) return 'icons-vendor';
        if (id.includes('radix-ui')) return 'ui-vendor';
        if (id.includes('node_modules')) return 'vendor';
      },
    },
  },
},
```

### 8.2 Route-basiertes Lazy Loading standardisieren

**Datei:** `App.tsx`
Alle Feature-Pages via `React.lazy` + `Suspense` laden.

### 8.3 Tailwind v4 Migration vervollstaendigen

- `bg-gradient-to-*` -> `bg-linear-to-*`
- `bg-opacity-*` -> `/opacity` Syntax
- `flex-grow`/`flex-shrink` -> `grow`/`shrink`
- Hardcoded Colors in `MermaidDiagram.tsx` -> CSS Variables

### 8.4 Offline/Cache-Strategie fuer LAN

**Problem:** Dashboard funktioniert nicht wenn Backend kurz offline (z.B. waehrend Neustart).
**Fix:** Service Worker fuer statische Assets, sodass Dashboard-Shell immer laedt. Reconnect-Banner statt weisser Seite.

### 8.5 Error Boundaries fuer alle Feature-Pages

**Problem:** Ein JS-Error in einer Komponente crashed die gesamte App.
**Fix:** `<ErrorBoundary>` um jede Route mit benutzerfreundlicher Fehlermeldung und Retry-Button.

---

## Phase 9: Testing & Coverage

**Prioritaet: MITTEL | Aufwand: 5-7 Tage**

### 9.1 Python-Service-Tests (PRIORITAET)

**Alle Python-Services haben 0 Tests.** Mindestens:

- Health-Endpoint-Tests
- Input-Validation-Tests
- Error-Handling-Tests
- GPU-Memory-Management-Tests (Embedding Service)

### 9.2 Backend-Coverage auf 50% erhoehen

**Fehlende Tests:**

| Route/Service             | Status     |
| ------------------------- | ---------- |
| `knowledge-graph.js`      | Kein Test  |
| `tailscale.js`            | Kein Test  |
| Stream Error Handling     | Ungetestet |
| Auth Cache Race Condition | Ungetestet |

### 9.3 Frontend-Coverage einfuehren (40%)

**Fehlende Tests:**

| Feature-Bereich  | Status  |
| ---------------- | ------- |
| `projects/`      | 0 Tests |
| `claude/`        | 0 Tests |
| `database/`      | 0 Tests |
| `datentabellen/` | 0 Tests |

### 9.4 Flaky Tests fixen

**Datei:** `audit.test.js` — `setTimeout`-basierte Tests.
**Fix:** `jest.useFakeTimers()`.

### 9.5 End-to-End Setup-Test

**Datei:** `scripts/test/fresh-deploy-test.sh` erweitern:

- Non-interactive Setup durchlaufen
- Docker Compose hochfahren
- Alle Health-Endpoints pruefen
- Grundfunktionen testen (Login, Chat, Document-Upload)
- Cleanup

---

## Phase 10: Produkt-Lifecycle (fuer kommerziellen Verkauf)

**Prioritaet: NIEDRIG-MITTEL | Aufwand: 5-10 Tage**

### 10.1 OTA-Update-Mechanismus

**Problem:** Kein Weg, Updates an Kundengeraete zu pushen. Sicherheitspatches, Bugfixes und Features koennen nicht nachgeliefert werden.

**Konzept:**

- Update-Manifest auf zentralem Server (JSON mit Version, Checksums, Changelog)
- Self-Healing-Agent prueft periodisch (wenn Internet vorhanden)
- Docker-Images aus privater Registry pullen
- A/B-Update: neues Image pullen, starten, Health-Check, bei Erfolg altes Image entfernen
- Rollback: bei fehlgeschlagenem Health-Check automatisch zurueck

```
# Update-Flow:
# 1. Pull neues Manifest: https://updates.arasul.de/v1/manifest.json
# 2. Vergleiche Versionen
# 3. Pull neue Images (mit Bandbreiten-Limit)
# 4. docker compose up -d --no-deps <service>
# 5. Warte auf Health-Check
# 6. Bei Fehler: Rollback auf vorheriges Image-Tag
```

### 10.2 Geraete-Registrierung / Aktivierung

**Problem:** Keine Moeglichkeit zu verifizieren, dass ein Geraet bezahlt/lizenziert ist. Kein Kopierschutz.

**Konzept:**

- Hardware-gebundener Lizenzschluessel (basierend auf Jetson Serial + MAC)
- Offline-Validierung (signierter License-Key, kein Phone-Home noetig)
- Feature-Tiers (Basic: Chat, Standard: +RAG+Dokumente, Enterprise: +Telegram+n8n)
- Grace Period bei Lizenzablauf (30 Tage Warnung, dann Read-Only-Modus)

### 10.3 Kunden-Onboarding Wizard im Dashboard

**Problem:** Nach Setup zeigt Dashboard sofort die volle Oberflaeche. Neue Kunden sind ueberfordert.

**Konzept:**

- "Willkommen bei Arasul"-Flow im Dashboard nach erstem Login
- Schritte: Passwort aendern -> KI testen -> Erstes Dokument hochladen -> Telegram verbinden (optional)
- Quick-Tour der wichtigsten Features
- Status-Seite die zeigt ob alle Dienste laufen

### 10.4 System-Diagnostics-Export

**Problem:** Wenn ein Kunde Support braucht, gibt es keinen einfachen Weg diagnostische Daten zu sammeln.

**Fix:** Dashboard-Button "Support-Paket erstellen":

```bash
# Sammelt: Service-Status, Logs (letzte 1000 Zeilen), Disk/RAM/GPU-Info,
# Docker ps, Config (ohne Secrets), Backup-Status
# Erzeugt: arasul-diagnostics-YYYYMMDD.tar.gz
```

### 10.5 GDPR-konformer Daten-Export

**Problem:** Enterprise-Kunden haben das Recht auf Datenportabilitaet.
**Fix:** Export-Funktion fuer: Chats, Dokumente, Projekte, Einstellungen als JSON/ZIP.

### 10.6 Audit-Log

**Problem:** Kein Log wer was wann gemacht hat. Fuer ISO 27001 / SOC 2 Kunden erforderlich.
**Fix:** Audit-Tabelle existiert in DB (audit_log). Sicherstellen, dass alle kritischen Aktionen geloggt werden: Login, Config-Aenderung, User-Management, Dokument-Upload/Loesch.

---

## Phase 11: Repository-Hygiene

**Prioritaet: NIEDRIG | Aufwand: 1 Tag**

### 11.1 Dateien aufraeumen

```bash
rm -f .env.bak .env.backup.* arasul.backup
rm -f config/traefik/traefik.yml.backup
rm -f data/test_document.txt
```

### 11.2 shared-python nach libs/ verschieben

**Problem:** `services/shared-python/` ist eine Library, kein Microservice.
**Fix:** Nach `libs/shared-python/` verschieben.

### 11.3 Alte Plan-Docs aufraeumen

**Problem:** `docs/archive/plans/` enthaelt 248KB alte Plaene.
**Fix:** Alte Plaene loeschen oder in separates Repo.

### 11.4 Shared Logging Library fuer Scripts

**Problem:** Log-Funktionen in 5+ Scripts dupliziert.
**Fix:** `scripts/lib/logging.sh` erstellen und ueberall sourcen.

### 11.5 Test-Script-Permissions fixen

```bash
chmod 755 scripts/test/setup/interactive-setup.test.sh
chmod 755 scripts/test/setup/detect-jetson.test.sh
```

---

## Priorisierte Umsetzungsreihenfolge

```
Woche 1:   Phase 0 (Showstopper) + Phase 1 (Kritische Fixes)
           -> Hardware-Watchdog, Boot-Loop-Schutz, NVMe-Monitoring
           -> SQL Injection, Backup-Bug, trust proxy, Image pinning

Woche 2:   Phase 2 (Backend-Hardening)
           -> V8 Heap-Limit, Event Loop Monitoring, Pool maxUses
           -> stop_grace_period, SSE Keepalive, Request Timeout

Woche 3:   Phase 3 (PostgreSQL) + Phase 4 (Backup/DR)
           -> WAL-Archivierung, pg_stat_statements
           -> Backup-Verschluesselung, Config-Backup, Restore vervollstaendigen

Woche 4:   Phase 5 (Docker) + Phase 6 (Self-Healing)
           -> Docker Pruning, pids_limit
           -> Cert-Monitoring, Memory-Trends, External Heartbeat

Woche 5-6: Phase 7 (Code-Qualitaet)
           -> Telegram-Services aufteilen, ChatContext splitten
           -> TypeScript strict, eval entfernen

Woche 7:   Phase 8 (Frontend)
           -> Code Splitting, Lazy Loading, Error Boundaries
           -> Offline-Cache, Tailwind v4 fertigstellen

Woche 8-9: Phase 9 (Testing)
           -> Python-Tests, Backend 50%, Frontend 40%
           -> E2E Setup-Test

Woche 10:  Phase 10 (Produkt-Lifecycle, soweit gewuenscht)
           -> OTA-Update-Konzept, Diagnostics-Export
           -> Onboarding Wizard, Audit-Log vervollstaendigen

Woche 11:  Phase 11 (Hygiene) + Stabilisierung
           -> Cleanup, Regressionstests, Release
```

---

## Kritische Luecken vs. Bestehender Plan (Delta-Analyse)

Was dieser Plan NEU hinzufuegt gegenueber dem vorherigen:

| Thema                    | Vorher           | Jetzt                                      |
| ------------------------ | ---------------- | ------------------------------------------ |
| Hardware-Watchdog        | Erwaehnt         | Konkretes Setup mit Tegra WDT              |
| Boot-Loop-Schutz         | Erwaehnt         | Systemd-Service mit Recovery-Mode          |
| NVMe/SSD-Monitoring      | Erwaehnt         | SMART-Integration in Metrics Collector     |
| Kernel-Tuning            | Nicht vorhanden  | `sysctl.d/99-arasul.conf` mit allen Werten |
| Filesystem-Schutz        | Nicht vorhanden  | noatime, fsck, commit=60                   |
| NTP-Offline-Resilienz    | Nicht vorhanden  | Chrony mit makestep                        |
| TLS-Cert-Langzeit        | Nicht vorhanden  | 10-Jahre-Cert + Auto-Renewal               |
| V8 Heap-Limit            | Nicht vorhanden  | `--max-old-space-size=512`                 |
| Event Loop Monitoring    | Nicht vorhanden  | `monitorEventLoopDelay()`                  |
| Pool maxLifetimeMillis   | Nicht vorhanden  | 30min Connection-Recycling                 |
| trust proxy Security     | Nicht vorhanden  | `1` statt `true`                           |
| Image Pinning            | Nicht vorhanden  | docker-socket-proxy Version pinnen         |
| SSE Keepalive            | Nicht vorhanden  | 15s Heartbeat gegen Proxy-Timeout          |
| WebSocket Backpressure   | Nicht vorhanden  | bufferedAmount Check                       |
| Request Timeout          | Nicht vorhanden  | 60s Overall-Timeout                        |
| stop_grace_period        | Nur GPU-Services | Backend + GPU-Services                     |
| WAL-Archivierung         | Nicht vorhanden  | archive_mode=on, PITR ermoeglicht          |
| pg_stat_statements       | Nicht vorhanden  | Query-Performance-Analyse                  |
| Backup-Verschluesselung  | Nicht vorhanden  | GPG symmetric                              |
| Config-Backup            | Nicht vorhanden  | .env, Certs, Secrets sichern               |
| USB-Backup               | Nicht vorhanden  | Offsite-Backup auf USB                     |
| Restore vervollstaendigt | Nicht vorhanden  | Qdrant + n8n + Config Restore              |
| Docker Pruning           | Nicht vorhanden  | Automatisch alle 30 Tage                   |
| pids_limit               | Nicht vorhanden  | Fork-Bomb-Schutz                           |
| Cert-Expiry-Monitoring   | Nicht vorhanden  | Self-Healing prueft TLS-Ablauf             |
| Memory-Trend-Analyse     | Nicht vorhanden  | 7-Tage-Trend per Container                 |
| External Heartbeat       | Nicht vorhanden  | Optionaler Uptime-Ping                     |
| Docker data mgmt         | Nicht vorhanden  | /var/lib/docker Monitoring                 |
| OTA-Update-Konzept       | Nicht vorhanden  | Manifest-basiert mit Rollback              |
| Geraete-Lizenzierung     | Nicht vorhanden  | Hardware-gebundener Key                    |
| Onboarding Wizard        | Nicht vorhanden  | First-Login-Flow                           |
| Diagnostics-Export       | Nicht vorhanden  | Support-Paket-Button                       |
| GDPR-Export              | Nicht vorhanden  | Daten-Export als ZIP                       |
| Error Boundaries         | Nicht vorhanden  | Je Feature-Page                            |
| Offline/Cache SPA        | Nicht vorhanden  | Service Worker fuer Dashboard-Shell        |

---

## Anhang: Referenz-Produkte und Best Practices

| Thema                      | Quelle                                     |
| -------------------------- | ------------------------------------------ |
| A/B OTA Updates            | Balena.io, NVIDIA Fleet Command, Mender.io |
| Hardware Watchdog          | Linux Kernel Docs, Tegra WDT Driver        |
| Filesystem Protection      | Overlayroot (Ubuntu), dm-verity            |
| PostgreSQL Embedded        | Crunchy Data Edge, PGTune                  |
| Docker Edge Best Practices | Balena Engine, Docker Edge Docs            |
| Self-Healing Patterns      | Azure IoT Edge Runtime, AWS Greengrass     |
| Product Lifecycle          | Home Assistant, Umbrel, CasaOS             |
| Security                   | OWASP IoT Top 10, CIS Docker Benchmark     |

---

> Dieser Plan ist das Ergebnis von 32 Analyse-Durchlaeufen und Internet-Recherche gegen reale Wettbewerber.
> Priorisierung: Erst Stabilitaet (Phase 0-4), dann Qualitaet (Phase 5-9), dann Features (Phase 10-11).
