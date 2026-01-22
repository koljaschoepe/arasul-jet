/**
 * Claude Terminal API routes
 * Provides a free-text terminal interface for system queries
 * with automatic context injection, timeout handling, and fallback
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../database');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { createUserRateLimiter } = require('../middleware/rateLimit');
const contextService = require('../services/contextInjectionService');
const modelService = require('../services/modelService');
const { asyncHandler } = require('../middleware/errorHandler');
const services = require('../config/services');

// Configuration
const LLM_SERVICE_URL = services.llm.url;
const DEFAULT_TIMEOUT = parseInt(process.env.CLAUDE_TERMINAL_TIMEOUT) || 60000; // 60s default
const MAX_QUERY_LENGTH = 5000;

/**
 * Get the model to use for terminal queries
 * Uses modelService to get default model dynamically
 */
async function getTerminalModel() {
    const model = await modelService.getDefaultModel();
    if (!model) {
        throw new Error('Kein LLM-Model verfügbar. Bitte laden Sie ein Model im Model Store herunter.');
    }

    // Resolve ollama_name from catalog
    const db = require('../database');
    const result = await db.query(
        `SELECT COALESCE(ollama_name, id) as ollama_name FROM llm_model_catalog WHERE id = $1`,
        [model]
    );
    return {
        id: model,
        ollamaName: result.rows[0]?.ollama_name || model
    };
}

// Rate limiter: 5 requests per minute per user
const terminalRateLimiter = createUserRateLimiter(5, 60 * 1000);

/**
 * Check if LLM service is available
 */
async function checkLLMAvailability() {
    try {
        const response = await axios.get(`${LLM_SERVICE_URL}/api/tags`, { timeout: 3000 });
        const models = response.data?.models || [];
        return {
            available: true,
            models: models.map(m => m.name),
            modelCount: models.length
        };
    } catch (error) {
        logger.warn(`LLM service check failed: ${error.message}`);
        return {
            available: false,
            error: error.code === 'ECONNREFUSED' ? 'LLM service not reachable' : error.message
        };
    }
}

/**
 * Create or get active session for user
 */
async function getOrCreateSession(userId) {
    try {
        // Check for existing recent session (within last 30 minutes)
        const existingResult = await db.query(
            `SELECT id, session_context FROM claude_terminal_sessions
             WHERE user_id = $1 AND last_activity_at > NOW() - INTERVAL '30 minutes'
             ORDER BY last_activity_at DESC LIMIT 1`,
            [userId]
        );

        if (existingResult.rows.length > 0) {
            // Update last activity
            await db.query(
                `UPDATE claude_terminal_sessions SET last_activity_at = NOW() WHERE id = $1`,
                [existingResult.rows[0].id]
            );
            return existingResult.rows[0];
        }

        // Create new session
        const newResult = await db.query(
            `INSERT INTO claude_terminal_sessions (user_id) VALUES ($1) RETURNING id, session_context`,
            [userId]
        );
        return newResult.rows[0];
    } catch (error) {
        logger.error(`Failed to get/create session: ${error.message}`);
        return null;
    }
}

/**
 * Save query to history
 */
async function saveQueryToHistory(sessionId, userId, queryData) {
    try {
        const result = await db.query(
            `INSERT INTO claude_terminal_queries
             (session_id, user_id, query, injected_context, model_used, status)
             VALUES ($1, $2, $3, $4, $5, 'pending')
             RETURNING id`,
            [sessionId, userId, queryData.query, JSON.stringify(queryData.context), queryData.model]
        );
        return result.rows[0]?.id;
    } catch (error) {
        logger.error(`Failed to save query: ${error.message}`);
        return null;
    }
}

/**
 * Update query with response
 */
async function updateQueryResponse(queryId, responseData) {
    try {
        await db.query(
            `UPDATE claude_terminal_queries
             SET response = $1, tokens_used = $2, response_time_ms = $3, status = $4,
                 error_message = $5, completed_at = NOW()
             WHERE id = $6`,
            [
                responseData.response,
                responseData.tokens,
                responseData.responseTime,
                responseData.status,
                responseData.error,
                queryId
            ]
        );
    } catch (error) {
        logger.error(`Failed to update query: ${error.message}`);
    }
}

/**
 * POST /api/claude-terminal/query - Execute a query with streaming response
 */
