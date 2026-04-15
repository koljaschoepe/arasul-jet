# Arasul Production Hardening Plan

> Ergebnis der 20-Agent-Tiefenanalyse vom 15. April 2026
> Ziel: Jedes Feature funktioniert, jeder Workflow ist durchdacht, System skaliert auf neue Jetson-Geraete

---

## Zusammenfassung

| Severity | Anzahl | Beschreibung                             |
| -------- | ------ | ---------------------------------------- |
| CRITICAL | 18     | Muss vor Produktiveinsatz gefixt werden  |
| HIGH     | 24     | Sollte im naechsten Sprint gefixt werden |
| MEDIUM   | 40+    | Naechste 4 Wochen                        |
| LOW      | 20+    | Nice-to-have                             |

**Hauptblocker fuer Produktiveinsatz:**

1. Sandbox hat KEINE User-Isolation (jeder sieht alles)
2. Migration 071 bricht Fresh-Install ab
3. Docker-Secrets werden als Klartext-Env-Vars uebergeben
4. Kein GPU-OOM-Recovery
5. 5-Jahres-Ziel unerreichbar ohne Offsite-Backups und Cert-Renewal

---

## Phase 1: Sicherheitskritische Fixes (Woche 1)

### 1.1 Sandbox User-Isolation [CRITICAL]

**Problem:** Jeder authentifizierte User sieht ALLE Sandbox-Projekte und kann fremde Container starten.

**Dateien:**

- `services/postgres/init/075_sandbox_user_isolation.sql` (neue Migration)
- `apps/dashboard-backend/src/services/sandbox/sandboxService.js`
- `apps/dashboard-backend/src/routes/sandbox.js`

**Aenderungen:**

1. Migration: `ALTER TABLE sandbox_projects ADD COLUMN user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE;`
2. Alle Service-Funktionen: WHERE-Clause um `AND user_id = $userId` erweitern
3. Routes: `req.user.id` an Service-Funktionen uebergeben
4. Frontend: Filtert automatisch (Backend gibt nur eigene Projekte zurueck)

### 1.2 Docker CLI aus Sandbox-Image entfernen [CRITICAL]

**Problem:** Sandbox-Container haben docker-ce-cli installiert + User in Docker-Gruppe. Container-Escape moeglich.

**Dateien:**

- `services/sandbox/Dockerfile` (Zeile 44-49, 58-60)

**Aenderungen:**

1. `docker-ce-cli` aus apt-get install entfernen
2. `groupadd docker` / `usermod -aG docker` entfernen
3. `group_add: ['994']` aus compose.app.yaml entfernen (wenn nur fuer Sandbox)

### 1.3 Sandbox Netzwerk-Isolation [HIGH]

**Problem:** Default network_mode ist 'internal' = Backend-Netzwerk. Sandbox kann Postgres, Qdrant, LLM direkt ansprechen.

**Dateien:**

- `apps/dashboard-backend/src/services/sandbox/sandboxService.js` (Zeile 406, 111)

**Aenderungen:**

1. Default von `'internal'` auf `'bridge'` aendern (isoliertes Netzwerk)
2. `'internal'` nur mit expliziter Admin-Berechtigung ermoeglichen

### 1.4 Sandbox Container-Hardening [HIGH]

**Dateien:**

- `apps/dashboard-backend/src/services/sandbox/sandboxService.js` (Zeile 421)

**Aenderungen:**

```javascript
HostConfig: {
  CapDrop: ['ALL'],
  CapAdd: ['NET_BIND_SERVICE'],
  ReadonlyRootfs: false, // Workspace braucht Schreibzugriff
  SecurityOpt: ['no-new-privileges:true'],
  Tmpfs: { '/tmp': 'noexec,nosuid,size=256M' },
  PidsLimit: 128,
  // Disk-Quota ueber Overlay2 oder Volume-Limits
}
```

### 1.5 Store Container-Hardening [CRITICAL]

**Problem:** App-Container haben keine SecurityOpt, kein CapDrop, kein ReadOnly. Path-Traversal in Bind-Mounts moeglich.

**Dateien:**

- `apps/dashboard-backend/src/services/app/containerService.js` (Zeile 465-540)

