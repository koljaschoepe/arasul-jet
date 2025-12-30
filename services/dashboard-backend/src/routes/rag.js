/**
 * RAG (Retrieval Augmented Generation) API Routes
 * Provides endpoints for querying documents using vector search and LLM
 * Uses Queue System for sequential LLM processing
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { llmLimiter } = require('../middleware/rateLimit');
const llmJobService = require('../services/llmJobService');
const llmQueueService = require('../services/llmQueueService');

// Environment variables
const QDRANT_HOST = process.env.QDRANT_HOST || 'qdrant';
const QDRANT_PORT = process.env.QDRANT_PORT || '6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';
const EMBEDDING_SERVICE_HOST = process.env.EMBEDDING_SERVICE_HOST || 'embedding-service';
const EMBEDDING_SERVICE_PORT = process.env.EMBEDDING_SERVICE_PORT || '11435';

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
 * Search for similar chunks in Qdrant
 */
async function searchSimilarChunks(embedding, limit = 5) {
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

        logger.info(`RAG query: "${query}" (top_k=${top_k}, thinking=${enableThinking})`);

        // Step 1: Generate embedding for query (fast, do before queue)
        const queryEmbedding = await getEmbedding(query);

        // Step 2: Search for similar chunks in Qdrant (fast, do before queue)
        const searchResults = await searchSimilarChunks(queryEmbedding, top_k);

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
