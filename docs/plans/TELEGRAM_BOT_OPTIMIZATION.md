# Telegram-Bot-Optimierung — Ultradetaillierter Plan

> **Status:** Draft, 2026-04-30
> **Branch-Strategie:** Big-Bang in einem Branch (`feat/telegram-bot-overhaul`), interne Phasen-Struktur via Commits für Reviewbarkeit
> **Ziel:** Aus dem aktuellen halb-funktionalen Telegram-Bot einen produktionsreifen "lokalen KI-Begleiter mit Reminder-Funktionen" machen, der via mehrere Bots gleichzeitig zuverlässig mit Ollama spricht
> **Zeitrahmen:** ~3-4 Wochen Vollzeit, ~6-8 Wochen nebenher

---

## 0. Executive Summary

### Was geht heute schief?

Beim aktuellen System reagiert ein gerade neu erstellter Bot **gar nicht** auf normale Nachrichten — keine Antwort, kein "typing"-Indikator, keine Fehlermeldung. `/start` funktioniert während des Wizards, danach Stille.

**Root-Cause (verifiziert in `apps/dashboard-backend/src/services/telegram/telegramBotService.js:477-492`):**
Der `activateBot()`-Endpunkt setzt nur `is_active=true` in der DB. Er ruft **niemals** `telegramIngressService.startPolling(botId)` auf. Die Setup-Polling-Schleife des Wizards wird nach erfolgreichem `/start` durch `stopSetupPolling()` (`telegramIngressService.js:855`) explizit beendet. Die Runtime-Polling-Schleife für reguläre Nachrichten läuft nur für Bots, die **beim Backend-Start** in `initialize()` (`telegramIngressService.js:508-534`) als aktiv vorgefunden wurden. Ein frisch erstellter Bot wird also erst nach manuellem Container-Restart polling-aktiv.

### Vision

Ein lokaler KI-Begleiter via Telegram, der:

- **Sofort** nach Bot-Erstellung funktioniert (kein Restart nötig)
- **Mehrere Bots parallel** unterstützt, jeder mit eigenem Modell, System-Prompt, RAG-Konfig
- **Streaming-Antworten** mit live aktualisierter Nachricht (statt nur "typing"-Bubble)
- **Natürliche Reminder** versteht ("erinnere mich morgen um 10 Uhr an X")
- **Live-Status in der UI** sichtbar macht (pollt? letzte Nachricht?)
- **Hardened gegen Crashes & Rate-Limits** — Multi-Bot-Failure-Isolation
- **Voll getestet** mit Unit + Integration + E2E

### Big-Bang-Strategie

Alle Änderungen in einem Branch `feat/telegram-bot-overhaul`. Interne Commits folgen strikt der unten beschriebenen Phasen-Reihenfolge. Jede Phase ist ein eigener Commit (`feat(telegram): Phase N — beschreibung`), sodass Review phasenweise möglich ist, der Deploy aber atomar erfolgt.

**Risiko-Mitigation des Big-Bang-Ansatzes:**

- Lokal funktionsfähig nach jeder Phase (kein "broken middle")
- Frühe E2E-Tests in Phase 1 → Polling-Bug sofort gefixt → Du kannst während der Plan-Umsetzung mit dem Bot chatten
- Feature-Flag `TELEGRAM_USE_LEGACY_INGRESS=true` als Notfall-Rollback während der grammY-Migration (Phase 3)
- Pro Phase eigener Branch-internen Commit → einfacher Revert falls nötig

### Optionaler Sofort-Hotfix (1 Datei, 5 Zeilen)

Falls Du während der ~3-4 Wochen Plan-Umsetzung **sofort** mit dem Bot chatten willst, kann der Bug-Fix vorab als kleiner Commit in `main` deployed werden:

```diff
// apps/dashboard-backend/src/services/telegram/telegramBotService.js (~line 490)
async function activateBot(botId, userId) {
  const result = await database.query(...);
  if (result.rows.length === 0) throw new Error('Bot nicht gefunden');
+ // Start polling immediately so user can chat without backend restart
+ const telegramIngress = require('./telegramIngressService');
+ if (telegramIngress.shouldUsePollling()) {
+   telegramIngress.startPolling(botId).catch(err =>
+     logger.error(`Failed to start polling for newly activated bot ${botId}: ${err.message}`)
+   );
+ }
  logger.info(`Bot activated: ${result.rows[0].id}`);
  return result.rows[0];
}
```

Du hast Big-Bang gewählt — diese Variante ist nur als Sicherheitsnetz dokumentiert. Die Architektur in Phase 1 löst dasselbe Problem strukturell sauberer (Bot-Registry-Pattern).

---

## 1. Ziel-Architektur

### Status quo (vereinfacht)

```
┌─────────────┐    raw fetch()    ┌──────────────────────────────┐
│  Telegram   │ ◄──── getUpdates ─┤ telegramIngressService       │
│  API        │                   │  (pro Bot eine Schleife,     │
│             │ ──── sendMessage ─►│   in-memory Map activePolls) │
└─────────────┘                   └────┬──────────────────┬──────┘
                                       │                  │
                                       ▼                  ▼
                              telegramCommand       telegramIntegration
                              Handlers              Service
                                       │                  │
                                       ▼                  ▼
                              telegramBotService   raw fetch → Ollama
                              (CRUD + tokens)
```

**Schwächen:**

- Polling-Loop-Lifecycle nicht an Bot-Lifecycle gekoppelt → der Bug
- Raw `fetch()` an Telegram-API → kein Retry, keine 429-Behandlung, manuelles Update-Routing
- Kein Streaming-UX (Antwort kommt erst komplett am Ende)
- Reminders fehlen komplett
- Keine Live-UI-Visibility wer gerade pollt

### Ziel-Architektur

```
┌─────────────┐  long-poll  ┌─────────────────────────────────────┐
│  Telegram   │ ◄──────────►│  TelegramBotRegistry (singleton)    │
│  API        │             │  ┌──────────────────────────────┐   │
└─────────────┘             │  │ Map<botId, BotInstance>      │   │
                            │  │  • grammY Bot                │   │
                            │  │  • RunnerHandle (concurrent) │   │
                            │  │  • Auto-retry plugin         │   │
                            │  │  • Per-chat ratelimiter      │   │
                            │  └────────┬─────────────────────┘   │
                            └───────────┼─────────────────────────┘
                                        │
                            ┌───────────▼──────────┐
                            │ MessageRouter        │
                            │  (text vs voice vs   │
                            │   command vs reminder│
                            │   intent)            │
                            └───────────┬──────────┘
              ┌─────────────────────────┼─────────────────────────┐
              ▼                         ▼                         ▼
     ┌────────────────┐       ┌────────────────┐         ┌──────────────┐
     │ ChatHandler    │       │ ReminderHandler│         │ ToolHandler  │
     │  • streaming   │       │  • chrono-node │         │  • status    │
     │  • placeholder │       │  • JSON-mode   │         │  • services  │
     │  • editMsg     │       │  • pg-boss     │         │  • workflows │
     └───────┬────────┘       └───────┬────────┘         └──────┬───────┘
             │                        │                         │
             ▼                        ▼                         ▼
     ┌──────────────────────────────────────────────────────────────┐
     │  LLM-Service (Ollama, streaming via /api/chat)               │
     └──────────────────────────────────────────────────────────────┘
```

**Kernprinzipien:**

