# Arasul Update Package Tool

## Overview

The Arasul Update Package Tool creates signed `.araupdate` files for secure, verified system updates. Each package contains:
- **Manifest**: Version metadata, components, checksums
- **Payload**: Docker images, migrations, or configuration files
- **Digital Signature**: RSA-PSS signature for verification

**Status**: ✅ Production Ready

## Quick Start

### 1. Generate RSA Key Pair (One-Time Setup)

```bash
# Create .arasul directory
mkdir -p ~/.arasul

# Generate 4096-bit RSA private key
openssl genrsa -out ~/.arasul/update_private_key.pem 4096

# Extract public key
openssl rsa -in ~/.arasul/update_private_key.pem \
    -pubout -out ~/.arasul/update_public_key.pem

# Secure the private key
chmod 600 ~/.arasul/update_private_key.pem
```

**Important**:
- Keep `update_private_key.pem` **SECURE** and **OFFLINE**
- Deploy `update_public_key.pem` to `/arasul/config/public_update_key.pem` on target systems
- Backup keys securely (encrypted USB stick, password manager vault)

### 2. Create Update Package

```bash
# Syntax
./scripts/create_update_package.sh <version> <component1> [component2...]

# Examples
./scripts/create_update_package.sh 2.1.0 dashboard-backend
./scripts/create_update_package.sh 2.2.0 dashboard-backend dashboard-frontend
./scripts/create_update_package.sh 2.3.0 postgres n8n
```

### 3. Verify Signature

```bash
# Verify package signature
python3 scripts/sign_update_package.py --verify \
    arasul-update-2.1.0.araupdate \
    ~/.arasul/update_public_key.pem
```

### 4. Deploy Package

**Method 1: Dashboard Upload**
```bash
# Access Dashboard at https://arasul.local
# Navigate to Updates section
# Upload .araupdate file
```

**Method 2: USB Deployment**
```bash
# Copy to USB stick
cp arasul-update-2.1.0.araupdate /media/usb/updates/

# Insert USB into Arasul device
# System auto-detects and prompts for installation
```

## Supported Components

| Component | Description | Build Time | Size |
|-----------|-------------|------------|------|
| `dashboard-backend` | Backend API service | ~30s | ~50 MB |
| `dashboard-frontend` | React SPA | ~45s | ~30 MB |
| `llm-service` | LLM inference service | ~2m | ~200 MB |
| `embedding-service` | Text embedding service | ~1m | ~150 MB |
| `metrics-collector` | System metrics collector | ~20s | ~20 MB |
| `self-healing-agent` | Recovery engine | ~20s | ~15 MB |
| `n8n` | Custom workflow nodes | ~5s | ~2 MB |
| `postgres` | Database migrations | ~1s | ~10 KB |

## File Structure

### Update Package Format

```
arasul-update-2.1.0.araupdate
│
├── [Package Data] (gzip compressed tar)
│   ├── manifest.json
│   └── payload/
│       ├── dashboard-backend-2.1.0.tar.gz
│       └── dashboard-frontend-2.1.0.tar.gz
│
├── [Separator] ("\n---SIGNATURE---\n")
│
└── [RSA-PSS Signature] (512 bytes for 4096-bit key)
```

### Manifest Structure

```json
{
  "version": "2.1.0",
  "min_version": "1.0.0",
  "components": ["dashboard-backend", "dashboard-frontend"],
  "requires_reboot": false,
  "release_notes": "Update to version 2.1.0",
  "created_at": "2025-11-13T15:40:39Z",
  "checksum": "915b119159fd5f5ebaf3b4566ba2eb5d8da9f746b544573cf8745e14f3d57588"
}
```

## Scripts Reference

### create_update_package.sh

**Purpose**: Creates unsigned update package with selected components

**Location**: `scripts/create_update_package.sh`

**Usage**:
```bash
./scripts/create_update_package.sh <version> <component1> [component2...]
```

**Options**:
- `<version>`: Semantic version (e.g., 2.1.0, 3.0.0-beta)
- `<components>`: Space-separated list of components

**Environment Variables**:
- `PRIVATE_KEY_PATH`: Override default private key location

**Output**:
- Creates `arasul-update-<version>.araupdate` in project root
- Automatically calls `sign_update_package.py`

**Process**:
1. Creates temporary workspace in `/tmp/arasul-update-<version>/`
2. Generates manifest.json
3. Builds Docker images for selected components
4. Exports images as compressed tarballs
5. Calculates SHA-256 checksum
6. Creates tar.gz package
7. Signs package with RSA private key
8. Outputs `.araupdate` file

### sign_update_package.py

**Purpose**: Signs update packages and verifies signatures

**Location**: `scripts/sign_update_package.py`

**Dependencies**: `pip3 install cryptography`

**Usage**:
```bash
# Sign package
python3 scripts/sign_update_package.py <package.tar.gz> <private_key.pem>

# Verify signature
python3 scripts/sign_update_package.py --verify <package.araupdate> <public_key.pem>
```

