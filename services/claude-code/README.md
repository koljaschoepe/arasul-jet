# Claude Code Container

Containerized Claude Code CLI for running AI-assisted coding sessions on the Jetson without polluting the host with Node, npm, and Anthropic SDK dependencies. Used for autonomous tasks, scheduled cron-style runs, and long-running sessions kept alive across SSH disconnects.

## Overview

| Property      | Value                                                                                 |
| ------------- | ------------------------------------------------------------------------------------- |
| Base image    | `node:20.19-slim`                                                                     |
| Runtime       | Node 20 + Anthropic CLI tooling                                                       |
| Auth          | OAuth token, refreshed by `token-refresh.sh`                                          |
| Entrypoint    | `entrypoint.sh` (boots the CLI session)                                               |
| Compose entry | Optional — image is built locally and started ad-hoc, not part of the always-on stack |

## Components

```
claude-code/
├── Dockerfile         node:20-slim + git, curl, jq, bc, sudo, build-essential
├── entrypoint.sh      Container entry — handles auth, starts the CLI loop
└── token-refresh.sh   Periodic OAuth token refresh (Anthropic credentials)
```

## When to use it

- **Autonomous task runs** — kick off a long task and let the container finish even after your SSH session ends.
- **Scheduled work** — cron-like invocation from `scripts/util/claude-autonomous.sh` or Telegram bot triggers.
- **Reproducible environment** — the CLI version, Node version, and toolchain are pinned in the Dockerfile, so different operators get the same behavior.

For interactive coding work on a developer Jetson, prefer running `claude` directly on the host — the container adds latency and removes IDE integration.

## Auth

OAuth credentials are stored in a host-mounted volume (mount path is set in compose). `token-refresh.sh` runs every N minutes to swap an expiring access token for a fresh one without user intervention. If auth breaks, run the CLI interactively once to re-authenticate, then the container picks up the new refresh token.
