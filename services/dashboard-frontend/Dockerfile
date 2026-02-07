FROM node:25-alpine AS builder

LABEL org.opencontainers.image.architecture="arm64"

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (use install instead of ci when package-lock.json doesn't exist)
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

LABEL maintainer="Arasul Platform"
LABEL description="Dashboard Frontend - Single Page Application"
LABEL org.opencontainers.image.architecture="arm64"

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built application
COPY --from=builder /app/build /usr/share/nginx/html

# Health check
HEALTHCHECK --interval=10s --timeout=1s --retries=3 \
    CMD test -f /usr/share/nginx/html/index.html || exit 1

# Expose port
EXPOSE 3000

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
