# `.claude/` — Claude Code workspace

Configuration, slash commands, agents, hooks, skills, and topic-context for
the Arasul Platform. AI agents working in this repo read from here.

## Layout

```
.claude/
├── README.md                    (this file)
├── settings.json                Team-shared: permissions + base hooks (committed).
├── settings.local.example.json  Template for personal overrides (committed).
├── settings.local.json          Personal overrides (gitignored).
├── skills/                      The four slash commands: plan/, work/, audit/, status/.
├── agents/                      Sub-agent definitions (research-agent, code-reviewer).
├── hooks/                       Auto-fired scripts (PreToolUse / PostToolUse / Stop / ...).
├── templates/                   plan-page.html — the shared plan/report page template.
└── context/                     Topic packs the model loads on demand.
```

The whole development loop runs on **four commands** (see `CONTRIBUTING.md` §8):
`/plan` (interview → HTML plan page → approval) → `/work` (autonomous
execution to a live-verified deploy) · `/audit` (multi-agent scan → findings
page → roadmap themes) · `/status` (terminal situation report). The theme
store is `docs/plans/ROADMAP.html`; the nightly run is
`scripts/util/nightly-run.sh`.

## When to add what

| Need                                                       | Put it in                                   |
| ---------------------------------------------------------- | ------------------------------------------- |
| A workflow a human triggers with `/<name>`                 | `skills/<name>/SKILL.md`                    |
| A focused task that should run with its own context window | `agents/`                                   |
| A side-effect that must fire automatically on a tool call  | `hooks/`                                    |
| A topic dossier the model should read on demand            | `context/`                                  |
| A platform-wide rule, contract, or "always do this"        | the closest `CLAUDE.md` (root or subfolder) |

Decision tree, terse:

- _Triggers automatically on a file event?_ → **hook** (settings.json wires it up).
- _User types `/foo`?_ → **skill** — but keep the surface at the four core
  commands; extend one of them before inventing a fifth.
- _Long-running, isolated, returns a single answer?_ → **agent**.
- _Domain knowledge for routine work?_ → **context** or a subfolder `CLAUDE.md`.

## Naming convention

- `skills/`: **one folder per command, hyphen-lowercase, English** —
  `skills/<name>/SKILL.md` with frontmatter (`name`, `description`,
  `disable-model-invocation: true` for user-triggered commands).
- `agents/`: **role-noun, hyphen-lowercase** — `code-reviewer.md`,
  `bug-reproducer.md`.
- `hooks/`: **what-it-does** — `block-destructive.sh`, `format-on-save.sh`.
- `context/`: **topic noun** — `rag.md`, `llm-queue.md`, `commercial.md`.

## Subfolder CLAUDE.md hierarchy

The platform has layered AI contracts. Read the closest to where you're
working — the root catches anything not folder-specific:

- `/CLAUDE.md` — platform-wide rules, task router.
- `apps/dashboard-backend/CLAUDE.md` — Express API conventions.
- `apps/dashboard-frontend/CLAUDE.md` — React SPA conventions.
- `services/CLAUDE.md` — long-running service standard.
- `services/postgres/CLAUDE.md` — migration contract.

This `.claude/` workspace contains the **deeper-dive** material:
context packs for one-off topics (RAG, LLM queue, observability, etc.),
plus the slash-commands and agents that automate routine work.

## Settings

- `settings.json` is **committed**. Edit it when you want every contributor
  to share a permission, hook, or model default. The single base hook here
  is `hooks/block-destructive.sh` (blocks `rm -rf /`, `git push --force` to
  main/master, `dd`, `mkfs.*`, etc. — see the script for the full list).
- `settings.local.example.json` is a **committed template**. Copy it to
  `settings.local.json` on a fresh clone and customize.
- `settings.local.json` is **gitignored**. Edit it for your personal hooks
  (e.g. a Telegram-notify on Stop, an auto-restart on file save) or a
  permission you only want locally.
- Claude Code merges them at load time; local takes precedence.

First-time setup on a new machine:

```bash
cp .claude/settings.local.example.json .claude/settings.local.json
# then edit to enable/disable the example hooks
```

## House rules for editing this folder

- Don't introduce a context pack that duplicates a subfolder `CLAUDE.md` —
  promote shared rules upward, keep context packs as topic-specific.
- Keep `context/*.md` ≤ 5 KB each — they're loaded on demand, not lazily.
- Don't reference a stale "next migration is NNN" anywhere — read it from
  `services/postgres/init/` at runtime instead.
- New slash command? Add a one-line entry to `CONTRIBUTING.md`.
