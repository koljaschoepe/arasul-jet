FROM node:20-slim

# System dependencies for Claude Code
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install ttyd for web terminal (ARM64 version for Jetson)
RUN wget -O /usr/local/bin/ttyd \
    https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.aarch64 \
    && chmod +x /usr/local/bin/ttyd

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create workspace directories
RUN mkdir -p /workspace/arasul /workspace/custom /root/.claude

# Working directory
WORKDIR /workspace

# Entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose ttyd port
EXPOSE 7681

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD curl -f http://localhost:7681/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]
