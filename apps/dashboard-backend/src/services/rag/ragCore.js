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
const { ServiceUnavailableError } = require('../../utils/errors');

// Environment variables
const QDRANT_HOST = services.qdrant.host;
const QDRANT_PORT = services.qdrant.port;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';
const DOCUMENT_INDEXER_URL = services.documentIndexer.url;

// Hybrid search configuration
const HYBRID_SEARCH_ENABLED = process.env.RAG_HYBRID_SEARCH !== 'false';

// Timeout configuration (ms) — tuned for Jetson ARM64 latency
const RAG_TIMEOUT_SPARSE = parseInt(process.env.RAG_TIMEOUT_SPARSE_MS, 10) || 5000;
const RAG_TIMEOUT_RERANK = parseInt(process.env.RAG_TIMEOUT_RERANK_MS, 10) || 120000;
const RAG_TIMEOUT_ENTITY = parseInt(process.env.RAG_TIMEOUT_ENTITY_MS, 10) || 5000;
const RAG_TIMEOUT_SEARCH = parseInt(process.env.RAG_TIMEOUT_SEARCH_MS, 10) || 15000;
const RAG_TIMEOUT_FALLBACK = parseInt(process.env.RAG_TIMEOUT_FALLBACK_MS, 10) || 10000;

// RAG 2.0: Space routing configuration
const SPACE_ROUTING_THRESHOLD = parseFloat(process.env.SPACE_ROUTING_THRESHOLD || '0.4');
const SPACE_ROUTING_MAX_SPACES = parseInt(process.env.SPACE_ROUTING_MAX_SPACES || '3');

// RAG 3.0: Reranking
const ENABLE_RERANKING = process.env.RAG_ENABLE_RERANKING !== 'false';

// RAG 5.0: Knowledge Graph enrichment
const ENABLE_GRAPH_ENRICHMENT = process.env.RAG_ENABLE_GRAPH !== 'false';
const GRAPH_MAX_ENTITIES = parseInt(process.env.RAG_GRAPH_MAX_ENTITIES || '3');
const GRAPH_TRAVERSAL_DEPTH = parseInt(process.env.RAG_GRAPH_TRAVERSAL_DEPTH || '2');

// RAG 4.0: Relevance filtering — tuned for recall over precision
// Lower thresholds: prefer showing more results over missing relevant ones.
// The anti-hallucination prompt handles low-quality results.
// Reranker (BGE CrossEncoder) logits: good matches ≥0.05, marginal 0.015–0.05
// RRF fusion scores: good matches ≥0.01, marginal 0.003–0.01 (compressed scale)
const RAG_RELEVANCE_THRESHOLD = parseFloat(process.env.RAG_RELEVANCE_THRESHOLD || '0.01');
const RAG_VECTOR_SCORE_THRESHOLD = parseFloat(process.env.RAG_VECTOR_SCORE_THRESHOLD || '0.005');
// Marginal thresholds: results between marginal and relevant are flagged as low-confidence
const RAG_MARGINAL_FACTOR = 0.3; // marginal = threshold * factor (lower = fewer filtered out)

/**
 * Get embedding vector for text.
 *
 * Throws ServiceUnavailableError(code: EMBEDDING_DOWN) on failure so the
 * route/error handler returns a 503 with a stable code the frontend can
 * dispatch on. Pre-Phase-4 the pipeline used a plain `Error` and routes
 * caught the failure silently, letting RAG run with empty sources — which
 * silently degraded answers. This forces the caller to either decide on
 * a fallback or surface the failure.
 */
async function getEmbedding(text) {
  const vector = await embeddingService.getEmbedding(text);
  if (!vector) {
    throw new ServiceUnavailableError('Embedding-Service nicht erreichbar', {
      code: 'EMBEDDING_DOWN',
      service: 'embedding',
    });
  }
  return vector;
}

/**
 * Get embedding vectors for multiple texts (batch).
 * See getEmbedding() above for why this throws ServiceUnavailableError.
 */
