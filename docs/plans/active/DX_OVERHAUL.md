# DX Overhaul — Developer Experience & Claude Code Setup

> **Status:** Active · **Owner:** Kolja · **Created:** 2026-05-03 · **Target:** 2026-05-17 (≈2 weeks)
>
> **Goal:** Reduce onboarding-to-productive time from "1–2 days" to "<2 hours" for a mid-level developer cloning the repo, while making the Claude Code setup a best-in-class reference.

---

## 0. Vision

Two audiences have to love this repo:

1. **A new mid-level developer** clones it, reads `README.md`, runs **one command**, and is editing code with hot-reload within 15 minutes — even on an x86 laptop without a Jetson.
2. **Claude Code (and any other AI coding agent)** opens the repo and instantly understands the architecture, conventions, and available workflows from `.claude/` + `CLAUDE.md` files at every level.

The repo today is structured as an **appliance image** (customer-first). After this overhaul it is structured as a **product codebase** — appliance qualities preserved, but development workflow is first-class.

---

## 1. Acceptance Criteria (Definition of Done)

The overhaul is complete when **all** of the following are true:

| #    | Criterion                                                                                                                                                                                                    | Verification                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| AC1  | A mid-level dev with no Jetson can run `make dev` on macOS/Linux x86 and have backend + frontend hot-reloading within 15 min of `git clone`.                                                                 | Manual smoke-test on macOS host.                                     |
| AC2  | `README.md` is ≤ 200 lines and contains exactly one canonical "Get Started" command. No conflicting setup paths exist anywhere.                                                                              | `wc -l README.md` and grep across `docs/`.                           |
| AC3  | `CONTRIBUTING.md` exists at repo root and covers: commit format, PR workflow, branching, language policy, test policy, slash-command catalog.                                                                | File exists, all sections present.                                   |
| AC4  | `docs/` contains ≤ 30 markdown files at top level (down from 56). All "superseded" or "archived" content has moved to `docs/plans/archive/` or `docs/archive/`.                                              | `find docs -maxdepth 1 -name '*.md' \| wc -l`.                       |
| AC5  | `.claude/` has the canonical structure: `commands/`, `agents/`, `hooks/`, `skills/`, `context/`, plus `settings.json`, `settings.local.json`, `README.md`. No stale plan files in `.claude/` root.           | `ls .claude/`.                                                       |
| AC6  | At least 20 slash commands exist in `.claude/commands/`, all verb-first names (`/add-route`, `/run-tests-backend`, etc.), all with valid YAML frontmatter (`description`, `argument-hint`, `allowed-tools`). | File count + frontmatter lint.                                       |
| AC7  | At least 6 subagents exist in `.claude/agents/` with proper frontmatter and tool restrictions.                                                                                                               | File count + frontmatter lint.                                       |
| AC8  | `.github/workflows/ci.yml` exists and runs lint + typecheck + tests + compose-validate on every PR.                                                                                                          | Green build on a smoke-test PR.                                      |
| AC9  | Every directory under `apps/`, `services/`, `scripts/`, `compose/`, `config/` has either a `README.md` or a `CLAUDE.md` (or both) explaining its purpose.                                                    | `find . -type d -depth 2 -not -path '*/node_modules/*'` cross-check. |
| AC10 | All naming-convention outliers identified by audit are fixed (1 frontend file, 8 bash scripts), with cross-references updated and tests passing.                                                             | `git grep` of old names returns 0 results.                           |
| AC11 | The `interactive_setup.sh`-lie is gone — every script referenced in docs actually exists.                                                                                                                    | Doc-link checker script.                                             |
| AC12 | All English. Every doc, README, slash-command, and CONTRIBUTING file is in English. (Internal `.claude/memory/` and personal notes may stay German.)                                                         | Sample audit + grep for German keywords.                             |

---

## 2. Design Decisions (User-confirmed via interview)

These were settled before this plan was written and should not be reopened mid-implementation:

| Decision                 | Choice                                                                                             | Rationale                                                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Doc language**         | English throughout                                                                                 | Onboardability for international devs, future open-source readiness.                           |
| **Slash-command naming** | Verb-first, hyphenated, no namespace colon (`/add-route`, `/create-migration`, `/rebuild-service`) | Most readable for newcomers; works with autocomplete.                                          |
| **Plans location**       | `docs/plans/{active,archive,audits}/`                                                              | Visible in repo, GitHub-browsable, separates "plans" from `.claude/` operational config.       |
| **DX depth**             | Full — `compose.dev.yml` with mock LLM/Qdrant + `make dev` + GitHub Actions CI                     | One-time investment, removes the single biggest friction point (15-min cold-start vs. 2 days). |

---

## 3. Out of Scope (Explicitly Not in This Plan)

- New product features. This is pure DX/structure work.
- Migrating any production data or breaking the running Jetson.
- Rewriting existing routes, components, or services. We only restructure, document, and add tooling.
- Translating existing German content to English in a single sweep — this happens **incrementally** as files are touched (Stage 1 covers obvious onboarding files; rest follows organically).
- Replacing the `arasul` CLI. It stays as is; we only document it.

---

## 4. Stage Map (13 stages, sequenced by risk + dependency)

```
Stage 0 ── Foundation (branch, backups, plan into repo)
   │
Stage 1 ── Plans & Audits Cleanup (low-risk, big visual win)
   │
Stage 2 ── docs/ Reorganization
   │
Stage 3 ── README + CONTRIBUTING + ARCHITECTURE
   │
Stage 4 ── Subfolder CLAUDE.md hierarchy
   │
Stage 5 ── .claude/ Restructure (folder skeleton + cleanup)
   │
Stage 6 ── Slash Commands (~22, verb-first, English)
   │
Stage 7 ── Subagents (8 in .claude/agents/)
   │
Stage 8 ── Settings + Hooks (settings.json + hooks/)
   │
Stage 9 ── scripts/ + services/ Standardization
   │
Stage 10 ── DX Mock-Stack + make dev (HEAVY)
   │
Stage 11 ── GitHub Actions CI
   │
Stage 12 ── Naming + .env Cleanup (cross-ref-heavy)
   │
Stage 13 ── Final Polish & Smoke-Test
```

**Total estimated effort:** ~10–14 working days (solo). Staged so each stage produces a usable, mergeable commit. Stages 1–8 are mostly mechanical; Stages 9–11 are the "real engineering"; Stages 12–13 are polish.

---

## 5. Detailed Stage Specs

Each stage below has: **Goal · Pre-conditions · Tasks · Files · Acceptance · Risk · Rollback · Estimate**.

---

### Stage 0 — Foundation

**Goal:** Set up the working branch, snapshot current state, land this plan in the repo.

**Pre-conditions:** Currently on `feat/telegram-bot-overhaul`. Decision needed: branch off main directly, or stack on top of telegram-overhaul? **Recommendation:** new branch `feat/dx-overhaul` from `main`, so the two streams stay independently mergeable.

**Tasks:**

1. Confirm with user: branch from `main` or stack on `feat/telegram-bot-overhaul`?
2. Create branch `feat/dx-overhaul`.
3. Create folders: `docs/plans/{active,archive,audits}/` (already done as part of writing this plan).
4. Move this plan to `docs/plans/active/DX_OVERHAUL.md` (already done).
5. Create a tarball backup of `.claude/` and `docs/` in `/tmp/` for safety.
6. Commit Stage 0: `chore: open dx-overhaul, scaffold docs/plans tree`.

**Files:**

- Created: `docs/plans/{active,archive,audits}/`, `docs/plans/active/DX_OVERHAUL.md`.
- Touched: none.

**Acceptance:** Branch exists, plan committed, backups in `/tmp/`.

**Risk:** None.
**Rollback:** Delete branch.
**Estimate:** 30 min.

---

### Stage 1 — Plans & Audits Cleanup

**Goal:** Move all stale, completed, or superseded plans/audits out of `.claude/` and `docs/` root into `docs/plans/{archive,audits}/`. Single source of truth.