**Aenderungen:**

1. `CapDrop: ['ALL']` + selektive `CapAdd` in `buildContainerConfig()`
2. `SecurityOpt: ['no-new-privileges:true']`
3. Path-Validation vor Bind-Mounts: `resolvedPath.startsWith(projectDir)`

---

## Phase 2: Datenbank & Fresh-Install Fixes (Woche 1)

### 2.1 Migration 071 fixen [CRITICAL]

**Problem:** INSERT nutzt nicht existierende Spalten `description` und `executed_at`. Fresh-Install bricht ab.

**Datei:** `services/postgres/init/071_missing_indexes_and_fk_cascades.sql` (Zeile 35-37)

**Fix:**

```sql
-- ALT (FALSCH):
INSERT INTO schema_migrations (version, filename, description, executed_at) ...
-- NEU (RICHTIG):
INSERT INTO schema_migrations (version, filename, applied_at, execution_ms, success)
VALUES (71, '071_missing_indexes_and_fk_cascades.sql', NOW(), 0, true)
ON CONFLICT (version) DO NOTHING;
```

### 2.2 Sandbox User-Isolation Migration [CRITICAL]

**Neue Datei:** `services/postgres/init/075_sandbox_user_isolation.sql`

```sql
ALTER TABLE sandbox_projects ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_sandbox_projects_user_id ON sandbox_projects(user_id);
```

---

## Phase 3: Docker Secrets & Konfiguration (Woche 1-2)

### 3.1 Secrets als Docker Secrets statt Env-Vars [CRITICAL]

**Problem:** POSTGRES_PASSWORD wird als Klartext-Env-Var an AI/Monitoring-Services uebergeben. Sichtbar via `docker inspect`.

**Dateien:**

- `compose/compose.ai.yaml` (Zeile 170-173, 184)
- `compose/compose.monitoring.yaml` (Zeile 32, 142-146)

**Aenderungen:**

1. Alle `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}` ersetzen durch `_FILE`-Pattern
2. Services muessen Secret-Resolver nutzen oder Python-Wrapper

### 3.2 n8n Secrets-Integration [CRITICAL]

**Problem:** N8N_ENCRYPTION_KEY nicht als Docker Secret gemountet. N8N_WEBHOOK_SECRET wird nie generiert.

**Dateien:**

- `compose/compose.app.yaml` (n8n Service-Block)
- `compose/compose.secrets.yaml`
- `scripts/interactive_setup.sh`

**Aenderungen:**

1. `secrets:` Block zum n8n-Service hinzufuegen
2. `N8N_WEBHOOK_SECRET` in `interactive_setup.sh` generieren
3. Secret als Docker Secret mounten

### 3.3 Traefik Max Request Body Size [HIGH]

**Problem:** Kein Limit konfiguriert. Unbegrenzt grosse Uploads moeglich = DoS.

**Datei:** `config/traefik/dynamic/middlewares.yml`

**Aenderung:** Middleware `buffering` mit `maxRequestBodyBytes: 52428800` (50MB)

### 3.4 Traefik LLM Timeouts [HIGH]

**Problem:** Kein expliziter Timeout fuer LLM-Service. Requests koennen haengen.

**Datei:** `config/traefik/dynamic/routes.yml`

**Aenderung:** Custom `serversTransport` mit 300s responseHeaderTimeout fuer LLM

---

## Phase 4: Backend Error-Handling & Robustheit (Woche 2)

### 4.1 Raw Error Throws ersetzen [CRITICAL]

**Problem:** 7x `throw new Error()` statt Custom Errors. Umgehen den Error-Handler, generische 500er.

**Dateien & Fixes:**
| Datei | Fix |
|-------|-----|
| `routes/telegram/app.js:89` | `throw new ServiceUnavailableError(...)` |
| `routes/telegram/settings.js:32,149,171,178` | `throw new ValidationError(...)` / `ServiceUnavailableError` |
| `routes/external/claudeTerminal.js:32` | `throw new ServiceUnavailableError(...)` |
| `routes/system/system.js:160` | `throw new ServiceUnavailableError(...)` |

