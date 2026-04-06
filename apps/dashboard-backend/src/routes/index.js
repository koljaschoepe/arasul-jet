/**
 * Main router - combines all API routes
 *
 * Central route registry for the entire backend.
 * Routes are organized into subdirectories by domain:
 *   telegram/  - Bot management, setup, orchestration
 *   system/    - Services, metrics, logs, database
 *   admin/     - Settings, audit, updates, self-healing
 *   ai/        - Models, embeddings, memory, spaces
 *   store/     - App store, unified store, workflows, workspaces
 *   external/  - External API, Claude terminal, events, alerts
 *   datentabellen/ - Dynamic database builder
 *
 * Core routes (auth, chats, documents, llm, rag) stay at the top level.
 */

const express = require('express');
const router = express.Router();

// Rate limiters
const { metricsLimiter, llmLimiter, tailscaleLimiter } = require('../middleware/rateLimit');

// --- Core (top-level) ---
router.use('/auth', require('./auth'));
router.use('/chats', require('./chats'));
router.use('/projects', require('./projects'));
router.use('/documents', require('./documents'));
router.use('/document-analysis', require('./documentAnalysis'));
router.use('/llm', llmLimiter, require('./llm'));
router.use('/rag', require('./rag'));
router.use('/docs', require('./docs'));

// --- Telegram ---
router.use('/telegram', require('./telegram/settings'));
router.use('/telegram-app', require('./telegram/app'));
router.use('/telegram-bots', require('./telegram/bots'));

// --- System ---
router.use('/system', require('./system/system'));
router.use('/services', require('./system/services'));
router.use('/metrics', metricsLimiter, require('./system/metrics'));
router.use('/logs', require('./system/logs'));
router.use('/database', require('./system/database'));
router.use('/tailscale', tailscaleLimiter, require('./system/tailscale'));

// --- Admin ---
router.use('/settings', require('./admin/settings'));
router.use('/audit', require('./admin/audit'));
router.use('/update', require('./admin/update'));
router.use('/self-healing', require('./admin/selfhealing'));

// --- AI ---
router.use('/models', require('./ai/models'));
router.use('/embeddings', llmLimiter, require('./ai/embeddings'));
router.use('/memory', require('./ai/memory'));
router.use('/spaces', require('./ai/spaces'));
router.use('/knowledge-graph', require('./ai/knowledge-graph'));

// --- Store ---
router.use('/apps', require('./store/appstore'));
router.use('/store', require('./store/store'));
router.use('/workflows', require('./store/workflows'));
router.use('/workspaces', require('./store/workspaces'));

// --- External ---
router.use('/v1/external', require('./external/externalApi'));
router.use('/claude-terminal', require('./external/claudeTerminal'));
router.use('/events', require('./external/events'));
router.use('/alerts', require('./external/alerts'));

// --- Datentabellen (versioned) ---
router.use('/v1/datentabellen', require('./datentabellen'));

module.exports = router;
