/**
 * Die Darstellung der Oberflaeche, je Mensch (Phase H1 des Umbaus vom
 * 26.08.2026).
 *
 *   PUT /api/darstellung    meine Darstellung setzen (`{"theme": "dark"}`)
 *
 * NUR EIN WEG, UND ZWAR DER SCHREIBENDE. Gelesen wird die Darstellung nicht
 * hier, sondern dort, wo die Oberflaeche ohnehin schon fragt, wer angemeldet
 * ist: `GET /api/auth/session` (und `/auth/me`, und die Antwort auf die
 * Anmeldung) tragen `theme` mit. Ein eigener GET daneben waere eine DRITTE
 * Anfrage auf jedem Seitenaufbau -- und die zwei, die es gibt, sind seit G2
 * die enge Stelle des Geraets, mit einer eigenen Drossel im Vorbau. Er waere
 * ausserdem zu spaet: die Shell braucht das Theme, bevor sie das erste Mal
 * malt, also genau dann, wenn die Sitzungsprobe antwortet.
 *
 * KEINE KENNUNG IN DER ADRESSE, dieselbe Linie wie `/api/notizen` (D1): die
 * Darstellung gehoert dem Angemeldeten, und wer das ist, sagt die Sitzung.
 * Ein Administrator stellt hier auch nichts fuer einen anderen ein -- wie
 * jemand seinen Bildschirm sieht, ist keine Verwaltungsfrage.
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { DarstellungBody } = require('../schemas/darstellung');

/**
 * PUT /api/darstellung — meine Darstellung setzen.
 *
 * `RETURNING theme` und nicht ein blosses 204: die Oberflaeche setzt
 * `data-theme` auf das, was das Geraet bestaetigt hat, nicht auf das, was sie
 * geschickt hat. Bei zwei Werten ist der Unterschied klein; die Regel ist es
 * nicht.
 */
router.put(
  '/',
  requireAuth,
  requireRole('admin', 'mitarbeiter'),
  validateBody(DarstellungBody),
  asyncHandler(async (req, res) => {
    const result = await db.query(
      'UPDATE admin_users SET theme = $2 WHERE id = $1 RETURNING theme',
      [req.user.id, req.body.theme]
    );
    res.json({ data: result.rows[0], timestamp: new Date().toISOString() });
  })
);

module.exports = router;
