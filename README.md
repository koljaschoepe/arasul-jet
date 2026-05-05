# Arasul Platform

**Version 1.0.0** · Autonomous edge-AI appliance for NVIDIA Jetson AGX Orin / Thor.

Arasul is a commercial edge-AI box: customers buy a physical Jetson appliance that runs chat, RAG, document analysis, and workflow automation entirely **locally** — no cloud calls, no data leakage, designed for **5 years of unattended operation**.

---

## Choose your path

| You are…                                         | Run this                    | Then read                                                                                                   |
| ------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **An operator** with a Jetson appliance          | `./arasul bootstrap`        | [`docs/ops/DEPLOYMENT.md`](docs/ops/DEPLOYMENT.md)                                                          |
| **A developer** iterating on a Jetson (SSH)      | `./arasul bootstrap`        | [`docs/development/ONBOARDING.md`](docs/development/ONBOARDING.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| **An end-customer** with a pre-configured device | open `https://arasul.local` | [`docs/ops/QUICK_START.md`](docs/ops/QUICK_START.md) (German)                                               |
| **An AI assistant** (Claude Code et al.)         | _read context first_        | [`CLAUDE.md`](CLAUDE.md), [`apps/*/CLAUDE.md`](apps/), [`.claude/`](.claude/)                               |

> Dev iteration happens on the Jetson (NVIDIA Container Runtime + CUDA are part of the platform). After editing `apps/dashboard-{backend,frontend}/src/`, run `docker compose up -d --build <service>` and verify in the browser. There is no x86 laptop hot-reload mode — see [`docs/development/ONBOARDING.md`](docs/development/ONBOARDING.md) for the rationale.

---

## Architecture at a glance

```
Internet (443) → Traefik → Dashboard frontend (React 19 SPA)
                         → Dashboard backend  (Express API :3001)
                              ├─ PostgreSQL 16
                              ├─ MinIO (S3 storage)
                              ├─ LLM service (Ollama, GPU)
                              ├─ Embedding service (BGE-M3, GPU)
                              ├─ Qdrant (vector DB)
                              ├─ Document indexer (RAG)
                              ├─ n8n (workflows)
                              └─ Self-healing + metrics + backup
```

Full topology, ports, startup order: [`ARCHITECTURE.md`](ARCHITECTURE.md) (root stub) → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (deep dive).

---

## Repo layout

```
arasul-jet/
├── apps/                       actively developed apps
│   ├── dashboard-backend/      Node.js / Express REST API + Jest
│   └── dashboard-frontend/     React 19 SPA (Vite + Tailwind v4 + shadcn) + Vitest
├── services/                   infrastructure containers (LLM, indexer, postgres, …)
├── compose/                    Docker Compose split files
├── config/                     Traefik, TLS, secrets, profiles
├── scripts/                    setup, test, deploy, ops scripts
├── docs/                       documentation — see docs/INDEX.md
│   ├── development/            for contributors
│   ├── api/                    REST + DB schema reference
│   ├── ops/                    install, run, recover
│   ├── features/               per-service feature docs
│   └── plans/                  active and archived roadmaps
├── .claude/                    Claude Code workspace (commands, agents, hooks, context)
├── ARCHITECTURE.md             one-page architecture summary
├── CLAUDE.md                   AI-facing rules and entry point
├── CONTRIBUTING.md             workflow, conventions, slash-command catalog
├── README.md                   you are here
└── arasul                      platform CLI (start / stop / bootstrap / …)
```

`apps/` is code you actively develop. `services/` is infrastructure built once and run.

---

## Where to look next

- **Documentation index:** [`docs/INDEX.md`](docs/INDEX.md)
- **Architecture:** [`ARCHITECTURE.md`](ARCHITECTURE.md) → [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Onboarding (developers):** [`docs/development/ONBOARDING.md`](docs/development/ONBOARDING.md)
- **Deployment (operators):** [`docs/ops/DEPLOYMENT.md`](docs/ops/DEPLOYMENT.md)
- **API reference:** [`docs/api/API_REFERENCE.md`](docs/api/API_REFERENCE.md)
- **Database schema:** [`docs/api/DATABASE_SCHEMA.md`](docs/api/DATABASE_SCHEMA.md)
- **Environment variables:** [`docs/ENVIRONMENT_VARIABLES.md`](docs/ENVIRONMENT_VARIABLES.md)
- **Troubleshooting:** [`docs/ops/TROUBLESHOOTING.md`](docs/ops/TROUBLESHOOTING.md)
- **Contribution workflow:** [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Active roadmap:** [`docs/plans/active/`](docs/plans/active/)

---

## CLI quick reference

```bash
./arasul bootstrap            # first-time install / re-bootstrap (Jetson)
./arasul start | stop | restart | status
./arasul logs [service]       # tail logs
./arasul --help               # full subcommand list
```

Parallel via Make:

```bash
make start                    # docker compose up -d (core services)
make logs s=dashboard-backend # tail one service
make build s=dashboard-backend # rebuild + restart one service
make help                     # all targets
```

Runtime details, troubleshooting, hardening: [`docs/ops/DEPLOYMENT.md`](docs/ops/DEPLOYMENT.md).

---

## Status & support

- **License:** Proprietary — see [`LICENSE`](LICENSE).
- **Bug reports / issues:** include `docker compose ps`, the failing `docker compose logs <service>`, and reproduction steps.
- **Changelog:** [`CHANGELOG.md`](CHANGELOG.md).

---

Built for edge AI. Designed to run for years without you touching it.
