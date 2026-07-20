/**
 * Flow-Agent-Tool: `web` — HTTP-Abruf einer öffentlichen URL (EXTERN).
 *
 * Das einzige Tool, das das lokale Netz verlässt. Deshalb:
 *   - nur verfügbar, wenn der Agent `allow_external` hat (die Registry nimmt es
 *     sonst gar nicht erst auf — siehe flowToolRegistry.js),
 *   - jede Ziel-URL läuft durch assertPublicHttpUrl (SSRF-Guard: keine
 *     privaten/reservierten IPs, kein Cloud-Metadaten-Endpoint),
 *   - Antwortgröße/-zeit gedeckelt.
 */

const axios = require('axios');
const BaseTool = require('../../../tools/baseTool');
const { assertPublicHttpUrl } = require('../../../utils/urlGuard');
const { ValidationError } = require('../../../utils/errors');
const logger = require('../../../utils/logger');

const MAX_RESPONSE_BYTES = 200 * 1024; // 200 KiB
const REQUEST_TIMEOUT_MS = parseInt(process.env.AGENT_WEB_TIMEOUT_MS || '15000', 10);

class WebTool extends BaseTool {
  get name() {
    return 'web';
  }

  get description() {
    return 'Ruft eine öffentliche URL per HTTP ab (GET/POST). Nur für freigegebene Agenten.';
  }

  get parameters() {
    return {
      url: {
        type: 'string',
        description: 'Die öffentliche http(s)-URL',
        required: true,
      },
      methode: {
        type: 'string',
        description: 'GET (Standard) oder POST',
        enum: ['GET', 'POST'],
      },
      daten: {
        type: 'string',
        description: 'Optionaler Body bei POST (Text/JSON)',
      },
    };
  }

  async execute(params = {}, context = {}) {
    const httpClient = context.httpClient || axios;
    const method = String(params.methode || 'GET').toUpperCase() === 'POST' ? 'POST' : 'GET';

    let url;
    try {
      url = await assertPublicHttpUrl(params.url);
    } catch (err) {
      if (err instanceof ValidationError) {
        return `Fehler: ${err.message}`;
      }
      return `Fehler beim Prüfen der URL: ${err.message}`;
    }

    try {
      const res = await httpClient.request({
        url: url.toString(),
        method,
        data: method === 'POST' ? (params.daten ?? '') : undefined,
        timeout: REQUEST_TIMEOUT_MS,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxBodyLength: MAX_RESPONSE_BYTES,
        // Redirects folgen dem SSRF-Guard NICHT — daher abschalten und den
        // Status zurückgeben, statt blind einem Location-Header zu folgen.
        maxRedirects: 0,
        validateStatus: () => true,
        responseType: 'text',
        transformResponse: [d => d],
      });
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
      const snippet =
        body.length > MAX_RESPONSE_BYTES ? `${body.slice(0, MAX_RESPONSE_BYTES)}...` : body;
      return `HTTP ${res.status} von ${url.host}:\n${snippet}`;
    } catch (err) {
      logger.warn(`Flow-Agent web-Tool (${url.host}): ${err.message}`);
      return `Web-Abruf fehlgeschlagen: ${err.message}`;
    }
  }
}

module.exports = WebTool;
