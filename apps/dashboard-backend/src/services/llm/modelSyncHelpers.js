/**
 * Model Sync Helpers
 *
 * Handles synchronization between the DB catalog and Ollama's actual model list:
 * - Mark available models
 * - Detect missing models
 * - Clean up stale downloads
 *
 * Extracted from modelService.js for maintainability.
 *
 * Der Abgleich traegt nach, was nur bei Ollama liegt (M5, 05.10.2026).
 * Bis Phase C8 (27.08.2026) gab es `importUnknownModels` (Minimal-Eintrag je
 * Modell), C8 nahm es weg, weil der Katalog eine Zusage ueber vier gemessene
 * Modelle war. Seit J4 ist der Katalog offen und die Verwaltung zeigt, was am
 * Geraet liegt; ein Modell, das jemand am CLI zog (gemma4:26b, 18 GB), fehlte
 * dort. `traegNachModelle` legt es jetzt an, mit Groesse und Faehigkeiten aus
 * Ollama (`/api/tags`, `/api/show`).
 *
 * REGEL: Der Nachtrag legt NUR NEUE Zeilen an (`ON CONFLICT DO NOTHING`, und
 * vorher wird nach `id` und `ollama_name` in beiden `:latest`-Schreibweisen
 * gesucht). Eine bestehende Zeile -- kuratiert oder von Hand gepflegt -- fasst
 * er nie an. Nachgetragene Zeilen sind `ungemessen` und `frei_geladen`, gehen
 * also mit dem Entfernen des Modells wieder weg wie jede frei geladene Zeile.
 *
 * Usage: const helpers = createSyncHelpers({ database, logger, ... });
 */

/**
 * Factory: create sync helpers bound to injected dependencies.
 * @param {Object} deps
 * @param {Object} deps.database
 * @param {Object} deps.logger
 * @param {Set}    deps.activeDownloadIds
 * @param {Map}    deps.modelAvailabilityCache
 * @returns {Object} Sync helper functions
 */
/**
 * Ollama behandelt `name` und `name:latest` als dasselbe Modell — der Katalog
 * speichert meist die tag-lose Form, `/api/tags` liefert aber `:latest`.
 * Ein exakter Stringvergleich meldete deshalb installierte Modelle als
 * „nicht in Ollama gefunden" (live gesehen bei nomic-embed-text, 2026-07-27).
 * @param {string} name
 * @returns {string[]} beide Schreibweisen des Tags
 */
function tagVarianten(name) {
  if (name.endsWith(':latest')) {
    return [name, name.slice(0, -':latest'.length)];
  }
  return name.includes(':') ? [name] : [name, `${name}:latest`];
}

/** Ist `name` (in irgendeiner `:latest`-Schreibweise) in der Ollama-Liste? */
function inOllama(ollamaModels, name) {
  return tagVarianten(name).some(v => ollamaModels.includes(v));
}

const GB = 1000 * 1000 * 1000;

function kategorie(gb) {
  if (gb < 4) {
    return 'small';
  }
  if (gb < 12) {
    return 'medium';
  }
  if (gb < 40) {
    return 'large';
  }
  return 'xlarge';
}

