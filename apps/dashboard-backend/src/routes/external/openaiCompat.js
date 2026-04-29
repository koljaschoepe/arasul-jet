/**
 * OpenAI-Compatible API Routes
 *
 * Drop-in replacement for OpenAI's `/v1/chat/completions`, `/v1/embeddings`,
 * and `/v1/models` endpoints — backed by Arasul's local LLM and embedding
 * services. Designed so n8n's "OpenAI Chat Model" node, the official OpenAI
 * SDKs, and any third-party tooling that points at a configurable base URL
 * can talk to the local stack without custom plumbing.
 *
 * Mounted at /v1 (parallel to /api), authentication is via API key
 * (X-API-Key or Authorization: Bearer aras_…). Endpoint scopes:
 *   - openai:chat        → /v1/chat/completions
 *   - openai:embeddings  → /v1/embeddings
 *   - openai:models      → /v1/models
 * Existing `llm:chat` / `llm:status` scopes are accepted as fallbacks so
 * that previously issued keys keep working.
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const logger = require('../../utils/logger');
const services = require('../../config/services');
const { requireApiKey } = require('../../middleware/apiKeyAuth');
const llmQueueService = require('../../services/llm/llmQueueService');
const llmJobService = require('../../services/llm/llmJobService');
const modelService = require('../../services/llm/modelService');
const ollamaReadiness = require('../../services/llm/ollamaReadiness');
const database = require('../../database');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ServiceUnavailableError } = require('../../utils/errors');
const { validateBody } = require('../../middleware/validate');
const { initSSE, trackConnection } = require('../../utils/sseHelper');
const { ChatCompletionsBody, EmbeddingsBody } = require('../../schemas/openaiCompat');

const EMBEDDING_SERVICE_URL = services.embedding.url;

// Map OpenAI-style endpoint scopes to legacy scopes so older API keys keep
// working. Either scope grants access to the matching endpoint.
const ENDPOINT_FALLBACKS = {
  'openai:chat': ['llm:chat'],
  'openai:embeddings': ['llm:status', 'document:extract'],
  'openai:models': ['llm:status'],
};

function requireOpenAIEndpoint(endpoint) {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({
        error: {
          message: 'API key required',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      });
    }
    const allowed = req.apiKey.allowedEndpoints || [];
    const accepted = [endpoint, ...(ENDPOINT_FALLBACKS[endpoint] || [])];
    const ok = allowed.includes('*') || accepted.some(e => allowed.includes(e));
    if (!ok) {
      return res.status(403).json({
        error: {
          message: `Access to '${endpoint}' not allowed for this API key`,
          type: 'permission_error',
          code: 'insufficient_permissions',
        },
      });
    }
    next();
  };
}

// OpenAI accepts `Authorization: Bearer <key>` while the rest of the system
// expects X-API-Key. Translate before requireApiKey runs.
function bearerToApiKey(req, _res, next) {
  if (!req.headers['x-api-key']) {
    const auth = req.headers.authorization || '';
    const match = auth.match(/^Bearer\s+(\S+)/i);
    if (match) {
      req.headers['x-api-key'] = match[1];
    }
  }
  next();
}

function newCompletionId() {
  return `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
}

function newEmbeddingId() {
  return `embd-${crypto.randomBytes(12).toString('hex')}`;
}

// Rough token estimate so n8n's UI shows non-zero usage without us round-
// tripping a tokenizer. ≈4 chars per token tracks BPE close enough for a
// dashboard counter; downstream metering should ignore these and use job
// records when available.
function estimateTokens(text) {
  if (!text) {
    return 0;
  }
  return Math.ceil(String(text).length / 4);
}

async function resolveModelOrThrow(requested) {
  const fallback = await modelService.getDefaultModel();
  const target = requested || fallback;
  if (!target) {
    throw new ServiceUnavailableError(
      'No LLM model installed — install one via the Store before calling this endpoint.'
    );
  }
  return target;
}

/**
 * POST /v1/chat/completions — OpenAI-compatible chat completion
 */
