# Arasul Platform - LLM Service Dockerfile
# JetPack 6 GPU-Accelerated Ollama with Management API
#
# CRITICAL FIX: Multi-stage build using Ubuntu 22.04 (GLIBC 2.35)
# The official ollama/ollama image uses Ubuntu 20.04 (GLIBC 2.31),
# but JetPack 6 Tegra libraries require GLIBC 2.34+.
# Without this fix, Ollama falls back to CPU-only inference.

# Stage 1: Extract Ollama binary and CUDA runners from official image
ARG OLLAMA_VERSION=0.9.0
FROM ollama/ollama:${OLLAMA_VERSION} AS ollama-source

# Stage 2: JetPack 6 compatible runtime (GLIBC 2.35)
FROM ubuntu:22.04

# Copy Ollama binary
COPY --from=ollama-source /bin/ollama /bin/ollama

# Copy ALL Ollama runner backends (CPU + CUDA variants)
COPY --from=ollama-source /usr/lib/ollama /usr/lib/ollama

# Install Python, build tools, and dependencies for Management API
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    gcc \
    curl \
    jq \
    && pip3 install --no-cache-dir \
    flask==3.0.0 \
    flask-cors==4.0.0 \
    requests==2.31.0 \
    psutil==5.9.6 \
    && apt-get purge -y gcc python3-dev \
    && apt-get autoremove -y \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for running Ollama and Management API
RUN useradd -m -u 1000 -s /bin/bash ollama

# Copy shared logging module
COPY services/shared-python/structured_logging.py /app/structured_logging.py

# Copy Management API Server (for Model Download/Delete/List)
COPY services/llm-service/api_server.py /app/api_server.py
COPY services/llm-service/entrypoint.sh /app/entrypoint.sh
COPY services/llm-service/healthcheck.sh /healthcheck.sh
RUN chmod +x /app/entrypoint.sh /healthcheck.sh

# Expose Ollama Port (for LLM inference) + Management API Port (for Dashboard)
EXPOSE 11434
EXPOSE 11436

# Models stored in ollama home dir (persistent volume via compose)
RUN mkdir -p /home/ollama/.ollama && \
    chown -R ollama:ollama /app /home/ollama/.ollama
VOLUME ["/home/ollama/.ollama"]

USER ollama

# Health check
# CRITICAL-FIX: Increased start-period from 60s to 300s to prevent container restart loops
# on heavy GPU loads where Ollama + model loading can exceed 60s
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
    CMD curl -f http://localhost:11436/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
