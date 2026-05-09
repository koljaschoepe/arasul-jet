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
// P4.6 (post-audit fix): the breaker now tracks state explicitly. Previously
// `openedAt === 0` was both "closed" and "open and cooled down", which made
// the breaker self-disable permanently after the first cooldown — every later
// failure was ignored because the `=== 0` guard inside breakerRecordFailure
// short-circuited the openedAt update. The new state machine fixes that and
// also gates the half-open probe so concurrent callers don't all slam a dead
// service at the same time.
const breaker = {
  state: 'closed', // 'closed' | 'open' | 'half-open'
  failures: 0,
  openedAt: 0,
  halfOpenInFlight: false,
};

function breakerAllowsCall() {
  if (breaker.state === 'closed') {return true;}
  if (breaker.state === 'open' && Date.now() - breaker.openedAt >= CB_OPEN_MS) {
    // Transition to half-open and let exactly one caller through.
    if (!breaker.halfOpenInFlight) {
      breaker.state = 'half-open';
      breaker.halfOpenInFlight = true;
      return true;
    }
    return false;
  }
  return false;
}

function breakerRecordSuccess() {
  breaker.state = 'closed';
  breaker.failures = 0;
  breaker.openedAt = 0;
  breaker.halfOpenInFlight = false;
}

function breakerRecordFailure() {
  breaker.failures += 1;
  if (breaker.state === 'half-open') {
    // Probe failed → re-open with a fresh cooldown (NOT the original openedAt).
    breaker.state = 'open';
    breaker.openedAt = Date.now();
    breaker.halfOpenInFlight = false;
    logger.warn(
      `[embedding-breaker] half-open probe failed — re-opened, cooling down ${CB_OPEN_MS}ms`
    );
    return;
  }
  if (breaker.state === 'closed' && breaker.failures >= CB_FAILURE_THRESHOLD) {
    breaker.state = 'open';
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
    state: breaker.state,
    open: breaker.state === 'open',
    openedAt: breaker.openedAt,
  };
}

module.exports = {
  getEmbedding,
  getEmbeddings,
  getBreakerState,
};
