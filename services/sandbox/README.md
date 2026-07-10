# Sandbox

General-purpose terminal-based development sandbox container. Lets an operator (or an AI agent) install ad-hoc packages, run experimental tooling (`claude`, `codex`, `gh`, …), and keep state across restarts — all without touching the host's package manager.

## Overview

| Property      | Value                                                                                                                                                                                                                                                                |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base image    | `node:20.19-slim`                                                                                                                                                                                                                                                    |
| Pre-installed | `bash`, `git`, `curl`, `tmux` + Node 20 toolchain, Python 3 + open-ara deps (`textual`, `openai`, `rich`), Claude Code CLI                                                                                                                                           |
| Persistence   | Container state (installed packages, shell history): preserved across `docker stop`/`start`, lost on `docker rm`. **User project files in `data/sandbox/projects/`: persistent regardless** — bind-mounted from the Jetson host (see `compose/compose.app.yaml:79`). |
| Entry point   | `entrypoint.sh` (drops you into a `tmux` session)                                                                                                                                                                                                                    |
| tmux config   | `tmux.conf` — pinned key bindings + sane defaults                                                                                                                                                                                                                    |

## Components

```
sandbox/
├── Dockerfile      node:20-slim + bash + git + curl + tmux
├── entrypoint.sh   Container entry — starts tmux, attaches to default session
├── open-ara.sh     Launcher for the local AI coding agent (→ /usr/local/bin/open-ara)
└── tmux.conf       tmux configuration (key bindings, status bar, scrollback)
```

## Usage

```bash
# Start (or attach to) the sandbox
docker compose up -d sandbox
docker compose exec sandbox bash       # Plain shell
docker compose exec sandbox tmux a     # Attach to the persistent tmux session

# Install an ad-hoc tool inside the sandbox (state persists until you docker rm it)
docker compose exec sandbox apt-get update
docker compose exec sandbox apt-get install -y <package>
```

## Open-ARA (local AI coding agent)

The image ships a launcher `/usr/local/bin/open-ara` for **open-ara**, the local Textual-TUI coding agent (Python package `arasul`, CLI `arasul`). It works like this:

1. **Sources** — the operator places the open-ara source tree on the Jetson at `data/sandbox/tools/open-ara`. The backend mounts `data/sandbox/tools` **read-only** into every sandbox container at `/opt/tools` (see `apps/dashboard-backend/src/services/sandbox/sandboxService.js`; host path override: `SANDBOX_HOST_TOOLS_DIR`). Without the sources, `open-ara` exits with a clear German error message.
2. **Dependencies** — `textual[syntax]`, `openai`, and `rich` are pre-installed in the image, so the first launch does not download anything.
3. **First launch** — the wrapper runs `sudo pip3 install --break-system-packages --no-deps -e /opt/tools/open-ara` once (idempotent via a `~/.open-ara-installed` marker; `sudo pip3` is whitelisted in the container's sudoers), then execs `arasul "$@"`.
4. **Ollama access** — the wrapper defaults `ARASUL_OLLAMA_URL` to `http://llm-service:11434`; the backend also sets it on the container. **The project must use network mode `internal`** (project settings) — in the default `isolated` mode, `llm-service` is unreachable and open-ara fails with a connection error. `ARASUL_MODEL` can be set via the project's environment variables.

In the dashboard, use the terminal Quick-Launch entry **"Open-ARA (lokaler Agent)"** or type `open-ara` in any sandbox terminal.

## When to use it

- Run a long-lived `claude`, `codex`, or shell session that survives SSH disconnects.
- Experiment with a CLI tool without polluting the host or any production service container.
- Reproduce a customer environment for debugging without spinning up a separate VM.

For one-shot scripts, prefer `docker run --rm` against the relevant service image — the sandbox is for **stateful** experimentation.

## Cleanup

Whenever you want a clean slate **inside the container** (installed apt packages, npm globals, shell history, /tmp scratch):

```bash
docker compose down sandbox
docker compose up -d --force-recreate sandbox
```

User project files at `data/sandbox/projects/` are **preserved** — they live on the host bind-mount, not in the container layer. To clear them too, also `rm -rf data/sandbox/projects/<project-name>` on the host.
