# Telegram Bot App - Umfassender Refactoring-Plan

**Erstellt:** 2026-02-05
**Status:** Geplant
**Priorität:** Hoch

---

## Executive Summary

Dieses Dokument beschreibt die vollständige Umstrukturierung der Telegram Bot-Funktionalität zu einer App-basierten Architektur. Der Bot wird über ein Dashboard-Icon zugänglich sein (nicht mehr als separater Sidebar-Eintrag), mit einem verbesserten Setup-Wizard und robuster Chat-ID-Erkennung.

---

## Inhaltsverzeichnis

1. [Aktuelle Probleme](#1-aktuelle-probleme)
2. [Ziel-Architektur](#2-ziel-architektur)
3. [Phase 1: Kritische Bugfixes](#phase-1-kritische-bugfixes)
4. [Phase 2: App-Lifecycle Implementation](#phase-2-app-lifecycle-implementation)
5. [Phase 3: UI/UX Redesign](#phase-3-uiux-redesign)
6. [Phase 4: Wizard-Verbesserungen](#phase-4-wizard-verbesserungen)
7. [Phase 5: Testing & Stabilisierung](#phase-5-testing--stabilisierung)
8. [Datei-Änderungen Übersicht](#datei-änderungen-übersicht)
9. [Migrations-Checkliste](#migrations-checkliste)

---

## 1. Aktuelle Probleme

### 1.1 KRITISCH: WebSocket Service fehlt

**Problem:** Der Code referenziert `websocketService.broadcast()` in `telegramApp.js:209`, aber die Datei existiert nicht.

**Datei:** `/services/dashboard-backend/src/routes/telegramApp.js`
```javascript
// Line 209 - Referenziert nicht-existenten Service
websocketService.broadcast('telegram-setup', { setupToken, status, chatId, ... });
```

**Auswirkung:**
- Chat-ID-Erkennung im Wizard funktioniert nicht in Echtzeit
- Frontend muss pollen (3 Sekunden Intervall), aber auch das Polling schlägt fehl
- Benutzer sieht nur Ladeindikator ohne Feedback

### 1.2 KRITISCH: Fehlende Null-Validierung in Webhook-Handler

**Problem:** Der `/start` Command-Handler greift direkt auf `message.chat.id` zu ohne Prüfung.

**Datei:** `/services/dashboard-backend/src/services/telegramWebhookService.js`
```javascript
// Lines 84-87 - Keine Validierung
async function handleStartCommand(bot, token, message) {
  const chatId = message.chat.id;           // Kann crashen wenn message.chat undefined
  const chatType = message.chat.type;       // Keine Prüfung
  const chatTitle = message.chat.title || message.from.first_name;
  const chatUsername = message.chat.username || message.from.username;
```

**Auswirkung:**
- TypeError wenn Telegram malformed Updates sendet
- Fehler wird still verschluckt (Webhook gibt trotzdem 200 OK zurück)
- Benutzer sieht keine Fehlermeldung

### 1.3 Zwei parallele Systeme

**Problem:** Es existieren zwei separate Telegram-Konfigurationssysteme:

1. **Legacy System** (`TelegramSettings.js`) - Für System-Benachrichtigungen
2. **Multi-Bot System** (`TelegramBotsPage.js`) - Für LLM-Bots

**Auswirkung:**
- Verwirrende UX
- Doppelte Code-Pfade
- Inkonsistente Verschlüsselung (SHA-256 vs scrypt)

### 1.4 Sidebar-Eintrag soll entfernt werden

**Aktuell:** "Telegram Bots" ist ein separater Menüpunkt in der Sidebar
**Ziel:** Nur Icon im Dashboard nach erstem Bot-Setup

### 1.5 Unvollständige Features

- "Neue Regel" Button hat keinen onClick Handler (`TelegramBotApp.js:372`)
- "Bearbeiten" Button für Regeln nicht implementiert (`TelegramBotApp.js:428`)
- Alert/Confirm nutzen `window.alert()` statt Custom-Modals

---

## 2. Ziel-Architektur

### 2.1 App-Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TELEGRAM BOT APP LIFECYCLE                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. INITIAL STATE                                                   │
│     └── App ist vorinstalliert aber versteckt                      │
│     └── Kein Icon im Dashboard                                      │
│     └── Kein Sidebar-Eintrag                                        │
│                                                                     │
│  2. ERSTE AKTIVIERUNG (via App Store)                               │
│     └── Admin öffnet App Store                                      │
│     └── Klickt auf "Telegram Bot" App                               │
│     └── Wizard startet automatisch                                  │
│     └── Bot-Token eingeben → Chat verbinden → Fertig                │
│                                                                     │
│  3. AKTIVER ZUSTAND                                                 │
│     └── Icon erscheint im Dashboard-Grid                            │
│     └── Klick öffnet Bot-Verwaltungs-Modal                          │
│     └── Mehrere Bots können erstellt werden                         │
│                                                                     │
│  4. DEAKTIVIERUNG (optional)                                        │
│     └── Alle Bots löschen → Icon verschwindet                       │
│     └── App bleibt installiert, nur versteckt                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Komponenten-Architektur

```
┌─────────────────────────────────────────────────────────────────────┐
│                            FRONTEND                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  App.js                                                             │
│  ├── DashboardHome                                                  │
│  │   └── TelegramAppIcon (conditional)  ←── NEU                     │
│  │       └── onClick → TelegramAppModal                             │
│  │                                                                  │
│  └── Routes                                                         │
│      └── /telegram-app → TelegramAppPage (full-page fallback)       │
│                                                                     │
│  TelegramAppModal (NEU - Haupt-Komponente)                          │
│  ├── Tab: Meine Bots                                                │
│  │   └── BotCard (pro Bot)                                          │
│  │   └── AddBotButton → BotSetupWizard                              │
│  ├── Tab: Bot Details (wenn Bot ausgewählt)                         │
│  │   └── CommandsEditor                                             │
│  │   └── ChatsManager                                               │
│  │   └── SettingsPanel                                              │
│  └── Tab: Benachrichtigungs-Regeln                                  │
│      └── RulesList                                                  │
│      └── RuleEditor                                                 │
│                                                                     │
│  BotSetupWizard (verbessert)                                        │
│  ├── Step 1: Token eingeben                                         │
│  ├── Step 2: LLM-Provider wählen                                    │
│  ├── Step 3: Chat verbinden (QR + Deep Link)                        │
│  └── Step 4: Test & Fertig                                          │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                            BACKEND                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  API Routes (konsolidiert)                                          │
│  └── /api/telegram-app/*  (Haupt-Endpunkte)                         │
│      ├── GET  /status           → App-Status (aktiv/inaktiv)        │
│      ├── GET  /bots             → Liste aller Bots                  │
│      ├── POST /bots             → Bot erstellen                     │
│      ├── PUT  /bots/:id         → Bot aktualisieren                 │
│      ├── DELETE /bots/:id       → Bot löschen                       │
│      ├── POST /bots/:id/activate   → Bot aktivieren                 │
│      ├── POST /bots/:id/deactivate → Bot deaktivieren               │
│      ├── POST /setup/init       → Wizard-Session starten            │
│      ├── POST /setup/validate   → Token validieren                  │
│      ├── GET  /setup/status/:token → Polling-Status                 │
│      └── WS   /ws               → Real-time Updates  ←── NEU        │
│                                                                     │
│  Services                                                           │
│  ├── telegramAppService.js      → Haupt-Logik (NEU)                 │
│  ├── telegramBotService.js      → Bot CRUD (existing)               │
│  ├── telegramWebhookService.js  → Webhook Handler (existing)        │
│  ├── telegramLLMService.js      → LLM Integration (existing)        │
│  └── telegramWebSocketService.js → WebSocket Server (NEU)           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 Datenbank-Schema (Änderungen)

```sql
-- Neue Tabelle für App-Status
CREATE TABLE IF NOT EXISTS telegram_app_status (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES admin_users(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT FALSE,
    first_bot_created_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Index für schnelle Abfragen
CREATE INDEX idx_telegram_app_status_enabled ON telegram_app_status(is_enabled)
WHERE is_enabled = TRUE;

-- Trigger für updated_at
CREATE TRIGGER trigger_telegram_app_status_updated
    BEFORE UPDATE ON telegram_app_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

---

## Phase 1: Kritische Bugfixes

**Priorität:** SOFORT
**Geschätzte Dauer:** 1-2 Tage

### 1.1 WebSocket Service implementieren

**Neue Datei:** `/services/dashboard-backend/src/services/telegramWebSocketService.js`

```javascript
const WebSocket = require('ws');
const logger = require('../utils/logger');

class TelegramWebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // setupToken -> Set<WebSocket>
  }

  initialize(server) {
    this.wss = new WebSocket.Server({
      server,
      path: '/api/telegram-app/ws'
    });

    this.wss.on('connection', (ws, req) => {
      logger.info('Telegram WebSocket client connected');

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data);
          if (message.type === 'subscribe' && message.setupToken) {
            this.subscribeClient(ws, message.setupToken);
          }
        } catch (err) {
          logger.error('WebSocket message parse error:', err);
        }
      });

      ws.on('close', () => {
        this.unsubscribeClient(ws);
      });
    });
  }

  subscribeClient(ws, setupToken) {
    if (!this.clients.has(setupToken)) {
      this.clients.set(setupToken, new Set());
    }
    this.clients.get(setupToken).add(ws);
    logger.info(`Client subscribed to setup token: ${setupToken.substring(0, 8)}...`);
  }

  unsubscribeClient(ws) {
    for (const [token, clients] of this.clients.entries()) {
      if (clients.has(ws)) {
        clients.delete(ws);
        if (clients.size === 0) {
          this.clients.delete(token);
        }
      }
    }
  }

  broadcast(setupToken, data) {
    const clients = this.clients.get(setupToken);
    if (!clients || clients.size === 0) {
      logger.debug(`No clients for setup token: ${setupToken.substring(0, 8)}...`);
      return;
    }

    const message = JSON.stringify(data);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
    logger.info(`Broadcast to ${clients.size} client(s) for token ${setupToken.substring(0, 8)}...`);
  }

  notifySetupComplete(setupToken, chatData) {
    this.broadcast(setupToken, {
      type: 'setup_complete',
      status: 'completed',
      chatId: chatData.chatId,
      chatUsername: chatData.username,
      chatFirstName: chatData.firstName,
      timestamp: new Date().toISOString()
    });
  }
}

module.exports = new TelegramWebSocketService();
```

**Änderung in:** `/services/dashboard-backend/src/index.js`

```javascript
// Nach Server-Erstellung (ca. Zeile 200)
const telegramWebSocketService = require('./services/telegramWebSocketService');
telegramWebSocketService.initialize(server);
```

### 1.2 Null-Validierung in Webhook-Handler

**Datei:** `/services/dashboard-backend/src/services/telegramWebhookService.js`

```javascript
// NEU: Validierungsfunktion am Anfang der Datei
function validateTelegramMessage(message) {
  if (!message) {
    return { valid: false, error: 'Message is null or undefined' };
  }
  if (!message.chat) {
    return { valid: false, error: 'Message.chat is missing' };
  }
  if (typeof message.chat.id !== 'number' && typeof message.chat.id !== 'string') {
    return { valid: false, error: 'Message.chat.id is invalid' };
  }
  return { valid: true };
}

// ÄNDERUNG in handleStartCommand (Zeile 83-116)
async function handleStartCommand(bot, token, message) {
  // NEU: Validierung
  const validation = validateTelegramMessage(message);
  if (!validation.valid) {
    logger.error('Invalid message in handleStartCommand:', validation.error);
    return false;
  }

  const chatId = message.chat.id;
  const chatType = message.chat.type || 'private';
  const chatTitle = message.chat.title || message.from?.first_name || 'Unknown';
  const chatUsername = message.chat.username || message.from?.username || null;

  try {
    // Rest der Funktion...
    logger.info(`/start command received from chat ${chatId} (${chatType})`);

    // Chat registrieren
    await telegramBotService.addChat(bot.id, {
      chatId,
      title: chatTitle,
      type: chatType,
      username: chatUsername
    });

    // Willkommensnachricht senden
    const welcomeMessage = formatWelcomeMessage(bot.name, bot.system_prompt);
    await sendMessage(token, chatId, welcomeMessage, { parse_mode: 'HTML' });

    // WebSocket benachrichtigen (für aktive Setup-Sessions)
    await notifySetupSessionIfExists(chatId, chatUsername, chatTitle);

    return true;
  } catch (error) {
    logger.error('Error in handleStartCommand:', error);
    return false;
  }
}

// NEU: Setup-Session benachrichtigen
async function notifySetupSessionIfExists(chatId, username, firstName) {
  const telegramWebSocketService = require('./telegramWebSocketService');

  try {
    // Aktive Setup-Session für diesen Chat finden
    const result = await database.query(`
      SELECT setup_token
      FROM telegram_setup_sessions
      WHERE status = 'waiting_start'
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      const setupToken = result.rows[0].setup_token;

      // Session aktualisieren
      await database.query(`
        UPDATE telegram_setup_sessions
        SET chat_id = $1, chat_username = $2, chat_first_name = $3,
            status = 'completed', completed_at = NOW()
        WHERE setup_token = $4
      `, [chatId, username, firstName, setupToken]);

      // WebSocket benachrichtigen
      telegramWebSocketService.notifySetupComplete(setupToken, {
        chatId,
        username,
        firstName
      });

      logger.info(`Setup session ${setupToken.substring(0, 8)}... completed for chat ${chatId}`);
    }
  } catch (error) {
    logger.error('Error notifying setup session:', error);
  }
}
```

### 1.3 Fehler-Logging im Webhook-Endpoint

**Datei:** `/services/dashboard-backend/src/routes/telegramBots.js`

```javascript
// ÄNDERUNG: Zeile 43-63
router.post('/webhook/:botId/:secret', async (req, res) => {
  const { botId, secret } = req.params;
  const startTime = Date.now();

  // NEU: Request-Logging
  logger.info(`Webhook received for bot ${botId}`, {
    hasBody: !!req.body,
    updateId: req.body?.update_id,
    hasMessage: !!req.body?.message,
    messageType: req.body?.message?.text ? 'text' :
                 req.body?.message?.voice ? 'voice' :
                 req.body?.message ? 'other' : 'none'
  });

  try {
    const bot = await telegramBotService.getBotByWebhookSecret(parseInt(botId), secret);

    if (!bot) {
      logger.warn(`Invalid webhook attempt for bot ${botId} - secret mismatch`);
      return res.status(401).json({ error: 'Invalid webhook' });
    }

    const success = await telegramWebhookService.processUpdate(parseInt(botId), req.body);

    // NEU: Erfolg/Fehler loggen
    const duration = Date.now() - startTime;
    if (success) {
      logger.info(`Webhook processed successfully for bot ${botId} in ${duration}ms`);
    } else {
      logger.warn(`Webhook processing returned false for bot ${botId}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Webhook processing error:', {
      botId,
      error: error.message,
      stack: error.stack,
      duration,
      requestBody: JSON.stringify(req.body).substring(0, 500)
    });

    // Telegram erwartet 200, sonst Retry
    res.status(200).send('OK');
  }
});
```

---

## Phase 2: App-Lifecycle Implementation

**Priorität:** Hoch
**Geschätzte Dauer:** 2-3 Tage

### 2.1 Neues DB-Schema

**Neue Datei:** `/services/postgres/init/034_telegram_app_schema.sql`

```sql
-- ============================================
-- Telegram App Status Schema
-- Version: 1.0.0
-- ============================================

-- App-Status pro Benutzer
CREATE TABLE IF NOT EXISTS telegram_app_status (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
    is_enabled BOOLEAN DEFAULT FALSE,
    icon_visible BOOLEAN DEFAULT FALSE,
    first_bot_created_at TIMESTAMPTZ,
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    settings JSONB DEFAULT '{
        "defaultLlmProvider": "ollama",
        "notificationsEnabled": true,
        "quietHoursEnabled": false,
        "quietHoursStart": "22:00",
        "quietHoursEnd": "07:00"
    }',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Index für Dashboard-Abfragen
CREATE INDEX IF NOT EXISTS idx_telegram_app_status_visible
ON telegram_app_status(user_id, icon_visible)
WHERE icon_visible = TRUE;

-- Trigger für updated_at
DROP TRIGGER IF EXISTS trigger_telegram_app_status_updated ON telegram_app_status;
CREATE TRIGGER trigger_telegram_app_status_updated
    BEFORE UPDATE ON telegram_app_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Funktion: App-Status sicherstellen
CREATE OR REPLACE FUNCTION ensure_telegram_app_status(p_user_id INTEGER)
RETURNS telegram_app_status AS $$
DECLARE
    result telegram_app_status;
BEGIN
    INSERT INTO telegram_app_status (user_id)
    VALUES (p_user_id)
    ON CONFLICT (user_id) DO UPDATE SET updated_at = NOW()
    RETURNING * INTO result;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Funktion: Icon-Sichtbarkeit aktualisieren
CREATE OR REPLACE FUNCTION update_telegram_app_icon_visibility()
RETURNS TRIGGER AS $$
BEGIN
    -- Wenn ein Bot erstellt wird, Icon anzeigen
    IF TG_OP = 'INSERT' THEN
        UPDATE telegram_app_status
        SET icon_visible = TRUE,
            is_enabled = TRUE,
            first_bot_created_at = COALESCE(first_bot_created_at, NOW()),
            last_activity_at = NOW()
        WHERE user_id = NEW.user_id;
    END IF;

    -- Wenn letzter Bot gelöscht wird, Icon verstecken (optional)
    IF TG_OP = 'DELETE' THEN
        UPDATE telegram_app_status
        SET icon_visible = (
            SELECT COUNT(*) > 0 FROM telegram_bots WHERE user_id = OLD.user_id
        ),
        last_activity_at = NOW()
        WHERE user_id = OLD.user_id;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger auf telegram_bots
DROP TRIGGER IF EXISTS trigger_update_app_icon ON telegram_bots;
CREATE TRIGGER trigger_update_app_icon
    AFTER INSERT OR DELETE ON telegram_bots
    FOR EACH ROW
    EXECUTE FUNCTION update_telegram_app_icon_visibility();

-- Initiale Daten für bestehende Benutzer mit Bots
INSERT INTO telegram_app_status (user_id, is_enabled, icon_visible, first_bot_created_at)
SELECT DISTINCT
    user_id,
    TRUE,
    TRUE,
    MIN(created_at)
FROM telegram_bots
GROUP BY user_id
ON CONFLICT (user_id) DO UPDATE SET
    is_enabled = TRUE,
    icon_visible = TRUE;
```

### 2.2 App Service

**Neue Datei:** `/services/dashboard-backend/src/services/telegramAppService.js`

```javascript
const database = require('../database');
const logger = require('../utils/logger');
const telegramBotService = require('./telegramBotService');

class TelegramAppService {
  /**
   * Prüft ob das Telegram-App-Icon für einen Benutzer sichtbar sein soll
   */
  async isIconVisible(userId) {
    try {
      const result = await database.query(
        `SELECT icon_visible FROM telegram_app_status WHERE user_id = $1`,
        [userId]
      );
      return result.rows[0]?.icon_visible || false;
    } catch (error) {
      logger.error('Error checking icon visibility:', error);
      return false;
    }
  }

  /**
   * Holt den vollständigen App-Status für einen Benutzer
   */
  async getAppStatus(userId) {
    try {
      // Status sicherstellen
      await database.query(
        `SELECT ensure_telegram_app_status($1)`,
        [userId]
      );

      const statusResult = await database.query(`
        SELECT
          is_enabled,
          icon_visible,
          first_bot_created_at,
          last_activity_at,
          settings
        FROM telegram_app_status
        WHERE user_id = $1
      `, [userId]);

      const botsResult = await database.query(`
        SELECT COUNT(*) as total,
               COUNT(*) FILTER (WHERE is_active = TRUE) as active
        FROM telegram_bots
        WHERE user_id = $1
      `, [userId]);

      return {
        status: statusResult.rows[0] || { is_enabled: false, icon_visible: false },
        botCount: {
          total: parseInt(botsResult.rows[0]?.total || 0),
          active: parseInt(botsResult.rows[0]?.active || 0)
        }
      };
    } catch (error) {
      logger.error('Error getting app status:', error);
      throw error;
    }
  }

  /**
   * Aktiviert die App für einen Benutzer (nach erstem Bot-Setup)
   */
  async activateApp(userId) {
    try {
      await database.query(`
        INSERT INTO telegram_app_status (user_id, is_enabled, icon_visible)
        VALUES ($1, TRUE, TRUE)
        ON CONFLICT (user_id) DO UPDATE SET
          is_enabled = TRUE,
          icon_visible = TRUE,
          last_activity_at = NOW()
      `, [userId]);

      logger.info(`Telegram App activated for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error activating app:', error);
      throw error;
    }
  }

  /**
   * Holt App-Daten für das Dashboard-Icon
   */
  async getDashboardAppData(userId) {
    const status = await this.getAppStatus(userId);

    if (!status.status.icon_visible) {
      return null; // Icon nicht anzeigen
    }

    return {
      id: 'telegram-bot-app',
      name: 'Telegram Bot',
      description: `${status.botCount.active} aktive Bot${status.botCount.active !== 1 ? 's' : ''}`,
      icon: 'FiSend',
      status: status.botCount.active > 0 ? 'running' : 'installed',
      hasCustomPage: true,
      customPageRoute: '/telegram-app',
      badge: status.botCount.total > 0 ? status.botCount.total.toString() : null
    };
  }
}

module.exports = new TelegramAppService();
```

### 2.3 Neue API-Endpunkte

**Änderung in:** `/services/dashboard-backend/src/routes/telegramApp.js`

```javascript
// NEU: Am Anfang der Datei
const telegramAppService = require('../services/telegramAppService');

// NEU: App-Status Endpunkt (Zeile ~30)
router.get('/status', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const status = await telegramAppService.getAppStatus(userId);
    res.json(status);
  } catch (error) {
    logger.error('Error getting app status:', error);
    res.status(500).json({ error: 'Failed to get app status' });
  }
});

// NEU: Dashboard-Daten für Icon
router.get('/dashboard-data', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const appData = await telegramAppService.getDashboardAppData(userId);
    res.json({ app: appData }); // null wenn Icon nicht sichtbar
  } catch (error) {
    logger.error('Error getting dashboard data:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});
```

---

## Phase 3: UI/UX Redesign

**Priorität:** Hoch
**Geschätzte Dauer:** 3-4 Tage

### 3.1 Sidebar-Eintrag entfernen

**Datei:** `/services/dashboard-frontend/src/App.js`

```javascript
// ENTFERNEN: Zeilen 485-494
// Dieser Block wird gelöscht:
// <li role="none">
//   <Link to="/telegram-bots" ...>
//     <FiMessageCircle /> <span>Telegram Bots</span>
//   </Link>
// </li>
```

### 3.2 Dashboard-Icon Integration

**Datei:** `/services/dashboard-frontend/src/App.js`

```javascript
// NEU: State für Telegram-App-Daten (in DashboardHome, ca. Zeile 600)
const [telegramAppData, setTelegramAppData] = useState(null);

// NEU: Telegram-App-Daten laden (in useEffect)
useEffect(() => {
  const fetchTelegramAppData = async () => {
    try {
      const response = await fetch('/api/telegram-app/dashboard-data', {
        headers: { Authorization: `Bearer ${localStorage.getItem('arasul_token')}` }
      });
      const data = await response.json();
      setTelegramAppData(data.app);
    } catch (error) {
      console.error('Error fetching telegram app data:', error);
    }
  };

  if (isAuthenticated) {
    fetchTelegramAppData();
  }
}, [isAuthenticated]);

// NEU: Telegram-Icon zum runningApps-Array hinzufügen (im JSX)
// In der service-links-modern Section:
{runningApps && (
  <div className="service-links-modern">
    {/* Existierende Apps */}
    {runningApps.filter(app => app.status === 'running').map(app => (
      // ... existierender Code
    ))}

    {/* NEU: Telegram App Icon */}
    {telegramAppData && (
      <div
        className="service-link-card telegram-app-card"
        onClick={() => setShowTelegramModal(true)}
        role="button"
        tabIndex={0}
      >
        <div className="service-link-icon-wrapper telegram-icon">
          <FiSend className="service-link-icon" />
        </div>
        <div className="service-link-info">
          <span className="service-link-name">{telegramAppData.name}</span>
          <span className="service-link-desc">{telegramAppData.description}</span>
        </div>
        {telegramAppData.badge && (
          <span className="service-link-badge">{telegramAppData.badge}</span>
        )}
      </div>
    )}
  </div>
)}
```

### 3.3 Haupt-Modal Komponente

**Neue Datei:** `/services/dashboard-frontend/src/components/TelegramAppModal.js`

```javascript
import React, { useState, useEffect, useCallback } from 'react';
import {
  FiX, FiPlus, FiSend, FiSettings, FiBell,
  FiMessageCircle, FiPower, FiTrash2, FiEdit2
} from 'react-icons/fi';
import Modal from './Modal';
import BotSetupWizard from './TelegramBots/BotSetupWizard';
import BotDetailsModal from './TelegramBots/BotDetailsModal';
import './TelegramAppModal.css';

function TelegramAppModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('bots');
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [selectedBot, setSelectedBot] = useState(null);
  const [appStatus, setAppStatus] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('arasul_token');
      const headers = { Authorization: `Bearer ${token}` };

      const [botsRes, statusRes] = await Promise.all([
        fetch('/api/telegram-bots', { headers }),
        fetch('/api/telegram-app/status', { headers })
      ]);

      const botsData = await botsRes.json();
      const statusData = await statusRes.json();

      setBots(botsData.bots || []);
      setAppStatus(statusData);
    } catch (err) {
      setError('Fehler beim Laden der Daten');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, fetchData]);

  const handleBotCreated = (newBot) => {
    setBots(prev => [...prev, newBot]);
    setShowWizard(false);
  };

  const handleToggleBot = async (botId, currentActive) => {
    try {
      const token = localStorage.getItem('arasul_token');
      const endpoint = currentActive ? 'deactivate' : 'activate';

      await fetch(`/api/telegram-bots/${botId}/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });

      setBots(prev => prev.map(bot =>
        bot.id === botId ? { ...bot, is_active: !currentActive } : bot
      ));
    } catch (err) {
      console.error('Error toggling bot:', err);
    }
  };

  const handleDeleteBot = async (botId) => {
    if (!window.confirm('Bot wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
      return;
    }

    try {
      const token = localStorage.getItem('arasul_token');
      await fetch(`/api/telegram-bots/${botId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      setBots(prev => prev.filter(bot => bot.id !== botId));
    } catch (err) {
      console.error('Error deleting bot:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Telegram Bot" size="large">
      <div className="telegram-app-modal">
        {/* Tab Navigation */}
        <div className="telegram-tabs">
          <button
            className={`telegram-tab ${activeTab === 'bots' ? 'active' : ''}`}
            onClick={() => setActiveTab('bots')}
          >
            <FiMessageCircle /> Meine Bots
          </button>
          <button
            className={`telegram-tab ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => setActiveTab('notifications')}
          >
            <FiBell /> Benachrichtigungen
          </button>
          <button
            className={`telegram-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <FiSettings /> Einstellungen
          </button>
        </div>

        {/* Tab Content */}
        <div className="telegram-tab-content">
          {activeTab === 'bots' && (
            <div className="telegram-bots-tab">
              <div className="telegram-bots-header">
                <h3>{bots.length} Bot{bots.length !== 1 ? 's' : ''}</h3>
                <button
                  className="btn-primary"
                  onClick={() => setShowWizard(true)}
                >
                  <FiPlus /> Neuer Bot
                </button>
              </div>

              {loading ? (
                <div className="telegram-loading">Laden...</div>
              ) : bots.length === 0 ? (
                <div className="telegram-empty">
                  <FiSend size={48} />
                  <h4>Noch keine Bots</h4>
                  <p>Erstelle deinen ersten Telegram Bot, um loszulegen.</p>
                  <button
                    className="btn-primary"
                    onClick={() => setShowWizard(true)}
                  >
                    <FiPlus /> Bot erstellen
                  </button>
                </div>
              ) : (
                <div className="telegram-bots-grid">
                  {bots.map(bot => (
                    <div key={bot.id} className="telegram-bot-card">
                      <div className="bot-card-header">
                        <div className="bot-info">
                          <h4>{bot.name}</h4>
                          <span className="bot-username">
                            @{bot.bot_username || 'nicht verbunden'}
                          </span>
                        </div>
                        <span className={`bot-status ${bot.is_active ? 'active' : 'inactive'}`}>
                          {bot.is_active ? 'Aktiv' : 'Inaktiv'}
                        </span>
                      </div>

                      <div className="bot-card-stats">
                        <div className="bot-stat">
                          <span className="stat-value">{bot.chat_count || 0}</span>
                          <span className="stat-label">Chats</span>
                        </div>
                        <div className="bot-stat">
                          <span className="stat-value">{bot.command_count || 0}</span>
                          <span className="stat-label">Commands</span>
                        </div>
                        <div className="bot-stat">
                          <span className="stat-value">{bot.llm_provider}</span>
                          <span className="stat-label">LLM</span>
                        </div>
                      </div>

                      <div className="bot-card-actions">
                        <button
                          className={`btn-icon ${bot.is_active ? 'btn-warning' : 'btn-success'}`}
                          onClick={() => handleToggleBot(bot.id, bot.is_active)}
                          title={bot.is_active ? 'Deaktivieren' : 'Aktivieren'}
                        >
                          <FiPower />
                        </button>
                        <button
                          className="btn-icon"
                          onClick={() => setSelectedBot(bot)}
                          title="Bearbeiten"
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          className="btn-icon btn-danger"
                          onClick={() => handleDeleteBot(bot.id)}
                          title="Löschen"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="telegram-notifications-tab">
              {/* Benachrichtigungs-Regeln - aus TelegramBotApp übernehmen */}
              <p>Benachrichtigungs-Regeln werden hier angezeigt.</p>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="telegram-settings-tab">
              {/* App-weite Einstellungen */}
              <p>App-Einstellungen werden hier angezeigt.</p>
            </div>
          )}
        </div>

        {/* Wizard Modal */}
        {showWizard && (
          <BotSetupWizard
            isOpen={showWizard}
            onClose={() => setShowWizard(false)}
            onBotCreated={handleBotCreated}
          />
        )}

        {/* Bot Details Modal */}
        {selectedBot && (
          <BotDetailsModal
            bot={selectedBot}
            isOpen={!!selectedBot}
            onClose={() => setSelectedBot(null)}
            onUpdate={(updatedBot) => {
              setBots(prev => prev.map(b => b.id === updatedBot.id ? updatedBot : b));
              setSelectedBot(null);
            }}
          />
        )}
      </div>
    </Modal>
  );
}

export default TelegramAppModal;
```

### 3.4 CSS Styles

**Neue Datei:** `/services/dashboard-frontend/src/components/TelegramAppModal.css`

```css
/* Telegram App Modal Styles */
.telegram-app-modal {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 500px;
}

/* Tab Navigation */
.telegram-tabs {
  display: flex;
  gap: 0.5rem;
  padding: 0 1rem;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 1.5rem;
}

.telegram-tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 0.9rem;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
}

.telegram-tab:hover {
  color: var(--text-primary);
}

.telegram-tab.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
}

/* Tab Content */
.telegram-tab-content {
  flex: 1;
  padding: 0 1rem 1rem;
  overflow-y: auto;
}

/* Bots Tab */
.telegram-bots-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.telegram-bots-header h3 {
  margin: 0;
  color: var(--text-primary);
}

/* Empty State */
.telegram-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  text-align: center;
  color: var(--text-muted);
}

.telegram-empty svg {
  opacity: 0.3;
  margin-bottom: 1rem;
}

.telegram-empty h4 {
  color: var(--text-primary);
  margin: 0 0 0.5rem;
}

.telegram-empty p {
  margin: 0 0 1.5rem;
}

/* Bot Grid */
.telegram-bots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

/* Bot Card */
.telegram-bot-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.25rem;
  transition: all 0.2s ease;
}

.telegram-bot-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.bot-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.bot-info h4 {
  margin: 0 0 0.25rem;
  color: var(--text-primary);
  font-size: 1rem;
}

.bot-username {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.bot-status {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-weight: 500;
}

.bot-status.active {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.bot-status.inactive {
  background: rgba(148, 163, 184, 0.15);
  color: var(--text-muted);
}

/* Bot Stats */
.bot-card-stats {
  display: flex;
  gap: 1.5rem;
  padding: 1rem 0;
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 1rem;
}

.bot-stat {
  display: flex;
  flex-direction: column;
}

.stat-value {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.stat-label {
  font-size: 0.75rem;
  color: var(--text-muted);
}

/* Bot Actions */
.bot-card-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-icon {
  padding: 0.5rem;
  border: none;
  border-radius: 6px;
  background: var(--bg-dark);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-icon:hover {
  background: var(--primary-color);
  color: white;
}

.btn-icon.btn-danger:hover {
  background: #ef4444;
}

.btn-icon.btn-success {
  color: #22c55e;
}

.btn-icon.btn-warning {
  color: #f59e0b;
}

/* Loading State */
.telegram-loading {
  display: flex;
  justify-content: center;
  padding: 3rem;
  color: var(--text-muted);
}

/* Dashboard Icon Styles */
.service-link-card.telegram-app-card {
  cursor: pointer;
}

.service-link-card.telegram-app-card:hover {
  transform: translateY(-2px);
}

.telegram-icon {
  background: linear-gradient(135deg, #0088cc, #00aaff);
}

.service-link-badge {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: var(--primary-color);
  color: white;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 10px;
}
```

---

## Phase 4: Wizard-Verbesserungen

**Priorität:** Mittel
**Geschätzte Dauer:** 2 Tage

### 4.1 Verbesserter Setup-Wizard

**Änderung in:** `/services/dashboard-frontend/src/components/TelegramBots/BotSetupWizard.js`

```javascript
// NEU: WebSocket-Integration für Real-time Chat-Detection

// State hinzufügen (ca. Zeile 25)
const wsRef = useRef(null);
const pollTimeoutRef = useRef(null);

// NEU: WebSocket-Verbindung für Step 3
useEffect(() => {
  if (currentStep === 3 && formData.token && !chatDetected) {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }
}, [currentStep, formData.token, chatDetected]);

const connectWebSocket = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/telegram-app/ws`;

  try {
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      console.log('WebSocket connected');
      // Subscribe mit Setup-Token
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        setupToken: setupToken
      }));
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'setup_complete') {
          setChatDetected(true);
          setChatInfo({
            chatId: data.chatId,
            username: data.chatUsername,
            firstName: data.chatFirstName
          });
        }
      } catch (err) {
        console.error('WebSocket message error:', err);
      }
    };

    wsRef.current.onerror = () => {
      console.log('WebSocket error, falling back to polling');
      startPolling();
    };

    wsRef.current.onclose = () => {
      console.log('WebSocket closed');
    };
  } catch (err) {
    console.error('WebSocket connection error:', err);
    startPolling();
  }
};

const startPolling = () => {
  const poll = async () => {
    try {
      const response = await fetch(`/api/telegram-app/setup/status/${setupToken}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('arasul_token')}` }
      });
      const data = await response.json();

      if (data.status === 'completed') {
        setChatDetected(true);
        setChatInfo({
          chatId: data.chatId,
          username: data.chatUsername,
          firstName: data.chatFirstName
        });
      } else {
        pollTimeoutRef.current = setTimeout(poll, 2000); // 2 Sekunden
      }
    } catch (err) {
      console.error('Polling error:', err);
      pollTimeoutRef.current = setTimeout(poll, 5000); // Bei Fehler länger warten
    }
  };

  poll();
};
```

### 4.2 Verbesserte Fehlerbehandlung

```javascript
// NEU: Bessere Fehlermeldungen im Wizard

const [errorDetails, setErrorDetails] = useState(null);

const handleTokenValidation = async () => {
  setValidating(true);
  setError(null);
  setErrorDetails(null);

  try {
    const response = await fetch('/api/telegram-bots/validate-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('arasul_token')}`
      },
      body: JSON.stringify({ token: formData.token })
    });

    const data = await response.json();

    if (!response.ok) {
      // Detaillierte Fehlermeldung
      if (response.status === 401) {
        setError('Ungültiger Bot-Token');
        setErrorDetails('Bitte überprüfe den Token. Er sollte das Format "123456789:ABCdefGHI..." haben.');
      } else if (response.status === 409) {
        setError('Bot bereits registriert');
        setErrorDetails('Dieser Bot ist bereits mit einem anderen Account verbunden.');
      } else {
        setError(data.error || 'Validierung fehlgeschlagen');
        setErrorDetails(data.details || 'Bitte versuche es später erneut.');
      }
      return;
    }

    setValidated(true);
    setBotInfo(data.botInfo);
    setFormData(prev => ({
      ...prev,
      name: data.botInfo.first_name || 'Mein Bot'
    }));

  } catch (err) {
    setError('Verbindungsfehler');
    setErrorDetails('Konnte keine Verbindung zum Server herstellen. Bitte prüfe deine Internetverbindung.');
  } finally {
    setValidating(false);
  }
};
```

---

## Phase 5: Testing & Stabilisierung

**Priorität:** Hoch
**Geschätzte Dauer:** 2 Tage

### 5.1 Unit Tests

**Neue Datei:** `/services/dashboard-backend/__tests__/unit/telegramApp.test.js`

```javascript
const telegramAppService = require('../../src/services/telegramAppService');
const telegramWebhookService = require('../../src/services/telegramWebhookService');

describe('Telegram App Service', () => {
  describe('isIconVisible', () => {
    it('should return false for user without bots', async () => {
      // Mock database response
      const result = await telegramAppService.isIconVisible(999);
      expect(result).toBe(false);
    });
  });

  describe('getAppStatus', () => {
    it('should return correct bot counts', async () => {
      const status = await telegramAppService.getAppStatus(1);
      expect(status).toHaveProperty('botCount');
      expect(status.botCount).toHaveProperty('total');
      expect(status.botCount).toHaveProperty('active');
    });
  });
});

describe('Telegram Webhook Service', () => {
  describe('validateTelegramMessage', () => {
    it('should reject null message', () => {
      const result = telegramWebhookService.validateTelegramMessage(null);
      expect(result.valid).toBe(false);
    });

    it('should reject message without chat', () => {
      const result = telegramWebhookService.validateTelegramMessage({ from: {} });
      expect(result.valid).toBe(false);
    });

    it('should accept valid message', () => {
      const result = telegramWebhookService.validateTelegramMessage({
        chat: { id: 123456 },
        from: { id: 789 }
      });
      expect(result.valid).toBe(true);
    });
  });
});
```

### 5.2 Integration Tests

**Neue Datei:** `/services/dashboard-backend/__tests__/integration/telegramSetup.test.js`

```javascript
const request = require('supertest');
const app = require('../../src/index');

describe('Telegram Setup Flow', () => {
  let authToken;
  let setupToken;

  beforeAll(async () => {
    // Login und Token holen
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'test' });
    authToken = loginRes.body.token;
  });

  it('should initialize setup session', async () => {
    const res = await request(app)
      .post('/api/telegram-app/setup/init')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ botName: 'Test Bot' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('setupToken');
    setupToken = res.body.setupToken;
  });

  it('should validate bot token', async () => {
    const res = await request(app)
      .post('/api/telegram-app/setup/validate')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        setupToken,
        botToken: process.env.TEST_BOT_TOKEN
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('botInfo');
  });

  it('should return pending status before /start', async () => {
    const res = await request(app)
      .get(`/api/telegram-app/setup/status/${setupToken}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('waiting_start');
  });
});
```

---

## Datei-Änderungen Übersicht

### Neue Dateien

| Datei | Beschreibung |
|-------|--------------|
| `/services/dashboard-backend/src/services/telegramWebSocketService.js` | WebSocket Server für Real-time Updates |
| `/services/dashboard-backend/src/services/telegramAppService.js` | App-Lifecycle Service |
| `/services/postgres/init/034_telegram_app_schema.sql` | Neues DB-Schema |
| `/services/dashboard-frontend/src/components/TelegramAppModal.js` | Haupt-Modal Komponente |
| `/services/dashboard-frontend/src/components/TelegramAppModal.css` | Modal Styles |
| `/services/dashboard-backend/__tests__/unit/telegramApp.test.js` | Unit Tests |
| `/services/dashboard-backend/__tests__/integration/telegramSetup.test.js` | Integration Tests |

### Geänderte Dateien

| Datei | Änderung |
|-------|----------|
| `/services/dashboard-backend/src/index.js` | WebSocket Service initialisieren |
| `/services/dashboard-backend/src/routes/telegramApp.js` | Neue Endpunkte, WebSocket Integration |
| `/services/dashboard-backend/src/routes/telegramBots.js` | Verbessertes Logging |
| `/services/dashboard-backend/src/services/telegramWebhookService.js` | Null-Validierung, Setup-Notification |
| `/services/dashboard-frontend/src/App.js` | Sidebar-Eintrag entfernen, Dashboard-Icon |
| `/services/dashboard-frontend/src/components/TelegramBots/BotSetupWizard.js` | WebSocket Integration |

### Zu löschende/deprecate Dateien

| Datei | Grund |
|-------|-------|
| `/services/dashboard-frontend/src/components/TelegramBotApp.js` | Durch TelegramAppModal ersetzt |
| `/services/dashboard-frontend/src/telegram-bot-app.css` | Durch TelegramAppModal.css ersetzt |

---

## Migrations-Checkliste

### Pre-Migration

- [ ] Backup der Datenbank erstellen
- [ ] Aktuelle Bot-Konfigurationen dokumentieren
- [ ] Tests für bestehende Funktionalität ausführen

### Phase 1 (Bugfixes)

- [ ] WebSocket Service implementieren
- [ ] Null-Validierung hinzufügen
- [ ] Logging verbessern
- [ ] Tests ausführen

### Phase 2 (App-Lifecycle)

- [ ] DB-Migration ausführen (`034_telegram_app_schema.sql`)
- [ ] App Service implementieren
- [ ] API-Endpunkte hinzufügen
- [ ] Tests ausführen

### Phase 3 (UI/UX)

- [ ] Sidebar-Eintrag entfernen
- [ ] Dashboard-Icon implementieren
- [ ] Modal Komponente implementieren
- [ ] Frontend-Tests ausführen

### Phase 4 (Wizard)

- [ ] WebSocket-Integration im Wizard
- [ ] Fehlerbehandlung verbessern
- [ ] E2E-Tests ausführen

### Phase 5 (Testing)

- [ ] Vollständige Testabdeckung
- [ ] Performance-Tests
- [ ] Benutzer-Akzeptanztests

### Post-Migration

- [ ] Dokumentation aktualisieren
- [ ] BUGS_AND_FIXES.md aktualisieren
- [ ] Release Notes erstellen

---

## Risiken und Mitigationen

| Risiko | Wahrscheinlichkeit | Auswirkung | Mitigation |
|--------|-------------------|------------|------------|
| WebSocket-Verbindungsprobleme hinter Proxy | Mittel | Hoch | Polling-Fallback implementiert |
| Datenbank-Migration fehlerhaft | Niedrig | Hoch | Backup vor Migration, Rollback-Script |
| Breaking Changes für bestehende Bots | Mittel | Mittel | Daten-Migration, keine Schema-Änderungen |
| UI-Regressionen | Mittel | Niedrig | Umfangreiche Frontend-Tests |

---

## Erfolgsmetriken

1. **Wizard Completion Rate:** > 90% der gestarteten Setups werden abgeschlossen
2. **Chat-Detection Time:** < 5 Sekunden nach /start
3. **Error Rate:** < 1% der Webhook-Verarbeitungen
4. **User Satisfaction:** Positive Rückmeldung zur neuen UX

---

## Offene Fragen

1. Soll die alte TelegramBotApp.js komplett entfernt oder als Fallback behalten werden?
2. Sollen bestehende Benutzer automatisch migriert werden oder manuell aktivieren?
3. Wie soll das Verhalten sein wenn der Benutzer alle Bots löscht - Icon verstecken oder behalten?

---

*Dieser Plan wurde erstellt basierend auf einer umfassenden Codebase-Analyse mit 8 spezialisierten Agenten.*
