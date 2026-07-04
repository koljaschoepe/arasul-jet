# Plans

This folder is the single source of truth for roadmaps, phase plans, and historical audits. Nothing plan-shaped should live elsewhere (not in `.claude/`, not in `docs/` root).

## Folder layout

| Folder     | Contents                                                                                                                                  | When to read it                                                       |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `active/`  | Plans currently being executed. At most ~5 files at a time.                                                                               | When you start a session and want to know what's in flight.           |
| `archive/` | Plans that are completed, superseded, or abandoned. Each file has an `> **Archived YYYY-MM-DD**` header at the top explaining its status. | Historical context only — never act on the contents.                  |
| `audits/`  | Snapshots from past multi-agent codebase audits (read-only history).                                                                      | When you want to know what the codebase looked like at a given point. |

## Naming conventions

- **`active/`** — `<TOPIC>_PLAN.md` or `<TOPIC>_OVERHAUL.md`, all-caps with underscores. Examples: `COMMERCIAL_LAUNCH_MASTER_PLAN.md`, `DX_OVERHAUL.md`.
- **`archive/`** — `YYYY-MM-DD_<slug>.md`, lowercase-hyphenated slug, date is the original creation date (not archive date). Examples: `2026-04-15_production-hardening-plan.md`.
- **`audits/`** — `<topic>-YYYY-MM-DD/` (folders, since audits often produce multiple files). Examples: `analysis-2026-04-21/`.

## Workflow

**Starting a new plan:**

1. Create `active/<TOPIC>_PLAN.md`.
2. Use the structure of an existing active plan (vision → acceptance criteria → stages → risk register).
3. Reference it from `MEMORY.md` or `CLAUDE.md` if it's a load-bearing roadmap.

**Closing a plan:**

1. Verify all acceptance criteria are met.
2. Move to `archive/YYYY-MM-DD_<slug>.md` (date = original creation, not today).
3. Inject this header at the top:

   ```markdown
   > **Archived YYYY-MM-DD** — completed/superseded. <one-line reason>.
   > Kept for historical reference; do not act on its contents.

   ---
   ```

4. Update `MEMORY.md` if it referenced the plan.

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
