/**
 * Qdrant Service for Document Vectors
 * Handles all Qdrant vector database operations for document management.
 *
 * Responsibilities:
 * - Delete document vectors
 * - Update document space payloads
 * - Semantic search queries
 * - Retry logic for Qdrant operations
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const { retry } = require('../../utils/retry');
const services = require('../../config/services');

// Configuration
const QDRANT_HOST = services.qdrant.host;
const QDRANT_PORT = services.qdrant.port;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';

/**
 * Sicherung gegen einen abgeschalteten Qdrant (Plan 023 G4).
 *
 * Seit Plan 021, Schritt 8 liegt Qdrant im Compose-Profil `classic-rag` und
 * startet nicht mit. Der Name löst dann gar nicht erst auf. Jeder Aufruf hier
 * lief trotzdem in drei Versuche mit Wartezeit dazwischen.
 *
 * Am 22.08.2026 auf dem Orin gemessen, beim Löschen eines Ordners mit hundert
 * Dateien:
 *
 *   18:26:45  Failed to delete from Qdrant after retries … getaddrinfo EAI_AGAIN
 *   18:26:50  Failed to delete from Qdrant after retries … getaddrinfo EAI_AGAIN
 *
 * Fünf Sekunden je Dokument, also über acht Minuten für den Ordner, in denen
 * der Ordner-Abgleich nichts anderes tat. Neue Dateien bekamen in dieser Zeit
 * keine Zeile und waren nicht auffindbar.
 *
 * Deshalb ein Schalter, der von selbst zurückspringt: Sagt das Netz „diesen
 * Rechner gibt es nicht", wird Qdrant für `PAUSE_MS` als abgeschaltet
 * behandelt und jeder Aufruf kehrt sofort zurück. Ein Flag wäre die schlechtere
 * Lösung: es müsste gepflegt werden und träfe den Fall „Qdrant läuft, ist aber
 * gerade nicht erreichbar" nicht.
 */
