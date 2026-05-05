# DX Overhaul — Developer Experience & Claude Code Setup

> **Status:** Active · **Owner:** Kolja · **Created:** 2026-05-03 · **Target:** 2026-05-17 (≈2 weeks)
>
> **Goal:** Reduce onboarding-to-productive time from "1–2 days" to "<2 hours" for a mid-level developer cloning the repo, while making the Claude Code setup a best-in-class reference.

---

## 0. Vision (revised 2026-05-05)

Two audiences have to love this repo:

1. **A new mid-level developer** clones it, reads `README.md`, SSHes to a Jetson, runs **one command** (`./arasul bootstrap`), and is iterating on real services within 30 minutes.
2. **Claude Code (and any other AI coding agent)** opens the repo and instantly understands the architecture, conventions, and available workflows from `.claude/` + `CLAUDE.md` files at every level.

The repo today is structured as an **appliance image** (customer-first). After this overhaul it is structured as a **product codebase** — appliance qualities preserved, but development workflow is first-class.

**What changed from the original vision:** the original §0 promised "even on an x86 laptop without a Jetson" via a mock-stack (`make dev`). That promise was withdrawn 2026-05-05 — see Stage 10 (DROPPED) for the rationale. The dev workflow is Jetson-native, by design.

---

## 1. Acceptance Criteria (Definition of Done)

The overhaul is complete when **all** of the following are true:

| #    | Criterion                                                                                                                                                                                                                                                                                                             | Verification                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| AC1  | Onboarding has a **single canonical path** documented in `README.md` → `docs/development/ONBOARDING.md`. Dev iteration happens on the Jetson via `docker compose up -d --build` (Rule #4). Local-laptop hot-reload via mock-stack is explicitly out of scope — see Stage 10 (DROPPED) for rationale.                  | Cold-clone walkthrough following README only.                        |
| AC2  | `README.md` is ≤ 200 lines and contains exactly one canonical "Get Started" command. No conflicting setup paths exist anywhere.                                                                                                                                                                                       | `wc -l README.md` and grep across `docs/`.                           |
| AC3  | `CONTRIBUTING.md` exists at repo root and covers: commit format, PR workflow, branching, language policy, test policy, slash-command catalog.                                                                                                                                                                         | File exists, all sections present.                                   |
| AC4  | `docs/` contains ≤ 30 markdown files at top level (down from 56). All "superseded" or "archived" content has moved to `docs/plans/archive/` or `docs/archive/`.                                                                                                                                                       | `find docs -maxdepth 1 -name '*.md' \| wc -l`.                       |
| AC5  | `.claude/` has the canonical structure: `commands/`, `agents/`, `hooks/`, `skills/`, `context/`, plus `settings.json`, `settings.local.json`, `settings.local.example.json`, `README.md`. No stale plan files in `.claude/` root.                                                                                     | `ls .claude/`.                                                       |
| AC6  | `.claude/commands/` contains exactly the minimalist set: `/plan` + `/ship`, both with valid YAML frontmatter (`description`, `argument-hint`). Rationale: Stage 6 was redesigned 2026-05-04 — most original commands were Bash-aliasable.                                                                             | File count + frontmatter lint.                                       |
| AC7  | `.claude/agents/` contains exactly two subagents: `research-agent` + `code-reviewer`, both auto-invoked by `/plan` only, both read-only. Rationale: Stage 7 was redesigned 2026-05-04 — most original agents were "main agent with a different hat".                                                                  | File count + frontmatter lint.                                       |
| AC8  | `.github/workflows/test.yml` exists and runs lint + tests + docker-build smoke on every PR. Discovered already in place (2026-04-22) when Stage 11 was reached — slim spec was abandoned in favour of the existing pipeline + 3 surgical fixes (node-version-file, drop stale develop branch, add concurrency block). | Green build on `feat/dx-overhaul`.                                   |
| AC9  | Every directory under `apps/`, `services/`, `scripts/`, `compose/`, `config/` has either a `README.md` or a `CLAUDE.md` (or both) explaining its purpose.                                                                                                                                                             | `find . -type d -depth 2 -not -path '*/node_modules/*'` cross-check. |
| AC10 | All naming-convention outliers identified by audit are fixed (1 frontend file, 8 bash scripts), with cross-references updated and tests passing.                                                                                                                                                                      | `git grep` of old names returns 0 results.                           |
| AC11 | The `interactive_setup.sh`-lie is gone — every script referenced in docs actually exists.                                                                                                                                                                                                                             | Doc-link checker script.                                             |
| AC12 | All English. Every doc, README, slash-command, and CONTRIBUTING file is in English. (Internal `.claude/memory/` and personal notes may stay German.)                                                                                                                                                                  | Sample audit + grep for German keywords.                             |

