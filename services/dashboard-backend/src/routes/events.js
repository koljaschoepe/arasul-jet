/**
 * Events API Routes
 * Handles event management, webhooks, and notification settings
 */

const router = require('express').Router();
const { requireAuth: auth } = require('../middleware/auth');
const db = require('../database');
const logger = require('../utils/logger');
const eventListenerService = require('../services/eventListenerService');
const telegramService = require('../services/telegramNotificationService');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ServiceUnavailableError,
} = require('../utils/errors');

/**
 * GET /api/events
 * Get recent notification events
 */
router.get(
  '/',
  auth,
  asyncHandler(async (req, res) => {
    const { limit = 50, event_type, severity } = req.query;

    let query = `
        SELECT * FROM notification_events
        WHERE created_at > NOW() - INTERVAL '7 days'
    `;
    const params = [];
    let paramIndex = 1;

    if (event_type) {
      query += ` AND event_type = $${paramIndex++}`;
      params.push(event_type);
    }

    if (severity) {
      query += ` AND severity = $${paramIndex++}`;
      params.push(severity);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit, 10));

    const result = await db.query(query, params);

    res.json({
      events: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/events/stats
 * Get event and notification statistics
 */
router.get(
  '/stats',
  auth,
  asyncHandler(async (req, res) => {
    const listenerStats = eventListenerService.getStats();
    const notificationStats = await telegramService.getStats();

    // Get event breakdown from database
    const eventBreakdown = await db.query(`
        SELECT
            event_type,
            severity,
            COUNT(*) as count,
            COUNT(*) FILTER (WHERE notification_sent = TRUE) as sent_count
        FROM notification_events
        WHERE created_at > NOW() - INTERVAL '24 hours'
        GROUP BY event_type, severity
        ORDER BY count DESC
    `);

    res.json({
      listener: listenerStats,
      notifications: notificationStats,
      eventBreakdown: eventBreakdown.rows,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/events/settings
 * Get notification settings for current user
 */
router.get(
  '/settings',
  auth,
  asyncHandler(async (req, res) => {
    const result = await db.query(`SELECT * FROM notification_settings WHERE user_id = $1`, [
      req.user.id,
    ]);

    res.json({
      settings: result.rows,
      telegram: {
        enabled: !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID,
        chatIdConfigured: !!result.rows.find(s => s.channel === 'telegram')?.telegram_chat_id,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * PUT /api/events/settings
 * Update notification settings
 */
router.put(
  '/settings',
  auth,
  asyncHandler(async (req, res) => {
    const {
      channel = 'telegram',
      enabled,
      event_types,
      min_severity,
      rate_limit_per_minute,
      quiet_hours_start,
      quiet_hours_end,
      telegram_chat_id,
    } = req.body;

    // Upsert settings
    const result = await db.query(
      `
        INSERT INTO notification_settings (
            user_id, channel, enabled, event_types, min_severity,
            rate_limit_per_minute, quiet_hours_start, quiet_hours_end,
            telegram_chat_id, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (user_id, channel) DO UPDATE SET
            enabled = COALESCE($3, notification_settings.enabled),
            event_types = COALESCE($4, notification_settings.event_types),
            min_severity = COALESCE($5, notification_settings.min_severity),
            rate_limit_per_minute = COALESCE($6, notification_settings.rate_limit_per_minute),
            quiet_hours_start = $7,
            quiet_hours_end = $8,
            telegram_chat_id = COALESCE($9, notification_settings.telegram_chat_id),
            updated_at = NOW()
        RETURNING *
    `,
      [
        req.user.id,
        channel,
        enabled,
        event_types,
        min_severity,
        rate_limit_per_minute,
        quiet_hours_start,
        quiet_hours_end,
        telegram_chat_id,
      ]
    );

    res.json({
      settings: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/events/test
 * Send a test notification
 */
router.post(
  '/test',
  auth,
  asyncHandler(async (req, res) => {
    const { message = 'Test-Benachrichtigung von Arasul Platform' } = req.body;

    // Test Telegram connection first
    const connectionTest = await telegramService.testConnection();
    if (!connectionTest.success) {
      throw new ServiceUnavailableError(`Telegram connection failed: ${connectionTest.error}`);
    }

    // Send test notification
    const result = await telegramService.queueNotification({
      event_type: 'service_status',
      event_category: 'test',
      source_service: 'dashboard-backend',
      severity: 'info',
      title: 'Test-Benachrichtigung',
      message,
      metadata: {
        test: true,
        triggered_by: req.user.username,
      },
    });

    res.json({
      success: true,
      eventId: result.eventId,
      botInfo: connectionTest.botInfo,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/events/webhook/n8n
 * Webhook endpoint for n8n workflow events
 * This endpoint accepts events from n8n workflows
 */
router.post(
  '/webhook/n8n',
  asyncHandler(async (req, res) => {
    // Validate webhook secret if configured
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;
    if (webhookSecret) {
      const providedSecret = req.headers['x-webhook-secret'] || req.query.secret;
      if (providedSecret !== webhookSecret) {
        logger.warn('Invalid n8n webhook secret');
        throw new UnauthorizedError('Invalid webhook secret');
      }
    }

    const { workflow_id, workflow_name, execution_id, status, error, duration_ms } = req.body;

    if (!workflow_id || !status) {
      throw new ValidationError('Missing required fields: workflow_id, status');
    }

    const result = await eventListenerService.handleWorkflowEvent({
      workflow_id,
      workflow_name: workflow_name || `Workflow ${workflow_id}`,
      execution_id,
      status,
      error,
      duration_ms,
    });

    res.json({
      received: true,
      processed: result.success,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/events/webhook/self-healing
 * Webhook endpoint for self-healing agent events
 */
router.post(
  '/webhook/self-healing',
  asyncHandler(async (req, res) => {
    // Validate internal request (from self-healing container)
    const clientIp = req.ip || req.connection.remoteAddress;
    // Allow localhost, Docker network IPs, and configured sources
    const allowedSources = ['127.0.0.1', '::1', '172.', '192.168.'];
    const isAllowed = allowedSources.some(src => clientIp.includes(src));

    if (!isAllowed && process.env.NODE_ENV === 'production') {
      logger.warn(`Blocked self-healing webhook from: ${clientIp}`);
      throw new ForbiddenError('Forbidden');
    }

    const { action_type, service_name, reason, success, duration_ms, error_message } = req.body;

    if (!action_type) {
      throw new ValidationError('Missing required field: action_type');
    }

    const result = await eventListenerService.handleSelfHealingEvent({
      action_type,
      service_name,
      reason,
      success: success !== false,
      duration_ms,
      error_message,
    });

    res.json({
      received: true,
      processed: result.success,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/events/manual
 * Create a manual notification event (admin only)
 */
router.post(
  '/manual',
  auth,
  asyncHandler(async (req, res) => {
    const {
      event_type = 'service_status',
      event_category = 'manual',
      source_service,
      severity = 'info',
      title,
      message,
    } = req.body;

    if (!title) {
      throw new ValidationError('Title is required');
    }

    const result = await telegramService.queueNotification({
      event_type,
      event_category,
      source_service,
      severity,
      title,
      message,
      metadata: {
        manual: true,
        triggered_by: req.user.username,
      },
    });

    res.json({
      success: true,
      eventId: result.eventId,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/events/service-status
 * Get current service status cache
 */
router.get(
  '/service-status',
  auth,
  asyncHandler(async (req, res) => {
    const result = await db.query(`
        SELECT * FROM service_status_cache
        ORDER BY status_changed_at DESC
    `);

    res.json({
      services: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/events/boot-history
 * Get system boot history
 */
router.get(
  '/boot-history',
  auth,
  asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;

    const result = await db.query(
      `
        SELECT * FROM system_boot_events
        ORDER BY boot_timestamp DESC
        LIMIT $1
    `,
      [parseInt(limit, 10)]
    );

    res.json({
      boots: result.rows,
      count: result.rows.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/events/:id
 * Delete a specific event
 */
router.delete(
  '/:id',
  auth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const result = await db.query(`DELETE FROM notification_events WHERE id = $1 RETURNING id`, [
      id,
    ]);

    if (result.rows.length === 0) {
      throw new NotFoundError('Event not found');
    }

    res.json({
      deleted: true,
      id: parseInt(id, 10),
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/events/cleanup
 * Cleanup old events (admin only)
 */
router.post(
  '/cleanup',
  auth,
  asyncHandler(async (req, res) => {
    const result = await db.query(`SELECT cleanup_old_notification_events()`);
    const deletedCount = result.rows[0].cleanup_old_notification_events;

    res.json({
      success: true,
      deleted: deletedCount,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/events/telegram/status
 * Get Telegram bot status and connection info
 */
router.get(
  '/telegram/status',
  auth,
  asyncHandler(async (req, res) => {
    const connectionTest = await telegramService.testConnection();
    const stats = await telegramService.getStats();

    res.json({
      connected: connectionTest.success,
      botInfo: connectionTest.botInfo,
      error: connectionTest.error,
      stats,
      configured: {
        botToken: !!process.env.TELEGRAM_BOT_TOKEN,
        chatId: !!process.env.TELEGRAM_CHAT_ID,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