### 4.2 Unsafe .rows[0] Zugriffe absichern [CRITICAL]

**Problem:** 20+ Stellen greifen auf `.rows[0]` zu ohne `.rows.length > 0` Check. TypeError bei leeren Ergebnissen.

**Dateien:**

- `services/telegram/telegramIngressService.js` (Zeile 851, 1007, 1071, 1076, 1632, 1646, 1839)
- `services/telegram/telegramBotService.js` (Zeile 119, 236, 421, 461, 484, 485, 502, 529, 530, 548, 573, 644, 705)

**Fix:** Vor jedem `.rows[0]` Zugriff: `if (result.rows.length === 0) return null;`

### 4.3 Unhandled Promise Rejections in Timer-Callbacks [CRITICAL]

**Problem:** Async-Operationen in setTimeout/setInterval ohne try-catch.

**Dateien:**

- `services/llm/llmJobProcessor.js:561`
- `services/telegram/telegramIngressService.js:1659`

**Fix:** Jede async Timer-Callback mit try-catch wrappen.

### 4.4 Race Condition in documents.js [HIGH]

**Problem:** Duplicate-Check und Insert nicht atomar. Zwei Requests koennen gleichzeitig einfuegen.

**Datei:** `apps/dashboard-backend/src/routes/documents.js` (Zeile 200-330)

**Fix:** UNIQUE Constraint auf DB-Ebene + Handle PostgreSQL Error 23505

### 4.5 Image Pull Retry-Logic [HIGH]

**Datei:** `apps/dashboard-backend/src/services/app/containerService.js:605-630`

**Aenderung:** Exponential Backoff mit 3 Retries beim Image-Pull

### 4.6 MinIO Stream Cleanup [HIGH]

**Datei:** `apps/dashboard-backend/src/services/documents/minioService.js` (Zeile 161-163, 200-203)

**Aenderung:** Streams explizit bei Error destroyen

### 4.7 EventEmitter Listener-Limits [HIGH]

**Datei:** `services/telegram/telegramOrchestratorService.js` (Zeile 354-418)

**Aenderung:** `this.setMaxListeners(10)` + `destroy()` mit `removeAllListeners()`

### 4.8 WebSocket Connection-Limits [HIGH]

**Dateien:** `apps/dashboard-backend/src/index.js` (alle 3 WS-Server)

**Aenderung:**

```javascript
const MAX_WS_CONNECTIONS = 100;
if (wss.clients.size >= MAX_WS_CONNECTIONS) {
  socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
  socket.destroy();
  return;
}
```

---

## Phase 5: GPU & AI-Service Robustheit (Woche 2-3)

### 5.1 GPU OOM Recovery [CRITICAL]

**Problem:** Kein Mechanismus um GPU Out-of-Memory zu verhindern oder davon zu recovern.

**Dateien:**

- `services/llm-service/api_server.py`
- `apps/dashboard-backend/src/services/llm/llmQueueService.js`

**Aenderungen:**

1. GPU-Memory in `/health` Endpoint aufnehmen
2. Vor Model-Load pruefen: `required_vram < available_vram - 500MB`
3. Bei OOM automatisch `/api/cache/clear` triggern + Retry
4. Fallback auf kleineres Modell wenn Primary nicht passt

### 5.2 Embedding Service OOM Prevention [HIGH]

**Datei:** `services/embedding-service/embedding_server.py` (Zeile 260-263)

**Aenderung:** GPU-Memory VORHER pruefen, nicht erst nach Fehler. CUDA-Cache proaktiv leeren.

### 5.3 Document Indexer Max File Size [HIGH]

**Datei:** `services/document-indexer/api_server.py`

**Aenderung:** `app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE_BYTES` setzen

### 5.4 Prompt Injection Prevention [MEDIUM]

**Datei:** `apps/dashboard-backend/src/services/llm/systemPromptBuilder.js` (Zeile 176-177)

**Aenderung:** Company Context und Project Prompts auf Injection-Patterns pruefen

---

## Phase 6: Self-Healing & 5-Jahres-Autonomie (Woche 3-4)

### 6.1 Offsite-Backup [CRITICAL]

**Problem:** Alle Backups liegen auf derselben Disk. Disk-Failure = totaler Datenverlust.

