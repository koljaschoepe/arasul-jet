FROM python:3.11-slim

LABEL maintainer="Arasul Platform"
LABEL description="Embedding Service - Text vectorization with GPU support"

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create models directory
RUN mkdir -p /models

# Download default model (placeholder - would be done at runtime or via volume)
# RUN python download_model.py

# Expose service port
EXPOSE 11435

# Health check
HEALTHCHECK --interval=15s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:11435/health || exit 1

# Start the embedding service
CMD ["python", "-u", "embedding_server.py"]