---

## 2. Design Decisions (User-confirmed via interview)

These were settled before this plan was written and should not be reopened mid-implementation:

| Decision                 | Choice                                                                                                   | Rationale                                                                                                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Doc language**         | English throughout                                                                                       | Onboardability for international devs, future open-source readiness.                                                                                                                                                                                                                         |
| **Slash-command naming** | Verb-first, hyphenated, no namespace colon (`/add-route`, `/create-migration`, `/rebuild-service`)       | Most readable for newcomers; works with autocomplete.                                                                                                                                                                                                                                        |
| **Plans location**       | `docs/plans/{active,archive,audits}/`                                                                    | Visible in repo, GitHub-browsable, separates "plans" from `.claude/` operational config.                                                                                                                                                                                                     |
| **DX depth**             | Slim — Jetson-only dev workflow + slim GitHub Actions (lint + typecheck). Mock-stack DROPPED 2026-05-05. | Rule #4 of the platform CLAUDE.md says "no local dev server, all changes via docker compose up -d --build on Jetson". A mock-stack contradicts this and would create false confidence (mocks would diverge from real GPU/CUDA stack). Solo dev = no PR review → heavy CI matrix is overkill. |

---

## 3. Out of Scope (Explicitly Not in This Plan)

- New product features. This is pure DX/structure work.
- Migrating any production data or breaking the running Jetson.
- Rewriting existing routes, components, or services. We only restructure, document, and add tooling.
- Translating existing German content to English in a single sweep — this happens **incrementally** as files are touched (Stage 1 covers obvious onboarding files; rest follows organically).
- Replacing the `arasul` CLI. It stays as is; we only document it.
- **Local-laptop dev workflow with mocks** (originally Stage 10, dropped 2026-05-05). Dev iteration happens on the Jetson via `docker compose up -d --build`. No `make dev`, no `compose.dev.yml`, no mock-LLM. See Stage 10 section for full rationale.
- **Heavy multi-job CI matrix** (originally Stage 11, slimmed 2026-05-05). Slim CI runs lint + typecheck only; full test suite runs locally before deploy.

---

## 4. Stage Map (12 active stages — Stage 10 dropped)

```
Stage 0 ── Foundation (branch, backups, plan into repo)             ✅ DONE
   │
Stage 1 ── Plans & Audits Cleanup (low-risk, big visual win)        ✅ DONE
   │
Stage 2 ── docs/ Reorganization                                      ✅ DONE
   │
Stage 3 ── README + CONTRIBUTING + ARCHITECTURE                      ✅ DONE
   │
Stage 4 ── Subfolder CLAUDE.md hierarchy                             ✅ DONE
   │
Stage 5 ── .claude/ Restructure (folder skeleton + cleanup)          ✅ DONE
   │
Stage 6 ── Slash Commands (/plan + /ship — REDESIGNED minimalist)    ✅ DONE
   │
Stage 7 ── Subagents (research-agent + code-reviewer, auto-only)     ✅ DONE
   │
Stage 8 ── Settings + Hooks (REDESIGNED minimalist — single hook)    ✅ DONE 2026-05-05
   │
Stage 9 ── scripts/ + services/ Standardization                      ⏳ TODO
   │
Stage 10 ── DX Mock-Stack + make dev                                 ❌ DROPPED 2026-05-05
   │       (contradicts Rule #4 — see Stage 10 section for rationale)
   │
Stage 11 ── GitHub Actions CI (existing test.yml + 3 surgical fixes)  ✅ DONE 2026-05-05
   │
Stage 12 ── Naming (knowledgeGraph rename — .env tasks dropped)       ✅ DONE 2026-05-05
   │
Stage 13 ── Final Polish & Smoke-Test                                ⏳ TODO
```

