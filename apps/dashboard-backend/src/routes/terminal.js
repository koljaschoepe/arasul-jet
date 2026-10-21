/**
 * Das Terminal (Karte terminal-im-frontend, M5, 21.10.2026).
 *
 *   GET /api/terminal          ist es da, darf ich, welcher Nutzer am Geraet bin ich
 *
 * Die Tuer vor `/terminal/` (Forward-Auth) steht NICHT hier, sondern in
 * `routes/terminalTor.js` unter `/intern/terminal/tor`, ausserhalb von `/api`.
 *
 * Was dahinter geschieht und warum die Trennung bei Linux liegt:
 * `services/terminal/terminal.js` und `docs/features/TERMINAL.md`.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const terminal = require('../services/terminal/terminal');

// GET /api/terminal — fuer die Shell: zeigt sie den Eintrag, und was steht darin.
router.get(
  '/',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler((req, res) => {
    res.json({ data: terminal.lage(req.user), timestamp: new Date().toISOString() });
  })
);

module.exports = router;
