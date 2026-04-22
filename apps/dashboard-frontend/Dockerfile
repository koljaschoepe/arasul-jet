ARG NODE_VERSION=20.19
FROM node:${NODE_VERSION}-alpine AS builder

LABEL org.opencontainers.image.architecture="arm64"

WORKDIR /app

# Shared workspace: place @arasul/shared-schemas at a path the file: dep
# in package.json expects (../../packages/shared-schemas from /app).
COPY packages/shared-schemas /packages/shared-schemas

# Copy package files and install dependencies
COPY apps/dashboard-frontend/package*.json ./
RUN npm install --install-links

# Copy source code
COPY apps/dashboard-frontend/ .

# Build the application
RUN npm run build

# Production stage
FROM nginx:1.29-alpine

LABEL maintainer="Arasul Platform"
LABEL description="Dashboard Frontend - Single Page Application"
LABEL org.opencontainers.image.architecture="arm64"

# Copy nginx configuration
COPY apps/dashboard-frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application
COPY --from=builder /app/dist /usr/share/nginx/html

# Health check - verify nginx is serving (wget available in alpine)
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=3 \
    CMD wget --spider -q http://localhost:3000/ || exit 1

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
