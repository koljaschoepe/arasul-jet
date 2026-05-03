# Deployment Guide

Complete guide for deploying the Arasul Platform to a NVIDIA Jetson device.

> **Are you a developer?** Read [`docs/development/ONBOARDING.md`](../development/ONBOARDING.md) instead.
> **Are you an end-customer with a pre-configured device?** See [`docs/ops/QUICK_START.md`](QUICK_START.md) (German).

---

## 1. Hardware Requirements

### Supported Devices

| Device                | RAM    | Default LLM     | Status          |
| --------------------- | ------ | --------------- | --------------- |
| Jetson Thor 128 GB    | 128 GB | `gemma4:31b-q4` | Fully supported |
| Jetson Thor 64 GB     | 64 GB  | `gemma4:31b-q4` | Fully supported |
| Jetson AGX Orin 64 GB | 64 GB  | `gemma4:26b-q4` | Fully supported |
| Jetson AGX Orin 32 GB | 32 GB  | `gemma4:e4b-q4` | Fully supported |

### Minimum vs. Recommended Specs

| Component | Minimum     | Recommended | Production         |
| --------- | ----------- | ----------- | ------------------ |
| RAM       | 32 GB       | 64 GB       | 64 GB              |
| Storage   | 256 GB NVMe | 512 GB NVMe | 1 TB NVMe          |
| Network   | 100 Mbps    | 1 Gbps      | 1 Gbps + redundant |
| Power     | 90 W PSU    | 90 W + UPS  | Redundant UPS      |
| Cooling   | Passive     | Active fan  | Industrial cooling |

### Other essentials

- **Power supply** — original NVIDIA Jetson adapter (19 V DC, 90 W+).
- **Network** — Ethernet (1 GbE recommended).
- **Display + USB keyboard** — only for initial setup; the device runs headless afterwards.

---

## 2. Software Prerequisites

| Component                | Min version | How to verify                    |
| ------------------------ | ----------- | -------------------------------- |
| JetPack                  | 6.0+        | `dpkg -l \| grep nvidia-jetpack` |
| Docker                   | 24.0+       | `docker --version`               |
| Docker Compose           | V2          | `docker compose version`         |
| NVIDIA Container Runtime | n/a         | `docker info \| grep nvidia`     |
| Git                      | 2.x         | `git --version`                  |

### Installing JetPack

