> **Archived 2026-07-02** — superseded by docs/plans/active/FIELD_1.0.0_MASTER_PLAN.md. 62/62 Punkte erledigt; offene Live-Zustellung in FIELD_1.0.0_MASTER_PLAN Phase 1 uebernommen.
> Kept for historical reference; do not act on its contents.

---

# Arasul Platform — Vollständiger Audit & Verbesserungsplan (2026-06-03)

> **Erstellt:** 2026-06-03 via 15-Agenten-Parallel-Audit (16 Agents, 656 Tool-Calls, ~1M Tokens)

## Executive Summary

Die Plattform ist architektonisch solide und betriebsbereit, aber 15 parallele Audits haben eine erhebliche technische Schuld offenbart, die sich über mehrere Schichten akkumuliert hat. Die kritischsten Probleme sind: (1) eine Sicherheitslücke im SQL-Execution-Endpoint (`/query/sql`) ohne Rate-Limit und ohne Admin-Guard, der `COPY`/`pg_read_file`-Befehle nicht blockt; (2) ein fehlender `telegram_user_chats`-Table, der die GDPR-Löschroute zum Runtime-Crash bringt; (3) ein kaputter `run-tests.sh` (`PROJECT_ROOT` zeigt auf `scripts/` statt Repo-Root), sodass `make test` seit Wochen silent fehlschlägt; (4) sieben ⚠️-Einträge im Memory, die Warnungen vor bereits auf main gelangten Features zeigen und den Entwickler bei jeder Session falsch orientieren. Der Self-Healing-Agent und die Backup-Infrastruktur sind außergewöhnlich gut, aber ein fehlender externer Dead-Man's-Switch und ein schwacher Backup-Healthcheck gefährden den 5-Jahres-Autonomie-Anspruch.

---

## Sofort-Aktionen (P0 — Kritische Bugs / Sicherheit)

### P0-1: SQL-Execution ohne Rate-Limit und COPY/pg_read_file in Blocklist

**Problem:** `POST /api/v1/datentabellen/query/sql` und `/query/natural` haben kein Rate-Limit. Authentifizierte (nicht-Admin-)User können beliebige SELECT-Queries abfeuern, und `COPY (SELECT ...) TO '/tmp/dump.csv'` sowie `SELECT pg_read_file('/etc/passwd')` sind nicht in der Blocklist.

**Betroffene Dateien:**

- `apps/dashboard-backend/src/services/context/llmDataAccessService.js` Zeilen 447–469 (`DANGEROUS_SQL_KEYWORDS`)
- `apps/dashboard-backend/src/routes/datentabellen/index.js` Zeilen 226, 270

**Fix:**

1. In `llmDataAccessService.js` die `DANGEROUS_SQL_KEYWORDS`-Konstante erweitern:
   ```js
   ('copy', 'pg_read_file', 'pg_ls_dir', 'pg_write_file', 'lo_import', 'lo_export', 'pg_execute');
   ```
2. In `datentabellen/index.js` Zeile 270 (`/query/sql`) `requireAdmin` als Middleware vor den Handler setzen:
   ```js
   router.post('/query/sql', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
   ```
3. Beide Endpunkte mit `llmLimiter` belegen (der bereits für LLM-Routes existiert):
   ```js
   router.post('/query/sql', llmLimiter, requireAuth, requireAdmin, ...)
   router.post('/query/natural', llmLimiter, requireAuth, ...)
   ```

- [x] Erledigt

---

### P0-2: IDOR auf LLM-Jobs — fehlender User-Ownership-Check

**Problem:** `routes/llm.js` Zeilen 194–409 — Job-Status und Job-Cancel prüfen nicht, ob `job.user_id === req.user.id`. Jeder authentifizierte User kann Jobs anderer User abfragen und abbrechen.

**Betroffene Dateien:**

- `apps/dashboard-backend/src/routes/llm.js` ca. Zeilen 194, 230, 280, 350

**Fix:** Nach dem DB-Fetch jedes Jobs die Ownership-Prüfung einbauen:

```js
const job = await llmJobService.getJob(jobId);
if (!job) throw new NotFoundError('Job not found');
if (job.user_id !== req.user.id && !req.user.isAdmin) throw new ForbiddenError('Access denied');
```

- [x] Erledigt

---

### P0-3: Webhook-Timing-Attack — `!==` statt `crypto.timingSafeEqual`