**Pre-conditions:** Stage 0 done.

**Tasks:**

1. **Move from `.claude/` root → `docs/plans/archive/` (with date-prefix rename):**
   - `.claude/ANALYSIS_PLAN.md` → `docs/plans/archive/2026-04-21_analysis-plan.md`
   - `.claude/CLEANUP_PLAN.md` → `docs/plans/archive/2026-04-22_cleanup-plan.md`
   - `.claude/FRONTEND_OPTIMIZATION_PLAN.md` → `docs/plans/archive/2026-04-26_frontend-optimization-plan.md`
   - `.claude/current_prd.md` → `docs/plans/archive/2026-01-15_telegram-prd.md` (UTF-8-broken; fix encoding on the way)
   - `.claude/plans/fix-001-sql-injection-datentabellen.md` → `docs/plans/archive/2026-03-08_fix-001-sql-injection.md`
2. **Move from `docs/` root → `docs/plans/archive/` (these are self-marked "Archived/Superseded"):**
   - `docs/COMPREHENSIVE_IMPROVEMENT_PLAN.md`
   - `docs/PRODUCTION_HARDENING_PLAN.md`
   - `docs/PRODUCTION_READINESS_PLAN.md`
   - `docs/PRODUCTION_READINESS_REPORT.md`
   - `docs/PLATFORM_REFACTORING_PLAN.md`
   - `docs/LLM_OPTIMIZATION_PLAN.md` (superseded by LLM_RAG_N8N_HARDENING)
   - `docs/RAG_OPTIMIZATION_PLAN.md` (same)
   - `docs/BUGS_ARCHIVE.md` → `docs/archive/BUGS_ARCHIVE.md` (different folder — historical bug log, not a plan)
3. **Move from `.claude/` → `docs/plans/audits/`:**
   - `.claude/analysis/` → `docs/plans/audits/analysis-2026-04-21/`
   - `.claude/analysis-v2/` → `docs/plans/audits/analysis-2026-04-22/`
4. **Status-header injection** (top of each archived file):
   ```markdown
   > **Archived 2026-05-03.** Originally created on YYYY-MM-DD. Superseded by `docs/plans/active/...` or completed.
   > Kept for historical reference. Do not act on the contents.
   ```
5. **Add `docs/plans/README.md`** explaining `active/`, `archive/`, `audits/` semantics.
6. **Update `MEMORY.md`** entries that reference moved files (the `phase*.md` chain — keep memory entries, just fix path references if any are absolute).
7. Commit: `docs(plans): consolidate stale plans into docs/plans/{archive,audits}`.

**Files:** ~15 moves, 3 new (`docs/plans/README.md`, `docs/archive/` folder, `docs/plans/active/DX_OVERHAUL.md` already exists).

**Acceptance:**

- `ls .claude/` shows no `*PLAN*.md`, no `analysis*/`, no `current_prd.md`.
- `ls docs/*.md \| grep -i plan` returns nothing.
- `docs/plans/archive/` has ≥ 12 files, each with status header.
- `docs/plans/audits/` has 2 subfolders.

**Risk:** Low. Only moves, no content edits except header injection. Git tracks renames cleanly with `git mv`.

**Rollback:** `git revert` the commit.

**Estimate:** 1 h.

---

### Stage 2 — docs/ Reorganization

**Goal:** Take `docs/` from 56 files to ~25 top-level + organized subfolders. Merge duplicates. Translate user-facing onboarding docs to English.

**Pre-conditions:** Stage 1 done (no more plans in `docs/` root).

**Tasks:**

1. **Create subfolders:**
   - `docs/development/` (ONBOARDING, DEVELOPMENT, TESTING, DESIGN_SYSTEM, LANGUAGE_POLICY)
   - `docs/api/` (API_REFERENCE, API_ERRORS, DATABASE_SCHEMA, HEALTH_CONTRACT)
   - `docs/ops/` (DEPLOYMENT, TROUBLESHOOTING, ADMIN_HANDBUCH, UPDATE_SYSTEM, LOGGING, REMOTE_MAINTENANCE, BACKUP_SYSTEM, DISASTER_RECOVERY)
   - `docs/ops/security/` (PHASE2_LUKS_SETUP, PHASE2_COSIGN_SETUP, MARKETING_HONESTY → rename to `COMPLIANCE_NOTES.md`)
   - `docs/features/` (MINIO_SERVICE, SELF_HEALING_IMPLEMENTATION, CUSTOMER_OAUTH_SETUP, JETSON_COMPATIBILITY, FAQ)
   - `docs/archive/` (already created in Stage 1 for BUGS_ARCHIVE)

2. **Mergers (consolidate duplicates):**
   - `docs/ONBOARDING.md` + `docs/GETTING_STARTED.md` → `docs/development/ONBOARDING.md` (single source). Translate to English. Verify every command actually works.
   - `docs/DEPLOYMENT.md` + `docs/FRESH_DEPLOY_GUIDE.md` → `docs/ops/DEPLOYMENT.md`. Translate to English.
   - `docs/QUICK_START.md` stays separate — it is **customer-facing** (end-user appliance setup), not dev. Move to `docs/ops/QUICK_START.md`. Stays in German (intended audience).

3. **Move all remaining files into the right subfolder.** Top-level `docs/` keeps only:
   - `INDEX.md` (rewritten — see step 5)
   - `ARCHITECTURE.md`
   - `ROADMAP.md`
   - `ENVIRONMENT_VARIABLES.md` (referenced from many places)

4. **Translate to English** the onboarding-critical files only:
   - `docs/development/ONBOARDING.md`
   - `docs/development/DEVELOPMENT.md` (already mostly English)
   - `docs/api/API_REFERENCE.md` (already English)
   - `docs/ARCHITECTURE.md` (already English)

   Other German files (ADMIN_HANDBUCH, MARKETING_HONESTY) get an English title-line + 2-sentence summary at top, but bodies stay German for now (translate-as-touched policy in CONTRIBUTING.md).

5. **Rewrite `docs/INDEX.md`** as a structured map:

   ```markdown
   # Documentation Index

   ## Start here

   - Newcomer dev → development/ONBOARDING.md
   - Operator → ops/DEPLOYMENT.md
   - Customer → ops/QUICK_START.md

   ## Subject areas

   - development/ (onboarding, dev workflow, testing, design system)
   - api/ (REST endpoints, errors, schemas, health contracts)
   - ops/ (deployment, troubleshooting, admin guide, security setup)
   - features/ (per-service feature docs)
   - plans/ (active / archive / audits)
   - legal/ (templates, compliance)
   ```

6. Commit: `docs: reorganize into subfolders, merge onboarding/deployment duplicates, EN translation pass`.

**Files:** ~40 moves, 4 mergers (each producing 1 new file from 2 old), ~5 translation passes, 1 INDEX.md rewrite.

**Acceptance:**

- `find docs -maxdepth 1 -name '*.md' \| wc -l` → ≤ 6.
- No file contains both English and German in the same paragraph (manual sample of 5 files).
- Every link in the new `INDEX.md` resolves.
- Running `grep -r "GETTING_STARTED" .` returns at most 1 stale ref (which gets fixed).

**Risk:** Medium — many internal links and `git log`-traceable file moves. Use `git mv` to preserve blame.

**Rollback:** Single revert if something obvious breaks; otherwise selective fix-forward.

**Estimate:** 4 h (most of it the EN translation + careful link-fixing).

---

### Stage 3 — README + CONTRIBUTING + ARCHITECTURE (Root)

**Goal:** A new dev cloning the repo sees three short, useful root files: `README.md` (what is this + one-line getting started), `CONTRIBUTING.md` (how to work on it), and `ARCHITECTURE.md` (where everything lives).

**Pre-conditions:** Stages 1–2 done.

**Tasks:**

