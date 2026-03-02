# PRD: Telegram Bot Service

**Version:** 1.0
**Erstellt:** 2026-01-15
**Status:** In Entwicklung

---

## 1. Übersicht

### 1.1 Ziel

Ein minimaler Telegram Bot für das Arasul-System mit **bidirektionaler Kommunikation**:

- **Outbound**: Kritische System-Events melden
- **Inbound**: Befehle und Nachrichten an Claude Code weiterleiten

### 1.2 Kernprinzipien

- **Bidirektional**: Telegram ↔ Claude Code Kommunikation
- **Minimal**: Max. 3 Nachrichten pro Tag (außer Rückfragen)
- **Kritisch**: Nur wirklich wichtige Events (outbound)
- **Kein Auto-Restart**: Informiert nur, handelt nicht automatisch
- **Audit-Trail**: Alle Interaktionen werden geloggt

### 1.3 Kommunikationsfluss

```
┌─────────────────────────────────────────────────────────────────┐
│                     BIDIREKTIONALE ARCHITEKTUR                   │
└─────────────────────────────────────────────────────────────────┘

  OUTBOUND (System → User):
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │ Self-Healing │ ──▶ │  Telegram    │ ──▶ │   Telegram   │
  │    Agent     │     │     Bot      │     │     App      │
  └──────────────┘     └──────────────┘     └──────────────┘
       Events           Rate-Limited          User erhält
                        Notifications         Alerts

  INBOUND (User → System):
  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
  │   Telegram   │ ──▶ │  Telegram    │ ──▶ │ Claude Code  │
  │     App      │     │     Bot      │     │   Session    │
  └──────────────┘     └──────────────┘     └──────────────┘
       Befehle/          Message Queue        Ausführung &
       Nachrichten       + Validation         Antwort
```

---

## 2. Event-System

### 2.1 Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                    SELF-HEALING SERVICE                      │
│    (Bestehend - sammelt bereits alle System-Metriken)       │
└─────────────────────┬───────────────────────────────────────┘
                      │ Events via PostgreSQL NOTIFY/LISTEN
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 EVENT AGGREGATION ENGINE                     │
│  • Deduplizierung (gleiche Events zusammenfassen)           │
│  • Severity-Scoring (weighted score über Zeit)              │
│  • Rate-Limiting (max 3/Tag enforced)                       │
│  • Quiet-Hours respektieren                                 │
└─────────────────────┬───────────────────────────────────────┘
                      │ Nur CRITICAL events
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    TELEGRAM BOT SERVICE                      │
│  • Empfängt aggregierte Critical-Events (Outbound)          │
│  • Sendet formatierte Nachrichten                           │
│  • Empfängt User-Befehle und Freitext (Inbound)             │
│  • Leitet an Claude Code Session weiter                     │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Event-Klassifizierung (Global für gesamtes System)

| Level        | Trigger                                                           | Telegram-Aktion                       |
| ------------ | ----------------------------------------------------------------- | ------------------------------------- |
| **CRITICAL** | Service down >5min, Disk >95%, GPU Temp >95°C, Workflow failed 3x | Sofortige Nachricht                   |
| **WARNING**  | Service restart, Disk >85%, RAM >90% für >10min                   | Aggregiert in Daily Digest (optional) |
| **INFO**     | Normale Operationen                                               | Nur auf Anfrage (/status)             |

### 2.3 Smart Event Aggregation

```javascript
// Beispiel: Event-Scoring System
const EVENT_WEIGHTS = {
  service_down: 100, // Kritisch
  disk_critical: 90, // Kritisch
  gpu_overheat: 95, // Kritisch
  workflow_failed: 80, // Kritisch bei 3x
  service_restart: 30, // Warning
  high_memory: 40, // Warning
  backup_failed: 70, // Wichtig
};

// Event wird nur gesendet wenn:
// 1. Score >= 80 (CRITICAL threshold)
// 2. Nicht bereits in letzten 30min gemeldet
// 3. Daily quota nicht erreicht (3 max)
// 4. Nicht in Quiet Hours
```

