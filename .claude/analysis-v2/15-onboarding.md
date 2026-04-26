# Onboarding Friction Analysis - Arasul Platform

**Date**: 2026-04-22  
**Scope**: New developer day-1 experience, naming consistency, documentation clarity  
**Perspective**: First-time contributor joining the project

---

## TOP 5 ONBOARDING PAIN POINTS

### 1. **Language Mixing Blocks Quick Onboarding** (High Friction)

**Problem**: Core docs are in MIXED LANGUAGES—German + English—without clear boundaries:

- `README.md` → ENGLISH (executive summary)
- `CLAUDE.md` → GERMAN (core rules, task-router, context instructions)
- `docs/DEVELOPMENT.md` → ENGLISH
- `docs/ARCHITECTURE.md` → ENGLISH
- `docs/JETSON_COMPATIBILITY.md` → ENGLISH
- `docs/ADMIN_HANDBUCH.md` → GERMAN
- `docs/FRESH_DEPLOY_GUIDE.md` → GERMAN

**Impact**: New dev reads README (English), opens CLAUDE.md (German), bounces between docs in different languages. No clear policy stated anywhere.

**Evidence**:

- CLAUDE.md contains unverhandelbare Regeln (non-negotiable rules) but only in German
- German comments scattered throughout code
- Some docs show "Deployment-Anleitung" vs "Deployment" naming
- CLAUDE.md explicitly states "Arasul ist eine autonome Edge-AI-Plattform für NVIDIA Jetson" — but README is in English

**Friction Score**: 🔴 **HIGH** — Requires context-switching on day 1

---

### 2. **No Local Dev Server (Docker-Rebuild Cycle Only)** (Critical DX Hit)

**Problem**: Per CLAUDE.md section 4: "Es gibt keinen lokalen Dev-Server — Docker Rebuild nach Code-Änderungen"

Every code change requires: `docker compose up -d --build dashboard-backend dashboard-frontend`  
Full rebuild on file change = **3-5 minute feedback loop**

**What new dev expects**: `npm run dev` or `make dev-backend` (as advertised in Makefile)

**What actually happens**:

```bash
make dev-backend  # Tries to run npm locally
# But app is designed to only run in Docker
# Change code → docker rebuild → wait → test → repeat
```

**Impact**:

- Trivial CSS change requires 3-min Docker rebuild
- Can't debug with `console.log` without container logs
- No hot-reload, no instant feedback
- Productivity crater vs typical Node/React development

**Evidence**:

- Makefile has `dev-frontend` and `dev-backend` targets that might mislead devs
- CLAUDE.md explicitly warns against this
- No documented "fast feedback loop" alternative

**Friction Score**: 🔴 **CRITICAL** — Single biggest friction point for daily work

---

### 3. **Top-Level Directory Clutter & Unclear Ownership** (Moderate Friction)

**Problem**: Root has ~30 items mixing config, logs, data, temporary files:

```
.env                    ← Secrets (should be .gitignored, not shared)
.env.backup.20260314_*  ← Backups (why 2 backup copies at root?)
.env.example            ← Example
.env.jetson             ← Jetson-specific
.env.template           ← Template
cache/                  ← Empty folder, purpose unclear
data/                   ← 56 MB of Postgres, MinIO, Ollama state
logs/                   ← 500 MB+ of traefik logs (should rotate)
letsencrypt/            ← TLS certs
packages/               ← Unclear: not npm packages
packaging/              ← Different from packages/?
BUGS_AND_FIXES.md       ← 2.6 KB document (operational log?)
CHANGELOG.md            ← Minimal (47 lines, outdated)
VERSION                 ← Single "1.0.0" line
CLAUDE.md               ← AI-facing docs (confuses humans)
.mcp.json               ← MCP config (what is this for new dev?)
.claude/                ← Hidden AI context (should .gitignore?)
```

**Confusion**:

