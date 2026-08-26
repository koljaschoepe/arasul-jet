# Backup Service

Scheduled backup and restore-drill orchestrator for Arasul. Runs out of an Alpine container, dumps PostgreSQL, archives the flow definitions and the WAL segments, and stores the bundle on a mounted volume. (MinIO backups ended on 26.08.2026 with phase B4 of the Rueckbau — the object store is gone.)

## Overview

| Property        | Value                                                                                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Base image      | `alpine:3.19`                                                                                                                                                                              |
| Tools installed | `postgresql16-client`, `docker-cli`, `gzip`, `tar`, `curl`, `bash`                                                                                                                         |
| Compose entry   | [`compose/compose.monitoring.yaml`](../../compose/compose.monitoring.yaml) (build) + [`compose/compose.secrets.yaml`](../../compose/compose.secrets.yaml) (postgres-password secret mount) |
| Schedule        | Cron-driven inside the container (see `entrypoint.sh`)                                                                                                                                     |
| Backup target   | Mounted host volume — see `BACKUP_DIR` env var (defaults to `/home/arasul/arasul/arasul-jet/data/backups`)                                                                                 |

## Components

```
backup-service/
├── Dockerfile         Alpine + postgres-client + docker-cli + gzip/tar
├── entrypoint.sh      Container entry — installs cron jobs, tails the log
├── backup.sh          Runs the actual backup (postgres + flows + WAL)
└── restore-drill.sh   Periodic restore-drill (mounts the latest backup into a sidecar postgres and verifies SELECT 1)
```

## Restore path

Production restores do **not** run from this container. Use one of:

- `./scripts/backup/restore.sh` — full-featured CLI (`--postgres`, `--all --date`, `--latest`, `--list`).
- `./scripts/recovery/restore-from-backup.sh` — simpler date-arg interface, restores Postgres from a dated backup.

See [`docs/ops/BACKUP_SYSTEM.md`](../../docs/ops/BACKUP_SYSTEM.md) and [`docs/ops/DISASTER_RECOVERY.md`](../../docs/ops/DISASTER_RECOVERY.md) for the operator-side workflow.

## Adding a new store to back up

Edit `backup.sh`, add a new step that writes its dump into `${BACKUP_DIR}/${TIMESTAMP}/<store>/`. Mirror the cleanup logic at the bottom that prunes backups older than the retention window. Keep the store-specific code in its own function so `restore-drill.sh` can target it independently.