### 2.4 Event-Quellen (Global)

| Service                | Events                                      |
| ---------------------- | ------------------------------------------- |
| **self-healing-agent** | CPU, RAM, Disk, GPU, Service-Status         |
| **n8n**                | Workflow success/failure, Execution errors  |
| **llm-service**        | Model load failures, OOM errors             |
| **document-indexer**   | Indexing failures, Queue overflow           |
| **postgres-db**        | Connection pool exhaustion, Replication lag |
| **All Services**       | Container restart, Health check failures    |

---

## 3. Bot-Befehle

### 3.1 Basis-Befehle

| Befehl            | Beschreibung                      | Beispiel-Output                                           |
| ----------------- | --------------------------------- | --------------------------------------------------------- |
| `/start`          | Bot aktivieren, Chat-ID speichern | "Bot aktiviert. Sende /help für Befehle."                 |
| `/status`         | System-Übersicht                  | CPU: 45%, RAM: 62%, Disk: 71%, GPU: 58°C, Services: 10/10 |
| `/services`       | Service-Status                    | Liste aller Services mit Status                           |
| `/logs <service>` | Letzte 20 Log-Zeilen              | Formatierte Log-Ausgabe                                   |
| `/disk`           | Speicher-Details                  | Usage pro Volume                                          |
| `/help`           | Befehlsübersicht                  | Alle verfügbaren Befehle                                  |

### 3.2 n8n Workflow-Integration

| Befehl                   | Beschreibung                         |
| ------------------------ | ------------------------------------ |
| `/workflows`             | Liste aller n8n Workflows mit Status |
| `/workflow <id> status`  | Status eines Workflows               |
| `/workflow <id> run`     | Workflow manuell starten             |
| `/workflow <id> disable` | Workflow deaktivieren                |

### 3.3 Agent-Erstellung via Telegram (wie tasks.md)

**Konzept:** Eine spezielle Datei `agents.md` die n8n Workflows definiert.

```markdown
# agents.md - n8n Agent Queue

## Pending Agents

- [ ] @daily 09:00: Backup-Check Agent
      trigger: cron
      action: Check MinIO backup status, notify if older than 24h

- [ ] @webhook /api/deploy: Deploy Notifier
      trigger: webhook
      action: Send deployment notification to Telegram

- [ ] @event service_restart: Service Monitor
      trigger: event
      action: Log restart, check if >3 in 1h then alert
```

**Befehle:**

| Befehl                    | Beschreibung                     |
| ------------------------- | -------------------------------- |
| `/agent add <definition>` | Neuen Agent zur Queue hinzufügen |
| `/agent list`             | Alle pending/active Agents       |
| `/agent deploy <name>`    | Agent in n8n erstellen           |
| `/agent remove <name>`    | Agent entfernen                  |

**Beispiel-Interaktion:**

```
User: /agent add @hourly: Health Reporter - Check all services, send summary if issues found

Bot: Agent "Health Reporter" zur Queue hinzugefügt.
     Trigger: Hourly (cron)
     Action: Check all services, send summary if issues found

     Deploy mit: /agent deploy health-reporter
```

---

## 4. Claude Code Integration (Bidirektional)

### 4.1 Konzept

User-Nachrichten an den Bot werden an eine laufende Claude Code Session weitergeleitet.

```
┌─────────────────────────────────────────────────────────────────┐
│                    INBOUND MESSAGE FLOW                          │
└─────────────────────────────────────────────────────────────────┘

User sendet: "Füge einen Dark Mode Toggle hinzu"
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  TELEGRAM BOT: Message Handler                                   │
│  1. Validiere Absender (nur autorisierte Chat-ID)               │
│  2. Prüfe auf /command - wenn ja, direkt verarbeiten            │
│  3. Wenn Freitext → an Claude Code weiterleiten                 │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  MESSAGE QUEUE (PostgreSQL)                                      │
│  • Nachricht in Queue speichern                                 │
│  • Status: pending → processing → completed                     │
│  • Timeout: 10 Minuten                                          │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  CLAUDE CODE SESSION                                             │
│  • Pollt Queue oder erhält Notification                         │
│  • Führt Aufgabe aus                                            │
│  • Schreibt Antwort in Queue                                    │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  TELEGRAM BOT: Response Handler                                  │
│  • Holt Antwort aus Queue                                       │
│  • Formatiert für Telegram (Markdown, Truncation)               │
│  • Sendet an User                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Message Queue Schema

```sql
-- Ergänzung zu 010_telegram_schema.sql

