/**
 * Das eigene Profil (M5, Auftrag verwaltung-personen).
 *
 *   GET    /api/profil/bild    mein Bild (404, wenn ich keins habe)
 *   PUT    /api/profil         Vorname, Nachname, Funktion, Kuerzel
 *   PUT    /api/profil/bild    mein Bild setzen (`{"bild": "data:image/png;base64,..."}`)
 *   DELETE /api/profil/bild    mein Bild entfernen
 *
 * KEINE KENNUNG IN DER ADRESSE, dieselbe Linie wie `/api/darstellung`:
 * das Profil gehoert dem Angemeldeten. Gelesen werden die
 * Felder ueber `/api/auth/session` und `/api/auth/me`, hier steht nur der
 * schreibende Weg; das Bild selbst fuehrt keine dieser Auskuenfte mit.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { ProfilBody, BildBody } = require('../schemas/profil');
const benutzerService = require('../services/auth/benutzerService');
const { profilVon } = require('../utils/profil');

router.get(
  '/bild',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const { typ, daten } = await benutzerService.holeBild(req.user.id);
    res.set({ 'Content-Type': typ, 'Cache-Control': 'private, no-cache' }).send(daten);
  })
);

router.put(
  '/',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateBody(ProfilBody),
  asyncHandler(async (req, res) => {
    const zeile = await benutzerService.aktualisiereProfil(req.user.id, req.body);
    res.json({ data: profilVon(zeile), timestamp: new Date().toISOString() });
  })
);

router.put(
  '/bild',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateBody(BildBody),
  asyncHandler(async (req, res) => {
    const zeile = await benutzerService.setzeBild(req.user.id, req.body.bild);
    res.json({ data: profilVon(zeile), timestamp: new Date().toISOString() });
  })
);

router.delete(
  '/bild',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  asyncHandler(async (req, res) => {
    const zeile = await benutzerService.setzeBild(req.user.id, null);
    res.json({ data: profilVon(zeile), timestamp: new Date().toISOString() });
  })
);

module.exports = router;
