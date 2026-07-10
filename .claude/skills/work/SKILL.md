---
name: work
description: Execute the next approved plan page fully autonomously — branch → build → tests → review → PR → auto-merge → Jetson deploy → live verify → turn the plan page into an execution report. `--nightly` runs unattended (no questions, Telegram report, plus repo chores).
argument-hint: '[NNN | slug | --nightly] — empty picks the top approved plan'
disable-model-invocation: true
---

# /work — Execute an approved plan to production

Input is an **approved plan page** produced by `/plan`
(`docs/plans/active/NNN-<slug>.html`, `#plan-meta` JSON `status: "approved"`).
There are **no human gates** in this command: once started, it runs to a
deployed, live-verified result on the Jetson — or to an honestly reported
blocked state. All user-facing output (report, PR body, Telegram) is German.

**Nightly mode** (`--nightly` in `$ARGUMENTS`): identical pipeline, plus the
rules in the last section — never ask, hold what you can't verify, process up
to 3 plans then chores, Telegram summary at the end.

## Blocker protocol

Free-text half-stops are forbidden. Resolve autonomously with the safe,
in-plan-intent default first. If that fails: interactive mode →
`AskUserQuestion` with concrete options (retry-alternative / descope / let CI
arbitrate / hand back branch). Nightly mode → never ask: mark the plan
`blocked` with a §9 note explaining exactly what is needed, continue with the
next item, include it in the Telegram report.

## Phase 1 — Select the plan

- `$ARGUMENTS` names a plan (NNN or slug) → use it (must be `approved`).
- Otherwise: parse `#plan-meta` of every `docs/plans/active/*.html`; pick the
  `approved` plan with the highest priority (P0 > P1 > P2), ties → lowest NNN.
- No approved plan → say so (or Telegram in nightly) and stop. Never execute a
  `draft`/`in-review` plan.

Read the whole plan page once. §4 steps, §5 criteria, §6 verification and §8
decisions are your contract — do not re-litigate decided questions.

**User notes are binding.** If the conversation contains a pasted „Notizen zu
Plan …“ block (from the page's "Alle kopieren"), or answers to the plan's
"Offene Fragen", fold them into the contract before starting and record them
in §8. Notes that arrive mid-run are folded in the same way. If an open
question is still unanswered and materially affects execution: interactive →
`AskUserQuestion`; nightly → skip this plan (report why), never guess.

## Phase 2 — Branch

```bash
git fetch origin main
git checkout -b "NNN-<slug>" origin/main   # same NNN/slug as the plan file
```

Never execute on `main`. If a matching feature branch already exists for this
plan, continue on it. Set `#plan-meta` `status: "in-progress"` and `branch`.

## Phase 3 — Execute the steps

- Work through §4 in order. Each step leaves the system working.
- After each step: run only that step's scoped tests; flip the step's
  `data-status` to `done` and append a one-line
  `<div class="result"><strong>Ergebnis:</strong> …</div>`.
- Deviations from the plan are allowed when reality demands it — record each
  one in the step's result (`data-status="deviation"`, reason + what was done
  instead). Big architectural surprises → Blocker protocol.
- Do not commit during execution; Phase 5 owns commits.
- Standing rules apply (backend `asyncHandler`/custom errors, frontend
  `useApi`/TS/tokens, migrations idempotent + next NNN on disk, root-only
  lockfile).

## Phase 4 — Review gate (delegate to `code-reviewer`)

`git status --short && git diff --stat`, then spawn `code-reviewer`
(Agent tool). Auto-fix **Critical** findings only (smallest edit), re-review
once. Second pass still Critical → Blocker protocol (interactive: ask; nightly:
mark blocked, park the branch, move on). Warnings/Suggestions are never
auto-fixed — they go verbatim into the PR body.

## Phase 5 — Ship

1. Local pre-check (CI stays authoritative):
   `npm --prefix apps/dashboard-backend run lint` and
   `npm --prefix apps/dashboard-backend test`. Auto-fixable lint → `lint:fix`,
   re-run. Real failures inside your change → fix once, re-run; else Blocker
   protocol. "Cannot run locally" ≠ "failed" — note it and let CI decide.
2. Stage precisely — never `git add -A`. Stage the files from §4, the plan
   page itself, plus anything execution had to create (note it in the commit
   body). Hard-exclude: `.env*`, `**/secrets/**`, `*.pem`, `*.key`, `*.local.*`.
3. Conventional commit, German subject (`<type>(<scope>): <subject>`, ≤72
   chars, body = why + plan ref), HEREDOC, standard co-author trailer. Hooks
   fail → fix, new commit (never `--no-verify`, never amend a hooked commit).
