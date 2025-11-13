# Arasul Platform - LLM Service Dockerfile
# Flexible Model Management via Dashboard
# No pre-loaded models - download at runtime

FROM ollama/ollama:latest

# Install Python and dependencies for Management API
RUN apt-get update && \
    apt-get install -y \
    python3 \
    python3-pip \
    curl \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages for Management API Server
RUN pip3 install --no-cache-dir \
    flask==3.0.0 \
    flask-cors==4.0.0 \
    requests==2.31.0 \
    psutil==5.9.6

# Copy Management API Server (for Model Download/Delete/List)
COPY api_server.py /app/api_server.py
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Expose Ollama Port (for n8n) + Management API Port (for Dashboard)
EXPOSE 11434
EXPOSE 11435

# Models will be stored in persistent volume (see docker-compose.yml)
VOLUME ["/root/.ollama"]

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:11435/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
