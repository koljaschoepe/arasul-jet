ARG PYTHON_VERSION=3.11.12
FROM python:${PYTHON_VERSION}-slim

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

# Create non-root user with docker group access
# docker group already exists from docker.io package; host GID mapped via group_add in compose
RUN useradd -m -u 1000 -s /bin/bash -G docker arasul

# Configure passwordless sudo for reboot command (arasul user)
# Security notes:
# 1. Reboot is DISABLED by default (SELF_HEALING_REBOOT_ENABLED=false)
# 2. When enabled, max 2 reboots/hour limit prevents reboot loops
# 3. Pre-reboot state saved to database for validation
# 4. no-new-privileges disabled for this service (sudo requires setuid)
RUN echo 'arasul ALL=(ALL) NOPASSWD: /sbin/reboot' > /etc/sudoers.d/arasul-reboot && \
    chmod 0440 /etc/sudoers.d/arasul-reboot

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create logs directory and set ownership
RUN mkdir -p /arasul/logs && \
    chown -R arasul:arasul /app /arasul/logs

# Make start script executable
RUN chmod +x start.sh

USER arasul

# Start both healing engine and USB monitor
CMD ["./start.sh"]
