---
name: audit
description: Multi-agent scan of the platform (security / reliability / perf / frontend / full or a free-text focus) → verified findings page in docs/plans/audits/ → new theme cards on the roadmap. Read-only — fixes happen via /plan → /work.
argument-hint: '[security|reliability|perf|frontend|full|<freitext focus>] — default: full'
disable-model-invocation: true
---

# /audit — Multi-agent scan → findings page → roadmap themes

Read-only reconnaissance: find and **verify** problems, present them on a
findings page, and feed the roadmap. Never change code here — significant
findings become themes, themes become plans (`/plan`), plans get executed
(`/work`). User-facing content is German.

## Phase 1 — Scope

`$ARGUMENTS` picks the scope; default `full`. Map to finder dimensions:

- `security` — authz/authn, injection, secrets handling, network exposure,
  DSGVO/§203 data paths.
- `reliability` — error handling, OOM/leak patterns, self-healing, backups,
  unattended-operation risks (the 5-year promise).
- `perf` — hot paths, Jetson GPU/memory pressure, N+1s, unbounded buffers.
- `frontend` — broken flows, console errors, useApi/TS violations, UX dead ends.
- `full` — all four, fewer finders each.
- Free text → derive 3–5 sensible dimensions yourself.

## Phase 2 — Fan-out scan (Workflow tool)

Use the `Workflow` tool (this skill is your explicit opt-in) with the
find → adversarially-verify shape:

- One finder agent per dimension (read-only; they inspect code on disk and may
  check the live device via SSH/HTTP where relevant). Each returns structured
  findings: title, severity (kritisch/hoch/mittel/niedrig), file:line evidence,
  failure scenario.
- **Verify before reporting** (standing lesson: past bug lists went stale —
  P6-13/15/17 were already fixed on main). Each finding gets an independent
  verify agent prompted to _refute_ it against current `main`; only
  CONFIRMED findings survive. Drop duplicates across dimensions.
- Keep the main context lean: only the structured results come back.

For a quick, single-dimension audit a plain parallel `Agent` fan-out (3–4
Explore agents + verify pass) is acceptable; `full` always uses Workflow.

## Phase 3 — Findings page

Write `docs/plans/audits/audit-YYYY-MM-DD-<scope>.html` — same design language
as `.claude/templates/plan-page.html` (copy its token set: colors, type,
chips; no comment-mode JS needed). Structure:

- Header: scope, date, how many finders/verifiers ran, what was dropped as
  unverified (no silent truncation).
- Findings grouped by severity, each: title, plain-German explanation,
  evidence (`file:line`, log excerpt), suggested direction, effort guess.
- A closing block „Empfohlene nächste Pläne“ — the 1–3 clusters worth a /plan.

## Phase 4 — Feed the roadmap & deliver

1. Add a theme card + `#roadmap-meta` entry in `docs/plans/ROADMAP.html` for
   each finding cluster that warrants real work (source: `audit YYYY-MM-DD`,
   priority from severity). Don't add noise — small one-liners can be listed
   in the findings page only.
2. Commit findings page + roadmap directly on `main`
   (`docs(plans): audit <scope> YYYY-MM-DD` — bookkeeping exception, docs-only;
   push rejected → micro-PR fallback).
3. `SendUserFile` the findings page (`display: "render"`) + ≤6-line German
   summary, ending with the recommended next `/plan` call.

## Failure modes (don't)

- Reporting an unverified finding as fact, or trusting old plan bug-lists.
- Editing product code, opening fix-PRs, or "quickly fixing" a finding.
- Dumping raw agent output on the page — findings are curated and deduped.
- Forgetting the roadmap update (the audit's value is the follow-up work).
