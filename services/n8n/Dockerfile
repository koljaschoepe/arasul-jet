# Multi-stage Dockerfile for n8n with custom Arasul nodes
#
# Pinned to 1.123.18 — the 1.x line that includes all Q1 2026 security fixes:
#   - CVE-2026-21858 (CVSS 10.0) Ni8mare: unauthenticated RCE via webhook (fixed ≥ 1.121.0)
#   - CVE-2025-68613 (CVSS 9.9)  Expression-injection RCE (fixed ≥ 1.122.0)
#   - CVE-2026-25115 / CVE-2026-25049 / CVE-2026-25056 (Critical) — fixed ≥ 1.123.18
#   - CVE-2025-68668 N8scape: Pyodide sandbox escape (fixed ≥ 2.0.0; we don't ship Python)
#   - Several Critical/High advisories from the Feb 2026 bulletin — all fixed ≥ 1.123.18
#
# 2.x is intentionally NOT chosen yet — 2.0 introduced breaking changes (env-var blocking,
# stricter file permissions, Pyodide removal) that we want to migrate to deliberately.
#
# Patch cadence: aim for monthly rebuilds. n8n averaged ~1 critical CVE/month through
# Q1 2026. See docs/plans/active/EXTERNAL_INTEGRATIONS.md §7.5 for the auto-update plan.
ARG N8N_VERSION=1.123.18

# Stage 1: Build custom nodes (TypeScript compilation)
FROM node:20-alpine AS builder

WORKDIR /build

# Copy custom node packages
COPY custom-nodes/n8n-nodes-arasul-llm /build/n8n-nodes-arasul-llm
COPY custom-nodes/n8n-nodes-arasul-embeddings /build/n8n-nodes-arasul-embeddings
COPY custom-nodes/n8n-nodes-arasul-documents /build/n8n-nodes-arasul-documents

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

# Build Documents node
WORKDIR /build/n8n-nodes-arasul-documents
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

COPY --from=builder /build/n8n-nodes-arasul-documents/dist /custom-nodes/n8n-nodes-arasul-documents/dist
COPY --from=builder /build/n8n-nodes-arasul-documents/package.json /custom-nodes/n8n-nodes-arasul-documents/package.json
COPY --from=builder /build/n8n-nodes-arasul-documents/node_modules /custom-nodes/n8n-nodes-arasul-documents/node_modules

# Set ownership
RUN chown -R node:node /custom-nodes

# Entrypoint shim — reads /run/secrets/n8n_encryption_key into N8N_ENCRYPTION_KEY.
# n8n upstream does not understand the *_FILE convention this repo uses, so we resolve
# the secret here. Stays before USER node so chmod takes effect.
COPY --chown=root:root --chmod=0755 entrypoint.sh /usr/local/bin/arasul-n8n-entrypoint.sh

USER node

# n8n will automatically load nodes from N8N_CUSTOM_EXTENSIONS
ENV N8N_CUSTOM_EXTENSIONS=/custom-nodes

ENTRYPOINT ["/usr/local/bin/arasul-n8n-entrypoint.sh"]
CMD []
