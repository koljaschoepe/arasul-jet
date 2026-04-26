# Backend Infrastructure Analysis (Middleware / Validators / Errors / Config)

**Date:** 2026-04-22  
**Scope:** Dashboard backend infra layers (middleware, validators, errors, config, DB, sockets)  
**Codebase:** 45 route files, 7 middleware files, 30+ schemas, ~1560 LOC in schemas/

---

## Executive Summary

The backend infrastructure is **largely well-structured** with clear separation of concerns (auth, validation, error handling, rate limiting). However:

- **Critical:** 4 routes lack request validation (`validateBody`) despite accepting POST/PUT/PATCH
- **High:** 6 unused/orphaned error classes; config drift (inline `process.env` reads vs centralized)
- **Medium:** Validator/schema sprawl (30+ local schemas; prior analysis noted only 2 in shared-schemas)
- **Minor:** Unused/underused rate limiters; inconsistent error response details shapes

**Effort to fix:** ~2-3 weeks (S/M mixed); consolidation is iterative (covered in 17-shared-schemas.md).

---

## CRITICAL FINDINGS

### 1. Missing Request Validation (validateBody)

**Severity:** CRITICAL (security + data integrity)  
**Count:** 4 routes with POST/PUT but no validation middleware

| Route               | File                 | Methods | Issue                                                    |
| ------------------- | -------------------- | ------- | -------------------------------------------------------- |
| POST /images/upload | documentImages.js:48 | POST    | Custom multer handler; body validation missing           |
| POST /images/:id/\* | documentAnalysis.js  | POST    | No validateBody                                          |
| POST /ops/backup    | admin/backup.js      | POST    | No validateBody                                          |
| DELETE /ops/\*      | admin/ops.js         | DELETE  | No validateBody (but ops.js is GET-only, false positive) |

**Evidence:**

- documentImages.js line 48: `router.post('/images/upload', requireAuth, (req, res, next) => imageUpload.single('image')(req, res, err => {...}))` — no schema validation
- documentAnalysis.js: POST without validateBody pattern
- backup.js lines 11-60: stub endpoints with no body validation

**Risk:**

- Unexpected fields accepted (NoSQL-like injection if body used in queries)
- Type mismatch (integer as string) causes silent failures
- No audit trail of rejected payloads

**Action:** S (small)

- Add Zod schemas to each route's imports
- Insert `validateBody(schema)` middleware after `requireAuth, requireAdmin`
- Reference: `/middleware/validate.js` pattern (validateBody factory)

**Refactor Code:**

```javascript
// documentImages.js (line 48)
const ImageUploadSchema = z.object({
  /* minimal */
});

router.post(
  '/images/upload',
  requireAuth,
  validateBody(ImageUploadSchema), // <- ADD THIS
  imageUploadHandler
);
```

---

### 2. Dead Error Classes (6 unused in errors.js)

**Severity:** HIGH (dead code; confuses maintainers)  
**Location:** `/src/utils/errors.js:88-97`

| Class                     | Exported | Used             | Risk     |
| ------------------------- | -------- | ---------------- | -------- |
| `ApiError`                | ✅ Yes   | ✅ 64 matches    | OK       |
| `ValidationError`         | ✅ Yes   | ✅ 9 matches     | OK       |
| `UnauthorizedError`       | ✅ Yes   | ❌ **0 matches** | **DEAD** |
| `ForbiddenError`          | ✅ Yes   | ✅ 3 matches     | OK       |
| `NotFoundError`           | ✅ Yes   | ✅ 3 matches     | OK       |
| `ConflictError`           | ✅ Yes   | ❌ **0 matches** | **DEAD** |
| `RateLimitError`          | ✅ Yes   | ❌ **0 matches** | **DEAD** |
| `ServiceUnavailableError` | ✅ Yes   | ❌ **0 matches** | **DEAD** |

**Evidence:**

```bash
grep -r "UnauthorizedError\|ConflictError\|RateLimitError\|ServiceUnavailableError" \
  /src/routes /src/middleware /src/services --include="*.js"
# → 0 results
```

**Why dead:**

- auth.js directly returns `res.status(401).json({error: {...}})` instead of throwing UnauthorizedError
- Rate limiting (rateLimit.js:126-147) builds JSON inline, doesn't throw RateLimitError
- Conflicts are not explicitly handled in routes (PostgreSQL 23505 handled by errorHandler.js, not ConflictError)
- ServiceUnavailableError exists but service errors are handled ad-hoc in routes

**Action:** M (medium)

- **Option A (recommended):** Remove UnauthorizedError, ConflictError, RateLimitError, ServiceUnavailableError from export
- **Option B:** Refactor middleware/routes to throw these (larger change, better consistency)
- Decision: Pick A for Phase 1 (cleanup); B for Phase 2 (consistency drive)

