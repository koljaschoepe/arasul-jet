FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for document processing
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    libmagic1 \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY *.py ./

# Expose API port
EXPOSE 9102

# Health check via API
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:9102/health || exit 1

# Run the API server (which starts the indexer in background)
CMD ["python3", "-u", "api_server.py"]
