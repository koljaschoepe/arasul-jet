# Node.js 22 (LTS, wie Plattform-Standard in .nvmrc) — offizielle node-Images
# sind multi-arch (arm64 für Jetson inklusive), kein Nodesource nötig.
ARG NODE_VERSION=22
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

# Docker-CLI (nur Client, kein Daemon) für den Infrastruktur-Modus: dort
# mountet das Backend /var/run/docker.sock in den Container (GroupAdd auf die
# Socket-GID, keine zusätzlichen Caps). Offizielles Docker-apt-Repo,
# arch-aware (arm64/amd64).
RUN install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && \
    chmod a+r /etc/apt/keyrings/docker.asc && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
      > /etc/apt/sources.list.d/docker.list && \
    apt-get update && apt-get install -y --no-install-recommends docker-ce-cli && \
    rm -rf /var/lib/apt/lists/*

# Hinweis: Claude Code wird NICHT mehr als root vorinstalliert — die
# KI-CLIs (claude/codex/gemini) installieren sich beim Erststart über ihre
# Wrapper in den User-npm-Prefix ~/.npm-global (kein sudo nötig).

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

# KI-CLI-Wrapper (Erststart: npm install -g in ~/.npm-global, dann exec)
COPY --chmod=755 claude.sh /usr/local/bin/claude
COPY --chmod=755 codex.sh /usr/local/bin/codex
COPY --chmod=755 gemini.sh /usr/local/bin/gemini

# Slash-Funktionen (/claude, /codex, /gemini, /open-ara) + npm-Prefix/PATH.
# profile.d greift bei Login-Shells (tmux startet Login-Shells); zusätzlich
# aus /etc/bash.bashrc sourcen, damit auch der Non-Login-Fallback sie hat.
COPY --chmod=644 arasul-slash.sh /etc/profile.d/arasul-slash.sh
RUN printf '\n# Arasul: Slash-Funktionen + npm-Prefix auch für Non-Login-Shells\n[ -f /etc/profile.d/arasul-slash.sh ] && . /etc/profile.d/arasul-slash.sh\n' \
      >> /etc/bash.bashrc

# bash als Standard-Shell für tmux/exec-Sessions (Slash-Funktionen sind eine
# Bash-Erweiterung); npm-Prefix + PATH auch auf Image-Ebene, damit docker exec
# ohne Profil-Sourcing dieselben Binaries findet.
ENV SHELL=/bin/bash \
    NPM_CONFIG_PREFIX=/home/sandbox/.npm-global \
    PATH=/home/sandbox/.npm-global/bin:/home/sandbox/.local/bin:$PATH

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

# Create workspace directory + user npm prefix
RUN mkdir -p /workspace && chown sandbox:sandbox /workspace && \
    install -d -o sandbox -g sandbox /home/sandbox/.npm-global

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