**Revised effort:** Stages 9 + 11 + 12 + 13 ≈ 1–1.5 working days remaining (down from original 5+ days for stages 9–13 because of dropped Stage 10 and slimmed Stage 11). Each remaining stage is a single mergeable commit.

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

### Stage 6 — Slash Commands (REDESIGNED 2026-05-04)

**History:** The original Stage 6 spec called for 28 verb-first commands
covering every routine workflow (`/add-route`, `/create-migration`,
`/run-tests-backend`, `/check-health`, etc.). The user rejected that
scope on 2026-05-04: most of those are Bash-aliasable (Makefile job)
or skill-suggestable (model-driven), not real slash commands. Mental
overhead too high. Real value is only in **multi-step, interview-driven,
context-aware** workflows — the rest belongs in Makefile or
`.claude/skills/`.

**Goal (revised):** Exactly **two** slash commands that own the entire
plan-and-ship lifecycle:

1. **`/plan <freitext>`** — Interview-driven (`AskUserQuestion` with
   previews, hard min ≥ 5 questions across ≥ 2 rounds), researches
   the codebase, writes `docs/plans/active/<slug>.md`, then
   **autonomously** executes all phases without per-phase gates.
   Ends at diff-review, hands off to `/ship`.
2. **`/ship`** — Tests + lint + format → conventional commit →
   archive plan to `docs/plans/done/`. **No push, no PR** —
   user keeps push hoheit. Marked
   `disable-model-invocation: true` (must be user-typed).

**Pre-conditions:** Stages 4–5 done.

**Defaults baked into the commands:**

| Aspect             | Default                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| Slug derivation    | slugify `$ARGUMENTS` ("Add document export" → `add-document-export`)                           |
| Slug collision     | Interview: append / replace / new-slug                                                         |
| Branch handling    | If on `main`: ask before continuing; otherwise stay on current branch                          |
| Plan-mode handling | `ExitPlanMode` at end of plan-write phase                                                      |
| Memory awareness   | `/plan` reads memory feedback (no radical redesigns, preview-driven interviews) as constraints |
| Phase granularity  | Incremental, each leaves system in working state                                               |
| Commit during exec | **Forbidden** — only `/ship` commits                                                           |
| Stage selection    | `/ship` reads plan's "Files Touched" and stages only those — never `git add -A`                |
| Plan archival      | `/ship` `git mv`s plan from `active/` to `done/` and amends                                    |

**Tasks:**

1. Write `.claude/commands/plan.md` (~150 lines, six numbered phases:
   Interview → Research → Plan-File → Approval → Execute → Diff-Review).
2. Write `.claude/commands/ship.md` (~120 lines, seven numbered phases:
   Pre-flight → Tests → Lint → Stage → Commit-Message → Commit → Archive).
3. Delete `.claude/commands/{test,implement,review}.md`.
4. Create `docs/plans/done/.gitkeep`.
5. Update `CONTRIBUTING.md` Slash-command-catalog (28-row table → 2 rows + rationale).
6. Update _this_ file's Stage 6 section so the plan matches reality.
7. Single commit.

**Acceptance:**

- `ls .claude/commands/*.md` returns exactly `plan.md` and `ship.md`.
- `docs/plans/done/` exists and is committed (via `.gitkeep`).
- `CONTRIBUTING.md` slash-catalog has 2 rows, not 28.
- Saving memory note (`feedback_slash_commands.md`) so future sessions don't re-propose the maximalist catalog.

**Risk:** Low. Pure additions to commands/, plus three deletions.
**Rollback:** Revert.
**Estimate:** 1.5 h actual (was 6–8 h for original 28-command spec).

---

### Stage 7 — Subagents (REDESIGNED 2026-05-04)

**History:** Original Stage 7 spec called for 8 subagents covering
backend/frontend/python/db/infra/test/doc-writer + reviewer. User
rejected on 2026-05-04 with the same minimalism reasoning as Stage 6:
6 of 8 were "main agent with a different hat" — they read the same
subfolder CLAUDE.md the main agent already reads. Only research and
review have a real reason to be separate (isolated context + distinct
mental model).