**Problem:** `apps/dashboard-backend/src/routes/external/events.js` Zeilen 245 und 282 vergleichen HMAC-Signaturen mit `!==` statt `crypto.timingSafeEqual`, was Timing-Angriffe auf den Webhook-Secret ermöglicht.

**Betroffene Dateien:**

- `apps/dashboard-backend/src/routes/external/events.js` Zeilen 245, 282

**Fix:**

```js
const sigBuf = Buffer.from(signature);
const expBuf = Buffer.from(expectedSig);
if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
  throw new UnauthorizedError('Invalid webhook signature');
}
```

- [x] Erledigt

---

### P0-4: `telegram_user_chats`-Tabelle fehlt — Runtime-Crash bei GDPR-Löschung

**Problem:** `092_telegram_dsgvo.sql` referenziert `ALTER TABLE telegram_user_chats`, die Tabelle existiert nicht (es gibt nur `telegram_bot_chats` aus Mig 032). `apps/dashboard-backend/src/routes/telegram/telegramCommandHandlers.js` Zeilen 244 und 284 querien `telegram_user_chats` direkt und crashen zur Laufzeit.

**Betroffene Dateien:**

- `services/postgres/init/092_telegram_dsgvo.sql`
- `apps/dashboard-backend/src/routes/telegram/telegramCommandHandlers.js` Zeilen 244, 284

**Fix:** Migration `095_fix_telegram_user_chats.sql` erstellen:

```sql
CREATE TABLE IF NOT EXISTS telegram_user_chats (
  id BIGSERIAL PRIMARY KEY,
  bot_id INTEGER NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL,
  user_id BIGINT,
  telegram_user_id_hash TEXT,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(bot_id, chat_id)
);
CREATE INDEX IF NOT EXISTS idx_telegram_user_chats_bot_id ON telegram_user_chats(bot_id);
CREATE INDEX IF NOT EXISTS idx_telegram_user_chats_chat_id ON telegram_user_chats(chat_id);
```

- [x] Erledigt

---

### P0-5: `/api/metrics/live` und `/api/metrics/history` ohne Auth — Hardware-Telemetrie exponiert

**Problem:** `apps/dashboard-backend/src/routes/system/metrics.js` hat kein `requireAuth` auf `GET /metrics/live` und `GET /metrics/history`. Jeder LAN-Client kann CPU/RAM/GPU/Temperatur-Echtdaten abrufen.

**Betroffene Datei:**

- `apps/dashboard-backend/src/routes/system/metrics.js` (Datei-Anfang, Router-Definition)

**Fix:**

```js
const { requireAuth } = require('../middleware/auth');
router.use(requireAuth);
```

- [x] Erledigt

---

### P0-6: `run-tests.sh` PROJECT_ROOT-Bug — `make test` schlägt seit Wochen silent fehl

**Problem:** `scripts/test/run-tests.sh` berechnet `PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"`, was `/path/arasul-jet/scripts` ergibt statt `/path/arasul-jet`. Alle `cd apps/dashboard-backend`-Aufrufe schlagen fehl. `make test` ist effektiv kaputt.

**Betroffene Datei:**

- `scripts/test/run-tests.sh` Zeile ~5

**Fix:**

```bash
# Vorher:
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
# Nachher:
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
```

- [x] Erledigt

---

### P0-7: `/api/rag/fix-space-ids` ohne Admin-Guard

**Problem:** `apps/dashboard-backend/src/routes/rag.js` Zeile 576–671 — `POST /fix-space-ids` ist eine destruktive Daten-Migrations-Operation, aber es fehlt `requireAdmin`.

**Betroffene Datei:**

- `apps/dashboard-backend/src/routes/rag.js` Zeile 576

**Fix:**

```js
router.post('/fix-space-ids', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
```

- [x] Erledigt

---

### P0-8: Dead/Broken Links im Frontend

**Problem 1:** `apps/dashboard-backend/src/services/telegram/telegramIntegrationService.js` Zeile 727 setzt `customPageRoute: '/telegram-app'` — Route existiert nicht. Korrekte Route ist `/telegram-bot`.

**Fix:**

- `telegramIntegrationService.js` Zeile 727: `'/telegram-app'` → `'/telegram-bot'`

**Problem 2:** `apps/dashboard-frontend/src/features/dashboard/SystemHealthWidget.tsx` Zeilen 160 und 213 verlinken auf `/settings/backup` und `/settings/alerts` — beide Routes existieren nicht.

