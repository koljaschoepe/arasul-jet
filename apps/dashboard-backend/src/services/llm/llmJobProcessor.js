/**
 * LLM Job Processor
 * Handles chat + RAG job preparation, then delegates streaming to llmOllamaStream.
 *
 * Extracted from llmQueueService.js to reduce file size.
 * All functions receive a `ctx` object with dependencies and service references.
 */

const http = require('http');
const { streamFromOllama, onJobComplete, destroyOllamaAgent } = require('./llmOllamaStream');
const systemSettings = require('../system-settings/systemSettingsService');

/**
 * Vision auto-fallback: caption an image with a small vision model so a text-only
 * primary model can still answer questions about it.
 *
 * Returns the caption string on success, or null on any failure (caller treats
 * null as "vision skipped"). Times out at 30s — well above expected paligemma-3b
 * latency on Orin but tight enough that a hung vision call can't strand a chat.
 */
async function captionImagesWithVisionModel(visionOllamaName, images, logger) {
  const llmServiceUrl = process.env.LLM_SERVICE_URL || 'http://llm-service:11436';
  const payload = JSON.stringify({
    model: visionOllamaName,
    prompt:
      'Beschreibe das Bild faktisch und knapp auf Deutsch. Liste sichtbare Objekte, Text auf dem Bild und das Layout. Keine Spekulation über Inhalte, die nicht sichtbar sind.',
    images,
    stream: false,
    options: { temperature: 0.2, num_predict: 384 },
  });

  return new Promise(resolve => {
    let url;
    try {
      url = new URL(`${llmServiceUrl}/api/generate`);
    } catch (err) {
      logger.warn(`[vision-fallback] Bad LLM_SERVICE_URL: ${err.message}`);
      resolve(null);
      return;
    }

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 30000,
      },
      res => {
        let body = '';
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const caption = (parsed.response || '').trim();
            resolve(caption || null);
          } catch (e) {
            logger.warn(`[vision-fallback] Parse failed: ${e.message}`);
            resolve(null);
          }
        });
      }
    );
    req.on('timeout', () => {
      logger.warn('[vision-fallback] Caption request timed out at 30s');
      req.destroy();
      resolve(null);
    });
    req.on('error', err => {
      logger.warn(`[vision-fallback] HTTP error: ${err.message}`);
      resolve(null);
    });
    req.write(payload);
    req.end();
  });
}

/**
 * Find the smallest installed vision-capable model to use as auto-fallback.
 * Returns { id, ollama_name } or null if none available.
 */
async function findVisionFallbackModel(database, primaryModelId, logger) {
  try {
    const result = await database.query(
      `SELECT c.id, c.ollama_name, c.ram_required_gb
       FROM llm_model_catalog c
       JOIN llm_installed_models i ON i.id = c.id
       WHERE c.supports_vision_input = true
         AND i.status = 'available'
         AND c.id <> $1
       ORDER BY c.ram_required_gb ASC, c.id ASC
       LIMIT 1`,
      [primaryModelId || '']
    );
    if (result.rows.length === 0) {
      return null;
    }
    return result.rows[0];
  } catch (err) {
    logger.warn(`[vision-fallback] Catalog lookup failed: ${err.message}`);
    return null;
  }
}

/**
 * Process a chat job
 * @param {Object} ctx - Context with dependencies
 * @param {Object} job - The job record from database
 */
