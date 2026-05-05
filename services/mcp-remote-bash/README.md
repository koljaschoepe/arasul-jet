# MCP Remote Bash Server

Model-Context-Protocol (MCP) server that exposes Bash execution to remote AI clients (Claude Desktop, the dashboard's MCP integration, etc.) via a thin Flask wrapper. Lets a remote AI run `docker compose ps`, `tegrastats`, or any other shell command on the Jetson without an interactive SSH session.

## Overview

| Property    | Value                                              |
| ----------- | -------------------------------------------------- |
| Base image  | `python:3.11.12-slim`                              |
| Framework   | Flask + flask-cors                                 |
| System deps | `docker.io` (for docker-compose access), `curl`    |
| Entry point | `server.py`                                        |
| Auth        | Token-based — set `MCP_TOKEN` in the container env |

## Components

```
mcp-remote-bash/
├── Dockerfile      python:3.11-slim + flask + flask-cors + docker.io
└── server.py       Flask app exposing the MCP bash endpoints
```

## API

The server speaks the MCP wire protocol over HTTP. Key endpoints:

- `POST /mcp/exec` — body `{"command": "...", "token": "..."}` → returns `{stdout, stderr, exit_code}`.
- `GET /healthz` — liveness check.

See `server.py` for the full surface and the per-endpoint validation. The server **does not** sandbox commands beyond the container boundary — anything inside the container is reachable, so be deliberate about what you mount and what `MCP_TOKEN` value you ship.

## Security

- Always set a strong `MCP_TOKEN` (>= 32 random bytes). Never run with the default placeholder.
- Restrict network exposure: bind only to the internal compose network, never to a public interface.
- The container has the host's docker socket mounted to allow `docker compose` commands. This is **root-equivalent on the host** — treat the container's compromise as a host compromise. Disable this server when not actively in use.

## When to use it

Enable when the dashboard or an external Claude client needs to run shell commands against the Jetson. Disable for production customer appliances where remote bash isn't needed.