async function getEmbeddings(texts) {
  if (texts.length === 0) {
    return [];
  }
  const vectors = await embeddingService.getEmbeddings(texts);
  if (!vectors) {
    throw new ServiceUnavailableError('Embedding-Service nicht erreichbar', {
      code: 'EMBEDDING_DOWN',
      service: 'embedding',
    });
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
      { timeout: RAG_TIMEOUT_SPARSE }
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
      logger.debug('No spaces with embeddings found, using default space');
      const defaultResult = await db.query(
        'SELECT id, name, slug, description FROM knowledge_spaces WHERE is_default = TRUE'
      );
      if (defaultResult.rows.length > 0) {
        return { spaces: defaultResult.rows, method: 'fallback' };
      }
      // No embeddings and no default — return all as last resort (initial setup)
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

      // Anti-hallucination: Don't search ALL spaces when none match —
      // this dilutes results and increases hallucination risk.
      // Return empty so the RAG pipeline can signal "no relevant docs".
      logger.info(
        'No spaces matched and no default space — skipping broad search to prevent hallucination'
      );
      return { spaces: [], method: 'none' };
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
        stage1_top_k: Math.min(20, results.length),
      },
      { timeout: RAG_TIMEOUT_RERANK }
    );

    if (!response.data.results) {
      logger.warn('Reranking returned no results');
      return results.slice(0, topK);
    }

    logger.info(
      `Reranking OK: ${results.length} → ${response.data.results.length} in ${response.data.total_latency_ms}ms`
    );

    const idToResult = new Map(results.map(r => [String(r.id), r]));
    const rerankedResults = response.data.results
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

    // Detect low-quality reranking: when CrossEncoder fails and FlashRank gives
    // near-zero scores (< 0.001), the ranking is unreliable — FlashRank can't
    // distinguish relevant from irrelevant German text at these score levels.
    // Fall back to original search ranking (vector + BM25 fusion) which is
    // semantically aware and much more reliable.
    const maxRerankScore = Math.max(...rerankedResults.map(r => r.rerankScore || 0));
    if (maxRerankScore < 0.001) {
      logger.warn(
        `Low-quality reranking detected (maxScore=${maxRerankScore.toFixed(6)}), falling back to search ranking`
      );
      // Return original search results without rerank scores — the relevance
      // filter will use vector/hybrid scores instead (wasReranked = false)
      return results.slice(0, topK);
    }

    return rerankedResults;
  } catch (error) {
    logger.warn(`Reranking failed (using unreranked results): ${error.message}`);
    return results.slice(0, topK);
  }
}

/**
 * Filter results by relevance score (RAG 4.0 — anti-hallucination)
 * Uses rerank score when available, falls back to vector score.
 * Returns three tiers: relevant (high confidence), marginal (low confidence), filtered (rejected).
 */
function filterByRelevance(results, reranked = true) {
  if (results.length === 0) {
    return { relevant: [], marginal: [], filtered: 0 };
  }

  const baseThreshold = reranked ? RAG_RELEVANCE_THRESHOLD : RAG_VECTOR_SCORE_THRESHOLD;
  const scoreField = reranked ? 'rerankScore' : 'score';

  // Get all scores for adaptive thresholding
  const scores = results.map(r => r[scoreField]).filter(s => s != null);
  const topScore = scores.length > 0 ? Math.max(...scores) : 0;

  // Adaptive threshold: when reranker falls back to FlashRank (stage1-only),
  // scores can be orders of magnitude lower (0.0003 vs 0.05).
  // Use relative threshold: keep results scoring >= 30% of the top score,
  // but only if top score exceeds a minimum floor (to still reject truly irrelevant results).
  const MIN_TOP_SCORE = 0.00005; // Below this, no results are relevant
  const RELATIVE_THRESHOLD = 0.3; // Keep results within 30% of top score

  let threshold;
  if (topScore < MIN_TOP_SCORE) {
    // All scores too low — nothing relevant
    threshold = baseThreshold;
  } else if (topScore < baseThreshold) {
    // Scores below fixed threshold — use relative threshold from top score
    threshold = topScore * RELATIVE_THRESHOLD;
  } else {
    // Normal case — use fixed threshold
    threshold = baseThreshold;
  }
  const marginalThreshold = threshold * RAG_MARGINAL_FACTOR;

  const relevant = [];
  const marginal = [];
  let filtered = 0;

  for (const r of results) {
    const score = r[scoreField];
    if (score != null && score >= threshold) {
      relevant.push(r);
    } else if (score != null && score >= marginalThreshold) {
      marginal.push({ ...r, marginal: true });
    } else {
      filtered++;
    }
  }

  // Log score distribution for threshold tuning
  if (scores.length > 0) {
    const topScores = scores
      .slice(0, 5)
      .map(s => s.toFixed(4))
      .join(', ');
    logger.info(
      `Relevance filter: ${results.length} → ${relevant.length} relevant, ${marginal.length} marginal, ${filtered} rejected (threshold=${threshold.toFixed(4)}, topScore=${topScore.toFixed(4)}, scores: [${topScores}])`
    );
  }

  return { relevant, marginal, filtered };
}

