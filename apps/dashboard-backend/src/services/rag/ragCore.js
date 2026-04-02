/**
 * RAG Core - Reusable RAG functions extracted from routes/rag.js
 *
 * Used by:
 * - routes/rag.js (dashboard RAG queries)
 * - services/telegram/telegramRagService.js (Telegram bot RAG enrichment)
 *
 * Functions:
 * - getEmbedding / getEmbeddings - Generate embedding vectors
 * - getSparseVector - BM25 sparse encoding
 * - getCompanyContext - Cached company context from DB
 * - cosineSimilarity - Vector similarity calculation
 * - routeToSpaces - Automatic space routing by query embedding
 * - buildSpaceFilter - Qdrant filter for space-based search
 * - hybridSearch - Qdrant-native hybrid search (dense + BM25 + RRF)
 * - rerankResults - 2-stage reranking (FlashRank + BGE)
 * - filterByRelevance - Score threshold filtering
 * - graphEnrichedRetrieval - Knowledge graph enrichment
 * - getParentChunks - Load parent chunks for richer context
 * - buildHierarchicalContext - Build structured context for LLM
 */

const axios = require('axios');
const logger = require('../../utils/logger');
const db = require('../../database');
const services = require('../../config/services');
const embeddingService = require('../embeddingService');

// Environment variables
const QDRANT_HOST = services.qdrant.host;
const QDRANT_PORT = services.qdrant.port;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';
const DOCUMENT_INDEXER_URL = services.documentIndexer.url;

// Hybrid search configuration
const HYBRID_SEARCH_ENABLED = process.env.RAG_HYBRID_SEARCH !== 'false';

// RAG 2.0: Space routing configuration
const SPACE_ROUTING_THRESHOLD = parseFloat(process.env.SPACE_ROUTING_THRESHOLD || '0.4');
const SPACE_ROUTING_MAX_SPACES = parseInt(process.env.SPACE_ROUTING_MAX_SPACES || '3');

// RAG 3.0: Reranking
const ENABLE_RERANKING = process.env.RAG_ENABLE_RERANKING !== 'false';

// RAG 5.0: Knowledge Graph enrichment
const ENABLE_GRAPH_ENRICHMENT = process.env.RAG_ENABLE_GRAPH !== 'false';
const GRAPH_MAX_ENTITIES = parseInt(process.env.RAG_GRAPH_MAX_ENTITIES || '3');
const GRAPH_TRAVERSAL_DEPTH = parseInt(process.env.RAG_GRAPH_TRAVERSAL_DEPTH || '2');

// RAG 4.0: Smart relevance filtering
// Reranker (BGE CrossEncoder) logits: good matches ~0.05-0.3, threshold must be low
// RRF fusion scores: ~0.01-0.03, completely different scale from cosine similarity
const RAG_RELEVANCE_THRESHOLD = parseFloat(process.env.RAG_RELEVANCE_THRESHOLD || '0.05');
const RAG_VECTOR_SCORE_THRESHOLD = parseFloat(process.env.RAG_VECTOR_SCORE_THRESHOLD || '0.005');

/**
 * Get embedding vector for text.
 * Throws on failure (RAG pipeline requires embeddings to proceed).
 */
async function getEmbedding(text) {
  const vector = await embeddingService.getEmbedding(text);
  if (!vector) {
    throw new Error('Failed to generate embedding');
  }
  return vector;
}

/**
 * Get embedding vectors for multiple texts (batch).
 * Throws on failure (RAG pipeline requires embeddings to proceed).
 */
