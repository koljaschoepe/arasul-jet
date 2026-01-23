/**
 * Embeddings API routes
 * Proxies requests to the embedding service
 *
 * MEDIUM-PRIORITY-FIX 3.7: Added HTTP connection pooling for better performance
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

// MEDIUM-PRIORITY-FIX 3.7: Lazy-initialized axios instance with connection pooling
// Lazy initialization avoids issues in test environments
let _embeddingAxios = null;

function getEmbeddingAxios() {
    if (!_embeddingAxios) {
        // Only require http/https when actually needed (not during tests)
        const http = require('http');
        const https = require('https');

        const httpAgent = new http.Agent({
            keepAlive: true,
            maxSockets: 10,
            maxFreeSockets: 5,
            timeout: 60000
        });

        const httpsAgent = new https.Agent({
            keepAlive: true,
            maxSockets: 10,
            maxFreeSockets: 5,
            timeout: 60000
        });

        _embeddingAxios = axios.create({
            httpAgent,
            httpsAgent,
            timeout: 10000
        });
    }
    return _embeddingAxios;
}

// POST /api/embeddings - SEC-005 FIX: Added authentication and rate limiting
router.post('/', requireAuth, apiLimiter, asyncHandler(async (req, res) => {
    const { text } = req.body;

    if (!text) {
        throw new ValidationError('Text is required');
    }

    // Handle both string and array of strings
    const texts = Array.isArray(text) ? text : [text];

    // MEDIUM-PRIORITY-FIX 3.7: Use pooled axios instance
    const response = await getEmbeddingAxios().post(
        `${EMBEDDING_SERVICE_URL}/embed`,
        { texts }
    );

    res.json({
        vectors: response.data.vectors || response.data.embeddings,
        dimension: response.data.dimension || process.env.EMBEDDING_VECTOR_SIZE,
        timestamp: new Date().toISOString()
    });
}));

module.exports = router;
