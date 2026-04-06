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
 * Delete all vectors for a document from Qdrant (with retry).
 * Non-critical: logs errors but does not throw.
 * @param {string} documentId - Document ID
 * @returns {Promise<boolean>} True if deleted successfully
 */
async function deleteDocumentVectors(documentId) {
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
          logger.warn(`Qdrant delete retry ${attempt} for doc ${documentId}: ${err.message}`);
        },
      }
    );
    logger.info(`Deleted document from Qdrant: ${documentId}`);
    return true;
  } catch (e) {
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
  try {
    await axios.post(
      `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/delete`,
      { filter: { must: [{ key: 'document_id', match: { value: documentId } }] } },
      { timeout: 5000 }
    );
    return true;
  } catch (e) {
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

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await axios.post(
        `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/payload`,
        qdrantPayload,
        { timeout: 10000 }
      );
      logger.info(
        `Updated Qdrant payloads for document ${documentId} (space: ${spaceName || 'none'})`
      );
      return true;
    } catch (e) {
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

module.exports = {
  deleteDocumentVectors,
  deleteDocumentVectorsSimple,
  updateDocumentSpacePayload,
  searchDocuments,
  QDRANT_COLLECTION,
};
