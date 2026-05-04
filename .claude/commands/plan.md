---
description: Interview-driven feature/refactor/bugfix plan, then autonomous execution. Writes docs/plans/active/<slug>.md.
argument-hint: '<short freitext describing what you want to do>'
---

# /plan — Interview-driven plan + autonomous execution

You are about to plan and execute work for the Arasul Platform.
The user-supplied request is in `$ARGUMENTS`.

**Your contract has six phases. Run them in order. Do not skip phases.**

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

## Phase 2 — Research

Before writing the plan, **read the actual code**. Don't guess.

1. Identify the entry points the work touches. Read them.
2. Look at one or two **adjacent existing patterns** (e.g. if adding a
   route, read a similar existing route from the same domain).
3. Determine: Files Touched, Migrations Needed, Tests Required, Docs
   to Update.
4. List **one** existing convention you'll explicitly reuse (so the
   plan stays additive, not divergent).

If the research surfaces something that contradicts the interview
answers, **stop and ask** — don't paper over it in the plan.

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

- Within a phase, you can edit multiple files freely.
- After each phase, **run only the tests scoped to that phase**
  (the ones listed in the plan). Save full-suite for `/ship`.
- Update the plan file as you go: prefix each completed phase with
  `✅` so progress is visible.
- If you hit a wall (test that fails for a reason the plan didn't
  predict, an architectural surprise from the codebase): **stop**,
  document the surprise in the plan's Open Questions, and ask the user.
  Don't paper over it.

Do **not** commit during execution. `/ship` owns commits.

---

## Phase 6 — Diff review

When all phases are done:

1. Print `git status --short`.
2. Print a one-liner per file: `<path> (+<X>/-<Y>)`.
3. Tell the user which acceptance criteria are now met (cross-check
   against the plan).
4. Tell the user the next step is `/ship` (and that `/ship` will
   run the full test suite + commit + archive the plan).

Stop. Do not run `/ship` yourself.

---

## Failure modes (don't do these)

- Interview with fewer than 5 total questions, or all in one round.
- Interview without `AskUserQuestion` (free-text only).
- Skipping Phase 2 research because "the request seems clear".
- Phases that each break the build until the next phase fixes it.
- Committing inside Phase 5.
- Running `/ship` automatically without the user typing it.
- Ignoring memory-recorded user feedback about radical redesigns or
  preview-driven interviews.
