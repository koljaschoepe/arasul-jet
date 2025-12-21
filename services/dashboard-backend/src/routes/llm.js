/**
 * LLM API routes
 * Proxies requests to the LLM service (Ollama)
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { llmLimiter } = require('../middleware/rateLimit');

const LLM_SERVICE_URL = `http://${process.env.LLM_SERVICE_HOST || 'llm-service'}:${process.env.LLM_SERVICE_PORT || '11434'}`;

// POST /api/llm/chat - Streaming chat endpoint with SSE
router.post('/chat', requireAuth, llmLimiter, async (req, res) => {
    try {
        const { messages, temperature, max_tokens, stream } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({
                error: 'Messages array is required',
                timestamp: new Date().toISOString()
            });
        }

        // Convert to Ollama format
        const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');

        // If streaming is requested (default: true)
        if (stream !== false) {
            // Set SSE headers
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');

            try {
                const response = await axios.post(
                    `${LLM_SERVICE_URL}/api/generate`,
                    {
                        model: process.env.LLM_MODEL || 'qwen3:14b-q8',
                        prompt: prompt,
                        stream: true,
                        keep_alive: parseInt(process.env.LLM_KEEP_ALIVE_SECONDS || '300'),  // Auto-unload after timeout
                        options: {
                            temperature: temperature || 0.7,
                            num_predict: max_tokens || 32768
                        }
                    },
                    {
                        timeout: 600000, // 10 minute timeout for long responses
                        responseType: 'stream'
                    }
                );

                // Track thinking state
                let inThinkingBlock = false;
                let fullText = '';

                // Stream the response chunks
                response.data.on('data', (chunk) => {
                    try {
                        const lines = chunk.toString().split('\n').filter(line => line.trim());

                        for (const line of lines) {
                            const parsed = JSON.parse(line);

                            if (parsed.response) {
                                fullText += parsed.response;

                                // Detect thinking blocks: <think>, <thinking>, or (<think>...)
                                const thinkStartMatch = fullText.match(/(?:<think>|\(<think>)/);
                                const thinkEndMatch = fullText.match(/(?:<\/think>|<\/think>\))/);

                                let tokenType = 'response';

                                // Check if we're entering a thinking block
                                if (thinkStartMatch && !inThinkingBlock) {
                                    inThinkingBlock = true;
                                    tokenType = 'thinking_start';
                                    // Send the text before the thinking tag as response
                                    const beforeThink = fullText.substring(0, thinkStartMatch.index);
                                    if (beforeThink) {
                                        res.write(`data: ${JSON.stringify({
                                            token: beforeThink,
                                            type: 'response',
                                            done: false
                                        })}\n\n`);
                                    }
                                    fullText = fullText.substring(thinkStartMatch.index + thinkStartMatch[0].length);
                                }

                                // Check if we're exiting a thinking block
                                if (thinkEndMatch && inThinkingBlock) {
                                    inThinkingBlock = false;
                                    tokenType = 'thinking_end';
                                    // Send the thinking content
                                    const thinkContent = fullText.substring(0, thinkEndMatch.index);
                                    if (thinkContent) {
                                        res.write(`data: ${JSON.stringify({
                                            token: thinkContent,
                                            type: 'thinking',
                                            done: false
                                        })}\n\n`);
                                    }
                                    // Signal end of thinking
                                    res.write(`data: ${JSON.stringify({
                                        type: 'thinking_end',
                                        done: false
                                    })}\n\n`);
                                    fullText = fullText.substring(thinkEndMatch.index + thinkEndMatch[0].length);
                                    continue;
                                }

                                // Send token with appropriate type
                                if (inThinkingBlock) {
                                    res.write(`data: ${JSON.stringify({
                                        token: parsed.response,
                                        type: 'thinking',
                                        done: false
                                    })}\n\n`);
                                } else if (tokenType !== 'thinking_start') {
                                    res.write(`data: ${JSON.stringify({
                                        token: parsed.response,
                                        type: 'response',
                                        done: false
                                    })}\n\n`);
                                }
                            }

                            if (parsed.done) {
                                res.write(`data: ${JSON.stringify({
                                    done: true,
                                    model: parsed.model,
                                    timestamp: new Date().toISOString()
                                })}\n\n`);
                                res.end();
                            }
                        }
                    } catch (parseError) {
                        logger.error(`Error parsing LLM stream chunk: ${parseError.message}`);
                    }
                });

                response.data.on('error', (error) => {
                    logger.error(`Stream error: ${error.message}`);
                    res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
                    res.end();
                });

            } catch (error) {
                logger.error(`Error in streaming /api/llm/chat: ${error.message}`);
                res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
                res.end();
            }
        } else {
            // Non-streaming response (backward compatibility)
            const response = await axios.post(
                `${LLM_SERVICE_URL}/api/generate`,
                {
                    model: process.env.LLM_MODEL || 'qwen3:14b-q8',
                    prompt: prompt,
                    stream: false,
                    keep_alive: parseInt(process.env.LLM_KEEP_ALIVE_SECONDS || '300'),  // Auto-unload after timeout
                    options: {
                        temperature: temperature || 0.7,
                        num_predict: max_tokens || 32768
                    }
                },
                {
                    timeout: 600000 // 10 minute timeout for long responses
                }
            );

            res.json({
                response: response.data.response,
                model: response.data.model,
                tokens: response.data.eval_count || 0,
                timestamp: new Date().toISOString()
            });
        }

    } catch (error) {
        logger.error(`Error in /api/llm/chat: ${error.message}`);

        if (error.code === 'ECONNREFUSED') {
            res.status(503).json({
                error: 'LLM service is not available',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                error: 'LLM request failed',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
});

// GET /api/llm/models - SEC-004 FIX: Added authentication
router.get('/models', requireAuth, async (req, res) => {
    try {
        const response = await axios.get(`${LLM_SERVICE_URL}/api/tags`, { timeout: 5000 });

        res.json({
            models: response.data.models || [],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/llm/models: ${error.message}`);
        res.status(503).json({
            error: 'Failed to get LLM models',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