function createSyncHelpers({
  database,
  logger,
  activeDownloadIds,
  modelAvailabilityCache,
  leseSteckbrief = name => require('./modelProfile').leseSteckbrief(name),
}) {
  /**
   * Modelle, die nur bei Ollama liegen, in den Katalog nachtragen (sync step 0).
   * Bestehende Zeilen bleiben unberuehrt (siehe Regel oben).
   * @param {Array<{name: string, size?: number}>} ollamaTags - Eintraege aus /api/tags
   * @returns {Promise<string[]>} Kennungen der neu angelegten Zeilen
   */
  async function traegNachModelle(ollamaTags) {
    const neu = [];
    for (const tag of ollamaTags) {
      const name = tag?.name;
      if (!name) {
        continue;
      }
      const varianten = tagVarianten(name);
      const bekannt = await database.query(
        `SELECT id FROM llm_model_catalog
          WHERE id = ANY($1) OR ollama_name = ANY($1) LIMIT 1`,
        [varianten]
      );
      if (bekannt.rows.length > 0) {
        continue;
      }

      const steckbrief = await leseSteckbrief(name);
      if (!steckbrief) {
        // Ollama kennt die Faehigkeiten nicht (oder antwortet nicht): lieber
        // beim naechsten Abgleich erneut, als eine geratene Zeile anlegen.
        logger.warn(`[SYNC] ${name} nicht nachgetragen: Steckbrief nicht lesbar`);
        continue;
      }
      const faehigkeiten = steckbrief.capabilities || [];
      const bytes = Number(tag.size) || 0;
      const embedding = faehigkeiten.includes('embedding');
      const bild = steckbrief.supportsVision === true;
      // Bild heisst nicht „kein Text“: gemma4 liest Bilder UND beantwortet
      // Prompts. Ein Modell mit `completion` ist ein Textmodell, das Bild steht
      // in `supports_vision_input`. Die Aufgabe `vision` schliesst es von
      // Textschritten und vom Standard aus (`schrittModelle.faehigkeitenVon`),
      // darum nur, wenn Ollama ausdruecklich kein `completion` meldet.
      const nurBild = bild && !faehigkeiten.includes('completion');
      const aufgabe = embedding ? 'embedding' : nurBild ? 'vision' : 'text';
      const gb = bytes / GB;

      const ergebnis = await database.query(
        `INSERT INTO llm_model_catalog (
            id, name, description, ollama_name, size_bytes, ram_required_gb,
            category, capabilities, recommended_for, model_type, task,
            is_task_default, speed_tier, supports_thinking, supports_vision_input,
            supports_tools, context_window, parameter_label, quantization, license,
            profile_read_at, jetson_tested, performance_tier, frei_geladen
         ) VALUES (
            $1, $2, $3, $1, $4, $5, $6, $7::jsonb, '[]'::jsonb, $8, $9,
            false, $10, $11, $12, $13, $14, $15, $16, $17,
            NOW(), false, 2, true
         )
         ON CONFLICT (id) DO NOTHING`,
        [
          name,
          name,
          'Am Gerät bei Ollama gefunden, auf diesem Gerät ungemessen. Größe und Fähigkeiten stammen aus Ollama.',
          bytes,
          Math.max(1, Math.ceil(gb * 1.15 || 1)),
          kategorie(gb),
          JSON.stringify(embedding ? ['embedding'] : []),
          embedding ? 'embedding' : nurBild ? 'vision' : 'llm',
          aufgabe,
          embedding ? 'embed' : 'balanced',
          faehigkeiten.includes('thinking'),
          bild,
          steckbrief.supportsTools === true,
          steckbrief.contextLength,
          steckbrief.parameterLabel,
          steckbrief.quantization,
          steckbrief.license,
        ]
      );
      if (ergebnis.rowCount > 0) {
        neu.push(name);
        logger.info(`[SYNC] ${name} aus Ollama in den Katalog nachgetragen (ungemessen)`);
      }
    }
    return neu;
  }

  /**
   * Mark models as available that Ollama has (sync step 1)
   * @param {string[]} ollamaModels - List of model names from Ollama
   */
  async function markAvailableModels(ollamaModels) {
    for (const ollamaModelName of ollamaModels) {
      const varianten = tagVarianten(ollamaModelName);
      const catalogResult = await database.query(
        `SELECT id FROM llm_model_catalog
         WHERE ollama_name = ANY($1) OR id = ANY($1)`,
        [varianten]
      );

      if (catalogResult.rows.length > 0) {
        const catalogId = catalogResult.rows[0].id;
        const result = await database.query(
          `
            INSERT INTO llm_installed_models (id, status, download_progress, downloaded_at)
            VALUES ($1, 'available', 100, NOW())
            ON CONFLICT (id) DO UPDATE SET
                status = 'available',
                download_progress = 100,
                error_message = NULL
            WHERE llm_installed_models.status != 'available'
               OR llm_installed_models.download_progress != 100
               OR llm_installed_models.error_message IS NOT NULL
          `,
          [catalogId]
        );
        if (result.rowCount > 0) {
          logger.debug(`[SYNC] Model ${catalogId} marked as available`);
        }
      }
    }
  }

  /**
   * Mark models as error if they're listed as available in DB but missing from Ollama (sync step 2)
   * @param {string[]} ollamaModels - List of model names from Ollama
   */
  async function markMissingModels(ollamaModels) {
    const catalogWithOllama = await database.query(`
      SELECT c.id, COALESCE(c.ollama_name, c.id) as effective_ollama_name
      FROM llm_model_catalog c
      JOIN llm_installed_models i ON c.id = i.id
      WHERE i.status = 'available'
    `);

    // Check both effective_ollama_name AND catalog id against Ollama models
    // This handles locally imported models (id matches) vs registry-pulled models (ollama_name matches)
    const missingIds = catalogWithOllama.rows
      .filter(
        row => !inOllama(ollamaModels, row.effective_ollama_name) && !inOllama(ollamaModels, row.id)
      )
      .map(row => row.id);

    if (missingIds.length > 0) {
      logger.warn(`[SYNC] Models missing from Ollama: ${missingIds.join(', ')}`);
      await database.query(
        `
          UPDATE llm_installed_models
          SET status = 'error',
              error_message = 'Modell nicht in Ollama gefunden - bitte erneut herunterladen'
          WHERE status = 'available'
          AND id = ANY($1::text[])
        `,
        [missingIds]
      );
    }
  }

  /**
   * Clean up downloads that got stuck - mark as available if in Ollama, error otherwise (sync step 3)
   * @param {string[]} ollamaModels - List of model names from Ollama
   * @returns {Promise<number>} Number of stale downloads cleaned up
   */
  async function cleanupStaleDownloads(ollamaModels) {
    const downloadingResult = await database.query(`
      SELECT i.id, COALESCE(c.ollama_name, c.id) as effective_ollama_name
      FROM llm_installed_models i
      LEFT JOIN llm_model_catalog c ON c.id = i.id
      WHERE i.status = 'downloading'
    `);

    let staleCount = 0;
    for (const row of downloadingResult.rows) {
      // Skip models with an active download in this process
      if (activeDownloadIds.has(row.id)) {
        logger.debug(`[SYNC] Skipping ${row.id}, active download in progress`);
        continue;
      }

      if (inOllama(ollamaModels, row.effective_ollama_name) || inOllama(ollamaModels, row.id)) {
        // Model is actually in Ollama - mark as available
        await database.query(
          `
            UPDATE llm_installed_models
            SET status = 'available', download_progress = 100, downloaded_at = NOW(), error_message = NULL
            WHERE id = $1
          `,
          [row.id]
        );
        logger.info(
          `[SYNC] Model ${row.id} was downloading but already in Ollama - marked available`
        );
      } else {
        // Plan 009: Modell nicht in Ollama und im Prozess kein aktiver Download
        // → NICHT als 'error' verwerfen, sondern 'paused' (wiederaufnehmbar).
        // Häufigster Fall: Backend-Neustart mitten im 20–30h-Download; der
        // In-Memory-activeDownloadIds-Set ist frisch leer, die Zeile steht aber
        // noch auf 'downloading'. 'paused' + download_progress bleiben erhalten,
        // resumePausedDownloads nimmt den Pull wieder auf (Ollama-Layer-Dedup
        // überspringt fertige Layer → kein Neuladen von 0).
        await database.query(
          `
            UPDATE llm_installed_models
            SET status = 'paused',
                last_activity_at = COALESCE(last_activity_at, NOW()),
                error_message = NULL
            WHERE id = $1 AND status = 'downloading'
          `,
          [row.id]
        );
        logger.warn(`[SYNC] Unterbrochener Download pausiert (wiederaufnehmbar): ${row.id}`);
        modelAvailabilityCache.delete(row.id);
        staleCount++;
      }
    }

    if (staleCount > 0) {
      logger.warn(`[SYNC] Cleaned up ${staleCount} stale download(s)`);
    }

    return staleCount;
  }

  return {
    traegNachModelle,
    markAvailableModels,
    markMissingModels,
    cleanupStaleDownloads,
  };
}

module.exports = { createSyncHelpers, tagVarianten, inOllama };
