/**
 * Abfragen an die Nachbardienste fuer `routes/system/services.js`:
 * Metrics-Collector (GPU), LLM-Dienst (Ollama), Embedding-Dienst, und der
 * Neustart eines Containers samt Eintrag in `self_healing_events`.
 *
 * Aus der Route hierher gezogen (M5, Auftrag jet-fehlerklassen): Routen
 * fangen keine Fehler. Die Antworten und Statuscodes sind dieselben wie
 * vorher.
 */

const axios = require('axios');
const db = require('../../database');
const logger = require('../../utils/logger');
const dockerService = require('./docker');
const serviceConfig = require('../../config/services');
const { NotFoundError, ServiceUnavailableError } = require('../../utils/errors');

/**
 * Ein Fehler von axios als eigener Fehler: 404 des Dienstes (wo `name`
 * gegeben ist) wird `NotFoundError`, nicht erreichbar wird 503 mit Satz,
 * alles andere 503 mit dem Text von axios.
 */
function alsDienstFehler(error, dienstSatz, name = null) {
  if (name !== null && error.response && error.response.status === 404) {
    return new NotFoundError(`Model '${name}' not found`);
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
    return new ServiceUnavailableError(dienstSatz);
  }
  return new ServiceUnavailableError(error.message, 'SERVICE_ERROR');
}

/**
 * Die GPU-Werte vom Metrics-Collector, Best-Effort: `null`, wenn er nicht
 * antwortet oder keine GPU meldet -- lieber null als eine irrefuehrende 0.
 */
async function gpuWerte() {
  try {
    const antwort = await axios.get(`${serviceConfig.metrics.url}/api/gpu`, { timeout: 3000 });
    if (antwort.data && antwort.data.available) {
      return antwort.data.gpu;
    }
    return null;
  } catch {
    return null;
  }
}

/** Hat der LLM-Dienst mindestens ein Modell? Best-Effort: sonst `false`. */
async function llmHatModell() {
  try {
    const antwort = await axios.get(
      `http://${process.env.LLM_SERVICE_HOST}:${process.env.LLM_SERVICE_PORT}/api/tags`,
      { timeout: 2000 }
    );
    return antwort.data?.models?.length > 0;
  } catch {
    return false;
  }
}

/** Antwortet der Embedding-Dienst? Best-Effort: sonst `false`. */
async function embeddingAntwortet() {
  try {
    await axios.get(
      `http://${process.env.EMBEDDING_SERVICE_HOST}:${process.env.EMBEDDING_SERVICE_PORT}/health`,
      { timeout: 2000 }
    );
    return true;
  } catch {
    return false;
  }
}

/** Die Modelle des LLM-Dienstes (`/api/tags`), roh. */
async function llmModelle() {
  try {
    const antwort = await axios.get(`${serviceConfig.llm.url}/api/tags`, { timeout: 5000 });
    return antwort.data?.models || [];
  } catch (error) {
    throw alsDienstFehler(error, 'LLM service is not available');
  }
}

/** Die Angaben zu einem Modell (`/api/show`), roh. */
async function llmModellZeigen(name) {
  try {
    const antwort = await axios.post(
      `${serviceConfig.llm.url}/api/show`,
      { name },
      { timeout: 5000 }
    );
    return antwort.data;
  } catch (error) {
    throw alsDienstFehler(error, 'LLM service is not available', name);
  }
}

/**
 * Ein Modell loeschen. HIGH-002 FIX: Ollama erwartet DELETE /api/delete mit
 * JSON-Koerper `{ "name": "model-name" }`.
 */
async function llmModellLoeschen(name) {
  try {
    await axios.delete(`${serviceConfig.llm.url}/api/delete`, {
      headers: { 'Content-Type': 'application/json' },
      data: JSON.stringify({ name }),
      timeout: 10000,
    });
  } catch (error) {
    throw alsDienstFehler(error, 'LLM service is not available', name);
  }
}

/** Die Angaben des Embedding-Dienstes (`/info`), roh. */
async function embeddingInfo() {
  try {
    const antwort = await axios.get(`${serviceConfig.embedding.url}/info`, { timeout: 3000 });
    return antwort.data;
  } catch (error) {
    throw alsDienstFehler(error, 'Embedding service is not available');
  }
}

/** Einen Neustart in `self_healing_events` festhalten, Best-Effort. */
async function neustartFesthalten({ serviceName, username, userId }, success, fehler, dauer) {
  try {
    await db.query(
      `INSERT INTO self_healing_events
             (event_type, service_name, action_taken, details, success, created_at)
             VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        'manual_restart',
        serviceName,
        'container_restart',
        JSON.stringify({
          initiated_by: username,
          user_id: userId,
          ...(dauer && { duration_ms: dauer }),
          ...(fehler && { error: fehler }),
          source: 'dashboard_api',
        }),
        success,
      ]
    );
  } catch (dbError) {
    logger.error(`Failed to log restart event to database: ${dbError.message}`);
  }
}

/**
 * Einen Container neu starten, hoechstens 30 Sekunden warten und das Ergebnis
 * festhalten.
 *
 * @returns {Promise<{success: boolean, duration: number}>}
 * @throws {ServiceUnavailableError} bei Zeitueberschreitung oder Fehler
 */
async function neuStarten({ serviceName, username, userId }) {
  const wer = { serviceName, username, userId };
  const startTime = Date.now();
  let success;
  try {
    success = await Promise.race([
      dockerService.restartContainer(serviceName),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Restart timeout')), 30000);
      }),
    ]);
  } catch (error) {
    const errorMsg =
      error.message === 'Restart timeout'
        ? 'Service restart timed out after 30 seconds'
        : `Error restarting service: ${error.message}`;
    await neustartFesthalten(wer, false, error.message);
    throw new ServiceUnavailableError(errorMsg);
  }

  const duration = Date.now() - startTime;
  if (success) {
    await neustartFesthalten(wer, true, null, duration);
  } else {
    await neustartFesthalten(wer, false, 'Restart returned false');
  }
  return { success, duration };
}

module.exports = {
  gpuWerte,
  llmHatModell,
  embeddingAntwortet,
  llmModelle,
  llmModellZeigen,
  llmModellLoeschen,
  embeddingInfo,
  neuStarten,
};
