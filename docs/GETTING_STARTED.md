# Getting Started

Quick onboarding guide for developers working on the Arasul Platform.

---

## Prerequisites

- **Docker** 24.0+ with Docker Compose V2
- **Node.js** 18+ (via nvm recommended)
- **Git**
- **NVIDIA Container Runtime** (for GPU services)

---

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url> arasul-platform
cd arasul-platform

# 2. Configure environment
cp .env.template .env
# Edit .env with your credentials

# 3. Start all services
docker compose up -d

# 4. Verify
docker compose ps          # All services should be healthy
curl http://localhost/api/health
```

Dashboard: `http://localhost` | n8n: `http://localhost/n8n` | MinIO: `http://localhost:9001`

---

## Interactive Setup

For first-time installations, use the interactive setup wizard instead of manually editing `.env`:

```bash
./scripts/interactive_setup.sh
```

The wizard walks through 5 steps: hardware detection, admin account, network, AI model selection, and confirmation. It auto-detects Jetson hardware (Orin/Thor), generates all secrets, and writes a production-ready `.env` file. Afterwards, run `./arasul bootstrap` to start all services.

---

## Non-Interactive Setup

For automated deployments, CI/CD pipelines, or fleet provisioning, skip all prompts:

```bash
ADMIN_PASSWORD='YourSecurePass1' ./scripts/interactive_setup.sh --non-interactive
```

**What it does:** Generates a complete `.env` with auto-detected hardware profile, default AI model for the detected device, and randomly generated secrets -- all without user interaction.

**Password requirements:** Minimum 12 characters, at least one uppercase letter, one lowercase letter, and one digit. Common weak passwords are rejected.

**Optional overrides via environment variables:**

| Variable         | Default              | Description         |
| ---------------- | -------------------- | ------------------- |
| `ADMIN_USERNAME` | `admin`              | Admin login name    |
| `ADMIN_EMAIL`    | `admin@arasul.local` | Admin email address |
| `LLM_MODEL`      | _(auto-detected)_    | Ollama model name   |
| `HOSTNAME`       | `arasul`             | mDNS hostname       |

After setup completes, run `./arasul bootstrap` to pull images and start services.

---

## Factory Image Workflow

Factory images enable fully offline deployment to new Jetson devices via USB, with no internet required.

### Creating a Factory Image

On an existing, working Arasul device:

```bash
./scripts/deploy/create-factory-image.sh
```

**Options:**

| Flag               | Description                                  |
| ------------------ | -------------------------------------------- |
| `--include-models` | Bundle Ollama AI models (can add several GB) |
| `--output=DIR`     | Output directory (default: `./deployment`)   |
| `--version=VER`    | Version tag (default: timestamp)             |

The script builds all Docker images, exports them, copies the project source (excluding data, `.env`, and secrets), and creates a `MANIFEST.yml` with checksums. Output is a single `arasul-factory-<version>.tar.gz` archive.

### Deploying to a New Device

Copy the archive to the target device (e.g. via USB drive), then:

```bash
tar xzf arasul-factory-*.tar.gz
cd arasul-factory-*/
./factory-install.sh
```

The installer loads pre-built Docker images, restores AI models (if included), runs the interactive setup wizard for admin credentials and network config, then bootstraps all services. Takes roughly 5-10 minutes with no internet required.

For fleet provisioning, combine with non-interactive mode:

```bash
ADMIN_PASSWORD='YourSecurePass1' ./factory-install.sh --non-interactive
```

**What's included in the factory image:**

- All Docker images (pre-built for ARM/Jetson)
- Project source code and scripts
- Factory installer script and manifest
- Ollama AI models (only with `--include-models`)

**Not included** (generated fresh on each device): `.env`, TLS certificates, database data, uploaded files.

---

## Project Structure

```
arasul-platform/
├── apps/                          # Actively developed applications
│   ├── dashboard-backend/         #   Node.js/Express REST API
│   │   └── src/
│   │       ├── routes/            #     API routes (central router: routes/index.js)
│   │       ├── services/          #     Business logic
│   │       └── middleware/        #     Auth, error handling, rate limiting
│   └── dashboard-frontend/        #   React 19 SPA
│       └── src/
│           ├── features/          #     Feature modules (chat, documents, settings, ...)
│           ├── components/        #     Shared UI components
│           └── hooks/             #     Custom hooks (useApi, useConfirm, ...)
├── services/                      # Infrastructure services (Docker)
│   ├── llm-service/               #   Ollama LLM (Python/Flask)
│   ├── embedding-service/         #   Text vectorization (Python/Flask)
│   ├── document-indexer/          #   RAG document processing
│   ├── postgres/init/             #   Database migrations (001-049)
│   └── ...                        #   metrics-collector, self-healing, telegram-bot
├── compose/                       # Docker Compose split files
├── config/                        # Traefik, TLS, secrets
├── scripts/                       # Categorized scripts (setup, test, deploy, ...)
├── docs/                          # Documentation
├── CLAUDE.md                      # Claude Code instructions
└── docker-compose.yml             # Main compose file (includes compose/)
```

**Key distinction**: `apps/` = code you actively develop, `services/` = infrastructure containers.

---

## First Change Walkthrough

### Backend: Add an API endpoint

1. Create route in `apps/dashboard-backend/src/routes/myroute.js`
2. Register in `src/routes/index.js`
3. Use `asyncHandler` + custom error classes (see [DEVELOPMENT.md](DEVELOPMENT.md#2-backend-patterns))
4. Run tests: `./scripts/test/run-tests.sh --backend`

### Frontend: Add a component

1. Create in `apps/dashboard-frontend/src/features/<feature>/`
2. Export from barrel file (`index.ts`)
3. Use `useApi()` for API calls, CSS variables for styling
4. Follow [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)

### Database: Add a migration

1. Create `services/postgres/init/042_description.sql`
2. Use `IF NOT EXISTS` for idempotency
3. Rebuild: `docker compose up -d --build postgres-db`

---

## Essential Commands

```bash
# Services
docker compose up -d                    # Start all
docker compose logs -f <service>        # View logs
docker compose up -d --build <service>  # Rebuild

# Development
./scripts/test/run-tests.sh --backend   # Run tests
npm run lint:fix                        # Fix lint issues

# Database
docker exec -it postgres-db psql -U arasul -d arasul_db
```

---

## Key Documentation

| Topic                   | Document                                             |
| ----------------------- | ---------------------------------------------------- |
| Architecture & services | [ARCHITECTURE.md](ARCHITECTURE.md)                   |
| Development patterns    | [DEVELOPMENT.md](DEVELOPMENT.md)                     |
| Frontend design system  | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)                 |
| API endpoints           | [API_REFERENCE.md](API_REFERENCE.md)                 |
| Database schema         | [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)             |
| Environment variables   | [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) |
| All documentation       | [INDEX.md](INDEX.md)                                 |