**Signature Algorithm**: RSA-PSS with SHA-256
- **Padding**: PSS (Probabilistic Signature Scheme)
- **MGF**: MGF1 with SHA-256
- **Salt Length**: Maximum (for 4096-bit key)
- **Hash**: SHA-256

**Exit Codes**:
- `0`: Success (signature valid in verify mode)
- `1`: Error (package not found, signature invalid, missing key)

## Component Build Details

### Docker Image Components

For Docker-based components (`dashboard-backend`, `dashboard-frontend`, `llm-service`, etc.):

```bash
# Build process:
docker build -t arasul-<component>:<version> ./services/<component>
docker save arasul-<component>:<version> | gzip > payload/<component>-<version>.tar.gz
```

**Installation on target**:
```bash
# Extract and load image
docker load < payload/<component>-<version>.tar.gz

# Restart service
docker-compose up -d <component>
```

### Custom Nodes (n8n)

Only compiles custom nodes (not base n8n image):

```bash
# Package built nodes
tar -czf payload/n8n-custom-nodes-<version>.tar.gz \
    -C services/n8n \
    custom-nodes/n8n-nodes-arasul-llm/dist \
    custom-nodes/n8n-nodes-arasul-embeddings/dist
```

**Installation**: Requires n8n service rebuild

### Database Migrations (postgres)

Only packages migration SQL files:

```bash
# Package migrations
tar -czf payload/postgres-migrations-<version>.tar.gz \
    -C services/postgres/init .
```

**Installation**: Applied via `psql` on target system

## Security Considerations

### Private Key Security

**DO**:
- ✅ Generate key on secure, offline machine
- ✅ Store in encrypted volume (BitLocker, FileVault, LUKS)
- ✅ Use strong file permissions (600)
- ✅ Backup to secure, offline location
- ✅ Use hardware security module (HSM) for production

**DON'T**:
- ❌ Commit private key to Git
- ❌ Store in cloud services (Dropbox, Google Drive)
- ❌ Email or transmit over insecure channels
- ❌ Use same key for multiple purposes
- ❌ Share key with unauthorized personnel

### Signature Verification

Target systems verify signatures before applying updates:

```python
# Verification process (in dashboard-backend/updateService.js)
1. Extract package and signature from .araupdate
2. Load public key from /arasul/config/public_update_key.pem
3. Verify RSA-PSS signature
4. If invalid: REJECT update and log security event
5. If valid: Proceed with installation
```

**Attack Prevention**:
- **Man-in-the-Middle**: Signature verification prevents tampered packages
- **Rollback Attacks**: Version checks prevent downgrade to vulnerable versions
- **Supply Chain**: Only packages signed with correct key are accepted

## Testing

### Test Package Creation

```bash
# Create test package (postgres migrations - fastest)
./scripts/create_update_package.sh 2.0.1-test postgres

# Expected output:
# ✅ Update package ready: arasul-update-2.0.1-test.araupdate
```

### Test Signature Verification

```bash
# Verify signature is valid
python3 scripts/sign_update_package.py --verify \
    arasul-update-2.0.1-test.araupdate \
    ~/.arasul/update_public_key.pem

# Expected output:
# ✅ Signature is VALID
```

### Test Package Structure

```bash
# Extract package
mkdir -p /tmp/test-update
python3 -c "
with open('arasul-update-2.0.1-test.araupdate', 'rb') as f:
    content = f.read()
    parts = content.split(b'\n---SIGNATURE---\n')
    with open('/tmp/test-update/package.tar.gz', 'wb') as out:
        out.write(parts[0])
"

cd /tmp/test-update
tar -xzf package.tar.gz

# Verify manifest
cat manifest.json

# Verify payload
ls -lh payload/
```

### Test Invalid Signature

```bash
# Create test package
./scripts/create_update_package.sh 2.0.2-test postgres

# Corrupt signature
python3 -c "
with open('arasul-update-2.0.2-test.araupdate', 'rb') as f:
    content = f.read()
parts = content.split(b'\n---SIGNATURE---\n')
corrupted = parts[0] + b'\n---SIGNATURE---\n' + b'INVALID_SIGNATURE_DATA'
with open('arasul-update-2.0.2-corrupted.araupdate', 'wb') as f:
    f.write(corrupted)
"

# Verify fails
python3 scripts/sign_update_package.py --verify \
    arasul-update-2.0.2-corrupted.araupdate \
    ~/.arasul/update_public_key.pem

# Expected output:
# ❌ Signature is INVALID
```

## Troubleshooting

### Error: "Private key not found"

**Cause**: Private key not at default location (`~/.arasul/update_private_key.pem`)

**Solution**:
```bash
# Generate new key
openssl genrsa -out ~/.arasul/update_private_key.pem 4096

# Or set custom location
export PRIVATE_KEY_PATH=/path/to/your/key.pem
./scripts/create_update_package.sh ...
```

