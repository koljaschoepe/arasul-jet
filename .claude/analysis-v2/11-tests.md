# Test Suite Analysis

**Backend:** 52 files, 1316 assertions, 1312 passing, **4 FAILING**
**Frontend:** 18 files vs 166 source files — **89% untested**
**E2E:** 4 Playwright specs

---

## CRITICAL

### 1. FOUR FAILING TESTS IN PRODUCTION

- **File:** `/unit/rag.test.js` → `POST /api/rag/query` describe block
- **Failing cases:**
  - "should return no documents message when search returns empty"
  - "should process RAG query with documents found"
  - "should use default top_k of 5"
  - "Hybrid Search should combine vector and keyword results"
- **Root cause:** Mock response queue order issue
- **Action:** Add explicit `.mockResolvedValueOnce()` per test
- **Effort:** S (30–60 min)

### 2. CRITICAL UNTESTED ROUTES — 2246 LOC

Zero test coverage for:
| Route | LOC |
|-------|-----|
| `routes/telegram/app.js` | 907 |
| `routes/datentabellen/tables.js` | 852 |
| `routes/datentabellen/quotes.js` | 773 |
| `routes/chats.js` | 707 |
| `routes/datentabellen/rows.js` | 639 |
| `routes/knowledge-graph.js` | 536 |
| (9 more) | >50 each |

**Action:** Add integration tests for top-5 (telegram/app, chats, datentabellen, knowledge-graph)
**Effort:** L (several days)

### 3. CRITICAL UNTESTED UTILITIES (SECURITY)

- `utils/jwt.js` (280 LOC) — token signing/validation
- `utils/tokenCrypto.js` — JWT encryption/decryption
- `utils/auditLog.js` — security audit trail
- `utils/queryBuilder.js` — SQL construction
- `utils/fileValidation.js` — upload security
- `utils/resolveSecrets.js` — credential injection

All handle **sensitive data**, **zero coverage**.
**Action:** Add unit tests for jwt, tokenCrypto, fileValidation first.
**Effort:** M (1–2 days for top 3)

---

## HIGH

### 4. 86 REDUNDANT AUTH TESTS

"should return 401 without authentication" duplicated verbatim across 30+ route files.
**Action:** Replace with parameterized helper:

```js
testRequiresAuth(method, path, { authOnly: true });
```

**Effort:** M (2h)

### 5. FRONTEND COVERAGE CRISIS — 89% untested

- 8 UI components: 4 tested (50%)
- 31 feature components: 6 tested (19%)
- 127+ components: **0 tests**

Critical gaps: ChatInputArea routing, DocumentManager lifecycle, SettingsForm validation.

**Action:** Add 30–40 tests prioritized by user-facing impact over 1–2 sprints.
**Effort:** L

### 6. WEAK ASSERTIONS — 44+ INSTANCES

Pattern: `expect(result).toBeTruthy()`, `.toBeDefined()`, `.toEqual({})` — mask regressions.
Files with heavy over-mocking: `system.test.js` (10 mocks), `settings.test.js` (9), `projects.test.js` (8).
**Action:** Replace with shape assertions; split unit+integration.
**Effort:** M

---

## MEDIUM

### 7. SKIP PATTERNS HIDE TESTS

- `telegramZeroConfig.test.js` — `describe.skip` wrapper
- `migrationRunner.test.js` — conditional `describeIfApp`
  **Action:** Unmock + actually run, or delete.
  **Effort:** S each

### 8. COVERAGE THRESHOLDS TOO LOW

Current: branches 20%, functions 30%, lines 30%.
**Recommended:** branches 40%, functions 50%, lines 70%.
**Action:** Raise in `jest.config.js` once top-5 route tests added.
**Effort:** S

### 9. NO FIXTURES / FACTORIES

Hardcoded mock data in 50+ test files — high maintenance burden.
**Action:** Introduce `tests/factories/` with `makeUser()`, `makeDocument()`, etc.
**Effort:** M

---

## LOW / FLAKINESS

### 10. FLAKY PATTERNS DETECTED

- `llmQueue.test.js`, `rag.test.js`: async ops without fake timers
- No Playwright `.retry()` config (Jetson hardware → spurious failures)
- `telegramWebSocket.test.js`: WebSocket mocks without timeout simulation
- Global 10s timeout may cause spurious fails under load

---

## KILL LIST

| Target                                 | Reason                               |
| -------------------------------------- | ------------------------------------ |
| 86× repetitive 401 auth tests          | Parameterize into helper             |
| `describe.skip` in telegramZeroConfig  | Delete or fix                        |
| Weak `.toBeTruthy()` placeholder tests | Delete or replace with shape asserts |
| Jest results JSON files committed      | Add to .gitignore                    |

## REFACTOR LIST

| Target                                   | Effort | Priority        |
| ---------------------------------------- | ------ | --------------- |
| Fix 4 RAG test failures                  | S      | **Critical**    |
| Auth-test parameterize helper            | M      | High            |
| Add jwt/tokenCrypto/fileValidation tests | M      | High (security) |
| Add top-5 untested routes                | L      | High            |
| Raise coverage thresholds                | S      | Medium          |
| Test factories / fixtures                | M      | Medium          |
| Frontend test push (30–40 tests)         | L      | Medium (phased) |

---

## TOP-10 CRITICAL MISSING COVERAGE

| Priority | Component                                   | LOC   |
| -------- | ------------------------------------------- | ----- |
| P0       | `routes/telegram/app.js`                    | 907   |
| P0       | `routes/chats.js`                           | 707   |
| P0       | RAG query (4 failing)                       | ~200  |
| P0       | `utils/jwt.js`                              | 280   |
| P1       | `routes/datentabellen/{tables,rows,quotes}` | 2264  |
| P1       | `routes/knowledge-graph.js`                 | 536   |
| P1       | `routes/documentAnalysis`                   | 262   |
| P1       | 127 untested frontend components            | —     |
| P2       | 12 Telegram service files                   | ~2500 |
| P2       | Admin GDPR/backup routes                    | 472   |
