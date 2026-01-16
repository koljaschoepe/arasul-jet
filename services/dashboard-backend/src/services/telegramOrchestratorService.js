/**
 * Telegram Bot Master Orchestrator Service
 * Coordinates Sub-Agents: Setup, Notification, Command
 * Implements Thinking Mode and Skip Permissions
 */

const db = require('../database');
const logger = require('../utils/logger');
const EventEmitter = require('events');

// Configuration
const config = {
    thinkingMode: process.env.THINKING_MODE === 'true',
    skipPermissions: process.env.SKIP_PERMISSIONS === 'true',
    orchestratorMode: process.env.ORCHESTRATOR_MODE || 'master'
};

/**
 * Base Agent class with common functionality
 */
class BaseAgent extends EventEmitter {
    constructor(name, options = {}) {
        super();
        this.name = name;
        this.thinkingMode = options.thinkingMode ?? config.thinkingMode;
        this.skipPermissions = options.skipPermissions ?? config.skipPermissions;
        this.sessionId = null;
    }

    /**
     * Log thinking process (for transparency and debugging)
     */
    async think(thought, action = null, metadata = {}) {
        if (!this.thinkingMode) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            agent: this.name,
            thought,
            action,
            metadata
        };

        // Log to console
        logger.debug(`[${this.name} 🧠] ${thought}${action ? ` → ${action}` : ''}`);

        // Log to database
        try {
            await db.query(`
                SELECT log_orchestrator_thinking($1, $2, $3, $4)
            `, [this.name, this.sessionId, thought, action]);
        } catch (err) {
            logger.error(`Error logging thinking: ${err.message}`);
        }

        // Emit event for real-time monitoring
        this.emit('thinking', logEntry);

        return logEntry;
    }

    /**
     * Start a new session
     */
    startSession(sessionId = null) {
        this.sessionId = sessionId || `${this.name}_${Date.now()}`;
        this.think('Session started', 'initialize', { sessionId: this.sessionId });
        return this.sessionId;
    }

    /**
     * End current session
     */
    async endSession(result = {}) {
        await this.think('Session ending', 'finalize', result);
        const sid = this.sessionId;
        this.sessionId = null;
        return sid;
    }
}

/**
 * Setup Agent - Handles Zero-Config Magic Setup
 */
class SetupAgent extends BaseAgent {
    constructor(options = {}) {
        super('setup', options);
    }

    /**
     * Handle setup events
     */
    async handle(event) {
        this.startSession(event.setupToken || event.sessionId);

        try {
            await this.think(`Processing setup event: ${event.type}`);

            switch (event.type) {
                case 'init':
                    return await this.initSetup(event);
                case 'validate_token':
                    return await this.validateToken(event);
                case 'start_received':
                    return await this.handleStartCommand(event);
                case 'complete':
                    return await this.finalizeSetup(event);
                default:
                    await this.think(`Unknown event type: ${event.type}`, 'skip');
                    return { success: false, error: 'Unknown event type' };
            }
        } catch (error) {
            await this.think(`Error: ${error.message}`, 'error');
            throw error;
        } finally {
            await this.endSession();
        }
    }

    async initSetup(event) {
        await this.think('Initializing setup session');

        const crypto = require('crypto');
        const setupToken = crypto.randomBytes(16).toString('hex');

        await this.think(`Generated setup token: ${setupToken.slice(0, 8)}...`, 'token_generated');

        await db.query(`
            INSERT INTO telegram_setup_sessions (setup_token, user_id, status)
            VALUES ($1, $2, 'pending')
        `, [setupToken, event.userId]);

        await this.think('Session stored in database', 'db_insert');

        return {
            success: true,
            setupToken,
            expiresIn: 600
        };
    }

    async validateToken(event) {
        await this.think(`Validating bot token for session ${event.setupToken?.slice(0, 8)}...`);

        const axios = require('axios');

        try {
            await this.think('Calling Telegram API getMe...', 'api_call');

            const response = await axios.get(
                `https://api.telegram.org/bot${event.botToken}/getMe`,
                { timeout: 10000 }
            );

            if (!response.data.ok) {
                await this.think('Token validation failed', 'validation_failed');
                return { success: false, error: 'Invalid token' };
            }

            const botInfo = response.data.result;
            await this.think(`Token valid! Bot: @${botInfo.username}`, 'validation_success');

            return {
                success: true,
                botInfo: {
                    username: botInfo.username,
                    firstName: botInfo.first_name,
                    id: botInfo.id
                }
            };

        } catch (error) {
            await this.think(`API error: ${error.message}`, 'api_error');
            return { success: false, error: error.message };
        }
    }

