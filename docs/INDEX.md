# Documentation Index

Map of every document in this repo. Pick a starting point that matches your role.

## Start here

| You are…                                                  | Read this first                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------------------- |
| **A new developer** (clone the repo, ship code)           | [`development/ONBOARDING.md`](development/ONBOARDING.md) — 30-min path |
| **An operator** deploying to a Jetson                     | [`ops/DEPLOYMENT.md`](ops/DEPLOYMENT.md)                               |
| **An end-customer** with a pre-configured device (German) | [`ops/QUICK_START.md`](ops/QUICK_START.md)                             |
| **An AI assistant** (Claude Code et al.)                  | [`../CLAUDE.md`](../CLAUDE.md) and per-area `apps/*/CLAUDE.md`         |

For repo conventions, branching, commit format, and the slash-command catalog, see [`../CONTRIBUTING.md`](../CONTRIBUTING.md).

---

## Subject areas

```
docs/
├── INDEX.md                  this file
├── ARCHITECTURE.md           service topology, data flows
├── ENVIRONMENT_VARIABLES.md  every env var
├── development/              for contributors
├── api/                      REST + DB schema reference
├── ops/                      install, run, recover
├── features/                 per-service feature docs
├── plans/                    active and archived roadmaps
└── archive/                  historical, kept for reference
```

---

## Development

| Document                                                               | Topic                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| [`development/ONBOARDING.md`](development/ONBOARDING.md)               | 30-min cold-clone-to-first-PR walkthrough               |
| [`development/DEVELOPMENT.md`](development/DEVELOPMENT.md)             | Backend + frontend patterns, debugging, hooks           |
| [`development/TESTING.md`](development/TESTING.md)                     | Jest + Vitest + pytest workflows, coverage              |
| [`development/DESIGN.md`](development/DESIGN.md)                       | Das Design: Palette, Themes, Maße, Baustein-Set, Regeln |
| [`development/FRONTEND_HANDBOOK.md`](development/FRONTEND_HANDBOOK.md) | Frontend patterns, folder layout, testing               |
| [`development/PYTHON_SERVICES.md`](development/PYTHON_SERVICES.md)     | LLM service, embedding service, document indexer        |
| [`CICD.md`](CICD.md)                                                   | CI checks, deploy workflow, local deploy script         |

---

## API reference

| Document                                             | Topic                                              |
| ---------------------------------------------------- | -------------------------------------------------- |
| [`api/API_REFERENCE.md`](api/API_REFERENCE.md)       | REST endpoint catalog, request/response shapes     |
| [`api/API_ERRORS.md`](api/API_ERRORS.md)             | Error code catalog and client handling             |
| [`api/DATABASE_SCHEMA.md`](api/DATABASE_SCHEMA.md)   | Postgres tables, relationships, migration history  |
| [`api/DATABASE_DOMAINS.md`](api/DATABASE_DOMAINS.md) | Tables grouped by domain, retention, key functions |

---

## Operations

| Document                                                           | Topic                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| [`ops/DEPLOYMENT.md`](ops/DEPLOYMENT.md)                           | Install (interactive / factory / non-interactive), pre-shipping checklist, hardening |
| [`ops/QUICK_START.md`](ops/QUICK_START.md)                         | Customer quick start (German, end-user-facing)                                       |
| [`ops/ADMIN_HANDBUCH.md`](ops/ADMIN_HANDBUCH.md)                   | Operator handbook (German, 8 chapters)                                               |
| [`ops/TROUBLESHOOTING.md`](ops/TROUBLESHOOTING.md)                 | Symptom-to-fix lookup                                                                |
| [`ops/UPDATE_SYSTEM.md`](ops/UPDATE_SYSTEM.md)                     | OTA / package update mechanism                                                       |
| [`ops/REMOTE_MAINTENANCE.md`](ops/REMOTE_MAINTENANCE.md)           | SSH, Cloudflared, VPN setup                                                          |
| [`ops/LOGGING.md`](ops/LOGGING.md)                                 | Logger configuration, log paths, rotation                                            |
| [`ops/BACKUP_SYSTEM.md`](ops/BACKUP_SYSTEM.md)                     | Automated backup engine                                                              |
| [`ops/DISASTER_RECOVERY.md`](ops/DISASTER_RECOVERY.md)             | DR runbooks, restore procedures                                                      |
| [`ops/INFRASTRUCTURE.md`](ops/INFRASTRUCTURE.md)                   | Containers, networks, volumes, startup order                                         |
| [`ops/FRESH_INSTALL_CHECKLIST.md`](ops/FRESH_INSTALL_CHECKLIST.md) | Checklist for a fresh device                                                         |
| [`legal/`](legal/README.md)                                        | AVV template, privacy modules (German)                                               |

---

## Features

| Document                                                                             | Topic                                                                  |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [`features/APPS.md`](features/APPS.md)                                               | Apps: Manifest `app.json`, die zwei Stände, Tester-Kreis, Auslieferung |
| [`features/APP-PAKET.md`](features/APP-PAKET.md)                                     | Das App-Paket: was hineingehört, der Deploy-Schlüssel, der Kontrakt    |
| [`features/FLOWS.md`](features/FLOWS.md)                                             | Flows: Definitionen, Argumente, Werkzeuge, Läufe, externer Trigger     |
| [`features/SELF_HEALING_IMPLEMENTATION.md`](features/SELF_HEALING_IMPLEMENTATION.md) | Self-healing agent architecture                                        |
| [`features/PLATFORM_COMPATIBILITY.md`](features/PLATFORM_COMPATIBILITY.md)           | Multi-device support, GPU error handling                               |

---

## Plans

| Folder                                   | Contains                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| [`plans/active/`](plans/active/)         | Roadmaps and overhauls currently in flight                                   |
| [`plans/HISTORIE.md`](plans/HISTORIE.md) | Index of all completed and superseded plans; full text via the listed commit |
| [`plans/audits/`](plans/audits/)         | Snapshots from past multi-agent codebase audits                              |

See [`plans/README.md`](plans/README.md) for the plan workflow (when to start one, when to archive, naming conventions).

---

## Service-level docs

Each service has its own `README.md` (and increasingly its own `CLAUDE.md`). See:

| Service              | Path                           |
| -------------------- | ------------------------------ |
| Dashboard backend    | `apps/dashboard-backend/`      |
| Dashboard frontend   | `apps/dashboard-frontend/`     |
| LLM service (Ollama) | `services/llm-service/`        |
| Embedding service    | `services/embedding-service/`  |
| Document indexer     | `services/document-indexer/`   |
| PostgreSQL           | `services/postgres/`           |
| Metrics collector    | `services/metrics-collector/`  |
| Self-healing agent   | `services/self-healing-agent/` |
| Backup service       | `services/backup-service/`     |
| Cloudflared tunnel   | `services/cloudflared/`        |

> Some service READMEs are still being written as part of the DX overhaul (2026-05, see [plan history](plans/HISTORIE.md)), Stage 9.

---

## Configuration

| Document                                                  | Topic                       |
| --------------------------------------------------------- | --------------------------- |
| [`config/README.md`](../config/README.md)                 | Configuration tree overview |
| [`config/traefik/README.md`](../config/traefik/README.md) | Traefik reverse proxy + TLS |

---

## Archive

[`archive/`](archive/) — historical documents kept for reference. Do not act on the contents.
