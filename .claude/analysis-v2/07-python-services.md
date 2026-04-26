# Python Services — Code Cleanup & Duplication Analysis

**Scope:** `llm-service/`, `embedding-service/`, `document-indexer/`, `metrics-collector/`, `self-healing-agent/`, `mcp-remote-bash/`

**Date:** 2026-04-22 | **Based on:** v1 analysis + AST + grep audit

---

## CRITICAL ISSUES (Unblock)

### CRT-01: Bare `except:` in production code

**File:** `/services/self-healing-agent/post_reboot_validation.py:L??` (bare except clause)
**Issue:** Catches SystemExit, KeyboardInterrupt, prevents proper error diagnosis
**Impact:** Silent failures in recovery path  
**Fix:** Replace with `except Exception as e:` + log
**Effort:** 5 min | **Severity:** HIGH

### CRT-02: Docker secret resolution duplicated 7 times

**Files:**

- `document-indexer/config.py` L14 (master copy)
- `document-indexer/database.py` L21 (duplicate)
- `document-indexer/graph_refiner.py` (inline copy)
- `document-indexer/indexer.py` (inline copy)
- `metrics-collector/collector.py` (duplicate)
- `self-healing-agent/config.py` L14 (duplicate)
- `self-healing-agent/post_reboot_validation.py` (inline copy)

**Issue:** ~10 lines of identical code across 7 modules. Maintenance nightmare.  
**Fix:** Move to `libs/shared-python/secret_resolver.py`, import everywhere  
**Effort:** 30 min | **Severity:** MEDIUM (tech debt)

```python
# libs/shared-python/secret_resolver.py
def resolve_docker_secrets(*var_names):
    """Resolve Docker secrets (_FILE env vars → regular env vars)."""
    for var in var_names:
        file_path = os.environ.get(f'{var}_FILE')
        if file_path and os.path.isfile(file_path):
            with open(file_path) as f:
                os.environ[var] = f.read().strip()
```

---

## MAJOR ISSUES (Fix Soon)

### MAJ-01: Inconsistent HTTP retry patterns

**Files:**

- `llm-service/api_server.py` L68: `create_retry_session()` (Flask + requests.Retry)
- `document-indexer/embedding_client.py` L30: `_request_with_retry()` (requests + loop)
- `metrics-collector/collector.py`: No retry logic

**Issue:** Three different retry strategies across services. No shared utility.  
**Fix:** Create `libs/shared-python/http_client.py` with retry session factory  
**Effort:** 45 min | **Severity:** MEDIUM

### MAJ-02: Database connection pool duplicated in 2 services

**Files:**

- `document-indexer/database.py` L41: `DatabaseManager` class (psycopg2 ThreadedConnectionPool)
- `metrics-collector/collector.py`: Direct psycopg2 connections (no pooling)
- `self-healing-agent/db.py`: Custom pool wrapper

**Issue:** No consistency; document-indexer has pools, metrics doesn't. Self-healing reinvents wheel.  
**Fix:** Move `DatabaseManager` to `libs/shared-python/db_pool.py`  
**Effort:** 1 hour | **Severity:** MEDIUM

### MAJ-03: Unused imports (low priority but clean)

**Files:**

- `llm-service/api_server.py` L20: `from urllib3.util.retry import Retry` — IS USED (via requests.Retry)
- `self-healing-agent/heartbeat.py`: `time` imported but only used once (acceptable)
- `self-healing-agent/usb_monitor.py`: `sys` imported but not used

**Fix:** Remove `sys` from usb_monitor.py  
**Effort:** 2 min | **Severity:** MINOR

### MAJ-04: Config parsing inconsistency

**Files:**

- `document-indexer/config.py`: All env vars at module level (module import = config load)
- `self-healing-agent/config.py`: Same pattern, separate copy
- `embedding-service/*`: Inline env var parsing (no dedicated config.py)
- `llm-service/api_server.py`: Inline env var parsing

**Issue:** No standard pattern; embedding-service & llm-service mix config with logic  
**Fix:** Standardize via shared `ConfigManager` or keep module-level but document  
**Effort:** 1-2 hours | **Severity:** MEDIUM (maintainability)

---