    async handleStartCommand(event) {
        await this.think(`Start command received from chat ${event.chatId}`);

        // Verify session is in waiting state
        const session = await db.query(`
            SELECT * FROM telegram_setup_sessions
            WHERE setup_token = $1 AND status = 'waiting_start'
        `, [event.setupToken]);

        if (session.rows.length === 0) {
            await this.think('Session not found or invalid state', 'session_invalid');
            return { success: false, error: 'Session not found' };
        }

        await this.think('Session valid, completing setup...', 'completing');

        // Complete the setup
        await db.query(`
            SELECT complete_telegram_setup($1, $2, $3, $4)
        `, [event.setupToken, event.chatId, event.username, event.firstName]);

        await this.think('Setup completed successfully!', 'setup_complete');

        return {
            success: true,
            chatId: event.chatId,
            username: event.username
        };
    }

    async finalizeSetup(event) {
        await this.think('Finalizing setup, sending test message...');

        // This would send the test message
        // Implementation handled by the route

        await this.think('Test message sent, setup finalized', 'finalized');

        return { success: true };
    }
}

/**
 * Notification Agent - Handles sending notifications based on rules
 */
class NotificationAgent extends BaseAgent {
    constructor(options = {}) {
        super('notification', options);
    }

    /**
     * Handle notification events
     */
    async handle(event) {
        this.startSession(event.sessionId);

        try {
            await this.think(`Processing notification event: ${event.type}`);

            switch (event.type) {
                case 'send':
                    return await this.sendNotification(event);
                case 'rule_triggered':
                    return await this.processRule(event);
                case 'broadcast':
                    return await this.broadcastToAll(event);
                default:
                    await this.think(`Unknown event type: ${event.type}`, 'skip');
                    return { success: false, error: 'Unknown event type' };
            }
        } catch (error) {
            await this.think(`Error: ${error.message}`, 'error');
            throw error;
        } finally {
            await this.endSession();
        }
    }

    async sendNotification(event) {
        await this.think(`Sending notification to chat ${event.chatId}`);

        const axios = require('axios');

        try {
            await axios.post(
                `https://api.telegram.org/bot${event.botToken}/sendMessage`,
                {
                    chat_id: event.chatId,
                    text: event.message,
                    parse_mode: event.parseMode || 'HTML'
                },
                { timeout: 10000 }
            );

            await this.think('Notification sent successfully', 'sent');

            // Log to history
            await db.query(`
                INSERT INTO telegram_notification_history
                (user_id, chat_id, event_source, event_type, severity, message_sent, delivered, delivered_at)
                VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
            `, [
                event.userId,
                event.chatId,
                event.eventSource || 'custom',
                event.eventType || 'manual',
                event.severity || 'info',
                event.message
            ]);

            return { success: true };

        } catch (error) {
            await this.think(`Send failed: ${error.message}`, 'send_failed');

            // Log failure to history
            await db.query(`
                INSERT INTO telegram_notification_history
                (user_id, chat_id, event_source, event_type, severity, message_sent, delivered, delivery_error)
                VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)
            `, [
                event.userId,
                event.chatId,
                event.eventSource || 'custom',
                event.eventType || 'manual',
                event.severity || 'info',
                event.message,
                error.message
            ]);

            return { success: false, error: error.message };
        }
    }