**Dateien:**

- `services/backup-service/backup.sh`
- `compose/compose.monitoring.yaml`

**Aenderungen:**

1. S3/Remote-MinIO-Sync nach Backup-Erstellung
2. Backup-Verschluesselung (AES-256) vor Upload
3. Backup-Verification nach Upload

### 6.2 Automatisches TLS Certificate Renewal [CRITICAL]

**Problem:** Self-Signed Certs werden nicht erneuert. Nach Ablauf = System unerreichbar.

**Aenderungen:**

1. Self-Healing Agent: Cert-Pruefung + Auto-Renewal 60 Tage vor Ablauf
2. `scripts/security/generate_self_signed_cert.sh` automatisch aufrufbar machen
3. Traefik Reload nach Cert-Renewal

### 6.3 Restart-Loop Prevention [HIGH]

**Problem:** Kein exponentieller Backoff bei Service-Restarts. Cascading Failure moeglich.

**Datei:** `services/self-healing-agent/category_handlers.py` (Zeile 48-66)

**Aenderung:** Backoff 10s -> 30s -> 60s -> 120s statt feste 10s. Max 5 Restarts in 30min, dann Alert statt Reboot.

### 6.4 Backup-Retention erweitern [HIGH]

**Datei:** `services/backup-service/backup.sh` (Zeile 12-13)

**Aenderung:** Weekly von 12 auf 52 Wochen. Monthly-Snapshots hinzufuegen (60 Monate = 5 Jahre).

### 6.5 NVMe/Storage-Wear-Monitoring [CRITICAL fuer 5J]

**Neue Datei:** Integration in metrics-collector

**Aenderungen:**

1. `smartctl` oder `nvme-cli` Abfrage alle 24h
2. TBW-Tracking, Spare-Blocks, Temperatur
3. Alert wenn Spare < 10% oder TBW > 80%
4. Predictive Failure-Warnung

---

## Phase 7: Setup-Scripts & Skalierbarkeit (Woche 3-4)

### 7.1 Docker-Daemon Verification [CRITICAL]

**Problem:** Bootstrap prueft nur ob Docker-Binary existiert, nicht ob Daemon laeuft.

**Datei:** `arasul` (Zeile 401-413)

**Fix:** `docker ps` statt `command -v docker`

### 7.2 Hardcoded Paths ersetzen [CRITICAL]

**Dateien:**

- `scripts/system/ordered-startup.sh:23-24`
- `scripts/system/boot-guard.sh:13-16`

**Fix:** `$ARASUL_HOME` oder `$(cd "$(dirname "$0")/.." && pwd)` statt `/arasul`

### 7.3 Update-System integrieren [CRITICAL]

**Problem:** Update-Package-System existiert aber ist nicht ueber `./arasul update` erreichbar.

**Datei:** `arasul` (Zeile 1471-1480)

**Fix:** `cmd_update()` vollstaendig implementieren

### 7.4 Docker-Install Fehler nicht maskieren [HIGH]

**Datei:** `scripts/setup/preconfigure.sh` (Zeile 158-170)

**Fix:** Einzelne apt-get Aufrufe mit separater Fehlerbehandlung

### 7.5 Jetson Hardware-Info in Settings [MEDIUM]

**Problem:** Erkanntes Jetson-Modell wird nicht im Dashboard angezeigt.

**Aenderungen:**

1. Backend: Jetson-Info ueber `/api/system/info` bereitstellen
2. Frontend: Hardware-Modell, GPU, RAM in Settings anzeigen

---

## Phase 8: Frontend-Stabilisierung (Woche 4)

### 8.1 Error Boundaries um Lazy-Loaded Routes [MEDIUM]

**Datei:** `apps/dashboard-frontend/src/App.tsx`

**Aenderung:** `<ErrorBoundary>` um jede `<Suspense>` wrappen

### 8.2 Upload-Cancel Support [MEDIUM]

**Datei:** `apps/dashboard-frontend/src/features/documents/useDocumentUpload.ts`

**Aenderung:** AbortController + abort()-Methode hinzufuegen

### 8.3 TypeScript any-Types entfernen [MEDIUM]

