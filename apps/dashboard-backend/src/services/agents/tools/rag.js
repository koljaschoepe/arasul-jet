/**
 * Agent tool: `rag` — search the workspace knowledge base.
 *
 * Reuses the platform's existing retrieval core (services/rag/ragCore.js):
 * embed the question, then run the Qdrant-native hybrid search. Results are
 * returned as concise text. An empty index yields a clear "nichts gefunden"
 * message rather than an error, and any backend failure is caught and returned
 * as text so the run loop keeps going.
 */

const BaseTool = require('../../../tools/baseTool');
const ragCore = require('../../rag/ragCore');
const logger = require('../../../utils/logger');

const DEFAULT_LIMIT = 5;
const SNIPPET_CHARS = 400;

class RagTool extends BaseTool {
  get name() {
    return 'rag';
  }

  get description() {
    return 'Durchsucht die Wissensbasis des Workspace nach relevanten Textstellen';
  }

  get parameters() {
    return {
      frage: {
        type: 'string',
        description: 'Die Suchfrage / das Stichwort',
        required: true,
      },
    };
  }

  /**
   * @param {{frage?:string, query?:string}} params
   * @param {{spaceIds?:string[]|null}} context - optional space scoping
   */
  async execute(params = {}, context = {}) {
    const query = String(params.frage || params.query || '').trim();
    if (!query) {
      return 'Fehler: "frage" darf nicht leer sein.';
    }

    let results;
    try {
      const embedding = await ragCore.getEmbedding(query);
      const spaceIds = context.spaceIds || null;
      results = await ragCore.hybridSearch(query, embedding, DEFAULT_LIMIT, spaceIds);
    } catch (err) {
      logger.warn(`Agent rag tool search failed: ${err.message}`);
      return `Suche derzeit nicht moeglich: ${err.message}`;
    }

    if (!Array.isArray(results) || results.length === 0) {
      return 'Nichts gefunden — die Wissensbasis dieses Workspace ist leer oder enthaelt keine passenden Stellen.';
    }

    const lines = results.map((r, i) => {
      const payload = r.payload || {};
      const source = payload.document_name || payload.title || payload.document_id || 'Unbekannt';
      const raw = String(payload.text || payload.content || '')
        .replace(/\s+/g, ' ')
        .trim();
      const snippet = raw.length > SNIPPET_CHARS ? `${raw.slice(0, SNIPPET_CHARS)}...` : raw;
      return `${i + 1}. [${source}] ${snippet}`;
    });

    return `Gefundene Stellen:\n${lines.join('\n')}`;
  }
}

module.exports = RagTool;