JetPack is installed onto the Jetson from a host PC using the [NVIDIA SDK Manager](https://developer.nvidia.com/sdk-manager). It bundles CUDA, cuDNN, TensorRT, and Docker with the NVIDIA Container Runtime.

### Installing Docker (if missing)

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker     # apply group membership without re-login
```

### Installing the NVIDIA Container Runtime (if missing)

```bash
distribution=$(. /etc/os-release; echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

Verify with:

```bash
docker run --rm --gpus all nvidia/cuda:12.6.0-base-ubuntu22.04 nvidia-smi
```

---

## 3. Installation

There are three installation methods. Pick the one that matches your scenario.

### Method A — Interactive setup (recommended for single devices)

Requires internet access on the device.

```bash
git clone <repository-url> ~/arasul-platform
cd ~/arasul-platform
./scripts/interactive_setup.sh
./arasul bootstrap
```

The interactive setup runs five steps:

1. **Hardware detection** — auto-identifies Jetson model, RAM, CPU cores, CUDA architecture, and selects the correct profile (e.g., `agx_orin_64gb`, `thor_128gb`).
2. **Admin account** — username, password (≥ 12 chars, mixed case + digit), email.
3. **Network** — hostname (default `arasul`, reachable as `arasul.local` via mDNS).
4. **AI model** — pick from device-specific recommendations.
5. **Confirmation** — summary and confirmation.

Output: a `.env` file with all configuration values and auto-generated secrets.

`./arasul bootstrap` then runs 15 stages (hardware validation → directory layout → secrets → TLS → image pull / build → DB init → service startup → smoke tests). Total wall time: **15–30 minutes** depending on internet speed.

After successful bootstrap the plaintext admin password is automatically removed from `.env`.

### Method B — Factory image (offline, mass deployment)

Best for offline installation or fleet rollout. Requires no internet on the target device.

#### On a source device (working Arasul installation)

```bash
# Without bundled AI models (smaller archive, internet needed at first start)
./scripts/deploy/create-factory-image.sh

# With bundled AI models (larger archive, ready to run immediately)
./scripts/deploy/create-factory-image.sh --include-models

# All options
./scripts/deploy/create-factory-image.sh \
  --output=/path/to/output-dir \
  --version=1.0.0 \
  --include-models
```

The script builds all images, exports them to `images.tar.gz`, copies the project source (excluding `.git`, `node_modules`, data, secrets), embeds `factory-install.sh`, optionally exports Ollama models, generates a manifest with checksums, and packs everything into `arasul-factory-<version>.tar.gz`.

#### Transfer to target device

```bash
cp deployment/arasul-factory-*.tar.gz /media/usb-stick/
# Move USB to target device
```

#### On the target device

```bash
tar xzf arasul-factory-*.tar.gz
cd arasul-factory-*/
./factory-install.sh
```

The factory installer runs five steps: load Docker images from `images.tar.gz` → restore AI models (if bundled) → prepare project → run interactive setup for admin / hostname / model → bootstrap services. Wall time: **5–10 minutes**, no internet needed.

For unattended fleet provisioning, combine with non-interactive mode:

```bash
ADMIN_PASSWORD='YourSecurePass1' ./factory-install.sh --non-interactive
```

### Method C — Non-interactive (CI/CD, automated rollouts)

Skip all prompts, run end-to-end:

```bash
cd ~/arasul-platform

# Mandatory: set ADMIN_PASSWORD
ADMIN_PASSWORD='YourSecurePass1' \
  ./scripts/interactive_setup.sh --non-interactive

./arasul bootstrap
```

#### Optional environment overrides

| Variable         | Default              | Purpose                                    |
| ---------------- | -------------------- | ------------------------------------------ |
| `ADMIN_PASSWORD` | **(required)**       | Admin password (≥ 8 chars, A-Z, a-z, 0-9). |
| `ADMIN_USERNAME` | `admin`              | Admin login name.                          |
| `ADMIN_EMAIL`    | `admin@arasul.local` | Admin email.                               |
| `LLM_MODEL`      | _(auto-detected)_    | Override the device-recommended model.     |
| `HOSTNAME`       | `arasul`             | mDNS hostname.                             |

#### Bootstrap flags

```bash
./arasul bootstrap --skip-pull     # skip docker pull (offline)
./arasul bootstrap --skip-build    # use pre-built images
./arasul bootstrap --force-setup   # re-run setup even if .env exists
```

---

## 4. Verification

After bootstrap completes, you should see:

```
[SUCCESS] Arasul Platform bootstrap completed!

Dashboard URL: https://arasul.local
n8n URL:       https://arasul.local/n8n
MinIO Console: http://localhost:9001
```

Run health checks:

```bash
./arasul status                                              # all services Up (healthy)
curl -k https://arasul.local/api/health
docker compose exec -T postgres-db pg_isready -U arasul
docker compose exec -T llm-service curl -s http://localhost:11434/api/tags
docker compose exec -T embedding-service curl -s http://localhost:11435/health
```

> Self-signed TLS certificates produce a browser warning on first access — expected. Click through.

If a model is not yet pulled (skipped during bootstrap):

```bash
docker exec llm-service ollama pull "$(grep ^LLM_MODEL .env | cut -d= -f2)"

# See device-recommended models
./scripts/setup/detect-jetson.sh recommend
```

---

## 5. Post-Install Configuration

### Change admin password

In the dashboard: **Settings → Security → Change password**.

### Tune LLM resources in `.env`

```bash
LLM_MODEL=gemma4:26b-q4
LLM_MAX_TOKENS=2048
LLM_MAX_RAM_GB=40

CPU_LIMIT_LLM=50
RAM_LIMIT_LLM=32G

DISK_WARNING_PERCENT=80
DISK_CLEANUP_PERCENT=90
DISK_CRITICAL_PERCENT=95
```

Apply changes: `./arasul restart`. Full reference: [`ENVIRONMENT_VARIABLES.md`](../ENVIRONMENT_VARIABLES.md).

### Configure n8n

Browse to `https://<host>/n8n` and log in with the credentials in `.env`.

### Day-to-day commands

```bash
./arasul status     # service overview
./arasul logs       # tail all logs
./arasul stop       # stop all services
./arasul start      # start all services
./arasul restart    # restart all services
```

---

## 6. Pre-Shipping Checklist (operator hand-off)

> Run the automated check first: `./scripts/deploy/verify-deployment.sh`.

### Hardware

- [ ] Jetson AGX Orin or Thor with power adapter present.
- [ ] Ethernet cable connected.
- [ ] Serial number recorded.

### OS & software

- [ ] JetPack 6.x installed.
- [ ] NVIDIA Container Runtime configured.
- [ ] Docker Compose V2 installed.
- [ ] Hostname set: `hostnamectl set-hostname arasul-<customer>`.

### Configuration

- [ ] `scripts/setup/preconfigure.sh` executed.
- [ ] `.env` generated with secure credentials (`chmod 600 .env`).
- [ ] Admin password recorded out-of-band.
- [ ] `scripts/validate/validate_config.sh` passes.

### Security

- [ ] SSH hardening: `scripts/security/harden-ssh.sh` (key-only, port 2222, no root).
- [ ] Firewall: `scripts/security/setup-firewall.sh` (UFW; ports 80/443/2222 only).
- [ ] Service user: `scripts/setup/setup-service-user.sh`.
- [ ] TLS certificate present in `config/tls/`.
- [ ] Security scan: `scripts/security/security-scan.sh` (no Critical findings).

### Services

- [ ] All 15+ services running: `docker compose ps`.
- [ ] All health checks green.
- [ ] At least one Ollama model loaded.
- [ ] Embedding service reachable; Qdrant running.

### Backup & update

- [ ] `data/backups/` directory exists.
- [ ] Test backup created and verified.
- [ ] Update keys present in `config/update-keys/`.

### Tests

- [ ] Backend tests: `./scripts/test/run-tests.sh --backend`.
- [ ] Integration tests: `./scripts/test/integration-test.sh`.
- [ ] `./scripts/deploy/verify-deployment.sh` passes.

### Final

- [ ] System rebooted and auto-started.
- [ ] Frontend reachable after reboot.
- [ ] All services healthy after reboot.

---

## 7. Production Hardening

### Firewall

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp        # or 2222 if you ran harden-ssh.sh
sudo ufw enable
```

### Auto-start on boot (systemd)

```ini
# /etc/systemd/system/arasul.service
[Unit]
Description=Arasul Platform
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/<username>/arasul-platform
ExecStart=/home/<username>/arasul-platform/arasul start
ExecStop=/home/<username>/arasul-platform/arasul stop
User=<username>

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable arasul
```

### Backup strategy

```bash
# Database snapshot
docker compose exec postgres-db pg_dump -U arasul arasul_db > backup_$(date +%Y%m%d).sql

# Configuration snapshot
tar czf config_backup_$(date +%Y%m%d).tar.gz .env config/
```

For the full backup system (scheduled, encrypted, off-device): [`BACKUP_SYSTEM.md`](BACKUP_SYSTEM.md) and [`DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md).

---

## 8. Troubleshooting

### Bootstrap fails

```bash
./arasul logs                         # check all logs
docker compose up -d postgres-db      # start individually
docker compose logs postgres-db       # check the failing service
cat /tmp/arasul_bootstrap_errors.json # detailed error report (timestamps, phase, system info, suggestions)
```

### Docker not found

JetPack normally installs Docker. If missing:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

### NVIDIA Container Runtime missing

See "Installing the NVIDIA Container Runtime" in §2.

### GPU not detected

```bash
nvidia-smi                  # must show GPU info
cat /etc/nv_tegra_release   # Jetson-specific version
```

If `nvidia-smi` returns nothing, re-flash JetPack via SDK Manager.

### LLM service won't start

```bash
nvidia-smi
docker compose logs llm-service

# Reduce RAM limit in .env, then restart:
#   RAM_LIMIT_LLM=24G
docker compose restart llm-service

# Adjust startup timeout for slow models
#   Thor:        OLLAMA_STARTUP_TIMEOUT=240
#   Orin 64 GB:  OLLAMA_STARTUP_TIMEOUT=180
#   Default:     OLLAMA_STARTUP_TIMEOUT=120

docker exec llm-service ollama pull mistral:7b   # manual model pull
```

### Dashboard not loading

```bash
docker compose logs reverse-proxy           # Traefik logs
curl -k https://arasul.local/api/health     # backend reachable?
curl http://localhost:3001/api/health       # backend direct
docker compose logs dashboard-frontend
sudo netstat -tulpn | grep -E ':80|:443'    # port conflict?
```

### Hardware not detected

If `detect-jetson.sh` cannot identify the device, check the 5-stage detection manually:

```bash
cat /proc/device-tree/model
cat /proc/device-tree/compatible
cat /sys/module/tegra_fuse/parameters/tegra_chip_id
nvidia-smi --query-gpu=name --format=csv,noheader
grep MemTotal /proc/meminfo
```

If none of these resolve, a generic profile is used.

### Insufficient disk space

```bash
df -h
docker system prune -a
sudo journalctl --vacuum-size=500M
docker compose exec postgres-db psql -U arasul -d arasul_db \
  -c "SELECT cleanup_old_metrics();"
```

### Setup aborted with Ctrl-C

Partially-written files are auto-cleaned. An existing `.env` is restored from backup. Re-run:

```bash
./scripts/interactive_setup.sh
```

### Complete restart

```bash
./arasul stop && ./arasul start
# Or, full reboot:
sudo reboot
```

---

## 9. Related Documentation

| Topic                         | Document                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------ |
| Architecture & services       | [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)                                   |
| All environment variables     | [`docs/ENVIRONMENT_VARIABLES.md`](../ENVIRONMENT_VARIABLES.md)                 |
| Backup system                 | [`docs/ops/BACKUP_SYSTEM.md`](BACKUP_SYSTEM.md)                                |
| Disaster recovery             | [`docs/ops/DISASTER_RECOVERY.md`](DISASTER_RECOVERY.md)                        |
| Detailed troubleshooting      | [`docs/ops/TROUBLESHOOTING.md`](TROUBLESHOOTING.md)                            |
| Multi-device support          | [`docs/features/JETSON_COMPATIBILITY.md`](../features/JETSON_COMPATIBILITY.md) |
| Admin handbook (German)       | [`docs/ops/ADMIN_HANDBUCH.md`](ADMIN_HANDBUCH.md)                              |
| Customer quick start (German) | [`docs/ops/QUICK_START.md`](QUICK_START.md)                                    |
