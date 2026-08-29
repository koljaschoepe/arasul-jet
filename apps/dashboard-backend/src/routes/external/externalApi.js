/**
 * External API Routes
 * Dedicated endpoints for external apps and automations
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
const { mitNamensReparatur } = require('../../utils/uploadName');
const logger = require('../../utils/logger');
const { requireApiKey, requireEndpoint, generateApiKey } = require('../../middleware/apiKeyAuth');
const { VORGABE_ENDPUNKTE } = require('../../config/apiBereiche');
const { requireAuth, requireRole } = require('../../middleware/auth');
const llmQueueService = require('../../services/llm/llmQueueService');
const llmJobService = require('../../services/llm/llmJobService');
const modelService = require('../../services/llm/modelService');
const extractionService = require('../../services/documents/extractionService');
const { asyncHandler } = require('../../middleware/errorHandler');
const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ServiceUnavailableError,
} = require('../../utils/errors');
const { validateBody } = require('../../middleware/validate');
const {
  ExternalLlmChatBody,
  ExternalFlowRunBody,
  CreateApiKeyBody,
} = require('../../schemas/externalApi');
const flowRegistry = require('../../services/flows/flowRegistry');
const appFlows = require('../../services/app/appFlows');
const flowRunner = require('../../services/flows/flowRunner');
const flowRunStore = require('../../services/flows/runStore');
const freigabeAnfragen = require('../../services/flows/freigabeAnfragen');
const { resolveArguments } = require('../../services/flows/runFlow');

// Multer for document upload endpoints (50MB limit)
const upload = multer(
  mitNamensReparatur({
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
  })
);

/**
 * Jeder Auftrag braucht einen eindeutigen Besitzer. `req.apiKey.userId` ist der
 * Schlüssel-Ersteller (api_keys.created_by) — er kann NULL sein, wenn dieser
 * Nutzer gelöscht wurde (ON DELETE SET NULL). Dann NICHT still auf Admin (1)
 * ausweichen: sonst liest ein verwaister Schlüssel fremde Aufträge und Läufe.
 * Bis Phase B6 wich `/llm/chat` genau so aus; seit `llm_jobs.user_id` (165)
 * gilt für Aufträge dieselbe Regel wie für Flow-Läufe.
 */
function besitzerOderAbweisen(apiKey) {
  if (!apiKey.userId) {
    throw new ForbiddenError('API-Schlüssel ohne gültigen Besitzer, bitte neu erstellen');
  }
  return apiKey.userId;
}

/**
 * POST /api/v1/external/llm/chat - LLM chat via queue (for automations)
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
  validateBody(ExternalLlmChatBody),
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

    const userId = besitzerOderAbweisen(req.apiKey);

    // Convert simple prompt to messages format
    const messages = [{ role: 'user', content: prompt }];

    // Enqueue the job
    const {
      jobId,
      queuePosition,
      model: resolvedModel,
    } = await llmQueueService.enqueue(
      userId,
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
        queue_position: queuePosition,
        model: resolvedModel,
        status: 'pending',
        timestamp: new Date().toISOString(),
      });
    }

    // Wait for result with timeout
    const timeoutMs = Math.min(timeout_seconds * 1000, 600000); // Max 10 minutes

    const result = await waitForJobCompletion(jobId, timeoutMs, req);

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

    // null-guard: req.apiKey.userId can be NULL when the original key creator was
    // deleted (api_keys.created_by ON DELETE SET NULL). Without this guard,
    // null !== null is false → two orphan-keyed requests could read each
    // other's jobs. `job.user_id` steht seit Migration 165 am Auftrag selbst.
    if (!job || !req.apiKey.userId || job.user_id !== req.apiKey.userId) {
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
  requireRole('admin'),
  validateBody(CreateApiKeyBody),
  asyncHandler(async (req, res) => {
    const { name, description, rate_limit_per_minute, allowed_endpoints, expires_at } = req.body;

    const result = await generateApiKey(name, description || '', req.user.id, {
      rateLimitPerMinute: rate_limit_per_minute || 60,
      allowedEndpoints: allowed_endpoints || VORGABE_ENDPUNKTE,
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
  requireRole('admin'),
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
  requireRole('admin'),
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

    // 3. Enqueue LLM job
    const userId = besitzerOderAbweisen(req.apiKey);

    const messages = [{ role: 'user', content: analysisPrompt }];
    const { jobId, model: resolvedModel } = await llmQueueService.enqueue(
      userId,
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
    const result = await waitForJobCompletion(jobId, timeoutMs, req);

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
      throw new ValidationError('schema is required, JSON schema describing desired output');
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
    const userId = besitzerOderAbweisen(req.apiKey);

    const messages = [{ role: 'user', content: structuredPrompt }];
    const { jobId, model: resolvedModel } = await llmQueueService.enqueue(
      userId,
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
    const result = await waitForJobCompletion(jobId, timeoutMs, req);

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
 * Helper: Wait for job completion with timeout.
 *
 * P4.8: when the API caller disconnects (req.on('close')), bail out of the
 * polling loop and cancel the underlying LLM job so we stop burning GPU on
 * a result nobody will read. Without this, the polling loop kept the
 * connection alive for the full 10-min timeout while the GPU job continued.
 */
