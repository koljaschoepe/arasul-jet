# Multi-stage Dockerfile for n8n with custom Arasul nodes
#
# Pinned to 2.29.10 — current stable of the 2.x security-hardening line
# (Plan 001-workspace-cursor-feinschliff, Schritt 9). 2.x brings:
#   - Execute-Command-Node default-disabled (we additionally NODES_EXCLUDE it)
#   - Code nodes run in external task runners (sidecar n8n-runners, see
#     compose/compose.app.yaml — the n8nio/runners tag MUST match this pin)
#   - SSRF protection (≥2.12), env-access blocking, file-access whitelist
#   - Pyodide removed (CVE-2025-68668 N8scape moot); Python runs in the runner
#
# UPGRADE-HINWEIS: die 2.x-Engine migriert das n8n-DB-Schema beim ersten
# Start irreversibel. Vor dem ersten Start: Backup von n8n-Volume + DB
# (docs/integrations/N8N_AGENTS.md §Upgrade). Rollback = Pin zurückdrehen
# UND Volume-/DB-Restore.
#
# Patch cadence: aim for monthly rebuilds. n8n averaged ~1 critical CVE/month
# through Q1 2026. When bumping: bump n8nio/runners in compose.app.yaml too.
ARG N8N_VERSION=2.29.10

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

# Agent-Workspace: mount point for the shared n8n-agent-workspace volume
# (compose.app.yaml). Creating it here with node ownership makes Docker's
# named-volume initialization copy that ownership, so both n8n (user node,
# uid 1000) and the n8n-runners sidecar (user runner, uid 1000) can write.
RUN mkdir -p /data/agent-workspace && chown node:node /data/agent-workspace

# Entrypoint shim — reads /run/secrets/n8n_encryption_key into N8N_ENCRYPTION_KEY.
# n8n upstream does not understand the *_FILE convention this repo uses, so we resolve
# the secret here. Stays before USER node so chmod takes effect.
COPY --chown=root:root --chmod=0755 entrypoint.sh /usr/local/bin/arasul-n8n-entrypoint.sh

USER node

# n8n will automatically load nodes from N8N_CUSTOM_EXTENSIONS
ENV N8N_CUSTOM_EXTENSIONS=/custom-nodes

ENTRYPOINT ["/usr/local/bin/arasul-n8n-entrypoint.sh"]
CMD []
