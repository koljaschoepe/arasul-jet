/**
 * Audit Log Service for Telegram Bot
 * Handles logging of all bot interactions to PostgreSQL
 */

const { Pool } = require('pg');

// PostgreSQL connection pool
const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'postgres-db',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    user: process.env.POSTGRES_USER || 'arasul',
    password: process.env.POSTGRES_PASSWORD,
    database: process.env.POSTGRES_DB || 'arasul_db',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    application_name: 'telegram-bot-audit'
});

// Maximum text length to store (prevent huge entries)
const MAX_TEXT_LENGTH = 4000;

/**
 * Truncate text to maximum length with indicator
 * @param {string} text - Text to truncate
 * @returns {string} Truncated text
 */
function truncateText(text) {
    if (!text) return null;
    if (text.length <= MAX_TEXT_LENGTH) return text;
    return text.substring(0, MAX_TEXT_LENGTH - 20) + '... [TRUNCATED]';
}

/**
 * Mask sensitive data in text
 * @param {string} text - Text to mask
 * @returns {string} Text with masked sensitive data
 */
function maskSensitiveData(text) {
    if (!text) return null;

    let masked = text;

    // Mask potential bot tokens
    masked = masked.replace(/[0-9]{9,}:[A-Za-z0-9_-]{35,}/g, '[MASKED_TOKEN]');

    // Mask password-like patterns
    masked = masked.replace(/(password|passwd|pwd|secret|token|key|api_key|apikey)[\s]*[=:]\s*\S+/gi, '$1=[MASKED]');

    return masked;
}

/**
 * Log a bot interaction to the audit log
 * @param {Object} interaction - Interaction details
 * @param {number} interaction.userId - Telegram user ID
 * @param {string} interaction.username - Telegram username
 * @param {number} interaction.chatId - Telegram chat ID
 * @param {string} interaction.command - Bot command (if applicable)
 * @param {string} interaction.messageText - User's message
 * @param {string} interaction.responseText - Bot's response
 * @param {number} interaction.responseTimeMs - Processing time in ms
 * @param {boolean} interaction.success - Whether interaction succeeded
 * @param {string} interaction.errorMessage - Error message if failed
 * @param {string} interaction.interactionType - Type: message, command, callback, inline
 * @param {Object} interaction.metadata - Additional metadata
 * @returns {Promise<number>} - ID of created log entry
 */
async function logInteraction(interaction) {
    const {
        userId,
        username,
        chatId,
        command,
        messageText,
        responseText,
        responseTimeMs,
        success = true,
        errorMessage,
        interactionType = 'message',
        metadata = {}
    } = interaction;

    try {
        const result = await pool.query(
            `INSERT INTO bot_audit_log
             (user_id, username, chat_id, command, message_text, response_text,
              response_time_ms, success, error_message, interaction_type, metadata)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING id`,
            [
                userId || null,
                username || null,
                chatId,
                command || null,
                truncateText(maskSensitiveData(messageText)),
                truncateText(maskSensitiveData(responseText)),
                responseTimeMs || null,
                success,
                errorMessage || null,
                interactionType,
                JSON.stringify(metadata)
            ]
        );

        return result.rows[0].id;
    } catch (error) {
        console.error('Failed to log interaction:', error.message);
        // Don't throw - logging failures should not break bot functionality
        return null;
    }
}

/**
 * Get audit logs with filtering and pagination
 * @param {Object} options - Query options
 * @param {number} options.limit - Number of records to return (default: 50)
 * @param {number} options.offset - Number of records to skip (default: 0)
 * @param {number} options.userId - Filter by user ID
 * @param {number} options.chatId - Filter by chat ID
 * @param {string} options.command - Filter by command
 * @param {boolean} options.successOnly - Only successful interactions
 * @param {boolean} options.errorsOnly - Only failed interactions
 * @param {Date} options.startDate - Filter from date
 * @param {Date} options.endDate - Filter to date
 * @returns {Promise<Object>} - Logs and total count
 */
