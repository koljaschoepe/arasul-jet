ARG NODE_VERSION=20.19

# ============================================================================
# base: shared layer — node image + workdir + workspace shared-schemas
# ============================================================================
FROM node:${NODE_VERSION}-alpine AS base

LABEL maintainer="Arasul Platform"
LABEL description="Dashboard Backend API"
LABEL org.opencontainers.image.architecture="arm64"

WORKDIR /app

# Shared workspace: copy @arasul/shared-schemas so the local file: dep resolves.
# Placed at /packages/shared-schemas so ../../packages/shared-schemas from
# /app (the backend workdir) points here.
COPY packages/shared-schemas /packages/shared-schemas

COPY apps/dashboard-backend/package*.json ./

# ============================================================================
# test: devDependencies + tests for local `npx jest` runs via
# `docker compose -f compose.test.yaml run backend-test`.
# NOT used at runtime — prod image is `runtime` below.
# ============================================================================
FROM base AS test
RUN npm install --install-links
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

RUN npm install --omit=dev --install-links

COPY apps/dashboard-backend/src/ ./src/
COPY apps/dashboard-backend/openapi.yaml ./

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

USER node

CMD ["node", "--max-old-space-size=512", "src/index.js"]