router.post('/query', requireAuth, terminalRateLimiter, async (req, res) => {
    const startTime = Date.now();
    const { query, includeContext = true, timeout = DEFAULT_TIMEOUT } = req.body;
    const userId = req.user.id;

    // Validate query
    if (!query || typeof query !== 'string') {
        return res.status(400).json({
            error: 'Query is required',
            timestamp: new Date().toISOString()
        });
    }

    if (query.length > MAX_QUERY_LENGTH) {
        return res.status(400).json({
            error: `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`,
            timestamp: new Date().toISOString()
        });
    }

    // Check LLM availability first
    const llmStatus = await checkLLMAvailability();
    if (!llmStatus.available) {
        return res.status(503).json({
            error: 'LLM service is currently unavailable',
            details: llmStatus.error,
            suggestion: 'Please try again in a few moments. The LLM service may be starting up.',
            timestamp: new Date().toISOString()
        });
    }

    // Get model to use (dynamically from modelService)
    let terminalModel;
    try {
        terminalModel = await getTerminalModel();
    } catch (modelError) {
        return res.status(503).json({
            error: 'Kein LLM-Model verfügbar',
            details: modelError.message,
            suggestion: 'Bitte laden Sie ein Model im Model Store herunter.',
            timestamp: new Date().toISOString()
        });
    }

    // Get or create session
    const session = await getOrCreateSession(userId);
    if (!session) {
        logger.warn('Could not create session, continuing without history');
    }

    // Build context if requested
    let contextData = null;
    let contextPrompt = '';
    if (includeContext) {
        try {
            contextData = await contextService.buildContext({
                includeMetrics: true,
                includeLogs: true,
                includeServices: true,
                logLines: 30,
                logServices: ['system', 'self_healing']
            });
            contextPrompt = contextService.formatContextForPrompt(contextData);
        } catch (error) {
            logger.warn(`Failed to build context: ${error.message}`);
            contextPrompt = '=== SYSTEM CONTEXT UNAVAILABLE ===\n\n';
        }
    }

    // Save query to history
    const queryId = session ? await saveQueryToHistory(session.id, userId, {
        query,
        context: contextData,
        model: terminalModel.id
    }) : null;

    // Build messages for LLM
    const systemPrompt = `You are Arasul AI Assistant, running on an NVIDIA Jetson AGX Orin edge device.
You help users understand system status, diagnose issues, and manage their edge AI platform.

${contextPrompt}

Guidelines:
- Be concise and technical when appropriate
- Reference the system context when answering questions about system status
- If asked about logs, analyze the provided log entries
- Suggest actionable solutions for any issues detected
- Use German if the user writes in German, otherwise respond in English`;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
    ];

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial status
    res.write(`data: ${JSON.stringify({
        type: 'start',
        queryId,
        model: terminalModel.id,
        contextIncluded: includeContext,
        timestamp: new Date().toISOString()
    })}\n\n`);

    let clientConnected = true;
    let responseContent = '';
    let tokenCount = 0;
    let abortController = new AbortController();

    // Handle client disconnect
    res.on('close', () => {
        clientConnected = false;
        abortController.abort();
        logger.debug(`Claude Terminal client disconnected for query ${queryId}`);
    });

    // Set up timeout
    const effectiveTimeout = Math.min(timeout, 120000); // Max 2 minutes
    const timeoutId = setTimeout(() => {
        if (clientConnected) {
            abortController.abort();
            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: 'Request timeout',
                message: 'The LLM took too long to respond. Please try a simpler query.',
                timestamp: new Date().toISOString()
            })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true, status: 'timeout' })}\n\n`);
            res.end();

            // Update query status
            if (queryId) {
                updateQueryResponse(queryId, {
                    response: responseContent,
                    tokens: tokenCount,
                    responseTime: Date.now() - startTime,
                    status: 'timeout',
                    error: 'Request timeout'
                });
            }
        }
    }, effectiveTimeout);

    try {
        // Make streaming request to Ollama (use ollamaName for API call)
        const response = await axios.post(
            `${LLM_SERVICE_URL}/api/chat`,
            {
                model: terminalModel.ollamaName,
                messages,
                stream: true,
                options: {
                    temperature: 0.7,
                    num_predict: 2048
                }
            },
            {
                responseType: 'stream',
                timeout: effectiveTimeout + 5000, // Slightly longer than our timeout
                signal: abortController.signal
            }
        );

        // Process streaming response
        response.data.on('data', (chunk) => {
            if (!clientConnected) return;

            try {
                const lines = chunk.toString().split('\n').filter(line => line.trim());

                for (const line of lines) {
                    try {
                        const parsed = JSON.parse(line);

                        if (parsed.message?.content) {
                            responseContent += parsed.message.content;
                            tokenCount++;

                            res.write(`data: ${JSON.stringify({
                                type: 'content',
                                content: parsed.message.content,
                                timestamp: new Date().toISOString()
                            })}\n\n`);
                        }

                        if (parsed.done) {
                            clearTimeout(timeoutId);
                            const responseTime = Date.now() - startTime;

                            res.write(`data: ${JSON.stringify({
                                type: 'complete',
                                totalTokens: tokenCount,
                                responseTimeMs: responseTime,
                                timestamp: new Date().toISOString()
                            })}\n\n`);
                            res.write(`data: ${JSON.stringify({ done: true, status: 'completed' })}\n\n`);
                            res.end();

                            // Update query in database
                            if (queryId) {
                                updateQueryResponse(queryId, {
                                    response: responseContent,
                                    tokens: tokenCount,
                                    responseTime,
                                    status: 'completed',
                                    error: null
                                });
                            }

                            logger.info(`Claude Terminal query completed: ${queryId}, tokens: ${tokenCount}, time: ${responseTime}ms`);
                        }
                    } catch (parseError) {
                        // Non-JSON line, ignore
                    }
                }
            } catch (chunkError) {
                logger.warn(`Error processing chunk: ${chunkError.message}`);
            }
        });

        response.data.on('error', (error) => {
            if (!clientConnected) return;

            clearTimeout(timeoutId);
            logger.error(`Stream error: ${error.message}`);

            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: 'Stream error',
                message: error.message,
                timestamp: new Date().toISOString()
            })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true, status: 'error' })}\n\n`);
            res.end();

            if (queryId) {
                updateQueryResponse(queryId, {
                    response: responseContent,
                    tokens: tokenCount,
                    responseTime: Date.now() - startTime,
                    status: 'error',
                    error: error.message
                });
            }
        });

    } catch (error) {
        clearTimeout(timeoutId);

        if (error.name === 'AbortError' || error.code === 'ECONNABORTED') {
            // Already handled by timeout or client disconnect
            return;
        }

        logger.error(`Claude Terminal query error: ${error.message}`);

        if (clientConnected) {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: 'LLM request failed',
                message: error.code === 'ECONNREFUSED' ? 'LLM service not available' : error.message,
                suggestion: 'Please try again. If the problem persists, check the LLM service status.',
                timestamp: new Date().toISOString()
            })}\n\n`);
            res.write(`data: ${JSON.stringify({ done: true, status: 'error' })}\n\n`);
            res.end();
        }

        if (queryId) {
            updateQueryResponse(queryId, {
                response: responseContent,
                tokens: tokenCount,
                responseTime: Date.now() - startTime,
                status: 'error',
                error: error.message
            });
        }
    }
});

/**
 * GET /api/claude-terminal/status - Check terminal service status
 */
router.get('/status', requireAuth, asyncHandler(async (req, res) => {
    const llmStatus = await checkLLMAvailability();

    // Get current default model dynamically
    let defaultModel = null;
    try {
        const terminalModel = await getTerminalModel();
        defaultModel = terminalModel.id;
    } catch {
        // No model available
    }

    res.json({
        service: 'claude-terminal',
        available: llmStatus.available && defaultModel !== null,
        llm: {
            available: llmStatus.available,
            models: llmStatus.models || [],
            error: llmStatus.error
        },
        config: {
            defaultModel: defaultModel,
            defaultTimeout: DEFAULT_TIMEOUT,
            maxQueryLength: MAX_QUERY_LENGTH,
            rateLimit: '5 requests per minute'
        },
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/claude-terminal/history - Get user's query history
 */
router.get('/history', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { limit = 20, offset = 0 } = req.query;

    const result = await db.query(
        `SELECT id, query, response, model_used, tokens_used, response_time_ms,
                status, error_message, created_at, completed_at
         FROM claude_terminal_queries
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, Math.min(parseInt(limit) || 20, 100), parseInt(offset) || 0]
    );

    const countResult = await db.query(
        `SELECT COUNT(*) as total FROM claude_terminal_queries WHERE user_id = $1`,
        [userId]
    );

    res.json({
        queries: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        timestamp: new Date().toISOString()
    });
}));

/**
 * GET /api/claude-terminal/context - Get current system context (for debugging)
 */
router.get('/context', requireAuth, asyncHandler(async (req, res) => {
    const context = await contextService.buildContext({
        includeMetrics: true,
        includeLogs: true,
        includeServices: true,
        logLines: 20,
        logServices: ['system', 'self_healing']
    });

    res.json({
        context,
        formatted: contextService.formatContextForPrompt(context),
        timestamp: new Date().toISOString()
    });
}));

/**
 * DELETE /api/claude-terminal/history - Clear user's query history
 */
router.delete('/history', requireAuth, asyncHandler(async (req, res) => {
    const userId = req.user.id;

    await db.query(
        `DELETE FROM claude_terminal_queries WHERE user_id = $1`,
        [userId]
    );

    res.json({
        success: true,
        message: 'Query history cleared',
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;
