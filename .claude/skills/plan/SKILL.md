---
name: plan
description: Collect impulses from the steering repo → deep interview → beautifully designed HTML plan page (docs/plans/active/) → comment/revision loop → approved. Execution happens later via /work. Without arguments, proposes the top open impulse.
argument-hint: '<freitext topic> — or empty to pull the next impulse from the steering repo'
disable-model-invocation: true
---

# /plan — Interview-driven plan page (no execution)

You produce an **approved plan page** — a self-contained HTML document the user
reads, comments on, and approves. You do **not** implement anything here;
`/work` executes approved plans. The plan page is the only contract that makes
autonomous execution safe, so the interview and the page quality are everything.

Key files:

- Template: `.claude/templates/plan-page.html` (read its header comment — it is
  the structural contract shared with `/work`).
- Roadmap / theme store: `docs/plans/ROADMAP.html` (machine state in
  `#roadmap-meta` JSON).
- Impulse sources in the steering repo (sibling folder, read-only from here):
  `../roadmap/arasul-jet.md`, `../plans/aktiv/`, `../plans/offen/`,
  `../company/follow-ups.md`, plus open GitHub issues carrying `@claude`.
- Output: `docs/plans/active/NNN-<slug>.html`.

All user-facing content (page text, summaries, questions) is **German**.

## Blocker protocol (applies everywhere)

A bare free-text "I stopped because X, what now?" is forbidden. Two legal moves:
(1) resolve autonomously with the safe/incremental default, or (2) call
`AskUserQuestion` with concrete, mutually exclusive options (recommended first,
`preview` where there is something concrete to compare).

## Phase 0 — Collect impulses, then fix the topic

**Where the work comes from.** Goals and impulses are decided in the steering
repo (`Arasul-GmbH/arasul-os`, the parent folder of this checkout); _how_ they
get built is decided here. That is rule 7 of the steering repo, and it has a
consequence for this command: **several impulses from up there may become ONE
plan down here.** The mapping is n:1, never 1:1 by reflex — two impulses that
touch the same service, the same gate or the same migration belong in one plan,
because they will be built, merged, deployed and verified together.

1. Read what exists, in this order, and skip silently what is not reachable
   (the folder is absent when this skill runs inside a GitHub Action):

   ```bash
   sed -n 1,200p ../roadmap/arasul-jet.md          # what this repo must do, by when
   ls ../plans/aktiv/ ../plans/offen/               # what is planned up there
   grep -n 'arasul-jet' ../company/follow-ups.md    # promises with a date
   gh issue list --search '@claude in:body' --state open --limit 20
   ```

   Also read the local theme store `#roadmap-meta` in `docs/plans/ROADMAP.html`
   and the seven sales gates on that page — every impulse needs a gate or
   milestone reference. **An impulse without one is an idea, not a task**; say
   so and leave it where it is.

2. `$ARGUMENTS` given → that is the topic. Still run step 1 and offer the
   impulses that belong with it, so they land in the same plan.

3. Empty → propose the grouping via `AskUserQuestion`: option A is the
   recommended bundle (which impulses become this one plan, and why they belong
   together), B/C the alternative cuts. Never pick the bundle silently — the cut
   decides what one deploy will contain.

4. Whatever the outcome, §8 of the page records **which impulses were folded in
   and which were deliberately left out**. Six weeks later nobody remembers
   whether an impulse was rejected or forgotten.

## Phase 1 — Interview (the heart of this command)

The user explicitly wants **thorough** interviews: every material decision must
be asked, so an autonomous `/work` run — which may last one to two days without
anyone watching — never has to guess. Hard rules:

- `AskUserQuestion` only — never free-text questions.
- **Minimum 8 questions across at least 3 rounds, no upper limit.** Standing
  instruction (24.08.2026): challenge until nothing material is ambiguous, even
  if that takes ten rounds. Contradict in the first sentence, and never rate
  anything without a number. A round too many costs minutes; a wrong assumption
  costs a two-day autonomous run.
