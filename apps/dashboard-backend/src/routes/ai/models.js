/**
 * LLM Models API Routes
 * Dynamic model management for Jetson AGX Orin
 *
 * Endpoints:
 * - GET  /api/models/catalog     - Get curated model catalog
 * - GET  /api/models/installed   - Get installed models
 * - GET  /api/models/status      - Get current status (loaded, queue)
 * - GET  /api/models/loaded      - Get currently loaded model
 * - GET  /api/models/verwaltung  - Zeilen der Verwaltung: Faehigkeiten, warm, Flows, Sperre
 * - POST /api/models/pruefen     - Passt ein Modell auf das Geraet (Speicher, Platte)?
 * - POST /api/models/download    - Download model with SSE progress
 * - DELETE /api/models/:modelId  - Delete a model
 * - GET  /api/models/recommended  - Get recommended model for device profile
 * - POST /api/models/default     - Set default model
 * - GET  /api/models/default     - Get default model
 * - POST /api/models/sync        - Sync with Ollama
 *
 * Laden und Entladen von Hand gibt es seit M5 (04.10.2026, Verwaltung Modelle)
 * nicht mehr: `/:id/load`, `/unload`, `/activate` und `/deactivate` sind weg.
 * Das Geraet haelt ein Modell nach Nutzung (`modelLifecycleService`) und laedt
 * es bei Bedarf selbst; die Flow-Laeufe und der Abgleich rufen
 * `modelService.activateModel` weiter direkt.
 *
 * Was hier NICHT mehr steht (Phase C8, 27.08.2026): `POST /quelle/pruefen`,
 * `POST /katalog` und `DELETE /katalog/*`. Ueber sie konnte ein Administrator
 * ein beliebiges Modell von HuggingFace in den Katalog holen und danach laden.
 * Seit der Kurzliste (`config/modelle/kurzliste.json`, Migration 175) war der
 * Katalog eine Zusage ueber vier gemessene Modelle.
 *
 * SEIT J4 (30.09.2026) IST `POST /download` WIEDER OFFEN, und zwar anders als
 * vor C8: jede Kennung aus der Ollama-Bibliothek und von Hugging Face ist
 * ladbar, aber die Kurzliste bleibt als gemessen markiert und alles andere
 * traegt `jetson_tested: false` ("ungemessen"). Das Geraet prueft vorher die
 * Groesse gegen das Speicherbudget und weist mit Grund ab
 * (`services/llm/freiesModell.js`). Die Umkehr gilt fuer den Katalog, nicht
 * fuer die Vorgabe: der Standard der Flows bleibt ein gemessenes Modell.
 */

const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../middleware/auth');
const modelService = require('../../services/llm/modelService');
const logger = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody } = require('../../middleware/validate');
const { DownloadBody, DefaultModelBody, PruefenBody } = require('../../schemas/models');
const { NotFoundError, ValidationError } = require('../../utils/errors');
const { initSSE, trackConnection } = require('../../utils/sseHelper');
const { cacheService, cacheMiddleware } = require('../../services/core/cacheService');
const { getLlmRamGB } = require('../../utils/hardware');
const externeModelle = require('../../services/llm/extern/externeModelle');
const freiesModell = require('../../services/llm/freiesModell');
const modellVerwaltung = require('../../services/llm/modellVerwaltung');

// Cache keys
const CACHE_KEYS = {
  CATALOG: 'models:catalog',
  INSTALLED: 'models:installed',
  STATUS: 'models:status',
  DEFAULT: 'models:default',
};

// Cache TTLs (in milliseconds)
const CACHE_TTLS = {
  CATALOG: 30000, // 30 seconds - changes rarely
  INSTALLED: 15000, // 15 seconds
  STATUS: 5000, // 5 seconds - changes more frequently
  DEFAULT: 60000, // 60 seconds - changes rarely
};

/**
 * GET /api/models/catalog
 * Get curated model catalog with installation status
 * Cached for 30 seconds to reduce database load
 */
