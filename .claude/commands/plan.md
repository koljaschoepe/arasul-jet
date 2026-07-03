---
description: Interview-driven plan, then fully autonomous execution → commit → PR → auto-merge → deploy on the Jetson. The only manual gate is approving the plan.
argument-hint: '<short freitext describing what you want to do>'
---

# /plan — Interview-driven plan + autonomous execution

You are about to plan and execute work for the Arasul Platform.
The user-supplied request is in `$ARGUMENTS`.

**Your contract has eight phases. Run them in order. Do not skip phases.**

Phase 4 (plan approval) is the **only** human gate. Once the user says "go",
everything runs to production automatically: execution → review → commit →
PR → auto-merge (on green CI) → deploy on the Jetson. The user does **not**
type `/ship` or anything else. See `docs/CICD.md` for the full pipeline.

---

## Phase 1 — Interview (mandatory)

This is the single most important phase. The user has chosen
_autonomous execution after the plan is approved_ — meaning **the plan
is the only contract** that protects against you going in the wrong
direction. A weak interview kills this command.

### Hard rules for the interview

- **Use the `AskUserQuestion` tool.** Not free-text questions.
  The user prefers structured choice with previews.
- **Minimum five questions, across at least two rounds.** Round 1 covers
  scope/goal/risk-tolerance; Round 2 covers technical choices that
  emerged from Round 1. If after Round 2 the answer space is still
  open, do a Round 3.
- **Use `preview` on options whenever there is something concrete to
  visually compare** — directory layouts, code shapes, config snippets,
  diagrams. The user explicitly asked for this. Use previews for at
  least half of your questions in Round 1.
- **Recommended option goes first** with `(Recommended)` in the label.
- **One option per question must be the "small/incremental" path** —
  user feedback memory: _no radical redesigns, only incremental
  improvements._

### Round 1 — always cover

1. **Goal & success** — what does "done" look like? What user-visible
   change ships?
2. **Scope boundary** — what is _out of scope_ for this work? Force a
   choice; don't accept "everything".
3. **Risk tolerance** — is this critical-path code (chat, RAG, auth)
   or peripheral? Affects how many tests vs. how much speed.

### Round 2 — emerge from Round 1