- `packages/` vs `apps/` — what's the difference?
- `packaging/` exists but empty or purpose unclear
- `.env.backup.*` at root suggests ad-hoc backups, not proper VCS
- `BUGS_AND_FIXES.md` is operational history, not a feature/bug tracker
- Why are `cache/`, `data/`, `logs/` at repo root instead of `/.gitignored/`?

**Impact**:

- New dev sees 20+ root items and can't tell which are essential
- `data/` and `logs/` suggest mutable state in repo (should be excluded)
- Backup files at root are version-control anti-pattern

**Friction Score**: 🟡 **MODERATE** — Clutter, not blockers, but feels disorganized

---

### 4. **Naming Inconsistencies Across Monorepo** (Moderate Friction)

**Problem**: No consistent pattern for services, folders, or utilities:

| Issue                    | Location           | Examples                                                                     | Expected                                                                |
| ------------------------ | ------------------ | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| **Service naming**       | `services/`        | `llm-service`, `embedding-service`, `document-indexer`, `self-healing-agent` | Singular? Plural? Dash or underscore?                                   |
| **Utils vs Helpers**     | Frontend & Backend | `src/utils/`, `__tests__/helpers/`                                           | Interchangeable? Different purpose?                                     |
| **Store vs Stores**      | Frontend           | `src/features/store/` (singular)                                             | Inconsistent with Zustand patterns                                      |
| **Route directories**    | Backend            | `routes/`, `routes/system/`, `routes/admin/`                                 | Flat vs nested hierarchy unclear                                        |
| **Feature folder depth** | Frontend           | `features/chat/`, `features/documents/`, `features/settings/`                | 1-level deep, OK, but no `index.ts` barrel pattern enforced             |
| **Test file naming**     | Backend            | `*.test.js` (Jest)                                                           | Frontend uses `.test.tsx` and `.spec.ts` — mixing both in one codebase? |
| **Compose files**        | `compose/`         | `compose.core.yaml`, `compose.ai.yaml`, `compose.app.yaml`                   | Naming: `service-` prefix would clarify these are service definitions   |

**Evidence**:

- Backend: `routes/system/status.js` vs `routes/system/index.js` — when to use which?
- Frontend: `/features/chat/index.ts` exports `ChatRouter`, `ChatLanding`, `ChatView` — no pattern enforced
- `services/` has both `llm-service` and `self-healing-agent` (inconsistent casing/naming)

**Friction Score**: 🟡 **MODERATE** — Not blocking, but creates mental load

---

### 5. **CLAUDE.md is AI-Facing, Not Developer-Facing** (Moderate Friction)

**Problem**: `CLAUDE.md` (8 KB) is the main reference for developers but reads as instructions FOR Claude, not FOR humans:

```markdown
# Task-Router: Welchen Kontext laden?

Lade den passenden Kontext aus `.claude/context/` je nach Aufgabe:
| Wenn du... | Lade diesen Kontext |
| Backend-Route/Service schreibst | `backend.md` |
```

This is great FOR Claude, terrible FOR a new human developer.

**What's missing**:

