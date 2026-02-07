/**
 * Telegram Bot App API Routes
 * Zero-Config Setup, Notification Rules, Orchestrator Control
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { requireAuth } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const db = require('../database');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');

// Import orchestrator service (will be created next)
let orchestratorService;
try {
    orchestratorService = require('../services/telegramOrchestratorService');
} catch (e) {
    logger.warn('Telegram Orchestrator Service not yet available');
}

// Import App Service for lifecycle management
const telegramAppService = require('../services/telegramAppService');

// ============================================================================
// APP STATUS ENDPOINTS (Dashboard Integration)
// ============================================================================

/**
 * GET /api/telegram-app/status
 * Get current app status for the authenticated user
 */
router.get('/status', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const status = await telegramAppService.getAppStatus(userId);

    res.json({
        success: true,
        ...status
    });
}));

/**
 * GET /api/telegram-app/dashboard-data
 * Get data for dashboard icon display
 * Returns null if icon should not be shown
 */
router.get('/dashboard-data', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const appData = await telegramAppService.getDashboardAppData(userId);

    // Record activity
    if (appData) {
        telegramAppService.recordActivity(userId).catch(() => {});
    }

    res.json({
        success: true,
        app: appData
    });
}));

/**
 * PUT /api/telegram-app/settings
 * Update app settings
 */
router.put('/settings', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
        throw new ValidationError('Settings object is required');
    }

    const updatedSettings = await telegramAppService.updateSettings(userId, settings);

    res.json({
        success: true,
        settings: updatedSettings
    });
}));

/**
 * GET /api/telegram-app/global-stats
 * Get global stats (admin only in future)
 */
router.get('/global-stats', requireAuth, asyncHandler(async (req, res) => {
    const stats = await telegramAppService.getGlobalStats();

    res.json({
        success: true,
        stats
    });
}));

// ============================================================================
// ZERO-CONFIG SETUP ENDPOINTS
// ============================================================================

/**
 * POST /api/telegram-app/zero-config/init
 * Initialize a new Zero-Config setup session
 * Returns setup_token for the wizard flow
 */