1. **Trim `README.md` from 516 → ≤ 200 lines.** Sections (in order):
   - **What is Arasul** (3–5 lines, English).
   - **Choose your path** — three branches:
     - "I have a Jetson Orin/Thor and want to deploy" → `./arasul bootstrap` → link to `docs/ops/DEPLOYMENT.md`.
     - "I'm a developer on macOS/Linux x86" → `make dev` → link to `docs/development/ONBOARDING.md` and `CONTRIBUTING.md`.
     - "I'm an end-customer setting up the appliance" → link to `docs/ops/QUICK_START.md`.
   - **Architecture at a glance** (re-use the diagram from CLAUDE.md, simplified).
   - **Repo layout** (one-line per top-level folder).
   - **Where to look next** (links to docs/INDEX.md, docs/ARCHITECTURE.md, CONTRIBUTING.md).
   - **License / Contact**.

2. **Write `CONTRIBUTING.md`** (new, English, ~250 lines). Sections:
   - Development setup (`make dev`, doctor.sh, Mock-LLM stack).
   - Branching: `main` is protected; feature branches `feat/...`, fixes `fix/...`, refactors `refactor/...`.
   - Commit format: `<type>(<scope>): <subject>` — types from `feat|fix|docs|refactor|test|chore|ci|build|perf`.
   - PR workflow: title format, body checklist, required reviewers, CI must be green.
   - Test policy: run `./scripts/test/run-tests.sh --backend` before push; CI runs full suite.
   - Language policy: New docs/code/comments in English. Existing German content gets translated as it's touched (no big-bang translation sweep). Customer-facing material (`docs/ops/QUICK_START.md`, `docs/ADMIN_HANDBUCH.md`) stays German.
   - Conventions: link to `apps/dashboard-backend/CLAUDE.md`, `apps/dashboard-frontend/CLAUDE.md`.
   - Slash command catalog: list all `/add-route`, `/run-tests-backend`, etc., with one-line descriptions.
   - Code review checklist (link to `.claude/agents/code-reviewer.md`).
   - How to report bugs / propose features.

3. **Write `ARCHITECTURE.md`** (new at repo root, ~80 lines). Acts as a stub:
   - One-paragraph overview.
   - The same architecture diagram (in detail).
   - "For deep dive: `docs/ARCHITECTURE.md`".
   - "Service-specific design notes: `services/<name>/README.md` or `services/<name>/CLAUDE.md`".

4. **Add `.nvmrc`** with the Node version from `package.json` engines (likely `20.x` or `22.x` — verify).

5. **Add `LICENSE`** check — if missing, add (decide with user: MIT / Apache / proprietary).

6. Commit: `docs: trim README, add CONTRIBUTING and root ARCHITECTURE, add .nvmrc`.

**Files:**

- Modified: `README.md`.
- New: `CONTRIBUTING.md`, `ARCHITECTURE.md`, `.nvmrc`, possibly `LICENSE`.

**Acceptance:**

- `wc -l README.md` ≤ 200.
- `CONTRIBUTING.md` exists, contains all 9 sections above.
- `ARCHITECTURE.md` at root exists with diagram.
- All links from these three files resolve.
- A naive read of `README.md` (cold) tells the reader exactly which command to run for their persona.

**Risk:** Low.
**Rollback:** Easy revert.
**Estimate:** 3 h (most of it is writing CONTRIBUTING.md properly).

---

### Stage 4 — Subfolder CLAUDE.md Hierarchy

**Goal:** Hard rules and patterns for each domain live next to the code, not in one giant root CLAUDE.md. New devs and Claude Code both load only the relevant file when working in a folder.

**Pre-conditions:** Stage 3 done.

**Tasks:**

1. **Create `apps/dashboard-backend/CLAUDE.md`** (~150 lines, English). Contents:
   - Hard rules: `asyncHandler` everywhere, `ValidationError`/`AuthError` from `utils/errors.js`, no inline DB queries (use `services/`), Zod for input validation.
   - Folder map: `routes/` (HTTP binding), `services/` (business logic), `middleware/` (cross-cutting), `schemas/` (Zod), `utils/` (pure helpers), `tools/` (Claude-Code-Terminal helpers — explain!).
   - Routing convention: when to put a file in `routes/foo.js` vs. `routes/admin/foo.js` vs. mounting a sub-router.
   - Service convention: orchestration vs. adapter vs. domain services with one example each.
   - Rate limiter matrix (which limiter for which scenario).
   - Test layout: `__tests__/unit/`, `__tests__/integration/`.
   - Common workflows: "Add an endpoint" → use `/add-route`. "Add a migration" → use `/create-migration`.

2. **Create `apps/dashboard-frontend/CLAUDE.md`** (~150 lines, English). Contents:
   - Hard rules: `useApi()` hook for all backend calls, TypeScript only, CSS variables (`var(--primary-color)`) not hex.
   - Folder map: `features/` (feature modules), `components/` (shared), `components/ui/shadcn/` (untouched), `hooks/`, `contexts/`, `lib/`, `types/`.
   - When to add to `features/` vs. `components/`.
   - shadcn convention: kebab-case files in `ui/shadcn/` are untouched-from-CLI, wrap them in PascalCase components in `components/`.
   - Feature-folder template (paste into `/add-component` skill).
   - Theming: CSS variables defined in `index.css`, mapping to Tailwind utilities.
   - Toast/feedback pattern via `useToast()`.
   - Test layout: `__tests__/` co-located.

3. **Create `services/CLAUDE.md`** (~80 lines, English). Contents:
   - Every service must have: `Dockerfile`, `README.md`, an entry point file (`api_server.py` for Python, `server.js` for Node, `entrypoint.sh` for Bash-only).
   - Use `services/_template/` as a starting point (created in Stage 9).
   - Python services: snake_case, FastAPI/aiohttp, async/await, type hints, pytest in `tests/`.
   - Node services: kebab-case, Express, Jest in `__tests__/`.
   - Configuration: env-vars > config files. Document all env vars in service-local README.

