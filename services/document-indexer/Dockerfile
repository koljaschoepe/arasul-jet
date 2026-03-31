ARG PYTHON_VERSION=3.11.12
FROM python:${PYTHON_VERSION}-slim

WORKDIR /app

# Install system dependencies for document processing
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    libmagic1 \
    libpq-dev \
    gcc \
    libmupdf-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY services/document-indexer/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy German model for Knowledge Graph NER
RUN python -m spacy download de_core_news_lg || \
    python -m spacy download de_core_news_sm || \
    echo "WARNING: No spaCy German model available - entity extraction disabled"

# Create non-root user
RUN useradd -m -u 1000 -s /bin/bash indexer

# Copy shared logging module
COPY services/shared-python/structured_logging.py ./

# Copy application code
COPY services/document-indexer/*.py ./

# Create directories for BM25 index persistence
RUN mkdir -p /data/bm25_index && \
    chown -R indexer:indexer /app /data

# Expose API port
EXPOSE 9102

USER indexer

# Health check via API
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:9102/health || exit 1

# Run the API server (which starts the indexer in background)
CMD ["python3", "-u", "api_server.py"]
