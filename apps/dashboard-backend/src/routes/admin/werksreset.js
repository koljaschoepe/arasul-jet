/**
 * Werksreset, Plan 023 B5.
 *
 * Zwei Endpunkte, beide nur für Administratoren. Die Vorschau ist kein Beiwerk,
 * sie ist der Nachweis: sie sagt vorher, welche Tabelle wie viele Zeilen
 * verliert, und sie meldet, wenn der Reset etwas nicht einordnen kann.
 *
 * Die Stufe hat in beiden Verträgen keinen Vorgabewert. Ein fehlendes Feld auf
 * einen Wert zu legen hieße hier, im Zweifel die größere Zerstörung zu wählen.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const { createUserRateLimiter } = require('../../middleware/rateLimit');
const { validateBody, validateQuery } = require('../../middleware/validate');
const { asyncHandler } = require('../../middleware/errorHandler');
const { logSecurityEvent } = require('../../utils/auditLog');
const logger = require('../../utils/logger');
const werksreset = require('../../services/werksreset/werksreset');
const { WerksresetBody, WerksresetVorschauQuery } = require('../../schemas/werksreset');

// Fünf Aufrufe je Stunde und Nutzer. Der Gerätename als Bestätigung schützt
// gegen den Fehlgriff, nicht gegen eine übernommene Sitzung, die den Endpunkt in
// einer Schleife aufruft. Gezählt werden ALLE Aufrufe, auch die mit falsch
// getipptem Gerätenamen: die Bremse steht vor der Prüfung. Deshalb fünf und
// nicht zwei, sonst sperrt sich aus, wer sich zweimal vertippt, ohne dass je
// etwas gelöscht wurde.
const werksresetLimiter = createUserRateLimiter(5, 60 * 60 * 1000);

// Die Vorschau ändert nichts, zählt aber achtzig Tabellen ab. Zwanzig Aufrufe
// in fünf Minuten sind für einen Menschen reichlich und für eine Schleife wenig.
const vorschauLimiter = createUserRateLimiter(20, 5 * 60 * 1000);

// GET /api/werksreset/vorschau?stufe=auslieferung&modelle=true
router.get(
  '/vorschau',
  requireAuth,
  requireRole('admin'),
  vorschauLimiter,
  validateQuery(WerksresetVorschauQuery),
  asyncHandler(async (req, res) => {
    res.json(
      await werksreset.vorschau({
        stufe: req.query.stufe,
        modelleLoeschen: req.query.modelle === 'true',
      })
    );
  })
);

// POST /api/werksreset
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  werksresetLimiter,
  validateBody(WerksresetBody),
  asyncHandler(async (req, res) => {
    const { stufe, bestaetigung, modelleLoeschen } = req.body;

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
