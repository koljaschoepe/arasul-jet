/**
 * Werksreset, Plan 023 B5.
 *
 * Zwei Endpunkte, beide nur für Administratoren. Die Vorschau ist kein Beiwerk,
 * sie ist der Nachweis: sie sagt vorher, welche Tabelle wie viele Zeilen
 * verliert, und sie meldet, wenn der Reset etwas nicht einordnen kann.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireAdmin } = require('../../middleware/auth');
const { createUserRateLimiter } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError } = require('../../utils/errors');
const { logSecurityEvent } = require('../../utils/auditLog');
const logger = require('../../utils/logger');
const werksreset = require('../../services/werksreset/werksreset');

/**
 * Die Stufe muss dastehen. Ein fehlendes Feld auf einen Standardwert zu legen
 * hiesse hier, im Zweifel die groessere Zerstoerung zu waehlen: `auslieferung`
 * loescht auch Zugangsdaten, Erweiterungen und n8n. Ein Reset, der raet, ist
 * genau das, was dieser ganze Endpunkt nicht sein soll.
 */
// Zwei Ausfuehrungen je Stunde. Der Geraetename als Bestaetigung schuetzt gegen
// den Fehlgriff, nicht gegen eine uebernommene Sitzung, die den Endpunkt in
// einer Schleife aufruft. Die Vorschau bleibt frei, sie aendert nichts.
const werksresetLimiter = createUserRateLimiter(2, 60 * 60 * 1000);

function stufeAus(wert) {
  if (wert === undefined || wert === null || wert === '') {
    throw new ValidationError(
      `Stufe fehlt. Sie muss ausdruecklich dastehen: ${werksreset.STUFEN.join(' oder ')}`
    );
  }
  const stufe = String(wert);
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
  werksresetLimiter,
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
