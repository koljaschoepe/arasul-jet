/**
 * LLM Models API Routes
 * Dynamic model management for Jetson AGX Orin
 *
 * Endpoints:
 * - GET  /api/models/catalog     - Get curated model catalog
 * - GET  /api/models/installed   - Get installed models
 * - GET  /api/models/status      - Get current status (loaded, queue)
 * - GET  /api/models/loaded      - Get currently loaded model
 * - POST /api/models/download    - Download model with SSE progress
 * - DELETE /api/models/:modelId  - Delete a model
 * - POST /api/models/:modelId/activate   - Load model into RAM
 * - POST /api/models/:modelId/deactivate - Unload model from RAM
 * - GET  /api/models/recommended  - Get recommended model for device profile
 * - POST /api/models/default     - Set default model
 * - GET  /api/models/default     - Get default model
 * - POST /api/models/sync        - Sync with Ollama
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../middleware/auth');
const modelService = require('../../services/llm/modelService');
const logger = require('../../utils/logger');
const { asyncHandler } = require('../../middleware/errorHandler');
const { validateBody } = require('../../middleware/validate');
const {
  DownloadBody,
  DefaultModelBody,
  QuellePruefenBody,
  KatalogHinzufuegenBody,
} = require('../../schemas/models');
const { NotFoundError, ValidationError, ConflictError } = require('../../utils/errors');
const { quelleLesen, variantenHolen, ramFuer } = require('../../services/llm/modellQuelle');
const { kategorieFuerBytes } = require('../../services/llm/modelSyncHelpers');
const database = require('../../database');
const { initSSE, trackConnection } = require('../../utils/sseHelper');
const { cacheService, cacheMiddleware } = require('../../services/core/cacheService');
const { getLlmRamGB } = require('../../utils/hardware');
const externeModelle = require('../../services/llm/extern/externeModelle');

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
  asyncHandler(async (req, res) => {
    const budget = await modelService.getMemoryBudget();
    res.json(budget);
  })
);

/**
 * POST /api/models/quelle/pruefen
 *
 * Nachsehen, was hinter einem Link steckt, BEVOR etwas geladen wird.
 *
 * Der Grund steht in `services/llm/modellQuelle.js`: ohne diesen Schritt
 * muesste der Kunde die Quantisierung raten und danach zweistellige Gigabyte
 * laden, um zu merken, dass sie nicht ins Geraet passt. Hier steht die Groesse
 * vorher fest, und `passt` sagt es in einem Wort.
 */