4. **Create `services/postgres/CLAUDE.md`** (~60 lines, English). Contents:
   - Migration numbering: zero-padded 3-digit prefix, `NNN_snake_case_description.sql`. Next number is determined by `ls services/postgres/init/ \| sort \| tail -1`.
   - Idempotency: prefer `IF NOT EXISTS`, `ALTER TABLE ... IF NOT EXISTS`.
   - No `DROP` without explicit user confirmation.
   - Always include a "down" comment block at the bottom (we don't auto-rollback, but the SQL must be stated).
   - Update `docs/api/DATABASE_SCHEMA.md` after every migration via `/update-schema-docs`.
   - Cross-link to `.claude/commands/create-migration.md`.

5. **Trim root `CLAUDE.md`** to ≤ 200 lines:
   - Remove the detailed "Unverhandelbare Regeln" (now in subfolder CLAUDE.md files) — keep only top 3.
   - Update Task-Router to point at subfolder CLAUDE.md files.
   - Translate to English (currently German). User explicitly OK'd.
   - Keep: vision, architecture diagram, top-3 rules, task router, quick reference (entry points + 5 commands).

6. Commit: `docs(claude): introduce subfolder CLAUDE.md hierarchy, trim root CLAUDE.md to index`.

**Files:**

- New: `apps/dashboard-backend/CLAUDE.md`, `apps/dashboard-frontend/CLAUDE.md`, `services/CLAUDE.md`, `services/postgres/CLAUDE.md`.
- Modified: root `CLAUDE.md`.

**Acceptance:**

- 4 new CLAUDE.md files exist, each ≤ 200 lines, valid markdown.
- Root `CLAUDE.md` ≤ 200 lines, in English.
- Task-Router in root links to subfolder files.
- Smoke test: open a backend route file in Claude Code, confirm it auto-loads `apps/dashboard-backend/CLAUDE.md` (test by asking "what's the routing convention here?").

**Risk:** Low. Pure additions + trim of root.
**Rollback:** Easy revert.
**Estimate:** 4 h (writing the 4 files takes time — they must be high quality).

---

### Stage 5 — `.claude/` Restructure

**Goal:** Final structure for `.claude/`. All folders exist and contain a README explaining what they hold.

**Pre-conditions:** Stages 1, 2, 4 done.

**Target structure:**

```
.claude/
├── README.md                    NEW — explains the structure
├── settings.json                MOVED — from settings.local.json (the team-shared parts)
├── settings.local.json          KEPT — only personal/local overrides
├── commands/                    KEPT — content overhauled in Stage 6
├── agents/                      NEW — populated in Stage 7
├── hooks/                       NEW — populated in Stage 8
├── skills/                      NEW — empty for now (decide content later)
└── context/                     KEPT — consolidated in this stage
```

**Tasks:**

1. **Create new folders:** `.claude/agents/`, `.claude/hooks/`, `.claude/skills/`. Each gets a `.gitkeep` for now.

2. **Consolidate `.claude/context/`** from 14 files to 6 lean ones + 4 new domain-specific ones. Based on the audit:
   - **Keep as-is (good size, accurate):** `backend.md`, `debug.md`, `security.md`, `telegram.md`, `n8n-workflow.md`, `testing.md`.
   - **Merge into root CLAUDE.md or delete (duplicates):** `base.md`, `deployment.md`.
   - **Promote to docs/ (too long, are mini-docs):**
     - `frontend.md` (18.9k) → `docs/development/FRONTEND_HANDBOOK.md`, leave a 3k stub `frontend.md`.
     - `infra.md` (20.7k) → `docs/ops/INFRASTRUCTURE.md`, leave a 3k stub.
     - `python-services.md` (15.9k) → `docs/development/PYTHON_SERVICES.md`, leave a 3k stub.
     - `database.md` (15.9k) → merge into `docs/api/DATABASE_SCHEMA.md`, leave a 3k stub.
   - **Promote to slash-commands (template generators):**
     - `component.md` → `/add-component` skill (Stage 6).
     - `api-endpoint.md` → `/add-route` skill (Stage 6).
     - `migration.md` → `/create-migration` skill (Stage 6) with auto-detect of next number.
   - **Add new (gaps identified by audit):**
     - `rag.md` (RAG pipeline conventions, hybrid search, reranking).
     - `llm-queue.md` (single-stream queue, job lifecycle, SSE).
     - `commercial.md` (DSGVO/compliance/support-bundle patterns from Phase 5).
     - `observability.md` (logger, error-localization, circuit-breaker patterns from Phase 6).

3. **Update migration-counter references in context files.** All current "next migration is 083" references must be auto-detected from `services/postgres/init/`. Either:
   - Hard-code the current number (085) and add a comment "auto-update via `/create-migration`",
   - OR make the relevant slash-command read from disk (preferred — see Stage 6).

4. **Move `.claude/settings.local.json` → split:**
   - **Team-shared parts** (permissions, base hooks, available models) → `.claude/settings.json` (committed).
   - **Personal parts** (Telegram-notify hook, env vars) → stay in `.claude/settings.local.json` (gitignored — verify in `.gitignore`).
   - See Stage 8 for the actual JSON content.

5. **Write `.claude/README.md`** (~80 lines, English). Explains:
   - What each folder is for (commands, agents, hooks, skills, context).
   - When to add what (decision tree: "Is it a workflow Claude triggers? → command. Long-running with isolated context? → agent. Auto-fires on file event? → hook.").
   - Naming convention: verb-first lowercase-hyphenated for commands and skills; lowercase-hyphenated for agents.
   - Pointers to subfolder CLAUDE.md files.

6. Commit: `chore(claude): restructure .claude/ into commands/agents/hooks/skills/context, consolidate context files`.

**Files:** ~14 context-file ops (move/merge/delete/promote), 4 new folders, 1 README, settings split.

**Acceptance:**

- `.claude/` has exactly: `README.md`, `settings.json`, `settings.local.json`, `commands/`, `agents/`, `hooks/`, `skills/`, `context/`.
- `.claude/context/` has 10 files (6 kept + 4 new), all ≤ 5k.
- No more "082 migrations / next 083" lies in any context file.
- `.gitignore` confirmed to exclude `settings.local.json`.

**Risk:** Low–medium. Touches many files but all moves; content edits are cosmetic.
**Rollback:** Revert.
**Estimate:** 4 h.

---

### Stage 6 — Slash Commands

**Goal:** ~22 high-quality slash commands in `.claude/commands/`, all with proper YAML frontmatter, all verb-first English names. Replaces ad-hoc workflows.

**Pre-conditions:** Stages 4–5 done (so commands can reference subfolder CLAUDE.md and the new context files).

**Naming convention (set in stone):**

- Verb-first, hyphenated, lowercase, no namespace colon.
- Examples: `/add-route`, `/create-migration`, `/rebuild-service`, `/run-tests-backend`, `/draft-pr`.

**Frontmatter template (every command must have this):**

```yaml
---
name: <command-name> # auto-derived from filename, but explicit is better
description: <one-line> # what triggers Claude to suggest this
argument-hint: '<args shown in autocomplete>'
allowed-tools: <comma-separated tool restrictions, e.g. "Bash(docker compose:*) Read Edit">
disable-model-invocation: false # set true for destructive commands
---
```

**Catalog (22 commands, grouped):**

#### Plan / Design (3)

1. **`/plan-feature [name]`** — Interview-driven feature plan. Uses `AskUserQuestion` for scope/DB-touch/UI-touch/tests. Loads `apps/dashboard-backend/CLAUDE.md` + `apps/dashboard-frontend/CLAUDE.md`. Writes plan to `docs/plans/active/<name>.md` with phases (P0/P1/P2) and risk notes.
2. **`/plan-bugfix "<symptom>"`** — Reproduces the bug from logs/stacktrace, finds root cause via grep (not symptom), proposes 2–3 fix options with trade-offs, drafts a regression test.
3. **`/plan-refactor <module>`** — Lists call-sites of the affected code, listes breaking changes, proposes migration strategy (big-bang vs. parallel), identifies affected tests.

#### Backend (3)

4. **`/add-route <method> <path>`** — Generates Express route with `asyncHandler`, registers in `routes/index.js`, creates Jest test stub in `__tests__/`, updates `docs/api/API_REFERENCE.md` (or reminds via `/update-api-docs`). Replaces `.claude/context/api-endpoint.md`.
5. **`/add-service <ServiceName>`** — New service-layer file under `apps/dashboard-backend/src/services/`, with constructor/factory and unit-test stub.
6. **`/add-middleware <middlewareName>`** — New Express middleware following `requireAuth`/`rateLimit` pattern, with typed errors and supertest stub.

#### Frontend (3)

7. **`/add-component <ComponentName>`** — Scaffolds component under `apps/dashboard-frontend/src/components/` (or in a feature folder if `--in <feature>` arg). PascalCase, TypeScript, CSS variables, Vitest stub. Replaces `.claude/context/component.md`.
8. **`/add-page <route-path>`** — New route + page component, registers in App.tsx router, sidebar entry suggestion, i18n keys.
9. **`/add-hook use<HookName>`** — Custom hook in `src/hooks/`, TypeScript-only, `renderHook` test.

#### Database (3)

10. **`/create-migration <description>`** — Reads `services/postgres/init/`, computes next number (currently 086), writes `NNN_<description>.sql` with `IF NOT EXISTS` boilerplate and a "down" comment block.
11. **`/query-db "<sql>"`** — Read-only psql; rejects anything not starting with `SELECT`/`EXPLAIN`. Limits 100 rows.
12. **`/open-psql`** — Prints the copy-paste command for an interactive psql shell + cheat-sheet for `\d`, `\dt`, `\df`.

#### Infra / Docker (4)

13. **`/rebuild-service <service>`** — `docker compose up -d --build <service>`, tails logs until healthy or 120s timeout. Has `disable-model-invocation: true` (manual only).
14. **`/show-logs <service>`** — `docker compose logs --tail=200 -f <service>` in background, highlights ERROR/WARN.
15. **`/check-health`** — `docker compose ps` + ping `/health` endpoints + GPU status (`tegrastats` or `nvidia-smi`) + disk-free.
16. **`/restart-service <service>`** — `docker compose restart <service>`, waits for healthcheck.

#### Tests / Quality (5)

17. **`/run-tests-all`** — `./scripts/test/run-tests.sh --all`. Existing `/test` becomes an alias.
18. **`/run-tests-backend [filter]`** — Backend Jest with optional path filter.
19. **`/run-tests-frontend [filter]`** — Frontend Vitest.
20. **`/lint`** — ESLint + Prettier on both apps in parallel, auto-fix where safe.
21. **`/typecheck`** — `tsc --noEmit` on backend (where applicable) + frontend.

#### Git / Docs (4)

22. **`/commit`** — Smart commit: reads staged diff, suggests `<type>(<scope>): <subject>`, never uses `git add -A`. Existing `/implement` is removed (overlap).
23. **`/draft-pr`** — Diff vs. main, generates title + summary + test plan, runs `gh pr create --draft`.
24. **`/update-api-docs`** — Detects new routes via git-diff, generates markdown blocks, patches `docs/api/API_REFERENCE.md`.
25. **`/update-schema-docs`** — Detects new migrations, extracts tables/columns, patches `docs/api/DATABASE_SCHEMA.md` and the migration-counter in any `.claude/context/` file that mentions it.

#### Onboard / Debug (3)

26. **`/explain <path>`** — Reads file + call-sites, produces architecture sketch, dependencies, common-modification points.
27. **`/debug-service <service>`** — Logs (last 200) + healthcheck + restart-count + port-check + DB-connection, proposes 3 hypotheses.
28. **`/onboard`** — Setup checklist for new dev: `scripts/doctor.sh` + `.env` template + `make dev` + first-PR walkthrough.

> **Total: 28 commands** — over the "20" target, but every one earns its place. We can demote a few to "skills" in Stage 7 if the count feels heavy.

**Tasks:**

1. For each command above: write the markdown file with frontmatter + body. Body uses `!`<command>``blocks for live state injection where useful (e.g.`/check-health`injects current`docker compose ps`).
2. Delete `.claude/commands/{test,implement,review}.md` (replaced by the new `/run-tests-all`, `/commit`, and a fresh `/review` — see below).
3. Add `/review` as a code-review-current-branch command (delegates to `code-reviewer` subagent from Stage 7).
4. Validate every command file with a small script (`scripts/validate-commands.sh`) that parses YAML and checks required fields.
5. Update `CONTRIBUTING.md` with the catalog (cross-link from Stage 3).
6. Commit: `feat(claude): add 28 verb-first slash commands with frontmatter, retire old test/implement/review`.

**Files:** ~28 new command files, 3 deletions, 1 validator script, 1 CONTRIBUTING.md update.

**Acceptance:**

- `ls .claude/commands/*.md \| wc -l` ≥ 22.
- `scripts/validate-commands.sh` passes.
- Manual smoke: invoke `/check-health` and `/run-tests-backend` in Claude Code; both work.
- `CONTRIBUTING.md` lists every command.

**Risk:** Low (pure additions), but volume is high. Plan for 1 day of focused writing.
**Rollback:** Delete the new command files.
**Estimate:** 6–8 h.

---

### Stage 7 — Subagents

**Goal:** 8 subagents in `.claude/agents/` for repeated specialized work.

**Pre-conditions:** Stages 4–5 done.

**Catalog:**

| Name                 | Purpose                                           | Tools                                          | Model  | Project/User         |
| -------------------- | ------------------------------------------------- | ---------------------------------------------- | ------ | -------------------- |
| `code-reviewer`      | Read-only review of pending changes               | `Read, Grep, Glob, Bash(git diff:* git log:*)` | sonnet | project              |
| `backend-api-dev`    | Implement Express endpoints per backend CLAUDE.md | `Read, Edit, Write, Bash, Grep`                | sonnet | project              |
| `frontend-ui-dev`    | Build React components per frontend CLAUDE.md     | `Read, Edit, Write, Bash, Grep`                | sonnet | project              |
| `python-service-dev` | Develop Python services (LLM, embedding, indexer) | `Read, Edit, Write, Bash, Grep`                | sonnet | project              |
| `db-migrator`        | Write safe Postgres migrations                    | `Read, Edit, Write, Bash`                      | sonnet | project              |
| `infra-ops`          | Docker Compose, Traefik, networking               | `Read, Edit, Write, Bash, Grep`                | sonnet | project              |
| `test-runner`        | Run + fix failing tests                           | `Read, Edit, Write, Bash, Grep`                | haiku  | project (cheap+fast) |
| `doc-writer`         | Sync API/schema/admin docs                        | `Read, Write, Bash, Grep`                      | haiku  | project              |

**Tasks:**

1. For each agent: write the markdown file with frontmatter (`name`, `description`, `tools`, `model`, optional `color`) + system-prompt body that references the relevant subfolder CLAUDE.md.
2. `code-reviewer` is the most important one — give it a tight prompt: critical/warnings/suggestions split, file:line citations, no rewrites.
3. Add the catalog to `CONTRIBUTING.md` (extends Stage 3).
4. Smoke-test each by asking Claude to delegate: "Use the code-reviewer to review the last commit", etc.
5. Commit: `feat(claude): add 8 project-level subagents (code-reviewer, backend/frontend/python-dev, db-migrator, infra-ops, test-runner, doc-writer)`.

**Files:** 8 new subagent files in `.claude/agents/`.

**Acceptance:**

- 8 files exist, each with valid frontmatter.
- `code-reviewer` works on a real commit.
- `CONTRIBUTING.md` lists them all.

**Risk:** Low.
**Rollback:** Delete files.
**Estimate:** 3 h.

---

### Stage 8 — Settings + Hooks

**Goal:** Production-quality `.claude/settings.json` (committed, team-shared) and a small set of hooks that save real time without being intrusive.

**Pre-conditions:** Stages 5–7 done.

**Tasks:**

1. **Write `.claude/settings.json`** (committed):

   ```json
   {
     "$schema": "https://json.schemastore.org/claude-code-settings.json",
     "permissions": {
       "allow": [
         "Bash(docker compose:*)",
         "Bash(docker exec:*)",
         "Bash(npm run *)",
         "Bash(npm test:*)",
         "Bash(git status)",
         "Bash(git diff:*)",
         "Bash(git log:*)",
         "Bash(git add:*)",
         "Bash(./scripts/*:*)",
         "Bash(make *)",
         "Read",
         "Edit",
         "mcp__playwright__*",
         "mcp__shadcn__*"
       ],
       "deny": [
         "Bash(rm -rf:*)",
         "Bash(sudo:*)",
         "Bash(git push --force:*)",
         "Bash(git reset --hard:*)",
         "Read(.env)",
         "Read(.env.*)",
         "Read(~/.ssh/**)",
         "Read(**/secrets/**)"
       ]
     },
     "enableAllProjectMcpServers": true,
     "availableModels": ["claude-opus-4-7", "claude-sonnet-4-6", "claude-haiku-4-5"],
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [
             {
               "type": "command",
               "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-destructive.sh",
               "timeout": 5
             }
           ]
         }
       ],
       "PostToolUse": [
         {
           "matcher": "Edit|Write",
           "hooks": [
             {
               "type": "command",
               "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/remind-migration.sh",
               "timeout": 5
             },
             {
               "type": "command",
               "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/remind-rebuild.sh",
               "timeout": 5
             }
           ]
         }
       ]
     }
   }
   ```

2. **Write `.claude/hooks/`** (3 small bash scripts):
   - **`block-destructive.sh`** — exits 2 if the bash command (passed via stdin JSON) matches `rm -rf /`, `git push --force` to main, etc. Belt-and-suspenders alongside the `deny` list.
   - **`remind-migration.sh`** — if the edited file is under `services/postgres/init/`, prints "Reminder: Migration must be numbered NNN\_\*.sql, next available: <ls + 1>".
   - **`remind-rebuild.sh`** — if the edited file is under `apps/dashboard-{backend,frontend}/src/`, prints "Reminder: run `/rebuild-service <name>` to apply changes".

3. **Update `.claude/settings.local.json`** (personal):

   ```json
   {
     "alwaysThinkingEnabled": true,
     "effortLevel": "high",
     "hooks": {
       "Stop": [
         {
           "hooks": [
             {
               "type": "command",
               "command": "${CLAUDE_PROJECT_DIR}/scripts/util/telegram-notify.sh \"Claude session done\"",
               "timeout": 30
             }
           ]
         }
       ]
     }
   }
   ```

4. Verify `.gitignore` has `.claude/settings.local.json` (it should already).

5. Commit: `feat(claude): commit settings.json with permissions+hooks, split personal config into settings.local.json`.

**Files:** 1 modified (`.claude/settings.json`), 1 modified (`.claude/settings.local.json`), 3 new (`hooks/*.sh`), possibly `.gitignore`.

**Acceptance:**

- `git status` shows `.claude/settings.json` tracked, `.claude/settings.local.json` untracked.
- Smoke: try to run `rm -rf /tmp/foo` — gets blocked.
- Smoke: edit `services/postgres/init/000_test.sql` (a temp file) — see migration reminder.
- All 3 hook scripts are executable (`chmod +x`).

**Risk:** Medium — broken hook breaks the session. Each hook script must be tested standalone before committing.
**Rollback:** Empty out the `hooks` section in settings.json.
**Estimate:** 3 h.

---

### Stage 9 — `scripts/` + `services/` Standardization

**Goal:** Flatten and de-duplicate `scripts/`. Add missing READMEs to services. Provide `services/_template/` for new services.

**Pre-conditions:** Stages 1–8 done.

**Tasks (scripts/):**

1. **Folder consolidation** (13 → 8 subfolders):
   - **Delete** `scripts/ops/` (was just a symlink to `services/backup-service/`).
   - **Merge** `scripts/recovery/` into `scripts/backup/`.
   - **Merge** `scripts/maintenance/` (1 file) into `scripts/system/` (re-name folder to `system/` if useful, or merge into `ops/`-style).
   - **Decide** `scripts/validate/` vs. `scripts/test/`: keep both, but `validate/` is for config-validation (pre-flight), `test/` is for test-runners. Document in `scripts/README.md`.
   - **Final layout:** `bootstrap/`, `setup/`, `deploy/`, `backup/`, `security/`, `validate/`, `test/`, `system/`, `util/`, `lib/`, `docs/` (= 11; some merging may consolidate further during execution).
2. **Write `scripts/README.md`** — table of folder purposes + index of every script with one-line description.
3. **Write `scripts/doctor.sh`** — pre-flight check:
   - Docker installed & version ≥ 24
   - Docker Compose v2
   - Node version matches `.nvmrc`
   - `make` installed
   - `gh` installed (for `/draft-pr`)
   - On Jetson? (detect arch + nvidia-smi/tegrastats)
   - `.env` exists or `.env.example` exists
   - Required ports free (3001, 5432, 11434, 11435, 6333, …)
   - **Output:** GREEN/YELLOW/RED summary; suggestions for each RED item.
4. **Bash naming standardization** (8 files): rename snake_case → kebab-case. List from naming audit:
   - `scripts/setup/setup_mdns.sh` → `setup-mdns.sh`
   - `scripts/validate/validate_config.sh` → `validate-config.sh`
   - `scripts/validate/validate_dependencies.sh` → `validate-dependencies.sh`
   - `scripts/util/init_minio_buckets.sh` → `init-minio-buckets.sh`
   - `scripts/util/setup_logrotate.sh` → `setup-logrotate.sh`
   - `scripts/security/generate_htpasswd.sh` → `generate-htpasswd.sh`
   - `scripts/security/generate_self_signed_cert.sh` → `generate-self-signed-cert.sh`
   - `scripts/deploy/create_update_package.sh` → `create-update-package.sh`
     For each rename: `git grep -l '<old>'` to find references; update Makefile, `arasul`, compose files, other scripts. Run all tests after each rename.

**Tasks (services/):**

5. **Create `services/_template/`** with:
   - `Dockerfile` (Python skeleton).
   - `README.md` template (purpose, env vars, endpoints, testing, troubleshooting).
   - `tests/test_health.py` (smoke).
   - `requirements.txt` (empty).
   - `.dockerignore`.
6. **Add `README.md`** to services missing one (per services audit):
   - `services/backup-service/`
   - `services/claude-code/`
   - `services/mcp-remote-bash/`
   - `services/sandbox/`
   - `services/cloudflared/` (mark as "external image, configured via config.yml")
7. **Document the exemptions** for `cloudflared`, `n8n`, `postgres` (external images, no own Dockerfile/code) in `services/CLAUDE.md`.

8. Commit: `refactor(scripts,services): consolidate scripts/ subfolders, kebab-case bash naming, add services/_template and missing READMEs`.

**Files:** ~5 folder ops, 8 file renames, 1 new `scripts/doctor.sh`, 1 new `scripts/README.md`, 1 new `services/_template/`, 5 new service READMEs.

**Acceptance:**

- `scripts/` has ≤ 11 subfolders, each with ≥ 1 script.
- `scripts/doctor.sh` runs cleanly on the dev machine and on the Jetson.
- All renamed scripts still callable via Makefile/`arasul`/CI (smoke-test).
- `services/_template/` is a working starting point (`docker build` succeeds).
- 5 new service READMEs follow the template structure.

**Risk:** **Medium-high** for the bash renames — many cross-references. Mitigation: run full test suite after each rename, not in batch.
**Rollback:** Per-rename revert.
**Estimate:** 6 h.

---

### Stage 10 — DX Mock-Stack + `make dev`

**Goal:** A new dev on x86 macOS/Linux runs `make dev` and has hot-reload on backend + frontend in <30s, against a mock LLM/Qdrant + real Postgres + real MinIO. No Jetson required.

**Pre-conditions:** Stages 1–9 done. The `scripts/doctor.sh` script is in place to validate prerequisites.

**Tasks:**

1. **Write `compose/compose.dev.yml`** — a thin override file that:
   - Includes `compose.core.yaml` (Postgres, MinIO, Traefik) — real services, but small.
   - **Replaces** `llm-service` and `embedding-service` with mock containers (see step 2).
   - **Replaces** `qdrant` with an in-memory mock (see step 3) OR uses the real Qdrant in dev mode (it's lightweight — measure).
   - Disables `cloudflared`, `n8n`, `metrics-collector`, `self-healing-agent`, `loki`, `promtail` (not needed for dev loop).
   - Mounts `apps/dashboard-backend/` and `apps/dashboard-frontend/` as bind mounts for hot-reload (or bypasses Docker entirely for these — see step 4).

2. **Write `services/_mock-llm/`** — tiny Python (FastAPI) service that mimics Ollama's `/api/chat`, `/api/generate`, `/api/embeddings` endpoints. Returns canned responses (echo input + "[mock]" suffix; embeddings = deterministic hash → 768/1024-dim vector). Total: ~80 lines of Python.

3. **Write `services/_mock-qdrant/`** — even tinier; in-memory dict-backed `/collections/{name}/points/...` endpoints, just enough for our RAG calls. ~100 lines. **Alternative:** spin up a real Qdrant container (~50 MB image) — likely simpler, no maintenance. **Decision during execution.**

4. **Bypass Docker for dashboard-\* in dev:**
   - Backend: `cd apps/dashboard-backend && npm run dev` (runs nodemon against host Node + the Compose stack on `localhost:5432`, etc.).
   - Frontend: `cd apps/dashboard-frontend && npm run dev` (Vite HMR on `localhost:5173`).
   - The Compose stack only runs the _backing_ services.

5. **Write `Makefile` target `dev`:**

   ```makefile
   dev: doctor
   	docker compose -f docker-compose.yml -f compose/compose.dev.yml up -d postgres minio mock-llm mock-qdrant
   	@echo "Backing services up. Starting backend + frontend with hot-reload..."
   	cd apps/dashboard-backend && npm install --silent && npm run dev &
   	cd apps/dashboard-frontend && npm install --silent && npm run dev &
   	wait

   doctor:
   	./scripts/doctor.sh
   ```

   (Use `concurrently` or two `tmux` panes for cleaner UX — decide during execution.)

6. **Add `make dev-stop`** that tears down the dev compose stack and kills the npm processes.

7. **Update `apps/dashboard-backend/package.json`** if needed: confirm `"dev": "nodemon src/index.js"` works against the mock stack.

8. **Update `apps/dashboard-frontend/vite.config.ts`** if needed: API proxy to `localhost:3001`.

9. **Document in `CONTRIBUTING.md`** + `docs/development/ONBOARDING.md`:
   - `git clone … && cd arasul-jet && make dev` is the canonical dev path.
   - What works in dev mode (chat with mock LLM returns echoes; UI shows real Postgres data; uploads work via real MinIO).
   - What doesn't work (real model inference; GPU monitoring; n8n workflows).

10. **Smoke-test on macOS x86** (or a Linux x86 VM if no Mac available):
    - `git clone …`
    - `make dev`
    - Open `http://localhost:5173`, log in (seed user from MinIO/postgres init), send a chat message, see "[mock]" response.

11. Commit: `feat(dx): add compose.dev.yml mock-stack and make dev for hot-reload onboarding`.

**Files:**

- New: `compose/compose.dev.yml`, `services/_mock-llm/`, `services/_mock-qdrant/` (or skipped if real Qdrant used).
- Modified: `Makefile`, `CONTRIBUTING.md`, `docs/development/ONBOARDING.md`.

**Acceptance:**

- `make dev` on macOS x86 produces a working dashboard in ≤ 5 min on first run, ≤ 30s on subsequent runs.
- Backend and frontend both hot-reload on file save.
- Mock LLM responds to `/api/chat` with `[mock] <echo>`.
- The smoke-test path works for someone who has _never_ seen this repo.

**Risk:** **High.** Most engineering of any stage. Mock services need maintenance as real APIs evolve.

- Mitigation: keep mocks **dumb** (echo-and-canned). Don't try to mimic LLM intelligence. As long as the dashboard renders and can store data, the mock has done its job.
  **Rollback:** Mark `compose.dev.yml` as experimental in CONTRIBUTING.md and fall back to "developers need a Jetson for now" if mocks become unmaintainable.
  **Estimate:** 1.5 days.

---

### Stage 11 — GitHub Actions CI

**Goal:** Every PR runs lint + typecheck + tests + compose-validate. No more "tests pass on my machine" surprises.

**Pre-conditions:** Stages 1–10 done.

**Tasks:**

1. **Write `.github/workflows/ci.yml`:**

   ```yaml
   name: CI
   on:
     pull_request:
       branches: [main]
     push:
       branches: [main]

   jobs:
     lint-and-typecheck:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version-file: .nvmrc
             cache: npm
         - run: npm ci
         - run: npm run lint
         - run: npm run typecheck

     test-backend:
       runs-on: ubuntu-latest
       services:
         postgres:
           image: postgres:16
           env: { POSTGRES_PASSWORD: test, POSTGRES_USER: test, POSTGRES_DB: test }
           ports: ['5432:5432']
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version-file: .nvmrc, cache: npm }
         - run: cd apps/dashboard-backend && npm ci
         - run: cd apps/dashboard-backend && npm test -- --coverage
         - uses: codecov/codecov-action@v4 # optional

     test-frontend:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version-file: .nvmrc, cache: npm }
         - run: cd apps/dashboard-frontend && npm ci
         - run: cd apps/dashboard-frontend && npm test -- --coverage --run

     test-python:
       runs-on: ubuntu-latest
       strategy:
         matrix:
           service:
             [
               metrics-collector,
               self-healing-agent,
               document-indexer,
               llm-service,
               embedding-service,
             ]
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-python@v5
           with: { python-version: '3.11' }
         - run: cd services/${{ matrix.service }} && pip install -r requirements.txt -r requirements-dev.txt
         - run: cd services/${{ matrix.service }} && pytest tests/ -v
       continue-on-error: true # because not all services have tests yet — Stage 9 added stubs

     compose-validate:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - run: docker compose config -q
         - run: docker compose -f docker-compose.yml -f compose/compose.dev.yml config -q

     security-audit:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - run: npm audit --audit-level=high || true # warn-only initially
   ```

2. **Add `npm run lint`, `npm run typecheck`** at root `package.json` if missing — they fan out to both apps.

3. **Add CI status badges** to `README.md`.

4. **Set required checks** in GitHub branch protection (manual GitHub UI step — note in plan).

5. **Smoke-test** by opening a trivial PR and seeing all jobs go green.

6. Commit: `ci: add GitHub Actions for lint/typecheck/tests/compose-validate/security-audit`.

**Files:** `.github/workflows/ci.yml` (new), `package.json` (modified), `README.md` (badges).

**Acceptance:**

- CI runs on PR, all 6 jobs visible, all green on a clean commit.
- Required-checks rule blocks PR merge on red.

**Risk:** Medium — first CI on this repo, expect 2–3 iterations to get jobs green. Python services may have varied dep needs.
**Rollback:** Disable workflow.
**Estimate:** 4 h.

---

### Stage 12 — Naming + `.env` Cleanup

**Goal:** Eliminate the remaining naming outliers. Reduce `.env*` proliferation from 6 files to 2.

**Pre-conditions:** Stages 1–11 done. Bash-script renames already happened in Stage 9.

**Tasks:**

1. **Frontend rename:** `apps/dashboard-backend/src/routes/ai/knowledge-graph.js` → `knowledgeGraph.js`. Update `routes/ai/index.js` import.

2. **`.env` cleanup:**
   - **Delete** `.env.backup.20260314_132015`, `.env.backup.20260314_132100` from the repo. Add `.env.backup.*` to `.gitignore`.
   - **Move** `.env.jetson` → `config/profiles/jetson.env`. Update any scripts that read it.
   - **Merge** `.env.template` and `.env.example` into a single `.env.example` (canonical). `.env.template` may have content not in `.env.example` — diff them carefully and merge.
   - **Document** in `docs/development/ENVIRONMENT.md` (new file): all env vars, their defaults, where they're used. Cross-link from `.env.example` ("see docs/development/ENVIRONMENT.md").

3. **Logs consolidation** (from top-level audit): merge `logs/` (root) into `data/logs/`. Update Compose volume mounts. Risky — verify Traefik log path still works, no orphan log files created.

4. Commit: `chore: kebab-case rename for knowledge-graph route, consolidate .env files, move logs/ into data/logs/`.

**Files:** 1 rename, 4 .env ops, ~10 cross-reference fixes, 1 new ENVIRONMENT.md.

**Acceptance:**

- `git grep "knowledge-graph"` returns 0 (except in this plan).
- `ls .env*` shows only `.env`, `.env.example`.
- `find . -name '*.env*' -not -path './node_modules/*'` lists only `.env`, `.env.example`, `config/profiles/jetson.env`.
- `docs/development/ENVIRONMENT.md` documents every env var.

**Risk:** Medium — `.env.jetson` move and logs/ consolidation touch Compose. Validate with `docker compose config`.
**Rollback:** Per-change revert.
**Estimate:** 3 h.

---

### Stage 13 — Final Polish & Smoke-Test

**Goal:** Cross-link everything, validate, sign off.

**Pre-conditions:** Stages 1–12 done.

**Tasks:**

1. **Run `scripts/validate-doc-links.sh`** (new — write it as part of this stage). Checks every markdown link in `docs/`, `.claude/`, root README/CONTRIBUTING/ARCHITECTURE/CLAUDE.md. Reports broken links.

2. **Run all 28 slash commands** in dry-run mode (or a subset) — manual smoke.

3. **Run `make dev` from a clean clone** on a different host (macOS or VM) — full onboarding smoke-test. Time it. Target: ≤ 15 min.

4. **Update `MEMORY.md`** index entries to reflect new structure (mark `phase*.md` chain as historical, point to `docs/plans/active/DX_OVERHAUL.md` as latest).

5. **Update `CHANGELOG.md`** with a "DX Overhaul" entry.

6. **Tag** `v<next>-dx-overhaul` after merge.

7. **Move this plan** from `docs/plans/active/DX_OVERHAUL.md` → `docs/plans/archive/2026-05_dx-overhaul.md` with status header.

8. Commit: `chore(dx): close DX overhaul — link validation, smoke-test, archive plan`.

**Files:** 1 new validator script, MEMORY.md, CHANGELOG.md, this plan moved.

**Acceptance:**

- Link validator: 0 broken links.
- `make dev` from clean clone: working dashboard in ≤ 15 min.
- All AC1–AC12 from §1 verified.

**Risk:** Low.
**Rollback:** Not applicable (it's polish).
**Estimate:** 4 h.

---

## 6. Risk Register

| Risk                                                                            | Stage | Likelihood | Impact | Mitigation                                                                             |
| ------------------------------------------------------------------------------- | ----- | ---------- | ------ | -------------------------------------------------------------------------------------- |
| Bash-script rename breaks Compose/Make/CI                                       | 9     | M          | H      | Rename one at a time, run tests/compose-validate after each.                           |
| Mock-stack drifts from real LLM API                                             | 10    | H          | M      | Keep mocks dumb (echo + canned). Schedule semi-annual revisit in `docs/plans/active/`. |
| Subfolder CLAUDE.md content goes stale                                          | 4     | M          | M      | Treat them like docs — update when patterns change, not lazily.                        |
| Stage 1 file moves break some dev's local branch                                | 1     | L          | L      | Communicate timing; merge stages quickly so feature branches don't fester.             |
| GitHub Actions cost/time spikes                                                 | 11    | L          | L      | Initial CI is small; monitor. Add caching liberally.                                   |
| Translating `ADMIN_HANDBUCH.md` etc. to English breaks customer's understanding | 2     | L          | M      | Don't translate customer-facing docs in this overhaul. Keep them in German.            |
| `npm run dev` (host Node) version drifts from Docker Node                       | 10    | M          | L      | `.nvmrc` enforces; doctor.sh checks.                                                   |
| Hooks (Stage 8) misfire and break the session                                   | 8     | M          | H      | Each hook script tested standalone; all `\|\| true`-tolerant.                          |

---

## 7. Sequencing & Dependencies

```
Stage 0 (foundation)
   ↓
Stage 1 (plans cleanup) — independent, do first
   ↓
Stage 2 (docs reorg)    — depends on 1 (no plans in docs/ root)
   ↓
Stage 3 (README/CONTRIBUTING/ARCH) — depends on 2 (links must resolve)
   ↓
Stage 4 (subfolder CLAUDE.md) — depends on 3 (CONTRIBUTING explains them)
   ↓
Stage 5 (.claude restructure) — depends on 4 (context files cross-link CLAUDE.md)
   ↓
Stage 6 (slash commands) — depends on 5 (commands cross-link context)
Stage 7 (subagents)      — depends on 5 (parallelizable with 6)
   ↓
Stage 8 (settings/hooks) — depends on 6+7 (settings.json may reference commands/agents)
   ↓
Stage 9 (scripts/services) — independent of 6–8 in spirit; do after 8 to keep history clean
   ↓
Stage 10 (DX mock-stack) — depends on 9 (uses doctor.sh; uses _template/)
   ↓
Stage 11 (CI) — depends on 9+10 (CI runs scripts; uses dev compose for compose-validate)
   ↓
Stage 12 (naming/env cleanup) — depends on 9–11 (touches scripts/Makefile/CI references)
   ↓
Stage 13 (polish) — last
```

Stages 6 and 7 can be done in parallel. Stages 1–8 are mostly mechanical; the user can do stage-by-stage commits. Stages 9–11 are the engineering heavy-lifters; allocate longer focused sessions.

---

## 8. How to Execute (Working Mode)

For each stage:

1. User opens a session and says: "Start stage N".
2. Claude reads §5 stage N, surfaces any new uncertainties via `AskUserQuestion`, then implements.
3. Claude commits with the message specified in the stage spec.
4. User reviews the diff (or asks `/review` to delegate to `code-reviewer` subagent — once Stage 7 lands).
5. Smoke-test the stage's acceptance criteria.
6. Move to the next stage.

**Pause points:** After Stage 5 (folder structure stable, no new conventions yet) and Stage 8 (entire `.claude/` ecosystem live, but no DX changes yet) — natural review checkpoints.

---

## 9. Open Questions

These were _not_ settled by the design-decision interview. Asked once each stage hits them:

- **Q-S0a:** Branch from `main` or stack on `feat/telegram-bot-overhaul`? (Stage 0)
- **Q-S2a:** Translate `docs/ADMIN_HANDBUCH.md` to English now or leave German for customers? (Stage 2; current recommendation: leave German, since customers are German-speaking — but tag with English title.)
- **Q-S3a:** Add a `LICENSE` file? Which license? (Stage 3)
- **Q-S6a:** Keep `/test`, `/implement`, `/review` as aliases for backwards compatibility, or delete cleanly? (Stage 6; recommendation: delete, the new commands are clearer.)
- **Q-S10a:** Mock Qdrant with a tiny FastAPI service, OR run real Qdrant container in dev? (Stage 10; recommendation: real Qdrant — image is small, no maintenance.)
- **Q-S10b:** Use `concurrently` (npm dep) or `tmux` for `make dev` parallel npm processes? (Stage 10)
- **Q-S11a:** Codecov upload (account needed) or skip coverage tracking? (Stage 11)

---

## 10. Definition of "Done Done"

- All 13 stages merged to main.
- All 12 acceptance criteria from §1 verified.
- This plan archived to `docs/plans/archive/2026-05_dx-overhaul.md` with status header.
- A 30-minute walkthrough recording (or written write-up) for future contributors explaining the new structure.
- A celebratory commit: `🎉 dx-overhaul complete` (only emoji exception in the repo, per Kolja's preference).

---

## Appendix A — Estimate Summary

| Stage     | Estimate                                                                                | Cumulative |
| --------- | --------------------------------------------------------------------------------------- | ---------- |
| 0         | 0.5 h                                                                                   | 0.5        |
| 1         | 1 h                                                                                     | 1.5        |
| 2         | 4 h                                                                                     | 5.5        |
| 3         | 3 h                                                                                     | 8.5        |
| 4         | 4 h                                                                                     | 12.5       |
| 5         | 4 h                                                                                     | 16.5       |
| 6         | 8 h                                                                                     | 24.5       |
| 7         | 3 h                                                                                     | 27.5       |
| 8         | 3 h                                                                                     | 30.5       |
| 9         | 6 h                                                                                     | 36.5       |
| 10        | 12 h                                                                                    | 48.5       |
| 11        | 4 h                                                                                     | 52.5       |
| 12        | 3 h                                                                                     | 55.5       |
| 13        | 4 h                                                                                     | 59.5       |
| **Total** | **~60 h** (≈ 8 working days, with 2–4 days buffer for surprises = ~10–14 calendar days) |

---

## Appendix B — Files Touched (rough count, pre-execution estimate)

- Created: ~80 (slash commands, agents, hooks, READMEs, mock services, CI workflow, plan files, ENVIRONMENT.md, …)
- Moved/renamed: ~60 (docs reorg, plan archives, naming fixes)
- Modified: ~30 (README, CLAUDE.md, settings, package.json, Makefile, …)
- Deleted: ~10 (stale plan files, old commands, .env backups)

Total churn: ~180 files. Spread across 13 commits, this is large but manageable. Each commit is reviewable in isolation.

---

_End of plan._