/**
 * Jaccard similarity between two texts (word-set overlap).
 * Used by MMR for lightweight diversity without needing embedding vectors.
 */
function jaccardSimilarity(textA, textB) {
  const wordsA = new Set(
    textA
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
  const wordsB = new Set(
    textB
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2)
  );
  if (wordsA.size === 0 || wordsB.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) {
      intersection++;
    }
  }
  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Maximum Marginal Relevance (MMR) — diversify results after reranking.
 * Selects results that balance relevance and diversity, preventing
 * redundant chunks covering the same content from dominating.
 *
 * Uses Jaccard word-set similarity for diversity (no embedding vectors needed).
 *
 * @param {Object[]} results - Ranked results with scores
 * @param {number} lambda - Balance: 1.0 = pure relevance, 0.0 = pure diversity (default: 0.7)
 * @param {number} topK - Max results to return
 * @returns {Object[]} Diversified results
 */
function applyMMR(results, lambda = 0.7, topK = 8) {
  if (results.length <= 1) {
    return results;
  }

  // Normalize scores to [0, 1] for fair comparison
  const scoreField = results[0].rerankScore != null ? 'rerankScore' : 'score';
  const scores = results.map(r => r[scoreField] || 0);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const scoreRange = maxScore - minScore || 1;

  const selected = [results[0]]; // Best result always included
  const remaining = results.slice(1).map((r, i) => ({ result: r, idx: i + 1 }));

  while (selected.length < topK && remaining.length > 0) {
    let bestMMR = -Infinity;
    let bestIdx = 0;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i].result;
      const relevance = ((candidate[scoreField] || 0) - minScore) / scoreRange;

      // Max similarity to any already-selected result
      const maxSim = Math.max(
        ...selected.map(s =>
          jaccardSimilarity(candidate.payload?.text || '', s.payload?.text || '')
        )
      );

      const mmrScore = lambda * relevance - (1 - lambda) * maxSim;

      if (mmrScore > bestMMR) {
        bestMMR = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining.splice(bestIdx, 1)[0].result);
  }

  // Log reordering if any changed positions
  const reordered = selected.some((r, i) => i > 0 && results.indexOf(r) !== i);
  if (reordered) {
    logger.info(`MMR: reordered ${selected.length} results for diversity (lambda=${lambda})`);
  }

  return selected;
}

/**
 * Deduplicate results by document_id (RAG 4.1)
 * Prevents a single document from dominating all result slots.
 * Keeps max `maxPerDoc` chunks per document, then backfills remaining
 * slots from other documents in rank order.
 *
 * @param {Object[]} results - Ranked results (reranked or filtered)
 * @param {number} topK - Desired total result count
 * @param {number} maxPerDoc - Max chunks per document (default: 3)
 * @returns {Object[]} Deduplicated results
 */
