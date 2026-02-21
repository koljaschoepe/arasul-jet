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
const llmJobService = require('../services/llmJobService');
const llmQueueService = require('../services/llmQueueService');
const db = require('../database');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError, ServiceUnavailableError } = require('../utils/errors');
const services = require('../config/services');
const { optimizeQuery } = require('../services/queryOptimizer');

// Environment variables
const QDRANT_HOST = services.qdrant.host;
const QDRANT_PORT = services.qdrant.port;
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';
const EMBEDDING_SERVICE_HOST = services.embedding.host;
const EMBEDDING_SERVICE_PORT = services.embedding.port;
const DOCUMENT_INDEXER_URL = services.documentIndexer.url;

// Hybrid search configuration
const HYBRID_SEARCH_ENABLED = process.env.RAG_HYBRID_SEARCH !== 'false';
const RRF_K = 60; // Reciprocal Rank Fusion constant

// RAG 2.0: Space routing configuration
const SPACE_ROUTING_THRESHOLD = parseFloat(process.env.SPACE_ROUTING_THRESHOLD || '0.4');
const SPACE_ROUTING_MAX_SPACES = parseInt(process.env.SPACE_ROUTING_MAX_SPACES || '3');

// RAG 3.0: Reranking and query optimization
const ENABLE_RERANKING = process.env.RAG_ENABLE_RERANKING !== 'false';

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
  if (texts.length === 0) {return [];}
  if (texts.length === 1) {return [await getEmbedding(texts[0])];}

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
  if (!a || !b || a.length !== b.length) {return 0;}

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

  if (normA === 0 || normB === 0) {return 0;}
  return dotProduct / (normA * normB);
}

/**
 * Route query to relevant spaces based on description embeddings (RAG 2.0)
 */