-- Inbound Message Queue
CREATE TABLE IF NOT EXISTS telegram_inbound_messages (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    message_text TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, processing, completed, failed, timeout
    priority INTEGER DEFAULT 5,            -- 1-10, höher = wichtiger
    claude_session_id VARCHAR(100),        -- Session die verarbeitet
    response_text TEXT,                    -- Claude's Antwort
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'timeout'))
);

-- Index für Queue-Polling
CREATE INDEX idx_inbound_pending
ON telegram_inbound_messages(status, priority DESC, created_at ASC)
WHERE status = 'pending';

-- Notification Trigger
CREATE OR REPLACE FUNCTION notify_new_telegram_message()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('telegram_inbound', json_build_object(
        'id', NEW.id,
        'chat_id', NEW.chat_id,
        'message', substring(NEW.message_text, 1, 100)
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER telegram_message_notify
AFTER INSERT ON telegram_inbound_messages
FOR EACH ROW EXECUTE FUNCTION notify_new_telegram_message();
```

### 4.3 Claude Code Integration Script

```bash
#!/bin/bash
# scripts/claude-telegram-listener.sh
# Pollt die Message-Queue und leitet an Claude Code weiter

POLL_INTERVAL=5
TIMEOUT_MINUTES=10

while true; do
    # Hole älteste pending Message
    MESSAGE=$(psql -U arasul -d arasul_db -t -A -c "
        UPDATE telegram_inbound_messages
        SET status = 'processing', started_at = NOW()
        WHERE id = (
            SELECT id FROM telegram_inbound_messages
            WHERE status = 'pending'
            ORDER BY priority DESC, created_at ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, message_text;
    ")

    if [ -n "$MESSAGE" ]; then
        MSG_ID=$(echo "$MESSAGE" | cut -d'|' -f1)
        MSG_TEXT=$(echo "$MESSAGE" | cut -d'|' -f2-)

        # An Claude Code senden (via stdin/fifo)
        RESPONSE=$(echo "$MSG_TEXT" | claude-code --print 2>&1)

        # Antwort speichern
        psql -U arasul -d arasul_db -c "
            UPDATE telegram_inbound_messages
            SET status = 'completed',
                response_text = \$\$${RESPONSE}\$\$,
                completed_at = NOW()
            WHERE id = $MSG_ID;
        "
    fi

    sleep $POLL_INTERVAL
done
```

### 4.4 Befehle für Bidirektionale Kommunikation

| Befehl            | Beschreibung                   |
| ----------------- | ------------------------------ |
| `/ask <message>`  | Explizit an Claude Code senden |
| `/queue`          | Zeige pending Messages         |
| `/cancel <id>`    | Message aus Queue entfernen    |
| `/session`        | Claude Code Session-Status     |
| Freitext ohne `/` | Automatisch an Claude Code     |

### 4.5 Beispiel-Interaktion

```
User: Füge einen Dark Mode Toggle zur Settings-Seite hinzu

Bot: ⏳ Nachricht an Claude Code gesendet...
     Queue-Position: 1
     Geschätzte Zeit: 2-5 Minuten

[Nach Verarbeitung]

Bot: ✅ Aufgabe abgeschlossen

     Claude Code hat folgende Änderungen vorgenommen:
     • apps/dashboard-frontend/src/components/Settings.js
     • apps/dashboard-frontend/src/components/Settings.css

     Commit: feat: add dark mode toggle to settings

     Zusammenfassung:
     Dark Mode Toggle wurde hinzugefügt. Der Toggle
     speichert die Präferenz in localStorage und...

     [Vollständige Antwort: /response 42]
```

### 4.6 Sicherheit

```yaml
# Sicherheitsmaßnahmen für Inbound Messages

authorization:
  # Nur diese Chat-IDs dürfen Messages senden
  allowed_chat_ids:
    - ${TELEGRAM_ADMIN_CHAT_ID}

  # Optional: Mehrere User mit unterschiedlichen Rechten
  # users:
  #   admin: [chat_id_1]
  #   readonly: [chat_id_2, chat_id_3]

rate_limits:
  # Max Messages pro Stunde
  max_messages_per_hour: 10
  # Max Messages pro Tag
  max_messages_per_day: 50
  # Cooldown zwischen Messages (Sekunden)
  min_interval_seconds: 30

content_filters:
  # Maximale Message-Länge
  max_message_length: 2000
  # Blacklist für gefährliche Befehle
  blocked_patterns:
    - 'rm -rf'
    - 'DROP TABLE'
    - 'DELETE FROM'
    - '> /dev/'
```

---

## 5. Konfiguration

### 4.1 Smart Configuration System

**Konzept:** Hierarchische Konfiguration mit Defaults und Override-Möglichkeiten.

```yaml
# config/telegram-bot.yml

# Global Defaults
defaults:
  quiet_hours:
    enabled: true
    start: '22:00'
    end: '07:00'
    timezone: 'Europe/Berlin'

  rate_limit:
    max_messages_per_day: 3
    cooldown_minutes: 30
    bypass_for_critical: true # CRITICAL ignoriert rate limit

  aggregation:
    window_minutes: 15
    dedupe_similar: true

# Event-spezifische Overrides
events:
  service_down:
    severity: critical
    notify_after_minutes: 5
    include_logs: true

  disk_critical:
    severity: critical
    threshold_percent: 95

  workflow_failed:
    severity: warning
    escalate_to_critical_after: 3 # 3x Fehler = Critical

  gpu_temperature:
    severity: critical
    threshold_celsius: 95

# Service-spezifische Overrides
services:
  llm-service:
    importance: high
    notify_on_restart: true

  n8n:
    importance: high
    workflow_notifications: true

  metrics-collector:
    importance: low
    notify_on_restart: false
```

### 4.2 Datenbank-Schema

```sql
-- Migration: 010_telegram_schema.sql

-- Bot-Konfiguration
CREATE TABLE IF NOT EXISTS telegram_config (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT UNIQUE NOT NULL,
    bot_token_hash VARCHAR(64) NOT NULL,  -- Nur Hash speichern
    enabled BOOLEAN DEFAULT true,
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '07:00',
    timezone VARCHAR(50) DEFAULT 'Europe/Berlin',
    max_daily_messages INTEGER DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Event-Tracking für Deduplizierung
CREATE TABLE IF NOT EXISTS telegram_events (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    event_hash VARCHAR(64) NOT NULL,  -- Hash für Dedupe
    severity VARCHAR(20) NOT NULL,
    source_service VARCHAR(50),
    message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index für schnelle Dedupe-Lookups
CREATE INDEX idx_telegram_events_hash_time
ON telegram_events(event_hash, created_at DESC);

-- Daily Message Counter View
CREATE VIEW telegram_daily_stats AS
SELECT
    DATE(sent_at) as date,
    COUNT(*) as messages_sent,
    COUNT(*) FILTER (WHERE severity = 'critical') as critical_count
FROM telegram_events
WHERE sent_at IS NOT NULL
GROUP BY DATE(sent_at);

-- Audit-Log für alle Interaktionen
CREATE TABLE IF NOT EXISTS telegram_audit_log (
    id SERIAL PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    command VARCHAR(50),
    full_message TEXT,
    response_summary VARCHAR(255),
    execution_time_ms INTEGER,
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index für Audit-Abfragen
CREATE INDEX idx_telegram_audit_time
ON telegram_audit_log(created_at DESC);
```

### 4.3 Environment Variables

```bash
# .env.template additions

# Telegram Bot
TELEGRAM_BOT_TOKEN=           # Bot token from @BotFather
TELEGRAM_ENABLED=true         # Enable/disable bot
TELEGRAM_RATE_LIMIT=3         # Max messages per day
TELEGRAM_QUIET_START=22:00    # Quiet hours start
TELEGRAM_QUIET_END=07:00      # Quiet hours end
```

---

## 5. Service-Architektur

### 6.1 Verzeichnisstruktur

```
services/telegram-bot/
├── package.json
├── Dockerfile
├── src/
│   ├── index.js              # Entry point
│   ├── bot.js                # Telegram Bot instance
│   ├── commands/
│   │   ├── index.js          # Command registry
│   │   ├── status.js         # /status command
│   │   ├── services.js       # /services command
│   │   ├── logs.js           # /logs command
│   │   ├── workflows.js      # /workflows commands
│   │   ├── agents.js         # /agent commands
│   │   └── claude.js         # /ask, /queue, /session commands
│   ├── events/
│   │   ├── listener.js       # PostgreSQL LISTEN (outbound events)
│   │   ├── aggregator.js     # Event aggregation
│   │   └── notifier.js       # Telegram notifications
│   ├── inbound/
│   │   ├── messageHandler.js # Freitext → Queue
│   │   ├── queueService.js   # Queue-Management
│   │   └── responseHandler.js # Claude-Antworten senden
│   ├── services/
│   │   ├── n8nService.js     # n8n API integration
│   │   ├── dockerService.js  # Docker stats
│   │   └── metricsService.js # System metrics
│   └── utils/
│       ├── rateLimit.js      # Rate limiting logic
│       ├── security.js       # Content filtering, auth
│       └── formatter.js      # Message formatting
├── config/
│   └── default.yml           # Default configuration
└── tests/
    ├── commands.test.js
    ├── events.test.js
    ├── inbound.test.js       # Bidirektionale Tests
    └── e2e.test.js
```

### 5.2 Docker Compose Integration

```yaml
# docker-compose.yml addition

telegram-bot:
  build:
    context: ./services/telegram-bot
    dockerfile: Dockerfile
  container_name: telegram-bot
  restart: unless-stopped
  environment:
    - NODE_ENV=production
    - TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
    - POSTGRES_HOST=postgres-db
    - POSTGRES_PORT=5432
    - POSTGRES_USER=${POSTGRES_USER}
    - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    - POSTGRES_DB=${POSTGRES_DB}
  volumes:
    - ./config/telegram-bot.yml:/app/config/custom.yml:ro
    - ./agents.md:/app/agents.md:rw
  depends_on:
    postgres-db:
      condition: service_healthy
    self-healing-agent:
      condition: service_healthy
  networks:
    - arasul-network
  healthcheck:
    test: ['CMD', 'node', 'healthcheck.js']
    interval: 30s
    timeout: 5s
    retries: 3
```

### 5.3 Startup Order

```
1. postgres-db        (Datenbank)
2. self-healing-agent (Event-Quelle)
3. telegram-bot       (Konsumiert Events)
```

---

## 6. Tests

### 6.1 E2E Test-Strategie

```javascript
// tests/e2e.test.js

describe('Telegram Bot E2E', () => {
  describe('Bot Initialization', () => {
    test('should connect to Telegram API', async () => {
      // Mock Telegram API
      // Verify bot.getMe() succeeds
    });

    test('should register all commands', async () => {
      // Verify setMyCommands was called
    });
  });

  describe('Command Handling', () => {
    test('/status returns system metrics', async () => {
      // Send /status command
      // Verify response contains CPU, RAM, Disk, GPU
    });

    test('/services lists all containers', async () => {
      // Send /services command
      // Verify all 10 services listed
    });

    test('/logs returns formatted output', async () => {
      // Send /logs llm-service
      // Verify log lines returned
    });
  });

  describe('Event System', () => {
    test('critical event triggers notification', async () => {
      // Inject critical event via PostgreSQL NOTIFY
      // Verify Telegram message sent
    });

    test('duplicate events are deduplicated', async () => {
      // Send same event twice within 30min
      // Verify only one notification
    });

    test('rate limit enforced', async () => {
      // Send 4 critical events
      // Verify only 3 notifications sent
    });

    test('quiet hours respected', async () => {
      // Set time to quiet hours
      // Send critical event
      // Verify no notification (or queued)
    });
  });

  describe('n8n Integration', () => {
    test('/workflows lists n8n workflows', async () => {
      // Mock n8n API
      // Verify workflow list returned
    });

    test('/workflow run triggers execution', async () => {
      // Send /workflow 1 run
      // Verify n8n execution started
    });
  });

  describe('Agent System', () => {
    test('/agent add creates entry in agents.md', async () => {
      // Send /agent add command
      // Verify agents.md updated
    });

    test('/agent deploy creates n8n workflow', async () => {
      // Add agent, then deploy
      // Verify n8n workflow created
    });
  });

  describe('Audit Logging', () => {
    test('all commands are logged', async () => {
      // Send various commands
      // Verify audit_log entries created
    });
  });
});
```

### 6.2 Test-Commands

```bash
# Unit Tests
cd services/telegram-bot && npm test

# E2E Tests (requires running system)
npm run test:e2e

# Coverage
npm run test:coverage
```

---

## 7. Nachrichten-Formate

### 7.1 Critical Alert

```
🚨 CRITICAL: LLM Service Down

Service: llm-service
Status: Unhealthy for 6 minutes
Last Error: OOM killed

Quick Actions:
• /logs llm-service - View logs
• /services - System overview

━━━━━━━━━━━━━━━━━━━━
Arasul System • 14:32 UTC
```

### 7.2 Status Response

```
📊 System Status

CPU:  ████████░░  78%
RAM:  ██████░░░░  62%
Disk: ███████░░░  71%
GPU:  ████░░░░░░  42°C

Services: 10/10 online ✓
Workflows: 5 active, 0 failed

Last Event: 2h ago (backup completed)
```

### 7.3 Workflow List

```
📋 n8n Workflows

Active:
• Daily Backup (ID: 1) - ✓ Last: 06:00
• Health Monitor (ID: 3) - ✓ Last: 14:30
• Log Rotation (ID: 5) - ✓ Last: 00:00

Disabled:
• Test Workflow (ID: 2)

/workflow <id> status|run|disable
```

---

## 8. Implementierungs-Reihenfolge

### Phase 1: Basis (Tasks 1-4)

1. Service-Skeleton mit Express
2. Bot-Token Validierung
3. Datenbank-Migration
4. Event-Listener (PostgreSQL NOTIFY)

### Phase 2: Befehle (Tasks 5-6)

5. Basis-Befehle (/status, /services, /logs, /disk, /help)
6. Rate-Limiting & Quiet Hours

### Phase 3: Integration (Tasks 7-9)

7. n8n Workflow-Befehle
8. Agent-System (agents.md)
9. Frontend-Komponente

### Phase 4: Testing (Tasks 10-12)

10. Unit Tests
11. E2E Tests
12. Dokumentation

---

## 10. Offene Entscheidungen

| #   | Frage                               | Status                                   |
| --- | ----------------------------------- | ---------------------------------------- |
| 1.1 | Kommunikationsrichtung              | ✅ **Bidirektional**                     |
| 1.2 | Benachrichtigungs-Verhalten         | ✅ Nur Critical, max 3/Tag, kein Restart |
| 2   | Soll der Bot Multi-User fähig sein? | Offen                                    |
| 3   | Soll es einen Daily Digest geben?   | Offen                                    |
| 4   | Webhook vs. Long Polling?           | Long Polling (einfacher)                 |

---

## 11. Referenzen

- [Telegram Bot API](https://core.telegram.org/bots/api)
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api)
- [n8n API](https://docs.n8n.io/api/)
- [PostgreSQL LISTEN/NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html)