4. Push; `gh pr create` (title = commit subject; body = §1 summary, §5
   criteria, review Warnings/Suggestions); then
   `gh pr merge --auto --squash --delete-branch` (if CI already finished:
   plain `gh pr merge --squash --delete-branch`).

## Phase 6 — Watch merge + deploy (do babysit — verify needs it)

1. `gh pr checks <nr> --watch` until green + merged. CI failure → fix on the
   branch (one focused attempt), push; still red → Blocker protocol.
2. Watch the `deploy` workflow run triggered by the merge on `main`
   (`gh run list --workflow=deploy.yml --limit 1` → `gh run watch <id>`).
   Docs-only diffs skip deploy — that counts as success.
3. Deploy failed → `deploy-local.sh` has auto-rolled back; the device is
   healthy on the previous state. Mark the plan `blocked`, write §9 with the
   failure evidence, report. Do not retry-deploy blindly.

## Phase 7 — Live verification on the Jetson (mandatory, never skip)

The plan's §6 defines what to verify; drive it for real:

- Reachability: device via Tailscale — `https://100.121.244.80/` (cert SAN
  matches the IP; MagicDNS `arasul.tail746d9b.ts.net`; LAN IP may be dead).
  SSH: `ssh arasul@100.121.244.80`, repo at `/home/arasul/arasul/arasul-jet`.
- Health: `docker compose -p arasul-platform ps` — all affected services
  healthy; scan the service logs for new errors.
- Frontend/API flows: drive the affected flows in a real browser via the
  Playwright MCP tools against `https://100.121.244.80/` — actually submit
  actions, expect zero new console errors. API-only changes → exercise the
  endpoints (auth included) and assert responses.
- Verification failed → treat as deploy failure semantics: if the regression
  is real, revert via a follow-up PR (`git revert` of the squash commit, same
  auto-merge path), then report `blocked` with evidence. The device always
  ends healthy.

## Phase 8 — Report & archive

1. Fill §9 of the plan page (remove `is-hidden`): 3–5 line German summary,
   per-step outcomes incl. deviations, PR link + merge SHA, test/CI results,
   deploy result, the live-verify evidence (what was driven, what was seen),
   timestamps. Flip §5 criteria to `data-done="true"` only where truly proven.
2. `#plan-meta`: `status: "done"`, `pr`, `verified_on_device: true`.
3. `git mv docs/plans/active/NNN-<slug>.html docs/plans/done/`.
4. Update `docs/plans/ROADMAP.html`: theme card → `done` (+ PR), append a line
   to the „Erledigt“ history (date, plan, PR), sync `#roadmap-meta`, and set
   gate states only when §5/§6 genuinely prove a gate.
5. Commit these bookkeeping changes directly on `main`
   (`docs(plans): report NNN-<slug>`) — deploy-skipped, sanctioned exception;
   push rejected → micro-PR fallback with auto-merge.
6. Interactive: send the finished report page (`SendUserFile`,
   `display: "render"`) + ≤6-line German summary. Nightly: it goes into the
   Telegram summary instead.

## Nightly mode specifics (`--nightly`)

- **Never `AskUserQuestion`.** Park-and-report instead.
- Process up to **3** approved plans, strictly serial (one device, one deploy
  at a time; deploy concurrency group already enforces this).
- **Hold what you can't verify at night**: major runtime bumps
  (transformers / sentence-transformers / protobuf / qdrant — RAG regressions
  are invisible to smoke tests), API-contract changes whose UX can't be driven,
  legal/policy content (§203, DSGVO), and anything flipping CI from advisory to
  blocking (breaks auto-merge — standing constraint). Leave the PR open with a
  German comment instead of merging.
- **Chores after the plans** (also when zero plans are approved):
  - Dependabot triage in buckets: consolidate safe patch/minor bumps into one
    branch off the root lockfile (`npm ci` from root), test, one PR,
    auto-merge; comment-and-hold majors/runtime-risky per the hold list.
  - PR sweep per CONTRIBUTING: close/resolve merged-but-open, superseded,
    stale PRs — always `--delete-branch`.
- Finish with one Telegram summary via `scripts/util/telegram-notify.sh
"<msg>" "Nightly"`: per plan „✅/⛔ NNN <titel> — PR #, verifiziert/blockiert
  weil …“, chores in one line, device end state. Keep it ≤10 lines.

## Failure modes (don't)

- Executing a non-approved plan, or re-asking questions §8 already decided.
- Committing during Phase 3; staging with `git add -A`; touching secrets.
- Skipping `code-reviewer`, auto-fixing Warnings, or >1 critical-fix retry.
- Declaring success without the Phase 7 live verification on the device.
- Leaving the plan page untouched after execution (the report IS the deliverable).
- Nightly: asking questions, merging hold-list items, parallel deploys.