router.post(
  '/chat/completions',
  bearerToApiKey,
  requireApiKey,
  requireOpenAIEndpoint('openai:chat'),
  validateBody(ChatCompletionsBody),
  asyncHandler(async (req, res) => {
    const startedAt = Date.now();
    const {
      model: requestedModel,
      messages,
      temperature = 0.7,
      max_tokens: maxTokensRaw,
      stream = false,
    } = req.body;

    // Phase 4.1: fail fast when Ollama is dead so n8n nodes get a clean
    // 503 instead of waiting for the queue's model-load timeout.
    const health = await ollamaReadiness.quickCheck(2000);
    if (!health.ready) {
      throw new ServiceUnavailableError('LLM service is not reachable', {
        code: 'OLLAMA_UNAVAILABLE',
        service: 'ollama',
        details: { latencyMs: health.latencyMs, error: health.error },
      });
    }

    const resolvedModel = await resolveModelOrThrow(requestedModel);

    // Normalize messages: OpenAI allows null content for tool calls; we
    // coerce to string so downstream code can treat content uniformly.
    const normalizedMessages = messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : '',
    }));

    const promptTokens = normalizedMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const max_tokens = maxTokensRaw || 2048;

    const apiKeyUserId = req.apiKey.userId || 1;
    const conversationResult = await database.query(
      `INSERT INTO chat_conversations (title, user_id, created_at)
       VALUES ($1, $2, NOW()) RETURNING id`,
      [`OpenAI compat: ${req.apiKey.name} - ${new Date().toISOString()}`, apiKeyUserId]
    );
    const conversationId = conversationResult.rows[0].id;

    let jobInfo;
    try {
      jobInfo = await llmQueueService.enqueue(
        conversationId,
        'chat',
        { messages: normalizedMessages, temperature, max_tokens, thinking: false },
        { model: resolvedModel, priority: 0 }
      );
    } catch (err) {
      logger.warn(`[OpenAI compat] enqueue failed: ${err.message}`);
      throw new ServiceUnavailableError(err.message || 'LLM enqueue failed');
    }

    const { jobId } = jobInfo;
    const completionId = newCompletionId();
    const created = Math.floor(startedAt / 1000);

    if (!stream) {
      const result = await waitForJobCompletion(jobId, 600000);
      if (result.error) {
        return res.status(503).json({
          error: {
            message: result.error,
            type: 'service_unavailable',
            code: 'llm_job_failed',
          },
        });
      }

      const completionTokens = estimateTokens(result.content || '');
      return res.json({
        id: completionId,
        object: 'chat.completion',
        created,
        model: resolvedModel,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: result.content || '' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
        system_fingerprint: `arasul-${resolvedModel}`,
      });
    }

    // Streaming branch — emit OpenAI-style SSE deltas
    initSSE(res);
    const connection = trackConnection(res);
    let unsubscribe = null;
    let firstChunkSent = false;
    let aggregated = '';

    const writeChunk = obj => {
      if (!connection.isConnected()) {
        return;
      }
      try {
        res.write(`data: ${JSON.stringify(obj)}\n\n`);
      } catch (err) {
        logger.debug(`[OpenAI compat ${jobId}] write error: ${err.message}`);
      }
    };

    const finishStream = (finishReason = 'stop') => {
      writeChunk({
        id: completionId,
        object: 'chat.completion.chunk',
        created,
        model: resolvedModel,
        choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
      });
      try {
        res.write('data: [DONE]\n\n');
        res.end();
      } catch {
        /* already ended */
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    };

    connection.onClose(() => {
      logger.debug(`[OpenAI compat ${jobId}] client disconnected`);
      if (unsubscribe) {
        unsubscribe();
      }
    });

    unsubscribe = llmQueueService.subscribeToJob(jobId, event => {
      if (!connection.isConnected()) {
        return;
      }

      // First-token delta carries the role per OpenAI convention
      if (event.type === 'response' && event.token) {
        aggregated += event.token;
        const delta = firstChunkSent
          ? { content: event.token }
          : { role: 'assistant', content: event.token };
        firstChunkSent = true;
        writeChunk({
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: resolvedModel,
          choices: [{ index: 0, delta, finish_reason: null }],
        });
        return;
      }

      if (event.error || (event.type === 'error' && event.done)) {
        const message = event.error || 'LLM stream error';
        writeChunk({
          id: completionId,
          object: 'chat.completion.chunk',
          created,
          model: resolvedModel,
          error: { message, type: 'service_unavailable' },
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        });
        try {
          res.write('data: [DONE]\n\n');
          res.end();
        } catch {
          /* already ended */
        }
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        return;
      }

      if (event.done) {
        // Server-side aggregator may have a more complete content payload;
        // if so, flush whatever wasn't sent token-by-token (covers
        // non-streaming Ollama responses replayed through subscribers).
        const finalContent = typeof event.content === 'string' ? event.content : null;
        if (finalContent && finalContent.length > aggregated.length) {
          const missing = finalContent.slice(aggregated.length);
          if (missing) {
            const delta = firstChunkSent
              ? { content: missing }
              : { role: 'assistant', content: missing };
            firstChunkSent = true;
            writeChunk({
              id: completionId,
              object: 'chat.completion.chunk',
              created,
              model: resolvedModel,
              choices: [{ index: 0, delta, finish_reason: null }],
            });
          }
        }
        finishStream('stop');
      }
    });
  })
);

