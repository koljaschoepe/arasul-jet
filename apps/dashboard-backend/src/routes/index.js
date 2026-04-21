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

// --- Discovery (public, no auth) ---
// GET /api/_meta — API surface discovery for clients
// Lists mounted route prefixes, known error codes, and runtime identity.
// Kept deliberately flat: contract is just "what's here", not "what this service can do".
const API_ROUTE_GROUPS = [
  { prefix: '/auth', group: 'core' },
  { prefix: '/chats', group: 'core' },
  { prefix: '/projects', group: 'core' },
  { prefix: '/documents', group: 'core' },
  { prefix: '/document-analysis', group: 'core' },
  { prefix: '/llm', group: 'core' },
  { prefix: '/rag', group: 'core' },
  { prefix: '/telegram', group: 'telegram' },
  { prefix: '/telegram-app', group: 'telegram' },
  { prefix: '/telegram-bots', group: 'telegram' },
  { prefix: '/system', group: 'system' },
  { prefix: '/services', group: 'system' },
  { prefix: '/metrics', group: 'system' },
  { prefix: '/logs', group: 'system' },
  { prefix: '/database', group: 'system' },
  { prefix: '/tailscale', group: 'system' },
  { prefix: '/settings', group: 'admin' },
  { prefix: '/audit', group: 'admin' },
  { prefix: '/update', group: 'admin' },
  { prefix: '/self-healing', group: 'admin' },
  { prefix: '/license', group: 'admin' },
  { prefix: '/gdpr', group: 'admin' },
  { prefix: '/backup', group: 'admin' },
  { prefix: '/ops', group: 'admin' },
  { prefix: '/models', group: 'ai' },
  { prefix: '/embeddings', group: 'ai' },
  { prefix: '/memory', group: 'ai' },
  { prefix: '/spaces', group: 'ai' },
  { prefix: '/knowledge-graph', group: 'ai' },
  { prefix: '/apps', group: 'store' },
  { prefix: '/store', group: 'store' },
  { prefix: '/workflows', group: 'store' },
  { prefix: '/workspaces', group: 'store' },
  { prefix: '/sandbox', group: 'sandbox' },
  { prefix: '/v1/external', group: 'external' },
  { prefix: '/claude-terminal', group: 'external' },
  { prefix: '/events', group: 'external' },
  { prefix: '/alerts', group: 'external' },
  { prefix: '/v1/datentabellen', group: 'datentabellen' },
];

const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
];

router.get('/_meta', (req, res) => {
  res.json({
    name: 'arasul-dashboard-backend',
    version: process.env.SYSTEM_VERSION || '1.0.0',
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    routes: API_ROUTE_GROUPS,
    errorCodes: ERROR_CODES,
    timestamp: new Date().toISOString(),
  });
});

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
router.use('/license', require('./admin/license'));
router.use('/gdpr', require('./admin/gdpr'));
router.use('/backup', require('./admin/backup'));
router.use('/ops', require('./admin/ops'));

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

// --- Sandbox ---
router.use('/sandbox', require('./sandbox'));

// --- External ---
router.use('/v1/external', require('./external/externalApi'));
router.use('/claude-terminal', require('./external/claudeTerminal'));
router.use('/events', require('./external/events'));
router.use('/alerts', require('./external/alerts'));

// --- Datentabellen (versioned) ---
router.use('/v1/datentabellen', require('./datentabellen'));

module.exports = router;