1. **Bot-Lifecycle = Registry-Lifecycle.** Bot create/activate/deactivate/delete → Registry start/stop/update.
2. **Eine Library, ein Update-Pfad:** grammY ersetzt alle Raw-fetch-Calls.
3. **Streaming first:** Jede Chat-Antwort streamt token-by-token in eine Placeholder-Message via `editMessageText`.
4. **Intent-First Routing:** Bevor LLM-Generierung startet, prüft ein leichtgewichtiger Klassifier (Regex + JSON-Mode-Prompt), ob es ein Reminder-Intent ist.
5. **Persistenz an Postgres-Boundary:** Reminder = `pg-boss`-Job in derselben PG. Konversationen in `telegram_bot_sessions` (existiert).

---

## 2. Branch-Struktur & Commits

```
feat/telegram-bot-overhaul
├── feat(telegram): Phase 0 — fix activate-without-polling bug + diagnostic logs
├── feat(telegram): Phase 1 — TelegramBotRegistry + lifecycle hooks
├── feat(telegram): Phase 2 — grammY migration of message ingress
├── feat(telegram): Phase 3 — streaming response UX (placeholder + editMessageText)
├── feat(telegram): Phase 4 — reminder system (chrono + JSON-mode + pg-boss)
├── feat(telegram): Phase 5 — per-chat rate-limiter + open-access security guards
├── feat(telegram): Phase 6 — UI live-status + reminder list + per-bot test-send
├── feat(telegram): Phase 7 — conversation memory refinement (token budget)
├── test(telegram): Phase 8 — unit + integration + E2E coverage
└── docs(telegram): Phase 9 — API_REFERENCE, ARCHITECTURE, ENV_VARS, DB_SCHEMA updates
```

Jeder Commit muss für sich kompilieren, alle Tests grün halten, deploybar sein.

---

## 3. Phasen im Detail

### Phase 0 — Sofort-Bug-Fix + Diagnose-Logging

**Ziel:** Akuter Bug behoben, Telemetry für künftige Diagnose.

**Dateien:**

#### `apps/dashboard-backend/src/services/telegram/telegramBotService.js`

- `activateBot()` (Zeile 477-492): Nach DB-Update sofort `telegramIngressService.startPolling(botId)` aufrufen (best-effort, fire-and-forget).
- `createBot()` (Zeile 166-258): Falls `is_active=true` per Default in DB, am Ende auch `startPolling()` triggern.
- `deactivateBot()` (Zeile 500-537): Vor DB-Update `telegramIngressService.stopPolling(botId)` aufrufen.
- `updateBot()` (Zeile 267-449): Falls `token` geändert wurde → `stopPolling` + `startPolling` (Hot-Restart).
- `deleteBot()` (Zeile 457-469): Vor `DELETE` → `stopPolling`.

**Cyclic-Import-Risiko:** `telegramBotService` wird von `telegramIngressService` importiert. Lösung: `require()` lazy innerhalb der Funktion (nicht top-level), wie es schon in einigen Stellen gemacht wird (z.B. `telegramIngressService.js:213`).

#### `apps/dashboard-backend/src/services/telegram/telegramIngressService.js`

Logger.debug-Lines verbessern, damit "komplette Stille"-Fälle künftig sichtbar werden:

- Zeile ~597 (`startPolling`): Log `INFO`-Level inkl. Bot-Username
- Neue Funktion `getDiagnostics(botId)` returniert: `{isPolling, lastPollAt, lastUpdateId, errorCount, lastError}`
- Per-Bot-State-Map erweitern: `activePolls.get(botId)` enthält künftig `{ running, offset, lastPollAt, errorCount, lastError }`

#### `apps/dashboard-backend/src/routes/telegram/bots.js`

- Neuer Endpunkt: `GET /api/telegram-bots/:id/diagnostics` → ruft `telegramIngressService.getDiagnostics(botId)` auf, returniert JSON.
- `POST /api/telegram-bots/:id/restart-polling` → manueller Trigger zum Neustarten der Polling-Schleife (für Admin-Recovery).

**Akzeptanzkriterien:**

1. Neu erstellten Bot via Wizard anlegen → `/start` senden → "Verbindung hergestellt" → **direkt** Text-Nachricht senden → Bot antwortet (ohne Container-Rebuild).
2. `GET /api/telegram-bots/<id>/diagnostics` returniert plausible Werte (`isPolling=true`, `lastPollAt` < 60s alt).
3. Bot deaktivieren → `is_polling=false`, Polling-Schleife im Log als "ended".
4. Bot mit neuem Token aktualisieren → Polling-Schleife rotiert ohne Restart.

**Aufwand:** 0.5 Tage.

---

### Phase 1 — TelegramBotRegistry (Lifecycle-Singleton)

**Ziel:** Bot-Lifecycle = Registry-Lifecycle. Sauberer Ersatz der ad-hoc `activePolls`-Map.

**Neue Datei:** `apps/dashboard-backend/src/services/telegram/telegramBotRegistry.js`

```javascript
// Pseudocode-Skelett
class TelegramBotRegistry {
  constructor({ db, logger, llmService, reminderService }) { ... }
  bots = new Map();  // botId -> BotInstance

  async initialize() {
    // 1. DB-Scan: alle is_active=true bots
    // 2. Pro Bot: this.start(botId)
  }

  async start(botId) {
    if (this.bots.has(botId)) return;
    const config = await loadBotConfig(botId);
    const instance = new BotInstance(config, this.deps);
    await instance.boot();           // grammY init kommt in Phase 2
    this.bots.set(botId, instance);
  }

  async stop(botId) {
    const instance = this.bots.get(botId);
    if (!instance) return;
    await instance.shutdown();
    this.bots.delete(botId);
  }

  async restart(botId) {
    await this.stop(botId);
    await this.start(botId);
  }

  getStatus(botId) { ... }            // für Diagnostics-Endpunkt
  getAllStatus() { ... }              // für UI-Status-Tab

  async shutdown() {                  // graceful shutdown bei SIGTERM
    await Promise.allSettled([...this.bots.keys()].map(id => this.stop(id)));
  }
}

module.exports = new TelegramBotRegistry({ ... });   // Singleton
```

**`BotInstance`-Klasse** (in `apps/dashboard-backend/src/services/telegram/botInstance.js`):

- Wrappt aktuell noch die existierende Polling-Logik aus `telegramIngressService` (bleibt in Phase 1 unverändert)
- Stellt einheitliches Interface für Registry: `boot()`, `shutdown()`, `getStatus()`, `restart()`
- Phase 2 ersetzt die innere Implementierung durch grammY, ohne dass Registry oder andere Aufrufer geändert werden müssen

**Backend-Bootstrap:** `apps/dashboard-backend/src/index.js`:

- Beim Start: `await telegramBotRegistry.initialize()`
- Bei `SIGTERM`: `await telegramBotRegistry.shutdown()`

**Routen-Anpassungen:**

- `routes/telegram/bots.js`: `activateBot` → `telegramBotRegistry.start(botId)`, `deactivateBot` → `telegramBotRegistry.stop(botId)`, etc.
- Phase-0-Direktcalls auf `telegramIngressService.startPolling/stopPolling` werden durch Registry-Aufrufe ersetzt.

**Akzeptanzkriterien:**

1. Backend-Start lädt alle aktiven Bots in Registry.
2. Bot create → start, activate → start, deactivate → stop, delete → stop.
3. Crash in einem Bot kill keine anderen Bots (try/catch in `BotInstance.boot()`).
4. `getAllStatus()` listet alle Bots korrekt mit `running/stopped/error`-Status.
5. SIGTERM beendet alle Bots sauber innerhalb 10s.
6. **Kein Verhaltensregress** vs Phase 0 (alles funktioniert weiterhin gleich).

**Aufwand:** 2 Tage.

---

### Phase 2 — grammY-Migration der Ingress-Schicht

