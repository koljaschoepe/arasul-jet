/**
 * Workflows API routes
 * Handles n8n workflow activity information and execution logging
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const logger = require('../utils/logger');
const axios = require('axios');
const n8nLogger = require('../services/n8nLogger');

// GET /api/workflows/activity
router.get('/activity', async (req, res) => {
    try {
        // Get workflow activity from database
        const result = await db.query(`
            SELECT
                COUNT(DISTINCT workflow_name) FILTER (WHERE status = 'running') as active,
                COUNT(*) FILTER (WHERE timestamp::date = CURRENT_DATE) as executed_today,
                MAX(timestamp) FILTER (WHERE status = 'error') as last_error_time,
                (SELECT error FROM workflow_activity WHERE status = 'error' ORDER BY timestamp DESC LIMIT 1) as last_error,
                MAX(timestamp) FILTER (WHERE status = 'success') as last_success
            FROM workflow_activity
            WHERE timestamp > NOW() - INTERVAL '24 hours'
        `);

        const data = result.rows[0];

        res.json({
            active: parseInt(data.active) || 0,
            executed_today: parseInt(data.executed_today) || 0,
            last_error: data.last_error || null,
            last_success: data.last_success ? new Date(data.last_success).toISOString() : null,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/workflows/activity: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get workflow activity',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/workflows/list (optional - lists workflows from n8n)
router.get('/list', async (req, res) => {
    try {
        // This would require n8n API access with authentication
        // For now, return a simple response
        res.json({
            workflows: [],
            message: 'Access n8n directly at /n8n for workflow management',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/workflows/list: ${error.message}`);
        res.status(500).json({
            error: 'Failed to list workflows',
            timestamp: new Date().toISOString()
        });
    }
});

// ===== n8n Integration Endpoints =====

/**
 * POST /api/workflows/execution
 * Log workflow execution (called by n8n workflows)
 */
router.post('/execution', async (req, res) => {
    try {
        const { workflow_name, execution_id, status, duration_ms, error } = req.body;

        if (!workflow_name) {
            return res.status(400).json({
                error: 'workflow_name is required',
                timestamp: new Date().toISOString(),
            });
        }

        if (!status || !['success', 'error', 'running', 'waiting'].includes(status)) {
            return res.status(400).json({
                error: 'status must be one of: success, error, running, waiting',
                timestamp: new Date().toISOString(),
            });
        }

        const record = await n8nLogger.logExecution({
            workflow_name,
            execution_id,
            status,
            duration_ms,
            error,
        });

        res.status(201).json({
            success: true,
            record,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        logger.error(`Error logging workflow execution: ${err.message}`);
        res.status(500).json({
            error: 'Failed to log workflow execution',
            message: err.message,
            timestamp: new Date().toISOString(),
        });
    }
});

/**
 * GET /api/workflows/history
 * Get workflow execution history
 */
router.get('/history', async (req, res) => {
    try {
        const { workflow_name, status, limit = 100, offset = 0 } = req.query;

        const parsedLimit = Math.min(parseInt(limit) || 100, 1000);
        const parsedOffset = parseInt(offset) || 0;

        const history = await n8nLogger.getExecutionHistory({
            workflow_name,
            status,
            limit: parsedLimit,
            offset: parsedOffset,
        });

        res.json({
            success: true,
            count: history.length,
            limit: parsedLimit,
            offset: parsedOffset,
            data: history,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        logger.error(`Error fetching workflow history: ${err.message}`);
        res.status(500).json({
            error: 'Failed to fetch workflow history',
            message: err.message,
            timestamp: new Date().toISOString(),
        });
    }
});

/**
 * GET /api/workflows/stats
 * Get workflow statistics
 */
router.get('/stats', async (req, res) => {
    try {
        const { workflow_name, range = '24h' } = req.query;

        if (range && !['1h', '24h', '7d', '30d'].includes(range)) {
            return res.status(400).json({
                error: 'range must be one of: 1h, 24h, 7d, 30d',
                timestamp: new Date().toISOString(),
            });
        }

        const stats = await n8nLogger.getWorkflowStats(workflow_name || null, range);

        res.json({
            success: true,
            stats,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        logger.error(`Error fetching workflow stats: ${err.message}`);
        res.status(500).json({
            error: 'Failed to fetch workflow stats',
            message: err.message,
            timestamp: new Date().toISOString(),
        });
    }
});

/**
 * GET /api/workflows/active
 * Get active workflows (executed in last 24h)
 */
router.get('/active', async (req, res) => {
    try {
        const workflows = await n8nLogger.getActiveWorkflows();

        res.json({
            success: true,
            count: workflows.length,
            workflows,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        logger.error(`Error fetching active workflows: ${err.message}`);
        res.status(500).json({
            error: 'Failed to fetch active workflows',
            message: err.message,
            timestamp: new Date().toISOString(),
        });
    }
});

/**
 * DELETE /api/workflows/cleanup
 * Cleanup old workflow execution records
 */
router.delete('/cleanup', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const parsedDays = Math.max(1, Math.min(parseInt(days) || 7, 365));

        const deletedCount = await n8nLogger.cleanupOldRecords(parsedDays);

        res.json({
            success: true,
            deleted_count: deletedCount,
            days_kept: parsedDays,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        logger.error(`Error cleaning up workflow records: ${err.message}`);
        res.status(500).json({
            error: 'Failed to cleanup workflow records',
            message: err.message,
            timestamp: new Date().toISOString(),
        });
    }
});

module.exports = router;
