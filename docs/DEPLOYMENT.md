# Deployment & Installation

Complete guide for deploying the Arasul Platform on NVIDIA Jetson AGX Orin.

---

## 1. Hardware Requirements

### Required Hardware

- **NVIDIA Jetson AGX Orin Developer Kit**
  - 12-Core ARM Cortex-A78AE CPU
  - 64 GB DDR5 RAM (32GB minimum)
  - 2048-Core NVIDIA Ampere GPU

- **NVMe SSD** - M.2 2280, minimum 256GB (512GB recommended)

- **Power Supply** - Original NVIDIA Jetson Power Adapter (19V DC, 90W+)

- **Network** - Ethernet connection (Gigabit recommended)

- **Display** (only for initial setup) - HDMI Monitor + USB Keyboard/Mouse

### Minimum vs Recommended Specs

| Component | Minimum     | Recommended | Production         |
| --------- | ----------- | ----------- | ------------------ |
| RAM       | 32GB        | 64GB        | 64GB               |
| Storage   | 256GB NVMe  | 512GB NVMe  | 1TB NVMe           |
| Network   | 100 Mbps    | 1 Gbps      | 1 Gbps + Backup    |
| Power     | 90W Adapter | 90W + UPS   | Redundant UPS      |
| Cooling   | Passive     | Active Fan  | Industrial Cooling |

---

## 2. Software Prerequisites

- **JetPack 6.0+** (Ubuntu 22.04 based)
- **Docker Engine** 24.0+
- **Docker Compose** 2.20+
- **NVIDIA Container Runtime**

### Verify JetPack

```bash
jetson_release
# Should show: JetPack 6.x
```

### Install Docker (if needed)

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker
```

### Install NVIDIA Container Runtime

```bash
docker run --rm --gpus all nvidia/cuda:11.8.0-base-ubuntu22.04 nvidia-smi
# If this fails, install nvidia-docker2:
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
    sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt update && sudo apt install -y nvidia-docker2
sudo systemctl restart docker
```

### Install Docker Compose

```bash
sudo apt install docker-compose-plugin
docker compose version
```

---

## 3. Installation Steps

### 3.1 Get the Repository

```bash
cd ~
git clone <repository-url> arasul-platform
cd arasul-platform
```

Or transfer via USB/SCP:

```bash
scp -r arasul-platform/ jetson@<jetson-ip>:~/
```

### 3.2 Bootstrap

```bash
sudo chmod +x arasul
./arasul bootstrap
```

This will:

1. Check all prerequisites
2. Create necessary directories
3. Generate `.env` with secure passwords
4. Build Docker images (~5 min)
5. Initialize the database
6. Start all services in correct order
7. Run smoke tests

**Duration**: 15-30 minutes (depending on internet speed)

### 3.3 Verify Bootstrap

After successful bootstrap you should see:

```
[SUCCESS] Arasul Platform bootstrap completed!

Dashboard URL: http://localhost
n8n URL: http://localhost/n8n
MinIO Console: http://localhost:9001
```

**Important**: Note the generated admin password!

### 3.4 Verify Services

```bash
./arasul status
# All services should show "Up (healthy)"
```

### 3.5 Test API

```bash
curl http://localhost/api/health
curl http://localhost/api/system/status
```

---

## 4. Configuration

### Environment Variables

Edit `.env` as needed:

```bash
# LLM Configuration
LLM_MODEL=qwen3:14b-q8
LLM_MAX_TOKENS=2048
LLM_MAX_RAM_GB=40

# Resource Limits
CPU_LIMIT_LLM=50
RAM_LIMIT_LLM=32G

# Disk Thresholds
DISK_WARNING_PERCENT=80
DISK_CLEANUP_PERCENT=90
DISK_CRITICAL_PERCENT=95
```

After changes: `./arasul restart`

Full reference: [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md)

### Post-Deployment Setup

1. **Change admin password** - Dashboard > Settings > Security
2. **Configure n8n** - `http://<jetson-ip>/n8n` (credentials from `.env`)
3. **Load LLM models** (if not auto-loaded):
   ```bash
   docker compose exec llm-service ollama pull qwen3:14b-q8
   ```

---

## 5. Pre-Shipping Checklist

> Automated check: `./scripts/deploy/verify-deployment.sh`

### Hardware

- [ ] Jetson AGX Orin with power adapter
- [ ] Ethernet cable
- [ ] Serial number noted

### OS & Software

- [ ] JetPack 6.x installed
- [ ] NVIDIA Container Runtime configured
- [ ] Docker Compose V2 installed
- [ ] Hostname set (`hostnamectl set-hostname arasul-<customer>`)

### Configuration

- [ ] `scripts/setup/preconfigure.sh` executed
- [ ] `.env` generated with secure credentials (`chmod 600 .env`)
- [ ] Admin password noted
- [ ] `scripts/validate/validate_config.sh` passes

### Security

- [ ] SSH hardening: `scripts/security/harden-ssh.sh` (key-only auth, port 2222, no root)
- [ ] Firewall: `scripts/security/setup-firewall.sh` (UFW, ports 80/443/2222 only)
- [ ] Service user: `scripts/setup/setup-service-user.sh`
- [ ] TLS certificate in `config/tls/`
- [ ] Security scan: `scripts/security/security-scan.sh` (no Critical)

### Services

- [ ] All 15+ services running: `docker compose ps`
- [ ] All health checks green
- [ ] At least one Ollama model loaded
- [ ] Embedding service reachable, Qdrant running

### Backup & Update

- [ ] Backup directory `data/backups/` exists
- [ ] Test backup created and verified
- [ ] Update keys in `config/update-keys/`

### Tests

- [ ] Backend tests: `./scripts/test/run-tests.sh --backend`
- [ ] Integration tests: `./scripts/test/integration-test.sh`
- [ ] `./scripts/deploy/verify-deployment.sh` passes

### Final

- [ ] System rebooted and auto-started
- [ ] Frontend reachable after reboot
- [ ] All services healthy after reboot

---

## 6. Troubleshooting

### Bootstrap fails

```bash
./arasul logs                          # Check all logs
docker compose up -d postgres-db       # Start individually
docker compose logs postgres-db        # Check specific service
```

### LLM Service won't start

```bash
nvidia-smi                             # Check GPU
# Reduce RAM in .env: RAM_LIMIT_LLM=24G
docker compose restart llm-service
```

### Dashboard not loading

```bash
docker compose logs reverse-proxy      # Check proxy
curl http://localhost/api/health        # Check backend
sudo netstat -tulpn | grep :80         # Check ports
```

### Disk full

```bash
docker system prune -af                # Docker cleanup
docker compose exec postgres-db psql -U arasul -d arasul_db \
    -c "SELECT cleanup_old_metrics();"
```

### Complete restart

```bash
./arasul stop && ./arasul start
# Or: sudo reboot
```

---

## 7. Production Hardening

### Firewall

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp
sudo ufw enable
```

### Auto-Start on Boot

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

### Backup Strategy

```bash
# Database backup
docker compose exec postgres-db pg_dump -U arasul arasul_db > backup_$(date +%Y%m%d).sql

# Configuration backup
tar czf config_backup_$(date +%Y%m%d).tar.gz .env config/
```

---

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - System architecture
- [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md) - All configuration variables
- [JETSON_COMPATIBILITY.md](JETSON_COMPATIBILITY.md) - Multi-device support
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Detailed troubleshooting
