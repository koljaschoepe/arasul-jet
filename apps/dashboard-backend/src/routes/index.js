/**
 * Main router - combines all API routes
 *
 * Central route registry for the entire backend.
 * Routes are organized into subdirectories by domain:
 *   system/    - System, services, tailscale
 *   admin/     - Settings, updates, self-healing
 *   ai/        - Models
 *   store/     - Apps am Geraet
 *   external/  - External API
 *
 * Core routes (auth, docs) stay at the top level. Der Oberflaechen-Chat
 * (/chats, /llm) ist mit Phase B6 (26.08.2026) gefallen; Sprachmodell-Auftraege
 * laufen nur noch ueber /v1/external und die OpenAI-kompatible /v1.
 */

const { versionFuerAnzeige } = require('../utils/version');
const express = require('express');
const router = express.Router();

// Rate limiters
const { tailscaleLimiter } = require('../middleware/rateLimit');

// --- Discovery (public, no auth) ---
// GET /api/_meta — API surface discovery for clients
// Lists mounted route prefixes, known error codes, and runtime identity.
// Kept deliberately flat: contract is just "what's here", not "what this service can do".
const API_ROUTE_GROUPS = [
  { prefix: '/auth', group: 'core' },
  { prefix: '/system', group: 'system' },
  { prefix: '/services', group: 'system' },
  { prefix: '/tailscale', group: 'system' },
  { prefix: '/benutzer', group: 'admin' },
  { prefix: '/freigaben', group: 'admin' },
  { prefix: '/settings', group: 'admin' },
  { prefix: '/update', group: 'admin' },
  { prefix: '/self-healing', group: 'admin' },
  { prefix: '/license', group: 'admin' },
  { prefix: '/ausgang', group: 'admin' },
  { prefix: '/gdpr', group: 'admin' },
  { prefix: '/backup', group: 'admin' },
  { prefix: '/ops', group: 'admin' },
  { prefix: '/werksreset', group: 'admin' },
  { prefix: '/laeufe', group: 'admin' },
  { prefix: '/models', group: 'ai' },
  { prefix: '/flows', group: 'ai' },
  { prefix: '/freigabe-anfragen', group: 'ai' },
  { prefix: '/darstellung', group: 'core' },
  { prefix: '/profil', group: 'core' },
  { prefix: '/ausweise', group: 'core' },
  { prefix: '/firmenordner', group: 'core' },
  { prefix: '/apps', group: 'store' },
  { prefix: '/v1/external', group: 'external' },
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
// Die Darstellung der Oberflaeche, je Mensch (Phase H1). Bei den Kern-Wegen
// und nicht unter `admin/`: sie gehoert dem Angemeldeten. Gelesen wird
// sie ueber `/auth/session`, hier steht nur der schreibende Weg.
router.use('/darstellung', require('./darstellung'));
// Das eigene Profil: Name, Funktion, Kuerzel, Bild (M5). Gehoert dem Angemeldeten.
router.use('/profil', require('./profil'));
// Der Ausweis eines Menschen ausserhalb des Browsers (Bruecke, 21.09.2026).
// Auch hier bei den Kern-Wegen: er gehoert dem Angemeldeten, jeder darf einen
// haben, und niemand stellt einen fuer einen anderen aus.
router.use('/ausweise', require('./ausweise'));
// Der Firmenordner (J33, 22.09.2026). Bei den Kern-Wegen, weil sein erster
// Weg einem MITARBEITER sagt, wo sein Ordner liegt und welche er hat -- die
// Verwaltung darunter ist Admin-Sache, aber der Gegenstand ist einer.
router.use('/firmenordner', require('./firmenordner'));

// --- System ---
router.use('/system', require('./system/system'));
router.use('/services', require('./system/services'));
router.use('/tailscale', tailscaleLimiter, require('./system/tailscale'));

// --- Admin ---
router.use('/benutzer', require('./admin/benutzer'));
router.use('/freigaben', require('./admin/freigaben'));
router.use('/settings', require('./admin/settings'));
router.use('/update', require('./admin/update'));
router.use('/self-healing', require('./admin/selfhealing'));
router.use('/license', require('./admin/license'));
// Der Ausgang der Apps und der Plattform ins Internet (J38).
router.use('/ausgang', require('./admin/ausgang'));
router.use('/gdpr', require('./admin/gdpr'));
router.use('/backup', require('./admin/backup'));
router.use('/ops', require('./admin/ops'));
router.use('/werksreset', require('./admin/werksreset'));
// Die Läufe aller Apps für die Verwaltung (M5).
router.use('/laeufe', require('./admin/laeufe'));

// --- AI ---
router.use('/models', require('./ai/models'));
router.use('/flows', require('./flows'));
// Die Freigaben, die ein Flow anfordert (Phase C7). Bei den Flows und nicht
// bei den Admin-Wegen: hier entscheidet ein MITARBEITER ueber einen Lauf,
// waehrend `/freigaben` (admin/) die Freigabe einer App fuer einen Menschen
// verwaltet. Zwei Gegenstaende, zwei Praefixe.
router.use('/freigabe-anfragen', require('./freigabeAnfragen'));

// --- Store ---
router.use('/apps', require('./store/apps'));

// --- External ---
// Zwei Router auf demselben Praefix, und das ist Absicht: `deploy` ist der Weg
// des Ara-Kits auf das Geraet (Phase C5) und haengt an einem eigenen Bereich
// (`app:deploy`), waehrend `externalApi` das ist, was eine Automatisierung oder
// eine App benutzt. Sie in eine Datei zu legen hiesse, zwei Zielgruppen in
// einer Datei zu haben, deren Rechte sich gerade NICHT decken.
router.use('/v1/external', require('./external/deploy'));
router.use('/v1/external', require('./external/externalApi'));

module.exports = router;
