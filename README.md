# Arasul Platform

**Vorserie** · Autonomous edge-AI appliance for NVIDIA Jetson AGX Orin / Thor.

> The device says **Vorserie**, not a version number, for as long as sales
> gates remain open (`utils/version.js`, Plan 023 C6/F-19). A round 1.0.0 on a
> product with zero closed gates is a claim, not a fact. `package.json` keeps
> `1.0.0` because the update service compares against it; changing that value
> would make every offered build look newer on a device without a set version.

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
                              ├─ Document indexer (text layer)
                              ├─ n8n (workflows)
                              ├─ SearXNG (web search for agents)
                              └─ Self-healing + metrics + backup
```

**There is no vector RAG any more.** Plan 021 (step 8) replaced it with
agentic RAG — grep, symbol search, and reading named files. On 24.08.2026
`qdrant` was removed along with its code, because three features were failing
silently instead of reporting that they did nothing. Search now goes through the
text layer in Postgres (`document_chunks`) and the agent's own tools.
`embedding-service` keeps running and carries no profile: the OpenAI-compatible
`/v1/embeddings` endpoint and knowledge-space routing both need it. Anything
that claims Qdrant is part of the running box is out of date; verify with
`docker compose ps`.

Full topology, ports, startup order: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

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
├── .claude/                    Claude Code workspace (skills, agents, hooks, context)
├── CLAUDE.md                   AI-facing rules and entry point
├── CONTRIBUTING.md             workflow, conventions, slash-command catalog
├── README.md                   you are here
└── arasul                      platform CLI (start / stop / bootstrap / …)
```

`apps/` is code you actively develop. `services/` is infrastructure built once and run.

---

## Where to look next

- **Documentation index:** [`docs/INDEX.md`](docs/INDEX.md)
- **Architecture:** [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- **Onboarding (developers):** [`docs/development/ONBOARDING.md`](docs/development/ONBOARDING.md)
- **Deployment (operators):** [`docs/ops/DEPLOYMENT.md`](docs/ops/DEPLOYMENT.md)
- **API reference:** [`docs/api/API_REFERENCE.md`](docs/api/API_REFERENCE.md)
- **Database schema:** [`docs/api/DATABASE_SCHEMA.md`](docs/api/DATABASE_SCHEMA.md)
- **Environment variables:** [`docs/ENVIRONMENT_VARIABLES.md`](docs/ENVIRONMENT_VARIABLES.md)
- **Troubleshooting:** [`docs/ops/TROUBLESHOOTING.md`](docs/ops/TROUBLESHOOTING.md)
- **Contribution workflow:** [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Laufender Plan:** seit dem 26.08.2026 im Überordner (`arasul/roadmap/plans/aktiv/`, nicht öffentlich); [`docs/plans/active/`](docs/plans/active/) ist leer, höchstens ein Einzelauftrag darf dort liegen, gehalten von `scripts/test/plan-faden.py`. Ruhende Pläne: [`docs/plans/paused/`](docs/plans/paused/README.md)

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

---

Built for edge AI. Designed to run for years without you touching it.