**Goal (revised):** Exactly **two** subagents, both auto-invoked by
`/plan`, neither user-callable as a slash command.

**Catalog:**

| Name             | Purpose                                                              | Tools                                             | Model  | Invoked from    |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------------------- | ------ | --------------- |
| `research-agent` | Read codebase area being touched. Returns Files/Patterns/Risks.      | `Read, Grep, Glob`                                | sonnet | `/plan` Phase 2 |
| `code-reviewer`  | Critique pending changes. Critical/Warnings/Suggestions + file:line. | `Read, Grep, Glob, Bash` (git diff/log/show only) | sonnet | `/plan` Phase 6 |

**Critical-fix loop** (defined in `/plan` Phase 6): if `code-reviewer`
returns Critical findings, `/plan` addresses each by editing the cited
file, then re-spawns the reviewer once. Stop after 1 retry. Warnings
and Suggestions are _never_ auto-fixed — only printed for the user.

**Pre-conditions:** Stages 4–6 done (so `/plan` exists to invoke them).

**Tasks:**

1. Write `.claude/agents/research-agent.md` (~80 lines): read-only,
   structured-output prompt, hard rules (no editing, concise, no
   speculation).
2. Write `.claude/agents/code-reviewer.md` (~90 lines): read-only,
   structured-output prompt with Critical/Warnings/Suggestions buckets
   tied to subfolder CLAUDE.md "Forbidden" lists.
3. Update `.claude/commands/plan.md` Phase 2 → delegate to
   `research-agent`. Phase 6 → spawn `code-reviewer` + critical-fix
   loop + print Warnings/Suggestions verbatim.
4. Update `CONTRIBUTING.md` §9 (Code review) — describe both agents
   as auto-invoked, drop user-typed invocation guidance.
5. Update _this_ file's Stage 7 section.
6. Memory note (`feedback_subagents.md`) so future sessions don't
   re-propose the maximalist 8-agent catalog.
7. Single commit.

**Acceptance:**

- `ls .claude/agents/*.md` returns exactly `research-agent.md` and `code-reviewer.md`.
- `/plan.md` Phase 2 explicitly delegates to `research-agent` via Agent tool.
- `/plan.md` Phase 6 explicitly spawns `code-reviewer` + has the critical-fix loop documented.
- `CONTRIBUTING.md` §9 reflects auto-only invocation.
- Memory note saved.

**Risk:** Low. Pure additions to `.claude/agents/`, surgical edits to `/plan.md`.
**Rollback:** Revert.
**Estimate:** 1.5 h actual (was 3 h for the 8-agent spec).

---

### Stage 8 — Settings + Hooks (REDESIGNED 2026-05-05) ✅ DONE

**History:** The original Stage 8 spec called for **three** hooks
(`block-destructive.sh` + `remind-migration.sh` + `remind-rebuild.sh`)
plus `availableModels` and `enableAllProjectMcpServers` settings.
Reviewed on 2026-05-05 with the same minimalism lens applied to Stages 6
and 7. Result: only one hook actually adds value.

- `block-destructive.sh` ✅ — closes a gap that `permissions.deny`
  cannot cover (force-push to main, `reset --hard origin/main`, `dd`,
  `mkfs.*`, `fdisk`). Defense-in-depth on top of the `rm -rf` deny rule.
- `remind-migration.sh` ❌ — duplicates info already in
  `services/postgres/CLAUDE.md`. The `research-agent` reads
  `services/postgres/init/` live for the real next number, so a static
  reminder adds no signal.
- `remind-rebuild.sh` ❌ — Rule #4 of the platform CLAUDE.md ("no local
  dev server, all changes via docker compose up -d --build") plus the
  `coding_patterns.md` memory entry already cover this. Hook would
  fire on every `src/` edit (~50× per session) and add zero new info.
- `availableModels` ❌ — not a verified Claude Code settings field,
  skipped to avoid load errors. User can switch via `/model`.
- `enableAllProjectMcpServers` ❌ — `.mcp.json` is gitignored in this
  repo, so the setting has no effect.

