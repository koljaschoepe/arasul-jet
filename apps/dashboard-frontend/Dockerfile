ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS builder

LABEL org.opencontainers.image.architecture="arm64"

WORKDIR /app

# ROOT-ONLY npm lockfile (Master-Plan P9-4): the only package-lock.json is at
# the repo root. Copy the root manifest + lockfile + every workspace manifest
# so the workspace graph resolves, then run a deterministic scoped install.
# Build context is the repo root (see compose / .github/workflows/test.yml).
COPY package.json package-lock.json ./
COPY apps/dashboard-frontend/package.json apps/dashboard-frontend/
COPY apps/dashboard-backend/package.json apps/dashboard-backend/

# Shared workspace: @arasul/shared-schemas (its built dist/ is committed and the
# file: dep resolves via a workspace symlink).
COPY packages/shared-schemas packages/shared-schemas

# Dev-only husky git-hook install must never run in an image; drop it before
# installing. Does not affect lockfile dependency integrity.
RUN npm pkg delete scripts.prepare

# Deterministic install from the single root lock, scoped to this workspace.
RUN npm ci --workspace=arasul-dashboard-frontend --include-workspace-root

# Copy source code (node_modules / dist excluded via .dockerignore) and build.
COPY apps/dashboard-frontend/ apps/dashboard-frontend/
WORKDIR /app/apps/dashboard-frontend
RUN npm run build

# Production stage
FROM nginx:1.27-alpine

LABEL maintainer="Arasul Platform"
LABEL description="Dashboard Frontend - Single Page Application"
LABEL org.opencontainers.image.architecture="arm64"

# Copy nginx configuration
COPY apps/dashboard-frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application
COPY --from=builder /app/apps/dashboard-frontend/dist /usr/share/nginx/html

# Health check - verify nginx is serving (wget available in alpine)
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
    CMD wget --spider -q http://localhost:3000/ || exit 1

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
