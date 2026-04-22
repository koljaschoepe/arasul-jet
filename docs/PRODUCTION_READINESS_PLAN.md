# Arasul Production Readiness Plan

> **📜 Archived — superseded by [ROADMAP.md](ROADMAP.md).**
> This plan was a snapshot from 2026-04-04 and has since been absorbed into
> the phased cleanup plan in `.claude/CLEANUP_PLAN.md`. Keep for historical
> context, but don't work from it.

**Erstellt:** 2026-04-04
**Methode:** Vollanalyse mit 10+ parallelen Agents - Frontend, Backend, Store, LLM-Pipeline, RAG, Datentabellen, Telegram, Docker/Infra, WebSocket/SSE, Auth/Security, N8N, DB-Migrationen
**Scope:** Keine Architektur-Umbauten - nur Bugfixes, fehlende Verbindungen, und Blocker beseitigen

---

## Gesamtbewertung

| Bereich               | Status            | Score |
| --------------------- | ----------------- | ----- |
| Frontend (React/TS)   | Sehr gut          | 90%   |
| Backend (Express API) | Gut               | 80%   |
| Store / App Install   | Gut mit Lücken    | 75%   |
| LLM/Chat Pipeline     | Kritische Bugs    | 65%   |
| Document/RAG          | Feature-Lücke     | 70%   |
| Datentabellen         | Gut mit Lücken    | 80%   |
| Telegram Bot          | Gut               | 80%   |
| Docker/Infra          | Sehr gut          | 85%   |
| WebSocket/SSE         | Sicherheitslücke  | 70%   |
| Auth/Security         | Gut mit 1 Blocker | 80%   |
| N8N Integration       | Gut               | 80%   |
| DB-Migrationen        | 1 Blocker         | 85%   |

**Gesamt: ~78% Production Ready** - 8 kritische Fixes nötig, danach solide 90%+

---

## Phase 1: KRITISCHE BLOCKER (Muss vor Production)

### 1.1 Migration 057 schlägt fehl - Spalte fehlt

- **Datei:** `services/postgres/init/057_model_lifecycle_views.sql:26-27`
- **Problem:** `INSERT INTO schema_migrations (version, description)` referenziert Spalte `description`, die in der `schema_migrations`-Tabelle nicht existiert (definiert in Migration 000)
- **Fix:** INSERT umschreiben auf existierende Spalten: `(version, filename, success)`
- **Aufwand:** 5 Min

### 1.2 Password-Change in Settings blacklistet Tokens nicht

- **Datei:** `apps/dashboard-backend/src/routes/admin/settings.js:99-131`
- **Problem:** `POST /api/settings/password/dashboard` ändert Passwort, ruft aber NICHT `blacklistAllUserTokens()` auf. Nach Passwort-Änderung bleiben alte Sessions gültig - Sicherheitslücke.
- **Fix:** `await blacklistAllUserTokens(req.user.id)` nach Passwort-Update einfügen
- **Aufwand:** 10 Min

### 1.3 Telegram WebSocket ohne Authentifizierung

- **Datei:** `config/traefik/dynamic/websockets.yml:30-39` + `apps/dashboard-backend/src/index.js:516-519`
- **Problem:** `/api/telegram-app/ws` hat weder Traefik forward-auth noch Backend JWT-Prüfung. Jeder mit Netzwerkzugang kann sich verbinden und Setup-Tokens abfangen.
- **Fix:** Forward-auth Middleware in websockets.yml hinzufügen ODER JWT-Verifikation im Backend-Upgrade-Handler (wie bei Metrics-WebSocket, index.js:485-515)
- **Aufwand:** 30 Min

### 1.4 Fehlender Batch-Move-Endpoint für Dokumente

- **Datei:** Frontend: `apps/dashboard-frontend/src/features/documents/DocumentManager.tsx:406-428`
- **Problem:** Frontend ruft `POST /documents/batch/move` auf - dieser Endpoint existiert NICHT im Backend. Batch-Delete und Batch-Reindex existieren, aber Batch-Move fehlt. Silent fail wegen `showError: false`.
- **Fix:** Neuen Endpoint in `apps/dashboard-backend/src/routes/documents.js` implementieren (analog zu batch/delete + Qdrant-Payload-Update)
- **Aufwand:** 1-2 Std

### 1.5 LLM Flush-Merging Race Condition - Datenverlust

