# Current Bugs & Error Patterns (Live Runtime)

**Analysis date:** 2026-04-22
**Method:** Docker logs + code inspection + git log cross-reference

---

## ACTIVE BUGS (reproducible now, log-visible)

### BUG-001: Self-Healing Agent DB Query Type Mismatch (CRITICAL)

- **File:** `services/self-healing-agent/db.py:62–76`; caller `healing_engine.py:439–444`
- **Issue:** `execute_query()` uses `cursor.fetchone()` regardless of `fetch=True` arg. Caller expects a list and iterates `for db_name, xid_age in xid_rows:`. On a single-row tuple, this blows up with `'int' object is not subscriptable`.
- **Evidence:** Error repeats every 5–10 minutes since 2026-04-21 23:13:24
- **Impact:** DB health checks fail silently; transaction wraparound detection broken → **5-year autonomy at risk**.
- **Fix:** Use `cursor.fetchall()` when multiple rows expected (or fix caller to handle single-row tuple).
- **Effort:** S (10 min)

### BUG-002: Document Indexer Infinite Retry on Unsupported Format (HIGH)

- **File:** `services/document-indexer/enhanced_indexer.py:296`
- **Issue:** On failed indexing, `retry_count` is **reset to 0** instead of incremented. PNG file `1776113190000_Untitled Design Presentation (1).png` without OCR engine → retries every 30s for 48+ hours.
- **Impact:** Wasted CPU/I/O; no dead-letter queue; indexer never gives up.
- **Fix:** Increment `retry_count`, add `max_retries=3`, mark as `failed_permanent`.
- **Effort:** S (15 min)

### BUG-003: Telegram Bot Polling with Invalid Token Config (MEDIUM)

- **File:** `apps/dashboard-backend/src/services/telegram/telegramIngressService.js:654`; `startPolling` at :536
- **Issue:** Bot ID 1 exists in DB but `TELEGRAM_BOT_TOKEN`/`CHAT_ID` not set. `startPolling()` doesn't validate before entering loop. `fetch()` to Telegram fails every 5–30s with plain network error (not 401).
- **Evidence:** `error: Polling error for bot 1: fetch failed` 10–20× per 5-min window.
- **Fix:** Validate token non-null before polling; respond 400 + guidance if user tries to activate without token.
- **Effort:** S (20 min)

---

## LATENT BUGS (will trigger under specific conditions)

### LATENT-001: Self-Healing DB Connection Leak

- **File:** `services/self-healing-agent/db.py:62–88`
- **Issue:** `finally` releases connection even on error, but `conn.rollback()` failure at line 82 is swallowed. Connection may return to pool in bad state.
- **Trigger:** DB connection drop mid-query; pool exhaustion after 50+ errors.
- **Fix:** Context manager; ensure rollback always succeeds before release.
- **Effort:** S (20 min)

### LATENT-002: Silent Failure in ProjectModal

- **File:** `apps/dashboard-frontend/src/features/projects/ProjectModal.tsx`
- **Issue:** `.catch(() => {})` swallows all errors — no logging, no user feedback. If delete/update fails, user thinks success.
- **Fix:** Add `console.error()` + `toast.error()`.
- **Effort:** S (10 min)

### LATENT-003: Telegram Setup Session Race Condition

- **File:** `apps/dashboard-backend/src/services/telegram/telegramIngressService.js:127–182` (`notifySetupSessionIfExists`)
- **Issue:** No locking on session lookup → two concurrent messages for same bot → both handlers update same session.
- **Trigger:** Two Telegram messages within 100ms.
- **Impact:** Session marked complete twice; duplicate WS notifications.
- **Fix:** `SELECT ... FOR UPDATE` or version check.
- **Effort:** S (30 min)

---

## ERROR-HANDLING ANTI-PATTERNS (systemic)

### ANTI-PATTERN-001: Empty Catch Without Logging

Sites found:

- `apps/dashboard-backend/src/utils/jwt.js` — `db.query().catch(() => {})`
- `apps/dashboard-frontend/src/features/projects/ProjectModal.tsx` — `.catch(() => {})`
- `apps/dashboard-backend/src/routes/admin/gdpr.js` — 10+ `.catch(() => ({rows: []}))`

**Impact:** Errors vanish; data loss silent; debugging painful.
**Rule:** Always `logger.warn(err)` before suppressing; document why safe.

### ANTI-PATTERN-002: Error Logging Without Trace Context

- `services/telegram/telegramIngressService.js:654` — logs message string only
- `services/self-healing-agent/healing_engine.py:469` — same issue
  **Rule:** Include request ID, user ID, or entity ID in every error log.

### ANTI-PATTERN-003: Polling Without Jitter

- `services/telegram/telegramIngressService.js:602–660`
- Fixed 5s backoff, no jitter → thundering herd when many bots fail simultaneously.
  **Rule:** Exponential backoff + jitter for any retry loop.

---

## PHASE 1 STATUS — Prior Live Bugs

From `.claude/analysis/18-live-runtime.md` (2026-04-21):
| Prior Issue | Status |
|-------------|--------|
| LIVE-B01 WAL archive broken | Fixed in Phase 1 (commit 9566bb1) |
| LIVE-B02 Self-healing flood (telegram-bot-app) | Mitigated in Phase 1; **but BUG-001 is a NEW self-healing bug** |
| I-B01 Embedding start_period 600s | Still present (see 08-infra.md) |

**New bugs introduced since prior analysis:** BUG-001, BUG-002 (indexer retry), BUG-003 (polling spam).

---

## FIX PRIORITY (total ~1.5–2h for everything)

| Priority | Bug                                      | Effort |
| -------- | ---------------------------------------- | ------ |
| P0       | BUG-001 self-healing fetchall            | 10m    |
| P0       | BUG-002 indexer retry logic              | 15m    |
| P1       | BUG-003 telegram token validation        | 20m    |
| P1       | LATENT-002 ProjectModal error visibility | 10m    |
| P2       | ANTI-PATTERN-001 logging audit           | 30–60m |
| P2       | LATENT-001 DB leak                       | 20m    |
| P2       | LATENT-003 session race                  | 30m    |
| P3       | ANTI-PATTERN-003 polling jitter          | 20m    |
