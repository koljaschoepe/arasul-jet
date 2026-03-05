/**
 * RAG (Retrieval Augmented Generation) API Routes
 * Provides endpoints for querying documents using vector search and LLM
 * Uses Queue System for sequential LLM processing
 *
 * HYBRID SEARCH: Combines vector similarity with keyword matching for better recall
 *
 * RAG 2.0: Hierarchical Context with Knowledge Spaces
 * - Company context (global)
 * - Space routing based on query
 * - Space-filtered document retrieval
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { llmLimiter } = require('../middleware/rateLimit');
const llmJobService = require('../services/llm/llmJobService');
const llmQueueService = require('../services/llm/llmQueueService');
const db = require('../database');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, ServiceUnavailableError } = require('../utils/errors');
const services = require('../config/services');
const { optimizeQuery } = require('../services/context/queryOptimizer');

// Environment variables
const QDRANT_HOST = services.qdrant.host;
const QDRANT_PORT = services.qdrant.port;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';
const EMBEDDING_SERVICE_HOST = services.embedding.host;
const EMBEDDING_SERVICE_PORT = services.embedding.port;
const DOCUMENT_INDEXER_URL = services.documentIndexer.url;

// Hybrid search configuration
const HYBRID_SEARCH_ENABLED = process.env.RAG_HYBRID_SEARCH !== 'false';

// RAG 2.0: Space routing configuration
const SPACE_ROUTING_THRESHOLD = parseFloat(process.env.SPACE_ROUTING_THRESHOLD || '0.4');
const SPACE_ROUTING_MAX_SPACES = parseInt(process.env.SPACE_ROUTING_MAX_SPACES || '3');

// RAG 3.0: Reranking and query optimization
const ENABLE_RERANKING = process.env.RAG_ENABLE_RERANKING !== 'false';

// RAG 5.0: Knowledge Graph enrichment
const ENABLE_GRAPH_ENRICHMENT = process.env.RAG_ENABLE_GRAPH !== 'false';
const GRAPH_MAX_ENTITIES = parseInt(process.env.RAG_GRAPH_MAX_ENTITIES || '3');
const GRAPH_TRAVERSAL_DEPTH = parseInt(process.env.RAG_GRAPH_TRAVERSAL_DEPTH || '2');

// RAG 4.0: Smart relevance filtering
const RAG_RELEVANCE_THRESHOLD = parseFloat(process.env.RAG_RELEVANCE_THRESHOLD || '0.3');
const RAG_VECTOR_SCORE_THRESHOLD = parseFloat(process.env.RAG_VECTOR_SCORE_THRESHOLD || '0.4');

/**
 * Get embedding vector for text
 */
async function getEmbedding(text) {
  try {
    const response = await axios.post(
      `http://${EMBEDDING_SERVICE_HOST}:${EMBEDDING_SERVICE_PORT}/embed`,
      { texts: text },
      { timeout: 30000 }
    );
    return response.data.vectors[0];
  } catch (error) {
    logger.error(`Error getting embedding: ${error.message}`);
    throw new Error('Failed to generate embedding');
  }
}

/**
 * Get embedding vectors for multiple texts (batch)
 */
async function getEmbeddings(texts) {
  if (texts.length === 0) {
    return [];
  }
  if (texts.length === 1) {
    return [await getEmbedding(texts[0])];
  }

  try {
    const response = await axios.post(
      `http://${EMBEDDING_SERVICE_HOST}:${EMBEDDING_SERVICE_PORT}/embed`,
      { texts },
      { timeout: 60000 }
    );
    return response.data.vectors;
  } catch (error) {
    logger.error(`Error getting batch embeddings: ${error.message}`);
    throw new Error('Failed to generate embeddings');
  }
}

/**
 * Get sparse BM25 vector for text (via document-indexer)
 * Used for Qdrant-native hybrid search with RRF fusion.
 */
async function getSparseVector(text) {
  try {
    const response = await axios.post(
      `${DOCUMENT_INDEXER_URL}/sparse-encode`,
      { text },
      { timeout: 5000 }
    );
    const { indices, values } = response.data;
    if (indices && indices.length > 0) {
      return { indices, values };
    }
    return null;
  } catch (error) {
    logger.debug(`Sparse encoding unavailable: ${error.message}`);
    return null;
  }
}

// =============================================================================
// RAG 2.0: KNOWLEDGE SPACES FUNCTIONS
// =============================================================================

/**
 * Get company context from database (RAG 2.0)
 * Cached for 5 minutes to avoid repeated DB queries
 */
let _companyContextCache = { value: null, expiresAt: 0 };
const COMPANY_CONTEXT_TTL = 5 * 60 * 1000; // 5 minutes

