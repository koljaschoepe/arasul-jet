# `.claude/` — Claude Code workspace

Configuration, slash commands, agents, hooks, skills, and topic-context for
the Arasul Platform. AI agents working in this repo read from here.

## Layout

```
.claude/
├── README.md            (this file)
├── settings.json        Team-shared: permissions, base hooks, model defaults.
├── settings.local.json  Personal overrides (gitignored).
├── commands/            Slash-commands users invoke. Stage 6 populates this.
├── agents/              Sub-agent definitions (focused, isolated context).
├── hooks/               Auto-fired scripts (PreToolUse, PostToolUse, Stop, ...).
├── skills/              Reusable mini-workflows the model auto-suggests.
└── context/             Topic packs the model loads on demand.
```

## When to add what

| Need                                                       | Put it in                                   |
| ---------------------------------------------------------- | ------------------------------------------- |
| A workflow a human triggers with `/<name>`                 | `commands/`                                 |
| A focused task that should run with its own context window | `agents/`                                   |
| A side-effect that must fire automatically on a tool call  | `hooks/`                                    |
| A capability the model should auto-suggest by name         | `skills/`                                   |
| A topic dossier the model should read on demand            | `context/`                                  |
| A platform-wide rule, contract, or "always do this"        | the closest `CLAUDE.md` (root or subfolder) |

Decision tree, terse:

- _Triggers automatically on a file event?_ → **hook** (settings.json wires it up).
- _User types `/foo`?_ → **command**.
- _Long-running, isolated, returns a single answer?_ → **agent**.
- _Domain knowledge for routine work?_ → **context** or a subfolder `CLAUDE.md`.

## Naming convention

- `commands/` and `skills/`: **verb-first, hyphen-lowercase, English** —
  `add-route.md`, `create-migration.md`, `run-tests-backend.md`.
  No namespace colons, no `.cmd.md`-style suffixes.
- `agents/`: **role-noun, hyphen-lowercase** — `code-reviewer.md`,
  `bug-reproducer.md`.
- `hooks/`: **what-it-does** — `format-on-save.sh`, `notify-on-stop.sh`.
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
  to share a permission, hook, or model default.
- `settings.local.json` is **gitignored**. Edit it for your personal hooks
  (e.g. a Telegram-notify on Stop) or a permission you only want locally.
- Claude Code merges them at load time; local takes precedence.

## House rules for editing this folder

- Don't introduce a context pack that duplicates a subfolder `CLAUDE.md` —
  promote shared rules upward, keep context packs as topic-specific.
- Keep `context/*.md` ≤ 5 KB each — they're loaded on demand, not lazily.
- Don't reference a stale "next migration is NNN" anywhere — read it from
  `services/postgres/init/` at runtime instead.
- New slash command? Add a one-line entry to `CONTRIBUTING.md`.
