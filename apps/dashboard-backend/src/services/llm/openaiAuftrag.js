/**
 * Auftraege der OpenAI-kompatiblen Schnittstelle (`/v1`): einreihen und
 * einbetten, mit den Fehlern, die `routes/external/openaiCompat.js` an den
 * Klienten gibt.
 *
 * Aus der Route hierher gezogen (M5, Auftrag jet-fehlerklassen): Routen
 * fangen keine Fehler.
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const services = require('../../config/services');
const kiProtokoll = require('../app/kiProtokoll');
const { ApiError, ServiceUnavailableError } = require('../../utils/errors');

const EMBEDDING_SERVICE_URL = services.embedding.url;

/**
 * Einen Auftrag ueber das Protokoll der Modellaufrufe einreihen. Ein
 * unbekannter Mensch ist ein 400 und bleibt es; nur was die Warteschlange
 * sagt, heisst hier 503.
 */
async function einreihen(kontext, auftrag) {
  try {
    return await kiProtokoll.einreihen(kontext, auftrag);
  } catch (err) {
    if (err instanceof ApiError && err.statusCode < 500) {
      throw err;
    }
    logger.warn(`[OpenAI compat] enqueue failed: ${err.message}`);
    throw new ServiceUnavailableError(err.message || 'LLM enqueue failed');
  }
}

/**
 * Texte beim Embedding-Dienst einbetten; nicht erreichbar oder eine Antwort
 * in falscher Form ist 503.
 *
 * @returns {Promise<number[][]>} ein Vektor je Text
 */
async function einbetten(inputs) {
  let response;
  try {
    response = await axios.post(
      `${EMBEDDING_SERVICE_URL}/embed`,
      { texts: inputs },
      { timeout: 30000 }
    );
  } catch (err) {
    logger.warn(`[OpenAI compat] embedding service error: ${err.message}`);
    throw new ServiceUnavailableError('Embedding service unavailable');
  }
  const ergebnis = response.data.vectors || response.data.embeddings || [];
  if (!Array.isArray(ergebnis) || ergebnis.length !== inputs.length) {
    throw new ServiceUnavailableError('Embedding service returned malformed payload');
  }
  return ergebnis;
}

module.exports = { einreihen, einbetten };
