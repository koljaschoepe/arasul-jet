/**
 * Workflows API routes
 * Handles n8n workflow activity information and execution logging
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const n8nLogger = require('../services/n8nLogger');
const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { ValidationError } = require('../utils/errors');

// GET /api/workflows/activity
router.get(
  '/activity',
  requireAuth,
  asyncHandler(async (req, res) => {
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
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/workflows/list (optional - lists workflows from n8n)
router.get(
  '/list',
  requireAuth,
  asyncHandler(async (req, res) => {
    // This would require n8n API access with authentication
    // For now, return a simple response
    res.json({
      workflows: [],
      message: 'Access n8n directly at /n8n for workflow management',
      timestamp: new Date().toISOString(),
    });
  })
);

// ===== n8n Integration Endpoints =====

/**
 * POST /api/workflows/execution
 * Log workflow execution (called by n8n workflows)
 */
router.post(
  '/execution',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { workflow_name, execution_id, status, duration_ms, error } = req.body;

    if (!workflow_name) {
      throw new ValidationError('workflow_name is required');
    }

    if (!status || !['success', 'error', 'running', 'waiting'].includes(status)) {
      throw new ValidationError('status must be one of: success, error, running, waiting');
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
  })
);

/**
 * GET /api/workflows/history
 * Get workflow execution history
 */
router.get(
  '/history',
  requireAuth,
  asyncHandler(async (req, res) => {
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
  })
);

/**
 * GET /api/workflows/stats
 * Get workflow statistics
 */
router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { workflow_name, range = '24h' } = req.query;

    if (range && !['1h', '24h', '7d', '30d'].includes(range)) {
      throw new ValidationError('range must be one of: 1h, 24h, 7d, 30d');
    }

    const stats = await n8nLogger.getWorkflowStats(workflow_name || null, range);

    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/workflows/active
 * Get active workflows (executed in last 24h)
 */
router.get(
  '/active',
  requireAuth,
  asyncHandler(async (req, res) => {
    const workflows = await n8nLogger.getActiveWorkflows();

    res.json({
      success: true,
      count: workflows.length,
      workflows,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/workflows/cleanup
 * Cleanup old workflow execution records
 */
router.delete(
  '/cleanup',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { days = 7 } = req.query;
    const parsedDays = Math.max(1, Math.min(parseInt(days) || 7, 365));

    const deletedCount = await n8nLogger.cleanupOldRecords(parsedDays);

    res.json({
      success: true,
      deleted_count: deletedCount,
      days_kept: parsedDays,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
