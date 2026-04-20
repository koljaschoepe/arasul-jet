/**
 * LLM Job Processor
 * Handles chat + RAG job preparation, then delegates streaming to llmOllamaStream.
 *
 * Extracted from llmQueueService.js to reduce file size.
 * All functions receive a `ctx` object with dependencies and service references.
 */

const { streamFromOllama, onJobComplete, destroyOllamaAgent } = require('./llmOllamaStream');

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

  // Check if model supports vision and images are provided
  let visionImages = null;
  if (images && Array.isArray(images) && images.length > 0) {
    try {
      const visionResult = await database.query(
        `SELECT supports_vision_input FROM llm_model_catalog WHERE id = $1`,
        [requested_model]
      );
      const supportsVision = visionResult.rows[0]?.supports_vision_input === true;
      if (supportsVision) {
        visionImages = images;
        logger.info(`[JOB ${jobId}] Vision mode: ${images.length} image(s) attached`);
      } else {
        logger.info(
          `[JOB ${jobId}] Images provided but model ${requested_model} doesn't support vision - ignoring`
        );
        service.notifySubscribers(jobId, {
          type: 'warning',
          message: `Modell "${requested_model}" unterstützt keine Bildverarbeitung. Bilder werden ignoriert.`,
          code: 'VISION_NOT_SUPPORTED',
        });
      }
    } catch (visionErr) {
      logger.debug(`Could not check vision capability: ${visionErr.message}`);
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
    optimized.systemPrompt,
    optimized.numCtx,
    visionImages
  );
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

  // German system prompt with citation rules (RAG 4.0: three-tier anti-hallucination)
  let ragRules;
  if (noRelevantDocs) {
    // Mode 3: No relevant documents found at all
    ragRules = `Regeln:
1. Es wurden keine relevanten Dokumente in der Wissensbasis gefunden.
2. Sage klar: "In der Wissensbasis wurden keine relevanten Dokumente zu dieser Frage gefunden."
3. Du darfst die Frage aus allgemeinem Wissen beantworten, ABER kennzeichne dies DEUTLICH als allgemeines Wissen, nicht als Unternehmensinfo.
4. Beginne deine Antwort IMMER mit: "**Hinweis:** Keine relevanten Dokumente gefunden. Die folgende Antwort basiert auf allgemeinem Wissen und nicht auf Unternehmensdokumenten."
5. Erfinde KEINE Fakten, Zahlen, Preise oder spezifische Unternehmensinformationen.
6. Strukturiere laengere Antworten mit Absaetzen oder Aufzaehlungen.
7. Antworte auf Deutsch, es sei denn die Frage ist auf Englisch gestellt.`;
  } else if (marginalResults) {
    // Mode 2: Only marginal/low-confidence documents found
    ragRules = `Regeln:
1. WICHTIG: Die folgenden Dokumente haben nur GERINGE Uebereinstimmung mit der Frage. Behandle sie mit Vorsicht.
2. Wenn du die Antwort in den Dokumenten findest, zitiere sie mit [1], [2] etc.
3. Wenn die Dokumente die Frage NICHT beantworten, sage klar: "Die Wissensbasis enthaelt keine ausreichend relevante Information zu dieser Frage."
4. Erfinde KEINE Informationen, die nicht woertlich oder sinngemaess in den Dokumenten stehen.
5. Ergaenze KEINE Fakten, Zahlen oder Details aus eigenem Wissen — nur was in den Dokumenten steht.
6. Strukturiere laengere Antworten mit Absaetzen oder Aufzaehlungen.
7. Antworte auf Deutsch, es sei denn die Frage ist auf Englisch gestellt.`;
  } else {
    // Mode 1: High-confidence relevant documents found
    ragRules = `Regeln:
1. Antworte AUSSCHLIESSLICH auf Basis der bereitgestellten Dokumente.
2. Jede Aussage MUSS mit der KORREKTEN Quellenangabe [1], [2] etc. belegt sein.
3. Die Quellennummer MUSS dem Dokument entsprechen, aus dem die Information tatsaechlich stammt. Verwechsle KEINE Quellen.
4. Wenn die Antwort nicht in den Dokumenten zu finden ist, sage das klar und deutlich. Erfinde NICHTS.
5. Verwende Fachbegriffe aus den Dokumenten.
6. Strukturiere laengere Antworten mit Absaetzen oder Aufzaehlungen.
7. Halte dich kurz und praezise. Antworte auf Deutsch, es sei denn die Frage ist auf Englisch gestellt.`;
  }

  const ragSystemPrompt = `Du bist ein professioneller Wissensassistent fuer ein Unternehmen.

${ragRules}`;

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
    0.2,
    2048,
    requested_model,
    '',
    optimized.numCtx
  );
}

module.exports = {
  processChatJob,
  processRAGJob,
  streamFromOllama,
  onJobComplete,
  destroyOllamaAgent,
};