    async processRule(event) {
        await this.think(`Processing rule trigger: ${event.ruleId}`);

        // Get rule details
        const ruleResult = await db.query(`
            SELECT r.*, c.bot_token_encrypted, c.chat_id
            FROM telegram_notification_rules r
            JOIN telegram_bot_configs c ON c.user_id = r.user_id
            WHERE r.id = $1 AND r.is_enabled = TRUE AND c.is_active = TRUE
        `, [event.ruleId]);

        if (ruleResult.rows.length === 0) {
            await this.think('Rule not found or disabled', 'rule_invalid');
            return { success: false, error: 'Rule not found' };
        }

        const rule = ruleResult.rows[0];

        // Check cooldown
        const shouldSend = await db.query(`
            SELECT should_send_notification($1)
        `, [event.ruleId]);

        if (!shouldSend.rows[0].should_send_notification) {
            await this.think('Cooldown active, skipping', 'cooldown');
            return { success: false, error: 'Cooldown active' };
        }

        await this.think('Cooldown check passed, formatting message...');

        // Format message using template
        let message = rule.message_template;
        for (const [key, value] of Object.entries(event.data || {})) {
            message = message.replace(new RegExp(`\\{\\{event\\.${key}\\}\\}`, 'g'), value);
        }
        message = message.replace(/\{\{timestamp\}\}/g, new Date().toLocaleString('de-DE'));

        await this.think('Message formatted, sending...', 'sending');

        // Send notification
        const result = await this.sendNotification({
            userId: rule.user_id,
            chatId: rule.chat_id,
            botToken: decryptToken(rule.bot_token_encrypted),
            message,
            eventSource: rule.event_source,
            eventType: rule.event_type,
            severity: rule.severity
        });

        if (result.success) {
            // Mark rule as triggered
            await db.query(`SELECT mark_rule_triggered($1)`, [event.ruleId]);
            await this.think('Rule triggered and logged', 'rule_triggered');
        }

        return result;
    }

    async broadcastToAll(event) {
        await this.think('Broadcasting to all active users...');

        const users = await db.query(`
            SELECT user_id, chat_id, bot_token_encrypted
            FROM telegram_bot_configs
            WHERE is_active = TRUE AND notifications_enabled = TRUE
        `);

        let sent = 0;
        let failed = 0;

        for (const user of users.rows) {
            const result = await this.sendNotification({
                userId: user.user_id,
                chatId: user.chat_id,
                botToken: decryptToken(user.bot_token_encrypted),
                message: event.message,
                eventSource: 'system',
                eventType: 'broadcast',
                severity: event.severity || 'info'
            });

            if (result.success) sent++;
            else failed++;
        }

        await this.think(`Broadcast complete: ${sent} sent, ${failed} failed`, 'broadcast_done');

        return { success: true, sent, failed };
    }
}

/**
 * Command Agent - Handles bot commands (/status, /metrics, etc.)
 */
class CommandAgent extends BaseAgent {
    constructor(options = {}) {
        super('command', options);
    }

    /**
     * Handle command events
     */
    async handle(event) {
        this.startSession(event.sessionId);

        try {
            await this.think(`Processing command: ${event.command}`);

            switch (event.command) {
                case 'status':
                    return await this.handleStatus(event);
                case 'metrics':
                    return await this.handleMetrics(event);
                case 'help':
                    return await this.handleHelp(event);
                case 'services':
                    return await this.handleServices(event);
                default:
                    await this.think(`Unknown command: ${event.command}`, 'unknown');
                    return { success: false, error: 'Unknown command' };
            }
        } catch (error) {
            await this.think(`Error: ${error.message}`, 'error');
            throw error;
        } finally {
            await this.endSession();
        }
    }

    async handleStatus(event) {
        await this.think('Fetching system status...');

        const axios = require('axios');

        try {
            const response = await axios.get(
                'http://dashboard-backend:3001/api/health',
                { timeout: 5000 }
            );

            await this.think('Status fetched successfully', 'status_fetched');

            return {
                success: true,
                status: response.data
            };

        } catch (error) {
            await this.think(`Status fetch failed: ${error.message}`, 'status_failed');
            return { success: false, error: error.message };
        }
    }

    async handleMetrics(event) {
        await this.think('Fetching system metrics...');

        const axios = require('axios');

        try {
            const response = await axios.get(
                'http://dashboard-backend:3001/api/metrics/live',
                { timeout: 5000 }
            );

            await this.think('Metrics fetched successfully', 'metrics_fetched');

            return {
                success: true,
                metrics: response.data
            };

        } catch (error) {
            await this.think(`Metrics fetch failed: ${error.message}`, 'metrics_failed');
            return { success: false, error: error.message };
        }
    }

