/**
 * Folder Context Service (Plan ide-workspace-shell)
 *
 * Lädt die Kontextdateien (documents.is_context_file = TRUE) der Ordner
 * (knowledge_spaces), auf die ein Chat explizit gescoped ist, und stellt sie
 * dem RAG-Prompt-Assembly als eigene Ebene zur Verfügung.
 *
 * Muster wie company_context in ragCore: 5-Minuten-TTL-Cache pro Space mit
 * expliziter Invalidierung beim Bearbeiten (PUT /spaces/:id/context-file).
 * Inhalte laufen durch sanitizePromptContent (Injection-Strip + Kürzung).
 */

const db = require('../../database');
const logger = require('../../utils/logger');
const minioService = require('../documents/minioService');
const { sanitizePromptContent } = require('../llm/systemPromptBuilder');

const FOLDER_CONTEXT_TTL = 5 * 60 * 1000;
// Obergrenze injizierter Kontextdateien pro Anfrage — schützt das Token-Budget,
// wenn ein Scope viele Unterordner mit eigenen Kontextdateien umfasst.
const MAX_CONTEXT_FILES = 3;

// spaceId → { value: { spaceName, content } | null, expiresAt }
const _cache = new Map();

/**
 * Kontextdatei eines einzelnen Space laden (mit Cache).
 * @returns {{ spaceName: string, content: string } | null}
 */
async function getFolderContext(spaceId) {
  const now = Date.now();
  const cached = _cache.get(spaceId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let value = null;
  try {
    const result = await db.query(
      `SELECT d.file_path, ks.name AS space_name
         FROM documents d
         JOIN knowledge_spaces ks ON ks.id = d.space_id
        WHERE d.space_id = $1
          AND d.is_context_file = TRUE
          AND d.deleted_at IS NULL
        LIMIT 1`,
      [spaceId]
    );

    if (result.rows.length > 0) {
      const { file_path: filePath, space_name: spaceName } = result.rows[0];
      if (minioService.isValidMinioPath(filePath)) {
        const stream = await minioService.getObject(filePath);
        const raw = Buffer.concat(await streamToChunks(stream)).toString('utf-8');
        const content = sanitizePromptContent(raw, 'Ordner-Kontext');
        if (content) {
          value = { spaceName, content };
        }
      } else {
        logger.error(`Invalid MinIO path for folder context of space ${spaceId}: ${filePath}`);
      }
    }
  } catch (error) {
    logger.warn(`Failed to load folder context for space ${spaceId}: ${error.message}`);
    // Fehler nicht cachen — nächster Request versucht es erneut
    return null;
  }

  _cache.set(spaceId, { value, expiresAt: now + FOLDER_CONTEXT_TTL });
  return value;
}

async function streamToChunks(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks;
}

/**
 * Kontextdateien für einen Scope laden. Reihenfolge der spaceIds bleibt
 * erhalten (der Aufrufer schickt den gescopten Wurzel-Ordner zuerst);
 * höchstens MAX_CONTEXT_FILES Dateien werden zurückgegeben.
 *
 * @param {string[]} spaceIds
 * @returns {Promise<Array<{ spaceName: string, content: string }>>}
 */
async function getFolderContexts(spaceIds) {
  if (!Array.isArray(spaceIds) || spaceIds.length === 0) {
    return [];
  }
  const contexts = [];
  for (const spaceId of spaceIds) {
    if (contexts.length >= MAX_CONTEXT_FILES) {
      break;
    }
    const ctx = await getFolderContext(spaceId);
    if (ctx) {
      contexts.push(ctx);
    }
  }
  return contexts;
}

/** Cache-Invalidierung — beim Anlegen/Bearbeiten/Löschen der Kontextdatei aufrufen. */
function invalidateFolderContext(spaceId) {
  if (spaceId) {
    _cache.delete(spaceId);
  } else {
    _cache.clear();
  }
}

module.exports = {
  getFolderContext,
  getFolderContexts,
  invalidateFolderContext,
};
