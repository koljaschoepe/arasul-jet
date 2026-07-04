# `scripts/` — Operational shell scripts

Long-running services live under `services/`. **Single-shot operational tooling** — backup, restore, validation, security hardening, doctor checks, deploy-image creation — lives here.

When in doubt: if a thing runs once and exits, it belongs here. If it runs continuously inside a container, it belongs in `services/`.

## Folder map

| Folder      | Purpose                                                                                                       | Examples                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `backup/`   | Backup + verification (postgres, MinIO, Qdrant). Pair with `services/backup-service/` for the scheduled side. | `backup.sh`, `restore.sh`, `verify-backup.sh`                                            |
| `deploy/`   | Build deployment / factory images, ship update bundles, verify a deployed appliance.                          | `create-deployment-image.sh`, `factory-install.sh`, `verify-deployment.sh`               |
| `docs/`     | Auto-generators for documentation kept in sync with the code.                                                 | `generate-db-schema.sh`                                                                  |
| `lib/`      | Shared bash helpers. Source these from other scripts; they aren't meant to be run directly.                   | `logging.sh`                                                                             |
| `recovery/` | Disaster-recovery wrappers. Higher-level than `backup/` — re-stages a full appliance from a backup bundle.    | `restore-from-backup.sh`                                                                 |
| `security/` | OS / SSH hardening, htpasswd, self-signed certs, vuln scans.                                                  | `harden-os.sh`, `harden-ssh.sh`, `security-scan.sh`, `setup-firewall.sh`                 |
| `setup/`    | First-boot setup helpers used by `./arasul bootstrap`.                                                        | `detect-jetson.sh`, `factory-reset.sh`, `setup-tailscale.sh`, `preconfigure.sh`          |
| `system/`   | Runtime system management — boot guards, watchdogs, ordered startup.                                          | `boot-guard.sh`, `deadman-switch.sh`, `docker-watchdog.sh`, `ordered-startup.sh`         |
| `test/`     | Test runners + smoke / DR / integration / load tests.                                                         | `run-tests.sh`, `smoke-test.sh`, `dr-drill.sh`, `integration-test.sh`                    |
| `util/`     | One-off utilities: notifications, OAuth tunnels, support-log export, MCP server bring-up.                     | `telegram-notify.sh`, `oauth-tunnel.sh`, `export-support-logs.sh`, `inject-context.sh`   |
| `validate/` | Pre-flight validators for config, dependencies, traefik, file permissions, hooks.                             | `validate-permissions.sh`, `validate-traefik.sh`, `verify-dev-env.sh`, `verify-hooks.sh` |

The single root-level script is `interactive_setup.sh` — invoked by `./arasul bootstrap` and by `scripts/deploy/factory-install.sh`. It owns the user-facing first-boot wizard.

## Naming convention

- **kebab-case**, lowercase, ending in `.sh`. Example: `verify-deployment.sh`.
- A small number of legacy snake_case files are still in flight; they're being migrated as part of the DX overhaul (see `docs/plans/archive/2026-05_dx-overhaul.md` Stage 9).
- Don't add a `.bash` extension — this codebase uses `.sh` even for `#!/bin/bash` scripts.
- Don't prefix with the folder name (`backup-restore.sh` inside `backup/` is redundant — just `restore.sh`).

## Conventions for new scripts

1. Start with `#!/usr/bin/env bash` and `set -euo pipefail`.
2. Document usage at the top in a comment block — the `--help` mental model. Operators will run `head -20 <script>` to figure out what it does.
3. Source `scripts/lib/logging.sh` if you need consistent log levels (`info`, `warn`, `error`). Don't hand-roll yet another `echo` formatter.
4. Make destructive operations require a `--yes` or `--force` flag, never an interactive `read`. The scripts must be runnable from `./arasul`, from cron, and from a Claude Code session — none of those have a TTY by default.
5. If the script reads env vars, document them at the top and provide defaults where it makes sense.

## When NOT to add a script here

- Long-running daemons → `services/<name>/`
- Code Claude Code should auto-suggest as a workflow → `.claude/skills/` (lighter touch than a slash command)
- Single-step tasks the user types repeatedly → a `Makefile` target instead, since `make foo` autocompletes and discovers scripts

## See also

- [`docs/ops/DEPLOYMENT.md`](../docs/ops/DEPLOYMENT.md) — when each `deploy/*.sh` script runs
- [`docs/ops/BACKUP_SYSTEM.md`](../docs/ops/BACKUP_SYSTEM.md) — full backup/restore workflow
- [`docs/development/TESTING.md`](../docs/development/TESTING.md) — how to wire tests into `test/run-tests.sh`
- [`services/CLAUDE.md`](../services/CLAUDE.md) — when to add a service vs. a script
