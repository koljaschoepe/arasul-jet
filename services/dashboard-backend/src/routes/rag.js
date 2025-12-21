/**
 * RAG (Retrieval Augmented Generation) API Routes
 * Provides endpoints for querying documents using vector search and LLM
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { llmLimiter } = require('../middleware/rateLimit');

// Environment variables
const QDRANT_HOST = process.env.QDRANT_HOST || 'qdrant';
const QDRANT_PORT = process.env.QDRANT_PORT || '6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION_NAME || 'documents';
const EMBEDDING_SERVICE_HOST = process.env.EMBEDDING_SERVICE_HOST || 'embedding-service';
const EMBEDDING_SERVICE_PORT = process.env.EMBEDDING_SERVICE_PORT || '11435';
const LLM_SERVICE_HOST = process.env.LLM_SERVICE_HOST || 'llm-service';
const LLM_SERVICE_PORT = process.env.LLM_SERVICE_PORT || '11434';

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
 * Generate and stream RAG response token by token
 */
async function streamRAGResponse(query, context, sources, res) {
  try {
    // Build prompt with context
    const systemPrompt = `You are a helpful assistant. Answer the user's question based on the following context from documents. If the answer is not in the context, say so.

Context:
${context}`;

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send sources first
    res.write(`data: ${JSON.stringify({ type: 'sources', sources: sources })}\n\n`);

    // Get complete response from LLM (non-streaming)
    // Use /api/generate endpoint (Ollama API) instead of /api/chat
    const prompt = `${systemPrompt}\n\nUser: ${query}\nAssistant:`;

    const response = await axios.post(
      `http://${LLM_SERVICE_HOST}:${LLM_SERVICE_PORT}/api/generate`,
      {
        model: process.env.LLM_MODEL || 'qwen3:14b-q8',
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 32768
        }
      },
      {
        timeout: 300000,  // 5 minutes for complex RAG queries
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      }
    );

    const fullText = response.data.response;

    // Parse thinking blocks
    const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
    let lastIndex = 0;
    let match;
    let textParts = [];

    while ((match = thinkRegex.exec(fullText)) !== null) {
      // Add text before thinking block
      if (match.index > lastIndex) {
        textParts.push({
          type: 'response',
          content: fullText.substring(lastIndex, match.index)
        });
      }

      // Add thinking block
      textParts.push({
        type: 'thinking',
        content: match[1]
      });

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last thinking block
    if (lastIndex < fullText.length) {
      textParts.push({
        type: 'response',
        content: fullText.substring(lastIndex)
      });
    }

    // Stream tokens
    for (let part of textParts) {
      if (part.type === 'thinking') {
        // Stream thinking tokens (faster)
        const thinkingTokens = part.content.split('');
        for (let i = 0; i < thinkingTokens.length; i += 3) {
          const chunk = thinkingTokens.slice(i, i + 3).join('');
          res.write(`data: ${JSON.stringify({ type: 'thinking', token: chunk })}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 5));  // 5ms delay
        }
        res.write(`data: ${JSON.stringify({ type: 'thinking_end' })}\n\n`);
      } else {
        // Stream response tokens (slower for readability)
        const responseTokens = part.content.split('');
        for (let i = 0; i < responseTokens.length; i += 2) {
          const chunk = responseTokens.slice(i, i + 2).join('');
          res.write(`data: ${JSON.stringify({ type: 'response', token: chunk })}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 10));  // 10ms delay
        }
      }
    }

    // Send done signal
    res.write(`data: ${JSON.stringify({ type: 'done', done: true })}\n\n`);
    res.end();

  } catch (error) {
    logger.error(`Error generating LLM response: ${error.message}`);
    throw error;
  }
}

/**
 * POST /api/rag/query
 * Perform RAG query: search documents and generate answer
 *
 * Body:
 * {
 *   "query": "What is the meaning of life?",
 *   "top_k": 5  // optional, default 5
 * }
 */
router.post('/query', requireAuth, llmLimiter, async (req, res) => {
  try {
    const { query, top_k = 5 } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        error: 'Query is required and must be a string'
      });
    }

    logger.info(`RAG query: "${query}" (top_k=${top_k})`);

    // Step 1: Generate embedding for query
    const queryEmbedding = await getEmbedding(query);

    // Step 2: Search for similar chunks in Qdrant
    const searchResults = await searchSimilarChunks(queryEmbedding, top_k);

    if (searchResults.length === 0) {
      return res.json({
        answer: 'I could not find any relevant documents to answer your question.',
        sources: [],
        timestamp: new Date().toISOString()
      });
    }

    // Step 3: Build context from search results
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

    // Step 4: Stream answer from LLM
    await streamRAGResponse(query, context, sources, res);

  } catch (error) {
    logger.error(`RAG query error: ${error.message}`);

    // Only send error if headers not sent yet
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        timestamp: new Date().toISOString()
      });
    } else {
      // Send error via SSE
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
    // Check Qdrant
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
