/**
 * Flow-Werkzeug `rag_suche` (Plan 011, Schritt 6).
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
 * Grenze nicht — Flows gehören dem einzigen Admin, es gibt keine Mandanten
 * (Plan 011, §8). „Keine Sammlung angegeben" heißt hier deshalb bewusst „durchsuche
 * mein Wissen", nicht „durchsuche fremdes Wissen". Sobald es je mehrere Nutzer
 * gibt, muss diese Voreinstellung umgedreht werden.
 */

const BaseTool = require('../../../tools/baseTool');
const ragCore = require('../../rag/ragCore');
const { ladeDokumentText } = require('../documentText');
const logger = require('../../../utils/logger');

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 15;
const SNIPPET_CHARS = 400;
/** Zeichen-Budget, wenn eine benannte Datei GEZIELT gelesen wird (F-07). */
const DATEI_MAX_ZEICHEN = 12000;

/**
 * Ist die semantische Vektor-Suche (Qdrant + Embeddings) noch aktiv?
 *
 * Plan 021 (agentic RAG): Der Standard ist der agentische Pfad — für eine
 * bestimmte Datei `dateiname` (→ `ladeDokumentText`, Postgres-Textlayer), sonst
 * findet der Agent sich per `dateien_suchen`/`dateien_lesen` selbst durch die
 * Projektdateien. Der Vektor-Zweig bleibt hinter dem Flag `RAG_VEKTOR_SUCHE`
 * erreichbar (rückrollbar), damit Schritt 8 ihn samt Qdrant sauber entfernen
 * kann. Das Flag wird bei jedem Aufruf gelesen (test- und laufzeit-umschaltbar).
 */
function vektorSucheAktiv(env = process.env) {
  const v = String(env.RAG_VEKTOR_SUCHE || '')
    .trim()
    .toLowerCase();
  return v === 'true' || v === '1' || v === 'on' || v === 'yes';
}

class RagSucheTool extends BaseTool {
  get name() {
    return 'rag_suche';
  }

  get description() {
    return (
      'Liest den indexierten Text einer BESTIMMTEN hochgeladenen Datei (Argument ' +
      '"dateiname", auch aus PDF/DOCX). Für allgemeines Suchen im Projekt nutze ' +
      'stattdessen "dateien_suchen". (Die semantische Vektor-Suche ist standardmäßig aus.)'
    );
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
      dateiname: {
        type: 'string',
        description:
          'Optional: Nennt der Nutzer eine BESTIMMTE Datei (z. B. "bericht.pdf"), gib hier ' +
          'genau diesen Dateinamen an, dann bekommst du gezielt den Inhalt DIESER Datei ' +
          'statt projektweiter Treffer. Ohne Angabe wird die ganze Wissensbasis durchsucht.',
        required: false,
      },
    };
  }

  /**
   * @param {{frage?:string, anzahl?:number, dateiname?:string}} params
   * @param {{spaceIds?:string[]|null}} context - Zuschnitt auf Sammlungen
   */
  async execute(params = {}, context = {}) {
    const query = String(params.frage || '').trim();
    if (!query) {
      return 'Fehler: "frage" darf nicht leer sein.';
    }

    const spaceIds =
      Array.isArray(context.spaceIds) && context.spaceIds.length > 0 ? context.spaceIds : null;

    // F-07: Ist eine bestimmte Datei benannt, wird sie GEZIELT gelesen statt
    // projektweit gesucht — so kann kein Inhalt einer anderen Datei fälschlich
    // der genannten zugeschrieben werden. Der indexierte Text (aus
    // document_chunks) ist für Binärdateien wie PDF/DOCX das, was
    // dateien_lesen nicht liefern kann.
    const dateiname = String(params.dateiname || '').trim();
    if (dateiname) {
      const doc = await ladeDokumentText({
        filename: dateiname,
        maxZeichen: DATEI_MAX_ZEICHEN,
        spaceIds,
      });
      if (!doc.gefunden) {
        return (
          `Die Datei "${dateiname}" wurde im Wissensraum nicht gefunden oder ist noch nicht ` +
          'indexiert. Prüfe den genauen Dateinamen (dateien_suchen) oder frage ohne "dateiname", ' +
          'um projektweit zu suchen.'
        );
      }
      const titel = doc.titel ? ` — ${doc.titel}` : '';
      const hinweis = doc.gekuerzt ? '\n\n[…Inhalt gekürzt, nur der Anfang der Datei.]' : '';
      return `Inhalt von [${dateiname}${titel}]:\n${doc.text}${hinweis}`;
    }

    // Standard (Plan 021): kein `dateiname` → agentischer Pfad statt Vektor-Suche.
    // Der Vektor-Zweig bleibt nur hinter dem Flag RAG_VEKTOR_SUCHE erreichbar.
    if (!vektorSucheAktiv()) {
      return (
        'Für eine bestimmte Datei gib "dateiname" an, dann bekommst du gezielt ' +
        'deren Inhalt (auch aus PDF/DOCX über den Textlayer). Zum Durchsuchen der ' +
        'Projektdateien nutze "dateien_suchen" (Namensmuster und/oder Textsuche) ' +
        'und lies Treffer mit "dateien_lesen". Die semantische Vektor-Suche ist ' +
        'deaktiviert (agentic RAG).'
      );
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
      results = await ragCore.hybridSearch(query, embedding, limit, spaceIds);
    } catch (err) {
      logger.warn(`rag_suche fehlgeschlagen: ${err.message}`);
      return `Suche derzeit nicht moeglich: ${err.message}`;
    }

    if (!Array.isArray(results) || results.length === 0) {
      return 'Nichts gefunden, die Wissensbasis enthaelt keine passenden Stellen.';
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
