ARG NODE_VERSION=20.19
FROM node:${NODE_VERSION}-slim

# ============================================================================
# Arasul Sandbox Container
# General-purpose development environment for terminal-based work.
# Users can install additional packages, run Claude Code, Codex, etc.
# Container state is preserved across stops (docker stop/start, not rm).
# ============================================================================

# System dependencies: common dev tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    git \
    curl \
    wget \
    build-essential \
    ca-certificates \
    sudo \
    gnupg \
    lsb-release \
    jq \
    bc \
    vim \
    nano \
    htop \
    less \
    tree \
    tmux \
    unzip \
    zip \
    openssh-client \
    locales \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Set locale to UTF-8
RUN sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && locale-gen
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# Pre-install Claude Code CLI (users can update via npm)
RUN npm install -g @anthropic-ai/claude-code 2>/dev/null || true

# Pre-install Python deps for open-ara (local AI coding agent, Textual TUI).
# Debian bookworm pip is PEP-668-managed → --break-system-packages (same
# mechanism the sudoers whitelist assumes for in-container pip3 usage).
# hatchling: Build-Backend von open-ara — vorinstalliert, damit der Launcher
# mit --no-build-isolation auch offline (Appliance!) installieren kann.
RUN pip3 install --break-system-packages --no-cache-dir \
    'textual[syntax]>=0.80.0' \
    'openai>=1.50.0' \
    'rich>=13.0.0' \
    'hatchling>=1.25.0' \
    'editables>=0.5'

# open-ara launcher: installs the operator-provided sources from
# /opt/tools/open-ara (read-only bind mount) on first use, then execs `arasul`.
COPY --chmod=755 open-ara.sh /usr/local/bin/open-ara

# Reuse existing 'node' user (UID 1000) — matches host user arasul
# Rename to 'sandbox' for clarity.
# Narrow sudoers to a whitelist (package install + GPU diagnostics) instead of
# NOPASSWD:ALL to shrink container-escape blast radius (SEC-02).
RUN usermod -l sandbox -d /home/sandbox -m node && \
    groupmod -n sandbox node && \
    install -d -m 0750 /etc/sudoers.d && \
    printf 'sandbox ALL=(root) NOPASSWD: /usr/bin/apt-get, /usr/bin/apt, /usr/bin/dpkg, /usr/bin/pip3, /usr/bin/npm, /usr/bin/nvidia-smi, /usr/bin/tegrastats\n' \
      > /etc/sudoers.d/sandbox && \
    chmod 0440 /etc/sudoers.d/sandbox && \
    visudo -c -f /etc/sudoers.d/sandbox

# Create workspace directory
RUN mkdir -p /workspace && chown sandbox:sandbox /workspace

# Copy tmux config and entrypoint
COPY tmux.conf /etc/tmux.conf
COPY --chmod=755 entrypoint.sh /entrypoint.sh

# Switch to non-root user
USER sandbox
WORKDIR /workspace

# Git config defaults (user can override)
RUN git config --global init.defaultBranch main && \
    git config --global core.editor nano

# Keep container alive — backend manages lifecycle via docker exec
CMD ["sleep", "infinity"]

ENTRYPOINT ["/entrypoint.sh"]