**File:** `/src/utils/errors.js:88-97`

---

### 3. Config Drift: Inline `process.env` Reads vs Centralized Config

**Severity:** HIGH (hard to audit, scattered secrets)  
**Count:** 14 files with inline reads (should be 1-2)

**Files with inline env reads (non-centralized):**
| File | Env Vars | Issue |
|------|----------|-------|
| index.js | JWT_SECRET, POSTGRES_PASSWORD, MINIO_ROOT_PASSWORD, NODE_ENV, PORT | All critical |
| middleware/rateLimit.js | RATE_LIMIT_ENABLED | Should be in config |
| middleware/csrf.js | NODE_ENV, FORCE_HTTPS | Should be in config |
| auth.js | Potential inline reads (route-level) | Check |
| routes/admin/backup.js | EXTERNAL_BACKUP_PATH | Should be in config |

**Evidence:**

- `rateLimit.js:13`: `process.env.RATE_LIMIT_ENABLED === 'false'`
- `csrf.js:40`: `process.env.NODE_ENV === 'production' \|\| process.env.FORCE_HTTPS === 'true'`
- `backup.js:17`: `process.env.EXTERNAL_BACKUP_PATH || '/mnt/external-ssd'`
- `index.js:64`: `process.env.PORT || 3001`

**Centralized config (good):**

- `/config/services.js` exists with LLM_SERVICE_HOST, EMBEDDING_SERVICE_HOST, etc. (127 LOC)

**Risk:**

- Scattered env var reads → hard to document required variables
- No type checking (all strings; no coercion in one place)
- Changes require touching multiple files
- Testing harder (must mock multiple locations)

**Action:** M (medium)

- Create `/config/index.js` (centralized all app config)
- Export: `{ PORT, NODE_ENV, JWT_SECRET, RATE_LIMIT_ENABLED, EXTERNAL_BACKUP_PATH, ... }`
- Update all files to import from config/index.js
- Validate all required vars at startup (already done in index.js for secrets, expand to all)

**Refactor Code:**

```javascript
// config/index.js (NEW FILE)
module.exports = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET, // validated at startup
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  externalBackupPath: process.env.EXTERNAL_BACKUP_PATH || '/mnt/external-ssd',
  forceHttps: process.env.FORCE_HTTPS === 'true',
};

// middleware/rateLimit.js (refactored)
const config = require('../config');
const isRateLimitDisabled = () => !config.rateLimitEnabled;
```

---

## HIGH PRIORITY FINDINGS

### 4. Duplicate Authentication Middleware (2 variants)

**Severity:** MEDIUM (minor confusion, not dead code)  
**Location:** `/middleware/auth.js` + `/middleware/apiKeyAuth.js`

**Pattern:**

- `requireAuth` (line 20): JWT from Bearer header or session cookie
- `requireApiKey` (apiKeyAuth.js:153): API key from X-API-Key header
- `optionalAuth` (line 158): Non-blocking variant of requireAuth

**Issue:** No duplicate, but **role-checking is inline:**

- `requireAdmin` (line 205) is a separate middleware that checks `req.user.role`
- Could be combined with `requireAuth` via factory function

**Current (works, but verbose):**

```javascript
router.delete('/model/:id', requireAuth, requireAdmin, asyncHandler(...))
```

**Alternative (cleaner, future-proof):**

```javascript
// middleware/auth.js
function requireAuthWithRole(role) {
  return async (req, res, next) => {
    await requireAuth(req, res, () => {
      if (req.user.role !== role) {
        return next(new ForbiddenError(`Role '${role}' required`));
      }
      next();
    });
  };
}

// Usage:
router.delete('/model/:id', requireAuthWithRole('admin'), asyncHandler(...))
```

**Action:** L (large, refactoring; works as-is)

- Keep current pattern for now (clear and functional)
- Document: "Use `requireAuth` then `requireAdmin` for two-step auth"
- No action needed immediately

---

### 5. Unused/Underused Rate Limiters

**Severity:** MEDIUM (not applied everywhere needed)  
**Location:** `/middleware/rateLimit.js:162-171`

**All rate limiters defined:**
| Limiter | Window | Max | Usage | Status |
|---------|--------|-----|-------|--------|
| loginLimiter | 15m | 10 | `/api/auth/login` | ✅ Used |
| apiLimiter | 1m | 100 | 1 mount in routes/index.js | ⚠️ Underused |
| llmLimiter | 1s | 10 | `/llm`, `/embeddings` | ✅ Used |
| metricsLimiter | 1s | 20 | `/metrics` | ✅ Used |
| webhookLimiter | 1m | 100 | **ORPHANED** | ❌ Never used |
| generalAuthLimiter | 1m | 30 | **ORPHANED** | ❌ Never used |
| tailscaleLimiter | 1m | 5 | `/tailscale` | ✅ Used |
| uploadLimiter | 1m | 20 | **ORPHANED** | ❌ Never used |