/**
 * POST /v1/embeddings — OpenAI-compatible embeddings
 */
router.post(
  '/embeddings',
  bearerToApiKey,
  requireApiKey,
  requireOpenAIEndpoint('openai:embeddings'),
  validateBody(EmbeddingsBody),
  asyncHandler(async (req, res) => {
    const { input, model: requestedModel } = req.body;
    const inputs = Array.isArray(input) ? input : [input];

    let response;
    try {
      response = await axios.post(
        `${EMBEDDING_SERVICE_URL}/embed`,
        { texts: inputs },
        { timeout: 30000 }
      );
    } catch (err) {
      logger.warn(`[OpenAI compat] embedding service error: ${err.message}`);
      throw new ServiceUnavailableError('Embedding service unavailable');
    }

    const vectors = response.data.vectors || response.data.embeddings || [];
    if (!Array.isArray(vectors) || vectors.length !== inputs.length) {
      throw new ServiceUnavailableError('Embedding service returned malformed payload');
    }

    const reportedModel = requestedModel || process.env.EMBEDDING_MODEL || 'BAAI/bge-m3';
    const promptTokens = inputs.reduce((sum, t) => sum + estimateTokens(t), 0);

    res.json({
      object: 'list',
      data: vectors.map((vector, index) => ({
        object: 'embedding',
        index,
        embedding: vector,
      })),
      model: reportedModel,
      usage: {
        prompt_tokens: promptTokens,
        total_tokens: promptTokens,
      },
      system_fingerprint: `arasul-${reportedModel}`,
      // Surface the embedding ID so observability is possible — not part of
      // the strict OpenAI contract but harmless for compliant clients.
      id: newEmbeddingId(),
    });
  })
);

/**
 * GET /v1/models — OpenAI-compatible model listing
 */
router.get(
  '/models',
  bearerToApiKey,
  requireApiKey,
  requireOpenAIEndpoint('openai:models'),
  asyncHandler(async (req, res) => {
    const installed = await modelService.getInstalledModels();
    const created = Math.floor(Date.now() / 1000);

    const data = installed
      // OCR-only models aren't useful for chat — skip them in the listing
      // to keep the surface focused. They remain reachable via the
      // proprietary /api/models endpoint.
      .filter(m => m.model_type !== 'ocr')
      .map(m => ({
        id: m.id,
        object: 'model',
        created,
        owned_by: 'arasul',
        permission: [],
        root: m.id,
        parent: null,
      }));

    res.json({ object: 'list', data });
  })
);

/**
 * Helper: poll job until completion
 */
async function waitForJobCompletion(jobId, timeoutMs) {
  const pollInterval = 500;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const job = await llmJobService.getJob(jobId);
    if (!job) {
      return { error: 'Job not found' };
    }
    if (job.status === 'completed') {
      return { content: job.content || '', thinking: job.thinking || '' };
    }
    if (job.status === 'error') {
      return { error: job.error_message || 'Job failed' };
    }
    if (job.status === 'cancelled') {
      return { error: 'Job was cancelled' };
    }
    await new Promise(resolve => {
      setTimeout(resolve, pollInterval);
    });
  }
  return { error: 'Job timed out' };
}

module.exports = router;
