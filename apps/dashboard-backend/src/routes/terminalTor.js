/**
 * Die Tuer vor dem Terminal (Karte terminal-im-frontend, M5, 21.10.2026).
 *
 *   GET /intern/terminal/tor   Forward-Auth fuer Traefik vor `/terminal/`
 *
 * NICHT UNTER `/api`, UND DAS IST DER PUNKT. Die Antwort traegt das Siegel
 * (`ara-<id>:<siegel>`), mit dem der Container verbindet. Unter `/api` holte
 * sich jeder Entwickler sein Siegel im Browser ab, und es gilt weiter, wenn
 * ihm die Rolle wieder genommen wird. `/intern/` reicht Traefik nie an das
 * Backend weiter (die Adresse faellt an die Oberflaeche,
 * `config/traefik/dynamic/routes.yml`); erreichbar ist sie nur im Docker-Netz,
 * und dort fragt sie Traefik selbst (`compose/compose.terminal.yaml`).
 */

const express = require('express');
const router = express.Router();
const db = require('../database');
const logger = require('../utils/logger');
const { asyncHandler } = require('../middleware/errorHandler');
const { tokenOderNull } = require('../services/auth/forwardAuth');
const terminal = require('../services/terminal/terminal');

// GET /intern/terminal/tor — Forward-Auth vor `/terminal/` (compose/compose.terminal.yaml).
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