router.post(
  '/quelle/pruefen',
  requireAuth,
  validateBody(QuellePruefenBody),
  asyncHandler(async (req, res) => {
    const gelesen = quelleLesen(req.body.quelle);

    if (gelesen.art === 'ollama') {
      res.json({
        art: 'ollama',
        name: gelesen.name,
        varianten: [],
        hinweis:
          'Das ist ein Modell aus Ollamas eigener Ablage. Varianten lassen sich ' +
          'von hier aus nicht auflisten; der Name wird so übernommen, wie er dasteht.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const varianten = await variantenHolen(gelesen.repo);
    if (varianten.length === 0) {
      throw new ValidationError(
        `In „${gelesen.repo}" liegt keine einzelne GGUF-Datei. Ollama kann nur ` +
          'GGUF laden, und aufgeteilte Dateien nicht über einen Tag.'
      );
    }

    const frei = await modelService.getMemoryBudget().catch(() => null);
    const freiGb = frei && typeof frei.availableMb === 'number' ? frei.availableMb / 1024 : null;

    res.json({
      art: 'huggingface',
      repo: gelesen.repo,
      name: gelesen.name,
      frei_gb: freiGb === null ? null : Math.round(freiGb * 10) / 10,
      varianten: varianten
        .map(v => ({
          ...v,
          groesse_gb: Math.round((v.groesseBytes / 1e9) * 10) / 10,
          // `null`, wenn das Geraet seinen freien Speicher nicht nennen kann.
          // Ein erfundenes „passt" waere schlimmer als keine Aussage.
          passt: freiGb === null ? null : v.ramGb <= freiGb,
        }))
        .sort((a, b) => a.groesseBytes - b.groesseBytes),
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/models/katalog
 *
 * Ein Modell in den Katalog aufnehmen. Danach ist es ueber den normalen Weg
 * (`POST /api/models/download`) ladbar wie jedes kuratierte auch.
 *
 * `jetson_tested = false` ist keine Formalie: der Kunde soll sehen, dass
 * dieses Modell nicht von Arasul geprueft wurde.
 */
router.post(
  '/katalog',
  requireAuth,
  validateBody(KatalogHinzufuegenBody),
  asyncHandler(async (req, res) => {
    const gelesen = quelleLesen(req.body.quelle);
    const variante = req.body.variante || gelesen.tag || null;

    if (gelesen.art === 'huggingface' && !variante) {
      throw new ValidationError(
        'Bitte eine Variante angeben (zum Beispiel „IQ4_XS"). ' +
          'POST /api/models/quelle/pruefen nennt die verfügbaren.'
      );
    }

    const id = gelesen.art === 'huggingface' ? `hf.co/${gelesen.repo}:${variante}` : gelesen.name;

    const vorhanden = await database.query('SELECT id FROM llm_model_catalog WHERE id = $1', [id]);
    if (vorhanden.rows.length > 0) {
      throw new ConflictError(`„${id}" steht bereits im Katalog.`);
    }

    // Groesse und RAM aus der Quelle, nicht geraten. Bei Ollama-Modellen wissen
    // wir sie erst nach dem Laden — dann traegt sie der Download nach.
    let groesseBytes = 0;
    if (gelesen.art === 'huggingface') {
      const varianten = await variantenHolen(gelesen.repo);
      const treffer = varianten.find(v => v.tag === variante);
      if (!treffer) {
        throw new ValidationError(
          `Die Variante „${variante}" gibt es in „${gelesen.repo}" nicht. ` +
            `Vorhanden: ${varianten.map(v => v.tag).join(', ') || 'keine'}.`
        );
      }
      groesseBytes = treffer.groesseBytes;
    }

    const anzeige = req.body.name || (gelesen.repo ? gelesen.repo.split('/')[1] : gelesen.name);
    const beschreibung = `Selbst hinzugefügt${
      gelesen.art === 'huggingface' ? ` von huggingface.co/${gelesen.repo}` : ''
    }${variante ? `, Variante ${variante}` : ''}. Nicht von Arasul geprüft.`;

    await database.query(
      `INSERT INTO llm_model_catalog
         (id, name, description, size_bytes, ram_required_gb, category,
          capabilities, recommended_for, jetson_tested, performance_tier,
          ollama_name, model_type, selbst_hinzugefuegt)
       VALUES ($1, $2, $3, $4, $5, $6, '[]'::jsonb, '[]'::jsonb, false, 2, $7, 'llm', true)`,
      // `category` ist eine GROESSENKLASSE, kein Typ: der Katalog hat einen
      // CHECK auf small/medium/large/xlarge. Beim ersten Anlauf stand hier
      // 'custom', und jeder Aufruf endete mit HTTP 500
      // (`llm_model_catalog_category_check`, am 23.08.2026 am Geraet gefunden).
      // Die Einordnung kommt aus `modelSyncHelpers`, damit der automatische
      // Import und dieser Weg nicht zwei Wahrheiten haben.
      [
        id,
        anzeige,
        beschreibung,
        groesseBytes,
        ramFuer(groesseBytes),
        kategorieFuerBytes(groesseBytes),
        id,
      ]
    );

    cacheService.invalidate(CACHE_KEYS.CATALOG);
    logger.info(`Modell in den Katalog aufgenommen: ${id} (von ${req.user.username})`);

    res.status(201).json({
      data: {
        id,
        name: anzeige,
        size_bytes: groesseBytes,
        ram_required_gb: ramFuer(groesseBytes),
      },
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * DELETE /api/models/katalog/:modelId
 *
 * Eine selbst hinzugefuegte Katalogzeile wieder entfernen.
 *
 * Ohne diesen Weg gaebe es keinen zurueck: `DELETE /api/models/:id` raeumt nur
 * `llm_installed_models`, die Katalogzeile bleibt. Ein Tippfehler im Namen
 * stuende damit fuer immer im Katalog des Kunden (beim Nachweisen am Geraet am
 * 23.08.2026 aufgefallen).
 *
 * Entfernt wird ausschliesslich, was `selbst_hinzugefuegt` traegt. Die
 * kuratierten Zeilen kommen aus Migrationen und kaemen beim naechsten Start
 * ohnehin wieder — sie hier loeschen zu lassen waere eine Zusage, die das
 * Geraet nicht halten kann.
 */
router.delete(
  // `*` und nicht `:modelId`: die Kennung eines HuggingFace-Modells traegt
  // selbst Schraegstriche (`hf.co/unsloth/Qwen3-30B-A3B-GGUF:IQ1_S`), und ein
  // Parameter fasst nur EIN Segment.
  '/katalog/*',
  requireAuth,
  asyncHandler(async (req, res) => {
    const modelId = req.params[0];
    if (!modelId) {
      throw new ValidationError('Ohne Kennung lässt sich nichts entfernen.');
    }

    const zeile = await database.query(
      'SELECT id, name, selbst_hinzugefuegt FROM llm_model_catalog WHERE id = $1',
      [modelId]
    );
    if (zeile.rows.length === 0) {
      throw new NotFoundError(`„${modelId}" steht nicht im Katalog.`);
    }
    if (!zeile.rows[0].selbst_hinzugefuegt) {
      throw new ValidationError(
        `„${modelId}" gehört zum Lieferumfang und lässt sich nicht aus dem Katalog entfernen. ` +
          'Ein installiertes Modell löschst du über DELETE /api/models/:id.'
      );
    }

    const installiert = await database.query('SELECT id FROM llm_installed_models WHERE id = $1', [
      modelId,
    ]);
    if (installiert.rows.length > 0) {
      throw new ConflictError(
        `„${modelId}" ist noch installiert. Erst das Modell löschen, dann den Katalogeintrag.`
      );
    }

    await database.query('DELETE FROM llm_model_catalog WHERE id = $1', [modelId]);
    cacheService.invalidatePattern('models:*');
    logger.info(`Katalogeintrag entfernt: ${modelId} (von ${req.user.username})`);

    res.json({
      data: { id: modelId, name: zeile.rows[0].name },
      message: `„${zeile.rows[0].name}" ist nicht mehr im Katalog.`,
      timestamp: new Date().toISOString(),
    });
  })
);

/**
 * POST /api/models/:modelId/load
 * Load a model into RAM (LLM) or start container (OCR)
 */
router.post(
  '/:modelId/load',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;
    const database = require('../../database');

    // Check model type
    const typeResult = await database.query(
      'SELECT model_type FROM llm_model_catalog WHERE id = $1',
      [modelId]
    );

    if (typeResult.rows.length === 0) {
      throw new NotFoundError(`Modell "${modelId}" nicht im Katalog gefunden`);
    }

    if (typeResult.rows[0].model_type === 'ocr') {
      // OCR: Start Docker container
      const containerService = require('../../services/app/containerService');
      const appId = modelId.split(':')[0];
      const result = await containerService.startApp(appId);
      cacheService.invalidate(CACHE_KEYS.STATUS);
      cacheService.invalidate(CACHE_KEYS.INSTALLED);
      res.json({ message: `OCR-Modell ${modelId} wird gestartet`, ...result });
    } else {
      // LLM: Load into VRAM via Ollama
      const result = await modelService.activateModel(modelId, 'user');
      cacheService.invalidate(CACHE_KEYS.STATUS);
      res.json(result);
    }
  })
);

/**
 * Ein Modell aus dem Speicher nehmen, egal ueber welche der beiden Routen.
 *
 * Es gab zwei Routen fuer dieselbe Sache, und sie taten NICHT dasselbe:
 * `/unload` loeste die Katalog-Kennung auf den Ollama-Namen auf, `/deactivate`
 * reichte sie roh durch. Am 21.08.2026 am Geraet gemessen:
 *
 *   POST /api/models/qwen3:7b-q8/deactivate
 *   -> {"success":false,"error":"Request failed with status code 404",
 *       "message":"Modell qwen3:7b-q8 wurde entladen"}
 *   curl /api/ps -> ['qwen3:8b']   (also weiterhin geladen)
 *
 * Zwei Fehler in einer Antwort: die Route entlaedt nichts, weil Ollama die
 * Katalog-Kennung nicht kennt (`ollama_name` ist `qwen3:8b`, Migration 027),
 * und sie meldet trotzdem "wurde entladen", waehrend `success: false`
 * danebensteht.
 *
 * Seit Plan 023 D3 haengt daran mehr als die Route selbst: der Abgleich merkt
 * sich eigene Entladungen unter dem Namen, mit dem entladen wurde. Unter der
 * falschen Kennung gemerkt, findet er sie nicht wieder und bucht die spaetere,
 * echte Entladung als "automatisch wegen Ruhe". Genau die falsche
 * Herkunftsangabe, die D3 beseitigen sollte.
 *
 * Ein Helfer statt zwei Routen: so koennen sie nicht wieder auseinanderlaufen.
 */
async function modellEntladen(modelId) {
  const database = require('../../database');
  const typeResult = await database.query(
    'SELECT model_type, COALESCE(ollama_name, id) as ollama_name FROM llm_model_catalog WHERE id = $1',
    [modelId]
  );

  if (typeResult.rows.length === 0) {
    // Nicht im Katalog (z. B. ein direkt in Ollama geladenes Modell wie
    // `qwen3:14b`, das im Modell-Dashboard „im RAM" auftaucht): modelId direkt
    // als Ollama-Namen entladen. Entladen ist idempotent und harmlos, kein
    // Grund, es an der Katalog-Luecke scheitern zu lassen.
    return { ...(await modelService.unloadModel(modelId)), model: modelId };
  }

  if (typeResult.rows[0].model_type === 'ocr') {
    // OCR: Stop Docker container
    const containerService = require('../../services/app/containerService');
    const appId = modelId.split(':')[0];
    const result = await containerService.stopApp(appId);
    // Die eigene Meldung NACH dem Spread: `stopApp` bringt eine allgemeine mit
    // ("App gestoppt"), und die stand bisher da, obwohl die spezifischere
    // schon geschrieben war. Alt, aber dieser Schritt raeumt die Meldungen auf.
    return { ...result, message: `OCR-Modell ${modelId} wurde gestoppt`, model: modelId };
  }

  const ollamaName = typeResult.rows[0].ollama_name;
  return { ...(await modelService.unloadModel(ollamaName)), model: modelId };
}

/**
 * POST /api/models/:modelId/unload
 * Unload model from RAM (LLM) or stop container (OCR)
 */
router.post(
  '/:modelId/unload',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await modellEntladen(req.params.modelId);
    cacheService.invalidate(CACHE_KEYS.STATUS);
    cacheService.invalidate(CACHE_KEYS.INSTALLED);
    res.json(result);
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
  validateBody(DownloadBody),
  asyncHandler(async (req, res) => {
    const { model_id } = req.body;

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
    res.write(`data: ${JSON.stringify({ status: 'starting', model_id, progress: 0 })}\n\n`);

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
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;

    const result = await modelService.deleteModel(modelId);

    // Invalidate model caches after deletion
    cacheService.invalidatePattern('models:*');

    res.json({
      ...result,
      message: `Modell ${modelId} wurde geloescht`,
    });
  })
);

/**
 * POST /api/models/:modelId/activate
 * Load a model into RAM
 * Supports SSE streaming for progress updates via ?stream=true
 */
router.post(
  '/:modelId/activate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;
    const useStream = req.query.stream === 'true';

    // Check if model is installed
    const isInstalled = await modelService.isModelInstalled(modelId);
    if (!isInstalled) {
      if (useStream) {
        initSSE(res);
        res.write(
          `data: ${JSON.stringify({ error: `Modell ${modelId} ist nicht installiert`, done: true })}\n\n`
        );
        return res.end();
      }
      throw new NotFoundError(`Modell ${modelId} ist nicht installiert`);
    }

    // P3-001: SSE streaming for activation progress
    if (useStream) {
      // Fetch model info BEFORE initSSE. Once SSE headers are sent the global
      // error handler is a no-op, so a rejection here (e.g. transient DB
      // ECONNREFUSED) would leave the EventSource hanging open forever. Doing
      // it pre-headers lets the error handler return a clean error response.
      const modelInfo = await modelService.getModelInfo(modelId);
      const estimatedSeconds = (modelInfo?.ram_required_gb || 10) * 3; // ~3s per GB

      initSSE(res);

      // Send initial status
      res.write(
        `data: ${JSON.stringify({
          status: 'starting',
          progress: 0,
          message: 'Modell wird vorbereitet...',
          estimatedSeconds,
        })}\n\n`
      );

      // UX-FIX: Send honest indeterminate progress with heartbeat instead of fake percentages.
      // Real Ollama loading time is unpredictable — fake progress misleads users.
      let elapsedSeconds = 0;
      const progressInterval = setInterval(() => {
        elapsedSeconds++;
        const messages = [
          'Modell wird vorbereitet...',
          'Lade Modell-Gewichte in GPU-Speicher...',
          'Initialisiere GPU-Speicher...',
          'Optimiere für Inferenz...',
        ];
        const messageIndex = Math.min(
          Math.floor(elapsedSeconds / Math.max(estimatedSeconds / 4, 3)),
          messages.length - 1
        );
        res.write(
          `data: ${JSON.stringify({
            status: 'loading',
            progress: -1,
            indeterminate: true,
            elapsed: elapsedSeconds,
            estimatedSeconds,
            message: messages[messageIndex],
          })}\n\n`
        );
      }, 1000); // Heartbeat every second

      try {
        const result = await modelService.activateModel(modelId, 'user');
        clearInterval(progressInterval);

        // Invalidate status cache after activation
        cacheService.invalidate(CACHE_KEYS.STATUS);

        res.write(
          `data: ${JSON.stringify({
            status: 'complete',
            progress: 100,
            message: result.alreadyLoaded
              ? `Modell ${modelId} war bereits geladen`
              : `Modell ${modelId} erfolgreich aktiviert`,
            ...result,
            done: true,
          })}\n\n`
        );
        res.end();
      } catch (err) {
        clearInterval(progressInterval);
        logger.error(`Error activating model ${modelId}: ${err.message}`);
        res.write(
          `data: ${JSON.stringify({
            status: 'error',
            error: err.message,
            done: true,
          })}\n\n`
        );
        res.end();
      }
    } else {
      // Non-streaming (original behavior)
      const result = await modelService.activateModel(modelId, 'user');

      // Invalidate status cache after activation
      cacheService.invalidate(CACHE_KEYS.STATUS);

      res.json({
        ...result,
        message: result.alreadyLoaded
          ? `Modell ${modelId} ist bereits geladen`
          : `Modell ${modelId} wurde aktiviert`,
      });
    }
  })
);

/**
 * POST /api/models/:modelId/deactivate
 * Unload a model from RAM
 */
router.post(
  '/:modelId/deactivate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { modelId } = req.params;
    const result = await modellEntladen(modelId);

    cacheService.invalidate(CACHE_KEYS.STATUS);
    cacheService.invalidate(CACHE_KEYS.INSTALLED);

    // Die Meldung richtet sich nach dem, was passiert ist. Bis zum 21.08.2026
    // stand hier "wurde entladen", auch wenn `success: false` danebenstand.
    // Und wenn der Helfer schon eine eigene Meldung mitbringt (bei OCR wird
    // ein Container gestoppt, nicht Speicher freigegeben), bleibt sie stehen.
    const meldung =
      result.message ??
      (result.success === false
        ? `Modell ${modelId} konnte nicht entladen werden`
        : `Modell ${modelId} wurde entladen`);
    res.json({ ...result, message: meldung });
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
 * Set default model for new chats
 */
router.post(
  '/default',
  requireAuth,
  validateBody(DefaultModelBody),
  asyncHandler(async (req, res) => {
    const { model_id } = req.body;

    // Check if model is installed
    const isInstalled = await modelService.isModelInstalled(model_id);
    if (!isInstalled) {
      throw new NotFoundError(`Modell ${model_id} ist nicht installiert`);
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
