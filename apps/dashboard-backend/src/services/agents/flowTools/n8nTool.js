/**
 * Flow-Agent-Tool: `n8n` — löst einen n8n-Workflow per Webhook aus.
 *
 * Ruft den internen n8n-Dienst (services.n8n.url, im Docker-Netz) unter
 * /webhook/<pfad> mit einem optionalen JSON-Payload auf. Da das Ziel ein
 * fester interner Host ist, ist kein SSRF-Guard nötig. Der Aufruf ist die
 * Kopplung „Arasul-KI stößt eine n8n-Automation an" (das Gegenstück zum
 * eingehenden n8n → /api/agents/:id/run in Schritt 7).
 */

const axios = require('axios');
const BaseTool = require('../../../tools/baseTool');
const services = require('../../../config/services');
const { timeouts } = require('../../../config/services');
const logger = require('../../../utils/logger');

const RESPONSE_SNIPPET = 800;

class N8nTool extends BaseTool {
  get name() {
    return 'n8n';
  }

  get description() {
    return 'Löst einen n8n-Workflow über dessen Webhook aus (interne Automation)';
  }

  get parameters() {
    return {
      pfad: {
        type: 'string',
        description: 'Der Webhook-Pfad des n8n-Workflows (z. B. "mein-workflow")',
        required: true,
      },
      daten: {
        type: 'string',
        description: 'Optionaler JSON-Text als Payload für den Workflow',
      },
    };
  }

  async execute(params = {}, context = {}) {
    const httpClient = context.httpClient || axios;
    const pfad = String(params.pfad || '')
      .trim()
      .replace(/^\/+/, '');
    // Nur unbedenkliche Pfad-Zeichen — kein Traversal, kein Query-/Fragment-
    // Smuggling (?, #, Whitespace, Control-Chars) in den festen internen Host.
    if (!pfad || pfad.includes('..') || !/^[a-zA-Z0-9/_-]+$/.test(pfad)) {
      return 'Fehler: ungültiger Webhook-Pfad.';
    }

    let payload = {};
    if (params.daten) {
      try {
        payload = JSON.parse(params.daten);
      } catch {
        // Kein gültiges JSON → als Rohtext übergeben.
        payload = { text: String(params.daten) };
      }
    }

    const url = `${services.n8n.url}/webhook/${pfad}`;
    try {
      const res = await httpClient.post(url, payload, {
        timeout: timeouts.webhook,
        headers: { 'Content-Type': 'application/json' },
      });
      const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? {});
      const snippet =
        body.length > RESPONSE_SNIPPET ? `${body.slice(0, RESPONSE_SNIPPET)}...` : body;
      return `n8n-Workflow "${pfad}" ausgelöst (HTTP ${res.status}). Antwort: ${snippet}`;
    } catch (err) {
      const status = err.response?.status;
      logger.warn(`Flow-Agent n8n-Tool (${pfad}): ${err.message}`);
      if (status === 404) {
        return `n8n-Workflow "${pfad}" nicht gefunden oder Webhook nicht aktiv (404). Ist der Workflow aktiv?`;
      }
      return `n8n-Aufruf fehlgeschlagen${status ? ` (HTTP ${status})` : ''}: ${err.message}`;
    }
  }
}

module.exports = N8nTool;