**Ziel:** Raw `fetch()`-Calls durch grammY ersetzen. TS-natives Update-Routing, automatische Retries, robusteres Error-Handling.

**Neue Dependencies (`apps/dashboard-backend/package.json`):**

```json
{
  "dependencies": {
    "grammy": "^1.30.0",
    "@grammyjs/runner": "^2.0.3",
    "@grammyjs/auto-retry": "^2.0.2",
    "@grammyjs/ratelimiter": "^1.2.0"
  }
}
```

**`BotInstance`-Re-implementierung** (`apps/dashboard-backend/src/services/telegram/botInstance.js`):

```javascript
const { Bot } = require('grammy');
const { run } = require('@grammyjs/runner');
const { autoRetry } = require('@grammyjs/auto-retry');
const { limit } = require('@grammyjs/ratelimiter');

class BotInstance {
  constructor(config, deps) {
    this.config = config;
    this.deps = deps; // { db, logger, llmService, reminderService, conversationStore }
    this.bot = null;
    this.runner = null;
    this.startedAt = null;
    this.lastError = null;
  }

  async boot() {
    const token = await this.deps.tokenService.getDecrypted(this.config.id);
    this.bot = new Bot(token);

    // Plugins
    this.bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 30 }));
    this.bot.use(
      limit({
        timeFrame: 60_000, // 1 min
        limit: this.config.rateLimitPerMinute,
        onLimitExceeded: ctx => ctx.reply('🚦 Bitte etwas langsamer.'),
        keyGenerator: ctx => `${this.config.id}:${ctx.chat.id}`,
      })
    );

    // Routing
    this.bot.command('start', ctx => this._handlers.start(ctx));
    this.bot.command('help', ctx => this._handlers.help(ctx));
    this.bot.command('clear', ctx => this._handlers.clear(ctx));
    this.bot.command('reminders', ctx => this._handlers.reminders(ctx));
    // ... weitere /commands
    this.bot.on('message:text', ctx => this._handlers.text(ctx));
    this.bot.on('message:voice', ctx => this._handlers.voice(ctx));
    this.bot.on('callback_query', ctx => this._handlers.callback(ctx));

    // Error boundary
    this.bot.catch(err => {
      this.lastError = { at: new Date(), message: err.message };
      this.deps.logger.error(`[bot ${this.config.id}] handler error:`, err);
    });

    // Long-polling via runner (concurrent updates per chat)
    this.runner = run(this.bot, {
      runner: { fetch: { allowed_updates: ['message', 'callback_query'] } },
    });

    this.startedAt = new Date();
    this.deps.logger.info(`[bot ${this.config.id}] grammY runner started`);
  }

  async shutdown() {
    if (this.runner) {
      await this.runner.stop();
      this.runner = null;
    }
    this.bot = null;
    this.startedAt = null;
  }

  getStatus() {
    return {
      running: !!this.runner && this.runner.isRunning(),
      startedAt: this.startedAt,
      lastError: this.lastError,
    };
  }
}
```

**Handler-Module** (`apps/dashboard-backend/src/services/telegram/handlers/`):

Pro Handler eine eigene Datei, alle erhalten denselben Context:

- `startHandler.js` — chat in `telegram_bot_chats` registrieren, Welcome-Message
- `helpHandler.js` — `/help` mit dynamisch generierten Custom-Commands
- `clearHandler.js` — Session aus `telegram_bot_sessions` leeren
- `textHandler.js` — Hauptpfad: Intent-Klassifikation → Reminder-Pfad ODER Chat-Pfad
- `voiceHandler.js` — Whisper-Transkription + Chat-Pfad
- `remindersHandler.js` — `/reminders` Liste, `/cancelreminder N`
- `callbackHandler.js` — Inline-Buttons (z.B. "Reminder bestätigen")

Die Handler sind testbar als reine Funktionen mit gemocktem `ctx`.

**Migration-Strategie:**

1. Neue grammY-`BotInstance` parallel zur Legacy-Implementierung
2. Feature-Flag `TELEGRAM_USE_LEGACY_INGRESS` (default: `false`)
3. Wenn `true` → fallback auf Phase-1-Implementierung; sonst grammY
4. Lokal mit grammY testen, in Production zunächst ein einzelner Bot
5. Nach Validierung: Legacy-Code entfernen (Phase 9)

**Was bleibt unverändert (Phase 2):**

- `telegramBotService.js` — CRUD bleibt identisch
- `telegramIntegrationService.js` — LLM-Aufruf-Logik bleibt (wird in Phase 3 erweitert)
- `telegramMessageSender.js` — wird zur Helper-Bibliothek mit grammY-Wrappern für Markdown→HTML, Long-Message-Splitting

**Akzeptanzkriterien:**

1. Bot mit grammY antwortet auf alle bisherigen `/`-Commands identisch.
2. 429-Errors von Telegram werden automatisch retried (auto-retry-Plugin).
3. Per-Bot-Crash isoliert; andere Bots laufen weiter.
4. Memory pro Bot: <30 MB stabil (gemessen via `process.memoryUsage()`).
5. Latenz `Empfang → Verarbeitung-Start`: median <200 ms (vs Polling-Loop mit 30s long-poll).

**Aufwand:** 4-5 Tage.

---

### Phase 3 — Streaming-UX (Placeholder + editMessageText)

**Ziel:** Statt nach 5-10s eine komplette Antwort zu senden, sofort eine Placeholder-Message senden und token-by-token mit `editMessageText` aktualisieren — wie ChatGPT-im-Browser-Erlebnis.

**Neue Datei:** `apps/dashboard-backend/src/services/telegram/streamingResponseService.js`

```javascript
class StreamingResponseService {
  constructor({ logger, llmService }) { ... }

  /**
   * Streamt LLM-Response in Telegram-Chat.
   * @param {Context} ctx          - grammY context
   * @param {Array}   messages     - LLM-Konversation
   * @param {Object}  opts         - { model, systemPrompt, maxTokens }
   * @returns {Promise<string>}    - Endgültiger Text (für DB-Persistierung)
   */
  async stream(ctx, messages, opts) {
    await ctx.replyWithChatAction('typing');         // sofortiger UX-Cue
    const placeholder = await ctx.reply('…');         // Empty bubble

    const editor = new ThrottledEditor({
      ctx,
      messageId: placeholder.message_id,
      throttleMs: 1200,                               // 1.2s zwischen Edits
      sentenceBoundaryNudgeAfterMs: 600
    });

    let buffer = '';
    let chunkCount = 0;
    const startTs = Date.now();

    try {
      for await (const chunk of this.llmService.streamChat({ messages, ...opts })) {
        const tokenText = chunk.message?.content ?? chunk.delta ?? '';
        if (!tokenText) continue;
        buffer += tokenText;
        chunkCount++;
        await editor.maybeEdit(buffer);
      }
    } catch (err) {
      buffer += `\n\n⚠️ ${err.message}`;
    }

    await editor.flush(buffer);                       // immer Final-Edit

    const totalMs = Date.now() - startTs;
    this.deps.logger.debug(`[stream] ${chunkCount} chunks, ${buffer.length} chars, ${totalMs}ms`);

    return buffer;
  }
}

class ThrottledEditor {
  constructor({ ctx, messageId, throttleMs, sentenceBoundaryNudgeAfterMs }) { ... }

  async maybeEdit(buffer) {
    const now = Date.now();
    const elapsed = now - this.lastEditAt;
    const hasSentenceBoundary = /[.!?\n]\s*$/.test(buffer);

    const shouldEdit =
      elapsed >= this.throttleMs ||
      (hasSentenceBoundary && elapsed >= this.sentenceBoundaryNudgeAfterMs);

    if (!shouldEdit) return;
    if (buffer === this.lastBuffer) return;
    if (buffer.length > 4096) {
      // Long-message-handling: aktuelle Message finalisieren, neue Placeholder anhängen
      return this._splitAndContinue(buffer);
    }

    try {
      await this.ctx.api.editMessageText(this.ctx.chat.id, this.messageId, buffer);
      this.lastEditAt = now;
      this.lastBuffer = buffer;
    } catch (err) {
      // 429? auto-retry handled it. "not modified"? ignore. Sonst loggen.
      if (!/not modified|429/.test(err.description || err.message)) {
        this.deps.logger.warn(`[stream] edit failed: ${err.message}`);
      }
    }
  }

  async flush(buffer) {
    // Finaler Edit erzwingen, ohne Throttle
    try {
      await this.ctx.api.editMessageText(this.ctx.chat.id, this.messageId, buffer);
    } catch (err) { /* ignore */ }
  }

  async _splitAndContinue(buffer) {
    // Schneide bei 4000 Zeichen am letzten Whitespace
    const splitAt = buffer.lastIndexOf('\n', 4000);
    const head = buffer.slice(0, splitAt);
    const tail = buffer.slice(splitAt + 1);

    await this.ctx.api.editMessageText(this.ctx.chat.id, this.messageId, head);
    const next = await this.ctx.reply(tail || '…');
    this.messageId = next.message_id;
    this.lastBuffer = tail;
    this.lastEditAt = Date.now();
  }
}
```

