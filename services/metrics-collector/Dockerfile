FROM python:3.11-slim

LABEL maintainer="Arasul Platform"
LABEL description="Metrics Collector - System telemetry collection service"
LABEL org.opencontainers.image.architecture="arm64"

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create cache directory
RUN mkdir -p /cache

# Expose health check port
EXPOSE 9100

# Run as non-root user
RUN useradd -m -u 1000 metrics && chown -R metrics:metrics /app /cache
USER metrics

# Health check
HEALTHCHECK --interval=10s --timeout=1s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:9100/health || exit 1

# Start the metrics collector
CMD ["python", "-u", "collector.py"]
