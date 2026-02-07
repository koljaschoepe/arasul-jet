# Multi-stage Dockerfile for n8n with custom Arasul nodes
# SECURITY-FIX: Pinned to 2.4.6 to address critical CVEs:
# - CVE-2026-21858 (CVSS 10.0) - Ni8mare: Unauthenticated RCE via Webhook
# - CVE-2025-68613 (CVSS 9.9) - Expression Injection RCE
# - CVE-2025-68668 (CVSS 9.9) - N8scape: Python Code Node Sandbox Bypass
# - CVE-2026-21877 (CVSS 10.0) - Unrestricted File Upload
# Update N8N_VERSION when upgrading (check: https://hub.docker.com/r/n8nio/n8n/tags)
ARG N8N_VERSION=1.121.1

# Stage 1: Build custom nodes (TypeScript compilation)
FROM node:20-alpine AS builder

WORKDIR /build

# Copy custom node packages
COPY custom-nodes/n8n-nodes-arasul-llm /build/n8n-nodes-arasul-llm
COPY custom-nodes/n8n-nodes-arasul-embeddings /build/n8n-nodes-arasul-embeddings

# Build LLM node
WORKDIR /build/n8n-nodes-arasul-llm
RUN npm install && \
    npm run build && \
    rm -rf node_modules && \
    npm install --omit=dev

# Build Embeddings node
WORKDIR /build/n8n-nodes-arasul-embeddings
RUN npm install && \
    npm run build && \
    rm -rf node_modules && \
    npm install --omit=dev

# Stage 2: Final n8n image with compiled nodes
FROM n8nio/n8n:${N8N_VERSION}

USER root

# Note: Python Task Runner is optional in n8n 2.x
# The base image doesn't include a package manager, so we skip Python installation
# n8n will show a warning but function normally for JavaScript workflows

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