- **Datei:** `apps/dashboard-backend/src/services/llm/llmJobProcessor.js:283-290`
- **Problem:** Schnelle aufeinanderfolgende Flushes werden unsicher konkateniert. Content kann dupliziert, abgeschnitten oder in falscher Reihenfolge ankommen.
- **Fix:** Single-Buffer-Swap statt Concat: `flushQueued` durch atomaren Swap ersetzen, nicht kumulieren
- **Aufwand:** 1 Std

### 1.6 Doppelte thinking_end Emission - UI-Deadlock

- **Datei:** `apps/dashboard-backend/src/services/llm/llmJobProcessor.js:641-644, 667-670`
- **Problem:** Bei Stream-Error + Stream-End kann `thinking_end` zweimal emittiert werden. Frontend-State-Machine toleriert das nicht - Think-Block-Toggle wird unresponsive.
- **Fix:** Guard-Variable `thinkingEndEmitted` einführen, die doppelte Emission verhindert
- **Aufwand:** 15 Min

### 1.7 Traefik Dashboard Auth-Placeholder nicht gesetzt

- **Datei:** `config/traefik/dynamic/middlewares.yml:157-164`
- **Problem:** `__BASIC_AUTH_HASH__` Placeholder nie ersetzt - Dashboard entweder offen oder kaputt
- **Fix:** Echten bcrypt-Hash generieren und einsetzen, oder Dashboard-Route deaktivieren
- **Aufwand:** 15 Min

### 1.8 EventListenerService nicht initialisiert

- **Datei:** `apps/dashboard-backend/src/index.js:256`
- **Problem:** Service importiert aber nie gestartet. Docker-Events, Workflow-Events, Self-Healing-Events werden nie an WebSocket-Clients gebroadcastet.
- **Fix:** `eventListenerService.start()` nach Server-Start aufrufen + `registerWsClient(ws)` im Connection-Handler
- **Aufwand:** 30 Min

---

## Phase 2: HOHE PRIORITÄT (Erste Woche)

### 2.1 Qdrant-Sync bei Dokument-Move

- **Datei:** `apps/dashboard-backend/src/routes/documents.js:766-790`
- **Problem:** Document-Move aktualisiert PostgreSQL, aber Qdrant-Update ist non-critical try-catch ohne Retry. RAG-Queries finden verschobene Dokumente nicht im neuen Space.
- **Fix:** Retry mit Exponential Backoff (3 Versuche), bei Fehlschlag `qdrant_sync_pending`-Flag setzen
- **Aufwand:** 1 Std

### 2.2 Qdrant-Cleanup bei Space-Deletion

- **Datei:** `apps/dashboard-backend/src/routes/ai/spaces.js:272-330`
- **Problem:** Space löschen verschiebt Dokumente in PostgreSQL zu Default-Space, aber Qdrant-Payloads behalten alte `space_id`. Verwaiste Vektoren.
- **Fix:** Nach DB-Move Qdrant-Payload-Update für alle betroffenen Chunks
- **Aufwand:** 1 Std

### 2.3 Qdrant-Verwaiste Vektoren bei Dokument-Delete

- **Datei:** `apps/dashboard-backend/src/routes/documents.js:596-625`
- **Problem:** Qdrant-Delete hat 3 Retries, kann aber trotzdem fehlschlagen. Verwaiste Vektoren verbrauchen Speicher und verlangsamen Suche.
- **Fix:** `qdrant_deleted=false` Flag + periodischer Cleanup-Job (z.B. in run_all_cleanups)
- **Aufwand:** 2 Std

### 2.4 AsyncMutex Race Condition

- **Datei:** `apps/dashboard-backend/src/services/llm/AsyncMutex.js:22-28`
- **Problem:** Zwischen `_waiting.length` Check und `_locked = false` können neue Acquires die Queue umgehen. Jobs werden in falscher Reihenfolge verarbeitet.
- **Fix:** Atomaren Zustandswechsel: `_locked` erst auf false setzen NACHDEM nächster Waiter gestartet
- **Aufwand:** 30 Min

### 2.5 Subscriber-Eviction nach Insertion Order statt Timestamp

- **Datei:** `apps/dashboard-backend/src/services/llm/llmQueueService.js:268-275`
- **Problem:** `keys().next().value` gibt Insertion-Order zurück, nicht ältesten Timestamp. Memory Leak bei Burst-Traffic.
- **Fix:** Eviction anhand `jobSubscriberTimestamps` statt Map-Insertion-Order
- **Aufwand:** 20 Min

### 2.6 N8N Webhook Secret nicht verpflichtend