async function processChatJob(ctx, job) {
  const { database, logger } = ctx.deps;
  const service = ctx.service;

  const { id: jobId, request_data: requestData, requested_model } = job;
  const { messages, temperature, max_tokens, thinking, images } = requestData;

  // P2-001: Check if model supports thinking mode
  let modelSupportsThinking = true; // Default to true for backwards compatibility
  if (requested_model) {
    try {
      const capResult = await database.query(
        `SELECT supports_thinking FROM llm_model_catalog WHERE id = $1`,
        [requested_model]
      );
      if (capResult.rows.length > 0 && capResult.rows[0].supports_thinking !== null) {
        modelSupportsThinking = capResult.rows[0].supports_thinking;
      }
    } catch (capErr) {
      logger.debug(`Could not check model capabilities: ${capErr.message}`);
    }
  }

  // Smart Think Mode: auto-disable for trivial/simple queries to save GPU time
  const { classifyQueryComplexity } = require('./queryComplexityAnalyzer');
  const lastUserMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
  const complexity = classifyQueryComplexity(lastUserMsg);

  let enableThinking = thinking !== false && modelSupportsThinking;
  if (enableThinking && (complexity.level === 'trivial' || complexity.level === 'simple')) {
    enableThinking = false;
    logger.info(`[JOB ${jobId}] Think auto-disabled: ${complexity.level} (${complexity.reason})`);
  }

  // Notify if thinking was requested but model doesn't support it
  if (thinking !== false && !modelSupportsThinking) {
    logger.info(
      `[JOB ${jobId}] Think mode requested but model ${requested_model} doesn't support it - disabled`
    );
    service.notifySubscribers(jobId, {
      type: 'warning',
      message: `Modell "${requested_model}" unterstützt Think-Mode nicht optimal. Thinking deaktiviert.`,
      code: 'THINKING_NOT_SUPPORTED',
    });
  }

  // Build layered system prompt (global base + AI profile + company context + project prompt)
  // Skip tools section for trivial/simple queries to reduce prefill overhead
  const includeTools = complexity.level !== 'trivial' && complexity.level !== 'simple';
  const { buildSystemPrompt } = require('./systemPromptBuilder');
  const systemPrompt = await buildSystemPrompt(database, job.conversation_id, { includeTools });

  // Context Management: Build optimized prompt within token budget
  const contextBudgetManager = require('../context/contextBudgetManager');
  const optimized = await contextBudgetManager.buildOptimizedPrompt({
    messages,
    systemPrompt,
    model: requested_model,
    conversationId: job.conversation_id,
    userId: null,
  });

  logger.info(`[JOB ${jobId}] Context budget: ${JSON.stringify(optimized.tokenBreakdown)}`);

  // Send context debug info to frontend
  service.notifySubscribers(jobId, {
    type: 'context_info',
    tokenBreakdown: optimized.tokenBreakdown,
  });

  // Notify frontend about compaction if it happened
  if (optimized.compactionResult) {
    service.notifySubscribers(jobId, {
      type: 'compaction',
      tokensBefore: optimized.compactionResult.tokensBefore,
      tokensAfter: optimized.compactionResult.tokensAfter,
      messagesCompacted: optimized.tokenBreakdown.messagesDropped,
    });
  }

  const prompt = optimized.prompt;

  // Vision handling — three paths:
  //   1. Primary supports vision → images pass through unchanged.
  //   2. Primary is text-only AND a small vision model is installed → caption
  //      the image with the fallback, inject the caption as a system-prompt
  //      addendum, and continue streaming the primary with no images.
  //   3. Primary is text-only AND no fallback installed → warn, drop images.
  let visionImages = null;
  let augmentedSystemPrompt = optimized.systemPrompt;

  if (images && Array.isArray(images) && images.length > 0) {
    let supportsVision = false;
    try {
      const visionResult = await database.query(
        `SELECT supports_vision_input FROM llm_model_catalog WHERE id = $1`,
        [requested_model]
      );
      supportsVision = visionResult.rows[0]?.supports_vision_input === true;
    } catch (visionErr) {
      logger.debug(`[JOB ${jobId}] vision capability lookup failed: ${visionErr.message}`);
    }

    if (supportsVision) {
      visionImages = images;
      logger.info(`[JOB ${jobId}] Vision mode: ${images.length} image(s) attached`);
    } else {
      const fallback = await findVisionFallbackModel(database, requested_model, logger);
      if (!fallback) {
        logger.info(
          `[JOB ${jobId}] No vision fallback installed; primary ${requested_model} is text-only — dropping ${images.length} image(s)`
        );
        service.notifySubscribers(jobId, {
          type: 'warning',
          message: `Modell "${requested_model}" unterstützt keine Bilder, und kein Vision-Modell ist installiert. Bilder wurden ignoriert.`,
          code: 'NO_VISION_FALLBACK_AVAILABLE',
        });
      } else {
        logger.info(
          `[JOB ${jobId}] Vision auto-fallback via ${fallback.id} (ollama_name=${fallback.ollama_name}) for ${images.length} image(s)`
        );
        service.notifySubscribers(jobId, {
          type: 'status',
          message: `Bild wird analysiert via ${fallback.id} …`,
          code: 'VISION_PROCESSING',
          vision_via: fallback.id,
        });

        const caption = await captionImagesWithVisionModel(
          fallback.ollama_name || fallback.id,
          images,
          logger
        );

        if (caption) {
          augmentedSystemPrompt =
            (augmentedSystemPrompt ? augmentedSystemPrompt + '\n\n' : '') +
            `[Bild-Kontext (vom Vision-Modell ${fallback.id} extrahiert)]\n${caption}`;
          service.notifySubscribers(jobId, {
            type: 'warning',
            message: `Bild wurde von ${fallback.id} analysiert; Primärmodell "${requested_model}" antwortet mit dieser Beschreibung als Kontext.`,
            code: 'VISION_FALLBACK_ACTIVE',
            vision_via: fallback.id,
          });
        } else {
          logger.warn(
            `[JOB ${jobId}] Vision fallback ${fallback.id} returned no caption — dropping images`
          );
          service.notifySubscribers(jobId, {
            type: 'warning',
            message: `Vision-Fallback (${fallback.id}) konnte das Bild nicht analysieren. Antwort erfolgt ohne Bildkontext.`,
            code: 'VISION_FALLBACK_SKIPPED',
          });
        }
      }
    }
  }

  await streamFromOllama(
    ctx,
    jobId,
    prompt,
    enableThinking,
    temperature,
    max_tokens,
    requested_model,
    augmentedSystemPrompt,
    optimized.numCtx,
    visionImages
  );
}

