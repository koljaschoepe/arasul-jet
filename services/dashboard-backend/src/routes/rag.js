/**
 * RAG (Retrieval Augmented Generation) API Routes
 * Provides endpoints for querying documents using vector search and LLM
 * Supports background streaming with tab-switch resilience
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { llmLimiter } = require('../middleware/rateLimit');
const llmJobService = require('../services/llmJobService');

// Environment variables
const QDRANT_HOST = process.env.QDRANT_HOST || 'qdrant';
const QDRANT_PORT = process.env.QDRANT_PORT || '6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';
const EMBEDDING_SERVICE_HOST = process.env.EMBEDDING_SERVICE_HOST || 'embedding-service';
const EMBEDDING_SERVICE_PORT = process.env.EMBEDDING_SERVICE_PORT || '11435';
const LLM_SERVICE_HOST = process.env.LLM_SERVICE_HOST || 'llm-service';
const LLM_SERVICE_PORT = process.env.LLM_SERVICE_PORT || '11434';

// Content batching configuration
const BATCH_INTERVAL_MS = 500;
const BATCH_SIZE_CHARS = 100;

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
 * Perform RAG query with background job support
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

        // conversation_id is required for job-based streaming
        if (!conversation_id) {
            return res.status(400).json({
                error: 'conversation_id is required for RAG queries',
                timestamp: new Date().toISOString()
            });
        }

        logger.info(`RAG query: "${query}" (top_k=${top_k}, thinking=${enableThinking})`);

        // Step 1: Generate embedding for query
        const queryEmbedding = await getEmbedding(query);

        // Step 2: Search for similar chunks in Qdrant
        const searchResults = await searchSimilarChunks(queryEmbedding, top_k);

        // Step 3: Build context and sources from search results
        const contextParts = [];
        const sources = [];

        for (let i = 0; i < searchResults.length; i++) {
            const result = searchResults[i];
            const payload = result.payload;

            contextParts.push(`[Document ${i + 1}: ${payload.document_name}]
${payload.text}`);

            sources.push({
                document_name: payload.document_name,
                chunk_index: payload.chunk_index,
                score: result.score,
                text_preview: payload.text.substring(0, 200) + (payload.text.length > 200 ? '...' : '')
            });
        }

        const context = contextParts.join('\n\n---\n\n');

        // Step 4: Create job in database
        const { jobId, messageId } = await llmJobService.createJob(
            conversation_id,
            'rag',
            { query, top_k, thinking: enableThinking, sources }
        );

        // Store sources immediately
        await llmJobService.updateJobContent(jobId, null, null, sources);

        // Set up SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        // Send job info and sources
        res.write(`data: ${JSON.stringify({ type: 'job_started', jobId, messageId })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'sources', sources })}\n\n`);

        // Handle no documents case
        if (searchResults.length === 0) {
            const noDocsMessage = 'Es wurden keine relevanten Dokumente gefunden. Bitte laden Sie Dokumente in den MinIO-Bucket "documents" hoch, um das RAG-System zu nutzen.';

            await llmJobService.updateJobContent(jobId, noDocsMessage, null, []);
            await llmJobService.completeJob(jobId);

            res.write(`data: ${JSON.stringify({ type: 'response', token: noDocsMessage })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'done', done: true, jobId })}\n\n`);
            return res.end();
        }

        // Track client connection status
        let clientConnected = true;
        res.on('close', () => {
            clientConnected = false;
            logger.info(`Client disconnected from RAG job ${jobId}, continuing in background`);
        });

        // Step 5: Stream answer from LLM with background persistence
        await streamRAGFromOllama(
            jobId,
            query,
            context,
            enableThinking,
            res,
            () => clientConnected
        );

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
 * Stream RAG response from Ollama with database persistence
 */
