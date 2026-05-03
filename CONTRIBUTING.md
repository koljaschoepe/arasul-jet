# Contributing to Arasul

Welcome. This document is the contract for working on the Arasul codebase. Read it once before your first PR; refer back as needed.

For the cold-clone-to-first-PR walkthrough, read [`docs/development/ONBOARDING.md`](docs/development/ONBOARDING.md) first. This file documents the **rules**; ONBOARDING.md documents the **steps**.

---

## 1. Development setup

### Quickest path (x86, no Jetson hardware)

```bash
git clone <repo-url> arasul-jet
cd arasul-jet
./scripts/doctor.sh       # pre-flight checks
make dev                  # backend (nodemon) + frontend (Vite HMR) against a mock-LLM stack
```

`make dev` is the canonical contributor entry point. It runs the dashboard apps directly on your host with hot-reload, against a small Compose stack of backing services (Postgres, MinIO, mock-LLM, real Qdrant). The mock LLM echoes prompts with a `[mock]` prefix — fine for UI work, not for testing model behavior.

> `make dev` and `scripts/doctor.sh` ship as part of [Stage 10 of the DX overhaul](docs/plans/active/DX_OVERHAUL.md). Until they're merged on your branch, fall back to `docker compose up -d` and the rebuild loop documented in `docs/development/ONBOARDING.md`.

### On a Jetson appliance

```bash
./arasul bootstrap        # full appliance bring-up
```

See [`docs/ops/DEPLOYMENT.md`](docs/ops/DEPLOYMENT.md) for the operator-side workflow.

---

## 2. Branching

- `main` is the protected default branch. Never push directly; always go through a pull request.
- Branch names follow the pattern `<type>/<short-slug>`:
  - `feat/<slug>` — new feature
  - `fix/<slug>` — bug fix
  - `refactor/<slug>` — restructure without behavior change
  - `docs/<slug>` — docs-only
  - `chore/<slug>` — tooling, configuration, dependencies
  - `test/<slug>` — test-only
- Examples: `feat/telegram-multi-bot`, `fix/rag-cite-parser`, `refactor/llm-queue-single-stream`, `docs/onboarding-rewrite`.
- Keep branches short-lived (≤ 1 week); rebase frequently against `main`.

---

## 3. Commit format — Conventional Commits

```
<type>(<optional-scope>): <subject>
```

- **type** (required): `feat | fix | docs | refactor | test | chore | ci | build | perf`.
- **scope** (optional): the area of the codebase touched: `backend`, `frontend`, `db`, `llm`, `n8n`, `ops`, `claude`, etc.
- **subject** (required): imperative, lowercase, no trailing period; ≤ 72 characters.

Examples:

```
feat(backend): add /api/projects/:id/archive endpoint
fix(rag): handle empty PDF chunks in indexer pipeline
refactor(llm-queue): collapse to single in-flight stream
docs(onboarding): add x86 dev path with make dev
chore(claude): introduce .claude/agents/ scaffold
ci: add GitHub Actions workflow for lint + typecheck
```

Body (optional): explain _why_, not _what_. The diff already shows what.

Use a HEREDOC when the message has multiple paragraphs:

```bash
git commit -m "$(cat <<'EOF'
feat(backend): add /api/projects/:id/archive endpoint

Soft-deletes the project and cascades to its documents and
chats via the existing trigger. Required for the upcoming
admin "archive view" UI work.

Co-Authored-By: ...
EOF
)"
```

---

## 4. Pull-request workflow

1. Branch from `main`.
2. Implement the change. Add or update tests.
3. Run the full local test suite:
   ```bash
   ./scripts/test/run-tests.sh --all
   ```
