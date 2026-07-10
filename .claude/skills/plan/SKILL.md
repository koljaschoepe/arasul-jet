---
name: plan
description: Deep interview → beautifully designed HTML plan page (docs/plans/active/) → comment/revision loop → approved. Execution happens later via /work. Without arguments, proposes the top open theme from the roadmap.
argument-hint: '<freitext topic> — or empty to pull the next roadmap theme'
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
- Output: `docs/plans/active/NNN-<slug>.html`.

All user-facing content (page text, summaries, questions) is **German**.

## Blocker protocol (applies everywhere)

A bare free-text "I stopped because X, what now?" is forbidden. Two legal moves:
(1) resolve autonomously with the safe/incremental default, or (2) call
`AskUserQuestion` with concrete, mutually exclusive options (recommended first,
`preview` where there is something concrete to compare).

## Phase 0 — Topic

- `$ARGUMENTS` given → that is the topic.
- Empty → parse `#roadmap-meta` in `docs/plans/ROADMAP.html`, pick the top
  `open` theme by priority (P0 > P1 > P2, then listed order) and confirm it via
  `AskUserQuestion` (option A: top theme (Recommended); B/C: the next two; D
  handled by the built-in "Other").

## Phase 1 — Interview (the heart of this command)

The user explicitly wants **thorough** interviews: every material decision must
be asked, so `/work` and the nightly run never have to guess. Hard rules:

- `AskUserQuestion` only — never free-text questions.
- **Minimum 8 questions across at least 3 rounds.** Continue with further
  rounds until no materially ambiguous decision remains. Err on the side of one
  round too many.
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

1. Number: `NNN` = highest 3-digit prefix across `docs/plans/active/` and
   `docs/plans/done/` (both `.md` and `.html`) + 1. Slug: lowercase-hyphenated
   German-free-of-filler. File: `docs/plans/active/NNN-<slug>.html`.
2. Copy the template and fill **every** `{{TOKEN}}` and section — no leftover
   placeholders. Read the template's header comment first (it is the structural
   contract). Specifics:
   - `#plan-meta` JSON: complete, `status: "in-review"`. Dashboard levels
     (`risk/effort/reversibility_level`, 1–3) must match the visible words.
   - The decision surface is mandatory: the "In 30 Sekunden" block (Was /
     Warum / größtes Risiko / "Du entscheidest"-bullets), a plain-German
     `Kurz:` one-liner in **every** section summary, and the "Offene Fragen"
     box — one `.oq-item` (unique `data-ref="Frage N"`) per question the
     interview deliberately left to the user; if none, say so explicitly.
   - Keep every `data-ref` unique (sections, steps, questions) — the page's
     note system keys on them.
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

1. Send the page: `SendUserFile` with `display: "render"`, plus a ≤6-line German
   chat summary (path, step count, headline risks) and one line reminding the
   user of both feedback channels: page notes (💬 an jeder Karte / Antwortfelder
   bei den offenen Fragen → „Alle kopieren“ → paste here) or plain chat/voice
   notes referencing § numbers.
2. On feedback (a pasted „Notizen zu Plan …“ block or chat): **every note is
   binding.** Revise the page in place; answered open questions move out of
   the Offene-Fragen box and into the §8 decision log; keep §8 updated with
   every changed decision. Re-send, ask nothing that was already decided.
   Repeat until approval.
3. **Approval gate** — the user must explicitly approve („freigegeben“, „go“,
   „approved“, „passt“). This is the only free-text gate. Do not start
   implementation — that is `/work`'s job. Do not treat silence as approval.

## Phase 5 — Persist the approved plan

Approved plans must be visible to the nightly run, so they live on `main`:

1. Set `#plan-meta` `status: "approved"` + `approved: "<date>"`.
2. Commit **only** the plan page + ROADMAP.html directly on `main`:
   `docs(plans): approve NNN-<slug>` (German body, standard co-author trailer,
   HEREDOC pattern). Push. This docs-only commit is deploy-skipped by
   `deploy-local.sh` and is the sanctioned bookkeeping exception to the
   PR-only rule (see CONTRIBUTING §8). If the push is rejected (protection),
   fall back to a micro-PR with `gh pr merge --auto --squash --delete-branch`.
   Never commit unrelated working-tree changes.
3. Tell the user: plan NNN is approved and queued — `/work` (or tonight's
   nightly run) will execute it.

## Failure modes (don't)

- Fewer than 8 questions, fewer than 3 rounds, or free-text questions.
- Leftover `{{TOKEN}}` placeholders, or `#plan-meta` out of sync with the page.
- Doing the research yourself instead of `research-agent`.
- Starting implementation, cutting a branch, or touching code.
- Skipping the ROADMAP update, or approving without the user's explicit word.
- Writing the page in English (pages are for the user → German).
