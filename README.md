# Arasul Platform

**Vorserie** · Standard software that hosts a company's internal apps on a
server in the building — an NVIDIA Jetson AGX Orin / Thor.

> The device says **Vorserie**, not a version number, until a build sets
> `SYSTEM_VERSION` (`utils/version.js`). Without one, the version used for
> update comparison is `0.0.0`: a pre-series device is older than any release
> that will ever ship. `package.json` says `0.0.0` for the same reason; nothing
> reads it.

Arasul runs on the customer's Jetson and hosts **apps**: container apps with a
manifest, built by a partner or a tech-savvy employee with the open
**Ara-Kit** (Apache 2.0, separate repository) and rolled onto the device.
Employees sign in with e-mail and password and see the apps an admin assigned
to them. The license buys three things — sign-in and assignment, the flow
engine with traceable runs, and operations (updates, backup, recovery,
maintenance) — plus approvals as a platform service. Everything runs
**locally**: no cloud calls, no data leakage, designed for **5 years of
unattended operation**.

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
                              ├─ LLM service (Ollama, GPU)
                              ├─ Document indexer (text extraction only)
                              └─ Self-healing + metrics + backup
```

Twelve containers; `docker compose ps` is the truth. The backend is the old
Express core, cut down hard in the August 2026 rebuild: no documents, no RAG,
no chat in the UI, no editor, terminal, sandbox, n8n or extension toolkit. What
remains is sign-in, models, flows with runs and steps, the external API with
keys (`/api/v1/external`, OpenAI-compatible under `/v1`) and operations. The
document indexer extracts text on request (`POST /extract-text`); flows work
with their file tools inside the folders they declare; `embedding-service`
serves the OpenAI-compatible `/v1/embeddings`. The app model (manifest
`app.json`, static frontend under `/apps/<id>/`, backend as a container) and
the new UI are the next phases of the rebuild.

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

- **License:** source-available — the code is public to read, running it requires an Arasul license; see [`LICENSE`](LICENSE).
- **Bug reports / issues:** include `docker compose ps`, the failing `docker compose logs <service>`, and reproduction steps.

---

Built for edge AI. Designed to run for years without you touching it.