async function getEmbeddings(texts) {
  if (texts.length === 0) {
    return [];
  }
  const vectors = await embeddingService.getEmbeddings(texts);
  if (!vectors) {
    throw new Error('Failed to generate embeddings');
  }
  return vectors;
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
const COMPANY_CONTEXT_TTL = 5 * 60 * 1000;

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
const SPACE_EMBEDDING_CACHE_TTL = 5 * 60 * 1000;

async function routeToSpaces(queryEmbedding, options = {}) {
  const { threshold = SPACE_ROUTING_THRESHOLD, maxSpaces = SPACE_ROUTING_MAX_SPACES } = options;

  try {
    const now = Date.now();
    if (!_spaceEmbeddingCache.rows || _spaceEmbeddingCache.expiresAt <= now) {
      const result = await db.query(`
              SELECT id, name, slug, description, description_embedding, auto_summary
              FROM knowledge_spaces
              WHERE description_embedding IS NOT NULL
          `);
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

    const scoredSpaces = cachedSpaces
      .map(space => ({
        id: space.id,
        name: space.name,
        slug: space.slug,
        description: space.description,
        auto_summary: space.auto_summary,
        score: cosineSimilarity(queryEmbedding, space.parsedEmbedding),
      }))
      .filter(space => space.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSpaces);

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

      const allSpaces = await db.query('SELECT id, name, slug, description FROM knowledge_spaces');
      return { spaces: allSpaces.rows, method: 'all' };
    }

    logger.debug(
      `Routed to ${scoredSpaces.length} spaces: ${scoredSpaces.map(s => s.name).join(', ')}`
    );
    return { spaces: scoredSpaces, method: 'routing' };
  } catch (error) {
    logger.error(`Space routing error: ${error.message}`);
    return { spaces: [], method: 'error' };
  }
}

/**
 * Build Qdrant filter for space-based search.
 * Includes specified spaces + unassigned documents (null/empty space_id).
 */
function buildSpaceFilter(spaceIds) {
  if (!spaceIds || spaceIds.length === 0) {
    return undefined;
  }
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
      `${services.embedding.url}/rerank`,
      {
        query,
        passages,
        top_k: topK,
        stage1_top_k: Math.min(10, results.length),
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
 * Format knowledge graph results as readable text context for the LLM.
 */
function formatGraphContext(entities, graphResults) {
  let context = '## Wissensverknüpfungen\n';
  context += 'Folgende Zusammenhänge sind aus dem Wissensgraphen bekannt:\n\n';

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
 * Extract entities from query and traverse the knowledge graph.
 * Returns structured graph context for LLM enrichment.
 * Non-fatal: returns empty result on any failure.
 */
async function graphEnrichedRetrieval(query) {
  if (!ENABLE_GRAPH_ENRICHMENT) {
    return { graphContext: null, graphEntities: [] };
  }

  try {
    const entityResponse = await axios.post(
      `${DOCUMENT_INDEXER_URL}/extract-entities`,
      { text: query },
      { timeout: 5000 }
    );

    const queryEntities = entityResponse.data.entities || [];
    if (queryEntities.length === 0 || !entityResponse.data.available) {
      return { graphContext: null, graphEntities: [] };
    }

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
 * Load parent chunks from PostgreSQL for rich LLM context.
 * Deduplicates parent chunks (multiple children may reference same parent).
 */
async function getParentChunks(results) {
  const parentIds = [...new Set(results.map(r => r.payload?.parent_chunk_id).filter(Boolean))];

  if (parentIds.length === 0) {
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
 * @param {Object[]|null} parentChunks - Parent chunks from PostgreSQL
 * @param {string|null} graphContext - Knowledge Graph context
 */
function buildHierarchicalContext(
  companyContext,
  spaces,
  chunks,
  parentChunks = null,
  graphContext = null
) {
  const parts = [];

  // Level 1: Company context
  if (companyContext) {
    parts.push(`## Unternehmenshintergrund\n${companyContext}`);
  }

  // Level 2: Relevant spaces
  if (spaces && spaces.length > 0) {
    const spaceDescriptions = spaces.map(s => `### ${s.name}\n${s.description}`).join('\n\n');
    parts.push(`## Relevante Wissensbereiche\n${spaceDescriptions}`);
  }

  // Level 3: Document chunks
  if (parentChunks && parentChunks.length > 0) {
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
    const chunkTexts = chunks
      .map((c, i) => {
        const spaceBadge = c.space_name ? `[${c.space_name}] ` : '';
        const categoryBadge = c.category ? `[${c.category}] ` : '';
        return `[${i + 1}] ${spaceBadge}${categoryBadge}${c.document_name}:\n${c.text}`;
      })
      .join('\n\n---\n\n');
    parts.push(`## Gefundene Informationen\n${chunkTexts}`);
  }

  // Level 4: Knowledge Graph context
  if (graphContext) {
    parts.push(graphContext);
  }

  return parts.join('\n\n');
}

/**
 * Qdrant-native hybrid search using Prefetch + RRF Fusion.
 *
 * Combines:
 * - Dense vector search (BGE-M3 embeddings, named vector "dense")
 * - Sparse vector search (BM25 with IDF, named vector "bm25")
 * - Server-side Reciprocal Rank Fusion
 *
 * @param {string} query - Original query text (for sparse encoding)
 * @param {number[]} embedding - Primary dense query embedding
 * @param {number} limit - Max results to return
 * @param {string[]|null} spaceIds - Space filter
 * @param {Object} options - Additional search options
 * @param {number[][]} options.additionalEmbeddings - Extra dense embeddings
 * @param {string} options.decompoundedQuery - Decompounded query for BM25
 */
async function hybridSearch(query, embedding, limit = 5, spaceIds = null, options = {}) {
  const { additionalEmbeddings = [], decompoundedQuery = null } = options;

  const fetchLimit = ENABLE_RERANKING ? Math.min(limit * 5, 25) : limit * 2;

  const sparseQuery = decompoundedQuery || query;
  const sparseVector = HYBRID_SEARCH_ENABLED ? await getSparseVector(sparseQuery) : null;

  const filter = buildSpaceFilter(spaceIds);
  const prefetch = [];

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

  for (const emb of additionalEmbeddings) {
    prefetch.push({
      query: emb,
      using: 'dense',
      limit: Math.min(fetchLimit, 30),
      params: denseParams,
      ...(filter ? { filter } : {}),
    });
  }

  if (sparseVector) {
    prefetch.push({
      query: sparseVector,
      using: 'bm25',
      limit: fetchLimit,
      ...(filter ? { filter } : {}),
    });
  }

  try {
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

module.exports = {
  getEmbedding,
  getEmbeddings,
  getSparseVector,
  getCompanyContext,
  cosineSimilarity,
  routeToSpaces,
  buildSpaceFilter,
  hybridSearch,
  rerankResults,
  filterByRelevance,
  graphEnrichedRetrieval,
  formatGraphContext,
  getParentChunks,
  buildHierarchicalContext,
  // Expose config for consumers that need them
  ENABLE_RERANKING,
};
