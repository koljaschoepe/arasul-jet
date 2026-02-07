/**
 * Store API Routes
 * Unified store for models and apps
 *
 * Endpoints:
 * - GET /api/store/recommendations - Get recommended models and apps
 * - GET /api/store/search          - Search across models and apps
 * - GET /api/store/info            - Get system info for recommendations
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const modelService = require('../services/modelService');
const appService = require('../services/appService');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { cacheMiddleware } = require('../services/cacheService');

// Featured apps (always recommended)
const FEATURED_APPS = ['n8n', 'telegram-bot', 'claude-code'];

// Model recommendations based on RAM
const MODEL_RECOMMENDATIONS = {
  // 64GB+ RAM (Jetson AGX Orin 64GB)
  large: ['qwen3:32b-q4', 'llama3.1:70b-q4', 'qwen3:14b-q8'],
  // 32GB RAM
  medium: ['qwen3:14b-q8', 'mistral:7b-q8', 'deepseek-coder:6.7b'],
  // 8-16GB RAM
  small: ['qwen3:7b-q8', 'mistral:7b-q8', 'gemma2:9b-q8']
};

// Cache keys and TTLs
const CACHE_KEYS = {
  RECOMMENDATIONS: 'store:recommendations',
  INFO: 'store:info'
};

const CACHE_TTLS = {
  RECOMMENDATIONS: 30000, // 30 seconds
  INFO: 60000 // 60 seconds
};

/**
 * GET /api/store/recommendations
 * Get recommended models (based on RAM) and featured apps
 */
router.get('/recommendations', requireAuth, cacheMiddleware(CACHE_KEYS.RECOMMENDATIONS, CACHE_TTLS.RECOMMENDATIONS), asyncHandler(async (req, res) => {
  logger.debug('[Store] Recommendations request');

  // Get system RAM
  let availableRamGB = 64; // Default to Jetson AGX Orin 64GB
  try {
    const diskInfo = await modelService.getDiskSpace();
    // For now, assume 64GB Jetson Orin
    // In future, get actual RAM from system info
    availableRamGB = 64;
  } catch (err) {
    logger.warn('[Store] Failed to get system info, using defaults');
  }

  // Determine which models to recommend
  let recommendedModelIds;
  if (availableRamGB >= 48) {
    recommendedModelIds = MODEL_RECOMMENDATIONS.large;
  } else if (availableRamGB >= 24) {
    recommendedModelIds = MODEL_RECOMMENDATIONS.medium;
  } else {
    recommendedModelIds = MODEL_RECOMMENDATIONS.small;
  }

  // Get full catalog and filter to recommended
  const catalog = await modelService.getCatalog();
  const recommendedModels = recommendedModelIds
    .map(id => catalog.find(m => m.id === id))
    .filter(Boolean)
    .slice(0, 3);

  // If we don't have enough recommended models, fill with first available
  if (recommendedModels.length < 3) {
    const remaining = catalog
      .filter(m => !recommendedModelIds.includes(m.id))
      .slice(0, 3 - recommendedModels.length);
    recommendedModels.push(...remaining);
  }

  // Get apps and filter to featured
  let allApps = [];
  try {
    allApps = await appService.getAllApps({});
  } catch (err) {
    logger.warn('[Store] Failed to load apps:', err.message);
  }

  // Mark featured apps and get top 3
  const recommendedApps = allApps
    .map(app => ({
      ...app,
      featured: FEATURED_APPS.includes(app.id)
    }))
    .filter(app => FEATURED_APPS.includes(app.id) || app.featured)
    .slice(0, 3);

  // If we don't have enough featured apps, fill with first available
  if (recommendedApps.length < 3) {
    const remaining = allApps
      .filter(a => !FEATURED_APPS.includes(a.id))
      .slice(0, 3 - recommendedApps.length);
    recommendedApps.push(...remaining);
  }

  res.json({
    models: recommendedModels,
    apps: recommendedApps,
    systemInfo: {
      availableRamGB
    }
  });
}));

/**
 * GET /api/store/search
 * Search across models and apps
 */
router.get('/search', requireAuth, asyncHandler(async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length < 2) {
    return res.json({ models: [], apps: [] });
  }

  const query = q.toLowerCase().trim();
  logger.debug(`[Store] Search: "${query}"`);

  // Search models
  const catalog = await modelService.getCatalog();
  const matchingModels = catalog.filter(model => {
    const searchFields = [
      model.id,
      model.name,
      model.description,
      ...(model.capabilities || []),
      ...(model.recommended_for || [])
    ].map(s => (s || '').toLowerCase());

    return searchFields.some(field => field.includes(query));
  }).slice(0, 10);

  // Search apps
  let allApps = [];
  try {
    allApps = await appService.getAllApps({});
  } catch (err) {
    logger.warn('[Store] Failed to load apps for search:', err.message);
  }

  const matchingApps = allApps.filter(app => {
    const searchFields = [
      app.id,
      app.name,
      app.description,
      app.category
    ].map(s => (s || '').toLowerCase());

    return searchFields.some(field => field.includes(query));
  }).slice(0, 10);

  res.json({
    models: matchingModels,
    apps: matchingApps,
    query
  });
}));

/**
 * GET /api/store/info
 * Get system info for store UI
 */
router.get('/info', requireAuth, cacheMiddleware(CACHE_KEYS.INFO, CACHE_TTLS.INFO), asyncHandler(async (req, res) => {
  logger.debug('[Store] Info request');

  // Get disk space
  let diskInfo = { free: 0, total: 0 };
  try {
    diskInfo = await modelService.getDiskSpace();
  } catch (err) {
    logger.warn('[Store] Failed to get disk space:', err.message);
  }

  // For now, assume 64GB Jetson Orin
  // In future, get actual RAM from system info
  const availableRamGB = 64;

  res.json({
    availableRamGB,
    availableDiskGB: Math.floor((diskInfo.free || 0) / (1024 * 1024 * 1024)),
    totalDiskGB: Math.floor((diskInfo.total || 0) / (1024 * 1024 * 1024))
  });
}));

module.exports = router;
