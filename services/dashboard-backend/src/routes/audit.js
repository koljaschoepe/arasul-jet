/**
 * Audit Log API Routes
 * Provides access to API audit logs with pagination and filtering
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const db = require('../database');
const logger = require('../utils/logger');

// Constants for pagination
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

/**
 * GET /api/audit/logs
 * Get audit logs with pagination and filtering
 *
 * Query Parameters:
 * - limit: Number of records (default: 50, max: 500)
 * - offset: Number of records to skip (default: 0)
 * - date_from: Start date (ISO 8601)
 * - date_to: End date (ISO 8601)
 * - action_type: HTTP method filter (GET, POST, PUT, DELETE, PATCH)
 * - user_id: Filter by user ID
 * - endpoint: Filter by endpoint (partial match)
 * - status_min: Minimum response status code
 * - status_max: Maximum response status code
 */
router.get('/logs', requireAuth, async (req, res) => {
    try {
        // Parse pagination
        let limit = parseInt(req.query.limit) || DEFAULT_LIMIT;
        let offset = parseInt(req.query.offset) || 0;

        // Enforce limits
        limit = Math.min(Math.max(1, limit), MAX_LIMIT);
        offset = Math.max(0, offset);

        // Parse filters
        const filters = {
            date_from: req.query.date_from || null,
            date_to: req.query.date_to || null,
            action_type: req.query.action_type || null,
            user_id: req.query.user_id ? parseInt(req.query.user_id) : null,
            endpoint: req.query.endpoint || null,
            status_min: req.query.status_min ? parseInt(req.query.status_min) : null,
            status_max: req.query.status_max ? parseInt(req.query.status_max) : null
        };

        // Build dynamic query
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        if (filters.date_from) {
            conditions.push(`timestamp >= $${paramIndex}`);
            params.push(filters.date_from);
            paramIndex++;
        }

        if (filters.date_to) {
            conditions.push(`timestamp <= $${paramIndex}`);
            params.push(filters.date_to);
            paramIndex++;
        }

        if (filters.action_type) {
            conditions.push(`action_type = $${paramIndex}`);
            params.push(filters.action_type.toUpperCase());
            paramIndex++;
        }

        if (filters.user_id !== null) {
            conditions.push(`user_id = $${paramIndex}`);
            params.push(filters.user_id);
            paramIndex++;
        }

        if (filters.endpoint) {
            conditions.push(`target_endpoint ILIKE $${paramIndex}`);
            params.push(`%${filters.endpoint}%`);
            paramIndex++;
        }

        if (filters.status_min !== null) {
            conditions.push(`response_status >= $${paramIndex}`);
            params.push(filters.status_min);
            paramIndex++;
        }

        if (filters.status_max !== null) {
            conditions.push(`response_status <= $${paramIndex}`);
            params.push(filters.status_max);
            paramIndex++;
        }

        // Build WHERE clause
        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(' AND ')}`
            : '';

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) as total FROM api_audit_logs ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].total);

        // Get paginated results
        const dataParams = [...params, limit, offset];
        const dataResult = await db.query(`
            SELECT
                id,
                timestamp,
                user_id,
                username,
                action_type,
                target_endpoint,
                request_method,
                request_payload,
                response_status,
                duration_ms,
                ip_address,
                user_agent,
                error_message
            FROM api_audit_logs
            ${whereClause}
            ORDER BY timestamp DESC
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `, dataParams);

        res.json({
            logs: dataResult.rows,
            pagination: {
                total,
                limit,
                offset,
                has_more: offset + limit < total
            },
            filters: {
                date_from: filters.date_from,
                date_to: filters.date_to,
                action_type: filters.action_type,
                user_id: filters.user_id,
                endpoint: filters.endpoint,
                status_min: filters.status_min,
                status_max: filters.status_max
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
 * GET /api/audit/stats/daily
 * Get daily aggregated statistics
 *
 * Query Parameters:
 * - days: Number of days to include (default: 30, max: 90)
 */
router.get('/stats/daily', requireAuth, async (req, res) => {
    try {
        let days = parseInt(req.query.days) || 30;
        days = Math.min(Math.max(1, days), 90);

        const result = await db.query(`
            SELECT
                DATE(timestamp) as date,
                COUNT(*) as total_requests,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(*) FILTER (WHERE response_status >= 200 AND response_status < 300) as success_count,
                COUNT(*) FILTER (WHERE response_status >= 400 AND response_status < 500) as client_error_count,
                COUNT(*) FILTER (WHERE response_status >= 500) as server_error_count,
                ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
                MAX(duration_ms) as max_duration_ms
            FROM api_audit_logs
            WHERE timestamp >= NOW() - $1::INTERVAL
            GROUP BY DATE(timestamp)
            ORDER BY date DESC
        `, [`${days} days`]);

        res.json({
            stats: result.rows,
            days_included: days,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error fetching daily stats: ${error.message}`);
        res.status(500).json({
            error: 'Failed to fetch daily statistics',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/audit/stats/endpoints
 * Get endpoint usage statistics
 *
 * Query Parameters:
 * - days: Number of days to include (default: 7, max: 30)
 * - limit: Number of endpoints to return (default: 20, max: 100)
 */
router.get('/stats/endpoints', requireAuth, async (req, res) => {
    try {
        let days = parseInt(req.query.days) || 7;
        let limit = parseInt(req.query.limit) || 20;
        days = Math.min(Math.max(1, days), 30);
        limit = Math.min(Math.max(1, limit), 100);

        const result = await db.query(`
            SELECT
                target_endpoint,
                action_type,
                COUNT(*) as request_count,
                COUNT(DISTINCT user_id) as unique_users,
                COUNT(*) FILTER (WHERE response_status >= 400) as error_count,
                ROUND(AVG(duration_ms)::numeric, 2) as avg_duration_ms,
                MAX(timestamp) as last_called
            FROM api_audit_logs
            WHERE timestamp >= NOW() - $1::INTERVAL
            GROUP BY target_endpoint, action_type
            ORDER BY request_count DESC
            LIMIT $2
        `, [`${days} days`, limit]);

        res.json({
            endpoints: result.rows,
            days_included: days,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error fetching endpoint stats: ${error.message}`);
        res.status(500).json({
            error: 'Failed to fetch endpoint statistics',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
