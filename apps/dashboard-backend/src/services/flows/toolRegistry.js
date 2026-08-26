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
const FrageNutzerTool = require('./tools/frage');
const BaseTool = require('../../tools/baseTool');

/**
 * Platzhalter für ein Werkzeug, das der Plan vorsieht, das aber noch nicht
 * gebaut ist. Meldet den Grund als Text, damit ein Lauf nicht kommentarlos
 * ins Leere greift.
 */
class NochNichtVerfuegbarTool extends BaseTool {
  constructor(toolName, schritt) {
    super();
    this._name = toolName;
    this._schritt = schritt;
  }
  get name() {
    return this._name;
  }
  get description() {
    return `${this._name} (noch nicht verfügbar)`;
  }
  async execute() {
    return (
      `Das Werkzeug "${this._name}" ist noch nicht verfügbar ` +
      `(kommt mit Plan 011, Schritt ${this._schritt}).`
    );
  }
}

/** name → Fabrik. Muss zu VALID_TOOLS in schemas/flows.js passen. */
const FACTORIES = {
  dateien_lesen: () => new DateienLesenTool(),
  dateien_schreiben: () => new DateienSchreibenTool(),
  dateien_bearbeiten: () => new DateienBearbeitenTool(),
  dateien_anhaengen: () => new DateienAnhaengenTool(),
  dateien_suchen: () => new DateiSuchenTool(),
  symbol_suche: () => new SymbolSuchenTool(),
  subagent: () => new SubagentTool(),
  frage_nutzer: () => new FrageNutzerTool(),
};

/**
 * Baut die Werkzeuge für eine Liste deklarierter Namen.
 * @param {string[]} namen
 * @param {{betriebsart?: 'autonom'|'rueckfragen'}} [opts]
 * @returns {import('../../tools/baseTool')[]}
 */
function buildTools(namen = [], { betriebsart = 'autonom' } = {}) {
  const seen = new Set();
  const tools = [];
  for (const name of namen) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    // Plan 023 I2: in der Betriebsart `autonom` gibt es `frage_nutzer` NICHT.
    // Nicht als gesperrte Variante, die eine Fehlermeldung liefert, sondern
    // gar nicht: ein Modell, das ein Werkzeug sieht, benutzt es irgendwann,
    // und die Zusage "autonom stellt er keine Frage" haelt nur, wenn es die
    // Frage nicht geben kann.
    if (name === 'frage_nutzer' && betriebsart !== 'rueckfragen') {
      continue;
    }
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

/** Welche Werkzeuge sind heute wirklich benutzbar? */
function implementedTools() {
  return Object.keys(FACTORIES).filter(n => !(FACTORIES[n]() instanceof NochNichtVerfuegbarTool));
}

module.exports = { buildTools, implementedTools, FACTORIES, NochNichtVerfuegbarTool };