- **Datei:** `apps/dashboard-backend/src/routes/external/events.js:224`
- **Problem:** Wenn `N8N_WEBHOOK_SECRET` nicht gesetzt, werden ALLE Webhook-Requests ohne Validierung akzeptiert.
- **Fix:** Secret als Required markieren oder Default-Secret generieren bei Bootstrap
- **Aufwand:** 30 Min

### 2.7 Model-Activation: Fake Progress ersetzen

- **Datei:** `apps/dashboard-backend/src/routes/ai/models.js:420-439`
- **Problem:** SSE-Progress bei Model-Activation ist simuliert (5% alle X ms). Stalls bei 95%, dann plötzlich 100%.
- **Fix:** Echten Ollama-Loading-Status abfragen oder ehrliche "Indeterminate"-Anzeige
- **Aufwand:** 1-2 Std

### 2.8 SSE Inactivity Timeout zu kurz für große Models

- **Dateien:** Frontend `DownloadContext.tsx:268-275`, Backend `models.js:301-352`
- **Problem:** 60s Inactivity-Timeout. Bei großen Model-Manifests (70GB+) kann Ollama >60s für den Manifest-Download brauchen.
- **Fix:** Timeout auf 300s erhöhen oder Heartbeat-basiertes Keep-Alive
- **Aufwand:** 30 Min

### 2.9 Ollama-Retry bei transienten Fehlern

- **Datei:** `apps/dashboard-backend/src/services/llm/llmJobProcessor.js:389-425`
- **Problem:** Kein Retry bei HTTP 500/503/ECONNREFUSED. Ollama-Restart = sofortiges Job-Failure.
- **Fix:** 3 Retries mit Exponential Backoff (2s, 4s, 8s) für transiente HTTP-Fehler
- **Aufwand:** 1 Std

### 2.10 Backup-Service restart policy

- **Datei:** `compose/compose.monitoring.yaml:135`
- **Problem:** `restart: unless-stopped` statt `restart: always`. Bei Crash werden Backups nicht mehr ausgeführt.
- **Fix:** Auf `restart: always` ändern
- **Aufwand:** 5 Min

---

## Phase 3: MITTLERE PRIORITÄT (Zweite Woche)

### 3.1 Frontend Stream-Timeout Race

- **Datei:** `apps/dashboard-frontend/src/contexts/ChatContext.tsx:815-825`
- **Problem:** `streamTimeoutReject` wird pro Iteration überschrieben. Alter Timeout kann stale reject() auslösen - User sieht falschen "Stream-Timeout" Fehler.
- **Fix:** Timeout-State in useRef speichern + clearTimeout() bei jeder Iteration
- **Aufwand:** 30 Min

### 3.2 Stale WebSocket Connection Race

- **Datei:** `apps/dashboard-frontend/src/hooks/useWebSocketMetrics.ts:82-93`
- **Problem:** 15s Stale-Detection vs 15s Server-Heartbeat = Race Condition.
- **Fix:** Stale-Timeout auf 20s erhöhen (5s Puffer über Heartbeat-Interval)
- **Aufwand:** 5 Min

### 3.3 Datentabellen AI-Tool filtert nicht

- **Datei:** `apps/dashboard-backend/src/tools/datentabellenTool.js:43-81`
- **Problem:** `query_data` gibt immer TOP 20 Rows zurück, ignoriert Query-Parameter komplett.
- **Fix:** Basic Field-Matching implementieren (WHERE clause basierend auf Query-Keywords)
- **Aufwand:** 2-3 Std

### 3.4 Datentabellen-Suche nur im Primary Field

- **Datei:** `apps/dashboard-backend/src/routes/datentabellen/rows.js:179-188`
- **Problem:** Search durchsucht nur `is_primary_display` Feld, nicht alle Text-Felder.
- **Fix:** Alle Text-Felder per ILIKE durchsuchen (OR-Verknüpfung)
- **Aufwand:** 1 Std

### 3.5 Typ-Konvertierung ohne Sicherheitscheck

- **Datei:** `apps/dashboard-backend/src/routes/datentabellen/tables.js:778-800`
- **Problem:** `ALTER COLUMN TYPE ... USING ::type` kann Daten verlieren.
- **Fix:** Vor Konvertierung prüfen: `SELECT COUNT(*) WHERE field !~ pattern` und warnen
- **Aufwand:** 1-2 Std

### 3.6 Telegram Polling Fallback läuft immer

