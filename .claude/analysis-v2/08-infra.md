# Infrastructure Analysis — Docker / Compose / Traefik / Config

**Scope:** `docker-compose.yml`, `compose/**.yaml`, `config/**`, `.env*`, `Dockerfile`s, `Makefile`, `.dockerignore`, `.gitignore`
**Status:** Several CRITICAL dead-config blockers; mostly cosmetic otherwise.

---

## CRITICAL / BLOCKERS

### 1. Dead Traefik Route — claude-terminal-service

- **File:** `config/traefik/routes.yml:115–123`
- **Issue:** Route targets `http://claude-code:7681`; no `claude-code` service in any compose file.
- **Evidence:** grep across `compose/compose.core/ai/app/monitoring/external/secrets.yaml` → no match.
- **Impact:** 503 errors at `/claude-terminal`.
- **Action:** Either remove route OR create `claude-code` service definition.
- **Effort:** S (5m removal) or M (30m service creation)

### 2. Orphan Telegram Secret Declarations

- **File:** `compose/compose.secrets.yaml:18–21`
- **Issue:** `telegram_encryption_key`, `telegram_bot_token` defined but never mounted (Telegram service removed).
- **Action:** DELETE lines 18–21.
- **Effort:** S (1 min)

### 3. Orphan Env Var — RAM_LIMIT_TELEGRAM

- **File:** `config/profiles/jetson.env:14`
- **Issue:** `RAM_LIMIT_TELEGRAM=256M` — no `${RAM_LIMIT_TELEGRAM}` reference anywhere.
- **Action:** DELETE line.
- **Effort:** S (1 min)

### 4. Hardcoded DOCKER_NETWORK

- **File:** `compose/compose.app.yaml:70`
- **Issue:** `DOCKER_NETWORK: arasul-platform_arasul-backend` hardcoded.
- **Impact:** Breaks when `COMPOSE_PROJECT_NAME` changes.
- **Action:** Use `${COMPOSE_PROJECT_NAME}_arasul-backend` or query `docker network ls`.
- **Effort:** S (10 min)

---

## MAJOR

### 5. Telegram Secrets Still Mounted on dashboard-backend

- **File:** `compose/compose.secrets.yaml:38–55` (lines 45–46)
- **Issue:** `telegram_encryption_key`, `telegram_bot_token` injected into dashboard-backend. Service no longer uses them (dead code in `src/utils/resolveSecrets.js`).
- **Action:** Remove lines 45–46.
- **Effort:** S (2 min)

### 6. SERVICE_URL localhost Hardcode

- **File:** `compose/compose.ai.yaml:115`
- **Issue:** `SERVICE_URL: http://localhost:${EMBEDDING_SERVICE_PORT:-11435}`. Inside container, `localhost` ≠ service hostname.
- **Impact:** Self-registration / discovery likely broken.
- **Action:** Replace `localhost` → `embedding-service`.
- **Effort:** S (2 min)

### 7. Inconsistent Healthcheck Intervals

- Intervals: 10s (postgres, minio, docker-proxy, dashboard-backend/frontend), 15s (n8n), 30s (qdrant, llm-service, embedding-service, document-indexer, metrics-collector, self-healing, backup, loki, promtail, reverse-proxy), 60s (self-healing-agent).
- **Action:** Standardize to 30s (or document rationale per service).
- **Effort:** S (15 min)

### 8. Embedding-Service start_period 600s

- **File:** `compose/compose.ai.yaml:154`
- **Issue:** `start_period: 600s` (10 min!) — blocks document-indexer start for 10 min on first deploy.
- **Action:** Reduce to 300s, bump timeout to 10s.
- **Effort:** S (2 min). Prior analysis I-B01.

---

## MINOR / COSMETIC

### 9. RAM Limit Notation Inconsistency

- Some `6G`, some potentially `6.0G`. Docker accepts both; standardize to integers.

### 10. Missing Version Env in n8n

- No `BUILD_HASH` / `SYSTEM_VERSION` env on n8n unlike dashboard-backend.
- **Effort:** S (5 min)

### 11. Unused Volume — arasul-logs

- **File:** `compose/compose.monitoring.yaml:230`
- **Issue:** Defined but never referenced.
- **Action:** DELETE or document purpose.
- **Effort:** S (1 min)

### 12. Makefile Test Target

- `Makefile:51` references `./scripts/test/run-tests.sh` — verify exists, add guard.
- **Effort:** S (5 min)

### 13. .gitignore Over-Broad

- Line 81 ignores `config/base/` — `base.env` likely should be versioned. Use `!config/base/base.env` exception.
- **Effort:** S (2 min)

---

## STRUCTURAL REDUNDANCIES

### 14. Duplicate Python Dockerfile Pattern

- `document-indexer`, `metrics-collector`, `self-healing-agent` each build from `python:${PYTHON_VERSION}-slim`, copy `requirements.txt`, copy shared `structured_logging.py`, UID 1000.
- **Opportunity:** Shared base `services/python-app-base/Dockerfile`.
- **Effort:** M (30 min) — optional tech debt, not blocking.

### 15. n8n Build Context Deviates

- **File:** `compose/compose.app.yaml:160`
- Uses `context: ../services/n8n`; all others use `context: ..` with explicit `dockerfile:`.
- **Action:** Standardize for consistency.
- **Effort:** S (2 min)

---

## PRIOR ANALYSIS (10-infra-docker.md) STATUS

| Prior Item                                         | Status                                                 |
| -------------------------------------------------- | ------------------------------------------------------ |
| I-B01 (embedding start_period 600s)                | NOT RESOLVED (line 154)                                |
| I-M05 (group_add GID 994)                          | Partially — docker-proxy in use, group_add still there |
| I-M06 (Jetson LD_LIBRARY_PATH hardcoded JetPack 6) | NOT RESOLVED (line 65)                                 |

---

## KILL LIST

| Target                            | File:Line                             | Effort |
| --------------------------------- | ------------------------------------- | ------ |
| claude-code Traefik route         | `config/traefik/routes.yml:115-123`   | 5m     |
| Telegram orphan secret decls      | `compose/compose.secrets.yaml:18-21`  | 1m     |
| Telegram secret mounts on backend | `compose/compose.secrets.yaml:45-46`  | 2m     |
| RAM_LIMIT_TELEGRAM env            | `config/profiles/jetson.env:14`       | 1m     |
| arasul-logs unused volume         | `compose/compose.monitoring.yaml:230` | 1m     |

## REFACTOR LIST

| Target                           | Effort | Priority |
| -------------------------------- | ------ | -------- |
| DOCKER_NETWORK env-ify           | S      | Critical |
| SERVICE_URL localhost fix        | S      | Major    |
| Healthcheck interval standardize | S      | Major    |
| Embedding start_period 600s→300s | S      | Major    |
| Shared python-app-base image     | M      | Low      |

---

## QUICK WINS (<5 min each)

1. Delete telegram secrets (4 lines)
2. Delete RAM_LIMIT_TELEGRAM
3. Delete arasul-logs volume
4. Fix SERVICE_URL localhost
5. Reduce embedding start_period
