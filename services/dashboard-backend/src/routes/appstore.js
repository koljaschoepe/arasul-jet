/**
 * AppStore API Routes
 * Manages app listing, installation, and lifecycle
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const appService = require('../services/appService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, NotFoundError, ConflictError } = require('../utils/errors');

/**
 * GET /api/apps
 * List all apps with optional filters
 * Query params: category, status, search
 */
router.get('/', requireAuth, asyncHandler(async (req, res) => {
    const { category, status, search } = req.query;

    const apps = await appService.getAllApps({
        category,
        status,
        search
    });

    res.json({
        apps,
        total: apps.length,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/apps/categories
 * List available app categories
 */
router.get('/categories', requireAuth, asyncHandler(async (req, res) => {
    const categories = await appService.getCategories();

    res.json({
        categories,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/apps/:id
 * Get single app details
 */
router.get('/:id', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;

    const app = await appService.getApp(id);

    if (!app) {
        throw new NotFoundError('App nicht gefunden');
    }

    res.json({
        app,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/apps/:id/logs
 * Get container logs for an app
 */
router.get('/:id/logs', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const tail = parseInt(req.query.tail) || 100;

    const logs = await appService.getAppLogs(id, tail);

    res.json({
        appId: id,
        logs,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/apps/:id/events
 * Get event history for an app
 */
router.get('/:id/events', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const events = await appService.getAppEvents(id, limit);

    res.json({
        appId: id,
        events,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/apps/:id/install
 * Install an app
 */
router.post('/:id/install', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const config = req.body.config || {};

    logger.info(`User ${req.user.username} installing app ${id}`);

    const result = await appService.installApp(id, config);

    res.status(201).json({
        ...result,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/apps/:id/uninstall
 * Uninstall an app
 */
router.post('/:id/uninstall', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const removeVolumes = req.body.removeVolumes === true;

    logger.info(`User ${req.user.username} uninstalling app ${id}`);

    const result = await appService.uninstallApp(id, removeVolumes);

    res.json({
        ...result,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/apps/:id/start
 * Start an installed app
 */
router.post('/:id/start', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const { id } = req.params;

    logger.info(`User ${req.user.username} starting app ${id}`);

    const result = await appService.startApp(id);

    res.json({
        ...result,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/apps/:id/stop
 * Stop a running app
 */
router.post('/:id/stop', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const { id } = req.params;

    logger.info(`User ${req.user.username} stopping app ${id}`);

    const result = await appService.stopApp(id);

    res.json({
        ...result,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/apps/:id/restart
 * Restart an app
 * Body: { applyConfig: boolean, async: boolean } - applyConfig recreates container, async returns immediately
 */
router.post('/:id/restart', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { applyConfig, async: asyncMode } = req.body || {};

    // Default to async mode for applyConfig to avoid timeout issues
    const useAsync = asyncMode !== false && applyConfig === true;

    logger.info(`User ${req.user.username} restarting app ${id}${applyConfig ? ' with config update' : ''}${useAsync ? ' (async)' : ''}`);

    let result;
    if (applyConfig === true) {
        result = await appService.recreateAppWithConfig(id, useAsync);
    } else {
        result = await appService.restartApp(id, false);
    }

    res.json({
        ...result,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/apps/sync
 * Sync system apps status with Docker
 */
router.post('/sync', requireAuth, asyncHandler(async (req, res) => {
    await appService.syncSystemApps();

    res.json({
        success: true,
        message: 'Synchronisation abgeschlossen',
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/apps/claude-code/auth-status
 * Get Claude Code OAuth authentication status
 * Returns: oauth status, API key status, account info
 */
router.get('/claude-code/auth-status', requireAuth, asyncHandler(async (req, res) => {
    const authStatus = await appService.getClaudeAuthStatus();

    res.json({
        ...authStatus,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/apps/claude-code/auth-refresh
 * Trigger OAuth token refresh for Claude Code
 */
router.post('/claude-code/auth-refresh', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const result = await appService.refreshClaudeAuth();

    res.json({
        ...result,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/apps/:id/config
 * Get app configuration (secrets are masked)
 */
router.get('/:id/config', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const config = await appService.getAppConfig(id);

    res.json({
        config,
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/apps/:id/n8n-credentials
 * Get n8n integration credentials (SSH credentials for host access)
 * Used to display connection info for triggering apps from n8n
 */
router.get('/:id/n8n-credentials', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const credentials = await appService.getN8nCredentials(id);

    res.json({
        appId: id,
        credentials,
        timestamp: new Date().toISOString()
    });
}));

/**
 * POST /api/apps/:id/config
 * Update app configuration
 */
router.post('/:id/config', requireAuth, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { config } = req.body;

    if (!config || typeof config !== 'object') {
        throw new ValidationError('Ungültige Konfiguration: config object is required');
    }

    await appService.setAppConfig(id, config);

    res.json({
        success: true,
        message: 'Konfiguration gespeichert',
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;
