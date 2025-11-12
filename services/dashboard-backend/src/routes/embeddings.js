/**
 * Embeddings API routes
 * Proxies requests to the embedding service
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');

const EMBEDDING_SERVICE_URL = `http://${process.env.EMBEDDING_SERVICE_HOST || 'embedding-service'}:${process.env.EMBEDDING_SERVICE_PORT || '11435'}`;

// POST /api/embeddings
router.post('/', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) {
            return res.status(400).json({
                error: 'Text is required',
                timestamp: new Date().toISOString()
            });
        }

        // Handle both string and array of strings
        const texts = Array.isArray(text) ? text : [text];

        const response = await axios.post(
            `${EMBEDDING_SERVICE_URL}/embed`,
            { texts },
            {
                timeout: 5000
            }
        );

        res.json({
            vectors: response.data.vectors || response.data.embeddings,
            dimension: response.data.dimension || process.env.EMBEDDING_VECTOR_SIZE,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`Error in /api/embeddings: ${error.message}`);

        if (error.code === 'ECONNREFUSED') {
            res.status(503).json({
                error: 'Embedding service is not available',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(500).json({
                error: 'Embedding request failed',
                details: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }
});

module.exports = router;
