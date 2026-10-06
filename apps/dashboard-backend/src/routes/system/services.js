/**
 * Services API routes
 * Handles service status and information
 */

const express = require('express');
const { dienstName } = require('../../utils/dienstNamen');
const router = express.Router();
const dockerService = require('../../services/core/docker');
const logger = require('../../utils/logger');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ForbiddenError, RateLimitError, ServiceUnavailableError } = require('../../utils/errors');
const dienste = require('../../services/core/dienstAbfragen');

// Allowed services whitelist - only Arasul services can be restarted
const ALLOWED_SERVICES = [
  'postgres-db',
  'metrics-collector',
  'llm-service',
  'embedding-service',
  'document-indexer',
  'reverse-proxy',
  'dashboard-backend',
  'dashboard-frontend',
  'self-healing-agent',
  'backup-service',
];

// Rate limiting: Track last restart per service (in-memory, resets on service restart)
const lastRestartTimes = new Map();

// GET /api/services/all - Get all services with detailed status
router.get(
  '/all',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const statuses = await dockerService.getAllServicesStatus();

    // Transform to array format with more details
    const services = Object.entries(statuses).map(([key, value]) => ({
      id: key,
      name: value.containerName || key,
      anzeige: dienstName(value.containerName || key),
      status: value.status,
      health: value.health,
      state: value.state,
      canRestart: ALLOWED_SERVICES.includes(value.containerName || key),
    }));

    res.json({
      services,
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/services/restart/:serviceName - Restart a specific service
router.post(
  '/restart/:serviceName',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { serviceName } = req.params;
    const userId = req.user?.id;
    const username = req.user?.username || 'unknown';

    // Validate service name against whitelist
    if (!ALLOWED_SERVICES.includes(serviceName)) {
      logger.warn(`Restart attempt for unauthorized service: ${serviceName} by user ${username}`);
      throw new ForbiddenError(`Service '${serviceName}' is not in the allowed services list`);
    }

    // Rate limiting: Max 1 restart per service per 60 seconds
    const now = Date.now();
    const lastRestart = lastRestartTimes.get(serviceName) || 0;
    const cooldownMs = 60000; // 60 seconds

    if (now - lastRestart < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - (now - lastRestart)) / 1000);
      logger.warn(`Rate limit hit for service restart: ${serviceName} by user ${username}`);
      throw new RateLimitError(
        `Please wait ${remainingSeconds} seconds before restarting this service again`
      );
    }

    // Log the restart attempt
    logger.info(`Service restart initiated: ${serviceName} by user ${username} (ID: ${userId})`);

    // Perform the restart with timeout; the service writes self_healing_events
    // and throws 503 on timeout or error.
    const { success, duration } = await dienste.neuStarten({ serviceName, username, userId });

    if (success) {
      // Update rate limit tracker
      lastRestartTimes.set(serviceName, now);
      logger.info(`Service restart successful: ${serviceName} (took ${duration}ms)`);

      res.json({
        success: true,
        message: `Service '${serviceName}' restarted successfully`,
        service: serviceName,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      });
    } else {
      logger.error(`Service restart failed: ${serviceName}`);
      throw new ServiceUnavailableError(`Failed to restart service '${serviceName}'`);
    }
  })
);

module.exports = router;
