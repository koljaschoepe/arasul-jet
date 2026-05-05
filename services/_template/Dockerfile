# Template Dockerfile for a new Arasul service (Python + Flask).
# Copy this folder to services/<your-service-name>/ and customize.
# Replace TODO markers and update the README.

ARG PYTHON_VERSION=3.11.12
FROM python:${PYTHON_VERSION}-slim

# System deps. Add only what your service actually needs at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps separately so layer cache survives source changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source after deps so editing source doesn't bust the deps layer.
COPY . .

# Healthcheck — wire to a real /healthz endpoint in your service.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:8080/healthz || exit 1

EXPOSE 8080

ENTRYPOINT ["python", "-u", "server.py"]