**Datei:** `apps/dashboard-frontend/src/components/editor/tiptap/SlashCommands.tsx` (Zeile 17, 198)

**Aenderung:** Proper Typing statt `any`

### 8.4 Sandbox Terminal Tab-Management [MEDIUM]

**Problem:** `display: none` statt Unmount. Mehrere xterm-Instanzen im Memory.

**Datei:** `apps/dashboard-frontend/src/features/sandbox/SandboxApp.tsx`

**Aenderung:** Nur aktiven Tab rendern, andere unmounten. Max 5 Tabs.

---

## Phase 9: Testing (Woche 4-6)

### 9.1 Kritische Services testen [HIGH]

**Priority 1 (Woche 4):**

- `services/sandbox/sandboxService.js` - 0 Tests, CRITICAL Feature
- `routes/sandbox.js` - 0 Tests
- `services/documents/documentService.js` - 475 LOC, 0 Tests
- `services/documents/extractionService.js` - 0 Tests
- `routes/documentAnalysis.js` - 0 Tests

**Priority 2 (Woche 5):**

- `services/llm/llmJobProcessor.js` - 0 Tests
- `services/llm/llmQueueService.js` - 0 Tests
- `services/documents/minioService.js` - 252 LOC, 0 Tests
- `services/documents/qdrantService.js` - 152 LOC, 0 Tests

**Priority 3 (Woche 6):**

- 7 Telegram-Services ohne Tests
- Container/Install Services ohne Tests
- Model Lifecycle Services ohne Tests

### 9.2 Coverage-Threshold erhoehen [MEDIUM]

**Datei:** `apps/dashboard-backend/package.json`

**Aenderung:** Coverage von 30% auf 60% (Ziel: 80%)

---

## Phase 10: Environment & Dokumentation (Woche 5-6)

### 10.1 Environment-Variable-Referenz erstellen [HIGH]

**Problem:** 135+ Env-Vars, unvollstaendig dokumentiert.

**Aenderung:** Vollstaendige Referenz in `docs/ENVIRONMENT_VARIABLES.md` generieren

### 10.2 Hardcoded Service-URLs ersetzen [HIGH]

**Problem:** `dashboard-backend:3001` hardcoded in Telegram-Orchestrator.

**Fix:** Environment-Variable `DASHBOARD_BACKEND_URL`

### 10.3 Feature-Flags zentralisieren [MEDIUM]

**Aenderung:** Alle Feature-Flags in einer Config-Datei mit Validation

---

## Fortschritts-Tracking

| Phase | Beschreibung               | Wochen    | Status |
| ----- | -------------------------- | --------- | ------ |
| 1     | Sicherheitskritische Fixes | Woche 1   | DONE   |
| 2     | Datenbank & Fresh-Install  | Woche 1   | DONE   |
| 3     | Docker Secrets & Config    | Woche 1-2 | DONE   |
| 4     | Backend Error-Handling     | Woche 2   | DONE   |
| 5     | GPU & AI Robustheit        | Woche 2-3 | DONE   |
| 6     | Self-Healing & Autonomie   | Woche 3-4 | DONE   |
| 7     | Setup-Scripts & Skalierung | Woche 3-4 | TODO   |
| 8     | Frontend-Stabilisierung    | Woche 4   | TODO   |
| 9     | Testing                    | Woche 4-6 | TODO   |
| 10    | Environment & Doku         | Woche 5-6 | TODO   |

---

## Anhang: Vollstaendige Finding-Liste nach Severity

### CRITICAL (18 Findings)

