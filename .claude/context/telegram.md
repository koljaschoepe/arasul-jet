# Context: Telegram Bot Integration

## Quick Reference

**Backend-managed** — Telegram-Bots werden komplett über das Dashboard-Backend verwaltet (kein separater Python-Service mehr).

**Routes:** `apps/dashboard-backend/src/routes/telegram/`
**Services:** `apps/dashboard-backend/src/services/telegram/`
**DB-Tabellen:** `telegram_bots`, `telegram_bot_commands`, `telegram_bot_chats`, `telegram_bot_sessions`

---

## Architektur (Multi-Bot v3)

```
Telegram API
     │
     ▼
Dashboard-Backend (:3001)
├── routes/telegram/
│   ├── telegram.js        # Legacy config, token encryption
│   ├── telegramApp.js     # Setup wizard + WebSocket
│   └── bots.js            # Bot CRUD, commands, chats
├── services/telegram/
│   ├── telegramBotService.js        # Bot DB operations
│   ├── telegramOrchestratorService.js  # Master orchestrator (thinking mode)
│   ├── telegramPollingManager.js    # getUpdates polling (no webhook)
│   ├── telegramWebhookService.js    # Webhook callback handling
│   ├── telegramLLMService.js        # Routes messages to LLM queue
│   ├── telegramRAGService.js        # Document retrieval for bots
│   ├── telegramNotificationService.js  # System notifications
│   ├── telegramRateLimitService.js  # Per-user/chat rate limiting
│   ├── telegramVoiceService.js      # Audio message handling
│   └── telegramWebSocketService.js  # Setup progress updates
```

---

## Datenbank-Tabellen

| Tabelle                       | Zweck                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `telegram_bots`               | Bot-Konfiguration (Token AES-256-GCM verschlüsselt, LLM-Provider, System-Prompt) |
| `telegram_bot_commands`       | Custom Commands pro Bot (command, description, prompt)                           |
| `telegram_bot_chats`          | Bekannte Chats pro Bot (chat_id, title, type)                                    |
| `telegram_bot_sessions`       | Conversation-History pro Chat (messages JSONB, token_count)                      |
| `telegram_setup_sessions`     | Setup-Wizard State (setup_token, status, expires_at)                             |
| `telegram_notification_rules` | Benachrichtigungsregeln (event_source, trigger_condition, cooldown)              |
| `telegram_rate_limits`        | Rate-Limiting pro Bot+Chat (requests/min, requests/hour)                         |
| `telegram_app_status`         | App-Aktivierung pro User (icon_visible, settings)                                |

---

## Bot erstellen (Setup-Wizard Flow)

1. User klickt "Telegram Bot einrichten" im Dashboard
2. Frontend öffnet WebSocket zu `/api/telegram-app/ws`
3. User gibt Bot-Token ein → Backend validiert via Telegram API
4. Backend sendet `/start`-Nachricht an Bot → User bestätigt im Telegram
5. Setup abgeschlossen → Bot startet Polling

## Key Features

- **Multi-Bot**: Mehrere Bots pro User möglich
- **LLM-Provider**: Ollama (lokal) oder Claude API
- **Voice**: Audio-Nachrichten via OpenAI Whisper API
- **RAG**: Bots können Knowledge Spaces durchsuchen (`rag_enabled`, `rag_space_ids`)
- **Custom Commands**: Pro Bot definierbar mit eigenem Prompt
- **User-Whitelist**: `allowed_users` JSONB + `restrict_users` Boolean
- **Rate-Limiting**: Per Bot+Chat, konfigurierbare Limits/min und /hour

## Token-Verschlüsselung

Bot-Tokens werden AES-256-GCM verschlüsselt in der DB gespeichert:

- `bot_token_encrypted` (BYTEA)
- `bot_token_iv` (Initialization Vector)
- `bot_token_tag` (Auth Tag)

---

## API-Endpoints

### Bot-Management (`/api/telegram-bots/`)

- `GET /` — Alle Bots des Users
- `POST /` — Bot erstellen
- `GET /:id` — Bot-Details
- `PUT /:id` — Bot aktualisieren
- `DELETE /:id` — Bot löschen
- `POST /:id/toggle` — Bot aktivieren/deaktivieren
- `GET /:id/commands` — Commands auflisten
- `POST /:id/commands` — Command erstellen
- `PUT /:id/commands/:cmdId` — Command ändern
- `DELETE /:id/commands/:cmdId` — Command löschen

### Setup (`/api/telegram-app/`)

- `POST /setup/start` — Setup starten (Token validieren)
- `POST /setup/complete` — Setup abschließen
- `WS /ws` — WebSocket für Setup-Fortschritt

### Benachrichtigungen (`/api/telegram/`)

- `POST /send` — Nachricht senden
- `GET /notification-rules` — Regeln auflisten
- `POST /notification-rules` — Regel erstellen

---

## Checklist: Neuen Bot-Feature hinzufügen

- [ ] Service-Logik in `services/telegram/` (richtige Service-Datei wählen)
- [ ] Route in `routes/telegram/bots.js` hinzufügen
- [ ] DB-Migration falls neues Feld (nächste: `082_*.sql`)
- [ ] Tests in `__tests__/unit/telegram*.test.js`
- [ ] Frontend-Komponente in `features/telegram/` aktualisieren
