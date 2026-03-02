FROM node:20-alpine

LABEL maintainer="Arasul Platform"
LABEL description="Dashboard Backend API"
LABEL org.opencontainers.image.architecture="arm64"

WORKDIR /repo

# Copy shared package (must match file:../../packages/shared reference)
COPY packages/shared/ ./packages/shared/

# Install dependencies
WORKDIR /repo/apps/dashboard-backend
COPY apps/dashboard-backend/package*.json ./
RUN npm install --omit=dev

# Copy source code
COPY apps/dashboard-backend/src/ ./src/

# Copy OpenAPI spec for API docs
COPY apps/dashboard-backend/openapi.yaml ./

# Copy test files, mocks and setup
COPY apps/dashboard-backend/__tests__/ ./__tests__/
COPY apps/dashboard-backend/__mocks__/ ./__mocks__/
COPY apps/dashboard-backend/jest.setup.js ./

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

USER node

CMD ["npm", "start"]
