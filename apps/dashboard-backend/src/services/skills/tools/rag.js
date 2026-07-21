/**
 * Skill-Werkzeug `rag_suche` (Plan 011, Schritt 6).
 *
 * Durchsucht die Wissensbasis über den vorhandenen Retrieval-Kern
 * (services/rag/ragCore.js): Frage einbetten, dann die Qdrant-Hybridsuche.
 *
 * Der Zuschnitt ist hier der eigentliche Punkt. Ein Argument vom Typ
 * `wissensbasis` legt genau EINE Sammlung fest, und dann sucht dieses Werkzeug
 * ausschließlich dort. Das ist Kontext-Sparsamkeit an der Quelle (§3): Statt
 * das Modell in allem suchen zu lassen und hinterher zu filtern, bekommt es von
 * vornherein nur die Stellen, die zur Aufgabe gehören.
 *
 * Ohne festgelegte Sammlung wird über alles gesucht — das ist bewusst erlaubt,
 * aber die schlechtere Voreinstellung für kleine Modelle.
 *
 * ABGRENZUNG zur Regel in `apps/dashboard-backend/CLAUDE.md`, wonach ein
 * Workspace ohne verknüpften Wissensraum auf NICHTS scopen darf und niemals auf
 * alle Räume zurückfallen. Die Regel schützt dort die Isolation zwischen
 * Workspaces: Ein Workspace darf fremde Räume nicht sehen. Hier gibt es diese
 * Grenze nicht — Skills gehören dem einzigen Admin, es gibt keine Mandanten
 * (Plan 011, §8). „Keine Sammlung angegeben" heißt hier deshalb bewusst „durchsuche
 * mein Wissen", nicht „durchsuche fremdes Wissen". Sobald es je mehrere Nutzer
 * gibt, muss diese Voreinstellung umgedreht werden.
 */

const BaseTool = require('../../../tools/baseTool');
const ragCore = require('../../rag/ragCore');
const logger = require('../../../utils/logger');

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 15;
const SNIPPET_CHARS = 400;

class RagSucheTool extends BaseTool {
  get name() {
    return 'rag_suche';
  }

  get description() {
    return 'Durchsucht die Wissensbasis nach relevanten Textstellen und gibt sie mit Quelle zurück';
  }

  get parameters() {
    return {
      frage: {
        type: 'string',
        description: 'Die Suchfrage oder das Stichwort',
        required: true,
      },
      anzahl: {
        type: 'number',
        description: `Wie viele Fundstellen höchstens (Standard ${DEFAULT_LIMIT}, max ${MAX_LIMIT})`,
        required: false,
      },
    };
  }

  /**
   * @param {{frage?:string, anzahl?:number}} params
   * @param {{spaceIds?:string[]|null}} context - Zuschnitt auf Sammlungen
   */
  async execute(params = {}, context = {}) {
    const query = String(params.frage || '').trim();
    if (!query) {
      return 'Fehler: "frage" darf nicht leer sein.';
    }

    // Obergrenze hart durchsetzen: Ein Modell, das versehentlich 500 Treffer
    // anfordert, würde sonst seinen eigenen Kontext fluten.
    let limit = Number.parseInt(params.anzahl, 10);
    if (!Number.isFinite(limit) || limit < 1) {
      limit = DEFAULT_LIMIT;
    }
    limit = Math.min(limit, MAX_LIMIT);

    let results;
    try {
      const embedding = await ragCore.getEmbedding(query);
      const spaceIds =
        Array.isArray(context.spaceIds) && context.spaceIds.length > 0 ? context.spaceIds : null;
      results = await ragCore.hybridSearch(query, embedding, limit, spaceIds);
    } catch (err) {
      logger.warn(`rag_suche fehlgeschlagen: ${err.message}`);
      return `Suche derzeit nicht moeglich: ${err.message}`;
    }

    if (!Array.isArray(results) || results.length === 0) {
      return 'Nichts gefunden — die Wissensbasis enthaelt keine passenden Stellen.';
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

module.exports = RagSucheTool;
