FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    docker.io \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir flask flask-cors

# Create app directory
WORKDIR /app

# Copy server script
COPY server.py /app/

# Create non-root user with docker access
RUN useradd -m -u 1000 appuser && \
    groupadd -g 994 docker-host && \
    usermod -aG docker-host appuser

# Expose port
EXPOSE 3100

# Run as non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:3100/health || exit 1

CMD ["python", "-u", "server.py"]
