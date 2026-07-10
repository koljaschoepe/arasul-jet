# Plans

This folder is the single source of truth for roadmaps, phase plans, and historical audits. Nothing plan-shaped should live elsewhere (not in `.claude/`, not in `docs/` root).

## Folder layout

| Folder / file  | Contents                                                                                                                                                            | When to read it                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `ROADMAP.html` | The theme store: vision, the 7 DoD gates to Feld-1.0.0, open theme cards, done-history. Maintained by `/plan`, `/work`, `/audit`; machine state in `#roadmap-meta`. | When deciding what to plan next (`/plan` without args reads it).      |
| `active/`      | Plan pages currently in flight (`NNN-<slug>.html`, status in `#plan-meta`: in-review → approved → in-progress). Legacy `.md` plans remain until migrated.           | When you start a session and want to know what's in flight.           |
| `done/`        | Executed plans — each page carries its §9 execution report (PR, deploy, live-verify evidence). `/work` moves pages here.                                            | Historical context only — never act on the contents.                  |
| `archive/`     | Plans manually superseded or abandoned. Each file has an `> **Archived YYYY-MM-DD**` header at the top explaining its status.                                       | Historical context only — never act on the contents.                  |
| `audits/`      | Findings pages from `/audit` runs (`audit-YYYY-MM-DD-<scope>.html`) plus older multi-agent audit folders (read-only history).                                       | When you want to know what the codebase looked like at a given point. |

## Naming conventions

- **`active/`** — `NNN-<slug>.html` (the `/plan` skill produces these; NNN = highest number across `active/` + `done/`, both `.md` and `.html`, + 1). Legacy: lowercase-hyphenated `.md` slugs and all-caps `<TOPIC>_PLAN.md` master plans remain valid until migrated.
- **`done/`** — keeps the name it had in `active/` (`/work` moves the page verbatim, report included).
- **`archive/`** — `YYYY-MM-DD_<slug>.md`, lowercase-hyphenated slug, date is the original creation date (not archive date). Examples: `2026-04-15_production-hardening-plan.md`.
- **`audits/`** — `audit-YYYY-MM-DD-<scope>.html` from `/audit`; older multi-agent audits live in `<topic>-YYYY-MM-DD/` folders.

## Workflow

**The canonical flow is `/plan` → `/work`** (see `.claude/skills/`):

1. `/plan [topic]` — deep interview → research → a designed HTML plan page in
   `active/` → you comment (page comment mode or chat) → revision → your
   approval. The approved page + `ROADMAP.html` update land on `main` as a
   `docs(plans):` bookkeeping commit.
2. `/work` — executes the top approved plan autonomously: branch → build →
   tests → `code-reviewer` → PR → auto-merge → Jetson deploy → live verify →
   the plan page becomes its own execution report (§9) and moves to `done/`.
   The nightly run (`scripts/util/nightly-run.sh`) does the same unattended.

Plan pages are self-contained HTML (template: `.claude/templates/plan-page.html`);
their machine state lives in the embedded `#plan-meta` JSON. Don't create
plan-shaped Markdown files anymore — if you must sketch something by hand, run
it through `/plan` to make it executable.

**Closing a plan:**

- **Shipped via `/work`** → the pipeline moves it to `done/` automatically with the report filled in. Nothing to do by hand.
- **Superseded / abandoned (manual)** → move to `archive/YYYY-MM-DD_<slug>.md` (date = original creation, not today) and inject this header at the top:

  ```markdown
  > **Archived YYYY-MM-DD** — completed/superseded. <one-line reason>.
  > Kept for historical reference; do not act on its contents.

  ---
  ```

- Update `MEMORY.md` if it referenced the plan.

**Adding an audit:**

1. Run the audit (typically a multi-agent codebase analysis).
2. Save findings to `audits/<topic>-YYYY-MM-DD/`.
3. The audit folder is read-only; new audits get a new dated folder.

## What's NOT a plan

These belong elsewhere, not here:

| It's about…                    | Put it in…                                                       |
| ------------------------------ | ---------------------------------------------------------------- |
| A bug fix you're about to ship | A commit message + GitHub issue                                  |
| A one-off task today           | `TaskCreate` (in-session)                                        |
| A feature spec / PRD           | `active/<FEATURE>_PRD.md` if substantial; otherwise GitHub issue |
| Architecture documentation     | `docs/ARCHITECTURE.md` or `docs/development/`                    |
| API reference                  | `docs/api/`                                                      |
| Operational runbooks           | `docs/ops/`                                                      |

## Currently active plans

A hand-maintained list here was a recurring source of drift. The authoritative,
always-current list is the [`active/`](active/) directory itself — look there.
The primary plan is `FIELD_1.0.0_MASTER_PLAN.md`, which supersedes the earlier
active plans.
