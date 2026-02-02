# Arasul Platform - Telegram Bot Service 2.0
# LLM-powered assistant with voice support

FROM python:3.11-slim

LABEL maintainer="Arasul Platform"
LABEL description="Telegram Bot 2.0 - LLM-powered assistant with voice support"
LABEL org.opencontainers.image.architecture="arm64,amd64"

# Set working directory
WORKDIR /app

# Install system dependencies
# - curl: Health checks
# - ffmpeg: Audio processing for voice messages
# - libpq-dev: PostgreSQL client library
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ffmpeg \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY *.py ./
COPY providers/ ./providers/
COPY session/ ./session/
COPY handlers/ ./handlers/
COPY security/ ./security/
COPY tools/ ./tools/
COPY commands/ ./commands/

# Create non-root user for security
RUN useradd -m -u 1000 botuser && chown -R botuser:botuser /app
USER botuser

# Expose health check port
EXPOSE 8090

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8090/health || exit 1

# Start the bot
CMD ["python3", "-u", "bot.py"]
