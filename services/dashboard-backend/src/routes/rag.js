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

// Environment variables
const QDRANT_HOST = process.env.QDRANT_HOST || 'qdrant';
const QDRANT_PORT = process.env.QDRANT_PORT || '6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';
const EMBEDDING_SERVICE_HOST = process.env.EMBEDDING_SERVICE_HOST || 'embedding-service';
const EMBEDDING_SERVICE_PORT = process.env.EMBEDDING_SERVICE_PORT || '11435';

// Hybrid search configuration
const HYBRID_SEARCH_ENABLED = process.env.RAG_HYBRID_SEARCH !== 'false';
const RRF_K = 60;  // Reciprocal Rank Fusion constant

// RAG 2.0: Space routing configuration
const SPACE_ROUTING_THRESHOLD = parseFloat(process.env.SPACE_ROUTING_THRESHOLD || '0.4');
const SPACE_ROUTING_MAX_SPACES = parseInt(process.env.SPACE_ROUTING_MAX_SPACES || '3');

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

// =============================================================================
// RAG 2.0: KNOWLEDGE SPACES FUNCTIONS
// =============================================================================

/**
 * Get company context from database (RAG 2.0)
 */
async function getCompanyContext() {
    try {
        const result = await db.query(`
            SELECT content FROM company_context WHERE id = 1
        `);
        return result.rows.length > 0 ? result.rows[0].content : null;
    } catch (error) {
        logger.warn(`Failed to get company context: ${error.message}`);
        return null;
    }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;

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

    if (normA === 0 || normB === 0) return 0;
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
                    score: similarity
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
                    method: 'fallback'
                };
            }

            // No default space? Return all spaces
            const allSpaces = await db.query('SELECT id, name, slug, description FROM knowledge_spaces');
            return { spaces: allSpaces.rows, method: 'all' };
        }

        logger.debug(`Routed to ${scoredSpaces.length} spaces: ${scoredSpaces.map(s => s.name).join(', ')}`);
        return { spaces: scoredSpaces, method: 'routing' };

    } catch (error) {
        logger.error(`Space routing error: ${error.message}`);
        // Fallback: search all spaces
        return { spaces: [], method: 'error' };
    }
}

/**
 * Build hierarchical context for LLM (RAG 2.0)
 */
function buildHierarchicalContext(companyContext, spaces, chunks) {
    const parts = [];

    // Level 1: Company context (if available)
    if (companyContext) {
        parts.push(`## Unternehmenshintergrund\n${companyContext}`);
    }

    // Level 2: Relevant spaces (if routing was used)
    if (spaces && spaces.length > 0) {
        const spaceDescriptions = spaces
            .map(s => `### ${s.name}\n${s.description}`)
            .join('\n\n');
        parts.push(`## Relevante Wissensbereiche\n${spaceDescriptions}`);
    }

    // Level 3: Document chunks
    if (chunks && chunks.length > 0) {
        const chunkTexts = chunks
            .map((c, i) => {
                const spaceBadge = c.space_name ? `[${c.space_name}] ` : '';
                return `[${i + 1}] ${spaceBadge}${c.document_name}:\n${c.text}`;
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
            with_payload: true
        };

        // RAG 2.0: Add space filter if provided
        if (spaceIds && spaceIds.length > 0) {
            searchBody.filter = {
                should: spaceIds.map(spaceId => ({
                    key: 'space_id',
                    match: { value: spaceId }
                }))
            };
            logger.debug(`Qdrant search with space filter: ${spaceIds.join(', ')}`);
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
            spaceCondition = `AND d.space_id = ANY($3::uuid[])`;
            params.push(spaceIds);
        }

        // Use PostgreSQL full-text search with German dictionary
        const result = await db.query(`
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
        `, params);

        return result.rows.map((row, index) => ({
            id: row.id,
            payload: {
                document_id: row.document_id,
                document_name: row.document_name,
                chunk_index: row.chunk_index,
                text: row.text,
                space_id: row.space_id,
                space_name: row.space_name
            },
            score: row.keyword_score,
            rank: index + 1,
            source: 'keyword'
        }));
    } catch (error) {
        logger.warn(`Keyword search fallback failed: ${error.message}`);
        return [];  // Graceful fallback - don't fail the whole search
    }
}

/**
 * Reciprocal Rank Fusion (RRF) to combine vector and keyword results
 * Formula: RRF(d) = Σ 1/(k + rank(d))
 * where k is a constant (typically 60) and rank is the position in each list
 */
function reciprocalRankFusion(vectorResults, keywordResults, k = RRF_K) {
    const scores = new Map();  // Map<chunk_id, {score, data}>

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
            data: result
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
                data: result
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
            keywordScore: item.keywordScore
        }));
}

/**
 * Hybrid search combining vector similarity and keyword matching
 * RAG 2.0: Supports space filtering
 */
async function hybridSearch(query, embedding, limit = 5, spaceIds = null) {
    // Fetch more results from each source for better fusion
    const fetchLimit = limit * 2;

    // Run vector and keyword search in parallel
    const [vectorResults, keywordResults] = await Promise.all([
        searchVectorSimilar(embedding, fetchLimit, spaceIds),
        HYBRID_SEARCH_ENABLED ? searchKeywordChunks(query, fetchLimit, spaceIds) : Promise.resolve([])
    ]);

    logger.debug(`Hybrid search: ${vectorResults.length} vector + ${keywordResults.length} keyword results (spaces: ${spaceIds ? spaceIds.length : 'all'})`);

    if (keywordResults.length === 0) {
        // No keyword results - return vector results only
        return vectorResults.slice(0, limit);
    }

    // Combine using Reciprocal Rank Fusion
    const fusedResults = reciprocalRankFusion(vectorResults, keywordResults);

    // Return top results
    return fusedResults.slice(0, limit);
}

