/**
 * Flow-Deploy (Plan 017 Schritt 3) — verwandelt eine Flow-Erweiterung in einen
 * echten, laufenden n8n-Workflow.
 *
 * Live schalten = `workflow.json` aus dem Paket per n8n-API importieren und
 * aktivieren; die n8n-Workflow-ID wird am Register-Eintrag gemerkt
 * (`extensions.n8n_workflow_id`). Erneutes Live-Schalten überschreibt denselben
 * Workflow, Deaktivieren pausiert ihn, Löschen räumt ihn ab.
 *
 * n8n-Ausfälle degradieren SICHTBAR (Status „nicht erreichbar") statt etwas zu
 * brechen: die Fachlogik in extensionService fängt die geworfenen Fehler und
 * meldet sie an die UI zurück.
 */

const fsp = require('fs/promises');
const path = require('path');
const axios = require('axios');
const logger = require('../../utils/logger');
const { ValidationError, ServiceUnavailableError } = require('../../utils/errors');
const pkg = require('./extensionPackage');

const N8N_URL = process.env.N8N_URL || 'http://n8n:5678';
const N8N_API_KEY = process.env.N8N_API_KEY;
const N8N_TIMEOUT_MS = parseInt(process.env.N8N_API_TIMEOUT_MS || '10000', 10);

function headers() {
  const h = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (N8N_API_KEY) {
    h['X-N8N-API-KEY'] = N8N_API_KEY;
  }
  return h;
}

/**
 * n8n-Fehler in eine sichtbare, verständliche Form bringen:
 * - ECONNREFUSED/Timeout → „nicht erreichbar"
 * - 401/403 → fehlender/ungültiger N8N_API_KEY (häufigste Fehlkonfiguration)
 * - 400 → das Paket-Workflow-JSON ist inkompatibel
 * Alles andere bleibt, wie es ist.
 */
function alsErreichbarkeit(err) {
  if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
    return new ServiceUnavailableError('n8n ist nicht erreichbar');
  }
  const status = err.response && err.response.status;
  if (status === 401 || status === 403) {
    return new ServiceUnavailableError(
      'n8n-API-Zugang fehlt oder ist ungültig (N8N_API_KEY), Flow-Erweiterung nicht importierbar'
    );
  }
  if (status === 400) {
    return new ValidationError('n8n hat den Workflow abgelehnt (inkompatibles workflow.json)');
  }
  return err;
}

/** Liest und prüft die workflow.json einer Flow-Erweiterung. */
async function ladeWorkflowJson(ext) {
  const entry = (ext.manifest && ext.manifest.entry) || 'workflow.json';
  const file = path.join(pkg.packageDirFor(ext.id), entry);
  let parsed;
  try {
    parsed = JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch (err) {
    throw new ValidationError(`workflow.json der Erweiterung "${ext.id}" fehlt oder ist ungültig`);
  }
  if (
    !parsed ||
    !Array.isArray(parsed.nodes) ||
    !parsed.connections ||
    typeof parsed.connections !== 'object'
  ) {
    throw new ValidationError('workflow.json braucht mindestens "nodes" und "connections"');
  }
  // n8n akzeptiert beim Erstellen nur eine enge Nutzlast — nicht read-only-
  // Felder wie id/active/tags durchreichen.
  return {
    name: parsed.name || ext.name,
    nodes: parsed.nodes,
    connections: parsed.connections,
    settings: parsed.settings || {},
  };
}

/**
 * Importiert (oder überschreibt) den Workflow und aktiviert ihn. Gibt die
 * n8n-Workflow-ID zurück, die der Aufrufer am Register-Eintrag speichert.
 */
async function liveSchalten(ext) {
  const payload = await ladeWorkflowJson(ext);
  let workflowId = ext.n8nWorkflowId || null;

  try {
    if (workflowId) {
      // Bestehenden Workflow überschreiben — existiert er nicht mehr, neu anlegen.
      try {
        await axios.put(`${N8N_URL}/api/v1/workflows/${workflowId}`, payload, {
          headers: headers(),
          timeout: N8N_TIMEOUT_MS,
        });
      } catch (err) {
        if (err.response && err.response.status === 404) {
          workflowId = null;
        } else {
          throw err;
        }
      }
    }
    if (!workflowId) {
      const res = await axios.post(`${N8N_URL}/api/v1/workflows`, payload, {
        headers: headers(),
        timeout: N8N_TIMEOUT_MS,
      });
      const roh = res.data.id ?? res.data.data?.id;
      if (roh === undefined || roh === null) {
        throw new ServiceUnavailableError('n8n lieferte keine Workflow-ID zurück');
      }
      workflowId = String(roh);
    }
    await axios.post(
      `${N8N_URL}/api/v1/workflows/${workflowId}/activate`,
      {},
      { headers: headers(), timeout: N8N_TIMEOUT_MS }
    );
    logger.info(`Flow-Erweiterung "${ext.id}" live: n8n-Workflow ${workflowId} aktiviert`);
    return workflowId;
  } catch (err) {
    throw alsErreichbarkeit(err);
  }
}

/** Pausiert den Workflow einer Flow-Erweiterung (Deaktivieren). Idempotent. */
async function pausieren(ext) {
  if (!ext.n8nWorkflowId) {
    return;
  }
  try {
    await axios.post(
      `${N8N_URL}/api/v1/workflows/${ext.n8nWorkflowId}/deactivate`,
      {},
      { headers: headers(), timeout: N8N_TIMEOUT_MS }
    );
    logger.info(`Flow-Erweiterung "${ext.id}": n8n-Workflow ${ext.n8nWorkflowId} pausiert`);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return; // schon weg
    }
    throw alsErreichbarkeit(err);
  }
}