**Goal (revised):** Single team-shared `block-destructive.sh` hook +
a committed `settings.local.example.json` template so new contributors
have a copy-paste starting point for personal hooks.

**Pre-conditions:** Stages 5–7 done.

**Tasks (executed):**

1. Wrote `.claude/hooks/block-destructive.sh` (~70 lines):
   - Reads tool-call JSON from stdin, extracts `tool_input.command` via
     `python3` (more portable than `jq`, fail-open on parser error).
   - Blocks `rm -rf` against critical paths
     (`/`, `~`, `$HOME`, `/etc`, `/var`, `/usr`, `/boot`, `/bin`, `/sbin`, `/lib`),
     accepting any flag-order combination (`-rf`, `-fr`, `-rfv`, `-r -f`, ...).
   - Blocks `git push --force` / `--force-with-lease` / `-f` against
     `main` or `master`.
   - Blocks `git reset --hard` against `origin/main` or `origin/master`.
   - Blocks `dd if=` / `dd of=`, `mkfs.*`, `fdisk /dev/...`.
   - Exit 2 = abort tool call. Exit 0 = allow. Stays silent for
     allow-cases.
2. `chmod +x .claude/hooks/block-destructive.sh`; removed the now-superfluous
   `.gitkeep`.
3. Added `hooks.PreToolUse(Bash)` section to `.claude/settings.json`
   pointing at `${CLAUDE_PROJECT_DIR}/.claude/hooks/block-destructive.sh`
   with a 5-second timeout.
4. Wrote `.claude/settings.local.example.json` (~50 lines, committed):
   template with three commented-out personal hooks
   (`PostToolUse(Edit|Write)` → typecheck, `Stop` → telegram-notify,
   `Notification` → telegram-notify). Empty `permissions.allow`/`deny`
   so the team baseline isn't duplicated.
5. Updated `.claude/README.md` Settings section + first-time-setup
   snippet (`cp settings.local.example.json settings.local.json`).
6. Verified `.gitignore` already excludes `.claude/settings.local.json`
   (line 81 — added in Stage 5).
7. Standalone tested 18 hook patterns (6 allow + 12 block + 2 edge
   cases) — all pass.
8. Single commit: `feat(claude): Stage 8 — block-destructive hook + settings template`.

**Files:** 5 changed (`+161 / -12`):

- New: `.claude/hooks/block-destructive.sh`, `.claude/settings.local.example.json`
- Modified: `.claude/settings.json`, `.claude/README.md`
- Deleted: `.claude/hooks/.gitkeep`

**Acceptance (verified):**

- `python3 -m json.tool .claude/settings.json` parses cleanly.
- `python3 -m json.tool .claude/settings.local.example.json` parses cleanly.
- 18 standalone hook tests all green.
- `git status` shows `.claude/settings.local.json` as untracked.
- `.claude/settings.local.example.json` is tracked.

**Risk realised:** None. The fail-open JSON-parse fallback eliminates
the "broken hook bricks the session" risk from the original plan.
**Rollback if needed:** Remove the `hooks` block from
`.claude/settings.json`.
**Actual effort:** ~45 min (vs. 3 h original estimate, because two
of three hooks were dropped and the JSON contents shrank dramatically).

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

### Stage 10 — DX Mock-Stack + `make dev` ❌ DROPPED 2026-05-05

**Decision:** Stage 10 is dropped. No `compose.dev.yml`, no mock-LLM,
no mock-Qdrant, no `make dev` target.

**Rationale (decided 2026-05-05):**

1. **Contradicts Rule #4 of the platform CLAUDE.md** — "Deploy: there is
   no local dev server. After code changes: `docker compose up -d --build <service>`.
   The user verifies in the browser." A mock-stack creates a parallel
   dev workflow that the platform explicitly rejects.
2. **Mock divergence risk.** The original plan acknowledged: "Mock services
   need maintenance as real APIs evolve." For LLM/Qdrant/Embedding, mocks
   would diverge from real GPU/CUDA behavior — false confidence in tests
   that pass locally but fail on Jetson is worse than no local dev at all.
