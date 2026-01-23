# Arasul Platform - LLM Service Dockerfile
# Flexible Model Management via Dashboard
# No pre-loaded models - download at runtime

# PHASE1-FIX: Pin to specific version for reproducible builds
# Update OLLAMA_VERSION when upgrading (check: https://hub.docker.com/r/ollama/ollama/tags)
ARG OLLAMA_VERSION=0.4.7
FROM ollama/ollama:${OLLAMA_VERSION}

# Install Python and dependencies for Management API
RUN apt-get update && \
    apt-get install -y \
    python3 \
    python3-pip \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages for Management API Server
# PHASE1-FIX: Removed --break-system-packages as older pip versions don't support it
# The flag is not needed for older pip anyway (they don't have the restriction)
RUN pip3 install --no-cache-dir \
    flask==3.0.0 \
    flask-cors==4.0.0 \
    requests==2.31.0 \
    psutil==5.9.6

# Copy Management API Server (for Model Download/Delete/List)
COPY api_server.py /app/api_server.py
COPY entrypoint.sh /app/entrypoint.sh
COPY healthcheck.sh /healthcheck.sh
RUN chmod +x /app/entrypoint.sh /healthcheck.sh

# Expose Ollama Port (for LLM inference) + Management API Port (for Dashboard)
EXPOSE 11434
EXPOSE 11436

# Models will be stored in persistent volume (see docker-compose.yml)
VOLUME ["/root/.ollama"]

# Health check
# CRITICAL-FIX: Increased start-period from 60s to 300s to prevent container restart loops
# on heavy GPU loads where Ollama + model loading can exceed 60s
HEALTHCHECK --interval=30s --timeout=5s --start-period=300s --retries=3 \
    CMD curl -f http://localhost:11436/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
