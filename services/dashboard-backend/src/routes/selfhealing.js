/**
 * Self-Healing API routes
 * Provides access to self-healing events and status
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/auth');
const logger = require('../utils/logger');
const axios = require('axios');

// GET /api/self-healing/events - Get recent self-healing events
router.get('/events', requireAuth, async (req, res) => {
    try {
        const {
            limit = 20,
            offset = 0,
            severity = null,
            event_type = null,
            since = null
        } = req.query;

        // Build query
        let query = 'SELECT * FROM self_healing_events WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        // Filter by severity
        if (severity) {
            query += ` AND severity = $${paramIndex}`;
            params.push(severity.toUpperCase());
            paramIndex++;
        }

        // Filter by event type
        if (event_type) {
            query += ` AND event_type = $${paramIndex}`;
            params.push(event_type);
            paramIndex++;
        }

        // Filter by timestamp (since)
        if (since) {
            query += ` AND timestamp >= $${paramIndex}`;
            params.push(since);
            paramIndex++;
        }

        // Order and limit
        query += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await db.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM self_healing_events WHERE 1=1';
        const countParams = [];
        let countParamIndex = 1;

        if (severity) {
            countQuery += ` AND severity = $${countParamIndex}`;
            countParams.push(severity.toUpperCase());
            countParamIndex++;
        }

        if (event_type) {
            countQuery += ` AND event_type = $${countParamIndex}`;
            countParams.push(event_type);
            countParamIndex++;
        }

        if (since) {
            countQuery += ` AND timestamp >= $${countParamIndex}`;
            countParams.push(since);
            countParamIndex++;
        }

        const countResult = await db.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].count);

        res.json({
            events: result.rows,
            count: result.rows.length,
            total: totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/self-healing/events: ${error.message}`);
        res.status(500).json({
            error: 'Failed to retrieve self-healing events',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/self-healing/status - Get current self-healing status
router.get('/status', requireAuth, async (req, res) => {
    try {
        // Get heartbeat status from Self-Healing Agent
        let heartbeatStatus = {
            healthy: false,
            seconds_since_heartbeat: null,
            check_count: 0,
            last_action: null,
            error: 'Unable to reach heartbeat server'
        };

        try {
            const heartbeatPort = process.env.SELF_HEALING_HEARTBEAT_PORT || 9200;
            const heartbeatUrl = `http://self-healing-agent:${heartbeatPort}/health`;
            const heartbeatResponse = await axios.get(heartbeatUrl, { timeout: 2000 });
            heartbeatStatus = heartbeatResponse.data;
        } catch (error) {
            logger.warn(`Failed to get heartbeat status: ${error.message}`);
        }

        // Get recent events statistics
        const last24hQuery = `
            SELECT
                COUNT(*) as total_events,
                COUNT(*) FILTER (WHERE severity = 'INFO') as info_count,
                COUNT(*) FILTER (WHERE severity = 'WARNING') as warning_count,
                COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical_count,
                COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '1 hour') as last_hour,
                COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours') as last_24h
            FROM self_healing_events
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
        `;

        const statsResult = await db.query(last24hQuery);
        const stats = statsResult.rows[0];

        // Get most common event types
        const eventTypesQuery = `
            SELECT
                event_type,
                COUNT(*) as count,
                MAX(timestamp) as last_occurrence
            FROM self_healing_events
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
            GROUP BY event_type
            ORDER BY count DESC
            LIMIT 10
        `;

        const eventTypesResult = await db.query(eventTypesQuery);

        // Get recent recovery actions
        const recoveryActionsQuery = `
            SELECT *
            FROM recovery_actions
            ORDER BY timestamp DESC
            LIMIT 10
        `;

        const recoveryActionsResult = await db.query(recoveryActionsQuery);

        // Get service failure counts
        const serviceFailuresQuery = `
            SELECT
                service_name,
                COUNT(*) as failure_count,
                MAX(timestamp) as last_failure
            FROM service_failures
            WHERE timestamp >= NOW() - INTERVAL '24 hours'
            GROUP BY service_name
            ORDER BY failure_count DESC
        `;

        const serviceFailuresResult = await db.query(serviceFailuresQuery);

        // Calculate health status
        let overall_health = 'HEALTHY';
        const criticalLast24h = parseInt(stats.critical_count);
        const warningLast24h = parseInt(stats.warning_count);

        if (criticalLast24h > 10 || !heartbeatStatus.healthy) {
            overall_health = 'CRITICAL';
        } else if (criticalLast24h > 3 || warningLast24h > 20) {
            overall_health = 'WARNING';
        }

        // Get last reboot event if any
        const lastRebootQuery = `
            SELECT *
            FROM reboot_events
            ORDER BY timestamp DESC
            LIMIT 1
        `;

        const lastRebootResult = await db.query(lastRebootQuery);

        res.json({
            overall_health,
            heartbeat: heartbeatStatus,
            statistics: {
                total_events_24h: parseInt(stats.total_events),
                info_count: parseInt(stats.info_count),
                warning_count: parseInt(stats.warning_count),
                critical_count: parseInt(stats.critical_count),
                last_hour: parseInt(stats.last_hour),
                last_24h: parseInt(stats.last_24h)
            },
            common_event_types: eventTypesResult.rows,
            recent_recovery_actions: recoveryActionsResult.rows,
            service_failures: serviceFailuresResult.rows,
            last_reboot: lastRebootResult.rows[0] || null,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/self-healing/status: ${error.message}`);
        res.status(500).json({
            error: 'Failed to retrieve self-healing status',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/self-healing/recovery-actions - Get recent recovery actions
router.get('/recovery-actions', requireAuth, async (req, res) => {
    try {
        const { limit = 20, offset = 0 } = req.query;

        const query = `
            SELECT *
            FROM recovery_actions
            ORDER BY timestamp DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await db.query(query, [parseInt(limit), parseInt(offset)]);

        // Get total count
        const countResult = await db.query('SELECT COUNT(*) FROM recovery_actions');
        const totalCount = parseInt(countResult.rows[0].count);

        res.json({
            actions: result.rows,
            count: result.rows.length,
            total: totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/self-healing/recovery-actions: ${error.message}`);
        res.status(500).json({
            error: 'Failed to retrieve recovery actions',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/self-healing/service-failures - Get service failure history
router.get('/service-failures', requireAuth, async (req, res) => {
    try {
        const { service_name = null, limit = 50, offset = 0 } = req.query;

        let query = 'SELECT * FROM service_failures WHERE 1=1';
        const params = [];
        let paramIndex = 1;

        if (service_name) {
            query += ` AND service_name = $${paramIndex}`;
            params.push(service_name);
            paramIndex++;
        }

        query += ` ORDER BY timestamp DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await db.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM service_failures WHERE 1=1';
        const countParams = [];
        if (service_name) {
            countQuery += ' AND service_name = $1';
            countParams.push(service_name);
        }

        const countResult = await db.query(countQuery, countParams);
        const totalCount = parseInt(countResult.rows[0].count);

        res.json({
            failures: result.rows,
            count: result.rows.length,
            total: totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/self-healing/service-failures: ${error.message}`);
        res.status(500).json({
            error: 'Failed to retrieve service failures',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/self-healing/reboot-history - Get reboot event history
router.get('/reboot-history', requireAuth, async (req, res) => {
    try {
        const { limit = 10, offset = 0 } = req.query;

        const query = `
            SELECT *
            FROM reboot_events
            ORDER BY timestamp DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await db.query(query, [parseInt(limit), parseInt(offset)]);

        // Get total count
        const countResult = await db.query('SELECT COUNT(*) FROM reboot_events');
        const totalCount = parseInt(countResult.rows[0].count);

        res.json({
            reboots: result.rows,
            count: result.rows.length,
            total: totalCount,
            limit: parseInt(limit),
            offset: parseInt(offset),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/self-healing/reboot-history: ${error.message}`);
        res.status(500).json({
            error: 'Failed to retrieve reboot history',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/self-healing/metrics - Get self-healing metrics
router.get('/metrics', requireAuth, async (req, res) => {
    try {
        // Calculate uptime percentages per service (last 7 days)
        const uptimeQuery = `
            WITH service_downtime AS (
                SELECT
                    service_name,
                    COUNT(*) as failure_count,
                    SUM(EXTRACT(EPOCH FROM (resolved_at - timestamp))) as total_downtime_seconds
                FROM service_failures
                WHERE timestamp >= NOW() - INTERVAL '7 days'
                GROUP BY service_name
            )
            SELECT
                service_name,
                failure_count,
                COALESCE(total_downtime_seconds, 0) as downtime_seconds,
                ROUND(100.0 - (COALESCE(total_downtime_seconds, 0) / (7 * 24 * 3600) * 100), 2) as uptime_percent
            FROM service_downtime
            ORDER BY uptime_percent ASC
        `;

        const uptimeResult = await db.query(uptimeQuery);

        // Recovery action success rate
        const recoverySuccessQuery = `
            SELECT
                action_type,
                COUNT(*) FILTER (WHERE success = true) as successful,
                COUNT(*) FILTER (WHERE success = false) as failed,
                ROUND(COUNT(*) FILTER (WHERE success = true)::numeric / COUNT(*) * 100, 2) as success_rate
            FROM recovery_actions
            WHERE timestamp >= NOW() - INTERVAL '7 days'
            GROUP BY action_type
            ORDER BY success_rate DESC
        `;

        const recoverySuccessResult = await db.query(recoverySuccessQuery);

        // Event trends (events per day, last 7 days)
        const trendQuery = `
            SELECT
                DATE(timestamp) as date,
                COUNT(*) as total_events,
                COUNT(*) FILTER (WHERE severity = 'CRITICAL') as critical_events,
                COUNT(*) FILTER (WHERE severity = 'WARNING') as warning_events
            FROM self_healing_events
            WHERE timestamp >= NOW() - INTERVAL '7 days'
            GROUP BY DATE(timestamp)
            ORDER BY date DESC
        `;

        const trendResult = await db.query(trendQuery);

        res.json({
            uptime: uptimeResult.rows,
            recovery_success_rates: recoverySuccessResult.rows,
            event_trends: trendResult.rows,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/self-healing/metrics: ${error.message}`);
        res.status(500).json({
            error: 'Failed to retrieve self-healing metrics',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
