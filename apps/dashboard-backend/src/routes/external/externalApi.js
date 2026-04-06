/**
 * External API Routes
 * Dedicated endpoints for external apps (n8n, workflows, automations)
 * Uses API key authentication instead of JWT
 *
 * Base path: /api/v1/external
 *
 * Features:
 * - API key authentication
 * - Rate limiting per key
 * - Full queue integration
 * - Non-streaming mode for easier integration
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const logger = require('../../utils/logger');
const { requireApiKey, requireEndpoint, generateApiKey } = require('../../middleware/apiKeyAuth');
const { requireAuth } = require('../../middleware/auth');
const llmQueueService = require('../../services/llm/llmQueueService');
const llmJobService = require('../../services/llm/llmJobService');
const modelService = require('../../services/llm/modelService');
const extractionService = require('../../services/documents/extractionService');
const { asyncHandler } = require('../../middleware/errorHandler');
const { ValidationError, NotFoundError, ServiceUnavailableError } = require('../../utils/errors');

// Multer for document upload endpoints (50MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      '.pdf',
      '.docx',
      '.txt',
      '.md',
      '.markdown',
      '.yaml',
      '.yml',
      '.png',
      '.jpg',
      '.jpeg',
      '.tiff',
      '.tif',
      '.bmp',
    ];
    const ext = '.' + (file.originalname.split('.').pop() || '').toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new ValidationError(`File type ${ext} not supported`));
    }
  },
});

/**
 * POST /api/v1/external/llm/chat - LLM chat via queue (for n8n, automations)
 *
 * Request body:
 * {
 *   "prompt": "Your question here",
 *   "model": "qwen3:14b-q8",     // Optional, uses default if omitted
 *   "temperature": 0.7,          // Optional
 *   "max_tokens": 2048,          // Optional
 *   "thinking": false,           // Optional, disabled by default for integrations
 *   "wait_for_result": true      // Optional, waits for completion (default: true)
 *   "timeout_seconds": 300       // Optional, max wait time (default: 300)
 * }
 *
 * Response (wait_for_result=true):
 * {
 *   "success": true,
 *   "response": "AI generated text...",
 *   "model": "qwen3:14b-q8",
 *   "job_id": "uuid",
 *   "processing_time_ms": 1234
 * }
 *
 * Response (wait_for_result=false):
 * {
 *   "success": true,
 *   "job_id": "uuid",
 *   "queue_position": 1,
 *   "status": "pending"
 * }
 */