router.post('/zero-config/init', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const userId = req.user.id;

    // Generate unique setup token
    const setupToken = crypto.randomBytes(16).toString('hex');

    // Create session in database
    await db.query(`
        INSERT INTO telegram_setup_sessions (setup_token, user_id, status)
        VALUES ($1, $2, 'pending')
    `, [setupToken, userId]);

    // Log orchestrator thinking
    if (orchestratorService) {
        await orchestratorService.logThinking('setup', setupToken,
            'Setup session initialized',
            { userId, action: 'create_session' }
        );
    }

    logger.info(`Telegram Zero-Config session created for user ${userId}: ${setupToken.slice(0, 8)}...`);

    res.status(201).json({
        success: true,
        setupToken,
        expiresIn: 600, // 10 minutes
        nextStep: 'Enter your bot token from @BotFather',
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/telegram-app/zero-config/token
 * Validate bot token and prepare for chat detection
 */
router.post('/zero-config/token', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const { setupToken, botToken } = req.body;
    const userId = req.user.id;

    if (!setupToken || !botToken) {
        throw new ValidationError('Setup-Token und Bot-Token sind erforderlich');
    }

    // Verify setup session
    const session = await db.query(`
        SELECT * FROM telegram_setup_sessions
        WHERE setup_token = $1 AND user_id = $2 AND status = 'pending'
        AND expires_at > NOW()
    `, [setupToken, userId]);

    if (session.rows.length === 0) {
        throw new NotFoundError('Setup-Session nicht gefunden oder abgelaufen');
    }

    // Validate token with Telegram API
    const axios = require('axios');
    let botInfo;

    try {
        const response = await axios.get(
            `https://api.telegram.org/bot${botToken}/getMe`,
            { timeout: 10000 }
        );

        if (!response.data.ok) {
            throw new Error(response.data.description || 'Token ungültig');
        }

        botInfo = response.data.result;
    } catch (telegramError) {
        const errorMsg = telegramError.response?.data?.description || telegramError.message;
        logger.warn(`Invalid Telegram token: ${errorMsg}`);
        throw new ValidationError(`Bot-Token ungültig: ${errorMsg}`);
    }

    // Encrypt and store token
    const tokenEncrypted = encryptToken(botToken);

    await db.query(`
        UPDATE telegram_setup_sessions
        SET bot_token_encrypted = $1,
            bot_username = $2,
            status = 'waiting_start',
            token_validated_at = NOW()
        WHERE setup_token = $3
    `, [tokenEncrypted, botInfo.username, setupToken]);

    // Log orchestrator thinking
    if (orchestratorService) {
        await orchestratorService.logThinking('setup', setupToken,
            `Token validated for bot @${botInfo.username}`,
            { action: 'token_validated', botUsername: botInfo.username }
        );
    }

    // Generate deep link for the bot
    const deepLink = `https://t.me/${botInfo.username}?start=setup_${setupToken}`;

    logger.info(`Bot token validated: @${botInfo.username} for session ${setupToken.slice(0, 8)}...`);

    res.json({
        success: true,
        botInfo: {
            username: botInfo.username,
            firstName: botInfo.first_name,
            canJoinGroups: botInfo.can_join_groups,
            canReadAllGroupMessages: botInfo.can_read_all_group_messages
        },
        deepLink,
        qrData: deepLink,
        nextStep: 'Scan QR code or click link to start chat with bot',
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/telegram-app/zero-config/status/:token
 * Check setup session status (polling fallback)
 */
router.get('/zero-config/status/:token', requireAuth, asyncHandler(async (req, res) => {
    const { token } = req.params;
    const userId = req.user.id;

    const session = await db.query(`
        SELECT status, chat_id, chat_username, chat_first_name, bot_username
        FROM telegram_setup_sessions
        WHERE setup_token = $1 AND user_id = $2
    `, [token, userId]);

    if (session.rows.length === 0) {
        throw new NotFoundError('Session nicht gefunden');
    }

    const s = session.rows[0];

    res.json({
        status: s.status,
        chatId: s.chat_id,
        chatUsername: s.chat_username,
        chatFirstName: s.chat_first_name,
        botUsername: s.bot_username,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/telegram-app/zero-config/chat-detected
 * Called by the bot when user sends /start (internal endpoint)
 */
router.post('/zero-config/chat-detected', asyncHandler(async (req, res) => {
    const { setupToken, chatId, username, firstName } = req.body;

    // Verify this is a valid waiting session
    const session = await db.query(`
        SELECT * FROM telegram_setup_sessions
        WHERE setup_token = $1 AND status = 'waiting_start'
    `, [setupToken]);

    if (session.rows.length === 0) {
        throw new NotFoundError('Session nicht gefunden oder nicht im Warte-Status');
    }

    // Complete the setup
    await db.query(`
        SELECT complete_telegram_setup($1, $2, $3, $4)
    `, [setupToken, chatId, username, firstName]);

    // Log orchestrator thinking
    if (orchestratorService) {
        await orchestratorService.logThinking('setup', setupToken,
            `Chat detected! User: @${username}, Chat-ID: ${chatId}`,
            { action: 'chat_detected', chatId, username }
        );
    }

    // Broadcast via WebSocket (will be implemented in WebSocket service)
    const websocketService = require('../services/websocketService');
    if (websocketService && websocketService.broadcast) {
        websocketService.broadcast('telegram-setup', {
            setupToken,
            status: 'completed',
            chatId,
            username,
            firstName
        });
    }

    logger.info(`Telegram setup completed: Chat ${chatId} (@${username})`);

    res.json({
        success: true,
        message: 'Setup erfolgreich abgeschlossen',
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/telegram-app/zero-config/complete
 * Finalize setup and send test message
 */
router.post('/zero-config/complete', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const { setupToken } = req.body;
    const userId = req.user.id;

    const session = await db.query(`
        SELECT * FROM telegram_setup_sessions
        WHERE setup_token = $1 AND user_id = $2 AND status = 'completed'
    `, [setupToken, userId]);

    if (session.rows.length === 0) {
        throw new NotFoundError('Abgeschlossene Session nicht gefunden');
    }

    const s = session.rows[0];

    // Send test message
    const botToken = decryptToken(s.bot_token_encrypted);
    const axios = require('axios');

    try {
        await axios.post(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
                chat_id: s.chat_id,
                text: `🎉 <b>Arasul Telegram Bot eingerichtet!</b>\n\n` +
                      `Dein Bot ist jetzt aktiv und wird dir Benachrichtigungen senden.\n\n` +
                      `Verfügbare Befehle:\n` +
                      `/status - System-Status\n` +
                      `/metrics - Aktuelle Metriken\n` +
                      `/help - Hilfe anzeigen\n\n` +
                      `<i>Konfiguriere deine Benachrichtigungsregeln im Arasul Dashboard.</i>`,
                parse_mode: 'HTML'
            },
            { timeout: 10000 }
        );
    } catch (telegramError) {
        logger.warn(`Could not send test message: ${telegramError.message}`);
    }

    // Update app configuration
    await db.query(`
        INSERT INTO app_configurations (app_id, config_key, config_value, is_secret)
        VALUES
            ('telegram-bot-app', 'TELEGRAM_CHAT_ID', $1, false),
            ('telegram-bot-app', 'SETUP_COMPLETED', 'true', false),
            ('telegram-bot-app', 'SETUP_COMPLETED_AT', $2, false)
        ON CONFLICT (app_id, config_key) DO UPDATE
        SET config_value = EXCLUDED.config_value, updated_at = NOW()
    `, [s.chat_id.toString(), new Date().toISOString()]);

    logger.info(`Telegram setup finalized for user ${userId}`);

    res.json({
        success: true,
        message: 'Setup erfolgreich abgeschlossen',
        chatId: s.chat_id,
        botUsername: s.bot_username,
        testMessageSent: true,
        timestamp: new Date().toISOString()
    });
}));

// ============================================================================
// NOTIFICATION RULES ENDPOINTS
// ============================================================================

/**
 * GET /api/telegram-app/rules
 * Get all notification rules for current user
 */
router.get('/rules', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const result = await db.query(`
        SELECT id, name, description, event_source, event_type,
               trigger_condition, severity, message_template,
               cooldown_seconds, is_enabled, trigger_count,
               last_triggered_at, created_at, updated_at
        FROM telegram_notification_rules
        WHERE user_id = $1
        ORDER BY event_source, name
    `, [userId]);

    res.json({
        rules: result.rows,
        total: result.rows.length,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/telegram-app/rules
 * Create a new notification rule
 */
router.post('/rules', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const {
        name,
        description,
        eventSource,
        eventType,
        triggerCondition,
        severity,
        messageTemplate,
        cooldownSeconds,
        isEnabled
    } = req.body;

    if (!name || !eventSource || !eventType || !messageTemplate) {
        throw new ValidationError('Name, Event-Quelle, Event-Typ und Nachrichtenvorlage sind erforderlich');
    }

    const result = await db.query(`
        INSERT INTO telegram_notification_rules
        (name, description, event_source, event_type, trigger_condition,
         severity, message_template, cooldown_seconds, is_enabled, user_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
    `, [
        name,
        description || null,
        eventSource,
        eventType,
        JSON.stringify(triggerCondition || {}),
        severity || 'info',
        messageTemplate,
        cooldownSeconds || 60,
        isEnabled !== false,
        userId
    ]);

    logger.info(`Notification rule created: ${name} by user ${userId}`);

    res.status(201).json({
        success: true,
        rule: result.rows[0],
        timestamp: new Date().toISOString()
    });
}));

/**
 * PUT /api/telegram-app/rules/:id
 * Update an existing notification rule
 */
router.put('/rules/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const updates = req.body;

    // Verify ownership
    const existing = await db.query(`
        SELECT id FROM telegram_notification_rules
        WHERE id = $1 AND user_id = $2
    `, [id, userId]);

    if (existing.rows.length === 0) {
        throw new NotFoundError('Regel nicht gefunden');
    }

    // Build dynamic update query
    const allowedFields = [
        'name', 'description', 'event_source', 'event_type',
        'trigger_condition', 'severity', 'message_template',
        'cooldown_seconds', 'is_enabled'
    ];

    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
        const snakeKey = key.replace(/[A-Z]/g, m => '_' + m.toLowerCase());
        if (allowedFields.includes(snakeKey)) {
            setClauses.push(`${snakeKey} = $${paramIndex}`);
            values.push(snakeKey === 'trigger_condition' ? JSON.stringify(value) : value);
            paramIndex++;
        }
    }

    if (setClauses.length === 0) {
        throw new ValidationError('Keine gültigen Felder zum Aktualisieren');
    }

    values.push(id, userId);

    const result = await db.query(`
        UPDATE telegram_notification_rules
        SET ${setClauses.join(', ')}
        WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
        RETURNING *
    `, values);

    res.json({
        success: true,
        rule: result.rows[0],
        timestamp: new Date().toISOString()
    });
}));

/**
 * DELETE /api/telegram-app/rules/:id
 * Delete a notification rule
 */
router.delete('/rules/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(`
        DELETE FROM telegram_notification_rules
        WHERE id = $1 AND user_id = $2
        RETURNING id, name
    `, [id, userId]);

    if (result.rows.length === 0) {
        throw new NotFoundError('Regel nicht gefunden');
    }

    logger.info(`Notification rule deleted: ${result.rows[0].name}`);

    res.json({
        success: true,
        message: 'Regel gelöscht',
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/telegram-app/rules/:id/test
 * Send a test notification for a rule
 */
router.post('/rules/:id/test', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    // Get rule and user's bot config
    const ruleResult = await db.query(`
        SELECT r.*, c.bot_token_encrypted, c.chat_id
        FROM telegram_notification_rules r
        JOIN telegram_bot_configs c ON c.user_id = r.user_id
        WHERE r.id = $1 AND r.user_id = $2 AND c.is_active = TRUE
    `, [id, userId]);

    if (ruleResult.rows.length === 0) {
        throw new NotFoundError('Regel nicht gefunden oder Bot nicht konfiguriert');
    }

    const rule = ruleResult.rows[0];
    const botToken = decryptToken(rule.bot_token_encrypted);

    // Format test message
    const testMessage = rule.message_template
        .replace(/\{\{event\.(\w+)\}\}/g, '[TEST: $1]')
        .replace(/\{\{timestamp\}\}/g, new Date().toLocaleString('de-DE'));

    // Send test message
    const axios = require('axios');
    await axios.post(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
            chat_id: rule.chat_id,
            text: `🧪 <b>Test-Benachrichtigung</b>\n\n` +
                  `Regel: ${rule.name}\n\n` +
                  `Vorschau:\n${testMessage}`,
            parse_mode: 'HTML'
        },
        { timeout: 10000 }
    );

    logger.info(`Test notification sent for rule ${rule.name}`);

    res.json({
        success: true,
        message: 'Test-Nachricht gesendet',
        timestamp: new Date().toISOString()
    });
}));

// ============================================================================
// ORCHESTRATOR ENDPOINTS
// ============================================================================

/**
 * GET /api/telegram-app/orchestrator/status
 * Get orchestrator and agent status
 */
router.get('/orchestrator/status', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT agent_type, state, last_action, actions_count,
               jsonb_array_length(thinking_log) as thinking_entries
        FROM telegram_orchestrator_state
        ORDER BY last_action DESC
        LIMIT 10
    `);

    res.json({
        agents: result.rows,
        orchestratorMode: process.env.ORCHESTRATOR_MODE || 'master',
        thinkingMode: process.env.THINKING_MODE === 'true',
        skipPermissions: process.env.SKIP_PERMISSIONS === 'true',
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/telegram-app/orchestrator/thinking/:agentType
 * Get thinking logs for a specific agent
 */
router.get('/orchestrator/thinking/:agentType', requireAuth, asyncHandler(async (req, res) => {
    const { agentType } = req.params;
    const { limit = 50 } = req.query;

    const result = await db.query(`
        SELECT thinking_log
        FROM telegram_orchestrator_state
        WHERE agent_type = $1
        ORDER BY last_action DESC
        LIMIT 1
    `, [agentType]);

    if (result.rows.length === 0) {
        return res.json({
            agentType,
            thinkingLog: [],
            timestamp: new Date().toISOString()
        });
    }

    // Get last N entries
    const log = result.rows[0].thinking_log || [];
    const limitedLog = log.slice(-parseInt(limit));

    res.json({
        agentType,
        thinkingLog: limitedLog,
        totalEntries: log.length,
        timestamp: new Date().toISOString()
    });
}));

// ============================================================================
// BOT CONFIG ENDPOINTS
// ============================================================================

/**
 * GET /api/telegram-app/config
 * Get current bot configuration
 */
router.get('/config', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const result = await db.query(`
        SELECT chat_id, bot_username, bot_first_name,
               notifications_enabled, quiet_hours_start, quiet_hours_end,
               min_severity, claude_notifications, system_notifications,
               n8n_notifications, is_active, last_message_at, created_at
        FROM telegram_bot_configs
        WHERE user_id = $1
    `, [userId]);

    if (result.rows.length === 0) {
        return res.json({
            configured: false,
            timestamp: new Date().toISOString()
        });
    }

    res.json({
        configured: true,
        config: result.rows[0],
        timestamp: new Date().toISOString()
    });
}));

/**
 * PUT /api/telegram-app/config
 * Update bot configuration
 */
router.put('/config', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const {
        notificationsEnabled,
        quietHoursStart,
        quietHoursEnd,
        minSeverity,
        claudeNotifications,
        systemNotifications,
        n8nNotifications
    } = req.body;

    await db.query(`
        UPDATE telegram_bot_configs
        SET notifications_enabled = COALESCE($1, notifications_enabled),
            quiet_hours_start = $2,
            quiet_hours_end = $3,
            min_severity = COALESCE($4, min_severity),
            claude_notifications = COALESCE($5, claude_notifications),
            system_notifications = COALESCE($6, system_notifications),
            n8n_notifications = COALESCE($7, n8n_notifications),
            updated_at = NOW()
        WHERE user_id = $8
    `, [
        notificationsEnabled,
        quietHoursStart || null,
        quietHoursEnd || null,
        minSeverity,
        claudeNotifications,
        systemNotifications,
        n8nNotifications,
        userId
    ]);

    logger.info(`Telegram config updated for user ${userId}`);

    res.json({
        success: true,
        message: 'Konfiguration aktualisiert',
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/telegram-app/history
 * Get notification history
 */
router.get('/history', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    const result = await db.query(`
        SELECT h.*, r.name as rule_name
        FROM telegram_notification_history h
        LEFT JOIN telegram_notification_rules r ON r.id = h.rule_id
        WHERE h.user_id = $1
        ORDER BY h.created_at DESC
        LIMIT $2 OFFSET $3
    `, [userId, parseInt(limit), parseInt(offset)]);

    const countResult = await db.query(`
        SELECT COUNT(*) FROM telegram_notification_history WHERE user_id = $1
    `, [userId]);

    res.json({
        history: result.rows,
        total: parseInt(countResult.rows[0].count),
        limit: parseInt(limit),
        offset: parseInt(offset),
        timestamp: new Date().toISOString()
    });
}));

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Encrypt bot token for storage
 * Uses AES-256-GCM with a key derived from JWT_SECRET
 */
function encryptToken(token) {
    const key = crypto.scryptSync(process.env.JWT_SECRET || 'default-secret', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Return IV + AuthTag + Encrypted data as Buffer
    return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);
}

/**
 * Decrypt bot token from storage
 */
function decryptToken(encryptedBuffer) {
    if (!encryptedBuffer) return null;

    const key = crypto.scryptSync(process.env.JWT_SECRET || 'default-secret', 'salt', 32);

    const iv = encryptedBuffer.slice(0, 16);
    const authTag = encryptedBuffer.slice(16, 32);
    const encrypted = encryptedBuffer.slice(32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

module.exports = router;
