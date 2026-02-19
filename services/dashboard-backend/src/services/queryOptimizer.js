/**
 * Query Optimizer for RAG Pipeline
 * Implements:
 * - German compound word decompounding (via document-indexer service)
 * - Multi-Query generation (LLM generates 3 query variants)
 * - HyDE (Hypothetical Document Embedding)
 * - 5-minute cache for identical queries
 */

const axios = require('axios');
const logger = require('../utils/logger');
const services = require('../config/services');

// Configuration
const ENABLE_MULTI_QUERY = process.env.RAG_ENABLE_MULTI_QUERY !== 'false';
const ENABLE_HYDE = process.env.RAG_ENABLE_HYDE !== 'false';
const ENABLE_DECOMPOUND = process.env.RAG_ENABLE_DECOMPOUND !== 'false';
const QUERY_OPTIMIZER_MODEL = process.env.RAG_QUERY_OPTIMIZER_MODEL || '';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Simple in-memory cache
const _cache = new Map();
const CACHE_MAX_SIZE = 200;

function getCached(key) {
  const entry = _cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value;
  }
  _cache.delete(key);
  return null;
}

function setCache(key, value) {
  // Evict oldest entries if cache is full
  if (_cache.size >= CACHE_MAX_SIZE) {
    const firstKey = _cache.keys().next().value;
    _cache.delete(firstKey);
  }
  _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
}

/**
 * Decompound German compound words in the query.
 * Calls document-indexer's /decompound endpoint.
 * @param {string} query - Original query
 * @returns {string} Decompounded query
 */
async function decompoundQuery(query) {
  if (!ENABLE_DECOMPOUND) {return query;}

  const cacheKey = `decompound:${query}`;
  const cached = getCached(cacheKey);
  if (cached) {return cached;}

  try {
    const response = await axios.post(
      `${services.documentIndexer.url}/decompound`,
      { text: query },
      { timeout: 5000 }
    );

    const result = response.data.decompounded || query;
    setCache(cacheKey, result);
    return result;
  } catch (error) {
    logger.warn(`Decompound failed (using original query): ${error.message}`);
    return query;
  }
}

/**
 * Generate multiple query variants using the LLM.
 * Produces 3 alternative German formulations of the query.
 * @param {string} query - Original query
 * @returns {string[]} Array of query variants (including original)
 */
async function generateMultiQuery(query) {
  if (!ENABLE_MULTI_QUERY) {return [query];}

  const cacheKey = `multiquery:${query}`;
  const cached = getCached(cacheKey);
  if (cached) {return cached;}

  try {
    const model = QUERY_OPTIMIZER_MODEL || undefined;
    const response = await axios.post(
      services.llm.chatEndpoint,
      {
        model: model || 'default',
        messages: [
          {
            role: 'system',
            content:
              'Du bist ein Suchexperte. Generiere genau 3 alternative deutsche Formulierungen fuer die gegebene Suchanfrage. Jede Variante in einer neuen Zeile. Nur die Varianten, keine Erklaerungen oder Nummerierungen.',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 200,
        },
      },
      { timeout: 15000 }
    );

    const content = response.data?.message?.content || '';
    const variants = content
      .split('\n')
      .map(line => line.replace(/^\d+[.)]\s*/, '').trim())
      .filter(line => line.length > 5 && line.length < 500);

    // Return original + up to 3 variants
    const result = [query, ...variants.slice(0, 3)];
    setCache(cacheKey, result);
    logger.debug(`Multi-query: ${result.length} variants for "${query.substring(0, 50)}"`);
    return result;
  } catch (error) {
    logger.warn(`Multi-query generation failed: ${error.message}`);
    return [query];
  }
}

/**
 * Generate a hypothetical document answer (HyDE).
 * The LLM creates a short answer as if quoting from an expert document.
 * This hypothetical answer is then embedded for search.
 * @param {string} query - Original query
 * @returns {string|null} Hypothetical answer text, or null if disabled/failed
 */
async function generateHyDE(query) {
  if (!ENABLE_HYDE) {return null;}

  const cacheKey = `hyde:${query}`;
  const cached = getCached(cacheKey);
  if (cached) {return cached;}

  try {
    const model = QUERY_OPTIMIZER_MODEL || undefined;
    const response = await axios.post(
      services.llm.chatEndpoint,
      {
        model: model || 'default',
        messages: [
          {
            role: 'system',
            content:
              'Du bist ein Fachexperte. Beantworte folgende Frage in 2-3 Saetzen, als ob du aus einem Fachdokument zitierst. Antworte direkt ohne Einleitung.',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        stream: false,
        options: {
          temperature: 0.5,
          num_predict: 300,
        },
      },
      { timeout: 15000 }
    );

    const content = response.data?.message?.content || '';
    if (content.length > 20) {
      setCache(cacheKey, content);
      logger.debug(`HyDE generated: ${content.substring(0, 80)}...`);
      return content;
    }
    return null;
  } catch (error) {
    logger.warn(`HyDE generation failed: ${error.message}`);
    return null;
  }
}

/**
 * Run the full query optimization pipeline.
 * Executes decompounding, multi-query, and HyDE in parallel.
 *
 * @param {string} query - Original user query
 * @returns {Object} Optimization results
 *   - decompounded: string (decompounded query for BM25)
 *   - queryVariants: string[] (multi-query variants for embedding)
 *   - hydeText: string|null (hypothetical document for embedding)
 *   - details: object (optimization metadata for frontend)
 */
async function optimizeQuery(query) {
  const startTime = Date.now();

  // Run all optimizations in parallel
  const [decompounded, queryVariants, hydeText] = await Promise.all([
    decompoundQuery(query),
    generateMultiQuery(query),
    generateHyDE(query),
  ]);

  const duration = Date.now() - startTime;
  logger.info(
    `Query optimization took ${duration}ms: decompound=${ENABLE_DECOMPOUND}, multi-query=${queryVariants.length}, hyde=${!!hydeText}`
  );

  return {
    decompounded,
    queryVariants,
    hydeText,
    details: {
      duration,
      decompoundEnabled: ENABLE_DECOMPOUND,
      decompoundResult: decompounded !== query ? decompounded : null,
      multiQueryEnabled: ENABLE_MULTI_QUERY,
      multiQueryVariants: queryVariants.length > 1 ? queryVariants.slice(1) : [],
      hydeEnabled: ENABLE_HYDE,
      hydeGenerated: !!hydeText,
    },
  };
}

module.exports = {
  optimizeQuery,
  decompoundQuery,
  generateMultiQuery,
  generateHyDE,
};
