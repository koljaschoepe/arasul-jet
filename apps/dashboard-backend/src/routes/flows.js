/**
 * Die Flows der Plattform (Plan 011, Schritt 5).
 *
 * Flows sind Markdown-Dateien unter `data/flows/` -- es gibt keine Tabelle.
 * Geblieben ist nur die Liste: das Ara-Kit liest sie vor einem Update
 * (`lib/upgrade.mjs`), um danach zu sehen, ob keiner verloren ging.
 * Gestartet werden Plattform-Flows ueber `/api/v1/external/flows` und den
 * Zeitplaner; die Verwaltung (anlegen, aendern, Laeufe, Vorlagen) ist mit der
 * Totcode-Pruefung vom 06.10.2026 gefallen, weil keine Oberflaeche und kein
 * Werkzeug sie mehr rief.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const registry = require('../services/flows/flowRegistry');

/**
 * Formt eine interne Definition in die API-Antwort um. `systemPrompt` heißt
 * nach außen `prompt` — im Chat und im Dialog ist das schlicht "der Prompt".
 */
function toApi(flow) {
  const { systemPrompt, ...rest } = flow;
  return { ...rest, prompt: systemPrompt };
}

// GET /api/flows — alle Flows auflisten. Fehlerhafte Dateien lassen die Liste
// NICHT scheitern, sondern werden separat gemeldet: ein kaputter Flow darf
// nicht die ganze Liste lahmlegen.
router.get(
  '/',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const { flows, fehlerhaft } = await registry.listFlows();
    res.json({
      data: flows.map(toApi),
      fehlerhaft,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