**Fix:**

- Zeile 160: `<Link to="/settings/backup">` → `<Link to="/settings?tab=selfhealing">`
- Zeile 213: `<Link to="/settings/alerts">` → `<Link to="/settings?tab=selfhealing">`

- [x] Erledigt

---

### P0-9: n8n Routing-Bug — `N8N_EDITOR_BASE_URL` Default `/n8n` bricht Post-Login-Redirect

**Problem:** `compose/compose.app.yaml` Zeile 174: `N8N_EDITOR_BASE_URL: ${N8N_EXTERNAL_URL:-/n8n}` — wenn `N8N_EXTERNAL_URL` nicht gesetzt ist, konstruiert n8n intern `http://localhost:5678/n8n/` für Redirects, was im Browser nicht erreichbar ist.

**Betroffene Dateien:**

- `compose/compose.app.yaml` Zeile 174
- `compose/compose.app.yaml` Zeile 268 (totes Traefik-Label)
- `scripts/interactive_setup.sh` Zeile 629

**Fix 1** (`compose.app.yaml` Zeile 174):

```yaml
N8N_EDITOR_BASE_URL: ${N8N_EXTERNAL_URL:?N8N_EXTERNAL_URL must be set to https://<host>/n8n}
```

Alternativ: Im Setup-Script `N8N_EXTERNAL_URL` automatisch aus der Device-IP berechnen.

**Fix 2** (`compose.app.yaml` Zeile 268): Totes Label entfernen/deaktivieren:

```yaml
labels:
  - 'traefik.enable=false'
```

**Fix 3** (`interactive_setup.sh` Zeile 629): `N8N_HOST=localhost` → `N8N_HOST=n8n`

- [x] Erledigt

---

### P0-10: `package-lock.json` nach multer-Bump regenerieren

**Problem:** Nach dem multer `^2.0.0`-Bump wurde `package-lock.json` nicht regeneriert. Auf air-gapped Jetson führt `npm ci` zu einem Fehler.

**Fix:**

```bash
cd apps/dashboard-backend && npm install && git add package-lock.json
```

- [x] Erledigt

---

## Kurzfristig (P1 — Diese Woche)

### P1-1: Branch-Protection auf `main` einrichten

**Fix:**

```bash
gh api repos/koljaschoepe/arasul-jet/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["CI Summary"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews=null \
  --field restrictions=null
```

- [x] Erledigt

---

### P1-2: VACUUM FREEZE außerhalb Transaction im Self-Healing-Agent

**Problem:** `services/self-healing-agent/healing_engine.py` Zeile 452 — `VACUUM FREEZE` innerhalb einer Transaktion → PostgreSQL wirft Fehler. XID-Wraparound-Schutz für 5-Jahres-Betrieb defekt.

**Fix:** Eigene Verbindung mit `autocommit=True`:

```python
conn = psycopg2.connect(self.db_url)
conn.autocommit = True
with conn.cursor() as cur:
    cur.execute("VACUUM FREEZE")
conn.close()
```

- [x] Erledigt

---

### P1-3: TLS-Cert-Overwrite-Guard — kein Auto-Renewal bei fremden CA-Certs

**Problem:** `services/self-healing-agent/healing_engine.py` Zeile 508 — überschreibt auch CA-signierte Zertifikate.

**Fix:** Vor Renewal Issuer == Subject prüfen:

```python
from cryptography import x509
cert = x509.load_pem_x509_certificate(cert_data)
if cert.issuer != cert.subject:
    self.logger.warning("TLS cert issued by external CA, skipping auto-renewal")
    return
```

- [x] Erledigt

---

### P1-4: Circuit-Breaker für reguläre LLM/RAG-Paths verdrahten

**Problem:** CB wird nur im OpenAI-Compat-Pfad aufgerufen. `llmOllamaStream.js` und `ragCore.js` gehen direkt an Ollama ohne CB-Schutz.

**Betroffene Dateien:**

- `apps/dashboard-backend/src/services/llm/llmOllamaStream.js`
- `apps/dashboard-backend/src/services/rag/ragCore.js`
- `apps/dashboard-backend/src/services/embedding/embeddingService.js`

**Fix:** Axios/fetch-Call in `circuitBreakers.get('ollama').execute(async () => { ... })` wrappen.

- [x] Erledigt

---

### P1-5: Indexer Poison-Doc-Loop — retry_count Cap ausgehebelt

