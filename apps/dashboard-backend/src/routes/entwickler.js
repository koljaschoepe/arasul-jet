/**
 * Was nur das Entwickler-Cockpit braucht (J44, M7, Karte entwickler-cockpit).
 *
 *   GET /api/entwickler/apps   je App Test und Live, zuletzt geaendert,
 *                              offene Meldungen, ob Test neuer ist als Live
 *
 * Das Cockpit ist eine mitgelieferte App ohne eigenes Backend; es ruft die
 * Plattform-API mit der Sitzung des Menschen (`services/app/mitgeliefert.js`).
 * Die Meldungen selbst kommen ueber `/api/rueckmeldungen`, geschaltet wird
 * ueber `POST /api/apps/:id/schalten` -- hier steht nur, was es sonst nirgends
 * gibt. Jede Route prueft das Kennzeichen Entwickler frisch aus der
 * Datenbank; die Rolle Administrator allein reicht nicht.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const rueckmeldungen = require('../services/rueckmeldung/rueckmeldungen');
const entwicklerCockpit = require('../services/app/entwicklerCockpit');

const nurEntwickler = asyncHandler(async (req, res, next) => {
  await rueckmeldungen.pruefeEntwickler(req.user.id);
  next();
});

router.get(
  '/apps',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  nurEntwickler,
  asyncHandler(async (req, res) => {
    const data = await entwicklerCockpit.apps();
    res.json({ data, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
