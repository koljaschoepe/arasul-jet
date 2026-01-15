/**
 * Telegram Bot Configuration API routes
 * Handles bot token storage, retrieval, and test message sending
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
const { apiLimiter, createUserRateLimiter } = require('../middleware/rateLimit');
const db = require('../database');
const logger = require('../utils/logger');

// Rate limiter for test endpoint (5 tests per minute)
const testLimiter = createUserRateLimiter(5, 60 * 1000);

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Get encryption key from JWT_SECRET (32 bytes for AES-256)
 */
function getEncryptionKey() {
    const secret = process.env.JWT_SECRET || '';
    // Use SHA-256 to derive a 32-byte key from the secret
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a string using AES-256-GCM
 */
function encrypt(text) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
        encrypted,
        iv: iv.toString('hex'),
        tag: tag.toString('hex')
    };
}

/**
 * Decrypt a string using AES-256-GCM
 */
function decrypt(encrypted, ivHex, tagHex) {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Mask a bot token for display (show first 5 and last 3 characters)
 */
function maskToken(token) {
    if (!token || token.length < 10) {
        return '***';
    }
    return `${token.substring(0, 5)}...${token.substring(token.length - 3)}`;
}

/**
 * POST /api/telegram/config
 * Save Telegram bot configuration (token and optional chat ID)
 */
router.post('/config', requireAuth, apiLimiter, async (req, res) => {
    try {
        const { bot_token, chat_id, enabled } = req.body;

        // Validate input
        if (!bot_token || typeof bot_token !== 'string') {
            return res.status(400).json({
                error: 'Bot token is required',
                timestamp: new Date().toISOString()
            });
        }

        // Basic validation of bot token format (should contain a colon)
        if (!bot_token.includes(':')) {
            return res.status(400).json({
                error: 'Invalid bot token format',
                timestamp: new Date().toISOString()
            });
        }

        // Encrypt the token
        const { encrypted, iv, tag } = encrypt(bot_token);

        // Upsert configuration (single record with id=1)
        await db.query(`
            INSERT INTO telegram_config (id, bot_token_encrypted, bot_token_iv, bot_token_tag, chat_id, enabled, updated_at)
            VALUES (1, $1, $2, $3, $4, $5, NOW())
            ON CONFLICT (id) DO UPDATE SET
                bot_token_encrypted = $1,
                bot_token_iv = $2,
                bot_token_tag = $3,
                chat_id = COALESCE($4, telegram_config.chat_id),
                enabled = COALESCE($5, telegram_config.enabled),
                updated_at = NOW()
        `, [encrypted, iv, tag, chat_id || null, enabled !== undefined ? enabled : true]);

        logger.info(`Telegram config updated by user ${req.user.username}`);

        res.json({
            success: true,
            message: 'Telegram configuration saved successfully',
            token_masked: maskToken(bot_token),
            chat_id: chat_id || null,
            enabled: enabled !== undefined ? enabled : true,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error saving Telegram config: ${error.message}`);
        res.status(500).json({
            error: 'Failed to save Telegram configuration',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/telegram/config
 * Retrieve Telegram bot configuration (token is masked)
 */
router.get('/config', requireAuth, async (req, res) => {
    try {
        const result = await db.query(`
            SELECT bot_token_encrypted, bot_token_iv, bot_token_tag, chat_id, enabled, created_at, updated_at
            FROM telegram_config
            WHERE id = 1
        `);

        if (result.rows.length === 0) {
            return res.json({
                configured: false,
                token_masked: null,
                chat_id: null,
                enabled: false,
                timestamp: new Date().toISOString()
            });
        }

        const config = result.rows[0];
        let tokenMasked = null;

        // Decrypt and mask the token for display
        if (config.bot_token_encrypted && config.bot_token_iv && config.bot_token_tag) {
            try {
                const decryptedToken = decrypt(
                    config.bot_token_encrypted,
                    config.bot_token_iv,
                    config.bot_token_tag
                );
                tokenMasked = maskToken(decryptedToken);
            } catch (decryptError) {
                logger.error(`Failed to decrypt Telegram token: ${decryptError.message}`);
                tokenMasked = '*** (decryption error)';
            }
        }

        res.json({
            configured: true,
            token_masked: tokenMasked,
            chat_id: config.chat_id,
            enabled: config.enabled,
            created_at: config.created_at,
            updated_at: config.updated_at,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error retrieving Telegram config: ${error.message}`);
        res.status(500).json({
            error: 'Failed to retrieve Telegram configuration',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/telegram/test
 * Send a test message via Telegram Bot API
 */
router.post('/test', requireAuth, testLimiter, async (req, res) => {
    try {
        const { chat_id: requestChatId } = req.body;

        // Get configuration from database
        const result = await db.query(`
            SELECT bot_token_encrypted, bot_token_iv, bot_token_tag, chat_id, enabled
            FROM telegram_config
            WHERE id = 1
        `);

        if (result.rows.length === 0) {
            return res.status(400).json({
                error: 'Telegram bot is not configured',
                timestamp: new Date().toISOString()
            });
        }

        const config = result.rows[0];

        // Check if we have the required token
        if (!config.bot_token_encrypted || !config.bot_token_iv || !config.bot_token_tag) {
            return res.status(400).json({
                error: 'Telegram bot token is not configured',
                timestamp: new Date().toISOString()
            });
        }

        // Decrypt the token
        let botToken;
        try {
            botToken = decrypt(
                config.bot_token_encrypted,
                config.bot_token_iv,
                config.bot_token_tag
            );
        } catch (decryptError) {
            logger.error(`Failed to decrypt Telegram token for test: ${decryptError.message}`);
            return res.status(500).json({
                error: 'Failed to decrypt bot token',
                timestamp: new Date().toISOString()
            });
        }

        // Determine chat ID (from request or stored config)
        const chatId = requestChatId || config.chat_id;

        if (!chatId) {
            return res.status(400).json({
                error: 'Chat ID is required. Provide it in the request or configure a default.',
                timestamp: new Date().toISOString()
            });
        }

        // Send test message via Telegram Bot API
        const testMessage = '✅ Arasul Platform: Test erfolgreich!\n\nDie Telegram-Integration funktioniert korrekt.';

        const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

        const response = await axios.post(telegramApiUrl, {
            chat_id: chatId,
            text: testMessage,
            parse_mode: 'HTML'
        }, {
            timeout: 10000 // 10 second timeout
        });

        if (response.data.ok) {
            // Update chat_id in config if provided in request and different from stored
            if (requestChatId && requestChatId !== config.chat_id) {
                await db.query(`
                    UPDATE telegram_config
                    SET chat_id = $1, updated_at = NOW()
                    WHERE id = 1
                `, [requestChatId]);
            }

            logger.info(`Telegram test message sent successfully by user ${req.user.username} to chat ${chatId}`);

            res.json({
                success: true,
                message: 'Test message sent successfully',
                chat_id: chatId,
                message_id: response.data.result.message_id,
                timestamp: new Date().toISOString()
            });
        } else {
            throw new Error(response.data.description || 'Unknown Telegram API error');
        }

    } catch (error) {
        logger.error(`Error sending Telegram test message: ${error.message}`);

        // Handle specific Telegram API errors
        if (error.response && error.response.data) {
            const telegramError = error.response.data;
            return res.status(400).json({
                error: 'Telegram API error',
                details: telegramError.description || 'Unknown error',
                error_code: telegramError.error_code,
                timestamp: new Date().toISOString()
            });
        }

        // Handle network errors
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
            return res.status(504).json({
                error: 'Telegram API timeout',
                details: 'Could not reach Telegram servers',
                timestamp: new Date().toISOString()
            });
        }

        res.status(500).json({
            error: 'Failed to send test message',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ===========================
// Audit Log Endpoints
// ===========================

/**
 * GET /api/telegram/audit-logs
 * Get bot audit logs with filtering and pagination
 *
 * Query params:
 * - limit: Number of records (default: 50, max: 200)
 * - offset: Number of records to skip (default: 0)
 * - userId: Filter by Telegram user ID
 * - chatId: Filter by chat ID
 * - command: Filter by command
 * - success: Filter by success status ('true' or 'false')
 * - startDate: Filter from date (ISO string)
 * - endDate: Filter to date (ISO string)
 */
router.get('/audit-logs', requireAuth, async (req, res) => {
    try {
        const {
            limit = 50,
            offset = 0,
            userId,
            chatId,
            command,
            success,
            startDate,
            endDate
        } = req.query;

        // Validate and sanitize inputs
        const parsedLimit = Math.min(parseInt(limit) || 50, 200);
        const parsedOffset = parseInt(offset) || 0;

        const conditions = [];
        const params = [];
        let paramIndex = 1;

        if (userId) {
            conditions.push(`user_id = $${paramIndex++}`);
            params.push(parseInt(userId));
        }

        if (chatId) {
            conditions.push(`chat_id = $${paramIndex++}`);
            params.push(parseInt(chatId));
        }

        if (command) {
            conditions.push(`command = $${paramIndex++}`);
            params.push(command);
        }

        if (success === 'true') {
            conditions.push('success = true');
        } else if (success === 'false') {
            conditions.push('success = false');
        }

        if (startDate) {
            conditions.push(`timestamp >= $${paramIndex++}`);
            params.push(new Date(startDate));
        }

        if (endDate) {
            conditions.push(`timestamp <= $${paramIndex++}`);
            params.push(new Date(endDate));
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) FROM bot_audit_log ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get logs
        const logsResult = await db.query(
            `SELECT id, timestamp, user_id, username, chat_id, command,
                    message_text, response_text, response_time_ms,
                    success, error_message, interaction_type, metadata
             FROM bot_audit_log
             ${whereClause}
             ORDER BY timestamp DESC
             LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            [...params, parsedLimit, parsedOffset]
        );

        res.json({
            logs: logsResult.rows,
            pagination: {
                total,
                limit: parsedLimit,
                offset: parsedOffset,
                hasMore: parsedOffset + logsResult.rows.length < total
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error fetching audit logs: ${error.message}`);
        res.status(500).json({
            error: 'Failed to fetch audit logs',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/telegram/audit-logs/stats
 * Get audit log statistics
 *
 * Query params:
 * - days: Number of days to include (default: 7)
 */
router.get('/audit-logs/stats', requireAuth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 7;

        // Daily stats
        const dailyResult = await db.query(
            `SELECT * FROM bot_audit_daily_stats
             WHERE date >= CURRENT_DATE - $1::INTEGER
             ORDER BY date DESC`,
            [days]
        );

        // Command stats
        const commandResult = await db.query(
            `SELECT * FROM bot_audit_command_stats
             LIMIT 20`
        );

        // Overall stats
        const overallResult = await db.query(
            `SELECT
                COUNT(*) as total_interactions,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(DISTINCT chat_id) as unique_chats,
                COUNT(*) FILTER (WHERE success = false) as total_errors,
                ROUND(AVG(response_time_ms)::numeric, 2) as avg_response_time_ms,
                MIN(timestamp) as first_interaction,
                MAX(timestamp) as last_interaction
             FROM bot_audit_log
             WHERE timestamp >= NOW() - ($1 || ' days')::INTERVAL`,
            [days]
        );

        // Error breakdown
        const errorsResult = await db.query(
            `SELECT
                error_message,
                COUNT(*) as count,
                MAX(timestamp) as last_occurrence
             FROM bot_audit_log
             WHERE success = false
               AND timestamp >= NOW() - ($1 || ' days')::INTERVAL
             GROUP BY error_message
             ORDER BY count DESC
             LIMIT 10`,
            [days]
        );

        res.json({
            period: {
                days,
                from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
                to: new Date().toISOString()
            },
            overall: overallResult.rows[0],
            daily: dailyResult.rows,
            commands: commandResult.rows,
            topErrors: errorsResult.rows,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error fetching audit stats: ${error.message}`);
        res.status(500).json({
            error: 'Failed to fetch audit statistics',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/telegram/audit-logs/user/:userId
 * Get audit logs for a specific user
 */
router.get('/audit-logs/user/:userId', requireAuth, async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);

        const result = await db.query(
            `SELECT id, timestamp, command, message_text, response_text,
                    response_time_ms, success, interaction_type
             FROM bot_audit_log
             WHERE user_id = $1
             ORDER BY timestamp DESC
             LIMIT $2`,
            [parseInt(userId), limit]
        );

        res.json({
            userId: parseInt(userId),
            logs: result.rows,
            count: result.rows.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error fetching user audit logs: ${error.message}`);
        res.status(500).json({
            error: 'Failed to fetch user audit logs',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * DELETE /api/telegram/audit-logs/cleanup
 * Clean up old audit logs based on retention policy
 *
 * Body params:
 * - retentionDays: Days to keep (default: 90)
 */
router.delete('/audit-logs/cleanup', requireAuth, async (req, res) => {
    try {
        const retentionDays = parseInt(req.body.retentionDays) || 90;

        const result = await db.query(
            'SELECT cleanup_old_audit_logs($1) as deleted_count',
            [retentionDays]
        );

        const deletedCount = result.rows[0].deleted_count;

        logger.info(`Cleaned up ${deletedCount} audit log entries older than ${retentionDays} days`);

        res.json({
            success: true,
            deletedCount,
            retentionDays,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error cleaning up audit logs: ${error.message}`);
        res.status(500).json({
            error: 'Failed to cleanup audit logs',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/telegram/audit-logs/:id
 * Get a specific audit log entry
 */
router.get('/audit-logs/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const result = await db.query(
            `SELECT * FROM bot_audit_log WHERE id = $1`,
            [parseInt(id)]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: 'Audit log entry not found',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            log: result.rows[0],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Error fetching audit log entry: ${error.message}`);
        res.status(500).json({
            error: 'Failed to fetch audit log entry',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
