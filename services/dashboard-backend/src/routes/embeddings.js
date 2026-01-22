/**
 * Embeddings API routes
 * Proxies requests to the embedding service
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { requireAuth } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimit');
const { asyncHandler } = require('../middleware/errorHandler');
const { ValidationError } = require('../utils/errors');
const services = require('../config/services');

const EMBEDDING_SERVICE_URL = services.embedding.url;

// POST /api/embeddings - SEC-005 FIX: Added authentication and rate limiting
router.post('/', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const { text } = req.body;

    if (!text) {
        throw new ValidationError('Text is required');
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
}));

module.exports = router;
