/**
 * Workflows API routes
 * Handles n8n workflow activity information and execution logging
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const db = require('../../database');
const n8nLogger = require('../../services/n8nLogger');
const logger = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { validateBody } = require('../../middleware/validate');
const { ValidationError, NotFoundError, ServiceUnavailableError } = require('../../utils/errors');
const { WorkflowExecutionBody } = require('../../schemas/store');

// Phase 3.7: n8n-Template-Verzeichnis (read-only).
const TEMPLATES_DIR = '/app/n8n-workflows';

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
      active: parseInt(data.active, 10) || 0,
      executed_today: parseInt(data.executed_today, 10) || 0,
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
  validateBody(WorkflowExecutionBody),
  asyncHandler(async (req, res) => {
    const { workflow_name, execution_id, status, duration_ms, error } = req.body;

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

/**
 * GET /api/workflows/templates  (Phase 3.7)
 * Liefert die Liste der vorgefertigten n8n-Templates.
 */
router.get(
  '/templates',
  requireAuth,
  asyncHandler(async (req, res) => {
    const entries = [];
    try {
      const files = await fs.promises.readdir(TEMPLATES_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) {continue;}
        try {
          const raw = await fs.promises.readFile(path.join(TEMPLATES_DIR, file), 'utf8');
          const wf = JSON.parse(raw);
          const meta = wf.meta || {};
          entries.push({
            id: meta.templateId || file.replace(/\.json$/, ''),
            file,
            name: wf.name || file,
            description: meta.templateDescription || '',
            category: meta.templateCategory || 'general',
            requires_auth: meta.templateRequiresAuth || [],
            node_count: Array.isArray(wf.nodes) ? wf.nodes.length : 0,
          });
        } catch (parseErr) {
          logger.warn(`n8n-Template ${file} konnte nicht geparst werden: ${parseErr.message}`);
        }
      }
    } catch (err) {
      logger.warn(`n8n-Templates Verzeichnis nicht lesbar: ${err.message}`);
    }
    res.json({ templates: entries, timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/workflows/templates/:id/install  (Phase 3.7)
 * Importiert einen Workflow nach n8n.
 *
 * Body: { activate?: boolean }
 *
 * Hinweis: erfordert n8n-API-Key (env N8N_API_KEY) und nur Admin.
 * Ohne API-Key antwortet der Endpoint mit 503 + Konfigurations-Hinweis.
 */
router.post(
  '/templates/:id/install',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const N8N_API_KEY = process.env.N8N_API_KEY;
    const N8N_BASE_URL = process.env.N8N_INTERNAL_URL || 'http://n8n:5678';

    if (!N8N_API_KEY) {
      throw new ServiceUnavailableError(
        'N8N_API_KEY ist nicht konfiguriert — bitte in den n8n-Settings einen Personal API Key erstellen und als ENV setzen.',
        { code: 'N8N_API_KEY_MISSING' }
      );
    }

    // Template-Datei finden
    let templateFile = null;
    let workflowJson = null;
    try {
      const files = await fs.promises.readdir(TEMPLATES_DIR);
      for (const file of files) {
        if (!file.endsWith('.json')) {continue;}
        const raw = await fs.promises.readFile(path.join(TEMPLATES_DIR, file), 'utf8');
        const wf = JSON.parse(raw);
        if ((wf.meta?.templateId || file.replace(/\.json$/, '')) === id) {
          templateFile = file;
          workflowJson = wf;
          break;
        }
      }
    } catch (err) {
      throw new ServiceUnavailableError(`Template-Verzeichnis nicht lesbar: ${err.message}`);
    }

    if (!workflowJson) {
      throw new NotFoundError(`Template nicht gefunden: ${id}`);
    }

    // Strip meta.template* Felder, sind nicht von n8n erlaubt.
    const installable = { ...workflowJson };
    delete installable.meta;
    delete installable.pinData;
    if (installable.active === undefined) {installable.active = false;}

    try {
      const response = await axios.post(`${N8N_BASE_URL}/api/v1/workflows`, installable, {
        headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      logger.info(
        `Phase 3.7: n8n-Template ${id} installiert (n8n workflow id ${response.data?.id})`
      );
      res.status(201).json({
        success: true,
        template_id: id,
        template_file: templateFile,
        workflow: {
          id: response.data?.id,
          name: response.data?.name,
          active: response.data?.active,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.message || err.message;
      logger.error(`Phase 3.7: n8n-Import fehlgeschlagen (${status}): ${detail}`);
      throw new ServiceUnavailableError(`n8n-Import fehlgeschlagen: ${detail}`, {
        code: 'N8N_IMPORT_FAILED',
        details: { status },
      });
    }
  })
);

module.exports = router;
