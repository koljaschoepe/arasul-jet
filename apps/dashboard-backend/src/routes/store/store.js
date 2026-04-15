/**
 * Store API Routes
 * Unified store for models and apps
 *
 * Endpoints:
 * - GET /api/store/recommendations - Get recommended models and apps
 * - GET /api/store/search          - Search across models and apps
 * - GET /api/store/info            - Get system info for recommendations
 */

const os = require('os');
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const modelService = require('../../services/llm/modelService');
const appService = require('../../services/app/appService');
const logger = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { cacheMiddleware } = require('../../services/core/cacheService');
const { getLlmRamGB } = require('../../utils/hardware');

// Featured apps (always recommended)
const FEATURED_APPS = ['n8n', 'telegram-bot', 'terminal'];

// Model recommendations based on LLM RAM allocation
const MODEL_RECOMMENDATIONS = {
  // 80GB+ LLM RAM (Thor 128GB)
  xlarge: ['qwen3:32b-q4', 'llama3.1:70b-q4', 'qwen3:14b-q8', 'mistral:7b-q8'],
  // 32-79GB LLM RAM (Orin 64GB = ~38GB LLM allocation)
  large: ['qwen3:32b-q4', 'qwen3:14b-q8', 'mistral:7b-q8', 'gemma2:9b-q8'],
  // 16-31GB LLM RAM
  medium: ['qwen3:14b-q8', 'mistral:7b-q8', 'deepseek-coder:6.7b', 'gemma2:9b-q8'],
  // 4-15GB LLM RAM
  small: ['qwen3:7b-q8', 'mistral:7b-q8', 'gemma2:9b-q8', 'deepseek-coder:6.7b'],
};

// Cache keys and TTLs
const CACHE_KEYS = {
  RECOMMENDATIONS: 'store:recommendations',
  INFO: 'store:info',
};

const CACHE_TTLS = {
  RECOMMENDATIONS: 30000, // 30 seconds
  INFO: 60000, // 60 seconds
};

/**
 * GET /api/store/recommendations
 * Get recommended models (based on RAM) and featured apps
 */
router.get(
  '/recommendations',
  requireAuth,
  cacheMiddleware(CACHE_KEYS.RECOMMENDATIONS, CACHE_TTLS.RECOMMENDATIONS),
  asyncHandler(async (req, res) => {
    logger.debug('[Store] Recommendations request');

    // Get LLM RAM allocation (from env or system detection)
    const llmRamGB = getLlmRamGB();
    logger.debug(`[Store] LLM RAM allocation: ${llmRamGB}GB`);

    // Determine which models to recommend based on LLM RAM
    let recommendedModelIds;
    if (llmRamGB >= 80) {
      recommendedModelIds = MODEL_RECOMMENDATIONS.xlarge;
    } else if (llmRamGB >= 32) {
      recommendedModelIds = MODEL_RECOMMENDATIONS.large;
    } else if (llmRamGB >= 16) {
      recommendedModelIds = MODEL_RECOMMENDATIONS.medium;
    } else {
      recommendedModelIds = MODEL_RECOMMENDATIONS.small;
    }

    // Get full catalog and filter to recommended
    const catalog = await modelService.getCatalog();
    const recommendedModels = recommendedModelIds
      .map(id => catalog.find(m => m.id === id))
      .filter(Boolean)
      .slice(0, 4);

    // If we don't have enough recommended models, fill with first available
    if (recommendedModels.length < 4) {
      const remaining = catalog
        .filter(m => !recommendedModelIds.includes(m.id))
        .slice(0, 4 - recommendedModels.length);
      recommendedModels.push(...remaining);
    }

    // Get apps and filter to featured
    let allApps = [];
    let appsError = false;
    try {
      allApps = await appService.getAllApps({});
    } catch (err) {
      logger.warn('[Store] Failed to load apps:', err.message);
      appsError = true;
    }

    // Mark featured apps and get top 3
    const recommendedApps = allApps
      .map(app => ({
        ...app,
        featured: FEATURED_APPS.includes(app.id),
      }))
      .filter(app => FEATURED_APPS.includes(app.id) || app.featured)
      .slice(0, 4);

    // If we don't have enough featured apps, fill with first available
    if (recommendedApps.length < 4) {
      const remaining = allApps
        .filter(a => !FEATURED_APPS.includes(a.id))
        .slice(0, 4 - recommendedApps.length);
      recommendedApps.push(...remaining);
    }

    res.json({
      models: recommendedModels,
      apps: recommendedApps,
      systemInfo: {
        llmRamGB,
        totalRamGB: Math.round(os.totalmem() / (1024 * 1024 * 1024)),
      },
      ...(appsError && { warnings: ['Apps konnten nicht geladen werden'] }),
    });
  })
);

/**
 * GET /api/store/search
 * Search across models and apps
 */
router.get(
  '/search',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ models: [], apps: [] });
    }

    const query = q.toLowerCase().trim();
    logger.debug(`[Store] Search: "${query}"`);

    // Search models
    const catalog = await modelService.getCatalog();
    const matchingModels = catalog
      .filter(model => {
        const searchFields = [
          model.id,
          model.name,
          model.description,
          ...(model.capabilities || []),
          ...(model.recommended_for || []),
        ].map(s => (s || '').toLowerCase());

        return searchFields.some(field => field.includes(query));
      })
      .slice(0, 10);

    // Search apps
    let allApps = [];
    try {
      allApps = await appService.getAllApps({});
    } catch (err) {
      logger.warn('[Store] Failed to load apps for search:', err.message);
    }

    const matchingApps = allApps
      .filter(app => {
        const searchFields = [app.id, app.name, app.description, app.category].map(s =>
          (s || '').toLowerCase()
        );

        return searchFields.some(field => field.includes(query));
      })
      .slice(0, 10);

    res.json({
      models: matchingModels,
      apps: matchingApps,
      query,
    });
  })
);

/**
 * GET /api/store/info
 * Get system info for store UI
 */
router.get(
  '/info',
  requireAuth,
  cacheMiddleware(CACHE_KEYS.INFO, CACHE_TTLS.INFO),
  asyncHandler(async (req, res) => {
    logger.debug('[Store] Info request');

    // Get disk space
    let diskInfo = { free: 0, total: 0 };
    try {
      diskInfo = await modelService.getDiskSpace();
    } catch (err) {
      logger.warn('[Store] Failed to get disk space:', err.message);
    }

    const llmRamGB = getLlmRamGB();
    const totalRamGB = Math.round(os.totalmem() / (1024 * 1024 * 1024));

    res.json({
      llmRamGB,
      totalRamGB,
      availableDiskGB: Math.floor((diskInfo.free || 0) / (1024 * 1024 * 1024)),
      totalDiskGB: Math.floor((diskInfo.total || 0) / (1024 * 1024 * 1024)),
    });
  })
);

module.exports = router;
