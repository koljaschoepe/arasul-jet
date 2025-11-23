FROM python:3.11-slim

LABEL maintainer="Arasul Platform"
LABEL description="Self-Healing Engine - Autonomous service recovery"
LABEL org.opencontainers.image.architecture="arm64"

# Install system dependencies
# Note: NVIDIA utilities are available via host system and NVIDIA Container Runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    docker.io \
    sudo \
    procps \
    findutils \
    udev \
    util-linux \
    gcc \
    python3-dev \
    && rm -rf /var/lib/apt/lists/*

# Configure passwordless sudo for reboot command
# Security note: Container runs in privileged mode with docker socket access
RUN echo 'root ALL=(ALL) NOPASSWD: /sbin/reboot' > /etc/sudoers.d/arasul-reboot && \
    chmod 0440 /etc/sudoers.d/arasul-reboot

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p /arasul/logs

# Run as root (required for Docker socket access)
# In production, consider using Docker socket proxy for better security

# Make start script executable
RUN chmod +x start.sh

# Start both healing engine and USB monitor
CMD ["./start.sh"]
