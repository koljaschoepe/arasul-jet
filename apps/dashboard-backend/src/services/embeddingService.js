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

// Circuit breaker: if the embedding service is down, avoid hammering it from
// every RAG request. After CB_FAILURE_THRESHOLD consecutive failures the
// circuit opens for CB_OPEN_MS ms, during which calls return null immediately.
// The first call after the cooldown closes the circuit iff it succeeds.
const CB_FAILURE_THRESHOLD = parseInt(process.env.EMBEDDING_CB_FAILURE_THRESHOLD || '5', 10);
const CB_OPEN_MS = parseInt(process.env.EMBEDDING_CB_OPEN_MS || '30000', 10);
const breaker = { failures: 0, openedAt: 0 };

function breakerAllowsCall() {
  if (breaker.openedAt === 0) {
    return true;
  }
  if (Date.now() - breaker.openedAt >= CB_OPEN_MS) {
    return true;
  } // half-open: try one
  return false;
}

function breakerRecordSuccess() {
  breaker.failures = 0;
  breaker.openedAt = 0;
}

function breakerRecordFailure() {
  breaker.failures += 1;
  if (breaker.failures >= CB_FAILURE_THRESHOLD && breaker.openedAt === 0) {
    breaker.openedAt = Date.now();
    logger.warn(
      `[embedding-breaker] opened after ${breaker.failures} failures — cooling down ${CB_OPEN_MS}ms`
    );
  }
}

async function getEmbedding(text) {
  if (!breakerAllowsCall()) {
    logger.debug('[embedding-breaker] open — skipping call');
    return null;
  }
  try {
    const response = await axios.post(EMBED_URL, { texts: text }, { timeout: 30000 });
    breakerRecordSuccess();
    return response.data.vectors[0];
  } catch (error) {
    breakerRecordFailure();
    logger.error(`Embedding error: ${error.message}`);
    return null;
  }
}

async function getEmbeddings(texts) {
  if (texts.length === 0) {
    return [];
  }
  if (texts.length === 1) {
    const single = await getEmbedding(texts[0]);
    return single ? [single] : null;
  }

  if (!breakerAllowsCall()) {
    logger.debug('[embedding-breaker] open — skipping batch call');
    return null;
  }
  try {
    const response = await axios.post(EMBED_URL, { texts }, { timeout: 60000 });
    breakerRecordSuccess();
    return response.data.vectors;
  } catch (error) {
    breakerRecordFailure();
    logger.error(`Batch embedding error: ${error.message}`);
    return null;
  }
}

function getBreakerState() {
  return {
    failures: breaker.failures,
    open: breaker.openedAt !== 0 && Date.now() - breaker.openedAt < CB_OPEN_MS,
    openedAt: breaker.openedAt,
  };
}

module.exports = {
  getEmbedding,
  getEmbeddings,
  getBreakerState,
};
