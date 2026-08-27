/**
 * Main router - combines all API routes
 *
 * Central route registry for the entire backend.
 * Routes are organized into subdirectories by domain:
 *   system/    - Services, metrics, logs, database
 *   admin/     - Settings, audit, updates, self-healing
 *   ai/        - Models, embeddings
 *   store/     - Apps am Geraet, Modellkatalog
 *   external/  - External API, events, alerts
 *
 * Core routes (auth, docs) stay at the top level. Der Oberflaechen-Chat
 * (/chats, /llm) ist mit Phase B6 (26.08.2026) gefallen; Sprachmodell-Auftraege
 * laufen nur noch ueber /v1/external und die OpenAI-kompatible /v1.
 */

const { versionFuerAnzeige } = require('../utils/version');
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
  { prefix: '/system', group: 'system' },
  { prefix: '/services', group: 'system' },
  { prefix: '/metrics', group: 'system' },
  { prefix: '/logs', group: 'system' },
  { prefix: '/database', group: 'system' },
  { prefix: '/tailscale', group: 'system' },
  { prefix: '/benutzer', group: 'admin' },
  { prefix: '/freigaben', group: 'admin' },
  { prefix: '/settings', group: 'admin' },
  { prefix: '/audit', group: 'admin' },
  { prefix: '/update', group: 'admin' },
  { prefix: '/self-healing', group: 'admin' },
  { prefix: '/license', group: 'admin' },
  { prefix: '/gdpr', group: 'admin' },
  { prefix: '/backup', group: 'admin' },
  { prefix: '/ops', group: 'admin' },
  { prefix: '/werksreset', group: 'admin' },
  { prefix: '/models', group: 'ai' },
  { prefix: '/embeddings', group: 'ai' },
  { prefix: '/flows', group: 'ai' },
  { prefix: '/freigabe-anfragen', group: 'ai' },
  { prefix: '/apps', group: 'store' },
  { prefix: '/store', group: 'store' },
  { prefix: '/v1/external', group: 'external' },
  { prefix: '/events', group: 'external' },
  { prefix: '/alerts', group: 'external' },
  { prefix: '/docs', group: 'core', description: 'Static API documentation' },
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
    version: versionFuerAnzeige(),
    node: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    routes: API_ROUTE_GROUPS,
    errorCodes: ERROR_CODES,
    timestamp: new Date().toISOString(),
  });
});

// --- Core (top-level) ---
router.use('/auth', require('./auth'));
router.use('/docs', require('./docs'));

// --- System ---
router.use('/system', require('./system/system'));
router.use('/services', require('./system/services'));
router.use('/metrics', metricsLimiter, require('./system/metrics'));
router.use('/logs', require('./system/logs'));
router.use('/database', require('./system/database'));
router.use('/tailscale', tailscaleLimiter, require('./system/tailscale'));

// --- Admin ---
router.use('/benutzer', require('./admin/benutzer'));
router.use('/freigaben', require('./admin/freigaben'));
router.use('/settings', require('./admin/settings'));
router.use('/audit', require('./admin/audit'));
router.use('/update', require('./admin/update'));
router.use('/self-healing', require('./admin/selfhealing'));
router.use('/license', require('./admin/license'));
router.use('/gdpr', require('./admin/gdpr'));
router.use('/backup', require('./admin/backup'));
router.use('/ops', require('./admin/ops'));
router.use('/werksreset', require('./admin/werksreset'));

// --- AI ---
router.use('/models', require('./ai/models'));
router.use('/embeddings', llmLimiter, require('./ai/embeddings'));
router.use('/flows', require('./flows'));
// Die Freigaben, die ein Flow anfordert (Phase C7). Bei den Flows und nicht
// bei den Admin-Wegen: hier entscheidet ein MITARBEITER ueber einen Lauf,
// waehrend `/freigaben` (admin/) die Freigabe einer App fuer einen Menschen
// verwaltet. Zwei Gegenstaende, zwei Praefixe.
router.use('/freigabe-anfragen', require('./freigabeAnfragen'));

// --- Store ---
router.use('/apps', require('./store/apps'));
router.use('/store', require('./store/store'));

// --- External ---
// Zwei Router auf demselben Praefix, und das ist Absicht: `deploy` ist der Weg
// des Ara-Kits auf das Geraet (Phase C5) und haengt an einem eigenen Bereich
// (`app:deploy`), waehrend `externalApi` das ist, was eine Automatisierung oder
// eine App benutzt. Sie in eine Datei zu legen hiesse, zwei Zielgruppen in
// einer Datei zu haben, deren Rechte sich gerade NICHT decken.
router.use('/v1/external', require('./external/deploy'));
router.use('/v1/external', require('./external/externalApi'));
router.use('/events', require('./external/events'));
router.use('/alerts', require('./external/alerts'));

module.exports = router;
