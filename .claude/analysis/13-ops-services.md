# Ops-Services (Self-Healing, Metrics, Backup) — Findings

## Scope

`services/self-healing-agent/` (Python), `services/metrics-collector/` (Python), `services/backup-service/` (alpine + cron)

## BLOCKERS

### OPS-B01: Self-Healing-Agent kein Flapping-Detector / Restart-Loop-Killer

- Aktuell live-bestätigter Flood-Loop (siehe 18-live-runtime.md LIVE-B02): 54 failures in 10min → Cooldown blockiert → 60k Events/Tag
- Kein exponentieller Backoff, keine "give up after N hours"-Regel
- Fix: Nach 3 Cooldown-Hits → `status='dead_service'`, aus Monitoring raus, Admin-Notification

### OPS-B02: Keine externen Alerts (Email/Telegram/Webhook)

- `alert_history` Tabelle leer, keine Auslieferung
- Für 5J-autonomen Betrieb: Admin MUSS extern benachrichtigt werden bei BLOCKER-Events
- Fix: Webhook-Endpoint in Settings + SMTP-Integration + optional Telegram

### OPS-B03: Backup-Restore ungetestet

- `restore-from-backup.sh` existiert, aber Live-Tests dokumentieren nichts
- WAL-Archiving bereits gebrochen (LIVE-B01)
- Fix: CI-Job "Weekly Restore-Drill" auf fresh Container

## MAJORS

### OPS-M01: `telegram-bot-app` Service tot, aber weiter in Watchlist

- 2 Monate `Exited(1)`, Compose enthält ihn noch (Auto-Start?), Self-Healing monitor it
- Fix: Entfernen aus `compose.app.yaml` ODER als `profiles: [telegram]` markieren

### OPS-M02: Metrics-Collector liest keine DB-Metriken

- pg_stat_user_tables, connection-count, lock-waits werden nicht gesammelt
- Kein Qdrant-Collection-Size-Tracking
- Fix: Erweiterung um pg-stat + qdrant-stat + MinIO-stat

### OPS-M03: Backup-Service prüft nur `pgrep crond` für Healthcheck

- Running crond ≠ working backups
- Siehe 10-infra-docker.md I-M02
- Fix: Health-Endpoint prüft `backup_report.json.timestamp < 25h alt`

### OPS-M04: Self-Healing schreibt in `self_healing_events` ohne Retention

- Aktuell schon Flood → Tabelle wächst unkontrolliert
- Fix: 90d-Retention + cron-cleanup

### OPS-M05: Kein Health-Dashboard auf Frontend

- Frontend hat `ServicesSettings` (Service-Status), aber keinen Ops-Overview (Last-Backup, Last-Alert, WAL-Lag)
- Fix: `/api/ops/overview` Endpoint + Widget

## MINORS

- OPS-m01: self-healing-agent's recovery-commands nicht alle idempotent (`docker restart` OK, aber `rm -rf <dir>` riskant)
- OPS-m02: Kein Rate-Limit auf Healing-Actions (könnte in schlechten Fällen loop-triggern)
- OPS-m03: Backup-Script verschlüsselt nicht (nur lokal — bei MinIO-Sync könnte Verschlüsselung auf Client sinnvoll sein)
- OPS-m04: Keine Offline-Backup-Option (nur MinIO, keine USB-Export)
- OPS-m05: Metrics-Collector speichert nur 7d — für Appliance evtl. mehr

## OK / SEHR GUT

- Self-Healing hat 4 Recovery-Categories (A: log-only, B: restart, C: escalate-cooldown, D: manual)
- Cooldown-Logik verhindert Thrashing (in der Theorie — LIVE-B02 zeigt Kehrseite)
- Metrics-Collector schreibt in Postgres + Loki
- Backup-Service läuft zuverlässig daily 02:00 UTC
- MinIO-Sync als zusätzliche Sicherung
- `app_events` Tabelle gut strukturiert mit Severity/Category/Service

## Priorität

1. OPS-B01 (Flapping-Detector) — LIVE-Problem
2. OPS-B02 (externe Alerts) — Voraussetzung für 5J-Autonomie
3. OPS-B03 (Restore-Drill) — Backup ist nur so gut wie sein Restore
4. OPS-M01 (telegram-bot-app entfernen) — sofort
5. OPS-M05 (Ops-Dashboard) — UX