| #   | Bereich  | Finding                                                        | Datei(en)                                              |
| --- | -------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| C1  | Sandbox  | Keine User-Isolation, alle User sehen alle Projekte            | sandboxService.js, sandbox.js, 073_sandbox_schema.sql  |
| C2  | Sandbox  | Docker CLI im Sandbox-Image = Container-Escape                 | services/sandbox/Dockerfile                            |
| C3  | Database | Migration 071 nutzt falsche Spalten, Fresh-Install bricht ab   | 071_missing_indexes_and_fk_cascades.sql                |
| C4  | Docker   | POSTGRES_PASSWORD als Klartext-Env in AI/Monitoring            | compose.ai.yaml, compose.monitoring.yaml               |
| C5  | n8n      | N8N_ENCRYPTION_KEY nicht als Docker Secret gemountet           | compose.app.yaml, compose.secrets.yaml                 |
| C6  | n8n      | N8N_WEBHOOK_SECRET nie generiert, Webhooks funktionieren nicht | interactive_setup.sh, events.js                        |
| C7  | Store    | Container-Hardening fehlt komplett (CapDrop, SecurityOpt)      | containerService.js                                    |
| C8  | Store    | Path-Traversal in Bind-Mount Substitution moeglich             | containerService.js:507                                |
| C9  | Backend  | 7x raw Error() statt Custom Errors                             | telegram/\*, claudeTerminal.js, system.js              |
| C10 | Backend  | 20+ unsafe .rows[0] ohne Bounds-Check                          | telegramIngressService.js, telegramBotService.js       |
| C11 | Backend  | Unhandled Promise Rejections in Timer-Callbacks                | llmJobProcessor.js:561, telegramIngressService.js:1659 |
| C12 | Setup    | Docker-Daemon nicht verifiziert (nur Binary-Check)             | arasul:401-413                                         |
| C13 | Setup    | Hardcoded Paths /arasul, /var/lib/arasul                       | ordered-startup.sh, boot-guard.sh                      |
| C14 | Setup    | Update-System nicht integriert                                 | arasul:1471                                            |
| C15 | Ops      | Keine Offsite-Backups (Disk-Failure = Totalverlust)            | backup.sh                                              |
| C16 | Ops      | Kein automatisches TLS Certificate Renewal                     | healing_engine.py                                      |
| C17 | LLM      | Kein GPU OOM Recovery-Mechanismus                              | api_server.py, llmQueueService.js                      |
| C18 | Jetson   | Kein NVMe/Storage Wear Monitoring                              | (fehlt komplett)                                       |

### HIGH (24 Findings)

| #   | Bereich   | Finding                                              |
| --- | --------- | ---------------------------------------------------- |
| H1  | Sandbox   | Network-Default auf Backend-Netzwerk                 |
| H2  | Sandbox   | Kein Audit-Logging fuer Terminal-Sessions            |
| H3  | Sandbox   | Keine Rate-Limits auf Sandbox-Endpoints              |
| H4  | Sandbox   | Keine Sandbox-Explosion-Limits (unbegrenzt Projekte) |
| H5  | Backend   | Race Condition in documents.js (Duplicate-Check)     |
| H6  | Backend   | Race Condition in claudeTerminal.js (Session)        |
| H7  | Backend   | Event Listener Leaks (telegramOrchestratorService)   |
| H8  | Backend   | Promise.all() ohne individuelle Failure-Behandlung   |
| H9  | Backend   | Rate-Limit Memory Leak (Cleanup-Interval 1h zu lang) |
| H10 | Traefik   | Keine max Request Body Size konfiguriert             |
| H11 | Traefik   | LLM-Service Timeouts zu kurz (5s Health-Check)       |
| H12 | Store     | Image-Pull ohne Retry-Logic                          |
| H13 | Store     | Container-Status nicht Health-Checked nach Start     |
| H14 | WebSocket | Keine Connection-Limits (DoS auf Jetson 8GB)         |
| H15 | Frontend  | Error Boundaries fehlen um Suspense-Boundaries       |
| H16 | Frontend  | Upload-Cancel nicht implementiert                    |
| H17 | Testing   | ~25-35% Coverage, 46 kritische Services ungetestet   |
| H18 | Ops       | Restart-Loop ohne exponentiellen Backoff             |
| H19 | Ops       | Backup-Retention nur 3 Monate (Ziel: 5 Jahre)        |
| H20 | n8n       | Documents-Node API Key wird nie generiert            |
| H21 | n8n       | Keine Execution-Timeouts                             |
| H22 | Jetson    | Kein Power-Budget Enforcement                        |
| H23 | Docs      | Swagger API Docs ohne Auth-Schutz                    |
| H24 | Env       | 135+ Env-Vars, unvollstaendig dokumentiert           |