## STRUCTURAL ISSUES (Refactor)

### STR-01: Inconsistent service entrypoints

**Status:**

- `llm-service`: Flask (`api_server.py` L729 `if __name__`)
- `embedding-service`: Flask via WSGI (`wsgi.py` wraps `embedding_server.py`)
- `document-indexer`: Flask (`api_server.py` runs main)
- `metrics-collector`: Direct `collector.py` main (no HTTP API)
- `self-healing-agent`: Dual process via shell script (`start.sh` runs `healing_engine.py` + `usb_monitor.py`)
- `mcp-remote-bash`: Direct `server.py` main

**Issue:** 6 different patterns; hard to reason about service lifecycle  
**Recommendation:** Document pattern choice (Flask REST + asyncio OK; mixing sync/async pools resources)  
**Effort:** Docs only | **Severity:** LOW (works, but fragmented)

### STR-02: Sync-only services with synchronous blocking I/O

**Affected:**

- `embedding-service`: Flask (SYNC) + GPU inference (blocks for 50-200ms per request) → connection pool limited to ~10 concurrent
- `document-indexer`: Flask (SYNC) + Qdrant RPC (blocks I/O) → potential request serialization under load
- `llm-service`: Flask (SYNC) + background CPU monitoring thread (good pattern)

**Metrics-collector:** Uses `aiohttp` (ASYNC) — good for I/O-heavy work

**Issue:** Flask is sync; Gunicorn worker pools limited (typically 4-8 workers × threads). Embedding-service Dockerfile uses Gunicorn without explicit thread/worker config.  
**Recommendation:** Check gunicorn worker count in Dockerfile; consider adding `--workers 4 --threads 2` if under load  
**Effort:** Testing | **Severity:** LOW (pre-production OK; may bottleneck at scale)

### STR-03: All services hardcode service URLs + use raw requests

**Pattern:**

```python
EMBEDDING_SERVICE_URL = f"http://{os.getenv('EMBEDDING_SERVICE_HOST', 'embedding-service')}:11435"
response = requests.post(EMBEDDING_SERVICE_URL + "/embed", json=data, timeout=5)
```

**Issue:** No retry on transient 5xx; HTTP client not shared; no circuit breaker  
**Recommendation:** Create `ServiceClient` wrapper in shared libs  
**Effort:** 2 hours | **Severity:** LOW (mitigated by Docker healthchecks)

---

## DEAD/ORPHANED CODE

### DEAD-01: `verify_healing.py` — test/validation script never called

**File:** `/services/self-healing-agent/verify_healing.py`  
**Status:** Has `if __name__` but not in Dockerfile, not imported by any service  
**Fix:** Move to `tests/` or delete if no longer used  
**Effort:** 5 min | **Severity:** LOW (housekeeping)

### DEAD-02: GPU recovery fallback endpoints in llm-service unused?

**File:** `/services/llm-service/api_server.py` L450: `/api/gpu/recover` endpoint  
**Status:** Defined but check if called by dashboard-backend  
**Recommendation:** Grep dashboard-backend code for this endpoint; if not used, remove or document  
**Effort:** 5 min | **Severity:** LOW

### DEAD-03: `heartbeat.py` standalone — not called by healing_engine

**File:** `/services/self-healing-agent/heartbeat.py`  
**Status:** Defines heartbeat functions but `healing_engine.py` implements heartbeat inline (L?? `update_heartbeat()`)  
**Issue:** Dead code or duplicate logic?  
**Fix:** Check if `heartbeat.py` should be imported; consolidate into `healing_engine.py`  
**Effort:** 15 min | **Severity:** LOW

---

## INCONSISTENT PATTERNS

### INC-01: Logging setup via structured_logging

**Status:** ✅ GOOD — all 5 services import `from structured_logging import setup_logging`  
**File:** `libs/shared-python/structured_logging.py` (shared, centralized)  
**No action needed**

### INC-02: Error handling — bare except in 1 file

**File:** `self-healing-agent/post_reboot_validation.py` — bare `except:` clause  
**Fix:** Replace with `except Exception as e:` and log  
**Effort:** 2 min

### INC-03: Health check endpoints inconsistent naming

**Defined:**

