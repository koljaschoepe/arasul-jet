/**
 * Telegram Notification Service
 * Sends notifications to Telegram with retry logic and rate limiting
 */

const axios = require('axios');
const db = require('../database');
const logger = require('../utils/logger');

// Configuration
const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 9000]; // Exponential backoff
const RATE_LIMIT_PER_MINUTE = 10;

// Severity emoji mapping
const SEVERITY_EMOJI = {
    critical: '\u{1F6A8}', // Red rotating light
    error: '\u{274C}',     // Red X
    warning: '\u{26A0}',   // Warning sign
    info: '\u{2139}'       // Info symbol
};

// Event type emoji mapping
const EVENT_TYPE_EMOJI = {
    service_status: '\u{1F4E6}',   // Package
    workflow_event: '\u{2699}',    // Gear
    system_boot: '\u{1F504}',      // Refresh
    self_healing: '\u{1FA79}'      // Bandage
};

class TelegramNotificationService {
    constructor() {
        this.botToken = process.env.TELEGRAM_BOT_TOKEN;
        this.defaultChatId = process.env.TELEGRAM_CHAT_ID;
        this.enabled = process.env.TELEGRAM_NOTIFICATIONS_ENABLED !== 'false';
        this.pendingQueue = [];
        this.processingQueue = false;

        if (!this.botToken || !this.defaultChatId) {
            logger.warn('Telegram notifications disabled: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set');
            this.enabled = false;
        } else {
            logger.info('Telegram Notification Service initialized');
        }
    }