3. **Solo-dev workflow doesn't need it.** Kolja edits over SSH on the
   Jetson directly. The "1.5 days" investment buys a workflow nobody uses.
4. **Out-of-scope qualifier was missed in the original plan.** The
   "Out of Scope" section should have ruled this out from the start —
   the explicit "Edge-AI appliance" framing means the GPU + CUDA stack
   _is_ the platform, not an interchangeable backend.

**Implication for AC1:** Reframed — onboarding is now "clone → SSH to
Jetson → `docker compose up -d`" as the single canonical path. No
"15 min on macOS x86" target.

**Implication for Stage 9:** `scripts/doctor.sh` no longer needs to
check x86-laptop prerequisites. It checks Jetson prerequisites
(Docker, NVIDIA Container Runtime, free ports, `.env`).

**Saved effort:** ~1.5 working days.

**If the team ever changes its mind:** the original spec is preserved
in git history (commit `7f0d011` and earlier). Re-introduce as a
separate plan, not as part of this overhaul.

---

### Stage 11 — GitHub Actions CI ✅ DONE 2026-05-05 (was already 80 % there)

**Discovery on 2026-05-05:** when Stage 11 was reached, the repo
**already had** `.github/workflows/test.yml` from a prior workstream
(modified 2026-04-22). It runs:

