/**
 * Main router - combines all API routes
 */

const express = require('express');
const router = express.Router();

// Import routes
const authRoutes = require('./auth');
const systemRoutes = require('./system');
const metricsRoutes = require('./metrics');
const servicesRoutes = require('./services');
const workflowsRoutes = require('./workflows');
const updateRoutes = require('./update');
const llmRoutes = require('./llm');
const embeddingsRoutes = require('./embeddings');
const logsRoutes = require('./logs');
const selfhealingRoutes = require('./selfhealing');
const databaseRoutes = require('./database');
const docsRoutes = require('./docs');

// Import rate limiters
const { metricsLimiter, llmLimiter, webhookLimiter } = require('../middleware/rateLimit');

// Mount routes
router.use('/auth', authRoutes); // Authentication routes (no rate limit - handled internally)
router.use('/system', systemRoutes);
router.use('/metrics', metricsLimiter, metricsRoutes);
router.use('/services', servicesRoutes);
router.use('/workflows', workflowsRoutes);
router.use('/update', updateRoutes); // Protected by requireAuth in individual routes
router.use('/llm', llmLimiter, llmRoutes);
router.use('/embeddings', llmLimiter, embeddingsRoutes); // Use same limit as LLM
router.use('/logs', logsRoutes); // Protected by requireAuth in individual routes
router.use('/self-healing', selfhealingRoutes); // Protected by requireAuth in individual routes
router.use('/database', databaseRoutes); // Database connection pool monitoring
router.use('/docs', docsRoutes); // API documentation (Swagger UI)

module.exports = router;
