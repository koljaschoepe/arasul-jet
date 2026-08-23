/**
 * Automations API routes (Plan 007)
 *
 * Stellt für den Automationen-Tab (n8n-iframe) transparent eine n8n-Session
 * her, damit der Nutzer nie n8ns eigene Anmeldung sieht. Der feste n8n-Owner
 * (Docker-Secrets n8n_owner_email / n8n_owner_password, beim Container-Start
 * von services/n8n/entrypoint.sh idempotent provisioniert) wird serverseitig
 * bei n8n angemeldet; der resultierende n8n-Session-Cookie wird 1:1
 * (attributgetreu) same-origin an den Browser weitergereicht.
 *
 * Absicherung: forward-auth (Traefik) bzw. requireAuth (hier) bleibt die
 * einzige Wand — ohne gültige Arasul-Session kein Zugriff.
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');

const { asyncHandler } = require('../middleware/errorHandler');
const { requireAuth } = require('../middleware/auth');
const { ServiceUnavailableError } = require('../utils/errors');
const services = require('../config/services');
const logger = require('../utils/logger');

// Der zuletzt erhaltene n8n-Set-Cookie, mit Verfallszeit.
//
// Grund, am 23.08.2026 auf dem Orin gemessen: n8n drosselt Anmeldungen. Fuenf
// Aufrufe kurz hintereinander, und der fuenfte kam als HTTP 503 zurueck
// ("n8n login did not yield a session cookie"). Diese Route meldete sich bis
// dahin bei JEDEM Aufruf neu an, und der Arbeitsbereich ruft sie beim Wechsel
// in jede Ansicht. Wer ein paarmal klickt, sah den Automationen-Tab nicht mehr.
//
// Fuenf Minuten sind bewusst kurz gegenueber der Lebensdauer des n8n-Cookies
// (Vorgabe 168 Stunden): startet n8n neu, ist ein zwischengespeicherter Cookie
// hoechstens fuenf Minuten lang falsch, statt bis zu einer Woche.
const COOKIE_HALTBAR_MS = 5 * 60 * 1000;
let gemerkterCookie = null;
let gemerktBis = 0;
// Laufende Anmeldung, damit gleichzeitige Aufrufe nicht alle einzeln bei n8n
// anklopfen — genau das loest die Drosselung aus.
let laufendeAnmeldung = null;

/** Nur fuer Tests: den Zwischenspeicher leeren. */
function _cookieVergessen() {
  gemerkterCookie = null;
  gemerktBis = 0;
  laufendeAnmeldung = null;
}

// GET /api/automations/session
// Meldet den festen n8n-Owner an und reicht den n8n-Set-Cookie durch.
router.get(
  '/session',
  requireAuth,
  asyncHandler(async (req, res) => {
    const email = services.n8n.ownerEmail;
    const password = services.n8n.ownerPassword;

    if (!email || !password) {
      throw new ServiceUnavailableError('n8n-Owner-Zugangsdaten sind nicht konfiguriert.', {
        service: 'n8n',
      });
    }

    if (gemerkterCookie && Date.now() < gemerktBis) {
      res.set('Set-Cookie', gemerkterCookie);
      res.json({ data: { authenticated: true }, timestamp: new Date().toISOString() });
      return;
    }

    if (laufendeAnmeldung) {
      const cookie = await laufendeAnmeldung;
      res.set('Set-Cookie', cookie);
      res.json({ data: { authenticated: true }, timestamp: new Date().toISOString() });
      return;
    }

    let aufloesen;
    let ablehnen;
    laufendeAnmeldung = new Promise((ja, nein) => {
      aufloesen = ja;
      ablehnen = nein;
    });
    // Ohne diesen Horcher wirft Node bei einer abgelehnten, noch nicht
    // abgewarteten Zusage einen unbehandelten Fehler.
    laufendeAnmeldung.catch(() => {});

    let n8nResponse;
    try {
      n8nResponse = await axios.post(
        `${services.n8n.url}/rest/login`,
        { emailOrLdapLoginId: email, password },
        {
          timeout: services.timeouts.query,
          headers: { 'Content-Type': 'application/json' },
          // 4xx nicht werfen lassen — unten explizit behandeln; nur echte
          // Netzwerkfehler (n8n down) fallen in den catch.
          validateStatus: status => status < 500,
        }
      );
    } catch (err) {
      logger.error('n8n login request failed', { message: err.message, code: err.code });
      laufendeAnmeldung = null;
      ablehnen(err);
      throw new ServiceUnavailableError('n8n ist nicht erreichbar.', { service: 'n8n' });
    }

    const setCookie = n8nResponse.headers['set-cookie'];
    if (n8nResponse.status !== 200 || !Array.isArray(setCookie) || setCookie.length === 0) {
      logger.error('n8n login did not yield a session cookie', {
        status: n8nResponse.status,
        hasCookie: Array.isArray(setCookie) && setCookie.length > 0,
      });
      laufendeAnmeldung = null;
      ablehnen(new Error('kein Cookie'));
      throw new ServiceUnavailableError('n8n-Anmeldung fehlgeschlagen.', { service: 'n8n' });
    }

    // n8n-Set-Cookie attributgetreu weiterreichen (Secure/SameSite/HttpOnly/
    // Path unverändert). Same-origin (Traefik terminiert TLS auf derselben
    // Origin), damit der iframe unter /n8n/ bereits angemeldet lädt.
    gemerkterCookie = setCookie;
    gemerktBis = Date.now() + COOKIE_HALTBAR_MS;
    laufendeAnmeldung = null;
    aufloesen(setCookie);

    res.set('Set-Cookie', setCookie);
    res.json({ data: { authenticated: true }, timestamp: new Date().toISOString() });
  })
);

module.exports = router;
module.exports._cookieVergessen = _cookieVergessen;
