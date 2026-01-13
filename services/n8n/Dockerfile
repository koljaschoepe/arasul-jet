# Multi-stage Dockerfile for n8n with custom Arasul nodes
# Stage 1: Build custom nodes (TypeScript compilation)
FROM node:18-alpine AS builder

WORKDIR /build

# Copy custom node packages
COPY custom-nodes/n8n-nodes-arasul-llm /build/n8n-nodes-arasul-llm
COPY custom-nodes/n8n-nodes-arasul-embeddings /build/n8n-nodes-arasul-embeddings

# Build LLM node
WORKDIR /build/n8n-nodes-arasul-llm
RUN npm install --production=false && \
    npm run build

# Build Embeddings node
WORKDIR /build/n8n-nodes-arasul-embeddings
RUN npm install --production=false && \
    npm run build

# Stage 2: Final n8n image with compiled nodes
# PHASE1-FIX: Pin to specific version for reproducible builds
# Update N8N_VERSION when upgrading (check: https://hub.docker.com/r/n8nio/n8n/tags)
ARG N8N_VERSION=1.70.0
FROM n8nio/n8n:${N8N_VERSION}

USER root

# Create custom nodes directory
RUN mkdir -p /custom-nodes

# Copy compiled nodes from builder stage
COPY --from=builder /build/n8n-nodes-arasul-llm/dist /custom-nodes/n8n-nodes-arasul-llm/dist
COPY --from=builder /build/n8n-nodes-arasul-llm/package.json /custom-nodes/n8n-nodes-arasul-llm/package.json
COPY --from=builder /build/n8n-nodes-arasul-llm/node_modules /custom-nodes/n8n-nodes-arasul-llm/node_modules

COPY --from=builder /build/n8n-nodes-arasul-embeddings/dist /custom-nodes/n8n-nodes-arasul-embeddings/dist
COPY --from=builder /build/n8n-nodes-arasul-embeddings/package.json /custom-nodes/n8n-nodes-arasul-embeddings/package.json
COPY --from=builder /build/n8n-nodes-arasul-embeddings/node_modules /custom-nodes/n8n-nodes-arasul-embeddings/node_modules

# Set ownership
RUN chown -R node:node /custom-nodes

USER node

# n8n will automatically load nodes from N8N_CUSTOM_EXTENSIONS
ENV N8N_CUSTOM_EXTENSIONS=/custom-nodes
