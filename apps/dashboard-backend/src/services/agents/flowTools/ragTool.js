/**
 * Flow-Agent-Tool: `rag` — durchsucht die Wissensbasis (Qdrant/Indexer).
 *
 * Nutzt den bestehenden Retrieval-Kern (services/rag/ragCore.js): Frage
 * einbetten, dann hybride Suche. Ergebnisse als knapper Text; leere/erfolglose
 * Suche liefert eine klare Meldung statt eines Fehlers, damit der Tool-Loop
 * weiterläuft. Rein lokal — kein externes Netz.
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
    return 'Durchsucht die lokale Wissensbasis (Dokumente) nach relevanten Textstellen';
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
   * @param {{spaceIds?:string[]|null}} context
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
      logger.warn(`Flow-Agent rag-Tool: Suche fehlgeschlagen: ${err.message}`);
      return `Suche derzeit nicht möglich: ${err.message}`;
    }

    if (!Array.isArray(results) || results.length === 0) {
      return 'Nichts gefunden — die Wissensbasis enthält keine passenden Stellen.';
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
