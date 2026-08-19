/**
 * Werksreset, Plan 023 B5.
 *
 * Zwei Endpunkte, bewusst getrennt: die Vorschau darf jeder Angemeldete sehen,
 * ausführen darf nur ein Administrator. Die Vorschau ist kein Beiwerk, sie ist
 * der Nachweis: sie sagt vorher, welche Tabelle wie viele Zeilen verliert, und
 * sie meldet, wenn der Reset etwas nicht einordnen kann.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError } = require('../../utils/errors');
const { logSecurityEvent } = require('../../utils/auditLog');
const logger = require('../../utils/logger');
const werksreset = require('../../services/werksreset/werksreset');

function stufeAus(wert) {
  const stufe = String(wert || 'auslieferung');
  if (!werksreset.STUFEN.includes(stufe)) {
    throw new ValidationError(
      `Unbekannte Stufe: ${stufe}. Erlaubt: ${werksreset.STUFEN.join(', ')}`
    );
  }
  return stufe;
}

// GET /api/werksreset/vorschau?stufe=auslieferung&modelle=true
router.get(
  '/vorschau',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const stufe = stufeAus(req.query.stufe);
    const modelleLoeschen = req.query.modelle === 'true';
    res.json(await werksreset.vorschau({ stufe, modelleLoeschen }));
  })
);

// POST /api/werksreset
router.post(
  '/',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const stufe = stufeAus(req.body?.stufe);
    const bestaetigung = req.body?.bestaetigung;
    const modelleLoeschen = req.body?.modelleLoeschen === true;

    if (typeof bestaetigung !== 'string' || bestaetigung.trim() === '') {
      throw new ValidationError('Bestätigung fehlt: der Gerätename muss eingetippt werden');
    }

    const bericht = await werksreset.ausfuehren({
      stufe,
      bestaetigung,
      modelleLoeschen,
      ausgeloestVon: req.user?.username || `id ${req.user?.id}`,
    });

    // Nach `auslieferung` ist das Prüfprotokoll selbst geleert. Der Eintrag
    // danach ist die erste Zeile des neuen Geräts und hält fest, warum es leer ist.
    await logSecurityEvent({
      userId: req.user?.id ?? null,
      action: 'werksreset',
      ipAddress: req.ip,
      details: {
        stufe,
        modelleLoeschen,
        zeilen: bericht.zeilenGesamt,
        dauerMs: bericht.dauerMs,
        ausgeloestVon: bericht.ausgeloestVon,
      },
    }).catch(err => logger.warn(`[werksreset] Prüfeintrag nicht geschrieben: ${err.message}`));

    res.json(bericht);
  })
);

module.exports = router;