/**
 * RAG system prompt (RAG 4.0: three-tier anti-hallucination).
 * The three modes (noRelevantDocs / marginalResults / default) and their marker
 * sentences are load-bearing — tests assert the mode selection, and the markers
 * tell the user which confidence tier produced the answer. Do not merge modes.
 * Pure function, exported for regression tests.
 */
function buildRagSystemPrompt({ noRelevantDocs = false, marginalResults = false } = {}) {
  let ragRules;
  if (noRelevantDocs) {
    // Mode 3: No relevant documents found at all
    ragRules = `Regeln:
1. Es wurden keine relevanten Dokumente in der Wissensbasis gefunden.
2. Beginne deine Antwort IMMER mit: "**Hinweis:** Keine relevanten Dokumente gefunden. Die folgende Antwort basiert auf allgemeinem Wissen und nicht auf Unternehmensdokumenten."
3. Danach darfst du die Frage aus allgemeinem Wissen beantworten — kennzeichne Unsicherheiten ausdrücklich.
4. Erfinde KEINE Fakten, Zahlen, Preise oder spezifische Unternehmensinformationen. Nenne keine Quellenangaben wie [1], da keine Dokumente vorliegen.
5. Strukturiere längere Antworten mit Absätzen oder Aufzählungen.
6. Antworte auf Deutsch, es sei denn die Frage ist in einer anderen Sprache gestellt.`;
  } else if (marginalResults) {
    // Mode 2: Only marginal/low-confidence documents found
    ragRules = `Regeln:
1. WICHTIG: Die folgenden Dokumente haben nur GERINGE Übereinstimmung mit der Frage. Behandle sie mit Vorsicht.
2. Wenn du die Antwort in den Dokumenten findest, belege jede Aussage mit der Quellenangabe [1], [2] etc. direkt hinter der Aussage.
3. Wenn die Dokumente die Frage NICHT beantworten, sage klar: "Die Wissensbasis enthält keine ausreichend relevante Information zu dieser Frage." Rate nicht.
4. Erfinde KEINE Informationen, die nicht wörtlich oder sinngemäß in den Dokumenten stehen, und ergänze KEINE Fakten, Zahlen oder Details aus eigenem Wissen.
5. Strukturiere längere Antworten mit Absätzen oder Aufzählungen.
6. Antworte auf Deutsch, es sei denn die Frage ist in einer anderen Sprache gestellt.`;
  } else {
    // Mode 1: High-confidence relevant documents found
    ragRules = `Regeln:
1. Antworte AUSSCHLIESSLICH auf Basis der bereitgestellten Dokumente.
2. Belege jede Aussage mit der Quellenangabe [1], [2] etc. direkt hinter der Aussage.
3. Die Quellennummer MUSS dem Dokument entsprechen, aus dem die Information tatsächlich stammt. Verwechsle KEINE Quellen.
4. Wenn die Antwort nicht in den Dokumenten zu finden ist, sage das klar und deutlich. Erfinde NICHTS.
5. Verwende die Fachbegriffe aus den Dokumenten und halte dich kurz und präzise.
6. Strukturiere längere Antworten mit Absätzen oder Aufzählungen.
7. Antworte auf Deutsch, es sei denn die Frage ist in einer anderen Sprache gestellt.`;
  }

  return `Du bist ein professioneller Wissensassistent für ein Unternehmen. Du beantwortest Fragen auf Basis der internen Wissensbasis.

${ragRules}`;
}