**Problem:** `services/document-indexer/database.py` Zeilen 330–343 — `recover_stuck_processing()` setzt `status = 'pending'` ohne retry_count-Prüfung.

**Fix:**

```sql
UPDATE documents
SET status = CASE WHEN retry_count >= 5 THEN 'failed' ELSE 'pending' END,
    updated_at = NOW()
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '30 minutes'
```

- [x] Erledigt

---

### P1-6: Embedding-Service Thread-Safety — `model.encode()` ohne Lock

**Problem:** `services/embedding-service/embedding_server.py` — 4 Gunicorn-Threads teilen globale Modelle ohne Lock. Kann CUDA-Fehler produzieren.

**Fix:**

```python
import threading
_encode_lock = threading.Lock()

with _encode_lock:
    embeddings = model.encode(texts, ...)
```

- [x] Erledigt

---

### P1-7: n8n Editor ohne Traefik forward-auth

**Problem:** `config/traefik/dynamic/routes.yml` — n8n-Router hat kein `forward-auth`. n8n ist für jeden mit Netzwerkzugang erreichbar.

**Fix:**

```yaml
n8n-router:
  rule: 'PathPrefix(`/n8n`)'
  middlewares:
    - forward-auth@file
    - strip-n8n-prefix@file
  service: n8n-service
```

- [x] Erledigt

---

### P1-8: `externalApi.js` — INSERT ohne `project_id` → NOT-NULL-Violation

**Betroffene Datei:** `apps/dashboard-backend/src/routes/external/externalApi.js` Zeilen 113, 491, 621

**Fix:** `project_id` aus Request-Kontext ergänzen oder Migration `096_nullable_external_api_project_id.sql`.

- [x] Erledigt

---

### P1-9: Stale Migrations-Beispiel in DEVELOPMENT.md

**Datei:** `docs/development/DEVELOPMENT.md` Zeile 389 — `093_name.sql` → `095_name.sql`

- [x] Erledigt

---

### P1-10: Raw-Throw in `telegram/settings.js`

**Datei:** `apps/dashboard-backend/src/routes/telegram/settings.js` Zeilen 289, 524

**Fix:**

```js
throw new ServiceUnavailableError(
  `Telegram API unreachable: ${axiosError.message}`,
  'TELEGRAM_UNAVAILABLE'
);
```

- [x] Erledigt

---

### P1-11: Raw-Rethrows in `system/services.js`

**Datei:** `apps/dashboard-backend/src/routes/system/services.js` Zeilen 183, 232, 317, 346

**Fix:** `throw error` → `throw new ServiceUnavailableError(error.message, 'SERVICE_ERROR')`

- [x] Erledigt

---

### P1-12: CORS `.local`-Regex zu breit

**Datei:** `apps/dashboard-backend/src/index.js` Zeile 143

**Fix:**

```js
// Vorher: /\.local(:\d+)?$/.test(origin)
// Nachher:
/^https?:\/\/[a-zA-Z0-9-]+\.local(:\d+)?$/.test(origin);
```

- [x] Erledigt

---

### P1-13: Audit-Log Fallback `'admin'` forensisch irreführend

**Datei:** `apps/dashboard-backend/src/routes/documents.js` Zeilen 230, 631, 699

**Fix:** `req.user?.username || 'admin'` → `req.user?.username || req.user?.id || 'unknown'`

- [x] Erledigt

---

### P1-14: Backup-Service Healthcheck zu schwach

**Datei:** `compose/compose.monitoring.yaml`

**Fix:** Healthcheck prüft ob letztes Backup erfolgreich + < 25h alt:

```yaml
healthcheck:
  test:
    [
      'CMD',
      'sh',
      '-c',
      'pgrep crond > /dev/null && test -f /backup/backup_report.json && python3 -c "import json,sys,time; r=json.load(open(''/backup/backup_report.json'')); sys.exit(0 if r.get(''status'')==''success'' and time.time()-r.get(''timestamp'',0)<90000 else 1)"',
    ]
  interval: 5m
  timeout: 10s
  retries: 2
```

- [x] Erledigt

---

### P1-15: Backup-Service docker.sock direkter Mount statt docker-proxy

**Datei:** `compose/compose.monitoring.yaml` Zeile 155

**Fix:** Socket-Mount entfernen, `DOCKER_HOST: tcp://docker-proxy:2375` als Env-Var setzen.