- **Datei:** `apps/dashboard-frontend/src/features/telegram/BotSetupWizard.tsx:401`
- **Problem:** Polling startet IMMER neben WebSocket - doppelte Backend-Last.
- **Fix:** Polling nur starten wenn WebSocket fehlschlägt (in onError/onClose)
- **Aufwand:** 15 Min

### 3.7 Rate Limit Fail-Open bei DB-Fehler (Telegram)

- **Datei:** `apps/dashboard-backend/src/services/telegram/telegramIntegrationService.js:150-166`
- **Problem:** Bei DB-Fehler wird Rate Limit komplett umgangen (fail-open).
- **Fix:** Bei Connection-Error ablehnen (fail-closed), nur bei "table not exist" durchlassen
- **Aufwand:** 30 Min

### 3.8 IP-Validierung bei Self-Healing Webhook

- **Datei:** `apps/dashboard-backend/src/routes/external/events.js:264-266`
- **Problem:** `clientIp.includes('172.')` matched auch ungültige IPs.
- **Fix:** Proper CIDR-Matching oder IP-Range-Bibliothek verwenden
- **Aufwand:** 30 Min

### 3.9 External API hardcoded user_id=1

- **Datei:** `apps/dashboard-backend/src/routes/external/externalApi.js:80-89`
- **Problem:** Alle External-API-Conversations werden User 1 zugeordnet.
- **Fix:** API-Key-Owner-ID aus `api_keys` Tabelle verwenden
- **Aufwand:** 30 Min

### 3.10 Hybrid Search: Chunk-Deduplizierung

- **Datei:** `apps/dashboard-backend/src/services/rag/ragCore.js:589-674`
- **Problem:** Mehrere Chunks desselben Dokuments können alle top_k Slots belegen.
- **Fix:** Nach Reranking: Max 2-3 Chunks pro document_id, dann auffüllen
- **Aufwand:** 1 Std

### 3.11 Deep Promise Chain in Flush (Stack Overflow Risiko)

- **Datei:** `apps/dashboard-backend/src/services/llm/llmJobProcessor.js:300-335`
- **Problem:** Unbegrenztes `runFlush()` → `runFlush()` Chaining bei hohen Token-Raten.
- **Fix:** Iteration statt Rekursion: while-Loop mit await statt rekursivem Aufruf
- **Aufwand:** 1 Std

### 3.12 Env-Variable Defaults für Metrics

- **Datei:** `compose/compose.monitoring.yaml:34-35`
- **Problem:** `METRICS_INTERVAL_LIVE` und `METRICS_INTERVAL_PERSIST` ohne Defaults.
- **Fix:** `${METRICS_INTERVAL_LIVE:-5}` und `${METRICS_INTERVAL_PERSIST:-60}`
- **Aufwand:** 5 Min

---

## Phase 4: NIEDRIGE PRIORITÄT (Sprint 3+)

### 4.1 Typing-Indicator Memory Leak (Telegram)

- **Datei:** `apps/dashboard-backend/src/services/telegram/telegramIngressService.js:770-784`
- **Problem:** `setInterval` für Typing nicht in `finally` Block aufgeräumt.
- **Fix:** try-catch-finally Pattern mit clearInterval
- **Aufwand:** 10 Min

### 4.2 Ollama HTTP Agent Cleanup bei Shutdown

- **Datei:** `apps/dashboard-backend/src/services/llm/llmJobProcessor.js:763`
- **Problem:** `destroyOllamaAgent()` exportiert aber nie aufgerufen bei Server-Shutdown.
- **Fix:** In graceful-shutdown Handler aufrufen
- **Aufwand:** 10 Min

### 4.3 Telegram WebSocket Heartbeat Leak

- **Datei:** `apps/dashboard-backend/src/services/telegram/telegramOrchestratorService.js:86-99`
- **Problem:** `heartbeatInterval` nur bei WSS close gelöscht, nicht bei Service-Shutdown.
- **Fix:** `shutdown()` Method mit `clearInterval()` hinzufügen
- **Aufwand:** 10 Min

### 4.4 Token-Expiration UI-Warnung

- **Datei:** `apps/dashboard-frontend/src/utils/token.ts:51-55`
- **Problem:** Warnung nur in Console, nicht sichtbar für User.
- **Fix:** Toast-Notification 5 Min vor Ablauf
- **Aufwand:** 30 Min

### 4.5 Subscriber Notify Rate-Limiting

- **Datei:** `apps/dashboard-backend/src/services/llm/llmQueueService.js:299-310`
- **Problem:** Jeder Token löst synchrone Notification für alle Subscribers aus. CPU-Spike bei vielen Tabs.
- **Fix:** Debounce/Batch: Tokens sammeln und alle 50ms flushen
- **Aufwand:** 1 Std

