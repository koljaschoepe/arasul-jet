/**
 * Das Terminal (Karte terminal-im-frontend, M5, 21.10.2026).
 *
 *   GET /api/terminal       ist es da, darf ich, welcher Nutzer am Geraet bin ich
 *   GET /api/terminal/tor   Forward-Auth fuer Traefik vor `/terminal/`
 *
 * Was dahinter geschieht und warum die Trennung bei Linux liegt:
 * `services/terminal/terminal.js` und `docs/features/TERMINAL.md`.
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const logger = require('../utils/logger');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { tokenOderNull } = require('../services/auth/forwardAuth');
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

// GET /api/terminal/tor — Forward-Auth vor `/terminal/` (config/traefik).
//
// Wie `/api/auth/verify` antwortet sie Traefik mit einem schlichten Status
// statt mit dem JSON-Umschlag: alles ausser 2xx heisst dort „abweisen". Sie
// liest NUR das Sitzungscookie, nie einen Ausweis (`Authorization`): ein
// Ausweis gehoert dem Rechner eines Menschen und oeffnet Apps, keine Shell am
// Geraet. Und sie fragt die Datenbank bei jedem Aufbau, nicht den
// Zwischenspeicher von `requireAuth`: ein entzogenes Recht gilt beim naechsten
// Oeffnen, nicht erst nach 60 Sekunden.
router.get(
  '/tor',
  asyncHandler(async (req, res) => {
    const token = req.cookies && req.cookies.arasul_session;
    const decoded = token ? await tokenOderNull(token) : null;
    let zeile = null;
    if (decoded) {
      const result = await db.query(
        'SELECT id, username, entwickler FROM admin_users WHERE id = $1 AND is_active = true',
        [decoded.userId]
      );
      zeile = result.rows[0] || null;
    }
    const urteil = terminal.entscheide({
      decoded,
      zeile,
      origin: req.headers.origin,
      host: req.headers['x-forwarded-host'] || req.headers.host,
    });
    if (urteil.status !== 200) {
      logger.debug(`Terminal-Tor: ${urteil.status} ${urteil.grund}`);
      return res.status(urteil.status).type('text/plain; charset=utf-8').send(urteil.grund);
    }
    logger.info(`Terminal-Tor: ${zeile.username} als ${urteil.nutzer}`);
    res.set(terminal.KOPFZEILE, urteil.kopf);
    res.status(200).send('OK');
  })
);

module.exports = router;