- **The page never asks.** A question the user must answer belongs in
  `AskUserQuestion`, here in chat — never parked in the HTML, which the user
  cannot answer in (explicit instruction, 2026-07-17). If a question surfaces
  while writing or revising the page, run another interview round instead. The
  finished page states decisions; it does not ask for them.
- Use `preview` on options whenever something concrete can be compared
  (layouts, schemas, API shapes, UI mockups, config snippets) — at least half
  of round 1.
- Recommended option first, labeled `(Recommended)`. One option per question
  must be the small/incremental path (standing user preference: no radical
  redesigns).
- Cover, at minimum: goal & user-visible success ("Fertig heißt …"), hard scope
  boundary (force out-of-scope choices), risk tolerance (critical path: chat,
  RAG, auth?), architecture approach (backend/frontend/DB shape), UX decisions
  if any surface changes, data/migration strategy, verification expectations on
  the Jetson, rollout/rollback concerns.
- **Phase cut is an interview question, not a writing decision.** `/work` merges
  and deploys once per phase (see its merge-cadence rule), so the phases of §4
  are the deploy units. Ask how the work should be cut, and keep each phase
  small enough to verify in one go on the device.
- Bake in the platform's standing rules — never offer options that violate
  them: backend `asyncHandler` + custom errors; frontend `useApi` + TypeScript +
  theme tokens; migrations idempotent & sequential (next = highest NNN in
  `services/postgres/init/` + 1); no local dev server (Docker rebuild).

Every answer becomes a row in the plan page's §8 Entscheidungs-Log
(question → decision → consequence).

## Phase 2 — Research (delegate)

Spawn `research-agent` (Agent tool, `subagent_type: "research-agent"`) with the
topic, the interview summary, and known scope. Do not read implementation files
yourself — keep this context lean. Use its report (files touched, patterns to
reuse, migrations, tests, docs, risks) as the factual basis of the page.

If research contradicts an interview answer: trivial & clearly correct → adopt
and record the deviation in §8; otherwise `AskUserQuestion` (adopt & re-scope /
keep scope, different approach / re-plan).

## Phase 3 — Write the plan page

0. **`docs/plans/active/` holds exactly one plan** — `scripts/test/plan-faden.py`
   fails otherwise, and it runs in CI. If a plan is already there, it must first
   be moved: to `docs/plans/done/` if it is finished, or to
   `docs/plans/paused/` with a paragraph in that folder's `README.md` saying why
   it is paused and what is still open. Never leave two plans side by side; a
   folder with two plans in it does not say which one counts.
1. Number: `NNN` = highest 3-digit prefix across `docs/plans/active/`,
   `docs/plans/paused/` and `docs/plans/done/` (both `.md` and `.html`) + 1.
   Slug: lowercase-hyphenated German-free-of-filler.
   File: `docs/plans/active/NNN-<slug>.html`.
2. Copy the template and fill **every** `{{TOKEN}}` and section — no leftover
   placeholders. Read the template's header comment first (it is the structural
   contract). Specifics:
   - `#plan-meta` JSON: complete, `status: "in-review"`. Dashboard levels
     (`risk/effort/reversibility_level`, 1–3) must match the visible words.
   - The decision surface is mandatory: the "In 30 Sekunden" block (Was /
     Warum / größtes Risiko / "Du entscheidest"-bullets) and a plain-German
     `Kurz:` one-liner in **every** section summary.
   - There is **no open-questions box** — every question was settled in the
     interview (Phase 1). If you catch yourself wanting one, that is the signal
     to run another `AskUserQuestion` round, not to write it into the page.
   - Keep every `data-ref` unique (sections, steps) — the page's note system
     keys on them.
   - §1 plain-German why/goal ending with "Fertig heißt: …".
   - §3 is the section the user cares most about: 2–3 paragraphs of simply
     explained architecture ("was ändert sich am System und warum so") plus an
     **inline SVG diagram** (before/after where useful). Keep the SVG hand-sized
     and legible; use `var(--ink)`/`var(--accent)`/`var(--muted)` via
     `currentColor`/inline `style` referencing the CSS variables so it themes.
   - §4 steps: each leaves the system working; each lists files, risk, tests.
   - §5 acceptance criteria: concrete and testable, one `<li>` each.
   - §6 the mandatory Jetson live verification: which flows get driven in the
     real browser, which health checks, which logs.
   - §7 risks + rollback (migrations down-path, feature flags, deploy rollback).
   - §8 the full decision log from the interview.
   - §9 stays `is-hidden` with `{{REPORT}}` removed (empty body) — `/work` fills it.