/** Entfernt den Workflow ganz (beim Deinstallieren). Idempotent. */
async function entfernen(ext) {
  if (!ext.n8nWorkflowId) {
    return;
  }
  try {
    await axios.delete(`${N8N_URL}/api/v1/workflows/${ext.n8nWorkflowId}`, {
      headers: headers(),
      timeout: N8N_TIMEOUT_MS,
    });
    logger.info(`Flow-Erweiterung "${ext.id}": n8n-Workflow ${ext.n8nWorkflowId} gelöscht`);
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return;
    }
    logger.warn(`Flow-Erweiterung "${ext.id}": n8n-Workflow nicht gelöscht: ${err.message}`);
  }
}

/**
 * Live-Status eines Flow-Workflows für die Karte im Panel. Bricht nie — bei
 * n8n-Ausfall kommt `{ erreichbar:false }` zurück.
 */
async function status(ext) {
  if (ext.type !== 'flow') {
    return null;
  }
  if (!ext.n8nWorkflowId) {
    return { erreichbar: true, importiert: false, aktiv: false };
  }
  try {
    const res = await axios.get(`${N8N_URL}/api/v1/workflows/${ext.n8nWorkflowId}`, {
      headers: headers(),
      timeout: N8N_TIMEOUT_MS,
    });
    const wf = res.data.data || res.data;
    let letzterLauf = null;
    try {
      const ex = await axios.get(`${N8N_URL}/api/v1/executions`, {
        headers: headers(),
        timeout: N8N_TIMEOUT_MS,
        params: { workflowId: ext.n8nWorkflowId, limit: 1 },
      });
      const liste = ex.data.data || ex.data.results || [];
      if (liste.length > 0) {
        letzterLauf = {
          zeit: liste[0].startedAt || liste[0].stoppedAt || null,
          status: liste[0].status || (liste[0].finished ? 'success' : 'unbekannt'),
        };
      }
    } catch {
      // Ausführungen sind Beiwerk — fehlen sie, bleibt der Rest gültig.
    }
    return {
      erreichbar: true,
      importiert: true,
      aktiv: wf.active === true,
      workflowId: ext.n8nWorkflowId,
      letzterLauf,
    };
  } catch (err) {
    if (err.response && err.response.status === 404) {
      return { erreichbar: true, importiert: false, aktiv: false };
    }
    logger.warn(`Flow-Status "${ext.id}" nicht abrufbar: ${err.message}`);
    return { erreichbar: false, importiert: true, aktiv: false, workflowId: ext.n8nWorkflowId };
  }
}

module.exports = {
  liveSchalten,
  pausieren,
  entfernen,
  status,
  ladeWorkflowJson,
};
