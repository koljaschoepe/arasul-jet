/**
 * Alert API routes
 * Handles alert configuration, thresholds, quiet hours, and history
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const alertEngine = require('../services/alertEngine');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError } = require('../utils/errors');

// All routes require authentication
router.use(requireAuth);

// =============================================================================
// GLOBAL SETTINGS
// =============================================================================

/**
 * GET /api/alerts/settings
 * Get global alert settings
 */
router.get('/settings', asyncHandler(async (req, res) => {
    const settings = await alertEngine.getSettings();
    res.json({
        ...settings,
        timestamp: new Date().toISOString()
    });
}));

/**
 * PUT /api/alerts/settings
 * Update global alert settings
 */
router.put('/settings', asyncHandler(async (req, res) => {
    const updated = await alertEngine.updateSettings(req.body, req.user.id);

    if (!updated) {
        throw new ValidationError('Keine gültigen Einstellungen zum Aktualisieren');
    }

    res.json({
        ...updated,
        message: 'Einstellungen erfolgreich aktualisiert',
        timestamp: new Date().toISOString()
    });
}));

// =============================================================================
// THRESHOLDS
// =============================================================================

/**
 * GET /api/alerts/thresholds
 * Get all threshold configurations
 */
router.get('/thresholds', asyncHandler(async (req, res) => {
    const thresholds = await alertEngine.getAllThresholds();
    res.json({
        thresholds,
        timestamp: new Date().toISOString()
    });
}));

/**
 * PUT /api/alerts/thresholds/:metricType
 * Update a threshold configuration
 */
router.put('/thresholds/:metricType', asyncHandler(async (req, res) => {
    const { metricType } = req.params;
    const validTypes = ['cpu', 'ram', 'disk', 'temperature'];

    if (!validTypes.includes(metricType)) {
        throw new ValidationError(`Ungültiger Metrik-Typ. Erlaubt: ${validTypes.join(', ')}`);
    }

    // Validate threshold values
    const { warning_threshold, critical_threshold } = req.body;

    if (warning_threshold !== undefined && critical_threshold !== undefined) {
        if (parseFloat(warning_threshold) >= parseFloat(critical_threshold)) {
            throw new ValidationError('Warnschwelle muss kleiner als kritische Schwelle sein');
        }
    }

    // Validate ranges
    if (warning_threshold !== undefined) {
        const warn = parseFloat(warning_threshold);
        if (isNaN(warn) || warn < 0 || warn > 100) {
            throw new ValidationError('Warnschwelle muss zwischen 0 und 100 liegen');
        }
    }

    if (critical_threshold !== undefined) {
        const crit = parseFloat(critical_threshold);
        if (isNaN(crit) || crit < 0 || crit > 100) {
            throw new ValidationError('Kritische Schwelle muss zwischen 0 und 100 liegen');
        }
    }

    const updated = await alertEngine.updateThreshold(metricType, req.body, req.user.id);

    if (!updated) {
        throw new NotFoundError('Schwellwert nicht gefunden');
    }

    res.json({
        threshold: updated,
        message: 'Schwellwert erfolgreich aktualisiert',
        timestamp: new Date().toISOString()
    });
}));

// =============================================================================
// QUIET HOURS
// =============================================================================

/**
 * GET /api/alerts/quiet-hours
 * Get quiet hours configuration for all days
 */
router.get('/quiet-hours', asyncHandler(async (req, res) => {
    const quietHours = await alertEngine.getQuietHours();
    res.json({
        quiet_hours: quietHours,
        timestamp: new Date().toISOString()
    });
}));

/**
 * PUT /api/alerts/quiet-hours/:dayOfWeek
 * Update quiet hours for a specific day
 * dayOfWeek: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */
router.put('/quiet-hours/:dayOfWeek', asyncHandler(async (req, res) => {
    const dayOfWeek = parseInt(req.params.dayOfWeek, 10);

    if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        throw new ValidationError('Ungültiger Wochentag (0-6 erwartet)');
    }

    // Validate time format if provided
    const { start_time, end_time } = req.body;
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

    if (start_time && !timeRegex.test(start_time)) {
        throw new ValidationError('Ungültiges Startzeit-Format (HH:MM erwartet)');
    }

    if (end_time && !timeRegex.test(end_time)) {
        throw new ValidationError('Ungültiges Endzeit-Format (HH:MM erwartet)');
    }

    const updated = await alertEngine.updateQuietHours(dayOfWeek, req.body);

    if (!updated) {
        throw new ValidationError('Keine gültigen Daten zum Aktualisieren');
    }

    res.json({
        quiet_hours: updated,
        message: 'Ruhezeit erfolgreich aktualisiert',
        timestamp: new Date().toISOString()
    });
}));