- `backend` job — lint + jest + npm-audit + coverage upload (BLOCKING)
- `frontend` job — lint + vitest + coverage (advisory; ~1500 legacy
  ESLint warnings + ~90 failing vitest tests are tracked under
  Phase 6.1b and don't block the pipeline)
- `docker-build` matrix — 5 images (BLOCKING)
- `python-services` matrix — 2 services (advisory)
- `ci-summary` — aggregates so branch protection can require a single
  check name

This is **more capable** than the slim "lint + typecheck only" plan
written 2026-05-05 — it includes Docker build smokes and per-service
Python test runs, both genuinely useful. Replacing it with the slim
spec would be a regression. Decision: keep `test.yml` as is, apply
two surgical improvements.

**Improvements applied (commit landing in this stage):**

1. `node-version: '20'` (hardcoded) → `node-version-file: .nvmrc`
   (currently 22). Local and CI now use the same Node version.
2. `branches: [main, develop]` → `branches: [main]`. The repo has
   no `develop` branch, so the trigger config was stale.
3. Added a `concurrency` block (`cancel-in-progress: true`) so a new
   push to a branch cancels the older still-running CI run for that
   branch — saves Actions minutes.

**Files:** `.github/workflows/test.yml` (modified, ~6 lines).

**Acceptance:**

- CI passes on `feat/dx-overhaul` after the rename + service-README
  commits.
- Workflow runs against Node 22 (matches `.nvmrc`).

**Risk:** Very low — three small config tweaks to a working pipeline.
**Rollback:** Revert this commit; the previous `test.yml` is intact in
git history.
**Actual effort:** ~15 min.

**What's NOT done and why:**

- No new "slim CI" workflow file. The existing `test.yml` already
  covers AC8 ("`.github/workflows/ci.yml` runs lint + typecheck") and
  more. Note: AC8 originally specified a `ci.yml` filename — `test.yml`
  fulfills the same intent under a different name. Treating that as a
  cosmetic acceptance gap, not a real one.
- No status badge added to `README.md`. Optional polish — defer
  until/unless a public-facing badge becomes useful.

---

### Stage 12 — Naming + `.env` Cleanup (REDESIGNED 2026-05-05 — slim) ✅ DONE

**Reality check on 2026-05-05:** when Stage 12 was reached, most of the
original sub-tasks were either already handled, redundant, or high-risk
for low payoff. Only the JS file rename had real value left. Slimmed
scope:

| Original task                                                                | Decision  | Reason                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rename `knowledge-graph.js` → `knowledgeGraph.js` (route + schema)           | **DONE**  | Aligns with the camelCase neighbours in `routes/` (`documentAnalysis.js`, `claudeTerminal.js`, `externalApi.js`). Also renamed the matching schema file. URL prefix (`/api/knowledge-graph`) stays kebab — REST convention. |
| Delete `.env.backup.20260314_*`                                              | **SKIP**  | Files are local-only (not in git), already gitignored via `.env.backup.*` pattern. No repo cleanup needed.                                                                                                                  |
| Move `.env.jetson` → `config/profiles/jetson.env`                            | **SKIP**  | File is local-only (gitignored), only 2 script refs. Move would just churn paths in `detect-jetson.sh` + `preconfigure.sh` for no operator benefit.                                                                         |
| Merge `.env.template` (10 KB, 100+ vars) + `.env.example` (1.5 KB, ~30 vars) | **DEFER** | Both are tracked but contain genuinely different content (not duplicates). Plus `.env.template` is referenced in 10+ files. Merge would be risky and benefits a workflow that's already working. Open as Q-S12c.            |
| New `docs/development/ENVIRONMENT.md`                                        | **SKIP**  | `docs/ENVIRONMENT_VARIABLES.md` (749 lines, kept current) already serves this purpose. A second file would just compete for "single source of truth".                                                                       |
| Consolidate `logs/` (root) → `data/logs/`                                    | **SKIP**  | `logs/` is gitignored (line 22 of `.gitignore`). Two stray local log files (~230 bytes total). Move would touch Compose volume mounts (Traefik, Loki, Promtail) — high risk for cosmetic gain.                              |

**Tasks executed:**

1. `git mv apps/dashboard-backend/src/routes/ai/knowledge-graph.js apps/dashboard-backend/src/routes/ai/knowledgeGraph.js`.
2. `git mv apps/dashboard-backend/src/schemas/knowledge-graph.js apps/dashboard-backend/src/schemas/knowledgeGraph.js`.
3. Updated `apps/dashboard-backend/src/routes/index.js` line 130: `require('./ai/knowledge-graph')` → `require('./ai/knowledgeGraph')`.
4. Updated `apps/dashboard-backend/src/routes/ai/knowledgeGraph.js` line 21: `require('../../schemas/knowledge-graph')` → `require('../../schemas/knowledgeGraph')`.
5. **NOT** touched: API URL prefix `/knowledge-graph` (kept kebab — REST best practice for URLs), JSDoc comments mentioning `/api/knowledge-graph/...` (URLs).

**Files:** 4 changed (2 `git mv`, 2 import-path updates).

**Acceptance:**

- `git ls-files apps/dashboard-backend/src/routes/ai/ | grep knowledge` → only `knowledgeGraph.js`.
- `git ls-files apps/dashboard-backend/src/schemas/ | grep knowledge` → only `knowledgeGraph.js`.
- `grep -rn "require.*knowledge-graph" apps/dashboard-backend/src/` → 0 hits.
- API URL `/api/knowledge-graph/*` still resolves (no change to mount).

**Risk realised:** Low. The two `require()` paths are the only consumers; URL routing is untouched.
**Rollback:** Revert this commit.
**Actual effort:** ~20 min (vs. 3 h original estimate, because the .env / logs / new-doc tasks were dropped).

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

| Risk                                                                            | Stage | Likelihood | Impact | Mitigation                                                                                       |
| ------------------------------------------------------------------------------- | ----- | ---------- | ------ | ------------------------------------------------------------------------------------------------ |
| Bash-script rename breaks Compose/Make/CI                                       | 9     | M          | H      | Rename one at a time, `git grep` the old name, run smoke after each.                             |
| Subfolder CLAUDE.md content goes stale                                          | 4     | M          | M      | Treat them like docs — update when patterns change, not lazily.                                  |
| Stage 1 file moves break some dev's local branch                                | 1     | L          | L      | Communicate timing; merge stages quickly so feature branches don't fester.                       |
| Translating `ADMIN_HANDBUCH.md` etc. to English breaks customer's understanding | 2     | L          | M      | Don't translate customer-facing docs in this overhaul. Keep them in German.                      |
| `block-destructive.sh` false-positive blocks legit command                      | 8     | L          | L      | 18 standalone tests cover allow-cases. Worst case: edit hook in `.claude/hooks/` to relax regex. |
| Slim CI misses a class of breakage that full matrix would catch                 | 11    | M          | L      | Solo dev runs full suite locally before deploy. Add jobs incrementally if a regression slips.    |

---

## 7. Sequencing & Dependencies (revised 2026-05-05)

```
Stages 0-8 ── DONE (see Stage Map for status icons)
   ↓
Stage 9 (scripts/services) — independent; touches Makefile + bash naming
   ↓
Stage 11 (slim CI) — depends on 9 (npm scripts may be added)
   ↓
Stage 12 (naming/env cleanup) — depends on 9+11 (cross-refs)
   ↓
Stage 13 (polish + smoke + archive) — last
```

Stage 10 removed from the chain (see Stage 10 section for rationale).
Remaining work is sequential and mostly mechanical — no parallelization needed.

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

Stages 0–8 questions are all closed. Remaining questions for Stage 9+:

- **Q-S9a:** `scripts/maintenance/` (1 file) — merge into `scripts/system/` or `scripts/util/`? Recommendation: `util/` (lower-friction, single-file folders are noise).
- **Q-S9b:** `services/_template/` — Python skeleton or Node skeleton (or both)? Recommendation: Python only — the platform's new services have all been Python lately.
- **Q-S12a:** `.env.jetson` move target — keep at root or move to `config/profiles/jetson.env`? Original plan said move; verify nothing in `arasul` CLI hard-codes the path before moving.
- **Q-S12b:** `logs/` → `data/logs/` consolidation — verify Traefik, Loki, Promtail still work. If risk too high, defer to a separate plan.

Closed (decisions made 2026-05-05):

- ~~Q-S10a/b~~ (Mock-stack questions) — N/A, Stage 10 dropped.
- ~~Q-S11a~~ (Codecov) — skip; slim CI has no coverage step.

---

## 10. Definition of "Done Done"

- All 12 active stages merged to main (Stage 10 dropped, not merged).
- All 12 acceptance criteria from §1 verified (note: AC1 reframed for Jetson-only workflow, AC8 reframed for slim CI).
- This plan archived to `docs/plans/archive/2026-05_dx-overhaul.md` with status header.
- A celebratory commit: `🎉 dx-overhaul complete` (only emoji exception in the repo, per Kolja's preference).

---

## Appendix A — Estimate Summary (revised 2026-05-05)

| Stage     | Original | Actual / Revised                          | Cumulative |
| --------- | -------- | ----------------------------------------- | ---------- |
| 0         | 0.5 h    | done                                      | 0.5        |
| 1         | 1 h      | done                                      | 1.5        |
| 2         | 4 h      | done                                      | 5.5        |
| 3         | 3 h      | done                                      | 8.5        |
| 4         | 4 h      | done                                      | 12.5       |
| 5         | 4 h      | done                                      | 16.5       |
| 6         | 8 h      | ~1.5 h actual (redesigned)                | 18.0       |
| 7         | 3 h      | ~1.5 h actual (redesigned)                | 19.5       |
| 8         | 3 h      | ~0.75 h actual (redesigned)               | 20.25      |
| 9         | 6 h      | ~3 h (kebab-case + READMEs + \_template)  | 23.25      |
| 10        | 12 h     | **DROPPED**                               | —          |
| 11        | 4 h      | ~1 h (slim CI)                            | 24.25      |
| 12        | 3 h      | ~2 h                                      | 26.25      |
| 13        | 4 h      | ~1 h (link validator + smoke + archive)   | 27.25      |
| **Total** | ~60 h    | **~27 h** (≈ 3.5 working days end-to-end) |

---

## Appendix B — Files Touched (revised post-decision)

- Created: ~30 (commands/, agents/, hook, settings template, CI workflow, scripts/doctor.sh, services/\_template/, missing service READMEs, ENVIRONMENT.md)
- Moved/renamed: ~50 (docs reorg, plan archives, kebab-case bash renames)
- Modified: ~20 (README, CLAUDE.md, settings.json, package.json, Makefile, …)
- Deleted: ~8 (stale plan files, .env backups)

Total churn: ~110 files (down from ~180 pre-execution estimate, primarily because Stage 10 dropped removed mock-LLM/mock-Qdrant/compose.dev.yml). Spread across 12 commits, each reviewable in isolation.

---

_End of plan._
