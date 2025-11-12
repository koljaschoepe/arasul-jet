/**
 * LLM API routes
 * Proxies requests to the LLM service (Ollama)
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');

const LLM_SERVICE_URL = `http://${process.env.LLM_SERVICE_HOST || 'llm-service'}:${process.env.LLM_SERVICE_PORT || '11434'}`;

// POST /api/llm/chat
router.post('/chat', async (req, res) => {
    try {
        const { messages, temperature, max_tokens } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({
                error: 'Messages array is required',
                timestamp: new Date().toISOString()
            });
        }

        // Convert to Ollama format
        const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');

        const response = await axios.post(
            `${LLM_SERVICE_URL}/api/generate`,
            {
                model: process.env.LLM_MODEL || 'llama3.1:8b',
                prompt: prompt,
                stream: false,
                options: {
                    temperature: temperature || 0.7,
                    num_predict: max_tokens || 2048
                }
            },
            {
                timeout: 60000 // 60 second timeout
            }
        );

        res.json({
            response: response.data.response,
            model: response.data.model,
            tokens: response.data.eval_count || 0,
            timestamp: new Date().toISOString()
        });

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

// GET /api/llm/models
router.get('/models', async (req, res) => {
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
