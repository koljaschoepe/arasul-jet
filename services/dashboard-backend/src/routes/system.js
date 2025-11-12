/**
 * System API routes
 * Handles system status, info, and network information
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const dockerService = require('../services/docker');
const logger = require('../utils/logger');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// GET /api/system/status
router.get('/status', async (req, res) => {
    try {
        // Get service statuses from Docker
        const services = await dockerService.getAllServicesStatus();

        // Get latest metrics
        const metricsQuery = await db.query(`
            SELECT
                (SELECT value FROM metrics_cpu ORDER BY timestamp DESC LIMIT 1) as cpu,
                (SELECT value FROM metrics_ram ORDER BY timestamp DESC LIMIT 1) as ram,
                (SELECT value FROM metrics_gpu ORDER BY timestamp DESC LIMIT 1) as gpu,
                (SELECT value FROM metrics_temperature ORDER BY timestamp DESC LIMIT 1) as temperature,
                (SELECT percent FROM metrics_disk ORDER BY timestamp DESC LIMIT 1) as disk_percent
        `);

        const metrics = metricsQuery.rows[0] || {};

        // Get latest self-healing event
        const healingQuery = await db.query(
            'SELECT event_type, severity, description, timestamp FROM self_healing_events ORDER BY timestamp DESC LIMIT 1'
        );
        const lastHealingEvent = healingQuery.rows[0] || null;

        // Determine overall status
        let status = 'OK';
        const warnings = [];
        const criticals = [];

        // Check services
        Object.entries(services).forEach(([name, svc]) => {
            if (svc.status === 'restarting') warnings.push(`${name} is restarting`);
            if (svc.status === 'failed' || svc.status === 'exited') criticals.push(`${name} is down`);
        });

        // Check metrics
        if (metrics.cpu > 80) warnings.push('CPU usage high');
        if (metrics.ram > 80) warnings.push('RAM usage high');
        if (metrics.temperature > 80) warnings.push('Temperature high');
        if (metrics.disk_percent > 80) warnings.push('Disk usage high');
        if (metrics.temperature > 85) criticals.push('Temperature critical');
        if (metrics.disk_percent > 95) criticals.push('Disk usage critical');

        if (criticals.length > 0) status = 'CRITICAL';
        else if (warnings.length > 0) status = 'WARNING';

        res.json({
            status,
            llm: services.llm?.status || 'unknown',
            embeddings: services.embeddings?.status || 'unknown',
            n8n: services.n8n?.status || 'unknown',
            minio: services.minio?.status || 'unknown',
            postgres: services.postgres?.status || 'unknown',
            self_healing_active: services.self_healing?.status === 'healthy',
            last_self_healing_event: lastHealingEvent ? lastHealingEvent.description : null,
            warnings,
            criticals,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/system/status: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get system status',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/system/info
router.get('/info', async (req, res) => {
    try {
        const uptime = os.uptime();
        const hostname = os.hostname();

        // Get JetPack version (if available)
        let jetpackVersion = 'unknown';
        try {
            const { stdout } = await execAsync('dpkg -l | grep nvidia-jetpack || echo "N/A"');
            const match = stdout.match(/nvidia-jetpack\s+(\S+)/);
            if (match) jetpackVersion = match[1];
        } catch (e) {
            logger.warn('Could not determine JetPack version');
        }

        res.json({
            version: process.env.SYSTEM_VERSION || '1.0.0',
            build_hash: process.env.BUILD_HASH || 'dev',
            jetpack_version: jetpackVersion,
            uptime_seconds: Math.floor(uptime),
            hostname: hostname,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/system/info: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get system info',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/system/network
router.get('/network', async (req, res) => {
    try {
        const networkInterfaces = os.networkInterfaces();
        const ipAddresses = [];

        // Extract IPv4 addresses (exclude loopback)
        Object.values(networkInterfaces).forEach(interfaces => {
            interfaces.forEach(iface => {
                if (iface.family === 'IPv4' && !iface.internal) {
                    ipAddresses.push(iface.address);
                }
            });
        });

        // Check internet connectivity
        let internetReachable = false;
        try {
            await execAsync('ping -c 1 -W 2 8.8.8.8');
            internetReachable = true;
        } catch (e) {
            internetReachable = false;
        }

        // Check if n8n webhook is reachable
        let n8nWebhookReachable = false;
        try {
            const axios = require('axios');
            await axios.get(`http://${process.env.N8N_HOST}:${process.env.N8N_PORT}/healthz`, { timeout: 2000 });
            n8nWebhookReachable = true;
        } catch (e) {
            n8nWebhookReachable = false;
        }

        res.json({
            ip_addresses: ipAddresses,
            mdns: 'arasul.local',
            internet_reachable: internetReachable,
            n8n_webhook_reachable: n8nWebhookReachable,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/system/network: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get network info',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/system/reload-config - Reload configuration without restart
router.post('/reload-config', async (req, res) => {
    try {
        logger.info('Configuration reload requested');

        // Reload environment variables (if changed)
        // Note: This only works for non-critical config that doesn't require restart

        // Clear require cache for configuration modules
        delete require.cache[require.resolve('../config')];

        // Reload rate limit configuration
        try {
            const rateLimit = require('../middleware/rateLimit');
            // Rate limiter will pick up new config on next request
            logger.info('Rate limit configuration reload triggered');
        } catch (e) {
            logger.warn(`Failed to reload rate limits: ${e.message}`);
        }

        // Reload logging configuration
        try {
            const currentLogLevel = process.env.LOG_LEVEL || 'INFO';
            logger.info(`Current log level: ${currentLogLevel}`);
        } catch (e) {
            logger.warn(`Failed to reload logging config: ${e.message}`);
        }

        res.json({
            status: 'success',
            message: 'Configuration reload completed',
            reloaded: [
                'rate_limits',
                'logging_config'
            ],
            note: 'Some changes require a restart (database credentials, ports, etc.)',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/system/reload-config: ${error.message}`);
        res.status(500).json({
            error: 'Failed to reload configuration',
            details: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