async function routeToSpaces(queryEmbedding, options = {}) {
  const { threshold = SPACE_ROUTING_THRESHOLD, maxSpaces = SPACE_ROUTING_MAX_SPACES } = options;

  try {
    // Get all spaces with their description embeddings
    const result = await db.query(`
            SELECT id, name, slug, description, description_embedding, auto_summary
            FROM knowledge_spaces
            WHERE description_embedding IS NOT NULL
        `);

    if (result.rows.length === 0) {
      logger.debug('No spaces with embeddings found, returning all spaces');
      const allSpaces = await db.query('SELECT id, name, slug, description FROM knowledge_spaces');
      return { spaces: allSpaces.rows, method: 'all' };
    }

    // Calculate similarity for each space
    const scoredSpaces = result.rows
      .map(space => {
        const spaceEmbedding = JSON.parse(space.description_embedding);
        const similarity = cosineSimilarity(queryEmbedding, spaceEmbedding);
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
 * Search using BM25 index with German stemming (via document-indexer).
 * Returns full chunk payloads (compatible with RRF pipeline).
 * Falls back gracefully if BM25 service is unavailable.
 */
async function searchBM25(query, limit = 20, spaceIds = null) {
  try {
    const response = await axios.post(
      `${DOCUMENT_INDEXER_URL}/bm25/search`,
      { query, top_k: limit },
      { timeout: 5000 }
    );

    if (!response.data.results || !response.data.is_ready || response.data.results.length === 0) {
      return [];
    }

    const chunkIds = response.data.results.map(r => r.chunk_id);

    // Fetch full chunk data from PostgreSQL
    let spaceCondition = '';
    const params = [chunkIds];
    if (spaceIds && spaceIds.length > 0) {
      spaceCondition = 'AND (d.space_id = ANY($2::uuid[]) OR d.space_id IS NULL)';
      params.push(spaceIds);
    }

    const result = await db.query(
      `
            SELECT dc.id, dc.document_id, dc.chunk_index, dc.chunk_text as text,
                   dc.parent_chunk_id, d.filename as document_name, d.space_id,
                   ks.name as space_name
            FROM document_chunks dc
            JOIN documents d ON dc.document_id = d.id
            LEFT JOIN knowledge_spaces ks ON d.space_id = ks.id
            WHERE dc.id = ANY($1::uuid[])
            AND d.deleted_at IS NULL
            ${spaceCondition}
        `,
      params
    );

    // Map BM25 scores by chunk ID
    const scoreMap = new Map(response.data.results.map(r => [r.chunk_id, r.score]));

    // Sort by BM25 score descending
    return result.rows
      .map(row => ({
        id: String(row.id),
        payload: {
          document_id: row.document_id,
          document_name: row.document_name,
          chunk_index: row.chunk_index,
          text: row.text,
          space_id: row.space_id,
          space_name: row.space_name,
          parent_chunk_id: row.parent_chunk_id,
        },
        score: scoreMap.get(String(row.id)) || 0,
        source: 'bm25',
      }))
      .sort((a, b) => b.score - a.score)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  } catch (error) {
    logger.warn(`BM25 search failed (falling back to PostgreSQL FTS): ${error.message}`);
    return [];
  }
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
        if (!original) {return null;}
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
 */
function buildHierarchicalContext(companyContext, spaces, chunks, parentChunks = null) {
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

  return parts.join('\n\n');
}

/**
 * Search for similar chunks in Qdrant (Vector Search)
 * RAG 2.0: Supports space_ids filter for targeted search
 */
async function searchVectorSimilar(embedding, limit = 10, spaceIds = null) {
  try {
    const searchBody = {
      vector: embedding,
      limit: limit,
      with_payload: true,
      score_threshold: 0.3,
      params: {
        hnsw_ef: 128,
        quantization: {
          rescore: true,
          oversampling: 2.0,
        },
      },
    };

    // RAG 2.0: Add space filter if provided
    // Also include unassigned documents (space_id is null or empty string from legacy data)
    if (spaceIds && spaceIds.length > 0) {
      searchBody.filter = {
        should: [
          // Match specific space IDs
          ...spaceIds.map(spaceId => ({
            key: 'space_id',
            match: { value: spaceId },
          })),
          // Match legacy data with empty string space_id
          {
            key: 'space_id',
            match: { value: '' },
          },
          // Match documents where space_id is null (not present in payload)
          {
            is_null: { key: 'space_id' },
          },
        ],
      };
      logger.debug(`Qdrant search with space filter: ${spaceIds.join(', ')} (+ unassigned)`);
    }

    const response = await axios.post(
      `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/search`,
      searchBody,
      { timeout: 10000 }
    );

    return response.data.result || [];
  } catch (error) {
    logger.error(`Error searching Qdrant: ${error.message}`);
    throw new Error('Failed to search documents');
  }
}

/**
 * Search for chunks using PostgreSQL full-text search (Keyword Search)
 * This catches exact matches that vector search might miss
 * RAG 2.0: Supports space_ids filter
 */
async function searchKeywordChunks(query, limit = 10, spaceIds = null) {
  try {
    // Build space filter condition
    let spaceCondition = '';
    const params = [query, limit];

    if (spaceIds && spaceIds.length > 0) {
      spaceCondition = `AND (d.space_id = ANY($3::uuid[]) OR d.space_id IS NULL)`;
      params.push(spaceIds);
    }

    // Use PostgreSQL full-text search with German dictionary
    const result = await db.query(
      `
            SELECT
                dc.id,
                dc.document_id,
                dc.chunk_index,
                dc.chunk_text as text,
                d.filename as document_name,
                d.space_id,
                ks.name as space_name,
                ts_rank(
                    to_tsvector('german', dc.chunk_text),
                    plainto_tsquery('german', $1)
                ) as keyword_score
            FROM document_chunks dc
            JOIN documents d ON dc.document_id = d.id
            LEFT JOIN knowledge_spaces ks ON d.space_id = ks.id
            WHERE d.deleted_at IS NULL
            AND to_tsvector('german', dc.chunk_text) @@ plainto_tsquery('german', $1)
            ${spaceCondition}
            ORDER BY keyword_score DESC
            LIMIT $2
        `,
      params
    );

    return result.rows.map((row, index) => ({
      id: row.id,
      payload: {
        document_id: row.document_id,
        document_name: row.document_name,
        chunk_index: row.chunk_index,
        text: row.text,
        space_id: row.space_id,
        space_name: row.space_name,
      },
      score: row.keyword_score,
      rank: index + 1,
      source: 'keyword',
    }));
  } catch (error) {
    logger.warn(`Keyword search fallback failed: ${error.message}`);
    return []; // Graceful fallback - don't fail the whole search
  }
}

/**
 * Reciprocal Rank Fusion (RRF) to combine vector and keyword results
 * Formula: RRF(d) = Σ 1/(k + rank(d))
 * where k is a constant (typically 60) and rank is the position in each list
 */
function reciprocalRankFusion(vectorResults, keywordResults, k = RRF_K) {
  const scores = new Map(); // Map<chunk_id, {score, data}>

  // Score vector results
  vectorResults.forEach((result, index) => {
    const id = result.id || `${result.payload.document_id}_${result.payload.chunk_index}`;
    const rank = index + 1;
    const rrfScore = 1 / (k + rank);

    scores.set(id, {
      score: rrfScore,
      vectorScore: result.score,
      vectorRank: rank,
      keywordScore: 0,
      keywordRank: null,
      data: result,
    });
  });

  // Score keyword results
  keywordResults.forEach((result, index) => {
    const id = result.id || `${result.payload.document_id}_${result.payload.chunk_index}`;
    const rank = index + 1;
    const rrfScore = 1 / (k + rank);

    if (scores.has(id)) {
      // Chunk appears in both lists - boost score
      const existing = scores.get(id);
      existing.score += rrfScore;
      existing.keywordScore = result.score;
      existing.keywordRank = rank;
    } else {
      // Chunk only in keyword results
      scores.set(id, {
        score: rrfScore,
        vectorScore: 0,
        vectorRank: null,
        keywordScore: result.score,
        keywordRank: rank,
        data: result,
      });
    }
  });

  // Sort by combined RRF score and return
  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(item => ({
      ...item.data,
      hybridScore: item.score,
      vectorScore: item.vectorScore,
      keywordScore: item.keywordScore,
    }));
}

/**
 * Hybrid search combining vector similarity and keyword matching
 * RAG 3.0: Multi-query embeddings + BM25 + space filtering
 *
 * @param {string} query - Original query text
 * @param {number[]} embedding - Primary query embedding
 * @param {number} limit - Max results to return
 * @param {string[]|null} spaceIds - Space filter
 * @param {Object} options - Additional search options
 * @param {number[][]} options.additionalEmbeddings - Extra embeddings (multi-query + HyDE)
 * @param {string} options.decompoundedQuery - Decompounded query for BM25
 */
async function hybridSearch(query, embedding, limit = 5, spaceIds = null, options = {}) {
  const { additionalEmbeddings = [], decompoundedQuery = null } = options;

  // Fetch more results when reranking is enabled (reranker needs broader candidate set)
  const fetchLimit = ENABLE_RERANKING ? Math.min(limit * 10, 50) : limit * 2;

  // Build all vector searches (original + multi-query variants + HyDE)
  const allEmbeddings = [embedding, ...additionalEmbeddings];
  const vectorSearches = allEmbeddings.map(emb => searchVectorSimilar(emb, fetchLimit, spaceIds));

  // BM25 search with decompounded query (better German keyword matching)
  const bm25Query = decompoundedQuery || query;
  const bm25Search = HYBRID_SEARCH_ENABLED
    ? searchBM25(bm25Query, fetchLimit, spaceIds)
    : Promise.resolve([]);

  // Run all searches in parallel
  const [vectorResultArrays, bm25Results] = await Promise.all([
    Promise.all(vectorSearches),
    bm25Search,
  ]);

  // Merge all vector results (deduplicate by ID, keep highest score)
  const vectorMap = new Map();
  for (const results of vectorResultArrays) {
    for (const result of results) {
      const id = String(result.id);
      const existing = vectorMap.get(id);
      if (!existing || result.score > existing.score) {
        vectorMap.set(id, result);
      }
    }
  }
  const mergedVectorResults = Array.from(vectorMap.values()).sort((a, b) => b.score - a.score);

  // Use BM25 results; fall back to PostgreSQL FTS if BM25 unavailable
  let keywordResults = bm25Results;
  if (keywordResults.length === 0 && HYBRID_SEARCH_ENABLED) {
    keywordResults = await searchKeywordChunks(query, fetchLimit, spaceIds);
  }

  logger.debug(
    `Hybrid search: ${mergedVectorResults.length} vector (${allEmbeddings.length} queries) + ${keywordResults.length} keyword results`
  );

  if (keywordResults.length === 0) {
    return mergedVectorResults.slice(0, fetchLimit);
  }

  // Combine using Reciprocal Rank Fusion
  const fusedResults = reciprocalRankFusion(mergedVectorResults, keywordResults);

  return fusedResults.slice(0, fetchLimit);
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

      // Step 1: Query optimization + embedding + company context in parallel
      const [queryOptResult, queryEmbedding, companyContext] = await Promise.all([
        optimizeQuery(query),
        getEmbedding(query),
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

      if (space_ids && space_ids.length > 0) {
        // User pre-selected spaces
        const spacesResult = await db.query(
          'SELECT id, name, slug, description FROM knowledge_spaces WHERE id = ANY($1::uuid[])',
          [space_ids]
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

      // Step 4: Hybrid search with multi-query + BM25 + space filter
      const spaceFilter = targetSpaceIds && targetSpaceIds.length > 0 ? targetSpaceIds : null;
      const searchResults = await hybridSearch(query, queryEmbedding, top_k, spaceFilter, {
        additionalEmbeddings,
        decompoundedQuery: decompounded,
      });

      // Step 5: Rerank results (2-stage: FlashRank → BGE-reranker)
      const rerankedResults = await rerankResults(query, searchResults, top_k);

      // Step 6: Load parent chunks for richer LLM context
      const parentChunks = await getParentChunks(rerankedResults);

      // Step 7: Build sources from reranked results
      const sources = rerankedResults.map(result => {
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
      const chunks = rerankedResults.map(r => ({
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
        parentChunks
      );

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
        { query, context, thinking: enableThinking, sources },
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

      // RAG 3.0: Send query optimization details
      res.write(
        `data: ${JSON.stringify({
          type: 'query_optimization',
          ...queryOptDetails,
        })}\n\n`
      );

      // RAG 2.0: Send matched spaces info
      res.write(
        `data: ${JSON.stringify({
          type: 'matched_spaces',
          spaces: targetSpaces.map(s => ({ id: s.id, name: s.name, slug: s.slug, score: s.score })),
          routing_method: routingMethod,
        })}\n\n`
      );

      // Send sources with rerank scores
      res.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`);

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
        if (unsubscribe) {unsubscribe();}
      });

      // Subscribe to job updates and forward to client
      unsubscribe = llmQueueService.subscribeToJob(jobId, event => {
        if (!clientConnected) {return;}

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

      if (points.length === 0) {break;}

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

      if (!offset) {break;}
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
