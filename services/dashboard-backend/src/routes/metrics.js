/**
 * Metrics API routes
 * Handles live metrics and historical data
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const logger = require('../utils/logger');
const axios = require('axios');
// HIGH-006 FIX: Add rate limiting for metrics API (20 requests/second per CLAUDE.md)
const { metricsLimiter } = require('../middleware/rateLimit');

const METRICS_COLLECTOR_URL = `http://${process.env.METRICS_COLLECTOR_HOST || 'metrics-collector'}:9100`;

// HIGH-006 FIX: Apply metricsLimiter (20/s) to metrics endpoints
// GET /api/metrics/live
router.get('/live', metricsLimiter, async (req, res) => {
    try {
        // Get live metrics from metrics collector
        const response = await axios.get(`${METRICS_COLLECTOR_URL}/metrics`, { timeout: 1000 });
        res.json(response.data);

    } catch (error) {
        logger.error(`Error in /api/metrics/live: ${error.message}`);

        // Fallback: get latest from database
        try {
            const result = await db.query(`
                SELECT
                    (SELECT value FROM metrics_cpu ORDER BY timestamp DESC LIMIT 1) as cpu,
                    (SELECT value FROM metrics_ram ORDER BY timestamp DESC LIMIT 1) as ram,
                    (SELECT value FROM metrics_gpu ORDER BY timestamp DESC LIMIT 1) as gpu,
                    (SELECT value FROM metrics_temperature ORDER BY timestamp DESC LIMIT 1) as temperature,
                    (SELECT json_build_object(
                        'used', used,
                        'free', free,
                        'total', used + free,
                        'percent', percent
                    ) FROM metrics_disk ORDER BY timestamp DESC LIMIT 1) as disk
            `);

            const data = result.rows[0];
            res.json({
                cpu: parseFloat(data.cpu) || 0,
                ram: parseFloat(data.ram) || 0,
                gpu: parseFloat(data.gpu) || 0,
                temperature: parseFloat(data.temperature) || 0,
                disk: data.disk || { used: 0, free: 0, total: 0, percent: 0 },
                timestamp: new Date().toISOString()
            });

        } catch (dbError) {
            logger.error(`Database fallback failed: ${dbError.message}`);
            res.status(503).json({
                error: 'Metrics service unavailable',
                timestamp: new Date().toISOString()
            });
        }
    }
});

// HIGH-006 FIX: Apply metricsLimiter (20/s) to history endpoint
// GET /api/metrics/history
router.get('/history', metricsLimiter, async (req, res) => {
    try {
        const range = req.query.range || '24h';

        // Parse range to hours with whitelist validation
        let hours = 24;
        const validRanges = {
            '1h': 1,
            '6h': 6,
            '12h': 12,
            '24h': 24,
            '48h': 48,
            '7d': 168,
            '30d': 720
        };

        if (validRanges[range]) {
            hours = validRanges[range];
        } else {
            return res.status(400).json({
                error: 'Invalid range. Valid values: 1h, 6h, 12h, 24h, 48h, 7d, 30d',
                timestamp: new Date().toISOString()
            });
        }

        const intervalMinutes = Math.max(1, Math.floor(hours / 100));

        // Fetch historical data with parameterized query
        const result = await db.query(`
            WITH time_series AS (
                SELECT generate_series(
                    NOW() - INTERVAL '1 hour' * $1,
                    NOW(),
                    INTERVAL '1 minute' * $2
                ) AS ts
            )
            SELECT
                ts as timestamp,
                (SELECT value FROM metrics_cpu WHERE timestamp <= ts ORDER BY timestamp DESC LIMIT 1) as cpu,
                (SELECT value FROM metrics_ram WHERE timestamp <= ts ORDER BY timestamp DESC LIMIT 1) as ram,
                (SELECT value FROM metrics_gpu WHERE timestamp <= ts ORDER BY timestamp DESC LIMIT 1) as gpu,
                (SELECT value FROM metrics_temperature WHERE timestamp <= ts ORDER BY timestamp DESC LIMIT 1) as temperature,
                (SELECT percent FROM metrics_disk WHERE timestamp <= ts ORDER BY timestamp DESC LIMIT 1) as disk_used
            FROM time_series
            ORDER BY ts ASC
        `, [hours, intervalMinutes]);

        const data = {
            range,
            timestamps: [],
            cpu: [],
            ram: [],
            gpu: [],
            temperature: [],
            disk_used: []
        };

        result.rows.forEach(row => {
            data.timestamps.push(row.timestamp);
            data.cpu.push(parseFloat(row.cpu) || 0);
            data.ram.push(parseFloat(row.ram) || 0);
            data.gpu.push(parseFloat(row.gpu) || 0);
            data.temperature.push(parseFloat(row.temperature) || 0);
            data.disk_used.push(parseFloat(row.disk_used) || 0);
        });

        data.timestamp = new Date().toISOString();
        res.json(data);

    } catch (error) {
        logger.error(`Error in /api/metrics/history: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get metrics history',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
