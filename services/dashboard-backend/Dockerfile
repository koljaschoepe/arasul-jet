FROM node:18-alpine

LABEL maintainer="Arasul Platform"
LABEL description="Dashboard Backend API"
LABEL org.opencontainers.image.architecture="arm64"

WORKDIR /app

# Install dependencies (including dev dependencies for tests in CI)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY src/ ./src/

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

USER node

CMD ["npm", "start"]