### Error: "cryptography library not found"

**Cause**: Python cryptography module not installed

**Solution**:
```bash
pip3 install cryptography
```

### Error: "Docker image build failed"

**Cause**: Service Dockerfile has errors or dependencies missing

**Solution**:
```bash
# Test build manually
docker build -t test ./services/<component>

# Check logs for specific error
# Fix Dockerfile or dependencies
```

### Error: "Component directory not found"

**Cause**: Script cannot find service directory

**Solution**:
```bash
# Run from project root
cd /path/to/arasul-platform
./scripts/create_update_package.sh ...
```

### Warning: "n8n custom nodes not built"

**Cause**: TypeScript source not compiled

**Solution**:
```bash
# Build custom nodes first
cd services/n8n/custom-nodes/n8n-nodes-arasul-llm
npm install
npm run build

cd ../n8n-nodes-arasul-embeddings
npm install
npm run build

# Then create package
cd ../../../../
./scripts/create_update_package.sh 2.1.0 n8n
```

## Production Workflow

### Release Process

1. **Prepare Release**
   ```bash
   # Update version in package.json, etc.
   # Test all components locally
   # Commit and tag release
   git tag v2.1.0
   git push origin v2.1.0
   ```

2. **Build Package**
   ```bash
   # Build full system update
   ./scripts/create_update_package.sh 2.1.0 \
       dashboard-backend \
       dashboard-frontend \
       llm-service \
       embedding-service \
       metrics-collector \
       self-healing-agent \
       n8n \
       postgres
   ```

3. **Test Package**
   ```bash
   # Verify signature
   python3 scripts/sign_update_package.py --verify \
       arasul-update-2.1.0.araupdate \
       ~/.arasul/update_public_key.pem

   # Test on staging system
   # Upload via dashboard
   # Monitor logs for errors
   ```

4. **Deploy Package**
   ```bash
   # Upload to release server
   # Distribute via dashboard or USB
   # Monitor rollout metrics
   ```

### Versioning Strategy

- **Major (X.0.0)**: Breaking changes, requires manual intervention
- **Minor (x.X.0)**: New features, backward compatible
- **Patch (x.x.X)**: Bug fixes, security updates

### Rollback Procedure

If update fails:

1. System automatically detects critical service failures
2. Self-healing engine triggers rollback
3. Previous Docker images restored from backup tags
4. System reboots to stable state

Manual rollback:
```bash
# Revert to previous version
docker-compose down
docker tag arasul-dashboard-backend:2.0.0 arasul-dashboard-backend:latest
docker-compose up -d
```

## Integration with Arasul Platform

### Dashboard Backend API

Update service endpoint: `/api/update/upload`

```javascript
// POST multipart/form-data
// Field: file (binary .araupdate)
// Header: Authorization: Bearer <jwt-token>

// Response:
{
  "success": true,
  "version": "2.1.0",
  "components": ["dashboard-backend", "dashboard-frontend"],
  "size": 85000000,
  "status": "verified"
}
```

### USB Auto-Detection

USB trigger script: `scripts/arasul-usb-trigger.sh`

```bash
# Monitors /media/usb/updates/*.araupdate
# On detection:
# 1. Copy to /arasul/updates/
# 2. Trigger dashboard backend update API
# 3. Log event to system.log
```

### Update Process Flow

```
1. Package Upload (Dashboard or USB)
   ↓
2. Signature Verification (Public Key)
   ↓
3. Version Check (min_version ≤ current < new)
   ↓
4. Pre-Update Backup (Docker images, configs)
   ↓
5. Component Installation (Load images, migrations)
   ↓
6. Service Restart (docker-compose restart)
   ↓
7. Health Checks (3x attempts per service)
   ↓
8. Success: Log + Notification
   OR
   Failure: Automatic Rollback
```

## Performance Metrics

| Operation | Time | Size |
|-----------|------|------|
| Key Generation (4096-bit) | ~30s | 3.2 KB private, 800 B public |
| Sign Package (10 MB) | ~0.5s | +512 B |
| Verify Signature | ~0.1s | - |
| Build dashboard-backend | ~30s | ~50 MB |
| Build llm-service | ~2m | ~200 MB |
| Full System Package | ~5m | ~500 MB |

## References

- [RSA-PSS Signature Scheme](https://tools.ietf.org/html/rfc3447)
- [Python Cryptography Library](https://cryptography.io/)
- [Docker Save/Load](https://docs.docker.com/engine/reference/commandline/save/)
- [Semantic Versioning](https://semver.org/)

## Changelog

- **2025-11-13**: Initial implementation (Task 4.2)
  - Created `create_update_package.sh`
  - Created `sign_update_package.py`
  - Tested with postgres migrations
  - Verified signature validation
  - Full documentation

## License

MIT License - Part of Arasul Platform
