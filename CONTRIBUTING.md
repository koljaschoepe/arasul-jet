# Contributing to Arasul

Welcome. This document is the contract for working on the Arasul codebase. Read it once before your first PR; refer back as needed.

For the cold-clone-to-first-PR walkthrough, read [`docs/development/ONBOARDING.md`](docs/development/ONBOARDING.md) first. This file documents the **rules**; ONBOARDING.md documents the **steps**.

---

## 1. Development setup

Arasul is a Jetson-native edge-AI appliance. All development happens **on a Jetson** — typically over SSH to a dev unit. There is no local-laptop dev server with mocks, because mocks of the GPU/CUDA stack would diverge from production behavior and create false confidence in tests.

```bash
git clone <repo-url> arasul-jet
cd arasul-jet
./arasul bootstrap        # full appliance bring-up: detects hardware, generates .env, pulls images, starts services
docker compose ps         # confirm all services are healthy
```

After editing `apps/dashboard-{backend,frontend}/src/` or any `services/<name>/`:

```bash
docker compose up -d --build dashboard-backend     # or dashboard-frontend, or any service name
docker compose logs -f dashboard-backend           # watch the rebuild + startup
```

Verify in the browser at `https://<jetson-host>/`. This rebuild loop is the canonical contributor workflow — see [`docs/development/ONBOARDING.md`](docs/development/ONBOARDING.md) for the full walkthrough including the daily-commands cheatsheet.

For operators deploying to a customer appliance, see [`docs/ops/DEPLOYMENT.md`](docs/ops/DEPLOYMENT.md).

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
docs(onboarding): document the SSH-to-Jetson dev workflow
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

### PR hygiene

Keep the open-PR queue small and truthful — a pile of stale/parallel PRs is how
work gets forgotten and how `main` breaks (see the 2026-05-05 lockfile incident).

- **One active PR per work-stream.** Finish (merge or close) what's open before
  starting the next related change. Don't accumulate parallel half-done PRs.
- **Always delete the branch when the PR closes** — `gh pr merge --delete-branch`
  or `gh pr close --delete-branch`. No branch outlives its PR; no orphan branches.
- **Sweep on sight.** Whenever you open the PR list, resolve anything
  merged-but-open, superseded, or gone stale (rebase & merge, or close with a
  one-line reason) right then — don't let the queue rot.
- **Dependabot:** triage in buckets, not one-by-one drive-bys. Close no-ops and
  breaking majors with a reason; batch-verify the safe ones on the device.

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

> Stages 4–5 of the [DX overhaul](docs/plans/archive/2026-05_dx-overhaul.md) introduce these subfolder `CLAUDE.md` files. On branches where they're missing, the root `CLAUDE.md` is authoritative.

### Documentation must follow code

| When you change…          | Update                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| API route                 | [`docs/api/API_REFERENCE.md`](docs/api/API_REFERENCE.md)                                                           |
| Database schema           | [`docs/api/DATABASE_SCHEMA.md`](docs/api/DATABASE_SCHEMA.md) — regenerate via `scripts/docs/generate-db-schema.sh` |
| Environment variable      | [`docs/ENVIRONMENT_VARIABLES.md`](docs/ENVIRONMENT_VARIABLES.md)                                                   |
| Architecture / topology   | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)                                                                     |
| Operator-visible behavior | [`docs/ops/ADMIN_HANDBUCH.md`](docs/ops/ADMIN_HANDBUCH.md) (German)                                                |

---

## 8. Slash command catalog

Slash commands live in [`.claude/skills/`](.claude/skills/). The project runs
on exactly **four** commands plus a nightly run — everything else is a
Bash/Makefile alias or a model-suggested skill, not a slash command.

| Command                  | Purpose                                                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/plan [freitext]`       | Deep interview → designed HTML plan page (`docs/plans/active/NNN-<slug>.html`) → comment/revision loop → approved. No execution. Empty args pull the top roadmap theme.                 |
| `/work [NNN\|--nightly]` | Executes the next approved plan fully autonomously: branch → build → tests → review → PR → auto-merge → Jetson deploy → live verify → plan page becomes the execution report (`done/`). |
| `/audit [scope]`         | Multi-agent scan (security/reliability/perf/frontend/full) → verified findings page in `docs/plans/audits/` → new theme cards on the roadmap. Read-only.                                |
| `/status`                | Compact terminal situation report: roadmap gates, plan queue, PR hygiene flags, CI/deploy state, live Jetson health, recommended next command. Read-only.                               |

The theme store feeding `/plan` is [`docs/plans/ROADMAP.html`](docs/plans/ROADMAP.html).
The **nightly run** (`scripts/util/nightly-run.sh` + launchd template
`scripts/util/com.arasul.nightly.plist`) executes `/work --nightly` on the Mac:
up to 3 approved plans, then Dependabot bucket-triage + PR sweep, Telegram
summary in the morning.

**Bookkeeping exception to the PR-only flow:** plan/roadmap/audit bookkeeping
commits (`docs(plans): …`, touching only `docs/plans/**`) go straight to
`main` — they are docs-only and deploy-skipped. Everything else ships via PR.

Rule of thumb: if you can do it with one Bash command, it doesn't need
a slash command — add it to the Makefile or `./arasul` instead.

---

## 9. Code review

The pipeline invokes two subagents automatically — they aren't user-typed:

| Agent            | When            | Purpose                                                                                               |
| ---------------- | --------------- | ----------------------------------------------------------------------------------------------------- |
| `research-agent` | `/plan` Phase 2 | Heavy code-reading on isolated context. Returns Files / Patterns / Risks summary for the plan page.   |
| `code-reviewer`  | `/work` Phase 4 | Reviews the diff before shipping. Returns Critical / Warnings / Suggestions with file:line citations. |

**Auto-fix policy:** `/work` automatically addresses `Critical` findings
(max 1 retry). `Warnings` and `Suggestions` are surfaced in the PR body
for the user to triage — never auto-applied.

Both agents are read-only (no Edit / Write). They complement, not replace,
human review. Humans focus on:

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
