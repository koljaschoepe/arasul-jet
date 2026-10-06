/**
 * Werkzeug-Registry für Flows (Plan 011, Schritt 6).
 *
 * Übersetzt die im Flow deklarierten Werkzeugnamen in ausführbare Instanzen.
 * Sie ist die Stelle, an der die Werkzeug-Freigabe eines Flows technisch
 * durchgesetzt wird: Der Runner bekommt ausschließlich das, was der Flow
 * deklariert hat — nicht alles, was es gibt.
 *
 * Alle im Plan vorgesehenen Werkzeuge sind gebaut. Das `subagent`-Werkzeug
 * braucht zur Laufzeit zusätzlichen Kontext (Rollen, Grenzen, Tiefe); der
 * Runner reicht ihn beim Ausführen über den `context` durch (Schritt 11).
 */

const {
  DateienLesenTool,
  DateienSchreibenTool,
  DateienBearbeitenTool,
  DateienAnhaengenTool,
} = require('./tools/dateien');
const { DateiSuchenTool } = require('./tools/suche');
const { SymbolSuchenTool } = require('./tools/symbolIndex');
const SubagentTool = require('./subagent');
const FreigabeAnfordernTool = require('./tools/freigabe');
const RouteAufrufenTool = require('./tools/route');

/** name → Fabrik. Muss zu VALID_TOOLS in schemas/flows.js passen. */
const FACTORIES = {
  dateien_lesen: () => new DateienLesenTool(),
  dateien_schreiben: () => new DateienSchreibenTool(),
  dateien_bearbeiten: () => new DateienBearbeitenTool(),
  dateien_anhaengen: () => new DateienAnhaengenTool(),
  dateien_suchen: () => new DateiSuchenTool(),
  symbol_suche: () => new SymbolSuchenTool(),
  subagent: () => new SubagentTool(),
  // Phase C7: eine Freigabe ist der Halt selbst, und ein Flow, der sie
  // anfordert, will angehalten werden. Sie hat einen Kreis von Adressaten und
  // eine Frist. (Die Rueckfrage `frage_nutzer` ist am 06.10.2026 gefallen:
  // beantworten liess sie sich nur ueber eine Route, die niemand rief.)
  freigabe_anfordern: () => new FreigabeAnfordernTool(),
  // Kontrakt 13 (M5): nur die Routen, die der Kopf unter `routen` nennt, und
  // nur mit Zugang des Menschen zur Ziel-App (`tools/route.js`).
  route_aufrufen: () => new RouteAufrufenTool(),
};

/**
 * Baut die Werkzeuge für eine Liste deklarierter Namen.
 * @param {string[]} namen
 * @returns {import('../../tools/baseTool')[]}
 */
function buildTools(namen = []) {
  const seen = new Set();
  const tools = [];
  for (const name of namen) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    const factory = FACTORIES[name];
    // Unbekannte Namen werden schon vom Schema abgewiesen; hier still
    // überspringen statt werfen, damit eine künftige Schema-Erweiterung nicht
    // sofort jeden Lauf sprengt.
    if (factory) {
      tools.push(factory());
    }
  }
  return tools;
}

module.exports = { buildTools, FACTORIES };