Examples (pick what's relevant):

- Backend approach (new route vs. extend existing? new service vs.
  inline in route?)
- Frontend approach (new feature folder vs. extend existing? new hook?)
- DB approach (new migration vs. JSON column? indexes from day one?)
- Branching (continue on current branch vs. cut a feature branch?)

### Round 3 (only if needed)

Open architectural splits that emerged late.

### Memory-aware constraints to bake into questions

Before phrasing options, check current memory for project-specific
constraints. The platform has these standing rules:

- Backend routes: `asyncHandler` + custom errors from `utils/errors.js`.
- Frontend: `useApi`, TypeScript, theme tokens (no hex literals).
- Migrations: idempotent, sequential, ≥ next free number on disk.
- No local dev server — Docker rebuild required after code changes.

Don't offer options that violate these. If the user pushes for one,
challenge it.

---

## Phase 2 — Research (delegate to `research-agent`)

Don't read files yourself in this phase. Use the `Agent` tool with
`subagent_type: "research-agent"` so the heavy file-reading happens
on an isolated context — your main context stays lean for execution.

Pass the agent:

- The user's freitext (`$ARGUMENTS`).
- The interview answers from Phase 1, summarised.
- A short note about what you already know is in scope.

The agent returns a structured report (Files Touched / Existing Patterns
to Reuse / Migrations / Tests Required / Docs to Update / Risks / One
Convention to Reuse). **Use that report verbatim as the basis for the
plan file.**

If the report contradicts an interview answer (e.g., user said "no
DB change" but research found one is required), **stop and ask** —
don't paper over it.

---

## Phase 3 — Plan file

Write `docs/plans/active/<slug>.md`.

**Slug derivation**: slugify `$ARGUMENTS` (lowercase, hyphenate, drop
filler words). Example: `"Add document export"` → `add-document-export`.
If the file already exists, ask the user via `AskUserQuestion`:
append, replace, or new-slug.

**Plan structure** (use these sections, in order):

```markdown
# <Title>

> One-line summary of what this work delivers.

## Goal & Success Criteria

What's done? What does the user see / can do that they couldn't before?

## Scope

**In scope:** ...
**Out of scope:** ...

## Acceptance Criteria

Concrete, testable bullets. "X works in browser", "tests pass",
"docs updated", etc.

## Phases

### P0 — <name>

**Files:** path/a, path/b
**Risk:** low | medium | high — why?
**Tests:** which existing tests must still pass; which new tests are added.

### P1 — <name>

...

(Phases must be incremental — each leaves the system in a working state.
No phase that "starts breaking things and fixes them in the next phase".)

## Rollback

How do we revert? Which migrations need a down-script? Which feature
flag, if any?

## Open Questions

If there are any. Ideally none after the interview.
```

After writing, give the user a 5-line summary of the plan file's path,
the phase count, and the headline of each phase.

---

## Phase 4 — Approval gate

If you are in plan mode, call `ExitPlanMode` with the plan summary.

Otherwise, output the summary and **wait for the user to say "go"**
(or equivalent — "los", "weiter", "approved"). Don't assume.

If the user pushes back, iterate the plan file in place. Do not start
execution until the user explicitly approves.

---

## Phase 5 — Autonomous execution

Once approved: execute all phases without per-phase gates. The
contract is "diff-review only at the end".

### Step 0 — cut the feature branch (always, first thing)

Before touching any file, cut a fresh branch off up-to-date `main`:

```bash
git fetch origin main
# Next number = highest NNN in docs/plans/done + docs/plans/active, + 1
NNN=$(printf '%03d' $(( $(ls docs/plans/done docs/plans/active 2>/dev/null \
  | grep -oE '^[0-9]{3}' | sort -n | tail -1 | sed 's/^0*//' ) + 1 )))
git checkout -b "${NNN}-<slug>" origin/main
```

Use the same `<slug>` as the plan file. Never execute on `main`.
If you are already on a non-main feature branch that clearly belongs to
this work, stay on it instead of cutting a new one.

### Execution

- Within a phase, you can edit multiple files freely.
- After each phase, **run only the tests scoped to that phase**
  (the ones listed in the plan). Save full-suite for Phase 7.
- Update the plan file as you go: prefix each completed phase with
  `✅` so progress is visible.
- If you hit a wall (test that fails for a reason the plan didn't
  predict, an architectural surprise from the codebase): **stop**,
  document the surprise in the plan's Open Questions, and ask the user.
  Don't paper over it.

Do **not** commit during execution. Phase 7 owns commits.

---

## Phase 6 — Diff review (delegate to `code-reviewer`)

When all phases are done:

1. Print `git status --short` and `git diff --stat`.
2. **Spawn `code-reviewer`** via the `Agent` tool with
   `subagent_type: "code-reviewer"`. Pass it: the user's freitext, the
   plan summary, and a note about which phases ran. The agent reads
   the diff itself.
3. Receive the structured report: `Critical / Warnings / Suggestions`.

### Critical-finding loop (auto-fix, max 1 retry)

- **If `Critical` is non-empty**: this is the _only_ category you
  auto-address. For each Critical entry:
  - Read the cited file at the cited line (`±10` lines around it).
  - Apply the smallest edit that resolves the finding.
  - Don't refactor; fix.
- After all Critical edits: re-spawn `code-reviewer` once. Pass the
  same context plus a note "second pass after critical fixes".
- If the second pass still has Critical findings: **stop**, list them
  for the user, exit. Don't loop further.

### Warnings + Suggestions

Print them to the user verbatim, grouped by category. Do **not**
auto-address them — they're judgement calls. They do **not** block the
pipeline; they are informational and travel into the PR body so the
user can decide later.

### Gate before shipping

- If the second `code-reviewer` pass **still** has Critical findings:
  **stop**, list them, and do **not** proceed to Phase 7. This is a
  hard automated gate — broken code must not reach `main`.
- Otherwise (no Critical, or all Critical addressed): **continue
  automatically to Phase 7.** Do not wait for the user.

---

## Phase 7 — Auto-ship (tests + commit + archive)

No user input. This is the old `/ship` logic, run automatically.

1. **Lint + fast tests (local pre-check).** The authoritative gate is
   CI, but catch the obvious breakage locally first:

   ```bash
   npm --prefix apps/dashboard-backend run lint
   npm --prefix apps/dashboard-backend test        # jest, no docker needed
   ```

   If lint has auto-fixable issues, run `lint:fix` and re-run. If tests
   fail for real: **stop**, print the failures, exit. Do not commit —
   the user fixes and re-runs `/plan` (or fixes on the branch).
   If the local test infra is unavailable on this machine (e.g. no deps
   installed), note it and rely on CI — do **not** treat "cannot run"
   as "failed".

2. **Stage precisely.** Never `git add -A`. Stage only the files listed
   in the plan's `**Files:**` sections plus the plan file. Never stage
   `.env`, `.env.*`, `**/secrets/**`, `**/*.pem`, `**/*.key`,
   `*.local.*`. If execution created files not in the plan, stage them
   too but mention it in the commit body (the plan was incomplete).

3. **Conventional commit** (`<type>(<scope>): <subject>`), imperative,
   ≤72 char subject, body explains _why_ + references the plan slug.
   Trailer:

   ```
   Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
   ```

   Use the HEREDOC pattern. Pre-commit hooks run — if they fail, fix and
   make a **new** commit (never `--no-verify`, never `--amend` a hooked
   commit).

4. **Archive the plan:** `git mv docs/plans/active/<slug>.md
   docs/plans/done/<slug>.md` and amend it into the just-created commit
   (acceptable: not pushed yet).

---

## Phase 8 — Auto-deliver (push + PR + auto-merge)

No user input. This closes the loop to production.

1. **Push the branch:**

   ```bash
   git push -u origin "$(git branch --show-current)"
   ```

2. **Open the PR** (title = the plan's headline as a conventional-commit
   subject; body = plan summary + acceptance criteria + the code-review
   Warnings/Suggestions verbatim):

   ```bash
   gh pr create --base main --head "$(git branch --show-current)" \
     --title "<type>(<scope>): <subject>" \
     --body-file <(printf '%s\n' "<summary>")
   ```

3. **Enable auto-merge (squash).** GitHub will merge the PR **the moment
   the required `CI Summary` check goes green** — no further action:

   ```bash
   gh pr merge --auto --squash --delete-branch
   ```

4. **Hand off and stop.** Tell the user, concisely:
   - the PR URL,
   - that CI is running and the PR auto-merges on green,
   - that the merge triggers the self-hosted deploy on the Jetson
     (build only changed services → healthcheck → auto-rollback on
     failure), visible in the repo's **Actions** tab.

   Do **not** poll CI or babysit the deploy. The user watches GitHub.
   If `gh pr merge --auto` errors because CI already finished, fall back
   to a plain `gh pr merge --squash --delete-branch`.

---

## Failure modes (don't do these)

- Interview with fewer than 5 total questions, or all in one round.
- Interview without `AskUserQuestion` (free-text only).
- Skipping Phase 2 (or doing the research yourself instead of via
  `research-agent`).
- Phases that each break the build until the next phase fixes it.
- Executing on `main` instead of cutting a feature branch (Phase 5, Step 0).
- Committing inside Phase 5 (Phase 7 owns commits).
- Skipping `code-reviewer` in Phase 6.
- Auto-fixing Warnings or Suggestions (only Critical is auto-fixed).
- Looping the critical-fix more than one retry.
- Proceeding to Phase 7 while Critical findings remain unresolved.
- Stopping after the commit and asking the user to ship/deploy —
  Phases 7 and 8 run automatically once the plan is approved and the
  review gate is clear.
- Babysitting CI or the deploy in Phase 8 (fire the auto-merge and stop).
- Ignoring memory-recorded user feedback about radical redesigns or
  preview-driven interviews.