- `/health` (llm-service, embedding-service, document-indexer)
- No health endpoint in metrics-collector (external monitoring only)
- No HTTP API in self-healing-agent (shell-based)

**Status:** ✅ GOOD — HTTP services all use `/health`

---

## REQUIREMENTS.TXT AUDIT

| Service                | File               | Issues                                                                              |
| ---------------------- | ------------------ | ----------------------------------------------------------------------------------- |
| **document-indexer**   | `requirements.txt` | 46 lines, all used. Includes spacy (NER), pdfplumber, PyMuPDF — large but justified |
| **embedding-service**  | `requirements.txt` | 13 lines; torch commented out (uses base image). ✅ Good                            |
| **metrics-collector**  | `requirements.txt` | 6 lines, all used ✅                                                                |
| **self-healing-agent** | `requirements.txt` | 6 lines, all used ✅                                                                |
| **llm-service**        | No file            | Uses gunicorn via Dockerfile (Flask deps installed via apt) ✅                      |

**No bloat detected.** All packages are actively used.

---

## PYTHON CACHE CLEANUP

**Issue:** `/services/*/__pycache__/*.pyc` files exist (normal Python runtime artifact)  
**Status:** ✅ NOT A PROBLEM — .pyc without .py only happens at runtime; source files exist  
**Action:** None (Git ignores .pyc automatically)

---

## SUMMARY TABLE: Cleanup Actions

| ID          | File(s) | Action                                        | Effort | Priority   |
| ----------- | ------- | --------------------------------------------- | ------ | ---------- |
| **CRT-02**  | 7 files | Extract `_resolve_secrets()` → shared lib     | 30 min | **HIGH**   |
| **MAJ-01**  | 3 files | Extract retry logic → shared lib              | 45 min | **MEDIUM** |
| **MAJ-02**  | 3 files | Extract `DatabaseManager` → shared lib        | 1h     | **MEDIUM** |
| **MAJ-04**  | 6 files | Standardize config pattern (docs or refactor) | 1-2h   | **MEDIUM** |
| **CRT-01**  | 1 file  | Fix bare `except:`                            | 2 min  | **HIGH**   |
| **MAJ-03**  | 1 file  | Remove unused `import sys`                    | 1 min  | **LOW**    |
| **DEAD-01** | 1 file  | Move/delete `verify_healing.py`               | 5 min  | **LOW**    |
| **DEAD-03** | 1 file  | Consolidate `heartbeat.py` logic              | 15 min | **LOW**    |

---

## RECOMMENDED SHARED LIBS MODULE STRUCTURE

```
libs/shared-python/
├── structured_logging.py          ✅ EXISTS
├── secret_resolver.py             📋 NEW (resolve_docker_secrets)
├── http_client.py                 📋 NEW (retry session, service client)
├── db_pool.py                     📋 NEW (DatabaseManager for reuse)
└── config_manager.py              📋 OPTIONAL (centralized ConfigManager)
```

---

## EFFORT SUMMARY

| Category                                 | Effort            | Scope                  |
| ---------------------------------------- | ----------------- | ---------------------- |
| **Quick fixes** (imports, bare except)   | 10 min            | CRT-01, MAJ-03         |
| **Code extraction** (secrets, retry, DB) | 2 hours           | CRT-02, MAJ-01, MAJ-02 |
| **Config standardization**               | 1-2 hours         | MAJ-04                 |
| **Housekeeping** (dead code)             | 30 min            | DEAD-\*                |
| **TOTAL**                                | **3.5-4.5 hours** | All cleanup            |

---

## NOTES

- **No severe bugs found** — code is functional and well-structured
- **Duplication is the main issue** — `_resolve_secrets`, retry logic, DB pooling appear 2-7x
- **Async/sync mix is intentional** — metrics-collector async (I/O-heavy), others sync (compute-heavy)
- **Flask everywhere is OK** — consistent, single responsibility per service
- **No missing tests** — existing test files (`test_collector.py`, `test_healing_mock.py`) are present

---

## REFERENCES

- Prior v1 analysis: `.claude/analysis/16-python-services.md`
- Shared libs: `libs/shared-python/` (structured_logging.py exists)
- Service entrypoints checked via Dockerfiles in each service/