async function getAuditLogs(options = {}) {
    const {
        limit = 50,
        offset = 0,
        userId,
        chatId,
        command,
        successOnly,
        errorsOnly,
        startDate,
        endDate
    } = options;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        params.push(userId);
    }

    if (chatId) {
        conditions.push(`chat_id = $${paramIndex++}`);
        params.push(chatId);
    }

    if (command) {
        conditions.push(`command = $${paramIndex++}`);
        params.push(command);
    }

    if (successOnly) {
        conditions.push('success = true');
    } else if (errorsOnly) {
        conditions.push('success = false');
    }

    if (startDate) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        params.push(startDate);
    }

    if (endDate) {
        conditions.push(`timestamp <= $${paramIndex++}`);
        params.push(endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
        // Get total count
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM bot_audit_log ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count);

        // Get logs
        const logsResult = await pool.query(
            `SELECT id, timestamp, user_id, username, chat_id, command,
                    message_text, response_text, response_time_ms,
                    success, error_message, interaction_type, metadata
             FROM bot_audit_log
             ${whereClause}
             ORDER BY timestamp DESC
             LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            [...params, limit, offset]
        );

        return {
            logs: logsResult.rows,
            total,
            limit,
            offset,
            hasMore: offset + logsResult.rows.length < total
        };
    } catch (error) {
        console.error('Failed to get audit logs:', error.message);
        throw error;
    }
}

/**
 * Get audit statistics
 * @param {Object} options - Query options
 * @param {number} options.days - Number of days to include (default: 7)
 * @returns {Promise<Object>} - Statistics object
 */
async function getAuditStats(options = {}) {
    const { days = 7 } = options;

    try {
        // Daily stats
        const dailyResult = await pool.query(
            `SELECT * FROM bot_audit_daily_stats
             WHERE date >= CURRENT_DATE - $1::INTEGER
             ORDER BY date DESC`,
            [days]
        );

        // Command stats
        const commandResult = await pool.query(
            `SELECT * FROM bot_audit_command_stats
             LIMIT 20`
        );

        // Overall stats
        const overallResult = await pool.query(
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
        const errorsResult = await pool.query(
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

        return {
            period: {
                days,
                from: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
                to: new Date().toISOString()
            },
            overall: overallResult.rows[0],
            daily: dailyResult.rows,
            commands: commandResult.rows,
            topErrors: errorsResult.rows
        };
    } catch (error) {
        console.error('Failed to get audit stats:', error.message);
        throw error;
    }
}

/**
 * Clean up old audit logs based on retention policy
 * @param {number} retentionDays - Days to keep (default from env or 90)
 * @returns {Promise<number>} - Number of deleted records
 */
async function cleanupOldLogs(retentionDays = null) {
    const days = retentionDays || parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90');

    try {
        const result = await pool.query(
            'SELECT cleanup_old_audit_logs($1) as deleted_count',
            [days]
        );

        const deletedCount = result.rows[0].deleted_count;
        if (deletedCount > 0) {
            console.log(`Cleaned up ${deletedCount} audit log entries older than ${days} days`);
        }

        return deletedCount;
    } catch (error) {
        console.error('Failed to cleanup old logs:', error.message);
        throw error;
    }
}

/**
 * Get recent interactions for a specific user
 * @param {number} userId - Telegram user ID
 * @param {number} limit - Number of records (default: 10)
 * @returns {Promise<Array>} - User's recent interactions
 */
async function getUserHistory(userId, limit = 10) {
    try {
        const result = await pool.query(
            `SELECT id, timestamp, command, message_text, response_text,
                    response_time_ms, success, interaction_type
             FROM bot_audit_log
             WHERE user_id = $1
             ORDER BY timestamp DESC
             LIMIT $2`,
            [userId, limit]
        );

        return result.rows;
    } catch (error) {
        console.error('Failed to get user history:', error.message);
        throw error;
    }
}

/**
 * Check database connection health
 * @returns {Promise<boolean>} - True if healthy
 */
async function healthCheck() {
    try {
        const result = await pool.query('SELECT 1 as health');
        return result.rows[0].health === 1;
    } catch (error) {
        console.error('Audit log database health check failed:', error.message);
        return false;
    }
}

/**
 * Close database pool
 */
async function close() {
    await pool.end();
}

module.exports = {
    logInteraction,
    getAuditLogs,
    getAuditStats,
    cleanupOldLogs,
    getUserHistory,
    healthCheck,
    close,
    // Expose utilities for testing
    maskSensitiveData,
    truncateText
};
