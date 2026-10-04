/**
 * Die Darstellung der Oberflaeche, je Mensch (Phase H1 des Umbaus vom
 * 26.08.2026).
 *
 *   PUT /api/darstellung       meine Darstellung setzen (`{"theme": "dark"}`)
 *   GET /api/darstellung/logo  das Logo des Hauses (seit 04.10.2026, siehe unten)
 *
 * FUER DAS THEME NUR EIN WEG, UND ZWAR DER SCHREIBENDE. Gelesen wird die Darstellung nicht
 * hier, sondern dort, wo die Oberflaeche ohnehin schon fragt, wer angemeldet
 * ist: `GET /api/auth/session` (und `/auth/me`, und die Antwort auf die
 * Anmeldung) tragen `theme` mit. Ein eigener GET daneben waere eine DRITTE
 * Anfrage auf jedem Seitenaufbau -- und die zwei, die es gibt, sind seit G2
 * die enge Stelle des Geraets, mit einer eigenen Drossel im Vorbau. Er waere
 * ausserdem zu spaet: die Shell braucht das Theme, bevor sie das erste Mal
 * malt, also genau dann, wenn die Sitzungsprobe antwortet.
 *
 * KEINE KENNUNG IN DER ADRESSE, dieselbe Linie wie `/api/profil`: die
 * Darstellung gehoert dem Angemeldeten, und wer das ist, sagt die Sitzung.
 * Ein Administrator stellt hier auch nichts fuer einen anderen ein -- wie
 * jemand seinen Bildschirm sieht, ist keine Verwaltungsfrage.
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth, requireRole, invalidateUserCache } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError } = require('../utils/errors');
const { validateBody } = require('../middleware/validate');
const { DarstellungBody } = require('../schemas/darstellung');

/**
 * PUT /api/darstellung — meine Darstellung setzen.
 *
 * `RETURNING theme` und nicht ein blosses 204: die Oberflaeche setzt
 * `data-theme` auf das, was das Geraet bestaetigt hat, nicht auf das, was sie
 * geschickt hat. Bei zwei Werten ist der Unterschied klein; die Regel ist es
 * nicht.
 *
 * UND DER ZWISCHENSPEICHER MUSS WEG. `requireAuth` haelt die Zeile eines
 * Menschen 60 s lang (`USER_CACHE_TTL`), und aus genau dieser Zeile liest
 * `GET /api/auth/session` das `theme`. Ohne diese Zeile stellt jemand die
 * Darstellung um, laedt die Seite neu -- und sieht bis zu eine Minute lang
 * wieder die alte, weil die Sitzungsprobe eine warme Kopie von vorher
 * bekommt. Dieselbe Vorsorge trifft `benutzerService` beim Stilllegen und
 * beim Rollenwechsel; hier gilt sie aus demselben Grund, nur fuer eine
 * harmlosere Eigenschaft.
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
    invalidateUserCache(req.user.id);
    res.json({ data: result.rows[0], timestamp: new Date().toISOString() });
  })
);

/**
 * GET /api/darstellung/logo — das Logo des Hauses als Bild (Migration 207).
 *
 * OHNE ANMELDUNG, wie der Firmenname in `GET /api/auth/needs-setup`: ein Logo
 * ist kein Geheimnis, und so kann es spaeter auch ueber dem Anmeldeformular
 * stehen. Gesetzt wird es nur vom Administrator (`PUT /api/settings/logo`),
 * und nur als PNG, JPEG oder WebP, gepruefte erste Bytes -- kein SVG, das
 * Skript tragen koennte. `nosniff` haelt den Browser an den Medientyp.
 *
 * Die Adresse traegt den Stand (`?stand=…`, aus `needs-setup`); damit darf der
 * Browser das Bild lange behalten und sieht nach einem Wechsel trotzdem sofort
 * das neue.
 */
router.get(
  '/logo',
  asyncHandler(async (req, res) => {
    const { rows } = await db.query(
      'SELECT company_logo, company_logo_typ FROM system_settings WHERE id = 1'
    );
    const zeile = rows[0];
    if (!zeile?.company_logo || !zeile.company_logo_typ) {
      throw new NotFoundError('Es ist kein Logo hinterlegt.');
    }
    res.set({
      'Content-Type': zeile.company_logo_typ,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': req.query.stand ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.send(zeile.company_logo);
  })
);

module.exports = router;
