/**
 * Shared Embedding Service
 * Consolidates all embedding service calls into a single module.
 *
 * Used by:
 * - services/rag/ragCore.js
 * - routes/ai/spaces.js
 * - routes/admin/settings.js
 * - services/memory/memoryService.js
 */

const axios = require('axios');
const logger = require('../utils/logger');
const services = require('../config/services');

const EMBEDDING_HOST = services.embedding.host;
const EMBEDDING_PORT = services.embedding.port;
const EMBED_URL = `http://${EMBEDDING_HOST}:${EMBEDDING_PORT}/embed`;

/**
 * Get embedding vector for a single text.
 * @param {string} text
 * @returns {Promise<number[]|null>} Embedding vector or null on error
 */
async function getEmbedding(text) {
  try {
    const response = await axios.post(EMBED_URL, { texts: text }, { timeout: 30000 });
    return response.data.vectors[0];
  } catch (error) {
    logger.error(`Embedding error: ${error.message}`);
    return null;
  }
}

/**
 * Get embedding vectors for multiple texts (batch).
 * @param {string[]} texts
 * @returns {Promise<number[][]|null>} Array of embedding vectors or null on error
 */
async function getEmbeddings(texts) {
  if (texts.length === 0) {return [];}
  if (texts.length === 1) {
    const single = await getEmbedding(texts[0]);
    return single ? [single] : null;
  }

  try {
    const response = await axios.post(EMBED_URL, { texts }, { timeout: 60000 });
    return response.data.vectors;
  } catch (error) {
    logger.error(`Batch embedding error: ${error.message}`);
    return null;
  }
}

module.exports = {
  getEmbedding,
  getEmbeddings,
};