/**
 * PUT /api/alerts/quiet-hours
 * Update quiet hours for multiple days at once
 */
router.put('/quiet-hours', asyncHandler(async (req, res) => {
    const { days } = req.body;

    if (!Array.isArray(days)) {
        throw new ValidationError('Array von Tagen erwartet');
    }

    const results = [];

    for (const day of days) {
        if (day.day_of_week !== undefined) {
            const updated = await alertEngine.updateQuietHours(day.day_of_week, day);
            if (updated) {
                results.push(updated);
            }
        }
    }

    res.json({
        updated_count: results.length,
        quiet_hours: results,
        message: 'Ruhezeiten erfolgreich aktualisiert',
        timestamp: new Date().toISOString()
    });
}));

// =============================================================================
// HISTORY
// =============================================================================

/**
 * GET /api/alerts/history
 * Get alert history with filtering and pagination
 *
 * Query params:
 * - limit: number (default 100)
 * - offset: number (default 0)
 * - metric_type: string (cpu, ram, disk, temperature)
 * - severity: string (warning, critical)
 * - unacknowledged: boolean
 */
router.get('/history', asyncHandler(async (req, res) => {
    const options = {
        limit: Math.min(parseInt(req.query.limit, 10) || 100, 500),
        offset: parseInt(req.query.offset, 10) || 0,
        metricType: req.query.metric_type,
        severity: req.query.severity,
        unacknowledgedOnly: req.query.unacknowledged === 'true'
    };

    const result = await alertEngine.getHistory(options);
    res.json({
        ...result,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/alerts/history/:id/acknowledge
 * Acknowledge a single alert
 */
router.post('/history/:id/acknowledge', asyncHandler(async (req, res) => {
    const alertId = parseInt(req.params.id, 10);

    if (isNaN(alertId)) {
        throw new ValidationError('Ungültige Alert-ID');
    }

    const acknowledged = await alertEngine.acknowledgeAlert(alertId, req.user.id);

    if (!acknowledged) {
        throw new NotFoundError('Alert nicht gefunden');
    }

    res.json({
        alert: acknowledged,
        message: 'Alert bestätigt',
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/alerts/history/acknowledge-all
 * Acknowledge all unacknowledged alerts
 */
router.post('/history/acknowledge-all', asyncHandler(async (req, res) => {
    const count = await alertEngine.acknowledgeAll(req.user.id);

    res.json({
        acknowledged_count: count,
        message: `${count} Alert(s) bestätigt`,
        timestamp: new Date().toISOString()
    });
}));

// =============================================================================
// STATISTICS & TESTING
// =============================================================================

/**
 * GET /api/alerts/statistics
 * Get alert statistics
 */
router.get('/statistics', asyncHandler(async (req, res) => {
    const stats = await alertEngine.getStatistics();
    res.json({
        ...stats,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/alerts/test-webhook
 * Test webhook configuration
 */
router.post('/test-webhook', asyncHandler(async (req, res) => {
    const { webhook_url, webhook_secret } = req.body;

    if (!webhook_url) {
        throw new ValidationError('Webhook-URL ist erforderlich');
    }

    // Basic URL validation
    try {
        new URL(webhook_url);
    } catch {
        throw new ValidationError('Ungültige Webhook-URL');
    }

    const result = await alertEngine.testWebhook(webhook_url, webhook_secret);

    res.json({
        ...result,
        message: 'Webhook-Test erfolgreich',
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/alerts/trigger-check
 * Manually trigger an alert check (for testing)
 */
router.post('/trigger-check', asyncHandler(async (req, res) => {
    const result = await alertEngine.triggerCheck();
    res.json({
        ...result,
        message: 'Alert-Check ausgeführt',
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/alerts/status
 * Get current alert engine status
 */
router.get('/status', asyncHandler(async (req, res) => {
    const settings = await alertEngine.getSettings();
    const stats = await alertEngine.getStatistics();
    const inQuietHours = await alertEngine.isInQuietHours();

    res.json({
        enabled: settings.alerts_enabled,
        in_quiet_hours: inQuietHours,
        webhook_enabled: settings.webhook_enabled,
        in_app_notifications: settings.in_app_notifications,
        statistics: stats,
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;