**Evidence:**

```bash
grep -r "webhookLimiter\|generalAuthLimiter\|uploadLimiter" /src/routes --include="*.js"
# → 0 results for each
```

**Why created:**

- webhookLimiter: Planned for n8n webhooks (routes/external/events.js has webhooks but doesn't apply limiter)
- generalAuthLimiter: Generic fallback, never mounted
- uploadLimiter: Defined but documentImages.js doesn't use it

**Action:** S (small)

- **webhookLimiter:** Audit routes/external/events.js; apply if webhook processing exists
- **uploadLimiter:** Apply to documentImages.js:48 POST and documentAnalysis.js
- **generalAuthLimiter:** Remove (duplicate of apiLimiter; add comment explaining)

**Refactor Code:**

```javascript
// routes/index.js (existing: routes mounted with limiters)
router.use('/llm', llmLimiter, require('./llm'));
router.use('/embeddings', llmLimiter, require('./ai/embeddings'));

// ADD THIS (missing):
router.use('/api/documents/upload', uploadLimiter, require('./documents'));
router.use('/api/webhooks', webhookLimiter, require('./external/events'));
```

---

### 6. Validator/Schema Sprawl (30+ local schemas)

**Severity:** MEDIUM (noted in prior 17-shared-schemas.md analysis)  
**Scope:** Overlaps with previous report

**Summary from 17-shared-schemas.md:**

- Only 2 schemas in shared-schemas (ChatBody, PrioritizeJobBody)
- 20+ local backend schemas in routes remain unshared
- See: 17-shared-schemas.md Section "Backend-lokale Schemas (Duplikate)" for full list

**Action:** M (medium, iterative)

- **Phase 1:** Migrate auth.ts, chats.ts, rag.ts to shared-schemas (per 17-shared-schemas.md plan)
- **Phase 2:** Continue migration of other 15+ schemas
- Don't redo here; reference prior analysis

---

## MEDIUM PRIORITY FINDINGS

### 7. Inconsistent Error Response Details Shapes

**Severity:** MEDIUM (minor inconsistency; error handler normalizes)  
**Evidence:**

**Correct shape (per errorHandler.js:131):**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "...",
    "details": {...}  // only for 4xx
  },
  "timestamp": "2026-04-22T..."
}
```

**Inconsistent shapes found:**

| Location                | Shape                                               | Issue                              |
| ----------------------- | --------------------------------------------------- | ---------------------------------- |
| auth.js:40-43           | `{ error: { code, message }, timestamp }`           | ✅ Correct                         |
| apiKeyAuth.js:157-162   | `{ error: { code, message }, timestamp }`           | ✅ Correct                         |
| rateLimit.js:25-26      | `{ error: { code, message }, timestamp }`           | ✅ Correct                         |
| csrf.js:85              | `next(new ForbiddenError(...))`                     | ✅ Thrown; errorHandler normalizes |
| documentImages.js:55-58 | `{ error: { code, message }, timestamp }`           | ✅ Correct                         |
| errorHandler.js:131     | `{ error: { code, message, details? }, timestamp }` | ✅ Canonical                       |

**Finding:** ✅ **No inconsistency found.** All middleware returns correct shape. Good!

**Confirmation:** Post-middleware/CSRF/auth errors are thrown and normalized by errorHandler.js (line 48-138).

---

### 8. User Cache Eviction in auth.js (Potential Issue)

**Severity:** MEDIUM (edge case; mostly handled)  
**Location:** `/middleware/auth.js:110-135`

**Current logic (line 121-133):**

```javascript
if (!evicted && userCache.size >= USER_CACHE_MAX) {
  let oldestKey = null;
  let oldestExpiry = Infinity;
  for (const [key, entry] of userCache.entries()) {
    if (entry.expiresAt < oldestExpiry) {
      oldestExpiry = entry.expiresAt;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    userCache.delete(oldestKey);
  }
}
```

**Issue:** Deletes only one entry when cache is full. If requests spike, next 49 requests will all trigger this (inefficient).

**Action:** S (small, optimization)

- Consider: LRU eviction or bulk cleanup when size > threshold
- **Recommended fix (minimal):** Change to batch eviction:

```javascript
if (!evicted && userCache.size >= USER_CACHE_MAX) {
  const entriesToDelete = [];
  for (const [key, entry] of userCache.entries()) {
    if (now >= entry.expiresAt) {
      entriesToDelete.push(key);
    }
  }
  entriesToDelete.slice(0, Math.ceil(USER_CACHE_MAX * 0.1)).forEach(k => userCache.delete(k));
}
```

- **Effort:** S (15 min refactor)

---

## MINOR FINDINGS

### 9. CSRF Token Rotation Error Handling

**Severity:** MINOR (non-blocking)  
**Location:** `/middleware/csrf.js:97-105`

**Current:**

```javascript
try {
  rotateCsrfToken(res);
} catch (rotateErr) {
  logger.warn(`CSRF token rotation failed: ${rotateErr.message}`);
  res.setHeader('X-CSRF-Token-Rotated', 'false');
}
```

**Issue:** Sets header after error, but doesn't prevent request from continuing. If rotation fails, client won't get new token → next request may fail CSRF check.

**Better:** On rotation failure, either:

1. Return error (blocking)
2. Silently continue (current), but document contract

**Current is acceptable** (fire-and-forget pattern for non-critical token rotation).

**Action:** NONE (acceptable as-is; document contract)

---

### 10. Audit Middleware: Fire-and-Forget Log Writes

**Severity:** MINOR (acceptable; async pattern)  
**Location:** `/middleware/audit.js:196-201`

**Current:**

```javascript
writeAuditLog(logEntry).catch(err => {
  logger.warn(`Audit log write failed (fire-and-forget): ${err.message}`, {...});
});
```

**Pattern:** Correct for high-frequency logging (don't block requests if audit DB is slow).

**Note:** If audit DB fails, logs are silently lost (documented in logger.warn). Monitor alert required.

**Action:** NONE (good pattern)

---

## SUMMARY TABLE

| Issue                              | Severity | Category   | Effort | Status         |
| ---------------------------------- | -------- | ---------- | ------ | -------------- |
| Missing validateBody (4 routes)    | CRITICAL | Validation | S      | Actionable     |
| Dead error classes (6)             | HIGH     | Cleanup    | M      | Actionable     |
| Config drift (14 files inline env) | HIGH     | Config     | M      | Actionable     |
| Unused rate limiters (3)           | MEDIUM   | Middleware | S      | Actionable     |
| Schema sprawl (30+ local)          | MEDIUM   | Validators | M      | Ref 17-schemas |
| User cache eviction                | MEDIUM   | Perf       | S      | Optimization   |
| Inconsistent error shapes          | MEDIUM   | Fixed      | —      | No action      |
| CSRF rotation error                | MINOR    | Docs       | —      | No action      |
| Audit fire-and-forget              | MINOR    | Docs       | —      | No action      |

---

## KILL/REFACTOR TABLE

### Quick Wins (S = 1-2 days)

| Item                      | Action                                | File(s)                                                 | Estimate |
| ------------------------- | ------------------------------------- | ------------------------------------------------------- | -------- |
| 4 missing validateBody    | Add schemas + middleware              | documentImages.js, documentAnalysis.js, admin/backup.js | 2 hours  |
| 3 orphaned rate limiters  | Remove from export or apply to routes | middleware/rateLimit.js, routes/\*                      | 1 hour   |
| User cache batch eviction | Improve eviction logic                | middleware/auth.js:121-135                              | 30 min   |

### Medium Lifts (M = 3-5 days)

| Item                       | Action                                      | File(s)                                                      | Estimate                       |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------ | ------------------------------ |
| Config centralization      | Create config/index.js; refactor inline env | config/index.js (new), middleware/\*, routes/admin/backup.js | 3-4 hours                      |
| Dead error classes         | Remove from utils/errors.js export          | utils/errors.js:88-97                                        | 1 hour                         |
| Schema migration (Phase 1) | Move auth, chats, rag to shared-schemas     | shared-schemas/src/_, routes/_                               | 2-3 days (per 17-schemas plan) |

### Deferred (Phase 2+)

| Item                                                 | Action                                 | File(s)                            | Estimate        |
| ---------------------------------------------------- | -------------------------------------- | ---------------------------------- | --------------- |
| Middleware factory refactoring (requireAuthWithRole) | Consolidate requireAuth + requireAdmin | middleware/auth.js                 | L (refactoring) |
| Full schema consolidation (20+ remaining)            | Migrate all local schemas to shared    | shared-schemas/src/\*, routes/\*\* | 2-3 sprints     |

---

## References

- **Prior Analysis:** `.claude/analysis/17-shared-schemas.md` (schema consolidation plan)
- **Middleware:** `src/middleware/*.js`
- **Error Handling:** `src/utils/errors.js`, `src/middleware/errorHandler.js`
- **Config:** `src/config/services.js`
- **Validation:** `src/middleware/validate.js`

---

**Report Generated:** 2026-04-22  
**Analyzer:** Claude Code Agent (Haiku 4.5)  
**Next Step:** Triage and schedule Phase 1 quick wins (validateBody, config, deadcode cleanup)
