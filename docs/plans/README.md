# Plans

This folder is the single source of truth for roadmaps, phase plans, and historical audits. Nothing plan-shaped should live elsewhere (not in `.claude/`, not in `docs/` root).

## Folder layout

| Folder     | Contents                                                                                                                                                    | When to read it                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `active/`  | Plans currently being executed. At most ~5 files at a time.                                                                                                 | When you start a session and want to know what's in flight.           |
| `done/`    | Plans completed & shipped via the `/plan` pipeline. The pipeline auto-moves the plan here (`git mv active/ → done/`) on ship; the file keeps its slug name. | Historical context only — never act on the contents.                  |
| `archive/` | Plans manually superseded or abandoned (not shipped via `/plan`). Each file has an `> **Archived YYYY-MM-DD**` header at the top explaining its status.     | Historical context only — never act on the contents.                  |
| `audits/`  | Snapshots from past multi-agent codebase audits (read-only history).                                                                                        | When you want to know what the codebase looked like at a given point. |

## Naming conventions

- **`active/`** — lowercase-hyphenated slug (the default the `/plan` skill produces, e.g. `repo-consolidation-cleanup.md`). Load-bearing master roadmaps may use an all-caps `<TOPIC>_PLAN.md` name (e.g. `FIELD_1.0.0_MASTER_PLAN.md`). Both are accepted; the slug form is preferred for ordinary feature work.
- **`done/`** — keeps the slug it had in `active/` (the `/plan` pipeline moves it verbatim). Example: `add-document-export.md`.
- **`archive/`** — `YYYY-MM-DD_<slug>.md`, lowercase-hyphenated slug, date is the original creation date (not archive date). Examples: `2026-04-15_production-hardening-plan.md`.
- **`audits/`** — `<topic>-YYYY-MM-DD/` (folders, since audits often produce multiple files). Examples: `analysis-2026-04-21/`.

## Workflow

**The canonical feature flow is the `/plan` skill** (see `.claude/commands/plan.md`):
interview → research → write `active/<slug>.md` → approve → autonomous execution →
review → commit → PR → auto-merge → deploy. It writes the plan file here and, on
ship, moves it to `done/` for you. Use it for any non-trivial change so plans never
drift out of this folder.

**Starting a new plan manually** (only if not using `/plan`):

1. Create `active/<slug>.md` (lowercase-hyphenated).
2. Use the structure of an existing active plan (vision → acceptance criteria → stages → risk register).
3. Reference it from `MEMORY.md` or `CLAUDE.md` if it's a load-bearing roadmap.

**Closing a plan:**

- **Shipped via `/plan`** → the pipeline moves it to `done/<slug>.md` automatically. Nothing to do by hand.
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