router.get(
  '/catalog',
  requireAuth,
  requireRole('admin'),
  cacheMiddleware(CACHE_KEYS.CATALOG, CACHE_TTLS.CATALOG),
  asyncHandler(async (req, res) => {
    logger.debug(
      `[Models] Catalog request - Host: ${req.headers.host}, Origin: ${req.headers.origin || 'same-origin'}, IP: ${req.ip}`
    );

    const catalog = await modelService.getCatalog();

    logger.debug(`[Models] Catalog response - total: ${catalog.length} models`);
    res.json({
      models: catalog,
      total: catalog.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/models/installed
 * Get installed models only
 * Cached for 15 seconds
 */
router.get(
  '/installed',
  requireAuth,
  requireRole('admin'),
  cacheMiddleware(CACHE_KEYS.INSTALLED, CACHE_TTLS.INSTALLED),
  asyncHandler(async (req, res) => {
    const models = await modelService.getInstalledModels();
    // Plan 023 D9: externe Modelle stehen in derselben Liste, sonst müsste
    // jede Modellauswahl im Produkt zwei Quellen kennen. Sie tragen
    // `extern: true` und sind daran erkennbar. Ist kein Anbieter
    // eingeschaltet, kommt hier nichts dazu, und zwar von selbst: ohne
    // Schlüssel gibt es niemanden, den man nach Modellen fragen könnte.
    const externe = await externeModelle.modelleListen();
    res.json({
      models: [...models, ...externe],
      total: models.length + externe.length,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/models/status
 * Get current model status (loaded model, queue stats)
 * Cached for 5 seconds (short TTL as status can change)
 */
router.get(
  '/status',
  requireAuth,
  requireRole('admin'),
  cacheMiddleware(CACHE_KEYS.STATUS, CACHE_TTLS.STATUS),
  asyncHandler(async (req, res) => {
    logger.debug(
      `[Models] Status request - Host: ${req.headers.host}, Origin: ${req.headers.origin || 'same-origin'}, IP: ${req.ip}`
    );

    const status = await modelService.getStatus();

    logger.debug(
      `[Models] Status response - loaded_model: ${status.loaded_model ? status.loaded_model.model_id : 'null'}`
    );
    res.json(status);
  })
);

/**
 * GET /api/models/loaded
 * Get all currently loaded models (multi-model support)
 */
router.get(
  '/loaded',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const loadedModels = await modelService.getLoadedModels();
    // Backwards-compatible: also include single loaded_model for existing consumers
    res.json({
      loaded_model: loadedModels.length > 0 ? loadedModels[0] : null,
      loaded_models: loadedModels,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/models/lifecycle
 * Get adaptive lifecycle status (phase, keep-alive, usage profile)
 */
router.get(
  '/lifecycle',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const modelLifecycleService = require('../../services/llm/modelLifecycleService');
    const status = await modelLifecycleService.getLifecycleStatus();
    res.json(status);
  })
);

/**
 * GET /api/models/memory-budget
 * Get memory budget status (total, used, available, loaded models)
 */
router.get(
  '/memory-budget',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const budget = await modelService.getMemoryBudget();
    res.json(budget);
  })
);

/**
 * GET /api/models/verwaltung
 * Die Zeilen der Verwaltung: je installiertem Modell Faehigkeiten, warm, die
 * nutzenden Flows und der Grund einer Sperre; dazu die geprueften Modelle der
 * Liste, die noch nicht am Geraet liegen, mit dem Ergebnis der Vorpruefung.
 */
router.get(
  '/verwaltung',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    res.json({ ...(await modellVerwaltung.uebersicht()), timestamp: new Date().toISOString() });
  })
);

/**
 * POST /api/models/pruefen
 * Passt ein Modell auf dieses Geraet? Prueft Speicher und Platte, ohne etwas
 * anzulegen oder zu laden. `passt: false` kommt mit `grund` in zwei Saetzen.
 */
router.post(
  '/pruefen',
  requireAuth,
  requireRole('admin'),
  validateBody(PruefenBody),
  asyncHandler(async (req, res) => {
    res.json(await freiesModell.pruefe(req.body.model_id));
  })
);

/**
 * POST /api/models/download
 * Download a model with SSE progress streaming
 * Note: Inner try-catch retained for SSE streaming error handling
 *
 * Fixes applied:
 * - DL-001: Heartbeat every 10s to keep connection alive during slow manifest fetches
 * - DL-002: Duplicate download check - returns current progress if already downloading
 * - DL-003: Client disconnect detection to abort server-side download
 */
router.post(
  '/download',
  requireAuth,
  requireRole('admin'),
  validateBody(DownloadBody),
  asyncHandler(async (req, res) => {
    // J4: eine Kennung ausserhalb der Kurzliste wird hier, VOR dem Strom,
    // geprueft (gibt es sie, wie gross ist sie, passt sie in den Speicher) und
    // erst dann in den Katalog aufgenommen. Eine Abweisung ist deshalb eine
    // gewoehnliche JSON-Antwort mit Grund und kein halber Ereignisstrom.
    const vorbereitet = await freiesModell.vorbereiten(req.body.model_id);
    const model_id = vorbereitet.modelId;

    // Check if model exists in catalog
    const modelInfo = await modelService.getModelInfo(model_id);
    if (!modelInfo) {
      throw new NotFoundError(`Modell ${model_id} nicht im Katalog gefunden`);
    }

    // OCR-Engines (Tesseract/PaddleOCR) sind keine Ollama-Modelle — sie werden
    // vom Dokument-Indexer verwaltet. Ein Ollama-Pull scheiterte hier immer mit
    // „not found" und schrieb einen dauerhaften „Fehler"-Status in den Katalog.
    // Sauber ablehnen, statt einen unmöglichen Download zu starten.
    if (modelInfo.model_type === 'ocr') {
      throw new ValidationError(
        'OCR-Engines (Tesseract/PaddleOCR) werden vom Dokument-Indexer verwaltet und nicht über Ollama geladen.'
      );
    }

    // DL-002: Check if model is already downloading or installed
    if (modelInfo.install_status === 'downloading') {
      // Already downloading - return current progress via SSE and close
      initSSE(res);
      res.write(
        `data: ${JSON.stringify({
          status: 'already_downloading',
          model_id,
          progress: modelInfo.download_progress || 0,
          message: 'Download läuft bereits',
        })}\n\n`
      );
      res.end();
      return;
    }

    if (modelInfo.install_status === 'available') {
      initSSE(res);
      res.write(
        `data: ${JSON.stringify({
          status: 'already_installed',
          model_id,
          progress: 100,
          done: true,
          success: true,
          message: 'Modell ist bereits installiert',
        })}\n\n`
      );
      res.end();
      return;
    }

    // RAM validation: warn if model size exceeds LLM RAM allocation
    if (modelInfo.size_bytes) {
      const modelSizeGB = modelInfo.size_bytes / (1024 * 1024 * 1024);
      const llmRamGB = getLlmRamGB();

      if (!isNaN(llmRamGB) && modelSizeGB > llmRamGB) {
        initSSE(res);
        res.write(
          `data: ${JSON.stringify({
            status: 'ram_warning',
            model_id,
            modelSizeGB: Math.round(modelSizeGB),
            llmRamGB,
            message: `Modell benötigt ~${Math.round(modelSizeGB)}GB RAM, aber nur ${llmRamGB}GB für LLM verfügbar. Das Modell kann möglicherweise nicht geladen werden.`,
            proceed: true,
          })}\n\n`
        );
      }
    }

    // Set up SSE for progress
    initSSE(res);

    // DL-003: Track client connection + abort controller for cancellation
    const connection = trackConnection(res);
    const abortController = new AbortController();

    // Abort Ollama pull when client disconnects
    connection.onClose(() => {
      logger.info(`[Download] Client disconnected during ${model_id} download - aborting pull`);
      abortController.abort();
    });

    // Send initial event
    res.write(
      `data: ${JSON.stringify({
        status: 'starting',
        model_id,
        progress: 0,
        gemessen: vorbereitet.gemessen,
        digest_vorab: vorbereitet.digestVorab,
      })}\n\n`
    );

    // DL-001: Heartbeat to keep connection alive during slow Ollama manifest fetches
    const heartbeatInterval = setInterval(() => {
      if (connection.isConnected()) {
        try {
          res.write(`:heartbeat\n\n`);
        } catch {
          // connection lost - trackConnection handles state
        }
      }
    }, 10000);

    try {
      await modelService.downloadModel(
        model_id,
        (progress, status, bytes) => {
          if (connection.isConnected()) {
            try {
              // Plan 023 D3: die Bytes gehen mit. Ein Prozentwert allein sagt
              // nicht, ob die naechste Minute oder die naechste Stunde gemeint
              // ist, und bei einem 16-GB-Modell ist das der Unterschied.
              res.write(
                `data: ${JSON.stringify({
                  progress,
                  status,
                  model_id,
                  bytes_completed: bytes?.completed ?? null,
                  bytes_total: bytes?.total ?? null,
                })}\n\n`
              );
            } catch {
              // connection lost - trackConnection handles state
            }
          }
        },
        { signal: abortController.signal }
      );

      // Invalidate model caches after successful download
      cacheService.invalidatePattern('models:*');

      if (connection.isConnected()) {
        res.write(`data: ${JSON.stringify({ done: true, success: true, model_id })}\n\n`);
      }
    } catch (error) {
      const isAborted =
        error.name === 'AbortError' ||
        error.name === 'CanceledError' ||
        abortController.signal.aborted;
      if (isAborted) {
        logger.info(`[Download] Model ${model_id} download aborted (client disconnected)`);
      } else {
        logger.error(`Error downloading model ${model_id}: ${error.message}`);
      }
      // Ein frei gewaehltes Modell, das nicht ankam, hinterlaesst keine Zeile:
      // der Katalog fuehrt nur, was am Geraet liegt oder liegen soll.
      if (vorbereitet.neu) {
        await freiesModell.nachFehlschlag(model_id);
        cacheService.invalidatePattern('models:*');
      }
      if (connection.isConnected()) {
        res.write(
          `data: ${JSON.stringify({ error: isAborted ? 'Download abgebrochen' : error.message, done: true, model_id })}\n\n`
        );
      }
    } finally {
      clearInterval(heartbeatInterval);
      if (connection.isConnected()) {
        res.end();
      }
    }
  })
);

/**
 * DELETE /api/models/:modelId
 * Delete a model
 */
router.delete(
  '/:modelId',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;

    const result = await modelService.deleteModel(modelId);

    // Invalidate model caches after deletion
    cacheService.invalidatePattern('models:*');

    res.json({
      ...result,
      message: `Modell ${modelId} wurde gelöscht`,
    });
  })
);

/**
 * GET /api/models/recommended
 * Get recommended model for this device based on hardware profile
 * Used by Setup Wizard to pre-select the optimal model
 */
router.get(
  '/recommended',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { getRecommendedModel } = require('../../utils/hardware');
    const recommendation = await getRecommendedModel();

    res.json({
      recommended_model: recommendation.model,
      recommended_models: recommendation.models,
      // P9: tier-aware companions for Setup auto-pull. Setup-Wizard can pull
      // all four to give the user a Fast/Balanced/Quality experience out of the
      // box, with a small vision model ready for the auto-vision-fallback (P6).
      recommended_fast_model: recommendation.fast_model || null,
      recommended_vision_model: recommendation.vision_model || null,
      recommended_embedding_model: recommendation.embedding_model || null,
      device_profile: recommendation.profile,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/models/default
 * Das Standardmodell setzen: damit rechnet ein Flow, der im Frontmatter
 * keines nennt (C6). Den Chat der Oberflaeche gibt es seit B6 nicht mehr.
 */
router.post(
  '/default',
  requireAuth,
  requireRole('admin'),
  validateBody(DefaultModelBody),
  asyncHandler(async (req, res) => {
    const { model_id } = req.body;

    // Check if model is installed
    const isInstalled = await modelService.isModelInstalled(model_id);
    if (!isInstalled) {
      throw new NotFoundError(`Modell ${model_id} ist nicht installiert`);
    }

    // Ein Bild- oder Einbettungsmodell kann den Standard der Flows nicht
    // ausfuellen: es beantwortet keinen Prompt mit Werkzeugen. Die Ansicht
    // bietet den Knopf dafuer gar nicht erst an (`ModellZeile`); dass es
    // trotzdem hier steht, ist dieselbe Regel wie ueberall -- die Oberflaeche
    // blendet aus, das Backend entscheidet. Fund der D5-Abnahme am Orin.
    const database = require('../../database');
    const { rows } = await database.query('SELECT task FROM llm_model_catalog WHERE id = $1', [
      model_id,
    ]);
    const aufgabe = rows[0]?.task ?? null;
    if (aufgabe && aufgabe !== 'text' && aufgabe !== 'coding') {
      throw new ValidationError(
        `${model_id} ist für die Aufgabe "${aufgabe}" vorgesehen und kann nicht der Standard der Flows sein`
      );
    }

    const result = await modelService.setDefaultModel(model_id);

    // Invalidate default model cache
    cacheService.invalidate(CACHE_KEYS.DEFAULT);

    res.json({
      ...result,
      message: `${model_id} ist jetzt das Standard-Modell`,
    });
  })
);

/**
 * GET /api/models/default
 * Get default model
 * Cached for 60 seconds (changes rarely)
 */
router.get(
  '/default',
  requireAuth,
  requireRole('admin'),
  cacheMiddleware(CACHE_KEYS.DEFAULT, CACHE_TTLS.DEFAULT),
  asyncHandler(async (req, res) => {
    const defaultModel = await modelService.getDefaultModel();
    res.json({
      default_model: defaultModel,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/models/sync
 * Sync installed models with Ollama
 */
router.post(
  '/sync',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const result = await modelService.syncWithOllama();

    // Invalidate all model caches after sync
    cacheService.invalidatePattern('models:*');

    res.json({
      ...result,
      message: 'Modell-Synchronisation abgeschlossen',
    });
  })
);

/**
 * GET /api/models/:modelId/capabilities
 * Get capabilities for a specific model (unified capability detection)
 * Used by frontend to dynamically show/hide UI features per model.
 */
router.get(
  '/:modelId/capabilities',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;
    const db = require('../../database');

    const result = await db.query(
      // `supports_audio_input` und `max_context_window` gibt es in dieser
      // Tabelle NICHT. Der Endpunkt gab deshalb auf jedem Geraet HTTP 500
      // (23.08.2026 gefunden, als der Live-Sweep zum ersten Mal eine Id fuer
      // `:modelId` hatte). Die Spalte fuer das Kontextfenster heisst
      // `context_window`; Audio kennt der Katalog gar nicht, und ein Modell,
      // das es kann, gibt es auf dem Geraet auch nicht.
      `SELECT id, name, model_type, supports_thinking, supports_vision_input,
              context_window, capabilities, rag_optimized
       FROM llm_model_catalog WHERE id = $1`,
      [modelId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Modell ${modelId} nicht gefunden`);
    }

    const model = result.rows[0];
    res.json({
      model: model.id,
      name: model.name,
      capabilities: {
        text: true,
        vision: model.supports_vision_input === true || model.model_type === 'vision',
        thinking: model.supports_thinking === true,
        ocr: model.model_type === 'ocr',
        // Bleibt in der Antwort, damit nichts bricht, was das Feld schon liest
        // — aber ehrlich: der Katalog kennt keine Audio-Faehigkeit, also ist
        // die Antwort immer `false` und nicht "unbekannt als true getarnt".
        audio: false,
        rag_optimized: model.rag_optimized === true,
        streaming: true,
        max_context_window: model.context_window || null,
        extra: model.capabilities || [],
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * GET /api/models/:modelId
 * Get info for a specific model
 */
router.get(
  '/:modelId',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;

    const model = await modelService.getModelInfo(modelId);
    if (!model) {
      throw new NotFoundError(`Modell ${modelId} nicht gefunden`);
    }
    res.json(model);
  })
);

module.exports = router;
