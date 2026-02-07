# Jetson Migration Checklist

> Kompakte Checkliste zum Abhaken - Details siehe MIGRATION_PLAN_JETSON.md

---

## Pre-Migration (Altes System)

### Backup erstellen
- [ ] `./scripts/backup.sh` ausgeführt
- [ ] Qdrant Snapshot: `curl -X POST "http://localhost:6333/snapshots"`
- [ ] n8n Export: `docker exec n8n n8n export:workflow --all --output=/tmp/workflows.json`
- [ ] LLM Models Volume gesichert
- [ ] Embedding Models Volume gesichert
- [ ] `.env` und `config/` kopiert
- [ ] Migration-Archiv erstellt

### Kritische Fixes anwenden
- [ ] SEC-C001: Passwort min 12 chars (`scripts/validate_config.sh:144`)
- [ ] SEC-C002: DOMPurify in MermaidDiagram
- [ ] SEC-C003: Docker Socket `:ro` in docker-compose.yml
- [ ] DB-001: IF NOT EXISTS in `004_update_schema.sql`
- [ ] DB-002: UNIQUE Constraint in `009_documents_schema.sql`
- [ ] SELF-HEAL-001: `--volumes` entfernen in healing_engine.py
- [ ] SELF-HEAL-002: Reboot Cooldown erhöhen

---

## Neuer Jetson Setup

### Hardware Check
- [ ] JetPack 6.0+ installiert: `cat /etc/nv_tegra_release`
- [ ] Docker 24.0+: `docker --version`
- [ ] Docker Compose V2: `docker compose version`
- [ ] NVIDIA Runtime: `docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi`
- [ ] Mindestens 256GB Storage frei

### Repository Setup
- [ ] Repository geklont
- [ ] Migration-Archiv übertragen
- [ ] `.env` wiederhergestellt
- [ ] `config/` wiederhergestellt

### Bootstrap
- [ ] `./arasul bootstrap` erfolgreich
- [ ] Alle Services "healthy": `docker compose ps`

### Daten wiederherstellen
- [ ] PostgreSQL: `./scripts/restore.sh --latest`
- [ ] MinIO: (automatisch mit restore.sh)
- [ ] Qdrant Snapshot importiert
- [ ] n8n Workflows importiert
- [ ] LLM Models wiederhergestellt/neu geladen
- [ ] Embedding Models wiederhergestellt

---

## Validierung

### Services
- [ ] `docker compose ps` - alle healthy
- [ ] `curl http://localhost/api/health` - 200 OK
- [ ] GPU aktiv: `docker exec embedding-service python3 -c "import torch; print(torch.cuda.is_available())"` = True

### Funktionen
- [ ] Admin Login funktioniert
- [ ] Dashboard zeigt Metriken
- [ ] Chat funktioniert
- [ ] RAG Query funktioniert
- [ ] Dokumente sichtbar

### Post-Setup
- [ ] Auto-Start: `sudo systemctl enable arasul.service`
- [ ] Firewall: Ports 80, 443 offen
- [ ] Backup-Cronjob aktiv
- [ ] Telegram Notifications konfiguriert (optional)

---

## Bekannte Issues nach Migration

| Issue | Priorität | Zeit |
|-------|-----------|------|
| Qdrant Backup in backup.sh | Hoch | 30 min |
| n8n Backup in backup.sh | Hoch | 30 min |
| Telegram Commands registrieren | Hoch | 20 min |
| Image Versions pinnen | Mittel | 30 min |
| Shared Library integrieren | Mittel | 3h |

---

## Notfall-Rollback

```bash
# Falls Bootstrap fehlschlägt:
docker compose down -v
rm -rf data/
# Neu beginnen bei "Repository Setup"

# Falls Datenwiederherstellung fehlschlägt:
./scripts/restore.sh --list  # Verfügbare Backups
./scripts/restore.sh --all --date YYYYMMDD  # Spezifisches Datum
```

---

*Vollständige Details: docs/MIGRATION_PLAN_JETSON.md*
