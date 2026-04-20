ARG NODE_VERSION=20.19
FROM node:${NODE_VERSION}-alpine

LABEL maintainer="Arasul Platform"
LABEL description="Dashboard Backend API"
LABEL org.opencontainers.image.architecture="arm64"

WORKDIR /app

# Shared workspace: copy @arasul/shared-schemas so the local file: dep resolves.
# Placed at /packages/shared-schemas so ../../packages/shared-schemas from
# /app (the backend workdir) points here.
COPY packages/shared-schemas /packages/shared-schemas

# Install dependencies (--install-links copies file: deps into node_modules
# instead of symlinking, which is what we want inside the container).
COPY apps/dashboard-backend/package*.json ./
RUN npm install --omit=dev --install-links

# Copy source code
COPY apps/dashboard-backend/src/ ./src/

# Copy OpenAPI spec for API docs
COPY apps/dashboard-backend/openapi.yaml ./

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

USER node

CMD ["node", "--max-old-space-size=512", "src/index.js"]
