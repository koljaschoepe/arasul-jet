# Scripts Ecosystem Analysis

**Scope:** `scripts/**/*.sh`, `arasul` CLI (60KB bash), `.husky/`, `Makefile` indirection
**Summary:** 62 shell scripts + 2 Python. 2 CRITICAL (broken husky hooks), 5 MAJOR, 5+ MINOR. ~8–12h full remediation.

---

## CRITICAL

### 1. Broken Husky Hooks — Wrong Script Paths

- `.husky/pre-commit:35` → `./scripts/run-typecheck.sh` — **file does not exist** (actual: `./scripts/test/run-typecheck.sh`)
- `.husky/pre-push:15` → `./scripts/run-tests.sh` — **file does not exist** (actual: `./scripts/test/run-tests.sh`)
- **Impact:** Every commit/push fails the hook silently (or visibly) — blocks contribution flow.
- **Action:** Fix two paths.
- **Effort:** S (5 min)

### 2. arasul CLI setup_secrets() Missing Write Verification

- **Location:** `arasul:1050+`
- **Issue:** Writes config/secrets files without verifying success — on disk-full / permission errors, creates empty secret files that fail containers later.
- **Action:** Add `test -s "$secret_file" || exit 1` after each write.
- **Effort:** S (15 min)

---

## MAJOR

### 3. Logging Duplication — 19/62 Scripts Use Shared Lib

- `scripts/lib/logging.sh` exists but only 19 of 62 scripts source it.
- Same `log()` body redefined in `scripts/backup/*.sh`, `scripts/deploy/*.sh`, `scripts/security/*.sh`, `scripts/util/*.sh`.
- **Action:** Enforce sourcing; create `log(LEVEL, msg)` wrapper in lib.
- **Effort:** M (1–2h)

### 4. Hardcoded Absolute Paths Break Portability

- `scripts/recovery/restore-from-backup.sh:17` → `/home/arasul/arasul/arasul-jet/data/backups`
- `scripts/system/deadman-switch.sh:95,107` → `/opt/arasul` OR `/home/arasul/arasul/arasul-jet` fallback
- `scripts/security/harden-ssh.sh:67` → `/home/arasul` fallback if `$HOME` unset
- **Action:** Use `SCRIPT_DIR` + relative paths, `${HOME:?}` fail-fast.
- **Effort:** S–M (30 min)

### 5. Jetson Detection Logic Duplicated

- `scripts/setup/detect-jetson.sh:24–98` — canonical 5-stage detection
- `arasul:536–590` — inline re-implementation checking only `/proc/device-tree/model`
- **Action:** Remove inline checks; always source `detect-jetson.sh`.
- **Effort:** S (20 min)

### 6. Orphaned Scripts — 13 Never Invoked

Not called by `arasul`, Makefile, CI, or Docker:

1. `scripts/setup/setup-dev-tools.sh` (26 L)
2. `scripts/setup/setup_dev.sh` (253 L)
3. `scripts/system/deadman-switch.sh` (160 L)
4. `scripts/system/docker-watchdog.sh`
5. `scripts/util/auto-restart-service.sh`
6. `scripts/util/claude-autonomous.sh`
7. `scripts/util/setup_logrotate.sh`
8. `scripts/util/start-mcp-server.sh`
9. `scripts/util/telegram-notify.sh` (93 L — orphan parent)
10. `scripts/validate/validate-permissions.sh`
11. `scripts/test/setup/detect-jetson.test.sh`
12. `scripts/test/setup/interactive-setup.test.sh`
13. `scripts/validate/validate_dependencies.sh` (duplicates `validate_config.sh`)

**Action:** Audit each — integrate into `arasul` CLI OR delete OR move to `scripts/experimental/`.
**Effort:** M (2–4h)

### 7. Test Scripts Not in CI

`.github/workflows/test.yml` runs Jest/Vitest but ignores:

- `scripts/test/smoke-test.sh`
- `scripts/test/integration-test.sh` (541 LOC!)
- `scripts/test/fresh-deploy-test.sh` (~300 LOC)
- `scripts/test/load-test.sh`
- `scripts/test/stress-test.sh`
- `scripts/test/dr-drill.sh`
- `scripts/test/measure-performance.sh`

**Action:** Wire high-value tests into CI OR move to `scripts/test/manual/`.
**Effort:** M (2–3h)

---

## MINOR

### 8. `set` Options Inconsistency

- 44 scripts: `set -euo pipefail` ✓
- 6 scripts: `set -e` only
- 3 scripts: `set -uo pipefail`
- 1 script (`setup_dev.sh:6`): `set -a` — dangerous if sourced
- **Action:** Project-level lint or pre-commit rule.
- **Effort:** S (30 min)

### 9. Stale TODO Comments

- `scripts/setup/detect-jetson.sh:140` — "TODO: Update to r37.0.0 when dustynv publishes"
- `.github/workflows/test.yml:69` — "TODO(Phase-6.1b): frontend lint has ~1500 legacy errors"
- **Action:** Convert to GitHub issues.
- **Effort:** S (10 min)

### 10. Inconsistent Error Handling

Some use `|| exit 1`, others rely on `set -e`, others `if !; then; fi`. Document one pattern.

---

## KILL LIST

| Script                                      | Size | Reason                          |
| ------------------------------------------- | ---- | ------------------------------- |
| `scripts/setup/setup-dev-tools.sh`          | 26 L | Orphaned                        |
| `scripts/util/auto-restart-service.sh`      | ?    | Orphaned                        |
| `scripts/util/setup_logrotate.sh`           | ?    | Orphaned                        |
| `scripts/util/start-mcp-server.sh`          | ?    | Orphaned                        |
| `scripts/validate/validate-permissions.sh`  | ?    | Orphaned                        |
| `scripts/validate/validate_dependencies.sh` | ?    | Duplicate of validate_config.sh |
| `scripts/test/setup/*.test.sh`              | ?    | Not in CI, not invoked          |

## REFACTOR LIST

| Target                             | Effort | Priority     |
| ---------------------------------- | ------ | ------------ |
| Fix husky hook paths               | S      | **Critical** |
| setup_secrets write verify         | S      | Critical     |
| Consolidate logging to lib         | M      | High         |
| Remove arasul inline Jetson detect | S      | High         |
| Wire critical tests into CI        | M      | High         |
| Hardcoded paths → portable         | S      | Medium       |
