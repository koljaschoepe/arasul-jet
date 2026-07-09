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

# Root manifest + the single root lockfile (the only lock in the repo).
COPY package.json package-lock.json ./

# Every workspace manifest so the workspace graph resolves during `npm ci`.
COPY apps/dashboard-backend/package.json apps/dashboard-backend/
COPY apps/dashboard-frontend/package.json apps/dashboard-frontend/

# Shared workspace: @arasul/shared-schemas (its built dist/ is committed and
# lands in the image; the file: dep resolves via a workspace symlink into
# /app/node_modules/@arasul/shared-schemas).
COPY packages/shared-schemas packages/shared-schemas

# The root `prepare` hook installs husky git hooks — a dev-only step that must
# never run inside an image (no .git, husky is a devDependency). Drop it before
# installing. This does not affect lockfile dependency integrity.
RUN npm pkg delete scripts.prepare

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
# runtime: default target — prod image, omits devDeps and test files.
# ============================================================================
FROM base AS runtime

RUN npm ci --omit=dev --workspace=arasul-dashboard-backend --include-workspace-root

WORKDIR /app/apps/dashboard-backend
COPY apps/dashboard-backend/src/ ./src/
COPY apps/dashboard-backend/openapi.yaml ./

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

USER node

CMD ["node", "--max-old-space-size=512", "src/index.js"]
