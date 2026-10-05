/**
 * Services API routes
 * Handles service status and information
 */

const express = require('express');
const { dienstName } = require('../../utils/dienstNamen');
const router = express.Router();
const dockerService = require('../../services/core/docker');
const logger = require('../../utils/logger');
const axios = require('axios');
const { requireAuth, requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ForbiddenError, RateLimitError, ServiceUnavailableError } = require('../../utils/errors');
const serviceConfig = require('../../config/services');
const dienste = require('../../services/core/dienstAbfragen');
const { validateBody } = require('../../middleware/validate');
const { PullModelBody } = require('../../schemas/system-services');

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

// GET /api/services
router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const services = await dockerService.getAllServicesStatus();

    // Real GPU utilization from the metrics-collector (same source as
    // /api/services/ai). Falls back to null when the collector is unreachable —
    // we report null rather than a misleading 0.0 placeholder.
    const gpu = await dienste.gpuWerte();
    const gpuUtilization = gpu?.utilization ?? null;

    res.json({
      llm: {
        status: services.llm?.status || 'unknown',
        gpu_load: gpuUtilization,
      },
      embeddings: {
        status: services.embedding?.status || 'unknown',
        load: gpuUtilization,
      },
      postgres: {
        status: services.postgres?.status || 'unknown',
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/services/ai
router.get(
  '/ai',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const services = await dockerService.getAllServicesStatus();

    // Get GPU stats from Metrics Collector (Best-Effort, null wenn nicht da)
    const gpuStats = await dienste.gpuWerte();

    // Try to get more detailed info from LLM service
    const llmDetails = {
      status: services.llm?.status || 'unknown',
      gpu_load: gpuStats ? gpuStats.utilization : 0.0,
      model_loaded: false,
      last_token_speed: 0,
      gpu: gpuStats
        ? {
            name: gpuStats.name,
            temperature: gpuStats.temperature,
            utilization: gpuStats.utilization,
            memory_used_mb: gpuStats.memory?.used_mb || 0,
            memory_total_mb: gpuStats.memory?.total_mb || 0,
            memory_percent: gpuStats.memory?.percent || 0,
            power_draw_w: gpuStats.power?.draw_w || 0,
            health: gpuStats.health || 'unknown',
            error: gpuStats.error || 'none',
            error_message: gpuStats.error_message,
          }
        : null,
    };

    llmDetails.model_loaded = await dienste.llmHatModell();

    // Try to get embedding service details
    const embeddingDetails = {
      status: services.embedding?.status || 'unknown',
      load: 0.0,
      model_loaded: false,
    };

    embeddingDetails.model_loaded = await dienste.embeddingAntwortet();

    res.json({
      llm: llmDetails,
      embeddings: embeddingDetails,
      gpu_available: gpuStats !== null,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/services/llm/models - List available LLM models
router.get(
  '/llm/models',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const models = await dienste.llmModelle();

    // Format model information
    const formattedModels = models.map(model => ({
      name: model.name,
      size: model.size,
      size_gb: model.size ? (model.size / (1024 * 1024 * 1024)).toFixed(2) : null,
      modified: model.modified_at,
      digest: model.digest,
      details: model.details || {},
    }));

    res.json({
      models: formattedModels,
      count: formattedModels.length,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/services/llm/models/:name - Get detailed information about a specific model
router.get(
  '/llm/models/:name',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name } = req.params;
    const modelInfo = await dienste.llmModellZeigen(name);

    res.json({
      name: name,
      modelfile: modelInfo.modelfile || null,
      parameters: modelInfo.parameters || null,
      template: modelInfo.template || null,
      details: modelInfo.details || {},
      modified_at: modelInfo.modified_at || null,
      timestamp: new Date().toISOString(),
    });
  })
);

// POST /api/services/llm/models/pull - Pull/download a new model
router.post(
  '/llm/models/pull',
  requireAuth,
  requireRole('admin'),
  validateBody(PullModelBody),
  asyncHandler(async (req, res) => {
    const { model_name } = req.body;

    const llmServiceUrl = serviceConfig.llm.url;

    logger.info(`Starting model pull: ${model_name}`);

    // Start model pull (this can take a long time, so we return immediately)
    res.json({
      status: 'started',
      model: model_name,
      message: 'Der Download des Modells läuft. Je nach Größe dauert er einige Minuten.',
      timestamp: new Date().toISOString(),
    });

    // Pull model asynchronously
    axios
      .post(
        `${llmServiceUrl}/api/pull`,
        {
          name: model_name,
          stream: false,
        },
        {
          timeout: 3600000, // 1 hour timeout for large models
        }
      )
      .then(() => {
        logger.info(`Model pull completed: ${model_name}`);
      })
      // Nach gesendeter Antwort (`started`): ein Fehlschlag im Hintergrund
      // landet im Log, eine zweite Antwort gibt es nicht.
      .catch(error => {
        logger.error(`Model pull failed: ${model_name} - ${error.message}`);
      });
  })
);

// DELETE /api/services/llm/models/:name - Delete a model
router.delete(
  '/llm/models/:name',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { name } = req.params;
    logger.info(`Deleting model: ${name}`);
    await dienste.llmModellLoeschen(name);

    logger.info(`Model deleted successfully: ${name}`);

    res.json({
      status: 'success',
      message: `Model '${name}' deleted successfully`,
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/services/embedding/info - Get embedding service information
router.get(
  '/embedding/info',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const info = await dienste.embeddingInfo();

    res.json({
      ...info,
      timestamp: new Date().toISOString(),
    });
  })
);

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