    async handleHelp(event) {
        await this.think('Generating help message...');

        const helpText = `
*Arasul Telegram Bot - Befehle*

/status - System-Status anzeigen
/metrics - Aktuelle Metriken (CPU, RAM, etc.)
/services - Docker Services Status
/help - Diese Hilfe anzeigen

_Benachrichtigungen konfigurieren: Dashboard → Telegram Bot_
        `.trim();

        await this.think('Help message generated', 'help_generated');

        return {
            success: true,
            message: helpText
        };
    }

    async handleServices(event) {
        await this.think('Fetching services status...');

        const axios = require('axios');

        try {
            const response = await axios.get(
                'http://dashboard-backend:3001/api/services/status',
                { timeout: 10000 }
            );

            await this.think('Services status fetched', 'services_fetched');

            return {
                success: true,
                services: response.data
            };

        } catch (error) {
            await this.think(`Services fetch failed: ${error.message}`, 'services_failed');
            return { success: false, error: error.message };
        }
    }
}

/**
 * Master Orchestrator - Coordinates all agents
 */
class TelegramOrchestrator extends EventEmitter {
    constructor() {
        super();

        this.config = config;
        this.agents = {
            setup: new SetupAgent({ thinkingMode: config.thinkingMode, skipPermissions: config.skipPermissions }),
            notification: new NotificationAgent({ thinkingMode: config.thinkingMode, skipPermissions: config.skipPermissions }),
            command: new CommandAgent({ thinkingMode: config.thinkingMode, skipPermissions: config.skipPermissions })
        };

        // Forward thinking events from agents
        for (const [name, agent] of Object.entries(this.agents)) {
            agent.on('thinking', (entry) => {
                this.emit('agent-thinking', { agent: name, ...entry });
            });
        }

        logger.info(`Telegram Orchestrator initialized (thinking: ${config.thinkingMode}, skipPermissions: ${config.skipPermissions})`);
    }

    /**
     * Dispatch event to appropriate agent
     */
    async dispatch(event) {
        const agentMap = {
            // Setup events
            'setup.init': 'setup',
            'setup.validate_token': 'setup',
            'setup.start_received': 'setup',
            'setup.complete': 'setup',

            // Notification events
            'notification.send': 'notification',
            'notification.rule_triggered': 'notification',
            'notification.broadcast': 'notification',

            // Command events
            'command.status': 'command',
            'command.metrics': 'command',
            'command.help': 'command',
            'command.services': 'command'
        };

        const agentName = agentMap[event.type];

        if (!agentName) {
            logger.warn(`No agent found for event type: ${event.type}`);
            return { success: false, error: 'Unknown event type' };
        }

        const agent = this.agents[agentName];

        // Extract the sub-type (e.g., 'setup.init' -> 'init')
        const subType = event.type.split('.')[1];

        return agent.handle({ ...event, type: subType });
    }

    /**
     * Log thinking for orchestrator itself
     */
    async logThinking(agentType, sessionId, thought, action = null) {
        try {
            await db.query(`
                SELECT log_orchestrator_thinking($1, $2, $3, $4)
            `, [agentType, sessionId, thought, action]);
        } catch (err) {
            logger.error(`Error logging orchestrator thinking: ${err.message}`);
        }
    }

    /**
     * Get agent status
     */
    async getStatus() {
        const result = await db.query(`
            SELECT agent_type, state, last_action, actions_count,
                   jsonb_array_length(COALESCE(thinking_log, '[]'::jsonb)) as thinking_entries
            FROM telegram_orchestrator_state
            ORDER BY last_action DESC
        `);

        return {
            agents: Object.keys(this.agents),
            config: this.config,
            state: result.rows
        };
    }
}

/**
 * Helper function to decrypt bot token
 */
function decryptToken(encryptedBuffer) {
    if (!encryptedBuffer) return null;

    const crypto = require('crypto');
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

// Singleton instance
const orchestrator = new TelegramOrchestrator();

module.exports = orchestrator;
module.exports.SetupAgent = SetupAgent;
module.exports.NotificationAgent = NotificationAgent;
module.exports.CommandAgent = CommandAgent;