/**
 * Process a RAG job with German citation-aware prompt
 * @param {Object} ctx - Context with dependencies
 * @param {Object} job - The job record from database
 */
async function processRAGJob(ctx, job) {
  const { logger, llmJobService } = ctx.deps;
  const service = ctx.service;

  const { id: jobId, request_data: requestData, requested_model } = job;
  const { query, context, thinking, sources, matchedSpaces, noRelevantDocs, marginalResults } =
    requestData;
  const enableThinking = thinking !== false;

  const ragSystemPrompt = buildRagSystemPrompt({ noRelevantDocs, marginalResults });

  // Context Management: Truncate RAG context to fit within token budget
  const { estimateTokens, truncateToTokens } = require('../core/tokenService');
  const modelContextService = require('../context/modelContextService');
  const budget = await modelContextService.getTokenBudget(requested_model);

  let truncatedContext = context;
  let contextWasTruncated = false;
  const ragTokens = estimateTokens(context);
  if (ragTokens > budget.maxRagTokens) {
    logger.warn(
      `[JOB ${jobId}] RAG context exceeds budget: ${ragTokens} > ${budget.maxRagTokens} tokens, truncating`
    );
    truncatedContext = truncateToTokens(context, budget.maxRagTokens);
    truncatedContext +=
      '\n\n[Hinweis: Der Dokumentenkontext wurde aus Platzgruenden gekuerzt. Einige Dokumente sind moeglicherweise unvollstaendig. Beantworte die Frage nur auf Basis der sichtbaren Informationen.]';
    contextWasTruncated = true;
  }

  // Build optimized prompt with truncated RAG context
  const contextBudgetManager = require('../context/contextBudgetManager');
  const optimized = await contextBudgetManager.buildOptimizedPrompt({
    messages: [{ role: 'user', content: query }],
    systemPrompt: ragSystemPrompt,
    model: requested_model,
    conversationId: job.conversation_id,
    ragContext: truncatedContext,
    userId: null,
  });

  logger.info(`[JOB ${jobId}] RAG context budget: ${JSON.stringify(optimized.tokenBreakdown)}`);

  // Send context debug info to frontend
  service.notifySubscribers(jobId, {
    type: 'context_info',
    tokenBreakdown: optimized.tokenBreakdown,
    contextTruncated: contextWasTruncated,
    marginalResults: !!marginalResults,
  });

  const prompt = `${ragSystemPrompt}\n\n${truncatedContext}\n\nFrage: ${query}`;

  // Store sources and matched spaces in job (don't notify - rag.js already sent sources event)
  if (sources || matchedSpaces) {
    await llmJobService.updateJobContent(jobId, null, null, sources || null, matchedSpaces || null);
  }

  await streamFromOllama(
    ctx,
    jobId,
    prompt,
    enableThinking,
    // Low temperature keeps RAG answers faithful to sources; DB-tunable since 096.
    systemSettings.getNumber('rag_temperature', 0.2),
    systemSettings.getNumber('rag_num_predict', 2048),
    requested_model,
    '',
    optimized.numCtx
  );
}

module.exports = {
  processChatJob,
  processRAGJob,
  buildRagSystemPrompt,
  streamFromOllama,
  onJobComplete,
  destroyOllamaAgent,
};
