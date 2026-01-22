/**
 * Alert Engine Service
 * Monitors system metrics and triggers alerts based on configurable thresholds
 *
 * Features:
 * - Configurable warning/critical thresholds for CPU, RAM, Disk, Temperature
 * - Rate limiting (cooldown) to prevent alert flooding
 * - Quiet hours support (suppress alerts during configured times)
 * - In-app notifications via WebSocket
 * - Optional webhook notifications
 *
 * Supports Dependency Injection for testing:
 *   const { createAlertEngine } = require('./alertEngine');
 *   const testEngine = createAlertEngine({ database: mockDb, logger: mockLogger });
 */

const axios = require('axios');
const crypto = require('crypto');
const services = require('../config/services');

/**
 * Factory function to create AlertEngine with injected dependencies
 * @param {Object} deps - Dependencies
 * @param {Object} deps.database - Database module
 * @param {Object} deps.logger - Logger module
 * @returns {AlertEngine} Service instance
 */
function createAlertEngine(deps = {}) {
    const {
        database = require('../database'),
        logger = require('../utils/logger')
    } = deps;

    // In-memory state
    let checkInterval = null;
    let wssBroadcast = null;  // WebSocket broadcast function

    // Cache for thresholds (refresh periodically)
    let thresholdsCache = null;
    let thresholdsCacheTime = 0;
    const CACHE_TTL_MS = 60000;  // 1 minute

    class AlertEngine {
        /**
         * Initialize the alert engine
         * @param {Object} options - Initialization options
         * @param {Function} options.broadcast - WebSocket broadcast function
         * @param {number} options.checkIntervalMs - Check interval (default: 30000)
         */
        async initialize(options = {}) {
            const { broadcast, checkIntervalMs = 30000 } = options;
            wssBroadcast = broadcast;

            logger.info('Alert Engine initializing...');

            // Load initial thresholds
            await this.refreshThresholdsCache();

            // Start periodic checks
            if (checkInterval) {
                clearInterval(checkInterval);
            }
            checkInterval = setInterval(() => this.checkMetrics(), checkIntervalMs);

            logger.info(`Alert Engine started (check interval: ${checkIntervalMs}ms)`);
        }

        /**
         * Stop the alert engine
         */
        stop() {
            if (checkInterval) {
                clearInterval(checkInterval);
                checkInterval = null;
            }
            logger.info('Alert Engine stopped');
        }

        /**
         * Refresh thresholds cache from database
         */
        async refreshThresholdsCache() {
            try {
                const result = await database.query(`
                    SELECT metric_type, warning_threshold, critical_threshold,
                           enabled, cooldown_seconds, display_name, unit
                    FROM alert_thresholds
                    WHERE enabled = TRUE
                `);

                thresholdsCache = {};
                for (const row of result.rows) {
                    thresholdsCache[row.metric_type] = {
                        warning: parseFloat(row.warning_threshold),
                        critical: parseFloat(row.critical_threshold),
                        cooldown: row.cooldown_seconds,
                        displayName: row.display_name,
                        unit: row.unit
                    };
                }
                thresholdsCacheTime = Date.now();

                logger.debug('Alert thresholds cache refreshed');
            } catch (error) {
                logger.error(`Failed to refresh thresholds cache: ${error.message}`);
            }
        }

        /**
         * Get current thresholds (with cache)
         */
        async getThresholds() {
            if (!thresholdsCache || Date.now() - thresholdsCacheTime > CACHE_TTL_MS) {
                await this.refreshThresholdsCache();
            }
            return thresholdsCache || {};
        }

        /**
         * Check if currently in quiet hours
         */
        async isInQuietHours() {
            try {
                const result = await database.query('SELECT is_in_quiet_hours() as in_quiet');
                return result.rows[0]?.in_quiet || false;
            } catch (error) {
                logger.error(`Failed to check quiet hours: ${error.message}`);
                return false;
            }
        }

        /**
         * Check if alert can be fired (rate limiting)
         */
        async canFireAlert(metricType) {
            try {
                const result = await database.query(
                    'SELECT can_fire_alert($1::alert_metric_type) as can_fire',
                    [metricType]
                );
                return result.rows[0]?.can_fire || false;
            } catch (error) {
                logger.error(`Failed to check rate limit: ${error.message}`);
                return false;
            }
        }

        /**
         * Get global alert settings
         */
        async getSettings() {
            try {
                const result = await database.query(`
                    SELECT alerts_enabled, webhook_url, webhook_enabled,
                           webhook_secret, in_app_notifications, audio_enabled,
                           max_history_entries
                    FROM alert_settings
                    WHERE id = 1
                `);
                return result.rows[0] || {
                    alerts_enabled: true,
                    in_app_notifications: true,
                    webhook_enabled: false
                };
            } catch (error) {
                logger.error(`Failed to get alert settings: ${error.message}`);
                return { alerts_enabled: false };
            }
        }

        /**
         * Update global alert settings
         */
        async updateSettings(settings, userId) {
            const validFields = [
                'alerts_enabled', 'webhook_url', 'webhook_enabled',
                'webhook_secret', 'in_app_notifications', 'audio_enabled',
                'max_history_entries'
            ];

            const updates = [];
            const values = [];
            let paramIndex = 1;

            for (const [key, value] of Object.entries(settings)) {
                if (validFields.includes(key)) {
                    updates.push(`${key} = $${paramIndex}`);
                    values.push(value);
                    paramIndex++;
                }
            }

            if (updates.length === 0) {
                return null;
            }

            updates.push(`updated_by = $${paramIndex}`);
            values.push(userId);

            const result = await database.query(
                `UPDATE alert_settings SET ${updates.join(', ')} WHERE id = 1 RETURNING *`,
                values
            );

            logger.info(`Alert settings updated by user ${userId}`);
            return result.rows[0];
        }

        /**
         * Get all thresholds configuration
         */
        async getAllThresholds() {
            const result = await database.query(`
                SELECT id, metric_type, warning_threshold, critical_threshold,
                       enabled, cooldown_seconds, display_name, description, unit,
                       updated_at
                FROM alert_thresholds
                ORDER BY id
            `);
            return result.rows;
        }

        /**
         * Update a threshold configuration
         */
        async updateThreshold(metricType, data, userId) {
            const validFields = [
                'warning_threshold', 'critical_threshold', 'enabled',
                'cooldown_seconds', 'description'
            ];

            const updates = ['updated_by = $2'];
            const values = [metricType, userId];
            let paramIndex = 3;

            for (const [key, value] of Object.entries(data)) {
                if (validFields.includes(key)) {
                    updates.push(`${key} = $${paramIndex}`);
                    values.push(value);
                    paramIndex++;
                }
            }

            const result = await database.query(
                `UPDATE alert_thresholds
                 SET ${updates.join(', ')}
                 WHERE metric_type = $1::alert_metric_type
                 RETURNING *`,
                values
            );

            // Invalidate cache
            thresholdsCache = null;

            logger.info(`Alert threshold for ${metricType} updated by user ${userId}`);
            return result.rows[0];
        }

        /**
         * Get quiet hours configuration
         */
        async getQuietHours() {
            const result = await database.query(`
                SELECT id, day_of_week, start_time, end_time, enabled
                FROM alert_quiet_hours
                ORDER BY day_of_week
            `);
            return result.rows;
        }

        /**
         * Update quiet hours for a day
         */
        async updateQuietHours(dayOfWeek, data) {
            const validFields = ['start_time', 'end_time', 'enabled'];
            const updates = [];
            const values = [dayOfWeek];
            let paramIndex = 2;

            for (const [key, value] of Object.entries(data)) {
                if (validFields.includes(key)) {
                    updates.push(`${key} = $${paramIndex}`);
                    values.push(value);
                    paramIndex++;
                }
            }

            if (updates.length === 0) {
                return null;
            }

            const result = await database.query(
                `UPDATE alert_quiet_hours
                 SET ${updates.join(', ')}
                 WHERE day_of_week = $1
                 RETURNING *`,
                values
            );

            logger.info(`Quiet hours for day ${dayOfWeek} updated`);
            return result.rows[0];
        }

        /**
         * Get alert history
         */
        async getHistory(options = {}) {
            const { limit = 100, offset = 0, metricType, severity, unacknowledgedOnly } = options;

            let whereClause = [];
            let values = [];
            let paramIndex = 1;

            if (metricType) {
                whereClause.push(`metric_type = $${paramIndex}::alert_metric_type`);
                values.push(metricType);
                paramIndex++;
            }

            if (severity) {
                whereClause.push(`severity = $${paramIndex}::alert_severity`);
                values.push(severity);
                paramIndex++;
            }

            if (unacknowledgedOnly) {
                whereClause.push('NOT acknowledged');
            }

            const where = whereClause.length > 0 ? `WHERE ${whereClause.join(' AND ')}` : '';

            values.push(limit, offset);

            const result = await database.query(`
                SELECT id, metric_type, severity, current_value, threshold_value,
                       message, notified_via, acknowledged, acknowledged_at,
                       acknowledged_by, fired_at, resolved_at
                FROM alert_history
                ${where}
                ORDER BY fired_at DESC
                LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
            `, values);

            // Get total count
            const countResult = await database.query(`
                SELECT COUNT(*) as total FROM alert_history ${where}
            `, values.slice(0, -2));

            return {
                alerts: result.rows,
                total: parseInt(countResult.rows[0].total, 10),
                limit,
                offset
            };
        }

        /**
         * Acknowledge an alert
         */
        async acknowledgeAlert(alertId, userId) {
            const result = await database.query(`
                UPDATE alert_history
                SET acknowledged = TRUE, acknowledged_at = NOW(), acknowledged_by = $2
                WHERE id = $1
                RETURNING *
            `, [alertId, userId]);

            if (result.rows.length > 0) {
                logger.info(`Alert ${alertId} acknowledged by ${userId}`);
            }

            return result.rows[0];
        }

        /**
         * Acknowledge all alerts
         */
        async acknowledgeAll(userId) {
            const result = await database.query(`
                UPDATE alert_history
                SET acknowledged = TRUE, acknowledged_at = NOW(), acknowledged_by = $1
                WHERE NOT acknowledged
                RETURNING id
            `, [userId]);

            logger.info(`${result.rows.length} alerts acknowledged by ${userId}`);
            return result.rows.length;
        }

        /**
         * Get alert statistics
         */
        async getStatistics() {
            try {
                const result = await database.query('SELECT * FROM get_alert_statistics()');
                return result.rows[0] || {
                    total_alerts_24h: 0,
                    warning_alerts_24h: 0,
                    critical_alerts_24h: 0,
                    unacknowledged_count: 0,
                    alerts_by_type: {}
                };
            } catch (error) {
                logger.error(`Failed to get alert statistics: ${error.message}`);
                return {
                    total_alerts_24h: 0,
                    warning_alerts_24h: 0,
                    critical_alerts_24h: 0,
                    unacknowledged_count: 0,
                    alerts_by_type: {}
                };
            }
        }

        /**
         * Check current metrics against thresholds
         */
        async checkMetrics() {
            try {
                const settings = await this.getSettings();
                if (!settings.alerts_enabled) {
                    return;
                }

                // Check quiet hours
                const inQuietHours = await this.isInQuietHours();
                if (inQuietHours) {
                    logger.debug('Alert check skipped - in quiet hours');
                    return;
                }

                // Get current metrics from metrics collector
                const METRICS_URL = services.metrics.metricsEndpoint;
                let metrics;

                try {
                    const response = await axios.get(METRICS_URL, { timeout: 5000 });
                    metrics = response.data;
                } catch (error) {
                    logger.debug(`Could not fetch metrics: ${error.message}`);
                    return;
                }

                const thresholds = await this.getThresholds();

                // Check each metric type
                await this.checkMetric('cpu', metrics.cpu?.percent, thresholds, settings);
                await this.checkMetric('ram', metrics.memory?.percent, thresholds, settings);
                await this.checkMetric('disk', metrics.disk?.percent, thresholds, settings);

                // Temperature - prefer GPU temp, fallback to CPU temp
                const temp = metrics.temperature?.gpu || metrics.temperature?.cpu;
                await this.checkMetric('temperature', temp, thresholds, settings);

            } catch (error) {
                logger.error(`Alert check failed: ${error.message}`);
            }
        }

        /**
         * Check a single metric against thresholds
         */
        async checkMetric(metricType, currentValue, thresholds, settings) {
            if (currentValue === undefined || currentValue === null) {
                return;
            }

            const threshold = thresholds[metricType];
            if (!threshold) {
                return;
            }

            let severity = null;
            let thresholdValue = null;

            if (currentValue >= threshold.critical) {
                severity = 'critical';
                thresholdValue = threshold.critical;
            } else if (currentValue >= threshold.warning) {
                severity = 'warning';
                thresholdValue = threshold.warning;
            }

            if (!severity) {
                return;  // Under threshold
            }

            // Check rate limiting
            const canFire = await this.canFireAlert(metricType);
            if (!canFire) {
                logger.debug(`Alert rate-limited for ${metricType}`);
                return;
            }

            // Fire alert
            await this.fireAlert(metricType, severity, currentValue, thresholdValue, threshold, settings);
        }

        /**
         * Fire an alert
         */
        async fireAlert(metricType, severity, currentValue, thresholdValue, threshold, settings) {
            const message = `${threshold.displayName}: ${currentValue.toFixed(1)}${threshold.unit} ` +
                `(${severity === 'critical' ? 'Kritisch' : 'Warnung'}: ≥${thresholdValue}${threshold.unit})`;

            logger.warn(`ALERT [${severity.toUpperCase()}] ${message}`);

            const notifiedVia = [];

            // Record alert in history
            await database.query(`
                INSERT INTO alert_history (metric_type, severity, current_value, threshold_value, message, notified_via)
                VALUES ($1::alert_metric_type, $2::alert_severity, $3, $4, $5, $6)
            `, [metricType, severity, currentValue, thresholdValue, message, notifiedVia]);

            // Update rate limit tracker
            await database.query(`
                INSERT INTO alert_last_fired (metric_type, severity, fired_at, current_value)
                VALUES ($1::alert_metric_type, $2::alert_severity, NOW(), $3)
                ON CONFLICT (metric_type) DO UPDATE SET
                    severity = $2::alert_severity,
                    fired_at = NOW(),
                    current_value = $3
            `, [metricType, severity, currentValue]);

            // In-app notification via WebSocket
            if (settings.in_app_notifications && wssBroadcast) {
                notifiedVia.push('websocket');
                wssBroadcast({
                    type: 'alert',
                    alert: {
                        metric_type: metricType,
                        severity,
                        current_value: currentValue,
                        threshold_value: thresholdValue,
                        message,
                        display_name: threshold.displayName,
                        unit: threshold.unit,
                        audio_enabled: settings.audio_enabled,
                        timestamp: new Date().toISOString()
                    }
                });
            }

            // Webhook notification
            if (settings.webhook_enabled && settings.webhook_url) {
                try {
                    const payload = {
                        event: 'alert',
                        metric_type: metricType,
                        severity,
                        current_value: currentValue,
                        threshold_value: thresholdValue,
                        message,
                        timestamp: new Date().toISOString(),
                        source: 'arasul-platform'
                    };

                    const headers = {
                        'Content-Type': 'application/json'
                    };

                    // Sign payload if secret is set
                    if (settings.webhook_secret) {
                        const signature = crypto
                            .createHmac('sha256', settings.webhook_secret)
                            .update(JSON.stringify(payload))
                            .digest('hex');
                        headers['X-Arasul-Signature'] = `sha256=${signature}`;
                    }

                    const response = await axios.post(settings.webhook_url, payload, {
                        headers,
                        timeout: 10000
                    });

                    notifiedVia.push('webhook');

                    // Update alert with webhook response
                    await database.query(`
                        UPDATE alert_history
                        SET notified_via = $1, webhook_response_code = $2
                        WHERE metric_type = $3::alert_metric_type
                        AND fired_at = (SELECT MAX(fired_at) FROM alert_history WHERE metric_type = $3::alert_metric_type)
                    `, [notifiedVia, response.status, metricType]);

                    logger.info(`Webhook notification sent for ${metricType} alert`);

                } catch (error) {
                    logger.error(`Webhook notification failed: ${error.message}`);
                }
            }

            // Cleanup old history
            try {
                await database.query('SELECT cleanup_old_alert_history()');
            } catch (error) {
                // Non-critical, log and continue
                logger.debug(`Cleanup error: ${error.message}`);
            }
        }

        /**
         * Test webhook configuration
         */
        async testWebhook(webhookUrl, webhookSecret) {
            const payload = {
                event: 'test',
                message: 'Arasul Alert System - Test Notification',
                timestamp: new Date().toISOString(),
                source: 'arasul-platform'
            };

            const headers = {
                'Content-Type': 'application/json'
            };

            if (webhookSecret) {
                const signature = crypto
                    .createHmac('sha256', webhookSecret)
                    .update(JSON.stringify(payload))
                    .digest('hex');
                headers['X-Arasul-Signature'] = `sha256=${signature}`;
            }

            const response = await axios.post(webhookUrl, payload, {
                headers,
                timeout: 10000
            });

            return {
                success: true,
                statusCode: response.status,
                statusText: response.statusText
            };
        }

        /**
         * Manually trigger an alert check (for testing or on-demand)
         */
        async triggerCheck() {
            await this.checkMetrics();
            return { checked: true, timestamp: new Date().toISOString() };
        }

        /**
         * Delete old history entries
         */
        async cleanupHistory() {
            const result = await database.query('SELECT cleanup_old_alert_history() as deleted');
            return result.rows[0]?.deleted || 0;
        }
    }

    return new AlertEngine();
}

// Create default singleton instance
const defaultInstance = createAlertEngine();

// Export singleton for production use, factory for testing
module.exports = defaultInstance;
module.exports.createAlertEngine = createAlertEngine;
