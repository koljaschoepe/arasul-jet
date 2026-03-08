ARG NODE_VERSION=20.19
FROM node:${NODE_VERSION}-alpine AS builder

LABEL org.opencontainers.image.architecture="arm64"

WORKDIR /repo

# Copy shared package (must match file:../../packages/shared reference)
COPY packages/shared/ ./packages/shared/

# Copy package files and install dependencies
WORKDIR /repo/apps/dashboard-frontend
COPY apps/dashboard-frontend/package*.json ./
RUN npm install

# Copy source code
COPY apps/dashboard-frontend/ .

# Build the application
RUN npm run build

# Production stage
FROM nginx:1.27-alpine

LABEL maintainer="Arasul Platform"
LABEL description="Dashboard Frontend - Single Page Application"
LABEL org.opencontainers.image.architecture="arm64"

# Copy nginx configuration
COPY apps/dashboard-frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application
COPY --from=builder /repo/apps/dashboard-frontend/dist /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=10s --timeout=1s --retries=3 \
    CMD test -f /usr/share/nginx/html/index.html || exit 1

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