async function waitForJobCompletion(jobId, timeoutMs, req) {
  const pollInterval = 500; // 500ms
  const startTime = Date.now();
  let clientGone = false;
  if (req) {
    req.on('close', () => {
      clientGone = true;
    });
  }

  while (Date.now() - startTime < timeoutMs) {
    if (clientGone) {
      // Best-effort cancel; ignore failure (job may already be done).
      llmQueueService.cancelJob(jobId).catch(() => {});
      return { error: 'Client disconnected' };
    }

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

// ────────────────────────────────────────────────────────────────────────────
// Flow-Trigger (Plan 013, B8; App-Flows seit Phase C6)
//
// Ein Flow lässt sich von außen per API-Key starten. Seit C6 gibt es dafür
// ZWEI Arten von Schlüssel, und der Schlüssel selbst entscheidet, welche
// Flows er sieht:
//
//   Schlüssel eines MENSCHEN   (`app_id IS NULL`)  die Flows der Plattform
//                                                  unter `/arasul/flows/`
//   Schlüssel einer APP        (`app_id`+`stand`)  NUR die Flows dieser App
//                                                  in diesem Stand
//
// „Nur eigene Flows" (Entscheidung Kolja vom 27.08.2026) steht deshalb nicht
// als Prüfung IN den Routen, sondern in der Auswahl der Quelle: eine App kann
// den Flow einer anderen nicht einmal benennen, weil sie in einem anderen
// Namensraum sucht. Eine Prüfung, die man vergessen kann, wäre die schlechtere
// Hälfte derselben Regel.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Der Namensraum, in dem dieser Schlüssel Flows sucht.
 *
 * `{appId: null, stand: null}` heißt: die Flows der Plattform. Beide Werte
 * sind zusammen gesetzt oder zusammen leer — die Datenbank hält das mit einer
 * CHECK-Regel fest (Migration 171).
 */
function namensraumVon(apiKey) {
  return { appId: apiKey.appId || null, stand: apiKey.stand || null };
}

/**
 * GET /api/v1/external/flows - Verfügbare Flows auflisten (Discovery für Aufrufer).
 *
 * Mit einem App-Schlüssel sind das die Flows DIESER App in DIESEM Stand, samt
 * dem Modell, das sie wirklich treibt (die Überschreibung des Administrators
 * eingerechnet). Mit dem Schlüssel eines Menschen die Flows der Plattform.
 */
router.get(
  '/flows',
  requireApiKey,
  requireEndpoint('flow:run'),
  asyncHandler(async (req, res) => {
    const { appId, stand } = namensraumVon(req.apiKey);

    if (appId) {
      const flows = await appFlows.liste({ appId, stand });
      return res.json({
        success: true,
        app: appId,
        stand,
        flows,
        timestamp: new Date().toISOString(),
      });
    }

    const zeile = f => ({
      name: f.name,
      beschreibung: f.beschreibung || '',
      argumente: (f.argumente || []).map(a => ({
        name: a.name,
        typ: a.typ,
        pflicht: a.pflicht === true,
      })),
    });

    const { flows } = await flowRegistry.listFlows();

    res.json({
      success: true,
      flows: flows.map(zeile),
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/v1/external/flows/:name/run - Einen Flow auslösen.
 *
 * Body: { args?, wait_for_result?=true, timeout_seconds?=300 }
 * Bei wait_for_result=false kommt sofort die Lauf-ID zurück; sonst wird bis zum
 * Ende (oder Timeout) gewartet und das Ergebnis mitgegeben.
 */
router.post(
  '/flows/:name/run',
  requireApiKey,
  requireEndpoint('flow:run'),
  validateBody(ExternalFlowRunBody),
  asyncHandler(async (req, res) => {
    const startTime = Date.now();
    const flowName = req.params.name;
    const args = req.body.args || {};
    const waitForResult = req.body.wait_for_result !== false;

    const userId = besitzerOderAbweisen(req.apiKey);
    const { appId, stand } = namensraumVon(req.apiKey);

    // FRÜH prüfen, solange der Request da ist: Flow existiert (→ 404) und die
    // Argumente passen (→ 400). Sonst käme der Fehler erst als toter Lauf.
    // Gesucht wird im Namensraum DIESES Schlüssels — ein App-Schlüssel findet
    // hier nur die Flows seiner eigenen App.
    const flow = appId
      ? await appFlows.lade({ appId, stand, name: flowName })
      : await flowRegistry.loadFlow(flowName);
    resolveArguments(flow.argumente, args);

    const { runId } = await flowRunner.starten({ flowName, args, userId, appId, stand });

    logger.info(
      `[External API] Flow "${flowName}"${appId ? ` von App ${appId}/${stand}` : ''} ` +
        `gestartet (Lauf ${runId}) von ${req.apiKey.name}`
    );

    if (!waitForResult) {
      return res.status(202).json({
        success: true,
        run_id: runId,
        status: 'laeuft',
        timestamp: new Date().toISOString(),
      });
    }

    const timeoutMs = Math.min((req.body.timeout_seconds || 300) * 1000, 1800000);
    const run = await waitForRunCompletion(runId, userId, timeoutMs, req, { appId, stand });

    return res.json({
      success: run.status === 'fertig',
      run_id: runId,
      status: run.status,
      result: run.result || null,
      error: run.error || null,
      steps_used: run.steps_used ?? null,
      schritte: schritteFuerApp(run),
      // Annahmen-Protokoll des Prüfschritts (Plan 014, Phase 2).
      annahmen: run.annahmen ?? null,
      processing_time_ms: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/external/flows/runs/:id - Status/Ergebnis eines Laufs abfragen.
 */
router.get(
  '/flows/runs/:id',
  requireApiKey,
  requireEndpoint('flow:run'),
  asyncHandler(async (req, res) => {
    // Kein stiller Admin-Fallback: ein verwaister Schlüssel (userId NULL) darf
    // NICHT die Läufe von Admin (1) lesen — exakt der Guard der Job-Status-Route.
    if (!req.apiKey.userId) {
      throw new NotFoundError('Lauf nicht gefunden');
    }
    const userId = req.apiKey.userId;
    const { appId, stand } = namensraumVon(req.apiKey);
    const runId = Number(req.params.id);
    if (!Number.isInteger(runId) || runId <= 0) {
      throw new ValidationError('run id must be a positive integer');
    }
    // getRun wirft NotFound bei fremd/unbekannt (eigentümer-geprüft). Ein
    // App-Schlüssel gehört dem Administrator, der die App eingespielt hat —
    // über `user_id` allein sähe die App auch dessen eigene Läufe und die
    // jeder anderen App. Deshalb zusätzlich der Namensraum.
    const run = await flowRunStore.getRun({ runId, userId, appId, stand });
    res.json({
      success: true,
      run_id: runId,
      status: run.status,
      result: run.result || null,
      error: run.error || null,
      steps_used: run.steps_used ?? null,
      // Die Kette selbst (Phase H7): `steps_used` ist ihre Laenge, `schritte`
      // ist sie. Der Kontrakt verspricht sie seit C5.
      schritte: schritteFuerApp(run),
      // Annahmen-Protokoll des Prüfschritts (Plan 014, Phase 2) — auch der
      // externe Aufrufer sieht, welche Annahmen statt Rückfragen getroffen wurden.
      annahmen: run.annahmen ?? null,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/v1/external/freigaben - Die Freigaben dieser App nachlesen.
 *
 * Eine App darf WISSEN, woran ihr Lauf haengt, aber nicht entscheiden: hier
 * gibt es nur Lesen. Bestaetigt und abgelehnt wird ueber `/api/freigabe-anfragen`
 * mit einer Sitzung -- eine App, die ihre eigene Freigabe erteilen koennte,
 * waere keine.
 *
 * Der Namensraum kommt aus dem SCHLUESSEL und nicht aus der Anfrage (dieselbe
 * Regel wie bei den Flows, C6): eine App kann die Freigaben einer anderen
 * nicht einmal benennen. Der Schluessel eines Menschen (`app_id IS NULL`)
 * findet hier deshalb gar nichts -- er gehoert zu keiner App.
 *
 * `?lauf=<id>` engt auf einen Lauf ein. Das ist die Frage, die eine App
 * wirklich stellt: „mein Lauf steht auf wartend -- worauf wartet er?"
 */
router.get(
  '/freigaben',
  requireApiKey,
  requireEndpoint('flow:run'),
  asyncHandler(async (req, res) => {
    const { appId, stand } = namensraumVon(req.apiKey);
    if (!appId) {
      throw new ForbiddenError(
        'Freigaben gehoeren einer App. Dieser Schluessel gehoert einem Menschen; ' +
          'seine offenen Freigaben stehen unter /api/freigabe-anfragen.'
      );
    }
    let lauf = null;
    if (req.query.lauf != null && req.query.lauf !== '') {
      lauf = Number(req.query.lauf);
      if (!Number.isInteger(lauf) || lauf <= 0) {
        throw new ValidationError('lauf must be a positive integer');
      }
    }
    const freigaben = await freigabeAnfragen.listeFuerApp({ appId, stand, runId: lauf });
    res.json({
      success: true,
      app: appId,
      stand,
      freigaben,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * Die Schritte eines Laufs, wie eine App sie lesen darf (Phase H7).
 *
 * DER KONTRAKT VERSPRACH SIE SEIT C5. `GET /flows/runs/:id` steht dort als
 * „Der Lauf eines Flows, mit seinen Schritten", und die Route lieferte
 * `status`, `result`, `error`, `steps_used` und `annahmen` -- keinen einzigen
 * Schritt. `steps_used` ist eine ZAHL, keine Kette, und genau diese
 * Verwechslung hat die Werkstatt am 29.08.2026 eine Anzeige gekostet: eine App
 * konnte sagen, DASS es einen Lauf gab, und nicht, was darin geschah. Ein
 * Kontrakt, der mehr zusagt als die Route haelt, ist schlimmer als einer, der
 * schweigt -- eine App wird darauf gebaut.
 *
 * DEUTSCHE NAMEN, und `schritte` neben `steps_used`: die beiden bedeuten
 * Verschiedenes, und wer sie nebeneinander liest, soll das sehen.
 *
 * Die inneren Kennungen bleiben drin: `id` und `parent_step_id` gehoeren der
 * Datenbank dieses Geraets, und eine App, die sie kennt, faengt an, mit ihnen
 * zu rechnen. Was sie braucht, ist die Reihenfolge, und die steht in
 * `position`.
 */
function schritteFuerApp(run) {
  return (run.steps || []).map(s => ({
    position: s.position,
    art: s.kind,
    name: s.name,
    status: s.status,
    modell: s.modell ?? null,
    eingabe: s.input ?? null,
    ausgabe: s.output ?? null,
    begonnen_am: s.created_at ?? null,
    beendet_am: s.finished_at ?? null,
  }));
}

/**
 * Helper: Wartet auf das Ende eines Flow-Laufs (Terminal-Status) mit Timeout.
 * Bricht ab, wenn der API-Aufrufer die Verbindung schließt — der Lauf läuft
 * serverseitig weiter (er ist losgelöst), wir hören nur auf zu warten.
 */
async function waitForRunCompletion(runId, userId, timeoutMs, req, namensraum = {}) {
  // `abgelaufen` gehoert dazu (Phase C7): niemand hat die Freigabe innerhalb
  // ihrer Frist erteilt, der Lauf ist vorbei. `wartend` gehoert NICHT dazu --
  // dort haelt der Lauf an und geht nach einer Bestaetigung weiter, und genau
  // darauf soll dieser Aufruf ja warten.
  const TERMINAL = new Set(['fertig', 'fehler', 'abgebrochen', 'abgelaufen']);
  const pollInterval = 750;
  const startTime = Date.now();
  let clientGone = false;
  if (req) {
    req.on('close', () => {
      clientGone = true;
    });
  }

  while (Date.now() - startTime < timeoutMs) {
    if (clientGone) {
      return { status: 'laeuft', error: 'Client disconnected' };
    }
    const run = await flowRunStore.getRun({
      runId,
      userId,
      appId: namensraum.appId ?? null,
      stand: namensraum.stand ?? null,
    });
    if (TERMINAL.has(run.status)) {
      return run;
    }
    await new Promise(resolve => {
      setTimeout(resolve, pollInterval);
    });
  }
  return { status: 'laeuft', error: 'Flow-Lauf hat das Zeitlimit überschritten' };
}

module.exports = router;
