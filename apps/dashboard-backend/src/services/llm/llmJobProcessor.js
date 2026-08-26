/**
 * LLM Job Processor
 * Handles chat job preparation, then delegates streaming to llmOllamaStream.
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
        // Derselbe Agent wie ueberall zum Modelldienst (siehe ollamaAgent.js);
        // das kurze Zeitlimit hier ist gewollt, es ist nur ein Rueckfall.
        agent: require('./ollamaAgent').ollamaAgent,
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
 * Das installierte Modell finden, das ein Bild lesen soll.
 *
 * Bis zum 21.08.2026 entschied allein `supports_vision_input`, und das war zu
 * eng: `llava-phi3` traegt `model_type = 'vision'`, aber die Spalte steht auf
 * false, also fiel es heraus, obwohl Ollama ihm die Faehigkeit `vision`
 * bescheinigt. Auf dem Orin blieb dadurch GENAU EIN Bewerber uebrig,
 * `gemma4:e4b-q4`, und der wird ausgeschlossen, sobald er selbst das
 * Chatmodell ist. Dann gab es fuer ein Foto gar nichts.
 *
 * Seit Migration 151 sagt `task = 'vision'`, wofuer ein Modell vorgesehen ist,
 * und `is_task_default`, welches davon voreingestellt ist. Die Rangfolge:
 * erst der Standard der Aufgabe, dann das kleinste Modell der Aufgabe, dann
 * das kleinste mit der alten Faehigkeitsspalte. Der letzte Schritt bleibt,
 * damit ein Geraet, dessen Katalog noch keine Aufgaben traegt, nicht schlechter
 * dasteht als vorher.
 *
 * Returns { id, ollama_name } or null if none available.
 */
async function findVisionFallbackModel(database, primaryModelId, logger) {
  try {
    const result = await database.query(
      `SELECT c.id, c.ollama_name, c.ram_required_gb
       FROM llm_model_catalog c
       JOIN llm_installed_models i ON i.id = c.id
       WHERE i.status = 'available'
         AND c.id <> $1
         AND (c.task = 'vision' OR c.supports_vision_input = true)
       ORDER BY (c.task = 'vision' AND c.is_task_default) DESC,
                (c.task = 'vision') DESC,
                c.ram_required_gb ASC,
                c.id ASC
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

  // Plan 023 D9: ein externes Cloud-Modell rechnet nicht auf diesem Gerät.
  // Die Abzweigung steht GANZ vorn, vor allem, was Speicher, GPU-Sperre oder
  // Lebenszyklus anfasst: nichts davon gilt für ein Modell, das anderswo läuft.
  const { istExtern } = require('./extern/providerRegistry');
  if (istExtern(requested_model)) {
    const { externenChatFahren } = require('./extern/externerChat');
    const { buildSystemPrompt: baueSystemPrompt } = require('./systemPromptBuilder');
    const externerSystemPrompt = await baueSystemPrompt();
    await externenChatFahren(ctx, job, {
      nachrichten: (messages || []).filter(m => m && m.role !== 'system'),
      systemPrompt: externerSystemPrompt,
      temperatur: temperature,
      maxTokens: max_tokens,
    });
    return;
  }

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

  const { buildSystemPrompt } = require('./systemPromptBuilder');
  const systemPrompt = await buildSystemPrompt();

  // Der Verlauf geht als Ganzes an das Modell. Bis Phase B4 (26.08.2026)
  // stand hier ein Kontext-Haushalt mit Fensterung und Verdichtung
  // (compaction_log); er ist mit dem Memory gefallen. Was ueber `num_ctx`
  // hinausgeht, kuerzt Ollama selbst am Anfang des Prompts.
  const prompt = (messages || [])
    .filter(m => m && m.role !== 'system')
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  // Vision handling — three paths:
  //   1. Primary supports vision → images pass through unchanged.
  //   2. Primary is text-only AND a small vision model is installed → caption
  //      the image with the fallback, inject the caption as a system-prompt
  //      addendum, and continue streaming the primary with no images.
  //   3. Primary is text-only AND no fallback installed → warn, drop images.
  let visionImages = null;
  let augmentedSystemPrompt = systemPrompt;

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
          `[JOB ${jobId}] No vision fallback installed; primary ${requested_model} is text-only, dropping ${images.length} image(s)`
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
            `[JOB ${jobId}] Vision fallback ${fallback.id} returned no caption, dropping images`
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

  // Hinweis: streamFromOllama hält die gemeinsame GPU-Sperre (gpuQueue) für die
  // Dauer des Streams — kann also kurz auf einen laufenden Flow-Modell-Aufruf
  // warten (Plan 011, Schritt 10).
  await streamFromOllama(
    ctx,
    jobId,
    prompt,
    enableThinking,
    temperature,
    max_tokens,
    requested_model,
    augmentedSystemPrompt,
    null,
    visionImages
  );
}

module.exports = {
  processChatJob,
  streamFromOllama,
  onJobComplete,
  destroyOllamaAgent,
  // Plan 023 D5: die Abfrage, die entscheidet, welches Modell ein Bild liest.
  // Der Plan nennt sie als Abnahmekriterium, also gehoert sie unter Test.
  findVisionFallbackModel,
};