### 4.6 Password Requirements zentralisieren

- **Problem:** SetupWizard, PasswordManagement, Backend haben unterschiedliche Anforderungen.
- **Fix:** Alle von `/settings/password-requirements` Endpoint beziehen
- **Aufwand:** 1 Std

### 4.7 Space Regenerate Endpoint implementieren

- **Datei:** `apps/dashboard-backend/src/routes/ai/spaces.js:336-373`
- **Problem:** TODO Phase 3 - Endpoint akzeptiert Request aber macht nichts.
- **Fix:** document-indexer Endpoint triggern oder Endpoint entfernen
- **Aufwand:** 1-2 Std

### 4.8 Ghost Row verschwindet nach Erstellung (Datentabellen)

- **Datei:** `apps/dashboard-frontend/src/features/datentabellen/hooks/useTableData.ts:144`
- **Problem:** `loadTable()` nach Row-Create springt zu Seite 1.
- **Fix:** Aktuelle Seite beibehalten bei loadTable
- **Aufwand:** 30 Min

### 4.9 CSV Export Limit für große Tabellen

- **Datei:** `apps/dashboard-frontend/src/features/datentabellen/hooks/useTableData.ts:297-303`
- **Problem:** Holt bis zu 10.000 Rows auf einmal - kann Browser crashen.
- **Fix:** Warnung ab 5.000 Rows, Chunked Download oder Backend-seitiger CSV-Export
- **Aufwand:** 2 Std

### 4.10 CSRF Rotation Failure Handling

- **Datei:** `apps/dashboard-backend/src/middleware/csrf.js:103-110`
- **Problem:** Rotation-Fehler wird geloggt aber nicht kommuniziert.
- **Fix:** Header `X-CSRF-Token-Rotated: false` setzen bei Fehler
- **Aufwand:** 15 Min

---

## Zusammenfassung: Aufwandschätzung

| Phase             | Items        | Geschätzter Aufwand | Priorität |
| ----------------- | ------------ | ------------------- | --------- |
| Phase 1 (Blocker) | 8 Items      | ~6-8 Stunden        | SOFORT    |
| Phase 2 (Hoch)    | 10 Items     | ~8-10 Stunden       | Woche 1   |
| Phase 3 (Mittel)  | 12 Items     | ~10-12 Stunden      | Woche 2   |
| Phase 4 (Niedrig) | 10 Items     | ~8-10 Stunden       | Sprint 3+ |
| **Gesamt**        | **40 Items** | **~32-40 Stunden**  |           |

---

## Nicht-Probleme (Bewusst so designed)

Diese Punkte wurden analysiert und sind **korrekt implementiert**:

- Claude Code Endpoints nutzen `:id` Parameter - Express matched `/apps/claude-code/start` korrekt zu `/:id/start`
- CSRF Cookie ohne httpOnly - Double-Submit Cookie Pattern erfordert JS-Zugriff
- Setup-Status Endpoint ohne Auth - Nötig für Frontend-Entscheidung vor Login
- Self-signed TLS - Korrekt für LAN-Deployment, Tailscale für Remote
- Docker Socket via Proxy - Excellent Security mit feingranularen Permissions
- Alle Health Checks konfiguriert - Vollständige Abdeckung aller Services
- Startup-Order mit `service_healthy` - Korrekte Dependency Chain
- Frontend: Alle 7 Navigations-Items korrekt geroutet und funktional
- 302 Backend-Endpoints über 34 Route-Files - konsistentes Error-Handling
- Dashboard Home, Updates, Self-Healing Events, Model Control - alles production-ready

---

## Checkliste vor Go-Live

- [ ] Phase 1 komplett abgearbeitet
- [ ] Phase 2 komplett abgearbeitet
- [ ] `./scripts/test/run-tests.sh --all` grün
- [ ] `docker compose up -d --build` erfolgreich
- [ ] Model-Download getestet (kleines Model ~1GB)
- [ ] App-Install getestet (n8n)
- [ ] Chat mit RAG getestet
- [ ] Dokument-Upload + Indexierung getestet
- [ ] Dokument Batch-Move getestet
- [ ] Passwort-Änderung getestet (beide Wege: Auth + Settings)
- [ ] Telegram Bot Setup getestet
- [ ] Self-Healing Events sichtbar
- [ ] Backup-Service läuft (`docker compose logs backup-service`)