const NICHT_ERREICHBAR = new Set(['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'EHOSTUNREACH']);
const PAUSE_MS = parseInt(process.env.QDRANT_PAUSE_MS || '60000', 10);
let stummBis = 0;

/** Ist Qdrant gerade als abgeschaltet vermerkt? */
function istAbgeschaltet() {
  return Date.now() < stummBis;
}

/** Einen Fehler bewerten: war das „gibt es nicht" oder „hat nicht geklappt"? */
function vermerkeFehler(err) {
  const code = err?.code || err?.cause?.code;
  if (!NICHT_ERREICHBAR.has(code)) {
    return false;
  }
  if (!istAbgeschaltet()) {
    logger.info(
      `Qdrant nicht erreichbar (${code}), wird für ${Math.round(PAUSE_MS / 1000)}s ` +
        'übersprungen. Das ist der Normalfall, solange die Vektorsuche aus ist.'
    );
  }
  stummBis = Date.now() + PAUSE_MS;
  return true;
}

/** Ein geglückter Aufruf hebt die Pause sofort auf. */
function vermerkeErfolg() {
  stummBis = 0;
}

/** Nur für Tests: den Schalter zurückstellen. */
function _pauseZuruecksetzen() {
  stummBis = 0;
}

/**
 * Delete all vectors for a document from Qdrant (with retry).
 * Non-critical: logs errors but does not throw.
 * @param {string} documentId - Document ID
 * @returns {Promise<boolean>} True if deleted successfully
 */
async function deleteDocumentVectors(documentId) {
  if (istAbgeschaltet()) {
    return false;
  }
  try {
    await retry(
      () =>
        axios.post(
          `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/delete`,
          {
            filter: {
              must: [
                {
                  key: 'document_id',
                  match: { value: documentId },
                },
              ],
            },
          },
          { timeout: 10000 }
        ),
      {
        maxAttempts: 3,
        initialDelay: 500,
        onRetry: (attempt, err) => {
          // Ein nicht auflösbarer Name wird beim zweiten Versuch nicht besser.
          if (vermerkeFehler(err)) {
            throw err;
          }
          logger.warn(`Qdrant delete retry ${attempt} for doc ${documentId}: ${err.message}`);
        },
      }
    );
    vermerkeErfolg();
    logger.info(`Deleted document from Qdrant: ${documentId}`);
    return true;
  } catch (e) {
    if (vermerkeFehler(e)) {
      return false;
    }
    logger.error(`Failed to delete from Qdrant after retries for doc ${documentId}: ${e.message}`);
    return false;
  }
}

/**
 * Delete vectors for a document from Qdrant (simple, no retry — used in batch operations).
 * Non-critical: logs warnings but does not throw.
 * @param {string} documentId - Document ID
 * @returns {Promise<boolean>} True if deleted successfully
 */
async function deleteDocumentVectorsSimple(documentId) {
  if (istAbgeschaltet()) {
    return false;
  }
  try {
    await axios.post(
      `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/delete`,
      { filter: { must: [{ key: 'document_id', match: { value: documentId } }] } },
      { timeout: 5000 }
    );
    vermerkeErfolg();
    return true;
  } catch (e) {
    if (vermerkeFehler(e)) {
      return false;
    }
    logger.warn(`Failed to remove from Qdrant: ${e.message}`);
    return false;
  }
}

/**
 * Update space payload for all chunks of a document in Qdrant (with retry).
 * @param {string} documentId - Document ID
 * @param {string|null} spaceId - New space ID (null for unassigned)
 * @param {string} spaceName - New space name
 * @param {string} spaceSlug - New space slug
 * @returns {Promise<boolean>} True if synced successfully
 */
async function updateDocumentSpacePayload(documentId, spaceId, spaceName, spaceSlug) {
  const qdrantPayload = {
    payload: {
      space_id: spaceId || null,
      space_name: spaceName,
      space_slug: spaceSlug,
    },
    filter: { must: [{ key: 'document_id', match: { value: documentId } }] },
  };

  if (istAbgeschaltet()) {
    return false;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await axios.post(
        `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/payload`,
        qdrantPayload,
        { timeout: 10000 }
      );
      vermerkeErfolg();
      logger.info(
        `Updated Qdrant payloads for document ${documentId} (space: ${spaceName || 'none'})`
      );
      return true;
    } catch (e) {
      if (vermerkeFehler(e)) {
        return false;
      }
      if (attempt < 3) {
        logger.warn(`Qdrant sync attempt ${attempt}/3 failed for doc ${documentId}: ${e.message}`);
        await new Promise(r => {
          setTimeout(r, attempt * 1000);
        });
      } else {
        logger.error(`Qdrant sync failed after 3 attempts for doc ${documentId}: ${e.message}`);
      }
    }
  }
  return false;
}

/**
 * Perform semantic search in Qdrant.
 * @param {number[]} queryVector - Query embedding vector
 * @param {number} limit - Max results
 * @param {Object} [filter] - Optional Qdrant filter
 * @returns {Promise<Array>} Search results
 */
async function searchDocuments(queryVector, limit, filter) {
  const searchResponse = await axios.post(
    `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/search`,
    {
      vector: { name: 'dense', vector: queryVector },
      limit,
      with_payload: true,
      filter,
    },
    { timeout: 10000 }
  );
  return searchResponse.data.result || [];
}

/**
 * Alle Vektoren der Sammlung entfernen, ohne die Sammlung selbst zu loeschen.
 * Gebraucht vom Werksreset (Plan 023 B5): die Sammlung traegt Konfiguration
 * (Dimension, Distanzmass, Indizes), die ein neu angelegter Ersatz nicht
 * zwingend gleich haette. Ein leerer Filter trifft jeden Punkt.
 * @returns {Promise<{entfernt: 'alle'}>}
 */
async function deleteAllVectors() {
  try {
    await axios.post(
      `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/delete`,
      { filter: {} },
      { params: { wait: true }, timeout: 60000 }
    );
  } catch (err) {
    // Eine noch nie angelegte Sammlung ist kein Fehlschlag: wo nie ein Dokument
    // indiziert wurde, gibt es auch keine Vektoren. Ein nicht erreichbarer
    // Qdrant dagegen schon, der fliegt weiter.
    if (err.response?.status === 404) {
      logger.warn(`[qdrant] Sammlung "${QDRANT_COLLECTION}" gibt es nicht, nichts zu entfernen`);
      return { uebersprungen: 'Sammlung nicht vorhanden' };
    }
    throw err;
  }
  logger.warn(`[qdrant] Alle Vektoren in "${QDRANT_COLLECTION}" entfernt`);
  return { entfernt: 'alle' };
}

module.exports = {
  deleteAllVectors,
  istAbgeschaltet,
  _pauseZuruecksetzen,
  deleteDocumentVectors,
  deleteDocumentVectorsSimple,
  updateDocumentSpacePayload,
  searchDocuments,
  QDRANT_COLLECTION,
};