**LLM-Service-Erweiterung** (`apps/dashboard-backend/src/services/telegram/telegramIntegrationService.js`):

- Neue Methode `streamChat({ messages, model, systemPrompt, maxTokens })` → AsyncIterator über Ollama-Stream
- Ollama-Aufruf mit `stream: true` (existiert bereits in `llm-service`-Routen)
- Bei `stream: false`-Fallback (z.B. Claude-API ohne Streaming): einmal yielded mit komplettem Inhalt → kompatibel mit Streaming-Editor

**Markdown-Behandlung:**

- Während des Streamings: **plain text** in der Bubble (Markdown würde halb-gerendert werden, hässlich)
- Bei `flush()`: Final-Edit mit `parse_mode: 'HTML'` und Markdown-zu-HTML-Konvertierung via `telegramMessageSender.formatTelegramMessage()`

**Telegram-API-9.5-Sondermerkmal (optional):**
Falls grammY 1.31+ `sendMessageDraft` exponiert (Bot API 9.3+), nativen Streaming-Modus nutzen statt edits. Detect via `ctx.api.hasMethod('sendMessageDraft')`. Fallback bleibt edit-basiert.

**Akzeptanzkriterien:**

1. Bot-Antwort erscheint **innerhalb 1.5s** als Placeholder-Bubble (nicht erst nach 5s als Komplett-Antwort).
2. Buchstaben fließen sichtbar in die Message ein (Edit alle ~1.2s).
3. Bei Antworten >4096 Zeichen: clean Split in mehrere Messages.
4. Bei Telegram-429: kein Crash, kein User-sichtbares Stottern (auto-retry).
5. Bei Ollama-Crash mid-stream: Buffer bis zum Crash + Fehler-Postfix sichtbar.
6. Final-Edit hat Markdown korrekt zu HTML gerendert.

**Aufwand:** 3 Tage.

---

### Phase 4 — Reminder-System

**Ziel:** "erinnere mich morgen um 10 Uhr an Zahnarzt" → DB-Eintrag → pg-boss-Job → zur Zeit Telegram-Push.

**Neue Dependencies:**

```json
{
  "dependencies": {
    "pg-boss": "^10.1.5",
    "chrono-node": "^2.7.7",
    "luxon": "^3.5.0"
  }
}
```

**Neue DB-Migration:** `services/postgres/init/086_telegram_reminders.sql`

```sql
-- pg-boss schema
CREATE SCHEMA IF NOT EXISTS pgboss;

CREATE TABLE telegram_reminders (
  id BIGSERIAL PRIMARY KEY,
  bot_id INTEGER NOT NULL REFERENCES telegram_bots(id) ON DELETE CASCADE,
  chat_id BIGINT NOT NULL,
  user_id BIGINT,                       -- Telegram from.id für Auditing
  text TEXT NOT NULL,                   -- "Zahnarzt"
  scheduled_at TIMESTAMPTZ NOT NULL,    -- "2026-05-01T10:00:00+02:00"
  timezone TEXT DEFAULT 'Europe/Berlin',
  recurrence TEXT,                      -- NULL | "daily" | "weekly" | "rrule:..."
  status TEXT NOT NULL DEFAULT 'pending', -- pending | fired | cancelled | failed
  pgboss_job_id UUID,                   -- Verbindung zu pg-boss
  created_message_id BIGINT,            -- Telegram message_id der Erstellung
  fired_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_telegram_reminders_bot_chat ON telegram_reminders(bot_id, chat_id);
CREATE INDEX idx_telegram_reminders_scheduled ON telegram_reminders(scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_telegram_reminders_status ON telegram_reminders(status);

-- Audit-Trigger (analog zu anderen Telegram-Tabellen)
CREATE TRIGGER telegram_reminders_updated_at
  BEFORE UPDATE ON telegram_reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Neuer Service:** `apps/dashboard-backend/src/services/telegram/reminderService.js`

```javascript
const PgBoss = require('pg-boss');
const chrono = require('chrono-node');
const { DateTime } = require('luxon');

class ReminderService {
  constructor({ db, logger, dbConnectionString, telegramBotRegistry }) {
    this.db = db;
    this.logger = logger;
    this.registry = telegramBotRegistry;
    this.boss = new PgBoss({ connectionString: dbConnectionString });
  }

  async start() {
    await this.boss.start();
    await this.boss.work('telegram-reminder', async job => {
      await this._fire(job.data);
    });
    this.logger.info('[reminders] pg-boss worker started');
  }

  async stop() {
    await this.boss.stop();
  }

  /**
   * Versuche aus User-Text Reminder-Intent zu extrahieren.
   * @returns {{intent: 'create'|'list'|'cancel'|null, ...}}
   */
  async parseIntent(text, { llmService, locale = 'de' }) {
    // Schnell-Pfad: Regex-Pre-Filter
    if (!/erinner|merk|wecken|reminder|alarm|in \d+ min|um \d{1,2}/i.test(text)) {
      return { intent: null };
    }

    // LLM-Pfad: JSON-Mode für strukturierte Extraktion
    const sysPrompt = `Du extrahierst Reminder-Intents aus deutschen Nachrichten.
Antworte NUR mit JSON, kein anderer Text.
Schema: {"intent":"create"|"list"|"cancel"|"none","when_iso":"<ISO-8601>"|null,"text":"<reminder-text>"|null,"id":<number>|null}
Heutige Zeit: ${new Date().toISOString()}, Zeitzone: Europe/Berlin.
Beispiele:
"erinnere mich um 17 Uhr an Müll rausbringen" → {"intent":"create","when_iso":"2026-04-30T17:00:00+02:00","text":"Müll rausbringen","id":null}
"in 2 Stunden ans Essen" → {"intent":"create","when_iso":"<jetzt+2h>","text":"Essen","id":null}
"zeig meine reminder" → {"intent":"list","when_iso":null,"text":null,"id":null}
"lösch reminder 5" → {"intent":"cancel","when_iso":null,"text":null,"id":5}`;

    const raw = await llmService.completeJSON({ sysPrompt, user: text, model: 'gemma:4-9b' });
    const parsed = this._validateIntent(raw);

    if (parsed.intent === 'create' && parsed.when_iso) {
      // Validierung mit chrono-node als Sanity-Check
      const fallback = chrono.de.parseDate(text);
      if (fallback && Math.abs(new Date(parsed.when_iso) - fallback) > 60 * 60 * 1000) {
        // LLM und chrono >1h auseinander → trau chrono mehr (lokale heuristic)
        parsed.when_iso = fallback.toISOString();
      }
    }

    return parsed;
  }

