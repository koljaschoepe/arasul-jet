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

/**
 * GET /api/apps
 * List all apps with optional filters
 * Query params: category, status, search
 */
router.get('/', requireAuth, async (req, res) => {
    try {
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

    } catch (error) {
        logger.error(`Error listing apps: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Apps',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/apps/categories
 * List available app categories
 */
router.get('/categories', requireAuth, async (req, res) => {
    try {
        const categories = await appService.getCategories();

        res.json({
            categories,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error getting categories: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Kategorien',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/apps/:id
 * Get single app details
 */
router.get('/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;

        const app = await appService.getApp(id);

        if (!app) {
            return res.status(404).json({
                error: 'App nicht gefunden',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            app,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error getting app ${req.params.id}: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der App',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/apps/:id/logs
 * Get container logs for an app
 */
router.get('/:id/logs', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const tail = parseInt(req.query.tail) || 100;

        const logs = await appService.getAppLogs(id, tail);

        res.json({
            appId: id,
            logs,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error getting logs for ${req.params.id}: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Logs',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/apps/:id/events
 * Get event history for an app
 */
router.get('/:id/events', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const events = await appService.getAppEvents(id, limit);

        res.json({
            appId: id,
            events,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error getting events for ${req.params.id}: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Events',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/apps/:id/install
 * Install an app
 */
router.post('/:id/install', requireAuth, apiLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const config = req.body.config || {};

        logger.info(`User ${req.user.username} installing app ${id}`);

        const result = await appService.installApp(id, config);

        res.status(201).json({
            ...result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error installing app ${req.params.id}: ${error.message}`);

        // Determine appropriate status code
        let statusCode = 500;
        if (error.message.includes('not found')) {
            statusCode = 404;
        } else if (error.message.includes('already installed')) {
            statusCode = 409;
        } else if (error.message.includes('Abhaengigkeit')) {
            statusCode = 424; // Failed Dependency
        }

        res.status(statusCode).json({
            error: 'Installation fehlgeschlagen',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/apps/:id/uninstall
 * Uninstall an app
 */
router.post('/:id/uninstall', requireAuth, apiLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const removeVolumes = req.body.removeVolumes === true;

        logger.info(`User ${req.user.username} uninstalling app ${id}`);

        const result = await appService.uninstallApp(id, removeVolumes);

        res.json({
            ...result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error uninstalling app ${req.params.id}: ${error.message}`);

        let statusCode = 500;
        if (error.message.includes('nicht installiert')) {
            statusCode = 404;
        } else if (error.message.includes('System-Apps')) {
            statusCode = 403;
        }

        res.status(statusCode).json({
            error: 'Deinstallation fehlgeschlagen',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/apps/:id/start
 * Start an installed app
 */
router.post('/:id/start', requireAuth, apiLimiter, async (req, res) => {
    try {
        const { id } = req.params;

        logger.info(`User ${req.user.username} starting app ${id}`);

        const result = await appService.startApp(id);

        res.json({
            ...result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error starting app ${req.params.id}: ${error.message}`);

        let statusCode = 500;
        if (error.message.includes('nicht installiert')) {
            statusCode = 404;
        }

        res.status(statusCode).json({
            error: 'Start fehlgeschlagen',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/apps/:id/stop
 * Stop a running app
 */
router.post('/:id/stop', requireAuth, apiLimiter, async (req, res) => {
    try {
        const { id } = req.params;

        logger.info(`User ${req.user.username} stopping app ${id}`);

        const result = await appService.stopApp(id);

        res.json({
            ...result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error stopping app ${req.params.id}: ${error.message}`);

        let statusCode = 500;
        if (error.message.includes('nicht installiert')) {
            statusCode = 404;
        } else if (error.message.includes('System-Apps')) {
            statusCode = 403;
        }

        res.status(statusCode).json({
            error: 'Stop fehlgeschlagen',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/apps/:id/restart
 * Restart an app
 */
router.post('/:id/restart', requireAuth, apiLimiter, async (req, res) => {
    try {
        const { id } = req.params;

        logger.info(`User ${req.user.username} restarting app ${id}`);

        const result = await appService.restartApp(id);

        res.json({
            ...result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error restarting app ${req.params.id}: ${error.message}`);

        let statusCode = 500;
        if (error.message.includes('nicht installiert')) {
            statusCode = 404;
        }

        res.status(statusCode).json({
            error: 'Neustart fehlgeschlagen',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/apps/sync
 * Sync system apps status with Docker
 */
router.post('/sync', requireAuth, async (req, res) => {
    try {
        await appService.syncSystemApps();

        res.json({
            success: true,
            message: 'Synchronisation abgeschlossen',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error syncing apps: ${error.message}`);
        res.status(500).json({
            error: 'Synchronisation fehlgeschlagen',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * GET /api/apps/:id/config
 * Get app configuration (secrets are masked)
 */
router.get('/:id/config', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const config = await appService.getAppConfig(id);

        res.json({
            config,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error getting config for ${req.params.id}: ${error.message}`);
        res.status(500).json({
            error: 'Fehler beim Laden der Konfiguration',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * POST /api/apps/:id/config
 * Update app configuration
 */
router.post('/:id/config', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        const { config } = req.body;

        if (!config || typeof config !== 'object') {
            return res.status(400).json({
                error: 'Ungueltige Konfiguration',
                message: 'config object is required',
                timestamp: new Date().toISOString()
            });
        }

        await appService.setAppConfig(id, config);

        res.json({
            success: true,
            message: 'Konfiguration gespeichert',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error setting config for ${req.params.id}: ${error.message}`);

        let statusCode = 500;
        if (error.message.includes('not found')) {
            statusCode = 404;
        }

        res.status(statusCode).json({
            error: 'Fehler beim Speichern der Konfiguration',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
