# Backend Services / Utils / Libs Cleanup

**Scope:** `apps/dashboard-backend/src/services/`, `utils/`, plus repo-level `libs/`
**Summary:** ~2–3 developer days to clean. Primary pain: shim proliferation + incomplete circuit-breaker wiring.

---

## HIGH

### H001: Circuit Breakers Pre-registered but Never Used (BLOCKER)

- **Location:** `utils/retry.js:294–298`
- **Issue:** `circuitBreakers.get('qdrant'|'embedding'|'minio'|'ollama')` registered, but NONE are ever `.execute(...)`-wrapped in any service.
- **Impact:** RAG pipeline (`ragCore.js`), embedding, document ops can cascade-fail with no protection.
- **Action:** Wrap Qdrant calls in `services/rag/ragCore.js:852–860`, embedding service HTTP calls, MinIO operations via `circuitBreakers.get('service').execute(fn)`.
- **Effort:** M

### H002: Promise Chains Instead of async/await

- **Location:** `services/context/contextInjectionService.js:172–191`
- **Issue:** `.then()` chains inside `injectContext()` (lines 172, 180, 188); inconsistent with rest of codebase.
- **Action:** Convert to `const [metrics, services, logs] = await Promise.all([...])`.
- **Effort:** S

### H003: MinIO checkBucketQuota() Returns null → Silent Quota Bypass

- **Location:** `services/documents/minioService.js:137–139`
- **Issue:** Any error returns `null`; callers treat as "allowed". Quota enforcement silently bypassed.
- **Action:** Return explicit error; add retry; conservative estimate fallback.
- **Effort:** M

### H004: Unused Parameter in checkBucketQuota

- **Location:** `services/documents/minioService.js:129`
- **Issue:** `minio` param never used (func gets client via `getMinioClient()` inside).
- **Action:** Remove param, update call sites.
- **Effort:** S

---

## MEDIUM

### M001: Telegram Re-export Shim Proliferation

Four 2–3 LOC shim files add indirection without value:

- `services/telegram/telegramLLMService.js` (re-exports from integration service)
- `services/telegram/telegramPollingManager.js` (re-exports ingress)
- `services/telegram/telegramWebSocketService.js` (re-exports orchestrator)
- `services/telegram/telegramWebhookService.js` (re-exports ingress)

**Action:** DELETE shims; update 1–2 route files to import sources directly.
**Effort:** S

### M002: Lazy require() Hiding Circular Dep

- **Location:** `services/sandbox/sandboxIdleChecker.js:33–34`
- **Issue:** `const { stopContainer } = require('./sandboxService')` inside function to dodge circular import.
- **Action:** Invert dependency — sandboxService calls idle checker, not the other way.
- **Effort:** M

### M003: Hardware Utility API Surface Too Wide

- **Location:** `utils/hardware.js` (241 LOC, ~30 exported functions)
- **Action:** Split by domain (Jetson detect / GPU info / resource utils) OR add table-of-contents JSDoc.
- **Effort:** M (defer if documented)

---

## LOW

### L001: Mixed module.exports Patterns

- `services/telegram/telegramOrchestratorService.js:1021–1039` — singleton + named
- `services/llm/modelService.js:1164–1165` — singleton + factory
- **Action:** Document choice in `docs/ARCHITECTURE.md`; standardize for new code.
- **Effort:** S

### L002: Fire-and-Forget .catch() with No Logging

- `services/telegram/telegramVoiceService.js`, `telegramCommandHandlers.js`, `services/llm/modelService.js`
- **Action:** Add `logger.warn()` before swallowing.
- **Effort:** S

### L003: CircuitBreaker Class Timeout Unfinished

- **Location:** `utils/retry.js:242–265`
- **Issue:** Timeout option declared but not fully wired; state transitions unclear.
- **Effort:** M

### L004: Unused Function Params

- `services/app/pdfService.js:formatCurrency(value, currency, symbol)` — `currency` ignored (EUR hardcoded)
- **Action:** Either implement or remove parameter.
- **Effort:** S

---

## KILL LIST

| File                                                       | Size   | Risk |
| ---------------------------------------------------------- | ------ | ---- |
| `services/telegram/telegramLLMService.js`                  | 2 LOC  | None |
| `services/telegram/telegramPollingManager.js`              | 2 LOC  | None |
| `services/telegram/telegramWebSocketService.js`            | 3 LOC  | None |
| `services/telegram/telegramWebhookService.js`              | 2 LOC  | None |
| Unused `minio` param in `minioService.js:checkBucketQuota` | ~1 LOC | None |

## REFACTOR LIST

| Item                                                       | Effort | Priority                   |
| ---------------------------------------------------------- | ------ | -------------------------- |
| Wire circuit breakers around Qdrant/Embedding/MinIO/Ollama | M      | **High** (RAG reliability) |
| Fix MinIO quota null → error                               | M      | High                       |
| contextInjection Promise.all refactor                      | S      | Medium                     |
| sandboxIdleChecker circular dep invert                     | M      | Medium                     |
| Add logging to fire-and-forget `.catch()`                  | S      | Medium                     |
| Hardware util split OR document                            | M      | Low                        |
