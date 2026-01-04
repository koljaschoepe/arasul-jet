/**
 * RAG (Retrieval Augmented Generation) API Routes
 * Provides endpoints for querying documents using vector search and LLM
 * Uses Queue System for sequential LLM processing
 *
 * HYBRID SEARCH: Combines vector similarity with keyword matching for better recall
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
 * Search for similar chunks in Qdrant (Vector Search)
 */
async function searchVectorSimilar(embedding, limit = 10) {
    try {
        const response = await axios.post(
            `http://${QDRANT_HOST}:${QDRANT_PORT}/collections/${QDRANT_COLLECTION}/points/search`,
            {
                vector: embedding,
                limit: limit,
                with_payload: true
            },
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
 */
async function searchKeywordChunks(query, limit = 10) {
    try {
        // Use PostgreSQL full-text search with German dictionary
        const result = await db.query(`
            SELECT
                dc.id,
                dc.document_id,
                dc.chunk_index,
                dc.text_content as text,
                d.filename as document_name,
                ts_rank(
                    to_tsvector('german', dc.text_content),
                    plainto_tsquery('german', $1)
                ) as keyword_score
            FROM document_chunks dc
            JOIN documents d ON dc.document_id = d.id
            WHERE d.deleted_at IS NULL
            AND to_tsvector('german', dc.text_content) @@ plainto_tsquery('german', $1)
            ORDER BY keyword_score DESC
            LIMIT $2
        `, [query, limit]);

        return result.rows.map((row, index) => ({
            id: row.id,
            payload: {
                document_id: row.document_id,
                document_name: row.document_name,
                chunk_index: row.chunk_index,
                text: row.text
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
 */
async function hybridSearch(query, embedding, limit = 5) {
    // Fetch more results from each source for better fusion
    const fetchLimit = limit * 2;

    // Run vector and keyword search in parallel
    const [vectorResults, keywordResults] = await Promise.all([
        searchVectorSimilar(embedding, fetchLimit),
        HYBRID_SEARCH_ENABLED ? searchKeywordChunks(query, fetchLimit) : Promise.resolve([])
    ]);

    logger.debug(`Hybrid search: ${vectorResults.length} vector + ${keywordResults.length} keyword results`);

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
 */
router.post('/query', requireAuth, llmLimiter, async (req, res) => {
    try {
        const { query, top_k = 5, thinking, conversation_id } = req.body;
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

        logger.info(`RAG query: "${query}" (top_k=${top_k}, thinking=${enableThinking}, hybrid=${HYBRID_SEARCH_ENABLED})`);

        // Step 1: Generate embedding for query (fast, do before queue)
        const queryEmbedding = await getEmbedding(query);

        // Step 2: Hybrid search - combines vector similarity with keyword matching
        // This improves recall for exact matches (e.g., "Q3 2024 Report")
        const searchResults = await hybridSearch(query, queryEmbedding, top_k);

        // Step 3: Build context and sources from search results
        const contextParts = [];
        const sources = [];

        for (let i = 0; i < searchResults.length; i++) {
            const result = searchResults[i];
            const payload = result.payload;

            contextParts.push(`[Document ${i + 1}: ${payload.document_name}]\n${payload.text}`);

            sources.push({
                document_name: payload.document_name,
                chunk_index: payload.chunk_index,
                score: result.score,
                text_preview: payload.text.substring(0, 200) + (payload.text.length > 200 ? '...' : '')
            });
        }

        const context = contextParts.join('\n\n---\n\n');

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

        // Send job info and sources
        res.write(`data: ${JSON.stringify({
            type: 'job_started',
            jobId,
            messageId,
            queuePosition,
            status: queuePosition > 1 ? 'queued' : 'pending'
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
