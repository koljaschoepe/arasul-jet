/**
 * Alert API routes
 * Handles alert configuration, thresholds, quiet hours, and history
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const alertEngine = require('../services/alertEngine');
const logger = require('../utils/logger');

// All routes require authentication
router.use(requireAuth);

// =============================================================================
// GLOBAL SETTINGS
// =============================================================================

/**
 * GET /api/alerts/settings
 * Get global alert settings
 */
router.get('/settings', async (req, res) => {
    try {
        const settings = await alertEngine.getSettings();
        res.json({
            ...settings,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Get alert settings error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Alert-Einstellungen',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * PUT /api/alerts/settings
 * Update global alert settings
 */
router.put('/settings', async (req, res) => {
    try {
        const updated = await alertEngine.updateSettings(req.body, req.user.id);

        if (!updated) {
            return res.status(400).json({
                error: 'Keine gültigen Einstellungen zum Aktualisieren',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            ...updated,
            message: 'Einstellungen erfolgreich aktualisiert',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Update alert settings error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Aktualisieren der Einstellungen',
            timestamp: new Date().toISOString()
        });
    }
});

// =============================================================================
// THRESHOLDS
// =============================================================================

/**
 * GET /api/alerts/thresholds
 * Get all threshold configurations
 */
router.get('/thresholds', async (req, res) => {
    try {
        const thresholds = await alertEngine.getAllThresholds();
        res.json({
            thresholds,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Get thresholds error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Schwellwerte',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * PUT /api/alerts/thresholds/:metricType
 * Update a threshold configuration
 */
router.put('/thresholds/:metricType', async (req, res) => {
    try {
        const { metricType } = req.params;
        const validTypes = ['cpu', 'ram', 'disk', 'temperature'];

        if (!validTypes.includes(metricType)) {
            return res.status(400).json({
                error: `Ungültiger Metrik-Typ. Erlaubt: ${validTypes.join(', ')}`,
                timestamp: new Date().toISOString()
            });
        }

        // Validate threshold values
        const { warning_threshold, critical_threshold } = req.body;

        if (warning_threshold !== undefined && critical_threshold !== undefined) {
            if (parseFloat(warning_threshold) >= parseFloat(critical_threshold)) {
                return res.status(400).json({
                    error: 'Warnschwelle muss kleiner als kritische Schwelle sein',
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Validate ranges
        if (warning_threshold !== undefined) {
            const warn = parseFloat(warning_threshold);
            if (isNaN(warn) || warn < 0 || warn > 100) {
                return res.status(400).json({
                    error: 'Warnschwelle muss zwischen 0 und 100 liegen',
                    timestamp: new Date().toISOString()
                });
            }
        }

        if (critical_threshold !== undefined) {
            const crit = parseFloat(critical_threshold);
            if (isNaN(crit) || crit < 0 || crit > 100) {
                return res.status(400).json({
                    error: 'Kritische Schwelle muss zwischen 0 und 100 liegen',
                    timestamp: new Date().toISOString()
                });
            }
        }

        const updated = await alertEngine.updateThreshold(metricType, req.body, req.user.id);

        if (!updated) {
            return res.status(404).json({
                error: 'Schwellwert nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            threshold: updated,
            message: 'Schwellwert erfolgreich aktualisiert',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Update threshold error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Aktualisieren des Schwellwerts',
            timestamp: new Date().toISOString()
        });
    }
});

// =============================================================================
// QUIET HOURS
// =============================================================================

/**
 * GET /api/alerts/quiet-hours
 * Get quiet hours configuration for all days
 */
router.get('/quiet-hours', async (req, res) => {
    try {
        const quietHours = await alertEngine.getQuietHours();
        res.json({
            quiet_hours: quietHours,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Get quiet hours error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Ruhezeiten',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * PUT /api/alerts/quiet-hours/:dayOfWeek
 * Update quiet hours for a specific day
 * dayOfWeek: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */
router.put('/quiet-hours/:dayOfWeek', async (req, res) => {
    try {
        const dayOfWeek = parseInt(req.params.dayOfWeek, 10);

        if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
            return res.status(400).json({
                error: 'Ungültiger Wochentag (0-6 erwartet)',
                timestamp: new Date().toISOString()
            });
        }

        // Validate time format if provided
        const { start_time, end_time } = req.body;
        const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/;

        if (start_time && !timeRegex.test(start_time)) {
            return res.status(400).json({
                error: 'Ungültiges Startzeit-Format (HH:MM erwartet)',
                timestamp: new Date().toISOString()
            });
        }

        if (end_time && !timeRegex.test(end_time)) {
            return res.status(400).json({
                error: 'Ungültiges Endzeit-Format (HH:MM erwartet)',
                timestamp: new Date().toISOString()
            });
        }

        const updated = await alertEngine.updateQuietHours(dayOfWeek, req.body);

        if (!updated) {
            return res.status(400).json({
                error: 'Keine gültigen Daten zum Aktualisieren',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            quiet_hours: updated,
            message: 'Ruhezeit erfolgreich aktualisiert',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Update quiet hours error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Aktualisieren der Ruhezeit',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * PUT /api/alerts/quiet-hours
 * Update quiet hours for multiple days at once
 */
router.put('/quiet-hours', async (req, res) => {
    try {
        const { days } = req.body;

        if (!Array.isArray(days)) {
            return res.status(400).json({
                error: 'Array von Tagen erwartet',
                timestamp: new Date().toISOString()
            });
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
    } catch (error) {
        logger.error(`Batch update quiet hours error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Aktualisieren der Ruhezeiten',
            timestamp: new Date().toISOString()
        });
    }
});

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
router.get('/history', async (req, res) => {
    try {
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
    } catch (error) {
        logger.error(`Get alert history error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Alert-Historie',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/alerts/history/:id/acknowledge
 * Acknowledge a single alert
 */
router.post('/history/:id/acknowledge', async (req, res) => {
    try {
        const alertId = parseInt(req.params.id, 10);

        if (isNaN(alertId)) {
            return res.status(400).json({
                error: 'Ungültige Alert-ID',
                timestamp: new Date().toISOString()
            });
        }

        const acknowledged = await alertEngine.acknowledgeAlert(alertId, req.user.id);

        if (!acknowledged) {
            return res.status(404).json({
                error: 'Alert nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            alert: acknowledged,
            message: 'Alert bestätigt',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Acknowledge alert error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Bestätigen des Alerts',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/alerts/history/acknowledge-all
 * Acknowledge all unacknowledged alerts
 */
router.post('/history/acknowledge-all', async (req, res) => {
    try {
        const count = await alertEngine.acknowledgeAll(req.user.id);

        res.json({
            acknowledged_count: count,
            message: `${count} Alert(s) bestätigt`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Acknowledge all alerts error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Bestätigen der Alerts',
            timestamp: new Date().toISOString()
        });
    }
});

// =============================================================================
// STATISTICS & TESTING
// =============================================================================

/**
 * GET /api/alerts/statistics
 * Get alert statistics
 */
router.get('/statistics', async (req, res) => {
    try {
        const stats = await alertEngine.getStatistics();
        res.json({
            ...stats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Get alert statistics error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Statistiken',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/alerts/test-webhook
 * Test webhook configuration
 */
router.post('/test-webhook', async (req, res) => {
    try {
        const { webhook_url, webhook_secret } = req.body;

        if (!webhook_url) {
            return res.status(400).json({
                error: 'Webhook-URL ist erforderlich',
                timestamp: new Date().toISOString()
            });
        }

        // Basic URL validation
        try {
            new URL(webhook_url);
        } catch {
            return res.status(400).json({
                error: 'Ungültige Webhook-URL',
                timestamp: new Date().toISOString()
            });
        }

        const result = await alertEngine.testWebhook(webhook_url, webhook_secret);

        res.json({
            ...result,
            message: 'Webhook-Test erfolgreich',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Test webhook error: ${error.message}`);
        res.status(502).json({
            error: `Webhook-Test fehlgeschlagen: ${error.message}`,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/alerts/trigger-check
 * Manually trigger an alert check (for testing)
 */
router.post('/trigger-check', async (req, res) => {
    try {
        const result = await alertEngine.triggerCheck();
        res.json({
            ...result,
            message: 'Alert-Check ausgeführt',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Trigger check error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Ausführen des Alert-Checks',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/alerts/status
 * Get current alert engine status
 */
router.get('/status', async (req, res) => {
    try {
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
    } catch (error) {
        logger.error(`Get alert status error: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden des Alert-Status',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