async function streamRAGFromOllama(jobId, query, context, enableThinking, res, isClientConnected) {
    // Build prompt with context and thinking control
    const thinkingInstruction = enableThinking ? '' : '/no_think\n';
    const systemPrompt = `${thinkingInstruction}You are a helpful assistant. Answer the user's question based on the following context from documents. If the answer is not in the context, say so.

Context:
${context}`;

    const prompt = `${systemPrompt}\n\nUser: ${query}\nAssistant:`;

    // Batching state
    let contentBuffer = '';
    let thinkingBuffer = '';
    let lastDbWrite = Date.now();

    const flushToDatabase = async (force = false) => {
        const now = Date.now();
        const shouldFlush = force ||
            (now - lastDbWrite > BATCH_INTERVAL_MS) ||
            (contentBuffer.length >= BATCH_SIZE_CHARS) ||
            (thinkingBuffer.length >= BATCH_SIZE_CHARS);

        if (shouldFlush && (contentBuffer || thinkingBuffer)) {
            try {
                await llmJobService.updateJobContent(jobId, contentBuffer || null, thinkingBuffer || null);
                contentBuffer = '';
                thinkingBuffer = '';
                lastDbWrite = now;
            } catch (dbError) {
                logger.error(`Failed to flush RAG content to DB for job ${jobId}: ${dbError.message}`);
            }
        }
    };

    try {
        const abortController = new AbortController();
        llmJobService.registerStream(jobId, abortController);

        const response = await axios({
            method: 'post',
            url: `http://${LLM_SERVICE_HOST}:${LLM_SERVICE_PORT}/api/generate`,
            data: {
                model: process.env.LLM_MODEL || 'qwen3:14b-q8',
                prompt: prompt,
                stream: true,
                options: {
                    temperature: 0.7,
                    num_predict: 32768
                }
            },
            responseType: 'stream',
            timeout: 300000,
            signal: abortController.signal
        });

        let buffer = '';
        let inThinkBlock = false;

        response.data.on('data', async (chunk) => {
            buffer += chunk.toString();

            // Process complete JSON lines (NDJSON format)
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const data = JSON.parse(line);

                    if (data.response) {
                        const token = data.response;

                        // Process thinking blocks
                        if (!enableThinking) {
                            // When thinking is disabled: filter out <think> blocks
                            if (token.includes('<think>')) {
                                inThinkBlock = true;
                                const parts = token.split('<think>');
                                if (parts[0]) {
                                    contentBuffer += parts[0];
                                    if (isClientConnected()) {
                                        res.write(`data: ${JSON.stringify({ type: 'response', token: parts[0] })}\n\n`);
                                    }
                                }
                                continue;
                            }
                            if (token.includes('</think>')) {
                                inThinkBlock = false;
                                const parts = token.split('</think>');
                                if (parts[1]) {
                                    contentBuffer += parts[1];
                                    if (isClientConnected()) {
                                        res.write(`data: ${JSON.stringify({ type: 'response', token: parts[1] })}\n\n`);
                                    }
                                }
                                continue;
                            }
                            if (inThinkBlock) continue;

                            contentBuffer += token;
                            if (isClientConnected()) {
                                res.write(`data: ${JSON.stringify({ type: 'response', token })}\n\n`);
                            }
                        } else {
                            // With thinking enabled: full processing with think blocks
                            if (token.includes('<think>')) {
                                inThinkBlock = true;
                                const parts = token.split('<think>');
                                if (parts[0]) {
                                    contentBuffer += parts[0];
                                    if (isClientConnected()) {
                                        res.write(`data: ${JSON.stringify({ type: 'response', token: parts[0] })}\n\n`);
                                    }
                                }
                                if (parts[1]) {
                                    thinkingBuffer += parts[1];
                                    if (isClientConnected()) {
                                        res.write(`data: ${JSON.stringify({ type: 'thinking', token: parts[1] })}\n\n`);
                                    }
                                }
                            } else if (token.includes('</think>')) {
                                inThinkBlock = false;
                                const parts = token.split('</think>');
                                if (parts[0]) {
                                    thinkingBuffer += parts[0];
                                    if (isClientConnected()) {
                                        res.write(`data: ${JSON.stringify({ type: 'thinking', token: parts[0] })}\n\n`);
                                    }
                                }
                                if (isClientConnected()) {
                                    res.write(`data: ${JSON.stringify({ type: 'thinking_end' })}\n\n`);
                                }
                                if (parts[1]) {
                                    contentBuffer += parts[1];
                                    if (isClientConnected()) {
                                        res.write(`data: ${JSON.stringify({ type: 'response', token: parts[1] })}\n\n`);
                                    }
                                }
                            } else if (inThinkBlock) {
                                thinkingBuffer += token;
                                if (isClientConnected()) {
                                    res.write(`data: ${JSON.stringify({ type: 'thinking', token })}\n\n`);
                                }
                            } else {
                                contentBuffer += token;
                                if (isClientConnected()) {
                                    res.write(`data: ${JSON.stringify({ type: 'response', token })}\n\n`);
                                }
                            }
                        }

                        // Periodic flush to database
                        await flushToDatabase();
                    }

                    if (data.done) {
                        // Final flush
                        await flushToDatabase(true);
                        await llmJobService.completeJob(jobId);

                        if (isClientConnected()) {
                            res.write(`data: ${JSON.stringify({
                                type: 'done',
                                done: true,
                                jobId,
                                timestamp: new Date().toISOString()
                            })}\n\n`);
                            res.end();
                        }
                    }
                } catch (parseError) {
                    // Ignore parse errors for incomplete JSON
                }
            }
        });

        response.data.on('error', async (error) => {
            logger.error(`RAG stream error for job ${jobId}: ${error.message}`);
            await flushToDatabase(true);
            await llmJobService.errorJob(jobId, error.message);

            if (isClientConnected()) {
                res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
                res.end();
            }
        });

        response.data.on('end', async () => {
            // Handle case where stream ends without done signal
            if (contentBuffer || thinkingBuffer) {
                await flushToDatabase(true);
            }
        });

    } catch (error) {
        logger.error(`Error streaming RAG from Ollama for job ${jobId}: ${error.message}`);
        await llmJobService.errorJob(jobId, error.message);

        if (isClientConnected()) {
            res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
            res.end();
        }
    }
}

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
