---
description: Tests + lint + format + conventional commit + archive plan. NO push, NO PR.
argument-hint: '(no arguments)'
disable-model-invocation: true
---

# /ship — Clean commit, manual push

You are about to ship the work that was just produced (typically by
`/plan`). The user explicitly chose **commit-only** — no automatic
push, no PR. They keep push hoheit.

**This command is `disable-model-invocation: true`** — it only runs
when the user explicitly types `/ship`. Don't suggest it; don't run
it autonomously.

---

## Pre-flight (always print)

```bash
git status --short
git diff --stat
```

If the working tree is clean → tell the user, exit.

If the user is on `main`/`master` → **stop** and ask for confirmation
via `AskUserQuestion`: continue, or cut a new branch first.

---

## Phase 1 — Tests

Run the full suite. Don't skip; the user picked autonomous execution
in `/plan`, this is the safety net.

```bash
./scripts/test/run-tests.sh --all
```

If anything fails: **stop**, print the failures, exit. Do not commit.
The user will fix and re-run `/ship`.

If `RATE_LIMIT_ENABLED` or other env-needed flags are set in test config,
trust the script's defaults.

---

## Phase 2 — Lint + format

```bash
# Backend
cd apps/dashboard-backend && npm run lint
# Frontend
cd apps/dashboard-frontend && npm run lint
```

If lint reports auto-fixable issues, run `npm run lint:fix` in the
relevant app and re-run lint. If non-auto-fixable issues remain,
**stop**, print them, exit.

Pre-commit hooks already run prettier on staged files; you don't need
to run prettier manually here.

---

## Phase 3 — Identify what to stage

**Never use `git add -A` or `git add .`.** The user has explicit rules
about this.

Strategy:

1. **If a plan file exists** at `docs/plans/active/<slug>.md`:
   - Parse the plan's "Phases" sections — each lists `**Files:** ...`.
   - Stage only those files plus the plan file itself.
   - If files were created during execution that aren't in the plan,
     the plan was incomplete — list them via `git status` and ask the
     user via `AskUserQuestion`: stage them too, or skip them.

2. **If no plan file exists** (manual `/ship` after manual edits):
   - Print `git status --short` with all untracked + modified files.
   - Use `AskUserQuestion` to confirm which files to stage. Default
     option: "all changed files except untracked".

3. **Always reject** staging anything matching: `.env`, `.env.*`,
   `**/secrets/**`, `**/*.pem`, `**/*.key`, `*.local.*`. These are
   already in `settings.json` deny-list, but double-check.

---

## Phase 4 — Conventional commit message

Format: `<type>(<scope>): <subject>`

Rules:

- **Type**: `feat | fix | docs | refactor | test | chore | ci | perf`.
  Pick from the diff: code in `src/` → feat/fix/refactor; only docs/
  → docs; only tests → test; only `.github/` or compose → ci/chore.
- **Scope** (optional): the area touched — `backend`, `frontend`,
  `db`, `claude` (for `.claude/`), `docs`, or a service name.
- **Subject**: imperative, lowercase, ≤ 72 chars, no trailing period.
- **Body** (when warranted): one paragraph explaining _why_, not
  _what_. Reference the plan slug if applicable
  (`See docs/plans/done/<slug>.md`).
- **Co-author trailer**:
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

Show the full message to the user via `AskUserQuestion` (option:
"commit as-is", "let me edit the subject", or "abort"). Use a preview
on the "commit as-is" option showing the full multi-line message.

---

## Phase 5 — Commit

Use the HEREDOC pattern to preserve formatting:

```bash
git commit -m "$(cat <<'EOF'
<type>(<scope>): <subject>

<optional body>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Pre-commit hooks (lint-staged + prettier + type-check) will run.
If they fail: **do not retry with `--no-verify`**. Read the failure,
fix it, restage, create a _new_ commit (not `--amend`).

---

## Phase 6 — Archive the plan

If the commit corresponds to a plan file at `docs/plans/active/<slug>.md`:

```bash
git mv docs/plans/active/<slug>.md docs/plans/done/<slug>.md
git commit --amend --no-edit
```

(The `--amend` here is acceptable because the prior commit was just
created in this same `/ship` run, and only adds the rename — it has
not been pushed and no one else has seen it.)

If multiple plans contributed to the work, archive all of them in
the same amend.

---

## Phase 7 — Summary, stop

Print:

```
Shipped: <commit-hash> <subject>
Branch: <branch-name>
Plan archived: docs/plans/done/<slug>.md (if applicable)

Push manually when ready:
  git push -u origin <branch-name>
```

**Stop here.** Do not push. Do not create a PR. The user pushes when
they're ready.

---

## Failure modes (don't do these)

- Pushing or creating a PR (the user explicitly forbids it from this command).
- Using `git add -A` / `git add .`.
- Bypassing pre-commit hooks via `--no-verify`.
- `--amend`-ing a commit that was already pushed.
- Committing when tests or lint failed.
- Skipping the plan-archive step when a plan file exists.