router.post(
  '/llm/chat',
  requireApiKey,
  requireEndpoint('llm:chat'),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();

    const {
      prompt,
      model,
      temperature = 0.7,
      max_tokens = 2048,
      thinking = false,
      wait_for_result = true,
      timeout_seconds = 300,
    } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      throw new ValidationError('prompt is required and must be a string');
    }

    // Create a temporary conversation for this request
    // USER-FIX: Use API key owner's user_id instead of hardcoded 1
    const apiKeyUserId = req.apiKey.userId || 1;
    const conversationResult = await require('../../database').query(
      `
        INSERT INTO chat_conversations (title, user_id, created_at)
        VALUES ($1, $2, NOW())
        RETURNING id
    `,
      [`External API: ${req.apiKey.name} - ${new Date().toISOString()}`, apiKeyUserId]
    );

    const conversationId = conversationResult.rows[0].id;

    // Convert simple prompt to messages format
    const messages = [{ role: 'user', content: prompt }];

    // Enqueue the job
    const {
      jobId,
      messageId,
      queuePosition,
      model: resolvedModel,
    } = await llmQueueService.enqueue(
      conversationId,
      'chat',
      { messages, temperature, max_tokens, thinking },
      { model, priority: 0 }
    );

    logger.info(
      `[External API] Job ${jobId} enqueued by ${req.apiKey.name} (model: ${resolvedModel})`
    );

    if (!wait_for_result) {
      // Return immediately with job info
      return res.json({
        success: true,
        job_id: jobId,
        message_id: messageId,
        queue_position: queuePosition,
        model: resolvedModel,
        status: 'pending',
        timestamp: new Date().toISOString(),
      });
    }

    // Wait for result with timeout
    const timeoutMs = Math.min(timeout_seconds * 1000, 600000); // Max 10 minutes

    const result = await waitForJobCompletion(jobId, timeoutMs);

    const processingTime = Date.now() - startTime;

    if (result.error) {
      return res.status(500).json({
        success: false,
        error: result.error,
        job_id: jobId,
        processing_time_ms: processingTime,
        timestamp: new Date().toISOString(),
      });
    }

    return res.json({
      success: true,
      response: result.content,
      thinking: result.thinking || null,
      model: resolvedModel,
      job_id: jobId,
      processing_time_ms: processingTime,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/external/llm/job/:jobId - Get job status
 */
router.get(
  '/llm/job/:jobId',
  requireApiKey,
  requireEndpoint('llm:status'),
  asyncHandler(async (req, res) => {
    const job = await llmJobService.getJob(req.params.jobId);

    if (!job) {
      throw new NotFoundError('Job not found');
    }

    res.json({
      success: true,
      job_id: job.id,
      status: job.status,
      queue_position: job.queue_position,
      content: job.content,
      thinking: job.thinking,
      error: job.error_message,
      created_at: job.queued_at,
      started_at: job.started_at,
      completed_at: job.completed_at,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/external/llm/queue - Get queue status
 */
router.get(
  '/llm/queue',
  requireApiKey,
  requireEndpoint('llm:status'),
  asyncHandler(async (req, res) => {
    const queueStatus = await llmQueueService.getQueueStatus();
    const loadedModel = await modelService.getLoadedModel();

    res.json({
      success: true,
      loaded_model: loadedModel?.model_id || null,
      queue_length: queueStatus.pending_count,
      processing: queueStatus.processing
        ? {
            job_id: queueStatus.processing.id,
            started_at: queueStatus.processing.started_at,
          }
        : null,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/external/models - Get available models
 */
router.get(
  '/models',
  requireApiKey,
  requireEndpoint('llm:status'),
  asyncHandler(async (req, res) => {
    const installed = await modelService.getInstalledModels();
    const defaultModel = await modelService.getDefaultModel();

    res.json({
      success: true,
      models: installed.map(m => ({
        id: m.id,
        name: m.name,
        category: m.category,
        ram_required_gb: m.ram_required_gb,
        is_default: m.id === defaultModel,
      })),
      default_model: defaultModel,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/v1/external/api-keys - Create new API key (requires JWT auth)
 */
router.post(
  '/api-keys',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { name, description, rate_limit_per_minute, allowed_endpoints, expires_at } = req.body;

    if (!name) {
      throw new ValidationError('name is required');
    }

    const result = await generateApiKey(name, description || '', req.user.id, {
      rateLimitPerMinute: rate_limit_per_minute || 60,
      allowedEndpoints: allowed_endpoints || [
        'llm:chat',
        'llm:status',
        'document:extract',
        'document:analyze',
      ],
      expiresAt: expires_at || null,
    });

    res.json({
      success: true,
      api_key: result.key, // Only shown once!
      key_prefix: result.keyPrefix,
      key_id: result.keyId,
      message: 'Store this API key securely - it will not be shown again!',
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/external/api-keys - List API keys (requires JWT auth)
 */
router.get(
  '/api-keys',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await require('../../database').query(
      `
        SELECT id, key_prefix, name, description, created_at, last_used_at,
               expires_at, is_active, rate_limit_per_minute, allowed_endpoints
        FROM api_keys
        WHERE created_by = $1
        ORDER BY created_at DESC
    `,
      [req.user.id]
    );

    res.json({
      success: true,
      api_keys: result.rows.map(k => ({
        id: k.id,
        key_prefix: k.key_prefix,
        name: k.name,
        description: k.description,
        created_at: k.created_at,
        last_used_at: k.last_used_at,
        expires_at: k.expires_at,
        is_active: k.is_active,
        rate_limit_per_minute: k.rate_limit_per_minute,
        allowed_endpoints: k.allowed_endpoints,
      })),
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/v1/external/api-keys/:keyId - Revoke API key (requires JWT auth)
 */
router.delete(
  '/api-keys/:keyId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await require('../../database').query(
      `
        UPDATE api_keys
        SET is_active = false
        WHERE id = $1 AND created_by = $2
        RETURNING key_prefix
    `,
      [req.params.keyId, req.user.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('API key not found');
    }

    logger.info(
      `[External API] API key ${result.rows[0].key_prefix}*** revoked by user ${req.user.id}`
    );

    res.json({
      success: true,
      message: 'API key revoked',
      timestamp: new Date().toISOString(),
    });
  })
);

// ────────────────────────────────────────────────────────────────────────────
// Document Processing Endpoints
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/external/document/extract - Pure text extraction (OCR if needed)
 *
 * Upload a file and get extracted text back. No LLM involved.
 * Supports: PDF, DOCX, TXT, MD, images (PNG, JPG, TIFF, BMP)
 *
 * Request: multipart/form-data with field "file"
 *
 * Response:
 * {
 *   "success": true,
 *   "text": "Extracted text content...",
 *   "filename": "invoice.pdf",
 *   "char_count": 4521,
 *   "metadata": { "ocr_used": true, "language": "deu", ... },
 *   "processing_time_ms": 1234
 * }
 */
router.post(
  '/document/extract',
  requireApiKey,
  requireEndpoint('document:extract'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();

    if (!req.file) {
      throw new ValidationError('file is required (multipart/form-data)');
    }

    const file = req.file;
    const filename = file.originalname;

    logger.info(
      `[External API] Document extract: ${filename} (${file.size} bytes) by ${req.apiKey.name}`
    );

    const result = await extractionService.extractFromBuffer(file.buffer, filename);

    res.json({
      success: true,
      text: result.text,
      filename,
      char_count: result.text.length,
      metadata: result.metadata,
      processing_time_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/v1/external/document/analyze - Extract text + LLM analysis
 *
 * Upload a file, extract text, then send to LLM with a prompt.
 * Waits for LLM completion (synchronous).
 *
 * Request: multipart/form-data
 *   - file: The document to analyze
 *   - prompt: (optional) What to do with the document. Default: summarize.
 *   - model: (optional) Which model to use
 *   - temperature: (optional) Default 0.7
 *   - max_tokens: (optional) Default 4096
 *   - timeout_seconds: (optional) Max wait time. Default 300.
 *
 * Response:
 * {
 *   "success": true,
 *   "response": "AI analysis result...",
 *   "extracted_text": "Raw extracted text...",
 *   "filename": "invoice.pdf",
 *   "model": "qwen3:14b-q8",
 *   "processing_time_ms": 5678
 * }
 */
router.post(
  '/document/analyze',
  requireApiKey,
  requireEndpoint('document:analyze'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();

    if (!req.file) {
      throw new ValidationError('file is required (multipart/form-data)');
    }

    const file = req.file;
    const filename = file.originalname;
    const {
      prompt,
      model,
      temperature = '0.7',
      max_tokens = '4096',
      timeout_seconds = '300',
    } = req.body;

    logger.info(
      `[External API] Document analyze: ${filename} (${file.size} bytes) by ${req.apiKey.name}`
    );

    // 1. Extract text
    const extraction = await extractionService.extractFromBuffer(file.buffer, filename);
    const extractedText = extraction.text;

    // Truncate for LLM context (30k chars ~ 10k tokens)
    const truncatedText =
      extractedText.length > 30000
        ? extractedText.substring(0, 30000) + '\n\n[... text truncated ...]'
        : extractedText;

    // 2. Build LLM prompt
    const analysisPrompt = prompt
      ? `Document: "${filename}"\n\nExtracted text:\n---\n${truncatedText}\n---\n\nUser request: ${prompt}`
      : `Document: "${filename}"\n\nExtracted text:\n---\n${truncatedText}\n---\n\nPlease analyze this document and summarize the key contents.`;

    // 3. Create temp conversation and enqueue LLM job
    const apiKeyUserId = req.apiKey.userId || 1;
    const conversationResult = await require('../../database').query(
      `INSERT INTO chat_conversations (title, user_id, created_at)
       VALUES ($1, $2, NOW()) RETURNING id`,
      [`External API Document: ${req.apiKey.name} - ${filename}`, apiKeyUserId]
    );
    const conversationId = conversationResult.rows[0].id;

    const messages = [{ role: 'user', content: analysisPrompt }];
    const { jobId, model: resolvedModel } = await llmQueueService.enqueue(
      conversationId,
      'chat',
      {
        messages,
        temperature: parseFloat(temperature) || 0.7,
        max_tokens: parseInt(max_tokens) || 4096,
        thinking: false,
      },
      { model: model || null, priority: 0 }
    );

    // 4. Wait for result
    const timeoutMs = Math.min(parseInt(timeout_seconds) * 1000 || 300000, 600000);
    const result = await waitForJobCompletion(jobId, timeoutMs);

    if (result.error) {
      return res.status(500).json({
        success: false,
        error: result.error,
        job_id: jobId,
        processing_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      success: true,
      response: result.content,
      extracted_text: extractedText,
      filename,
      char_count: extractedText.length,
      metadata: extraction.metadata,
      model: resolvedModel,
      job_id: jobId,
      processing_time_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/v1/external/document/extract-structured - Extract + structured output
 *
 * Upload a document and get structured JSON data via LLM.
 * Designed for invoice processing, form extraction, etc.
 *
 * Request: multipart/form-data
 *   - file: The document
 *   - schema: JSON schema describing desired output structure
 *   - instructions: (optional) Additional extraction instructions
 *   - model: (optional) Which model to use
 *   - timeout_seconds: (optional) Default 300
 *
 * Response:
 * {
 *   "success": true,
 *   "data": { ... structured JSON ... },
 *   "raw_response": "LLM raw text",
 *   "filename": "invoice.pdf",
 *   "model": "qwen3:14b-q8"
 * }
 */
router.post(
  '/document/extract-structured',
  requireApiKey,
  requireEndpoint('document:extract'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();

    if (!req.file) {
      throw new ValidationError('file is required (multipart/form-data)');
    }

    const file = req.file;
    const filename = file.originalname;
    const { schema, instructions, model, timeout_seconds = '300' } = req.body;

    if (!schema) {
      throw new ValidationError('schema is required — JSON schema describing desired output');
    }

    // Validate schema is valid JSON
    let parsedSchema;
    try {
      parsedSchema = typeof schema === 'string' ? JSON.parse(schema) : schema;
    } catch {
      throw new ValidationError('schema must be valid JSON');
    }

    logger.info(`[External API] Structured extract: ${filename} by ${req.apiKey.name}`);

    // 1. Extract text
    const extraction = await extractionService.extractFromBuffer(file.buffer, filename);
    const extractedText = extraction.text;

    const truncatedText =
      extractedText.length > 30000
        ? extractedText.substring(0, 30000) + '\n\n[... text truncated ...]'
        : extractedText;

    // 2. Build structured extraction prompt
    const schemaStr = JSON.stringify(parsedSchema, null, 2);
    const structuredPrompt = `You are a precise data extraction assistant. Extract structured data from the following document.

Document: "${filename}"

Extracted text:
---
${truncatedText}
---

${instructions ? `Additional instructions: ${instructions}\n\n` : ''}Output MUST be valid JSON matching this schema:
\`\`\`json
${schemaStr}
\`\`\`

Respond with ONLY the JSON object. No markdown, no explanation, just the JSON.`;

    // 3. Enqueue LLM job
    const apiKeyUserId = req.apiKey.userId || 1;
    const conversationResult = await require('../../database').query(
      `INSERT INTO chat_conversations (title, user_id, created_at)
       VALUES ($1, $2, NOW()) RETURNING id`,
      [`External API Structured: ${req.apiKey.name} - ${filename}`, apiKeyUserId]
    );
    const conversationId = conversationResult.rows[0].id;

    const messages = [{ role: 'user', content: structuredPrompt }];
    const { jobId, model: resolvedModel } = await llmQueueService.enqueue(
      conversationId,
      'chat',
      {
        messages,
        temperature: 0.1, // Low temperature for structured extraction
        max_tokens: 4096,
        thinking: false,
      },
      { model: model || null, priority: 0 }
    );

    // 4. Wait for result
    const timeoutMs = Math.min(parseInt(timeout_seconds) * 1000 || 300000, 600000);
    const result = await waitForJobCompletion(jobId, timeoutMs);

    if (result.error) {
      return res.status(500).json({
        success: false,
        error: result.error,
        job_id: jobId,
        processing_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      });
    }

    // 5. Parse structured response
    let structuredData = null;
    const rawResponse = result.content || '';
    try {
      // Strip markdown code fences if present
      const cleaned = rawResponse
        .replace(/^```(?:json)?\s*\n?/m, '')
        .replace(/\n?\s*```\s*$/m, '')
        .trim();
      structuredData = JSON.parse(cleaned);
    } catch {
      // LLM didn't return valid JSON — return raw response for client to handle
      logger.warn(`[External API] Structured extract: LLM returned non-JSON for ${filename}`);
    }

    res.json({
      success: true,
      data: structuredData,
      raw_response: rawResponse,
      extracted_text: extractedText,
      filename,
      char_count: extractedText.length,
      metadata: extraction.metadata,
      model: resolvedModel,
      job_id: jobId,
      processing_time_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * Helper: Wait for job completion with timeout
 */
async function waitForJobCompletion(jobId, timeoutMs) {
  const pollInterval = 500; // 500ms
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const job = await llmJobService.getJob(jobId);

    if (!job) {
      return { error: 'Job not found' };
    }

    if (job.status === 'completed') {
      return {
        content: job.content,
        thinking: job.thinking,
      };
    }

    if (job.status === 'error') {
      return { error: job.error_message || 'Job failed' };
    }

    if (job.status === 'cancelled') {
      return { error: 'Job was cancelled' };
    }

    // Wait before next poll
    await new Promise(resolve => {
      setTimeout(resolve, pollInterval);
    });
  }

  return { error: 'Job timed out' };
}

module.exports = router;