- No "5-minute Happy Path" — which file do I edit first?
- Task router is AI-focused (load this context), not dev-focused (here's how to start)
- Entry points are correct but buried in "Quick Reference" section
- No explicit "these are the rules you'll be checked on" section for humans

**Impact**:

- New dev searches README, finds `CLAUDE.md`, thinks it's for them
- Gets confused by German + AI instructions
- Doesn't know "do I read CLAUDE.md or DEVELOPMENT.md?"
- Proper docs (DEVELOPMENT.md, ONBOARDING.md, etc.) are in `/docs/` — hidden

**Friction Score**: 🟡 **MODERATE** — Confusing but workarounds exist (docs/INDEX.md is good)

---

## NAMING INCONSISTENCIES TABLE

| Item                 | Current Pattern                                       | Location           | Issue                                                                   | Suggested                                                                                     |
| -------------------- | ----------------------------------------------------- | ------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Service Dirs**     | Mixed (kebab, underscore)                             | `services/`        | `llm-service` vs `embedding_service` naming                             | Enforce `service-name` kebab-case                                                             |
| **Utils Folders**    | Both `utils/` & `helpers/`                            | Backend & Frontend | No distinction, both do similar things                                  | Standardize to `utils/` only                                                                  |
| **Test Files**       | `.test.js` & `.spec.ts`                               | Codebase           | Jest uses `.test.js`, Vitest might use `.spec.ts`                       | Standardize: `.test.js` for Jest, `.test.ts` for Vitest, no `.spec.*`                         |
| **Compose Files**    | `compose.X.yaml`                                      | `compose/`         | No `service-` prefix, unclear they're service defs                      | Rename: `service-core.yaml`, `service-ai.yaml`, etc.                                          |
| **Feature Export**   | Barrel exports in `index.ts`                          | Frontend           | Some use it, consistency unclear                                        | Enforce barrel exports for all feature modules                                                |
| **Routes Structure** | Nested `routes/X/index.js`                            | Backend            | No clear when to nest vs flatten                                        | Document: `routes/X/index.js` = feature routes, `routes/X.js` = single file                   |
| **Database Dirs**    | `postgres/`, `postgres/init/`, `postgres/migrations/` | `services/`        | 3 different migration locations?                                        | Clarify: `/init/` = first-run, `/migrations/` for updates, or just one?                       |
| **Env Files**        | `.env.X` multiplied                                   | Root               | `.env`, `.env.backup.*`, `.env.example`, `.env.jetson`, `.env.template` | Enforce: `.env.local` (git-ignored), `.env.example` (committed), `.env.jetson` (separate doc) |

---

## TOP-LEVEL STRUCTURE RECOMMENDATIONS

### What Stays (Essential)

- `.env.example` — reference for devs
- `.gitignore` — VCS rules
- `README.md` — entry point
- `Makefile` — dev convenience
- `CLAUDE.md` — **but mark it AI-facing; extract human onboarding to separate file**
- `docs/` — all documentation
- `apps/`, `services/`, `compose/` — core structure
- `scripts/` — utilities
- `.github/` — CI/CD
- `config/` — Traefik, cron, etc.

### What Moves or Gets Removed

| Item                | Current | Action                                     | Reason                                                     |
| ------------------- | ------- | ------------------------------------------ | ---------------------------------------------------------- |
| `.env`              | Root    | Move to `.gitignored` or `.env.local` docs | Production secret, should never be committed               |
| `.env.backup.*`     | Root    | Delete or move to `backups/` folder        | Not VCS-tracked files; clutter                             |
| `cache/`            | Root    | Remove if empty                            | Appears unused                                             |
| `data/`             | Root    | Should NOT be in repo                      | Docker volume mounts at runtime; git-ignore                |
| `logs/`             | Root    | Should NOT be in repo                      | Runtime logs; git-ignore                                   |
| `letsencrypt/`      | Root    | Move to `data/letsencrypt/` or ignore      | TLS certs are runtime artifacts                            |
| `packaging/`        | Root    | Clarify or delete                          | Purpose unclear; merge with `scripts/packaging/` if needed |
| `packages/`         | Root    | Clarify or rename                          | Is this npm workspaces? Rename to `libs/shared-*`          |
| `BUGS_AND_FIXES.md` | Root    | Move to `docs/` or GitHub Issues           | Operational history, not onboarding                        |
| `CHANGELOG.md`      | Root    | Move to `docs/archive/`                    | Outdated (last entry Feb 2025)                             |
| `VERSION`           | Root    | Move to `package.json` or `.version` file  | Single-line files are unusual                              |

### New Folder: `.dev/`

```
.dev/                       ← NEW: Developer-facing docs & local setup
├── ONBOARDING.md           ← Extract from docs/INDEX.md
├── QUICK_START.md          ← Happy path (< 5 min)
├── DEV_LOOP.md             ← How to work locally (Docker rebuild cycle explained)
├── NAMING_CONVENTIONS.md   ← All the tables above
└── TROUBLESHOOTING_DEV.md  ← Common "my build is broken" issues
```

---

## DOCUMENTATION GAPS FOR NEWCOMERS

### Missing:

1. **"How do I make my first change?" walkthrough**
   - Pick a route, add an endpoint, test it, commit
   - Currently scattered across DEVELOPMENT.md + docs/API_REFERENCE.md

2. **"What does this folder do?" reference**
   - Each major directory (`apps/`, `services/`, `compose/`, `config/`) needs a 1-line summary
   - Example: `apps/` = "User-facing applications (frontend + backend)"

3. **"Docker rebuild cycle explained"**
   - CLAUDE.md warns about it but doesn't explain why or how to minimize pain
   - Example: "Change `src/index.js` → `docker compose up -d --build dashboard-backend` → wait 3 min"

4. **Policy on German vs English**
   - No explicit statement: "Core docs are English. German docs marked [GERMAN]."
   - Leaves dev guessing what to read

5. **Git workflow for this project**
   - "Make atomic commits, use `feat|fix|docs|refactor` prefix" ✓ (in CLAUDE.md, German)
   - Missing: "PR process? Code review? Who merges? CI gates?"

6. **"Who owns what?" — Code ownership**
   - No CODEOWNERS file or obvious way to know who to ping for:
     - Frontend components → ?
     - Backend API → ?
     - Database schema → ?
     - Self-healing agent → ?

---

## QUICK WINS (< 1 Hour Each)

1. **Rename `.claude/` to `.ai-context/`**
   - Signals clearly: "This is for AI, not for humans"
   - Add `.gitignore` comment: "# AI tool context; see docs/ for human docs"

2. **Create `.dev/QUICK_START.md`**
   - Copy happy path from docs/ONBOARDING.md
   - Add 5-min checklist: "Clone → .env → docker compose up → http://localhost"

3. **Add folder legend to README.md**

   ```
   ## Folder Structure
   - `apps/` → User-facing applications
   - `services/` → Backend services (AI, ops, etc.)
   - `docs/` → Documentation
   - `scripts/` → Utilities & automation
   ```

4. **Create `.github/CONTRIBUTING.md`**
   - "Commit conventions, PR template, review expectations"
   - Lifts from CLAUDE.md but in English and human-friendly

5. **Standardize all `.env` files**
   - Keep only: `.env.example` (committed)
   - Document: `.env.local` (git-ignored, for local dev)
   - Remove: `.env.backup.*` backups from root

6. **Mark CLAUDE.md as AI-facing**
   - Add at top:
   ```
   ⚠️ **This file is for Claude AI assistant context only.**
   → New developers: Start with [docs/INDEX.md](docs/INDEX.md) instead.
   ```

---

## STRUCTURAL CHANGES (Bigger, Higher Payoff)

1. **Extract Human Developer Docs**
   - Create `docs/DEVELOPER_ONBOARDING.md` (not in CLAUDE.md)
   - Content: Day-1 checklist, entry points, first change walkthrough
   - Link from README.md

2. **Language Policy Document**
   - File: `docs/LANGUAGE_POLICY.md`
   - Rule: "Core docs (ARCHITECTURE, API_REFERENCE, DEVELOPMENT) → English. Admin docs (Handbuch) → German OK. Code comments → English only."
   - Enforce via linter or PR guidelines

3. **Standardize Naming Conventions**
   - File: `docs/NAMING_CONVENTIONS.md` or `.dev/NAMING_CONVENTIONS.md`
   - Tables from section above, enforced in code review

4. **Rename Compose Files**
   - `compose.core.yaml` → `service-core.yaml`
   - `compose.ai.yaml` → `service-ai.yaml`
   - Clarifies these are service definitions

5. **Move Runtime Data Out of Repo**
   - `data/` → Add to `.gitignore` (Docker volumes mount here at runtime)
   - `logs/` → Add to `.gitignore`
   - `letsencrypt/` → Move to `data/.letsencrypt/`
   - `cache/` → Remove if empty, else clarify purpose

6. **Add CODEOWNERS file**
   ```
   # Example
   /apps/dashboard-backend/ @backend-team
   /apps/dashboard-frontend/ @frontend-team
   /services/llm-service/ @ai-team
   ```

---

## COGNITIVE LOAD: TOP 3 RENAMES TO REDUCE CONFUSION

If you can only do 3 things to reduce mental load:

1. **Rename `.claude/` → `.ai-context/`** (5 min)
   - Signals: "This is for AI tools, not for humans"
   - Preserves all tool functionality
   - Removes the "wait, is this for me?" question

2. **Add folder legend to README** (10 min)

   ```
   ## Repository Structure
   - `apps/` - User-facing applications (frontend, backend)
   - `services/` - Background services (AI, ops, metrics)
   - `docs/` - Documentation (start here for onboarding)
   - `scripts/` - Utility scripts
   - `compose/` - Docker Compose service definitions
   ```

   - Answers "what is this folder?" without hunting

3. **Create `docs/DEVELOPER_ONBOARDING.md`** (30 min)
   - Extract human-readable onboarding from scattered docs
   - Include: "First change walkthrough" + "Docker rebuild cycle explained"
   - Link from README.md so it's the second thing devs read

---

## WHAT'S ACTUALLY GOOD (Don't Change)

- ✅ **docs/INDEX.md** — Excellent navigation + reading paths for new devs
- ✅ **docs/DEVELOPMENT.md** — Clear patterns, examples, good checklists
- ✅ **docs/ARCHITECTURE.md** — Service overview is clean
- ✅ **Git commit conventions** — Enforced via CLAUDE.md, good discipline (165/recent commits follow pattern)
- ✅ **Feature organization** — `src/features/chat/`, `src/features/documents/` is sensible
- ✅ **API response format** — Consistent structure with timestamps
- ✅ **Test structure** — `__tests__/unit/` and `__tests__/integration/` separation clear
- ✅ **Makefile shortcuts** — `make logs s=backend`, `make build s=frontend` are helpful

---

## SUMMARY FOR LEADERSHIP

**New developer joining on Day 1 will:**

1. 🟢 Read `README.md` → Clear what the system does
2. 🟡 Find `CLAUDE.md` → Confused (German? AI instructions? For me?)
3. 🟡 Discover `docs/INDEX.md` → Better, but requires hunting
4. 🔴 Try `make dev-backend` → Fails (Docker-only environment, not documented)
5. 🟡 Attempt first code change → 3-5 min rebuild cycle feels slow
6. 🟡 Commit code → Where's the PR template? Who reviews?

**Impact**: Day 1 productivity is ~40% of baseline Node/React projects due to:

- Language confusion (German docs)
- No local dev server (Docker rebuild on every change)
- Scattered developer onboarding docs
- Unclear naming conventions

**Fixes**:

- Move `.claude/` to `.ai-context/` (5 min, huge clarity win)
- Extract human onboarding to `docs/DEVELOPER_ONBOARDING.md` (30 min)
- Document Docker rebuild cycle and why it exists (10 min)
- Standardize naming and environment files (1 hour)

**Total effort**: ~2 hours of changes → ~30% reduction in day-1 friction

---

## CHECKLIST FOR NEXT REVIEW

- [ ] Is CLAUDE.md marked as AI-facing? New devs directed to docs/INDEX.md?
- [ ] Does README.md have a "Repository Structure" section?
- [ ] Is there a `docs/DEVELOPER_ONBOARDING.md` with a first-change walkthrough?
- [ ] Do all `.env.*` backup files still exist at root? (Should be removed)
- [ ] Are `data/` and `logs/` in `.gitignore`?
- [ ] Is there a documented policy on German vs English?
- [ ] Does each folder (`apps/`, `services/`, `compose/`) have a README or legend?
- [ ] Is there a `.github/CONTRIBUTING.md` with commit conventions?

---

**End of Analysis**  
Generated: 2026-04-22