async function getCompanyContext() {
  const now = Date.now();
  if (_companyContextCache.expiresAt > now) {
    return _companyContextCache.value;
  }

  try {
    const result = await db.query(`
            SELECT content FROM company_context WHERE id = 1
        `);
    const value = result.rows.length > 0 ? result.rows[0].content : null;
    _companyContextCache = { value, expiresAt: now + COMPANY_CONTEXT_TTL };
    return value;
  } catch (error) {
    logger.warn(`Failed to get company context: ${error.message}`);
    return null;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (normA * normB);
}

/**
 * Route query to relevant spaces based on description embeddings (RAG 2.0)
 * Caches parsed embeddings for 5 minutes to avoid repeated JSON parsing.
 */
let _spaceEmbeddingCache = { rows: null, expiresAt: 0 };
const SPACE_EMBEDDING_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function routeToSpaces(queryEmbedding, options = {}) {
  const { threshold = SPACE_ROUTING_THRESHOLD, maxSpaces = SPACE_ROUTING_MAX_SPACES } = options;

  try {
    // Get spaces with parsed embeddings (cached)
    const now = Date.now();
    if (!_spaceEmbeddingCache.rows || _spaceEmbeddingCache.expiresAt <= now) {
      const result = await db.query(`
              SELECT id, name, slug, description, description_embedding, auto_summary
              FROM knowledge_spaces
              WHERE description_embedding IS NOT NULL
          `);
      // Parse embeddings once and cache
      _spaceEmbeddingCache = {
        rows: result.rows.map(space => ({
          ...space,
          parsedEmbedding: JSON.parse(space.description_embedding),
        })),
        expiresAt: now + SPACE_EMBEDDING_CACHE_TTL,
      };
    }

    const cachedSpaces = _spaceEmbeddingCache.rows;

    if (cachedSpaces.length === 0) {
      logger.debug('No spaces with embeddings found, returning all spaces');
      const allSpaces = await db.query('SELECT id, name, slug, description FROM knowledge_spaces');
      return { spaces: allSpaces.rows, method: 'all' };
    }

    // Calculate similarity for each space
    const scoredSpaces = cachedSpaces
      .map(space => {
        const similarity = cosineSimilarity(queryEmbedding, space.parsedEmbedding);
        return {
          id: space.id,
          name: space.name,
          slug: space.slug,
          description: space.description,
          auto_summary: space.auto_summary,
          score: similarity,
        };
      })
      .filter(space => space.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSpaces);

    // If no spaces meet threshold, get default space
    if (scoredSpaces.length === 0) {
      logger.debug(`No spaces above threshold ${threshold}, using default space`);
      const defaultResult = await db.query(`
                SELECT id, name, slug, description FROM knowledge_spaces WHERE is_default = TRUE
            `);

      if (defaultResult.rows.length > 0) {
        return {
          spaces: [{ ...defaultResult.rows[0], score: 0, fallback: true }],
          method: 'fallback',
        };
      }

      // No default space? Return all spaces
      const allSpaces = await db.query('SELECT id, name, slug, description FROM knowledge_spaces');
      return { spaces: allSpaces.rows, method: 'all' };
    }

    logger.debug(
      `Routed to ${scoredSpaces.length} spaces: ${scoredSpaces.map(s => s.name).join(', ')}`
    );
    return { spaces: scoredSpaces, method: 'routing' };
  } catch (error) {
    logger.error(`Space routing error: ${error.message}`);
    // Fallback: search all spaces
    return { spaces: [], method: 'error' };
  }
}

/**
 * Build Qdrant filter for space-based search.
 * Includes specified spaces + unassigned documents (null/empty space_id).
 */
function buildSpaceFilter(spaceIds) {
  if (!spaceIds || spaceIds.length === 0) {return undefined;}
  return {
    should: [
      ...spaceIds.map(spaceId => ({
        key: 'space_id',
        match: { value: spaceId },
      })),
      { key: 'space_id', match: { value: '' } },
      { is_null: { key: 'space_id' } },
    ],
  };
}

/**
 * Rerank search results using the embedding service's 2-stage reranker.
 * Stage 1: FlashRank (CPU) -> Top 20
 * Stage 2: BGE-reranker-v2-m3 (GPU) -> Top K
 * Graceful fallback: returns original results if reranker unavailable.
 */
async function rerankResults(query, results, topK = 5) {
  if (!ENABLE_RERANKING || results.length === 0) {
    return results.slice(0, topK);
  }

  try {
    const passages = results.map(r => ({
      text: r.payload?.text || '',
      id: r.id,
      document_name: r.payload?.document_name || '',
      parent_chunk_id: r.payload?.parent_chunk_id || null,
    }));

    const response = await axios.post(
      `http://${EMBEDDING_SERVICE_HOST}:${EMBEDDING_SERVICE_PORT}/rerank`,
      {
        query,
        passages,
        top_k: topK,
        stage1_top_k: Math.min(20, results.length),
      },
      { timeout: 45000 }
    );

    if (!response.data.results) {
      logger.warn('Reranking returned no results');
      return results.slice(0, topK);
    }

    logger.info(
      `Reranking OK: ${results.length} → ${response.data.results.length} in ${response.data.total_latency_ms}ms`
    );

    // Map reranked results back to full result objects
    const idToResult = new Map(results.map(r => [String(r.id), r]));
    return response.data.results
      .map(rr => {
        const original = idToResult.get(String(rr.id));
        if (!original) {
          return null;
        }
        return {
          ...original,
          rerankScore: rr.rerank_score,
          stage1Score: rr.stage1_score,
          stage2Score: rr.stage2_score,
        };
      })
      .filter(Boolean);
  } catch (error) {
    logger.warn(`Reranking failed (using unreranked results): ${error.message}`);
    return results.slice(0, topK);
  }
}

/**
 * Filter results by relevance score (RAG 4.0)
 * Uses rerank score when available, falls back to vector score.
 * Returns only documents above the configured threshold.
 */
function filterByRelevance(results, reranked = true) {
  if (results.length === 0) {
    return { relevant: [], filtered: 0 };
  }

  const threshold = reranked ? RAG_RELEVANCE_THRESHOLD : RAG_VECTOR_SCORE_THRESHOLD;
  const scoreField = reranked ? 'rerankScore' : 'score';

  const relevant = results.filter(r => {
    const score = r[scoreField];
    return score != null && score >= threshold;
  });

  const filtered = results.length - relevant.length;
  if (filtered > 0) {
    logger.info(
      `Relevance filter: ${results.length} → ${relevant.length} (threshold=${threshold}, filtered=${filtered})`
    );
  }

  return { relevant, filtered };
}

// =============================================================================
// RAG 5.0: KNOWLEDGE GRAPH ENRICHMENT
// =============================================================================

/**
 * Extract entities from query and traverse the knowledge graph.
 * Returns structured graph context for LLM enrichment.
 * Non-fatal: returns empty result on any failure.
 *
 * @param {string} query - User query text
 * @returns {Object} { graphContext: string|null, graphEntities: Object[] }
 */
async function graphEnrichedRetrieval(query) {
  if (!ENABLE_GRAPH_ENRICHMENT) {
    return { graphContext: null, graphEntities: [] };
  }

  try {
    // 1. Extract entities from query via document-indexer
    const entityResponse = await axios.post(
      `${DOCUMENT_INDEXER_URL}/extract-entities`,
      { text: query },
      { timeout: 5000 }
    );

    const queryEntities = entityResponse.data.entities || [];
    if (queryEntities.length === 0 || !entityResponse.data.available) {
      return { graphContext: null, graphEntities: [] };
    }

    // 2. For each entity (max GRAPH_MAX_ENTITIES), query the knowledge graph
    const graphResults = [];
    const entityNames = queryEntities.slice(0, GRAPH_MAX_ENTITIES).map(e => e.name);

    for (const entityName of entityNames) {
      try {
        const result = await db.query(
          `
          WITH RECURSIVE graph_walk AS (
            SELECT
              e.id, e.name, e.entity_type,
              0 AS distance,
              ''::text AS relation_path,
              ARRAY[e.id] AS visited
            FROM kg_entities e
            WHERE LOWER(e.name) = LOWER($1)

            UNION ALL

            SELECT
              t.id, t.name, t.entity_type,
              gw.distance + 1,
              gw.relation_path || CASE WHEN gw.relation_path = '' THEN '' ELSE ' → ' END || r.relation_type,
              gw.visited || t.id
            FROM graph_walk gw
            JOIN kg_relations r ON r.source_entity_id = gw.id
            JOIN kg_entities t ON t.id = r.target_entity_id
            WHERE gw.distance < $2 AND t.id != ALL(gw.visited)

            UNION ALL

            SELECT
              s.id, s.name, s.entity_type,
              gw.distance + 1,
              gw.relation_path || CASE WHEN gw.relation_path = '' THEN '' ELSE ' → ' END || r.relation_type,
              gw.visited || s.id
            FROM graph_walk gw
            JOIN kg_relations r ON r.target_entity_id = gw.id
            JOIN kg_entities s ON s.id = r.source_entity_id
            WHERE gw.distance < $2 AND s.id != ALL(gw.visited)
          )
          SELECT DISTINCT ON (name)
            name, entity_type AS type, distance, relation_path AS relation
          FROM graph_walk
          WHERE distance > 0
          ORDER BY name, distance
          LIMIT 10
        `,
          [entityName, GRAPH_TRAVERSAL_DEPTH]
        );

        for (const row of result.rows) {
          graphResults.push({
            source: entityName,
            target: row.name,
            target_type: row.type,
            relation: row.relation,
            distance: row.distance,
          });
        }
      } catch (entityErr) {
        logger.debug(`Graph traversal failed for "${entityName}": ${entityErr.message}`);
      }
    }

    // 3. Format graph context as text
    if (graphResults.length > 0) {
      const graphContext = formatGraphContext(queryEntities, graphResults);
      logger.info(
        `Graph enrichment: ${queryEntities.length} entities, ${graphResults.length} relations`
      );
      return { graphContext, graphEntities: queryEntities };
    }

    return { graphContext: null, graphEntities: queryEntities };
  } catch (error) {
    logger.warn(`Graph enrichment failed: ${error.message}`);
    return { graphContext: null, graphEntities: [] };
  }
}

/**
 * Format knowledge graph results as readable text context for the LLM.
 */
function formatGraphContext(entities, graphResults) {
  let context = '## Wissensverknüpfungen\n';
  context += 'Folgende Zusammenhänge sind aus dem Wissensgraphen bekannt:\n\n';

  // Group by source entity
  const bySource = new Map();
  for (const r of graphResults) {
    if (!bySource.has(r.source)) {
      bySource.set(r.source, []);
    }
    bySource.get(r.source).push(r);
  }

  for (const [source, relations] of bySource) {
    context += `**${source}:**\n`;
    for (const r of relations) {
      const relLabel = r.relation.replace(/_/g, ' ').toLowerCase() || 'verwandt mit';
      context += `- ${relLabel} → ${r.target} (${r.target_type})\n`;
    }
    context += '\n';
  }

  return context;
}

/**
 * Load parent chunks from PostgreSQL for rich LLM context.
 * Deduplicates parent chunks (multiple children may reference same parent).
 */
async function getParentChunks(results) {
  const parentIds = [...new Set(results.map(r => r.payload?.parent_chunk_id).filter(Boolean))];

  if (parentIds.length === 0) {
    // No parent chunk IDs - use child chunk text directly (legacy data)
    return null;
  }

  try {
    const result = await db.query(
      `
            SELECT id, document_id, parent_index, chunk_text, word_count
            FROM document_parent_chunks
            WHERE id = ANY($1::uuid[])
            ORDER BY document_id, parent_index
        `,
      [parentIds]
    );

    return result.rows;
  } catch (error) {
    logger.warn(`Parent chunk lookup failed: ${error.message}`);
    return null;
  }
}

/**
 * Build hierarchical context for LLM (RAG 3.0)
 * Uses parent chunks for richer context when available (Parent-Document Retriever pattern).
 * Falls back to child chunks for legacy data without parent references.
 *
 * @param {string|null} companyContext - Global company context
 * @param {Object[]|null} spaces - Matched knowledge spaces
 * @param {Object[]} chunks - Child chunk data with metadata
 * @param {Object[]|null} parentChunks - Parent chunks from PostgreSQL (richer context)
 * @param {string|null} graphContext - Knowledge Graph context (Level 4)
 */
function buildHierarchicalContext(
  companyContext,
  spaces,
  chunks,
  parentChunks = null,
  graphContext = null
) {
  const parts = [];

  // Level 1: Company context (if available)
  if (companyContext) {
    parts.push(`## Unternehmenshintergrund\n${companyContext}`);
  }

  // Level 2: Relevant spaces (if routing was used)
  if (spaces && spaces.length > 0) {
    const spaceDescriptions = spaces.map(s => `### ${s.name}\n${s.description}`).join('\n\n');
    parts.push(`## Relevante Wissensbereiche\n${spaceDescriptions}`);
  }

  // Level 3: Document chunks
  if (parentChunks && parentChunks.length > 0) {
    // Use parent chunks for richer LLM context (2000-token windows)
    // Map parent_chunk_id → child metadata for document name / space info
    const childByParent = new Map();
    for (const c of chunks) {
      if (c.parent_chunk_id && !childByParent.has(c.parent_chunk_id)) {
        childByParent.set(c.parent_chunk_id, c);
      }
    }

    const chunkTexts = parentChunks
      .map((pc, i) => {
        const child = childByParent.get(String(pc.id));
        const docName = child?.document_name || 'Dokument';
        const spaceBadge = child?.space_name ? `[${child.space_name}] ` : '';
        const categoryBadge = child?.category ? `[${child.category}] ` : '';
        return `[${i + 1}] ${spaceBadge}${categoryBadge}${docName}:\n${pc.chunk_text}`;
      })
      .join('\n\n---\n\n');
    parts.push(`## Gefundene Informationen\n${chunkTexts}`);
  } else if (chunks && chunks.length > 0) {
    // Fallback: use child chunks directly (legacy data without parent references)
    const chunkTexts = chunks
      .map((c, i) => {
        const spaceBadge = c.space_name ? `[${c.space_name}] ` : '';
        const categoryBadge = c.category ? `[${c.category}] ` : '';
        return `[${i + 1}] ${spaceBadge}${categoryBadge}${c.document_name}:\n${c.text}`;
      })
      .join('\n\n---\n\n');
    parts.push(`## Gefundene Informationen\n${chunkTexts}`);
  }

  // Level 4: Knowledge Graph context (if available)
  if (graphContext) {
    parts.push(graphContext);
  }

  return parts.join('\n\n');
}

/**
 * Qdrant-native hybrid search using Prefetch + RRF Fusion.
 *
 * Sends a single query to Qdrant that combines:
 * - Dense vector search (BGE-M3 embeddings, named vector "dense")
 * - Sparse vector search (BM25 with IDF, named vector "bm25")
 * - Server-side Reciprocal Rank Fusion
 *
 * This replaces the previous architecture of separate BM25 index +
 * vector search + client-side RRF fusion.
 *
 * @param {string} query - Original query text (for sparse encoding)
 * @param {number[]} embedding - Primary dense query embedding
 * @param {number} limit - Max results to return
 * @param {string[]|null} spaceIds - Space filter
 * @param {Object} options - Additional search options
 * @param {number[][]} options.additionalEmbeddings - Extra dense embeddings (multi-query + HyDE)
 * @param {string} options.decompoundedQuery - Decompounded query for BM25 sparse search
 */
async function hybridSearch(query, embedding, limit = 5, spaceIds = null, options = {}) {
  const { additionalEmbeddings = [], decompoundedQuery = null } = options;

  // Fetch more results when reranking is enabled
  const fetchLimit = ENABLE_RERANKING ? Math.min(limit * 10, 50) : limit * 2;

  // Get sparse BM25 vector for keyword matching
  const sparseQuery = decompoundedQuery || query;
  const sparseVector = HYBRID_SEARCH_ENABLED ? await getSparseVector(sparseQuery) : null;

  // Build prefetch queries for Qdrant server-side fusion
  const filter = buildSpaceFilter(spaceIds);
  const prefetch = [];

  // Primary dense query
  const denseParams = {
    hnsw_ef: 128,
    quantization: { rescore: true, oversampling: 2.0 },
  };
  prefetch.push({
    query: embedding,
    using: 'dense',
    limit: fetchLimit,
    params: denseParams,
    ...(filter ? { filter } : {}),
  });

  // Additional dense queries (multi-query variants + HyDE)
  for (const emb of additionalEmbeddings) {
    prefetch.push({
      query: emb,
      using: 'dense',
      limit: Math.min(fetchLimit, 30),
      params: denseParams,
      ...(filter ? { filter } : {}),
    });
  }

  // Sparse BM25 query
  if (sparseVector) {
    prefetch.push({
      query: sparseVector,
      using: 'bm25',
      limit: fetchLimit,
      ...(filter ? { filter } : {}),
    });
  }

  try {
    // Single Qdrant call with server-side RRF fusion
    const response = await axios.post(
      `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/query`,
      {
        prefetch,
        query: { fusion: 'rrf' },
        limit: fetchLimit,
        with_payload: true,
      },
      { timeout: 15000 }
    );

    const points = response.data.result?.points || [];

    logger.debug(
      `Hybrid search (Qdrant-native): ${points.length} results from ${prefetch.length} prefetch queries ` +
        `(${additionalEmbeddings.length + 1} dense, ${sparseVector ? 1 : 0} sparse)`
    );

    return points.map(point => ({
      id: point.id,
      score: point.score,
      payload: point.payload,
    }));
  } catch (error) {
    // Fallback: dense-only search if hybrid query fails
    logger.warn(`Qdrant hybrid query failed, falling back to dense-only: ${error.message}`);
    try {
      const fallbackResponse = await axios.post(
        `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/search`,
        {
          vector: { name: 'dense', vector: embedding },
          limit: fetchLimit,
          with_payload: true,
          ...(filter ? { filter } : {}),
        },
        { timeout: 10000 }
      );
      return fallbackResponse.data.result || [];
    } catch (fallbackErr) {
      logger.error(`Dense-only fallback also failed: ${fallbackErr.message}`);
      throw new Error('Failed to search documents');
    }
  }
}

/**
 * POST /api/rag/query
 * Perform RAG query with Queue support
 * RAG 2.0: Hierarchical context with Knowledge Spaces
 */
router.post(
  '/query',
  requireAuth,
  llmLimiter,
  asyncHandler(async (req, res) => {
    const {
      query,
      top_k = 5,
      thinking,
      conversation_id,
      space_ids = null, // RAG 2.0: Optional pre-selected spaces
      auto_routing = true, // RAG 2.0: Enable automatic space routing
      model = null, // Optional: explicit model selection
    } = req.body;
    const enableThinking = thinking !== false;

    if (!query || typeof query !== 'string') {
      throw new ValidationError('Query is required and must be a string');
    }

    if (!conversation_id) {
      throw new ValidationError('conversation_id is required for RAG queries');
    }

    try {
      logger.info(
        `RAG query: "${query}" (top_k=${top_k}, thinking=${enableThinking}, hybrid=${HYBRID_SEARCH_ENABLED}, reranking=${ENABLE_RERANKING})`
      );

      // Step 0: Spell correction (typo tolerance)
      let correctedQuery = query;
      let spellCorrections = [];
      try {
        const spellResult = await axios.post(
          `${DOCUMENT_INDEXER_URL}/spellcheck`,
          { text: query },
          { timeout: 3000 }
        );
        if (spellResult.data.corrections && spellResult.data.corrections.length > 0) {
          correctedQuery = spellResult.data.corrected;
          spellCorrections = spellResult.data.corrections;
          logger.info(
            `Spell correction: "${query}" → "${correctedQuery}" (${spellCorrections.length} fixes)`
          );
        }
      } catch (spellErr) {
        logger.debug(`Spell check unavailable: ${spellErr.message}`);
      }

      // Step 1: Query optimization + embedding + company context in parallel
      const [queryOptResult, queryEmbedding, companyContext] = await Promise.all([
        optimizeQuery(correctedQuery),
        getEmbedding(correctedQuery),
        getCompanyContext(),
      ]);

      const { decompounded, queryVariants, hydeText, details: queryOptDetails } = queryOptResult;

      // Step 2: Embed multi-query variants and HyDE text (batch)
      const additionalTexts = [];
      if (queryVariants.length > 1) {
        additionalTexts.push(...queryVariants.slice(1)); // Skip original (already embedded)
      }
      if (hydeText) {
        additionalTexts.push(hydeText);
      }

      const additionalEmbeddings =
        additionalTexts.length > 0 ? await getEmbeddings(additionalTexts) : [];

      // Step 3: Space routing
      let targetSpaces = [];
      let routingMethod = 'none';
      let targetSpaceIds = space_ids;

      // Project-level space override: if conversation belongs to a project with a knowledge_space_id
      if (!space_ids && conversation_id) {
        try {
          const projSpace = await db.query(
            `SELECT p.knowledge_space_id FROM projects p
             JOIN chat_conversations c ON c.project_id = p.id
             WHERE c.id = $1 AND p.knowledge_space_id IS NOT NULL`,
            [conversation_id]
          );
          if (projSpace.rows.length > 0) {
            targetSpaceIds = [projSpace.rows[0].knowledge_space_id];
            logger.debug(`Project space override: ${targetSpaceIds[0]}`);
          }
        } catch (projErr) {
          logger.debug(`Project space lookup failed: ${projErr.message}`);
        }
      }

      if (targetSpaceIds && targetSpaceIds.length > 0) {
        // User pre-selected spaces or project-level space
        const spacesResult = await db.query(
          'SELECT id, name, slug, description FROM knowledge_spaces WHERE id = ANY($1::uuid[])',
          [targetSpaceIds]
        );
        targetSpaces = spacesResult.rows;
        routingMethod = 'manual';
        logger.debug(`Using ${targetSpaces.length} pre-selected spaces`);
      } else if (auto_routing) {
        // Automatic space routing based on query
        const routingResult = await routeToSpaces(queryEmbedding);
        targetSpaces = routingResult.spaces;
        routingMethod = routingResult.method;

        if (routingMethod === 'error' || routingMethod === 'all') {
          targetSpaceIds = null;
        } else {
          targetSpaceIds = targetSpaces.map(s => s.id);
        }
        logger.debug(`Auto-routing: ${routingMethod}, ${targetSpaces.length} spaces`);
      }

      // Step 4: Hybrid search + Graph enrichment IN PARALLEL
      const spaceFilter = targetSpaceIds && targetSpaceIds.length > 0 ? targetSpaceIds : null;
      const [searchResults, graphEnrichment] = await Promise.all([
        hybridSearch(query, queryEmbedding, top_k, spaceFilter, {
          additionalEmbeddings,
          decompoundedQuery: decompounded,
        }),
        graphEnrichedRetrieval(correctedQuery),
      ]);

      // Step 5: Rerank results (2-stage: FlashRank → BGE-reranker)
      const rerankedResults = await rerankResults(query, searchResults, top_k);

      // Step 5b: RAG 4.0 - Filter by relevance score
      const wasReranked = ENABLE_RERANKING && rerankedResults.some(r => r.rerankScore != null);
      const { relevant: relevantResults } = filterByRelevance(rerankedResults, wasReranked);

      // Step 6: Load parent chunks for richer LLM context
      const parentChunks = await getParentChunks(relevantResults);

      // Step 7: Build sources from relevant results only
      const sources = relevantResults.map(result => {
        const payload = result.payload;
        return {
          document_name: payload.document_name,
          chunk_index: payload.chunk_index,
          score: result.score,
          rerank_score: result.rerankScore || null,
          hybrid_score: result.hybridScore || null,
          text_preview: payload.text.substring(0, 200) + (payload.text.length > 200 ? '...' : ''),
          space_id: payload.space_id,
          space_name: payload.space_name || '',
          document_id: payload.document_id,
        };
      });

      // Step 8: Build hierarchical context with parent chunks (RAG 3.0)
      const chunks = relevantResults.map(r => ({
        document_name: r.payload.document_name,
        text: r.payload.text,
        space_name: r.payload.space_name,
        category: r.payload.category || null,
        parent_chunk_id: r.payload.parent_chunk_id || null,
      }));

      const context = buildHierarchicalContext(
        companyContext,
        targetSpaces.length > 0 ? targetSpaces : null,
        chunks,
        parentChunks,
        graphEnrichment.graphContext
      );

      // RAG 4.0: Detect "docs exist but none relevant" case
      const noRelevantDocs = relevantResults.length === 0 && rerankedResults.length > 0;

      // Set up SSE headers early
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      // Handle no documents case - respond immediately without queue
      if (rerankedResults.length === 0) {
        const noDocsMessage =
          'Es wurden keine relevanten Dokumente gefunden. Bitte laden Sie Dokumente in den MinIO-Bucket "documents" hoch, um das RAG-System zu nutzen.';

        // Create job just for tracking
        const { jobId, messageId } = await llmJobService.createJob(conversation_id, 'rag', {
          query,
          top_k,
          thinking: enableThinking,
          sources: [],
        });

        await llmJobService.updateJobContent(jobId, noDocsMessage, null, []);
        await llmJobService.completeJob(jobId);

        res.write(`data: ${JSON.stringify({ type: 'job_started', jobId, messageId })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'sources', sources: [] })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'response', token: noDocsMessage })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', done: true, jobId })}\n\n`);
        return res.end();
      }

      // Step 9: Enqueue RAG job (LLM streaming goes through queue)
      const { jobId, messageId, queuePosition } = await llmQueueService.enqueue(
        conversation_id,
        'rag',
        { query, context, thinking: enableThinking, sources, noRelevantDocs },
        { model }
      );

      logger.info(`[QUEUE] RAG job ${jobId} enqueued at position ${queuePosition}`);

      // Send SSE events
      res.write(
        `data: ${JSON.stringify({
          type: 'job_started',
          jobId,
          messageId,
          queuePosition,
          status: queuePosition > 1 ? 'queued' : 'pending',
        })}\n\n`
      );

      // Combined RAG metadata event (reduces 3 SSE events → 1 re-render)
      res.write(
        `data: ${JSON.stringify({
          type: 'rag_metadata',
          queryOptimization: queryOptDetails,
          spellCorrection:
            spellCorrections.length > 0
              ? {
                  original: query,
                  corrected: correctedQuery,
                  corrections: spellCorrections,
                }
              : null,
          matchedSpaces: targetSpaces.map(s => ({
            id: s.id,
            name: s.name,
            slug: s.slug,
            score: s.score,
          })),
          routingMethod,
          sources,
          graphEnrichment:
            graphEnrichment.graphEntities.length > 0
              ? {
                  entities: graphEnrichment.graphEntities.map(e => ({
                    name: e.name,
                    type: e.type,
                  })),
                  hasContext: !!graphEnrichment.graphContext,
                }
              : null,
        })}\n\n`
      );

      // Track client connection with single close handler
      let clientConnected = true;
      let unsubscribe = null;

      res.on('close', () => {
        clientConnected = false;
        logger.debug(`[RAG ${jobId}] Client disconnected, job continues in background`);
        if (unsubscribe) {
          unsubscribe();
        }
      });

      res.on('error', error => {
        logger.debug(`[RAG ${jobId}] Response error: ${error.message}`);
        clientConnected = false;
        if (unsubscribe) {
          unsubscribe();
        }
      });

      // Subscribe to job updates and forward to client
      unsubscribe = llmQueueService.subscribeToJob(jobId, event => {
        if (!clientConnected) {
          return;
        }

        try {
          res.write(`data: ${JSON.stringify(event)}\n\n`);

          if (event.done) {
            res.end();
            unsubscribe();
          }
        } catch (err) {
          logger.debug(`[RAG ${jobId}] Write error: ${err.message}`);
        }
      });
    } catch (error) {
      logger.error(`RAG query error: ${error.message}`);

      if (!res.headersSent) {
        throw error;
      } else {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
      }
    }
  })
);

/**
 * GET /api/rag/status
 * Check if RAG system is operational
 */
router.get(
  '/status',
  requireAuth,
  asyncHandler(async (req, res) => {
    let qdrantResponse;
    try {
      qdrantResponse = await axios.get(
        `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}`,
        { timeout: 5000 }
      );
    } catch (error) {
      logger.error(`RAG status check error: ${error.message}`);
      throw new ServiceUnavailableError('RAG system is degraded');
    }

    const collection = qdrantResponse.data.result;

    res.json({
      status: 'operational',
      qdrant: {
        connected: true,
        collection: QDRANT_COLLECTION,
        points_count: collection.points_count || 0,
        vectors_count: collection.vectors_count || 0,
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/rag/fix-space-ids
 * One-time migration: fix Qdrant points with empty string space_id
 * Reads correct space_id from PostgreSQL and updates Qdrant payloads
 */
router.post(
  '/fix-space-ids',
  requireAuth,
  asyncHandler(async (req, res) => {
    logger.info('[MIGRATION] Starting fix-space-ids migration...');

    let fixed = 0;
    const skipped = 0;
    let errors = 0;
    let offset = null;

    // Scroll through all points with empty string space_id
    while (true) {
      const scrollBody = {
        filter: {
          must: [{ key: 'space_id', match: { value: '' } }],
        },
        limit: 100,
        with_payload: true,
      };
      if (offset) {
        scrollBody.offset = offset;
      }

      const scrollResponse = await axios.post(
        `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/scroll`,
        scrollBody,
        { timeout: 30000 }
      );

      const points = scrollResponse.data.result.points || [];
      offset = scrollResponse.data.result.next_page_offset;

      if (points.length === 0) {
        break;
      }

      // Group points by document_id
      const docIds = [...new Set(points.map(p => p.payload.document_id).filter(Boolean))];

      for (const docId of docIds) {
        try {
          // Get correct space info from PostgreSQL
          const result = await db.query(
            `
                    SELECT d.space_id, ks.name as space_name, ks.slug as space_slug
                    FROM documents d
                    LEFT JOIN knowledge_spaces ks ON d.space_id = ks.id
                    WHERE d.id = $1
                `,
            [docId]
          );

          const row = result.rows[0];
          const newSpaceId = row?.space_id ? String(row.space_id) : null;
          const newSpaceName = row?.space_name || '';
          const newSpaceSlug = row?.space_slug || '';

          // Update Qdrant payloads for this document
          await axios.post(
            `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/payload`,
            {
              payload: {
                space_id: newSpaceId,
                space_name: newSpaceName,
                space_slug: newSpaceSlug,
              },
              filter: {
                must: [{ key: 'document_id', match: { value: docId } }],
              },
            },
            { timeout: 10000 }
          );

          fixed++;
          logger.debug(`[MIGRATION] Fixed space_id for document ${docId}: ${newSpaceId || 'null'}`);
        } catch (err) {
          errors++;
          logger.warn(`[MIGRATION] Failed to fix document ${docId}: ${err.message}`);
        }
      }

      if (!offset) {
        break;
      }
    }

    logger.info(
      `[MIGRATION] fix-space-ids complete: ${fixed} fixed, ${skipped} skipped, ${errors} errors`
    );

    res.json({
      status: 'completed',
      fixed,
      skipped,
      errors,
      timestamp: new Date().toISOString(),
    });
  })
);

module.exports = router;