/**
 * POST /api/rag/query
 * Perform RAG query with Queue support
 * RAG 2.0: Hierarchical context with Knowledge Spaces
 */
router.post('/query', requireAuth, llmLimiter, async (req, res) => {
    try {
        const {
            query,
            top_k = 5,
            thinking,
            conversation_id,
            space_ids = null,      // RAG 2.0: Optional pre-selected spaces
            auto_routing = true    // RAG 2.0: Enable automatic space routing
        } = req.body;
        const enableThinking = thinking !== false;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                error: 'Query is required and must be a string',
                timestamp: new Date().toISOString()
            });
        }

        if (!conversation_id) {
            return res.status(400).json({
                error: 'conversation_id is required for RAG queries',
                timestamp: new Date().toISOString()
            });
        }

        logger.info(`RAG query: "${query}" (top_k=${top_k}, thinking=${enableThinking}, hybrid=${HYBRID_SEARCH_ENABLED}, auto_routing=${auto_routing})`);

        // Step 1: Generate embedding for query (fast, do before queue)
        const queryEmbedding = await getEmbedding(query);

        // RAG 2.0: Get company context
        const companyContext = await getCompanyContext();

        // RAG 2.0: Space routing
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
            targetSpaceIds = targetSpaces.map(s => s.id);
            logger.debug(`Auto-routing: ${routingMethod}, ${targetSpaces.length} spaces`);
        }

        // Step 2: Hybrid search with space filter
        const searchResults = await hybridSearch(
            query,
            queryEmbedding,
            top_k,
            targetSpaceIds && targetSpaceIds.length > 0 ? targetSpaceIds : null
        );

        // Step 3: Build sources from search results
        const sources = searchResults.map((result, i) => {
            const payload = result.payload;
            return {
                document_name: payload.document_name,
                chunk_index: payload.chunk_index,
                score: result.score,
                text_preview: payload.text.substring(0, 200) + (payload.text.length > 200 ? '...' : ''),
                // RAG 2.0 fields
                space_id: payload.space_id,
                space_name: payload.space_name || '',
                document_id: payload.document_id
            };
        });

        // Step 4: Build hierarchical context (RAG 2.0)
        const chunks = searchResults.map(r => ({
            document_name: r.payload.document_name,
            text: r.payload.text,
            space_name: r.payload.space_name
        }));

        const context = buildHierarchicalContext(
            companyContext,
            targetSpaces.length > 0 ? targetSpaces : null,
            chunks
        );

        // Set up SSE headers early
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // Handle no documents case - respond immediately without queue
        if (searchResults.length === 0) {
            const noDocsMessage = 'Es wurden keine relevanten Dokumente gefunden. Bitte laden Sie Dokumente in den MinIO-Bucket "documents" hoch, um das RAG-System zu nutzen.';

            // Create job just for tracking
            const { jobId, messageId } = await llmJobService.createJob(
                conversation_id,
                'rag',
                { query, top_k, thinking: enableThinking, sources: [] }
            );

            await llmJobService.updateJobContent(jobId, noDocsMessage, null, []);
            await llmJobService.completeJob(jobId);

            res.write(`data: ${JSON.stringify({ type: 'job_started', jobId, messageId })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'sources', sources: [] })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'response', token: noDocsMessage })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'done', done: true, jobId })}\n\n`);
            return res.end();
        }

        // Step 4: Enqueue RAG job (LLM streaming goes through queue)
        const { jobId, messageId, queuePosition } = await llmQueueService.enqueue(
            conversation_id,
            'rag',
            { query, context, thinking: enableThinking, sources }
        );

        logger.info(`[QUEUE] RAG job ${jobId} enqueued at position ${queuePosition}`);

        // Send job info, matched spaces, and sources
        res.write(`data: ${JSON.stringify({
            type: 'job_started',
            jobId,
            messageId,
            queuePosition,
            status: queuePosition > 1 ? 'queued' : 'pending'
        })}\n\n`);

        // RAG 2.0: Send matched spaces info
        res.write(`data: ${JSON.stringify({
            type: 'matched_spaces',
            spaces: targetSpaces.map(s => ({ id: s.id, name: s.name, slug: s.slug, score: s.score })),
            routing_method: routingMethod
        })}\n\n`);

        res.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`);

        // Track client connection
        let clientConnected = true;
        res.on('close', () => {
            clientConnected = false;
            logger.debug(`[RAG ${jobId}] Client disconnected, job continues in background`);
        });

        // Subscribe to job updates and forward to client
        const unsubscribe = llmQueueService.subscribeToJob(jobId, (event) => {
            if (!clientConnected) return;

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

        // Handle client disconnect
        res.on('close', () => {
            unsubscribe();
        });

    } catch (error) {
        logger.error(`RAG query error: ${error.message}`);

        if (!res.headersSent) {
            res.status(500).json({
                error: 'Internal server error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        } else {
            res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
            res.end();
        }
    }
});

/**
 * GET /api/rag/status
 * Check if RAG system is operational
 */
router.get('/status', requireAuth, async (req, res) => {
    try {
        const qdrantResponse = await axios.get(
            `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}`,
            { timeout: 5000 }
        );

        const collection = qdrantResponse.data.result;

        res.json({
            status: 'operational',
            qdrant: {
                connected: true,
                collection: QDRANT_COLLECTION,
                points_count: collection.points_count || 0,
                vectors_count: collection.vectors_count || 0
            },
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`RAG status check error: ${error.message}`);
        res.status(503).json({
            status: 'degraded',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
