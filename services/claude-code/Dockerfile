FROM node:20-slim

# System dependencies for Claude Code
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    build-essential \
    ca-certificates \
    sudo \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Install Docker CLI (for interacting with host Docker)
RUN curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
    echo "deb [arch=arm64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && \
    apt-get install -y docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# Install ttyd for web terminal (ARM64 version for Jetson)
RUN wget -O /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.aarch64 \
    && chmod +x /usr/local/bin/ttyd

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Reuse existing 'node' user (UID 1000) from base image - matches host user arasul
# Rename to 'claude' for clarity and move home directory
# Add docker group with host GID (994) for Docker socket access
RUN usermod -l claude -d /home/claude -m node && \
    echo "claude ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers && \
    groupadd -g 994 docker && \
    usermod -aG docker claude

# Create workspace directories with correct ownership
RUN mkdir -p /workspace/arasul /workspace/custom /home/claude/.claude && \
    chown -R claude:node /workspace /home/claude

# Working directory
WORKDIR /workspace

# Entrypoint script (must be readable for shell scripts to work)
COPY --chmod=755 entrypoint.sh /entrypoint.sh

# Switch to non-root user
USER claude

# Expose ttyd port
EXPOSE 7681

# Health check (ttyd runs with --base-path /claude-terminal)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:7681/claude-terminal/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]
