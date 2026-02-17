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
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');

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
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set - cannot encrypt/decrypt tokens');
  }
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
    tag: tag.toString('hex'),
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
 * If bot_token is provided, creates/updates the full config.
 * If only enabled/chat_id are provided, updates existing config.
 */
router.post(
  '/config',
  requireAuth,
  apiLimiter,
  asyncHandler(async (req, res) => {
    const { bot_token, chat_id, enabled } = req.body;

    // If bot_token is provided, do full upsert with new token
    if (bot_token && typeof bot_token === 'string') {
      // Basic validation of bot token format (should contain a colon)
      if (!bot_token.includes(':')) {
        throw new ValidationError('Invalid bot token format');
      }

      // Encrypt the token
      const { encrypted, iv, tag } = encrypt(bot_token);

      // Upsert configuration (single record with id=1)
      await db.query(
        `
            INSERT INTO telegram_config (id, bot_token_encrypted, bot_token_iv, bot_token_tag, chat_id, enabled, updated_at)
            VALUES (1, $1, $2, $3, $4, $5, NOW())
            ON CONFLICT (id) DO UPDATE SET
                bot_token_encrypted = $1,
                bot_token_iv = $2,
                bot_token_tag = $3,
                chat_id = COALESCE($4, telegram_config.chat_id),
                enabled = COALESCE($5, telegram_config.enabled),
                updated_at = NOW()
        `,
        [encrypted, iv, tag, chat_id || null, enabled !== undefined ? enabled : true]
      );

      logger.info(`Telegram config updated with new token by user ${req.user.username}`);

      return res.json({
        success: true,
        has_token: true,
        message: 'Telegram configuration saved successfully',
        token_masked: maskToken(bot_token),
        chat_id: chat_id || null,
        enabled: enabled !== undefined ? enabled : true,
        timestamp: new Date().toISOString(),
      });
    }

    // Partial update (enabled and/or chat_id only)
    // Check if config exists first
    const existingConfig = await db.query(`
        SELECT id, bot_token_encrypted FROM telegram_config WHERE id = 1
    `);

    if (existingConfig.rows.length === 0) {
      throw new ValidationError('No configuration exists. Please provide a bot token first.');
    }

    // Build dynamic update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (chat_id !== undefined) {
      updates.push(`chat_id = $${paramIndex++}`);
      params.push(chat_id || null);
    }

    if (enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      params.push(enabled);
    }

    if (updates.length === 0) {
      throw new ValidationError('No fields to update');
    }

    updates.push('updated_at = NOW()');

    await db.query(
      `
        UPDATE telegram_config
        SET ${updates.join(', ')}
        WHERE id = 1
    `,
      params
    );

    logger.info(`Telegram config partially updated by user ${req.user.username}`);

    res.json({
      success: true,
      has_token: !!existingConfig.rows[0].bot_token_encrypted,
      message: 'Telegram configuration updated successfully',
      chat_id: chat_id !== undefined ? chat_id : undefined,
      enabled: enabled !== undefined ? enabled : undefined,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/telegram/config
 * Retrieve Telegram bot configuration (token is masked)
 */
router.get(
  '/config',
  requireAuth,
  asyncHandler(async (req, res) => {
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
        timestamp: new Date().toISOString(),
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
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/telegram/updates
 * Fetch recent updates from the bot to discover chat IDs
 * This allows users to find their chat ID by sending a message to the bot
 * Note: Keeps manual error handling for Telegram API-specific errors
 */
router.get(
  '/updates',
  requireAuth,
  testLimiter,
  asyncHandler(async (req, res) => {
    // Get configuration from database
    const result = await db.query(`
        SELECT bot_token_encrypted, bot_token_iv, bot_token_tag
        FROM telegram_config
        WHERE id = 1
    `);

    if (result.rows.length === 0 || !result.rows[0].bot_token_encrypted) {
      throw new ValidationError('Telegram bot is not configured. Please save a bot token first.');
    }

    const config = result.rows[0];

    // Decrypt the token
    let botToken;
    try {
      botToken = decrypt(config.bot_token_encrypted, config.bot_token_iv, config.bot_token_tag);
    } catch (decryptError) {
      logger.error(`Failed to decrypt Telegram token for updates: ${decryptError.message}`);
      throw new Error('Failed to decrypt bot token');
    }

    // Fetch updates from Telegram API
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/getUpdates`;

    let response;
    try {
      response = await axios.get(telegramApiUrl, {
        params: {
          limit: 10,
          timeout: 0,
        },
        timeout: 10000,
      });
    } catch (axiosError) {
      if (axiosError.response && axiosError.response.data) {
        const telegramError = axiosError.response.data;
        throw new ValidationError(
          `Telegram API error: ${telegramError.description || 'Unknown error'}`
        );
      }
      throw axiosError;
    }

    if (!response.data.ok) {
      throw new Error(response.data.description || 'Unknown Telegram API error');
    }

    // Extract unique chats from updates
    const chats = [];
    const seenChatIds = new Set();

    for (const update of response.data.result) {
      const message = update.message || update.edited_message || update.channel_post;
      if (message && message.chat && !seenChatIds.has(message.chat.id)) {
        seenChatIds.add(message.chat.id);
        chats.push({
          chat_id: message.chat.id.toString(),
          type: message.chat.type,
          title: message.chat.title || null,
          username: message.chat.username || null,
          first_name: message.chat.first_name || null,
          last_message: message.text ? message.text.substring(0, 50) : null,
          date: new Date(message.date * 1000).toISOString(),
        });
      }
    }

    logger.info(
      `Telegram updates fetched by user ${req.user.username}: ${chats.length} unique chats found`
    );

    res.json({
      success: true,
      chats,
      total_updates: response.data.result.length,
      hint:
        chats.length === 0
          ? 'No messages found. Send a message to your bot to discover the chat ID.'
          : 'Select a chat ID from the list above.',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/telegram/thresholds
 * Get current alert thresholds
 */
router.get(
  '/thresholds',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT alert_thresholds
        FROM telegram_config
        WHERE id = 1
    `);

    const defaultThresholds = {
      cpu_warning: 80,
      cpu_critical: 95,
      ram_warning: 80,
      ram_critical: 95,
      disk_warning: 80,
      disk_critical: 95,
      gpu_warning: 85,
      gpu_critical: 95,
      temperature_warning: 75,
      temperature_critical: 85,
      notify_on_warning: false,
      notify_on_critical: true,
      notify_on_service_down: true,
      notify_on_self_healing: true,
      cooldown_minutes: 15,
    };

    if (result.rows.length === 0) {
      return res.json({
        thresholds: defaultThresholds,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      thresholds: result.rows[0].alert_thresholds || defaultThresholds,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/telegram/thresholds
 * Update alert thresholds
 */
router.put(
  '/thresholds',
  requireAuth,
  apiLimiter,
  asyncHandler(async (req, res) => {
    const { thresholds } = req.body;

    if (!thresholds || typeof thresholds !== 'object') {
      throw new ValidationError('Thresholds object is required');
    }

    // Validate threshold values
    const numericFields = [
      'cpu_warning',
      'cpu_critical',
      'ram_warning',
      'ram_critical',
      'disk_warning',
      'disk_critical',
      'gpu_warning',
      'gpu_critical',
      'temperature_warning',
      'temperature_critical',
      'cooldown_minutes',
    ];

    for (const field of numericFields) {
      if (thresholds[field] !== undefined) {
        const value = thresholds[field];
        if (typeof value !== 'number' || value < 0 || value > 100) {
          if (field === 'cooldown_minutes' && (value < 0 || value > 1440)) {
            throw new ValidationError(`Invalid value for ${field}: must be between 0 and 1440`);
          } else if (field !== 'cooldown_minutes') {
            throw new ValidationError(`Invalid value for ${field}: must be between 0 and 100`);
          }
        }
      }
    }

    // Update thresholds
    await db.query(
      `
        UPDATE telegram_config
        SET alert_thresholds = $1, updated_at = NOW()
        WHERE id = 1
    `,
      [JSON.stringify(thresholds)]
    );

    logger.info(`Alert thresholds updated by user ${req.user.username}`);

    res.json({
      success: true,
      message: 'Alert thresholds updated successfully',
      thresholds,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/telegram/test
 * Send a test message via Telegram Bot API
 * Note: Keeps inner try-catch for Telegram API-specific errors
 */
router.post(
  '/test',
  requireAuth,
  testLimiter,
  asyncHandler(async (req, res) => {
    const { chat_id: requestChatId } = req.body;

    // Get configuration from database
    const result = await db.query(`
        SELECT bot_token_encrypted, bot_token_iv, bot_token_tag, chat_id, enabled
        FROM telegram_config
        WHERE id = 1
    `);

    if (result.rows.length === 0) {
      throw new ValidationError('Telegram bot is not configured');
    }

    const config = result.rows[0];

    // Check if we have the required token
    if (!config.bot_token_encrypted || !config.bot_token_iv || !config.bot_token_tag) {
      throw new ValidationError('Telegram bot token is not configured');
    }

    // Decrypt the token
    let botToken;
    try {
      botToken = decrypt(config.bot_token_encrypted, config.bot_token_iv, config.bot_token_tag);
    } catch (decryptError) {
      logger.error(`Failed to decrypt Telegram token for test: ${decryptError.message}`);
      throw new Error('Failed to decrypt bot token');
    }

    // Determine chat ID (from request or stored config)
    const chatId = requestChatId || config.chat_id;

    if (!chatId) {
      throw new ValidationError(
        'Chat ID is required. Provide it in the request or configure a default.'
      );
    }

    // Send test message via Telegram Bot API
    const testMessage =
      '✅ Arasul Platform: Test erfolgreich!\n\nDie Telegram-Integration funktioniert korrekt.';

    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

    let response;
    try {
      response = await axios.post(
        telegramApiUrl,
        {
          chat_id: chatId,
          text: testMessage,
          parse_mode: 'HTML',
        },
        {
          timeout: 10000, // 10 second timeout
        }
      );
    } catch (axiosError) {
      logger.error(`Error sending Telegram test message: ${axiosError.message}`);

      // Handle specific Telegram API errors
      if (axiosError.response && axiosError.response.data) {
        const telegramError = axiosError.response.data;
        throw new ValidationError(
          `Telegram API error: ${telegramError.description || 'Unknown error'}`
        );
      }

      // Handle network errors
      if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
        throw new Error('Telegram API timeout: Could not reach Telegram servers');
      }

      throw axiosError;
    }

    if (!response.data.ok) {
      throw new Error(response.data.description || 'Unknown Telegram API error');
    }

    // Update chat_id in config if provided in request and different from stored
    if (requestChatId && requestChatId !== config.chat_id) {
      await db.query(
        `
            UPDATE telegram_config
            SET chat_id = $1, updated_at = NOW()
            WHERE id = 1
        `,
        [requestChatId]
      );
    }

    logger.info(
      `Telegram test message sent successfully by user ${req.user.username} to chat ${chatId}`
    );

    res.json({
      success: true,
      message: 'Test message sent successfully',
      chat_id: chatId,
      message_id: response.data.result.message_id,
      timestamp: new Date().toISOString(),
    });
  })
);

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
router.get(
  '/audit-logs',
  requireAuth,
  asyncHandler(async (req, res) => {
    const {
      limit = 50,
      offset = 0,
      userId,
      chatId,
      command,
      success,
      startDate,
      endDate,
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
    const countResult = await db.query(`SELECT COUNT(*) FROM bot_audit_log ${whereClause}`, params);
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
        hasMore: parsedOffset + logsResult.rows.length < total,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/telegram/audit-logs/stats
 * Get audit log statistics
 *
 * Query params:
 * - days: Number of days to include (default: 7)
 */
router.get(
  '/audit-logs/stats',
  requireAuth,
  asyncHandler(async (req, res) => {
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
        to: new Date().toISOString(),
      },
      overall: overallResult.rows[0],
      daily: dailyResult.rows,
      commands: commandResult.rows,
      topErrors: errorsResult.rows,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/telegram/audit-logs/user/:userId
 * Get audit logs for a specific user
 */
router.get(
  '/audit-logs/user/:userId',
  requireAuth,
  asyncHandler(async (req, res) => {
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
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/telegram/audit-logs/cleanup
 * Clean up old audit logs based on retention policy
 *
 * Body params:
 * - retentionDays: Days to keep (default: 90)
 */
router.delete(
  '/audit-logs/cleanup',
  requireAuth,
  asyncHandler(async (req, res) => {
    const retentionDays = parseInt(req.body.retentionDays) || 90;

    const result = await db.query('SELECT cleanup_old_audit_logs($1) as deleted_count', [
      retentionDays,
    ]);

    const deletedCount = result.rows[0].deleted_count;

    logger.info(`Cleaned up ${deletedCount} audit log entries older than ${retentionDays} days`);

    res.json({
      success: true,
      deletedCount,
      retentionDays,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/telegram/audit-logs/:id
 * Get a specific audit log entry
 */
router.get(
  '/audit-logs/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await db.query(`SELECT * FROM bot_audit_log WHERE id = $1`, [parseInt(id)]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Audit log entry not found');
    }

    res.json({
      log: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
