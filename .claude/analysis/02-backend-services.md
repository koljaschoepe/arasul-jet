# Backend Service-Layer & Integrationen — Findings

## BLOCKERS

### B001: Fetch-API ohne konsistente Timeouts

- `apps/dashboard-backend/src/services/core/tokenService.js:30,78`
- `apps/dashboard-backend/src/services/memory/memoryService.js:60,76,282,393,431,466,561,597,630,684,705`
- `apps/dashboard-backend/src/services/telegram/telegramIngressService.js:378,402,439,467,549,566`
- Problem: `AbortSignal.timeout()` ohne Fallback, kein einheitliches Retry
- Fix: Alle fetch-Calls auf Axios migrieren ODER Wrapper mit Promise.race-Timeout

### B002: RAG-Pipeline ohne Circuit-Breaker

- `apps/dashboard-backend/src/services/rag/ragCore.js:852-860` (hybridSearch, graphEnrichedRetrieval)
- `retry.js` hat `circuitBreakers.get('qdrant')` — wird NICHT genutzt
- Bei Qdrant-Ausfall Cascade-Failure
- Fix: `circuitBreakers.get('qdrant').execute()` um alle Qdrant-Calls, graceful Fallback

### B003: Document-Indexer ohne Retry/Circuit-Breaker

- `apps/dashboard-backend/src/routes/rag.js:94-109` (Spellcheck)
- `apps/dashboard-backend/src/services/rag/ragCore.js:100-113` (Sparse), `:602-606` (Entities)
- `apps/dashboard-backend/src/services/documents/extractionService.js:35,69`
- Inkonsistente Timeouts, kein Retry — bei Indexer-Down fällt RAG-Qualität

## MAJORS

### M001: Qdrant-Delete-Operationen nicht durchgesetzt

- `services/documents/qdrantService.js:28-60`, `services/documents/documentService.js:31-58`
- `qdrant_cleanup_pending` Flag gesetzt, aber kein Cleanup-Job → Orphan-Vektoren wachsen unbegrenzt
- Fix: Hourly Cleanup-Job + Telemetrie-Metric

### M002: LLM Inactivity-Timeout hardcoded 10min

- `services/llm/llmOllamaStream.js:349-388`
- Für 70B+ Models mit Think-Mode zu kurz
- Fix: `LLM_INACTIVITY_TIMEOUT_THINKING_MS` separat, dynamisch pro Modell

### M003: MinIO Quota-Enforcement inkonsistent

- `services/documents/minioService.js:222-237`
- `checkBucketQuota()` kann null zurückgeben → Quota-Check wird still übersprungen
- Fix: Null → Error werfen oder konservative Schätzung; Quota-Cache 1min

### M004: Embedding-Service ohne Retry

- `services/embeddingService.js:25-33`
- Fallback `return null` bei Fehler; keine Retries
- Fix: Retry mit expo-backoff, Circuit-Breaker, Degraded-Mode (BM25-only)

### M005: n8n Webhook-Targets ohne Validierung

- `routes/external/alerts.js`, `routes/external/events.js:22`
- Fehlerhafte URL → silent failures
- Fix: POST-Handshake bei Konfig, Delivery-Retry, Response-Code-Tracking

### M006: Context-Injection ohne Backpressure

- `services/context/contextInjectionService.js`
- Truncation erst nach Kontext-Sammlung → OOM-Risiko auf Jetson
- Fix: Token-Budget VOR Injection, Early-Exit bei >50% des Budgets

### M007: Memory-Service Qdrant-Collection nicht idempotent

- `services/memory/memoryService.js:58-88`
- Collection mit falschen Settings wird nicht rekonfiguriert
- Fix: Schema-Validation (dimension), `--force` für Recreate, Health-Check blocking

## MINORS

- m001: Telegram Webhook-Retries ohne expo-backoff (telegramIngressService.js:727, 838)
- m002: Query-Complexity-Analyzer zu heuristisch (queryComplexityAnalyzer.js)
- m003: 3 RAG-Thresholds (RELEVANCE, VECTOR_SCORE, MARGINAL_FACTOR) — konfus
- m004: Document-Extraction Temp-Files ohne Cleanup-Job (`_tmp_extract/`)
- m005: Services-Config hat viele inline ENV-Fallbacks (services.js:31)

## Priorität für Rollout

1. B002 (Circuit-Breaker Qdrant) — bei Jetson-Ausfall sonst Kaskade
2. B001 (Fetch-Timeouts) — Node-Version-Kompat
3. B003 (Indexer-Fallback) — RAG graceful degrade
4. M001 (Qdrant-Cleanup) — Speicher-Leak long-running
5. M004 (Embedding-Retry) — RAG-Zuverlässigkeit