- [x] Erledigt

---

### P1-16: logrotate nicht automatisch installiert

**Datei:** `scripts/interactive_setup.sh`

**Fix:**

```bash
if [ -f "config/logrotate.d/arasul" ]; then
  sudo cp config/logrotate.d/arasul /etc/logrotate.d/arasul
  sudo chmod 644 /etc/logrotate.d/arasul
fi
```

- [x] Erledigt

---

### P1-17: API_ERRORS.md — Error-Envelope-Format falsch dokumentiert

**Datei:** `docs/api/API_ERRORS.md`

**Fix:** Envelope-Beispiel korrigieren auf `{ "error": { "code": "...", "message": "..." }, "timestamp": "..." }` + `TOKEN_EXPIRED`, `INVALID_TOKEN`, `TOKEN_REVOKED` als eigene Abschnitte.

- [x] Erledigt

---

### P1-18: ENVIRONMENT_VARIABLES.md — 4 fehlende Variablen

Fehlend in `docs/ENVIRONMENT_VARIABLES.md`:

- `EXTERNAL_BACKUP_PATH`
- `BACKUP_REPORT_PATH`
- `SELF_HEALING_WEBHOOK_SECRET`
- `COMPOSE_PROJECT_DIR`

- [x] Erledigt

---

### P1-19: `/docs`-Route fehlt in `API_ROUTE_GROUPS`

**Datei:** `apps/dashboard-backend/src/routes/index.js` ca. Zeile 35

**Fix:**

```js
{ prefix: '/docs', group: 'core', description: 'Static API documentation' },
```

- [x] Erledigt

---

## Mittelfristig (P2 — Nächste Wochen)

### P2-1: 8 Route-Gruppen fehlen in `API_REFERENCE.md`

Fehlen vollständig: `/api/tailscale` (5), `/api/license` (4), `/api/gdpr` (3), `/api/backup` (3), `/api/ops` (1), `/api/memory` (12), `/api/knowledge-graph` (8), `/api/sandbox` (11). Plus 3 Auth-Endpoints.

- [x] Erledigt

---

### P2-2: AuthContext Critical-Bugs (Frontend)

- `checkAuth` ohne AbortController → Race bei schnellem Unmount (`AuthContext.tsx` Zeilen 64, 131)
- Network-Error vs. 401 nicht unterschieden
- Password-Change ohne JWT-Blacklist (Token bleibt gültig nach PW-Änderung)

- [x] Erledigt

---

### P2-3: `useWebSocketMetrics` HTTP-Fallback ohne Auth-Interceptor

**Datei:** `apps/dashboard-frontend/src/hooks/useWebSocketMetrics.ts` Zeile 71

**Fix:** `fetch(/metrics/live)` → `callApi('/api/metrics/live')` via `useApi`

- [x] Erledigt

---

### P2-4: Chat-Bugs (Frontend)

- Error-Event löscht Placeholder nicht → orphan Placeholder
- Retry dupliziert Messages
- `useTokenBatching` kein Unmount-Cleanup
- Race in `ChatView` init (mehrfache parallele `loadChat()`-Calls)

**Betroffene Dateien:** `src/features/chat/ChatView.tsx`, `src/hooks/useTokenBatching.ts`

- [x] Erledigt

---

### P2-5: `chats.js` Route — null Unit-Tests für Kern-Feature

12 Endpoints, kein einziger Test. `apps/dashboard-backend/__tests__/unit/chats.test.js` erstellen.

- [x] Erledigt

---

### P2-6: Telegram-Route-Layer komplett untestet

`telegram/app.js` (~15 Endpoints) + `telegram/bots.js` (~13 Endpoints) → Tests erstellen.

- [x] Erledigt

---

### P2-7: `temperature || 0.7` statt `temperature ?? 0.7`

`temperature=0` (deterministisch) wird überschrieben. Alle Vorkommen fixen.

- [x] Erledigt

---

### P2-8: EmbeddingClient ohne Session-Reuse

**Datei:** `services/document-indexer/embedding_client.py` — `requests.Session()` mit HTTPAdapter für Connection-Pooling.

- [x] Erledigt

---

### P2-9: pids-Limits für Monitoring-Services fehlen

**Datei:** `compose/compose.monitoring.yaml` — metrics-collector, self-healing-agent, backup-service, loki, promtail brauchen `deploy.resources.limits.pids: 100`.

- [x] Erledigt