    /**
     * Format message for Telegram
     */
    formatMessage(event) {
        const severityEmoji = SEVERITY_EMOJI[event.severity] || '\u{1F4AC}';
        const typeEmoji = EVENT_TYPE_EMOJI[event.event_type] || '\u{1F4CC}';

        const timestamp = new Date(event.created_at || Date.now()).toLocaleString('de-DE', {
            timeZone: 'Europe/Berlin',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        let message = `${severityEmoji} <b>${event.title}</b>\n\n`;
        message += `${typeEmoji} <b>Typ:</b> ${this.formatEventType(event.event_type)}\n`;

        if (event.source_service) {
            message += `\u{1F4E1} <b>Service:</b> <code>${event.source_service}</code>\n`;
        }

        message += `\u{23F0} <b>Zeit:</b> <code>${timestamp}</code>\n`;

        if (event.message) {
            message += `\n<i>${event.message}</i>\n`;
        }

        // Add metadata details if relevant
        if (event.metadata && Object.keys(event.metadata).length > 0) {
            const meta = event.metadata;
            if (meta.old_status && meta.new_status) {
                message += `\n\u{1F504} Status: <code>${meta.old_status}</code> → <code>${meta.new_status}</code>`;
            }
            if (meta.workflow_name) {
                message += `\n\u{1F3F7} Workflow: <code>${meta.workflow_name}</code>`;
            }
            if (meta.duration_ms) {
                message += `\n\u{23F1} Dauer: ${(meta.duration_ms / 1000).toFixed(1)}s`;
            }
            if (meta.error) {
                message += `\n\u{26D4} Fehler: <code>${meta.error}</code>`;
            }
        }

        message += `\n\n<i>Arasul Platform</i>`;

        return message;
    }

    /**
     * Format event type for display
     */
    formatEventType(eventType) {
        const typeMap = {
            service_status: 'Service-Status',
            workflow_event: 'Workflow-Event',
            system_boot: 'System-Start',
            self_healing: 'Self-Healing'
        };
        return typeMap[eventType] || eventType;
    }

    /**
     * Send message to Telegram
     */
    async sendTelegram(chatId, message, parseMode = 'HTML') {
        if (!this.enabled) {
            logger.debug('Telegram notifications disabled, skipping send');
            return { success: false, error: 'Notifications disabled' };
        }

        const url = `${TELEGRAM_API_BASE}${this.botToken}/sendMessage`;

        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            try {
                const response = await axios.post(url, {
                    chat_id: chatId,
                    text: message,
                    parse_mode: parseMode,
                    disable_web_page_preview: true
                }, {
                    timeout: 10000
                });

                if (response.data.ok) {
                    logger.debug(`Telegram message sent successfully to ${chatId}`);
                    return { success: true, messageId: response.data.result.message_id };
                } else {
                    throw new Error(response.data.description || 'Unknown Telegram API error');
                }
            } catch (error) {
                const errorMsg = error.response?.data?.description || error.message;
                logger.warn(`Telegram send attempt ${attempt + 1}/${MAX_RETRIES} failed: ${errorMsg}`);

                // Don't retry on permanent errors
                if (error.response?.status === 400 || error.response?.status === 403) {
                    return { success: false, error: errorMsg, permanent: true };
                }

                if (attempt < MAX_RETRIES - 1) {
                    await this.sleep(RETRY_DELAYS[attempt]);
                }
            }
        }

        return { success: false, error: 'Max retries exceeded' };
    }

    /**
     * Send notification for an event
     */
    async sendNotification(event) {
        if (!this.enabled) {
            return { success: false, error: 'Notifications disabled' };
        }

        try {
            // Check rate limit
            const withinLimit = await this.checkRateLimit(event.event_type);
            if (!withinLimit) {
                logger.warn(`Rate limit exceeded for event type: ${event.event_type}`);
                return { success: false, error: 'Rate limit exceeded' };
            }

            // Get notification settings for admin (or specific user)
            const settings = await this.getNotificationSettings(event.user_id);

            // Check if this event type/severity should be sent
            if (!this.shouldSendNotification(event, settings)) {
                logger.debug(`Notification filtered out: ${event.event_type}/${event.severity}`);
                return { success: false, error: 'Filtered by settings' };
            }

            // Check quiet hours
            if (this.isQuietHours(settings)) {
                logger.debug('Notification suppressed during quiet hours');
                return { success: false, error: 'Quiet hours' };
            }

            // Format and send message
            const message = this.formatMessage(event);
            const chatId = settings?.telegram_chat_id || this.defaultChatId;

            const result = await this.sendTelegram(chatId, message);

            // Update event in database
            if (event.id) {
                await this.markEventSent(event.id, result.success, result.error);
            }

            return result;
        } catch (error) {
            logger.error(`Failed to send notification: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Queue a notification event
     */
    async queueNotification(eventData) {
        try {
            // Record event in database
            const result = await db.query(
                `SELECT record_notification_event($1, $2, $3, $4, $5, $6, $7)`,
                [
                    eventData.event_type,
                    eventData.event_category,
                    eventData.source_service || null,
                    eventData.severity || 'info',
                    eventData.title,
                    eventData.message || null,
                    JSON.stringify(eventData.metadata || {})
                ]
            );

            const eventId = result.rows[0].record_notification_event;
            logger.debug(`Notification event queued with ID: ${eventId}`);

            // Add to pending queue
            this.pendingQueue.push({
                ...eventData,
                id: eventId,
                created_at: new Date()
            });

            // Process queue
            this.processQueue();

            return { success: true, eventId };
        } catch (error) {
            logger.error(`Failed to queue notification: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Process pending notification queue
     */
    async processQueue() {
        if (this.processingQueue || this.pendingQueue.length === 0) {
            return;
        }

        this.processingQueue = true;

        while (this.pendingQueue.length > 0) {
            const event = this.pendingQueue.shift();
            await this.sendNotification(event);

            // Small delay between messages to avoid rate limiting
            if (this.pendingQueue.length > 0) {
                await this.sleep(500);
            }
        }

        this.processingQueue = false;
    }

    /**
     * Process pending notifications from database
     */
    async processPendingFromDb() {
        try {
            const result = await db.query(`SELECT * FROM get_pending_notifications(10)`);

            for (const event of result.rows) {
                await this.sendNotification(event);
                await this.sleep(500);
            }

            return { processed: result.rows.length };
        } catch (error) {
            logger.error(`Failed to process pending notifications: ${error.message}`);
            return { processed: 0, error: error.message };
        }
    }

    /**
     * Check rate limit for event type
     */
    async checkRateLimit(eventType) {
        try {
            const result = await db.query(
                `SELECT check_notification_rate_limit($1, $2, $3, $4)`,
                [null, 'telegram', eventType, RATE_LIMIT_PER_MINUTE]
            );
            return result.rows[0].check_notification_rate_limit;
        } catch (error) {
            logger.error(`Rate limit check failed: ${error.message}`);
            return true; // Allow on error to not block notifications
        }
    }

    /**
     * Get notification settings
     */
    async getNotificationSettings(userId = null) {
        try {
            let query = `
                SELECT * FROM notification_settings
                WHERE channel = 'telegram' AND enabled = TRUE
            `;
            const params = [];

            if (userId) {
                query += ` AND user_id = $1`;
                params.push(userId);
            } else {
                // Get admin settings as default
                query += ` AND user_id = (SELECT id FROM users WHERE username = 'admin' LIMIT 1)`;
            }

            const result = await db.query(query, params);
            return result.rows[0] || null;
        } catch (error) {
            logger.error(`Failed to get notification settings: ${error.message}`);
            return null;
        }
    }

    /**
     * Check if notification should be sent based on settings
     */
    shouldSendNotification(event, settings) {
        if (!settings) {
            return true; // Send if no settings configured
        }

        // Check event type filter
        if (settings.event_types && !settings.event_types.includes(event.event_type)) {
            return false;
        }

        // Check severity filter
        const severityOrder = ['info', 'warning', 'error', 'critical'];
        const minSeverityIndex = severityOrder.indexOf(settings.min_severity || 'info');
        const eventSeverityIndex = severityOrder.indexOf(event.severity || 'info');

        if (eventSeverityIndex < minSeverityIndex) {
            return false;
        }

        return true;
    }

    /**
     * Check if currently in quiet hours
     */
    isQuietHours(settings) {
        if (!settings?.quiet_hours_start || !settings?.quiet_hours_end) {
            return false;
        }

        const now = new Date();
        const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS

        const start = settings.quiet_hours_start;
        const end = settings.quiet_hours_end;

        // Handle overnight quiet hours (e.g., 22:00 to 07:00)
        if (start > end) {
            return currentTime >= start || currentTime <= end;
        }

        return currentTime >= start && currentTime <= end;
    }

    /**
     * Mark event as sent in database
     */
    async markEventSent(eventId, success, error = null) {
        try {
            await db.query(
                `SELECT mark_notification_sent($1, $2, $3)`,
                [eventId, success, error]
            );
        } catch (err) {
            logger.error(`Failed to mark notification sent: ${err.message}`);
        }
    }

    /**
     * Send a simple text message (for testing or direct notifications)
     */
    async sendSimpleMessage(message, chatId = null) {
        const targetChatId = chatId || this.defaultChatId;

        if (!targetChatId) {
            return { success: false, error: 'No chat ID configured' };
        }

        const formattedMessage = `<b>Arasul Platform</b>\n\n${message}`;
        return this.sendTelegram(targetChatId, formattedMessage);
    }

    /**
     * Test connection to Telegram
     */
    async testConnection() {
        if (!this.enabled) {
            return { success: false, error: 'Telegram notifications disabled' };
        }

        try {
            const url = `${TELEGRAM_API_BASE}${this.botToken}/getMe`;
            const response = await axios.get(url, { timeout: 5000 });

            if (response.data.ok) {
                return {
                    success: true,
                    botInfo: {
                        id: response.data.result.id,
                        name: response.data.result.first_name,
                        username: response.data.result.username
                    }
                };
            }

            return { success: false, error: response.data.description };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Get notification statistics
     */
    async getStats() {
        try {
            const result = await db.query(`
                SELECT
                    COUNT(*) as total_events,
                    COUNT(*) FILTER (WHERE notification_sent = TRUE) as sent_count,
                    COUNT(*) FILTER (WHERE notification_sent = FALSE AND retry_count >= 3) as failed_count,
                    COUNT(*) FILTER (WHERE notification_sent = FALSE AND retry_count < 3) as pending_count,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as last_hour_count,
                    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_day_count
                FROM notification_events
            `);

            return {
                ...result.rows[0],
                enabled: this.enabled,
                queueLength: this.pendingQueue.length
            };
        } catch (error) {
            logger.error(`Failed to get notification stats: ${error.message}`);
            return { error: error.message };
        }
    }

    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Singleton instance
const telegramService = new TelegramNotificationService();

module.exports = telegramService;
