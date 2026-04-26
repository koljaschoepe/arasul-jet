# Documentation Audit

**Scope:** `README.md`, `docs/**`, `CLAUDE.md`, `.claude/context/**`, `CHANGELOG.md`, `BUGS_AND_FIXES.md`
**Summary:** 12 major issue categories. Biggest risk: **wrong migration numbers in 6 places** → new devs collide on DB migrations.

---

## CRITICAL

### 1. Migration Numbers Wildly Outdated (6 locations)

Actual latest: `081_cleanups_include_infra.sql`. Claimed:

- `CLAUDE.md:14` — "59 Migrationen"
- `CLAUDE.md:31` — "nächste: 078\_\*.sql"
- `.claude/context/migration.md:7` — "Next Migration: 059\_\*.sql"
- `.claude/context/database.md:7` — "next available: 059\_\*.sql"
- `.claude/context/telegram.md:115` — "nächste: 059\_\*.sql"
- `.claude/context/base.md:106` — "next: 053"

**Impact:** New devs creating migrations will collide with existing files.
**Action:** Global search/replace; add a script `scripts/docs/check-migration-number.sh` pre-commit.
**Effort:** M

### 2. Broken Link in INDEX.md — telegram-bot Service

- **File:** `docs/INDEX.md:108` → `[Telegram Bot](../services/telegram-bot/README.md)`
- Service was migrated to `apps/dashboard-backend/src/routes/telegram/`. The external directory no longer exists.
- **Action:** Remove link or redirect to backend route docs.
- **Effort:** S

### 3. BUGS_AND_FIXES.md — OPEN SQL INJECTION (SEC-001)

- **File:** `BUGS_AND_FIXES.md`
- **Marked "NOCH OFFEN"**: SQL injection in `n8nLogger.js:152, 239`
- **Action:** Fix immediately; then resolve the log entry.
- **Effort:** S (fix) — urgent

---

## HIGH

### 4. DB Table Count Drift

- `docs/DATABASE_SCHEMA.md:8–11` (auto-generated 2026-04-21) claims 88 tables.
- `CLAUDE.md:14` claims 85.
- **Action:** Re-run `scripts/docs/generate-db-schema.sh`; reconcile CLAUDE.md.
- **Effort:** S

### 5. Stale Docs in docs/archive/

- `docs/archive/UPDATE_PACKAGE_TOOL.md` — completed migration, tooling obsolete
- `docs/archive/UPDATE_PACKAGE_TEST_REPORT.md` — one-time test report
- **Action:** DELETE (they're already "archived" by location).
- **Effort:** S

### 6. Multiple Competing Phase Plans

- `docs/RAG_OPTIMIZATION_PLAN.md`
- `docs/COMPREHENSIVE_IMPROVEMENT_PLAN.md`
- `docs/LLM_OPTIMIZATION_PLAN.md`
- `docs/PRODUCTION_HARDENING_PLAN.md`
- `docs/PLATFORM_REFACTORING_PLAN.md`
- `docs/PRODUCTION_READINESS_PLAN.md`

**Problem:** No master roadmap. Unclear which is active.
**Action:** Create `docs/ROADMAP.md` as single source of truth; archive/mark obsolete plans.
**Effort:** M

### 7. Language Policy Undefined

- `README.md`: German
- `CLAUDE.md`: German + English section titles
- `docs/ONBOARDING.md`: English
- `docs/GETTING_STARTED.md`: English
- `docs/QUICK_START.md`: German
- `docs/ADMIN_HANDBUCH.md`: German

No documented policy — devs bounce between languages.
**Action:** Create `docs/LANGUAGE_POLICY.md`: English for developer-facing, German for admin/customer-facing.
**Effort:** S (policy); refactoring content is L.

---

## MEDIUM

### 8. BUGS_AND_FIXES.md — Lifecycle Unclear

76 KB, 2677 lines. Mix of resolved + open bugs. No clear archive policy.
**Action:** Split into `BUGS_OPEN.md` (living) + `BUGS_ARCHIVE/2025.md` (resolved, per-year).
**Effort:** L (reorganization)

### 9. README vs API_REFERENCE Duplication

- `README.md:142–169` inline API quick reference
- `docs/API_REFERENCE.md` full reference
- **Action:** README should link, not repeat.
- **Effort:** S

### 10. GETTING_STARTED.md References Removed Service

- Line 147 mentions telegram-bot in service list.
- **Action:** Update to backend-integrated model.
- **Effort:** S

### 11. Missing Dev Onboarding Docs

- No "Day 1 Setup Checklist" with IDE, env, local Docker steps
- No "Debugging Guide" (logs, breakpoints, network inspection)
- No architecture diagram (text references but no visual)
- **Action:** Create `docs/DEVELOPER_ENVIRONMENT.md`.
- **Effort:** M

### 12. Env Var Doc Drift (not fully audited)

`docs/ENVIRONMENT_VARIABLES.md` vs `.env.template` — flagged as likely stale per prior analysis pattern.
**Action:** Run `diff <(grep -oE '^[A-Z_]+=' .env.template) <(grep -oE '`[A-Z_]+`' docs/ENVIRONMENT_VARIABLES.md)`.
**Effort:** S–M

---

## KILL LIST

| File                                         | Reason                                          |
| -------------------------------------------- | ----------------------------------------------- |
| `docs/archive/UPDATE_PACKAGE_TOOL.md`        | Obsolete one-time doc                           |
| `docs/archive/UPDATE_PACKAGE_TEST_REPORT.md` | Obsolete one-time doc                           |
| `docs/COMPREHENSIVE_IMPROVEMENT_PLAN.md`     | Superseded (verify)                             |
| `docs/PRODUCTION_READINESS_PLAN.md`          | Historical snapshot — move to archive or delete |

## REWRITE LIST

| File                           | Why                                                  |
| ------------------------------ | ---------------------------------------------------- |
| `CLAUDE.md`                    | Migration numbers (2 lines), language policy section |
| `.claude/context/migration.md` | Migration number section                             |
| `.claude/context/database.md`  | Migration count from 59 → actual                     |
| `.claude/context/base.md`      | "next: 053" → actual                                 |
| `.claude/context/telegram.md`  | Migration numbers                                    |
| `BUGS_AND_FIXES.md`            | Split into OPEN + ARCHIVE; fix SEC-001 SQL injection |
| `docs/INDEX.md:108`            | Remove broken telegram-bot link                      |
| `docs/GETTING_STARTED.md:147`  | Remove telegram-bot service reference                |

## MISSING DOCS

| File                            | Purpose                            |
| ------------------------------- | ---------------------------------- |
| `docs/DEVELOPER_ENVIRONMENT.md` | Day-1 setup, IDE, tests, debugging |
| `docs/ROADMAP.md`               | Master execution plan              |
| `docs/LANGUAGE_POLICY.md`       | En vs De policy                    |
| `docs/MIGRATION_GUIDE.md`       | How to create new migration        |
