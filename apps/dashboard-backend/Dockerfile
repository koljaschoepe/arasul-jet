ARG NODE_VERSION=22

# ============================================================================
# base: root workspace manifests + the single source-of-truth lockfile.
# This monorepo uses a ROOT-ONLY npm lockfile (Master-Plan P9-4): the only
# package-lock.json is at the repo root. Installs are deterministic and scoped
# to this workspace via `npm ci --workspace=... --include-workspace-root`.
# Build context is the repo root (see compose / .github/workflows/test.yml).
# ============================================================================
FROM node:${NODE_VERSION}-alpine AS base

LABEL maintainer="Arasul Platform"
LABEL description="Dashboard Backend API"
LABEL org.opencontainers.image.architecture="arm64"

WORKDIR /app

# git: the Projekt↔Repo-Sync (Plan 013, B9) shells out to the git CLI via
# execFile (services/git/gitSyncService.js). alpine ships without it.
# tzdata: makes the TZ env effective — flow schedules (cronExpr) run in
# process-local time and must match the appliance's wall clock.
RUN apk add --no-cache git tzdata

# Root manifest + the single root lockfile (the only lock in the repo).
COPY package.json package-lock.json ./

# Every workspace manifest so the workspace graph resolves during `npm ci`.
COPY apps/dashboard-backend/package.json apps/dashboard-backend/
COPY apps/dashboard-frontend/package.json apps/dashboard-frontend/

# The root `prepare` hook installs husky git hooks — a dev-only step that must
# never run inside an image (no .git, husky is a devDependency). Drop it before
# installing. This does not affect lockfile dependency integrity.
RUN npm pkg delete scripts.prepare

# Die Fassung der Bibliothek, die dieses Geraet traegt (J45): der App-Standard
# weist beim Ausrollen eine fremde Hauptzahl ab und liest sie aus genau dieser
# Datei (`services/app/appStandard.js`), statt eine zweite Zahl zu fuehren.
COPY packages/marken/src/fassung.ts packages/marken/src/fassung.ts

# ============================================================================
# test: devDependencies + tests for local `npx jest` runs via
# `docker compose -f compose.test.yaml run backend-test`.
# NOT used at runtime — prod image is `runtime` below.
# ============================================================================
FROM base AS test
RUN npm ci --workspace=arasul-dashboard-backend --include-workspace-root
WORKDIR /app/apps/dashboard-backend
COPY apps/dashboard-backend/src/ ./src/
COPY apps/dashboard-backend/__tests__/ ./__tests__/
COPY apps/dashboard-backend/__mocks__/ ./__mocks__/
COPY apps/dashboard-backend/jest.setup.js ./jest.setup.js
COPY apps/dashboard-backend/openapi.yaml ./
ENV NODE_ENV=test
CMD ["npx", "jest", "--passWithNoTests", "--maxWorkers=2"]

# ============================================================================
# werkstatt: die Werkstatt (J44, M7; bis J52 Entwickler-Cockpit), die mitgelieferte App.
# Gebaut aus `apps/werkstatt/` gegen die Bibliothek zur Laufzeit
# (React und `@marken` kommen am Geraet von `/marken/5/`); das Backend liefert
# es unter `/apps/werkstatt/` aus (`services/app/mitgeliefert.js`).
# Die ersten Schritte stehen WORTGLEICH wie im Builder des Frontends
# (`apps/dashboard-frontend/Dockerfile`): BuildKit teilt dann die Schicht mit
# `npm ci`, und das Backend baut sie nicht ein zweites Mal.
# ============================================================================
FROM node:${NODE_VERSION}-alpine AS werkstatt
LABEL org.opencontainers.image.architecture="arm64"
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/dashboard-frontend/package.json apps/dashboard-frontend/
COPY apps/dashboard-backend/package.json apps/dashboard-backend/
COPY packages/marken packages/marken
RUN npm pkg delete scripts.prepare
RUN npm ci --workspace=arasul-dashboard-frontend --include-workspace-root
COPY apps/werkstatt/ apps/werkstatt/
WORKDIR /app/apps/dashboard-frontend
RUN npm run werkstatt:bauen

# ============================================================================
# runtime: default target — prod image, omits devDeps and test files.
# ============================================================================
FROM base AS runtime

RUN npm ci --omit=dev --workspace=arasul-dashboard-backend --include-workspace-root

WORKDIR /app/apps/dashboard-backend
COPY apps/dashboard-backend/src/ ./src/
COPY apps/dashboard-backend/openapi.yaml ./
# Die mitgelieferte App: `app.json` und `frontend/` (J44).
COPY --from=werkstatt /app/apps/werkstatt/dist/ ./mitgeliefert/werkstatt/

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

USER node

CMD ["node", "--max-old-space-size=512", "src/index.js"]