  async create({ botId, chatId, userId, text, whenIso, timezone = 'Europe/Berlin' }) {
    const scheduledAt = new Date(whenIso);
    if (scheduledAt <= new Date()) {
      throw new Error('Erinnerungs-Zeit liegt in der Vergangenheit');
    }

    const { rows } = await this.db.query(
      `INSERT INTO telegram_reminders (bot_id, chat_id, user_id, text, scheduled_at, timezone)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [botId, chatId, userId, text, scheduledAt, timezone]
    );
    const reminderId = rows[0].id;

    const jobId = await this.boss.send(
      'telegram-reminder',
      { reminderId },
      { startAfter: scheduledAt, retryLimit: 3, retryDelay: 60 }
    );

    await this.db.query(`UPDATE telegram_reminders SET pgboss_job_id = $1 WHERE id = $2`, [
      jobId,
      reminderId,
    ]);

    return { id: reminderId, scheduledAt, text };
  }

  async list({ botId, chatId, status = 'pending' }) {
    const { rows } = await this.db.query(
      `SELECT id, text, scheduled_at, recurrence
       FROM telegram_reminders
       WHERE bot_id = $1 AND chat_id = $2 AND status = $3
       ORDER BY scheduled_at ASC`,
      [botId, chatId, status]
    );
    return rows;
  }

  async cancel({ reminderId, botId }) {
    const { rows } = await this.db.query(
      `SELECT pgboss_job_id FROM telegram_reminders WHERE id = $1 AND bot_id = $2 AND status = 'pending'`,
      [reminderId, botId]
    );
    if (rows.length === 0) throw new Error('Reminder nicht gefunden');
    if (rows[0].pgboss_job_id) await this.boss.cancel(rows[0].pgboss_job_id);
    await this.db.query(
      `UPDATE telegram_reminders SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1`,
      [reminderId]
    );
  }

  async _fire({ reminderId }) {
    const { rows } = await this.db.query(
      `SELECT bot_id, chat_id, text FROM telegram_reminders WHERE id = $1 AND status = 'pending'`,
      [reminderId]
    );
    if (rows.length === 0) {
      this.logger.warn(`[reminder ${reminderId}] not pending or not found`);
      return;
    }

    const { bot_id, chat_id, text } = rows[0];
    const bot = this.registry.bots.get(bot_id);
    if (!bot || !bot.bot) {
      this.logger.error(`[reminder ${reminderId}] bot ${bot_id} not running, marking failed`);
      await this.db.query(
        `UPDATE telegram_reminders SET status = 'failed', failure_reason = 'bot not running' WHERE id = $1`,
        [reminderId]
      );
      return;
    }

    try {
      await bot.bot.api.sendMessage(chat_id, `🔔 <b>Erinnerung:</b> ${escapeHtml(text)}`, {
        parse_mode: 'HTML',
      });
      await this.db.query(
        `UPDATE telegram_reminders SET status = 'fired', fired_at = NOW() WHERE id = $1`,
        [reminderId]
      );
      this.logger.info(`[reminder ${reminderId}] fired to chat ${chat_id}`);
    } catch (err) {
      throw err; // pg-boss retried
    }
  }

  _validateIntent(raw) {
    /* JSON-Schema-Validierung */
  }
}

module.exports = ReminderService;
```

**Handler-Integration** (`textHandler.js`):

```javascript
async function handleText(ctx, deps) {
  const text = ctx.message.text;
  const botId = deps.botConfig.id;
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;

  // 1. Reminder-Intent prüfen
  const intent = await deps.reminderService.parseIntent(text, { llmService: deps.llmService });

  if (intent.intent === 'create' && intent.when_iso && intent.text) {
    const r = await deps.reminderService.create({
      botId,
      chatId,
      userId,
      text: intent.text,
      whenIso: intent.when_iso,
    });
    const when = DateTime.fromISO(r.scheduledAt).setZone('Europe/Berlin').toFormat('dd.MM. HH:mm');
    await ctx.reply(
      `✅ <b>Erinnerung gespeichert</b>\n\n📌 ${escapeHtml(r.text)}\n📅 ${when}\n🆔 ${r.id} <i>(/cancelreminder ${r.id} zum Löschen)</i>`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  if (intent.intent === 'list') {
    return handleListReminders(ctx, deps);
  }

  if (intent.intent === 'cancel' && intent.id) {
    await deps.reminderService.cancel({ reminderId: intent.id, botId });
    await ctx.reply(`🗑️ Reminder ${intent.id} gelöscht.`);
    return;
  }

  // 2. Sonst: Normaler Chat-Pfad mit Streaming
  const session = await deps.conversationStore.load(botId, chatId);
  const messages = [...session.messages, { role: 'user', content: text }];

  const responseText = await deps.streamingResponseService.stream(ctx, messages, {
    model: deps.botConfig.llmModel,
    systemPrompt: deps.botConfig.systemPrompt,
    maxTokens: deps.botConfig.maxResponseTokens,
  });

  await deps.conversationStore.append(botId, chatId, [
    { role: 'user', content: text },
    { role: 'assistant', content: responseText },
  ]);
}
```

**Neue Slash-Commands:**

- `/reminders` — Liste aller pending Reminder mit IDs und Zeiten
- `/cancelreminder <id>` — Reminder löschen
- Beide auch via natürlicher Sprache (Intent-Klassifikation)

**Akzeptanzkriterien:**

1. "erinnere mich um 17 Uhr an X" speichert Reminder mit korrekter Zeit (Europe/Berlin).
2. "in 2 Stunden ans Essen" rechnet relativ korrekt.
3. "morgen früh an Y" → 08:00 nächster Tag (LLM-Heuristic).
4. Zur Reminder-Zeit kommt Push-Nachricht im Chat ohne dass User aktiv sein muss.
5. Backend-Restart verliert keine pending Reminder (pg-boss-Persistenz).
6. `/reminders` listet pending Reminders chronologisch.
7. Bot deaktiviert → Reminder feuert mit `failed`-Status, Notiz im Audit-Log.
8. Wenn LLM-JSON-Mode flaky ist (z.B. nicht-parseable Output): Fallback auf chrono-node + Original-Text als Reminder-Text, oder nur dann normale LLM-Konversation.

**Aufwand:** 4-5 Tage.

---

### Phase 5 — Per-Chat-Rate-Limiter & Open-Access-Hardening

**Ziel:** Da Du "Offen für jeden" gewählt hast (kein Allowlist), brauchen wir wenigstens robusten Per-Chat-Rate-Limit + Logging gegen Abuse. Das schützt vor:

- Flooding durch einzelne Chats
- Zufällige Bot-Entdeckungen via Telegram-Suche
- LLM-Service-Erschöpfung

**Architektur:** grammY-`@grammyjs/ratelimiter`-Plugin (in Phase 2 schon eingebunden) richtet die User-facing Throttle aus. Zusätzlich:

#### `apps/dashboard-backend/src/services/telegram/rateLimitService.js` (refaktoriert)

Existierendes Modul beibehalten, aber:

- **Bug-Fix**: `fail-closed` → `fail-open mit WARN-Log` bei DB-Fehler. Sicherheitsbegründung: Telegram-Bot-Spam ist viel niedrigeres Risiko als komplett blockierter Bot. Alternative: Token-Bucket im Memory mit DB als Backup.
- Memory-First mit DB-Fallback:
  ```javascript
  // In-Memory pro botId+chatId, expiry nach 60s
  const buckets = new Map();
  function check(botId, chatId) {
    const key = `${botId}:${chatId}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now - b.windowStart > 60_000) {
      b = { windowStart: now, count: 0 };
      buckets.set(key, b);
    }
    b.count++;
    return { allowed: b.count <= MAX_PER_MINUTE, count: b.count };
  }
  ```
- DB-Sync alle 30s im Hintergrund (für Persistenz über Restarts hinweg, aber nicht im Hot-Path)

#### Audit-Logging

Neue Tabelle (Migration 087):

```sql
CREATE TABLE telegram_audit (
  id BIGSERIAL PRIMARY KEY,
  bot_id INTEGER REFERENCES telegram_bots(id) ON DELETE CASCADE,
  chat_id BIGINT,
  user_id BIGINT,
  username TEXT,
  event_type TEXT NOT NULL,  -- message_received | message_sent | command | reminder_created | rate_limited | error
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_telegram_audit_bot_time ON telegram_audit(bot_id, created_at DESC);
CREATE INDEX idx_telegram_audit_event ON telegram_audit(event_type);
```

Audit-Hook in `BotInstance` registrieren:

```javascript
this.bot.use(async (ctx, next) => {
  await deps.auditService.log({
    event_type: 'message_received',
    botId,
    chatId,
    userId,
    payload: { text: ctx.message?.text },
  });
  await next();
});
```

#### Open-Access-Warnungen

- Beim ersten unbekannten Chat: Warning im Log + UI-Notification "Neuer unbekannter Chat hat Bot X kontaktiert"
- Optional in Phase 6: User-Action "Chat blockieren" / "Allowlist hinzufügen"

**Akzeptanzkriterien:**

1. 30 Messages innerhalb 60s vom selben Chat → ab Message 11 silent-drop oder freundliche "🚦 Bitte langsamer"-Antwort.
2. DB-Outage → Bot funktioniert weiter (Memory-Limiter), Log warnt.
3. Audit-Log zeigt jeden empfangenen Text, nicht nur Commands.
4. Neuer unbekannter Chat → UI-Notification (Phase 6 implementiert die UI-Seite).

**Aufwand:** 1.5 Tage.

---

### Phase 6 — UI Live-Status & Reminder-Verwaltung

**Ziel:** Dashboard zeigt in Echtzeit, was passiert. Reminder-Liste pro Bot. Per-Bot-Test-Send.

#### Neue Backend-Endpunkte (`apps/dashboard-backend/src/routes/telegram/bots.js`)

```
GET    /api/telegram-bots/:id/diagnostics
       → { isRunning, startedAt, lastError, uptime, msgsLastHour, lastMessageAt }

GET    /api/telegram-bots/:id/reminders
       → [{ id, text, scheduledAt, status, recurrence }, ...]

DELETE /api/telegram-bots/:id/reminders/:reminderId
       → { ok: true }

POST   /api/telegram-bots/:id/test-send
       Body: { chatId, text }
       → Schickt Text via Bot an chatId (nur registrierte Chats erlaubt)

GET    /api/telegram-bots/:id/recent-messages?limit=20
       → [{ at, direction, text, fromUser?, error? }, ...]
       (Aus telegram_audit-Tabelle aggregiert)
```

#### WebSocket-Erweiterungen (`telegramWebSocketService`)

Neue Channels:

- `telegram:bot:<botId>:status` — broadcast bei Status-Wechsel (running/stopped/error)
- `telegram:bot:<botId>:message` — broadcast bei jeder eingehenden/ausgehenden Nachricht (für Live-Audit-Stream)

#### Frontend-Änderungen

**`apps/dashboard-frontend/src/features/telegram/components/BotCard.tsx`:**

- Neuer Live-Status-Indikator: grüner Punkt (running, polling) | gelber Punkt (started but degraded) | roter Punkt (stopped/error)
- "Letzte Nachricht: vor 2 min" prominent mit live-Update via WebSocket
- "Aktuell aktiv: 3 Chats" wenn `recent activity`
- "X Reminders pending"-Badge

**Neuer Tab im `BotDetailsModal.tsx`:**

- **"Live"** — Echtzeit-Audit-Stream der letzten 50 Nachrichten dieses Bots, ähnlich Terminal-Tail. Eingehend/ausgehend differenziert. Filter nach chat_id.
- **"Reminders"** — Tabelle aller pending Reminders dieses Bots. Spalten: ID, Chat, Text, Zeit (lokal), Status. Cancel-Button pro Zeile.
- **"Test senden"** — Inline-Form mit Dropdown der bekannten Chats + Textfeld + Senden-Button → ruft `POST /test-send` auf.

**Neue Hooks:**

- `useBotDiagnosticsQuery(botId)` — TanStack-Query mit `refetchInterval: 5000`
- `useBotRemindersQuery(botId)`
- `useBotLiveMessages(botId)` — WebSocket-Subscription, max 50 in State
- `useTestSendMutation(botId)`

**Akzeptanzkriterien:**

1. BotCard zeigt grüner Punkt bei aktivem Bot, ohne Reload.
2. Beim Senden einer Nachricht im Telegram: Eintrag erscheint im "Live"-Tab des entsprechenden Bots <2s.
3. Reminders-Tab listet alle pending Reminders, Cancel-Button funktioniert.
4. "Test senden" sendet Nachricht an gewählten Chat.
5. Bei Backend-Restart aktualisiert sich Live-Status binnen 10s in der UI.

**Aufwand:** 4 Tage.

---

### Phase 7 — Conversation-Memory mit Token-Budget

**Ziel:** Statt "die letzten N Nachrichten" eine token-budget-basierte Sliding-Window. Macht Konversationen länger sinnvoll, ohne Modell-Performance zu killen.

**Refaktorierung:** `apps/dashboard-backend/src/services/telegram/conversationStore.js` (neu)

```javascript
class ConversationStore {
  constructor({ db, tokenizer }) { ... }

  async load(botId, chatId) {
    const { rows } = await this.db.query(
      `SELECT messages, token_count FROM telegram_bot_sessions
       WHERE bot_id = $1 AND chat_id = $2`,
      [botId, chatId]
    );
    return rows[0] || { messages: [], token_count: 0 };
  }

  async append(botId, chatId, newMessages, opts = {}) {
    const budget = opts.budgetTokens ?? 16_000;
    const session = await this.load(botId, chatId);
    let merged = [...session.messages, ...newMessages];

    // Sliding-Window-Trim
    let totalTokens = this._countTokens(merged);
    while (totalTokens > budget && merged.length > 2) {
      const dropped = merged.shift();
      // Optional: dropped → summary append (Phase-Erweiterung)
      totalTokens -= this._countTokens([dropped]);
    }

    await this.db.query(
      `INSERT INTO telegram_bot_sessions (bot_id, chat_id, messages, token_count)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (bot_id, chat_id)
       DO UPDATE SET messages = $3, token_count = $4, updated_at = NOW()`,
      [botId, chatId, JSON.stringify(merged), totalTokens]
    );
  }

  async clear(botId, chatId) { ... }

  _countTokens(messages) {
    // gpt-tokenizer oder tiktoken (wasm), Fallback: chars/4
    return this.tokenizer ? this.tokenizer.count(messages) : Math.ceil(JSON.stringify(messages).length / 4);
  }
}
```

**Optional (Phase 7+):** Summarization on truncation

- Wenn 1+ Messages gedroppt werden → leichter LLM-Call mit "fasse die folgenden Messages in 2 Sätzen zusammen" → an Anfang als `system`-Message anhängen
- Cost: ein Extra-LLM-Call pro N Messages
- Default: aus, per Bot-Config aktivierbar

**Akzeptanzkriterien:**

1. Konversation mit 50 Hin-und-Her-Turns: Bot erinnert sich an Kontext aus Turn 5 (innerhalb Budget).
2. Turn 100: Trimming erfolgt, Bot vergisst sehr alte Nachrichten gracefully.
3. `/clear` leert Session vollständig.

**Aufwand:** 1.5 Tage.

---

### Phase 8 — Tests

**Ziel:** Regressionssicherheit für gesamtes Telegram-Subsystem.

**Backend (`apps/dashboard-backend/__tests__/telegram/`):**

- `botRegistry.test.js` — Lifecycle: start/stop/restart/shutdown, Crash-Isolation
- `botInstance.grammy.test.js` — Mock-Bot, simulierte Updates, Handler-Routing
- `streamingResponseService.test.js` — Throttle-Edge-Cases, Long-Message-Split, Markdown-Final-Render
- `reminderService.parseIntent.test.js` — Korpus aus 30+ deutschen Reminder-Phrasen, asserted gegen erwartete `when_iso`
- `reminderService.scheduling.test.js` — Mock-pg-boss, Reminder-Create/Cancel/Fire-Workflow
- `conversationStore.test.js` — Token-Budget-Trimming, Append-Idempotenz
- `rateLimitService.test.js` — Memory-Bucket, Fail-Open-on-DB-Error
- `telegramRoutes.integration.test.js` — Vollständiger Pfad: HTTP → DB → Registry → Bot

**Frontend (`apps/dashboard-frontend/src/features/telegram/__tests__/`):**

- `BotCard.test.tsx` — Live-Status-Indikator, Last-Message-Update via WS-Mock
- `BotDetailsModal.RemindersTab.test.tsx` — Liste, Cancel-Button, Empty-State
- `BotDetailsModal.LiveTab.test.tsx` — WebSocket-Stream-Rendering
- `useTestSendMutation.test.ts` — Mutation + Error-Handling

**E2E (`apps/dashboard-frontend/e2e/telegram-bot.spec.ts`):**

- Bot anlegen via Wizard → Mock-Telegram-Setup-Response → erfolgreich angelegt
- Bot deaktivieren → BotCard zeigt grauen Status
- Test-Send via UI → Mock-API erhält Aufruf

**Aufwand:** 3 Tage.

---

### Phase 9 — Docs

**Updates erforderlich:**

- `docs/API_REFERENCE.md` — Neue Endpunkte: `/diagnostics`, `/reminders`, `/test-send`, `/recent-messages`
- `docs/ARCHITECTURE.md` — Sektion "Telegram Bot Subsystem" mit Registry/Instance-Diagramm
- `docs/ENVIRONMENT_VARIABLES.md` — Neue: `TELEGRAM_USE_LEGACY_INGRESS` (default `false`), evtl. `TELEGRAM_REMINDER_TIMEZONE_DEFAULT`
- `docs/DATABASE_SCHEMA.md` — Migrations 086 (reminders), 087 (audit), neue Spalten falls nötig
- `docs/ADMIN_HANDBUCH.md` — Neue Sektion "Telegram-Bot konfigurieren & verwalten"
- `docs/TROUBLESHOOTING.md` — Neue Sektion "Telegram-Bot reagiert nicht" mit Diagnostics-Endpunkt-Verweis
- `.claude/context/telegram.md` — vollständige Aktualisierung der AI-facing Doku
- `CLAUDE.md` — Memory-Index erweitern mit `[Telegram Overhaul](docs/plans/TELEGRAM_BOT_OPTIMIZATION.md)`

**Aufwand:** 1 Tag.

---

## 4. Datenbank-Migrationen Übersicht

| Nummer | Datei                                                 | Inhalt                                                                                                                  |
| ------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 086    | `services/postgres/init/086_telegram_reminders.sql`   | `telegram_reminders` Tabelle + pgboss-Schema                                                                            |
| 087    | `services/postgres/init/087_telegram_audit.sql`       | `telegram_audit` Tabelle + Indizes                                                                                      |
| 088    | `services/postgres/init/088_telegram_bot_runtime.sql` | Optional: `telegram_bots.last_polling_started_at`, `last_polling_error` falls für Diagnostics nicht in-memory ausreicht |

---

## 5. Neue Environment-Variablen

| Name                                  | Default         | Beschreibung                                                               |
| ------------------------------------- | --------------- | -------------------------------------------------------------------------- |
| `TELEGRAM_USE_LEGACY_INGRESS`         | `false`         | Falls `true`: alte Polling-Implementierung statt grammY (Notfall-Rollback) |
| `TELEGRAM_REMINDER_TIMEZONE_DEFAULT`  | `Europe/Berlin` | Default-Zeitzone für Reminder-Parsing                                      |
| `TELEGRAM_RATE_LIMIT_PER_MINUTE`      | `20`            | Per-Chat-Limit (vorher 10, mit Open-Access erhöht)                         |
| `TELEGRAM_STREAM_THROTTLE_MS`         | `1200`          | Streaming-Edit-Intervall                                                   |
| `TELEGRAM_STREAM_SENTENCE_NUDGE_MS`   | `600`           | Edit-Nudge bei Satzende                                                    |
| `TELEGRAM_CONVERSATION_BUDGET_TOKENS` | `16000`         | Sliding-Window-Budget                                                      |
| `PGBOSS_ARCHIVE_COMPLETED_AFTER`      | `7 days`        | pg-boss-Cleanup                                                            |

---

## 6. Risiken & Mitigations

| Risiko                                                             | Wahrscheinlichkeit | Impact  | Mitigation                                                                                                                                                     |
| ------------------------------------------------------------------ | ------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| grammY-Migration bricht Edge-Cases (z.B. Inline-Buttons)           | Mittel             | Hoch    | Feature-Flag `TELEGRAM_USE_LEGACY_INGRESS=true` als Rollback; intensives Testing in Phase 8                                                                    |
| pg-boss läuft nicht stabil auf Jetson-PG                           | Niedrig            | Hoch    | pg-boss ist seit Jahren battle-tested; Fallback: simple `node-cron`-Polling auf `telegram_reminders WHERE status='pending' AND scheduled_at <= NOW()` alle 30s |
| LLM-JSON-Mode-Output flaky (Gemma kennt Schema nicht zuverlässig)  | Mittel             | Mittel  | Validierungs-Stack: Schema-Check + chrono-node-Fallback; Bei wiederholten Fehlern: Reminder-Pfad disabled, normale Konversation                                |
| Telegram-Edit-Limit (1/sec/chat) wird trotz Throttle übersprungen  | Niedrig            | Niedrig | auto-retry-Plugin wartet 1s und retried; UI zeigt kein Stottern                                                                                                |
| Memory-Leak in Bot-Registry bei vielen create/delete-Zyklen        | Niedrig            | Mittel  | Registry tested mit 1000 start/stop-Zyklen, RSS-Memory-Assertion in Test                                                                                       |
| WebSocket-Stream zur UI overloaded (jeder Message-Event broadcast) | Mittel             | Niedrig | Per-Bot-Subscription statt Broadcast; Throttle auf max. 5 Events/sec/Client                                                                                    |
| Open-Access-Bot wird von Spam-Telegram-User entdeckt               | Mittel             | Mittel  | Per-Chat-Rate-Limit ist die primäre Verteidigung; Optional in Zukunft: blockierte-Chats-Tabelle + UI-Action "blockieren"                                       |
| Reminder feuert während Bot grade neu gestartet wird               | Niedrig            | Niedrig | pg-boss retried 3x mit 60s-Delay; Reminder-Job-Worker erst aktiv nachdem Registry geladen ist                                                                  |
| Big-Bang-Branch-Conflicts mit anderen feature-Branches             | Mittel             | Mittel  | Branch früh aus `main` rebasen, kleine PRs für unabhängige Phasen wenn möglich                                                                                 |

---

## 7. Aufwandsschätzung

| Phase | Beschreibung                          | Tage            |
| ----- | ------------------------------------- | --------------- |
| 0     | Sofort-Bug-Fix + Diagnostics          | 0.5             |
| 1     | TelegramBotRegistry                   | 2.0             |
| 2     | grammY-Migration                      | 4.5             |
| 3     | Streaming-UX                          | 3.0             |
| 4     | Reminder-System                       | 4.5             |
| 5     | Rate-Limiter + Audit                  | 1.5             |
| 6     | UI Live-Status + Reminders            | 4.0             |
| 7     | Conversation-Memory                   | 1.5             |
| 8     | Tests                                 | 3.0             |
| 9     | Docs                                  | 1.0             |
|       | **Gesamt (Vollzeit)**                 | **~25.5 Tage**  |
|       | **Gesamt (nebenher, ~50% Effizienz)** | **~6-8 Wochen** |

---

## 8. Roll-out & Validierung

### Pre-Deploy-Checks

1. Alle Tests grün lokal: `./scripts/test/run-tests.sh --backend && ./scripts/test/run-tests.sh --frontend`
2. Migrations 086, 087 (ggf. 088) gegen lokale DB getestet
3. Container-Build erfolgreich: `docker compose build dashboard-backend dashboard-frontend`
4. Env-Variablen in `.env` ergänzt (Defaults reichen, falls keine Custom-Werte)

### Deploy-Sequenz

```bash
# 1. Backup
./arasul backup create

# 2. Pull main + merge feature branch
git checkout main && git merge --no-ff feat/telegram-bot-overhaul

# 3. Migrations werden automatisch gezogen beim Backend-Start
docker compose up -d --build dashboard-backend dashboard-frontend

# 4. Verify
docker compose logs -f dashboard-backend | grep -i telegram
# Expected: "TelegramBotRegistry: initialized N bot(s)" + "[bot X] grammY runner started"
```

### Post-Deploy-Validierung

1. **Bestehender Bot funktioniert weiter:** `/help` → erwartete Antwort
2. **Neuer Bot via Wizard:** Anlegen → `/start` → "Verbindung hergestellt" → Sofort Plain-Text → Streaming-Antwort sichtbar
3. **Reminder:** "erinnere mich in 1 Minute an Test" → 60s warten → Push-Nachricht
4. **UI Live-Status:** BotCard zeigt grünen Punkt, Live-Tab streamt Messages
5. **Test-Send:** UI → Test-Nachricht → kommt im Telegram an
6. **Diagnostics:** `curl /api/telegram-bots/<id>/diagnostics` → Plausible Werte
7. **Rate-Limit:** 25 Messages in 30s → Bot wirft "🚦 Bitte langsamer", Backend-Logs zeigen Drop

### Rollback-Plan

1. **Schnell:** Env-Var `TELEGRAM_USE_LEGACY_INGRESS=true`, Backend-Restart → grammY aus, alte Implementierung aktiv
2. **Vollständig:** `git revert <merge-commit>` + Container-Rebuild
3. **Migrations:** Migration 086 hat `IF NOT EXISTS` → kein Problem bei Re-Apply nach Revert

---

## 9. Offene Entscheidungen / Out-of-Scope

| Thema                                       | Status                       | Anmerkung                                                                                                                           |
| ------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Image-Upload-Support (Multimodal Gemma 4)   | Out-of-Scope                 | Eigener Plan, nach Phase 9                                                                                                          |
| Inline-Queries (`@arasulbot frage`)         | Out-of-Scope                 | Selten gebraucht, später                                                                                                            |
| Group-Chat-Mentions vs. private Chat        | Out-of-Scope                 | Aktuell nur private Chats getestet, Group-Mode in eigenem Plan                                                                      |
| Telegram-Webhooks statt Polling             | Bewusst Out-of-Scope         | Polling reicht für Jetson; Web-Recherche-Empfehlung                                                                                 |
| Per-Bot-Allowlist                           | Out-of-Scope                 | User wählte "Open Access"; UI-Hooks werden vorbereitet (`restrict_users`-Spalte existiert), aber UI/Logik nicht in dieser Iteration |
| Recurring Reminders (jeden Montag um 9 Uhr) | Phase 4-Erweiterung optional | RRule-Spalte vorhanden, aber Parser & UI hinausgeschoben                                                                            |
| Voice-Reply (Bot antwortet per Audio)       | Out-of-Scope                 | TTS-Integration eigener Plan                                                                                                        |

---

## 10. Top-3-Risiko-Aktionsitems

1. **Vor Phase 2 grammY in Isolation prototypen.** 1 Tag-Spike: einzelner Bot mit grammY außerhalb der Codebase, alle bisherigen Commands portiert. Wenn das funktioniert, sicher in Phase 2 starten.
2. **Phase 4 Reminder-Korpus früh aufbauen.** 30+ deutsche Eingaben mit erwarteten Outputs vor LLM-Prompt-Tuning. Sonst Risiko von Endlos-Iteration.
3. **Big-Bang-Risiko: Phase 0 ASAP committen + deployen.** Auch wenn die anderen Phasen Wochen brauchen, ist Phase 0 ein 30-Minuten-Fix. Dadurch hast Du sofort Bot-Funktionalität, ohne den Big-Bang-Branch zu brechen.

---

## Anhang A — Beispiel-Conversation-Flow nach Roll-out

```
👤  /start
🤖  🤖 Willkommen bei Arasul Assistent!
    [...]

👤  Wie ist das Wetter morgen in Berlin?
🤖  [typing 0.5s] [bubble erscheint mit "..."]
    [bubble updated bei 1.2s]: "Ich kann das Wetter leider nicht..."
    [bubble updated bei 2.4s]: "Ich kann das Wetter leider nicht direkt abrufen, aber..."
    [final bei 4s, mit HTML-Formatting]: "Ich kann das Wetter leider nicht direkt abrufen, aber **morgen** in Berlin..."

👤  erinnere mich morgen um 8 Uhr ans Frühstück
🤖  ✅ Erinnerung gespeichert
    📌 Frühstück
    📅 01.05. 08:00
    🆔 7  (/cancelreminder 7 zum Löschen)

👤  /reminders
🤖  📋 Deine Erinnerungen:
    🆔 7  · 01.05. 08:00 · Frühstück
    🆔 8  · 03.05. 14:30 · Zahnarzt

(am nächsten Tag um 8:00)
🤖  🔔 Erinnerung: Frühstück
```

## Anhang B — Beispiel-Diagnostics-Response

```json
GET /api/telegram-bots/3/diagnostics
{
  "botId": 3,
  "name": "Arasul Assistent",
  "username": "arasul_assistant_bot",
  "isActive": true,
  "isRunning": true,
  "startedAt": "2026-04-30T18:23:11.234Z",
  "uptimeSeconds": 7234,
  "lastError": null,
  "msgsLastHour": 14,
  "lastMessageAt": "2026-04-30T20:21:08.555Z",
  "remindersPending": 2,
  "memoryMb": 23.4
}
```