function deduplicateByDocument(results, topK = 5, maxPerDoc = 3) {
  if (results.length <= topK) {
    return results;
  }

  const docCounts = new Map();
  const selected = [];
  const overflow = [];

  for (const r of results) {
    const docId = r.payload?.document_id || r.id;
    const count = docCounts.get(docId) || 0;

    if (count < maxPerDoc) {
      selected.push(r);
      docCounts.set(docId, count + 1);
    } else {
      overflow.push(r);
    }

    if (selected.length >= topK) {
      break;
    }
  }

  // Backfill from overflow if we haven't reached topK
  if (selected.length < topK) {
    const remaining = topK - selected.length;
    selected.push(...overflow.slice(0, remaining));
  }

  if (overflow.length > 0) {
    logger.info(
      `Document dedup: ${results.length} → ${selected.length} (max ${maxPerDoc}/doc, ${docCounts.size} docs)`
    );
  }

  return selected;
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
      { timeout: RAG_TIMEOUT_ENTITY }
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
        const spaceBadge = child?.space_name ? ` | Bereich: ${child.space_name}` : '';
        const categoryBadge = child?.category ? ` | Kategorie: ${child.category}` : '';
        return `--- DOKUMENT [${i + 1}]: ${docName}${spaceBadge}${categoryBadge} ---\n${pc.chunk_text}\n--- ENDE DOKUMENT [${i + 1}] ---`;
      })
      .join('\n\n');
    parts.push(`## Gefundene Informationen\n\n${chunkTexts}`);
  } else if (chunks && chunks.length > 0) {
    const chunkTexts = chunks
      .map((c, i) => {
        const spaceBadge = c.space_name ? ` | Bereich: ${c.space_name}` : '';
        const categoryBadge = c.category ? ` | Kategorie: ${c.category}` : '';
        return `--- DOKUMENT [${i + 1}]: ${c.document_name}${spaceBadge}${categoryBadge} ---\n${c.text}\n--- ENDE DOKUMENT [${i + 1}] ---`;
      })
      .join('\n\n');
    parts.push(`## Gefundene Informationen\n\n${chunkTexts}`);
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

  const fetchLimit = ENABLE_RERANKING ? Math.min(limit * 5, 40) : limit * 2;

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

  // Run RRF fusion + BM25-only rescue search in parallel.
  // BM25 rescue ensures keyword-matched results aren't lost in RRF fusion
  // (RRF underweights results that only match BM25 but not dense vectors).
  try {
    const [response, bm25RescueResponse] = await Promise.all([
      axios.post(
        `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/query`,
        {
          prefetch,
          query: { fusion: 'rrf' },
          limit: fetchLimit,
          with_payload: true,
        },
        { timeout: RAG_TIMEOUT_SEARCH }
      ),
      sparseVector
        ? axios
            .post(
              `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/query`,
              {
                query: sparseVector,
                using: 'bm25',
                limit: Math.min(limit, 5),
                with_payload: true,
                ...(filter ? { filter } : {}),
              },
              { timeout: RAG_TIMEOUT_SEARCH }
            )
            .catch(err => {
              logger.debug(`BM25-only search failed: ${err.message}`);
              return { data: { result: { points: [] } } };
            })
        : Promise.resolve({ data: { result: { points: [] } } }),
    ]);

    const bm25OnlyResults = (bm25RescueResponse.data.result?.points || []).map(point => ({
      id: point.id,
      score: point.score,
      payload: point.payload,
      _bm25Only: true,
    }));

    const points = response.data.result?.points || [];

    // Merge BM25-only results that are missing from RRF fusion
    const rrfIds = new Set(points.map(p => String(p.id)));
    const missingBm25 = bm25OnlyResults.filter(r => !rrfIds.has(String(r.id)));
    if (missingBm25.length > 0) {
      logger.info(
        `BM25 rescue: ${missingBm25.length} keyword-matched results not in RRF top-${points.length}, adding them`
      );
    }

    const combined = [
      ...points.map(point => ({
        id: point.id,
        score: point.score,
        payload: point.payload,
      })),
      ...missingBm25,
    ];

    logger.debug(
      `Hybrid search (Qdrant-native): ${points.length} RRF + ${missingBm25.length} BM25-rescue = ${combined.length} results ` +
        `from ${prefetch.length} prefetch queries (${additionalEmbeddings.length + 1} dense, ${sparseVector ? 1 : 0} sparse)`
    );

    return combined;
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
        { timeout: RAG_TIMEOUT_FALLBACK }
      );
      return fallbackResponse.data.result || [];
    } catch (fallbackErr) {
      logger.error(`Dense-only fallback also failed: ${fallbackErr.message}`);
      return [];
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
  deduplicateByDocument,
  applyMMR,
  graphEnrichedRetrieval,
  formatGraphContext,
  getParentChunks,
  buildHierarchicalContext,
  // Expose config for consumers that need them
  ENABLE_RERANKING,
};