---

### P2-10: `STAGE2_VRAM_FLOOR_MB` nicht in compose.ai.yaml konfiguriert

**Fix:** `STAGE2_VRAM_FLOOR_MB=4096` in `compose/compose.ai.yaml` für Jetson Orin 32GB.

- [x] Erledigt

---

### P2-11: WS/SSE-Resilience — Reconnect-Storm + Download-Resume

- WebSocket-Clients ohne Jitter beim Reconnect → alle verbinden gleichzeitig bei Server-Restart
- Download-SSE-Resume: 70-GB-Download startet bei Verbindungsabbruch neu

- [x] Erledigt

---

### P2-12: TypeScript `any`-Typen bereinigen

- `SlashCommands.tsx` Zeile 17/134: `editor: any`/`range: any` → `Editor`/`Range` aus `@tiptap/core`
- `CreateDocumentDialog.tsx` Zeile 18: `document: any` → konkreter Typ
- `CreateDocumentDialog.tsx` Zeile 103: `catch (err: any)` → `catch (err: unknown)`
- `GridEditor/FieldTypes.ts` Zeilen 50, 90, 124: `value: any` → `value: unknown`

- [x] Erledigt

---

### P2-13: Settings-Tab-Switch ohne Unsaved-Changes-Warning

**Datei:** `apps/dashboard-frontend/src/features/settings/Settings.tsx` Zeile 92 — TODO implementieren.

- [x] Erledigt

---

### P2-14: Backend CLAUDE.md Route-Gruppen unvollständig

`apps/dashboard-backend/CLAUDE.md` — `sandbox` und `datentabellen` zu Group-Choice hinzufügen.

- [x] Erledigt

---

## Pläne-Housekeeping

### Sofort archivieren:

- [x] `active/repo-audit-sanierung.md` → `archive/2026-05-07_repo-audit-sanierung.md` (alle 22 Phasen auf main, Commits 1d66830..ebd7bfe)
- [x] `active/regressed-features.md` → `archive/2026-05-08_regressed-features-inventory.md` (abgelöst durch side-branch-cherry-pick-Plan)

### Status-Kommentar ergänzen (aktiv lassen):

- [x] `active/repo-deep-audit-2026-05-08.md` — Status-Header einfügen: F1/F4/SF-2 offen, F2/F3 deferred
- [x] `active/EXTERNAL_INTEGRATIONS.md` — Status-Header: Phase 5b + 6.5 deferred
- [x] `active/DEPENDABOT_HARDENING.md` — aktiv lassen (AC3 als P1-1 adressiert)
- [x] `active/side-branch-cherry-pick-2026-05-14.md` — in MEMORY.md aufnehmen

### Fehlende Archived-Banner:

- [x] `archive/2026-05-13_llm-rag-store-routing-optimization.md` — Banner am Dateianfang einfügen
- [x] `archive/TELEGRAM_SYSTEM_MONITOR_PRD.md` → umbenennen + Banner

---

## Memory-Bereinigung

- [x] 7x `⚠️ NICHT auf main` → `✅ auf main via ...` (Mig 083, modelKeys, useEvictionWatcher, openaiCompat, gdpr, Ollama-CB, Mig 085)
- [x] Zeile 25 MEMORY.md: KRITISCH-Warnung zu regressed-features.md entfernen
- [x] phase4-8-indexer-watchdog.md: retry-exhausted→failed als NICHT implementiert markieren (→ P1-5)
- [x] side-branch-cherry-pick-2026-05-14.md in MEMORY.md aufnehmen
- [x] gemma4*default_migration.md: veraltete `065*\*.sql`-Referenz auf `095` aktualisieren

---

## CLAUDE.md Updates

- [x] Root `CLAUDE.md`: `latest applied: 094, next: 095_*.sql` (nach Migration 095)
- [x] `services/postgres/CLAUDE.md`: Migrationsbeispiel auf 095 aktualisieren
- [x] `apps/dashboard-backend/CLAUDE.md`: Route-Gruppen um `sandbox | datentabellen` erweitern
- [x] `apps/dashboard-backend/package.json`: `engines.node` auf `>=22.0.0` anheben
- [x] `apps/dashboard-frontend/CLAUDE.md`: Playwright-Installationshinweis ergänzen
- [x] Root + Backend CLAUDE.md: `side-branch-cherry-pick-2026-05-14.md` als aktiven Plan vermerken
