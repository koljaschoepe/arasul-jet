# Arasul Platform Configuration

This directory contains configuration files for the Arasul Platform.

## Directory Structure

```
config/
├── README.md                   # This file
├── .env.template              # Template for environment variables
├── traefik/                   # Traefik reverse proxy configuration
│   ├── traefik.yml
│   └── dynamic/
│       ├── routes.yml
│       ├── middlewares.yml
│       └── websockets.yml
├── logrotate.d/               # Log rotation configuration
│   └── arasul
├── docker-logging.yml         # Docker logging configuration
├── secrets/                   # Sensitive configuration (DO NOT COMMIT)
│   ├── .gitignore
│   ├── admin.hash            # Admin password hash
│   ├── jwt_secret            # JWT secret key
│   ├── postgres_password     # PostgreSQL password
│   ├── minio_root_password   # MinIO root password
│   └── public_update_key.pem # Public key for update verification
└── app/                       # Application-specific configuration
    ├── dashboard.json        # Dashboard configuration
    ├── n8n.json             # n8n configuration
    └── system.json          # System configuration

## Configuration Files

### Environment Variables (.env)

The `.env` file contains environment variables for all services. Use `.env.template` as a starting point.

**Important**: Never commit `.env` to version control!

### Secrets (config/secrets/)

Sensitive configuration is stored in `config/secrets/` directory:

- `admin.hash` - bcrypt hash of admin password
- `jwt_secret` - Secret key for JWT token signing
- `postgres_password` - PostgreSQL database password
- `minio_root_password` - MinIO root password
- `public_update_key.pem` - Public key for update package verification

**Security**: This directory should have `700` permissions and is excluded from git.

### Application Configuration (config/app/)

JSON configuration files for application settings that can be reloaded without restart.

## Usage

### Initial Setup

```bash
# Copy template
cp config/.env.template .env

# Edit configuration
nano .env

# Run bootstrap to generate secrets
./arasul bootstrap
```

### Updating Configuration

```bash
# Edit configuration
nano .env

# Validate configuration
./arasul validate-config

# Reload configuration (without restart)
./arasul reload-config
```

### Docker Secrets (Production)

For production deployments, use Docker Secrets instead of .env files:

```bash
# Create secrets
echo "your-postgres-password" | docker secret create postgres_password -
echo "your-jwt-secret" | docker secret create jwt_secret -

# Update docker-compose.yml to use secrets
```

## Security Best Practices

1. **Never commit secrets** - Use `.gitignore` to exclude sensitive files
2. **Rotate credentials regularly** - Especially JWT secrets and database passwords
3. **Use strong passwords** - Minimum 16 characters with mixed case, numbers, and symbols
4. **Restrict file permissions** - `config/secrets/` should be `700` (owner only)
5. **Backup configuration** - But store backups securely (encrypted)
6. **Audit configuration changes** - Log all configuration modifications

## Configuration Validation

The platform validates configuration at startup:

- **Required variables** - Ensures all required environment variables are set
- **Format validation** - Validates IP addresses, ports, URLs
- **Dependency checks** - Verifies service dependencies are configured
- **Security checks** - Warns about weak passwords or insecure settings

## Configuration Reload

Some configuration can be reloaded without restarting services:

- **Dashboard settings** - UI preferences, themes
- **Rate limits** - API rate limiting rules
- **Logging levels** - Change log verbosity
- **Feature flags** - Enable/disable features

**Note**: Core settings like database credentials require a restart.

## Environment Variables Reference

See `.env.template` for complete list of environment variables and their descriptions.

### Categories

- **Database** - PostgreSQL connection settings
- **Storage** - MinIO object storage settings
- **AI Services** - LLM and embedding service settings
- **Authentication** - JWT and admin credentials
- **Networking** - Ports, hostnames, URLs
- **Resource Limits** - CPU, RAM, GPU limits
- **Self-Healing** - Self-healing agent settings
- **Logging** - Log levels and rotation settings

## Troubleshooting

### Configuration Validation Errors

```bash
# Check configuration
./arasul validate-config

# View validation errors
cat /tmp/arasul_config_validation.log
```

### Permission Issues

```bash
# Fix config directory permissions
sudo chown -R $(whoami):$(whoami) config/
chmod 700 config/secrets/
chmod 600 config/secrets/*
```

### Missing Secrets

```bash
# Regenerate secrets
./arasul bootstrap --regenerate-secrets
```

## References

- Main Documentation: `README.md`
- Bootstrap Guide: `DEPLOYMENT.md`
- Environment Template: `config/.env.template`
- PRD Section §36: Configuration Management
