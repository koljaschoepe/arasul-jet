/**
 * Wie lange eine Anfrage hoechstens offen bleibt, bevor das Backend mit 408
 * antwortet (TIMEOUT-001).
 *
 * Das Netz ist fuer Anfragen, die haengen, nicht fuer Anfragen, die warten.
 * Bis zum 26.09.2026 galten fuer alles ausser `/api/llm/` und `/api/rag/`
 * 60 Sekunden -- auch fuer die aeussere Schnittstelle, deren Wege selbst
 * versprechen, laenger zu warten: `llm/chat` und `document/*` bis 600 s
 * (`timeout_seconds`), `flows/:name/run` bis 1800 s. Die Route wartete also
 * brav auf ihren Auftrag, und nach 60 s schnitt ihr das Netz das Wort ab.
 * Gefunden in der App-Bau-Probe vom 26.09.2026: sechs Belege gleichzeitig
 * ausgelesen, einer bekam nach 60 s ein 408, und das Geraet hatte ihn zehn
 * Sekunden spaeter fertig -- die App las ihn ein zweites Mal.
 *
 * Deshalb gilt fuer die aeusseren Wege das laengste Versprechen, das eine
 * ihrer Routen gibt, plus eine Minute: jede Route antwortet damit selbst,
 * bevor das Netz greift -- mit dem Ergebnis oder mit einem Verweis auf den
 * laufenden Auftrag (202, siehe `routes/external/externalApi.js`).
 */

const REGULAER_MS = 60 * 1000;
// Strom: RAG und LLM der Oberflaeche, Reranking kann 120 s und mehr dauern.
const STROM_MS = 5 * 60 * 1000;
// Das laengste Warten einer aeusseren Route: `flows/:name/run` (1800 s).
const AUSSEN_WARTEN_MS = 30 * 60 * 1000;
const AUSSEN_MS = AUSSEN_WARTEN_MS + 60 * 1000;

/**
 * Die Frist fuer einen Pfad in Millisekunden.
 * @param {string} pfad  `req.path`
 * @returns {number}
 */
function fristFuer(pfad) {
  if (pfad.startsWith('/api/v1/external/') || pfad.startsWith('/v1/')) {
    return AUSSEN_MS;
  }
  if (pfad.startsWith('/api/rag/') || pfad.startsWith('/api/llm/')) {
    return STROM_MS;
  }
  return REGULAER_MS;
}

module.exports = { fristFuer, REGULAER_MS, STROM_MS, AUSSEN_MS, AUSSEN_WARTEN_MS };