3. Update `docs/plans/ROADMAP.html`: matching theme card → `data-status="planned"`,
   visible label „geplant (NNN)“, and the `#roadmap-meta` JSON (`status`,
   `plan`). If the topic is new, add a theme card + JSON entry first.

## Phase 4 — Deliver & revision loop

1. Open the page for the user: `open docs/plans/active/NNN-<slug>.html` (there is
   no `SendUserFile` tool in this harness — verified 2026-07-17). Add a ≤6-line
   German chat summary (path, step count, headline risks) and one line reminding
   the user of both feedback channels: page notes (💬 an jeder Karte →
   „Alle kopieren“ → paste here) or plain chat/voice notes referencing § numbers.
2. On feedback (a pasted „Notizen zu Plan …“ block or chat): **every note is
   binding.** Revise the page in place and keep §8 updated with every changed
   decision. If a note raises a new decision, ask it via `AskUserQuestion` —
   never answer it for the user and never park it in the page. Re-open, ask
   nothing that was already decided. Repeat until approval.
3. **Approval gate** — the user must explicitly approve („freigegeben“, „go“,
   „approved“, „passt“). This is the only free-text gate. Do not start
   implementation — that is `/work`'s job. Do not treat silence as approval.

## Phase 5 — Persist the approved plan

Approved plans must be visible to an autonomous run, so they live on `main`:

1. Set `#plan-meta` `status: "approved"` + `approved: "<date>"`.
2. Commit **only** the plan page + ROADMAP.html directly on `main`:
   `docs(plans): approve NNN-<slug>` (German body, standard co-author trailer,
   HEREDOC pattern). Push. This docs-only commit is deploy-skipped by
   `deploy-local.sh` and is the sanctioned bookkeeping exception to the
   PR-only rule (see CONTRIBUTING §8). If the push is rejected (protection),
   fall back to a micro-PR with `gh pr merge --auto --squash --delete-branch`.
   Never commit unrelated working-tree changes.
3. Tell the user: plan NNN is approved and queued, and name the command that
   starts it — `/work NNN` interactively, or
   `./scripts/util/autonom-run.sh` for a long unattended run
   (`ARASUL_LAUF_STUNDEN=30` for one that spans a day or more). **Nothing starts
   by itself**: this repo has no scheduled run, by decision of 24.08.2026.

## Failure modes (don't)

- Fewer than 8 questions, fewer than 3 rounds, or free-text questions.
- Turning every impulse from the steering repo into its own plan by reflex, or
  folding impulses in without recording the cut in §8.
- Writing a plan for an impulse with no gate or milestone reference.
- **Parking a question in the page instead of asking it.** The user cannot
  answer inside the HTML. An unanswered question means the interview is not
  finished — go back and ask.
- Leftover `{{TOKEN}}` placeholders, or `#plan-meta` out of sync with the page.
- Doing the research yourself instead of `research-agent`.
- Starting implementation, cutting a branch, or touching code.
- Skipping the ROADMAP update, or approving without the user's explicit word.
- Writing the page in English (pages are for the user → German).