4. Update relevant docs if behavior or API changed (see [§7 Conventions](#7-conventions)).
5. Push and open the PR using one of:
   ```bash
   gh pr create --draft           # if you want feedback first
   gh pr create                   # ready for review
   ```
6. PR title follows the same Conventional Commits pattern as commits.
7. PR body contains:
   - **Summary** — 1–3 bullets, why the change exists.
   - **Test plan** — what you ran, what to verify in review.
   - **Screenshots** — for UI changes.
8. CI must be green (lint, typecheck, tests, compose-validate). No merge with red CI.
9. At least one reviewer approval is required. The [`code-reviewer`](.claude/agents/) subagent can do a first pass — see [§9 Code review](#9-code-review).

### Don't

- Do **not** force-push to `main`.
- Do **not** skip pre-commit hooks (`--no-verify`) without an explicit reason in the PR body.
- Do **not** mix unrelated changes in one PR. Split.
- Do **not** check in `.env*`, secrets, large binaries, or generated artifacts. The pre-commit hook blocks the obvious cases — but check yourself.

---

## 5. Test policy

- Every feature change must add or update at least one test that would have caught the bug or asserts the new behavior.
- Bug fixes start with a failing regression test.
- The local suite is fast; run it before every push:
  ```bash
  ./scripts/test/run-tests.sh --backend     # Jest
  ./scripts/test/run-tests.sh --frontend    # Vitest
  ./scripts/test/run-tests.sh --python      # pytest (services/)
  ./scripts/test/run-tests.sh --all
  ```
- CI runs the full matrix on every PR. CI has no special privileges your local environment lacks — green local ≈ green CI.

Test conventions and locations: [`docs/development/TESTING.md`](docs/development/TESTING.md).

---

## 6. Language policy

**English everywhere new.** All new documentation, code comments, slash commands, agent definitions, commit messages, and PR bodies are written in English.

Existing German content is migrated **as it's touched** — there is no big-bang translation sweep. If you edit a German file, translate it (or the touched section). If you don't, leave it.

**Customer-facing material stays German** (intentional):

- [`docs/ops/QUICK_START.md`](docs/ops/QUICK_START.md) — end-customer setup.
- [`docs/ops/ADMIN_HANDBUCH.md`](docs/ops/ADMIN_HANDBUCH.md) — operator handbook.
- Customer dashboard UI text (German is the primary product language).

User-facing UI strings are German first; English follows once an i18n layer is in place.

---

## 7. Conventions

The non-negotiables live in `CLAUDE.md` files at every level. Read these before editing in a domain:

- **Repo-wide rules:** [`CLAUDE.md`](CLAUDE.md)
- **Backend rules:** [`apps/dashboard-backend/CLAUDE.md`](apps/dashboard-backend/CLAUDE.md) — `asyncHandler`, custom errors, services pattern, no inline DB queries
- **Frontend rules:** [`apps/dashboard-frontend/CLAUDE.md`](apps/dashboard-frontend/CLAUDE.md) — `useApi()` hook, TypeScript only, CSS variables (no hex)
- **Database rules:** [`services/postgres/CLAUDE.md`](services/postgres/CLAUDE.md) — append-only migrations, idempotent SQL, `IF NOT EXISTS`, no `DROP` without an explicit fallback
- **Service rules:** [`services/CLAUDE.md`](services/CLAUDE.md) — every service has a `Dockerfile`, `README.md`, entry point, tests

> Stages 4–5 of the [DX overhaul](docs/plans/active/DX_OVERHAUL.md) introduce these subfolder `CLAUDE.md` files. On branches where they're missing, the root `CLAUDE.md` is authoritative.

### Documentation must follow code

| When you change…          | Update                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| API route                 | [`docs/api/API_REFERENCE.md`](docs/api/API_REFERENCE.md) — also use `/update-api-docs`        |
| Database schema           | [`docs/api/DATABASE_SCHEMA.md`](docs/api/DATABASE_SCHEMA.md) — also use `/update-schema-docs` |
| Environment variable      | [`docs/ENVIRONMENT_VARIABLES.md`](docs/ENVIRONMENT_VARIABLES.md)                              |
| Architecture / topology   | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`ARCHITECTURE.md`](ARCHITECTURE.md)          |
| Operator-visible behavior | [`docs/ops/ADMIN_HANDBUCH.md`](docs/ops/ADMIN_HANDBUCH.md) (German)                           |

---

## 8. Slash command catalog

Slash commands live in [`.claude/commands/`](.claude/commands/) and are how repeating workflows get encoded. They are verb-first, hyphenated, lowercase. Type `/` in Claude Code to autocomplete; type `/help` for the live list.

> The full catalog below ships with [Stage 6 of the DX overhaul](docs/plans/active/DX_OVERHAUL.md). Until then, only `/test`, `/implement`, `/review` exist on `main`.

### Plan / design

| Command          | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `/plan-feature`  | Interview-driven feature plan written to `docs/plans/active/` |
| `/plan-bugfix`   | Reproduce → root-cause → fix options → regression test        |
| `/plan-refactor` | Call-site sweep + breaking-change list + migration strategy   |

### Backend

| Command           | Purpose                                                             |
| ----------------- | ------------------------------------------------------------------- |
| `/add-route`      | New Express route with `asyncHandler` + Zod schema + Jest stub      |
| `/add-service`    | New service-layer file under `apps/dashboard-backend/src/services/` |
| `/add-middleware` | New Express middleware following project pattern                    |

### Frontend

| Command          | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `/add-component` | New React component, TypeScript, CSS vars, Vitest stub |
| `/add-page`      | New route + page, registers in App.tsx                 |
| `/add-hook`      | New `use*` hook with `renderHook` test                 |

### Database

| Command             | Purpose                                                         |
| ------------------- | --------------------------------------------------------------- |
| `/create-migration` | Auto-numbered `NNN_<desc>.sql` with `IF NOT EXISTS` boilerplate |
| `/query-db`         | Read-only psql (`SELECT`/`EXPLAIN` only); 100-row cap           |
| `/open-psql`        | Print copy-paste interactive psql command + `\d` cheatsheet     |

### Infra / Docker

| Command            | Purpose                                                |
| ------------------ | ------------------------------------------------------ |
| `/rebuild-service` | `docker compose up -d --build <svc>` + tail logs       |
| `/show-logs`       | `docker compose logs --tail=200 -f <svc>` (background) |
| `/check-health`    | `docker compose ps` + `/health` ping + GPU + disk      |
| `/restart-service` | `docker compose restart <svc>` + healthcheck wait      |

### Tests / quality

| Command               | Purpose                                             |
| --------------------- | --------------------------------------------------- |
| `/run-tests-all`      | Full suite (`./scripts/test/run-tests.sh --all`)    |
| `/run-tests-backend`  | Jest with optional path filter                      |
| `/run-tests-frontend` | Vitest                                              |
| `/lint`               | ESLint + Prettier on backend + frontend in parallel |
| `/typecheck`          | `tsc --noEmit` on TS code                           |
| `/audit-deps`         | `npm audit` + `npm outdated`, flag Critical/High    |

### Git / docs

| Command               | Purpose                                                      |
| --------------------- | ------------------------------------------------------------ |
| `/commit`             | Smart commit from staged diff, Conventional Commits          |
| `/draft-pr`           | Generate PR title + body + test plan, `gh pr create --draft` |
| `/update-api-docs`    | Patch `docs/api/API_REFERENCE.md` from new routes (git diff) |
| `/update-schema-docs` | Patch `docs/api/DATABASE_SCHEMA.md` from new migrations      |

### Onboard / debug

| Command          | Purpose                                                |
| ---------------- | ------------------------------------------------------ |
| `/explain`       | Architecture sketch + dependencies of a file or module |
| `/debug-service` | Logs + healthcheck + restart-count + 3 hypotheses      |
| `/onboard`       | Setup checklist for a new dev environment              |

---

## 9. Code review

Use the [`code-reviewer`](.claude/agents/code-reviewer.md) subagent for a first pass before requesting human review:

> Use the code-reviewer to review the last commit on this branch.

It is read-only, returns Critical / Warnings / Suggestions, and cites file:line for each finding.

Human reviewers focus on:

- Architectural fit (does it belong where it lives?).
- Test coverage of the change's behavior (not just lines).
- Doc updates that follow code (see §7).
- Clarity for the next reader (naming, comments where the _why_ is non-obvious).

---

## 10. Reporting bugs and proposing features

- **Bug reports** — open a GitHub issue. Include:
  - Reproduction steps (smallest case).
  - `docker compose ps` and the failing `docker compose logs <service>`.
  - Expected vs. actual behavior.
  - Branch, commit hash, hardware (Jetson Orin / Thor / x86).
- **Feature proposals** — for anything non-trivial, draft a one-page plan in `docs/plans/active/<NAME>_PLAN.md` (see [`docs/plans/README.md`](docs/plans/README.md)) and open the PR for the plan first. Discuss before building.
- **Security issues** — do **not** open a public issue. Email the team directly.

---

## Quick links

- [`README.md`](README.md) — repo overview.
- [`docs/development/ONBOARDING.md`](docs/development/ONBOARDING.md) — 30-min cold-start.
- [`docs/INDEX.md`](docs/INDEX.md) — full doc map.
- [`CLAUDE.md`](CLAUDE.md) — non-negotiables for AI assistants.
- [`docs/plans/active/`](docs/plans/active/) — what's in flight.
